import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const order = await prisma.salesOrder.findUnique({
      where: { id },
      include: {
        shift: { select: { id: true, cashierName: true, openedAt: true, user: { select: { name: true } } } },
        table: { select: { name: true } },
        customer: { select: { name: true, phone: true } },
        items: {
          include: {
            item: { select: { id: true, name: true, price: true } },
            modifiers: {
              include: { modifier: { select: { id: true, name: true, priceImpact: true } } },
            },
          },
        },
      },
    });

    if (!order) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    }

    return NextResponse.json({ order });
  } catch (error) {
    console.error('GET sales order details error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
