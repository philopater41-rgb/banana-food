import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

const hiddenLegacyMaterialNames = [
  'Almond Milk Pack',
  'Chocolate Syrup',
  'Espresso Coffee Beans',
  'Frozen Croissant (Raw)',
  'Full Cream Milk',
  'White Sugar',
];

export async function GET() {
  try {
    const rawMaterials = await prisma.rawMaterial.findMany({
      where: { name: { notIn: hiddenLegacyMaterialNames } },
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
    const { name, stockQty, minStockLevel, purchaseUnit, deductUnit, conversionFactor } = await request.json();

    if (!name || !purchaseUnit || !deductUnit || !conversionFactor) {
      return NextResponse.json(
        { error: 'Name, purchase unit, deduct unit, and conversion factor are required' },
        { status: 400 }
      );
    }

    const exists = await prisma.rawMaterial.findUnique({
      where: { name },
    });

    if (exists) {
      return NextResponse.json({ error: 'Raw material with this name already exists' }, { status: 400 });
    }

    const material = await prisma.rawMaterial.create({
      data: {
        name,
        stockQty: parseFloat(stockQty) || 0.0,
        minStockLevel: parseFloat(minStockLevel) || 0.0,
        purchaseUnit,
        deductUnit,
        conversionFactor: parseFloat(conversionFactor) || 1.0,
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
    const { rawMaterialId, name, stockQty, minStockLevel, purchaseUnit, deductUnit, conversionFactor } = await request.json();
    if (!rawMaterialId) {
      return NextResponse.json({ error: 'الخامة مطلوبة.' }, { status: 400 });
    }
    const data: Record<string, string | number> = {};
    if (name !== undefined) data.name = String(name).trim();
    if (stockQty !== undefined) data.stockQty = Number(stockQty);
    if (minStockLevel !== undefined) data.minStockLevel = Number(minStockLevel);
    if (purchaseUnit !== undefined) data.purchaseUnit = String(purchaseUnit).trim();
    if (deductUnit !== undefined) data.deductUnit = String(deductUnit).trim();
    if (conversionFactor !== undefined) data.conversionFactor = Number(conversionFactor);
    if (!Object.keys(data).length || Object.values(data).some((value) => typeof value === 'number' && (!Number.isFinite(value) || value < 0))) {
      return NextResponse.json({ error: 'راجع بيانات الخامة وتأكد أن الأرقام صحيحة.' }, { status: 400 });
    }
    const rawMaterial = await prisma.rawMaterial.update({
      where: { id: rawMaterialId },
      data,
    });
    return NextResponse.json({ rawMaterial });
  } catch (error) {
    console.error('Update raw material error:', error);
    return NextResponse.json({ error: 'تعذر تعديل بيانات الخامة.' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { rawMaterialId } = await request.json();
    if (!rawMaterialId) return NextResponse.json({ error: 'الخامة مطلوبة.' }, { status: 400 });
    await prisma.$transaction(async (tx) => {
      await tx.recipe.deleteMany({ where: { rawMaterialId } });
      await tx.recipeModifier.deleteMany({ where: { rawMaterialId } });
      await tx.wastageLog.deleteMany({ where: { rawMaterialId } });
      await tx.restockLog.deleteMany({ where: { rawMaterialId } });
      await tx.rawMaterial.delete({ where: { id: rawMaterialId } });
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete raw material error:', error);
    return NextResponse.json({ error: 'تعذر حذف الخامة.' }, { status: 500 });
  }
}
