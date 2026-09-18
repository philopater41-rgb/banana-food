import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET() {
  try {
    const rawMaterials = await prisma.rawMaterial.findMany({
      orderBy: { name: 'asc' },
    });

    const materialsWithStatus = rawMaterials.map((mat) => ({
      ...mat,
      isLowStock: mat.stockQty < mat.minStockLevel,
    }));

    return NextResponse.json({ rawMaterials: materialsWithStatus });
  } catch (error: any) {
    console.error('GET raw materials error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { name, stockQty, minStockLevel, purchaseUnit, deductUnit, conversionFactor, costPerPurchaseUnit } = await request.json();

    if (!name || !name.trim()) {
      return NextResponse.json(
        { error: 'اسم الخامة مطلوب' },
        { status: 400 }
      );
    }

    const trimmedName = name.trim();
    const pUnit = purchaseUnit?.trim() || 'kg';
    const dUnit = deductUnit?.trim() || (pUnit === 'kg' ? 'g' : pUnit === 'liter' ? 'ml' : 'unit');
    const factor = parseFloat(conversionFactor) || (pUnit === 'kg' || pUnit === 'liter' ? 1000 : 1.0);

    const exists = await prisma.rawMaterial.findUnique({
      where: { name: trimmedName },
    });

    if (exists) {
      return NextResponse.json({ error: 'يوجد خامة مسجلة بنفس هذا الاسم مسبقاً' }, { status: 400 });
    }

    const material = await prisma.rawMaterial.create({
      data: {
        name: trimmedName,
        stockQty: parseFloat(stockQty) || 0.0,
        minStockLevel: parseFloat(minStockLevel) || 0.0,
        purchaseUnit: pUnit,
        deductUnit: dUnit,
        conversionFactor: factor,
        costPerPurchaseUnit: parseFloat(costPerPurchaseUnit) || 0.0,
      },
    });

    return NextResponse.json({ rawMaterial: material });
  } catch (error: any) {
    console.error('Create raw material error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const { rawMaterialId, id, name, stockQty, minStockLevel, purchaseUnit, deductUnit, conversionFactor, costPerPurchaseUnit } = await request.json();
    const targetId = rawMaterialId || id;
    if (!targetId) {
      return NextResponse.json({ error: 'الخامة مطلوبة.' }, { status: 400 });
    }
    const data: Record<string, string | number> = {};
    if (name !== undefined) data.name = String(name).trim();
    if (stockQty !== undefined) data.stockQty = Number(stockQty);
    if (minStockLevel !== undefined) data.minStockLevel = Number(minStockLevel);
    if (purchaseUnit !== undefined) data.purchaseUnit = String(purchaseUnit).trim();
    if (deductUnit !== undefined) data.deductUnit = String(deductUnit).trim();
    if (conversionFactor !== undefined) data.conversionFactor = Number(conversionFactor);
    if (costPerPurchaseUnit !== undefined) data.costPerPurchaseUnit = Number(costPerPurchaseUnit);

    if (!Object.keys(data).length || Object.values(data).some((value) => typeof value === 'number' && (!Number.isFinite(value) || value < 0))) {
      return NextResponse.json({ error: 'راجع بيانات الخامة وتأكد أن الأرقام صحيحة.' }, { status: 400 });
    }
    const rawMaterial = await prisma.rawMaterial.update({
      where: { id: targetId },
      data,
    });
    return NextResponse.json({ rawMaterial });
  } catch (error) {
    console.error('Update raw material error:', error);
    return NextResponse.json({ error: 'تعذر تعديل بيانات الخامة.' }, { status: 500 });
  }
}

export const PUT = PATCH;

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    let rawMaterialId = searchParams.get('id') || searchParams.get('rawMaterialId');
    if (!rawMaterialId) {
      try {
        const body = await request.json();
        rawMaterialId = body?.rawMaterialId || body?.id;
      } catch {
        // ignore
      }
    }
    if (!rawMaterialId) return NextResponse.json({ error: 'الخامة مطلوبة.' }, { status: 400 });

    await prisma.$transaction(async (tx) => {
      await tx.recipe.deleteMany({ where: { rawMaterialId } });
      await tx.recipeModifier.deleteMany({ where: { rawMaterialId } });
      await tx.wastageLog.deleteMany({ where: { rawMaterialId } });
      await tx.restockLog.deleteMany({ where: { rawMaterialId } });
      await tx.purchaseInvoiceItem.updateMany({
        where: { rawMaterialId },
        data: { rawMaterialId: null },
      });
      await tx.rawMaterial.delete({ where: { id: rawMaterialId } });
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete raw material error:', error);
    return NextResponse.json({ error: 'تعذر حذف الخامة.' }, { status: 500 });
  }
}

