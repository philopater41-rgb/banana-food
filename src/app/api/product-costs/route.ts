import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET() {
  try {
    const items = await prisma.item.findMany({
      where: { isActive: true },
      include: {
        category: { select: { id: true, name: true } },
        recipe: {
          include: {
            rawMaterial: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Fetch today's sales items
    const todayOrderItems = await prisma.salesOrderItem.findMany({
      where: {
        order: {
          createdAt: { gte: startOfToday },
          status: 'COMPLETED',
        },
      },
    });

    // Group today's sold quantities
    const todaySoldMap = new Map<string, number>();
    for (const oi of todayOrderItems) {
      const current = todaySoldMap.get(oi.itemId) || 0;
      todaySoldMap.set(oi.itemId, current + oi.qty);
    }

    const calculatedItems = items.map((item) => {
      // Calculate true cost from recipe ingredients if any
      let totalRecipeCost = 0;
      const ingredientsBreakdown = item.recipe.map((r) => {
        const costPerDeductUnit =
          r.rawMaterial.conversionFactor > 0
            ? (r.rawMaterial.costPerPurchaseUnit || 0) / r.rawMaterial.conversionFactor
            : 0;
        const ingCost = r.quantity * costPerDeductUnit;
        totalRecipeCost += ingCost;
        return {
          rawMaterialId: r.rawMaterialId,
          materialName: r.rawMaterial.name,
          quantity: r.quantity,
          deductUnit: r.rawMaterial.deductUnit,
          cost: ingCost,
        };
      });

      // Unit cost: recipe cost if defined, otherwise manual/direct item cost
      const totalUnitCost = totalRecipeCost > 0 ? totalRecipeCost : (item.cost || 0);

      const profitPerUnit = item.price - totalUnitCost;
      const profitMarginPct = totalUnitCost > 0 ? (profitPerUnit / totalUnitCost) * 100 : 0;
      const qtySoldToday = todaySoldMap.get(item.id) || 0;
      const totalRevenueToday = qtySoldToday * item.price;
      const totalCostToday = qtySoldToday * totalUnitCost;
      const totalProfitToday = qtySoldToday * profitPerUnit;

      const stock = (item as any).stockQty ?? 0;
      const minStock = (item as any).minStockLevel ?? 0;
      const unitStr = (item as any).unit || 'كجم';
      const isLowStock = minStock > 0 && stock <= minStock;

      return {
        id: item.id,
        name: item.name,
        categoryId: item.categoryId,
        categoryName: item.category?.name || 'عام',
        price: item.price,
        cost: item.cost || 0,
        stockQty: stock,
        minStockLevel: minStock,
        unit: unitStr,
        isLowStock,
        unitCost: Number(totalUnitCost.toFixed(2)),
        profitPerUnit: Number(profitPerUnit.toFixed(2)),
        profitMarginPct: Number(profitMarginPct.toFixed(1)),
        ingredients: ingredientsBreakdown,
        hasRecipe: item.recipe.length > 0,
        qtySoldToday,
        totalRevenueToday,
        totalCostToday: Number(totalCostToday.toFixed(2)),
        totalProfitToday: Number(totalProfitToday.toFixed(2)),
      };
    });

    const totalInventoryCostValue = calculatedItems.reduce((sum, it) => {
      const stock = Math.max(0, it.stockQty ?? 0);
      const unitCost = it.unitCost > 0 ? it.unitCost : (it.cost || 0);
      return sum + (stock * unitCost);
    }, 0);

    const totalInventoryRetailValue = calculatedItems.reduce((sum, it) => {
      const stock = Math.max(0, it.stockQty ?? 0);
      return sum + (stock * it.price);
    }, 0);

    const totalInventoryExpectedProfit = Math.max(0, totalInventoryRetailValue - totalInventoryCostValue);

    return NextResponse.json({
      items: calculatedItems,
      totalTodayProfit: Number(
        calculatedItems.reduce((sum, it) => sum + it.totalProfitToday, 0).toFixed(2)
      ),
      totalTodayCost: Number(
        calculatedItems.reduce((sum, it) => sum + it.totalCostToday, 0).toFixed(2)
      ),
      totalInventoryCostValue: Number(totalInventoryCostValue.toFixed(2)),
      totalInventoryRetailValue: Number(totalInventoryRetailValue.toFixed(2)),
      totalInventoryExpectedProfit: Number(totalInventoryExpectedProfit.toFixed(2)),
    });
  } catch (error: any) {
    console.error('GET product costs error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
