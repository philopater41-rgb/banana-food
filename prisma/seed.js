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
  console.log('Seeding BANANA FOOD POS database...');

  // 1. Seed Users
  const users = [
    { username: 'admin', password: hashPassword('admin123'), name: 'إدارة BANANA FOOD', role: 'ADMIN' },
    { username: 'cashier', password: hashPassword('cashier'), name: 'كاشير بانانا فود', role: 'CASHIER' },
    { username: 'hossam', password: hashPassword('hossam'), name: 'حسام', role: 'ADMIN' },
    { username: 'ragheb', password: hashPassword('ragheb'), name: 'راغب', role: 'ADMIN' },
  ];

  for (const u of users) {
    await prisma.user.upsert({
      where: { username: u.username },
      update: { password: u.password, name: u.name, role: u.role, isActive: true },
      create: { username: u.username, password: u.password, name: u.name, role: u.role, isActive: true },
    });
  }
  console.log('Seeded users (admin, cashier, hossam, ragheb).');

  // 2. Seed Categories
  const categoriesData = ['خضار', 'فاكهة', 'خضرة'];
  const categoryMap = {};
  for (const catName of categoriesData) {
    const cat = await prisma.category.upsert({
      where: { name: catName },
      update: { isActive: true },
      create: { name: catName, isActive: true },
    });
    categoryMap[catName] = cat.id;
  }
  console.log('Seeded categories:', Object.keys(categoryMap));

  // 3. Seed Items
  const items = [
    // Vegetables
    { name: 'طماطم', price: 25, cost: 18, stockQty: 50, minStockLevel: 15, unit: 'كجم', cat: 'خضار' },
    { name: 'خيار', price: 18, cost: 14, stockQty: 50, minStockLevel: 15, unit: 'كجم', cat: 'خضار' },
    { name: 'بطاطس', price: 20, cost: 16, stockQty: 50, minStockLevel: 15, unit: 'كجم', cat: 'خضار' },
    { name: 'بصل أحمر', price: 22, cost: 17.5, stockQty: 50, minStockLevel: 15, unit: 'كجم', cat: 'خضار' },
    { name: 'بصل أبيض', price: 18, cost: 14, stockQty: 50, minStockLevel: 15, unit: 'كجم', cat: 'خضار' },
    { name: 'ليمون', price: 30, cost: 24, stockQty: 50, minStockLevel: 10, unit: 'كجم', cat: 'خضار' },
    { name: 'فلفل رومي', price: 20, cost: 15.5, stockQty: 50, minStockLevel: 12, unit: 'كجم', cat: 'خضار' },
    { name: 'فلفل ألوان', price: 45, cost: 35, stockQty: 50, minStockLevel: 15, unit: 'كجم', cat: 'خضار' },
    { name: 'فلفل حار', price: 25, cost: 19, stockQty: 50, minStockLevel: 15, unit: 'كجم', cat: 'خضار' },
    { name: 'كوسة', price: 22, cost: 17, stockQty: 50, minStockLevel: 15, unit: 'كجم', cat: 'خضار' },
    { name: 'باذنجان رومي', price: 15, cost: 11, stockQty: 50, minStockLevel: 12, unit: 'كجم', cat: 'خضار' },
    { name: 'باذنجان عروس', price: 18, cost: 13.5, stockQty: 50, minStockLevel: 10, unit: 'كجم', cat: 'خضار' },
    { name: 'باذنجان أبيض', price: 18, cost: 13.5, stockQty: 50, minStockLevel: 10, unit: 'كجم', cat: 'خضار' },
    { name: 'جزر', price: 15, cost: 11, stockQty: 50, minStockLevel: 12, unit: 'كجم', cat: 'خضار' },
    { name: 'ملوخية طازة', price: 20, cost: 14, stockQty: 50, minStockLevel: 10, unit: 'كجم', cat: 'خضار' },
    { name: 'بامية', price: 40, cost: 31, stockQty: 50, minStockLevel: 8, unit: 'كجم', cat: 'خضار' },
    { name: 'فاصوليا خضراء', price: 35, cost: 27, stockQty: 50, minStockLevel: 10, unit: 'كجم', cat: 'خضار' },
    { name: 'بسلة', price: 35, cost: 26.5, stockQty: 50, minStockLevel: 10, unit: 'كجم', cat: 'خضار' },
    { name: 'قلقاس', price: 30, cost: 23, stockQty: 50, minStockLevel: 10, unit: 'كجم', cat: 'خضار' },
    { name: 'سبانخ', price: 20, cost: 14.5, stockQty: 50, minStockLevel: 10, unit: 'كجم', cat: 'خضار' },
    { name: 'ثوم بلدي', price: 60, cost: 48, stockQty: 50, minStockLevel: 10, unit: 'كجم', cat: 'خضار' },
    { name: 'ثوم صيني', price: 80, cost: 65, stockQty: 50, minStockLevel: 10, unit: 'كجم', cat: 'خضار' },
    { name: 'زنجبيل فريش', price: 120, cost: 95, stockQty: 50, minStockLevel: 5, unit: 'كجم', cat: 'خضار' },
    { name: 'بطاطا حلوة', price: 15, cost: 10.5, stockQty: 50, minStockLevel: 15, unit: 'كجم', cat: 'خضار' },
    { name: 'قرنبيط', price: 25, cost: 18, stockQty: 50, minStockLevel: 10, unit: 'قطعة', cat: 'خضار' },
    { name: 'كرنب محشي', price: 30, cost: 22, stockQty: 50, minStockLevel: 10, unit: 'قطعة', cat: 'خضار' },
    { name: 'كرنب أحمر (سلطة)', price: 25, cost: 18, stockQty: 50, minStockLevel: 8, unit: 'قطعة', cat: 'خضار' },
    { name: 'كرنب أبيض (كول سلو)', price: 25, cost: 18, stockQty: 50, minStockLevel: 8, unit: 'قطعة', cat: 'خضار' },
    { name: 'كابوتشا', price: 20, cost: 14, stockQty: 50, minStockLevel: 10, unit: 'قطعة', cat: 'خضار' },
    { name: 'بروكلي', price: 45, cost: 34, stockQty: 50, minStockLevel: 8, unit: 'كجم', cat: 'خضار' },
    { name: 'مشروم فريش طبق', price: 40, cost: 30, stockQty: 50, minStockLevel: 10, unit: 'طبق', cat: 'خضار' },

    // Fruits
    { name: 'موز بلدي فاخر', price: 25, cost: 19, stockQty: 50, minStockLevel: 20, unit: 'كجم', cat: 'فاكهة' },
    { name: 'موز مستورد', price: 40, cost: 31, stockQty: 50, minStockLevel: 15, unit: 'كجم', cat: 'فاكهة' },
    { name: 'تفاح أحمر سكري', price: 65, cost: 50, stockQty: 50, minStockLevel: 15, unit: 'كجم', cat: 'فاكهة' },
    { name: 'تفاح أصفر لبناني', price: 60, cost: 46, stockQty: 50, minStockLevel: 15, unit: 'كجم', cat: 'فاكهة' },
    { name: 'تفاح أخضر دايت', price: 85, cost: 68, stockQty: 50, minStockLevel: 10, unit: 'كجم', cat: 'فاكهة' },
    { name: 'برتقال بلدي عصير', price: 15, cost: 11, stockQty: 50, minStockLevel: 20, unit: 'كجم', cat: 'فاكهة' },
    { name: 'برتقال بسرة', price: 20, cost: 15, stockQty: 50, minStockLevel: 20, unit: 'كجم', cat: 'فاكهة' },
    { name: 'يوسفي بلدي', price: 18, cost: 13.5, stockQty: 50, minStockLevel: 15, unit: 'كجم', cat: 'فاكهة' },
    { name: 'يوسفي كلمنتينا', price: 22, cost: 16.5, stockQty: 50, minStockLevel: 15, unit: 'كجم', cat: 'فاكهة' },
    { name: 'فراولة فريش', price: 35, cost: 26, stockQty: 50, minStockLevel: 15, unit: 'كجم', cat: 'فاكهة' },
    { name: 'جوافة بناتي', price: 30, cost: 22.5, stockQty: 50, minStockLevel: 15, unit: 'كجم', cat: 'فاكهة' },
    { name: 'رمان سكري', price: 25, cost: 18.5, stockQty: 50, minStockLevel: 15, unit: 'كجم', cat: 'فاكهة' },
    { name: 'مانجو عويس', price: 80, cost: 62, stockQty: 50, minStockLevel: 15, unit: 'كجم', cat: 'فاكهة' },
    { name: 'مانجو كيت', price: 50, cost: 38, stockQty: 50, minStockLevel: 15, unit: 'كجم', cat: 'فاكهة' },
    { name: 'مانجو زبدية عصير', price: 40, cost: 30, stockQty: 50, minStockLevel: 15, unit: 'كجم', cat: 'فاكهة' },
    { name: 'عنب بناتي أحمر', price: 45, cost: 34, stockQty: 50, minStockLevel: 15, unit: 'كجم', cat: 'فاكهة' },
    { name: 'عنب بناتي أصفر', price: 40, cost: 30, stockQty: 50, minStockLevel: 15, unit: 'كجم', cat: 'فاكهة' },
    { name: 'خوخ سكري', price: 35, cost: 26, stockQty: 50, minStockLevel: 15, unit: 'كجم', cat: 'فاكهة' },
    { name: 'مشمش صحراوي', price: 45, cost: 34, stockQty: 50, minStockLevel: 10, unit: 'كجم', cat: 'فاكهة' },
    { name: 'برقوق أحمر', price: 50, cost: 38, stockQty: 50, minStockLevel: 10, unit: 'كجم', cat: 'فاكهة' },
    { name: 'بطيخ جيزة فاخر', price: 15, cost: 10, stockQty: 50, minStockLevel: 20, unit: 'كجم', cat: 'فاكهة' },
    { name: 'كنتالوب سكري', price: 20, cost: 14.5, stockQty: 50, minStockLevel: 15, unit: 'كجم', cat: 'فاكهة' },
    { name: 'أناناس', price: 85, cost: 65, stockQty: 50, minStockLevel: 5, unit: 'قطعة', cat: 'فاكهة' },
    { name: 'كيوي مستورد', price: 110, cost: 88, stockQty: 50, minStockLevel: 8, unit: 'كجم', cat: 'فاكهة' },
    { name: 'أفوكادو هاس', price: 140, cost: 110, stockQty: 50, minStockLevel: 5, unit: 'كجم', cat: 'فاكهة' },

    // Greens / Herbs
    { name: 'شبت بلدي', price: 5, cost: 2.5, stockQty: 50, minStockLevel: 20, unit: 'حزمة', cat: 'خضرة' },
    { name: 'بقدونس بلدي', price: 5, cost: 2.5, stockQty: 50, minStockLevel: 20, unit: 'حزمة', cat: 'خضرة' },
    { name: 'كزبرة خضراء', price: 5, cost: 2.5, stockQty: 50, minStockLevel: 20, unit: 'حزمة', cat: 'خضرة' },
    { name: 'جرجير بلدي طازة', price: 5, cost: 2.5, stockQty: 50, minStockLevel: 20, unit: 'حزمة', cat: 'خضرة' },
    { name: 'فجل أحمر وأبيض', price: 5, cost: 2.5, stockQty: 50, minStockLevel: 20, unit: 'حزمة', cat: 'خضرة' },
    { name: 'نعناع بلدي فريش', price: 7, cost: 3.5, stockQty: 50, minStockLevel: 15, unit: 'حزمة', cat: 'خضرة' },
    { name: 'كرات مصري', price: 5, cost: 2.5, stockQty: 50, minStockLevel: 15, unit: 'حزمة', cat: 'خضرة' },
    { name: 'سلق قلقاس', price: 5, cost: 2.5, stockQty: 50, minStockLevel: 15, unit: 'حزمة', cat: 'خضرة' },
    { name: 'بصل أخضر بلدي', price: 7, cost: 3.5, stockQty: 50, minStockLevel: 15, unit: 'حزمة', cat: 'خضرة' },
    { name: 'روزماري فريش', price: 15, cost: 8, stockQty: 50, minStockLevel: 5, unit: 'حزمة', cat: 'خضرة' },
    { name: 'زعتر أخضر فريش', price: 15, cost: 8, stockQty: 50, minStockLevel: 5, unit: 'حزمة', cat: 'خضرة' },
    { name: 'ريحان إيطالي', price: 12, cost: 6, stockQty: 50, minStockLevel: 5, unit: 'حزمة', cat: 'خضرة' },
  ];

  for (const it of items) {
    const catId = categoryMap[it.cat];
    if (!catId) continue;
    const existing = await prisma.item.findFirst({
      where: { name: it.name, categoryId: catId },
    });
    if (existing) {
      await prisma.item.update({
        where: { id: existing.id },
        data: {
          price: it.price,
          cost: it.cost,
          stockQty: it.stockQty,
          minStockLevel: it.minStockLevel,
          unit: it.unit,
          isActive: true,
        },
      });
    } else {
      await prisma.item.create({
        data: {
          name: it.name,
          price: it.price,
          cost: it.cost,
          stockQty: it.stockQty,
          minStockLevel: it.minStockLevel,
          unit: it.unit,
          categoryId: catId,
          isActive: true,
        },
      });
    }
  }

  console.log(`Successfully seeded ${items.length} Banana Food produce items.`);
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
