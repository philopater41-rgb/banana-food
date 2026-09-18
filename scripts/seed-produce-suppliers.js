const { createClient } = require('@libsql/client');
const client = createClient({ url: 'file:dev.db' });

async function seedSuppliers() {
  try {
    const existing = await client.execute('SELECT COUNT(*) as c FROM Supplier');
    if (existing.rows[0].c === 0) {
      const suppliers = [
        {
          id: 'supp-1',
          name: 'المعلم حنفي رضوان',
          phone: '01012345678',
          companyName: 'وكالة سوق العبور (عنبر 3)',
          address: 'سوق العبور المركزي - جناح الخضار',
          notes: 'مورد طماطم وخيار وفلفل وكوسة جملة'
        },
        {
          id: 'supp-2',
          name: 'مزارع الصالحية والبحيرة',
          phone: '01123456789',
          companyName: 'مزارع الصالحية للتوريدات الزراعية',
          address: 'طريق مصر إسكندرية الصحراوي',
          notes: 'توريد شكاير بطاطس تحمير وبصل وجزر وثوم'
        },
        {
          id: 'supp-3',
          name: 'وكالة الواحة للفواكه',
          phone: '01234567890',
          companyName: 'سوق الجملة المركزي 6 أكتوبر',
          address: 'سوق 6 أكتوبر - قطاع الفواكه',
          notes: 'موز صومالي وبلدي وتفاح ومانجو كراتين'
        }
      ];

      for (const s of suppliers) {
        await client.execute({
          sql: "INSERT INTO Supplier (id, name, phone, companyName, address, notes, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))",
          args: [s.id, s.name, s.phone, s.companyName, s.address, s.notes]
        });
      }
      console.log('Seeded 3 produce suppliers successfully!');
    } else {
      console.log('Suppliers already exist:', existing.rows[0].c);
    }
  } catch (err) {
    console.error('Seed error:', err);
  }
}

seedSuppliers();
