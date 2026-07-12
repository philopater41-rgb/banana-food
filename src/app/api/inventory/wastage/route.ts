import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET() {
  try {
    const wastageLogs = await prisma.wastageLog.findMany({
      include: {
        rawMaterial: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json({ wastageLogs });
  } catch (error: any) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { rawMaterialId, quantity, reason } = await request.json();

    if (!rawMaterialId || !quantity || !reason) {
      return NextResponse.json(
        { error: 'Raw material ID, quantity, and reason are required' },
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

    // Deduct stock and create wastage log in a transaction
    const [updatedMaterial, log] = await prisma.$transaction([
      prisma.rawMaterial.update({
        where: { id: rawMaterialId },
        data: {
          stockQty: {
            decrement: qty,
          },
        },
      }),
      prisma.wastageLog.create({
        data: {
          rawMaterialId,
          quantity: qty,
          reason,
        },
        include: {
          rawMaterial: true,
        },
      }),
    ]);

    return NextResponse.json({ material: updatedMaterial, log });
  } catch (error: any) {
    console.error('Wastage log error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
