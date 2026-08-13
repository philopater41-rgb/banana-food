import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET() {
  try {
    // 1. Fetch categories with items
    const categories = await prisma.category.findMany({
      where: {
        isActive: true,
        items: { some: { isActive: true } },
      },
      include: {
        items: {
          where: { isActive: true },
          orderBy: { name: 'asc' },
        },
      },
      orderBy: { name: 'asc' },
    });

    // 2. Fetch modifiers
    const modifiers = await prisma.modifier.findMany({
      orderBy: { name: 'asc' },
    });

    // 3. Fetch halls with tables
    const halls = await prisma.hall.findMany({
      where: { name: { not: 'Terrace (Outdoor)' } },
      include: {
        tables: {
          orderBy: { name: 'asc' },
        },
      },
      orderBy: { name: 'asc' },
    });
    // خدمات ليست قائمة بيع عادية؛ تبقى آخر تبويب حتى مع إضافة أقسام جديدة.
    categories.sort((a, b) => {
      if (a.name === 'خدمات') return 1;
      if (b.name === 'خدمات') return -1;
      return a.name.localeCompare(b.name, 'ar');
    });
    for (const hall of halls) {
      hall.tables.sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
      );
    }

    // 4. Get count of today's orders to sync receipt numbering counter
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayOrdersCount = await prisma.salesOrder.count({
      where: { createdAt: { gte: startOfToday } },
    });

    return NextResponse.json({
      categories,
      modifiers,
      halls,
      todayOrdersCount,
    });
  } catch (error: any) {
    console.error('POS init endpoint error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
