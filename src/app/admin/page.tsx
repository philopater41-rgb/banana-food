'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/lib/store';
import { 
  TrendingUp, Package, AlertTriangle, Users, LogOut, 
  Trash2, DollarSign, CheckCircle2, RefreshCw, 
  ChevronRight, Calendar, PlusCircle, ShoppingBag, X
} from 'lucide-react';

interface KPIState {
  todaySales: number;
  monthlySales: number;
  estNetProfit: number;
  activeShiftUser: string;
  activeShiftExpected: number;
}

interface PaymentBreakdown {
  cash: number;
  instapay: number;
  visa: number;
}

interface TopItem {
  name: string;
  qty: number;
  total: number;
}

interface LowStock {
  id: string;
  name: string;
  stockQty: number;
  minStockLevel: number;
  deductUnit: string;
}

interface RawMaterial {
  id: string;
  name: string;
  stockQty: number;
  minStockLevel: number;
  purchaseUnit: string;
  deductUnit: string;
  conversionFactor: number;
  isLowStock: boolean;
}

interface WastageLog {
  id: string;
  rawMaterial: { name: string; deductUnit: string };
  quantity: number;
  reason: string;
  createdAt: string;
}

interface RecentOrder {
  id: string;
  orderType: string;
  paymentMethod: string;
  status: string;
  total: number;
  createdAt: string;
  table?: { name: string } | null;
}

export default function AdminPage() {
  const router = useRouter();
  const { user, logout } = useAppStore();

  // Active Tab
  const [activeTab, setActiveTab] = useState<'dashboard' | 'inventory' | 'wastage'>('dashboard');

  // API Data States
  const [kpis, setKpis] = useState<KPIState>({
    todaySales: 0,
    monthlySales: 0,
    estNetProfit: 0,
    activeShiftUser: 'Loading...',
    activeShiftExpected: 0
  });
  
  const [payments, setPayments] = useState<PaymentBreakdown>({ cash: 0, instapay: 0, visa: 0 });
  const [topItems, setTopItems] = useState<TopItem[]>([]);
  const [lowStock, setLowStock] = useState<LowStock[]>([]);
  const [recentOrders, setRecentOrders] = useState<RecentOrder[]>([]);
  
  // Inventory list state
  const [materials, setMaterials] = useState<RawMaterial[]>([]);
  const [wastageLogs, setWastageLogs] = useState<WastageLog[]>([]);
  
  // Loading states
  const [loadingAnalytics, setLoadingAnalytics] = useState(true);
  const [loadingInventory, setLoadingInventory] = useState(false);
  const [loadingWastage, setLoadingWastage] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);

  // Modals
  const [showRestock, setShowRestock] = useState(false);
  const [showWastage, setShowWastage] = useState(false);
  const [selectedMaterialId, setSelectedMaterialId] = useState('');
  const [qtyInput, setQtyInput] = useState('');
  const [reasonInput, setReasonInput] = useState('');

  const [alertMsg, setAlertMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Guard: Admin Check
  useEffect(() => {
    if (!user) {
      router.push('/');
      return;
    }
    if (user.role !== 'ADMIN') {
      router.push('/pos');
    }
  }, [user, router]);

  const triggerAlert = (type: 'success' | 'error', text: string) => {
    setAlertMsg({ type, text });
    setTimeout(() => setAlertMsg(null), 3000);
  };

  // Fetch Analytics (Dashboard)
  const fetchAnalytics = useCallback(async () => {
    setLoadingAnalytics(true);
    try {
      const res = await fetch('/api/admin-analytics');
      if (res.ok) {
        const data = await res.json();
        setKpis(data.kpis);
        setPayments(data.paymentBreakdown);
        setTopItems(data.topSellingItems);
        setLowStock(data.lowStockAlerts);
        setRecentOrders(data.recentOrders);
      }
    } catch (e) {
      console.error(e);
      triggerAlert('error', 'فشل تحميل التقارير المالية.');
    } finally {
      setLoadingAnalytics(false);
    }
  }, []);

  // Fetch Inventory Materials
  const fetchInventory = useCallback(async () => {
    setLoadingInventory(true);
    try {
      const res = await fetch('/api/inventory');
      if (res.ok) {
        const data = await res.json();
        setMaterials(data.rawMaterials);
      }
    } catch (e) {
      console.error(e);
      triggerAlert('error', 'فشل تحميل بيانات المخزن.');
    } finally {
      setLoadingInventory(false);
    }
  }, []);

  // Fetch Wastage Logs
  const fetchWastage = useCallback(async () => {
    setLoadingWastage(true);
    try {
      const res = await fetch('/api/inventory/wastage');
      if (res.ok) {
        const data = await res.json();
        setWastageLogs(data.wastageLogs);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingWastage(false);
    }
  }, []);

  // Trigger loading based on selected tab
  useEffect(() => {
    if (activeTab === 'dashboard') {
      fetchAnalytics();
    } else if (activeTab === 'inventory') {
      fetchInventory();
    } else if (activeTab === 'wastage') {
      fetchWastage();
    }
  }, [activeTab, fetchAnalytics, fetchInventory, fetchWastage]);

  // Handle Restock Form POST
  const handleRestockSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMaterialId || !qtyInput) return;
    setSubmitLoading(true);

    try {
      const res = await fetch('/api/inventory/restock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rawMaterialId: selectedMaterialId,
          quantity: parseFloat(qtyInput),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشلت عملية التوريد');

      triggerAlert('success', 'تم شحن وتوريد الخامة للمخزن بنجاح.');
      setShowRestock(false);
      setQtyInput('');
      fetchInventory();
    } catch (err: any) {
      triggerAlert('error', err.message || 'خطأ في عملية التوريد');
    } finally {
      setSubmitLoading(false);
    }
  };

  // Handle Wastage Form POST
  const handleWastageSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMaterialId || !qtyInput || !reasonInput) return;
    setSubmitLoading(true);

    try {
      const res = await fetch('/api/inventory/wastage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rawMaterialId: selectedMaterialId,
          quantity: parseFloat(qtyInput),
          reason: reasonInput,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشل تسجيل الهالك');

      triggerAlert('success', 'تم تسجيل الهالك وخصمه من المخزن بنجاح.');
      setShowWastage(false);
      setQtyInput('');
      setReasonInput('');
      fetchInventory();
    } catch (err: any) {
      triggerAlert('error', err.message || 'خطأ في تسجيل الهالك');
    } finally {
      setSubmitLoading(false);
    }
  };

  // SVG Chart Computations
  const maxItemTotal = topItems.reduce((max, i) => Math.max(max, i.total), 0) || 1;
  const totalPaymentSum = (payments.cash + payments.instapay + payments.visa) || 1;
  const cashPct = Math.round((payments.cash / totalPaymentSum) * 100);
  const instapayPct = Math.round((payments.instapay / totalPaymentSum) * 100);
  const visaPct = Math.round((payments.visa / totalPaymentSum) * 100);

  return (
    <div className="flex h-screen bg-[#090d16] text-gray-200 overflow-hidden text-right" dir="rtl">
      
      {/* 1. Left Navigation Sidebar */}
      <aside className="w-64 bg-[#0c1424] border-l border-white/5 flex flex-col justify-between p-6 shrink-0">
        <div className="space-y-8">
          {/* Brand header */}
          <div className="flex items-center gap-3 justify-start flex-row-reverse">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 to-purple-600 flex items-center justify-center font-bold text-white shadow-lg shadow-cyan-500/10">
              DN
            </div>
            <div>
              <h1 className="text-base font-bold text-white leading-tight">داي أند نايت</h1>
              <span className="text-[10px] text-cyan-400 font-semibold tracking-wider uppercase">نظام الإدارة وجرد المخازن</span>
            </div>
          </div>

          {/* Navigation links */}
          <nav className="space-y-1.5">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-semibold transition-all flex-row-reverse ${
                activeTab === 'dashboard'
                  ? 'bg-cyan-500/15 text-cyan-400 border-r-4 border-cyan-500'
                  : 'text-gray-400 hover:bg-white/5 hover:text-white'
              }`}
            >
              <TrendingUp className="w-4 h-4 shrink-0" />
              <span className="w-full text-right">تحليلات المبيعات والأرباح</span>
            </button>

            <button
              onClick={() => setActiveTab('inventory')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-semibold transition-all flex-row-reverse ${
                activeTab === 'inventory'
                  ? 'bg-cyan-500/15 text-cyan-400 border-r-4 border-cyan-500'
                  : 'text-gray-400 hover:bg-white/5 hover:text-white'
              }`}
            >
              <Package className="w-4 h-4 shrink-0" />
              <span className="w-full text-right">مخزن الخامات والمواد</span>
            </button>

            <button
              onClick={() => setActiveTab('wastage')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-semibold transition-all flex-row-reverse ${
                activeTab === 'wastage'
                  ? 'bg-cyan-500/15 text-cyan-400 border-r-4 border-cyan-500'
                  : 'text-gray-400 hover:bg-white/5 hover:text-white'
              }`}
            >
              <Trash2 className="w-4 h-4 shrink-0" />
              <span className="w-full text-right">هوالك وتوالف المخزن</span>
            </button>
          </nav>
        </div>

        {/* User Info / Portal switcher */}
        <div className="space-y-4 pt-4 border-t border-white/5">
          <button 
            onClick={() => router.push('/pos')}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/20 text-xs font-bold transition-all"
          >
            <ShoppingBag className="w-4 h-4" />
            <span>فتح شاشة البيع والكاشير</span>
          </button>

          <div className="flex items-center justify-between flex-row-reverse">
            <div className="text-right">
              <p className="text-white font-semibold leading-tight">{user?.name}</p>
              <p className="text-gray-500 text-[10px] uppercase tracking-wider">مدير النظام</p>
            </div>
            <button 
              onClick={() => { logout(); router.push('/'); }}
              className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white border border-white/5 transition-all"
              title="تسجيل خروج"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* 2. Main Content Workspace */}
      <main className="flex-1 flex flex-col overflow-hidden">
        
        {/* Top Header Banner */}
        <header className="h-16 border-b border-white/5 px-8 flex items-center justify-between shrink-0 bg-[#090d16]">
          <div className="flex items-center gap-2 flex-row-reverse">
            <Calendar className="w-4 h-4 text-gray-500" />
            <span className="text-xs text-gray-400 font-medium">
              تاريخ اليوم: {new Date().toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </span>
          </div>

          {/* Active status widget */}
          <div className="text-xs text-right">
            <span className="text-gray-400">الوردية شغالة حالياً مع: </span>
            <span className="font-bold text-purple-400">{kpis.activeShiftUser}</span>
          </div>
        </header>

        {/* Tab content viewports */}
        <div className="flex-1 overflow-y-auto p-8 space-y-6">
          
          {/* TAB 1: EXECUTIVE ANALYTICS DASHBOARD */}
          {activeTab === 'dashboard' && (
            <>
              {loadingAnalytics ? (
                <div className="h-96 flex items-center justify-center gap-2 text-sm text-gray-400">
                  <RefreshCw className="w-4 h-4 animate-spin text-cyan-400" />
                  <span>جاري حساب الأرقام والتقارير المالية...</span>
                </div>
              ) : (
                <>
                  {/* KPI Cards Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="glass-panel rounded-2xl p-6 relative overflow-hidden">
                      <div className="absolute top-0 right-0 w-24 h-24 bg-cyan-500/5 rounded-full blur-2xl"></div>
                      <span className="text-xs text-gray-400 uppercase tracking-wider font-semibold block text-right">إجمالي مبيعات اليوم</span>
                      <p className="text-3xl font-black text-white mt-2 text-right">EGP {kpis.todaySales.toFixed(2)}</p>
                      <span className="text-[10px] text-cyan-400 mt-2 block text-right">إيراد درج الكاشير والطلبات اليوم</span>
                    </div>

                    <div className="glass-panel rounded-2xl p-6 relative overflow-hidden">
                      <div className="absolute top-0 right-0 w-24 h-24 bg-purple-500/5 rounded-full blur-2xl"></div>
                      <span className="text-xs text-gray-400 uppercase tracking-wider font-semibold block text-right">مبيعات الشهر الحالي</span>
                      <p className="text-3xl font-black text-white mt-2 text-right">EGP {kpis.monthlySales.toFixed(2)}</p>
                      <span className="text-[10px] text-purple-400 mt-2 block text-right">المبيعات التراكمية من أول الشهر</span>
                    </div>

                    <div className="glass-panel rounded-2xl p-6 relative overflow-hidden">
                      <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-2xl"></div>
                      <span className="text-xs text-gray-400 uppercase tracking-wider font-semibold block text-right">صافي الربح التقديري اليوم</span>
                      <p className="text-3xl font-black text-emerald-400 mt-2 text-right">EGP {kpis.estNetProfit.toFixed(2)}</p>
                      <span className="text-[10px] text-emerald-400 mt-2 block text-right">حساب الربح التقديري بمتوسط هامش 65%</span>
                    </div>
                  </div>

                  {/* Charts & Warning Widgets */}
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    
                    {/* Top Selling Items (Custom SVG Horizontal Bar Chart) */}
                    <div className="glass-panel rounded-2xl p-6 lg:col-span-2 space-y-4">
                      <h3 className="font-bold text-sm text-white text-right">الأصناف الأكثر مبيعاً اليوم</h3>
                      
                      <div className="space-y-4 pt-2">
                        {topItems.length > 0 ? (
                          topItems.map((item, idx) => {
                            const barPct = (item.total / maxItemTotal) * 100;
                            return (
                              <div key={idx} className="space-y-1.5">
                                <div className="flex justify-between text-xs font-semibold flex-row-reverse text-right">
                                  <span>{item.name} <span className="text-gray-500">(عدد {item.qty})</span></span>
                                  <span className="text-cyan-400">EGP {item.total.toFixed(2)}</span>
                                </div>
                                <div className="w-full h-2.5 bg-slate-900 rounded-full overflow-hidden">
                                  <div 
                                    className="h-full bg-gradient-to-l from-cyan-500 to-purple-600 rounded-full"
                                    style={{ width: `${barPct}%` }}
                                  ></div>
                                </div>
                              </div>
                            );
                          })
                        ) : (
                          <p className="text-xs text-gray-500 italic py-6 text-center">مفيش مبيعات اتسجلت النهاردة لسه.</p>
                        )}
                      </div>
                    </div>

                    {/* Live Inventory Alert Status Widget */}
                    <div className="glass-panel rounded-2xl p-6 flex flex-col gap-4">
                      <h3 className="font-bold text-sm text-white flex items-center gap-2 flex-row-reverse justify-start">
                        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                        <span>خامات أوشكت على النفاد</span>
                      </h3>

                      <div className="flex-1 overflow-y-auto space-y-2.5 max-h-[220px] pl-1">
                        {lowStock.length > 0 ? (
                          lowStock.map((alert) => (
                            <div key={alert.id} className="p-3 bg-red-500/5 border border-red-500/10 rounded-xl flex items-center justify-between gap-3 text-xs flex-row-reverse">
                              <div className="text-right">
                                <h4 className="font-semibold text-white">{alert.name}</h4>
                                <p className="text-gray-500 mt-0.5">حد الأمان للتنبيه: {alert.minStockLevel} {alert.deductUnit}</p>
                              </div>
                              <div className="text-left shrink-0">
                                <span className="px-2 py-0.5 bg-red-500/10 text-red-400 rounded-full font-bold text-[10px]">
                                  {alert.stockQty} {alert.deductUnit} متبقي
                                </span>
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="h-full flex flex-col items-center justify-center text-center text-gray-500 gap-1.5 py-6">
                            <CheckCircle2 className="w-8 h-8 text-emerald-400/80 stroke-1" />
                            <p className="text-xs">كل خامات ومكونات المخزن آمنة</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Payment Breakdown & Recent Orders */}
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    
                    {/* Payment breakdown rings */}
                    <div className="glass-panel rounded-2xl p-6 flex flex-col justify-between gap-4">
                      <h3 className="font-bold text-sm text-white text-right">طرق تحصيل النقدية اليوم</h3>
                      
                      <div className="space-y-4 py-2">
                        {totalPaymentSum > 1 ? (
                          <>
                            <div className="space-y-1">
                              <div className="flex justify-between text-xs flex-row-reverse">
                                <span className="text-cyan-400 font-semibold">كاش (درج النقدية)</span>
                                <span className="font-bold text-white">EGP {payments.cash.toFixed(2)} ({cashPct}%)</span>
                              </div>
                              <div className="w-full h-1.5 bg-slate-900 rounded-full overflow-hidden">
                                <div className="h-full bg-cyan-500 rounded-full" style={{ width: `${cashPct}%` }}></div>
                              </div>
                            </div>

                            <div className="space-y-1">
                              <div className="flex justify-between text-xs flex-row-reverse">
                                <span className="text-purple-400 font-semibold">إنستا باي (InstaPay)</span>
                                <span className="font-bold text-white">EGP {payments.instapay.toFixed(2)} ({instapayPct}%)</span>
                              </div>
                              <div className="w-full h-1.5 bg-slate-900 rounded-full overflow-hidden">
                                <div className="h-full bg-purple-500 rounded-full" style={{ width: `${instapayPct}%` }}></div>
                              </div>
                            </div>

                            <div className="space-y-1">
                              <div className="flex justify-between text-xs flex-row-reverse">
                                <span className="text-emerald-400 font-semibold">فيزا / كروت البنك</span>
                                <span className="font-bold text-white">EGP {payments.visa.toFixed(2)} ({visaPct}%)</span>
                              </div>
                              <div className="w-full h-1.5 bg-slate-900 rounded-full overflow-hidden">
                                <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${visaPct}%` }}></div>
                              </div>
                            </div>
                          </>
                        ) : (
                          <p className="text-xs text-gray-500 italic py-6 text-center">لا توجد مبيعات لحساب النسب حالياً.</p>
                        )}
                      </div>
                    </div>

                    {/* Recent sales orders list */}
                    <div className="glass-panel rounded-2xl p-6 lg:col-span-2 space-y-4">
                      <h3 className="font-bold text-sm text-white text-right">آخر الفواتير الصادرة</h3>
                      
                      <div className="overflow-x-auto">
                        <table className="w-full text-right text-xs border-collapse">
                          <thead>
                            <tr className="border-b border-white/5 text-gray-500">
                              <th className="py-2.5">رقم الفاتورة</th>
                              <th className="py-2.5">الوقت</th>
                              <th className="py-2.5">نوع الأوردر</th>
                              <th className="py-2.5">طريقة الدفع</th>
                              <th className="py-2.5 text-left font-bold">الحساب</th>
                            </tr>
                          </thead>
                          <tbody>
                            {recentOrders.length > 0 ? (
                              recentOrders.map((ord) => (
                                <tr key={ord.id} className="border-b border-white/5 text-gray-300">
                                  <td className="py-3 font-mono text-cyan-400">{ord.id.slice(0, 8)}</td>
                                  <td className="py-3">{new Date(ord.createdAt).toLocaleTimeString()}</td>
                                  <td className="py-3">
                                    <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                                      ord.orderType === 'DINE_IN' ? 'bg-cyan-500/10 text-cyan-400' : 'bg-amber-500/10 text-amber-400'
                                    }`}>
                                      {ord.orderType === 'DINE_IN' ? `صالة (${ord.table?.name || 'طاولة'})` : 'تيك أواي'}
                                    </span>
                                  </td>
                                  <td className="py-3 font-bold text-[10px] uppercase tracking-wider">{ord.paymentMethod === 'CASH' ? 'كاش' : ord.paymentMethod === 'INSTAPAY' ? 'إنستا باي' : 'فيزا'}</td>
                                  <td className="py-3 text-left font-bold text-white">EGP {ord.total.toFixed(2)}</td>
                                </tr>
                              ))
                            ) : (
                              <tr>
                                <td colSpan={5} className="py-4 text-center text-gray-500 italic">مفيش فواتير صدرت لسه.</td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </>
          )}

          {/* TAB 2: INVENTORY STOCK MANAGEMENT */}
          {activeTab === 'inventory' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between flex-row-reverse">
                <div className="text-right">
                  <h2 className="text-xl font-bold text-white">مخزن وجرد الخامات</h2>
                  <p className="text-xs text-gray-400 mt-1">تابع رصيد المكونات والخامات الحالي، وسجل التوريدات الجديدة أو الهوالك.</p>
                </div>
                <div className="flex gap-3 flex-row-reverse">
                  <button 
                    onClick={() => { setSelectedMaterialId(materials[0]?.id || ''); setShowWastage(true); }}
                    className="px-4 py-2 bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/20 text-rose-300 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
                  >
                    <Trash2 className="w-4 h-4 shrink-0" />
                    <span>تسجيل هالك خامات</span>
                  </button>
                  
                  <button 
                    onClick={() => { setSelectedMaterialId(materials[0]?.id || ''); setShowRestock(true); }}
                    className="px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
                  >
                    <PlusCircle className="w-4 h-4 shrink-0" />
                    <span>توريد خامات جديدة</span>
                  </button>
                </div>
              </div>

              {loadingInventory ? (
                <div className="h-96 flex items-center justify-center gap-2 text-sm text-gray-400">
                  <RefreshCw className="w-4 h-4 animate-spin text-cyan-400" />
                  <span>جاري تحميل بيانات وجرد المخزن...</span>
                </div>
              ) : (
                <div className="glass-panel rounded-2xl overflow-hidden">
                  <table className="w-full text-right text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-900/50 border-b border-white/5 text-gray-400">
                        <th className="p-4">اسم المادة الخام</th>
                        <th className="p-4">الرصيد الحالي بالمخزن</th>
                        <th className="p-4">حد التنبيه للنفاد</th>
                        <th className="p-4">وحدة الشراء</th>
                        <th className="p-4">وحدة الاستهلاك</th>
                        <th className="p-4">الحالة</th>
                      </tr>
                    </thead>
                    <tbody>
                      {materials.map((mat) => (
                        <tr key={mat.id} className="border-b border-white/5 hover:bg-white/5 text-gray-300 transition-colors">
                          <td className="p-4 font-semibold text-white">{mat.name}</td>
                          <td className="p-4 font-mono font-bold text-cyan-400">
                            {mat.stockQty} {mat.deductUnit}
                            <span className="text-[10px] text-gray-500 block font-normal mt-0.5">
                              (~{(mat.stockQty / mat.conversionFactor).toFixed(2)} {mat.purchaseUnit})
                            </span>
                          </td>
                          <td className="p-4 text-gray-400">{mat.minStockLevel} {mat.deductUnit}</td>
                          <td className="p-4 text-gray-500 uppercase tracking-wider">{mat.purchaseUnit}</td>
                          <td className="p-4 text-gray-500 uppercase tracking-wider">{mat.deductUnit}</td>
                          <td className="p-4">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              mat.isLowStock 
                                ? 'bg-red-500/10 text-red-400 border border-red-500/15' 
                                : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/15'
                            }`}>
                              {mat.isLowStock ? 'ناقص / يحتاج توريد' : 'آمن وممتاز'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: WASTE LOGS VIEW */}
          {activeTab === 'wastage' && (
            <div className="space-y-6">
              <div className="text-right">
                <h2 className="text-xl font-bold text-white">سجل الهوالك والتوالف</h2>
                <p className="text-xs text-gray-400 mt-1">متابعة المواد المفقودة وتالف تشغيل المطعم والمطبخ لحساب الفروقات بدقة.</p>
              </div>

              {loadingWastage ? (
                <div className="h-96 flex items-center justify-center gap-2 text-sm text-gray-400">
                  <RefreshCw className="w-4 h-4 animate-spin text-cyan-400" />
                  <span>جاري تحميل سجل الهوالك...</span>
                </div>
              ) : (
                <div className="glass-panel rounded-2xl overflow-hidden">
                  <table className="w-full text-right text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-900/50 border-b border-white/5 text-gray-400">
                        <th className="p-4">التاريخ والوقت</th>
                        <th className="p-4">الخامة المفقودة</th>
                        <th className="p-4">الكمية التالفة</th>
                        <th className="p-4">السبب / البيان</th>
                      </tr>
                    </thead>
                    <tbody>
                      {wastageLogs.length > 0 ? (
                        wastageLogs.map((log) => (
                          <tr key={log.id} className="border-b border-white/5 hover:bg-white/5 text-gray-300 transition-colors">
                            <td className="p-4 text-gray-400">{new Date(log.createdAt).toLocaleString()}</td>
                            <td className="p-4 font-semibold text-white">{log.rawMaterial.name}</td>
                            <td className="p-4 font-mono text-rose-400 font-bold">-{log.quantity} {log.rawMaterial.deductUnit}</td>
                            <td className="p-4 text-gray-400">
                              <span className="px-2 py-0.5 bg-slate-800 text-gray-300 rounded font-semibold text-[10px]">
                                {log.reason}
                              </span>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={4} className="p-8 text-center text-gray-500 italic">مفيش بيانات هالك مسجلة في الوقت الحالي.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

        </div>
      </main>

      {/* ======================================================== */}
      {/* 3. Admin Modals (Restock, Wastage, Alerts) */}
      {/* ======================================================== */}

      {/* Alert Banner */}
      {alertMsg && (
        <div className={`fixed bottom-4 left-4 z-50 p-4 rounded-xl shadow-lg border text-sm flex items-center gap-3 transition-all animate-float flex-row-reverse ${
          alertMsg.type === 'success' 
            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' 
            : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
        }`}>
          {alertMsg.type === 'success' ? <CheckCircle2 className="w-5 h-5 shrink-0" /> : <AlertTriangle className="w-5 h-5 shrink-0" />}
          <span>{alertMsg.text}</span>
        </div>
      )}

      {/* RESTOCK DIALOG */}
      {showRestock && (
        <div className="fixed inset-0 z-40 bg-black/75 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="w-full max-w-md glass-panel rounded-2xl p-6 relative text-right" dir="rtl">
            <button 
              onClick={() => setShowRestock(false)}
              className="absolute top-4 left-4 text-gray-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
            <h3 className="text-xl font-bold text-white mb-2">توريد وشحن خامات للمخزن</h3>
            <p className="text-xs text-gray-400 mb-6">اكتب الكمية الموردة بوحدة الشراء الكبرى (مثال: بالكيلو، بالكرتونة). سيتم تحويلها تلقائياً.</p>
            
            <form onSubmit={handleRestockSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-2">اختار الخامة</label>
                <select
                  value={selectedMaterialId}
                  onChange={(e) => setSelectedMaterialId(e.target.value)}
                  className="w-full bg-slate-900 border border-white/10 rounded-xl py-2.5 px-4 text-white focus:outline-none focus:border-cyan-500"
                >
                  {materials.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} (وحدة الشراء: {m.purchaseUnit})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-2">الكمية المراد إضافتها (بوحدة الشراء)</label>
                <input
                  type="number"
                  required
                  value={qtyInput}
                  onChange={(e) => setQtyInput(e.target.value)}
                  className="w-full bg-slate-900 border border-white/10 rounded-xl py-2.5 px-4 text-white focus:outline-none focus:border-cyan-500 text-right"
                  placeholder="مثال: 5"
                  min="0"
                  step="any"
                />
              </div>

              <button
                type="submit"
                disabled={submitLoading}
                className="w-full py-3 bg-cyan-500 hover:bg-cyan-600 text-white font-bold rounded-xl shadow-lg transition-all mt-2"
              >
                {submitLoading ? 'جاري شحن الرصيد...' : 'تأكيد إضافة الرصيد للمخزن'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* WASTAGE LOG DIALOG */}
      {showWastage && (
        <div className="fixed inset-0 z-40 bg-black/75 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="w-full max-w-md glass-panel rounded-2xl p-6 relative text-right" dir="rtl">
            <button 
              onClick={() => setShowWastage(false)}
              className="absolute top-4 left-4 text-gray-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
            <h3 className="text-xl font-bold text-white mb-2">تسجيل هالك خامات ومواد</h3>
            <p className="text-xs text-gray-400 mb-6">اكتب كمية الهالك بوحدة الاستهلاك الصغرى (مثال: جرام، مل) مع توضيح سبب الهدر.</p>
            
            <form onSubmit={handleWastageSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-2">اختار الخامة المفقودة</label>
                <select
                  value={selectedMaterialId}
                  onChange={(e) => setSelectedMaterialId(e.target.value)}
                  className="w-full bg-slate-900 border border-white/10 rounded-xl py-2.5 px-4 text-white focus:outline-none focus:border-cyan-500"
                >
                  {materials.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} (وحدة الاستهلاك: {m.deductUnit})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-2">الكمية التالفة (بوحدة الاستهلاك)</label>
                <input
                  type="number"
                  required
                  value={qtyInput}
                  onChange={(e) => setQtyInput(e.target.value)}
                  className="w-full bg-slate-900 border border-white/10 rounded-xl py-2.5 px-4 text-white focus:outline-none focus:border-cyan-500 text-right"
                  placeholder="مثال: 250"
                  min="0"
                  step="any"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-2">السبب أو البيان</label>
                <input
                  type="text"
                  required
                  value={reasonInput}
                  onChange={(e) => setReasonInput(e.target.value)}
                  className="w-full bg-slate-900 border border-white/10 rounded-xl py-2.5 px-4 text-white focus:outline-none focus:border-cyan-500 text-right"
                  placeholder="مثال: انسكاب أثناء عمل رغوة اللاتيه"
                />
              </div>

              <button
                type="submit"
                disabled={submitLoading}
                className="w-full py-3 bg-rose-500 hover:bg-rose-600 text-white font-bold rounded-xl shadow-lg transition-all mt-2"
              >
                {submitLoading ? 'جاري تسجيل الحركة...' : 'تأكيد تسجيل الهدر'}
              </button>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
