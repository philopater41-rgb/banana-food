import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

interface SyncOrderItemModifier {
  modifierId: string;
  unitPriceImpact: number;
}

interface SyncOrderItem {
  id: string;
  itemId: string;
  qty: number;
  unitPrice: number;
  totalPrice: number;
  comment?: string | null;
  modifiers?: SyncOrderItemModifier[];
}

interface SyncOrder {
  id: string;
  receiptNumber?: string;
  shiftId: string;
  tableId?: string | null;
  customerId?: string | null;
  customerName?: string | null;
  orderType: string; // "DINE_IN" | "TAKEAWAY"
  paymentMethod: string; // "CASH" | "VISA" | "INSTAPAY" | "VODAFONE_CASH" | "CASH_OUT"
  cashOutAmount?: number;
  cashOutFee?: number;
  status: string; // "COMPLETED" | "CANCELLED" | "REFUNDED"
  subtotal: number;
  discount: number;
  discountReason?: string | null;
  tax: number;
  total: number;
  returnStatus?: string;
  returnedAmount?: number;
  returnReason?: string | null;
  createdAt: string;
  items: SyncOrderItem[];
}

export async function POST(request: Request) {
  try {
    const { orders } = (await request.json()) as { orders: SyncOrder[] };

    if (!orders || !Array.isArray(orders)) {
      return NextResponse.json({ error: 'Invalid orders array' }, { status: 400 });
    }

    const validPaymentMethods = ['CASH', 'VISA', 'INSTAPAY', 'VODAFONE_CASH', 'CASH_OUT'];

    const syncedIds: string[] = [];
    const errors: { orderId: string; message: string }[] = [];

    for (const order of orders) {
      try {
        const paymentMethod = validPaymentMethods.includes(order.paymentMethod)
          ? order.paymentMethod
          : 'CASH';

        // 1. Check if order already exists in the database
        const existing = await prisma.salesOrder.findUnique({
          where: { id: order.id },
        });

        if (existing) {
          syncedIds.push(order.id);
          continue; // Already synced
        }

        // 2. Wrap order insertion and stock deduction in a Prisma transaction
        await prisma.$transaction(async (tx) => {
          // Resolve any duplicate receipt number collision safely
          let finalReceiptNumber = order.receiptNumber;
          if (finalReceiptNumber) {
            const existingReceipt = await tx.salesOrder.findUnique({
              where: { receiptNumber: finalReceiptNumber },
            });
            if (existingReceipt && existingReceipt.id !== order.id) {
              finalReceiptNumber = `${finalReceiptNumber}-${order.id.slice(0, 4).toUpperCase()}`;
            }
          }

          // 2a. Validate and sanitize foreign keys to prevent P2003 constraints
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

          // 2b. Sanitize items and modifiers
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

          // Create the sales order
          await tx.salesOrder.create({
            data: {
              id: order.id,
              receiptNumber: finalReceiptNumber,
              shiftId: finalShiftId,
              tableId: finalTableId,
              customerId: finalCustomerId,
              customerName: order.customerName || null,
              orderType: order.orderType,
              paymentMethod,
              cashOutAmount: order.cashOutAmount || 0,
              cashOutFee: order.cashOutFee || 0,
              status: order.status,
              subtotal: order.subtotal,
              discount: order.discount,
              discountReason: order.discountReason || null,
              tax: order.tax,
              total: order.total,
              returnStatus: order.returnStatus || 'NONE',
              returnedAmount: order.returnedAmount || 0,
              returnReason: order.returnReason || null,
              createdAt: new Date(order.createdAt),
              items: {
                create: sanitizedItems,
              },
            },
          });

          // Only perform inventory deduction if order is COMPLETED
          if (order.status === 'COMPLETED') {
            for (const item of sanitizedItems) {
              // 1. Direct item stock deduction for Banana Food produce inventory
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

              // 2. Deduct recipe ingredients for the item (if recipe is defined)
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

              // 3. Deduct recipes for any modifiers
              if (item.modifiers) {
                const modifierList = (item.modifiers as any)?.create || [];
                for (const mod of modifierList) {
                  const modIngredients = await tx.recipeModifier.findMany({
                    where: { modifierId: mod.modifierId },
                  });

                  for (const ing of modIngredients) {
                    const totalDeduct = ing.quantity * item.qty; // Deducted per item quantity
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
            }
          }

          // Update Table status to VACANT if it was Dine-In and completed
          if (order.orderType === 'DINE_IN' && finalTableId && order.status === 'COMPLETED') {
            await tx.table.update({
              where: { id: finalTableId },
              data: { status: 'VACANT' },
            });
          }
        });

        syncedIds.push(order.id);
      } catch (err: any) {
        console.error(`Error syncing order ${order.id}:`, err);
        errors.push({ orderId: order.id, message: err.message || 'Sync transaction failed' });
      }
    }

    return NextResponse.json({
      success: true,
      syncedIds,
      errors,
    });
  } catch (error: any) {
    console.error('Batch sync endpoint error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
