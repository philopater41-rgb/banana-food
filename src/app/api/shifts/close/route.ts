import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function POST(request: Request) {
  try {
    const { shiftId, closedCash, closedInstaPay, closedVisa, closedVodafoneCash, closedCashOut } = await request.json();

    if (!shiftId) {
      return NextResponse.json({ error: 'Shift ID is required' }, { status: 400 });
    }

    const shift = await prisma.shift.findUnique({
      where: { id: shiftId },
      include: {
        orders: {
          where: { status: { in: ['COMPLETED', 'REFUNDED'] } },
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

    // 1. Calculate sales by payment method (net of returns)
    let salesCash = 0;
    let salesInstaPay = 0;
    let salesVisa = 0;
    let salesVodafoneCash = 0;
    let salesCashOut = 0;
    let visaCashOutReceived = 0;

    for (const order of shift.orders) {
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
        visaCashOutReceived += order.total; // Total swiped on Visa machine including fee
      }
    }

    // 2. Calculate cash transactions impact (deposits & return refunds; operating expenses do not reduce drawer cash)
    let cashTxImpact = 0;
    for (const tx of shift.transactions) {
      if (tx.type === 'PAYIN') {
        cashTxImpact += tx.amount;
      } else if (tx.type === 'REFUND_PAYOUT') {
        cashTxImpact -= tx.amount;
      }
    }

    // Expected drawer cash: float + cash sales - cash handed out + all cash movements (expenses & refunds)
    const expectedCash = Math.max(0, shift.floatCash + salesCash - salesCashOut + cashTxImpact);
    const expectedInstaPay = salesInstaPay;
    const expectedVisa = salesVisa + visaCashOutReceived;
    const expectedVodafoneCash = salesVodafoneCash;
    const expectedCashOut = salesCashOut;

    // Actual inputs from user
    const actCash = parseFloat(closedCash) || 0;
    const actInstaPay = parseFloat(closedInstaPay) || 0;
    const actVisa = parseFloat(closedVisa) || 0;
    const actVodafoneCash = parseFloat(closedVodafoneCash) || 0;
    const actCashOut = parseFloat(closedCashOut) || 0;

    // Variances
    const varianceCash = actCash - expectedCash;
    const varianceInstaPay = actInstaPay - expectedInstaPay;
    const varianceVisa = actVisa - expectedVisa;
    const varianceVodafoneCash = actVodafoneCash - expectedVodafoneCash;

    // Update shift
    const updatedShift = await prisma.shift.update({
      where: { id: shiftId },
      data: {
        closedAt: new Date(),
        closedCash: actCash,
        closedInstaPay: actInstaPay,
        closedVisa: actVisa,
        closedVodafoneCash: actVodafoneCash,
        closedCashOut: actCashOut,
        expectedCash,
        expectedInstaPay,
        expectedVisa,
        expectedVodafoneCash,
        expectedCashOut,
        varianceCash,
        varianceInstaPay,
        varianceVisa,
        varianceVodafoneCash,
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

