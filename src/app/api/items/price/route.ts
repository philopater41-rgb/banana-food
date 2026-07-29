import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function PATCH(request: Request) {
  try {
    const { itemId, price } = await request.json();
    const parsedPrice = Number(price);

    if (!itemId || !Number.isFinite(parsedPrice) || parsedPrice < 0) {
      return NextResponse.json({ error: 'A valid item and non-negative price are required' }, { status: 400 });
    }

    const item = await prisma.item.update({
      where: { id: itemId },
      data: { price: parsedPrice },
    });

    return NextResponse.json({ item });
  } catch (error) {
    console.error('Update item price error:', error);
    return NextResponse.json({ error: 'Unable to update item price' }, { status: 500 });
  }
}
