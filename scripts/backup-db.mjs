import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';
import { neonConfig } from '@neondatabase/serverless';
import ws from 'ws';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');

import { PrismaLibSql } from '@prisma/adapter-libsql';

function getClient() {
  const dbUrl = process.env.DATABASE_URL || 'file:dev.db';

  if (dbUrl.startsWith('postgresql:') || dbUrl.startsWith('postgres:')) {
    neonConfig.webSocketConstructor = ws;
    const adapter = new PrismaNeon({ connectionString: dbUrl });
    return new PrismaClient({ adapter });
  }

  const adapter = new PrismaLibSql({ url: dbUrl });
  return new PrismaClient({ adapter });
}

async function runBackup() {
  console.log('[+] Starting Local Database Backup...');
  const prisma = getClient();
  if (!prisma) {
    console.log('[!] Backup skipped: No active database URL configured.');
    return;
  }

  try {
    const backupDir = path.join(projectRoot, 'backups');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

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
      appName: 'BANANA FOOD POS',
      counts: {
        customers: customers.length,
        suppliers: suppliers.length,
        items: items.length,
        salesOrders: salesOrders.length,
        purchases: purchaseInvoices.length,
        returns: orderReturns.length,
      },
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

    const now = new Date();
    const filename = `backup-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}.json`;
    const targetPath = path.join(backupDir, filename);

    fs.writeFileSync(targetPath, JSON.stringify(backupData, null, 2), 'utf-8');
    console.log(`[✓] Backup saved successfully to: ${targetPath}`);
    console.log(`[✓] Summary: ${salesOrders.length} Orders, ${customers.length} Customers, ${suppliers.length} Suppliers.`);
  } catch (err) {
    console.error('[!] Backup failed:', err);
  } finally {
    await prisma.$disconnect();
  }
}

runBackup();
