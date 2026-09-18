const { createClient } = require('@libsql/client');
const client = createClient({ url: 'file:dev.db' });

async function main() {
  console.log('Simplifying Banana Food item and category names...');

  // 1. Delete imported duplicates
  await client.execute({
    sql: 'DELETE FROM Item WHERE name LIKE ? OR name LIKE ?',
    args: ['%مستورد%', '%فلبيني%'],
  });

  // 2. Rename categories to simple market names
  await client.execute({
    sql: 'UPDATE Category SET name = ? WHERE name LIKE ?',
    args: ['خضار', '%خضار%'],
  });

  await client.execute({
    sql: 'UPDATE Category SET name = ? WHERE name LIKE ?',
    args: ['فاكهة', '%فاكه%'],
  });

  await client.execute({
    sql: 'UPDATE Category SET name = ? WHERE name LIKE ? OR name LIKE ?',
    args: ['خضرة', '%خضرة%', '%ورق%'],
  });

  // 3. Rename items mapping
  const itemRenames = {
    // خضار
    'طماطم بلدي فاخرة': 'طماطم',
    'خيار بلدي طازج': 'خيار',
    'بطاطس تحمير (سيلانة)': 'بطاطس',
    'بصل أحمر كشري': 'بصل أحمر',
    'بصل أبيض بلدي': 'بصل أبيض',
    'ليمون بلدي أخضر': 'ليمون',
    'فلفل رومي بلدي': 'فلفل رومي',
    'فلفل ألوان أحمر وأصفر': 'فلفل ألوان',
    'فلفل حار شطة': 'فلفل حار',
    'كوسة حشو بلدي': 'كوسة',
    'باذنجان رومي قلي': 'باذنجان رومي',
    'باذنجان عروس أسود وأبيض': 'باذنجان عروس',
    'جزر سكري أحمر': 'جزر',
    'كابوتشا خضراء': 'كابوتشا',
    'ثوم بلدي رأس': 'ثوم',
    'بروكلي أخضر طازج': 'بروكلي',
    'بطاطا حلوة منياوية': 'بطاطا',
    'فاصوليا خضراء بلدي': 'فاصوليا',
    'بامية فلاحي ممتازة': 'بامية',
    'قلقاس شتوي': 'قلقاس',
    'بنجر سكري': 'بنجر',
    'قرنبيط طازج': 'قرنبيط',

    // فاكهة
    'موز بلدي فاخر (بانانا فود)': 'موز',
    'تفاح أحمر إيطالي سكري': 'تفاح أحمر',
    'تفاح أصفر لبناني': 'تفاح أصفر',
    'تفاح أخضر أمريكي دايت': 'تفاح أخضر',
    'برتقال بلدي عصير': 'برتقال عصير',
    'برتقال بسرة سكري': 'برتقال بسرة',
    'يوسفي بلدي فاخر': 'يوسفي',
    'فراولة فريش سكرية': 'فراولة',
    'عنب أحمر كريمسون': 'عنب أحمر',
    'عنب بناتي أبيض': 'عنب أبيض',
    'أناناس طبيعي سكري': 'أناناس',
    'مانجو عويس فاخرة': 'مانجو عويس',
    'مانجو زبدية عصير': 'مانجو زبدية',
    'كيوي طازج': 'كيوي',
    'بطيخ أحمر جيزة': 'بطيخ',
    'كانتلوب شهد سكري': 'كانتلوب',
    'خوخ سكري فريش': 'خوخ',
    'رمان منفلوطي أحمر': 'رمان',
    'جوافة بناتي فاخرة': 'جوافة',
    'كمثرى سكرية': 'كمثرى',
    'برقوق أحمر سكري': 'برقوق',
    'أفوكادو هاس مستورد': 'أفوكادو',

    // خضرة
    'بقدونس فلاحي طازج': 'بقدونس',
    'كزبرة خضراء': 'كزبرة',
    'شبت بلدي': 'شبت',
    'جرجير بلدي فريش': 'جرجير',
    'نعناع بلدي عالي الرائحة': 'نعناع',
    'خس بلدي': 'خس',
    'كرفس فرنساوي': 'كرفس',
    'بصل أخضر': 'بصل أخضر',
    'فجل أحمر وأبيض': 'فجل',
  };

  for (const [oldName, newName] of Object.entries(itemRenames)) {
    await client.execute({
      sql: 'UPDATE Item SET name = ? WHERE name = ?',
      args: [newName, oldName],
    });
  }

  // Ensure أفوكادو exists in فاكهة
  const fruitCat = await client.execute({
    sql: 'SELECT id FROM Category WHERE name = ?',
    args: ['فاكهة'],
  });
  if (fruitCat.rows.length > 0) {
    const fruitCatId = fruitCat.rows[0].id;
    const existingAvo = await client.execute({
      sql: 'SELECT id FROM Item WHERE name = ?',
      args: ['أفوكادو'],
    });
    if (existingAvo.rows.length === 0) {
      const crypto = require('crypto');
      await client.execute({
        sql: 'INSERT INTO Item (id, name, price, cost, isActive, categoryId) VALUES (?, ?, ?, ?, 1, ?)',
        args: [crypto.randomUUID(), 'أفوكادو', 120, 0, fruitCatId],
      });
      console.log('Added أفوكادو to فاكهة');
    }
  }

  // Check categories and items count
  const cats = await client.execute('SELECT id, name FROM Category');
  const items = await client.execute('SELECT c.name as category, i.name, i.price FROM Item i JOIN Category c ON i.categoryId = c.id ORDER BY c.name, i.name');
  
  console.log('Categories:', cats.rows);
  console.log(`Total simplified items: ${items.rows.length}`);
}

main().catch(console.error);
