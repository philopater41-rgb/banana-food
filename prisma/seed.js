require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { PrismaNeon } = require('@prisma/adapter-neon');
const { neonConfig } = require('@neondatabase/serverless');
const ws = require('ws');
const crypto = require('crypto');

neonConfig.webSocketConstructor = ws;

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

async function main() {
  console.log('Starting seeding...');

  // 1. Clean old data (in reverse dependency order)
  await prisma.userLog.deleteMany({});
  await prisma.wastageLog.deleteMany({});
  await prisma.salesOrderItemModifier.deleteMany({});
  await prisma.salesOrderItem.deleteMany({});
  await prisma.salesOrder.deleteMany({});
  await prisma.cashTransaction.deleteMany({});
  await prisma.shift.deleteMany({});
  await prisma.table.deleteMany({});
  await prisma.hall.deleteMany({});
  await prisma.recipeModifier.deleteMany({});
  await prisma.recipe.deleteMany({});
  await prisma.rawMaterial.deleteMany({});
  await prisma.modifier.deleteMany({});
  await prisma.item.deleteMany({});
  await prisma.category.deleteMany({});
  await prisma.user.deleteMany({});

  // 2. Create Users
  const adminPassword = hashPassword('admin123');
  const cashierPassword = hashPassword('cashier123');

  const admin = await prisma.user.create({
    data: {
      username: 'admin',
      password: adminPassword,
      name: 'إدارة BANANA FOOD',
      role: 'ADMIN',
    },
  });

  const cashier = await prisma.user.create({
    data: {
      username: 'cashier',
      password: cashierPassword,
      name: 'Sherif Cashier',
      role: 'CASHIER',
    },
  });

  console.log('Seeded users.');

  // 3. Create Halls & Tables
  const mainHall = await prisma.hall.create({
    data: { name: 'Main Hall' },
  });

  const terrace = await prisma.hall.create({
    data: { name: 'Terrace (Outdoor)' },
  });

  await prisma.table.createMany({
    data: [
      { name: 'Table 1', hallId: mainHall.id, status: 'VACANT' },
      { name: 'Table 2', hallId: mainHall.id, status: 'VACANT' },
      { name: 'Table 3', hallId: mainHall.id, status: 'VACANT' },
      { name: 'Table 4', hallId: mainHall.id, status: 'VACANT' },
      { name: 'Table 11 (Bar)', hallId: mainHall.id, status: 'VACANT' },
      { name: 'Table T1', hallId: terrace.id, status: 'VACANT' },
      { name: 'Table T2', hallId: terrace.id, status: 'VACANT' },
      { name: 'Table T3', hallId: terrace.id, status: 'VACANT' },
    ],
  });

  console.log('Seeded halls and tables.');

  // 4. Create Categories & Items
  const coffeeCat = await prisma.category.create({ data: { name: 'Hot Coffee' } });
  const coldCat = await prisma.category.create({ data: { name: 'Cold Drinks' } });
  const bakeryCat = await prisma.category.create({ data: { name: 'Bakery & Sweets' } });

  // Items
  const espresso = await prisma.item.create({
    data: { name: 'Espresso', price: 35.0, categoryId: coffeeCat.id },
  });
  const latte = await prisma.item.create({
    data: { name: 'Latte', price: 50.0, categoryId: coffeeCat.id },
  });
  const cappucino = await prisma.item.create({
    data: { name: 'Cappuccino', price: 55.0, categoryId: coffeeCat.id },
  });
  const mojito = await prisma.item.create({
    data: { name: 'Mojito (Mint)', price: 45.0, categoryId: coldCat.id },
  });
  const icedSpanish = await prisma.item.create({
    data: { name: 'Iced Spanish Latte', price: 65.0, categoryId: coldCat.id },
  });
  const croissant = await prisma.item.create({
    data: { name: 'Butter Croissant', price: 40.0, categoryId: bakeryCat.id },
  });
  const chocoCroissant = await prisma.item.create({
    data: { name: 'Chocolate Croissant', price: 48.0, categoryId: bakeryCat.id },
  });

  console.log('Seeded categories and items.');

  // 5. Create Modifiers
  const extraShot = await prisma.modifier.create({
    data: { name: 'Extra Espresso Shot', priceImpact: 15.0 },
  });
  const almondMilk = await prisma.modifier.create({
    data: { name: 'Almond Milk swap', priceImpact: 20.0 },
  });
  const extraCaramel = await prisma.modifier.create({
    data: { name: 'Caramel Syrup', priceImpact: 10.0 },
  });

  console.log('Seeded modifiers.');

  // 6. Create Raw Materials (Inventory)
  const coffeeBeans = await prisma.rawMaterial.create({
    data: {
      name: 'Espresso Coffee Beans',
      stockQty: 5000, // 5000g = 5kg
      minStockLevel: 1000, // 1000g = 1kg alert
      purchaseUnit: 'kg',
      deductUnit: 'g',
      conversionFactor: 1000,
    },
  });

  const milk = await prisma.rawMaterial.create({
    data: {
      name: 'Full Cream Milk',
      stockQty: 12000, // 12000ml = 12 Liters
      minStockLevel: 3000, // 3 Liters alert
      purchaseUnit: 'liter',
      deductUnit: 'ml',
      conversionFactor: 1000,
    },
  });

  const almondMilkRaw = await prisma.rawMaterial.create({
    data: {
      name: 'Almond Milk Pack',
      stockQty: 4000, // 4 Liters
      minStockLevel: 1000,
      purchaseUnit: 'liter',
      deductUnit: 'ml',
      conversionFactor: 1000,
    },
  });

  const sugar = await prisma.rawMaterial.create({
    data: {
      name: 'White Sugar',
      stockQty: 10000, // 10kg
      minStockLevel: 2000,
      purchaseUnit: 'kg',
      deductUnit: 'g',
      conversionFactor: 1000,
    },
  });

  const rawCroissant = await prisma.rawMaterial.create({
    data: {
      name: 'Frozen Croissant (Raw)',
      stockQty: 50,
      minStockLevel: 15,
      purchaseUnit: 'box (25pcs)',
      deductUnit: 'unit',
      conversionFactor: 25,
    },
  });

  const chocSyrup = await prisma.rawMaterial.create({
    data: {
      name: 'Chocolate Syrup',
      stockQty: 2000, // 2L
      minStockLevel: 500,
      purchaseUnit: 'bottle (1L)',
      deductUnit: 'ml',
      conversionFactor: 1000,
    },
  });

  console.log('Seeded raw materials.');

  // 7. Create Recipes (BOM)
  // Espresso: 18g coffee beans
  await prisma.recipe.create({
    data: { itemId: espresso.id, rawMaterialId: coffeeBeans.id, quantity: 18 },
  });

  // Latte: 18g coffee beans + 150ml milk
  await prisma.recipe.create({
    data: { itemId: latte.id, rawMaterialId: coffeeBeans.id, quantity: 18 },
  });
  await prisma.recipe.create({
    data: { itemId: latte.id, rawMaterialId: milk.id, quantity: 150 },
  });

  // Cappuccino: 18g coffee beans + 180ml milk
  await prisma.recipe.create({
    data: { itemId: cappucino.id, rawMaterialId: coffeeBeans.id, quantity: 18 },
  });
  await prisma.recipe.create({
    data: { itemId: cappucino.id, rawMaterialId: milk.id, quantity: 180 },
  });

  // Iced Spanish Latte: 18g coffee beans + 150ml milk + 20g sugar
  await prisma.recipe.create({
    data: { itemId: icedSpanish.id, rawMaterialId: coffeeBeans.id, quantity: 18 },
  });
  await prisma.recipe.create({
    data: { itemId: icedSpanish.id, rawMaterialId: milk.id, quantity: 150 },
  });
  await prisma.recipe.create({
    data: { itemId: icedSpanish.id, rawMaterialId: sugar.id, quantity: 20 },
  });

  // Butter Croissant: 1 unit frozen croissant
  await prisma.recipe.create({
    data: { itemId: croissant.id, rawMaterialId: rawCroissant.id, quantity: 1 },
  });

  // Chocolate Croissant: 1 unit frozen croissant + 15ml chocolate syrup
  await prisma.recipe.create({
    data: { itemId: chocoCroissant.id, rawMaterialId: rawCroissant.id, quantity: 1 },
  });
  await prisma.recipe.create({
    data: { itemId: chocoCroissant.id, rawMaterialId: chocSyrup.id, quantity: 15 },
  });

  // Modifier Recipes
  // Extra shot: 9g coffee beans
  await prisma.recipeModifier.create({
    data: { modifierId: extraShot.id, rawMaterialId: coffeeBeans.id, quantity: 9 },
  });

  // Almond milk: swaps 150ml normal milk with 150ml almond milk (for simplicity, we just deduct 150ml almond milk)
  await prisma.recipeModifier.create({
    data: { modifierId: almondMilk.id, rawMaterialId: almondMilkRaw.id, quantity: 150 },
  });

  console.log('Seeded recipes.');
  console.log('Seeding finished successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
