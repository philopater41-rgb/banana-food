import 'dotenv/config';
import fs from 'node:fs/promises';
import { PrismaClient } from '@prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';
import { neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

neonConfig.webSocketConstructor = ws;

const prisma = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL }),
});
const sourcePath = new URL('../.codex-tmp-menu/menu-extraction.json', import.meta.url);
const { pricedItems } = JSON.parse(await fs.readFile(sourcePath, 'utf8'));
const applyChanges = process.argv.includes('--apply');

const aliases = new Map([
  ['بودر شوكليت', 'بودرة شوكولاتة'],
  ['بودرشوكليت', 'بودرة شوكولاتة'],
  ['شوكليت دارك', 'صوص شوكولاتة دارك'],
  ['دارك شوكليت', 'صوص شوكولاتة دارك'],
  ['وايت شوكليت', 'صوص وايت شوكولاتة'],
  ['فستق اسبريد', 'سبريد فستق'],
  ['صبوص بستاشيو', 'صوص بستاشيو'],
  ['عصير فراوله', 'عصير فراولة'],
  ['توبينج فراوله', 'توبينج فراولة'],
  ['فراوله', 'فراولة'],
  ['قرفه', 'قرفة'],
  ['بودر ماتشا', 'بودرة ماتشا'],
  ['ايس فانيليا', 'آيس كريم فانيليا'],
  ['ليمونه', 'ليمون'],
  ['ليمون بلدي', 'ليمون'],
  ['بن', 'بن إسبريسو'],
  ['بن قهوه', 'بن إسبريسو'],
  ['قهوه', 'بن إسبريسو'],
]);

const ignored = /^(فوم|ثلج كيوبس|ثلج|يقدم في|من اختيار العميل|اختيار العميل|كلاسيك|طعم اخر|اسليز|سليز|جرنش|نصف قطعه|ويتم النزول)/i;
const pieceNames = /^(ليمون(?:ه)?|كيوي|افوكادو|موز|عود نعناع|نعناع|باكت شاي|كان سفن|كان ريدبل|كان تويست)$/;

function cleanText(value) {
  return value
    .replace(/[()،,.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function canonicalName(value) {
  const cleaned = cleanText(value)
    .replace(/^من /, '')
    .replace(/\b(فريش|ساده)\b/g, '')
    .trim();
  return aliases.get(cleaned) || cleaned;
}

function ingredient(name, quantity, unit) {
  const materialName = canonicalName(name);
  if (!materialName || materialName.startsWith('=') || ignored.test(materialName) || quantity <= 0) return null;
  return { materialName, quantity, unit };
}

function parseSegment(rawSegment) {
  const segment = cleanText(rawSegment)
    .replace(/ملي/g, 'مل')
    .replace(/جرام/g, 'جم')
    .replace(/حبه/g, 'حبة')
    .replace(/قطعه/g, 'قطعة');
  if (!segment || ignored.test(segment)) return [];

  if (/^سنجل شوت/.test(segment)) return [ingredient('بن إسبريسو', 8, 'جم')].filter(Boolean);
  if (/^دبل شوت/.test(segment)) return [ingredient('بن إسبريسو', 16, 'جم')].filter(Boolean);

  const canMatch = segment.match(/^كان\s+(.+)$/);
  if (canMatch) return [ingredient(canMatch[1], 1, 'كان')].filter(Boolean);

  const measured = segment.match(/^(\d+(?:\.\d+)?)\s*(جم|مل|عود|باكت|ورقة|اوراق|قطعة|حبة|صباع|علبة|بوله)\s*(.+)$/);
  if (measured) {
    const [, qty, rawUnit, name] = measured;
    const unitMap = { اوراق: 'ورقة', بوله: 'بولة' };
    return [ingredient(name, Number(qty), unitMap[rawUnit] || rawUnit)].filter(Boolean);
  }

  const trailingMeasured = segment.match(/^(.+?)\s+(\d+(?:\.\d+)?)\s*(جم|مل)$/);
  if (trailingMeasured) {
    const [, name, qty, unit] = trailingMeasured;
    return [ingredient(name, Number(qty), unit)].filter(Boolean);
  }

  const numberedPiece = segment.match(/^(\d+)\s+(.+)$/);
  if (numberedPiece && pieceNames.test(numberedPiece[2])) {
    return [ingredient(numberedPiece[2], Number(numberedPiece[1]), 'قطعة')].filter(Boolean);
  }

  return [];
}

function parseRecipe(description) {
  if (!description) return [];
  const normalized = cleanText(description.replace(/[-–]/g, ' '))
    .replace(/ملي/g, 'مل')
    .replace(/جرام/g, 'جم')
    .replace(/حبه/g, 'حبة')
    .replace(/قطعه/g, 'قطعة')
    .replace(/علبه/g, 'علبة');
  const parsed = [];
  const measurePattern = /(\d+(?:\.\d+)?)\s*(جم|مل|عود|باكت|ورقة|اوراق|قطعة|قطع|حبة|صباع|علبة|بوله|بولة)\s*(.*?)(?=\s*\d+(?:\.\d+)?\s*(?:جم|مل|عود|باكت|ورقة|اوراق|قطعة|قطع|حبة|صباع|علبة|بوله|بولة)|$)/g;
  const unitMap = { اوراق: 'ورقة', قطع: 'قطعة', بوله: 'بولة' };
  for (const match of normalized.matchAll(measurePattern)) {
    const name = cleanText(match[3])
      .replace(/(يقدم|تقدم|تلت|فوم|جرنش|في الكاس|في الايرش|سنجل شوت|دبل شوت|شوت اسبرسو|كان|ثلج|اسليز|سليز|صباع|بوله|حبة|عود).*$/i, '')
      .replace(/\s+(سفن|تويست|ريدبل)$/i, '')
      .replace(/\s+\d+\s+.*$/, '')
      .trim();
    const entry = ingredient(name, Number(match[1]), unitMap[match[2]] || match[2]);
    if (entry) parsed.push(entry);
  }

  for (const match of normalized.matchAll(/(\d+)\s*(ليمون(?:ه)?|كيوي|افوكادو|موز|بلح)/g)) {
    const entry = ingredient(match[2], Number(match[1]), 'قطعة');
    if (entry) parsed.push(entry);
  }
  for (const match of normalized.matchAll(/كان\s+(سفن|ريدبل|تويست)/g)) {
    const entry = ingredient(match[1], 1, 'كان');
    if (entry) parsed.push(entry);
  }
  for (const _match of normalized.matchAll(/سنجل شوت/g)) parsed.push(ingredient('بن إسبريسو', 8, 'جم'));
  for (const _match of normalized.matchAll(/دبل شوت/g)) parsed.push(ingredient('بن إسبريسو', 16, 'جم'));
  for (const match of normalized.matchAll(/بوله\s+ايس(?:\s+فانيليا)?\s+(\d+)\s*جم/g)) {
    parsed.push(ingredient('آيس كريم فانيليا', Number(match[1]), 'جم'));
  }
  const merged = new Map();
  for (const entry of parsed) {
    const key = `${entry.materialName}|${entry.unit}`;
    merged.set(key, { ...entry, quantity: (merged.get(key)?.quantity || 0) + entry.quantity });
  }
  return [...merged.values()];
}

const espressoDefaults = new Map([
  ['ابرسو', [ingredient('بن إسبريسو', 8, 'جم')]],
  ['اسبرسو دبل', [ingredient('بن إسبريسو', 16, 'جم')]],
]);
const parsedRecipes = pricedItems.map((item) => ({
  ...item,
  ingredients: parseRecipe(item.ingredients).length > 0
    ? parseRecipe(item.ingredients)
    : (espressoDefaults.get(item.name) || []),
}));
const usableRecipes = parsedRecipes.filter((item) => item.ingredients.length > 0);
const skippedRecipes = parsedRecipes.filter((item) => item.ingredients.length === 0);

if (!applyChanges) {
  console.log(JSON.stringify({
    recipesReady: usableRecipes.length,
    recipesWithoutMeasurableIngredients: skippedRecipes.map(({ name, category }) => ({ name, category })),
    rawMaterialsPreview: [...new Set(usableRecipes.flatMap((item) => item.ingredients.map((entry) => entry.materialName)))],
  }, null, 2));
  await prisma.$disconnect();
  process.exit(0);
}

try {
  const materialCache = new Map();
  const findMaterial = async (entry) => {
    const cacheKey = `${entry.materialName}|${entry.unit}`;
    if (materialCache.has(cacheKey)) return materialCache.get(cacheKey);
    const material = await prisma.rawMaterial.upsert({
      where: { name: entry.materialName },
      update: {},
      create: {
        name: entry.materialName,
        stockQty: 0,
        minStockLevel: 0,
        purchaseUnit: entry.unit,
        deductUnit: entry.unit,
        conversionFactor: 1,
      },
    });
    materialCache.set(cacheKey, material);
    return material;
  };

  for (const recipe of usableRecipes) {
    const item = await prisma.item.findFirst({
      where: { name: recipe.name, category: { name: recipe.category } },
    });
    if (!item) continue;

    const ingredients = await Promise.all(recipe.ingredients.map(async (entry) => ({
      rawMaterialId: (await findMaterial(entry)).id,
      quantity: entry.quantity,
    })));

    await prisma.$transaction([
      prisma.recipe.deleteMany({ where: { itemId: item.id } }),
      prisma.recipe.createMany({ data: ingredients.map((entry) => ({ itemId: item.id, ...entry })) }),
    ]);
  }

  console.log(`Imported ${usableRecipes.length} measurable recipes and created or reused ${materialCache.size} raw materials.`);
} finally {
  await prisma.$disconnect();
}
