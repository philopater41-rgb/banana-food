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
  modifiers?: SyncOrderItemModifier[];
}

interface SyncOrder {
  id: string;
  receiptNumber?: string;
  shiftId: string;
  tableId?: string | null;
  orderType: string; // "DINE_IN" | "TAKEAWAY"
  paymentMethod: string; // "CASH" | "INSTAPAY" | "VISA"
  status: string; // "COMPLETED" | "CANCELLED"
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  createdAt: string;
  items: SyncOrderItem[];
}

export async function POST(request: Request) {
  try {
    const { orders } = (await request.json()) as { orders: SyncOrder[] };

    if (!orders || !Array.isArray(orders)) {
      return NextResponse.json({ error: 'Invalid orders array' }, { status: 400 });
    }

    const syncedIds: string[] = [];
    const errors: { orderId: string; message: string }[] = [];

    for (const order of orders) {
      try {
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
          // Create the sales order
          await tx.salesOrder.create({
            data: {
              id: order.id,
              receiptNumber: order.receiptNumber,
              shiftId: order.shiftId,
              tableId: order.tableId || null,
              orderType: order.orderType,
              paymentMethod: order.paymentMethod,
              status: order.status,
              subtotal: order.subtotal,
              discount: order.discount,
              tax: order.tax,
              total: order.total,
              createdAt: new Date(order.createdAt),
              items: {
                create: order.items.map((item) => ({
                  id: item.id,
                  itemId: item.itemId,
                  qty: item.qty,
                  unitPrice: item.unitPrice,
                  totalPrice: item.totalPrice,
                  modifiers: {
                    create: (item.modifiers || []).map((mod) => ({
                      modifierId: mod.modifierId,
                      unitPriceImpact: mod.unitPriceImpact,
                    })),
                  },
                })),
              },
            },
          });

          // Only perform inventory deduction if order is COMPLETED
          if (order.status === 'COMPLETED') {
            for (const item of order.items) {
              // Deduct recipe for the item
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

              // Deduct recipes for any modifiers
              if (item.modifiers) {
                for (const mod of item.modifiers) {
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
          if (order.orderType === 'DINE_IN' && order.tableId && order.status === 'COMPLETED') {
            await tx.table.update({
              where: { id: order.tableId },
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
