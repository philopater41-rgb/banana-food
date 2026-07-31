import 'dotenv/config';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';
import { neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

neonConfig.webSocketConstructor = ws;

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });
const sourcePath = new URL('../.codex-tmp-menu/menu-extraction.json', import.meta.url);
const { pricedItems } = JSON.parse(await fs.readFile(sourcePath, 'utf8'));

const categories = new Map();
for (const item of pricedItems) {
  if (!categories.has(item.category)) categories.set(item.category, []);
  categories.get(item.category).push(item);
}

try {
  await prisma.category.updateMany({ data: { isActive: false } });
  await prisma.item.updateMany({ data: { isActive: false } });

  for (const [categoryName, items] of categories) {
    const category = await prisma.category.upsert({
      where: { name: categoryName },
      update: { isActive: true },
      create: { id: crypto.randomUUID(), name: categoryName, isActive: true },
    });

    for (const item of items) {
      const existing = await prisma.item.findFirst({
        where: { name: item.name, categoryId: category.id },
      });

      if (existing) {
        await prisma.item.update({
          where: { id: existing.id },
          data: { price: item.salePrice, isActive: true },
        });
      } else {
        await prisma.item.create({
          data: {
            id: crypto.randomUUID(),
            name: item.name,
            price: item.salePrice,
            isActive: true,
            categoryId: category.id,
          },
        });
      }
    }
  }

  console.log(`Imported ${pricedItems.length} menu items across ${categories.size} categories.`);
} finally {
  await prisma.$disconnect();
}
