import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const startDateStr = searchParams.get('startDate'); // e.g. "2026-09-01"
    const endDateStr = searchParams.get('endDate'); // e.g. "2026-09-26"
    const itemId = searchParams.get('itemId');
    const categoryId = searchParams.get('categoryId');
    const paymentMethod = searchParams.get('paymentMethod');
    const search = searchParams.get('search')?.trim().toLowerCase() || '';

    // Cairo Timezone Formatter
    const cairoDateParts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Africa/Cairo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });

    const getBusinessDateStr = (date: Date) => {
      const parts = Object.fromEntries(
        cairoDateParts
          .formatToParts(date)
          .filter((part) => part.type !== 'literal')
          .map((part) => [part.type, part.value])
      );
      return `${parts.year}-${parts.month}-${parts.day}`;
    };

    const now = new Date();
    const defaultStartStr = getBusinessDateStr(new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000));
    const defaultEndStr = getBusinessDateStr(now);

    const startStr = startDateStr || defaultStartStr;
    const endStr = endDateStr || defaultEndStr;

    // Expand search buffer by 48 hours on each side for timezone safety in Prisma query
    const queryStart = new Date(new Date(startStr).getTime() - 48 * 60 * 60 * 1000);
    const queryEnd = new Date(new Date(endStr).getTime() + 48 * 60 * 60 * 1000);

    // Fetch all related entities in range
    const [orders, returns, expenses, purchases] = await Promise.all([
      prisma.salesOrder.findMany({
        where: {
          createdAt: {
            gte: queryStart,
            lte: queryEnd,
          },
          status: { in: ['COMPLETED', 'REFUNDED'] },
        },
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
      }),

      prisma.orderReturn.findMany({
        where: {
          createdAt: {
            gte: queryStart,
            lte: queryEnd,
          },
        },
        select: {
          id: true,
          totalRefund: true,
          createdAt: true,
        },
      }),

      prisma.cashTransaction.findMany({
        where: {
          createdAt: {
            gte: queryStart,
            lte: queryEnd,
          },
          type: 'PAYOUT',
          NOT: {
            OR: [
              { type: 'REFUND_PAYOUT' },
              { reason: { startsWith: 'مرتجع' } },
            ],
          },
        },
        select: {
          id: true,
          amount: true,
          reason: true,
          createdAt: true,
        },
      }),

      prisma.purchaseInvoice.findMany({
        where: {
          createdAt: {
            gte: queryStart,
            lte: queryEnd,
          },
        },
        select: {
          id: true,
          totalAmount: true,
          paidAmount: true,
          invoiceDate: true,
          createdAt: true,
        },
      }),
    ]);

    // Filter by exact Cairo operating date
    const filteredOrders = orders.filter((order) => {
      const dStr = getBusinessDateStr(order.createdAt);
      if (dStr < startStr || dStr > endStr) return false;
      if (paymentMethod && paymentMethod !== 'ALL' && order.paymentMethod !== paymentMethod) return false;
      return true;
    });

    const filteredExpenses = expenses.filter((exp) => {
      const dStr = getBusinessDateStr(exp.createdAt);
      return dStr >= startStr && dStr <= endStr;
    });

    const filteredPurchases = purchases.filter((pur) => {
      const dStr = getBusinessDateStr(pur.invoiceDate || pur.createdAt);
      return dStr >= startStr && dStr <= endStr;
    });

    const filteredReturns = returns.filter((ret) => {
      const dStr = getBusinessDateStr(ret.createdAt);
      return dStr >= startStr && dStr <= endStr;
    });

    // Aggregate metrics by item
    const itemMap = new Map<
      string,
      {
        id: string;
        name: string;
        categoryName: string;
        unit: string;
        price: number;
        unitCost: number;
        qtySold: number;
        grossRevenue: number;
        totalCost: number;
        netProfit: number;
        marginPct: number;
      }
    >();

    let totalCompletedOrders = 0;
    let totalGrossRevenue = 0;
    let totalDiscountAmount = 0;
    let totalNetRevenue = 0;
    let totalCOGS = 0;

    const paymentBreakdown: Record<string, number> = {
      CASH: 0,
      VISA: 0,
      INSTAPAY: 0,
      VODAFONE_CASH: 0,
      CASH_OUT: 0,
    };

    const dailyTrendsMap = new Map<string, { date: string; sales: number; profit: number; count: number }>();

    for (const order of filteredOrders) {
      if (order.status === 'REFUNDED') continue;
      const orderReturnedAmt = order.returnedAmount || 0;
      if (order.total > 0 && orderReturnedAmt >= order.total) continue;

      const orderNet = Math.max(0, order.total - orderReturnedAmt);
      const returnRatio = order.total > 0 ? orderNet / order.total : 1;
      const discountRatio = order.subtotal > 0 ? Math.max(0, (order.subtotal - (order.discount || 0)) / order.subtotal) : 1;

      // Filter items in order if user searched or filtered by category/item
      let orderMatchingItems = order.items;
      if (categoryId) {
        orderMatchingItems = orderMatchingItems.filter((oi) => oi.item.categoryId === categoryId);
      }
      if (itemId) {
        orderMatchingItems = orderMatchingItems.filter((oi) => oi.itemId === itemId);
      }
      if (search) {
        orderMatchingItems = orderMatchingItems.filter((oi) => oi.item.name.toLowerCase().includes(search));
      }

      if (orderMatchingItems.length === 0) continue;

      totalCompletedOrders += 1;
      totalDiscountAmount += (order.discount || 0);

      const dateKey = getBusinessDateStr(order.createdAt);
      const dayTrend = dailyTrendsMap.get(dateKey) || { date: dateKey, sales: 0, profit: 0, count: 0 };
      dayTrend.count += 1;

      let orderMatchingRevenue = 0;
      let orderMatchingCost = 0;

      for (const oi of orderMatchingItems) {
        // Calculate unit cost from recipe or fallback to direct item cost
        let unitCost = 0;
        if (oi.item?.recipe && oi.item.recipe.length > 0) {
          for (const r of oi.item.recipe) {
            const costPerDeduct =
              r.rawMaterial.conversionFactor > 0
                ? (r.rawMaterial.costPerPurchaseUnit || 0) / r.rawMaterial.conversionFactor
                : 0;
            unitCost += r.quantity * costPerDeduct;
          }
        } else if (oi.item && typeof (oi.item as any).cost === 'number' && (oi.item as any).cost > 0) {
          unitCost = (oi.item as any).cost;
        }

        const netQty = oi.qty * returnRatio;
        const itemNetRevenue = oi.totalPrice * discountRatio * returnRatio;
        const itemTotalCost = unitCost * netQty;
        const itemProfit = itemNetRevenue - itemTotalCost;

        orderMatchingRevenue += itemNetRevenue;
        orderMatchingCost += itemTotalCost;

        const existing = itemMap.get(oi.itemId) || {
          id: oi.itemId,
          name: oi.item.name,
          categoryName: oi.item.category?.name || 'غير مصنف',
          unit: (oi.item as any).unit || 'كجم',
          price: oi.unitPrice,
          unitCost: Number(unitCost.toFixed(2)),
          qtySold: 0,
          grossRevenue: 0,
          totalCost: 0,
          netProfit: 0,
          marginPct: 0,
        };

        existing.qtySold += netQty;
        existing.grossRevenue += itemNetRevenue;
        existing.totalCost += itemTotalCost;
        existing.netProfit += itemProfit;
        itemMap.set(oi.itemId, existing);
      }

      totalGrossRevenue += orderMatchingRevenue;
      totalNetRevenue += orderMatchingRevenue;
      totalCOGS += orderMatchingCost;

      dayTrend.sales += orderMatchingRevenue;
      dayTrend.profit += (orderMatchingRevenue - orderMatchingCost);
      dailyTrendsMap.set(dateKey, dayTrend);

      if (order.paymentMethod && paymentBreakdown[order.paymentMethod] !== undefined) {
        paymentBreakdown[order.paymentMethod] += orderMatchingRevenue;
      }
    }

    const itemsSummary = Array.from(itemMap.values()).map((it) => {
      const margin = it.grossRevenue > 0 ? (it.netProfit / it.grossRevenue) * 100 : 0;
      return {
        ...it,
        qtySold: Number(it.qtySold.toFixed(2)),
        grossRevenue: Number(it.grossRevenue.toFixed(2)),
        totalCost: Number(it.totalCost.toFixed(2)),
        netProfit: Number(it.netProfit.toFixed(2)),
        marginPct: Number(margin.toFixed(1)),
      };
    }).sort((a, b) => b.grossRevenue - a.grossRevenue);

    // Period Totals
    const totalExpenses = filteredExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);
    const totalSuppliesPaid = filteredPurchases.reduce((sum, p) => sum + (p.paidAmount || 0), 0);
    const totalSuppliesAmount = filteredPurchases.reduce((sum, p) => sum + (p.totalAmount || 0), 0);
    const totalReturnsAmount = filteredReturns.reduce((sum, r) => sum + (r.totalRefund || 0), 0);

    const overallGrossProfit = totalNetRevenue - totalCOGS;
    const netProfitAfterExpenses = overallGrossProfit - totalExpenses;
    const netRevenueAfterSupplies = totalNetRevenue - totalSuppliesPaid;
    const overallMargin = totalNetRevenue > 0 ? (overallGrossProfit / totalNetRevenue) * 100 : 0;

    return NextResponse.json({
      period: {
        startDate: startStr,
        endDate: endStr,
      },
      summary: {
        totalOrders: totalCompletedOrders,
        totalGrossRevenue: Number(totalGrossRevenue.toFixed(2)),
        totalDiscountAmount: Number(totalDiscountAmount.toFixed(2)),
        totalNetRevenue: Number(totalNetRevenue.toFixed(2)),
        totalCOGS: Number(totalCOGS.toFixed(2)),
        overallNetProfit: Number(overallGrossProfit.toFixed(2)),
        netProfitAfterExpenses: Number(netProfitAfterExpenses.toFixed(2)),
        totalExpenses: Number(totalExpenses.toFixed(2)),
        totalSuppliesPaid: Number(totalSuppliesPaid.toFixed(2)),
        totalSuppliesAmount: Number(totalSuppliesAmount.toFixed(2)),
        netRevenueAfterSupplies: Number(netRevenueAfterSupplies.toFixed(2)),
        totalReturnsAmount: Number(totalReturnsAmount.toFixed(2)),
        overallMarginPct: Number(overallMargin.toFixed(1)),
        avgTicket: totalCompletedOrders > 0 ? Number((totalNetRevenue / totalCompletedOrders).toFixed(2)) : 0,
      },
      paymentBreakdown,
      itemsSummary,
      dailyTrends: Array.from(dailyTrendsMap.values()).sort((a, b) => a.date.localeCompare(b.date)),
    });
  } catch (error: any) {
    console.error('GET detailed reports error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
