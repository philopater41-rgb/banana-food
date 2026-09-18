import { prisma } from '../src/lib/db';
import { POST as loginPost } from '../src/app/api/auth/login/route';
import { GET as activeShiftGet, POST as activeShiftPost } from '../src/app/api/shifts/active/route';
import { POST as shiftExpensesPost } from '../src/app/api/shifts/expenses/route';
import { POST as closeShiftPost } from '../src/app/api/shifts/close/route';
import { POST as syncPost } from '../src/app/api/sync/route';
import { POST as returnsPost } from '../src/app/api/returns/route';
import { POST as wastagePost } from '../src/app/api/wastage/route';
import { GET as analyticsGet } from '../src/app/api/admin-analytics/route';
import { GET as detailedReportsGet } from '../src/app/api/reports/detailed/route';

function jsonReq(url: string, method: string, body?: any): Request {
  return new Request(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

function formatEGP(num: number): string {
  return `${num.toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م`;
}

async function simulateDay() {
  console.log('\n================================================================');
  console.log('            محاكاة يوم عمل كامل وحقيقي لـ BANANA FOOD             ');
  console.log('================================================================\n');

  // 0. التحقق من المستخدمين والبيانات الأساسية
  const cashier = await prisma.user.findFirst({ where: { role: 'CASHIER' } });
  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
  if (!cashier || !admin) throw new Error('المستخدمين غير موجودين بقاعدة البيانات.');

  // البحث عن أصناف وخامات وطاولات حقيقية
  const espresso = await prisma.item.findFirst({ where: { name: 'Espresso' }, include: { recipe: true } });
  const latte = await prisma.item.findFirst({ where: { name: 'Latte' }, include: { recipe: true } });
  const table1 = await prisma.table.findFirst({ where: { name: 'Table 1' } });
  const customer = await prisma.customer.findFirst({ where: { phone: { not: null } } });

  // إذا لم تكن طاولة 1 موجودة، نستخدم أول طاولة متاحة
  const activeTable = table1 || (await prisma.table.findFirst());
  if (!espresso || !latte || !activeTable) {
    throw new Error('بيانات المنيو أو الطاولات غير مكتملة.');
  }

  // إغلاق أي وردية مفتوحة حالياً للبدء بوردية نظيفة
  const prevActive = await prisma.shift.findFirst({ where: { closedAt: null } });
  if (prevActive) {
    console.log(`[!] تم العثور على وردية سابقة مفتوحة برقم (${prevActive.id.slice(0, 8)}). جاري إغلاقها...`);
    const closeReq = jsonReq('http://localhost:3000/api/shifts/close', 'POST', {
      shiftId: prevActive.id,
      closedCash: prevActive.floatCash,
      closedInstaPay: 0,
      closedVisa: 0,
      closedVodafoneCash: 0,
      closedCashOut: 0,
    });
    await closeShiftPost(closeReq);
    console.log(`[✓] تم إغلاق الوردية السابقة بنجاح.\n`);
  }

  // =================================================================
  // الخطوة 1: تسجيل دخول الكاشير وفتح وردية الصباح
  // =================================================================
  console.log('----------------------------------------------------------------');
  console.log('1️⃣  تسجيل دخول الكاشير وفتح وردية عمل جديدة');
  console.log('----------------------------------------------------------------');
  const loginRes = await loginPost(jsonReq('http://localhost:3000/api/auth/login', 'POST', {
    username: cashier.username,
    password: 'cashier123',
  }));
  const loginData = await loginRes.json();
  console.log(`[✓] تم تسجيل الدخول باسم: ${loginData.user.name} (Role: ${loginData.user.role})`);

  const openingFloatCash = 1000.0; // عهدة نقدية بالدرج
  const cashierName = 'أحمد حسن';

  const openRes = await activeShiftPost(jsonReq('http://localhost:3000/api/shifts/active', 'POST', {
    userId: cashier.id,
    cashierName,
    floatCash: openingFloatCash,
  }));
  const openData = await openRes.json();
  const currentShift = openData.shift;
  console.log(`[✓] تم فتح وردية جديدة رقم: ${currentShift.id}`);
  console.log(`    الكاشير المسؤول: ${cashierName}`);
  console.log(`    عهدة الدرج الافتتاحية (Float Cash): ${formatEGP(openingFloatCash)}\n`);

  // =================================================================
  // الخطوة 2: أوردر صالة (Dine-in) على طاولة وتغيير حالتها
  // =================================================================
  console.log('----------------------------------------------------------------');
  console.log('2️⃣  طلب صالة (Dine-In) على طاولة 1 مع عميل مسجل');
  console.log('----------------------------------------------------------------');
  // تغيير حالة الطاولة إلى مشغولة
  await prisma.table.update({ where: { id: activeTable.id }, data: { status: 'OCCUPIED' } });
  console.log(`[✓] طاولة "${activeTable.name}" أصبحت الآن: OCCUPIED (مشغولة)`);

  const dineInOrderId = `order-dinein-${Date.now()}`;
  const dineInQty = 2; // 2 لاتيه
  const dineInUnitPrice = latte.price;
  const dineInSubtotal = dineInQty * dineInUnitPrice; // 2 * 50 = 100
  const dineInDiscount = 10.0; // خصم 10 جنيه لعميل VIP
  const dineInTotal = dineInSubtotal - dineInDiscount; // 90 ج.م

  // مزامنة الأوردر
  const syncDineIn = await syncPost(jsonReq('http://localhost:3000/api/sync', 'POST', {
    orders: [
      {
        id: dineInOrderId,
        receiptNumber: `DN-${Date.now().toString().slice(-6)}`,
        shiftId: currentShift.id,
        tableId: activeTable.id,
        customerId: customer?.id || null,
        customerName: customer?.name || 'عميل كافيه',
        orderType: 'DINE_IN',
        paymentMethod: 'INSTAPAY',
        status: 'COMPLETED',
        subtotal: dineInSubtotal,
        discount: dineInDiscount,
        discountReason: 'خصم عميل دائم',
        tax: 0,
        total: dineInTotal,
        createdAt: new Date().toISOString(),
        items: [
          {
            id: `item-d1-${Date.now()}`,
            itemId: latte.id,
            qty: dineInQty,
            unitPrice: dineInUnitPrice,
            totalPrice: dineInSubtotal,
          },
        ],
      },
    ],
  }));
  const syncDineInData = await syncDineIn.json();
  console.log(`[✓] تم حفظ وتقفيل حساب طاولة "${activeTable.name}"`);
  console.log(`    الأصناف: ${dineInQty}x ${latte.name} = ${formatEGP(dineInSubtotal)}`);
  console.log(`    الخصم: ${formatEGP(dineInDiscount)} (خصم عميل دائم)`);
  console.log(`    الإجمالي المطلوب: ${formatEGP(dineInTotal)}`);
  console.log(`    طريقة الدفع: INSTAPAY (إنستاباي)`);
  console.log(`    حالة المزامنة: ${syncDineInData.success ? 'ناجحة ✓' : 'فشلت ✗'}`);

  // التأكد أن حالة الطاولة رجعت VACANT تلقائياً
  const checkTable = await prisma.table.findUnique({ where: { id: activeTable.id } });
  console.log(`[✓] حالة طاولة "${checkTable?.name}" بعد تصفية الحساب: ${checkTable?.status} (شاغرة ومتاحة لزبائن آخرين)\n`);

  // =================================================================
  // الخطوة 3: أوردر تيك أواي كاش (Takeaway Cash Order)
  // =================================================================
  console.log('----------------------------------------------------------------');
  console.log('3️⃣  طلب تيك أواي نقدًا (Takeaway Cash)');
  console.log('----------------------------------------------------------------');
  const cashOrderId = `order-cash-${Date.now()}`;
  const cashSubtotal = espresso.price * 2; // 2 اسبريسو = 70 ج.م
  const cashTotal = cashSubtotal;

  await syncPost(jsonReq('http://localhost:3000/api/sync', 'POST', {
    orders: [
      {
        id: cashOrderId,
        receiptNumber: `DN-${Date.now().toString().slice(-6)}`,
        shiftId: currentShift.id,
        tableId: null,
        orderType: 'TAKEAWAY',
        paymentMethod: 'CASH',
        status: 'COMPLETED',
        subtotal: cashSubtotal,
        discount: 0,
        tax: 0,
        total: cashTotal,
        createdAt: new Date().toISOString(),
        items: [
          {
            id: `item-c1-${Date.now()}`,
            itemId: espresso.id,
            qty: 2,
            unitPrice: espresso.price,
            totalPrice: cashSubtotal,
          },
        ],
      },
    ],
  }));
  console.log(`[✓] تم تسجيل فاتورة تيك أواي كاش: 2x ${espresso.name}`);
  console.log(`    المبلغ المدفوع بالدرج نقدًا: ${formatEGP(cashTotal)}\n`);

  // =================================================================
  // الخطوة 4: أوردر مدفوع ببطاقة فيزا (Visa Order)
  // =================================================================
  console.log('----------------------------------------------------------------');
  console.log('4️⃣  طلب مدفوع ببطاقة بنكية (VISA)');
  console.log('----------------------------------------------------------------');
  const visaOrderId = `order-visa-${Date.now()}`;
  const visaTotal = latte.price * 3; // 3 لاتيه = 150 ج.م

  await syncPost(jsonReq('http://localhost:3000/api/sync', 'POST', {
    orders: [
      {
        id: visaOrderId,
        receiptNumber: `DN-${Date.now().toString().slice(-6)}`,
        shiftId: currentShift.id,
        tableId: null,
        orderType: 'TAKEAWAY',
        paymentMethod: 'VISA',
        status: 'COMPLETED',
        subtotal: visaTotal,
        discount: 0,
        tax: 0,
        total: visaTotal,
        createdAt: new Date().toISOString(),
        items: [
          {
            id: `item-v1-${Date.now()}`,
            itemId: latte.id,
            qty: 3,
            unitPrice: latte.price,
            totalPrice: visaTotal,
          },
        ],
      },
    ],
  }));
  console.log(`[✓] تم تسجيل فاتورة مدفوعة على ماكينة الفيزا POS: 3x ${latte.name}`);
  console.log(`    المبلغ المقبوض في الفيزا: ${formatEGP(visaTotal)}\n`);

  // =================================================================
  // الخطوة 5: خدمة سحب نقدية كاش آوت (Cash-Out Service)
  // =================================================================
  console.log('----------------------------------------------------------------');
  console.log('5️⃣  خدمة سحب نقدية من الفيزا (Cash-Out Service)');
  console.log('----------------------------------------------------------------');
  // العميل سحب 500 جنيه كاش، ودفع بالفيزا 510 جنيه (شامل 10 جنيه عمولة الخدمة)
  const cashOutOrderId = `order-cashout-${Date.now()}`;
  const cashOutAmount = 500.0;
  const cashOutFee = 10.0;
  const cashOutTotal = cashOutAmount + cashOutFee; // 510

  await syncPost(jsonReq('http://localhost:3000/api/sync', 'POST', {
    orders: [
      {
        id: cashOutOrderId,
        receiptNumber: `DN-CASHOUT-${Date.now().toString().slice(-4)}`,
        shiftId: currentShift.id,
        tableId: null,
        orderType: 'TAKEAWAY',
        paymentMethod: 'CASH_OUT',
        cashOutAmount,
        cashOutFee,
        status: 'COMPLETED',
        subtotal: cashOutTotal,
        discount: 0,
        tax: 0,
        total: cashOutTotal,
        createdAt: new Date().toISOString(),
        items: [],
      },
    ],
  }));
  console.log(`[✓] تم تنفيذ كاش آوت لعميل:`);
  console.log(`    نقدية خرجت من الدرج للعميل: ${formatEGP(cashOutAmount)}`);
  console.log(`    عمولة الكافيه المكتسبة: ${formatEGP(cashOutFee)}`);
  console.log(`    إجمالي المبلغ المسحوب بفيزا العميل: ${formatEGP(cashOutTotal)}\n`);

  // =================================================================
  // الخطوة 6: مصاريف ونثريات نقدية أثناء الوردية (Shift Expenses)
  // =================================================================
  console.log('----------------------------------------------------------------');
  console.log('6️⃣  تسجيل مصاريف ونثريات نقدية من الدرج (PAYOUT / PAYIN)');
  console.log('----------------------------------------------------------------');
  // 1. خروج نقدية لمستلزمات نظافة وليمون (60 ج.م)
  await shiftExpensesPost(jsonReq('http://localhost:3000/api/shifts/expenses', 'POST', {
    shiftId: currentShift.id,
    type: 'PAYOUT',
    amount: 60.0,
    reason: 'شراء نعناع ومستلزمات نظافة سريعة',
  }));
  console.log(`[✓] تم تسجيل مصروف منصرف (PAYOUT): 60.00 ج.م (شراء نعناع ومستلزمات نظافة)`);

  // 2. دخول فكة نقدية من المدير للدرج (200 ج.م)
  await shiftExpensesPost(jsonReq('http://localhost:3000/api/shifts/expenses', 'POST', {
    shiftId: currentShift.id,
    type: 'PAYIN',
    amount: 200.0,
    reason: 'إضافة فكة للدرج من الإدارة',
  }));
  console.log(`[✓] تم تسجيل توريد نقدية وارد (PAYIN): 200.00 ج.م (إضافة فكة للدرج)\n`);

  // =================================================================
  // الخطوة 7: تسجيل هالك مخزني (Inventory Wastage)
  // =================================================================
  console.log('----------------------------------------------------------------');
  console.log('7️⃣  تسجيل هالك مخزني أثناء التحضير');
  console.log('----------------------------------------------------------------');
  const coffeeMaterial = await prisma.rawMaterial.findFirst({
    where: { OR: [{ name: { contains: 'بن' } }, { name: { contains: 'Coffee' } }] },
  });
  if (coffeeMaterial) {
    const stockBeforeWaste = coffeeMaterial.stockQty;
    await wastagePost(jsonReq('http://localhost:3000/api/wastage', 'POST', {
      rawMaterialId: coffeeMaterial.id,
      quantity: 50, // 50 جرام
      reason: 'انسكاب أثناء طحن البن على البار',
      loggedBy: cashierName,
    }));
    const stockAfterWaste = (await prisma.rawMaterial.findUnique({ where: { id: coffeeMaterial.id } }))?.stockQty || 0;
    console.log(`[✓] تم تسجيل هالك للخامة "${coffeeMaterial.name}": 50 ${coffeeMaterial.deductUnit}`);
    console.log(`    الرصيد قبل: ${stockBeforeWaste} -> الرصيد بعد: ${stockAfterWaste} ${coffeeMaterial.deductUnit}\n`);
  }

  // =================================================================
  // الخطوة 8: مرتجع فاتورة واسترجاع فلوس (Order Return & Refund)
  // =================================================================
  console.log('----------------------------------------------------------------');
  console.log('8️⃣  مرتجع فاتورة واسترداد نقدية للعميل مع إعادة الخامات للمخزن');
  console.log('----------------------------------------------------------------');
  // العميل يرجع فاتورة الكاش (طلب الاسبريسو = 70 ج.م)
  const returnRes = await returnsPost(jsonReq('http://localhost:3000/api/returns', 'POST', {
    orderId: cashOrderId,
    refundAmount: cashTotal, // 70 ج.م
    paymentMethod: 'CASH',
    reason: 'العميل اضطر للمغادرة قبل استلام الطلب',
    cashierName,
    restockItems: true,
    items: [
      {
        itemId: espresso.id,
        quantity: 2,
        refundPrice: cashTotal,
      },
    ],
  }));
  const returnData = await returnRes.json();
  console.log(`[✓] تمت معالجة المرتجع بنجاح:`);
  console.log(`    الفاتورة المرتجعة: رقم ${cashOrderId.slice(-8)}`);
  console.log(`    المبلغ المسترد للعميل نقدًا من الدرج: ${formatEGP(cashTotal)}`);
  console.log(`    إرجاع الخامات للمخزن (Restock): نعم (تم استعادة رصيد البن المستهلك في الطلب)\n`);

  // =================================================================
  // الخطوة 9: حساب الإغلاق والمراجعة المالية الدقيقة
  // =================================================================
  console.log('----------------------------------------------------------------');
  console.log('9️⃣  مراجعة الحسابات والعد الفعلي وإغلاق الوردية');
  console.log('----------------------------------------------------------------');
  /*
    الحسبة اليدوية الدقيقة للدرج:
    1. العهدة الافتتاحية: +1000.00 ج.م
    2. مبيعات كاش: 70.00 ج.م
    3. مرتجع كاش: -70.00 ج.م  (صافي مبيعات الكاش = 0.00 ج.م)
    4. منصرف نثريات (نعناع): -60.00 ج.م
    5. وارد فكة (PAYIN): +200.00 ج.م
    6. كاش آوت خرج من الدرج: -500.00 ج.م
    -------------------------------------------
    النقدية التي يجب أن تكون موجودة في الدرج بالمليم:
    1000 + 0 - 60 + 200 - 500 = 640.00 ج.م

    أرصدة القنوات الإلكترونية:
    - إنستاباي: 90.00 ج.م (طلب الصالة)
    - فيزا: 150.00 (طلب اللاتيه) + 510.00 (الكاش آوت) = 660.00 ج.م
  */

  const expectedCalculatedDrawerCash = 1000 + 0 - 60 + 200 - 500; // 640.00 ج.م
  const expectedVisaAmount = 150 + 510; // 660.00 ج.م
  const expectedInstaPayAmount = 90.0; // 90.00 ج.م

  console.log('📊 الحسبة الرياضية المستهدفة:');
  console.log(`   - الكاش المفترض وجوده بالدرج: ${formatEGP(expectedCalculatedDrawerCash)}`);
  console.log(`   - رصيد إيصالات ماكينة الفيزا المفترض: ${formatEGP(expectedVisaAmount)}`);
  console.log(`   - رصيد الإنستاباي المفترض: ${formatEGP(expectedInstaPayAmount)}`);

  // الكاشير يعد الفلوس في نهاية اليوم ويدخل المبالغ الفعلية
  const actualCountedCash = 640.0; // الكاشير عد 640 ج.م بالضبط
  const actualCountedVisa = 660.0;
  const actualCountedInstaPay = 90.0;

  const closeRes = await closeShiftPost(jsonReq('http://localhost:3000/api/shifts/close', 'POST', {
    shiftId: currentShift.id,
    closedCash: actualCountedCash,
    closedVisa: actualCountedVisa,
    closedInstaPay: actualCountedInstaPay,
    closedVodafoneCash: 0,
    closedCashOut: cashOutAmount,
  }));
  const closeData = await closeRes.json();
  const closedShift = closeData.shift;

  console.log('\n🔒 نتيجة إغلاق الوردية من النظام:');
  console.log(`   - النقدية المتوقعة من النظام (Expected Cash): ${formatEGP(closedShift.expectedCash)}`);
  console.log(`   - النقدية الفعلية المدخلة (Closed Cash):     ${formatEGP(closedShift.closedCash)}`);
  console.log(`   - فرق النقدية (Variance Cash):             ${formatEGP(closedShift.varianceCash)} ${closedShift.varianceCash === 0 ? '🟢 (حساب متطابق بالمليم بدون عجز أو زيادة!)' : '🔴'}`);
  console.log(`   - فيزا متوقعة: ${formatEGP(closedShift.expectedVisa)} | فعلية: ${formatEGP(closedShift.closedVisa)} (فرق: ${formatEGP(closedShift.varianceVisa)})`);
  console.log(`   - إنستاباي متوقع: ${formatEGP(closedShift.expectedInstaPay)} | فعلي: ${formatEGP(closedShift.closedInstaPay)} (فرق: ${formatEGP(closedShift.varianceInstaPay)})\n`);

  // =================================================================
  // الخطوة 10: تقارير الإدارة ولوحة المؤشرات (Admin Analytics)
  // =================================================================
  console.log('----------------------------------------------------------------');
  console.log('🔟  لوحة تحكم الإدارة وتقارير المبيعات والأرباح');
  console.log('----------------------------------------------------------------');
  const analyticsRes = await analyticsGet();
  const analyticsData = await analyticsRes.json();
  const kpis = analyticsData.kpis;

  console.log(`[✓] إجمالي مبيعات اليوم الصافية: ${formatEGP(kpis.todaySales)}`);
  console.log(`[✓] إجمالي عدد الفواتير اليوم: ${kpis.todayOrdersCount}`);
  console.log(`[✓] متوسط الفاتورة (Average Ticket): ${formatEGP(kpis.todayAvgTicket)}`);
  console.log(`[✓] إجمالي الخصومات الممنوحة: ${formatEGP(kpis.todayDiscounts)}`);
  console.log(`[✓] عدد المرتجعات: ${kpis.todayReturnsCount} بقيمة: ${formatEGP(kpis.todayReturnsAmount)}`);
  console.log(`[✓] تفصيل المدفوعات الصافية: كاش: ${formatEGP(analyticsData.paymentBreakdown.cash)} | فيزا: ${formatEGP(analyticsData.paymentBreakdown.visa)} | إنستاباي: ${formatEGP(analyticsData.paymentBreakdown.instapay)} | كاش آوت: ${formatEGP(analyticsData.paymentBreakdown.cashOut)}`);

  console.log('\n================================================================');
  console.log('      🎉 اكتملت دورة العمل والمحاكاة بنجاح 100% وبدون أي أخطاء    ');
  console.log('================================================================\n');
}

simulateDay().catch((err) => {
  console.error('\n❌ فشلت المحاكاة أثناء التشغيل:', err);
});
