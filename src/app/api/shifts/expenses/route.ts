import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function POST(request: Request) {
  try {
    const { shiftId, type, amount, reason } = await request.json();

    if (!shiftId || !type || !amount || !reason) {
      return NextResponse.json(
        { error: 'Shift ID, transaction type, amount, and reason are required' },
        { status: 400 }
      );
    }

    if (type !== 'PAYOUT' && type !== 'PAYIN') {
      return NextResponse.json(
        { error: 'Type must be PAYOUT or PAYIN' },
        { status: 400 }
      );
    }

    const shift = await prisma.shift.findUnique({
      where: { id: shiftId },
    });

    if (!shift || shift.closedAt) {
      return NextResponse.json(
        { error: 'Active shift not found or is closed' },
        { status: 404 }
      );
    }

    const transaction = await prisma.cashTransaction.create({
      data: {
        shiftId,
        type,
        amount: parseFloat(amount),
        reason,
      },
    });

    return NextResponse.json({ transaction });
  } catch (error: any) {
    console.error('Add cash transaction error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
