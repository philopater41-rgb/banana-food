import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function POST(request: Request) {
  try {
    const { rawMaterialId, quantity, amount } = await request.json();

    if (!rawMaterialId || !quantity || amount === undefined || amount === null || amount === '') {
      return NextResponse.json(
        { error: 'Raw material ID and quantity are required' },
        { status: 400 }
      );
    }

    const qty = parseFloat(quantity);
    const paidAmount = parseFloat(amount);
    if (isNaN(qty) || qty <= 0 || isNaN(paidAmount) || paidAmount < 0) {
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

    const [updatedMaterial] = await prisma.$transaction([
      prisma.rawMaterial.update({
        where: { id: rawMaterialId },
        data: { stockQty: { increment: addedDeductQty } },
      }),
      prisma.restockLog.create({ data: { rawMaterialId, quantity: qty, amount: paidAmount } }),
    ]);

    return NextResponse.json({ material: updatedMaterial });
  } catch (error: any) {
    console.error('Restock error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET() {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const logs = await prisma.restockLog.findMany({
      take: 100,
      orderBy: { createdAt: 'desc' },
      include: { rawMaterial: { select: { name: true, purchaseUnit: true } } },
    });
    const monthlyTotal = logs
      .filter((log) => log.createdAt >= startOfMonth)
      .reduce((total, log) => total + log.amount, 0);
    return NextResponse.json({ logs, monthlyTotal });
  } catch (error) {
    console.error('Get restock logs error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
