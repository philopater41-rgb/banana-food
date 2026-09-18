import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// GET active shift
export async function GET() {
  try {
    const activeShift = await prisma.shift.findFirst({
      where: { closedAt: null },
      include: {
        user: {
          select: { id: true, name: true, username: true, role: true },
        },
        transactions: true,
        orders: true,
      },
    });

    if (!activeShift) {
      return NextResponse.json({ activeShift: null });
    }

    let salesCash = 0;
    let salesInstaPay = 0;
    let salesVisa = 0;
    let salesVodafoneCash = 0;
    let salesCashOut = 0;
    let visaCashOutReceived = 0;

    for (const order of activeShift.orders) {
      if (order.status === 'CANCELLED') continue;
      if (order.paymentMethod === 'CASH') {
        salesCash += order.total;
      } else if (order.paymentMethod === 'INSTAPAY') {
        salesInstaPay += order.total;
      } else if (order.paymentMethod === 'VISA') {
        salesVisa += order.total;
      } else if (order.paymentMethod === 'VODAFONE_CASH') {
        salesVodafoneCash += order.total;
      } else if (order.paymentMethod === 'CASH_OUT') {
        const handedCash = order.cashOutAmount || order.total;
        salesCashOut += handedCash;
        visaCashOutReceived += order.total;
      }
    }

    let cashTxImpact = 0;
    for (const tx of activeShift.transactions) {
      // Include all cash movements: deposits, expenses, and customer refund payouts
      if (tx.type === 'PAYIN') {
        cashTxImpact += tx.amount;
      } else if (tx.type === 'PAYOUT') {
        cashTxImpact -= tx.amount;
      }
    }

    const resultShift = {
      ...activeShift,
      expectedCash: Math.max(0, activeShift.floatCash + salesCash - salesCashOut + cashTxImpact),
      expectedInstaPay: salesInstaPay,
      expectedVisa: salesVisa + visaCashOutReceived,
      expectedVodafoneCash: salesVodafoneCash,
      expectedCashOut: salesCashOut,
    };

    return NextResponse.json({ activeShift: resultShift });
  } catch (error: any) {
    console.error('GET active shift error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST open a new shift
export async function POST(request: Request) {
  try {
    const { userId, floatCash, cashierName } = await request.json();
    const normalizedCashierName = typeof cashierName === 'string' ? cashierName.trim() : '';

    if (!userId || !normalizedCashierName) {
      return NextResponse.json({ error: 'User ID and cashier name are required' }, { status: 400 });
    }

    // Check if there is already an active shift
    const existingActive = await prisma.shift.findFirst({
      where: { closedAt: null },
    });

    if (existingActive) {
      return NextResponse.json(
        { error: 'There is already an active shift running' },
        { status: 400 }
      );
    }

    const newShift = await prisma.$transaction(async (tx) => {
      await tx.savedCashierName.upsert({
        where: { name: normalizedCashierName },
        create: { name: normalizedCashierName },
        update: {},
      });
      return tx.shift.create({
        data: {
          userId,
          cashierName: normalizedCashierName,
          floatCash: parseFloat(floatCash) || 0,
          expectedCash: parseFloat(floatCash) || 0,
          expectedInstaPay: 0,
          expectedVisa: 0,
        },
      include: {
        user: {
          select: { id: true, name: true, username: true, role: true },
        },
      },
      });
    });

    return NextResponse.json({ shift: newShift });
  } catch (error: any) {
    console.error('POST open shift error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
