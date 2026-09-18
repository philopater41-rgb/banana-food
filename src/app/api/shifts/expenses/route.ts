import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// GET all expenses / cash transactions
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const shiftId = searchParams.get('shiftId');

    const where: any = { type: 'PAYOUT' };
    if (shiftId) where.shiftId = shiftId;

    const expenses = await prisma.cashTransaction.findMany({
      where,
      include: {
        shift: {
          select: {
            id: true,
            cashierName: true,
            openedAt: true,
            closedAt: true,
            user: {
              select: { id: true, name: true, username: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const todayTotal = expenses
      .filter((e) => new Date(e.createdAt) >= startOfToday)
      .reduce((sum, e) => sum + e.amount, 0);

    const grandTotal = expenses.reduce((sum, e) => sum + e.amount, 0);

    return NextResponse.json({
      expenses,
      todayTotal,
      grandTotal,
    });
  } catch (error: any) {
    console.error('GET expenses error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST create an expense transaction
export async function POST(request: Request) {
  try {
    const { shiftId, type = 'PAYOUT', amount, reason } = await request.json();

    if (!amount || !reason) {
      return NextResponse.json(
        { error: 'Amount and reason are required' },
        { status: 400 }
      );
    }

    if (type !== 'PAYOUT' && type !== 'PAYIN') {
      return NextResponse.json(
        { error: 'Type must be PAYOUT or PAYIN' },
        { status: 400 }
      );
    }

    let targetShiftId = shiftId;
    if (!targetShiftId) {
      const activeShift = await prisma.shift.findFirst({
        where: { closedAt: null },
      });
      if (activeShift) {
        targetShiftId = activeShift.id;
      } else {
        const latestShift = await prisma.shift.findFirst({
          orderBy: { openedAt: 'desc' },
        });
        if (latestShift) targetShiftId = latestShift.id;
      }
    }

    if (!targetShiftId) {
      return NextResponse.json(
        { error: 'No active shift found to register expense under' },
        { status: 400 }
      );
    }

    const transaction = await prisma.cashTransaction.create({
      data: {
        shiftId: targetShiftId,
        type,
        amount: parseFloat(amount),
        reason: String(reason).trim(),
      },
    });

    return NextResponse.json({ transaction });
  } catch (error: any) {
    console.error('Add cash transaction error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE an expense
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'ID is required' }, { status: 400 });
    }

    await prisma.cashTransaction.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('DELETE expense error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
