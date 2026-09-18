const { createClient } = require('@libsql/client');
const client = createClient({ url: 'file:dev.db' });

// Specific wholesale costs for key Egyptian produce
const knownCosts = {
  'طماطم': 12,
  'خيار': 14,
  'بطاطس': 16,
  'بصل أحمر': 17.5,
  'بصل أبيض': 14,
  'بصل أخضر': 4,
  'أناناس': 65,
  'موز': 20,
  'تفاح أحمر': 52,
  'تفاح أخضر': 60,
  'تفاح أصفر': 48,
  'برتقال بسرة': 14,
  'برتقال عصير': 11.5,
  'ليمون': 24,
  'جزر': 11.5,
  'كوسة': 17,
  'باذنجان رومي': 10.5,
  'باذنجان عروس': 12,
  'فلفل رومي': 15.5,
  'فلفل حار': 19,
  'فلفل ألوان': 35,
  'بقدونس': 3.5,
  'كزبرة': 3.5,
  'شبت': 3.5,
  'جرجير': 3.5,
  'نعناع': 3.5,
  'فجل': 3.5,
  'كابوتشا': 9,
  'بطيخ': 9,
  'كانتلوب': 15,
  'فراولة': 27,
  'مانجو زبدية': 38,
  'مانجو عويس': 62,
  'أفوكادو': 95,
  'كيوي': 54,
  'ثوم': 46,
  'بامية': 31,
  'فاصوليا': 22,
  'بروكلي': 27,
  'قرنبيط': 19,
  'قلقاس': 19,
  'خوخ': 35,
  'برقوق': 46,
  'عنب أحمر': 38,
  'عنب أبيض': 35,
  'جوافة': 19,
  'رمان': 19,
  'يوسفي': 12,
  'بطاطا': 9,
  'بنجر': 13.5,
  'خس': 4.5,
  'كرفس': 6,
  'كمثرى': 35,
};

async function run() {
  const res = await client.execute('SELECT id, name, price, cost FROM Item');
  console.log(`Found ${res.rows.length} items to update...`);

  let updatedCount = 0;
  for (const row of res.rows) {
    const name = String(row.name).trim();
    const price = Number(row.price);
    let cost = Number(row.cost);

    if (cost === 0 || !cost) {
      if (knownCosts[name] !== undefined) {
        cost = knownCosts[name];
      } else {
        // Approximate 25% markup: cost = price / 1.25 rounded to nearest 0.5
        cost = Math.round((price / 1.25) * 2) / 2;
      }

      await client.execute({
        sql: 'UPDATE Item SET cost = ? WHERE id = ?',
        args: [cost, row.id],
      });
      updatedCount++;
      const margin = (((price - cost) / cost) * 100).toFixed(1);
      console.log(`Updated "${name}": Price=${price} ج.م, Cost=${cost} ج.م, Margin=${margin}%`);
    }
  }

  console.log(`Successfully updated ${updatedCount} items with wholesale costs!`);
}

run().catch(console.error);
