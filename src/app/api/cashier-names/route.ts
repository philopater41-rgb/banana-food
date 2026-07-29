import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET() {
  const cashierNames = await prisma.savedCashierName.findMany({
    orderBy: { name: 'asc' },
  });
  return NextResponse.json({ cashierNames });
}

export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Name ID is required' }, { status: 400 });

  await prisma.savedCashierName.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
