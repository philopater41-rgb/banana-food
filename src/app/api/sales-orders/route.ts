import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const dateStr = searchParams.get('date'); // e.g. "2026-08-18"
    const monthStr = searchParams.get('month'); // e.g. "2026-08"
    const shiftId = searchParams.get('shiftId');

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

    let whereClause: any = {
      status: 'COMPLETED',
    };

    if (shiftId) {
      whereClause.shiftId = shiftId;
    }

    const allOrders = await prisma.salesOrder.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      include: {
        shift: { select: { id: true, openedAt: true } },
        table: { select: { name: true } },
        items: {
          include: {
            item: { select: { name: true } },
            modifiers: {
              include: { modifier: { select: { name: true } } },
            },
          },
        },
      },
    });

    // Filter by shift operating date if dateStr or monthStr is provided
    let orders = allOrders;
    if (dateStr) {
      orders = allOrders.filter((order) => {
        const opDate = order.shift?.openedAt || order.createdAt;
        return getBusinessDateStr(opDate, false) === dateStr;
      });
    } else if (monthStr) {
      orders = allOrders.filter((order) => {
        const opDate = order.shift?.openedAt || order.createdAt;
        return getBusinessDateStr(opDate, true) === monthStr;
      });
    }

    return NextResponse.json({ orders });
  } catch (error) {
    console.error('GET sales orders error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const order = body.order || body;

    if (!order || !order.id) {
      return NextResponse.json({ error: 'بيانات الفاتورة غير صحيحة' }, { status: 400 });
    }

    const existing = await prisma.salesOrder.findUnique({
      where: { id: order.id },
    });

    if (existing) {
      return NextResponse.json({ success: true, order: existing, alreadyExists: true });
    }

    const validPaymentMethods = ['CASH', 'VISA', 'INSTAPAY', 'VODAFONE_CASH', 'CASH_OUT'];
    const paymentMethod = validPaymentMethods.includes(order.paymentMethod)
      ? order.paymentMethod
      : 'CASH';

    const createdOrder = await prisma.$transaction(
      async (tx) => {
        let finalReceiptNumber = order.receiptNumber;
        if (finalReceiptNumber) {
          const existingReceipt = await tx.salesOrder.findUnique({
            where: { receiptNumber: finalReceiptNumber },
          });
          if (existingReceipt && existingReceipt.id !== order.id) {
            finalReceiptNumber = `${finalReceiptNumber}-${order.id.slice(0, 4).toUpperCase()}`;
          }
        }

        let finalShiftId = order.shiftId;
        const shiftExists = await tx.shift.findUnique({ where: { id: finalShiftId } });
        if (!shiftExists) {
          const fallbackShift = await tx.shift.findFirst({ orderBy: { openedAt: 'desc' } });
          if (fallbackShift) {
            finalShiftId = fallbackShift.id;
          } else {
            const anyUser = await tx.user.findFirst();
            if (anyUser) {
              const newShift = await tx.shift.create({
                data: {
                  userId: anyUser.id,
                  cashierName: anyUser.name,
                  floatCash: 0,
                  openedAt: new Date(),
                },
              });
              finalShiftId = newShift.id;
            }
          }
        }

        let finalTableId = order.tableId || null;
        if (finalTableId) {
          const tableExists = await tx.table.findUnique({ where: { id: finalTableId } });
          if (!tableExists) finalTableId = null;
        }

        let finalCustomerId = order.customerId || null;
        if (finalCustomerId) {
          const customerExists = await tx.customer.findUnique({ where: { id: finalCustomerId } });
          if (!customerExists) finalCustomerId = null;
        }

        // Batch query all items in one single query to eliminate N+1 latency
        const rawItemIds = (order.items || [])
          .map((i: any) => i.itemId)
          .filter(Boolean);
        const existingDbItems = await tx.item.findMany({
          where: { id: { in: rawItemIds } },
        });
        const itemMap = new Map(existingDbItems.map((it) => [it.id, it]));
        const fallbackDefaultItem = existingDbItems[0] || (await tx.item.findFirst());

        // Batch query all modifiers in one single query
        const rawModIds: string[] = [];
        for (const item of order.items || []) {
          for (const mod of item.modifiers || []) {
            if (mod.modifierId) rawModIds.push(mod.modifierId);
          }
        }
        const existingDbMods = rawModIds.length > 0
          ? await tx.modifier.findMany({ where: { id: { in: rawModIds } } })
          : [];
        const modMap = new Map(existingDbMods.map((m) => [m.id, m]));

        const sanitizedItems = [];
        const usedItemIds = new Set<string>();

        for (const item of order.items || []) {
          let validItemId = item.itemId;
          if (!itemMap.has(validItemId)) {
            if (!fallbackDefaultItem) continue;
            validItemId = fallbackDefaultItem.id;
          }

          const validModifiers = [];
          for (const mod of item.modifiers || []) {
            if (modMap.has(mod.modifierId)) {
              validModifiers.push({
                modifierId: mod.modifierId,
                unitPriceImpact: Number(mod.unitPriceImpact) || 0,
              });
            }
          }

          // Ensure unique and valid ID for each sales order item
          let orderItemId = item.id;
          if (!orderItemId || usedItemIds.has(orderItemId)) {
            orderItemId = crypto.randomUUID();
          }
          usedItemIds.add(orderItemId);

          const validQty = Math.max(0.001, Number(item.qty) || 1);
          const validUnitPrice = Number(item.unitPrice) || 0;
          const validTotalPrice = Number(item.totalPrice) || Math.round(validQty * validUnitPrice * 100) / 100;

          sanitizedItems.push({
            id: orderItemId,
            itemId: validItemId,
            qty: validQty,
            unit: (item as any).unit || 'كيلو',
            unitPrice: validUnitPrice,
            totalPrice: validTotalPrice,
            comment: item.comment?.trim() || null,
            modifiers: {
              create: validModifiers,
            },
          });
        }

        const newSalesOrder = await tx.salesOrder.create({
          data: {
            id: order.id,
            receiptNumber: finalReceiptNumber,
            shiftId: finalShiftId,
            tableId: finalTableId,
            customerId: finalCustomerId,
            customerName: order.customerName || null,
            orderType: order.orderType || 'TAKEAWAY',
            paymentMethod,
            cashOutAmount: order.cashOutAmount || 0,
            cashOutFee: order.cashOutFee || 0,
            status: order.status || 'COMPLETED',
            subtotal: Number(order.subtotal) || 0,
            discount: Number(order.discount) || 0,
            discountReason: order.discountReason || null,
            tax: Number(order.tax) || 0,
            total: Number(order.total) || 0,
            returnStatus: order.returnStatus || 'NONE',
            returnedAmount: Number(order.returnedAmount) || 0,
            returnReason: order.returnReason || null,
            createdAt: new Date(order.createdAt || Date.now()),
            items: {
              create: sanitizedItems,
            },
          },
        });

        // Deduct inventory safely if completed
        if (order.status === 'COMPLETED' || !order.status) {
          const validSanitizedItemIds = sanitizedItems.map((i) => i.itemId);

          // Batch query recipes for all items in 1 query
          const allRecipes = await tx.recipe.findMany({
            where: { itemId: { in: validSanitizedItemIds } },
          });

          for (const item of sanitizedItems) {
            if (item.itemId && item.qty > 0) {
              try {
                await tx.item.update({
                  where: { id: item.itemId },
                  data: {
                    stockQty: {
                      decrement: item.qty,
                    },
                  },
                });
              } catch (stockErr) {
                console.warn(`Could not decrement Item.stockQty for item ${item.itemId}:`, stockErr);
              }
            }

            const itemRecipes = allRecipes.filter((r) => r.itemId === item.itemId);
            for (const ing of itemRecipes) {
              try {
                const totalDeduct = ing.quantity * item.qty;
                await tx.rawMaterial.update({
                  where: { id: ing.rawMaterialId },
                  data: {
                    stockQty: {
                      decrement: totalDeduct,
                    },
                  },
                });
              } catch (rawErr) {
                console.warn(`Could not decrement raw material ${ing.rawMaterialId}:`, rawErr);
              }
            }
          }
        }

        return newSalesOrder;
      },
      {
        maxWait: 15000,
        timeout: 60000, // 60 seconds to prevent timeout across international latency
      }
    );

    return NextResponse.json({ success: true, order: createdOrder });
  } catch (error: any) {
    console.error('POST sales order error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
