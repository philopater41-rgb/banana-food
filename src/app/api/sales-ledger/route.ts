import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const dateQuery = searchParams.get('date'); // e.g. "2026-09-04"
    const monthQuery = searchParams.get('month'); // e.g. "2026-09"

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

    const formatArabicDay = (date: Date) => {
      return new Intl.DateTimeFormat('ar-EG', {
        timeZone: 'Africa/Cairo',
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }).format(date);
    };

    const formatArabicMonth = (date: Date) => {
      return new Intl.DateTimeFormat('ar-EG', {
        timeZone: 'Africa/Cairo',
        year: 'numeric',
        month: 'long',
      }).format(date);
    };

    // Helper: calculate recipe cost (COGS) for an order
    const calculateOrderCOGS = (order: {
      status?: string;
      total?: number;
      returnedAmount?: number;
      items: Array<{
        qty: number;
        item?: {
          cost?: number;
          recipe?: Array<{
            quantity: number;
            rawMaterial: {
              costPerPurchaseUnit: number;
              conversionFactor: number;
            };
          }>;
        } | null;
      }>;
    }) => {
      if (order.status === 'REFUNDED') return 0;
      if (order.returnedAmount && order.total && order.returnedAmount >= order.total) return 0;

      let orderCost = 0;
      for (const oi of order.items) {
        let itemUnitCost = 0;
        if (oi.item?.recipe && oi.item.recipe.length > 0) {
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

      if (order.returnedAmount && order.returnedAmount > 0 && order.total && order.total > 0) {
        const netRatio = Math.max(0, (order.total - order.returnedAmount) / order.total);
        orderCost = orderCost * netRatio;
      }

      return orderCost;
    };

    // If specific date or month is requested, return detailed orders list for that period
    if (dateQuery || monthQuery) {
      const [allOrders, allReturns, allExpenses] = await Promise.all([
        prisma.salesOrder.findMany({
          where: {
            status: { in: ['COMPLETED', 'REFUNDED'] },
          },
          orderBy: { createdAt: 'desc' },
          include: {
            shift: {
              select: {
                id: true,
                cashierName: true,
                openedAt: true,
                user: { select: { name: true, username: true } },
              },
            },
            table: { select: { id: true, name: true } },
            customer: { select: { id: true, name: true, phone: true, type: true } },
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
                modifiers: {
                  include: { modifier: { select: { id: true, name: true, priceImpact: true } } },
                },
              },
            },
          },
        }),
        prisma.orderReturn.findMany({
          select: {
            id: true,
            totalRefund: true,
            createdAt: true,
          },
        }),
        prisma.cashTransaction.findMany({
          where: {
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
      ]);

      const filteredOrders = allOrders.filter((order) => {
        const orderDate = order.createdAt;
        if (dateQuery) {
          return getBusinessDateStr(orderDate, false) === dateQuery;
        }
        if (monthQuery) {
          return getBusinessDateStr(orderDate, true) === monthQuery;
        }
        return true;
      });

      const filteredReturns = allReturns.filter((ret) => {
        const retDate = ret.createdAt;
        if (dateQuery) {
          return getBusinessDateStr(retDate, false) === dateQuery;
        }
        if (monthQuery) {
          return getBusinessDateStr(retDate, true) === monthQuery;
        }
        return true;
      });

      const filteredExpenses = allExpenses.filter((exp) => {
        const expDate = exp.createdAt;
        if (dateQuery) {
          return getBusinessDateStr(expDate, false) === dateQuery;
        }
        if (monthQuery) {
          return getBusinessDateStr(expDate, true) === monthQuery;
        }
        return true;
      });

      let totalSales = 0;
      let totalDiscounts = 0;
      let totalNet = 0;
      let totalCOGS = 0;
      const paymentBreakdown: Record<string, number> = {
        CASH: 0,
        VISA: 0,
        INSTAPAY: 0,
        VODAFONE_CASH: 0,
        CASH_OUT: 0,
      };

      filteredOrders.forEach((o) => {
        const net = (o.total || 0) - (o.returnedAmount || 0);
        totalSales += o.subtotal || o.total;
        totalDiscounts += o.discount || 0;
        totalNet += net;
        totalCOGS += calculateOrderCOGS(o);
        if (o.paymentMethod && paymentBreakdown[o.paymentMethod] !== undefined) {
          paymentBreakdown[o.paymentMethod] += net;
        }
      });

      const returnsAmount = filteredReturns.reduce((sum, r) => sum + (r.totalRefund || 0), 0);
      const returnsCount = filteredReturns.length;
      const totalExpenses = filteredExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);
      const netProfit = totalNet - totalCOGS - totalExpenses;

      return NextResponse.json({
        period: dateQuery ? { type: 'day', value: dateQuery } : { type: 'month', value: monthQuery },
        summary: {
          ordersCount: filteredOrders.length,
          totalSales: Number(totalSales.toFixed(2)),
          totalDiscounts: Number(totalDiscounts.toFixed(2)),
          totalExpenses: Number(totalExpenses.toFixed(2)),
          totalNet: Number(totalNet.toFixed(2)),
          returnsAmount: Number(returnsAmount.toFixed(2)),
          returnsCount,
          cogs: Number(totalCOGS.toFixed(2)),
          netProfit: Number(netProfit.toFixed(2)),
          avgTicket: filteredOrders.length > 0 ? Number((totalNet / filteredOrders.length).toFixed(2)) : 0,
          paymentBreakdown,
        },
        orders: filteredOrders,
        expenses: filteredExpenses,
      });
    }

    // Default: Aggregate all orders into Days & Months summaries with Profit & Returns
    const [orders, allReturns, allExpenses] = await Promise.all([
      prisma.salesOrder.findMany({
        where: {
          status: { in: ['COMPLETED', 'REFUNDED'] },
        },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          receiptNumber: true,
          subtotal: true,
          discount: true,
          total: true,
          status: true,
          returnedAmount: true,
          paymentMethod: true,
          createdAt: true,
          items: {
            select: {
              qty: true,
              totalPrice: true,
              item: {
                select: {
                  cost: true,
                  recipe: {
                    select: {
                      quantity: true,
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
      }),
      prisma.orderReturn.findMany({
        select: {
          id: true,
          totalRefund: true,
          createdAt: true,
        },
      }),
      prisma.cashTransaction.findMany({
        where: {
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
    ]);

    const daysMap = new Map<
      string,
      {
        date: string; // YYYY-MM-DD
        dayNameAr: string;
        rawDate: Date;
        ordersCount: number;
        totalSales: number;
        totalDiscounts: number;
        totalExpenses: number;
        totalNet: number;
        returnsAmount: number;
        returnsCount: number;
        cogs: number;
        netProfit: number;
        payments: Record<string, number>;
      }
    >();

    const monthsMap = new Map<
      string,
      {
        month: string; // YYYY-MM
        monthNameAr: string;
        rawDate: Date;
        daysSet: Set<string>;
        ordersCount: number;
        totalSales: number;
        totalDiscounts: number;
        totalExpenses: number;
        totalNet: number;
        returnsAmount: number;
        returnsCount: number;
        cogs: number;
        netProfit: number;
        payments: Record<string, number>;
      }
    >();

    let grandTotalSales = 0;
    let grandTotalDiscounts = 0;
    let grandTotalNet = 0;
    let grandTotalCOGS = 0;
    const grandPayments: Record<string, number> = {
      CASH: 0,
      VISA: 0,
      INSTAPAY: 0,
      VODAFONE_CASH: 0,
      CASH_OUT: 0,
    };

    // 1. Process Orders
    for (const order of orders) {
      const orderDate = order.createdAt;
      const dayKey = getBusinessDateStr(orderDate, false);
      const monthKey = getBusinessDateStr(orderDate, true);

      const net = (order.total || 0) - (order.returnedAmount || 0);
      const gross = order.subtotal || order.total;
      const disc = order.discount || 0;
      const orderCogs = calculateOrderCOGS(order);

      grandTotalSales += gross;
      grandTotalDiscounts += disc;
      grandTotalNet += net;
      grandTotalCOGS += orderCogs;

      if (order.paymentMethod && grandPayments[order.paymentMethod] !== undefined) {
        grandPayments[order.paymentMethod] += net;
      }

      // Group by Day
      if (!daysMap.has(dayKey)) {
        daysMap.set(dayKey, {
          date: dayKey,
          dayNameAr: formatArabicDay(orderDate),
          rawDate: orderDate,
          ordersCount: 0,
          totalSales: 0,
          totalDiscounts: 0,
          totalExpenses: 0,
          totalNet: 0,
          returnsAmount: 0,
          returnsCount: 0,
          cogs: 0,
          netProfit: 0,
          payments: { CASH: 0, VISA: 0, INSTAPAY: 0, VODAFONE_CASH: 0, CASH_OUT: 0 },
        });
      }
      const dayObj = daysMap.get(dayKey)!;
      dayObj.ordersCount += 1;
      dayObj.totalSales += gross;
      dayObj.totalDiscounts += disc;
      dayObj.totalNet += net;
      dayObj.cogs += orderCogs;
      dayObj.netProfit += net - orderCogs;
      if (order.paymentMethod && dayObj.payments[order.paymentMethod] !== undefined) {
        dayObj.payments[order.paymentMethod] += net;
      }

      // Group by Month
      if (!monthsMap.has(monthKey)) {
        monthsMap.set(monthKey, {
          month: monthKey,
          monthNameAr: formatArabicMonth(orderDate),
          rawDate: orderDate,
          daysSet: new Set<string>(),
          ordersCount: 0,
          totalSales: 0,
          totalDiscounts: 0,
          totalExpenses: 0,
          totalNet: 0,
          returnsAmount: 0,
          returnsCount: 0,
          cogs: 0,
          netProfit: 0,
          payments: { CASH: 0, VISA: 0, INSTAPAY: 0, VODAFONE_CASH: 0, CASH_OUT: 0 },
        });
      }
      const monthObj = monthsMap.get(monthKey)!;
      monthObj.daysSet.add(dayKey);
      monthObj.ordersCount += 1;
      monthObj.totalSales += gross;
      monthObj.totalDiscounts += disc;
      monthObj.totalNet += net;
      monthObj.cogs += orderCogs;
      monthObj.netProfit += net - orderCogs;
      if (order.paymentMethod && monthObj.payments[order.paymentMethod] !== undefined) {
        monthObj.payments[order.paymentMethod] += net;
      }
    }

    // 2. Process Returns
    let grandReturnsAmount = 0;
    for (const ret of allReturns) {
      const retDate = ret.createdAt;
      const dayKey = getBusinessDateStr(retDate, false);
      const monthKey = getBusinessDateStr(retDate, true);
      const refVal = ret.totalRefund || 0;
      grandReturnsAmount += refVal;

      if (daysMap.has(dayKey)) {
        const dayObj = daysMap.get(dayKey)!;
        dayObj.returnsAmount += refVal;
        dayObj.returnsCount += 1;
      }

      if (monthsMap.has(monthKey)) {
        const monthObj = monthsMap.get(monthKey)!;
        monthObj.returnsAmount += refVal;
        monthObj.returnsCount += 1;
      }
    }

    // 3. Process Expenses (Payouts)
    let grandTotalExpenses = 0;
    for (const exp of allExpenses) {
      const expDate = exp.createdAt;
      const dayKey = getBusinessDateStr(expDate, false);
      const monthKey = getBusinessDateStr(expDate, true);
      const expAmount = exp.amount || 0;
      grandTotalExpenses += expAmount;

      if (!daysMap.has(dayKey)) {
        daysMap.set(dayKey, {
          date: dayKey,
          dayNameAr: formatArabicDay(expDate),
          rawDate: expDate,
          ordersCount: 0,
          totalSales: 0,
          totalDiscounts: 0,
          totalExpenses: 0,
          totalNet: 0,
          returnsAmount: 0,
          returnsCount: 0,
          cogs: 0,
          netProfit: 0,
          payments: { CASH: 0, VISA: 0, INSTAPAY: 0, VODAFONE_CASH: 0, CASH_OUT: 0 },
        });
      }
      const dayObj = daysMap.get(dayKey)!;
      dayObj.totalExpenses += expAmount;

      if (!monthsMap.has(monthKey)) {
        monthsMap.set(monthKey, {
          month: monthKey,
          monthNameAr: formatArabicMonth(expDate),
          rawDate: expDate,
          daysSet: new Set<string>(),
          ordersCount: 0,
          totalSales: 0,
          totalDiscounts: 0,
          totalExpenses: 0,
          totalNet: 0,
          returnsAmount: 0,
          returnsCount: 0,
          cogs: 0,
          netProfit: 0,
          payments: { CASH: 0, VISA: 0, INSTAPAY: 0, VODAFONE_CASH: 0, CASH_OUT: 0 },
        });
      }
      const monthObj = monthsMap.get(monthKey)!;
      monthObj.daysSet.add(dayKey);
      monthObj.totalExpenses += expAmount;
    }

    const days = Array.from(daysMap.values())
      .map((d) => ({
        ...d,
        totalSales: Number(d.totalSales.toFixed(2)),
        totalDiscounts: Number(d.totalDiscounts.toFixed(2)),
        totalExpenses: Number(d.totalExpenses.toFixed(2)),
        totalNet: Number(d.totalNet.toFixed(2)),
        returnsAmount: Number(d.returnsAmount.toFixed(2)),
        cogs: Number(d.cogs.toFixed(2)),
        netProfit: Number((d.netProfit - d.totalExpenses).toFixed(2)),
        avgTicket: d.ordersCount > 0 ? Number((d.totalNet / d.ordersCount).toFixed(2)) : 0,
      }))
      .sort((a, b) => b.date.localeCompare(a.date));

    const months = Array.from(monthsMap.values())
      .map((m) => ({
        month: m.month,
        monthNameAr: m.monthNameAr,
        activeDaysCount: m.daysSet.size,
        ordersCount: m.ordersCount,
        totalSales: Number(m.totalSales.toFixed(2)),
        totalDiscounts: Number(m.totalDiscounts.toFixed(2)),
        totalExpenses: Number(m.totalExpenses.toFixed(2)),
        totalNet: Number(m.totalNet.toFixed(2)),
        returnsAmount: Number(m.returnsAmount.toFixed(2)),
        returnsCount: m.returnsCount,
        cogs: Number(m.cogs.toFixed(2)),
        netProfit: Number((m.netProfit - m.totalExpenses).toFixed(2)),
        avgTicket: m.ordersCount > 0 ? Number((m.totalNet / m.ordersCount).toFixed(2)) : 0,
        payments: m.payments,
      }))
      .sort((a, b) => b.month.localeCompare(a.month));

    // Default summaries for today and this month
    const defaultSummary = {
      ordersCount: 0,
      totalSales: 0,
      totalDiscounts: 0,
      totalExpenses: 0,
      totalNet: 0,
      returnsAmount: 0,
      returnsCount: 0,
      cogs: 0,
      netProfit: 0,
      avgTicket: 0,
      payments: { CASH: 0, VISA: 0, INSTAPAY: 0, VODAFONE_CASH: 0, CASH_OUT: 0 },
    };

    const todaySummary = daysMap.get(todayStr)
      ? {
          ...daysMap.get(todayStr)!,
          date: todayStr,
          totalSales: Number(daysMap.get(todayStr)!.totalSales.toFixed(2)),
          totalDiscounts: Number(daysMap.get(todayStr)!.totalDiscounts.toFixed(2)),
          totalExpenses: Number(daysMap.get(todayStr)!.totalExpenses.toFixed(2)),
          totalNet: Number(daysMap.get(todayStr)!.totalNet.toFixed(2)),
          returnsAmount: Number(daysMap.get(todayStr)!.returnsAmount.toFixed(2)),
          cogs: Number(daysMap.get(todayStr)!.cogs.toFixed(2)),
          netProfit: Number((daysMap.get(todayStr)!.netProfit - daysMap.get(todayStr)!.totalExpenses).toFixed(2)),
          avgTicket:
            daysMap.get(todayStr)!.ordersCount > 0
              ? Number((daysMap.get(todayStr)!.totalNet / daysMap.get(todayStr)!.ordersCount).toFixed(2))
              : 0,
        }
      : {
          ...defaultSummary,
          date: todayStr,
          dayNameAr: formatArabicDay(now),
        };

    const monthSummary = monthsMap.get(thisMonthStr)
      ? {
          ...monthsMap.get(thisMonthStr)!,
          month: thisMonthStr,
          activeDaysCount: monthsMap.get(thisMonthStr)!.daysSet.size,
          totalSales: Number(monthsMap.get(thisMonthStr)!.totalSales.toFixed(2)),
          totalDiscounts: Number(monthsMap.get(thisMonthStr)!.totalDiscounts.toFixed(2)),
          totalExpenses: Number(monthsMap.get(thisMonthStr)!.totalExpenses.toFixed(2)),
          totalNet: Number(monthsMap.get(thisMonthStr)!.totalNet.toFixed(2)),
          returnsAmount: Number(monthsMap.get(thisMonthStr)!.returnsAmount.toFixed(2)),
          cogs: Number(monthsMap.get(thisMonthStr)!.cogs.toFixed(2)),
          netProfit: Number((monthsMap.get(thisMonthStr)!.netProfit - monthsMap.get(thisMonthStr)!.totalExpenses).toFixed(2)),
          avgTicket:
            monthsMap.get(thisMonthStr)!.ordersCount > 0
              ? Number((monthsMap.get(thisMonthStr)!.totalNet / monthsMap.get(thisMonthStr)!.ordersCount).toFixed(2))
              : 0,
        }
      : {
          ...defaultSummary,
          month: thisMonthStr,
          monthNameAr: formatArabicMonth(now),
          activeDaysCount: 0,
        };

    const grandNetProfit = grandTotalNet - grandTotalCOGS - grandTotalExpenses;

    return NextResponse.json({
      grandTotals: {
        ordersCount: orders.length,
        totalSales: Number(grandTotalSales.toFixed(2)),
        totalDiscounts: Number(grandTotalDiscounts.toFixed(2)),
        totalExpenses: Number(grandTotalExpenses.toFixed(2)),
        totalNet: Number(grandTotalNet.toFixed(2)),
        returnsAmount: Number(grandReturnsAmount.toFixed(2)),
        returnsCount: allReturns.length,
        cogs: Number(grandTotalCOGS.toFixed(2)),
        netProfit: Number(grandNetProfit.toFixed(2)),
        avgTicket: orders.length > 0 ? Number((grandTotalNet / orders.length).toFixed(2)) : 0,
        payments: grandPayments,
        daysCount: days.length,
        monthsCount: months.length,
      },
      todaySummary,
      monthSummary,
      days,
      months,
    });
  } catch (error) {
    console.error('GET sales ledger error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
