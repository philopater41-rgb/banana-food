import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

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

    const modifiers = await prisma.modifier.findMany({
      include: {
        recipe: {
          include: {
            rawMaterial: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    const rawMaterials = await prisma.rawMaterial.findMany({
      orderBy: { name: 'asc' },
    });

    return NextResponse.json({ items, modifiers, rawMaterials });
  } catch (error: any) {
    console.error('GET recipes error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { itemId, modifierId, ingredients } = await request.json(); // ingredients: Array<{ rawMaterialId: string, quantity: number }>

    if (!itemId && !modifierId) {
      return NextResponse.json({ error: 'Item ID or Modifier ID is required' }, { status: 400 });
    }

    if (itemId) {
      // Delete old recipe ingredients
      await prisma.recipe.deleteMany({
        where: { itemId },
      });

      // Create new recipe ingredients
      if (ingredients && Array.isArray(ingredients) && ingredients.length > 0) {
        await prisma.recipe.createMany({
          data: ingredients.map((ing: any) => ({
            itemId,
            rawMaterialId: ing.rawMaterialId,
            quantity: parseFloat(ing.quantity) || 0,
          })),
        });
      }
    } else if (modifierId) {
      // Delete old modifier recipe ingredients
      await prisma.recipeModifier.deleteMany({
        where: { modifierId },
      });

      // Create new modifier recipe ingredients
      if (ingredients && Array.isArray(ingredients) && ingredients.length > 0) {
        await prisma.recipeModifier.createMany({
          data: ingredients.map((ing: any) => ({
            modifierId,
            rawMaterialId: ing.rawMaterialId,
            quantity: parseFloat(ing.quantity) || 0,
          })),
        });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('POST recipes error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
