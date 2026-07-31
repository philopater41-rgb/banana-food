import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET() {
  try {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // 1. Calculate Today's Sales
    const todayOrders = await prisma.salesOrder.findMany({
      where: {
        status: 'COMPLETED',
        paymentMethod: { not: 'STAFF' },
        createdAt: {
          gte: startOfToday,
        },
      },
    });

    const todaySales = todayOrders.reduce((sum, order) => sum + order.total, 0);
    const todayStaffOrders = await prisma.salesOrder.findMany({
      where: { status: 'COMPLETED', paymentMethod: 'STAFF', createdAt: { gte: startOfToday } },
    });
    const todayStaffConsumption = todayStaffOrders.reduce((sum, order) => sum + order.total, 0);
    const todayRestock = await prisma.restockLog.aggregate({ where: { createdAt: { gte: startOfToday } }, _sum: { amount: true } });
    const todayExpenses = (todayRestock._sum.amount || 0) + todayStaffConsumption;
    const todayNet = todaySales - todayExpenses;

    // 2. Calculate Monthly Sales
    const monthOrders = await prisma.salesOrder.findMany({
      where: {
        status: 'COMPLETED',
        paymentMethod: { not: 'STAFF' },
        createdAt: {
          gte: startOfMonth,
        },
      },
    });

    const monthlySales = monthOrders.reduce((sum, order) => sum + order.total, 0);
    const monthlyStaffOrders = await prisma.salesOrder.findMany({ where: { status: 'COMPLETED', paymentMethod: 'STAFF', createdAt: { gte: startOfMonth } } });
    const monthlyStaffConsumption = monthlyStaffOrders.reduce((sum, order) => sum + order.total, 0);
    const monthlyRestock = await prisma.restockLog.aggregate({ where: { createdAt: { gte: startOfMonth } }, _sum: { amount: true } });
    const monthlyExpenses = (monthlyRestock._sum.amount || 0) + monthlyStaffConsumption;
    const monthlyNet = monthlySales - monthlyExpenses;

    // 3. Active Shift Info
    const activeShift = await prisma.shift.findFirst({
      where: { closedAt: null },
      include: {
        user: { select: { name: true } },
      },
    });

    // 4. Payment Breakdown (Today)
    let cash = 0;
    let instapay = 0;

    for (const order of todayOrders) {
      if (order.paymentMethod === 'CASH') cash += order.total;
      else if (order.paymentMethod === 'INSTAPAY') instapay += order.total;
    }

    // 5. Top Selling Items (Today)
    // We group sales by Item using raw count.
    const orderItems = await prisma.salesOrderItem.findMany({
      where: {
        order: {
          status: 'COMPLETED',
          paymentMethod: { not: 'STAFF' },
          createdAt: { gte: startOfToday },
        },
      },
      include: {
        item: true,
      },
    });

    const itemSalesMap: { [key: string]: { name: string; qty: number; total: number } } = {};
    for (const oi of orderItems) {
      if (!itemSalesMap[oi.itemId]) {
        itemSalesMap[oi.itemId] = {
          name: oi.item.name,
          qty: 0,
          total: 0,
        };
      }
      itemSalesMap[oi.itemId].qty += oi.qty;
      itemSalesMap[oi.itemId].total += oi.totalPrice;
    }

    const topSellingItems = Object.values(itemSalesMap)
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5);

    const summarizeTopItems = (orderItems: Array<{ itemId: string; qty: number; totalPrice: number; item: { name: string } }>) => {
      const summary: { [key: string]: { name: string; qty: number; total: number } } = {};
      for (const orderItem of orderItems) {
        if (!summary[orderItem.itemId]) summary[orderItem.itemId] = { name: orderItem.item.name, qty: 0, total: 0 };
        summary[orderItem.itemId].qty += orderItem.qty;
        summary[orderItem.itemId].total += orderItem.totalPrice;
      }
      return Object.values(summary).sort((a, b) => b.qty - a.qty).slice(0, 5);
    };
    const [monthOrderItems, allOrderItems] = await Promise.all([
      prisma.salesOrderItem.findMany({
        where: { order: { status: 'COMPLETED', paymentMethod: { not: 'STAFF' }, createdAt: { gte: startOfMonth } } },
        include: { item: true },
      }),
      prisma.salesOrderItem.findMany({
        where: { order: { status: 'COMPLETED', paymentMethod: { not: 'STAFF' } } },
        include: { item: true },
      }),
    ]);

    // 6. Low Stock Alerts
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

    // 7. Recent Sales orders list
    const recentOrders = await prisma.salesOrder.findMany({
      take: 10,
      orderBy: { createdAt: 'desc' },
      include: {
        table: { select: { name: true } },
      },
    });

    // 8. Historical summaries for the owner: every sales day, month, and shift.
    const historicalOrders = await prisma.salesOrder.findMany({
      where: { status: 'COMPLETED', paymentMethod: { not: 'STAFF' } },
      select: { createdAt: true, total: true },
    });
    const cairoDateParts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Africa/Cairo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const periodFor = (date: Date, monthly = false) => {
      const parts = Object.fromEntries(cairoDateParts.formatToParts(date)
        .filter((part) => part.type !== 'literal')
        .map((part) => [part.type, part.value]));
      return monthly ? `${parts.year}-${parts.month}` : `${parts.year}-${parts.month}-${parts.day}`;
    };
    const summarizeOrders = (monthly = false) => {
      const summaries = new Map<string, { period: string; total: number; orders: number }>();
      for (const order of historicalOrders) {
        const period = periodFor(order.createdAt, monthly);
        const current = summaries.get(period) || { period, total: 0, orders: 0 };
        current.total += order.total;
        current.orders += 1;
        summaries.set(period, current);
      }
      return [...summaries.values()].sort((a, b) => b.period.localeCompare(a.period));
    };
    const shifts = await prisma.shift.findMany({
      orderBy: { openedAt: 'desc' },
      include: {
        user: { select: { name: true } },
        orders: { select: { status: true, total: true, paymentMethod: true } },
      },
    });
    const shiftSummaries = shifts.map((shift) => {
      const completedOrders = shift.orders.filter((order) => order.status === 'COMPLETED' && order.paymentMethod !== 'STAFF');
      const staffOrders = shift.orders.filter((order) => order.status === 'COMPLETED' && order.paymentMethod === 'STAFF');
      return {
        id: shift.id,
        openedAt: shift.openedAt,
        closedAt: shift.closedAt,
        cashierName: shift.cashierName || shift.user.name,
        orderCount: completedOrders.length,
        totalSales: completedOrders.reduce((sum, order) => sum + order.total, 0),
        cashSales: completedOrders.filter((order) => order.paymentMethod === 'CASH').reduce((sum, order) => sum + order.total, 0),
        instaPaySales: completedOrders.filter((order) => order.paymentMethod === 'INSTAPAY').reduce((sum, order) => sum + order.total, 0),
        staffConsumption: staffOrders.reduce((sum, order) => sum + order.total, 0),
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
        todayStaffConsumption,
        monthlyStaffConsumption,
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
      topSellingItems,
      topSellingItemsByPeriod: {
        today: topSellingItems,
        month: summarizeTopItems(monthOrderItems),
        all: summarizeTopItems(allOrderItems),
      },
      lowStockAlerts,
      recentOrders,
      dailySales: summarizeOrders(),
      monthlySalesHistory: summarizeOrders(true),
      shiftSummaries,
    });
  } catch (error: any) {
    console.error('GET admin analytics error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
