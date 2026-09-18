import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const startDateStr = searchParams.get('startDate'); // e.g. "2026-06-01"
    const endDateStr = searchParams.get('endDate'); // e.g. "2026-08-31"
    const itemId = searchParams.get('itemId');
    const categoryId = searchParams.get('categoryId');
    const paymentMethod = searchParams.get('paymentMethod');
    const search = searchParams.get('search')?.toLowerCase() || '';

    // Default to last 30 days if not provided
    const now = new Date();
    const defaultStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const startDate = startDateStr ? new Date(startDateStr) : defaultStart;
    const endDate = endDateStr ? new Date(new Date(endDateStr).setHours(23, 59, 59, 999)) : now;

    // 1. Build where clause
    const where: any = {
      createdAt: {
        gte: startDate,
        lte: endDate,
      },
      status: { in: ['COMPLETED', 'REFUNDED'] },
    };

    if (paymentMethod && paymentMethod !== 'ALL') {
      where.paymentMethod = paymentMethod;
    }

    // 2. Fetch orders in range with details
    const orders = await prisma.salesOrder.findMany({
      where,
      include: {
        shift: { select: { cashierName: true, user: { select: { name: true } } } },
        customer: { select: { name: true, type: true, phone: true } },
        items: {
          include: {
            item: {
              include: {
                category: { select: { id: true, name: true } },
                recipe: {
                  include: {
                    rawMaterial: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    // 3. Aggregate metrics by item
    const itemMap = new Map<
      string,
      {
        id: string;
        name: string;
        categoryName: string;
        price: number;
        unitCost: number;
        qtySold: number;
        grossRevenue: number;
        totalCost: number;
        netProfit: number;
        marginPct: number;
      }
    >();

    let totalGrossRevenue = 0;
    let totalDiscountAmount = 0;
    let totalNetRevenue = 0;
    let totalCOGS = 0;
    let totalCompletedOrders = 0;

    const paymentBreakdown: Record<string, number> = {
      CASH: 0,
      VISA: 0,
      INSTAPAY: 0,
      VODAFONE_CASH: 0,
      CASH_OUT: 0,
    };

    const dailyTrendsMap = new Map<string, { date: string; sales: number; profit: number; count: number }>();

    for (const order of orders) {
      if (order.status === 'COMPLETED' || order.status === 'REFUNDED') {
        totalCompletedOrders += 1;
        totalDiscountAmount += order.discount || 0;
        totalNetRevenue += (order.total || 0) - (order.returnedAmount || 0);

        if (order.paymentMethod && paymentBreakdown[order.paymentMethod] !== undefined) {
          paymentBreakdown[order.paymentMethod] += (order.total || 0) - (order.returnedAmount || 0);
        }

        const dateKey = order.createdAt.toISOString().slice(0, 10);
        const dayTrend = dailyTrendsMap.get(dateKey) || { date: dateKey, sales: 0, profit: 0, count: 0 };
        dayTrend.sales += order.total;
        dayTrend.count += 1;

        let orderDayProfit = 0;

        for (const oi of order.items) {
          // Filter by category or item if specified
          if (categoryId && oi.item.categoryId !== categoryId) continue;
          if (itemId && oi.itemId !== itemId) continue;
          if (search && !oi.item.name.toLowerCase().includes(search)) continue;

          // Calculate unit cost from recipe
          let unitCost = 0;
          if (oi.item.recipe) {
            for (const r of oi.item.recipe) {
              const costPerDeduct =
                r.rawMaterial.conversionFactor > 0
                  ? (r.rawMaterial.costPerPurchaseUnit || 0) / r.rawMaterial.conversionFactor
                  : 0;
              unitCost += r.quantity * costPerDeduct;
            }
          }

          const itemTotalRevenue = oi.totalPrice;
          const itemTotalCost = unitCost * oi.qty;
          const itemProfit = itemTotalRevenue - itemTotalCost;

          totalGrossRevenue += itemTotalRevenue;
          totalCOGS += itemTotalCost;
          orderDayProfit += itemProfit;

          const existing = itemMap.get(oi.itemId) || {
            id: oi.itemId,
            name: oi.item.name,
            categoryName: oi.item.category?.name || 'غير مصنف',
            price: oi.unitPrice,
            unitCost: Number(unitCost.toFixed(2)),
            qtySold: 0,
            grossRevenue: 0,
            totalCost: 0,
            netProfit: 0,
            marginPct: 0,
          };

          existing.qtySold += oi.qty;
          existing.grossRevenue += itemTotalRevenue;
          existing.totalCost += itemTotalCost;
          existing.netProfit += itemProfit;
          itemMap.set(oi.itemId, existing);
        }

        dayTrend.profit += orderDayProfit;
        dailyTrendsMap.set(dateKey, dayTrend);
      }
    }

    const itemsSummary = Array.from(itemMap.values()).map((it) => {
      const margin = it.grossRevenue > 0 ? (it.netProfit / it.grossRevenue) * 100 : 0;
      return {
        ...it,
        grossRevenue: Number(it.grossRevenue.toFixed(2)),
        totalCost: Number(it.totalCost.toFixed(2)),
        netProfit: Number(it.netProfit.toFixed(2)),
        marginPct: Number(margin.toFixed(1)),
      };
    }).sort((a, b) => b.grossRevenue - a.grossRevenue);

    const overallNetProfit = totalNetRevenue - totalCOGS;
    const overallMargin = totalNetRevenue > 0 ? (overallNetProfit / totalNetRevenue) * 100 : 0;

    return NextResponse.json({
      summary: {
        totalOrders: totalCompletedOrders,
        totalGrossRevenue: Number(totalGrossRevenue.toFixed(2)),
        totalDiscountAmount: Number(totalDiscountAmount.toFixed(2)),
        totalNetRevenue: Number(totalNetRevenue.toFixed(2)),
        totalCOGS: Number(totalCOGS.toFixed(2)),
        overallNetProfit: Number(overallNetProfit.toFixed(2)),
        overallMarginPct: Number(overallMargin.toFixed(1)),
        avgTicket: totalCompletedOrders > 0 ? Number((totalNetRevenue / totalCompletedOrders).toFixed(2)) : 0,
      },
      paymentBreakdown,
      itemsSummary,
      dailyTrends: Array.from(dailyTrendsMap.values()).sort((a, b) => a.date.localeCompare(b.date)),
    });
  } catch (error: any) {
    console.error('GET detailed report error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
