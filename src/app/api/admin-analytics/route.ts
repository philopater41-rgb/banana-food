import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET() {
  try {
    const now = new Date();

    const cairoDateParts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Africa/Cairo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });

    const getBusinessDateStr = (date: Date, monthly = false) => {
      const parts = Object.fromEntries(
        cairoDateParts
          .formatToParts(date)
          .filter((part) => part.type !== 'literal')
          .map((part) => [part.type, part.value])
      );
      return monthly ? `${parts.year}-${parts.month}` : `${parts.year}-${parts.month}-${parts.day}`;
    };

    const todayStr = getBusinessDateStr(now, false);
    const thisMonthStr = getBusinessDateStr(now, true);

    // 1. Active Shift Info
    const activeShift = await prisma.shift.findFirst({
      where: { closedAt: null },
      include: {
        user: { select: { name: true } },
      },
    });

    // 2. Fetch all completed orders with shift & items & recipes
    const completedOrders = await prisma.salesOrder.findMany({
      where: { status: { in: ['COMPLETED', 'REFUNDED'] } },
      orderBy: { createdAt: 'desc' },
      include: {
        shift: { select: { id: true, openedAt: true, cashierName: true, user: { select: { name: true } } } },
        customer: { select: { id: true, name: true, type: true } },
        items: {
          include: {
            item: {
              select: {
                id: true,
                name: true,
                price: true,
                cost: true,
                recipe: {
                  include: {
                    rawMaterial: {
                      select: {
                        costPerPurchaseUnit: true,
                        conversionFactor: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    // Helper: determine the operating business date of an order
    const getOrderOperatingDate = (order: { shift?: { openedAt: Date } | null; createdAt: Date }) => {
      return order.shift?.openedAt || order.createdAt;
    };

    // Filter today's and this month's orders
    const todayOrders: typeof completedOrders = [];
    const monthOrders: typeof completedOrders = [];

    for (const order of completedOrders) {
      const opDate = getOrderOperatingDate(order);
      const dayKey = getBusinessDateStr(opDate, false);
      const monthKey = getBusinessDateStr(opDate, true);

      const isTodayOrder = dayKey === todayStr || (activeShift && order.shiftId === activeShift.id);
      const isMonthOrder = monthKey === thisMonthStr || isTodayOrder;

      if (isTodayOrder) todayOrders.push(order);
      if (isMonthOrder) monthOrders.push(order);
    }

    const todaySales = todayOrders.reduce((sum, order) => sum + (order.total - (order.returnedAmount || 0)), 0);
    const monthlySales = monthOrders.reduce((sum, order) => sum + (order.total - (order.returnedAmount || 0)), 0);

    const todayOrdersCount = todayOrders.length;
    const monthlyOrdersCount = monthOrders.length;
    const todayAvgTicket = todayOrdersCount > 0 ? Number((todaySales / todayOrdersCount).toFixed(2)) : 0;
    const monthlyAvgTicket = monthlyOrdersCount > 0 ? Number((monthlySales / monthlyOrdersCount).toFixed(2)) : 0;

    // 3. Multi-Payment Breakdown (Today)
    const paymentBreakdownToday: Record<string, number> = {
      cash: 0,
      visa: 0,
      instapay: 0,
      vodafoneCash: 0,
      cashOut: 0,
    };

    for (const order of todayOrders) {
      const netTotal = order.total - (order.returnedAmount || 0);
      if (order.paymentMethod === 'CASH') paymentBreakdownToday.cash += netTotal;
      else if (order.paymentMethod === 'VISA') paymentBreakdownToday.visa += netTotal;
      else if (order.paymentMethod === 'INSTAPAY') paymentBreakdownToday.instapay += netTotal;
      else if (order.paymentMethod === 'VODAFONE_CASH') paymentBreakdownToday.vodafoneCash += netTotal;
      else if (order.paymentMethod === 'CASH_OUT') paymentBreakdownToday.cashOut += netTotal;
    }

    // 4. Discounts Breakdown (Today & Month)
    const todayDiscounts = todayOrders.reduce((sum, o) => sum + (o.discount || 0), 0);
    const monthlyDiscounts = monthOrders.reduce((sum, o) => sum + (o.discount || 0), 0);

    const discountsByReason: Record<string, { count: number; totalAmount: number }> = {};
    for (const o of monthOrders) {
      if (o.discount && o.discount > 0) {
        const reason = o.discountReason || 'خصم مباشر';
        if (!discountsByReason[reason]) {
          discountsByReason[reason] = { count: 0, totalAmount: 0 };
        }
        discountsByReason[reason].count += 1;
        discountsByReason[reason].totalAmount += o.discount;
      }
    }

    // 5. Returns (Today & Month)
    const [allReturns, allWastage] = await Promise.all([
      prisma.orderReturn.findMany({
        take: 50,
        orderBy: { createdAt: 'desc' },
        include: {
          order: {
            include: {
              shift: { select: { id: true, cashierName: true, openedAt: true, user: { select: { name: true } } } },
              table: { select: { name: true } },
              customer: { select: { name: true, phone: true } },
              items: {
                include: {
                  item: { select: { id: true, name: true, price: true } },
                  modifiers: { include: { modifier: { select: { name: true } } } },
                },
              },
            },
          },
          items: { include: { item: { select: { name: true } } } },
        },
      }),
      prisma.wastageLog.findMany({
        take: 50,
        orderBy: { createdAt: 'desc' },
        include: {
          rawMaterial: { select: { name: true, deductUnit: true } },
        },
      }),
    ]);

    const todayReturnsCount = allReturns.filter((r) => getBusinessDateStr(r.createdAt, false) === todayStr).length;
    const todayReturnsAmount = allReturns
      .filter((r) => getBusinessDateStr(r.createdAt, false) === todayStr)
      .reduce((sum, r) => sum + (r.totalRefund || 0), 0);

    const monthlyReturnsAmount = allReturns
      .filter((r) => getBusinessDateStr(r.createdAt, true) === thisMonthStr)
      .reduce((sum, r) => sum + (r.totalRefund || 0), 0);

    // 6. True Cost (COGS) calculation from recipes
    const calculateOrderCOGS = (order: typeof completedOrders[0]) => {
      let orderCost = 0;
      for (const oi of order.items) {
        let itemUnitCost = 0;
        if (oi.item.recipe && oi.item.recipe.length > 0) {
          for (const r of oi.item.recipe) {
            const costPerDeduct =
              r.rawMaterial.conversionFactor > 0
                ? (r.rawMaterial.costPerPurchaseUnit || 0) / r.rawMaterial.conversionFactor
                : 0;
            itemUnitCost += r.quantity * costPerDeduct;
          }
        } else if (oi.item && typeof (oi.item as any).cost === 'number' && (oi.item as any).cost > 0) {
          itemUnitCost = (oi.item as any).cost;
        }
        orderCost += itemUnitCost * oi.qty;
      }
      return orderCost;
    };

    const todayCOGS = todayOrders.reduce((sum, o) => sum + calculateOrderCOGS(o), 0);
    const monthlyCOGS = monthOrders.reduce((sum, o) => sum + calculateOrderCOGS(o), 0);

    // 7. Expenses: Restocks & Cash Transactions
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [todayRestock, monthlyRestock, allCashTransactions] = await Promise.all([
      prisma.restockLog.aggregate({ where: { createdAt: { gte: startOfToday } }, _sum: { amount: true } }),
      prisma.restockLog.aggregate({ where: { createdAt: { gte: startOfMonth } }, _sum: { amount: true } }),
      prisma.cashTransaction.findMany({
        take: 100,
        orderBy: { createdAt: 'desc' },
        include: {
          shift: {
            select: {
              openedAt: true,
              cashierName: true,
              user: { select: { name: true } },
            },
          },
        },
      }),
    ]);

    let todayCashPayouts = 0;
    let monthlyCashPayouts = 0;

    for (const tx of allCashTransactions) {
      if (tx.type === 'PAYOUT') {
        const txOpDate = tx.shift?.openedAt || tx.createdAt;
        const txDayKey = getBusinessDateStr(txOpDate, false);
        const txMonthKey = getBusinessDateStr(txOpDate, true);

        const isTodayTx = txDayKey === todayStr || (activeShift && tx.shiftId === activeShift.id);
        const isMonthTx = txMonthKey === thisMonthStr || isTodayTx;

        if (isTodayTx) todayCashPayouts += tx.amount;
        if (isMonthTx) monthlyCashPayouts += tx.amount;
      }
    }

    const todayExpenses = (todayRestock._sum.amount || 0) + todayCashPayouts;
    const monthlyExpenses = (monthlyRestock._sum.amount || 0) + monthlyCashPayouts;

    // Real Net Profit = Sales - COGS - other expenses
    const todayNet = todaySales - todayCOGS - todayCashPayouts;
    const monthlyNet = monthlySales - monthlyCOGS - monthlyCashPayouts;

    // 8. Summarize Daily Sales & Monthly Sales by Shift Operating Date
    const summarizeOrdersByShiftDate = (monthly = false) => {
      const summaries = new Map<string, { period: string; total: number; orders: number }>();
      for (const order of completedOrders) {
        const opDate = getOrderOperatingDate(order);
        const period = getBusinessDateStr(opDate, monthly);
        const current = summaries.get(period) || { period, total: 0, orders: 0 };
        current.total += order.total - (order.returnedAmount || 0);
        current.orders += 1;
        summaries.set(period, current);
      }
      return [...summaries.values()].sort((a, b) => b.period.localeCompare(a.period));
    };

    // 9. Top Selling Items
    const summarizeTopItemsFromOrders = (ordersList: typeof completedOrders) => {
      const summary: { [key: string]: { name: string; qty: number; total: number } } = {};
      for (const ord of ordersList) {
        for (const oi of ord.items) {
          if (!summary[oi.itemId]) {
            summary[oi.itemId] = { name: oi.item.name, qty: 0, total: 0 };
          }
          summary[oi.itemId].qty += oi.qty;
          summary[oi.itemId].total += oi.totalPrice;
        }
      }
      return Object.values(summary).sort((a, b) => b.qty - a.qty).slice(0, 7);
    };

    const topSellingToday = summarizeTopItemsFromOrders(todayOrders);
    const topSellingMonth = summarizeTopItemsFromOrders(monthOrders);
    const topSellingAll = summarizeTopItemsFromOrders(completedOrders);

    // 10. Low Stock Alerts (Produce Goods & Items)
    const produceItems = await prisma.item.findMany({
      where: { isActive: true },
      select: { id: true, name: true, stockQty: true, minStockLevel: true, unit: true, cost: true, price: true },
      orderBy: { name: 'asc' },
    });

    const lowStockAlerts = produceItems
      .filter((item) => (item.minStockLevel ?? 0) > 0 && (item.stockQty ?? 0) <= (item.minStockLevel ?? 0))
      .map((item) => ({
        id: item.id,
        name: item.name,
        stockQty: item.stockQty ?? 0,
        minStockLevel: item.minStockLevel ?? 0,
        unit: item.unit || 'كجم',
        cost: item.cost ?? 0,
        price: item.price ?? 0,
      }));

    // 11. Recent Sales orders list
    const recentOrders = await prisma.salesOrder.findMany({
      take: 15,
      orderBy: { createdAt: 'desc' },
      include: {
        table: { select: { name: true } },
        customer: { select: { name: true, type: true } },
      },
    });

    // 12. Shift Summaries
    const shifts = await prisma.shift.findMany({
      orderBy: { openedAt: 'desc' },
      take: 30,
      include: {
        user: { select: { name: true } },
        orders: { select: { status: true, total: true, returnedAmount: true, paymentMethod: true } },
      },
    });
    const shiftSummaries = shifts.map((shift) => {
      const shiftCompletedOrders = shift.orders.filter((order) => order.status === 'COMPLETED' || order.status === 'REFUNDED');
      return {
        id: shift.id,
        openedAt: shift.openedAt,
        closedAt: shift.closedAt,
        cashierName: shift.cashierName || shift.user.name,
        orderCount: shiftCompletedOrders.length,
        totalSales: shiftCompletedOrders.reduce((sum, order) => sum + (order.total - (order.returnedAmount || 0)), 0),
        cashSales: shiftCompletedOrders.filter((order) => order.paymentMethod === 'CASH').reduce((sum, order) => sum + (order.total - (order.returnedAmount || 0)), 0),
        visaSales: shiftCompletedOrders.filter((order) => order.paymentMethod === 'VISA').reduce((sum, order) => sum + (order.total - (order.returnedAmount || 0)), 0),
        instaPaySales: shiftCompletedOrders.filter((order) => order.paymentMethod === 'INSTAPAY').reduce((sum, order) => sum + (order.total - (order.returnedAmount || 0)), 0),
        vodafoneCashSales: shiftCompletedOrders.filter((order) => order.paymentMethod === 'VODAFONE_CASH').reduce((sum, order) => sum + (order.total - (order.returnedAmount || 0)), 0),
        expectedCash: shift.expectedCash,
        expectedInstaPay: shift.expectedInstaPay,
        expectedVisa: shift.expectedVisa,
        closedCash: shift.closedCash,
        closedInstaPay: shift.closedInstaPay,
        closedVisa: shift.closedVisa,
        varianceCash: shift.varianceCash,
        varianceInstaPay: shift.varianceInstaPay,
      };
    });

    return NextResponse.json({
      kpis: {
        todaySales: Number(todaySales.toFixed(2)),
        monthlySales: Number(monthlySales.toFixed(2)),
        todayOrdersCount,
        monthlyOrdersCount,
        todayAvgTicket,
        monthlyAvgTicket,
        todayDiscounts: Number(todayDiscounts.toFixed(2)),
        monthlyDiscounts: Number(monthlyDiscounts.toFixed(2)),
        todayReturnsCount,
        todayReturnsAmount: Number(todayReturnsAmount.toFixed(2)),
        monthlyReturnsAmount: Number(monthlyReturnsAmount.toFixed(2)),
        todayCOGS: Number(todayCOGS.toFixed(2)),
        monthlyCOGS: Number(monthlyCOGS.toFixed(2)),
        todayExpenses: Number(todayExpenses.toFixed(2)),
        monthlyExpenses: Number(monthlyExpenses.toFixed(2)),
        todayNet: Number(todayNet.toFixed(2)),
        monthlyNet: Number(monthlyNet.toFixed(2)),
        activeShiftUser: activeShift ? (activeShift.cashierName || activeShift.user.name) : 'لا توجد وردية مفتوحة',
        activeShiftExpected: activeShift ? activeShift.expectedCash : 0,
      },
      paymentBreakdown: paymentBreakdownToday,
      discountsBreakdown: Object.entries(discountsByReason).map(([reason, stats]) => ({
        reason,
        count: stats.count,
        totalAmount: Number(stats.totalAmount.toFixed(2)),
      })),
      returnsLog: allReturns.map((r) => ({
        ...r,
        refundAmount: r.totalRefund,
        restockItems: r.restocked,
      })),
      wastageLog: allWastage,
      topSellingItems: topSellingToday,
      topSellingItemsByPeriod: {
        today: topSellingToday,
        month: topSellingMonth,
        all: topSellingAll,
      },
      lowStockAlerts,
      recentOrders,
      dailySales: summarizeOrdersByShiftDate(false),
      monthlySalesHistory: summarizeOrdersByShiftDate(true),
      shiftSummaries,
      cashTransactions: allCashTransactions.map((tx) => ({
        id: tx.id,
        shiftId: tx.shiftId,
        type: tx.type,
        amount: tx.amount,
        reason: tx.reason,
        createdAt: tx.createdAt,
        cashierName: tx.shift?.cashierName || tx.shift?.user?.name || 'كاشير',
      })),
    });
  } catch (error: any) {
    console.error('GET admin analytics error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
