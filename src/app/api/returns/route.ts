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
            type: 'REFUND_PAYOUT',
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

// DELETE: Delete an order return record and revert order status
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    let returnId = searchParams.get('id');
    if (!returnId) {
      try {
        const body = await request.json();
        returnId = body?.id;
      } catch {}
    }

    if (!returnId) {
      return NextResponse.json({ error: 'معرف المرتجع مطلوب' }, { status: 400 });
    }

    const orderReturn = await prisma.orderReturn.findUnique({
      where: { id: returnId },
      include: {
        items: true,
        order: true,
      },
    });

    if (!orderReturn) {
      return NextResponse.json({ error: 'سجل المرتجع غير موجود' }, { status: 404 });
    }

    await prisma.$transaction(async (tx) => {
      // 1. Revert SalesOrder returnedAmount and status
      if (orderReturn.orderId) {
        const order = await tx.salesOrder.findUnique({
          where: { id: orderReturn.orderId },
        });

        if (order) {
          const newReturnedAmount = Math.max(0, (order.returnedAmount || 0) - orderReturn.totalRefund);

          // Check if there are other returns for this order
          const remainingReturns = await tx.orderReturn.findMany({
            where: {
              orderId: orderReturn.orderId,
              id: { not: orderReturn.id },
            },
          });

          let newStatus = order.status;
          let newReturnStatus = order.returnStatus;
          let newReturnReason = order.returnReason;

          if (remainingReturns.length === 0) {
            newReturnStatus = 'NONE';
            newReturnReason = null;
            if (order.status === 'REFUNDED') {
              newStatus = 'COMPLETED';
            }
          } else {
            newReturnStatus = newReturnedAmount >= order.total ? 'FULL' : (newReturnedAmount > 0 ? 'PARTIAL' : 'NONE');
            if (newReturnedAmount < order.total && order.status === 'REFUNDED') {
              newStatus = 'COMPLETED';
            }
          }

          await tx.salesOrder.update({
            where: { id: orderReturn.orderId },
            data: {
              returnedAmount: newReturnedAmount,
              returnStatus: newReturnStatus,
              returnReason: newReturnReason,
              status: newStatus,
            },
          });
        }
      }

      // 2. If items were restocked, reverse the stock adjustment (deduct back)
      if (orderReturn.restocked && orderReturn.items && orderReturn.items.length > 0) {
        for (const retItem of orderReturn.items) {
          if (retItem.itemId && Number(retItem.quantity) > 0) {
            try {
              await tx.item.update({
                where: { id: retItem.itemId },
                data: {
                  stockQty: { decrement: Number(retItem.quantity) },
                },
              });
            } catch (itemErr) {
              console.warn(`Could not decrement Item.stockQty for returned item ${retItem.itemId}:`, itemErr);
            }
          }

          const recipeIngredients = await tx.recipe.findMany({
            where: { itemId: retItem.itemId },
          });

          for (const ing of recipeIngredients) {
            const deductBack = ing.quantity * Number(retItem.quantity || 1);
            await tx.rawMaterial.update({
              where: { id: ing.rawMaterialId },
              data: {
                stockQty: { decrement: deductBack },
              },
            }).catch((ingErr) => console.warn('Failed to revert raw material stock:', ingErr));
          }
        }
      }

      // 3. Delete matching CashTransaction (refund payout) and restore shift expectedCash
      const receiptRef = orderReturn.order?.receiptNumber || orderReturn.orderId;
      const matchingTx = await tx.cashTransaction.findFirst({
        where: {
          shiftId: orderReturn.shiftId,
          amount: orderReturn.totalRefund,
          OR: [
            { type: 'REFUND_PAYOUT' },
            { reason: { contains: receiptRef } },
            { reason: { startsWith: 'مرتجع' } },
          ],
        },
      });

      if (matchingTx) {
        await tx.cashTransaction.delete({
          where: { id: matchingTx.id },
        });

        await tx.shift.update({
          where: { id: orderReturn.shiftId },
          data: {
            expectedCash: { increment: orderReturn.totalRefund },
          },
        }).catch((err) => console.warn('Failed to restore shift expectedCash:', err));
      }

      // 4. Delete the OrderReturn (OrderReturnItem rows are cascade-deleted by foreign key)
      await tx.orderReturn.delete({
        where: { id: returnId },
      });
    });

    return NextResponse.json({
      success: true,
      message: 'تم حذف المرتجع واستعادة حالة الفاتورة بنجاح',
    });
  } catch (error: any) {
    console.error('DELETE return error:', error);
    return NextResponse.json({ error: error.message || 'فشل حذف المرتجع' }, { status: 500 });
  }
}

