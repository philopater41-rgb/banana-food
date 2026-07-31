import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function POST(request: Request) {
  try {
    const { name, price, categoryName } = await request.json();
    const itemName = typeof name === 'string' ? name.trim() : '';
    const normalizedCategoryName = typeof categoryName === 'string' ? categoryName.trim() : '';
    const parsedPrice = Number(price);

    if (!itemName || !normalizedCategoryName || !Number.isFinite(parsedPrice) || parsedPrice < 0) {
      return NextResponse.json({ error: 'اسم الصنف والقسم والسعر الصحيح مطلوبون.' }, { status: 400 });
    }

    const category = await prisma.category.upsert({
      where: { name: normalizedCategoryName },
      update: { isActive: true },
      create: { name: normalizedCategoryName, isActive: true },
    });
    const duplicate = await prisma.item.findFirst({ where: { name: itemName, categoryId: category.id } });
    if (duplicate) {
      return NextResponse.json({ error: 'هذا الصنف موجود بالفعل في هذا القسم.' }, { status: 409 });
    }

    const item = await prisma.item.create({
      data: { name: itemName, price: parsedPrice, categoryId: category.id, isActive: true },
      include: { category: true, recipe: true },
    });
    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    console.error('Create menu item error:', error);
    return NextResponse.json({ error: 'تعذر إضافة الصنف.' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const itemId = new URL(request.url).searchParams.get('id');
    if (!itemId) return NextResponse.json({ error: 'معرّف الصنف مطلوب.' }, { status: 400 });

    // Keep sales history intact: hide the item from the live POS instead of deleting it.
    const item = await prisma.item.update({ where: { id: itemId }, data: { isActive: false } });
    return NextResponse.json({ item });
  } catch (error) {
    console.error('Hide menu item error:', error);
    return NextResponse.json({ error: 'تعذر حذف الصنف.' }, { status: 500 });
  }
}
