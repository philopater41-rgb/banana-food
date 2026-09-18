import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// GET: Fetch all active items with recipes and categories
export async function GET() {
  try {
    const items = await prisma.item.findMany({
      where: { isActive: true },
      include: {
        category: true,
        recipe: {
          include: {
            rawMaterial: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    const categories = await prisma.category.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });

    return NextResponse.json({ items, categories });
  } catch (error) {
    console.error('GET items error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST: Create a new menu item with optional recipe ingredients
export async function POST(request: Request) {
  try {
    const { name, price, cost, stockQty, minStockLevel, unit, categoryName, recipe } = await request.json();
    const itemName = typeof name === 'string' ? name.trim() : '';
    const normalizedCategoryName = typeof categoryName === 'string' ? categoryName.trim() : '';
    const parsedPrice = Number(price);
    const parsedCost = Number(cost) || 0;
    const parsedStock = stockQty !== undefined && stockQty !== '' ? Number(stockQty) : 50;
    const parsedMinStock = minStockLevel !== undefined && minStockLevel !== '' ? Number(minStockLevel) : 15;
    const itemUnit = typeof unit === 'string' && unit.trim() ? unit.trim() : 'كجم';

    if (!itemName || !normalizedCategoryName || !Number.isFinite(parsedPrice) || parsedPrice < 0) {
      return NextResponse.json({ error: 'اسم الصنف والقسم والسعر الصحيح مطلوبون.' }, { status: 400 });
    }

    const category = await prisma.category.upsert({
      where: { name: normalizedCategoryName },
      update: { isActive: true },
      create: { name: normalizedCategoryName, isActive: true },
    });

    const duplicate = await prisma.item.findFirst({
      where: { name: itemName, categoryId: category.id, isActive: true },
    });
    if (duplicate) {
      return NextResponse.json({ error: 'هذا الصنف موجود بالفعل في هذا القسم.' }, { status: 409 });
    }

    const item = await prisma.item.create({
      data: {
        name: itemName,
        price: parsedPrice,
        cost: parsedCost,
        stockQty: parsedStock,
        minStockLevel: parsedMinStock,
        unit: itemUnit,
        categoryId: category.id,
        isActive: true,
      },
      include: { category: true, recipe: true },
    });

    // If recipe ingredients were passed, create them
    if (recipe && Array.isArray(recipe) && recipe.length > 0) {
      const validIngredients = recipe.filter(
        (r: any) => r.rawMaterialId && Number(r.quantity) > 0
      );
      if (validIngredients.length > 0) {
        await prisma.recipe.createMany({
          data: validIngredients.map((r: any) => ({
            itemId: item.id,
            rawMaterialId: r.rawMaterialId,
            quantity: Number(r.quantity),
          })),
        });
      }
    }

    const itemWithRecipe = await prisma.item.findUnique({
      where: { id: item.id },
      include: {
        category: true,
        recipe: { include: { rawMaterial: true } },
      },
    });

    return NextResponse.json({ item: itemWithRecipe }, { status: 201 });
  } catch (error) {
    console.error('Create menu item error:', error);
    return NextResponse.json({ error: 'تعذر إضافة الصنف.' }, { status: 500 });
  }
}

// PUT: Update an existing menu item and its recipe
export async function PUT(request: Request) {
  try {
    const { id, name, price, cost, stockQty, minStockLevel, unit, categoryName, recipe } = await request.json();
    if (!id) {
      return NextResponse.json({ error: 'معرّف الصنف مطلوب.' }, { status: 400 });
    }

    const itemName = typeof name === 'string' ? name.trim() : '';
    const normalizedCategoryName = typeof categoryName === 'string' ? categoryName.trim() : '';
    const parsedPrice = Number(price);
    const parsedCost = cost !== undefined ? Number(cost) : undefined;
    const parsedStock = stockQty !== undefined && stockQty !== '' ? Number(stockQty) : undefined;
    const parsedMinStock = minStockLevel !== undefined && minStockLevel !== '' ? Number(minStockLevel) : undefined;
    const itemUnit = typeof unit === 'string' && unit.trim() ? unit.trim() : undefined;

    if (!itemName || !Number.isFinite(parsedPrice) || parsedPrice < 0) {
      return NextResponse.json({ error: 'بيانات الصنف غير صحيحة.' }, { status: 400 });
    }

    let categoryId: string | undefined = undefined;
    if (normalizedCategoryName) {
      const category = await prisma.category.upsert({
        where: { name: normalizedCategoryName },
        update: { isActive: true },
        create: { name: normalizedCategoryName, isActive: true },
      });
      categoryId = category.id;
    }

    await prisma.item.update({
      where: { id },
      data: {
        name: itemName,
        price: parsedPrice,
        ...(parsedCost !== undefined && Number.isFinite(parsedCost) ? { cost: parsedCost } : {}),
        ...(parsedStock !== undefined && Number.isFinite(parsedStock) ? { stockQty: parsedStock } : {}),
        ...(parsedMinStock !== undefined && Number.isFinite(parsedMinStock) ? { minStockLevel: parsedMinStock } : {}),
        ...(itemUnit ? { unit: itemUnit } : {}),
        ...(categoryId ? { categoryId } : {}),
      },
    });

    // Update recipe if provided
    if (recipe && Array.isArray(recipe)) {
      await prisma.recipe.deleteMany({ where: { itemId: id } });
      const validIngredients = recipe.filter(
        (r: any) => r.rawMaterialId && Number(r.quantity) > 0
      );
      if (validIngredients.length > 0) {
        await prisma.recipe.createMany({
          data: validIngredients.map((r: any) => ({
            itemId: id,
            rawMaterialId: r.rawMaterialId,
            quantity: Number(r.quantity),
          })),
        });
      }
    }

    const updatedItem = await prisma.item.findUnique({
      where: { id },
      include: {
        category: true,
        recipe: { include: { rawMaterial: true } },
      },
    });

    return NextResponse.json({ item: updatedItem });
  } catch (error) {
    console.error('Update menu item error:', error);
    return NextResponse.json({ error: 'تعذر تعديل الصنف.' }, { status: 500 });
  }
}

// DELETE: Delete menu item safely
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    let itemId = searchParams.get('id');
    if (!itemId) {
      try {
        const body = await request.json();
        itemId = body?.id;
      } catch {
        // ignore
      }
    }
    if (!itemId) return NextResponse.json({ error: 'معرّف الصنف مطلوب.' }, { status: 400 });

    // Check if item has order history
    const orderCount = await prisma.salesOrderItem.count({ where: { itemId } });
    const returnCount = await prisma.orderReturnItem.count({ where: { itemId } });

    if (orderCount === 0 && returnCount === 0) {
      // Safe to completely delete
      await prisma.recipe.deleteMany({ where: { itemId } });
      await prisma.item.delete({ where: { id: itemId } });
      return NextResponse.json({ success: true, deleted: true });
    } else {
      // Keep sales history intact: hide the item from active menu & POS
      const item = await prisma.item.update({
        where: { id: itemId },
        data: { isActive: false },
      });
      return NextResponse.json({ success: true, deactivated: true, item });
    }
  } catch (error) {
    console.error('Delete menu item error:', error);
    return NextResponse.json({ error: 'تعذر حذف الصنف.' }, { status: 500 });
  }
}

// PATCH: Quick update of price, cost, stockQty, minStockLevel, unit
export async function PATCH(request: Request) {
  try {
    const { id, price, cost, stockQty, minStockLevel, unit } = await request.json();
    if (!id) {
      return NextResponse.json({ error: 'معرّف الصنف مطلوب.' }, { status: 400 });
    }

    const dataToUpdate: any = {};
    if (price !== undefined) {
      const parsedPrice = Number(price);
      if (Number.isFinite(parsedPrice) && parsedPrice >= 0) {
        dataToUpdate.price = parsedPrice;
      }
    }
    if (cost !== undefined) {
      const parsedCost = Number(cost);
      if (Number.isFinite(parsedCost) && parsedCost >= 0) {
        dataToUpdate.cost = parsedCost;
      }
    }
    if (stockQty !== undefined) {
      const parsedStock = Number(stockQty);
      if (Number.isFinite(parsedStock)) {
        dataToUpdate.stockQty = parsedStock;
      }
    }
    if (minStockLevel !== undefined) {
      const parsedMin = Number(minStockLevel);
      if (Number.isFinite(parsedMin)) {
        dataToUpdate.minStockLevel = parsedMin;
      }
    }
    if (unit !== undefined && typeof unit === 'string' && unit.trim()) {
      dataToUpdate.unit = unit.trim();
    }

    if (Object.keys(dataToUpdate).length === 0) {
      return NextResponse.json({ error: 'لا توجد بيانات لتحديثها.' }, { status: 400 });
    }

    const updatedItem = await prisma.item.update({
      where: { id },
      data: dataToUpdate,
    });

    return NextResponse.json({ success: true, item: updatedItem });
  } catch (error) {
    console.error('PATCH item error:', error);
    return NextResponse.json({ error: 'تعذر تحديث بيانات الصنف.' }, { status: 500 });
  }
}


