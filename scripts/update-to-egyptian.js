const { createClient } = require('@libsql/client');
const client = createClient({ url: 'file:dev.db' });

async function update() {
  await client.execute({
    sql: 'UPDATE Category SET name = ? WHERE name = ?',
    args: ['خضار طازة', 'خضار طازج'],
  });
  await client.execute({
    sql: 'UPDATE Category SET name = ? WHERE name = ?',
    args: ['فاكهة طازة', 'فاكهة طازجة'],
  });
  await client.execute({
    sql: 'UPDATE Category SET name = ? WHERE name = ?',
    args: ['خضرة وورقيات', 'ورقيات وأعشاب'],
  });

  const cats = await client.execute('SELECT name FROM Category');
  console.log('Current categories:', cats.rows.map(r => r.name));
}

update().catch(console.error);
