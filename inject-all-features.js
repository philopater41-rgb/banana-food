const fs = require('fs');
const path = require('path');

const adminPath = path.join(__dirname, 'src', 'app', 'admin', 'page.tsx');
let content = fs.readFileSync(adminPath, 'utf8');

// 1. Check & Add CashTransactionItem interface
if (!content.includes('interface CashTransactionItem')) {
  const attendanceInterface = `interface AttendanceRecord { id: string; employeeName: string; checkedInAt: string; checkedOutAt: string | null; }`;
  const cashTxInterface = `interface AttendanceRecord { id: string; employeeName: string; checkedInAt: string; checkedOutAt: string | null; }

interface CashTransactionItem {
  id: string;
  shiftId: string;
  type: string;
  amount: number;
  reason: string;
  createdAt: string;
  cashierName: string;
}`;
  content = content.replace(attendanceInterface, cashTxInterface);
}

// 2. Check & Update activeTab state
if (!content.includes("'expenses'")) {
  content = content.replace(
    "const [activeTab, setActiveTab] = useState<'dashboard' | 'inventory' | 'recipes'>('dashboard');",
    "const [activeTab, setActiveTab] = useState<'dashboard' | 'inventory' | 'recipes' | 'expenses'>('dashboard');\n  const [cashTransactions, setCashTransactions] = useState<CashTransactionItem[]>([]);\n  const [expenseSearch, setExpenseSearch] = useState('');\n  const [expenseFilterType, setExpenseFilterType] = useState<'ALL' | 'PAYOUTS' | 'RESTOCKS'>('ALL');"
  );
} else if (!content.includes('cashTransactions')) {
  content = content.replace(
    "const [todayLabel, setTodayLabel] = useState('');",
    "const [todayLabel, setTodayLabel] = useState('');\n  const [cashTransactions, setCashTransactions] = useState<CashTransactionItem[]>([]);\n  const [expenseSearch, setExpenseSearch] = useState('');\n  const [expenseFilterType, setExpenseFilterType] = useState<'ALL' | 'PAYOUTS' | 'RESTOCKS'>('ALL');"
  );
}

// 3. Check & Update fetchAnalytics to load cashTransactions
if (!content.includes('setCashTransactions(')) {
  content = content.replace(
    "setShiftSummaries(data.shiftSummaries);",
    "setShiftSummaries(data.shiftSummaries);\n        setCashTransactions(data.cashTransactions || []);"
  );
}

// 4. Add Expenses Button to Mobile Sidebar
const mobileRecipesBtn = `<button
                  onClick={() => { setActiveTab('recipes'); setShowMobileSidebar(false); }}
                  className={\`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-semibold transition-all flex-row-reverse \${
                    activeTab === 'recipes'
                      ? 'bg-cyan-500/15 text-cyan-400 border-r-4 border-cyan-500'
                      : 'text-gray-400 hover:bg-white/5 hover:text-white'
                  }\`}
                >
                  <RefreshCw className="w-4 h-4 shrink-0" />
                  <span className="w-full text-right">وصفات الأصناف</span>
                </button>`;

const mobileExpensesBtn = `<button
                  onClick={() => { setActiveTab('recipes'); setShowMobileSidebar(false); }}
                  className={\`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-semibold transition-all flex-row-reverse \${
                    activeTab === 'recipes'
                      ? 'bg-cyan-500/15 text-cyan-400 border-r-4 border-cyan-500'
                      : 'text-gray-400 hover:bg-white/5 hover:text-white'
                  }\`}
                >
                  <RefreshCw className="w-4 h-4 shrink-0" />
                  <span className="w-full text-right">وصفات الأصناف</span>
                </button>

                <button
                  onClick={() => { setActiveTab('expenses'); setShowMobileSidebar(false); }}
                  className={\`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-semibold transition-all flex-row-reverse \${
                    activeTab === 'expenses'
                      ? 'bg-cyan-500/15 text-cyan-400 border-r-4 border-cyan-500'
                      : 'text-gray-400 hover:bg-white/5 hover:text-white'
                  }\`}
                >
                  <DollarSign className="w-4 h-4 shrink-0" />
                  <span className="w-full text-right">سجل المصروفات والمسحوبات</span>
                </button>`;

if (!content.includes("onClick={() => { setActiveTab('expenses'); setShowMobileSidebar(false); }}")) {
  content = content.replace(mobileRecipesBtn, mobileExpensesBtn);
}

// 5. Add Expenses Button to Desktop Sidebar
const desktopRecipesBtn = `<button
              onClick={() => setActiveTab('recipes')}
              className={\`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-semibold transition-all flex-row-reverse \${
                activeTab === 'recipes'
                  ? 'bg-cyan-500/15 text-cyan-400 border-r-4 border-cyan-500'
                  : 'text-gray-400 hover:bg-white/5 hover:text-white'
              }\`}
            >
              <RefreshCw className="w-4 h-4 shrink-0" />
              <span className="w-full text-right">وصفات الأصناف (BOM)</span>
            </button>`;

const desktopExpensesBtn = `<button
              onClick={() => setActiveTab('recipes')}
              className={\`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-semibold transition-all flex-row-reverse \${
                activeTab === 'recipes'
                  ? 'bg-cyan-500/15 text-cyan-400 border-r-4 border-cyan-500'
                  : 'text-gray-400 hover:bg-white/5 hover:text-white'
              }\`}
            >
              <RefreshCw className="w-4 h-4 shrink-0" />
              <span className="w-full text-right">وصفات الأصناف (BOM)</span>
            </button>

            <button
              onClick={() => setActiveTab('expenses')}
              className={\`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-semibold transition-all flex-row-reverse \${
                activeTab === 'expenses'
                  ? 'bg-cyan-500/15 text-cyan-400 border-r-4 border-cyan-500'
                  : 'text-gray-400 hover:bg-white/5 hover:text-white'
              }\`}
            >
              <DollarSign className="w-4 h-4 shrink-0" />
              <span className="w-full text-right">سجل المصروفات والمسحوبات</span>
            </button>`;

if (!content.includes("onClick={() => setActiveTab('expenses')}")) {
  content = content.replace(desktopRecipesBtn, desktopExpensesBtn);
}

// 6. Add Expenses Tab Viewport
const expensesTabContent = `
          {/* TAB 4: EXPENSES & CASH PAYOUTS LOG */}
          {activeTab === 'expenses' && (
            <div className="space-y-6">
              {/* Header */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 flex-row-reverse">
                <div className="text-right">
                  <h2 className="text-xl font-bold text-white">سجل المصروفات والمسحوبات النقدية</h2>
                  <p className="text-xs text-gray-400 mt-1">متابعة كافة المبالغ المسحوبة من الدرج أثناء الورديات وفواتير توريد الخامات والمواد.</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={fetchAnalytics}
                    className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-gray-300 border border-white/10 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all"
                  >
                    <RefreshCw className={\`w-3.5 h-3.5 \${loadingAnalytics ? 'animate-spin text-cyan-400' : ''}\`} />
                    <span>تحديث البيانات</span>
                  </button>
                </div>
              </div>

              {/* KPI Summary Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="glass-panel rounded-2xl p-4 text-right">
                  <span className="text-[11px] text-gray-400 font-semibold block">إجمالي مصروفات اليوم</span>
                  <p className="text-2xl font-black text-rose-400 mt-1">EGP {kpis.todayExpenses.toFixed(2)}</p>
                  <span className="text-[9px] text-gray-500 mt-1 block">توريدات اليوم + مسحوبات الدرج</span>
                </div>
                <div className="glass-panel rounded-2xl p-4 text-right">
                  <span className="text-[11px] text-gray-400 font-semibold block">إجمالي مصروفات الشهر</span>
                  <p className="text-2xl font-black text-rose-400 mt-1">EGP {kpis.monthlyExpenses.toFixed(2)}</p>
                  <span className="text-[9px] text-gray-500 mt-1 block">المصروفات التراكمية للشهر</span>
                </div>
                <div className="glass-panel rounded-2xl p-4 text-right">
                  <span className="text-[11px] text-gray-400 font-semibold block">إجمالي مسحوبات الكاشير</span>
                  <p className="text-2xl font-black text-amber-400 mt-1">
                    EGP {cashTransactions.reduce((sum, tx) => sum + tx.amount, 0).toFixed(2)}
                  </p>
                  <span className="text-[9px] text-gray-500 mt-1 block">{cashTransactions.length} عملية سحب مسجلة</span>
                </div>
                <div className="glass-panel rounded-2xl p-4 text-right">
                  <span className="text-[11px] text-gray-400 font-semibold block">إجمالي فواتير المخزن</span>
                  <p className="text-2xl font-black text-cyan-400 mt-1">EGP {monthlyRestockTotal.toFixed(2)}</p>
                  <span className="text-[9px] text-gray-500 mt-1 block">توريدات وشحن الخامات</span>
                </div>
              </div>

              {/* Filter Tabs & Search Bar */}
              <div className="glass-panel rounded-2xl p-4 flex flex-col md:flex-row items-center justify-between gap-4 flex-row-reverse">
                <div className="flex items-center gap-2 w-full md:w-auto">
                  {(['ALL', 'PAYOUTS', 'RESTOCKS'] as const).map((type) => (
                    <button
                      key={type}
                      onClick={() => setExpenseFilterType(type)}
                      className={\`px-3 py-1.5 rounded-xl text-xs font-bold transition-all \${
                        expenseFilterType === type
                          ? 'bg-cyan-500 text-white shadow-lg shadow-cyan-500/20'
                          : 'bg-slate-900/60 text-gray-400 hover:text-white border border-white/5'
                      }\`}
                    >
                      {type === 'ALL' && 'الكل'}
                      {type === 'PAYOUTS' && 'مسحوبات الدرج (الكاشير)'}
                      {type === 'RESTOCKS' && 'مشتريات وتوريد الخامات'}
                    </button>
                  ))}
                </div>

                <div className="w-full md:w-72">
                  <input
                    type="text"
                    value={expenseSearch}
                    onChange={(e) => setExpenseSearch(e.target.value)}
                    placeholder="بحث بالسبب أو الكاشير أو الخامة..."
                    className="w-full bg-slate-900/80 border border-white/10 rounded-xl py-2 px-3.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500 text-right"
                  />
                </div>
              </div>

              {/* 1. Cash Payouts Table */}
              {(expenseFilterType === 'ALL' || expenseFilterType === 'PAYOUTS') && (
                <div className="glass-panel rounded-2xl overflow-hidden text-right" dir="rtl">
                  <div className="p-4 border-b border-white/5 flex items-center justify-between flex-row-reverse">
                    <span className="text-xs text-gray-400 font-mono">
                      {cashTransactions.filter((tx) => !expenseSearch || tx.reason.includes(expenseSearch) || tx.cashierName.includes(expenseSearch)).length} عمليات
                    </span>
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <DollarSign className="w-4 h-4 text-amber-400" />
                      <span>مسحوبات نقدية من درج الكاشير أثناء الورديات</span>
                    </h3>
                  </div>

                  <div className="overflow-x-auto max-h-[450px]">
                    <table className="w-full text-right text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-900/50 border-b border-white/5 text-gray-400 sticky top-0 backdrop-blur-md">
                          <th className="p-3.5">المبلغ</th>
                          <th className="p-3.5">سبب الصرف / البند</th>
                          <th className="p-3.5">الكاشير المسجل</th>
                          <th className="p-3.5">التاريخ والوقت</th>
                          <th className="p-3.5">نوع القيد</th>
                        </tr>
                      </thead>
                      <tbody>
                        {cashTransactions
                          .filter((tx) => !expenseSearch || tx.reason.includes(expenseSearch) || tx.cashierName.includes(expenseSearch))
                          .length ? (
                          cashTransactions
                            .filter((tx) => !expenseSearch || tx.reason.includes(expenseSearch) || tx.cashierName.includes(expenseSearch))
                            .map((tx) => (
                              <tr key={tx.id} className="border-b border-white/5 hover:bg-white/5 text-gray-300 transition-colors">
                                <td className="p-3.5 font-bold font-mono text-rose-400 text-sm">
                                  EGP {tx.amount.toFixed(2)}
                                </td>
                                <td className="p-3.5 font-semibold text-white">
                                  {tx.reason}
                                </td>
                                <td className="p-3.5">
                                  <span className="px-2 py-0.5 rounded-md bg-white/5 text-gray-300 text-[11px] font-medium border border-white/5">
                                    {tx.cashierName}
                                  </span>
                                </td>
                                <td className="p-3.5 font-mono text-gray-400 text-[11px]">
                                  {new Date(tx.createdAt).toLocaleString('ar-EG', {
                                    year: 'numeric',
                                    month: 'short',
                                    day: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })}
                                </td>
                                <td className="p-3.5">
                                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                                    {tx.type === 'PAYOUT' ? 'سحب نقدي (مصروف)' : 'إيداع نقدي'}
                                  </span>
                                </td>
                              </tr>
                            ))
                        ) : (
                          <tr>
                            <td colSpan={5} className="p-8 text-center text-gray-500 text-xs">
                              لا توجد مسحوبات نقدية مسجلة مطابقة للبحث.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* 2. Restock Logs Table */}
              {(expenseFilterType === 'ALL' || expenseFilterType === 'RESTOCKS') && (
                <div className="glass-panel rounded-2xl overflow-hidden text-right" dir="rtl">
                  <div className="p-4 border-b border-white/5 flex items-center justify-between flex-row-reverse">
                    <span className="text-xs text-gray-400 font-mono">
                      {restockLogs.filter((log) => !expenseSearch || log.rawMaterial.name.includes(expenseSearch)).length} فواتير
                    </span>
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <Package className="w-4 h-4 text-cyan-400" />
                      <span>فواتير توريد وشحن الخامات للمخزن</span>
                    </h3>
                  </div>

                  <div className="overflow-x-auto max-h-[450px]">
                    <table className="w-full text-right text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-900/50 border-b border-white/5 text-gray-400 sticky top-0 backdrop-blur-md">
                          <th className="p-3.5">اسم المادة الخام</th>
                          <th className="p-3.5">الكمية الموردة</th>
                          <th className="p-3.5">المبلغ الإجمالي</th>
                          <th className="p-3.5">التاريخ والوقت</th>
                        </tr>
                      </thead>
                      <tbody>
                        {restockLogs
                          .filter((log) => !expenseSearch || log.rawMaterial.name.includes(expenseSearch))
                          .length ? (
                          restockLogs
                            .filter((log) => !expenseSearch || log.rawMaterial.name.includes(expenseSearch))
                            .map((log) => (
                              <tr key={log.id} className="border-b border-white/5 hover:bg-white/5 text-gray-300 transition-colors">
                                <td className="p-3.5 font-semibold text-white">
                                  {log.rawMaterial.name}
                                </td>
                                <td className="p-3.5 font-mono text-cyan-300">
                                  {log.quantity} {log.rawMaterial.purchaseUnit}
                                </td>
                                <td className="p-3.5 font-bold font-mono text-amber-400 text-sm">
                                  EGP {log.amount.toFixed(2)}
                                </td>
                                <td className="p-3.5 font-mono text-gray-400 text-[11px]">
                                  {new Date(log.createdAt).toLocaleString('ar-EG', {
                                    year: 'numeric',
                                    month: 'short',
                                    day: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })}
                                </td>
                              </tr>
                            ))
                        ) : (
                          <tr>
                            <td colSpan={4} className="p-8 text-center text-gray-500 text-xs">
                              لا توجد فواتير توريد مسجلة مطابقة للبحث.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
`;

const recipesTabEndTarget = `                            >
                              حذف
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}`;

if (!content.includes("{activeTab === 'expenses' && (")) {
  content = content.replace(recipesTabEndTarget, recipesTabEndTarget + expensesTabContent);
}

fs.writeFileSync(adminPath, content, 'utf8');
console.log('Successfully injected all features into Admin page!');
