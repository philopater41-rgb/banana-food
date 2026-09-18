const { createClient } = require('@libsql/client');
const crypto = require('crypto');

const client = createClient({ url: 'file:dev.db' });

function generateUUID() {
  return crypto.randomUUID();
}

async function main() {
  console.log('Starting reset to Banana Food...');

  // 1. Delete all old operational data (orders, returns, purchases, recipes, old materials)
  await client.execute('DELETE FROM SalesOrderItemModifier');
  await client.execute('DELETE FROM SalesOrderItem');
  await client.execute('DELETE FROM OrderReturnItem');
  await client.execute('DELETE FROM OrderReturn');
  await client.execute('DELETE FROM SalesOrder');
  await client.execute('DELETE FROM PurchaseInvoiceItem');
  await client.execute('DELETE FROM PurchaseInvoice');
  await client.execute('DELETE FROM RecipeModifier');
  await client.execute('DELETE FROM Recipe');
  await client.execute('DELETE FROM Modifier');
  await client.execute('DELETE FROM WastageLog');
  await client.execute('DELETE FROM RestockLog');
  await client.execute('DELETE FROM RawMaterial');
  await client.execute('DELETE FROM CashTransaction');
  await client.execute('DELETE FROM Item');
  await client.execute('DELETE FROM Category');

  console.log('Cleaned old cafe items, purchases, and raw materials.');

  // 2. Insert Banana Food Categories
  const vegCatId = generateUUID();
  const fruitCatId = generateUUID();
  const greensCatId = generateUUID();

  await client.execute({
    sql: 'INSERT INTO Category (id, name, isActive) VALUES (?, ?, 1)',
    args: [vegCatId, 'خضار'],
  });

  await client.execute({
    sql: 'INSERT INTO Category (id, name, isActive) VALUES (?, ?, 1)',
    args: [fruitCatId, 'فاكهة'],
  });

  await client.execute({
    sql: 'INSERT INTO Category (id, name, isActive) VALUES (?, ?, 1)',
    args: [greensCatId, 'خضرة'],
  });

  console.log('Created Banana Food categories.');

  // 3. Insert Vegetables (خضار)
  const vegetables = [
    { name: 'طماطم', price: 15.0 },
    { name: 'خيار', price: 18.0 },
    { name: 'بطاطس', price: 20.0 },
    { name: 'بصل أحمر', price: 22.0 },
    { name: 'بصل أبيض', price: 18.0 },
    { name: 'ليمون', price: 30.0 },
    { name: 'فلفل رومي', price: 20.0 },
    { name: 'فلفل ألوان', price: 45.0 },
    { name: 'فلفل حار', price: 25.0 },
    { name: 'كوسة', price: 22.0 },
    { name: 'باذنجان رومي', price: 14.0 },
    { name: 'باذنجان عروس', price: 16.0 },
    { name: 'جزر', price: 15.0 },
    { name: 'كابوتشا', price: 12.0 },
    { name: 'ثوم', price: 60.0 },
    { name: 'بروكلي', price: 35.0 },
    { name: 'بطاطا', price: 12.0 },
    { name: 'فاصوليا', price: 28.0 },
    { name: 'بامية', price: 40.0 },
    { name: 'قلقاس', price: 25.0 },
    { name: 'بنجر', price: 18.0 },
    { name: 'قرنبيط', price: 25.0 },
  ];

  for (const veg of vegetables) {
    await client.execute({
      sql: 'INSERT INTO Item (id, name, price, cost, isActive, categoryId) VALUES (?, ?, ?, ?, 1, ?)',
      args: [generateUUID(), veg.name, veg.price, 0, vegCatId],
    });
  }

  // 4. Insert Fruits (فاكهة)
  const fruits = [
    { name: 'موز', price: 25.0 },
    { name: 'تفاح أحمر', price: 65.0 },
    { name: 'تفاح أصفر', price: 60.0 },
    { name: 'تفاح أخضر', price: 75.0 },
    { name: 'برتقال عصير', price: 15.0 },
    { name: 'برتقال بسرة', price: 18.0 },
    { name: 'يوسفي', price: 16.0 },
    { name: 'فراولة', price: 35.0 },
    { name: 'عنب أحمر', price: 50.0 },
    { name: 'عنب أبيض', price: 45.0 },
    { name: 'أناناس', price: 85.0 },
    { name: 'مانجو عويس', price: 80.0 },
    { name: 'مانجو زبدية', price: 50.0 },
    { name: 'كيوي', price: 70.0 },
    { name: 'بطيخ', price: 12.0 },
    { name: 'كانتلوب', price: 20.0 },
    { name: 'خوخ', price: 45.0 },
    { name: 'رمان', price: 25.0 },
    { name: 'جوافة', price: 25.0 },
    { name: 'كمثرى', price: 45.0 },
    { name: 'برقوق', price: 60.0 },
    { name: 'أفوكادو', price: 120.0 },
  ];

  for (const fruit of fruits) {
    await client.execute({
      sql: 'INSERT INTO Item (id, name, price, cost, isActive, categoryId) VALUES (?, ?, ?, ?, 1, ?)',
      args: [generateUUID(), fruit.name, fruit.price, 0, fruitCatId],
    });
  }

  // 5. Insert Greens (خضرة)
  const greens = [
    { name: 'بقدونس', price: 5.0 },
    { name: 'كزبرة', price: 5.0 },
    { name: 'شبت', price: 5.0 },
    { name: 'جرجير', price: 5.0 },
    { name: 'نعناع', price: 5.0 },
    { name: 'خس', price: 6.0 },
    { name: 'كرفس', price: 8.0 },
    { name: 'بصل أخضر', price: 6.0 },
    { name: 'فجل', price: 5.0 },
  ];

  for (const green of greens) {
    await client.execute({
      sql: 'INSERT INTO Item (id, name, price, cost, isActive, categoryId) VALUES (?, ?, ?, ?, 1, ?)',
      args: [generateUUID(), green.name, green.price, 0, greensCatId],
    });
  }

  // 6. Ensure default discount reasons
  await client.execute('DELETE FROM DiscountReason');
  const reasons = [
    { reason: 'خصم كميات وجملة', rate: 10 },
    { reason: 'فرز أو تالف', rate: 15 },
    { reason: 'خصم خاص / مجاملة', rate: 10 },
    { reason: 'عرض اليوم الترويجي', rate: 5 },
  ];
  for (const r of reasons) {
    await client.execute({
      sql: 'INSERT INTO DiscountReason (id, reason, rate) VALUES (?, ?, ?)',
      args: [generateUUID(), r.reason, r.rate],
    });
  }

  // 7. Ensure active shift exists
  const activeShift = await client.execute('SELECT * FROM Shift WHERE closedAt IS NULL LIMIT 1');
  if (activeShift.rows.length === 0) {
    const adminUser = await client.execute('SELECT id, name FROM User WHERE role = "ADMIN" LIMIT 1');
    const userId = adminUser.rows.length > 0 ? adminUser.rows[0].id : generateUUID();
    const shiftId = generateUUID();
    await client.execute({
      sql: 'INSERT INTO Shift (id, userId, cashierName, openedAt, floatCash, expectedCash, expectedInstaPay, expectedVisa, expectedVodafoneCash, expectedCashOut, varianceCash, varianceInstaPay, varianceVisa, varianceVodafoneCash) VALUES (?, ?, ?, ?, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0)',
      args: [shiftId, userId, 'كاشير بانانا فود', new Date().toISOString()],
    });
    console.log('Created fresh active shift for Banana Food.');
  } else {
    // Update active shift cashier name
    await client.execute({
      sql: 'UPDATE Shift SET cashierName = ? WHERE closedAt IS NULL',
      args: ['كاشير بانانا فود'],
    });
    console.log('Updated existing shift to Banana Food.');
  }

  console.log(`Success! Inserted ${vegetables.length} vegetables, ${fruits.length} fruits, and ${greens.length} greens.`);
}

main().catch(err => {
  console.error('Failed to reset to Banana Food:', err);
  process.exit(1);
});
