const { createClient } = require('@libsql/client');
const client = createClient({ url: 'file:dev.db' });

async function main() {
  try {
    await client.execute('ALTER TABLE Item ADD COLUMN stockQty REAL DEFAULT 50.0');
    console.log('Added stockQty');
  } catch (e) {
    console.log('stockQty column exists or error:', e.message);
  }

  try {
    await client.execute('ALTER TABLE Item ADD COLUMN minStockLevel REAL DEFAULT 15.0');
    console.log('Added minStockLevel');
  } catch (e) {
    console.log('minStockLevel column exists or error:', e.message);
  }

  try {
    await client.execute("ALTER TABLE Item ADD COLUMN unit TEXT DEFAULT 'كجم'");
    console.log('Added unit');
  } catch (e) {
    console.log('unit column exists or error:', e.message);
  }

  // Set realistic default stock levels for produce items
  // Let a few items be below threshold so the user can immediately see "أصناف قربت تخلص" on the Dashboard!
  // e.g. خيار (8 كجم, min 15), ليمون (5 كجم, min 10), أناناس (3 قطع, min 5)
  await client.execute("UPDATE Item SET stockQty = 8.0, minStockLevel = 15.0 WHERE name = 'خيار'");
  await client.execute("UPDATE Item SET stockQty = 4.5, minStockLevel = 10.0 WHERE name = 'ليمون'");
  await client.execute("UPDATE Item SET stockQty = 2.0, minStockLevel = 5.0, unit = 'قطعة' WHERE name = 'أناناس'");
  await client.execute("UPDATE Item SET stockQty = 6.0, minStockLevel = 12.0 WHERE name = 'فلفل رومي'");
  await client.execute("UPDATE Item SET stockQty = 5.0, minStockLevel = 15.0 WHERE name = 'مانجو عويس'");

  const sample = await client.execute('SELECT id, name, price, cost, stockQty, minStockLevel, unit FROM Item LIMIT 5');
  console.log('Sample Items with stock:', sample.rows);
}

main().catch(console.error);
