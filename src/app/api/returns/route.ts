import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// GET: Fetch all order returns
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const orderId = searchParams.get('orderId');
    const shiftId = searchParams.get('shiftId');

    const where: any = {};
    if (orderId) where.orderId = orderId;
    if (shiftId) where.shiftId = shiftId;

    const returns = await prisma.orderReturn.findMany({
      where,
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
        items: {
          include: {
            item: { select: { id: true, name: true } },
          },
        },
      },
    });

    return NextResponse.json({ returns });
  } catch (error: any) {
    console.error('GET returns error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST: Process an order return / refund
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      orderId,
      receiptNumber,
      shiftId,
      refundAmount,
      paymentMethod = 'CASH',
      reason,
      cashierName,
      restockItems = true,
      items, // Array<{ itemId: string; quantity: number; refundPrice: number }>
    } = body;

    if (!orderId || !refundAmount || Number(refundAmount) <= 0) {
      return NextResponse.json({ error: 'بيانات المرتجع غير مكتملة' }, { status: 400 });
    }

    if (!reason || !reason.trim()) {
      return NextResponse.json({ error: 'سبب الإرجاع مطلوب' }, { status: 400 });
    }

    const order = await prisma.salesOrder.findUnique({
      where: { id: orderId },
      include: { items: true },
    });

    if (!order) {
      return NextResponse.json({ error: 'الطلب غير موجود' }, { status: 404 });
    }

    const totalRefundVal = Number(refundAmount);
    const newReturnedAmount = (order.returnedAmount || 0) + totalRefundVal;
    const isFullReturn = newReturnedAmount >= order.total;

    const result = await prisma.$transaction(async (tx) => {
      // 1. Create the OrderReturn record
      const orderReturn = await tx.orderReturn.create({
        data: {
          orderId,
          shiftId: shiftId || order.shiftId,
          totalRefund: totalRefundVal,
          reason: reason.trim(),
          cashierName: cashierName || null,
          restocked: Boolean(restockItems),
          items: {
            create: (items || []).map((it: any) => ({
              itemId: it.itemId,
              quantity: Number(it.quantity || 1),
              refundPrice: Number(it.refundPrice || 0),
            })),
          },
        },
        include: {
          items: true,
        },
      });

      // 2. Update SalesOrder
      await tx.salesOrder.update({
        where: { id: orderId },
        data: {
          returnStatus: isFullReturn ? 'FULL' : 'PARTIAL',
          returnedAmount: newReturnedAmount,
          returnReason: reason.trim(),
          status: isFullReturn ? 'REFUNDED' : order.status,
        },
      });

      // 3. If restockItems is enabled, return items and raw materials back to inventory
      if (restockItems && items && Array.isArray(items)) {
        for (const retItem of items) {
          // Direct item stock increment for Banana Food produce
          if (retItem.itemId && Number(retItem.quantity) > 0) {
            try {
              await tx.item.update({
                where: { id: retItem.itemId },
                data: {
                  stockQty: {
                    increment: Number(retItem.quantity),
                  },
                },
              });
            } catch (itemErr) {
              console.warn(`Could not increment Item.stockQty for returned item ${retItem.itemId}:`, itemErr);
            }
          }

          const recipeIngredients = await tx.recipe.findMany({
            where: { itemId: retItem.itemId },
          });

          for (const ing of recipeIngredients) {
            const addBack = ing.quantity * Number(retItem.quantity || 1);
            await tx.rawMaterial.update({
              where: { id: ing.rawMaterialId },
              data: {
                stockQty: {
                  increment: addBack,
                },
              },
            });
          }
        }
      }

      // 4. Log cash transaction if refunded in Cash
      if (shiftId) {
        await tx.cashTransaction.create({
          data: {
            shiftId,
            type: 'PAYOUT',
            amount: totalRefundVal,
            reason: `مرتجع فاتورة ${order.receiptNumber || orderId}: ${reason.trim()}`,
          },
        });

        await tx.shift.update({
          where: { id: shiftId },
          data: {
            expectedCash: {
              decrement: totalRefundVal,
            },
          },
        }).catch((err) => console.warn('Failed to update shift expectedCash:', err));
      }

      return orderReturn;
    });

    return NextResponse.json({ success: true, returnRecord: result });
  } catch (error: any) {
    console.error('POST order return error:', error);
    return NextResponse.json({ error: error.message || 'Failed to process return' }, { status: 500 });
  }
}
