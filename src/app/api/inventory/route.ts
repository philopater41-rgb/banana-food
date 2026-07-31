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
    const { rawMaterialId, minStockLevel } = await request.json();
    const level = Number(minStockLevel);
    if (!rawMaterialId || !Number.isFinite(level) || level < 0) {
      return NextResponse.json({ error: 'حد التنبيه يجب أن يكون صفرًا أو أكبر.' }, { status: 400 });
    }
    const rawMaterial = await prisma.rawMaterial.update({
      where: { id: rawMaterialId },
      data: { minStockLevel: level },
    });
    return NextResponse.json({ rawMaterial });
  } catch (error) {
    console.error('Update stock alert level error:', error);
    return NextResponse.json({ error: 'تعذر تعديل حد التنبيه.' }, { status: 500 });
  }
}
