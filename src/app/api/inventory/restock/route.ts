import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function POST(request: Request) {
  try {
    const { rawMaterialId, quantity } = await request.json();

    if (!rawMaterialId || !quantity) {
      return NextResponse.json(
        { error: 'Raw material ID and quantity are required' },
        { status: 400 }
      );
    }

    const qty = parseFloat(quantity);
    if (isNaN(qty) || qty <= 0) {
      return NextResponse.json({ error: 'Quantity must be a positive number' }, { status: 400 });
    }

    const material = await prisma.rawMaterial.findUnique({
      where: { id: rawMaterialId },
    });

    if (!material) {
      return NextResponse.json({ error: 'Raw material not found' }, { status: 404 });
    }

    // Restock quantity is entered in purchase units (e.g. 5kg).
    // In database we store stockQty in deduct units (grams).
    // So we add qty * conversionFactor
    const addedDeductQty = qty * material.conversionFactor;

    const updatedMaterial = await prisma.rawMaterial.update({
      where: { id: rawMaterialId },
      data: {
        stockQty: {
          increment: addedDeductQty,
        },
      },
    });

    return NextResponse.json({ material: updatedMaterial });
  } catch (error: any) {
    console.error('Restock error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
