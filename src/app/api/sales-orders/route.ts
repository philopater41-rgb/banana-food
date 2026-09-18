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

    const createdOrder = await prisma.$transaction(async (tx) => {
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

      const sanitizedItems = [];
      for (const item of order.items || []) {
        let validItemId = item.itemId;
        const itemExists = await tx.item.findUnique({ where: { id: validItemId } });
        if (!itemExists) {
          const fallbackItem = await tx.item.findFirst();
          if (!fallbackItem) continue;
          validItemId = fallbackItem.id;
        }

        const validModifiers = [];
        for (const mod of item.modifiers || []) {
          const modExists = await tx.modifier.findUnique({ where: { id: mod.modifierId } });
          if (modExists) {
            validModifiers.push({
              modifierId: mod.modifierId,
              unitPriceImpact: mod.unitPriceImpact,
            });
          }
        }

        sanitizedItems.push({
          id: item.id,
          itemId: validItemId,
          qty: item.qty,
          unit: (item as any).unit || 'كيلو',
          unitPrice: item.unitPrice,
          totalPrice: item.totalPrice,
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
          subtotal: order.subtotal || 0,
          discount: order.discount || 0,
          discountReason: order.discountReason || null,
          tax: order.tax || 0,
          total: order.total || 0,
          returnStatus: order.returnStatus || 'NONE',
          returnedAmount: order.returnedAmount || 0,
          returnReason: order.returnReason || null,
          createdAt: new Date(order.createdAt || Date.now()),
          items: {
            create: sanitizedItems,
          },
        },
      });

      // Deduct inventory if completed
      if (order.status === 'COMPLETED' || !order.status) {
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

          const recipeIngredients = await tx.recipe.findMany({
            where: { itemId: item.itemId },
          });

          for (const ing of recipeIngredients) {
            const totalDeduct = ing.quantity * item.qty;
            await tx.rawMaterial.update({
              where: { id: ing.rawMaterialId },
              data: {
                stockQty: {
                  decrement: totalDeduct,
                },
              },
            });
          }
        }
      }

      return newSalesOrder;
    });

    return NextResponse.json({ success: true, order: createdOrder });
  } catch (error: any) {
    console.error('POST sales order error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
