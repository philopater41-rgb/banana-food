import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

const DEFAULT_REASONS = [
  { reason: 'خصم عميل مميز', rate: 10 },
  { reason: 'خصم شركات ومؤسسات', rate: 15 },
  { reason: 'خصم مستشفيات وأطباء', rate: 15 },
  { reason: 'خصم كافيهات ومطاعم', rate: 20 },
  { reason: 'عرض ترويجي / تخفيضات', rate: 10 },
  { reason: 'ضيافة إدارة', rate: 100 },
  { reason: 'تعويض / إرضاء عميل', rate: 50 },
  { reason: 'خصم موظفين', rate: 25 },
];

export async function GET() {
  try {
    let reasons = await prisma.discountReason.findMany({
      orderBy: { reason: 'asc' },
    });

    // Seed defaults if empty
    if (reasons.length === 0) {
      for (const d of DEFAULT_REASONS) {
        await prisma.discountReason.upsert({
          where: { reason: d.reason },
          update: {},
          create: d,
        });
      }
      reasons = await prisma.discountReason.findMany({
        orderBy: { reason: 'asc' },
      });
    }

    return NextResponse.json({ reasons });
  } catch (error: any) {
    console.error('GET discount reasons error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { reason, rate } = await request.json();
    if (!reason || !reason.trim()) {
      return NextResponse.json({ error: 'سبب الخصم مطلوب' }, { status: 400 });
    }

    const created = await prisma.discountReason.create({
      data: {
        reason: reason.trim(),
        rate: rate ? Number(rate) : null,
      },
    });

    return NextResponse.json({ success: true, reason: created });
  } catch (error: any) {
    console.error('POST discount reason error:', error);
    return NextResponse.json({ error: 'Failed to create discount reason' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'ID is required' }, { status: 400 });
    }

    await prisma.discountReason.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('DELETE discount reason error:', error);
    return NextResponse.json({ error: 'Failed to delete reason' }, { status: 500 });
  }
}
