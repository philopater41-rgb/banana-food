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
        await prisma.$transaction(
          async (tx) => {
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

            // 2b. Sanitize items and modifiers
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
                cashOutAmount: Number(order.cashOutAmount) || 0,
                cashOutFee: Number(order.cashOutFee) || 0,
                status: order.status,
                subtotal: Number(order.subtotal) || 0,
                discount: Number(order.discount) || 0,
                discountReason: order.discountReason || null,
                tax: Number(order.tax) || 0,
                total: Number(order.total) || 0,
                returnStatus: order.returnStatus || 'NONE',
                returnedAmount: Number(order.returnedAmount) || 0,
                returnReason: order.returnReason || null,
                createdAt: new Date(order.createdAt),
                items: {
                  create: sanitizedItems,
                },
              },
            });

            // Only perform inventory deduction if order is COMPLETED
            if (order.status === 'COMPLETED') {
              const validSanitizedItemIds = sanitizedItems.map((i) => i.itemId);

              // Batch query recipes for all items in 1 query
              const allRecipes = await tx.recipe.findMany({
                where: { itemId: { in: validSanitizedItemIds } },
              });

              for (const item of sanitizedItems) {
                // 1. Direct item stock deduction
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

                // 2. Deduct recipe ingredients safely
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

            // Update Table status to VACANT if it was Dine-In and completed
            if (order.orderType === 'DINE_IN' && finalTableId && order.status === 'COMPLETED') {
              try {
                await tx.table.update({
                  where: { id: finalTableId },
                  data: { status: 'VACANT' },
                });
              } catch {}
            }
          },
          {
            maxWait: 15000,
            timeout: 60000, // 60 seconds to prevent timeout across international latency
          }
        );

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
