'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/lib/store';
import { 
  TrendingUp, Package, AlertTriangle, Users, LogOut, 
  Trash2, DollarSign, CheckCircle2, RefreshCw, 
  ChevronRight, Calendar, PlusCircle, ShoppingBag, X, Menu
} from 'lucide-react';

interface KPIState {
  todaySales: number;
  monthlySales: number;
  todayStaffConsumption: number;
  monthlyStaffConsumption: number;
  todayExpenses: number;
  monthlyExpenses: number;
  todayNet: number;
  monthlyNet: number;
  activeShiftUser: string;
  activeShiftExpected: number;
}

interface PaymentBreakdown {
  cash: number;
  instapay: number;
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
  receiptNumber?: string | null;
  orderType: string;
  paymentMethod: string;
  status: string;
  total: number;
  discount: number;
  createdAt: string;
  table?: { name: string } | null;
}
interface RestockLog {
  id: string; quantity: number; amount: number; createdAt: string;
  rawMaterial: { name: string; purchaseUnit: string };
}
interface AttendanceRecord { id: string; employeeName: string; checkedInAt: string; checkedOutAt: string | null; }

interface OrderDetails extends RecentOrder {
  subtotal: number;
  discount: number;
  discountReason?: string | null;
  tax: number;
  staffName?: string | null;
  items: Array<{
    id: string;
    qty: number;
    unitPrice: number;
    totalPrice: number;
    item: { name: string };
    modifiers: Array<{
      id: string;
      unitPriceImpact: number;
      modifier: { name: string };
    }>;
  }>;
}

interface SalesSummary {
  period: string;
  total: number;
  orders: number;
}

interface ShiftSummary {
  id: string;
  openedAt: string;
  closedAt: string | null;
  cashierName: string;
  orderCount: number;
  totalSales: number;
  cashSales: number;
  instaPaySales: number;
  staffConsumption: number;
  expectedCash: number;
  expectedInstaPay: number;
  closedCash: number | null;
  closedInstaPay: number | null;
  varianceCash: number;
  varianceInstaPay: number;
}

export default function AdminPage() {
  const router = useRouter();
  const { user, logout } = useAppStore();

  // Active Tab
  const [activeTab, setActiveTab] = useState<'dashboard' | 'inventory' | 'wastage' | 'recipes'>('dashboard');
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);
  const [todayLabel, setTodayLabel] = useState('');

  // API Data States
  const [kpis, setKpis] = useState<KPIState>({
    todaySales: 0,
    monthlySales: 0,
    todayStaffConsumption: 0,
    monthlyStaffConsumption: 0,
    todayExpenses: 0,
    monthlyExpenses: 0,
    todayNet: 0,
    monthlyNet: 0,
    activeShiftUser: 'Loading...',
    activeShiftExpected: 0
  });
  
  const [payments, setPayments] = useState<PaymentBreakdown>({ cash: 0, instapay: 0 });
  const [topItems, setTopItems] = useState<TopItem[]>([]);
  const [topItemsByPeriod, setTopItemsByPeriod] = useState<{ today: TopItem[]; month: TopItem[]; all: TopItem[] }>({ today: [], month: [], all: [] });
  const [topItemsPeriod, setTopItemsPeriod] = useState<'today' | 'month' | 'all'>('today');
  const [lowStock, setLowStock] = useState<LowStock[]>([]);
  const [recentOrders, setRecentOrders] = useState<RecentOrder[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<OrderDetails | null>(null);
  const [showOrderDetails, setShowOrderDetails] = useState(false);
  const [loadingOrderDetails, setLoadingOrderDetails] = useState(false);
  const [dailySales, setDailySales] = useState<SalesSummary[]>([]);
  const [monthlySalesHistory, setMonthlySalesHistory] = useState<SalesSummary[]>([]);
  const [shiftSummaries, setShiftSummaries] = useState<ShiftSummary[]>([]);
  
  // Inventory list state
  const [materials, setMaterials] = useState<RawMaterial[]>([]);
  const [wastageLogs, setWastageLogs] = useState<WastageLog[]>([]);
  const [restockLogs, setRestockLogs] = useState<RestockLog[]>([]);
  const [monthlyRestockTotal, setMonthlyRestockTotal] = useState(0);
  const [todayAttendance, setTodayAttendance] = useState<AttendanceRecord[]>([]);
  const [monthlyAttendance, setMonthlyAttendance] = useState<AttendanceRecord[]>([]);
  
  // Recipes tab states
  const [recipesItems, setRecipesItems] = useState<any[]>([]);
  const [recipesModifiers, setRecipesModifiers] = useState<any[]>([]);
  const [selectedRecipeTarget, setSelectedRecipeTarget] = useState<{ type: 'item' | 'modifier'; id: string; name: string } | null>(null);
  const [recipeIngredients, setRecipeIngredients] = useState<Array<{ rawMaterialId: string; quantity: number }>>([]);
  const [loadingRecipes, setLoadingRecipes] = useState(false);
  const [showAddMaterial, setShowAddMaterial] = useState(false);
  const [showAddMenuItem, setShowAddMenuItem] = useState(false);

  // New Material inputs
  const [newMatName, setNewMatName] = useState('');
  const [newMatStock, setNewMatStock] = useState('');
  const [newMatMinStock, setNewMatMinStock] = useState('');
  const [newMatPurchaseUnit, setNewMatPurchaseUnit] = useState('');
  const [newMatDeductUnit, setNewMatDeductUnit] = useState('');
  const [newMatConvFactor, setNewMatConvFactor] = useState('');
  const [newItemName, setNewItemName] = useState('');
  const [newItemPrice, setNewItemPrice] = useState('');
  const [newItemCategory, setNewItemCategory] = useState('');
  const [newItemNewCategory, setNewItemNewCategory] = useState('');

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
  const [restockAmount, setRestockAmount] = useState('');
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

  useEffect(() => {
    setTodayLabel(new Date().toLocaleDateString('ar-EG', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }));
  }, []);

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
        setTopItemsByPeriod(data.topSellingItemsByPeriod || { today: data.topSellingItems, month: [], all: [] });
        setLowStock(data.lowStockAlerts);
        setRecentOrders(data.recentOrders);
        setDailySales(data.dailySales);
        setMonthlySalesHistory(data.monthlySalesHistory);
        setShiftSummaries(data.shiftSummaries);
        const attendanceRes = await fetch('/api/attendance');
        if (attendanceRes.ok) {
          const attendance = await attendanceRes.json();
          setTodayAttendance(attendance.todayRecords || []);
          setMonthlyAttendance(attendance.monthlyRecords || []);
        }
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
  const fetchRestockLogs = useCallback(async () => {
    try {
      const res = await fetch('/api/inventory/restock');
      if (!res.ok) return;
      const data = await res.json();
      setRestockLogs(data.logs || []);
      setMonthlyRestockTotal(data.monthlyTotal || 0);
    } catch (error) { console.error(error); }
  }, []);

  const openOrderDetails = async (orderId: string) => {
    setShowOrderDetails(true);
    setSelectedOrder(null);
    setLoadingOrderDetails(true);

    try {
      const res = await fetch(`/api/sales-orders/${orderId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشل تحميل تفاصيل الفاتورة');
      setSelectedOrder(data.order);
    } catch (error: any) {
      setShowOrderDetails(false);
      triggerAlert('error', error.message || 'فشل تحميل تفاصيل الفاتورة');
    } finally {
      setLoadingOrderDetails(false);
    }
  };

  // Fetch Recipes
  const fetchRecipes = useCallback(async () => {
    setLoadingRecipes(true);
    try {
      const res = await fetch('/api/recipes');
      if (res.ok) {
        const data = await res.json();
        setRecipesItems(data.items);
        setRecipesModifiers(data.modifiers);
      }
    } catch (e) {
      console.error(e);
      triggerAlert('error', 'فشل تحميل الوصفات ومقادير الأصناف.');
    } finally {
      setLoadingRecipes(false);
    }
  }, []);

  // Trigger loading based on selected tab
  useEffect(() => {
    if (activeTab === 'dashboard') {
      fetchAnalytics();
    } else if (activeTab === 'inventory') {
      fetchInventory();
      fetchRestockLogs();
    } else if (activeTab === 'wastage') {
      fetchWastage();
    } else if (activeTab === 'recipes') {
      fetchRecipes();
      fetchInventory();
    }
  }, [activeTab, fetchAnalytics, fetchInventory, fetchWastage, fetchRecipes, fetchRestockLogs]);

  // Handle Restock Form POST
  const handleRestockSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMaterialId || !qtyInput || restockAmount === '') return;
    setSubmitLoading(true);

    try {
      const res = await fetch('/api/inventory/restock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rawMaterialId: selectedMaterialId,
          quantity: parseFloat(qtyInput),
          amount: parseFloat(restockAmount),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشلت عملية التوريد');

      triggerAlert('success', 'تم شحن وتوريد الخامة للمخزن بنجاح.');
      setShowRestock(false);
      setQtyInput('');
      setRestockAmount('');
      fetchInventory();
      fetchRestockLogs();
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

  // Handle Add New Raw Material
  const handleAddMaterialSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMatName || !newMatPurchaseUnit || !newMatDeductUnit || !newMatConvFactor) return;
    setSubmitLoading(true);

    try {
      const res = await fetch('/api/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newMatName,
          stockQty: parseFloat(newMatStock) || 0.0,
          minStockLevel: parseFloat(newMatMinStock) || 0.0,
          purchaseUnit: newMatPurchaseUnit,
          deductUnit: newMatDeductUnit,
          conversionFactor: parseFloat(newMatConvFactor) || 1.0,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشلت إضافة الخامة');

      triggerAlert('success', 'تم إضافة الخامة الجديدة بنجاح للمخزن.');
      setShowAddMaterial(false);
      setNewMatName('');
      setNewMatStock('');
      setNewMatMinStock('');
      setNewMatPurchaseUnit('');
      setNewMatDeductUnit('');
      setNewMatConvFactor('');
      fetchInventory();
    } catch (err: any) {
      triggerAlert('error', err.message || 'خطأ في إضافة الخامة');
    } finally {
      setSubmitLoading(false);
    }
  };

  // Handle Save Recipe
  const handleSaveRecipeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRecipeTarget) return;
    setSubmitLoading(true);

    try {
      const isItem = selectedRecipeTarget.type === 'item';
      const body = {
        itemId: isItem ? selectedRecipeTarget.id : undefined,
        modifierId: !isItem ? selectedRecipeTarget.id : undefined,
        ingredients: recipeIngredients.filter(ing => ing.rawMaterialId && ing.quantity > 0),
      };

      const res = await fetch('/api/recipes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) throw new Error('فشل حفظ تفاصيل الوصفة');

      triggerAlert('success', 'تم حفظ وتحديث مقادير الوصفة بنجاح.');
      setSelectedRecipeTarget(null);
      fetchRecipes();
    } catch (err: any) {
      triggerAlert('error', err.message || 'خطأ في حفظ الوصفة');
    } finally {
      setSubmitLoading(false);
    }
  };

  // Add ingredient row to builder
  const addRecipeRow = () => {
    setRecipeIngredients(prev => [...prev, { rawMaterialId: '', quantity: 0 }]);
  };

  // Remove ingredient row from builder
  const removeRecipeRow = (idx: number) => {
    setRecipeIngredients(prev => prev.filter((_, i) => i !== idx));
  };

  // Update ingredient row in builder
  const updateRecipeRow = (idx: number, field: 'rawMaterialId' | 'quantity', value: any) => {
    setRecipeIngredients(prev => prev.map((ing, i) => {
      if (i === idx) {
        return {
          ...ing,
          [field]: field === 'quantity' ? parseFloat(value) || 0 : value,
        };
      }
      return ing;
    }));
  };

  // Open recipe builder
  const startEditRecipe = (target: { type: 'item' | 'modifier'; id: string; name: string; recipe: any[] }) => {
    setSelectedRecipeTarget(target);
    const existing = target.recipe.map(ing => ({
      rawMaterialId: ing.rawMaterialId,
      quantity: ing.quantity,
    }));
    setRecipeIngredients(existing.length > 0 ? existing : [{ rawMaterialId: '', quantity: 0 }]);
  };

  const handleAdminUpdateItemPrice = async (item: { id: string; name: string; price: number }) => {
    const enteredPrice = window.prompt(`السعر الجديد لـ ${item.name}`, String(item.price));
    if (enteredPrice === null) return;
    const price = Number(enteredPrice);
    if (!Number.isFinite(price) || price < 0) {
      triggerAlert('error', 'اكتب سعرًا صحيحًا أكبر من أو يساوي صفر.');
      return;
    }

    try {
      const res = await fetch('/api/items/price', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId: item.id, price }),
      });
      if (!res.ok) throw new Error();
      setRecipesItems((currentItems) => currentItems.map((currentItem) => currentItem.id === item.id ? { ...currentItem, price } : currentItem));
      triggerAlert('success', `تم تعديل سعر ${item.name} إلى EGP ${price.toFixed(2)}`);
    } catch {
      triggerAlert('error', 'تعذر تعديل سعر الصنف.');
    }
  };

  const handleUpdateStockAlertLevel = async (material: RawMaterial) => {
    const entered = window.prompt(`حد التنبيه الجديد لـ ${material.name} (${material.deductUnit})`, String(material.minStockLevel));
    if (entered === null) return;
    const minStockLevel = Number(entered);
    if (!Number.isFinite(minStockLevel) || minStockLevel < 0) {
      triggerAlert('error', 'اكتب حد تنبيه صحيحًا صفر أو أكبر.');
      return;
    }
    try {
      const res = await fetch('/api/inventory', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rawMaterialId: material.id, minStockLevel }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMaterials((current) => current.map((item) => item.id === material.id ? { ...item, minStockLevel, isLowStock: item.stockQty < minStockLevel } : item));
      triggerAlert('success', 'تم تعديل حد التنبيه.');
    } catch (error: any) { triggerAlert('error', error.message || 'تعذر تعديل حد التنبيه.'); }
  };

  const openAddMenuItem = () => {
    const firstCategory = recipesItems[0]?.category?.name || '';
    setNewItemName('');
    setNewItemPrice('');
    setNewItemCategory(firstCategory);
    setNewItemNewCategory('');
    setShowAddMenuItem(true);
  };

  const handleAddMenuItemSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const categoryName = newItemNewCategory.trim() || newItemCategory;
    const price = Number(newItemPrice);
    if (!newItemName.trim() || !categoryName || !Number.isFinite(price) || price < 0) {
      triggerAlert('error', 'اكتب اسم الصنف والقسم والسعر الصحيح.');
      return;
    }
    setSubmitLoading(true);
    try {
      const res = await fetch('/api/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newItemName, price, categoryName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setRecipesItems((current) => [...current, data.item].sort((a, b) => a.name.localeCompare(b.name, 'ar')));
      setShowAddMenuItem(false);
      triggerAlert('success', `تمت إضافة ${data.item.name} بدون وصفة مخزون.`);
    } catch (error: any) {
      triggerAlert('error', error.message || 'تعذر إضافة الصنف.');
    } finally {
      setSubmitLoading(false);
    }
  };

  // SVG Chart Computations
  const displayedTopItems = topItemsByPeriod[topItemsPeriod] || topItems;
  const maxItemTotal = displayedTopItems.reduce((max, i) => Math.max(max, i.total), 0) || 1;
  const totalPaymentSum = (payments.cash + payments.instapay) || 1;
  const cashPct = Math.round((payments.cash / totalPaymentSum) * 100);
  const instapayPct = Math.round((payments.instapay / totalPaymentSum) * 100);

  return (
    <div className="flex flex-col md:flex-row h-screen bg-[#090d16] text-gray-200 overflow-hidden text-right" dir="rtl">
      
      {/* Mobile Top Header (only visible on mobile/tablet screens < md) */}
      <header className="md:hidden h-14 bg-[#0c1424] border-b border-white/5 px-4 flex items-center justify-between shrink-0 no-print">
        <button 
          onClick={() => setShowMobileSidebar(true)}
          className="p-1.5 rounded-lg bg-white/5 text-gray-400 hover:text-white"
        >
          <Menu className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2">
          <h1 className="text-sm font-bold text-white leading-tight">داي أند نايت (الإدارة)</h1>
        </div>
      </header>

      {/* Mobile Drawer Sidebar Overlay */}
      {showMobileSidebar && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm md:hidden flex justify-end no-print">
          <aside className="w-64 bg-[#0c1424] h-full p-6 flex flex-col justify-between border-r border-white/5 animate-slide-left text-right" dir="rtl">
            <div className="space-y-8">
              <div className="flex items-center justify-between flex-row-reverse">
                <button 
                  onClick={() => setShowMobileSidebar(false)}
                  className="p-1.5 rounded-lg bg-white/5 text-gray-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-cyan-500 to-purple-600 flex items-center justify-center font-bold text-white text-xs">
                    DN
                  </div>
                  <span className="text-xs font-bold text-white">لوحة الإدارة</span>
                </div>
              </div>

              {/* Mobile Navigation links */}
              <nav className="space-y-1.5">
                <button
                  onClick={() => { setActiveTab('dashboard'); setShowMobileSidebar(false); }}
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
                  onClick={() => { setActiveTab('inventory'); setShowMobileSidebar(false); }}
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
                  onClick={() => { setActiveTab('wastage'); setShowMobileSidebar(false); }}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-semibold transition-all flex-row-reverse ${
                    activeTab === 'wastage'
                      ? 'bg-cyan-500/15 text-cyan-400 border-r-4 border-cyan-500'
                      : 'text-gray-400 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  <Trash2 className="w-4 h-4 shrink-0" />
                  <span className="w-full text-right">هوالك وتوالف المخزن</span>
                </button>

                <button
                  onClick={() => { setActiveTab('recipes'); setShowMobileSidebar(false); }}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-semibold transition-all flex-row-reverse ${
                    activeTab === 'recipes'
                      ? 'bg-cyan-500/15 text-cyan-400 border-r-4 border-cyan-500'
                      : 'text-gray-400 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  <RefreshCw className="w-4 h-4 shrink-0" />
                  <span className="w-full text-right">وصفات الأصناف</span>
                </button>
              </nav>
            </div>

            {/* Mobile Sidebar Footer */}
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
                  <p className="text-white font-semibold leading-tight text-xs">{user?.name}</p>
                  <p className="text-gray-500 text-[9px] uppercase tracking-wider">مدير النظام</p>
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
        </div>
      )}

      {/* 1. Left Navigation Sidebar (Hidden on mobile) */}
      <aside className="hidden md:flex w-64 bg-[#0c1424] border-l border-white/5 flex-col justify-between p-6 shrink-0">
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

            <button
              onClick={() => setActiveTab('recipes')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-semibold transition-all flex-row-reverse ${
                activeTab === 'recipes'
                  ? 'bg-cyan-500/15 text-cyan-400 border-r-4 border-cyan-500'
                  : 'text-gray-400 hover:bg-white/5 hover:text-white'
              }`}
            >
              <RefreshCw className="w-4 h-4 shrink-0" />
              <span className="w-full text-right">وصفات الأصناف (BOM)</span>
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
      <main className="flex-1 flex flex-col overflow-y-auto md:overflow-hidden">
        
        {/* Top Header Banner */}
        <header className="h-16 border-b border-white/5 px-4 md:px-8 flex items-center justify-between shrink-0 bg-[#090d16] flex-row-reverse">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-gray-500" />
            <span className="text-[10px] sm:text-xs text-gray-400 font-medium">
              تاريخ اليوم: {todayLabel || '...'}
            </span>
          </div>

          {/* Active status widget */}
          <div className="text-[10px] sm:text-xs text-right">
            <span className="text-gray-400 hidden sm:inline">الوردية شغالة حالياً مع: </span>
            <span className="font-bold text-purple-400">{kpis.activeShiftUser}</span>
          </div>
        </header>

        {/* Tab content viewports */}
        <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6">
          
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
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                    <div className="glass-panel rounded-2xl p-6 relative overflow-hidden order-1">
                      <div className="absolute top-0 right-0 w-24 h-24 bg-cyan-500/5 rounded-full blur-2xl"></div>
                      <span className="text-xs text-gray-400 uppercase tracking-wider font-semibold block text-right">إجمالي مبيعات اليوم</span>
                      <p className="text-3xl font-black text-white mt-2 text-right">EGP {kpis.todaySales.toFixed(2)}</p>
                      <span className="text-[10px] text-cyan-400 mt-2 block text-right">إيراد درج الكاشير والطلبات اليوم</span>
                    </div>

                    <div className="glass-panel rounded-2xl p-6 relative overflow-hidden order-5">
                      <div className="absolute top-0 right-0 w-24 h-24 bg-purple-500/5 rounded-full blur-2xl"></div>
                      <span className="text-xs text-gray-400 uppercase tracking-wider font-semibold block text-right">مبيعات الشهر الحالي</span>
                      <p className="text-3xl font-black text-white mt-2 text-right">EGP {kpis.monthlySales.toFixed(2)}</p>
                      <span className="text-[10px] text-purple-400 mt-2 block text-right">المبيعات التراكمية من أول الشهر</span>
                    </div>
                    <div className="glass-panel rounded-2xl p-6 relative overflow-hidden order-2">
                      <span className="text-xs text-gray-400 font-semibold block text-right">مصروفات اليوم</span>
                      <p className="text-3xl font-black text-rose-400 mt-2 text-right">EGP {kpis.todayExpenses.toFixed(2)}</p>
                      <span className="text-[10px] text-gray-500 mt-2 block text-right">توريد اليوم + صرف ستاف اليوم</span>
                    </div>
                    <div className="glass-panel rounded-2xl p-6 relative overflow-hidden order-6">
                      <span className="text-xs text-gray-400 font-semibold block text-right">مصروفات الشهر الحالي</span>
                      <p className="text-3xl font-black text-rose-400 mt-2 text-right">EGP {kpis.monthlyExpenses.toFixed(2)}</p>
                      <span className="text-[10px] text-gray-500 mt-2 block text-right">توريد الشهر + صرف الستاف</span>
                    </div>
                    <div className="glass-panel rounded-2xl p-6 relative overflow-hidden order-3">
                      <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 rounded-full blur-2xl"></div>
                      <span className="text-xs text-gray-400 uppercase tracking-wider font-semibold block text-right">صرف ستاف اليوم</span>
                      <p className="text-3xl font-black text-amber-400 mt-2 text-right">EGP {kpis.todayStaffConsumption.toFixed(2)}</p>
                      <span className="text-[10px] text-amber-400 mt-2 block text-right">تخصم من المخزن ولا تدخل ضمن مبيعات العملاء</span>
                    </div>
                    <div className="glass-panel rounded-2xl p-6 relative overflow-hidden order-7">
                      <span className="text-xs text-gray-400 font-semibold block text-right">صرف ستاف الشهر</span>
                      <p className="text-3xl font-black text-amber-400 mt-2 text-right">EGP {kpis.monthlyStaffConsumption.toFixed(2)}</p>
                      <span className="text-[10px] text-amber-400 mt-2 block text-right">مُحتسب ضمن مصروفات الشهر</span>
                    </div>
                    <div className="glass-panel rounded-2xl p-6 relative overflow-hidden order-4">
                      <span className="text-xs text-gray-400 font-semibold block text-right">صافي اليوم</span>
                      <p className={`text-3xl font-black mt-2 text-right ${kpis.todayNet >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>EGP {kpis.todayNet.toFixed(2)}</p>
                      <span className="text-[10px] text-gray-500 mt-2 block text-right">مبيعات اليوم − مصروفات اليوم</span>
                    </div>
                    <div className="glass-panel rounded-2xl p-6 relative overflow-hidden order-8">
                      <span className="text-xs text-gray-400 font-semibold block text-right">صافي الشهر</span>
                      <p className={`text-3xl font-black mt-2 text-right ${kpis.monthlyNet >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>EGP {kpis.monthlyNet.toFixed(2)}</p>
                      <span className="text-[10px] text-gray-500 mt-2 block text-right">مبيعات الشهر − مصروفات الشهر</span>
                    </div>

                  </div>

                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                    {[
                      ['سجل حضور اليوم', todayAttendance],
                      ['سجل حضور الشهر الحالي', monthlyAttendance],
                    ].map(([title, records]) => (
                      <div key={title as string} className="glass-panel rounded-2xl p-5 text-right">
                        <h3 className="font-bold text-sm text-white">{title as string}</h3>
                        <div className="mt-4 max-h-72 overflow-y-auto space-y-2 pr-1">
                          {(records as AttendanceRecord[]).length ? (records as AttendanceRecord[]).map((record) => {
                            const checkIn = new Date(record.checkedInAt);
                            const checkOut = record.checkedOutAt ? new Date(record.checkedOutAt) : null;
                            const hours = checkOut ? ((checkOut.getTime() - checkIn.getTime()) / 3600000).toFixed(2) : null;
                            return <div key={record.id} className="rounded-lg bg-white/5 px-3 py-2 text-xs">
                              <div className="flex justify-between flex-row-reverse"><span className="font-bold text-white">{record.employeeName}</span><span className={checkOut ? 'text-emerald-400' : 'text-amber-400'}>{checkOut ? `${hours} ساعة` : 'حاضر الآن'}</span></div>
                              <p className="mt-1 text-gray-400">حضور: {checkIn.toLocaleString('ar-EG')}</p>
                              <p className="mt-1 text-gray-400">انصراف: {checkOut ? checkOut.toLocaleString('ar-EG') : 'لم يسجل انصرافًا بعد'}</p>
                            </div>;
                          }) : <p className="py-6 text-center text-xs text-gray-500">لا توجد تسجيلات حضور.</p>}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Owner reports: all recorded days, months, and shifts */}
                  <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                    <div className="glass-panel rounded-2xl p-5 text-right">
                      <h3 className="font-bold text-sm text-white">المبيعات حسب اليوم</h3>
                      <div className="mt-4 max-h-72 overflow-y-auto space-y-2 pr-1">
                        {dailySales.length ? dailySales.map((day) => (
                          <div key={day.period} className="flex justify-between rounded-lg bg-white/5 px-3 py-2 text-xs flex-row-reverse">
                            <span className="text-gray-300">{new Date(`${day.period}T12:00:00`).toLocaleDateString('ar-EG')}</span>
                            <span className="font-bold text-cyan-400">EGP {day.total.toFixed(2)} <span className="font-normal text-gray-500">({day.orders} فاتورة)</span></span>
                          </div>
                        )) : <p className="py-6 text-center text-xs text-gray-500">لا توجد مبيعات مسجلة.</p>}
                      </div>
                    </div>

                    <div className="glass-panel rounded-2xl p-5 text-right">
                      <h3 className="font-bold text-sm text-white">المبيعات حسب الشهر</h3>
                      <div className="mt-4 max-h-72 overflow-y-auto space-y-2 pr-1">
                        {monthlySalesHistory.length ? monthlySalesHistory.map((month) => (
                          <div key={month.period} className="flex justify-between rounded-lg bg-white/5 px-3 py-2 text-xs flex-row-reverse">
                            <span className="text-gray-300">{new Date(`${month.period}-01T12:00:00`).toLocaleDateString('ar-EG', { year: 'numeric', month: 'long' })}</span>
                            <span className="font-bold text-purple-400">EGP {month.total.toFixed(2)} <span className="font-normal text-gray-500">({month.orders} فاتورة)</span></span>
                          </div>
                        )) : <p className="py-6 text-center text-xs text-gray-500">لا توجد مبيعات مسجلة.</p>}
                      </div>
                    </div>

                    <div className="glass-panel rounded-2xl p-5 text-right">
                      <h3 className="font-bold text-sm text-white">سجل الورديات</h3>
                      <div className="mt-4 max-h-72 overflow-y-auto space-y-2 pr-1">
                        {shiftSummaries.length ? shiftSummaries.map((shift) => (
                          <div key={shift.id} className="rounded-lg bg-white/5 px-3 py-2 text-xs">
                            <div className="flex justify-between flex-row-reverse">
                              <span className="font-semibold text-white">{shift.cashierName}</span>
                              <span className={shift.closedAt ? 'text-gray-400' : 'text-emerald-400'}>{shift.closedAt ? 'مقفلة' : 'مفتوحة'}</span>
                            </div>
                            <p className="mt-1 text-gray-400">{new Date(shift.openedAt).toLocaleString('ar-EG')}</p>
                            <div className="mt-1 flex justify-between flex-row-reverse">
                              <span className="text-gray-400">{shift.orderCount} فاتورة</span>
                              <span className="font-bold text-cyan-400">EGP {shift.totalSales.toFixed(2)}</span>
                            </div>
                            <p className="mt-1 text-[10px] text-gray-500">كاش {shift.cashSales.toFixed(2)} · إنستا باي {shift.instaPaySales.toFixed(2)}</p>
                            {shift.staffConsumption > 0 && <p className="mt-1 text-[10px] text-amber-400">صرف ستاف {shift.staffConsumption.toFixed(2)}</p>}
                            {shift.closedAt && (
                              <div className="mt-2 border-t border-white/5 pt-2 text-[10px]">
                                <p className="text-gray-400">الدرج: متوقع EGP {shift.expectedCash.toFixed(2)} · فعلي EGP {(shift.closedCash || 0).toFixed(2)}</p>
                                {shift.varianceCash < 0 ? (
                                  <p className="mt-1 font-bold text-rose-400">عجز كاش: EGP {Math.abs(shift.varianceCash).toFixed(2)}</p>
                                ) : shift.varianceCash > 0 ? (
                                  <p className="mt-1 font-bold text-emerald-400">زيادة كاش: EGP {shift.varianceCash.toFixed(2)}</p>
                                ) : (
                                  <p className="mt-1 font-bold text-emerald-400">الكاش مطابق للتسوية</p>
                                )}
                              </div>
                            )}
                          </div>
                        )) : <p className="py-6 text-center text-xs text-gray-500">لا توجد ورديات مسجلة.</p>}
                      </div>
                    </div>
                  </div>

                  {/* Charts & Warning Widgets */}
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    
                    {/* Top Selling Items (Custom SVG Horizontal Bar Chart) */}
                    <div className="glass-panel rounded-2xl p-6 lg:col-span-2 space-y-4">
                      <div className="flex items-center justify-between gap-3 flex-row-reverse">
                        <h3 className="font-bold text-sm text-white text-right">الأصناف الأكثر مبيعًا</h3>
                        <div className="flex gap-1 rounded-lg bg-slate-900/70 p-1">
                          {([
                            ['today', 'اليوم'],
                            ['month', 'الشهر'],
                            ['all', 'كل الوقت'],
                          ] as const).map(([period, label]) => (
                            <button
                              key={period}
                              onClick={() => setTopItemsPeriod(period)}
                              className={`px-2.5 py-1 rounded-md text-[10px] font-semibold transition-colors ${topItemsPeriod === period ? 'bg-cyan-500 text-white' : 'text-gray-400 hover:text-white'}`}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      </div>
                      
                      <div className="space-y-4 pt-2">
                        {displayedTopItems.length > 0 ? (
                          displayedTopItems.map((item, idx) => {
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
                          <p className="text-xs text-gray-500 italic py-6 text-center">لا توجد مبيعات في هذه الفترة.</p>
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
                                <tr key={ord.id} onClick={() => openOrderDetails(ord.id)} className="border-b border-white/5 text-gray-300 cursor-pointer hover:bg-cyan-500/5 transition-colors">
                                  <td className="py-3">
                                    <p className="font-mono text-cyan-400 underline underline-offset-4 decoration-cyan-400/40">{ord.receiptNumber || ord.id.slice(0, 8)}</p>
                                    {ord.discount > 0 && <p className="mt-1 text-[10px] font-bold text-rose-300">خصم: EGP {ord.discount.toFixed(2)}</p>}
                                  </td>
                                  <td className="py-3">{new Date(ord.createdAt).toLocaleTimeString()}</td>
                                  <td className="py-3">
                                    {ord.paymentMethod !== 'STAFF' && (
                                      <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                                        ord.orderType === 'DINE_IN' ? 'bg-cyan-500/10 text-cyan-400' : 'bg-amber-500/10 text-amber-400'
                                      }`}>
                                        {ord.orderType === 'DINE_IN' ? `صالة (${ord.table?.name || 'طاولة'})` : 'تيك أواي'}
                                      </span>
                                    )}
                                  </td>
                                  <td className="py-3 font-bold text-[10px] uppercase tracking-wider">{ord.paymentMethod === 'CASH' ? 'كاش' : ord.paymentMethod === 'INSTAPAY' ? 'إنستا باي' : 'صرف ستاف'}</td>
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
                    onClick={() => setShowAddMaterial(true)}
                    className="px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
                  >
                    <PlusCircle className="w-4 h-4 shrink-0" />
                    <span>إضافة مادة خام جديدة</span>
                  </button>

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
                <>
                <div className="glass-panel rounded-2xl p-4 flex items-center justify-between flex-row-reverse">
                  <div><p className="text-xs text-gray-400">مصروفات التوريد هذا الشهر</p><p className="text-2xl font-bold text-amber-400 mt-1">EGP {monthlyRestockTotal.toFixed(2)}</p></div>
                  <span className="text-xs text-gray-500">يشمل كل التوريدات المسجلة</span>
                </div>
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
                        <th className="p-4">العمليات</th>
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
                          <td className="p-4"><button onClick={() => handleUpdateStockAlertLevel(mat)} className="text-gray-300 hover:text-cyan-400 underline decoration-dotted underline-offset-4">{mat.minStockLevel} {mat.deductUnit}</button></td>
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
                          <td className="p-4">
                            <div className="flex gap-2 flex-row-reverse">
                              <button
                                onClick={() => { setSelectedMaterialId(mat.id); setQtyInput(''); setShowRestock(true); }}
                                className="px-2.5 py-1 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/20 rounded-lg text-[10px] font-bold transition-all"
                              >
                                توريد
                              </button>
                              <button
                                onClick={() => { setSelectedMaterialId(mat.id); setQtyInput(''); setReasonInput(''); setShowWastage(true); }}
                                className="px-2.5 py-1 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 rounded-lg text-[10px] font-bold transition-all whitespace-nowrap"
                              >
                                تسجيل هالك
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="glass-panel rounded-2xl overflow-hidden">
                  <div className="p-4 border-b border-white/5 font-bold text-sm text-white">سجل التوريدات</div>
                  <div className="max-h-64 overflow-y-auto"><table className="w-full text-right text-xs"><thead><tr className="text-gray-500 border-b border-white/5"><th className="p-3">التاريخ والوقت</th><th className="p-3">الخامة</th><th className="p-3">الكمية</th><th className="p-3">المبلغ</th></tr></thead><tbody>{restockLogs.length ? restockLogs.map((log) => <tr key={log.id} className="border-b border-white/5 text-gray-300"><td className="p-3">{new Date(log.createdAt).toLocaleString('ar-EG')}</td><td className="p-3 font-semibold text-white">{log.rawMaterial.name}</td><td className="p-3">{log.quantity} {log.rawMaterial.purchaseUnit}</td><td className="p-3 font-bold text-amber-400">EGP {log.amount.toFixed(2)}</td></tr>) : <tr><td colSpan={4} className="p-6 text-center text-gray-500">لا توجد توريدات مسجلة بعد.</td></tr>}</tbody></table></div>
                </div>
                </>
              )}
            </div>
          )}

          {/* TAB 3: WASTAGE LOGS */}
          {activeTab === 'wastage' && (
            <div className="space-y-6">
              <div className="text-right">
                <h2 className="text-xl font-bold text-white">هوالك وتوالف المخزن</h2>
                <p className="text-xs text-gray-400 mt-1">كل كمية هالك تم تسجيلها من الكاشير أو الإدارة تظهر هنا.</p>
              </div>

              {loadingWastage ? (
                <div className="h-64 flex items-center justify-center gap-2 text-sm text-gray-400">
                  <RefreshCw className="w-4 h-4 animate-spin text-cyan-400" />
                  <span>جاري تحميل سجل الهوالك...</span>
                </div>
              ) : (
                <div className="glass-panel rounded-2xl overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-right text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-900/50 border-b border-white/5 text-gray-400">
                          <th className="p-4">التاريخ والوقت</th>
                          <th className="p-4">الخامة</th>
                          <th className="p-4">الكمية</th>
                          <th className="p-4">سبب الهالك</th>
                        </tr>
                      </thead>
                      <tbody>
                        {wastageLogs.length ? wastageLogs.map((log) => (
                          <tr key={log.id} className="border-b border-white/5 text-gray-300 hover:bg-white/5">
                            <td className="p-4 text-gray-400">{new Date(log.createdAt).toLocaleString('ar-EG')}</td>
                            <td className="p-4 font-semibold text-white">{log.rawMaterial.name}</td>
                            <td className="p-4 font-bold text-rose-400">{log.quantity} {log.rawMaterial.deductUnit}</td>
                            <td className="p-4">{log.reason}</td>
                          </tr>
                        )) : (
                          <tr>
                            <td colSpan={4} className="p-10 text-center text-gray-500">لا توجد هوالك مسجلة حتى الآن.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: RECIPES MANAGEMENT (BOM) */}
          {activeTab === 'recipes' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between gap-4 flex-row-reverse">
                <div className="text-right">
                  <h2 className="text-xl font-bold text-white">إدارة وصفات ومكونات الأصناف (BOM)</h2>
                  <p className="text-xs text-gray-400 mt-1">حدد المكونات والخامات التي يستهلكها كل صنف أو إضافة ليتم خصمها تلقائياً من المخزن فور البيع.</p>
                </div>
                <button onClick={openAddMenuItem} className="px-4 py-2 bg-gradient-to-r from-cyan-500 to-purple-600 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shrink-0">
                  <PlusCircle className="w-4 h-4" />
                  إضافة صنف
                </button>
              </div>

              {loadingRecipes ? (
                <div className="h-96 flex items-center justify-center gap-2 text-sm text-gray-400">
                  <RefreshCw className="w-4 h-4 animate-spin text-cyan-400" />
                  <span>جاري تحميل قائمة الوصفات والمنتجات...</span>
                </div>
              ) : selectedRecipeTarget ? (
                // --- RECIPE BUILDER WORKSPACE ---
                <div className="glass-panel rounded-2xl p-6 space-y-6">
                  <div className="flex items-center justify-between border-b border-white/5 pb-4 flex-row-reverse">
                    <div className="text-right">
                      <span className="px-2 py-0.5 bg-cyan-500/10 text-cyan-400 rounded text-[10px] font-bold">
                        {selectedRecipeTarget.type === 'item' ? 'صنف منيو' : 'إضافة للطلب'}
                      </span>
                      <h3 className="text-lg font-bold text-white mt-1">تعديل مقادير الوصفة لـ: {selectedRecipeTarget.name}</h3>
                    </div>
                    <button
                      onClick={() => setSelectedRecipeTarget(null)}
                      className="px-3 py-1.5 rounded-xl border border-white/10 hover:bg-white/5 text-gray-300 text-xs font-semibold"
                    >
                      إلغاء والرجوع للقائمة
                    </button>
                  </div>

                  <form onSubmit={handleSaveRecipeSubmit} className="space-y-5">
                    <div className="space-y-3">
                      <div className="grid grid-cols-12 gap-4 text-xs text-gray-400 font-bold px-2 flex-row-reverse text-right">
                        <div className="col-span-6">اسم المادة الخام من المخزن</div>
                        <div className="col-span-4">الكمية المستهلكة (بوحدة الاستهلاك الصغرى)</div>
                        <div className="col-span-2 text-left">حذف</div>
                      </div>

                      {recipeIngredients.map((ing, idx) => (
                        <div key={idx} className="grid grid-cols-12 gap-4 items-center">
                          <div className="col-span-6">
                            <select
                              required
                              value={ing.rawMaterialId}
                              onChange={(e) => updateRecipeRow(idx, 'rawMaterialId', e.target.value)}
                              className="w-full bg-slate-900 border border-white/10 rounded-xl py-2 px-3 text-xs text-white focus:outline-none focus:border-cyan-500"
                            >
                              <option value="">اختار المادة الخام...</option>
                              {materials.map((m) => (
                                <option key={m.id} value={m.id}>{m.name} ({m.deductUnit})</option>
                              ))}
                            </select>
                          </div>
                          <div className="col-span-4 relative">
                            <input
                              type="number"
                              required
                              value={ing.quantity || ''}
                              onChange={(e) => updateRecipeRow(idx, 'quantity', e.target.value)}
                              className="w-full bg-slate-900 border border-white/10 rounded-xl py-2 pl-12 pr-3 text-xs text-white focus:outline-none focus:border-cyan-500 text-right"
                              placeholder="0.00"
                              min="0"
                              step="any"
                            />
                            <span className="absolute left-3 top-2 text-[10px] text-gray-500">
                              {materials.find(m => m.id === ing.rawMaterialId)?.deductUnit || ''}
                            </span>
                          </div>
                          <div className="col-span-2 text-left">
                            <button
                              type="button"
                              onClick={() => removeRecipeRow(idx)}
                              className="p-2 text-rose-500 hover:text-rose-400 rounded-lg hover:bg-rose-500/10 transition-all"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="flex gap-4 pt-4 border-t border-white/5 justify-between">
                      <button
                        type="button"
                        onClick={addRecipeRow}
                        className="px-3.5 py-2 border border-dashed border-white/10 hover:border-cyan-500/40 text-cyan-400 hover:bg-cyan-500/5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5"
                      >
                        <PlusCircle className="w-4 h-4" />
                        <span>إضافة مادة خام للوصفة</span>
                      </button>

                      <button
                        type="submit"
                        disabled={submitLoading}
                        className="px-6 py-2 bg-gradient-to-r from-cyan-500 to-purple-600 text-white font-bold rounded-xl text-xs shadow-lg shadow-cyan-500/10"
                      >
                        {submitLoading ? 'جاري الحفظ...' : 'حفظ وتثبيت الوصفة'}
                      </button>
                    </div>
                  </form>
                </div>
              ) : (
                // --- RECIPES LIST VIEWER ---
                <div className="grid grid-cols-1 gap-6">
                  {/* Items Recipes */}
                  <div className="glass-panel rounded-2xl p-6 space-y-4">
                    <h3 className="font-bold text-sm text-white text-right pb-2 border-b border-white/5">وصفات أصناف المنيو</h3>
                    <div className="space-y-2.5 max-h-[500px] overflow-y-auto pl-1">
                      {recipesItems.map((item) => (
                        <div key={item.id} className="p-3.5 bg-slate-900/50 border border-white/5 rounded-xl flex items-center justify-between gap-4 text-xs flex-row-reverse">
                          <div className="text-right">
                            <h4 className="font-bold text-white text-sm">{item.name}</h4>
                            <p className="text-gray-500 mt-1">
                              {item.recipe.length > 0 ? (
                                <span className="flex flex-wrap gap-1 mt-0.5 justify-start">
                                  {item.recipe.map((ing: any, i: number) => (
                                    <span key={i} className="px-1.5 py-0.5 bg-white/5 rounded border border-white/5 text-[10px] text-gray-300">
                                      {ing.rawMaterial.name} ({ing.quantity}{ing.rawMaterial.deductUnit})
                                    </span>
                                  ))}
                                </span>
                              ) : (
                                <span className="text-[10px] text-amber-500">لا توجد وصفة (لن يخصم من المخزن)</span>
                              )}
                            </p>
                          </div>
                          <div className="flex gap-2 shrink-0">
                            <button
                              onClick={() => handleAdminUpdateItemPrice(item)}
                              className="px-2.5 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 rounded-lg font-semibold transition-all"
                            >
                              السعر: EGP {item.price.toFixed(2)}
                            </button>
                            <button
                              onClick={() => startEditRecipe({ type: 'item', id: item.id, name: item.name, recipe: item.recipe })}
                              className="px-2.5 py-1.5 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/20 rounded-lg font-semibold transition-all"
                            >
                              تعديل الوصفة
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
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

      {/* ADD MENU ITEM DIALOG */}
      {showAddMenuItem && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="w-full max-w-md glass-panel rounded-2xl p-6 relative text-right" dir="rtl">
            <button onClick={() => setShowAddMenuItem(false)} className="absolute top-4 left-4 text-gray-400 hover:text-white" aria-label="إغلاق">
              <X className="w-5 h-5" />
            </button>
            <h3 className="text-xl font-bold text-white mb-2">إضافة صنف جديد</h3>
            <p className="text-xs text-amber-300/90 mb-6">الصنف سيظهر في الكاشير بدون وصفة، لذلك لن يخصم من المخزن حتى تضيف وصفته.</p>

            <form onSubmit={handleAddMenuItemSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-2">اسم الصنف</label>
                <input type="text" required value={newItemName} onChange={(e) => setNewItemName(e.target.value)} className="w-full bg-slate-900 border border-white/10 rounded-xl py-2.5 px-4 text-white focus:outline-none focus:border-cyan-500 text-right" placeholder="مثال: كريب نوتيلا" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-2">السعر (EGP)</label>
                <input type="number" required min="0" step="0.01" value={newItemPrice} onChange={(e) => setNewItemPrice(e.target.value)} className="w-full bg-slate-900 border border-white/10 rounded-xl py-2.5 px-4 text-white focus:outline-none focus:border-cyan-500 text-right" placeholder="0.00" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-2">القسم</label>
                <select value={newItemCategory} onChange={(e) => setNewItemCategory(e.target.value)} disabled={Boolean(newItemNewCategory.trim())} className="w-full bg-slate-900 border border-white/10 rounded-xl py-2.5 px-4 text-white focus:outline-none focus:border-cyan-500 disabled:opacity-40">
                  {Array.from(new Set(recipesItems.map((item) => item.category?.name).filter(Boolean))).sort((a: string, b: string) => a.localeCompare(b, 'ar')).map((categoryName: string) => <option key={categoryName} value={categoryName}>{categoryName}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-2">أو أضف قسمًا جديدًا</label>
                <input type="text" value={newItemNewCategory} onChange={(e) => setNewItemNewCategory(e.target.value)} className="w-full bg-slate-900 border border-white/10 rounded-xl py-2.5 px-4 text-white focus:outline-none focus:border-cyan-500 text-right" placeholder="اتركه فارغًا لاستخدام القسم المختار" />
              </div>
              <button type="submit" disabled={submitLoading} className="w-full py-3 bg-gradient-to-r from-cyan-500 to-purple-600 text-white font-bold rounded-xl shadow-lg transition-all">
                {submitLoading ? 'جاري إضافة الصنف...' : 'إضافة الصنف'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* INVOICE DETAILS DIALOG */}
      {showOrderDetails && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setShowOrderDetails(false)}>
          <div className="w-full max-w-lg max-h-[85vh] overflow-y-auto glass-panel rounded-2xl p-6 relative text-right" dir="rtl" onClick={(event) => event.stopPropagation()}>
            <button onClick={() => setShowOrderDetails(false)} className="absolute top-4 left-4 text-gray-400 hover:text-white" aria-label="إغلاق">
              <X className="w-5 h-5" />
            </button>

            {loadingOrderDetails ? (
              <div className="h-48 flex items-center justify-center gap-2 text-sm text-gray-400">
                <RefreshCw className="w-5 h-5 animate-spin text-cyan-400" />
                <span>جاري تحميل تفاصيل الفاتورة...</span>
              </div>
            ) : selectedOrder && (
              <>
                <div className="border-b border-white/10 pb-4 mb-4">
                  <h3 className="text-lg font-bold text-white">تفاصيل الفاتورة</h3>
                  <p className="font-mono text-sm text-cyan-400 mt-1">{selectedOrder.receiptNumber || selectedOrder.id.slice(0, 8)}</p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2 mt-4 text-xs">
                    <p className="text-gray-400">التاريخ: <span className="text-white">{new Date(selectedOrder.createdAt).toLocaleString('ar-EG')}</span></p>
                    <p className="text-gray-400">الدفع: <span className="text-white">{selectedOrder.paymentMethod === 'CASH' ? 'كاش' : selectedOrder.paymentMethod === 'INSTAPAY' ? 'إنستا باي' : 'صرف ستاف'}</span></p>
                    {selectedOrder.paymentMethod !== 'STAFF' && <p className="text-gray-400">النوع: <span className="text-white">{selectedOrder.orderType === 'DINE_IN' ? `صالة - ${selectedOrder.table?.name || 'طاولة'}` : 'تيك أواي'}</span></p>}
                    {selectedOrder.paymentMethod === 'STAFF' && selectedOrder.staffName && <p className="text-gray-400">اسم الستاف: <span className="text-white">{selectedOrder.staffName}</span></p>}
                  </div>
                </div>

                <div className="space-y-3">
                  {selectedOrder.items.map((line) => (
                    <div key={line.id} className="rounded-xl bg-slate-900/70 border border-white/5 p-3">
                      <div className="flex justify-between gap-3 text-sm font-bold text-white">
                        <span>{line.item.name} <span className="text-gray-400 font-normal">× {line.qty}</span></span>
                        <span className="whitespace-nowrap">EGP {line.totalPrice.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between mt-1 text-[11px] text-gray-400">
                        <span>سعر القطعة: EGP {line.unitPrice.toFixed(2)}</span>
                        {line.modifiers.length > 0 && <span>إضافات: EGP {line.modifiers.reduce((sum, mod) => sum + mod.unitPriceImpact, 0).toFixed(2)}</span>}
                      </div>
                      {line.modifiers.length > 0 && <p className="mt-2 text-[11px] text-purple-300">{line.modifiers.map((mod) => mod.modifier.name).join('، ')}</p>}
                    </div>
                  ))}
                </div>

                <div className="border-t border-white/10 mt-5 pt-4 space-y-2 text-sm">
                  <div className="flex justify-between text-gray-400"><span>الإجمالي قبل الخصم</span><span>EGP {selectedOrder.subtotal.toFixed(2)}</span></div>
                  {selectedOrder.discount > 0 && <>
                    <div className="flex justify-between text-rose-300"><span>الخصم</span><span>- EGP {selectedOrder.discount.toFixed(2)}</span></div>
                    <p className="text-xs text-rose-200/90">سبب الخصم: {selectedOrder.discountReason || 'غير مسجل (فاتورة قديمة)'}</p>
                  </>}
                  <div className="flex justify-between text-base font-bold text-cyan-400"><span>الإجمالي النهائي</span><span>EGP {selectedOrder.total.toFixed(2)}</span></div>
                </div>
              </>
            )}
          </div>
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
              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-2">إجمالي مبلغ التوريد (EGP)</label>
                <input type="number" required value={restockAmount} onChange={(e) => setRestockAmount(e.target.value)} className="w-full bg-slate-900 border border-white/10 rounded-xl py-2.5 px-4 text-white focus:outline-none focus:border-amber-500 text-right" placeholder="مثال: 500" min="0" step="0.01" />
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

      {/* ADD NEW RAW MATERIAL MODAL */}
      {showAddMaterial && (
        <div className="fixed inset-0 z-40 bg-black/75 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="w-full max-w-md glass-panel rounded-2xl p-6 relative text-right" dir="rtl">
            <button 
              onClick={() => setShowAddMaterial(false)}
              className="absolute top-4 left-4 text-gray-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
            <h3 className="text-xl font-bold text-white mb-2">إضافة مادة خام جديدة للمخزن</h3>
            <p className="text-xs text-gray-400 mb-6">سجل تفاصيل المادة الخام الجديدة، رصيد الافتتاح، ووحدات القياس.</p>
            
            <form onSubmit={handleAddMaterialSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1.5">اسم المادة الخام</label>
                <input
                  type="text"
                  required
                  value={newMatName}
                  onChange={(e) => setNewMatName(e.target.value)}
                  className="w-full bg-slate-900 border border-white/10 rounded-xl py-2 px-3 text-xs text-white focus:outline-none focus:border-cyan-500 text-right"
                  placeholder="مثال: حليب كامل الدسم المراعي"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-400 mb-1.5">الرصيد الافتتاحي</label>
                  <input
                    type="number"
                    value={newMatStock}
                    onChange={(e) => setNewMatStock(e.target.value)}
                    className="w-full bg-slate-900 border border-white/10 rounded-xl py-2 px-3 text-xs text-white focus:outline-none focus:border-cyan-500 text-right"
                    placeholder="0.00"
                    min="0"
                    step="any"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-400 mb-1.5">حد التنبيه للنفاد</label>
                  <input
                    type="number"
                    value={newMatMinStock}
                    onChange={(e) => setNewMatMinStock(e.target.value)}
                    className="w-full bg-slate-900 border border-white/10 rounded-xl py-2 px-3 text-xs text-white focus:outline-none focus:border-cyan-500 text-right"
                    placeholder="مثال: 10"
                    min="0"
                    step="any"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-[10px] font-semibold text-gray-400 mb-1.5">وحدة الشراء (الكبرى)</label>
                  <input
                    type="text"
                    required
                    value={newMatPurchaseUnit}
                    onChange={(e) => setNewMatPurchaseUnit(e.target.value)}
                    className="w-full bg-slate-900 border border-white/10 rounded-xl py-2 px-3 text-[11px] text-white focus:outline-none focus:border-cyan-500 text-right"
                    placeholder="مثال: علبة"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-gray-400 mb-1.5">وحدة الاستهلاك (الصغرى)</label>
                  <input
                    type="text"
                    required
                    value={newMatDeductUnit}
                    onChange={(e) => setNewMatDeductUnit(e.target.value)}
                    className="w-full bg-slate-900 border border-white/10 rounded-xl py-2 px-3 text-[11px] text-white focus:outline-none focus:border-cyan-500 text-right"
                    placeholder="مثال: مل"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-gray-400 mb-1.5">معامل التحويل (الكبيرة للصغيرة)</label>
                  <input
                    type="number"
                    required
                    value={newMatConvFactor}
                    onChange={(e) => setNewMatConvFactor(e.target.value)}
                    className="w-full bg-slate-900 border border-white/10 rounded-xl py-2 px-3 text-[11px] text-white focus:outline-none focus:border-cyan-500 text-right"
                    placeholder="مثال: 1000"
                    min="1"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={submitLoading}
                className="w-full py-3 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-bold rounded-xl shadow-lg transition-all mt-3 text-xs"
              >
                {submitLoading ? 'جاري إضافة الخامة...' : 'إضافة المادة الخام وتأكيد الحفظ'}
              </button>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
