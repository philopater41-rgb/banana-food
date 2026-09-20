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

async function deleteSuppliers() {
  console.log('--- FETCHING & DELETING SUPPLIERS ---');
  
  const suppliers = await prisma.supplier.findMany({
    select: { id: true, name: true, companyName: true, phone: true }
  });
  console.log(`Found ${suppliers.length} suppliers:`, suppliers);

  // If there are any purchase invoices remaining, delete items & invoices first
  const purchaseCount = await prisma.purchaseInvoice.count();
  if (purchaseCount > 0) {
    console.log(`Found ${purchaseCount} purchase invoices, deleting...`);
    await prisma.purchaseInvoiceItem.deleteMany({});
    await prisma.purchaseInvoice.deleteMany({});
  }

  const result = await prisma.supplier.deleteMany({});
  console.log(`Deleted ${result.count} suppliers.`);

  const remaining = await prisma.supplier.count();
  console.log(`Remaining suppliers in database: ${remaining}`);
}

deleteSuppliers()
  .catch((e) => {
    console.error('Error deleting suppliers:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
