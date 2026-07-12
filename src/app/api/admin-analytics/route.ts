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
        createdAt: {
          gte: startOfToday,
        },
      },
    });

    const todaySales = todayOrders.reduce((sum, order) => sum + order.total, 0);

    // 2. Calculate Monthly Sales
    const monthOrders = await prisma.salesOrder.findMany({
      where: {
        status: 'COMPLETED',
        createdAt: {
          gte: startOfMonth,
        },
      },
    });

    const monthlySales = monthOrders.reduce((sum, order) => sum + order.total, 0);

    // 3. Estimated Net Profit (let's assume gross margin is 65% for cafe)
    const estNetProfit = todaySales * 0.65;

    // 4. Active Shift Info
    const activeShift = await prisma.shift.findFirst({
      where: { closedAt: null },
      include: {
        user: { select: { name: true } },
      },
    });

    // 5. Payment Breakdown (Today)
    let cash = 0;
    let instapay = 0;
    let visa = 0;

    for (const order of todayOrders) {
      if (order.paymentMethod === 'CASH') cash += order.total;
      else if (order.paymentMethod === 'INSTAPAY') instapay += order.total;
      else if (order.paymentMethod === 'VISA') visa += order.total;
    }

    // 6. Top Selling Items (Today)
    // We group sales by Item using raw count.
    const orderItems = await prisma.salesOrderItem.findMany({
      where: {
        order: {
          status: 'COMPLETED',
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

    // 7. Low Stock Alerts
    const rawMaterials = await prisma.rawMaterial.findMany({});
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

    return NextResponse.json({
      kpis: {
        todaySales,
        monthlySales,
        estNetProfit,
        activeShiftUser: activeShift ? activeShift.user.name : 'No Active Shift',
        activeShiftExpected: activeShift ? activeShift.expectedCash : 0,
      },
      paymentBreakdown: {
        cash,
        instapay,
        visa,
      },
      topSellingItems,
      lowStockAlerts,
      recentOrders,
    });
  } catch (error: any) {
    console.error('GET admin analytics error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
