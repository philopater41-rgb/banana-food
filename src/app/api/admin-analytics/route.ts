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

    // 2. Fetch all completed orders with shift info
    const completedOrders = await prisma.salesOrder.findMany({
      where: { status: 'COMPLETED' },
      orderBy: { createdAt: 'desc' },
      include: {
        shift: { select: { id: true, openedAt: true } },
        items: {
          include: {
            item: { select: { name: true } },
          },
        },
      },
    });

    // Helper: determine the operating business date of an order
    const getOrderOperatingDate = (order: { shift?: { openedAt: Date } | null; createdAt: Date }) => {
      return order.shift?.openedAt || order.createdAt;
    };

    // Filter today's and this month's orders based on shift openedAt (or active shift)
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

    const todaySales = todayOrders.reduce((sum, order) => sum + order.total, 0);
    const monthlySales = monthOrders.reduce((sum, order) => sum + order.total, 0);

    // 3. Payment Breakdown (Today)
    let cash = 0;
    let instapay = 0;
    for (const order of todayOrders) {
      if (order.paymentMethod === 'CASH') cash += order.total;
      else if (order.paymentMethod === 'INSTAPAY') instapay += order.total;
    }

    // 4. Expenses: Restocks & Cash Transactions
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
    const todayNet = todaySales - todayExpenses;
    const monthlyNet = monthlySales - monthlyExpenses;

    // 5. Summarize Daily Sales & Monthly Sales by Shift Operating Date
    const summarizeOrdersByShiftDate = (monthly = false) => {
      const summaries = new Map<string, { period: string; total: number; orders: number }>();
      for (const order of completedOrders) {
        const opDate = getOrderOperatingDate(order);
        const period = getBusinessDateStr(opDate, monthly);
        const current = summaries.get(period) || { period, total: 0, orders: 0 };
        current.total += order.total;
        current.orders += 1;
        summaries.set(period, current);
      }
      return [...summaries.values()].sort((a, b) => b.period.localeCompare(a.period));
    };

    // 6. Top Selling Items
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
      return Object.values(summary).sort((a, b) => b.qty - a.qty).slice(0, 5);
    };

    const topSellingToday = summarizeTopItemsFromOrders(todayOrders);
    const topSellingMonth = summarizeTopItemsFromOrders(monthOrders);
    const topSellingAll = summarizeTopItemsFromOrders(completedOrders);

    // 7. Low Stock Alerts
    const rawMaterials = await prisma.rawMaterial.findMany({
      where: {
        name: {
          notIn: [
            'Almond Milk Pack',
            'Chocolate Syrup',
            'Espresso Coffee Beans',
            'Frozen Croissant (Raw)',
            'Full Cream Milk',
            'White Sugar',
          ],
        },
      },
    });
    const lowStockAlerts = rawMaterials
      .filter((mat) => mat.stockQty < mat.minStockLevel)
      .map((mat) => ({
        id: mat.id,
        name: mat.name,
        stockQty: mat.stockQty,
        minStockLevel: mat.minStockLevel,
        deductUnit: mat.deductUnit,
      }));

    // 8. Recent Sales orders list
    const recentOrders = await prisma.salesOrder.findMany({
      take: 10,
      orderBy: { createdAt: 'desc' },
      include: {
        table: { select: { name: true } },
      },
    });

    // 9. Shift Summaries
    const shifts = await prisma.shift.findMany({
      orderBy: { openedAt: 'desc' },
      include: {
        user: { select: { name: true } },
        orders: { select: { status: true, total: true, paymentMethod: true } },
      },
    });
    const shiftSummaries = shifts.map((shift) => {
      const shiftCompletedOrders = shift.orders.filter((order) => order.status === 'COMPLETED');
      return {
        id: shift.id,
        openedAt: shift.openedAt,
        closedAt: shift.closedAt,
        cashierName: shift.cashierName || shift.user.name,
        orderCount: shiftCompletedOrders.length,
        totalSales: shiftCompletedOrders.reduce((sum, order) => sum + order.total, 0),
        cashSales: shiftCompletedOrders.filter((order) => order.paymentMethod === 'CASH').reduce((sum, order) => sum + order.total, 0),
        instaPaySales: shiftCompletedOrders.filter((order) => order.paymentMethod === 'INSTAPAY').reduce((sum, order) => sum + order.total, 0),
        expectedCash: shift.expectedCash,
        expectedInstaPay: shift.expectedInstaPay,
        closedCash: shift.closedCash,
        closedInstaPay: shift.closedInstaPay,
        varianceCash: shift.varianceCash,
        varianceInstaPay: shift.varianceInstaPay,
      };
    });

    return NextResponse.json({
      kpis: {
        todaySales,
        monthlySales,
        todayExpenses,
        monthlyExpenses,
        todayNet,
        monthlyNet,
        activeShiftUser: activeShift ? (activeShift.cashierName || activeShift.user.name) : 'No Active Shift',
        activeShiftExpected: activeShift ? activeShift.expectedCash : 0,
      },
      paymentBreakdown: {
        cash,
        instapay,
      },
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
