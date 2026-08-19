import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const dateStr = searchParams.get('date'); // e.g. "2026-08-18"
    const monthStr = searchParams.get('month'); // e.g. "2026-08"
    const shiftId = searchParams.get('shiftId');

    const cairoDateParts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Africa/Cairo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });

    const getBusinessDateStr = (date: Date, monthly = false) => {
      const parts = Object.fromEntries(
        cairoDateParts
          .formatToParts(date)
          .filter((part) => part.type !== 'literal')
          .map((part) => [part.type, part.value])
      );
      return monthly ? `${parts.year}-${parts.month}` : `${parts.year}-${parts.month}-${parts.day}`;
    };

    let whereClause: any = {
      status: 'COMPLETED',
    };

    if (shiftId) {
      whereClause.shiftId = shiftId;
    }

    const allOrders = await prisma.salesOrder.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      include: {
        shift: { select: { id: true, openedAt: true } },
        table: { select: { name: true } },
        items: {
          include: {
            item: { select: { name: true } },
            modifiers: {
              include: { modifier: { select: { name: true } } },
            },
          },
        },
      },
    });

    // Filter by shift operating date if dateStr or monthStr is provided
    let orders = allOrders;
    if (dateStr) {
      orders = allOrders.filter((order) => {
        const opDate = order.shift?.openedAt || order.createdAt;
        return getBusinessDateStr(opDate, false) === dateStr;
      });
    } else if (monthStr) {
      orders = allOrders.filter((order) => {
        const opDate = order.shift?.openedAt || order.createdAt;
        return getBusinessDateStr(opDate, true) === monthStr;
      });
    }

    return NextResponse.json({ orders });
  } catch (error) {
    console.error('GET sales orders error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
