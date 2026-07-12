import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function POST(request: Request) {
  try {
    const { shiftId, closedCash, closedInstaPay, closedVisa } = await request.json();

    if (!shiftId) {
      return NextResponse.json({ error: 'Shift ID is required' }, { status: 400 });
    }

    const shift = await prisma.shift.findUnique({
      where: { id: shiftId },
      include: {
        orders: {
          where: { status: 'COMPLETED' },
        },
        transactions: true,
      },
    });

    if (!shift) {
      return NextResponse.json({ error: 'Shift not found' }, { status: 404 });
    }

    if (shift.closedAt) {
      return NextResponse.json({ error: 'Shift is already closed' }, { status: 400 });
    }

    // 1. Calculate sales by payment method
    let salesCash = 0;
    let salesInstaPay = 0;
    let salesVisa = 0;

    for (const order of shift.orders) {
      if (order.paymentMethod === 'CASH') {
        salesCash += order.total;
      } else if (order.paymentMethod === 'INSTAPAY') {
        salesInstaPay += order.total;
      } else if (order.paymentMethod === 'VISA') {
        salesVisa += order.total;
      }
    }

    // 2. Calculate cash transactions impact
    let cashTxImpact = 0;
    for (const tx of shift.transactions) {
      if (tx.type === 'PAYIN') {
        cashTxImpact += tx.amount;
      } else if (tx.type === 'PAYOUT') {
        cashTxImpact -= tx.amount;
      }
    }

    // Expected totals
    const expectedCash = shift.floatCash + salesCash + cashTxImpact;
    const expectedInstaPay = salesInstaPay;
    const expectedVisa = salesVisa;

    // Actual inputs from user
    const actCash = parseFloat(closedCash) || 0;
    const actInstaPay = parseFloat(closedInstaPay) || 0;
    const actVisa = parseFloat(closedVisa) || 0;

    // Variances
    const varianceCash = actCash - expectedCash;
    const varianceInstaPay = actInstaPay - expectedInstaPay;
    const varianceVisa = actVisa - expectedVisa;

    // Update shift
    const updatedShift = await prisma.shift.update({
      where: { id: shiftId },
      data: {
        closedAt: new Date(),
        closedCash: actCash,
        closedInstaPay: actInstaPay,
        closedVisa: actVisa,
        expectedCash,
        expectedInstaPay,
        expectedVisa,
        varianceCash,
        varianceInstaPay,
        varianceVisa,
      },
      include: {
        user: {
          select: { id: true, name: true, role: true },
        },
      },
    });

    return NextResponse.json({ shift: updatedShift });
  } catch (error: any) {
    console.error('Close shift error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
