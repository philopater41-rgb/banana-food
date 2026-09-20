import { PrismaClient } from '@prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';
import { neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

neonConfig.webSocketConstructor = ws;

const dbUrl =
  process.env.DATABASE_URL ||
  'postgresql://neondb_owner:npg_0tHMzIkiAY5b@ep-summer-cell-b4jzgno1-pooler.c-6.us-east-2.aws.neon.tech/neondb?sslmode=require';

const adapter = new PrismaNeon({ connectionString: dbUrl });
const prisma = new PrismaClient({ adapter });

async function resetDb() {
  console.log('--- STARTING DATABASE ZERO-OUT & RESET ---');

  // 1. Delete transactional records in correct foreign-key dependency order
  console.log('1. Deleting SalesOrderItemModifier...');
  await prisma.salesOrderItemModifier.deleteMany({});

  console.log('2. Deleting SalesOrderItem...');
  await prisma.salesOrderItem.deleteMany({});

  console.log('3. Deleting OrderReturnItem...');
  await prisma.orderReturnItem.deleteMany({});

  console.log('4. Deleting OrderReturn...');
  await prisma.orderReturn.deleteMany({});

  console.log('5. Deleting SalesOrder...');
  await prisma.salesOrder.deleteMany({});

  console.log('6. Deleting CashTransaction (Expenses & Payouts)...');
  await prisma.cashTransaction.deleteMany({});

  console.log('7. Deleting Shifts...');
  await prisma.shift.deleteMany({});

  console.log('8. Deleting PurchaseInvoiceItem...');
  await prisma.purchaseInvoiceItem.deleteMany({});

  console.log('9. Deleting PurchaseInvoice...');
  await prisma.purchaseInvoice.deleteMany({});

  console.log('10. Deleting WastageLog...');
  await prisma.wastageLog.deleteMany({});

  console.log('11. Deleting RestockLog...');
  await prisma.restockLog.deleteMany({});

  console.log('12. Deleting AttendanceRecord...');
  await prisma.attendanceRecord.deleteMany({});

  console.log('13. Deleting UserLog...');
  await prisma.userLog.deleteMany({});

  // 2. Reset Tables to vacant
  console.log('14. Resetting Table status to VACANT...');
  await prisma.table.updateMany({
    data: { status: 'VACANT' },
  });

  // 3. Zero out Item prices, costs, and stock quantities (keeping all 54 items & categories)
  console.log('15. Zeroing out Item prices, costs, and stockQty...');
  const itemsUpdated = await prisma.item.updateMany({
    data: {
      price: 0.0,
      cost: 0.0,
      stockQty: 0.0,
    },
  });
  console.log(`-> Zeroed ${itemsUpdated.count} menu items: price=0, cost=0, stockQty=0.`);

  // 4. Zero out RawMaterial stock and costs
  console.log('16. Zeroing out RawMaterial stock and costs...');
  const rawUpdated = await prisma.rawMaterial.updateMany({
    data: {
      stockQty: 0.0,
      costPerPurchaseUnit: 0.0,
    },
  });
  console.log(`-> Zeroed ${rawUpdated.count} raw materials.`);

  // 5. Final audit verification
  const usersCount = await prisma.user.count();
  const categoriesCount = await prisma.category.count();
  const itemsCount = await prisma.item.count();
  const ordersCount = await prisma.salesOrder.count();
  const shiftsCount = await prisma.shift.count();
  const expensesCount = await prisma.cashTransaction.count();

  console.log('\n========================================');
  console.log('      DATABASE RESET AUDIT SUMMARY      ');
  console.log('========================================');
  console.log(`- المستخدمين (Users): ${usersCount} (محفوظين)`);
  console.log(`- الأقسام (Categories): ${categoriesCount} (محفوظين)`);
  console.log(`- أصناف المنيو (Items): ${itemsCount} (الأسعار والتكلفة والكميات تم تصفيرها بالكامل إلى 0.00)`);
  console.log(`- فواتير المبيعات (Sales Orders): ${ordersCount} (مصفرة)`);
  console.log(`- الورديات (Shifts): ${shiftsCount} (مصفرة)`);
  console.log(`- المصروفات والنثريات (Expenses): ${expensesCount} (مصفرة)`);
  console.log('========================================\n');
}

resetDb()
  .catch((e) => {
    console.error('Error during DB reset:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
