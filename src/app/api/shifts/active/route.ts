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
      },
    });

    return NextResponse.json({ activeShift });
  } catch (error: any) {
    console.error('GET active shift error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST open a new shift
export async function POST(request: Request) {
  try {
    const { userId, floatCash } = await request.json();

    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
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

    const newShift = await prisma.shift.create({
      data: {
        userId,
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

    return NextResponse.json({ shift: newShift });
  } catch (error: any) {
    console.error('POST open shift error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
