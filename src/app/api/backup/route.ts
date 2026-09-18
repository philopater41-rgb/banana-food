import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import fs from 'fs';
import path from 'path';

export async function GET() {
  try {
    // Export all tables to a clean JSON structure
    const [
      users,
      categories,
      items,
      modifiers,
      rawMaterials,
      recipes,
      recipeModifiers,
      halls,
      tables,
      customers,
      discountReasons,
      suppliers,
      purchaseInvoices,
      shifts,
      salesOrders,
      orderReturns,
      wastageLogs,
      restockLogs,
      attendanceRecords,
      cashTransactions,
    ] = await Promise.all([
      prisma.user.findMany(),
      prisma.category.findMany(),
      prisma.item.findMany(),
      prisma.modifier.findMany(),
      prisma.rawMaterial.findMany(),
      prisma.recipe.findMany(),
      prisma.recipeModifier.findMany(),
      prisma.hall.findMany(),
      prisma.table.findMany(),
      prisma.customer.findMany(),
      prisma.discountReason.findMany(),
      prisma.supplier.findMany(),
      prisma.purchaseInvoice.findMany({ include: { items: true } }),
      prisma.shift.findMany(),
      prisma.salesOrder.findMany({ include: { items: { include: { modifiers: true } } } }),
      prisma.orderReturn.findMany({ include: { items: true } }),
      prisma.wastageLog.findMany(),
      prisma.restockLog.findMany(),
      prisma.attendanceRecord.findMany(),
      prisma.cashTransaction.findMany(),
    ]);

    const backupData = {
      timestamp: new Date().toISOString(),
      version: '2.0.0',
      appName: 'Banana Food POS',
      data: {
        users,
        categories,
        items,
        modifiers,
        rawMaterials,
        recipes,
        recipeModifiers,
        halls,
        tables,
        customers,
        discountReasons,
        suppliers,
        purchaseInvoices,
        shifts,
        salesOrders,
        orderReturns,
        wastageLogs,
        restockLogs,
        attendanceRecords,
        cashTransactions,
      },
    };

    // Also write to local backups folder on server
    try {
      const backupDir = path.join(process.cwd(), 'backups');
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
      }
      const now = new Date();
      const filename = `backup-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}.json`;
      fs.writeFileSync(path.join(backupDir, filename), JSON.stringify(backupData, null, 2), 'utf-8');
    } catch (saveErr) {
      console.warn('Could not auto-save backup to disk:', saveErr);
    }

    return new NextResponse(JSON.stringify(backupData, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="banana-food-backup-${new Date().toISOString().slice(0, 10)}.json"`,
      },
    });
  } catch (error: any) {
    console.error('Backup error:', error);
    return NextResponse.json({ error: 'Failed to generate backup' }, { status: 500 });
  }
}
