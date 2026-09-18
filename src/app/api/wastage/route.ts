import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// GET: Fetch all wastage logs
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const rawMaterialId = searchParams.get('rawMaterialId');

    const where: any = {};
    if (rawMaterialId) where.rawMaterialId = rawMaterialId;

    const wastageLogs = await prisma.wastageLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        rawMaterial: {
          select: {
            id: true,
            name: true,
            deductUnit: true,
            purchaseUnit: true,
            costPerPurchaseUnit: true,
            conversionFactor: true,
          },
        },
      },
    });

    const totalWastageCost = wastageLogs.reduce((sum, w) => sum + (w.costAmount || 0), 0);

    return NextResponse.json({
      wastageLogs,
      totalWastageCost,
    });
  } catch (error: any) {
    console.error('GET wastage error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST: Add new wastage record
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { rawMaterialId, itemId, itemName, quantity, reason, loggedBy } = body;

    const deductQty = Number(quantity);
    if (!deductQty || deductQty <= 0) {
      return NextResponse.json({ error: 'يرجى تحديد كمية الهالك بالكيلو' }, { status: 400 });
    }

    if (!reason || !reason.trim()) {
      return NextResponse.json({ error: 'سبب الهالك مطلوب' }, { status: 400 });
    }

    let targetRawMaterialId = rawMaterialId;
    let unitCost = Number(body.unitCost) || 0;

    if (targetRawMaterialId) {
      const rm = await prisma.rawMaterial.findUnique({ where: { id: targetRawMaterialId } });
      if (rm) {
        if (!unitCost) {
          unitCost = rm.conversionFactor > 0 ? (rm.costPerPurchaseUnit || 0) / rm.conversionFactor : (rm.costPerPurchaseUnit || 0);
        }
      } else {
        targetRawMaterialId = undefined;
      }
    }

    if (!targetRawMaterialId) {
      const resolvedName = (itemName || '').trim();
      if (!resolvedName) {
        return NextResponse.json({ error: 'يرجى اختيار صنف الخضار أو الفاكهة' }, { status: 400 });
      }

      let rm = await prisma.rawMaterial.findUnique({ where: { name: resolvedName } });
      if (!rm) {
        rm = await prisma.rawMaterial.create({
          data: {
            name: resolvedName,
            purchaseUnit: 'kg',
            deductUnit: 'kg',
            conversionFactor: 1,
            costPerPurchaseUnit: unitCost,
            stockQty: 0,
          },
        });
      }
      targetRawMaterialId = rm.id;
      if (!unitCost) unitCost = rm.costPerPurchaseUnit || 0;
    }

    const costAmount = deductQty * unitCost;

    const log = await prisma.$transaction(async (tx) => {
      // 1. Decrement RawMaterial Stock
      await tx.rawMaterial.update({
        where: { id: targetRawMaterialId },
        data: {
          stockQty: {
            decrement: deductQty,
          },
        },
      });

      // 2. Decrement Item Stock if matched
      try {
        let matchedItem = null;
        if (itemId) {
          matchedItem = await tx.item.findUnique({ where: { id: itemId } });
        }
        if (!matchedItem && itemName) {
          matchedItem = await tx.item.findFirst({ where: { name: itemName.trim() } });
        }
        if (matchedItem) {
          await tx.item.update({
            where: { id: matchedItem.id },
            data: {
              stockQty: {
                decrement: deductQty,
              },
            },
          });
        }
      } catch (itemErr) {
        console.warn('Could not decrement Item.stockQty on wastage:', itemErr);
      }

      // 2. Create WastageLog
      return await tx.wastageLog.create({
        data: {
          rawMaterialId: targetRawMaterialId!,
          quantity: deductQty,
          costAmount,
          reason: reason.trim(),
          loggedBy: loggedBy || 'Admin',
        },
        include: {
          rawMaterial: true,
        },
      });
    });

    return NextResponse.json({ success: true, wastageLog: log });
  } catch (error: any) {
    console.error('POST wastage error:', error);
    return NextResponse.json({ error: error.message || 'Failed to record wastage' }, { status: 500 });
  }
}
