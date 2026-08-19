import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const dateStr = searchParams.get('date'); // e.g. "2026-08-18"
    const monthStr = searchParams.get('month'); // e.g. "2026-08"
    const shiftId = searchParams.get('shiftId');

    let whereClause: any = {
      status: 'COMPLETED',
    };

    if (shiftId) {
      whereClause.shiftId = shiftId;
    } else if (dateStr) {
      // Date in Africa/Cairo timezone or UTC bounds
      const startOfDay = new Date(`${dateStr}T00:00:00.000+03:00`);
      const endOfDay = new Date(`${dateStr}T23:59:59.999+03:00`);
      whereClause.createdAt = {
        gte: startOfDay,
        lte: endOfDay,
      };
    } else if (monthStr) {
      const [year, month] = monthStr.split('-').map(Number);
      const startOfMonth = new Date(year, month - 1, 1, 0, 0, 0);
      const endOfMonth = new Date(year, month, 0, 23, 59, 59, 999);
      whereClause.createdAt = {
        gte: startOfMonth,
        lte: endOfMonth,
      };
    }

    const orders = await prisma.salesOrder.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      include: {
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

    return NextResponse.json({ orders });
  } catch (error) {
    console.error('GET sales orders error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
