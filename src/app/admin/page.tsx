'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/lib/store';
import { 
  TrendingUp, Package, AlertTriangle, Users, LogOut, 
  Trash2, DollarSign, CheckCircle2, RefreshCw, 
  Calendar, PlusCircle, ShoppingBag, X, Pencil,
  CreditCard, Smartphone, RotateCcw, UserPlus, Tag, 
  FileText, Download, BarChart3, Receipt, Truck,
  HelpCircle, ShieldAlert, ArrowDownRight, ArrowUpRight,
  Eye, Search, Filter, Printer, Clock, Store, Menu, Loader2
} from 'lucide-react';

interface KPIState {
  todaySales: number;
  monthlySales: number;
  todayOrdersCount: number;
  monthlyOrdersCount: number;
  todayAvgTicket: number;
  monthlyAvgTicket: number;
  todayDiscounts: number;
  monthlyDiscounts: number;
  todayReturnsCount: number;
  todayReturnsAmount: number;
  monthlyReturnsAmount: number;
  todayCOGS: number;
  monthlyCOGS: number;
  todayExpenses: number;
  monthlyExpenses: number;
  todaySuppliesPaid: number;
  monthlySuppliesPaid: number;
  todayNetRevenueAfterSupplies: number;
  monthlyNetRevenueAfterSupplies: number;
  todayNet: number;
  monthlyNet: number;
  activeShiftUser: string;
  activeShiftExpected: number;
}

interface PaymentBreakdown {
  cash: number;
  visa: number;
  instapay: number;
  vodafoneCash: number;
  cashOut: number;
}

interface ProductCostItem {
  id: string;
  name: string;
  categoryId?: string;
  categoryName: string;
  price: number;
  cost?: number;
  unitCost: number;
  profitPerUnit: number;
  profitMarginPct: number;
  hasRecipe: boolean;
  qtySoldToday: number;
  totalRevenueToday: number;
  totalCostToday: number;
  totalProfitToday: number;
  stockQty?: number;
  minStockLevel?: number;
  unit?: string;
  isLowStock?: boolean;
  ingredients: Array<{
    rawMaterialId?: string;
    materialName: string;
    quantity: number;
    deductUnit: string;
    cost: number;
  }>;
}

const navItems = [
  { id: 'dashboard', label: 'اليومية ومؤشرات المحل', shortLabel: 'اليومية', icon: BarChart3 },
  { id: 'invoices-ledger', label: 'دفتر فواتير ومبيعات المحل', shortLabel: 'دفتر المبيعات', icon: Calendar },
  { id: 'purchases', label: 'الوارد وحسابات المعلمين', shortLabel: 'الوارد والتجار', icon: Truck },
  { id: 'returns', label: 'مرتجعات الزباين', shortLabel: 'المرتجعات', icon: RotateCcw },
  { id: 'expenses', label: 'مصاريف وخرجيات المحل', shortLabel: 'المصاريف', icon: Receipt },
  { id: 'profitability', label: 'حسبة التكلفة وهوامش المكسب', shortLabel: 'التكلفة والأرباح', icon: DollarSign },
  { id: 'inventory', label: 'تسجيل التالف والهالك', shortLabel: 'الهالك والتالف', icon: AlertTriangle },
  { id: 'reports', label: 'تقارير المبيعات والأرباح', shortLabel: 'التقارير الشاملة', icon: FileText },
];

export default function AdminPage() {
  const router = useRouter();
  const { user, logout } = useAppStore();

  // Active Navigation Tab
  const [activeTab, setActiveTab] = useState<
    'dashboard' | 'invoices-ledger' | 'purchases' | 'returns' | 'expenses' | 'profitability' | 'inventory' | 'reports'
  >('dashboard');

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [alertMsg, setAlertMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [todayLabel, setTodayLabel] = useState('');
  const [mounted, setMounted] = useState(false);

  // 1. Dashboard State
  const [kpis, setKpis] = useState<KPIState>({
    todaySales: 0,
    monthlySales: 0,
    todayOrdersCount: 0,
    monthlyOrdersCount: 0,
    todayAvgTicket: 0,
    monthlyAvgTicket: 0,
    todayDiscounts: 0,
    monthlyDiscounts: 0,
    todayReturnsCount: 0,
    todayReturnsAmount: 0,
    monthlyReturnsAmount: 0,
    todayCOGS: 0,
    monthlyCOGS: 0,
    todayExpenses: 0,
    monthlyExpenses: 0,
    todaySuppliesPaid: 0,
    monthlySuppliesPaid: 0,
    todayNetRevenueAfterSupplies: 0,
    monthlyNetRevenueAfterSupplies: 0,
    todayNet: 0,
    monthlyNet: 0,
    activeShiftUser: 'جاري التحميل...',
    activeShiftExpected: 0,
  });
  const [payments, setPayments] = useState<PaymentBreakdown>({ cash: 0, visa: 0, instapay: 0, vodafoneCash: 0, cashOut: 0 });
  const [topItems, setTopItems] = useState<any[]>([]);
  const [topItemsByPeriod, setTopItemsByPeriod] = useState<{
    today: any[];
    month: any[];
    all: any[];
  }>({ today: [], month: [], all: [] });
  const [topItemsPeriod, setTopItemsPeriod] = useState<'today' | 'month' | 'all'>('today');
  const [recentOrders, setRecentOrders] = useState<any[]>([]);
  const [dailySales, setDailySales] = useState<any[]>([]);
  const [discountsBreakdown, setDiscountsBreakdown] = useState<Array<{ reason: string; count: number; totalAmount: number }>>([]);
  const [shiftSummaries, setShiftSummaries] = useState<any[]>([]);
  const [loadingAnalytics, setLoadingAnalytics] = useState(true);

  // 2. Purchases & Suppliers State
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [purchaseInvoices, setPurchaseInvoices] = useState<any[]>([]);
  const [showAddSupplierModal, setShowAddSupplierModal] = useState(false);
  const [showAddPurchaseModal, setShowAddPurchaseModal] = useState(false);
  const [newSuppName, setNewSuppName] = useState('');
  const [newSuppPhone, setNewSuppPhone] = useState('');
  const [newSuppCompany, setNewSuppCompany] = useState('');
  const [newSuppAddress, setNewSuppAddress] = useState('');
  const [newSuppNotes, setNewSuppNotes] = useState('');
  // Purchase Form
  const [purSupplierId, setPurSupplierId] = useState('');
  const [purPaymentMethod, setPurPaymentMethod] = useState('CASH');
  const [purPaidAmount, setPurPaidAmount] = useState('');
  const [purInvoiceDate, setPurInvoiceDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [purItems, setPurItems] = useState<Array<{
    itemId: string;
    rawMaterialId: string;
    itemName: string;
    customName?: string;
    isCustom?: boolean;
    quantity: string;
    purchaseUnit: string;
    totalPrice: string;
    sellingPrice?: string;
  }>>([
    { itemId: '', rawMaterialId: '', itemName: '', customName: '', isCustom: false, quantity: '', purchaseUnit: 'كجم', totalPrice: '', sellingPrice: '' },
  ]);
  // Settle Payment State
  const [showPayModal, setShowPayModal] = useState(false);
  const [selectedInvoiceToPay, setSelectedInvoiceToPay] = useState<any | null>(null);
  const [paymentAmountInput, setPaymentAmountInput] = useState('');
  const [paymentMethodInput, setPaymentMethodInput] = useState('CASH');
  const [paymentNotesInput, setPaymentNotesInput] = useState('');

  // 3. Customers & Discounts State
  const [customers, setCustomers] = useState<any[]>([]);
  const [discountReasons, setDiscountReasons] = useState<any[]>([]);
  const [showAddCustModal, setShowAddCustModal] = useState(false);
  const [newCustName, setNewCustName] = useState('');
  const [newCustPhone, setNewCustPhone] = useState('');
  const [newCustType, setNewCustType] = useState('INDIVIDUAL');
  const [newCustDiscount, setNewCustDiscount] = useState('0');
  const [newCustNotes, setNewCustNotes] = useState('');
  const [newReasonText, setNewReasonText] = useState('');
  const [newReasonRate, setNewReasonRate] = useState('');

  // 4. Returns Log State
  const [returnsLog, setReturnsLog] = useState<any[]>([]);
  const [deletingReturnId, setDeletingReturnId] = useState<string | null>(null);

  // 5. Product Costs & Profitability State
  const [productCosts, setProductCosts] = useState<ProductCostItem[]>([]);
  const [totalTodayProfit, setTotalTodayProfit] = useState(0);
  const [loadingCosts, setLoadingCosts] = useState(false);
  const [profitSearchQuery, setProfitSearchQuery] = useState('');
  const [profitCategoryFilter, setProfitCategoryFilter] = useState<string>('ALL');
  const [profitStockFilter, setProfitStockFilter] = useState<'ALL' | 'LOW' | 'OUT' | 'AVAILABLE'>('ALL');
  const [profitSubTab, setProfitSubTab] = useState<'costs' | 'supplies'>('costs');
  const [selectedSupplyMonth, setSelectedSupplyMonth] = useState<string>('');
  const [supplySearchQuery, setSupplySearchQuery] = useState<string>('');
  const [deletingPurchaseInvoiceId, setDeletingPurchaseInvoiceId] = useState<string | null>(null);

  const profitCategories = useMemo(() => {
    const cats = new Set<string>();
    productCosts.forEach((p) => {
      if (p.categoryName) cats.add(p.categoryName);
    });
    return Array.from(cats);
  }, [productCosts]);

  const filteredProductCosts = useMemo(() => {
    let list = productCosts;
    const q = profitSearchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter((item) =>
        item.name.toLowerCase().includes(q) ||
        (item.categoryName && item.categoryName.toLowerCase().includes(q))
      );
    }
    if (profitCategoryFilter !== 'ALL') {
      list = list.filter((item) => item.categoryName === profitCategoryFilter);
    }
    if (profitStockFilter === 'LOW') {
      list = list.filter((item) => {
        const stock = item.stockQty ?? 0;
        const minStock = item.minStockLevel ?? 0;
        return stock > 0 && minStock > 0 && stock <= minStock;
      });
    } else if (profitStockFilter === 'OUT') {
      list = list.filter((item) => (item.stockQty ?? 0) <= 0);
    } else if (profitStockFilter === 'AVAILABLE') {
      list = list.filter((item) => (item.stockQty ?? 0) > 0);
    }
    return list;
  }, [productCosts, profitSearchQuery, profitCategoryFilter, profitStockFilter]);

  // Overall Inventory Valuation (Across ALL items in the shop: الكمية × سعر التكلفة)
  const inventoryValuation = useMemo(() => {
    let totalCostValue = 0;      // إجمالي رأس مال البضاعة بالمحل (الكمية × التكلفة)
    let totalRetailValue = 0;    // إجمالي القيمة البيعية المتوقعة (الكمية × البيع)
    let totalItemsWithStock = 0; // عدد الأصناف المتوفرة برصيد موجب
    let totalStockQty = 0;       // إجمالي الكميات/الأوزان

    productCosts.forEach((item) => {
      const stock = Math.max(0, item.stockQty ?? 0);
      if (stock > 0) {
        const unitCost = item.unitCost > 0 ? item.unitCost : (item.cost || 0);
        totalCostValue += stock * unitCost;
        totalRetailValue += stock * item.price;
        totalItemsWithStock += 1;
        totalStockQty += stock;
      }
    });

    const totalExpectedProfit = Math.max(0, totalRetailValue - totalCostValue);
    const overallMarginPct = totalCostValue > 0 ? (totalExpectedProfit / totalCostValue) * 100 : 0;

    return {
      totalCostValue,
      totalRetailValue,
      totalExpectedProfit,
      overallMarginPct,
      totalItemsWithStock,
      totalStockQty,
    };
  }, [productCosts]);

  // Filtered Inventory Valuation (For currently filtered items in table)
  const filteredInventoryValuation = useMemo(() => {
    let totalCostValue = 0;
    let totalRetailValue = 0;
    let totalStockQty = 0;

    filteredProductCosts.forEach((item) => {
      const stock = Math.max(0, item.stockQty ?? 0);
      if (stock > 0) {
        const unitCost = item.unitCost > 0 ? item.unitCost : (item.cost || 0);
        totalCostValue += stock * unitCost;
        totalRetailValue += stock * item.price;
        totalStockQty += stock;
      }
    });

    return {
      totalCostValue,
      totalRetailValue,
      totalStockQty,
    };
  }, [filteredProductCosts]);

  // Supply Log Grouped by Month and Day
  const supplyLogByMonth = useMemo(() => {
    const monthMap = new Map<string, {
      monthKey: string;
      monthName: string;
      totalCost: number;
      totalPaid: number;
      itemsCount: number;
      days: Map<string, {
        dayKey: string;
        dayDisplay: string;
        dayName: string;
        totalCost: number;
        totalPaid: number;
        itemsCount: number;
        items: Array<{
          id: string;
          invoiceId: string;
          invoiceNumber: string | null;
          supplierName: string;
          paymentMethod: string;
          itemName: string;
          quantity: number;
          purchaseUnit: string;
          unitPrice: number;
          totalPrice: number;
          previousCost: number | null;
          currentSellingPrice: number | null;
          previousSellingPrice: number | null;
        }>;
      }>;
    }>();

    for (const inv of purchaseInvoices) {
      const d = new Date(inv.invoiceDate || inv.createdAt);
      const year = d.getFullYear();
      const monthNum = String(d.getMonth() + 1).padStart(2, '0');
      const dayNum = String(d.getDate()).padStart(2, '0');
      const monthKey = `${year}-${monthNum}`;
      const dayKey = `${year}-${monthNum}-${dayNum}`;

      const monthName = d.toLocaleDateString('ar-EG', { month: 'long', year: 'numeric' });
      const dayName = d.toLocaleDateString('ar-EG', { weekday: 'long' });
      const dayDisplay = `${dayNum}/${monthNum}/${year}`;

      if (!monthMap.has(monthKey)) {
        monthMap.set(monthKey, {
          monthKey,
          monthName,
          totalCost: 0,
          totalPaid: 0,
          itemsCount: 0,
          days: new Map(),
        });
      }
      const mData = monthMap.get(monthKey)!;
      mData.totalCost += inv.totalAmount || 0;
      mData.totalPaid += inv.paidAmount || 0;

      if (!mData.days.has(dayKey)) {
        mData.days.set(dayKey, {
          dayKey,
          dayDisplay,
          dayName,
          totalCost: 0,
          totalPaid: 0,
          itemsCount: 0,
          items: [],
        });
      }
      const dData = mData.days.get(dayKey)!;
      dData.totalCost += inv.totalAmount || 0;
      dData.totalPaid += inv.paidAmount || 0;

      for (const it of (inv.items || [])) {
        mData.itemsCount += 1;
        dData.itemsCount += 1;
        dData.items.push({
          id: it.id,
          invoiceId: inv.id,
          invoiceNumber: inv.invoiceNumber,
          supplierName: inv.supplierName || inv.supplier?.name || 'مورد عام',
          paymentMethod: inv.paymentMethod || 'CASH',
          itemName: it.itemName,
          quantity: it.quantity,
          purchaseUnit: it.purchaseUnit || 'كجم',
          unitPrice: it.unitPrice,
          totalPrice: it.totalPrice,
          previousCost: it.previousCost !== undefined && it.previousCost !== null ? it.previousCost : (it.item?.cost ?? null),
          currentSellingPrice: it.currentSellingPrice !== undefined && it.currentSellingPrice !== null ? it.currentSellingPrice : (it.item?.price ?? null),
          previousSellingPrice: it.previousSellingPrice !== undefined && it.previousSellingPrice !== null ? it.previousSellingPrice : null,
        });
      }
    }

    const sortedMonths = Array.from(monthMap.values())
      .sort((a, b) => b.monthKey.localeCompare(a.monthKey))
      .map((m) => ({
        ...m,
        daysList: Array.from(m.days.values()).sort((a, b) => b.dayKey.localeCompare(a.dayKey)),
      }));

    return sortedMonths;
  }, [purchaseInvoices]);

  const [lowStockItems, setLowStockItems] = useState<Array<{
    id: string;
    name: string;
    stockQty: number;
    minStockLevel: number;
    unit: string;
    cost: number;
    price: number;
  }>>([]);
  // Add Menu Item State
  const [showAddItemModal, setShowAddItemModal] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const [newItemCategory, setNewItemCategory] = useState('');
  const [newItemCost, setNewItemCost] = useState('');
  const [newItemPrice, setNewItemPrice] = useState('');
  const [newItemMargin, setNewItemMargin] = useState('');
  const [newItemStockQty, setNewItemStockQty] = useState('50');
  const [newItemMinStock, setNewItemMinStock] = useState('15');
  const [newItemUnit, setNewItemUnit] = useState('كجم');
  const [showNewItemRecipeSection, setShowNewItemRecipeSection] = useState(false);
  const [newItemIngredients, setNewItemIngredients] = useState<
    Array<{ rawMaterialId: string; quantity: string; customUnitCost?: string }>
  >([]);
  // Edit Menu Item State
  const [showEditItemModal, setShowEditItemModal] = useState(false);
  const [selectedItemToEdit, setSelectedItemToEdit] = useState<ProductCostItem | null>(null);
  const [editItemId, setEditItemId] = useState('');
  const [editItemName, setEditItemName] = useState('');
  const [editItemCategory, setEditItemCategory] = useState('');
  const [editItemCost, setEditItemCost] = useState('');
  const [editItemPrice, setEditItemPrice] = useState('');
  const [editItemMargin, setEditItemMargin] = useState('');
  const [editItemStockQty, setEditItemStockQty] = useState('');
  const [editItemMinStock, setEditItemMinStock] = useState('');
  const [editItemUnit, setEditItemUnit] = useState('كجم');
  const [showEditItemRecipeSection, setShowEditItemRecipeSection] = useState(false);
  const [editItemIngredients, setEditItemIngredients] = useState<
    Array<{ rawMaterialId: string; quantity: string; customUnitCost?: string }>
  >([]);

  // 6. Produce Spoilage & Wastage State
  const [rawMaterials, setRawMaterials] = useState<any[]>([]);
  const [wastageLogs, setWastageLogs] = useState<any[]>([]);
  const [showAddWastageModal, setShowAddWastageModal] = useState(false);
  const [wastageMatId, setWastageMatId] = useState('');
  const [wastageItemName, setWastageItemName] = useState('');
  const [wastageUnitCost, setWastageUnitCost] = useState<number>(0);
  const [wastageQty, setWastageQty] = useState('');
  const [wastageReason, setWastageReason] = useState('تالف وبايظ (عطب طبيعي)');
  // Add Raw Material State
  const [showAddMaterialModal, setShowAddMaterialModal] = useState(false);
  const [newMatName, setNewMatName] = useState('');
  const [newMatPurchaseUnit, setNewMatPurchaseUnit] = useState('kg');
  const [newMatDeductUnit, setNewMatDeductUnit] = useState('g');
  const [newMatConversion, setNewMatConversion] = useState('1000');
  const [newMatStockQty, setNewMatStockQty] = useState('');
  const [newMatMinStock, setNewMatMinStock] = useState('');
  const [newMatCost, setNewMatCost] = useState('');
  // Edit Raw Material State
  const [showEditMaterialModal, setShowEditMaterialModal] = useState(false);
  const [selectedMaterialToEdit, setSelectedMaterialToEdit] = useState<any | null>(null);
  const [editMatName, setEditMatName] = useState('');
  const [editMatPurchaseUnit, setEditMatPurchaseUnit] = useState('kg');
  const [editMatDeductUnit, setEditMatDeductUnit] = useState('g');
  const [editMatConversion, setEditMatConversion] = useState('1000');
  const [editMatStockQty, setEditMatStockQty] = useState('');
  const [editMatMinStock, setEditMatMinStock] = useState('');
  const [editMatCost, setEditMatCost] = useState('');

  // 7. Custom Detailed Reports State
  const [reportStartDate, setReportStartDate] = useState(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10));
  const [reportEndDate, setReportEndDate] = useState(new Date().toISOString().slice(0, 10));
  const [reportSearchItem, setReportSearchItem] = useState('');
  const [reportPaymentMethod, setReportPaymentMethod] = useState('ALL');
  const [detailedReport, setDetailedReport] = useState<any | null>(null);
  const [loadingReport, setLoadingReport] = useState(false);

  // 6. Expenses State
  const [expenses, setExpenses] = useState<any[]>([]);
  const [expensesTodayTotal, setExpensesTodayTotal] = useState(0);
  const [expensesMonthTotal, setExpensesMonthTotal] = useState(0);
  const [expensesGrandTotal, setExpensesGrandTotal] = useState(0);
  const [loadingExpenses, setLoadingExpenses] = useState(false);
  const [expenseSearchQuery, setExpenseSearchQuery] = useState('');
  const [showAddAdminExpenseModal, setShowAddAdminExpenseModal] = useState(false);
  const [adminExpenseAmount, setAdminExpenseAmount] = useState('');
  const [adminExpenseReason, setAdminExpenseReason] = useState('');
  const [submittingAdminExpense, setSubmittingAdminExpense] = useState(false);

  // 8. Sales Ledger (Daily & Monthly) State
  const [ledgerData, setLedgerData] = useState<{
    todaySummary?: any;
    monthSummary?: any;
    grandTotals: any;
    days: any[];
    months: any[];
  }>({
    todaySummary: null,
    monthSummary: null,
    grandTotals: { ordersCount: 0, totalSales: 0, totalDiscounts: 0, totalNet: 0, returnsAmount: 0, returnsCount: 0, cogs: 0, netProfit: 0, avgTicket: 0, payments: { CASH: 0, VISA: 0, INSTAPAY: 0, VODAFONE_CASH: 0, CASH_OUT: 0 }, daysCount: 0, monthsCount: 0 },
    days: [],
    months: [],
  });
  const [loadingLedger, setLoadingLedger] = useState(false);
  const [activeLedgerView, setActiveLedgerView] = useState<'daily' | 'monthly'>('daily');
  const [ledgerSearch, setLedgerSearch] = useState('');
  
  // Drilldown for a specific day or month
  const [selectedPeriod, setSelectedPeriod] = useState<{
    type: 'day' | 'month';
    key: string;
    title: string;
  } | null>(null);
  const [periodOrders, setPeriodOrders] = useState<any[]>([]);
  const [periodSummary, setPeriodSummary] = useState<any | null>(null);
  const [loadingPeriodOrders, setLoadingPeriodOrders] = useState(false);
  const [ordersSearch, setOrdersSearch] = useState('');
  const [ordersFilterPayment, setOrdersFilterPayment] = useState('ALL');

  // Selected Order for Receipt Modal
  const [selectedOrderReceipt, setSelectedOrderReceipt] = useState<any | null>(null);

  // Return Delete In-App Confirmation Modal
  const [returnToDelete, setReturnToDelete] = useState<{ id: string; receiptNum: string; refundAmount: number } | null>(null);

  useEffect(() => {
    setMounted(true);
    setTodayLabel(
      new Date().toLocaleDateString('ar-EG', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    );
  }, []);

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
    setTimeout(() => setAlertMsg(null), 3500);
  };

  // Fetch Dashboard Analytics
  const fetchAnalytics = useCallback(async () => {
    setLoadingAnalytics(true);
    try {
      const res = await fetch('/api/admin-analytics');
      if (res.ok) {
        const data = await res.json();
        setKpis(data.kpis);
        setPayments(data.paymentBreakdown || { cash: 0, visa: 0, instapay: 0, vodafoneCash: 0, cashOut: 0 });
        setTopItems(data.topSellingItems || []);
        if (data.topSellingItemsByPeriod) {
          setTopItemsByPeriod(data.topSellingItemsByPeriod);
        } else {
          setTopItemsByPeriod({ today: data.topSellingItems || [], month: [], all: [] });
        }
        setRecentOrders(data.recentOrders || []);
        setDailySales(data.dailySales || []);
        setDiscountsBreakdown(data.discountsBreakdown || []);
        setReturnsLog(data.returnsLog || []);
        setWastageLogs(data.wastageLog || []);
        setLowStockItems(data.lowStockAlerts || []);
        setShiftSummaries(data.shiftSummaries || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingAnalytics(false);
    }
  }, []);

  // Fetch Suppliers & Purchases
  const fetchSuppliersAndPurchases = useCallback(async () => {
    try {
      const [sRes, pRes] = await Promise.all([fetch('/api/suppliers'), fetch('/api/purchases')]);
      if (sRes.ok) {
        const sData = await sRes.json();
        setSuppliers(sData.suppliers || []);
      }
      if (pRes.ok) {
        const pData = await pRes.json();
        setPurchaseInvoices(pData.invoices || []);
      }
    } catch (e) {
      console.error(e);
    }
  }, []);

  // Fetch Customers & Discount Reasons
  const fetchCustomersAndReasons = useCallback(async () => {
    try {
      const [cRes, rRes] = await Promise.all([fetch('/api/customers'), fetch('/api/discount-reasons')]);
      if (cRes.ok) {
        const cData = await cRes.json();
        setCustomers(cData.customers || []);
      }
      if (rRes.ok) {
        const rData = await rRes.json();
        setDiscountReasons(rData.reasons || []);
      }
    } catch (e) {
      console.error(e);
    }
  }, []);

  // Fetch Product Costs
  const fetchProductCosts = useCallback(async () => {
    setLoadingCosts(true);
    try {
      const res = await fetch('/api/product-costs');
      if (res.ok) {
        const data = await res.json();
        setProductCosts(data.items || []);
        setTotalTodayProfit(data.totalTodayProfit || 0);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingCosts(false);
    }
  }, []);

  // Fetch Inventory & Produce Spoilage/Wastage
  const fetchInventory = useCallback(async () => {
    try {
      const [invRes, wasRes] = await Promise.all([
        fetch('/api/inventory'),
        fetch('/api/wastage'),
      ]);
      if (invRes.ok) {
        const data = await invRes.json();
        setRawMaterials(data.rawMaterials || []);
      }
      if (wasRes.ok) {
        const wasData = await wasRes.json();
        setWastageLogs(wasData.wastageLogs || []);
      }
    } catch (e) {
      console.error(e);
    }
  }, []);

  // Fetch Detailed Reports
  const fetchDetailedReport = useCallback(async () => {
    setLoadingReport(true);
    try {
      const query = new URLSearchParams({
        startDate: reportStartDate,
        endDate: reportEndDate,
        paymentMethod: reportPaymentMethod,
        search: reportSearchItem,
      });
      const res = await fetch(`/api/reports/detailed?${query.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setDetailedReport(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingReport(false);
    }
  }, [reportStartDate, reportEndDate, reportPaymentMethod, reportSearchItem]);

  useEffect(() => {
    fetchAnalytics();
    fetchSuppliersAndPurchases();
    fetchCustomersAndReasons();
    fetchInventory();
    fetchProductCosts();
  }, [fetchAnalytics, fetchSuppliersAndPurchases, fetchCustomersAndReasons, fetchInventory, fetchProductCosts]);

  useEffect(() => {
    if (activeTab === 'purchases') {
      fetchSuppliersAndPurchases();
      fetchProductCosts();
      fetchInventory();
    }
    if (activeTab === 'profitability') {
      fetchProductCosts();
      fetchInventory();
    }
    if (activeTab === 'inventory') {
      fetchProductCosts();
      fetchInventory();
    }
    if (activeTab === 'reports') fetchDetailedReport();
  }, [activeTab, fetchProductCosts, fetchDetailedReport, fetchInventory, fetchSuppliersAndPurchases]);

  // Add Supplier Handler
  const handleAddSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/suppliers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newSuppName.trim(),
          phone: newSuppPhone.trim() || null,
          companyName: newSuppCompany.trim() || null,
          address: newSuppAddress.trim() || null,
          notes: newSuppNotes.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشل إضافة المورد');
      triggerAlert('success', 'تمت إضافة المورد بنجاح');
      setShowAddSupplierModal(false);
      setNewSuppName('');
      setNewSuppPhone('');
      setNewSuppCompany('');
      fetchSuppliersAndPurchases();
    } catch (err: any) {
      triggerAlert('error', err.message);
    }
  };

  // Delete Supplier Handler
  const handleDeleteSupplier = async (id: string, name: string) => {
    if (!window.confirm(`هل أنت متأكد من حذف المورد "${name}"؟ سيتم حذف المورد مع الحفاظ على فواتير المشتريات المسجلة باسمه.`)) return;
    try {
      const res = await fetch(`/api/suppliers?id=${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشل حذف المورد');
      triggerAlert('success', `تم حذف المورد "${name}" بنجاح`);
      fetchSuppliersAndPurchases();
    } catch (err: any) {
      triggerAlert('error', err.message);
    }
  };

  // Add Purchase Invoice Handler
  const handleAddPurchaseInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const formattedItems = purItems
        .filter((it) => it.itemId || it.rawMaterialId || it.itemName || it.customName)
        .map((it) => {
          const produceItem = productCosts.find((p) => p.id === it.itemId);
          const rawMat = rawMaterials.find((m) => m.id === it.rawMaterialId);
          const name = it.isCustom && it.customName
            ? it.customName.trim()
            : produceItem
            ? produceItem.name
            : rawMat
            ? rawMat.name
            : it.itemName || 'صنف توريد';
          const qty = parseFloat(it.quantity) || 0;
          const tot = parseFloat(it.totalPrice) || 0;
          const unit = qty > 0 ? tot / qty : tot;
          return {
            itemId: it.itemId || (produceItem ? produceItem.id : null),
            rawMaterialId: it.rawMaterialId || (rawMat ? rawMat.id : null),
            itemName: name,
            quantity: qty,
            purchaseUnit: it.purchaseUnit || 'كجم',
            unitPrice: unit,
            totalPrice: tot,
            sellingPrice: it.sellingPrice ? parseFloat(it.sellingPrice) : undefined,
          };
        });

      if (formattedItems.length === 0) {
        throw new Error('يرجى اختيار صنف خضار / فاكهة واحد على الأقل وتحديد الكمية والسعر');
      }

      const supp = suppliers.find((s) => s.id === purSupplierId);

      const res = await fetch('/api/purchases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplierId: purSupplierId || null,
          supplierName: supp ? supp.name : null,
          invoiceDate: purInvoiceDate ? new Date(purInvoiceDate).toISOString() : undefined,
          paymentMethod: purPaymentMethod,
          paidAmount: purPaidAmount ? parseFloat(purPaidAmount) : undefined,
          items: formattedItems,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشل حفظ فاتورة المشتريات');

      triggerAlert('success', 'تم تسجيل فاتورة المشتريات وتحديث تكلفة البضاعة والمخزن وسعر البيع بنجاح!');
      setShowAddPurchaseModal(false);
      setPurItems([{ itemId: '', rawMaterialId: '', itemName: '', customName: '', isCustom: false, quantity: '', purchaseUnit: 'كجم', totalPrice: '', sellingPrice: '' }]);
      setPurPaidAmount('');
      setPurInvoiceDate(new Date().toISOString().slice(0, 10));
      fetchSuppliersAndPurchases();
      fetchInventory();
      fetchProductCosts();
    } catch (err: any) {
      triggerAlert('error', err.message);
    }
  };

  // Delete Purchase Invoice from Log
  const handleDeletePurchaseInvoice = async (invoiceId: string) => {
    if (!confirm('هل أنت متأكد من حذف فاتورة التوريد هذه من السجل؟ سيتم حذف بيانات التوريد المرتبطة بها.')) return;
    setDeletingPurchaseInvoiceId(invoiceId);
    try {
      const res = await fetch(`/api/purchases?id=${invoiceId}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'فشل حذف الفاتورة');
      }
      triggerAlert('success', 'تم حذف فاتورة التوريد بنجاح من السجل');
      fetchSuppliersAndPurchases();
      fetchInventory();
      fetchProductCosts();
    } catch (e: any) {
      triggerAlert('error', e.message);
    } finally {
      setDeletingPurchaseInvoiceId(null);
    }
  };

  // Settle Invoice Payment Handler
  const handleSettlePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInvoiceToPay || !paymentAmountInput) return;
    try {
      const res = await fetch('/api/purchases', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoiceId: selectedInvoiceToPay.id,
          paymentAmount: parseFloat(paymentAmountInput),
          paymentMethod: paymentMethodInput,
          notes: paymentNotesInput.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشل تسجيل السداد');
      triggerAlert('success', `تم تسجيل سداد مبلغ EGP ${paymentAmountInput} للفاتورة بنجاح!`);
      setShowPayModal(false);
      setSelectedInvoiceToPay(null);
      setPaymentAmountInput('');
      setPaymentNotesInput('');
      fetchSuppliersAndPurchases();
    } catch (err: any) {
      triggerAlert('error', err.message);
    }
  };

  // Add Customer Handler
  const handleAddCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newCustName.trim(),
          phone: newCustPhone.trim() || null,
          type: newCustType,
          discountRate: parseFloat(newCustDiscount) || 0,
          notes: newCustNotes.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشل إضافة العميل');
      triggerAlert('success', 'تمت إضافة العميل بنجاح');
      setShowAddCustModal(false);
      setNewCustName('');
      setNewCustPhone('');
      setNewCustDiscount('0');
      fetchCustomersAndReasons();
    } catch (err: any) {
      triggerAlert('error', err.message);
    }
  };

  // Add Discount Reason Handler
  const handleAddDiscountReason = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newReasonText.trim()) return;
    try {
      const res = await fetch('/api/discount-reasons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason: newReasonText.trim(),
          rate: newReasonRate ? parseFloat(newReasonRate) : null,
        }),
      });
      if (!res.ok) throw new Error('فشل إضافة سبب الخصم');
      triggerAlert('success', 'تمت إضافة سبب الخصم الثابت');
      setNewReasonText('');
      setNewReasonRate('');
      fetchCustomersAndReasons();
    } catch (err: any) {
      triggerAlert('error', err.message);
    }
  };

  // Delete Customer Handler
  const handleDeleteCustomer = async (id: string, name: string) => {
    if (!window.confirm(`هل أنت متأكد من حذف العميل "${name}"؟`)) return;
    try {
      const res = await fetch(`/api/customers?id=${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('فشل حذف العميل');
      triggerAlert('success', `تم حذف العميل "${name}" بنجاح`);
      fetchCustomersAndReasons();
    } catch (err: any) {
      triggerAlert('error', err.message);
    }
  };

  // Delete Discount Reason Handler
  const handleDeleteDiscountReason = async (id: string, reason: string) => {
    if (!window.confirm(`هل أنت متأكد من حذف سبب الخصم "${reason}"؟`)) return;
    try {
      const res = await fetch(`/api/discount-reasons?id=${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('فشل حذف سبب الخصم');
      triggerAlert('success', `تم حذف سبب الخصم "${reason}" بنجاح`);
      fetchCustomersAndReasons();
    } catch (err: any) {
      triggerAlert('error', err.message);
    }
  };

  // Add Spoilage & Wastage Handler (Produce items)
  const handleAddWastage = async (e: React.FormEvent) => {
    e.preventDefault();
    const itemName = wastageItemName.trim();
    if (!itemName || !wastageQty) return;
    try {
      const res = await fetch('/api/wastage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemName,
          rawMaterialId: wastageMatId || undefined,
          unitCost: wastageUnitCost || 0,
          quantity: parseFloat(wastageQty),
          reason: wastageReason.trim(),
          loggedBy: user?.name || 'مدير المحل',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشل تسجيل التالف');
      triggerAlert('success', `تم تسجيل هالك "${itemName}" بنجاح وحساب الخسارة المالية`);
      setShowAddWastageModal(false);
      setWastageItemName('');
      setWastageMatId('');
      setWastageQty('');
      setWastageUnitCost(0);
      fetchInventory();
    } catch (err: any) {
      triggerAlert('error', err.message);
    }
  };

  // Add Raw Material Handler
  const handleAddRawMaterial = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMatName.trim()) return;
    try {
      const res = await fetch('/api/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newMatName.trim(),
          purchaseUnit: newMatPurchaseUnit.trim(),
          deductUnit: newMatDeductUnit.trim(),
          conversionFactor: parseFloat(newMatConversion) || 1000,
          stockQty: parseFloat(newMatStockQty) || 0,
          minStockLevel: parseFloat(newMatMinStock) || 0,
          costPerPurchaseUnit: parseFloat(newMatCost) || 0,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشل إضافة الخامة');
      triggerAlert('success', 'تمت إضافة الخامة الجديدة بنجاح وتحديث المخزن!');
      setShowAddMaterialModal(false);
      setNewMatName('');
      setNewMatStockQty('');
      setNewMatMinStock('');
      setNewMatCost('');
      fetchInventory();
    } catch (err: any) {
      triggerAlert('error', err.message);
    }
  };

  // Edit Raw Material Handlers
  const openEditMaterialModal = (mat: any) => {
    setSelectedMaterialToEdit(mat);
    setEditMatName(mat.name || '');
    setEditMatPurchaseUnit(mat.purchaseUnit || 'kg');
    setEditMatDeductUnit(mat.deductUnit || 'g');
    setEditMatConversion(mat.conversionFactor !== undefined ? mat.conversionFactor.toString() : '1000');
    setEditMatStockQty(mat.stockQty !== undefined ? mat.stockQty.toString() : '0');
    setEditMatMinStock(mat.minStockLevel !== undefined ? mat.minStockLevel.toString() : '0');
    setEditMatCost(mat.costPerPurchaseUnit !== undefined ? mat.costPerPurchaseUnit.toString() : '0');
    setShowEditMaterialModal(true);
  };

  const handleEditRawMaterial = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMaterialToEdit || !editMatName.trim()) return;
    try {
      const res = await fetch('/api/inventory', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rawMaterialId: selectedMaterialToEdit.id,
          name: editMatName.trim(),
          purchaseUnit: editMatPurchaseUnit.trim(),
          deductUnit: editMatDeductUnit.trim(),
          conversionFactor: parseFloat(editMatConversion) || 1,
          stockQty: parseFloat(editMatStockQty) || 0,
          minStockLevel: parseFloat(editMatMinStock) || 0,
          costPerPurchaseUnit: parseFloat(editMatCost) || 0,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشل تعديل بيانات الخامة');
      triggerAlert('success', 'تم تعديل بيانات الخامة بنجاح وتحديث أسعار الوصفات!');
      setShowEditMaterialModal(false);
      setSelectedMaterialToEdit(null);
      fetchInventory();
      fetchProductCosts();
    } catch (err: any) {
      triggerAlert('error', err.message);
    }
  };

  const handleDeleteRawMaterial = async (id: string, name: string) => {
    if (!window.confirm(`هل أنت متأكد من حذف الخامة "${name}" من المخزن؟`)) return;
    try {
      const res = await fetch(`/api/inventory?id=${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشل حذف الخامة');
      triggerAlert('success', `تم حذف الخامة "${name}" بنجاح وتحديث المخزن`);
      fetchInventory();
      fetchProductCosts();
    } catch (err: any) {
      triggerAlert('error', err.message);
    }
  };

  // Auto-calculators for New Item Pricing Trio (Cost, Price, Margin on Cost)
  const handleNewCostChange = (val: string) => {
    setNewItemCost(val);
    const c = parseFloat(val);
    const p = parseFloat(newItemPrice);
    const m = parseFloat(newItemMargin);
    if (!isNaN(c) && c > 0) {
      if (!isNaN(p) && p >= c) {
        const markup = ((p - c) / c) * 100;
        setNewItemMargin(markup.toFixed(1));
      } else if (!isNaN(m) && m >= 0) {
        const price = c * (1 + m / 100);
        setNewItemPrice(price.toFixed(2));
      }
    }
  };

  const handleNewPriceChange = (val: string) => {
    setNewItemPrice(val);
    const p = parseFloat(val);
    const c = parseFloat(newItemCost);
    if (!isNaN(p) && p >= 0) {
      if (!isNaN(c) && c > 0) {
        const markup = ((p - c) / c) * 100;
        setNewItemMargin(markup.toFixed(1));
      }
    }
  };

  const handleNewMarginChange = (val: string) => {
    setNewItemMargin(val);
    const m = parseFloat(val);
    const c = parseFloat(newItemCost);
    const p = parseFloat(newItemPrice);
    if (!isNaN(m) && m >= 0) {
      if (!isNaN(c) && c > 0) {
        const price = c * (1 + m / 100);
        setNewItemPrice(price.toFixed(2));
      } else if (!isNaN(p) && p > 0) {
        const cost = p / (1 + m / 100);
        setNewItemCost(cost.toFixed(2));
      }
    }
  };

  // Auto-calculators for Edit Item Pricing Trio (Cost, Price, Margin on Cost)
  const handleEditCostChange = (val: string) => {
    setEditItemCost(val);
    const c = parseFloat(val);
    const p = parseFloat(editItemPrice);
    const m = parseFloat(editItemMargin);
    if (!isNaN(c) && c > 0) {
      if (!isNaN(p) && p >= c) {
        const markup = ((p - c) / c) * 100;
        setEditItemMargin(markup.toFixed(1));
      } else if (!isNaN(m) && m >= 0) {
        const price = c * (1 + m / 100);
        setEditItemPrice(price.toFixed(2));
      }
    }
  };

  const handleEditPriceChange = (val: string) => {
    setEditItemPrice(val);
    const p = parseFloat(val);
    const c = parseFloat(editItemCost);
    if (!isNaN(p) && p >= 0) {
      if (!isNaN(c) && c > 0) {
        const markup = ((p - c) / c) * 100;
        setEditItemMargin(markup.toFixed(1));
      }
    }
  };

  const handleEditMarginChange = (val: string) => {
    setEditItemMargin(val);
    const m = parseFloat(val);
    const c = parseFloat(editItemCost);
    const p = parseFloat(editItemPrice);
    if (!isNaN(m) && m >= 0) {
      if (!isNaN(c) && c > 0) {
        const price = c * (1 + m / 100);
        setEditItemPrice(price.toFixed(2));
      } else if (!isNaN(p) && p > 0) {
        const cost = p / (1 + m / 100);
        setEditItemCost(cost.toFixed(2));
      }
    }
  };

  // Menu Items: Create Handler
  const handleCreateMenuItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemName.trim() || !newItemCategory.trim() || !newItemPrice) {
      triggerAlert('error', 'يرجى إدخال اسم الصنف والقسم وسعر البيع');
      return;
    }
    try {
      const res = await fetch('/api/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newItemName.trim(),
          price: parseFloat(newItemPrice) || 0,
          cost: parseFloat(newItemCost) || 0,
          categoryName: newItemCategory.trim(),
          stockQty: parseFloat(newItemStockQty) || 0,
          minStockLevel: parseFloat(newItemMinStock) || 0,
          unit: newItemUnit.trim() || 'كجم',
          recipe: [],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشل إضافة الصنف');
      triggerAlert('success', `تمت إضافة صنف "${newItemName.trim()}" إلى المنيو بنجاح!`);
      setShowAddItemModal(false);
      setNewItemName('');
      setNewItemCategory('');
      setNewItemCost('');
      setNewItemPrice('');
      setNewItemMargin('');
      setNewItemStockQty('50');
      setNewItemMinStock('15');
      setNewItemUnit('كجم');
      fetchProductCosts();
      fetchAnalytics();
    } catch (err: any) {
      triggerAlert('error', err.message);
    }
  };

  // Menu Items: Open Edit Modal
  const openEditItemModal = (item: ProductCostItem) => {
    setSelectedItemToEdit(item);
    setEditItemId(item.id);
    setEditItemName(item.name);
    setEditItemCategory(item.categoryName);
    setEditItemPrice(item.price.toString());
    const effectiveCost = (item as any).cost || item.unitCost || 0;
    setEditItemCost(effectiveCost > 0 ? effectiveCost.toString() : '');
    const margin = effectiveCost > 0 ? ((item.price - effectiveCost) / effectiveCost) * 100 : 0;
    setEditItemMargin(margin > 0 ? margin.toFixed(1) : '');
    setEditItemStockQty(item.stockQty !== undefined ? item.stockQty.toString() : '0');
    setEditItemMinStock(item.minStockLevel !== undefined ? item.minStockLevel.toString() : '0');
    setEditItemUnit(item.unit || 'كجم');
    setShowEditItemModal(true);
  };

  // Menu Items: Update Handler
  const handleUpdateMenuItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editItemId || !editItemName.trim() || !editItemCategory.trim()) {
      triggerAlert('error', 'يرجى ملء جميع البيانات الأساسية للصنف');
      return;
    }
    try {
      const res = await fetch('/api/items', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editItemId,
          name: editItemName.trim(),
          price: parseFloat(editItemPrice) || 0,
          cost: parseFloat(editItemCost) || 0,
          categoryName: editItemCategory.trim(),
          stockQty: parseFloat(editItemStockQty) || 0,
          minStockLevel: parseFloat(editItemMinStock) || 0,
          unit: editItemUnit.trim() || 'كجم',
          recipe: [],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشل تعديل الصنف');
      triggerAlert('success', `تم تعديل صنف "${editItemName}" بنجاح!`);
      setShowEditItemModal(false);
      setSelectedItemToEdit(null);
      fetchProductCosts();
      fetchAnalytics();
    } catch (err: any) {
      triggerAlert('error', err.message);
    }
  };

  // Menu Items: Delete Handler
  const handleDeleteMenuItem = async (id: string, name: string) => {
    if (!window.confirm(`هل أنت متأكد من حذف صنف "${name}" من المنيو؟`)) return;
    try {
      const res = await fetch(`/api/items?id=${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشل حذف الصنف');
      triggerAlert('success', `تم حذف/إخفاء صنف "${name}" من المنيو بنجاح`);
      fetchProductCosts();
    } catch (err: any) {
      triggerAlert('error', err.message);
    }
  };

  // Fetch Expenses
  const fetchExpenses = useCallback(async () => {
    setLoadingExpenses(true);
    try {
      const res = await fetch('/api/shifts/expenses');
      if (res.ok) {
        const data = await res.json();
        setExpenses(data.expenses || []);
        setExpensesTodayTotal(data.todayTotal || 0);
        setExpensesMonthTotal(data.monthTotal || 0);
        setExpensesGrandTotal(data.grandTotal || 0);
      }
    } catch (e) {
      console.error('Error fetching expenses:', e);
    } finally {
      setLoadingExpenses(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'expenses') {
      fetchExpenses();
    }
  }, [activeTab, fetchExpenses]);

  const handleAddAdminExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminExpenseAmount || !adminExpenseReason.trim()) return;
    setSubmittingAdminExpense(true);
    try {
      const res = await fetch('/api/shifts/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: parseFloat(adminExpenseAmount),
          reason: adminExpenseReason.trim(),
          type: 'PAYOUT',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشل تسجيل المصروف');

      triggerAlert('success', 'تم تسجيل المصروف بنجاح!');
      setAdminExpenseAmount('');
      setAdminExpenseReason('');
      setShowAddAdminExpenseModal(false);
      fetchExpenses();
      fetchAnalytics();
    } catch (err: any) {
      triggerAlert('error', err.message || 'خطأ في تسجيل المصروف');
    } finally {
      setSubmittingAdminExpense(false);
    }
  };

  const handleDeleteExpense = async (id: string) => {
    if (!confirm('هل أنت متأكد من حذف هذا المصروف؟')) return;
    try {
      const res = await fetch(`/api/shifts/expenses?id=${id}`, { method: 'DELETE' });
      if (res.ok) {
        triggerAlert('success', 'تم حذف المصروف بنجاح');
        fetchExpenses();
        fetchAnalytics();
      } else {
        triggerAlert('error', 'فشل حذف المصروف');
      }
    } catch {
      triggerAlert('error', 'خطأ في حذف المصروف');
    }
  };

  const handleConfirmDeleteReturn = async () => {
    if (!returnToDelete) return;
    const { id, refundAmount } = returnToDelete;
    setDeletingReturnId(id);
    try {
      const res = await fetch(`/api/returns?id=${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (res.ok && data.success) {
        triggerAlert('success', data.message || `تم مسح المرتجع نهائياً وعادت (${refundAmount.toFixed(2)} ج) إلى الدرج بنجاح`);
        fetchAnalytics();
        setReturnToDelete(null);
      } else {
        triggerAlert('error', data.error || 'فشل حذف المرتجع');
      }
    } catch {
      triggerAlert('error', 'خطأ أثناء حذف المرتجع');
    } finally {
      setDeletingReturnId(null);
    }
  };

  const filteredExpenses = expenses.filter((exp: any) => {
    const q = expenseSearchQuery.toLowerCase().trim();
    return (
      !q ||
      (exp.reason && exp.reason.toLowerCase().includes(q)) ||
      (exp.shift?.cashierName && exp.shift.cashierName.toLowerCase().includes(q)) ||
      (exp.shift?.user?.name && exp.shift.user.name.toLowerCase().includes(q))
    );
  });

  // Sales Ledger Fetch
  const fetchSalesLedger = useCallback(async () => {
    setLoadingLedger(true);
    try {
      const res = await fetch('/api/sales-ledger');
      if (res.ok) {
        const data = await res.json();
        setLedgerData(data);
      }
    } catch (err) {
      console.error('Failed to fetch sales ledger:', err);
    } finally {
      setLoadingLedger(false);
    }
  }, []);

  const fetchOrderAndOpenReceipt = async (orderId: string) => {
    if (!orderId) return;
    try {
      const res = await fetch(`/api/sales-orders/${orderId}`);
      if (res.ok) {
        const data = await res.json();
        if (data.order) {
          setSelectedOrderReceipt(data.order);
          return;
        }
      }
      triggerAlert('error', 'تعذر تحميل تفاصيل الفاتورة');
    } catch {
      triggerAlert('error', 'خطأ في الاتصال بالخادم');
    }
  };

  const openPeriodOrders = async (type: 'day' | 'month', key: string, title: string) => {
    setSelectedPeriod({ type, key, title });
    setPeriodOrders([]);
    setPeriodSummary(null);
    setLoadingPeriodOrders(true);
    setOrdersSearch('');
    setOrdersFilterPayment('ALL');
    try {
      const url = `/api/sales-ledger?${type === 'day' ? 'date=' : 'month='}${encodeURIComponent(key)}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setPeriodOrders(data.orders || []);
        setPeriodSummary(data.summary || null);
      } else {
        triggerAlert('error', 'فشل تحميل فواتير هذه الفترة');
      }
    } catch (err) {
      console.error('Failed to load period orders:', err);
      triggerAlert('error', 'خطأ في الاتصال بالخادم');
    } finally {
      setLoadingPeriodOrders(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'invoices-ledger') {
      fetchSalesLedger();
    }
  }, [activeTab, fetchSalesLedger]);

  const filteredDays = (ledgerData.days || []).filter((d: any) => {
    const q = ledgerSearch.toLowerCase().trim();
    return !q || d.date.includes(q) || d.dayNameAr.toLowerCase().includes(q);
  });

  const filteredMonths = (ledgerData.months || []).filter((m: any) => {
    const q = ledgerSearch.toLowerCase().trim();
    return !q || m.month.includes(q) || m.monthNameAr.toLowerCase().includes(q);
  });

  const filteredPeriodOrders = periodOrders.filter((order: any) => {
    const q = ordersSearch.toLowerCase().trim();
    const matchSearch =
      !q ||
      (order.receiptNumber && order.receiptNumber.toLowerCase().includes(q)) ||
      (order.shift?.cashierName && order.shift.cashierName.toLowerCase().includes(q)) ||
      (order.shift?.user?.name && order.shift.user.name.toLowerCase().includes(q)) ||
      (order.customer?.name && order.customer.name.toLowerCase().includes(q)) ||
      (order.customerName && order.customerName.toLowerCase().includes(q)) ||
      (order.table?.name && order.table.name.toLowerCase().includes(q)) ||
      (order.items || []).some((i: any) => i.item?.name?.toLowerCase().includes(q));

    const matchPayment =
      ordersFilterPayment === 'ALL' || order.paymentMethod === ordersFilterPayment;

    return matchSearch && matchPayment;
  });

  const existingCategories = Array.from(
    new Set(productCosts.map((p) => p.categoryName).filter(Boolean))
  );

  if (!mounted) return null;

  return (
    <div className="flex h-screen bg-[#070b14] text-gray-200 text-right overflow-hidden" dir="rtl">
      {/* Mobile Off-Canvas Navigation Drawer */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex" dir="rtl">
          <div 
            className="fixed inset-0 bg-black/80 backdrop-blur-sm transition-opacity" 
            onClick={() => setIsMobileMenuOpen(false)} 
          />
          <div className="relative w-72 max-w-[85vw] bg-[#0a101d] border-l border-white/10 p-5 flex flex-col justify-between z-10 shadow-2xl h-full">
            <div className="space-y-6 overflow-y-auto">
              {/* Logo & Close Button */}
              <div className="flex items-center justify-between pb-4 border-b border-white/5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl overflow-hidden relative border border-emerald-500/30 shrink-0 bg-white shadow-md p-0.5">
                    <img src="/banana-logo.jpg" alt="بانانا فود" className="w-full h-full object-contain" />
                  </div>
                  <div>
                    <h1 className="font-bold text-sm text-white">بانانا فود</h1>
                    <p className="text-[10px] text-gray-400">لوحة تحكم وإدارة المحل</p>
                  </div>
                </div>
                <button 
                  type="button"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Navigation Links */}
              <nav className="space-y-1.5">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setActiveTab(item.id as any);
                        setIsMobileMenuOpen(false);
                      }}
                      className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                        isActive
                          ? 'bg-gradient-to-r from-emerald-500/20 to-green-500/20 text-emerald-400 border border-emerald-500/30 font-bold'
                          : 'text-gray-300 hover:bg-white/5 hover:text-white'
                      }`}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </nav>
            </div>

            {/* Drawer Bottom Actions */}
            <div className="space-y-2 border-t border-white/5 pt-4 shrink-0">
              <button
                type="button"
                onClick={() => { setIsMobileMenuOpen(false); router.push('/pos'); }}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border border-emerald-500/30 text-xs font-bold transition-all shadow-sm cursor-pointer"
              >
                <ShoppingBag className="w-4 h-4" />
                <span>افتح شاشة الكاشير للبيع</span>
              </button>
              <button
                type="button"
                onClick={() => { logout(); router.push('/'); }}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs text-rose-400 hover:bg-rose-500/10 transition-all font-semibold cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                <span>اخرج من السيستم</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Desktop Sidebar Navigation */}
      <aside className="hidden lg:flex lg:w-64 bg-[#0a101d] border-l border-white/5 flex-col justify-between shrink-0 p-4">
        <div className="space-y-6">
          {/* Logo Brand */}
          <div className="flex items-center gap-3 px-2">
            <div className="w-10 h-10 rounded-xl overflow-hidden relative border border-emerald-500/30 shrink-0 bg-white shadow-md p-0.5">
              <img src="/banana-logo.jpg" alt="بانانا فود" className="w-full h-full object-contain" />
            </div>
            <div>
              <h1 className="font-bold text-sm text-white">بانانا فود</h1>
              <p className="text-[10px] text-gray-400">لوحة تحكم وإدارة المحل</p>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id as any)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                    isActive
                      ? 'bg-gradient-to-r from-emerald-500/20 to-green-500/20 text-emerald-400 border border-emerald-500/30 shadow-sm'
                      : 'text-gray-400 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Bottom Actions */}
        <div className="space-y-2 border-t border-white/5 pt-4">
          <button
            onClick={() => router.push('/pos')}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 text-xs font-bold transition-all cursor-pointer"
          >
            <ShoppingBag className="w-4 h-4" />
            <span>افتح شاشة الكاشير للبيع</span>
          </button>
          <button
            onClick={() => { logout(); router.push('/'); }}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-xs text-rose-400 hover:bg-rose-500/10 transition-all cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>اخرج من السيستم</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Header Bar */}
        <header className="min-h-16 border-b border-white/5 bg-[#0a101d] px-3.5 sm:px-6 py-2.5 flex items-center justify-between shrink-0 gap-2">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            {/* Mobile Menu Hamburger Button */}
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen(true)}
              className="lg:hidden p-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white border border-white/10 shrink-0 transition-colors cursor-pointer"
              title="قائمة الأقسام"
            >
              <Menu className="w-5 h-5" />
            </button>

            <div className="min-w-0">
              <span className="text-[11px] text-gray-400 block truncate">{todayLabel}</span>
              <h2 className="text-sm sm:text-base font-bold text-white truncate">
                {activeTab === 'dashboard' && 'اليومية ومؤشرات المحل'}
                {activeTab === 'invoices-ledger' && 'دفتر فواتير ومبيعات المحل'}
                {activeTab === 'purchases' && 'الوارد وحسابات المعلمين'}
                {activeTab === 'returns' && 'سجل مرتجعات الزباين والفلوس المستردة'}
                {activeTab === 'expenses' && 'مصاريف وخرجيات المحل'}
                {activeTab === 'profitability' && 'حسبة التكلفة وهوامش المكسب'}
                {activeTab === 'inventory' && 'تسجيل التالف والهالك'}
                {activeTab === 'reports' && 'تقارير المبيعات والأرباح'}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Quick POS Shortcut Button on Mobile */}
            <button
              type="button"
              onClick={() => router.push('/pos')}
              className="hidden sm:flex lg:hidden items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 text-xs font-bold transition-all cursor-pointer"
            >
              <ShoppingBag className="w-3.5 h-3.5" />
              <span>الكاشير</span>
            </button>

            <button
              type="button"
              onClick={() => {
                fetchAnalytics();
                fetchSuppliersAndPurchases();
                fetchCustomersAndReasons();
                if (activeTab === 'profitability') fetchProductCosts();
                if (activeTab === 'reports') fetchDetailedReport();
                if (activeTab === 'expenses') fetchExpenses();
                if (activeTab === 'invoices-ledger') fetchSalesLedger();
                if (activeTab === 'inventory') {
                  fetchInventory();
                  fetchProductCosts();
                }
                triggerAlert('success', 'تم تحديث البيانات');
              }}
              className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white transition-all border border-white/5 cursor-pointer active:scale-95"
              title="تحديث البيانات"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Mobile Horizontal Quick Nav Tabs (One-touch tab switching on phone) */}
        <div className="lg:hidden shrink-0 border-b border-white/5 bg-[#080d1a] px-3 py-2 overflow-x-auto flex items-center gap-1.5 scrollbar-none" dir="rtl">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id as any)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all shrink-0 cursor-pointer ${
                  isActive
                    ? 'bg-emerald-500 text-slate-950 font-bold shadow-md shadow-emerald-500/20'
                    : 'bg-white/5 text-gray-300 hover:bg-white/10 hover:text-white border border-white/5'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{item.shortLabel}</span>
              </button>
            );
          })}
        </div>

        {/* Dynamic Body Content */}
        <div className="flex-1 overflow-y-auto p-3.5 sm:p-6 space-y-4 sm:space-y-6">
          {/* TAB 1: DASHBOARD */}
          {activeTab === 'dashboard' && (
            loadingAnalytics ? (
              <div className="flex flex-col items-center justify-center min-h-[420px] glass-panel rounded-3xl border border-white/5 p-12 text-center my-6">
                <div className="relative mb-5">
                  <div className="w-16 h-16 rounded-full border-4 border-cyan-500/20 border-t-cyan-400 animate-spin" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <TrendingUp className="w-6 h-6 text-cyan-400 animate-pulse" />
                  </div>
                </div>
                <h3 className="text-lg font-bold text-white mb-2">جاري قراءة وتحميل مؤشرات المحل والأرباح...</h3>
                <p className="text-xs text-gray-400 max-w-md leading-relaxed">
                  يتم الآن جلب المبيعات، النواقص، الأرباح، ونثريات اليوم لحظياً من قاعدة البيانات.
                </p>
              </div>
            ) : (
            <div className="space-y-6">
              {/* Low Stock Alert Section - أصناف قربت تخلص في المحل */}
              {lowStockItems && lowStockItems.length > 0 && (
                <div className="glass-panel p-5 rounded-2xl border border-amber-500/40 bg-gradient-to-r from-amber-950/40 via-slate-900/80 to-amber-950/30 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <span className="p-2 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 shrink-0">
                        <AlertTriangle className="w-5 h-5 text-amber-400 animate-pulse" />
                      </span>
                      <div>
                        <h3 className="text-sm font-bold text-white flex items-center gap-2">
                          <span>أصناف قربت تخلص في المحل (نواقص محتاجة طلب)</span>
                          <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[11px] font-bold border border-amber-500/30 font-mono">
                            {lowStockItems.length} صنف
                          </span>
                        </h3>
                        <p className="text-xs text-gray-400">الأصناف دي وصلت أو نزلت عن حد تحذير النواقص، محتاج تطلبها من المعلم أو تشتريها من سوق الجملة</p>
                      </div>
                    </div>
                    <button
                      onClick={() => setActiveTab('profitability')}
                      className="self-start sm:self-auto px-3.5 py-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 text-xs font-semibold transition-all hover:bg-amber-500/30 flex items-center gap-1"
                    >
                      <span>تعديل الكميات والتكلفة</span>
                      <span>←</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 pt-1">
                    {lowStockItems.map((item) => {
                      const isOut = item.stockQty <= 0;
                      return (
                        <div
                          key={item.id}
                          className={`p-3 rounded-xl border flex items-center justify-between transition-all ${
                            isOut
                              ? 'bg-rose-950/30 border-rose-500/40'
                              : 'bg-amber-950/20 border-amber-500/30'
                          }`}
                        >
                          <div>
                            <span className="font-bold text-white text-xs block">{item.name}</span>
                            <span className="text-[11px] text-gray-400 block mt-0.5">
                              حد النواقص: <strong className="font-mono text-gray-300">{item.minStockLevel} {item.unit || 'كجم'}</strong>
                            </span>
                          </div>
                          <div className="text-left">
                            <span
                              className={`text-xs font-mono font-bold px-2 py-1 rounded-lg block ${
                                isOut
                                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                                  : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                              }`}
                            >
                              {isOut ? 'خلصان خالص' : `باقي: ${item.stockQty} ${item.unit || 'كجم'}`}
                            </span>
                            <span className="text-[10px] text-gray-400 mt-1 block">
                              {isOut ? 'نفذ من المحل' : 'قرب يخلص'}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Top Financial KPI Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="glass-panel p-4 rounded-2xl border border-cyan-500/20 bg-gradient-to-br from-cyan-950/20 to-transparent">
                  <span className="text-[11px] text-gray-400 block">إجمالي مبيعات النهاردة (صافي)</span>
                  <div className="flex items-baseline justify-between mt-1 flex-row-reverse">
                    <span className="text-2xl font-bold text-cyan-400 font-mono">EGP {kpis.todaySales.toFixed(2)}</span>
                    <span className="text-[10px] text-gray-400 font-semibold">{kpis.todayOrdersCount} فاتورة</span>
                  </div>
                  <span className="text-[10px] text-gray-500 mt-1 block">متوسط الفاتورة: EGP {kpis.todayAvgTicket}</span>
                </div>

                <div className="glass-panel p-4 rounded-2xl border border-purple-500/20 bg-gradient-to-br from-purple-950/20 to-transparent">
                  <span className="text-[11px] text-gray-400 block">صافي أرباح النهاردة المحققة</span>
                  <div className="flex items-baseline justify-between mt-1 flex-row-reverse">
                    <span className={`text-2xl font-bold font-mono ${kpis.todayNet >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      EGP {kpis.todayNet.toFixed(2)}
                    </span>
                    <span className="text-[10px] text-gray-400">تكلفة البضاعة (COGS): EGP {kpis.todayCOGS.toFixed(2)}</span>
                  </div>
                  <span className="text-[10px] text-gray-500 mt-1 block">المبيعات - تكلفة الشراء (المصاريف تخصم شهرياً)</span>
                </div>

                <div className="glass-panel p-4 rounded-2xl border border-amber-500/20 bg-gradient-to-br from-amber-950/20 to-transparent">
                  <span className="text-[11px] text-gray-400 block">مصاريف وخرجيات المحل النهاردة</span>
                  <div className="flex items-baseline justify-between mt-1 flex-row-reverse">
                    <span className="text-2xl font-bold text-amber-400 font-mono">EGP {kpis.todayExpenses.toFixed(2)}</span>
                    <span className="text-[10px] text-gray-400">خرجيات الشهر: EGP {kpis.monthlyExpenses.toFixed(2)}</span>
                  </div>
                  <span className="text-[10px] text-gray-500 mt-1 block">نثريات وخرجيات تشغيل المحل</span>
                </div>

                <div
                  onClick={() => setActiveTab('returns')}
                  className="glass-panel p-4 rounded-2xl border border-rose-500/20 bg-gradient-to-br from-rose-950/20 to-transparent hover:border-rose-500/50 hover:bg-rose-950/30 transition-all cursor-pointer group"
                  title="اضغط للانتقال إلى سجل المرتجعات"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-gray-400 block">إجمالي المرتجعات النهاردة</span>
                    <span className="text-[10px] text-rose-400 group-hover:underline flex items-center gap-0.5 font-semibold">
                      <span>عرض السجل</span>
                      <span>←</span>
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between mt-1 flex-row-reverse">
                    <span className="text-2xl font-bold text-rose-400 font-mono">EGP {kpis.todayReturnsAmount.toFixed(2)}</span>
                    <span className="text-[10px] text-gray-400">{kpis.todayReturnsCount} عملية إرجاع</span>
                  </div>
                  <span className="text-[10px] text-gray-500 mt-1 block">مرتجع الشهر: EGP {kpis.monthlyReturnsAmount.toFixed(2)}</span>
                </div>
              </div>

              {/* Payment Methods Breakdown Bar (Cash & InstaPay only) */}
              <div className="glass-panel p-5 rounded-2xl border border-white/5 space-y-3">
                <h3 className="text-xs font-bold text-white flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-cyan-400" />
                  <span>تفصيل إيرادات النهاردة حسب طريقة الدفع</span>
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-4 bg-slate-900/60 rounded-xl border border-emerald-500/20 flex items-center justify-between">
                    <div>
                      <span className="text-xs text-gray-400 block">نقدي (كاش في الدرج النهاردة)</span>
                      <span className="text-xl font-bold text-emerald-400 font-mono mt-1 block">EGP {payments.cash.toFixed(2)}</span>
                    </div>
                    <span className="text-[11px] px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 font-bold">كاش بالدرج</span>
                  </div>
                  <div className="p-4 bg-slate-900/60 rounded-xl border border-purple-500/20 flex items-center justify-between">
                    <div>
                      <span className="text-xs text-gray-400 block">تحويل إنستا باي (InstaPay النهاردة)</span>
                      <span className="text-xl font-bold text-purple-400 font-mono mt-1 block">EGP {payments.instapay.toFixed(2)}</span>
                    </div>
                    <span className="text-[11px] px-2.5 py-1 rounded-lg bg-purple-500/10 text-purple-400 font-bold">تحويل بنكي</span>
                  </div>
                </div>
              </div>

              {/* Top Selling Produce Items */}
              <div>
                <div className="glass-panel p-5 rounded-2xl border border-white/5 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold text-white flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-emerald-400" />
                      <span>الأصناف الأكثر مبيعاً</span>
                    </h3>

                    {/* Period Switcher */}
                    <div className="flex items-center gap-1 p-0.5 bg-slate-900/80 rounded-lg border border-white/10 text-[10px]">
                      <button
                        type="button"
                        onClick={() => setTopItemsPeriod('today')}
                        className={`px-2.5 py-1 rounded-md font-bold transition-all ${
                          topItemsPeriod === 'today'
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shadow-sm'
                            : 'text-gray-400 hover:text-white'
                        }`}
                      >
                        يومياً
                      </button>
                      <button
                        type="button"
                        onClick={() => setTopItemsPeriod('month')}
                        className={`px-2.5 py-1 rounded-md font-bold transition-all ${
                          topItemsPeriod === 'month'
                            ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30 shadow-sm'
                            : 'text-gray-400 hover:text-white'
                        }`}
                      >
                        شهرياً
                      </button>
                      <button
                        type="button"
                        onClick={() => setTopItemsPeriod('all')}
                        className={`px-2.5 py-1 rounded-md font-bold transition-all ${
                          topItemsPeriod === 'all'
                            ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 shadow-sm'
                            : 'text-gray-400 hover:text-white'
                        }`}
                      >
                        كل الوقت
                      </button>
                    </div>
                  </div>

                  {(() => {
                    const displayedTopItems =
                      topItemsPeriod === 'today'
                        ? (topItemsByPeriod.today || topItems || [])
                        : topItemsPeriod === 'month'
                        ? (topItemsByPeriod.month || [])
                        : (topItemsByPeriod.all || []);

                    return (
                      <div className="space-y-2">
                        {displayedTopItems.length > 0 ? (
                          displayedTopItems.map((item: any, idx: number) => (
                            <div key={idx} className="p-2.5 bg-slate-900/50 rounded-xl border border-white/5 flex items-center justify-between flex-row-reverse text-xs">
                              <div className="flex items-center gap-2">
                                <span className="w-5 h-5 rounded-full bg-slate-800 text-gray-400 flex items-center justify-center text-[10px] font-mono">
                                  #{idx + 1}
                                </span>
                                <span className="font-semibold text-white">{item.name}</span>
                              </div>
                              <div className="flex items-center gap-4">
                                <span className="text-cyan-400 font-bold">{item.qty} قطع</span>
                                <span className="font-mono text-gray-300">EGP {item.total.toFixed(2)}</span>
                              </div>
                            </div>
                          ))
                        ) : (
                          <p className="text-xs text-gray-500 text-center py-4">
                            {topItemsPeriod === 'today' && 'لم يتم تسجيل مبيعات اليوم بعد'}
                            {topItemsPeriod === 'month' && 'لم يتم تسجيل مبيعات هذا الشهر بعد'}
                            {topItemsPeriod === 'all' && 'لا توجد مبيعات مسجلة في النظام'}
                          </p>
                        )}
                      </div>
                    );
                  })()}
                </div>
              </div>
              {/* Shift Summaries & Variances (تقرير الوردية وعجز وزيادة الكاش) */}
              <div className="glass-panel p-5 rounded-2xl border border-white/5 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-white flex items-center gap-2">
                    <Clock className="w-4 h-4 text-cyan-400" />
                    <span>سجل تقفيل الورديات واليوميات (مطابقة الكاش والعجز والزيادة)</span>
                  </h3>
                  <span className="text-[10px] text-gray-400 font-mono">
                    {shiftSummaries.length} وردية مسجلة
                  </span>
                </div>

                <div className="overflow-x-auto rounded-xl border border-white/5">
                  <table className="w-full text-right text-xs min-w-[880px]">
                    <thead className="bg-slate-900/80 text-gray-400 border-b border-white/5">
                      <tr>
                        <th className="p-3">الكاشير</th>
                        <th className="p-3">وقت الفتح</th>
                        <th className="p-3">وقت الإغلاق</th>
                        <th className="p-3 text-center">الفواتير</th>
                        <th className="p-3">إجمالي المبيعات</th>
                        <th className="p-3">الكاش المتوقع</th>
                        <th className="p-3">الكاش الفعلي</th>
                        <th className="p-3 text-purple-400">إنستا المتوقع</th>
                        <th className="p-3 text-purple-300">إنستا الفعلي</th>
                        <th className="p-3 text-center">مطابقة الكاش وإنستا باي (العجز / الزيادة)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {shiftSummaries.length > 0 ? (
                        shiftSummaries.map((s) => {
                          const isClosed = Boolean(s.closedAt);
                          const variance = s.varianceCash ?? 0;
                          return (
                            <tr key={s.id} className="hover:bg-white/5 transition-colors">
                              <td className="p-3 font-bold text-cyan-300">{s.cashierName || 'كاشير'}</td>
                              <td className="p-3 text-gray-400 font-mono text-[11px]">
                                {new Date(s.openedAt).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' })}
                              </td>
                              <td className="p-3 text-gray-400 font-mono text-[11px]">
                                {isClosed ? new Date(s.closedAt).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' }) : '—'}
                              </td>
                              <td className="p-3 text-center font-mono font-bold text-gray-300">{s.orderCount}</td>
                              <td className="p-3 font-mono font-bold text-white">EGP {Number(s.totalSales || 0).toFixed(2)}</td>
                              <td className="p-3 font-mono text-emerald-400">EGP {Number(s.expectedCash || 0).toFixed(2)}</td>
                              <td className="p-3 font-mono text-white">
                                {isClosed ? `EGP ${Number(s.closedCash || 0).toFixed(2)}` : '—'}
                              </td>
                              <td className="p-3 font-mono text-purple-400 font-semibold">
                                EGP {Number(s.expectedInstaPay || 0).toFixed(2)}
                              </td>
                              <td className="p-3 font-mono text-white font-semibold">
                                {isClosed ? (s.closedInstaPay !== null && s.closedInstaPay !== undefined ? `EGP ${Number(s.closedInstaPay || 0).toFixed(2)}` : 'EGP 0.00') : '—'}
                              </td>
                              <td className="p-3 text-center">
                                {!isClosed ? (
                                  <span className="px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[11px] font-bold inline-flex items-center gap-1">
                                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                                    <span>وردية جارية</span>
                                  </span>
                                ) : (
                                  <div className="flex flex-wrap items-center justify-center gap-1.5">
                                    {/* Cash Variance Badge */}
                                    {variance < -0.01 ? (
                                      <span className="px-2 py-0.5 rounded-lg bg-rose-500/15 text-rose-400 border border-rose-500/30 text-[11px] font-bold font-mono inline-flex items-center gap-1" title="عجز في كاش الدرج">
                                        <AlertTriangle className="w-3 h-3 shrink-0" />
                                        <span>عجز كاش: {Math.abs(variance).toFixed(2)}- ج</span>
                                      </span>
                                    ) : variance > 0.01 ? (
                                      <span className="px-2 py-0.5 rounded-lg bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 text-[11px] font-bold font-mono" title="زيادة في كاش الدرج">
                                        زيادة كاش: +{variance.toFixed(2)} ج
                                      </span>
                                    ) : (
                                      <span className="px-2 py-0.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[11px] font-bold font-mono" title="كاش الدرج مضبوط">
                                        كاش مضبوط
                                      </span>
                                    )}

                                    {/* InstaPay Variance Badge */}
                                    {((s.expectedInstaPay || 0) > 0 || (s.closedInstaPay || 0) > 0 || Math.abs(s.varianceInstaPay || 0) > 0.01) && (() => {
                                      const instaVar = s.varianceInstaPay ?? 0;
                                      if (instaVar < -0.01) {
                                        return (
                                          <span className="px-2 py-0.5 rounded-lg bg-rose-500/20 text-rose-300 border border-rose-500/40 text-[11px] font-bold font-mono inline-flex items-center gap-1" title="عجز في تحويلات إنستا باي">
                                            <AlertTriangle className="w-3 h-3 text-rose-400 shrink-0" />
                                            <span>عجز إنستا: {Math.abs(instaVar).toFixed(2)}- ج</span>
                                          </span>
                                        );
                                      } else if (instaVar > 0.01) {
                                        return (
                                          <span className="px-2 py-0.5 rounded-lg bg-purple-500/20 text-purple-300 border border-purple-500/40 text-[11px] font-bold font-mono" title="زيادة في تحويلات إنستا باي">
                                            زيادة إنستا: +{instaVar.toFixed(2)} ج
                                          </span>
                                        );
                                      } else {
                                        return (
                                          <span className="px-2 py-0.5 rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/20 text-[11px] font-bold font-mono" title="إنستا باي مضبوط">
                                            إنستا مضبوط
                                          </span>
                                        );
                                      }
                                    })()}
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan={10} className="p-6 text-center text-gray-500">
                            لا توجد ورديات مسجلة حتى الآن
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
            )
          )}

          {/* TAB: INVOICES LEDGER (DAILY & MONTHLY) */}
          {activeTab === 'invoices-ledger' && (
            loadingLedger && !ledgerData.todaySummary && (!ledgerData.days || ledgerData.days.length === 0) ? (
              <div className="flex flex-col items-center justify-center min-h-[420px] glass-panel rounded-3xl border border-white/5 p-12 text-center my-6">
                <div className="relative mb-5">
                  <div className="w-16 h-16 rounded-full border-4 border-cyan-500/20 border-t-cyan-400 animate-spin" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Calendar className="w-6 h-6 text-cyan-400 animate-pulse" />
                  </div>
                </div>
                <h3 className="text-lg font-bold text-white mb-2">جاري قراءة وتحميل دفتر فواتير ومبيعات المحل...</h3>
                <p className="text-xs text-gray-400 max-w-md leading-relaxed">
                  يتم الآن تجميع إحصائيات المبيعات، الأرباح، والخصومات اليومية والشهرية من قاعدة البيانات.
                </p>
              </div>
            ) : (
            <div className="space-y-6">
              {/* Header & Sub-nav Switcher */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-cyan-400" />
                    <span>سجل فواتير المبيعات (يومي / شهري)</span>
                  </h2>
                  <p className="text-xs text-gray-400">
                    أرشيف مبيعات وفواتير بانانا فود مجمعة باليوم وبالشهر مع إمكانية استعراض فواتير كل فترة وتفاصيل الإيصال
                  </p>
                </div>

                {/* Daily vs Monthly Switcher Toggle */}
                <div className="flex items-center gap-1.5 p-1 bg-slate-900/80 rounded-xl border border-white/10">
                  <button
                    onClick={() => setActiveLedgerView('daily')}
                    className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      activeLedgerView === 'daily'
                        ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-md shadow-cyan-500/20'
                        : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    <Calendar className="w-3.5 h-3.5" />
                    <span>سجل الأيام (اليومي)</span>
                    <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-white/20 text-white font-mono">
                      {ledgerData.days.length}
                    </span>
                  </button>

                  <button
                    onClick={() => setActiveLedgerView('monthly')}
                    className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      activeLedgerView === 'monthly'
                        ? 'bg-gradient-to-r from-purple-500 to-pink-600 text-white shadow-md shadow-purple-500/20'
                        : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    <BarChart3 className="w-3.5 h-3.5" />
                    <span>سجل الشهور (الشهري)</span>
                    <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-white/20 text-white font-mono">
                      {ledgerData.months.length}
                    </span>
                  </button>
                </div>
              </div>

              {/* Dynamic KPI Overview Cards: Today if daily, This Month if monthly */}
              {(() => {
                const isDaily = activeLedgerView === 'daily';
                const summary = isDaily
                  ? (ledgerData.todaySummary || (ledgerData.days && ledgerData.days[0]) || {})
                  : (ledgerData.monthSummary || (ledgerData.months && ledgerData.months[0]) || {});

                const netSales = summary.totalNet || 0;
                const cogs = summary.cogs || 0;
                const netProfit = summary.netProfit !== undefined ? summary.netProfit : (netSales - cogs);
                const returnsAmount = summary.returnsAmount || 0;
                const returnsCount = summary.returnsCount || 0;
                const ordersCount = summary.ordersCount || 0;
                const avgTicket = summary.avgTicket || 0;
                const cashDrawer = summary.payments?.CASH || 0;
                const visa = summary.payments?.VISA || 0;
                const instapay = summary.payments?.INSTAPAY || 0;
                const vodafoneCash = summary.payments?.VODAFONE_CASH || 0;

                const discounts = summary.totalDiscounts || 0;
                const expenses = summary.totalExpenses || 0;
                const suppliesPaid = summary.totalSuppliesPaid || 0;
                const netRevenueAfterSupplies = summary.netRevenueAfterSupplies !== undefined
                  ? summary.netRevenueAfterSupplies
                  : (netSales - suppliesPaid);

                return (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-gray-400 px-1">
                      <span className="font-semibold flex items-center gap-1.5 text-cyan-300">
                        {isDaily ? <Calendar className="w-4 h-4 text-cyan-400" /> : <BarChart3 className="w-4 h-4 text-purple-400" />}
                        <span>
                          {isDaily
                            ? `مؤشرات مبيعات وأرباح اليوم (${summary.dayNameAr || summary.date || 'اليوم'})`
                            : `مؤشرات مبيعات وأرباح هذا الشهر (${summary.monthNameAr || summary.month || 'الشهر الحالي'})`}
                        </span>
                      </span>
                      <span className="text-[11px] text-gray-500">
                        {isDaily ? 'تحديث لحظي لليوم الحالي' : `عبر ${summary.activeDaysCount || 0} يوم عمل نشط`}
                      </span>
                    </div>

                    <div className={`grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 ${isDaily ? 'xl:grid-cols-7' : 'xl:grid-cols-8'} gap-3`}>
                      {/* 1. Net Sales */}
                      <div className="glass-panel p-3.5 rounded-2xl border border-cyan-500/20 bg-gradient-to-br from-cyan-950/20 to-transparent">
                        <span className="text-[11px] text-gray-400 block">
                          {isDaily ? 'صافي مبيعات اليوم' : 'صافي مبيعات الشهر'}
                        </span>
                        <div className="flex items-baseline justify-between mt-1 flex-row-reverse">
                          <span className="text-xl font-bold text-cyan-400 font-mono">
                            EGP {netSales.toFixed(2)}
                          </span>
                          <span className="text-[10px] text-gray-400 font-semibold">{ordersCount} فاتورة</span>
                        </div>
                        <span className="text-[10px] text-gray-500 mt-1 block">
                          {isDaily ? 'إجمالي فواتير اليوم' : 'إجمالي فواتير الشهر'}
                        </span>
                      </div>

                      {/* 1.5 Net Revenue After Supplies (Shown only in monthly view) */}
                      {!isDaily && (
                        <div className="glass-panel p-3.5 rounded-2xl border border-blue-500/30 bg-gradient-to-br from-blue-950/30 via-slate-900/50 to-transparent">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] text-blue-300 block font-bold">
                              صافي الشهر بعد التوريد
                            </span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 font-semibold font-mono">
                              {suppliesPaid > 0 ? `-${suppliesPaid.toFixed(0)}` : '0'}
                            </span>
                          </div>
                          <div className="flex items-baseline justify-between mt-1 flex-row-reverse">
                            <span className="text-xl font-bold text-blue-400 font-mono">
                              EGP {netRevenueAfterSupplies.toFixed(2)}
                            </span>
                            <span className="text-[10px] text-gray-400">
                              بعد توريد الشهر
                            </span>
                          </div>
                          <span className="text-[10px] text-gray-400 mt-1 block font-mono" title="المبيعات ناقص فلوس التوريد المدفوعة">
                            المبيعات ({netSales.toFixed(2)}) - التوريد ({suppliesPaid.toFixed(2)})
                          </span>
                        </div>
                      )}

                      {/* 2. Net Profit */}
                      <div className="glass-panel p-3.5 rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-950/20 to-transparent">
                        <span className="text-[11px] text-gray-400 block">
                          {isDaily ? 'صافي أرباح اليوم' : 'صافي أرباح الشهر'}
                        </span>
                        <div className="flex items-baseline justify-between mt-1 flex-row-reverse">
                          <span className={`text-xl font-bold font-mono ${netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            EGP {netProfit.toFixed(2)}
                          </span>
                          <span className="text-[10px] text-gray-300 font-mono bg-white/5 px-1.5 py-0.5 rounded border border-white/10" title="تكلفة البضاعة المباعة (COGS)">
                            التكلفة: {cogs.toFixed(2)}
                          </span>
                        </div>
                        <span className="text-[10px] text-gray-400 mt-1 block font-mono" title={isDaily ? "صافي المبيعات - تكلفة البضاعة (المصاريف تخصم من أرباح الشهر)" : "صافي المبيعات - تكلفة البضاعة - المصاريف"}>
                          {isDaily
                            ? `المبيعات (${netSales.toFixed(2)}) - التكلفة (${cogs.toFixed(2)}) (المصاريف تخصم من أرباح الشهر)`
                            : `المبيعات (${netSales.toFixed(2)}) - التكلفة (${cogs.toFixed(2)}) - المصاريف (${expenses.toFixed(2)})`
                          }
                        </span>
                      </div>

                      {/* 3. Discounts (Dynamic: Today when Daily, Month when Monthly) */}
                      <div className="glass-panel p-3.5 rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-950/30 via-slate-900/50 to-transparent">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] text-amber-300 block font-bold">
                            {isDaily ? 'خصومات اليوم' : 'خصومات الشهر'}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-semibold font-mono">
                            {isDaily ? 'اليوم' : 'الشهر'}
                          </span>
                        </div>
                        <div className="flex items-baseline justify-between mt-1 flex-row-reverse">
                          <span className="text-xl font-bold text-amber-400 font-mono">
                            EGP {discounts.toFixed(2)}
                          </span>
                          <span className="text-[10px] text-gray-300">
                            {isDaily ? 'تخفيضات اليوم' : 'تخفيضات الشهر'}
                          </span>
                        </div>
                        <span className="text-[10px] text-gray-500 mt-1 block">
                          {isDaily ? 'إجمالي الخصم الممنوح لليوم' : `خصومات شهر ${summary.monthNameAr || 'الحالي'}`}
                        </span>
                      </div>

                      {/* 4. Expenses (Dynamic: Today when Daily, Month when Monthly) */}
                      <div className="glass-panel p-3.5 rounded-2xl border border-orange-500/30 bg-gradient-to-br from-orange-950/30 via-slate-900/50 to-transparent">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] text-orange-300 block font-bold">
                            {isDaily ? 'مصاريف اليوم' : 'مصاريف الشهر'}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-300 font-semibold font-mono">
                            {isDaily ? 'نثريات اليوم' : 'نثريات الشهر'}
                          </span>
                        </div>
                        <div className="flex items-baseline justify-between mt-1 flex-row-reverse">
                          <span className="text-xl font-bold text-orange-400 font-mono">
                            EGP {expenses.toFixed(2)}
                          </span>
                          <span className="text-[10px] text-gray-300">
                            {isDaily ? 'من الدرج اليوم' : 'إجمالي الشهر'}
                          </span>
                        </div>
                        <span className="text-[10px] text-gray-500 mt-1 block">
                          {isDaily ? 'نثريات وخرجيات تشغيل اليوم' : `مجموع مصروفات شهر ${summary.monthNameAr || 'الحالي'}`}
                        </span>
                      </div>

                      {/* 5. Average Ticket */}
                      <div className="glass-panel p-3.5 rounded-2xl border border-purple-500/20 bg-gradient-to-br from-purple-950/20 to-transparent">
                        <span className="text-[11px] text-gray-400 block">
                          {isDaily ? 'متوسط فاتورة اليوم' : 'متوسط فاتورة الشهر'}
                        </span>
                        <div className="flex items-baseline justify-between mt-1 flex-row-reverse">
                          <span className="text-xl font-bold text-purple-400 font-mono">
                            EGP {avgTicket.toFixed(2)}
                          </span>
                          <span className="text-[10px] text-gray-400">متوسط الزبون</span>
                        </div>
                        <span className="text-[10px] text-gray-500 mt-1 block">
                          متوسط الفاتورة للطلب
                        </span>
                      </div>

                      {/* 6. Returns */}
                      <div className="glass-panel p-3.5 rounded-2xl border border-rose-500/20 bg-gradient-to-br from-rose-950/20 to-transparent">
                        <span className="text-[11px] text-gray-400 block">
                          {isDaily ? 'مرتجعات اليوم' : 'مرتجعات الشهر'}
                        </span>
                        <div className="flex items-baseline justify-between mt-1 flex-row-reverse">
                          <span className="text-xl font-bold text-rose-400 font-mono">
                            EGP {returnsAmount.toFixed(2)}
                          </span>
                          <span className="text-[10px] text-gray-400">{returnsCount} مرتجع</span>
                        </div>
                        <span className="text-[10px] text-gray-500 mt-1 block">
                          إجمالي مبالغ الاسترداد
                        </span>
                      </div>

                      {/* 7. Cash in Drawer & Payment methods */}
                      <div className="glass-panel p-3.5 rounded-2xl border border-blue-500/20 bg-gradient-to-br from-blue-950/20 to-transparent">
                        <span className="text-[11px] text-gray-400 block">
                          {isDaily ? 'كاش الدرج (اليوم)' : 'كاش الدرج (الشهر)'}
                        </span>
                        <div className="flex items-baseline justify-between mt-1 flex-row-reverse">
                          <span className="text-xl font-bold text-emerald-400 font-mono">
                            EGP {cashDrawer.toFixed(2)}
                          </span>
                          <span className="text-[10px] text-gray-400 font-mono">
                            فيزا: {visa.toFixed(0)}
                          </span>
                        </div>
                        <span className="text-[10px] text-gray-500 mt-1 block">
                          إنستا: {instapay.toFixed(0)} | محفظة: {vodafoneCash.toFixed(0)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* VIEW 1: DAILY LEDGER */}
              {activeLedgerView === 'daily' && (
                <div className="glass-panel p-5 rounded-2xl border border-white/5 space-y-4">
                  {/* Search & Counter */}
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                    <div className="relative w-full sm:w-72">
                      <input
                        type="text"
                        value={ledgerSearch}
                        onChange={(e) => setLedgerSearch(e.target.value)}
                        placeholder="بحث باليوم أو التاريخ (مثال: الجمعة أو 2026-09)..."
                        className="w-full bg-slate-900 border border-white/10 rounded-xl py-2 px-3 text-xs text-white text-right placeholder-gray-500 focus:border-cyan-500"
                      />
                    </div>
                    <span className="text-xs text-gray-400">عدد الأيام المسجلة: {filteredDays.length} يوم</span>
                  </div>

                  {/* Daily Table / Cards */}
                  <div className="overflow-x-auto rounded-xl border border-white/5">
                    <table className="w-full text-right text-xs min-w-[650px]">
                      <thead className="bg-slate-900/80 text-gray-400 border-b border-white/5">
                        <tr>
                          <th className="p-3.5">اليوم والتاريخ</th>
                          <th className="p-3.5 text-center">عدد الفواتير</th>
                          <th className="p-3.5">إجمالي المبيعات</th>
                          <th className="p-3.5">الخصومات</th>
                          <th className="p-3.5">المصاريف</th>
                          <th className="p-3.5">الصافي المحصل</th>
                          <th className="p-3.5">تفصيل طرق الدفع</th>
                          <th className="p-3.5 text-center">استعراض الفواتير</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {loadingLedger ? (
                          <tr>
                            <td colSpan={8} className="p-10 text-center text-gray-400">
                              <div className="flex flex-col items-center justify-center gap-2">
                                <Loader2 className="w-7 h-7 text-cyan-400 animate-spin" />
                                <span className="text-xs font-semibold text-gray-300">جاري تحميل سجل الأيام من الداتابيز...</span>
                              </div>
                            </td>
                          </tr>
                        ) : filteredDays.length === 0 ? (
                          <tr>
                            <td colSpan={8} className="p-8 text-center text-gray-500">
                              لا توجد مبيعات مسجلة في الأيام المحددة.
                            </td>
                          </tr>
                        ) : (
                          filteredDays.map((day: any) => (
                            <tr
                              key={day.date}
                              className="hover:bg-cyan-500/5 transition-colors cursor-pointer group"
                              onClick={() => openPeriodOrders('day', day.date, day.dayNameAr)}
                            >
                              <td className="p-3.5">
                                <div className="flex items-center gap-2">
                                  <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 group-hover:scale-105 transition-transform">
                                    <Calendar className="w-4 h-4" />
                                  </div>
                                  <div>
                                    <span className="font-bold text-white block text-sm">{day.dayNameAr}</span>
                                    <span className="text-[11px] text-gray-400 font-mono">{day.date}</span>
                                  </div>
                                </div>
                              </td>
                              <td className="p-3.5 text-center">
                                <span className="px-2.5 py-1 rounded-full bg-slate-800 text-cyan-300 font-bold font-mono border border-cyan-500/20">
                                  {day.ordersCount} فاتورة
                                </span>
                              </td>
                              <td className="p-3.5 font-mono text-gray-300">
                                EGP {day.totalSales.toFixed(2)}
                              </td>
                              <td className="p-3.5 font-mono">
                                {day.totalDiscounts > 0 ? (
                                  <span className="px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 font-bold border border-amber-500/30">
                                    - EGP {day.totalDiscounts.toFixed(2)}
                                  </span>
                                ) : (
                                  <span className="text-gray-500 text-xs">EGP 0.00</span>
                                )}
                              </td>
                              <td className="p-3.5 font-mono">
                                {day.totalExpenses > 0 ? (
                                  <span className="px-2 py-0.5 rounded bg-orange-500/15 text-orange-300 font-bold border border-orange-500/30">
                                    - EGP {day.totalExpenses.toFixed(2)}
                                  </span>
                                ) : (
                                  <span className="text-gray-500 text-xs">EGP 0.00</span>
                                )}
                              </td>
                              <td className="p-3.5 font-mono">
                                <span className="font-bold text-emerald-400 text-sm block">
                                  EGP {day.totalNet.toFixed(2)}
                                </span>
                              </td>
                              <td className="p-3.5">
                                <div className="flex flex-wrap gap-1.5 text-[10px]">
                                  {day.payments.CASH > 0 && (
                                    <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 font-mono">
                                      كاش: {day.payments.CASH.toFixed(0)}
                                    </span>
                                  )}
                                  {day.payments.VISA > 0 && (
                                    <span className="px-2 py-0.5 rounded bg-blue-500/10 text-blue-300 border border-blue-500/20 font-mono">
                                      فيزا: {day.payments.VISA.toFixed(0)}
                                    </span>
                                  )}
                                  {day.payments.INSTAPAY > 0 && (
                                    <span className="px-2 py-0.5 rounded bg-purple-500/10 text-purple-300 border border-purple-500/20 font-mono">
                                      إنستا: {day.payments.INSTAPAY.toFixed(0)}
                                    </span>
                                  )}
                                  {day.payments.VODAFONE_CASH > 0 && (
                                    <span className="px-2 py-0.5 rounded bg-rose-500/10 text-rose-300 border border-rose-500/20 font-mono">
                                      محفظة: {day.payments.VODAFONE_CASH.toFixed(0)}
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="p-3.5 text-center">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openPeriodOrders('day', day.date, day.dayNameAr);
                                  }}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-xs font-bold transition-all shadow-sm"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                  <span>عرض الفواتير ({day.ordersCount})</span>
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* VIEW 2: MONTHLY LEDGER */}
              {activeLedgerView === 'monthly' && (
                <div className="glass-panel p-5 rounded-2xl border border-white/5 space-y-4">
                  {/* Search & Counter */}
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                    <div className="relative w-full sm:w-72">
                      <input
                        type="text"
                        value={ledgerSearch}
                        onChange={(e) => setLedgerSearch(e.target.value)}
                        placeholder="بحث بالشهر (مثال: سبتمبر أو 2026-09)..."
                        className="w-full bg-slate-900 border border-white/10 rounded-xl py-2 px-3 text-xs text-white text-right placeholder-gray-500 focus:border-purple-500"
                      />
                    </div>
                    <span className="text-xs text-gray-400">عدد الشهور المسجلة: {filteredMonths.length} شهر</span>
                  </div>

                  {/* Monthly Table / Cards */}
                  <div className="overflow-x-auto rounded-xl border border-white/5">
                    <table className="w-full text-right text-xs min-w-[650px]">
                      <thead className="bg-slate-900/80 text-gray-400 border-b border-white/5">
                        <tr>
                          <th className="p-3.5">الشهر والسنة</th>
                          <th className="p-3.5 text-center">أيام العمل</th>
                          <th className="p-3.5 text-center">عدد الفواتير</th>
                          <th className="p-3.5">إجمالي المبيعات</th>
                          <th className="p-3.5">الخصومات</th>
                          <th className="p-3.5">المصاريف</th>
                          <th className="p-3.5 text-blue-300">توريد البضاعة</th>
                          <th className="p-3.5">الصافي بعد التوريد</th>
                          <th className="p-3.5">تفصيل طرق الدفع</th>
                          <th className="p-3.5 text-center">استعراض الفواتير</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {loadingLedger ? (
                          <tr>
                            <td colSpan={10} className="p-10 text-center text-gray-400">
                              <div className="flex flex-col items-center justify-center gap-2">
                                <Loader2 className="w-7 h-7 text-purple-400 animate-spin" />
                                <span className="text-xs font-semibold text-gray-300">جاري تحميل سجل الشهور من الداتابيز...</span>
                              </div>
                            </td>
                          </tr>
                        ) : filteredMonths.length === 0 ? (
                          <tr>
                            <td colSpan={10} className="p-8 text-center text-gray-500">
                              لا توجد مبيعات مسجلة في الشهور المحددة.
                            </td>
                          </tr>
                        ) : (
                          filteredMonths.map((month: any) => (
                            <tr
                              key={month.month}
                              className="hover:bg-purple-500/5 transition-colors cursor-pointer group"
                              onClick={() => openPeriodOrders('month', month.month, month.monthNameAr)}
                            >
                              <td className="p-3.5">
                                <div className="flex items-center gap-2">
                                  <div className="p-2 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20 group-hover:scale-105 transition-transform">
                                    <BarChart3 className="w-4 h-4" />
                                  </div>
                                  <div>
                                    <span className="font-bold text-white block text-sm">{month.monthNameAr}</span>
                                    <span className="text-[11px] text-gray-400 font-mono">{month.month}</span>
                                  </div>
                                </div>
                              </td>
                              <td className="p-3.5 text-center">
                                <span className="px-2 py-0.5 rounded bg-slate-800 text-gray-300 font-semibold font-mono">
                                  {month.activeDaysCount} يوم
                                </span>
                              </td>
                              <td className="p-3.5 text-center">
                                <span className="px-2.5 py-1 rounded-full bg-slate-800 text-purple-300 font-bold font-mono border border-purple-500/20">
                                  {month.ordersCount} فاتورة
                                </span>
                              </td>
                              <td className="p-3.5 font-mono text-gray-300">
                                EGP {month.totalSales.toFixed(2)}
                              </td>
                              <td className="p-3.5 font-mono">
                                {month.totalDiscounts > 0 ? (
                                  <span className="px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 font-bold border border-amber-500/30">
                                    - EGP {month.totalDiscounts.toFixed(2)}
                                  </span>
                                ) : (
                                  <span className="text-gray-500 text-xs">EGP 0.00</span>
                                )}
                              </td>
                              <td className="p-3.5 font-mono">
                                {month.totalExpenses > 0 ? (
                                  <span className="px-2 py-0.5 rounded bg-orange-500/15 text-orange-300 font-bold border border-orange-500/30">
                                    - EGP {month.totalExpenses.toFixed(2)}
                                  </span>
                                ) : (
                                  <span className="text-gray-500 text-xs">EGP 0.00</span>
                                )}
                              </td>
                              <td className="p-3.5 font-mono">
                                {month.totalSuppliesPaid > 0 ? (
                                  <span className="px-2 py-0.5 rounded bg-blue-500/15 text-blue-300 font-bold border border-blue-500/30">
                                    - EGP {month.totalSuppliesPaid.toFixed(2)}
                                  </span>
                                ) : (
                                  <span className="text-gray-500 text-xs">EGP 0.00</span>
                                )}
                              </td>
                              <td className="p-3.5 font-mono">
                                <span className="font-bold text-emerald-400 text-sm block">
                                  EGP {(month.netRevenueAfterSupplies !== undefined ? month.netRevenueAfterSupplies : (month.totalNet - (month.totalSuppliesPaid || 0))).toFixed(2)}
                                </span>
                                {month.totalSuppliesPaid > 0 && (
                                  <span className="text-[10px] text-gray-400 font-normal block">
                                    المبيعات: {month.totalNet.toFixed(2)}
                                  </span>
                                )}
                              </td>
                              <td className="p-3.5">
                                <div className="flex flex-wrap gap-1.5 text-[10px]">
                                  {month.payments.CASH > 0 && (
                                    <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 font-mono">
                                      كاش: {month.payments.CASH.toFixed(0)}
                                    </span>
                                  )}
                                  {month.payments.VISA > 0 && (
                                    <span className="px-2 py-0.5 rounded bg-blue-500/10 text-blue-300 border border-blue-500/20 font-mono">
                                      فيزا: {month.payments.VISA.toFixed(0)}
                                    </span>
                                  )}
                                  {month.payments.INSTAPAY > 0 && (
                                    <span className="px-2 py-0.5 rounded bg-purple-500/10 text-purple-300 border border-purple-500/20 font-mono">
                                      إنستا: {month.payments.INSTAPAY.toFixed(0)}
                                    </span>
                                  )}
                                  {month.payments.VODAFONE_CASH > 0 && (
                                    <span className="px-2 py-0.5 rounded bg-rose-500/10 text-rose-300 border border-rose-500/20 font-mono">
                                      محفظة: {month.payments.VODAFONE_CASH.toFixed(0)}
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="p-3.5 text-center">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openPeriodOrders('month', month.month, month.monthNameAr);
                                  }}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border border-purple-500/30 text-xs font-bold transition-all shadow-sm"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                  <span>عرض فواتير الشهر ({month.ordersCount})</span>
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
            )
          )}

          {/* TAB 2: PURCHASES & SUPPLIERS */}
          {activeTab === 'purchases' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <Truck className="w-4 h-4 text-cyan-400" />
                    <span>إدارة تجار الجملة وفواتير التوريد والمشتريات</span>
                  </h3>
                  <p className="text-xs text-gray-400">سجل مشتريات وتوريد الخضار والفاكهة من سوق العبور و6 أكتوبر والمزارع، وتابع مديونيات وحسابات التجار</p>
                </div>
                <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                  <button
                    onClick={() => setShowAddSupplierModal(true)}
                    className="flex-1 sm:flex-initial justify-center px-3.5 py-2 rounded-xl bg-purple-500/20 text-purple-300 border border-purple-500/30 text-xs font-bold hover:bg-purple-500/30 flex items-center gap-1.5 shadow-sm transition-all"
                  >
                    <PlusCircle className="w-4 h-4" />
                    <span>+ إضافة تاجر / مورد جديد</span>
                  </button>
                  <button
                    onClick={() => setShowAddPurchaseModal(true)}
                    className="flex-1 sm:flex-initial justify-center px-3.5 py-2 rounded-xl bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-xs font-bold hover:bg-cyan-500/30 flex items-center gap-1.5 shadow-sm transition-all"
                  >
                    <Receipt className="w-4 h-4" />
                    <span>+ تسجيل فاتورة توريد ومشتريات</span>
                  </button>
                </div>
              </div>

              {/* Suppliers List Table */}
              <div className="glass-panel p-5 rounded-2xl border border-white/5 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-white flex items-center gap-2">
                    <Users className="w-4 h-4 text-purple-400" />
                    <span>قائمة تجار الجملة ووكالات التوريد والأرصدة</span>
                  </h4>
                  <span className="text-[11px] text-gray-400">إجمالي الموردين: {suppliers.length}</span>
                </div>
                <div className="overflow-x-auto rounded-xl border border-white/5">
                  <table className="w-full text-right text-xs min-w-[680px]">
                    <thead className="bg-slate-900/80 text-gray-400 border-b border-white/5">
                      <tr>
                        <th className="p-3">اسم المعلم / التاجر</th>
                        <th className="p-3">الوكالة / المزرعة / السوق</th>
                        <th className="p-3">رقم الهاتف</th>
                        <th className="p-3">إجمالي التوريدات</th>
                        <th className="p-3">المبلغ المسدد</th>
                        <th className="p-3">الرصيد المتبقي (آجل)</th>
                        <th className="p-3 text-center">الإجراءات</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {suppliers.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="p-6 text-center text-gray-500">
                            لا يوجد تجار أو موردين مسجلين حالياً. اضغط على "+ إضافة تاجر / مورد جديد" لإضافة وكالات سوق العبور أو المزارع.
                          </td>
                        </tr>
                      ) : (
                        suppliers.map((s) => (
                          <tr key={s.id} className="hover:bg-white/5 transition-colors">
                            <td className="p-3 font-semibold text-white">
                              <div className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-cyan-400"></span>
                                <span>{s.name}</span>
                              </div>
                            </td>
                            <td className="p-3 text-gray-300">{s.companyName || s.address || '-'}</td>
                            <td className="p-3 text-gray-400 font-mono">{s.phone || '-'}</td>
                            <td className="p-3 font-mono text-cyan-400 font-bold">EGP {s.totalPurchases?.toFixed(2) || '0.00'}</td>
                            <td className="p-3 font-mono text-emerald-400 font-semibold">EGP {s.totalPaid?.toFixed(2) || '0.00'}</td>
                            <td className="p-3 font-mono font-bold text-rose-400">EGP {s.remainingBalance?.toFixed(2) || '0.00'}</td>
                            <td className="p-3 text-center">
                              <button
                                onClick={() => handleDeleteSupplier(s.id, s.name)}
                                className="px-2 py-1 rounded-lg text-rose-400 hover:text-white hover:bg-rose-500/20 border border-rose-500/20 inline-flex items-center gap-1 text-xs transition-all active:scale-95"
                                title="حذف المورد"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span>مسح</span>
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Recent Purchase Invoices */}
              <div className="glass-panel p-5 rounded-2xl border border-white/5 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-white flex items-center gap-2">
                    <Receipt className="w-4 h-4 text-cyan-400" />
                    <span>سجل فواتير توريد ومشتريات الخضار والفاكهة المسجلة</span>
                  </h4>
                  <span className="text-[11px] text-gray-400">عدد الفواتير: {purchaseInvoices.length}</span>
                </div>
                <div className="overflow-x-auto rounded-xl border border-white/5">
                  <table className="w-full text-right text-xs min-w-[750px]">
                    <thead className="bg-slate-900/80 text-gray-400 border-b border-white/5">
                      <tr>
                        <th className="p-3">رقم الفاتورة</th>
                        <th className="p-3">المورد / الوكالة</th>
                        <th className="p-3">التاريخ</th>
                        <th className="p-3">أصناف الخضار والفاكهة المشتراة</th>
                        <th className="p-3">طريقة الدفع</th>
                        <th className="p-3">إجمالي الفاتورة</th>
                        <th className="p-3">المدفوع</th>
                        <th className="p-3">المتبقي (آجل)</th>
                        <th className="p-3 text-center">الإجراءات</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {purchaseInvoices.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="p-6 text-center text-gray-500">
                            لم يتم تسجيل أي فواتير مشتريات وتوريد بعد. اضغط على "+ تسجيل فاتورة توريد ومشتريات" لإضافة أول فاتورة وتحديث تكلفة الأصناف.
                          </td>
                        </tr>
                      ) : (
                        purchaseInvoices.map((inv) => (
                          <tr key={inv.id} className="hover:bg-white/5 transition-colors">
                            <td className="p-3 font-mono font-bold text-white">{inv.invoiceNumber}</td>
                            <td className="p-3 text-cyan-300 font-semibold">{inv.supplier?.name || inv.supplierName || 'مورد عام'}</td>
                            <td className="p-3 text-gray-400 font-mono text-[11px]">{new Date(inv.invoiceDate).toLocaleDateString('ar-EG')}</td>
                            <td className="p-3 max-w-xs">
                              <span className="text-gray-300 line-clamp-1" title={inv.items?.map((it: any) => `${it.itemName} (${it.quantity} ${it.purchaseUnit})`).join('، ')}>
                                {inv.items?.map((it: any) => `${it.itemName} (${it.quantity} ${it.purchaseUnit})`).join('، ')}
                              </span>
                            </td>
                            <td className="p-3">
                              <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                                inv.paymentMethod === 'CASH'
                                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                  : inv.paymentMethod === 'INSTAPAY'
                                  ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                                  : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                              }`}>
                                {inv.paymentMethod === 'CASH'
                                  ? 'كاش نقدي'
                                  : inv.paymentMethod === 'INSTAPAY'
                                  ? 'إنستا باي'
                                  : inv.paymentMethod === 'DEFERRED'
                                  ? 'آجل على الحساب'
                                  : inv.paymentMethod}
                              </span>
                            </td>
                            <td className="p-3 font-mono font-bold text-white">EGP {inv.totalAmount.toFixed(2)}</td>
                            <td className="p-3 font-mono text-emerald-400 font-semibold">EGP {inv.paidAmount.toFixed(2)}</td>
                            <td className="p-3 font-mono font-bold text-rose-400">
                              {inv.remainingAmount > 0 ? `EGP ${inv.remainingAmount.toFixed(2)}` : '0.00'}
                            </td>
                            <td className="p-3 text-center">
                              {inv.remainingAmount > 0 ? (
                                <button
                                  onClick={() => {
                                    setSelectedInvoiceToPay(inv);
                                    setPaymentAmountInput(inv.remainingAmount.toString());
                                    setPaymentMethodInput(inv.paymentMethod === 'DEFERRED' ? 'CASH' : inv.paymentMethod);
                                    setShowPayModal(true);
                                  }}
                                  className="px-3 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-bold hover:bg-emerald-500/30 inline-flex items-center gap-1 shadow-sm transition-all active:scale-95"
                                >
                                  <DollarSign className="w-3.5 h-3.5" />
                                  <span>تسديد دفعة</span>
                                </button>
                              ) : (
                                <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-lg font-semibold border border-emerald-500/20 inline-block">
                                  مسددة بالكامل
                                </span>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: RETURNS LOG */}
          {activeTab === 'returns' && (
            <div className="space-y-6">
              <div className="glass-panel p-5 rounded-2xl border border-white/5 space-y-3">
                <h4 className="text-xs font-bold text-white flex items-center gap-2">
                  <RotateCcw className="w-4 h-4 text-rose-400" />
                  <span>سجل فواتير المرتجعات والاسترداد</span>
                </h4>
                <div className="overflow-x-auto rounded-xl border border-white/5">
                  <table className="w-full text-right text-xs min-w-[650px]">
                    <thead className="bg-slate-900/80 text-gray-400 border-b border-white/5">
                      <tr>
                        <th className="p-3">رقم الإيصال</th>
                        <th className="p-3">الكاشير</th>
                        <th className="p-3">التاريخ والوقت</th>
                        <th className="p-3">المبلغ المسترد</th>
                        <th className="p-3">سبب الإرجاع</th>
                        <th className="p-3">إعادة الخامات</th>
                        <th className="p-3 text-center">الفاتورة الأصلية</th>
                        <th className="p-3 text-center">إجراءات</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {returnsLog && returnsLog.length > 0 ? (
                        returnsLog.map((ret) => {
                          const refund = Number(ret.totalRefund ?? ret.refundAmount ?? 0);
                          const isRestocked = ret.restocked ?? ret.restockItems ?? false;
                          const receiptNum = ret.order?.receiptNumber || ret.receiptNumber || (ret.orderId ? `#${ret.orderId.slice(0, 8)}` : '-');
                          return (
                            <tr key={ret.id} className="hover:bg-white/5 transition-colors">
                              <td className="p-3">
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (ret.order) {
                                      setSelectedOrderReceipt(ret.order);
                                    } else if (ret.orderId) {
                                      fetchOrderAndOpenReceipt(ret.orderId);
                                    }
                                  }}
                                  className="font-mono font-bold text-cyan-400 hover:text-cyan-300 hover:underline inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                                  title="اضغط لعرض تفاصيل الفاتورة الأصلية"
                                >
                                  <FileText className="w-3.5 h-3.5" />
                                  <span>{receiptNum}</span>
                                </button>
                              </td>
                              <td className="p-3 text-cyan-300">{ret.cashierName || 'كاشير'}</td>
                              <td className="p-3 text-gray-400 font-mono text-[11px]">
                                {ret.createdAt ? new Date(ret.createdAt).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' }) : '-'}
                              </td>
                              <td className="p-3 font-mono font-bold text-rose-400">EGP {refund.toFixed(2)}</td>
                              <td className="p-3 text-amber-300 font-medium">{ret.reason || 'مرتجع'}</td>
                              <td className="p-3">
                                <span className={`px-2 py-0.5 rounded text-[10px] ${isRestocked ? 'bg-emerald-500/10 text-emerald-400' : 'bg-gray-500/10 text-gray-400'}`}>
                                  {isRestocked ? 'نعم (تمت الإعادة)' : 'لا'}
                                </span>
                              </td>
                              <td className="p-3 text-center">
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (ret.order) {
                                      setSelectedOrderReceipt(ret.order);
                                    } else if (ret.orderId) {
                                      fetchOrderAndOpenReceipt(ret.orderId);
                                    }
                                  }}
                                  className="px-2.5 py-1 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-xs font-semibold inline-flex items-center gap-1 transition-all shadow-sm cursor-pointer"
                                  title="عرض تفاصيل الفاتورة والإيصال"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                  <span>عرض الفاتورة</span>
                                </button>
                              </td>
                              <td className="p-3 text-center">
                                <button
                                  type="button"
                                  onClick={() => setReturnToDelete({ id: ret.id, receiptNum, refundAmount: refund })}
                                  disabled={deletingReturnId === ret.id}
                                  className="px-2.5 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-xs font-semibold inline-flex items-center gap-1 transition-all shadow-sm cursor-pointer disabled:opacity-50"
                                  title="مسح المرتجع نهائياً وإعادة الفلوس للدرج"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                  <span>{deletingReturnId === ret.id ? 'جاري الحذف...' : 'حذف'}</span>
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan={8} className="p-8 text-center text-gray-500">
                            لا توجد مرتجعات مسجلة حتى الآن
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: PRODUCT PROFITABILITY & REAL COSTS */}
          {activeTab === 'profitability' && (
            <div className="space-y-6">
              <div className="glass-panel p-5 rounded-2xl border border-white/5 space-y-4">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-bold text-white">حسبة التكلفة الحقيقية وهوامش المكسب ومخزون المحل</h3>
                    <p className="text-xs text-gray-400">متابعة الكميات الحالية المتوفرة بالمحل وحدود النواقص وأسعار تكلفة الشراء وهوامش الربح وسجل التوريدات اليومية والشهرية</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
                    {profitSubTab === 'costs' ? (
                      <button
                        type="button"
                        onClick={() => {
                          setNewItemName('');
                          setNewItemCategory('');
                          setNewItemPrice('');
                          setNewItemCost('');
                          setNewItemMargin('');
                          setNewItemStockQty('50');
                          setNewItemMinStock('15');
                          setNewItemUnit('كجم');
                          setNewItemIngredients([]);
                          setShowAddItemModal(true);
                        }}
                        className="flex-1 sm:flex-initial justify-center px-3.5 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 text-white text-xs font-bold hover:from-emerald-600 hover:to-cyan-600 flex items-center gap-1.5 shadow-lg shadow-emerald-500/20 active:scale-95 transition-all cursor-pointer"
                      >
                        <PlusCircle className="w-4 h-4" />
                        <span>+ إضافة صنف جديد للمحل</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setPurInvoiceDate(new Date().toISOString().slice(0, 10));
                          setPurItems([{ itemId: '', rawMaterialId: '', itemName: '', customName: '', isCustom: false, quantity: '', purchaseUnit: 'كجم', totalPrice: '', sellingPrice: '' }]);
                          setPurPaidAmount('');
                          setShowAddPurchaseModal(true);
                        }}
                        className="flex-1 sm:flex-initial justify-center px-3.5 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white text-xs font-bold hover:from-cyan-600 hover:to-blue-700 flex items-center gap-1.5 shadow-lg shadow-cyan-500/20 active:scale-95 transition-all cursor-pointer"
                      >
                        <PlusCircle className="w-4 h-4" />
                        <span>+ تسجيل فاتورة توريد / بضاعة جديدة</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        fetchProductCosts();
                        fetchSuppliersAndPurchases();
                      }}
                      className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 border border-white/10 hover:text-white transition-all cursor-pointer"
                      title="تحديث البيانات"
                    >
                      <RefreshCw className={`w-4 h-4 ${loadingCosts ? 'animate-spin text-emerald-400' : ''}`} />
                    </button>
                  </div>
                </div>

                {/* SUB-TABS: Costs & Margins VS Supply & Purchases Log */}
                <div className="flex items-center gap-2 border-b border-white/10 pb-3 pt-1">
                  <button
                    type="button"
                    onClick={() => setProfitSubTab('costs')}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      profitSubTab === 'costs'
                        ? 'bg-gradient-to-r from-emerald-500 to-green-600 text-white shadow-lg shadow-emerald-500/20'
                        : 'bg-slate-900/80 hover:bg-white/5 text-gray-400 hover:text-white border border-white/5'
                    }`}
                  >
                    <TrendingUp className="w-4 h-4" />
                    <span>حسبة التكلفة وهوامش الربح والمخزون</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setProfitSubTab('supplies');
                      fetchSuppliersAndPurchases();
                    }}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      profitSubTab === 'supplies'
                        ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-lg shadow-cyan-500/20'
                        : 'bg-slate-900/80 hover:bg-white/5 text-gray-400 hover:text-white border border-white/5'
                    }`}
                  >
                    <Truck className="w-4 h-4" />
                    <span>سجل التوريدات وفواتير البضاعة ({purchaseInvoices.length} فاتورة)</span>
                  </button>
                </div>

                {profitSubTab === 'costs' ? (
                  <>

                {/* INVENTORY VALUATION & KPI STATS CARDS */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 pt-1">
                  {/* Card 1: TOTAL INVENTORY COST VALUE (THE MAIN REQUIREMENT) */}
                  <div className="relative overflow-hidden p-4 rounded-2xl bg-gradient-to-br from-emerald-950/50 via-slate-900/90 to-slate-950 border-2 border-emerald-500/40 shadow-xl shadow-emerald-500/10">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                          <Package className="w-4 h-4" />
                        </div>
                        <div>
                          <span className="text-xs font-bold text-white block">إجمالي رأس مال البضاعة</span>
                          <span className="text-[10px] text-emerald-300/80 font-medium">سعر التكلفة الحالي بالمحل</span>
                        </div>
                      </div>
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-mono font-semibold">
                        الكمية × التكلفة
                      </span>
                    </div>
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-2xl font-black text-emerald-400 font-mono tracking-tight">
                        {inventoryValuation.totalCostValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                      <span className="text-xs text-emerald-500 font-bold">ج.م</span>
                    </div>
                    <div className="mt-2 text-[11px] text-gray-300/90 flex items-center justify-between border-t border-white/5 pt-1.5">
                      <span>الأصناف المتوفرة:</span>
                      <span className="font-mono text-emerald-300 font-bold">
                        {inventoryValuation.totalItemsWithStock} صنف ({inventoryValuation.totalStockQty.toLocaleString('en-US', { maximumFractionDigits: 1 })} وحدة/كجم)
                      </span>
                    </div>
                  </div>

                  {/* Card 2: TOTAL RETAIL VALUE */}
                  <div className="relative overflow-hidden p-4 rounded-2xl bg-gradient-to-br from-cyan-950/30 via-slate-900/90 to-slate-950 border border-cyan-500/30 shadow-lg shadow-cyan-500/5">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-xl bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                          <ShoppingBag className="w-4 h-4" />
                        </div>
                        <div>
                          <span className="text-xs font-bold text-white block">القيمة البيعية للبضاعة</span>
                          <span className="text-[10px] text-cyan-300/80 font-medium">إجمالي السعر للبيع</span>
                        </div>
                      </div>
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-mono font-semibold">
                        الكمية × البيع
                      </span>
                    </div>
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-2xl font-black text-cyan-400 font-mono tracking-tight">
                        {inventoryValuation.totalRetailValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                      <span className="text-xs text-cyan-500 font-bold">ج.م</span>
                    </div>
                    <div className="mt-2 text-[11px] text-gray-300/90 flex items-center justify-between border-t border-white/5 pt-1.5">
                      <span>العائد المتوقع:</span>
                      <span className="font-mono text-cyan-300 font-bold">عند تصريف كامل البضاعة</span>
                    </div>
                  </div>

                  {/* Card 3: EXPECTED PROFIT FROM CURRENT STOCK */}
                  <div className="relative overflow-hidden p-4 rounded-2xl bg-gradient-to-br from-amber-950/30 via-slate-900/90 to-slate-950 border border-amber-500/30 shadow-lg shadow-amber-500/5">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
                          <TrendingUp className="w-4 h-4" />
                        </div>
                        <div>
                          <span className="text-xs font-bold text-white block">الأرباح المتوقعة من البضاعة</span>
                          <span className="text-[10px] text-amber-300/80 font-medium">هامش الربح الكلي</span>
                        </div>
                      </div>
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-mono font-semibold">
                        {inventoryValuation.overallMarginPct.toFixed(1)}%
                      </span>
                    </div>
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-2xl font-black text-amber-400 font-mono tracking-tight">
                        {inventoryValuation.totalExpectedProfit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                      <span className="text-xs text-amber-500 font-bold">ج.م</span>
                    </div>
                    <div className="mt-2 text-[11px] text-gray-300/90 flex items-center justify-between border-t border-white/5 pt-1.5">
                      <span>الربح الإجمالي:</span>
                      <span className="font-mono text-amber-300 font-bold">البيعي - رأس المال</span>
                    </div>
                  </div>
                </div>

                {/* Filter Notice Banner when user is filtering */}
                {filteredProductCosts.length !== productCosts.length && (
                  <div className="p-2.5 px-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-emerald-300">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                      <span>
                        حسبة الأصناف المفلترة حالياً ({filteredProductCosts.length} صنف من {productCosts.length}):
                      </span>
                    </div>
                    <div className="flex items-center gap-4 font-mono font-bold">
                      <span>
                        إجمالي كميات العرض: <span className="text-white">{filteredInventoryValuation.totalStockQty.toFixed(1)}</span>
                      </span>
                      <span>
                        رأس مال العرض: <span className="text-emerald-400">EGP {filteredInventoryValuation.totalCostValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </span>
                    </div>
                  </div>
                )}

                {/* Quick Search & Filter Bar (Matching POS Experience) */}
                <div className="bg-slate-900/60 border border-white/10 rounded-xl p-3 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 flex-1">
                    {/* Search Input */}
                    <div className="relative flex-1 sm:max-w-xs">
                      <Search className="w-4 h-4 text-gray-400 absolute right-3 top-2.5" />
                      <input
                        type="text"
                        value={profitSearchQuery}
                        onChange={(e) => setProfitSearchQuery(e.target.value)}
                        placeholder="دور على أي صنف بالاسم أو القسم..."
                        className="w-full bg-slate-950/80 border border-white/10 rounded-xl pr-9 pl-9 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500 text-right transition-colors"
                      />
                      {profitSearchQuery && (
                        <button
                          type="button"
                          onClick={() => setProfitSearchQuery('')}
                          className="absolute left-2.5 top-2 text-gray-400 hover:text-white p-0.5 rounded transition-colors cursor-pointer"
                          title="مسح البحث"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    {/* Stock Status Filter Chips */}
                    <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
                      {[
                        { id: 'ALL', label: 'الكل' },
                        { id: 'AVAILABLE', label: 'متوفر' },
                        { id: 'LOW', label: 'قرب يخلص' },
                        { id: 'OUT', label: 'خلصان' },
                      ].map((st) => (
                        <button
                          key={st.id}
                          type="button"
                          onClick={() => setProfitStockFilter(st.id as any)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                            profitStockFilter === st.id
                              ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/20 font-bold'
                              : 'bg-white/5 hover:bg-white/10 text-gray-300 border border-white/5'
                          }`}
                        >
                          {st.label}
                        </button>
                      ))}
                    </div>

                    {/* Category Filter Dropdown */}
                    {profitCategories.length > 1 && (
                      <select
                        value={profitCategoryFilter}
                        onChange={(e) => setProfitCategoryFilter(e.target.value)}
                        className="bg-slate-950/80 border border-white/10 rounded-xl px-3 py-2 text-xs text-gray-200 focus:outline-none focus:border-emerald-500 cursor-pointer"
                      >
                        <option value="ALL">جميع الأقسام ({profitCategories.length})</option>
                        {profitCategories.map((cat) => (
                          <option key={cat} value={cat}>{cat}</option>
                        ))}
                      </select>
                    )}
                  </div>

                  {/* Realtime Count & Reset */}
                  <div className="flex items-center justify-between sm:justify-end gap-3 text-xs text-gray-400 font-mono shrink-0">
                    <div>
                      <span>عرض: </span>
                      <span className="text-emerald-400 font-bold">{filteredProductCosts.length}</span>
                      <span> من {productCosts.length} صنف</span>
                    </div>

                    {(profitSearchQuery || profitStockFilter !== 'ALL' || profitCategoryFilter !== 'ALL') && (
                      <button
                        type="button"
                        onClick={() => {
                          setProfitSearchQuery('');
                          setProfitStockFilter('ALL');
                          setProfitCategoryFilter('ALL');
                        }}
                        className="text-[11px] text-amber-400 hover:text-amber-300 underline font-sans cursor-pointer"
                      >
                        إلغاء الفلترة
                      </button>
                    )}
                  </div>
                </div>

                <div className="overflow-x-auto rounded-xl border border-white/5">
                  <table className="w-full text-right text-xs min-w-[950px]">
                    <thead className="bg-slate-900/80 text-gray-400 border-b border-white/5">
                      <tr>
                        <th className="p-3">اسم الصنف</th>
                        <th className="p-3">القسم</th>
                        <th className="p-3">الكمية الحالية</th>
                        <th className="p-3">تحذير النواقص</th>
                        <th className="p-3">حالة الرصيد</th>
                        <th className="p-3">سعر البيع</th>
                        <th className="p-3">سعر التكلفة</th>
                        <th className="p-3 bg-emerald-500/10 text-emerald-300 font-bold border-x border-emerald-500/20">
                          إجمالي قيمة البضاعة
                          <span className="block text-[10px] text-emerald-400/70 font-normal">(الكمية × التكلفة)</span>
                        </th>
                        <th className="p-3">المكسب / الوحدة</th>
                        <th className="p-3">نسبة المكسب %</th>
                        <th className="p-3">مبيعات النهاردة</th>
                        <th className="p-3">أرباح النهاردة</th>
                        <th className="p-3 text-center">الإجراءات</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {filteredProductCosts.length === 0 ? (
                        <tr>
                          <td colSpan={13} className="p-10 text-center text-gray-400">
                            <div className="flex flex-col items-center justify-center gap-2">
                              <Search className="w-7 h-7 text-gray-600" />
                              <p className="font-semibold text-sm text-gray-300">
                                {profitSearchQuery.trim()
                                  ? `لا توجد أصناف مطابقة لبحثك عن "${profitSearchQuery}"`
                                  : 'لا توجد أصناف تطابق الفلتر المحدد'}
                              </p>
                              <button
                                type="button"
                                onClick={() => {
                                  setProfitSearchQuery('');
                                  setProfitStockFilter('ALL');
                                  setProfitCategoryFilter('ALL');
                                }}
                                className="mt-1 text-xs text-emerald-400 hover:text-emerald-300 underline cursor-pointer"
                              >
                                عرض كل الأصناف
                              </button>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        filteredProductCosts.map((item) => {
                        const stock = item.stockQty ?? 0;
                        const safeStock = Math.max(0, stock);
                        const minStock = item.minStockLevel ?? 0;
                        const unit = item.unit || 'كجم';
                        const isOut = stock <= 0;
                        const isLow = minStock > 0 && stock <= minStock;
                        const unitCost = item.unitCost > 0 ? item.unitCost : (item.cost || 0);
                        const itemTotalCost = safeStock * unitCost;

                        return (
                          <tr key={item.id} className={`hover:bg-white/5 transition-colors ${isOut ? 'bg-rose-950/20' : isLow ? 'bg-amber-950/20' : ''}`}>
                            <td className="p-3 font-semibold text-white">
                              <div className="flex items-center gap-1.5">
                                <span>{item.name}</span>
                                {isOut && <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30">خلصان</span>}
                                {!isOut && isLow && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">قرب يخلص</span>}
                              </div>
                            </td>
                            <td className="p-3 text-gray-400">{item.categoryName}</td>
                            <td className="p-3 font-mono font-bold text-white">
                              {stock} <span className="text-[11px] text-gray-400 font-normal">{unit}</span>
                            </td>
                            <td className="p-3 font-mono text-gray-300">
                              {minStock} <span className="text-[11px] text-gray-400 font-normal">{unit}</span>
                            </td>
                            <td className="p-3">
                              {isOut ? (
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                                  خلصان
                                </span>
                              ) : isLow ? (
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                  قرب يخلص
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                  متوفر بالمحل
                                </span>
                              )}
                            </td>
                            <td className="p-3 font-mono text-cyan-400 font-bold">EGP {item.price.toFixed(2)}</td>
                            <td className="p-3 font-mono text-amber-400">EGP {unitCost.toFixed(2)}</td>
                            <td className="p-3 font-mono font-bold text-emerald-300 bg-emerald-500/5 border-x border-emerald-500/20">
                              {safeStock <= 0 ? (
                                <span className="text-gray-500 font-normal">0.00 ج.م</span>
                              ) : (
                                <div>
                                  <span className="text-sm font-black">EGP {itemTotalCost.toFixed(2)}</span>
                                  <span className="block text-[10px] text-emerald-400/80 font-sans font-normal">
                                    {stock} {unit} × {unitCost.toFixed(2)} ج
                                  </span>
                                </div>
                              )}
                            </td>
                            <td className="p-3 font-mono text-emerald-400 font-bold">EGP {item.profitPerUnit.toFixed(2)}</td>
                            <td className="p-3 font-bold text-purple-300">{item.profitMarginPct}%</td>
                            <td className="p-3 font-bold text-white">{item.qtySoldToday} {unit}</td>
                            <td className="p-3 font-mono font-bold text-emerald-400">EGP {item.totalProfitToday.toFixed(2)}</td>
                            <td className="p-3 text-center">
                              <div className="flex items-center justify-center gap-1.5">
                                <button
                                  onClick={() => openEditItemModal(item)}
                                  className="px-2 py-1 rounded-lg text-cyan-400 hover:text-white hover:bg-cyan-500/20 border border-cyan-500/20 inline-flex items-center gap-1 text-xs transition-all active:scale-95 cursor-pointer"
                                  title="تعديل بيانات الصنف والأسعار والمخزون"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                  <span>تعديل</span>
                                </button>
                                <button
                                  onClick={() => handleDeleteMenuItem(item.id, item.name)}
                                  className="px-2 py-1 rounded-lg text-rose-400 hover:text-white hover:bg-rose-500/20 border border-rose-500/20 inline-flex items-center gap-1 text-xs transition-all active:scale-95 cursor-pointer"
                                  title="حذف الصنف"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                  <span>مسح</span>
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      }))}
                    </tbody>
                    <tfoot className="bg-slate-950/90 border-t-2 border-emerald-500/40 text-xs font-semibold text-white">
                      <tr>
                        <td colSpan={2} className="p-3 text-emerald-400 font-bold">
                          إجمالي المعروض ({filteredProductCosts.length} صنف)
                        </td>
                        <td className="p-3 font-mono font-bold text-white">
                          {filteredInventoryValuation.totalStockQty.toFixed(1)}
                        </td>
                        <td colSpan={4}></td>
                        <td className="p-3 font-mono font-bold text-emerald-400 bg-emerald-500/20 border-x border-emerald-500/30 text-sm">
                          EGP {filteredInventoryValuation.totalCostValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td colSpan={3}></td>
                        <td className="p-3 font-mono font-bold text-emerald-400">
                          EGP {filteredProductCosts.reduce((s, it) => s + it.totalProfitToday, 0).toFixed(2)}
                        </td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </>
            ) : (
              /* TAB CONTENT: SUPPLY & PURCHASES LOG */
              <div className="space-y-6 pt-1">
                {supplyLogByMonth.length > 0 ? (
                  <div className="space-y-4">
                    {/* Month Selector Tabs */}
                    <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-thin">
                      {supplyLogByMonth.map((m) => {
                        const isSelected = (selectedSupplyMonth || supplyLogByMonth[0]?.monthKey) === m.monthKey;
                        return (
                          <button
                            key={m.monthKey}
                            type="button"
                            onClick={() => setSelectedSupplyMonth(m.monthKey)}
                            className={`flex flex-col items-start p-3 rounded-2xl border text-right transition-all cursor-pointer min-w-[170px] ${
                              isSelected
                                ? 'bg-gradient-to-br from-cyan-950/70 to-blue-950/50 border-cyan-500 shadow-lg shadow-cyan-500/10 text-white'
                                : 'bg-slate-900/60 border-white/5 hover:border-white/15 text-gray-400 hover:text-gray-200'
                            }`}
                          >
                            <span className="text-xs font-bold text-white flex items-center gap-1.5 mb-1">
                              <Calendar className="w-3.5 h-3.5 text-cyan-400" />
                              <span>{m.monthName}</span>
                            </span>
                            <div className="flex items-center justify-between w-full text-[11px] font-mono">
                              <span className="text-emerald-400 font-bold">EGP {m.totalPaid.toLocaleString()} مدفوع</span>
                              <span className="text-gray-400">({m.daysList.length} أيام)</span>
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    {/* Active Month View */}
                    {(() => {
                      const activeM = supplyLogByMonth.find(
                        (m) => m.monthKey === (selectedSupplyMonth || supplyLogByMonth[0]?.monthKey)
                      ) || supplyLogByMonth[0];

                      if (!activeM) return null;

                      const filteredDays = activeM.daysList.map((day) => {
                        if (!supplySearchQuery.trim()) return day;
                        const q = supplySearchQuery.trim().toLowerCase();
                        const matchingItems = day.items.filter((it) =>
                          it.itemName.toLowerCase().includes(q) ||
                          it.supplierName.toLowerCase().includes(q)
                        );
                        return {
                          ...day,
                          items: matchingItems,
                          itemsCount: matchingItems.length,
                        };
                      }).filter((day) => day.items.length > 0 || !supplySearchQuery.trim());

                      return (
                        <div className="space-y-4">
                          {/* Filter & Stats bar */}
                          <div className="bg-slate-900/70 border border-white/10 rounded-xl p-3 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                            <div className="relative flex-1 sm:max-w-md">
                              <Search className="w-4 h-4 text-gray-400 absolute right-3 top-2.5" />
                              <input
                                type="text"
                                value={supplySearchQuery}
                                onChange={(e) => setSupplySearchQuery(e.target.value)}
                                placeholder="ابحث باسم الصنف (خيار، طماطم...) أو المورد في هذا الشهر..."
                                className="w-full bg-slate-950/80 border border-white/10 rounded-xl pr-9 pl-9 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500 text-right"
                              />
                              {supplySearchQuery && (
                                <button
                                  type="button"
                                  onClick={() => setSupplySearchQuery('')}
                                  className="absolute left-2.5 top-2 text-gray-400 hover:text-white p-0.5 cursor-pointer"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>

                            <div className="flex flex-wrap items-center gap-3 text-xs text-gray-400">
                              <span>أيام التوريد: <strong className="text-white font-mono">{activeM.daysList.length}</strong> يوم</span>
                              <span>•</span>
                              <span>قيمة البضاعة: <strong className="text-cyan-400 font-mono">EGP {activeM.totalCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong></span>
                              <span>•</span>
                              <span>إجمالي المدفوع: <strong className="text-emerald-400 font-mono">EGP {activeM.totalPaid.toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong></span>
                            </div>
                          </div>

                          {/* Days List */}
                          {filteredDays.length > 0 ? (
                            <div className="space-y-4">
                              {filteredDays.map((day) => (
                                <div key={day.dayKey} className="glass-panel rounded-2xl border border-white/10 overflow-hidden shadow-xl bg-slate-950/40">
                                  {/* Day Header Banner with Daily Total Paid */}
                                  <div className="p-3.5 sm:p-4 bg-gradient-to-r from-slate-900 via-slate-900/90 to-cyan-950/30 border-b border-white/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                                    <div className="flex items-center gap-2.5">
                                      <div className="w-9 h-9 rounded-xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shrink-0">
                                        <Calendar className="w-4 h-4" />
                                      </div>
                                      <div>
                                        <div className="flex items-center gap-2">
                                          <h4 className="text-sm font-bold text-white">
                                            {day.dayName}، {day.dayDisplay}
                                          </h4>
                                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-gray-300 font-medium">
                                            {day.itemsCount} صنف بضاعة
                                          </span>
                                        </div>
                                        <span className="text-[11px] text-gray-400 block mt-0.5">
                                          سجل توريدات بضاعة الخضار والفاكهة للمحل
                                        </span>
                                      </div>
                                    </div>

                                    {/* Daily Total Cash Highlight */}
                                    <div className="flex flex-wrap items-center gap-2">
                                      <div className="px-3.5 py-1.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center gap-2">
                                        <span className="text-[11px] text-gray-300">إجمالي الفلوس المدفوعة اليوم:</span>
                                        <span className="text-sm font-black font-mono text-emerald-400">
                                          {day.totalPaid.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م
                                        </span>
                                      </div>

                                      <div className="px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 flex items-center gap-2">
                                        <span className="text-[11px] text-gray-400">إجمالي قيمة الفاتورة:</span>
                                        <span className="text-xs font-bold font-mono text-cyan-300">
                                          {day.totalCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م
                                        </span>
                                      </div>
                                    </div>
                                  </div>

                                  {/* Day Items Table */}
                                  <div className="overflow-x-auto">
                                    <table className="w-full text-right text-xs">
                                      <thead className="bg-slate-900/90 text-gray-400 text-[11px] border-b border-white/5">
                                        <tr>
                                          <th className="p-3">صنف الخضار / الفاكهة</th>
                                          <th className="p-3">الكمية المدخلة</th>
                                          <th className="p-3 text-cyan-300 font-bold">إجمالي تكلفة الشراء</th>
                                          <th className="p-3 text-cyan-400 font-bold">سعر تكلفة الكيلو/الوحدة</th>
                                          <th className="p-3 text-gray-300">التكلفة السابقة</th>
                                          <th className="p-3 text-emerald-400 font-bold">سعر البيع الحالي</th>
                                          <th className="p-3 text-gray-300">سعر البيع السابق</th>
                                          <th className="p-3">المورد وطريقة الدفع</th>
                                          <th className="p-3 text-center">إجراءات</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-white/5">
                                        {day.items.map((it) => {
                                          const costDiff = it.previousCost !== null ? it.unitPrice - it.previousCost : null;
                                          const priceDiff = (it.currentSellingPrice !== null && it.previousSellingPrice !== null)
                                            ? it.currentSellingPrice - it.previousSellingPrice
                                            : null;

                                          return (
                                            <tr key={it.id} className="hover:bg-white/[0.03] transition-colors">
                                              <td className="p-3 font-bold text-white flex items-center gap-1.5">
                                                <Package className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                                                <span>{it.itemName}</span>
                                              </td>
                                              <td className="p-3 font-mono font-semibold text-gray-200">
                                                {it.quantity} {it.purchaseUnit}
                                              </td>
                                              <td className="p-3 font-mono font-bold text-cyan-300 text-sm">
                                                {it.totalPrice.toFixed(2)} ج.م
                                              </td>
                                              <td className="p-3 font-mono font-bold text-white bg-white/5">
                                                {it.unitPrice.toFixed(2)} ج / {it.purchaseUnit}
                                              </td>
                                              <td className="p-3 font-mono text-gray-400">
                                                {it.previousCost !== null ? (
                                                  <div className="flex items-center gap-1">
                                                    <span>{it.previousCost.toFixed(2)} ج</span>
                                                    {costDiff !== null && costDiff !== 0 && (
                                                      <span className={`text-[10px] font-bold ${costDiff > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                                                        ({costDiff > 0 ? `+${costDiff.toFixed(2)}` : costDiff.toFixed(2)})
                                                      </span>
                                                    )}
                                                  </div>
                                                ) : (
                                                  <span className="text-gray-600">- (أول توريد)</span>
                                                )}
                                              </td>
                                              <td className="p-3 font-mono font-bold text-emerald-400 text-sm bg-emerald-500/10">
                                                {it.currentSellingPrice !== null ? `${it.currentSellingPrice.toFixed(2)} ج` : '-'}
                                              </td>
                                              <td className="p-3 font-mono text-gray-400">
                                                {it.previousSellingPrice !== null ? (
                                                  <div className="flex items-center gap-1">
                                                    <span>{it.previousSellingPrice.toFixed(2)} ج</span>
                                                    {priceDiff !== null && priceDiff !== 0 && (
                                                      <span className={`text-[10px] font-bold ${priceDiff > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                                        ({priceDiff > 0 ? `+${priceDiff.toFixed(2)}` : priceDiff.toFixed(2)})
                                                      </span>
                                                    )}
                                                  </div>
                                                ) : (
                                                  <span className="text-gray-600">-</span>
                                                )}
                                              </td>
                                              <td className="p-3">
                                                <span className="text-gray-300 font-semibold block">{it.supplierName}</span>
                                                <span className="text-[10px] text-gray-500 font-mono">
                                                  {it.paymentMethod === 'CASH' ? 'نقدي (كاش)' : it.paymentMethod === 'INSTAPAY' ? 'إنستا باي' : 'آجل'}
                                                </span>
                                              </td>
                                              <td className="p-3 text-center">
                                                <button
                                                  type="button"
                                                  onClick={() => handleDeletePurchaseInvoice(it.invoiceId)}
                                                  disabled={deletingPurchaseInvoiceId === it.invoiceId}
                                                  className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 transition-all cursor-pointer"
                                                  title="حذف فاتورة التوريد هذه من السجل"
                                                >
                                                  <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                              </td>
                                            </tr>
                                          );
                                        })}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="p-8 text-center glass-panel rounded-2xl border border-white/5 text-gray-400 text-xs">
                              لا توجد أصناف مطابقة لكلمة البحث في هذا الشهر.
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                ) : (
                  <div className="p-12 text-center glass-panel rounded-2xl border border-white/5 space-y-3">
                    <Truck className="w-10 h-10 text-cyan-400 mx-auto opacity-70" />
                    <h4 className="text-base font-bold text-white">لا توجد فواتير توريد مسجلة حتى الآن</h4>
                    <p className="text-xs text-gray-400 max-w-md mx-auto">
                      بمجرد تسجيل المشتريات من سوق الجملة (الخضار والفاكهة)، هيتسجل هنا تلقائياً بالشهور والأيام، مع توتال الفلوس المدفوعة وحفظ التكلفة والبيع السابق والحالي لكل صنف.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setPurInvoiceDate(new Date().toISOString().slice(0, 10));
                        setPurItems([{ itemId: '', rawMaterialId: '', itemName: '', customName: '', isCustom: false, quantity: '', purchaseUnit: 'كجم', totalPrice: '', sellingPrice: '' }]);
                        setPurPaidAmount('');
                        setShowAddPurchaseModal(true);
                      }}
                      className="px-4 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white font-bold rounded-xl text-xs inline-flex items-center gap-1.5 shadow-lg shadow-cyan-500/20 cursor-pointer"
                    >
                      <PlusCircle className="w-4 h-4" />
                      <span>+ تسجيل أول فاتورة توريد الآن</span>
                    </button>
                  </div>
                )}
              </div>
            )}
              </div>
            </div>
          )}

          {/* TAB 6: PRODUCE SPOILAGE & WASTAGE */}
          {activeTab === 'inventory' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 glass-panel p-5 rounded-2xl border border-white/5">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-rose-400" />
                    <span>تسجيل التالف والهالك في بضاعة المحل</span>
                  </h3>
                  <p className="text-xs text-gray-400 mt-1">
                    توثيق هالك وتالف الخضار والفاكهة (فرز نقاوة، عطب طبيعي، تلف قفص) واحتساب الخسارة المالية بالتكلفة
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-left">
                    <span className="text-[10px] text-gray-400 block">إجمالي الخسارة من الهالك والتالف</span>
                    <span className="text-base font-bold text-rose-400 font-mono">
                      EGP {wastageLogs.reduce((sum, w) => sum + (w.costAmount || 0), 0).toFixed(2)}
                    </span>
                  </div>

                  <button
                    onClick={() => {
                      setWastageItemName('');
                      setWastageQty('');
                      setWastageUnitCost(0);
                      setWastageReason('تالف وبايظ (عطب طبيعي)');
                      setShowAddWastageModal(true);
                    }}
                    className="px-4 py-3 rounded-xl bg-gradient-to-r from-rose-500 to-amber-600 text-white text-xs font-bold hover:from-rose-600 hover:to-amber-700 flex items-center gap-2 shadow-lg shadow-rose-500/20 active:scale-95 transition-all"
                  >
                    <AlertTriangle className="w-4 h-4" />
                    <span>+ تسجيل هالك وتالف جديد</span>
                  </button>
                </div>
              </div>

              {/* Wastage Logs Table */}
              <div className="glass-panel p-5 rounded-2xl border border-white/5 space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-white flex items-center gap-2">
                    <Trash2 className="w-4 h-4 text-rose-400" />
                    <span>سجل الهالك والتلفيات الموثقة ({wastageLogs.length} حركة مسجلة)</span>
                  </h4>
                </div>

                <div className="overflow-x-auto rounded-xl border border-white/5">
                  <table className="w-full text-right text-xs min-w-[650px]">
                    <thead className="bg-slate-900/80 text-gray-400 border-b border-white/5">
                      <tr>
                        <th className="p-3">صنف الخضار / الفاكهة</th>
                        <th className="p-3">الوزن التالف</th>
                        <th className="p-3">الخسارة المالية التقديرية</th>
                        <th className="p-3">سبب التلف والهالك</th>
                        <th className="p-3">المسؤول عن التسجيل</th>
                        <th className="p-3">التاريخ والوقت</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {wastageLogs.length > 0 ? (
                        wastageLogs.map((w) => (
                          <tr key={w.id} className="hover:bg-white/5">
                            <td className="p-3 font-semibold text-white">
                              {w.rawMaterial?.name || 'صنف خضار / فاكهة'}
                            </td>
                            <td className="p-3 font-mono text-rose-400 font-bold">
                              {w.quantity} كجم
                            </td>
                            <td className="p-3 font-mono font-bold text-amber-300">
                              EGP {w.costAmount?.toFixed(2) || '0.00'}
                            </td>
                            <td className="p-3">
                              <span className="px-2.5 py-1 rounded-lg bg-slate-800 text-gray-200 border border-white/5 text-[11px]">
                                {w.reason}
                              </span>
                            </td>
                            <td className="p-3 text-gray-400 font-semibold">{w.loggedBy || 'مدير المحل'}</td>
                            <td className="p-3 text-gray-500 font-mono" dir="ltr">
                              {new Date(w.createdAt).toLocaleString('ar-EG', {
                                dateStyle: 'short',
                                timeStyle: 'short',
                              })}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={6} className="text-center py-8 text-gray-500 text-xs">
                            لا يوجد أي هالك أو تالف مسجل حتى الآن. اضغط على "+ تسجيل هالك وتالف جديد" للتوثيق.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 7: CUSTOM DETAILED REPORTS */}
          {activeTab === 'reports' && (
            <div className="space-y-6">
              {/* Filter Controls */}
              <div className="glass-panel p-5 rounded-2xl border border-white/5 space-y-4">
                <h3 className="text-xs font-bold text-white flex items-center gap-2">
                  <FileText className="w-4 h-4 text-cyan-400" />
                  <span>تصفية واستخراج تقرير المبيعات والأرباح المخصص</span>
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-[10px] text-gray-400 mb-1">من تاريخ</label>
                    <input
                      type="date"
                      value={reportStartDate}
                      onChange={(e) => setReportStartDate(e.target.value)}
                      className="w-full bg-slate-900 border border-white/10 rounded-xl p-2 text-xs text-white text-right"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-gray-400 mb-1">إلى تاريخ</label>
                    <input
                      type="date"
                      value={reportEndDate}
                      onChange={(e) => setReportEndDate(e.target.value)}
                      className="w-full bg-slate-900 border border-white/10 rounded-xl p-2 text-xs text-white text-right"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-gray-400 mb-1">طريقة الدفع</label>
                    <select
                      value={reportPaymentMethod}
                      onChange={(e) => setReportPaymentMethod(e.target.value)}
                      className="w-full bg-slate-900 border border-white/10 rounded-xl p-2 text-xs text-white text-right"
                    >
                      <option value="ALL">جميع طرق الدفع (كاش وإنستا باي)</option>
                      <option value="CASH">نقدي (كاش في الدرج)</option>
                      <option value="INSTAPAY">إنستا باي (InstaPay)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] text-gray-400 mb-1">بحث بصنف معين</label>
                    <input
                      type="text"
                      value={reportSearchItem}
                      onChange={(e) => setReportSearchItem(e.target.value)}
                      placeholder="مثال: طماطم، بطاطس، موز، تفاح..."
                      className="w-full bg-slate-900 border border-white/10 rounded-xl p-2 text-xs text-white text-right"
                    />
                  </div>
                </div>

                <div className="flex justify-between items-center pt-2">
                  <button
                    onClick={fetchDetailedReport}
                    className="px-5 py-2.5 bg-gradient-to-r from-cyan-500 to-purple-600 text-white font-bold rounded-xl text-xs flex items-center gap-1.5"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loadingReport ? 'animate-spin' : ''}`} />
                    <span>توليد التقرير</span>
                  </button>

                  <button
                    onClick={() => window.print()}
                    className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-xs font-semibold text-white flex items-center gap-1.5"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>طباعة التقرير</span>
                  </button>
                </div>
              </div>

              {/* Report Summary Cards */}
              {detailedReport && (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div className="glass-panel p-4 rounded-xl border border-white/5">
                      <span className="text-[10px] text-gray-400 block">إجمالي الإيرادات للفترة</span>
                      <span className="text-xl font-bold text-cyan-400 font-mono mt-1 block">
                        EGP {detailedReport.summary.totalNetRevenue.toFixed(2)}
                      </span>
                    </div>
                    <div className="glass-panel p-4 rounded-xl border border-white/5">
                      <span className="text-[10px] text-gray-400 block">التكلفة الفعلية (COGS)</span>
                      <span className="text-xl font-bold text-amber-400 font-mono mt-1 block">
                        EGP {detailedReport.summary.totalCOGS.toFixed(2)}
                      </span>
                    </div>
                    <div className="glass-panel p-4 rounded-xl border border-white/5">
                      <span className="text-[10px] text-gray-400 block">صافي الأرباح المحققة</span>
                      <span className="text-xl font-bold text-emerald-400 font-mono mt-1 block">
                        EGP {detailedReport.summary.overallNetProfit.toFixed(2)}
                      </span>
                    </div>
                    <div className="glass-panel p-4 rounded-xl border border-white/5">
                      <span className="text-[10px] text-gray-400 block">نسبة هامش الربح الإجمالي</span>
                      <span className="text-xl font-bold text-purple-300 font-mono mt-1 block">
                        {detailedReport.summary.overallMarginPct}%
                      </span>
                    </div>
                  </div>

                  {/* Items Breakdown Table */}
                  <div className="glass-panel p-5 rounded-2xl border border-white/5 space-y-3">
                    <h4 className="text-xs font-bold text-white">تفصيل مبيعات وأرباح الأصناف خلال الفترة</h4>
                    <div className="overflow-x-auto rounded-xl border border-white/5">
                      <table className="w-full text-right text-xs min-w-[700px]">
                        <thead className="bg-slate-900/80 text-gray-400 border-b border-white/5">
                          <tr>
                            <th className="p-3">اسم الصنف</th>
                            <th className="p-3">القسم</th>
                            <th className="p-3">الكمية المباعة</th>
                            <th className="p-3">إجمالي الإيرادات</th>
                            <th className="p-3">التكلفة الإجمالية</th>
                            <th className="p-3">صافي الربح</th>
                            <th className="p-3">هامش الربح %</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {detailedReport.itemsSummary.map((it: any) => (
                            <tr key={it.id} className="hover:bg-white/5">
                              <td className="p-3 font-semibold text-white">{it.name}</td>
                              <td className="p-3 text-gray-400">{it.categoryName}</td>
                              <td className="p-3 font-bold text-white">{it.qtySold}</td>
                              <td className="p-3 font-mono text-cyan-400">EGP {it.grossRevenue.toFixed(2)}</td>
                              <td className="p-3 font-mono text-amber-400">EGP {it.totalCost.toFixed(2)}</td>
                              <td className="p-3 font-mono font-bold text-emerald-400">EGP {it.netProfit.toFixed(2)}</td>
                              <td className="p-3 font-bold text-purple-300">{it.marginPct}%</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB: EXPENSES LOG */}
          {activeTab === 'expenses' && (
            <div className="space-y-6">
              {/* Header & KPI cards */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    <Receipt className="w-5 h-5 text-amber-400" />
                    <span>سجل المصروفات والنثريات اليومية (Cash Drawer Payouts)</span>
                  </h2>
                  <p className="text-xs text-gray-400">متابعة كافة المبالغ المصروفة من درج الكاش بالورديات مع تفاصيل الكاشير والبيان</p>
                </div>
                <button
                  onClick={() => setShowAddAdminExpenseModal(true)}
                  className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white text-xs font-bold shadow-lg shadow-amber-500/20 transition-all"
                >
                  <PlusCircle className="w-4 h-4" />
                  <span>تسجيل مصروف جديد</span>
                </button>
              </div>

              {/* KPI Summary Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="glass-panel p-4 rounded-2xl border border-amber-500/20 bg-gradient-to-br from-amber-950/20 to-transparent">
                  <span className="text-[11px] text-gray-400 block">مصروفات اليوم</span>
                  <div className="flex items-baseline justify-between mt-1 flex-row-reverse">
                    <span className="text-2xl font-bold text-amber-400 font-mono">EGP {expensesTodayTotal.toFixed(2)}</span>
                    <span className="text-[10px] text-gray-400">من الدرج اليوم</span>
                  </div>
                  <span className="text-[10px] text-gray-500 mt-1 block">تخصم تلقائياً من صافي كاش اليومية</span>
                </div>

                <div className="glass-panel p-4 rounded-2xl border border-rose-500/20 bg-gradient-to-br from-rose-950/20 to-transparent">
                  <span className="text-[11px] text-gray-400 block">مصروفات هذا الشهر</span>
                  <div className="flex items-baseline justify-between mt-1 flex-row-reverse">
                    <span className="text-2xl font-bold text-rose-400 font-mono">EGP {expensesMonthTotal.toFixed(2)}</span>
                    <span className="text-[10px] text-gray-400">إجمالي الشهر</span>
                  </div>
                  <span className="text-[10px] text-gray-500 mt-1 block">مجموع المصروفات للشهر الحالي</span>
                </div>

                <div className="glass-panel p-4 rounded-2xl border border-purple-500/20 bg-gradient-to-br from-purple-950/20 to-transparent">
                  <span className="text-[11px] text-gray-400 block">إجمالي المصروفات المسجلة</span>
                  <div className="flex items-baseline justify-between mt-1 flex-row-reverse">
                    <span className="text-2xl font-bold text-purple-400 font-mono">EGP {expensesGrandTotal.toFixed(2)}</span>
                    <span className="text-[10px] text-gray-400">{expenses.length} حركة صرف</span>
                  </div>
                  <span className="text-[10px] text-gray-500 mt-1 block">مجموع كل النثريات بالسيستم</span>
                </div>

                <div className="glass-panel p-4 rounded-2xl border border-cyan-500/20 bg-gradient-to-br from-cyan-950/20 to-transparent">
                  <span className="text-[11px] text-gray-400 block">متوسط حركة الصرف</span>
                  <div className="flex items-baseline justify-between mt-1 flex-row-reverse">
                    <span className="text-2xl font-bold text-cyan-400 font-mono">
                      EGP {expenses.length > 0 ? (expensesGrandTotal / expenses.length).toFixed(2) : '0.00'}
                    </span>
                    <span className="text-[10px] text-gray-400">متوسط العملية</span>
                  </div>
                  <span className="text-[10px] text-gray-500 mt-1 block">لكل إذن صرف</span>
                </div>
              </div>

              {/* Table with Search */}
              <div className="glass-panel p-5 rounded-2xl border border-white/5 space-y-4">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                  <div className="relative w-full sm:w-72">
                    <input
                      type="text"
                      value={expenseSearchQuery}
                      onChange={(e) => setExpenseSearchQuery(e.target.value)}
                      placeholder="بحث في السبب أو اسم الكاشير..."
                      className="w-full bg-slate-900 border border-white/10 rounded-xl py-2 px-3 text-xs text-white text-right placeholder-gray-500 focus:border-amber-500"
                    />
                  </div>
                  <span className="text-xs text-gray-400">عدد الحركات: {filteredExpenses.length}</span>
                </div>

                <div className="overflow-x-auto rounded-xl border border-white/5">
                  <table className="w-full text-right text-xs min-w-[650px]">
                    <thead className="bg-slate-900/80 text-gray-400 border-b border-white/5">
                      <tr>
                        <th className="p-3">التاريخ والوقت</th>
                        <th className="p-3">الكاشير والوردية</th>
                        <th className="p-3">بيان وسبب المصروف</th>
                        <th className="p-3">المبلغ المصروف</th>
                        <th className="p-3 text-center">إجراءات</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {loadingExpenses ? (
                        <tr>
                          <td colSpan={5} className="p-10 text-center text-gray-400">
                            <div className="flex flex-col items-center justify-center gap-2">
                              <Loader2 className="w-7 h-7 text-amber-400 animate-spin" />
                              <span className="text-xs font-semibold text-gray-300">جاري تحميل سجل المصروفات من الداتابيز...</span>
                            </div>
                          </td>
                        </tr>
                      ) : filteredExpenses.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="p-8 text-center text-gray-500">
                            لا توجد مصروفات مسجلة حتى الآن.
                          </td>
                        </tr>
                      ) : (
                        filteredExpenses.map((exp: any) => (
                          <tr key={exp.id} className="hover:bg-white/5 transition-colors">
                            <td className="p-3 text-gray-300 font-mono">
                              {new Date(exp.createdAt).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' })}
                            </td>
                            <td className="p-3">
                              <span className="text-cyan-300 font-semibold">{exp.shift?.cashierName || exp.shift?.user?.name || 'كاشير'}</span>
                              <span className="text-[10px] text-gray-500 block font-mono">وردية #{exp.shiftId.slice(0, 8)}</span>
                            </td>
                            <td className="p-3">
                              <span className="px-2.5 py-1 rounded-lg bg-amber-500/10 text-amber-300 font-semibold border border-amber-500/20">
                                {exp.reason}
                              </span>
                            </td>
                            <td className="p-3 font-mono font-bold text-rose-400 text-sm">
                              - EGP {Number(exp.amount).toFixed(2)}
                            </td>
                            <td className="p-3 text-center">
                              <button
                                onClick={() => handleDeleteExpense(exp.id)}
                                className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 transition-all"
                                title="حذف المصروف"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* MODALS: Add Supplier */}
      {showAddSupplierModal && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setShowAddSupplierModal(false)}>
          <div className="w-full max-w-md glass-panel rounded-2xl p-5 sm:p-6 relative text-right max-h-[90vh] overflow-y-auto" dir="rtl" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setShowAddSupplierModal(false)} className="absolute top-4 left-4 text-gray-400 hover:text-white"><X className="w-5 h-5" /></button>
            <h3 className="text-base font-bold text-white mb-1 flex items-center gap-2">
              <Truck className="w-5 h-5 text-purple-400" />
              <span>إضافة تاجر جملة / مورد جديد (خضار وفاكهة)</span>
            </h3>
            <p className="text-xs text-gray-400 mb-3">تسجيل بيانات تاجر الجملة أو وكالة سوق العبور / 6 أكتوبر لمتابعة الحسابات والمديونيات</p>
            <form onSubmit={handleAddSupplier} className="space-y-3">
              <div>
                <label className="block text-xs text-gray-300 mb-1">اسم المعلم / التاجر *</label>
                <input required type="text" value={newSuppName} onChange={(e) => setNewSuppName(e.target.value)} className="w-full bg-slate-900 border border-white/10 rounded-xl p-2 text-xs text-white text-right" placeholder="مثال: المعلم حنفي، الحاج إبراهيم..." />
              </div>
              <div>
                <label className="block text-xs text-gray-300 mb-1">الوكالة / المزرعة / الشركة</label>
                <input type="text" value={newSuppCompany} onChange={(e) => setNewSuppCompany(e.target.value)} className="w-full bg-slate-900 border border-white/10 rounded-xl p-2 text-xs text-white text-right" placeholder="مثال: وكالة العبور (عنبر 3)، مزارع الصالحية..." />
              </div>
              <div>
                <label className="block text-xs text-gray-300 mb-1">رقم الهاتف</label>
                <input type="text" value={newSuppPhone} onChange={(e) => setNewSuppPhone(e.target.value)} className="w-full bg-slate-900 border border-white/10 rounded-xl p-2 text-xs text-white text-right" placeholder="01xxxxxxxxx" />
              </div>
              <div>
                <label className="block text-xs text-gray-300 mb-1">العنوان / السوق (اختياري)</label>
                <input type="text" value={newSuppAddress} onChange={(e) => setNewSuppAddress(e.target.value)} className="w-full bg-slate-900 border border-white/10 rounded-xl p-2 text-xs text-white text-right" placeholder="مثال: سوق العبور عنبر الخضار، سوق 6 أكتوبر..." />
              </div>
              <div>
                <label className="block text-xs text-gray-300 mb-1">تخصص التوريد وملاحظات (اختياري)</label>
                <input type="text" value={newSuppNotes} onChange={(e) => setNewSuppNotes(e.target.value)} className="w-full bg-slate-900 border border-white/10 rounded-xl p-2 text-xs text-white text-right" placeholder="مثال: مورد طماطم وخيار، شكاير بطاطس وبصل، كراتين فواكه..." />
              </div>
              <button type="submit" className="w-full py-2.5 bg-gradient-to-r from-purple-500 to-indigo-600 text-white font-bold rounded-xl text-xs mt-2 shadow-lg shadow-purple-500/20">
                حفظ بيانات المورد
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODALS: Add Purchase Invoice */}
      {showAddPurchaseModal && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setShowAddPurchaseModal(false)}>
          <div className="w-full max-w-2xl glass-panel rounded-2xl p-4 sm:p-6 relative text-right max-h-[90vh] overflow-y-auto" dir="rtl" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setShowAddPurchaseModal(false)} className="absolute top-4 left-4 text-gray-400 hover:text-white"><X className="w-5 h-5" /></button>
            <h3 className="text-base font-bold text-white mb-1 flex items-center gap-2">
              <Receipt className="w-5 h-5 text-cyan-400" />
              <span>تسجيل فاتورة مشتريات وتوريد (خضار وفاكهة)</span>
            </h3>
            <p className="text-xs text-gray-400 mb-4">تسجيل بضاعة المشتريات من سوق الجملة وتحديث سعر التكلفة بالكاشير تلقائياً</p>

            <form onSubmit={handleAddPurchaseInvoice} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-gray-300 mb-1">تاريخ التوريد / الشراء *</label>
                  <input
                    type="date"
                    required
                    value={purInvoiceDate}
                    onChange={(e) => setPurInvoiceDate(e.target.value)}
                    className="w-full bg-slate-900 border border-white/10 rounded-xl p-2 text-xs text-white text-right font-mono focus:border-cyan-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-300 mb-1">المورد / الوكالة</label>
                  <select value={purSupplierId} onChange={(e) => setPurSupplierId(e.target.value)} className="w-full bg-slate-900 border border-white/10 rounded-xl p-2 text-xs text-white text-right">
                    <option value="">اختار تاجر / وكالة (أو اترك لمورد عام)...</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>{s.name} {s.companyName ? `(${s.companyName})` : ''}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-300 mb-1">طريقة الدفع</label>
                  <select value={purPaymentMethod} onChange={(e) => setPurPaymentMethod(e.target.value)} className="w-full bg-slate-900 border border-white/10 rounded-xl p-2 text-xs text-white text-right">
                    <option value="CASH">نقدي (كاش في التو)</option>
                    <option value="INSTAPAY">تحويل إنستا باي (InstaPay)</option>
                    <option value="DEFERRED">آجل على الحساب (مديونية للمورد)</option>
                  </select>
                </div>
              </div>

              {/* Items Rows */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className="block text-xs font-semibold text-white flex items-center gap-1">
                    <span>أصناف الخضار والفاكهة المشتراة</span>
                  </label>
                  <span className="text-[10px] text-gray-400">ادخل الكمية والوحدة وإجمالي السعر وسيتم حساب سعر التكلفة وتحديثه فوراً</span>
                </div>

                {/* Column Headers */}
                <div className="grid grid-cols-12 gap-1.5 text-[11px] font-bold text-gray-400 px-2 py-1 bg-white/5 rounded-lg">
                  <div className="col-span-3">صنف الخضار / الفاكهة</div>
                  <div className="col-span-2">الوحدة</div>
                  <div className="col-span-2">الكمية</div>
                  <div className="col-span-2">إجمالي الشراء (EGP)</div>
                  <div className="col-span-2 text-emerald-400">سعر البيع (EGP)</div>
                  <div className="col-span-1 text-center">حذف</div>
                </div>

                {purItems.map((it, idx) => {
                  const qtyNum = parseFloat(it.quantity) || 0;
                  const totNum = parseFloat(it.totalPrice) || 0;
                  const unitPriceCalculated = qtyNum > 0 && totNum > 0 ? (totNum / qtyNum).toFixed(2) : null;

                  return (
                    <div key={idx} className="bg-slate-900/70 p-2.5 rounded-xl border border-white/5 space-y-1.5">
                      <div className="grid grid-cols-12 gap-1.5 items-center">
                        {/* Produce Item Select */}
                        <div className="col-span-3">
                          {!it.isCustom ? (
                            <select
                              value={it.itemId}
                              onChange={(e) => {
                                const val = e.target.value;
                                if (val === '__CUSTOM__') {
                                  setPurItems((prev) => prev.map((p, i) => (i === idx ? { ...p, isCustom: true, itemId: '', itemName: '', customName: '', sellingPrice: '' } : p)));
                                } else {
                                  const prod = productCosts.find((p) => p.id === val);
                                  setPurItems((prev) => prev.map((p, i) => (i === idx ? { ...p, isCustom: false, itemId: val, itemName: prod?.name || '', customName: '', sellingPrice: prod?.price ? String(prod.price) : '' } : p)));
                                }
                              }}
                              className="w-full bg-slate-900 border border-white/10 rounded-lg p-2 text-xs text-white text-right focus:border-cyan-500"
                            >
                              <option value="">اختار الصنف من الخضار والفاكهة...</option>
                              <option value="__CUSTOM__">صنف آخر (كتابة يدوية غير مسجلة)...</option>
                              {productCosts.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.name} {p.cost ? `(تكلفة: ${p.cost} ج | بيع: ${p.price || 0} ج)` : ''}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <div className="flex items-center gap-1">
                              <input
                                type="text"
                                required
                                placeholder="اكتب اسم صنف الخضار أو الفاكهة..."
                                value={it.customName || ''}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setPurItems((prev) => prev.map((p, i) => (i === idx ? { ...p, customName: val, itemName: val } : p)));
                                }}
                                className="w-full bg-slate-950 border border-cyan-500/50 rounded-lg p-1.5 text-xs text-cyan-200 text-right placeholder-gray-500 focus:border-cyan-400 font-medium"
                              />
                              <button
                                type="button"
                                onClick={() => setPurItems((prev) => prev.map((p, i) => (i === idx ? { ...p, isCustom: false, customName: '', itemId: '' } : p)))}
                                className="text-[10px] text-gray-400 hover:text-white px-2 py-1.5 bg-white/5 rounded-lg border border-white/10 whitespace-nowrap"
                                title="الرجوع لقائمة الأصناف"
                              >
                                القائمة
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Produce Unit Select */}
                        <div className="col-span-2">
                          <select
                            value={it.purchaseUnit || 'كجم'}
                            onChange={(e) => {
                              const val = e.target.value;
                              setPurItems((prev) => prev.map((p, i) => (i === idx ? { ...p, purchaseUnit: val } : p)));
                            }}
                            className="w-full bg-slate-900 border border-white/10 rounded-lg p-2 text-xs text-white text-right focus:border-cyan-500"
                          >
                            <option value="كجم">كجم (كيلو)</option>
                            <option value="عداية">عداية</option>
                            <option value="قفص">قفص</option>
                            <option value="شوال">شوال</option>
                            <option value="كرتونة">كرتونة</option>
                            <option value="حزمة">حزمة</option>
                            <option value="قطعة">قطعة</option>
                          </select>
                        </div>

                        {/* Quantity */}
                        <div className="col-span-2">
                          <input
                            type="number"
                            min="0"
                            step="any"
                            placeholder="الكمية"
                            value={it.quantity}
                            onChange={(e) => {
                              const val = e.target.value;
                              setPurItems((prev) => prev.map((p, i) => (i === idx ? { ...p, quantity: val } : p)));
                            }}
                            className="w-full bg-slate-900 border border-white/10 rounded-lg p-2 text-xs text-white text-right placeholder-gray-500 focus:border-cyan-500 font-mono"
                          />
                        </div>

                        {/* Total Price (Purchase Cost) */}
                        <div className="col-span-2">
                          <input
                            type="number"
                            min="0"
                            step="any"
                            placeholder="إجمالي الشراء"
                            value={it.totalPrice}
                            onChange={(e) => {
                              const val = e.target.value;
                              setPurItems((prev) => prev.map((p, i) => (i === idx ? { ...p, totalPrice: val } : p)));
                            }}
                            className="w-full bg-slate-900 border border-white/10 rounded-lg p-2 text-xs text-white text-right placeholder-gray-500 focus:border-cyan-500 font-mono"
                          />
                        </div>

                        {/* Selling Price to Customers */}
                        <div className="col-span-2">
                          <input
                            type="number"
                            min="0"
                            step="any"
                            placeholder="سعر البيع"
                            value={it.sellingPrice || ''}
                            onChange={(e) => {
                              const val = e.target.value;
                              setPurItems((prev) => prev.map((p, i) => (i === idx ? { ...p, sellingPrice: val } : p)));
                            }}
                            className="w-full bg-slate-900 border border-emerald-500/40 focus:border-emerald-400 rounded-lg p-2 text-xs text-emerald-300 font-mono text-right placeholder-gray-500"
                            title="سعر البيع للزبون في الكاشير"
                          />
                        </div>

                        {/* Delete Row Button */}
                        <div className="col-span-1 text-center">
                          <button
                            type="button"
                            onClick={() => setPurItems((prev) => prev.filter((_, i) => i !== idx))}
                            className="text-rose-400 hover:text-rose-300 p-1"
                            title="حذف هذا الصنف"
                          >
                            <Trash2 className="w-4 h-4 mx-auto" />
                          </button>
                        </div>
                      </div>

                      {/* Helper Unit Price Tag */}
                      {unitPriceCalculated && (
                        <div className="flex flex-wrap items-center justify-between gap-1 text-[11px] bg-cyan-950/40 p-1.5 px-2.5 rounded-lg border border-cyan-500/20 text-cyan-300">
                          <div className="flex items-center gap-2 font-medium">
                            <span>سعر التكلفة المحسوب:</span>
                            <span className="font-mono font-bold text-white text-xs">{unitPriceCalculated} EGP</span>
                            <span>لكل {it.purchaseUnit || 'كيلو'}</span>
                            {it.sellingPrice && (
                              <span className="text-emerald-300 mr-2">
                                | سعر البيع المعتمد: <strong className="font-mono text-emerald-400 font-bold">{it.sellingPrice} EGP</strong>
                              </span>
                            )}
                          </div>
                          <span className="text-emerald-400 font-semibold text-[10px]">
                            سيتم تحديث سعر تكلفة الشراء وسعر البيع تلقائياً بالكاشير
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}

                <div className="flex items-center justify-between pt-1">
                  <button
                    type="button"
                    onClick={() => setPurItems((prev) => [...prev, { itemId: '', rawMaterialId: '', itemName: '', customName: '', isCustom: false, quantity: '', purchaseUnit: 'كجم', totalPrice: '', sellingPrice: '' }])}
                    className="text-xs text-cyan-400 hover:text-cyan-300 font-semibold flex items-center gap-1.5 py-1 px-2 rounded-lg hover:bg-cyan-500/10 transition-colors"
                  >
                    <PlusCircle className="w-3.5 h-3.5" />
                    <span>إضافة صنف إضافي للفاتورة</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setNewItemName('');
                      setNewItemCategory('');
                      setNewItemPrice('');
                      setShowAddItemModal(true);
                    }}
                    className="text-xs text-emerald-400 hover:text-emerald-300 font-semibold flex items-center gap-1.5 bg-emerald-500/10 px-2.5 py-1 rounded-lg border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors"
                  >
                    <PlusCircle className="w-3.5 h-3.5" />
                    <span>+ صنف خضار / فاكهة جديد للمحل</span>
                  </button>
                </div>
              </div>

              {/* Invoice Summary Box */}
              <div className="p-3 bg-gradient-to-r from-cyan-500/10 to-purple-500/10 border border-cyan-500/20 rounded-xl flex justify-between items-center">
                <span className="text-xs font-bold text-gray-300">إجمالي قيمة فاتورة المشتريات:</span>
                <span className="font-mono font-bold text-cyan-400 text-base">
                  EGP {purItems.reduce((acc, it) => acc + (parseFloat(it.totalPrice) || 0), 0).toFixed(2)}
                </span>
              </div>

              <div>
                <label className="block text-xs text-gray-300 mb-1">المبلغ المدفوع فعلياً (اتركه فارغاً لاعتبار الفاتورة مسددة بالكامل كاش / إنستا باي)</label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={purPaidAmount}
                  onChange={(e) => setPurPaidAmount(e.target.value)}
                  placeholder="المبلغ المدفوع (اختياري في حالة السداد الجزئي أو الآجل)"
                  className="w-full bg-slate-900 border border-white/10 rounded-xl p-2 text-xs text-white text-right placeholder-gray-500"
                />
              </div>

              <button type="submit" className="w-full py-2.5 bg-gradient-to-r from-cyan-500 to-purple-600 text-white font-bold rounded-xl text-xs shadow-lg shadow-cyan-500/20 hover:from-cyan-600 hover:to-purple-700 transition-all">
                حفظ فاتورة المشتريات وتحديث تكلفة البضاعة والمخزن
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODALS: Add Raw Material */}
      {showAddMaterialModal && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setShowAddMaterialModal(false)}>
          <div className="w-full max-w-lg glass-panel rounded-2xl p-4 sm:p-6 relative text-right max-h-[90vh] overflow-y-auto" dir="rtl" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setShowAddMaterialModal(false)} className="absolute top-4 left-4 text-gray-400 hover:text-white">
              <X className="w-5 h-5" />
            </button>
            <h3 className="text-base font-bold text-white mb-1 flex items-center gap-2">
              <PlusCircle className="w-5 h-5 text-cyan-400" />
              <span>إضافة صنف خضار / فاكهة جديد للمخزن</span>
            </h3>
            <p className="text-xs text-gray-400 mb-4">أدخل بيانات الصنف ووحدة الشراء لتتبع المخزون وسعر تكلفة الشراء</p>

            <form onSubmit={handleAddRawMaterial} className="space-y-4">
              <div>
                <label className="block text-xs text-gray-300 mb-1">اسم صنف الخضار / الفاكهة *</label>
                <input
                  required
                  type="text"
                  value={newMatName}
                  onChange={(e) => setNewMatName(e.target.value)}
                  placeholder="مثال: بطاطس تحمير، طماطم سلك، خيار بلدي، تفاح سكري، مانجو عويس..."
                  className="w-full bg-slate-900 border border-white/10 rounded-xl p-2.5 text-xs text-white text-right placeholder-gray-500 focus:border-cyan-500 font-medium"
                />
              </div>

              {/* Units & Conversion Row */}
              <div className="grid grid-cols-3 gap-2 bg-slate-900/60 p-3 rounded-xl border border-white/5">
                <div>
                  <label className="block text-[11px] text-gray-300 mb-1">وحدة الشراء (بالفاتورة)</label>
                  <select
                    value={newMatPurchaseUnit}
                    onChange={(e) => setNewMatPurchaseUnit(e.target.value)}
                    className="w-full bg-slate-900 border border-white/10 rounded-lg p-2 text-xs text-white text-right"
                  >
                    <option value="kg">كيلو (كجم)</option>
                    <option value="عداية">عداية</option>
                    <option value="قفص">قفص</option>
                    <option value="شوال">شوال</option>
                    <option value="كرتونة">كرتونة</option>
                    <option value="حزمة">حزمة</option>
                    <option value="قطعة">قطعة</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] text-gray-300 mb-1">وحدة البيع / الخصم</label>
                  <select
                    value={newMatDeductUnit}
                    onChange={(e) => setNewMatDeductUnit(e.target.value)}
                    className="w-full bg-slate-900 border border-white/10 rounded-lg p-2 text-xs text-white text-right"
                  >
                    <option value="kg">كيلو (كجم)</option>
                    <option value="g">جرام (g)</option>
                    <option value="قطعة">قطعة / واحدة</option>
                    <option value="حزمة">حزمة</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] text-gray-300 mb-1">معامل التحويل</label>
                  <input
                    required
                    type="number"
                    step="any"
                    min="0.001"
                    value={newMatConversion}
                    onChange={(e) => setNewMatConversion(e.target.value)}
                    placeholder="1"
                    className="w-full bg-slate-900 border border-white/10 rounded-lg p-2 text-xs text-white text-right"
                  />
                </div>
                <div className="col-span-3 text-[10px] text-gray-400 pt-1">
                  تلميح: 1 {newMatPurchaseUnit || 'وحدة شراء'} = {newMatConversion || '1'} {newMatDeductUnit || 'وحدة خصم'}
                </div>
              </div>

              {/* Stock & Cost Row */}
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-xs text-gray-300 mb-1">الرصيد الافتتاحي</label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={newMatStockQty}
                    onChange={(e) => setNewMatStockQty(e.target.value)}
                    placeholder={`0 (${newMatDeductUnit})`}
                    className="w-full bg-slate-900 border border-white/10 rounded-xl p-2 text-xs text-white text-right placeholder-gray-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-300 mb-1">حد تنبيه النواقص</label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={newMatMinStock}
                    onChange={(e) => setNewMatMinStock(e.target.value)}
                    placeholder={`0 (${newMatDeductUnit})`}
                    className="w-full bg-slate-900 border border-white/10 rounded-xl p-2 text-xs text-white text-right placeholder-gray-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-300 mb-1">سعر تكلفة الشراء EGP</label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={newMatCost}
                    onChange={(e) => setNewMatCost(e.target.value)}
                    placeholder={`لكل ${newMatPurchaseUnit}`}
                    className="w-full bg-slate-900 border border-white/10 rounded-xl p-2 text-xs text-white text-right placeholder-gray-500"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-2.5 bg-gradient-to-r from-cyan-500 to-purple-600 text-white font-bold rounded-xl text-xs shadow-lg shadow-cyan-500/20 hover:from-cyan-600 hover:to-purple-700 mt-2"
              >
                حفظ الصنف في المخزن
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODALS: Add Menu Item with Pricing Calculator */}
      {showAddItemModal && (() => {
        const c = parseFloat(newItemCost) || 0;
        const p = parseFloat(newItemPrice) || 0;
        const profit = p - c;
        const margin = c > 0 ? (profit / c) * 100 : 0;

        return (
          <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setShowAddItemModal(false)}>
            <div className="w-full max-w-xl max-h-[90vh] overflow-y-auto glass-panel rounded-2xl p-6 relative text-right" dir="rtl" onClick={(e) => e.stopPropagation()}>
              <button onClick={() => setShowAddItemModal(false)} className="absolute top-4 left-4 text-gray-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
              <h3 className="text-base font-bold text-white mb-1 flex items-center gap-2">
                <PlusCircle className="w-5 h-5 text-emerald-400" />
                <span>إضافة صنف جديد للمنيو وحاسبة التسعير والربح</span>
              </h3>
              <p className="text-xs text-gray-400 mb-4">
                أدخل اسم الصنف وسعر تكلفة الشراء وسعر البيع، وسيحسب النظام نسبة المكسب وصافي الربح تلقائياً
              </p>

              <form onSubmit={handleCreateMenuItem} className="space-y-4">
                {/* Basic Item Info */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-300 mb-1">اسم الصنف *</label>
                    <input
                      required
                      type="text"
                      value={newItemName}
                      onChange={(e) => setNewItemName(e.target.value)}
                      placeholder="مثال: طماطم بلدي، بطاطس تحمير، تفاح..."
                      className="w-full bg-slate-900 border border-white/10 rounded-xl p-2.5 text-xs text-white text-right placeholder-gray-500 focus:border-cyan-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-300 mb-1">القسم / التصنيف *</label>
                    <input
                      required
                      type="text"
                      list="add-item-categories-list"
                      value={newItemCategory}
                      onChange={(e) => setNewItemCategory(e.target.value)}
                      placeholder="اختر أو اكتب قسماً جديداً (خضار، فاكهة...)"
                      className="w-full bg-slate-900 border border-white/10 rounded-xl p-2.5 text-xs text-white text-right placeholder-gray-500 focus:border-cyan-500"
                    />
                    <datalist id="add-item-categories-list">
                      {existingCategories.map((cat) => (
                        <option key={cat} value={cat} />
                      ))}
                    </datalist>
                  </div>
                </div>

                {/* Core Pricing & Profitability Trio (Cost, Price, Margin) */}
                <div className="bg-slate-900/90 p-4 rounded-2xl border border-white/10 space-y-3 shadow-inner">
                  <div className="flex items-center gap-1.5">
                    <DollarSign className="w-4 h-4 text-emerald-400" />
                    <span className="text-xs font-bold text-white">حاسبة التسعير وهوامش المكسب التلقائية</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {/* 1. Cost */}
                    <div>
                      <label className="block text-xs text-gray-300 mb-1">
                        سعر التكلفة EGP
                        <span className="text-[10px] text-gray-400 mr-1">(تكلفة الشراء للكيلو)</span>
                      </label>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        value={newItemCost}
                        onChange={(e) => handleNewCostChange(e.target.value)}
                        placeholder="0.00"
                        className="w-full bg-slate-950 border border-amber-500/30 rounded-xl p-2.5 text-xs text-amber-300 font-mono text-right placeholder-gray-600 focus:border-amber-400 font-semibold"
                      />
                    </div>

                    {/* 2. Price */}
                    <div>
                      <label className="block text-xs text-gray-300 mb-1">
                        سعر البيع EGP *
                        <span className="text-[10px] text-gray-400 mr-1">(سعر البيع للزبون للكيلو)</span>
                      </label>
                      <input
                        required
                        type="number"
                        step="any"
                        min="0"
                        value={newItemPrice}
                        onChange={(e) => handleNewPriceChange(e.target.value)}
                        placeholder="0.00"
                        className="w-full bg-slate-950 border border-cyan-500/30 rounded-xl p-2.5 text-xs text-cyan-300 font-mono text-right placeholder-gray-600 focus:border-cyan-400 font-bold"
                      />
                    </div>

                    {/* 3. Margin % */}
                    <div>
                      <label className="block text-xs text-gray-300 mb-1">
                        نسبة المكسب %
                        <span className="text-[10px] text-gray-400 mr-1">(Markup على التكلفة)</span>
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          step="any"
                          value={newItemMargin}
                          onChange={(e) => handleNewMarginChange(e.target.value)}
                          placeholder="0.0"
                          className="w-full bg-slate-950 border border-purple-500/30 rounded-xl p-2.5 pr-8 text-xs text-purple-300 font-mono text-right placeholder-gray-600 focus:border-purple-400 font-semibold"
                        />
                        <span className="absolute left-3 top-2.5 text-xs text-gray-400 font-mono">%</span>
                      </div>
                    </div>
                  </div>

                  {/* Realtime KPI Banner */}
                  <div className="flex flex-col sm:flex-row items-center justify-between bg-slate-950 p-2.5 px-4 rounded-xl border border-white/5 text-xs gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-gray-400">صافي المكسب للكيلو:</span>
                      <span className={`font-mono font-bold text-sm ${profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        EGP {profit.toFixed(2)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-gray-400">نسبة المكسب على التكلفة:</span>
                      <span className={`font-mono font-bold text-sm ${margin >= 25 ? 'text-emerald-300' : margin >= 10 ? 'text-amber-300' : 'text-rose-400'}`}>
                        {margin.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                </div>

                {/* Inventory Stock & Alert Settings */}
                <div className="bg-slate-900/90 p-4 rounded-2xl border border-white/10 space-y-3 shadow-inner">
                  <div className="flex items-center gap-1.5">
                    <Package className="w-4 h-4 text-amber-400" />
                    <span className="text-xs font-bold text-white">الكمية الحالية المتوفرة بالمحل وتحذير النواقص</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs text-gray-300 mb-1">
                        الكمية الحالية المتوفرة بالمحل
                        <span className="text-[10px] text-gray-400 mr-1">(رصيد الرف)</span>
                      </label>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        value={newItemStockQty}
                        onChange={(e) => setNewItemStockQty(e.target.value)}
                        placeholder="50"
                        className="w-full bg-slate-950 border border-emerald-500/30 rounded-xl p-2.5 text-xs text-emerald-300 font-mono text-right focus:border-emerald-400 font-semibold"
                      />
                    </div>

                    <div>
                      <label className="block text-xs text-gray-300 mb-1">
                        تحذير النواقص
                        <span className="text-[10px] text-gray-400 mr-1">(تنبيه لما يوصل كام)</span>
                      </label>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        value={newItemMinStock}
                        onChange={(e) => setNewItemMinStock(e.target.value)}
                        placeholder="15"
                        className="w-full bg-slate-950 border border-amber-500/30 rounded-xl p-2.5 text-xs text-amber-300 font-mono text-right focus:border-amber-400 font-semibold"
                      />
                    </div>

                    <div>
                      <label className="block text-xs text-gray-300 mb-1">
                        وحدة القياس / البيع
                      </label>
                      <select
                        value={newItemUnit}
                        onChange={(e) => setNewItemUnit(e.target.value)}
                        className="w-full bg-slate-950 border border-white/10 rounded-xl p-2.5 text-xs text-white text-right focus:border-cyan-500 font-semibold"
                      >
                        <option value="كجم">كيلو جرام (كجم)</option>
                        <option value="حزمة">حزمة / ربطة</option>
                        <option value="قطعة">قطعة / واحدة</option>
                        <option value="طبق">طبق / باكت</option>
                        <option value="كرتونة">كرتونة / قفص</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowAddItemModal(false)}
                    className="w-1/3 py-2.5 rounded-xl border border-white/10 text-gray-300 hover:bg-white/5 text-xs font-semibold"
                  >
                    إلغاء
                  </button>
                  <button
                    type="submit"
                    className="w-2/3 py-2.5 bg-gradient-to-r from-emerald-500 to-cyan-500 text-white font-bold rounded-xl text-xs shadow-lg shadow-emerald-500/20 hover:from-emerald-600 hover:to-cyan-600 active:scale-95 transition-all"
                  >
                    حفظ وإضافة الصنف للمحل
                  </button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}

      {/* MODALS: Edit Menu Item with Pricing Calculator */}
      {showEditItemModal && selectedItemToEdit && (() => {
        const c = parseFloat(editItemCost) || 0;
        const p = parseFloat(editItemPrice) || 0;
        const profit = p - c;
        const margin = c > 0 ? (profit / c) * 100 : 0;

        return (
          <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setShowEditItemModal(false)}>
            <div className="w-full max-w-xl max-h-[90vh] overflow-y-auto glass-panel rounded-2xl p-6 relative text-right" dir="rtl" onClick={(e) => e.stopPropagation()}>
              <button onClick={() => setShowEditItemModal(false)} className="absolute top-4 left-4 text-gray-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
              <h3 className="text-base font-bold text-white mb-1 flex items-center gap-2">
                <Pencil className="w-5 h-5 text-cyan-400" />
                <span>تعديل الصنف وحاسبة التسعير والربح</span>
              </h3>
              <p className="text-xs text-gray-400 mb-4">
                تعديل اسم الصنف وسعر تكلفة الشراء وسعر البيع ونسبة المكسب والكمية الحالية وتحذير النواقص
              </p>

              <form onSubmit={handleUpdateMenuItem} className="space-y-4">
                {/* Basic Item Info */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-300 mb-1">اسم الصنف *</label>
                    <input
                      required
                      type="text"
                      value={editItemName}
                      onChange={(e) => setEditItemName(e.target.value)}
                      className="w-full bg-slate-900 border border-white/10 rounded-xl p-2.5 text-xs text-white text-right focus:border-cyan-500 font-semibold"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-300 mb-1">القسم / التصنيف *</label>
                    <input
                      required
                      type="text"
                      list="edit-item-categories-list"
                      value={editItemCategory}
                      onChange={(e) => setEditItemCategory(e.target.value)}
                      className="w-full bg-slate-900 border border-white/10 rounded-xl p-2.5 text-xs text-white text-right focus:border-cyan-500"
                    />
                    <datalist id="edit-item-categories-list">
                      {existingCategories.map((cat) => (
                        <option key={cat} value={cat} />
                      ))}
                    </datalist>
                  </div>
                </div>

                {/* Core Pricing & Profitability Trio (Cost, Price, Margin) */}
                <div className="bg-slate-900/90 p-4 rounded-2xl border border-white/10 space-y-3 shadow-inner">
                  <div className="flex items-center gap-1.5">
                    <DollarSign className="w-4 h-4 text-emerald-400" />
                    <span className="text-xs font-bold text-white">حاسبة التسعير وهوامش المكسب التلقائية</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {/* 1. Cost */}
                    <div>
                      <label className="block text-xs text-gray-300 mb-1">
                        سعر التكلفة EGP
                        <span className="text-[10px] text-gray-400 mr-1">(تكلفة الشراء للكيلو)</span>
                      </label>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        value={editItemCost}
                        onChange={(e) => handleEditCostChange(e.target.value)}
                        placeholder="0.00"
                        className="w-full bg-slate-950 border border-amber-500/30 rounded-xl p-2.5 text-xs text-amber-300 font-mono text-right placeholder-gray-600 focus:border-amber-400 font-semibold"
                      />
                    </div>

                    {/* 2. Price */}
                    <div>
                      <label className="block text-xs text-gray-300 mb-1">
                        سعر البيع EGP *
                        <span className="text-[10px] text-gray-400 mr-1">(سعر البيع للزبون للكيلو)</span>
                      </label>
                      <input
                        required
                        type="number"
                        step="any"
                        min="0"
                        value={editItemPrice}
                        onChange={(e) => handleEditPriceChange(e.target.value)}
                        placeholder="0.00"
                        className="w-full bg-slate-950 border border-cyan-500/30 rounded-xl p-2.5 text-xs text-cyan-300 font-mono text-right placeholder-gray-600 focus:border-cyan-400 font-bold"
                      />
                    </div>

                    {/* 3. Margin % */}
                    <div>
                      <label className="block text-xs text-gray-300 mb-1">
                        نسبة المكسب %
                        <span className="text-[10px] text-gray-400 mr-1">(Markup على التكلفة)</span>
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          step="any"
                          value={editItemMargin}
                          onChange={(e) => handleEditMarginChange(e.target.value)}
                          placeholder="0.0"
                          className="w-full bg-slate-950 border border-purple-500/30 rounded-xl p-2.5 pr-8 text-xs text-purple-300 font-mono text-right placeholder-gray-600 focus:border-purple-400 font-semibold"
                        />
                        <span className="absolute left-3 top-2.5 text-xs text-gray-400 font-mono">%</span>
                      </div>
                    </div>
                  </div>

                  {/* Realtime KPI Banner */}
                  <div className="flex flex-col sm:flex-row items-center justify-between bg-slate-950 p-2.5 px-4 rounded-xl border border-white/5 text-xs gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-gray-400">صافي المكسب للكيلو:</span>
                      <span className={`font-mono font-bold text-sm ${profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        EGP {profit.toFixed(2)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-gray-400">نسبة المكسب على التكلفة:</span>
                      <span className={`font-mono font-bold text-sm ${margin >= 25 ? 'text-emerald-300' : margin >= 10 ? 'text-amber-300' : 'text-rose-400'}`}>
                        {margin.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                </div>

                {/* Inventory Stock & Alert Settings */}
                <div className="bg-slate-900/90 p-4 rounded-2xl border border-white/10 space-y-3 shadow-inner">
                  <div className="flex items-center gap-1.5">
                    <Package className="w-4 h-4 text-amber-400" />
                    <span className="text-xs font-bold text-white">الكمية الحالية المتوفرة بالمحل وتحذير النواقص</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs text-gray-300 mb-1">
                        الكمية الحالية المتوفرة بالمحل
                        <span className="text-[10px] text-gray-400 mr-1">(رصيد الرف)</span>
                      </label>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        value={editItemStockQty}
                        onChange={(e) => setEditItemStockQty(e.target.value)}
                        placeholder="0"
                        className="w-full bg-slate-950 border border-emerald-500/30 rounded-xl p-2.5 text-xs text-emerald-300 font-mono text-right focus:border-emerald-400 font-semibold"
                      />
                    </div>

                    <div>
                      <label className="block text-xs text-gray-300 mb-1">
                        تحذير النواقص
                        <span className="text-[10px] text-gray-400 mr-1">(تنبيه لما يوصل كام)</span>
                      </label>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        value={editItemMinStock}
                        onChange={(e) => setEditItemMinStock(e.target.value)}
                        placeholder="0"
                        className="w-full bg-slate-950 border border-amber-500/30 rounded-xl p-2.5 text-xs text-amber-300 font-mono text-right focus:border-amber-400 font-semibold"
                      />
                    </div>

                    <div>
                      <label className="block text-xs text-gray-300 mb-1">
                        وحدة القياس / البيع
                      </label>
                      <select
                        value={editItemUnit}
                        onChange={(e) => setEditItemUnit(e.target.value)}
                        className="w-full bg-slate-950 border border-white/10 rounded-xl p-2.5 text-xs text-white text-right focus:border-cyan-500 font-semibold"
                      >
                        <option value="كجم">كيلو جرام (كجم)</option>
                        <option value="حزمة">حزمة / ربطة</option>
                        <option value="قطعة">قطعة / واحدة</option>
                        <option value="طبق">طبق / باكت</option>
                        <option value="كرتونة">كرتونة / قفص</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowEditItemModal(false)}
                    className="w-1/3 py-2.5 rounded-xl border border-white/10 text-gray-300 hover:bg-white/5 text-xs font-semibold"
                  >
                    إلغاء
                  </button>
                  <button
                    type="submit"
                    className="w-2/3 py-2.5 bg-gradient-to-r from-cyan-500 to-purple-600 text-white font-bold rounded-xl text-xs shadow-lg shadow-cyan-500/20 hover:from-cyan-600 hover:to-purple-700 active:scale-95 transition-all"
                  >
                    حفظ التعديلات
                  </button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}

      {/* MODALS: Settle Invoice Payment */}
      {showPayModal && selectedInvoiceToPay && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setShowPayModal(false)}>
          <div className="w-full max-w-md glass-panel rounded-2xl p-5 sm:p-6 relative text-right max-h-[90vh] overflow-y-auto" dir="rtl" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setShowPayModal(false)} className="absolute top-4 left-4 text-gray-400 hover:text-white">
              <X className="w-5 h-5" />
            </button>
            <h3 className="text-base font-bold text-white mb-1 flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-emerald-400" />
              <span>تسديد دفعة / مديونية فاتورة</span>
            </h3>
            <p className="text-xs text-gray-400 mb-4">فاتورة رقم: <span className="font-mono font-bold text-white">{selectedInvoiceToPay.invoiceNumber}</span> | المورد: <span className="text-cyan-300 font-bold">{selectedInvoiceToPay.supplier?.name || selectedInvoiceToPay.supplierName || 'مورد عام'}</span></p>

            {/* Financial Status Banner */}
            <div className="grid grid-cols-3 gap-2 bg-slate-900/80 p-3 rounded-xl border border-white/5 text-center mb-4">
              <div>
                <span className="text-[10px] text-gray-400 block">إجمالي الفاتورة</span>
                <span className="text-xs font-bold text-white font-mono mt-0.5 block">EGP {selectedInvoiceToPay.totalAmount.toFixed(2)}</span>
              </div>
              <div>
                <span className="text-[10px] text-gray-400 block">المدفوع سابقاً</span>
                <span className="text-xs font-bold text-emerald-400 font-mono mt-0.5 block">EGP {selectedInvoiceToPay.paidAmount.toFixed(2)}</span>
              </div>
              <div>
                <span className="text-[10px] text-gray-400 block">المتبقي حالياً</span>
                <span className="text-xs font-bold text-rose-400 font-mono mt-0.5 block">EGP {selectedInvoiceToPay.remainingAmount.toFixed(2)}</span>
              </div>
            </div>

            <form onSubmit={handleSettlePayment} className="space-y-3">
              <div>
                <label className="block text-xs text-gray-300 mb-1">المبلغ المراد سداده الآن (EGP) *</label>
                <input
                  required
                  type="number"
                  min="1"
                  max={selectedInvoiceToPay.remainingAmount}
                  step="any"
                  value={paymentAmountInput}
                  onChange={(e) => setPaymentAmountInput(e.target.value)}
                  placeholder="ادخل مبلغ السداد"
                  className="w-full bg-slate-900 border border-white/10 rounded-xl p-2.5 text-xs text-white text-right placeholder-gray-500 focus:border-emerald-500"
                />
                <div className="flex justify-between items-center text-[10px] text-gray-400 mt-1 px-1">
                  <span>المبلغ المتبقي بعد هذا السداد:</span>
                  <span className="font-mono font-bold text-cyan-400">
                    EGP {Math.max(0, selectedInvoiceToPay.remainingAmount - (parseFloat(paymentAmountInput) || 0)).toFixed(2)}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs text-gray-300 mb-1">طريقة السداد</label>
                <select
                  value={paymentMethodInput}
                  onChange={(e) => setPaymentMethodInput(e.target.value)}
                  className="w-full bg-slate-900 border border-white/10 rounded-xl p-2.5 text-xs text-white text-right"
                >
                  <option value="CASH">نقدي (كاش من الدرج)</option>
                  <option value="INSTAPAY">تحويل إنستا باي (InstaPay)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs text-gray-300 mb-1">ملاحظات السداد (اختياري)</label>
                <input
                  type="text"
                  value={paymentNotesInput}
                  onChange={(e) => setPaymentNotesInput(e.target.value)}
                  placeholder="مثال: تحويل إنستاباي دفعة ثانية، إيصال رقم..."
                  className="w-full bg-slate-900 border border-white/10 rounded-xl p-2 text-xs text-white text-right placeholder-gray-500"
                />
              </div>

              <button
                type="submit"
                className="w-full py-2.5 bg-gradient-to-r from-emerald-500 to-teal-600 text-white font-bold rounded-xl text-xs shadow-lg shadow-emerald-500/20 hover:from-emerald-600 hover:to-teal-700 mt-2"
              >
                تأكيد تسجيل السداد وتحديث الحساب
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODALS: Add Customer */}
      {showAddCustModal && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setShowAddCustModal(false)}>
          <div className="w-full max-w-md glass-panel rounded-2xl p-5 sm:p-6 relative text-right max-h-[90vh] overflow-y-auto" dir="rtl" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setShowAddCustModal(false)} className="absolute top-4 left-4 text-gray-400 hover:text-white"><X className="w-5 h-5" /></button>
            <h3 className="text-base font-bold text-white mb-3">إضافة عميل جديد وفئة الخصم</h3>
            <form onSubmit={handleAddCustomer} className="space-y-3">
              <div>
                <label className="block text-xs text-gray-300 mb-1">اسم العميل / المؤسسة</label>
                <input required type="text" value={newCustName} onChange={(e) => setNewCustName(e.target.value)} className="w-full bg-slate-900 border border-white/10 rounded-xl p-2 text-xs text-white text-right" placeholder="مثال: د. مايكل / مستشفى الأمل" />
              </div>
              <div>
                <label className="block text-xs text-gray-300 mb-1">رقم الهاتف</label>
                <input type="text" value={newCustPhone} onChange={(e) => setNewCustPhone(e.target.value)} className="w-full bg-slate-900 border border-white/10 rounded-xl p-2 text-xs text-white text-right" placeholder="01xxxxxxxxx" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-300 mb-1">فئة العميل</label>
                  <select value={newCustType} onChange={(e) => setNewCustType(e.target.value)} className="w-full bg-slate-900 border border-white/10 rounded-xl p-2 text-xs text-white text-right">
                    <option value="INDIVIDUAL">زبون مميز</option>
                    <option value="COMPANY">شركة / مؤسسة</option>
                    <option value="HOSPITAL">مستشفى / أطباء</option>
                    <option value="CAFE">كافيه / مطعم</option>
                    <option value="OTHER">أخرى</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-300 mb-1">نسبة الخصم %</label>
                  <input type="number" min="0" max="100" value={newCustDiscount} onChange={(e) => setNewCustDiscount(e.target.value)} className="w-full bg-slate-900 border border-white/10 rounded-xl p-2 text-xs text-white text-right" placeholder="15" />
                </div>
              </div>
              <button type="submit" className="w-full py-2.5 bg-gradient-to-r from-cyan-500 to-purple-600 text-white font-bold rounded-xl text-xs mt-2">
                حفظ العميل
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODALS: Add Produce Spoilage & Wastage */}
      {showAddWastageModal && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setShowAddWastageModal(false)}>
          <div className="w-full max-w-md glass-panel rounded-2xl p-5 sm:p-6 relative text-right max-h-[90vh] overflow-y-auto" dir="rtl" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setShowAddWastageModal(false)} className="absolute top-4 left-4 text-gray-400 hover:text-white">
              <X className="w-5 h-5" />
            </button>
            <h3 className="text-base font-bold text-white mb-1 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-rose-400" />
              <span>تسجيل هالك وتالف في بضاعة المحل</span>
            </h3>
            <p className="text-xs text-gray-400 mb-4">
              توثيق تلف الخضار والفاكهة وخصم الخسارة المالية بالتكلفة
            </p>

            <form onSubmit={handleAddWastage} className="space-y-3.5">
              {/* Select Produce Item */}
              <div>
                <label className="block text-xs text-gray-300 mb-1 font-semibold">صنف الخضار أو الفاكهة *</label>
                <div className="space-y-1.5">
                  <select
                    value={productCosts.some(p => p.name === wastageItemName) ? wastageItemName : ''}
                    onChange={(e) => {
                      const selectedName = e.target.value;
                      setWastageItemName(selectedName);
                      const found = productCosts.find(p => p.name === selectedName);
                      if (found) {
                        setWastageUnitCost(found.unitCost || 0);
                      }
                    }}
                    className="w-full bg-slate-900 border border-white/10 rounded-xl p-2.5 text-xs text-white text-right"
                  >
                    <option value="">-- اختر من قائمة أصناف المحل --</option>
                    {productCosts.map((p) => (
                      <option key={p.id} value={p.name}>
                        {p.name} (تكلفة: EGP {p.unitCost.toFixed(2)}/كجم)
                      </option>
                    ))}
                  </select>

                  <input
                    required
                    type="text"
                    value={wastageItemName}
                    onChange={(e) => setWastageItemName(e.target.value)}
                    placeholder="أو اكتب اسم الصنف يدوياً..."
                    className="w-full bg-slate-900 border border-white/10 rounded-xl p-2 text-xs text-white text-right placeholder-gray-500"
                  />
                </div>
              </div>

              {/* Weight & Cost per kg Row */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-300 mb-1 font-semibold">الوزن التالف (كجم) *</label>
                  <input
                    required
                    type="number"
                    step="any"
                    min="0.01"
                    value={wastageQty}
                    onChange={(e) => setWastageQty(e.target.value)}
                    className="w-full bg-slate-950 border border-rose-500/30 rounded-xl p-2.5 text-xs text-rose-300 font-mono text-right font-bold focus:border-rose-400"
                    placeholder="مثال: 3.5"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-300 mb-1 font-semibold">سعر تكلفة الكيلو EGP</label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={wastageUnitCost || ''}
                    onChange={(e) => setWastageUnitCost(parseFloat(e.target.value) || 0)}
                    className="w-full bg-slate-950 border border-amber-500/30 rounded-xl p-2.5 text-xs text-amber-300 font-mono text-right font-semibold focus:border-amber-400"
                    placeholder="0.00"
                  />
                </div>
              </div>

              {/* Loss Estimation Banner */}
              {parseFloat(wastageQty || '0') > 0 && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center justify-between text-xs">
                  <span className="text-gray-300">الخسارة المالية المفقودة:</span>
                  <span className="font-mono font-bold text-sm text-rose-400">
                    EGP {(parseFloat(wastageQty || '0') * (wastageUnitCost || 0)).toFixed(2)}
                  </span>
                </div>
              )}

              {/* Spoilage Reason */}
              <div>
                <label className="block text-xs text-gray-300 mb-1 font-semibold">سبب التلف والهالك</label>
                <select
                  value={wastageReason}
                  onChange={(e) => setWastageReason(e.target.value)}
                  className="w-full bg-slate-900 border border-white/10 rounded-xl p-2.5 text-xs text-white text-right"
                >
                  <option value="تالف وبايظ (عطب طبيعي)">تالف وبايظ (عطب طبيعي)</option>
                  <option value="فرز نقاوة وهالك عيوب">فرز نقاوة وهالك عيوب</option>
                  <option value="ضربت في القفص / كدمات نقل">ضربت في القفص / كدمات نقل</option>
                  <option value="هالك وزن وميزان ورطوبة">هالك وزن وميزان ورطوبة</option>
                  <option value="أخرى">أخرى</option>
                </select>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddWastageModal(false)}
                  className="w-1/3 py-2.5 rounded-xl border border-white/10 text-gray-300 hover:bg-white/5 text-xs font-semibold"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="w-2/3 py-2.5 bg-gradient-to-r from-rose-500 to-amber-600 hover:from-rose-600 hover:to-amber-700 text-white font-bold rounded-xl text-xs shadow-lg shadow-rose-500/20 transition-all active:scale-95"
                >
                  تأكيد تسجيل الهالك والتالف
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ADD ADMIN EXPENSE MODAL */}
      {showAddAdminExpenseModal && (
        <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setShowAddAdminExpenseModal(false)}>
          <div className="w-full max-w-md glass-panel rounded-2xl p-5 sm:p-6 relative text-right max-h-[90vh] overflow-y-auto" dir="rtl" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setShowAddAdminExpenseModal(false)} className="absolute top-4 left-4 text-gray-400 hover:text-white">
              <X className="w-5 h-5" />
            </button>
            <h3 className="text-base font-bold text-white mb-1">تسجيل مصروف إداري جديد</h3>
            <p className="text-xs text-gray-400 mb-4">يتم ربط المصروف بالوردية الحالية وخصمه من الكاش.</p>

            <form onSubmit={handleAddAdminExpense} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1.5">مبلغ المصروف (ج.م) *</label>
                <input
                  type="number"
                  step="any"
                  min="0.01"
                  required
                  autoFocus
                  value={adminExpenseAmount}
                  onChange={(e) => setAdminExpenseAmount(e.target.value)}
                  className="w-full bg-slate-900 border border-white/10 rounded-xl py-2.5 px-3 text-white text-base text-right font-mono focus:border-amber-500"
                  placeholder="0.00"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1.5">بيان وسبب المصروف *</label>
                <input
                  type="text"
                  required
                  value={adminExpenseReason}
                  onChange={(e) => setAdminExpenseReason(e.target.value)}
                  className="w-full bg-slate-900 border border-white/10 rounded-xl py-2.5 px-3 text-white text-xs text-right focus:border-amber-500"
                  placeholder="مثال: فواتير كهرباء، صيانة ماكينة، مستلزمات..."
                />
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddAdminExpenseModal(false)}
                  className="py-2.5 border border-white/10 text-white rounded-xl text-xs hover:bg-white/5 transition-all"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={submittingAdminExpense}
                  className="py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-bold rounded-xl text-xs shadow-lg shadow-amber-500/20 transition-all disabled:opacity-50"
                >
                  {submittingAdminExpense ? 'جاري الحفظ...' : 'تسجيل المصروف'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PERIOD INVOICES DRILLDOWN MODAL */}
      {selectedPeriod && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-md"
          onClick={() => setSelectedPeriod(null)}
        >
          <div
            className="w-full max-w-5xl glass-panel rounded-2xl p-4 sm:p-6 relative text-right max-h-[90vh] flex flex-col"
            dir="rtl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-white/10 pb-4 mb-4 shrink-0">
              <div>
                <div className="flex items-center gap-2">
                  <span className="p-1.5 rounded-lg bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
                    {selectedPeriod.type === 'day' ? <Calendar className="w-4 h-4" /> : <BarChart3 className="w-4 h-4" />}
                  </span>
                  <h3 className="text-base font-bold text-white">
                    فواتير مبيعات: {selectedPeriod.title}
                  </h3>
                  <span className="text-xs text-gray-400 font-mono">({selectedPeriod.key})</span>
                </div>
                {periodSummary && (
                  <div className="flex flex-wrap items-center gap-3 mt-2 text-xs">
                    <span className="text-gray-300">
                      عدد الفواتير: <strong className="text-cyan-400 font-mono">{periodSummary.ordersCount}</strong>
                    </span>
                    <span className="text-gray-500">•</span>
                    <span className="text-gray-300">
                      صافي الإيراد: <strong className="text-emerald-400 font-mono">EGP {periodSummary.totalNet.toFixed(2)}</strong>
                    </span>
                    <span className="text-gray-500">•</span>
                    <span className="text-gray-300">
                      متوسط الفاتورة: <strong className="text-purple-400 font-mono">EGP {periodSummary.avgTicket.toFixed(2)}</strong>
                    </span>
                    <span className="text-gray-500">•</span>
                    <span className="text-gray-300">
                      الخصومات: <strong className="text-amber-400 font-mono">EGP {(periodSummary.totalDiscounts || 0).toFixed(2)}</strong>
                    </span>
                    <span className="text-gray-500">•</span>
                    <span className="text-gray-300">
                      المصاريف: <strong className="text-orange-400 font-mono">EGP {(periodSummary.totalExpenses || 0).toFixed(2)}</strong>
                    </span>
                    {selectedPeriod.type === 'month' && (
                      <>
                        <span className="text-gray-500">•</span>
                        <span className="text-gray-300">
                          التوريد المدفوع: <strong className="text-blue-400 font-mono">EGP {(periodSummary.totalSuppliesPaid || 0).toFixed(2)}</strong>
                        </span>
                        <span className="text-gray-500">•</span>
                        <span className="text-gray-300">
                          الصافي بعد التوريد: <strong className="text-cyan-300 font-mono">EGP {(periodSummary.netRevenueAfterSupplies !== undefined ? periodSummary.netRevenueAfterSupplies : (periodSummary.totalNet - (periodSummary.totalSuppliesPaid || 0))).toFixed(2)}</strong>
                        </span>
                      </>
                    )}
                  </div>
                )}
              </div>

              <button
                onClick={() => setSelectedPeriod(null)}
                className="p-1.5 text-gray-400 hover:text-white rounded-lg hover:bg-white/10 transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Filter / Search Row */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mb-4 shrink-0">
              <div className="flex items-center gap-2 w-full sm:w-auto flex-1 max-w-md">
                <input
                  type="text"
                  value={ordersSearch}
                  onChange={(e) => setOrdersSearch(e.target.value)}
                  placeholder="بحث برقم الفاتورة، الكاشير، الصنف، العميل..."
                  className="w-full bg-slate-900 border border-white/10 rounded-xl py-2 px-3 text-xs text-white text-right placeholder-gray-500 focus:border-cyan-500"
                />
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <label className="text-xs text-gray-400 shrink-0">طريقة الدفع:</label>
                <select
                  value={ordersFilterPayment}
                  onChange={(e) => setOrdersFilterPayment(e.target.value)}
                  className="bg-slate-900 border border-white/10 rounded-xl py-2 px-3 text-xs text-white text-right"
                >
                  <option value="ALL">جميع طرق الدفع</option>
                  <option value="CASH">نقدي (كاش)</option>
                  <option value="VISA">فيزا (Visa)</option>
                  <option value="INSTAPAY">إنستا باي (InstaPay)</option>
                  <option value="VODAFONE_CASH">فودافون كاش</option>
                </select>
                <span className="text-xs text-gray-400 mr-2">
                  المعروض: {filteredPeriodOrders.length}
                </span>
              </div>
            </div>

            {/* Orders Table */}
            <div className="flex-1 overflow-auto rounded-xl border border-white/5">
              <table className="w-full text-right text-xs min-w-[700px]">
                <thead className="bg-slate-900/90 text-gray-400 border-b border-white/5 sticky top-0 backdrop-blur-sm z-10">
                  <tr>
                    <th className="p-3">رقم الفاتورة</th>
                    <th className="p-3">الوقت</th>
                    <th className="p-3">الكاشير</th>
                    <th className="p-3">طريقة الدفع</th>
                    <th className="p-3">الأصناف المطلوبة</th>
                    <th className="p-3 text-center">الخصم</th>
                    <th className="p-3">الإجمالي الصافي</th>
                    <th className="p-3 text-center">الإيصال</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {loadingPeriodOrders ? (
                    <tr>
                      <td colSpan={8} className="p-10 text-center text-gray-400">
                        جاري تحميل فواتير الفترة...
                      </td>
                    </tr>
                  ) : filteredPeriodOrders.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-10 text-center text-gray-500">
                        لا توجد فواتير مطابقة للبحث.
                      </td>
                    </tr>
                  ) : (
                    filteredPeriodOrders.map((order: any) => {
                      const orderTime = new Date(order.createdAt).toLocaleTimeString('ar-EG', {
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: true,
                      });
                      const itemsSummary = (order.items || [])
                        .map((i: any) => `${i.qty}× ${i.item?.name || 'صنف'}`)
                        .join('، ');

                      return (
                        <tr key={order.id} className="hover:bg-white/5 transition-colors">
                          <td className="p-3">
                            <span className="font-mono font-bold text-cyan-400 text-xs block">
                              {order.receiptNumber || `#${order.id.slice(0, 8)}`}
                            </span>
                            {order.customer && (
                              <span className="text-[10px] text-gray-400 block">
                                عميل: {order.customer.name}
                              </span>
                            )}
                          </td>
                          <td className="p-3 text-gray-300 font-mono text-[11px]">
                            {orderTime}
                          </td>
                          <td className="p-3">
                            <span className="text-white font-semibold block">
                              {order.shift?.cashierName || order.shift?.user?.name || 'كاشير'}
                            </span>
                            <span className="text-[10px] text-gray-500 block font-mono">
                              وردية #{order.shiftId.slice(0, 6)}
                            </span>
                          </td>
                          <td className="p-3">
                            {order.paymentMethod === 'CASH' && (
                              <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 text-[10px] font-bold">
                                نقدي
                              </span>
                            )}
                            {order.paymentMethod === 'VISA' && (
                              <span className="px-2 py-0.5 rounded bg-blue-500/10 text-blue-300 border border-blue-500/20 text-[10px] font-bold">
                                فيزا
                              </span>
                            )}
                            {order.paymentMethod === 'INSTAPAY' && (
                              <span className="px-2 py-0.5 rounded bg-purple-500/10 text-purple-300 border border-purple-500/20 text-[10px] font-bold">
                                إنستا باي
                              </span>
                            )}
                            {order.paymentMethod === 'VODAFONE_CASH' && (
                              <span className="px-2 py-0.5 rounded bg-rose-500/10 text-rose-300 border border-rose-500/20 text-[10px] font-bold">
                                فودافون كاش
                              </span>
                            )}
                          </td>
                          <td className="p-3 text-gray-300 max-w-xs truncate" title={itemsSummary}>
                            {itemsSummary || '—'}
                          </td>
                          <td className="p-3 text-center font-mono">
                            {order.discount > 0 ? (
                              <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30">
                                - EGP {Number(order.discount).toFixed(2)}
                              </span>
                            ) : (
                              <span className="text-gray-500 text-xs">0.00</span>
                            )}
                          </td>
                          <td className="p-3 font-mono">
                            <span className="font-bold text-emerald-400 text-sm block">
                              EGP {Number(order.total).toFixed(2)}
                            </span>
                          </td>
                          <td className="p-3 text-center">
                            <button
                              onClick={() => setSelectedOrderReceipt(order)}
                              className="px-2.5 py-1 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-semibold text-xs inline-flex items-center gap-1 transition-all"
                              title="عرض تفاصيل الإيصال والطباعة"
                            >
                              <FileText className="w-3.5 h-3.5" />
                              <span>الإيصال</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* DETAILED RECEIPT / INVOICE MODAL */}
      {selectedOrderReceipt && (
        <div
          className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4 backdrop-blur-md"
          onClick={() => setSelectedOrderReceipt(null)}
        >
          <div
            className="w-full max-w-md bg-white text-gray-900 rounded-2xl p-5 sm:p-6 relative text-right shadow-2xl overflow-y-auto max-h-[90vh] font-sans"
            dir="rtl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header Brand */}
            <div className="text-center border-b border-dashed border-gray-300 pb-4 mb-4">
              <div className="w-16 h-16 mx-auto rounded-full overflow-hidden mb-2 border border-gray-200 bg-white p-1">
                <img src="/banana-logo.jpg" alt="بانانا فود" className="w-full h-full object-contain" />
              </div>
              <h2 className="font-black text-xl text-gray-900 tracking-wide">بانانا فود - Banana Food</h2>
              <p className="text-xs text-gray-500 font-semibold">وصل مبيعات خضار وفاكهة</p>
              <span className="inline-block mt-1 font-mono font-bold text-xs bg-gray-100 px-3 py-1 rounded-full text-gray-800 border border-gray-200">
                {selectedOrderReceipt.receiptNumber || `#${selectedOrderReceipt.id}`}
              </span>
            </div>

            {/* Info details */}
            <div className="grid grid-cols-2 gap-2 text-xs border-b border-dashed border-gray-300 pb-3 mb-3 text-gray-600">
              <div>
                <span className="text-gray-400 block text-[10px]">التاريخ والوقت:</span>
                <span className="font-semibold text-gray-800">
                  {new Date(selectedOrderReceipt.createdAt).toLocaleString('ar-EG', {
                    dateStyle: 'short',
                    timeStyle: 'short',
                  })}
                </span>
              </div>
              <div>
                <span className="text-gray-400 block text-[10px]">الكاشير:</span>
                <span className="font-semibold text-gray-800">
                  {selectedOrderReceipt.shift?.cashierName || selectedOrderReceipt.shift?.user?.name || 'كاشير'}
                </span>
              </div>
              <div>
                <span className="text-gray-400 block text-[10px]">طريقة الدفع:</span>
                <span className="font-bold text-gray-900">
                  {selectedOrderReceipt.paymentMethod === 'CASH' && 'نقدي (كاش)'}
                  {selectedOrderReceipt.paymentMethod === 'VISA' && 'بطاقة فيزا (Visa)'}
                  {selectedOrderReceipt.paymentMethod === 'INSTAPAY' && 'إنستا باي (InstaPay)'}
                  {selectedOrderReceipt.paymentMethod === 'VODAFONE_CASH' && 'فودافون كاش'}
                </span>
              </div>
              {selectedOrderReceipt.customer && (
                <div className="col-span-2 bg-gray-50 p-2 rounded-lg border border-gray-100">
                  <span className="text-[10px] text-gray-400 block">بيانات العميل:</span>
                  <span className="font-bold text-gray-800 text-xs">
                    {selectedOrderReceipt.customer.name} {selectedOrderReceipt.customer.phone ? `(${selectedOrderReceipt.customer.phone})` : ''}
                  </span>
                </div>
              )}
            </div>

            {/* Items Table */}
            <div className="space-y-2 border-b border-dashed border-gray-300 pb-3 mb-3 max-h-48 overflow-y-auto">
              <table className="w-full text-right text-xs">
                <thead>
                  <tr className="text-gray-400 border-b border-gray-100 text-[11px]">
                    <th className="py-1">الصنف</th>
                    <th className="py-1 text-center">الكمية</th>
                    <th className="py-1 text-left">السعر</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {(selectedOrderReceipt.items || []).map((oi: any) => (
                    <tr key={oi.id} className="py-1">
                      <td className="py-1 font-semibold text-gray-800">
                        {oi.item?.name || 'صنف'}
                        {oi.modifiers && oi.modifiers.length > 0 && (
                          <span className="block text-[10px] text-gray-400">
                            + {oi.modifiers.map((m: any) => m.modifier?.name).join('، ')}
                          </span>
                        )}
                      </td>
                      <td className="py-1 text-center font-mono font-bold text-gray-700">
                        {oi.qty}
                      </td>
                      <td className="py-1 text-left font-mono font-bold text-gray-900">
                        EGP {oi.totalPrice.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Totals Summary */}
            <div className="space-y-1.5 text-xs mb-5">
              <div className="flex justify-between text-gray-500">
                <span>المجموع الفرعي:</span>
                <span className="font-mono">EGP {Number(selectedOrderReceipt.subtotal || selectedOrderReceipt.total).toFixed(2)}</span>
              </div>
              {selectedOrderReceipt.discount > 0 && (
                <div className="flex justify-between text-amber-600 font-semibold">
                  <span>
                    الخصم {selectedOrderReceipt.discountReason ? `(${selectedOrderReceipt.discountReason})` : ''}:
                  </span>
                  <span className="font-mono">- EGP {Number(selectedOrderReceipt.discount).toFixed(2)}</span>
                </div>
              )}
              {selectedOrderReceipt.tax > 0 && (
                <div className="flex justify-between text-gray-500">
                  <span>الضريبة:</span>
                  <span className="font-mono">EGP {Number(selectedOrderReceipt.tax).toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between text-base font-black text-gray-900 border-t border-gray-300 pt-2">
                <span>الإجمالي النهائي:</span>
                <span className="font-mono text-emerald-600">EGP {Number(selectedOrderReceipt.total).toFixed(2)}</span>
              </div>
            </div>

            {/* Print & Close Buttons */}
            <div className="flex gap-2">
              <button
                onClick={() => window.print()}
                className="flex-1 py-2.5 bg-gray-900 hover:bg-black text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-md transition-all"
              >
                <Printer className="w-4 h-4" />
                <span>طباعة الإيصال</span>
              </button>
              <button
                onClick={() => setSelectedOrderReceipt(null)}
                className="px-4 py-2.5 border border-gray-300 hover:bg-gray-100 text-gray-700 font-bold rounded-xl text-xs transition-all"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Return Delete Confirmation In-App Modal */}
      {returnToDelete && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-rose-500/30 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4 text-right animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 text-rose-400">
              <div className="p-2.5 rounded-xl bg-rose-500/20 border border-rose-500/30">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">تأكيد مسح المرتجع نهائياً</h3>
                <span className="text-xs text-rose-300 font-mono">فاتورة {returnToDelete.receiptNum}</span>
              </div>
            </div>

            <div className="bg-slate-950/60 p-3.5 rounded-xl border border-white/5 space-y-2 text-xs text-gray-300">
              <p>
                هل أنت متأكد من مسح وإلغاء حركة هذا المرتجع بمبلغ <strong className="text-rose-400 font-mono text-sm">{returnToDelete.refundAmount.toFixed(2)} ج</strong>؟
              </p>
              <p className="text-[11px] text-gray-400 leading-relaxed">
                • سيتم مسح المرتجع وإلغاء العملية تماماً كأنها لم تحدث.<br />
                • لن يتم تحميل الكاشير بأي كاش إضافي وستبقى حسابات الدرج متطابقة ومضبوطة 100%.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <button
                type="button"
                onClick={() => setReturnToDelete(null)}
                disabled={deletingReturnId !== null}
                className="py-2.5 px-4 rounded-xl border border-white/10 hover:bg-white/5 text-gray-300 text-xs font-bold transition-all cursor-pointer"
              >
                تراجع / إلغاء
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteReturn}
                disabled={deletingReturnId !== null}
                className="py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-lg shadow-rose-600/30 cursor-pointer disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
                <span>{deletingReturnId !== null ? 'جاري المسح...' : 'نعم، امسح المرتجع الآن'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Alert Banner */}
      {alertMsg && (
        <div dir="rtl" className={`fixed bottom-5 left-1/2 -translate-x-1/2 z-50 w-[calc(100vw-2rem)] max-w-md p-3.5 rounded-xl shadow-2xl border text-xs flex items-center gap-2.5 flex-row-reverse ${
          alertMsg.type === 'success' ? 'bg-emerald-950 border-emerald-400/40 text-emerald-100' : 'bg-rose-950 border-rose-400/40 text-rose-100'
        }`}>
          {alertMsg.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
          <span className="font-semibold">{alertMsg.text}</span>
        </div>
      )}
    </div>
  );
}
