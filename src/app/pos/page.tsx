'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/lib/store';
import { useOfflineSync } from '@/hooks/useOfflineSync';
import { offlineDB, type LocalCategory, type LocalItem, type LocalModifier, type LocalHall, type LocalTable, type LocalSalesOrder, type LocalCart, type LocalCartItem } from '@/lib/dexie';
import { 
  Coffee, LogOut, Wifi, WifiOff, Users, ShoppingBag, 
  Trash2, Plus, Minus, DollarSign, CreditCard, RefreshCw, 
  CheckCircle2, AlertCircle, X, PlusCircle, Printer
} from 'lucide-react';
// Use native browser crypto - NOT the Node.js polyfill
const generateUUID = (): string => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for HTTP/non-secure contexts
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

export default function POSPage() {
  const router = useRouter();
  const { user, activeShift, setUser, setActiveShift, isOnline, activeHallId, activeTableId, setActiveHallId, setActiveTableId, logout } = useAppStore();
  const { pendingCount, syncing, triggerSync } = useOfflineSync();

  // Local state for POS data loaded from Dexie
  const [categories, setCategories] = useState<LocalCategory[]>([]);
  const [items, setItems] = useState<LocalItem[]>([]);
  const [modifiers, setModifiers] = useState<LocalModifier[]>([]);
  const [halls, setHalls] = useState<LocalHall[]>([]);
  const [tables, setTables] = useState<LocalTable[]>([]);
  
  // Selected category in menu
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);

  // Active cart (Takeaway or Table cart)
  const [cart, setCart] = useState<LocalCart | null>(null);
  
  // Modals
  const [showOpenShift, setShowOpenShift] = useState(false);
  const [showCloseShift, setShowCloseShift] = useState(false);
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [showModifiersModal, setShowModifiersModal] = useState(false);
  const [activeItemForMod, setActiveItemForMod] = useState<LocalItem | null>(null);
  const [selectedMods, setSelectedMods] = useState<string[]>([]); // modifier IDs selected

  // Existing shift from server (for takeover scenario)
  const [existingShift, setExistingShift] = useState<any>(null);
  const [checkingShift, setCheckingShift] = useState(false);
  
  // Shift inputs
  const [floatCash, setFloatCash] = useState('0');
  const [closedCash, setClosedCash] = useState('');
  const [closedInstaPay, setClosedInstaPay] = useState('');
  
  // Cashier Inventory Modal states
  const [showInventoryModal, setShowInventoryModal] = useState(false);
  const [inventoryMaterials, setInventoryMaterials] = useState<any[]>([]);
  const [loadingInventory, setLoadingInventory] = useState(false);
  const [selectedMatId, setSelectedMatId] = useState('');
  const [inventoryAction, setInventoryAction] = useState<'view' | 'restock' | 'wastage'>('view');
  const [inventoryQty, setInventoryQty] = useState('');
  const [inventoryReason, setInventoryReason] = useState('');
  const [submitInventoryLoading, setSubmitInventoryLoading] = useState(false);
  
  // Expense inputs
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseReason, setExpenseReason] = useState('');
  
  // POS Action inputs
  const [discountVal, setDiscountVal] = useState('0');
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'INSTAPAY'>('CASH');
  
  // Receipt print state
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [receiptOrder, setReceiptOrder] = useState<LocalSalesOrder | null>(null);
  
  // Loading & Alert status
  const [loading, setLoading] = useState(true);
  const [alertMsg, setAlertMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  
  // Mounted state to prevent Next.js SSR hydration mismatch
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  // 1. Guard check - Login & Shift status
  useEffect(() => {
    if (!user) {
      router.push('/');
      return;
    }
    
    // Check if shift is open, else force open shift dialog
    if (!activeShift) {
      setShowOpenShift(true);
    }
  }, [user, activeShift, router]);

  // Alert helper
  const triggerAlert = (type: 'success' | 'error', text: string) => {
    setAlertMsg({ type, text });
    setTimeout(() => setAlertMsg(null), 4000);
  };

  // 2. Fetch / Load POS initialization data
  const loadPOSData = useCallback(async () => {
    setLoading(true);
    try {
      if (isOnline) {
        // Fetch from server API
        const res = await fetch('/api/pos-init');
        if (res.ok) {
          const data = await res.json();
          
          // Clear and save to Dexie local cache
          // Clear and repopulate Dexie tables one by one (avoid transaction array type bug)
            await offlineDB.categories.clear();
            await offlineDB.items.clear();
            await offlineDB.modifiers.clear();
            await offlineDB.halls.clear();
            await offlineDB.diningTables.clear();

            await offlineDB.categories.bulkAdd(data.categories.map((c: any) => ({ id: c.id, name: c.name })));
            
            const allItems: LocalItem[] = [];
            data.categories.forEach((c: any) => {
              c.items.forEach((i: any) => {
                allItems.push({ id: i.id, name: i.name, price: i.price, categoryId: c.id });
              });
            });
            await offlineDB.items.bulkAdd(allItems);
            
            await offlineDB.modifiers.bulkAdd(data.modifiers);
            await offlineDB.halls.bulkAdd(data.halls.map((h: any) => ({ id: h.id, name: h.name })));
            
            const allTables: LocalTable[] = [];
            data.halls.forEach((h: any) => {
              h.tables.forEach((t: any) => {
                allTables.push({ id: t.id, name: t.name, hallId: h.id, status: t.status });
              });
            });
            await offlineDB.diningTables.bulkAdd(allTables);
          console.log('Local cache synced with server POS data.');
        }
      }
      
      // Load from Dexie to local React state
      const dbCats = await offlineDB.categories.toArray();
      const dbItems = await offlineDB.items.toArray();
      const dbMods = await offlineDB.modifiers.toArray();
      const dbHalls = await offlineDB.halls.toArray();
      const dbTables = await offlineDB.diningTables.toArray();
      
      setCategories(dbCats);
      setItems(dbItems);
      setModifiers(dbMods);
      setHalls(dbHalls);
      setTables(dbTables);
      
      if (dbCats.length > 0 && !selectedCategoryId) {
        setSelectedCategoryId(dbCats[0].id);
      }
      if (dbHalls.length > 0 && !activeHallId) {
        setActiveHallId(dbHalls[0].id);
      }
    } catch (error) {
      console.error('Error loading POS data:', error);
      triggerAlert('error', 'فشل تحميل بيانات الأصناف. شغالين على كاش المتصفح المحلي حالياً.');
    } finally {
      setLoading(false);
    }
  }, [isOnline]);

  useEffect(() => {
    loadPOSData();
  }, [loadPOSData]);

  // 3. Load Cart (Dine-In or Takeaway)
  const loadCart = useCallback(async (id: string, type: 'DINE_IN' | 'TAKEAWAY', tableName: string | null = null) => {
    try {
      let localCart = await offlineDB.carts.get(id);
      if (!localCart) {
        localCart = {
          id,
          orderType: type,
          tableId: type === 'DINE_IN' ? id : null,
          tableName: type === 'DINE_IN' ? tableName : 'تيك أواي',
          items: [],
          subtotal: 0,
          discount: 0,
          tax: 0,
          total: 0,
          updatedAt: Date.now(),
        };
        await offlineDB.carts.put(localCart);
      }
      setCart(localCart);
      setDiscountVal(localCart.discount.toString());
    } catch (e) {
      console.error('Error loading cart:', e);
    }
  }, []);

  // Initialize with takeaway cart or active table cart
  useEffect(() => {
    if (activeTableId) {
      const activeTable = tables.find(t => t.id === activeTableId);
      loadCart(activeTableId, 'DINE_IN', activeTable?.name || null);
    } else {
      loadCart('takeaway', 'TAKEAWAY');
    }
  }, [activeTableId, tables, loadCart]);

  // 4. Save Cart & Recalculate Totals
  const saveAndRecalculateCart = async (updatedItems: LocalCartItem[], customDiscount: number | null = null) => {
    if (!cart) return;

    const subtotal = updatedItems.reduce((acc, item) => acc + item.totalPrice, 0);
    const disc = customDiscount !== null ? customDiscount : cart.discount;
    const taxRate = 0.14; // 14% VAT standard
    const tax = Math.round((subtotal - disc) * taxRate * 100) / 100;
    const total = Math.max(0, subtotal - disc + tax);

    const updatedCart: LocalCart = {
      ...cart,
      items: updatedItems,
      subtotal,
      discount: disc,
      tax,
      total,
      updatedAt: Date.now(),
    };

    await offlineDB.carts.put(updatedCart);
    setCart(updatedCart);
  };

  // Add Item to Cart
  const handleItemClick = (item: LocalItem) => {
    const itemCategory = categories.find(c => c.id === item.categoryId);
    const hasMods = itemCategory && (itemCategory.name.includes('Coffee') || itemCategory.name.includes('Drinks') || itemCategory.name.includes('قهوة') || itemCategory.name.includes('مشروبات'));
    
    if (hasMods) {
      setActiveItemForMod(item);
      setSelectedMods([]);
      setShowModifiersModal(true);
    } else {
      addItemToCartDirectly(item, []);
    }
  };

  const addItemToCartDirectly = async (item: LocalItem, selectedModList: LocalModifier[]) => {
    if (!cart) return;

    const modPriceImpact = selectedModList.reduce((acc, m) => acc + m.priceImpact, 0);
    const unitPrice = item.price + modPriceImpact;

    // Check if identical item (same ID and same modifiers) already exists in cart
    const existingIndex = cart.items.findIndex(
      (ci) => 
        ci.itemId === item.id && 
        ci.modifiers.length === selectedModList.length &&
        ci.modifiers.every((cm) => selectedModList.some((sm) => sm.id === cm.modifierId))
    );

    let updatedItems = [...cart.items];

    if (existingIndex > -1) {
      const existing = updatedItems[existingIndex];
      updatedItems[existingIndex] = {
        ...existing,
        qty: existing.qty + 1,
        totalPrice: (existing.qty + 1) * unitPrice,
      };
    } else {
      const newItem: LocalCartItem = {
        id: generateUUID(),
        itemId: item.id,
        name: item.name,
        qty: 1,
        unitPrice,
        totalPrice: unitPrice,
        modifiers: selectedModList.map(m => ({
          modifierId: m.id,
          name: m.name,
          unitPriceImpact: m.priceImpact,
        })),
      };
      updatedItems.push(newItem);
    }

    await saveAndRecalculateCart(updatedItems);
    
    // If it's a Dine-in table, update table status to OCCUPIED in local Dexie database
    if (cart.orderType === 'DINE_IN' && cart.tableId) {
      await offlineDB.diningTables.update(cart.tableId, { status: 'OCCUPIED' });
      setTables(prev => prev.map(t => t.id === cart.tableId ? { ...t, status: 'OCCUPIED' } : t));
    }
  };

  // Modifiers Dialog Confirmation
  const confirmModifiers = () => {
    if (!activeItemForMod) return;
    
    const selectedModObjects = modifiers.filter(m => selectedMods.includes(m.id));
    addItemToCartDirectly(activeItemForMod, selectedModObjects);
    
    setShowModifiersModal(false);
    setActiveItemForMod(null);
  };

  // Update quantity in cart
  const handleUpdateQty = async (cartItemId: string, delta: number) => {
    if (!cart) return;

    let updatedItems = cart.items.map((item) => {
      if (item.id === cartItemId) {
        const newQty = Math.max(1, item.qty + delta);
        return {
          ...item,
          qty: newQty,
          totalPrice: newQty * item.unitPrice,
        };
      }
      return item;
    });

    await saveAndRecalculateCart(updatedItems);
  };

  // Remove Item from Cart
  const handleRemoveItem = async (cartItemId: string) => {
    if (!cart) return;

    const updatedItems = cart.items.filter((item) => item.id !== cartItemId);
    await saveAndRecalculateCart(updatedItems);

    // If table cart is now empty, set status back to VACANT
    if (updatedItems.length === 0 && cart.orderType === 'DINE_IN' && cart.tableId) {
      await offlineDB.diningTables.update(cart.tableId, { status: 'VACANT' });
      setTables(prev => prev.map(t => t.id === cart.tableId ? { ...t, status: 'VACANT' } : t));
    }
  };

  // Clear current cart
  const handleClearCart = async () => {
    if (!cart) return;
    await saveAndRecalculateCart([]);
    
    if (cart.orderType === 'DINE_IN' && cart.tableId) {
      await offlineDB.diningTables.update(cart.tableId, { status: 'VACANT' });
      setTables(prev => prev.map(t => t.id === cart.tableId ? { ...t, status: 'VACANT' } : t));
    }
    setDiscountVal('0');
  };

  // Apply discount
  const handleApplyDiscount = () => {
    if (!cart) return;
    const value = parseFloat(discountVal) || 0;
    saveAndRecalculateCart(cart.items, value);
    triggerAlert('success', `تم تطبيق خصم بقيمة EGP ${value}`);
  };

  // 5. Place / Complete Order
  const handleCompleteOrder = async () => {
    if (!cart || cart.items.length === 0) {
      triggerAlert('error', 'الفاتورة فاضية مقدرش أقفلها');
      return;
    }

    if (!activeShift) {
      triggerAlert('error', 'مفيش شفت مفتوح حالياً. لازم تفتح الشفت الأول.');
      setShowOpenShift(true);
      return;
    }

    try {
      const orderId = generateUUID();

      const newOrder: LocalSalesOrder = {
        id: orderId,
        shiftId: activeShift.id,
        tableId: cart.tableId,
        orderType: cart.orderType,
        paymentMethod: paymentMethod,
        status: 'COMPLETED',
        subtotal: cart.subtotal,
        discount: cart.discount,
        tax: cart.tax,
        total: cart.total,
        createdAt: new Date().toISOString(),
        items: cart.items.map((i) => ({
          id: i.id,
          itemId: i.itemId,
          qty: i.qty,
          unitPrice: i.unitPrice,
          totalPrice: i.totalPrice,
          modifiers: i.modifiers.map((m) => ({
            modifierId: m.modifierId,
            unitPriceImpact: m.unitPriceImpact,
          })),
        })),
        syncStatus: 'PENDING',
      };

      // 1. Save order to Dexie offline sales queue
      await offlineDB.salesOrders.put(newOrder);

      // 2. Local shift statistics updates
      const updatedExpected = { ...activeShift };
      if (paymentMethod === 'CASH') {
        updatedExpected.expectedCash += cart.total;
      } else if (paymentMethod === 'INSTAPAY') {
        updatedExpected.expectedInstaPay += cart.total;
      } else if (paymentMethod === 'VISA') {
        updatedExpected.expectedVisa += cart.total;
      }
      setActiveShift(updatedExpected);

      // 3. Set table status to VACANT and clear the cart in Dexie
      if (cart.orderType === 'DINE_IN' && cart.tableId) {
        await offlineDB.diningTables.update(cart.tableId, { status: 'VACANT' });
        setTables(prev => prev.map(t => t.id === cart.tableId ? { ...t, status: 'VACANT' } : t));
      }
      
      // Clear active cart
      await offlineDB.carts.delete(cart.id);
      setCart({
        ...cart,
        items: [],
        subtotal: 0,
        discount: 0,
        tax: 0,
        total: 0,
      });
      setDiscountVal('0');

      // 4. Set receipt for print preview
      setReceiptOrder(newOrder);
      setShowPrintModal(true);

      triggerAlert('success', 'تم حفظ الأوردر وتقفيل الحساب!');
      
      // Try to trigger background sync immediately
      triggerSync();
    } catch (e) {
      console.error('Failed to complete order:', e);
      triggerAlert('error', 'حصل خطأ ومقدرناش نحفظ الأوردر.');
    }
  };

  // 6a. Check for existing active shift on modal open
  const checkExistingShift = useCallback(async () => {
    setCheckingShift(true);
    setExistingShift(null);
    try {
      const res = await fetch('/api/shifts/active');
      if (res.ok) {
        const data = await res.json();
        if (data.activeShift) {
          setExistingShift(data.activeShift);
        }
      }
    } catch (e) {
      console.error('Failed to check existing shift:', e);
    } finally {
      setCheckingShift(false);
    }
  }, []);

  // Auto-check for existing shift when open shift modal opens
  useEffect(() => {
    if (showOpenShift) {
      checkExistingShift();
    } else {
      setExistingShift(null);
      setCheckingShift(false);
    }
  }, [showOpenShift, checkExistingShift]);

  // 6b. Takeover an existing open shift
  const handleTakeoverShift = () => {
    if (!existingShift) return;
    // Map the API response to our ShiftState shape
    const shiftState = {
      id: existingShift.id,
      userId: existingShift.userId,
      floatCash: existingShift.floatCash,
      expectedCash: existingShift.expectedCash,
      expectedInstaPay: existingShift.expectedInstaPay,
      expectedVisa: existingShift.expectedVisa || 0,
      openedAt: existingShift.openedAt,
    };
    setActiveShift(shiftState);
    setExistingShift(null);
    setShowOpenShift(false);
    triggerAlert('success', `تم استلام الوردية المفتوحة وتسجيل الدخول عليها بنجاح.`);
  };

  // 6c. Shift Opening POST (new shift)
  const handleOpenShiftSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    try {
      const res = await fetch('/api/shifts/active', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, floatCash: parseFloat(floatCash) || 0 }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشل فتح الشفت');

      setActiveShift(data.shift);
      setShowOpenShift(false);
      triggerAlert('success', `تم فتح الوردية بعهدة افتتاحية: EGP ${floatCash}`);
    } catch (err: any) {
      triggerAlert('error', err.message || 'خطأ في فتح الشفت');
    }
  };

  // 7. Shift Closing POST
  const handleCloseShiftSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeShift) return;

    try {
      const res = await fetch('/api/shifts/close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shiftId: activeShift.id,
          closedCash: parseFloat(closedCash) || 0,
          closedInstaPay: parseFloat(closedInstaPay) || 0,
          closedVisa: 0, // VISA option removed, default to 0
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشل تقفيل الشفت');

      triggerAlert('success', 'تم تقفيل اليومية بنجاح وتسجيل الفروقات.');
      setActiveShift(null);
      setShowCloseShift(false);
      // Removed logout() to keep the cashier logged in
    } catch (err: any) {
      triggerAlert('error', err.message || 'خطأ أثناء تقفيل الشفت');
    }
  };

  // 7.5 Cashier Inventory fetch & submission methods
  const fetchPOSInventory = async () => {
    setLoadingInventory(true);
    try {
      const res = await fetch('/api/inventory');
      if (res.ok) {
        const data = await res.json();
        setInventoryMaterials(data.rawMaterials);
      }
    } catch (e) {
      console.error(e);
      triggerAlert('error', 'فشل تحميل بيانات المخزن.');
    } finally {
      setLoadingInventory(false);
    }
  };

  useEffect(() => {
    if (showInventoryModal) {
      fetchPOSInventory();
      setInventoryAction('view');
    }
  }, [showInventoryModal]);

  const handlePOSRestockSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMatId || !inventoryQty) return;
    setSubmitInventoryLoading(true);

    try {
      const res = await fetch('/api/inventory/restock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rawMaterialId: selectedMatId,
          quantity: parseFloat(inventoryQty),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشلت عملية التوريد');

      triggerAlert('success', 'تم شحن وتوريد الخامة للمخزن بنجاح.');
      setInventoryQty('');
      setInventoryAction('view');
      fetchPOSInventory();
    } catch (err: any) {
      triggerAlert('error', err.message || 'خطأ في عملية التوريد');
    } finally {
      setSubmitInventoryLoading(false);
    }
  };

  const handlePOSWastageSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMatId || !inventoryQty || !inventoryReason) return;
    setSubmitInventoryLoading(true);

    try {
      const res = await fetch('/api/inventory/wastage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rawMaterialId: selectedMatId,
          quantity: parseFloat(inventoryQty),
          reason: inventoryReason,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشل تسجيل الهالك');

      triggerAlert('success', 'تم تسجيل الهالك وخصمه من المخزن بنجاح.');
      setInventoryQty('');
      setInventoryReason('');
      setInventoryAction('view');
      fetchPOSInventory();
    } catch (err: any) {
      triggerAlert('error', err.message || 'خطأ في تسجيل الهالك');
    } finally {
      setSubmitInventoryLoading(false);
    }
  };

  // 8. Expense Logging POST
  const handleExpenseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeShift) return;

    try {
      const res = await fetch('/api/shifts/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shiftId: activeShift.id,
          type: 'PAYOUT',
          amount: parseFloat(expenseAmount) || 0,
          reason: expenseReason,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشل تسجيل المصروف');

      const updatedExpected = { ...activeShift };
      updatedExpected.expectedCash -= parseFloat(expenseAmount);
      setActiveShift(updatedExpected);

      triggerAlert('success', `تم تسجيل سحب مصروفات بقيمة EGP ${expenseAmount}`);
      setShowExpenseModal(false);
      setExpenseAmount('');
      setExpenseReason('');
    } catch (err: any) {
      triggerAlert('error', err.message || 'خطأ في تسجيل المصروف');
    }
  };

  // Standard browser print receipt trigger
  const handlePrintReceipt = () => {
    window.print();
  };

  if (!mounted) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-[#090d16] text-gray-200 text-right" dir="rtl">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw className="w-8 h-8 animate-spin text-cyan-500" />
          <span className="text-sm font-semibold">جاري تشغيل الكاشير وتحميل الترابيزات...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-[#090d16] text-gray-200 text-right" dir="rtl">
      
      {/* 1. Header Navigation Bar */}
      <header className="h-16 shrink-0 bg-[#0c1424] border-b border-white/5 px-6 flex items-center justify-between z-10 no-print">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-tr from-cyan-500 to-purple-600 flex items-center justify-center font-bold text-white shadow-md shadow-cyan-500/10">
            DN
          </div>
          <div className="text-right">
            <h1 className="text-lg font-bold text-white leading-tight">داي أند نايت</h1>
            <p className="text-xs text-gray-400">شاشة كاشير الصالة والتيك أواي</p>
          </div>
        </div>

        {/* Sync Status, Shift controls and Logout */}
        <div className="flex items-center gap-4 flex-row-reverse">
          {/* Online/Offline Badge */}
          <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${
            isOnline ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
          }`}>
            {isOnline ? (
              <>
                <Wifi className="w-3.5 h-3.5" />
                <span>متصل بالشبكة</span>
              </>
            ) : (
              <>
                <WifiOff className="w-3.5 h-3.5" />
                <span>شغال محلي (أوفلاين)</span>
              </>
            )}
          </div>

          {/* Sync status widget */}
          {pendingCount > 0 && (
            <button 
              onClick={triggerSync}
              disabled={syncing || !isOnline}
              className="flex items-center gap-2 px-3 py-1 bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/20 text-purple-300 rounded-full text-xs font-semibold transition-all disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
              <span>{pendingCount} فواتير معلقة للمزامنة</span>
            </button>
          )}

          {activeShift && (
            <div className="text-xs text-left ml-2 hidden md:block">
              <p className="text-gray-400">نقدية الدرج المتوقعة</p>
              <p className="font-bold text-cyan-400">EGP {activeShift.expectedCash.toFixed(2)}</p>
            </div>
          )}

          {/* Admin link */}
          {user?.role === 'ADMIN' && (
            <button 
              onClick={() => router.push('/admin')}
              className="px-4 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-semibold border border-white/5 transition-all text-white"
            >
              شاشة الإدارة
            </button>
          )}

          {/* Action buttons */}
          <button 
            onClick={() => setShowInventoryModal(true)}
            className="px-3 py-1.5 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 text-xs font-semibold text-cyan-400 border border-cyan-500/20 transition-all"
          >
            مخزن الخامات
          </button>

          <button 
            onClick={() => setShowExpenseModal(true)}
            className="px-3 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-xs font-semibold text-amber-400 border border-amber-500/20 transition-all"
          >
            تسجيل مصروف
          </button>

          <button 
            onClick={() => setShowCloseShift(true)}
            className="px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-xs font-semibold text-rose-400 border border-rose-500/20 transition-all"
          >
            تقفيل اليومية
          </button>

          <button 
            onClick={() => { logout(); router.push('/'); }}
            className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-all border border-white/5"
            title="تسجيل الخروج"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* 2. Main POS Workspace Grid */}
      <main className="flex-1 flex overflow-hidden no-print">
        
        {/* Left Side: Tables Floor Plan & Items Menu Grid */}
        <section className="flex-1 flex flex-col p-4 overflow-hidden gap-4">
          
          {/* Interactive Floor Plan (Halls & Tables) */}
          <div className="glass-panel rounded-xl p-4 shrink-0 flex flex-col gap-3">
            <div className="flex items-center justify-between border-b border-white/5 pb-2 flex-row-reverse">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-cyan-400" />
                <h2 className="font-semibold text-sm text-white">صالات وترابيزات الصالة</h2>
              </div>
              <button 
                onClick={() => setActiveTableId(null)}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold border transition-all ${
                  !activeTableId 
                    ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30' 
                    : 'bg-white/5 text-gray-400 border-white/5 hover:bg-white/10'
                }`}
              >
                <ShoppingBag className="w-3.5 h-3.5" />
                <span>تيك أواي / سفري</span>
              </button>
            </div>

            {/* Halls selectors */}
            <div className="flex gap-2 justify-start">
              {halls.map((hall) => (
                <button
                  key={hall.id}
                  onClick={() => setActiveHallId(hall.id)}
                  className={`px-3 py-1 rounded-lg text-xs font-medium border transition-all ${
                    activeHallId === hall.id
                      ? 'bg-purple-500/20 text-purple-300 border-purple-500/30'
                      : 'bg-white/5 text-gray-400 border-transparent hover:bg-white/10'
                  }`}
                >
                  {hall.name}
                </button>
              ))}
            </div>

            {/* Tables Grid */}
            <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-8 gap-2.5 max-h-[140px] overflow-y-auto pl-1">
              {tables
                .filter(t => t.hallId === activeHallId)
                .map((table) => (
                  <button
                    key={table.id}
                    onClick={() => setActiveTableId(table.id)}
                    className={`flex flex-col items-center justify-center p-2 rounded-lg text-xs font-medium border transition-all h-[55px] ${
                      activeTableId === table.id
                        ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/40 shadow-md shadow-cyan-500/5'
                        : table.status === 'OCCUPIED'
                        ? 'bg-rose-500/10 text-rose-400 border-rose-500/20 hover:bg-rose-500/20'
                        : 'bg-white/5 text-gray-300 border-white/5 hover:bg-white/10'
                    }`}
                  >
                    <span>{table.name}</span>
                    <span className="text-[9px] opacity-75 mt-0.5">
                      {table.status === 'OCCUPIED' ? 'مشغولة' : 'فاضية'}
                    </span>
                  </button>
                ))}
            </div>
          </div>

          {/* Menu Categories & Items Grid */}
          <div className="flex-1 glass-panel rounded-xl p-4 flex flex-col gap-4 overflow-hidden">
            
            {/* Category tabs */}
            <div className="flex gap-2 border-b border-white/5 pb-3 overflow-x-auto shrink-0 pl-1 justify-start">
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategoryId(cat.id)}
                  className={`px-4 py-2 rounded-xl text-xs font-semibold border whitespace-nowrap transition-all ${
                    selectedCategoryId === cat.id
                      ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30'
                      : 'bg-white/5 text-gray-400 border-transparent hover:bg-white/10'
                  }`}
                >
                  {cat.name}
                </button>
              ))}
            </div>

            {/* Menu Items Grid */}
            <div className="flex-1 overflow-y-auto pl-1">
              {loading ? (
                <div className="h-full flex items-center justify-center text-sm text-gray-400 gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-cyan-500" />
                  <span>جاري تحميل قائمة المنيو...</span>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3.5">
                  {items
                    .filter(i => i.categoryId === selectedCategoryId)
                    .map((item) => (
                      <button
                        key={item.id}
                        onClick={() => handleItemClick(item)}
                        className="glass-panel-hover flex flex-col justify-between p-4 rounded-xl text-right bg-slate-900/30 border border-white/5 h-[100px] cursor-pointer hover:border-cyan-500/30 focus:outline-none"
                      >
                        <span className="font-semibold text-sm text-white line-clamp-2 leading-tight">
                          {item.name}
                        </span>
                        <div className="flex items-center justify-between w-full mt-2 flex-row-reverse">
                          <span className="text-cyan-400 font-bold text-xs">
                            EGP {item.price.toFixed(2)}
                          </span>
                          <PlusCircle className="w-4 h-4 text-cyan-400/80" />
                        </div>
                      </button>
                    ))}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Right Side: Active Cart Invoice / Checkout Panel */}
        <section className="w-[360px] md:w-[400px] bg-[#0c1424] border-r border-white/5 flex flex-col overflow-hidden">
          
          {/* Cart Header */}
          <div className="p-4 border-b border-white/5 flex items-center justify-between shrink-0 flex-row-reverse">
            <div className="flex items-center gap-2">
              <ShoppingBag className="w-4 h-4 text-purple-400" />
              <h3 className="font-semibold text-sm text-white">
                {cart?.orderType === 'DINE_IN' ? `فاتورة ${cart.tableName}` : 'فاتورة التيك أواي'}
              </h3>
            </div>
            <button 
              onClick={handleClearCart}
              disabled={!cart || cart.items.length === 0}
              className="text-xs text-gray-400 hover:text-rose-400 disabled:opacity-50 transition-all flex items-center gap-1"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>مسح الكل</span>
            </button>
          </div>

          {/* Cart Items List */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {cart && cart.items.length > 0 ? (
              cart.items.map((item) => (
                <div key={item.id} className="p-3 bg-slate-900/50 border border-white/5 rounded-xl flex flex-col gap-2">
                  <div className="flex items-start justify-between gap-2 flex-row-reverse text-right">
                    <div>
                      <h4 className="font-medium text-xs text-white leading-tight">{item.name}</h4>
                      {item.modifiers.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1 justify-start">
                          {item.modifiers.map((m, idx) => (
                            <span key={idx} className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/15">
                              +{m.name}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <span className="font-bold text-xs text-cyan-400 shrink-0">
                      EGP {item.totalPrice.toFixed(2)}
                    </span>
                  </div>

                  {/* Quantity and Remove buttons */}
                  <div className="flex items-center justify-between border-t border-white/5 pt-2 mt-1 flex-row-reverse">
                    <span className="text-[11px] text-gray-400">
                      EGP {item.unitPrice.toFixed(2)} / للواحد
                    </span>
                    <div className="flex items-center gap-3 flex-row-reverse">
                      <button
                        onClick={() => handleUpdateQty(item.id, 1)}
                        className="p-1 rounded bg-white/5 hover:bg-white/10 text-gray-300 transition-all"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                      <span className="text-xs font-bold text-white w-4 text-center">{item.qty}</span>
                      <button
                        onClick={() => handleUpdateQty(item.id, -1)}
                        className="p-1 rounded bg-white/5 hover:bg-white/10 text-gray-300 transition-all"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => handleRemoveItem(item.id)}
                        className="mr-2 text-gray-500 hover:text-rose-400 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center text-gray-500 gap-2 mt-20">
                <Coffee className="w-12 h-12 stroke-1 opacity-40 animate-float" />
                <p className="text-xs">الفاتورة فاضية حالياً.</p>
                <p className="text-[10px] opacity-75">اضغط على الأصناف من القائمة اليمين لإضافتها.</p>
              </div>
            )}
          </div>

          {/* Pricing & Checkout Section */}
          <div className="p-4 border-t border-white/5 bg-[#090d16] shrink-0 space-y-4">
            
            {/* Discount Tool */}
            <div className="flex gap-2 flex-row-reverse">
              <input
                type="number"
                value={discountVal}
                onChange={(e) => setDiscountVal(e.target.value)}
                className="flex-1 bg-slate-900 border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500 text-right"
                placeholder="قيمة الخصم بالجنيه"
                min="0"
              />
              <button 
                onClick={handleApplyDiscount}
                disabled={!cart || cart.items.length === 0}
                className="px-4 py-2 rounded-xl bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border border-purple-500/20 text-xs font-semibold transition-all disabled:opacity-50"
              >
                خصم
              </button>
            </div>

            {/* Price Calculations */}
            <div className="space-y-1.5 border-b border-white/5 pb-3">
              <div className="flex justify-between text-xs text-gray-400 flex-row-reverse">
                <span>الإجمالي قبل الخصم</span>
                <span>EGP {cart?.subtotal.toFixed(2) || '0.00'}</span>
              </div>
              {cart && cart.discount > 0 && (
                <div className="flex justify-between text-xs text-rose-400 flex-row-reverse">
                  <span>الخصم المطبق</span>
                  <span>-EGP {cart.discount.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between text-xs text-gray-400 flex-row-reverse">
                <span>ضريبة القيمة المضافة 14%</span>
                <span>EGP {cart?.tax.toFixed(2) || '0.00'}</span>
              </div>
              <div className="flex justify-between text-sm font-bold text-white pt-1 flex-row-reverse">
                <span>المطلوب دفعه</span>
                <span className="text-cyan-400 text-base">EGP {cart?.total.toFixed(2) || '0.00'}</span>
              </div>
            </div>

            {/* Payment Method selection */}
            <div className="space-y-2">
              <label className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 block text-right">
                طريقة الدفع
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setPaymentMethod('CASH')}
                  className={`flex flex-col items-center gap-1 py-2 rounded-xl border text-xs font-semibold transition-all ${
                    paymentMethod === 'CASH'
                      ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 shadow-sm'
                      : 'bg-slate-900 border-white/5 text-gray-400 hover:bg-slate-900/80 hover:text-white'
                  }`}
                >
                  <DollarSign className="w-3.5 h-3.5" />
                  <span>كاش</span>
                </button>
                
                <button
                  type="button"
                  onClick={() => setPaymentMethod('INSTAPAY')}
                  className={`flex flex-col items-center gap-1 py-2 rounded-xl border text-xs font-semibold transition-all ${
                    paymentMethod === 'INSTAPAY'
                      ? 'bg-purple-500/20 text-purple-300 border-purple-500/40 shadow-sm'
                      : 'bg-slate-900 border-white/5 text-gray-400 hover:bg-slate-900/80 hover:text-white'
                  }`}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>إنستا باي</span>
                </button>
              </div>
            </div>

            {/* Complete checkout button */}
            <button
              onClick={handleCompleteOrder}
              disabled={!cart || cart.items.length === 0}
              className="w-full py-3.5 bg-gradient-to-r from-cyan-500 to-purple-600 hover:from-cyan-600 hover:to-purple-700 text-white font-bold rounded-xl transition-all shadow-md shadow-cyan-500/10 active:scale-98 disabled:opacity-50 text-sm flex items-center justify-center gap-2 flex-row-reverse"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>تأكيد وتقفيل الحساب (EGP {cart?.total.toFixed(2) || '0.00'})</span>
            </button>
          </div>
        </section>
      </main>

      {/* ======================================================== */}
      {/* 3. Modals & Dialogs (Open Shift, Close Shift, Expenses) */}
      {/* ======================================================== */}

      {/* Alert Banner */}
      {alertMsg && (
        <div className={`fixed bottom-4 left-4 z-50 p-4 rounded-xl shadow-lg border text-sm flex items-center gap-3 transition-all animate-float no-print flex-row-reverse ${
          alertMsg.type === 'success' 
            ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 shadow-emerald-500/5' 
            : 'bg-rose-500/10 border-rose-500/20 text-rose-400 shadow-rose-500/5'
        }`}>
          {alertMsg.type === 'success' ? <CheckCircle2 className="w-5 h-5 shrink-0" /> : <AlertCircle className="w-5 h-5 shrink-0" />}
          <span>{alertMsg.text}</span>
        </div>
      )}

      {/* OPEN SHIFT DIALOG */}
      {showOpenShift && (
        <div className="fixed inset-0 z-40 bg-black/75 flex items-center justify-center p-4 backdrop-blur-sm no-print">
          <div className="w-full max-w-md glass-panel rounded-2xl p-6 relative text-right" dir="rtl">
            
            {checkingShift ? (
              <div className="flex flex-col items-center justify-center gap-3 py-8">
                <RefreshCw className="w-8 h-8 text-cyan-400 animate-spin" />
                <p className="text-sm text-gray-400">جاري التحقق من حالة الوردية...</p>
              </div>
            ) : existingShift ? (
              // --- TAKEOVER MODE: existing shift found ---
              <div className="space-y-5">
                <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 flex-row-reverse">
                  <AlertCircle className="w-5 h-5 text-amber-400 mt-0.5 shrink-0" />
                  <div className="text-right">
                    <p className="text-sm font-bold text-amber-300">فيه وردية مفتوحة لسه!</p>
                    <p className="text-xs text-amber-400/80 mt-1">
                      اتفتحت من إيد: <span className="font-bold text-white">{existingShift.user?.name || 'مستخدم'}</span>
                      <br />
                      في: {new Date(existingShift.openedAt).toLocaleString('ar-EG')}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 text-center">
                  <div className="p-3 bg-white/5 rounded-xl border border-white/5">
                    <p className="text-[10px] text-gray-400">كاش الدرج المتوقع</p>
                    <p className="text-sm font-bold text-cyan-400 mt-1">EGP {existingShift.expectedCash?.toFixed(2) || '0.00'}</p>
                  </div>
                  <div className="p-3 bg-white/5 rounded-xl border border-white/5">
                    <p className="text-[10px] text-gray-400">إنستا باي المتوقع</p>
                    <p className="text-sm font-bold text-purple-400 mt-1">EGP {existingShift.expectedInstaPay?.toFixed(2) || '0.00'}</p>
                  </div>
                </div>

                <button
                  onClick={handleTakeoverShift}
                  className="w-full py-3 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-bold rounded-xl shadow-lg transition-all"
                >
                  ✅ استلم الوردية دي وابدأ شغل
                </button>

                <p className="text-center text-[10px] text-gray-500">
                  أو لو عايز تقفل الوردية القديمة وتفتح جديدة، روح للأدمن أول وقفّلها من هناك.
                </p>
              </div>
            ) : (
              // --- NORMAL MODE: no existing shift ---
              <>
                <h3 className="text-xl font-bold text-white mb-2">فتح شفت ويومية جديدة</h3>
                <p className="text-xs text-gray-400 mb-6">اكتب عهدة الكاش الافتتاحية اللي في الدرج عشان تبدأ شفت جديد والبيع.</p>
                
                <form onSubmit={handleOpenShiftSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-400 mb-2">العهدة الافتتاحية في الدرج (EGP)</label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-gray-500">EGP</span>
                      <input
                        type="number"
                        required
                        value={floatCash}
                        onChange={(e) => setFloatCash(e.target.value)}
                        className="w-full bg-slate-900 border border-white/10 rounded-xl py-3 pl-12 pr-4 text-white focus:outline-none focus:border-cyan-500 text-right"
                        placeholder="0.00"
                        min="0"
                      />
                    </div>
                  </div>
                  <button
                    type="submit"
                    className="w-full py-3 bg-gradient-to-r from-cyan-500 to-purple-600 text-white font-bold rounded-xl shadow-lg transition-all"
                  >
                    ابدأ الوردية والبيع
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      )}

      {/* CLOSE SHIFT DIALOG (SETTLEMENT) */}
      {showCloseShift && (
        <div className="fixed inset-0 z-40 bg-black/75 flex items-center justify-center p-4 backdrop-blur-sm no-print">
          <div className="w-full max-w-lg glass-panel rounded-2xl p-6 relative text-right" dir="rtl">
            <button 
              onClick={() => setShowCloseShift(false)}
              className="absolute top-4 left-4 text-gray-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
            <h3 className="text-xl font-bold text-white mb-2">تسوية وإغلاق الشفت اليومي</h3>
            <p className="text-xs text-gray-400 mb-6">اكتب المبالغ الفعلية اللي معاك في الدرج والإنستا باي لتسوية الوردية وحساب العجز أو الزيادة.</p>
            
            <form onSubmit={handleCloseShiftSubmit} className="space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 bg-white/5 border border-white/5 rounded-xl text-center">
                  <span className="text-[10px] text-gray-400">الكاش المتوقع بالدرج</span>
                  <p className="text-sm font-bold text-cyan-400 mt-1">EGP {activeShift?.expectedCash.toFixed(2) || '0.00'}</p>
                </div>
                <div className="p-3 bg-white/5 border border-white/5 rounded-xl text-center">
                  <span className="text-[10px] text-gray-400">المتوقع إنستا باي</span>
                  <p className="text-sm font-bold text-purple-400 mt-1">EGP {activeShift?.expectedInstaPay.toFixed(2) || '0.00'}</p>
                </div>
              </div>

              <div className="space-y-4 pt-2">
                <div>
                  <label className="block text-xs font-semibold text-gray-400 mb-2">الكاش الفعلي في الدرج (EGP)</label>
                  <input
                    type="number"
                    required
                    value={closedCash}
                    onChange={(e) => setClosedCash(e.target.value)}
                    className="w-full bg-slate-900 border border-white/10 rounded-xl py-2.5 px-4 text-white focus:outline-none focus:border-cyan-500 text-right"
                    placeholder="اكتب المبلغ الفعلي الكاش هنا"
                    min="0"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-400 mb-2">إجمالي الإنستا باي الفعلي (EGP)</label>
                  <input
                    type="number"
                    required
                    value={closedInstaPay}
                    onChange={(e) => setClosedInstaPay(e.target.value)}
                    className="w-full bg-slate-900 border border-white/10 rounded-xl py-2.5 px-4 text-white focus:outline-none focus:border-purple-500 text-right"
                    placeholder="اكتب إجمالي إنستا باي هنا"
                    min="0"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-3.5 bg-gradient-to-r from-rose-500 to-rose-600 hover:from-rose-600 hover:to-rose-700 text-white font-bold rounded-xl shadow-lg transition-all text-sm mt-4"
              >
                تأكيد التسوية وإغلاق الوردية
              </button>
            </form>
          </div>
        </div>
      )}

      {/* CASH OUT / EXPENSE MODAL */}
      {showExpenseModal && (
        <div className="fixed inset-0 z-40 bg-black/75 flex items-center justify-center p-4 backdrop-blur-sm no-print">
          <div className="w-full max-w-md glass-panel rounded-2xl p-6 relative text-right" dir="rtl">
            <button 
              onClick={() => setShowExpenseModal(false)}
              className="absolute top-4 left-4 text-gray-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
            <h3 className="text-xl font-bold text-white mb-2">سحب نقدية / مصروفات</h3>
            <p className="text-xs text-gray-400 mb-6">سجل أي مبالغ بيتم سحبها من درج الكاشير لشراء خامات أو دفع إكراميات أو فواتير.</p>
            
            <form onSubmit={handleExpenseSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-2">المبلغ المسحوب (EGP)</label>
                <input
                  type="number"
                  required
                  value={expenseAmount}
                  onChange={(e) => setExpenseAmount(e.target.value)}
                  className="w-full bg-slate-900 border border-white/10 rounded-xl py-2.5 px-4 text-white focus:outline-none focus:border-cyan-500 text-right"
                  placeholder="0.00"
                  min="0"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-2">السبب أو البيان</label>
                <input
                  type="text"
                  required
                  value={expenseReason}
                  onChange={(e) => setExpenseReason(e.target.value)}
                  className="w-full bg-slate-900 border border-white/10 rounded-xl py-2.5 px-4 text-white focus:outline-none focus:border-cyan-500 text-right"
                  placeholder="مثال: شراء ثلج، منظفات، ليمون للمحل"
                />
              </div>

              <button
                type="submit"
                className="w-full py-3 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl shadow-lg transition-all mt-2"
              >
                تأكيد سحب النقدية
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODIFIERS SELECTION DIALOG */}
      {showModifiersModal && activeItemForMod && (
        <div className="fixed inset-0 z-40 bg-black/75 flex items-center justify-center p-4 backdrop-blur-sm no-print">
          <div className="w-full max-w-md glass-panel rounded-2xl p-6 relative text-right" dir="rtl">
            <button 
              onClick={() => setShowModifiersModal(false)}
              className="absolute top-4 left-4 text-gray-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
            <h3 className="text-xl font-bold text-white mb-1">تعديل وإضافات الطلب</h3>
            <p className="text-xs text-gray-400 mb-6">إضافات متاحة لـ {activeItemForMod.name}</p>
            
            <div className="space-y-4 max-h-[300px] overflow-y-auto pl-1">
              {modifiers.map((mod) => {
                const isSelected = selectedMods.includes(mod.id);
                return (
                  <button
                    key={mod.id}
                    onClick={() => {
                      if (isSelected) {
                        setSelectedMods(prev => prev.filter(id => id !== mod.id));
                      } else {
                        setSelectedMods(prev => [...prev, mod.id]);
                      }
                    }}
                    className={`w-full flex items-center justify-between p-3.5 rounded-xl border text-right transition-all flex-row-reverse ${
                      isSelected 
                        ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 shadow-sm'
                        : 'bg-slate-900 border-white/5 text-gray-400 hover:bg-slate-900/80 hover:text-white'
                    }`}
                  >
                    <span className="text-xs font-semibold">{mod.name}</span>
                    <span className="text-xs font-bold text-cyan-400">+EGP {mod.priceImpact.toFixed(2)}</span>
                  </button>
                );
              })}
            </div>

            <button
              onClick={confirmModifiers}
              className="w-full py-3 bg-gradient-to-r from-cyan-500 to-purple-600 text-white font-bold rounded-xl shadow-lg transition-all mt-6 text-xs uppercase tracking-wider"
            >
              تأكيد وإضافة للفاتورة
            </button>
          </div>
        </div>
      )}

      {/* RECEIPT PRINTING PREVIEW MODAL */}
      {showPrintModal && receiptOrder && (
        <div className="fixed inset-0 z-45 bg-black/85 flex items-center justify-center p-4 backdrop-blur-sm no-print">
          <div className="w-full max-w-sm glass-panel rounded-2xl p-6 relative text-right" dir="rtl">
            <button 
              onClick={() => { setShowPrintModal(false); setReceiptOrder(null); }}
              className="absolute top-4 left-4 text-gray-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
            <h3 className="text-lg font-bold text-white mb-2 flex items-center gap-2 flex-row-reverse">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              <span>تم الدفع ومعاينة الفاتورة</span>
            </h3>
            <p className="text-xs text-gray-400 mb-6">معاينة ريسيت العميل. اضغط على زرار الطباعة للإخراج.</p>
            
            {/* Mini invoice representation */}
            <div className="p-4 bg-white text-black font-mono text-[11px] rounded-lg shadow-inner max-h-[350px] overflow-y-auto leading-relaxed text-right" dir="rtl">
              <div className="text-center font-bold text-xs uppercase tracking-wide border-b border-dashed border-gray-400 pb-2">
                كافيه داي أند نايت (Day & Night)<br />
                القاهرة، مصر<br />
                رقم الفاتورة: {receiptOrder.id.slice(0, 8)}
              </div>
              <div className="my-2 border-b border-dashed border-gray-400 pb-2 space-y-0.5">
                <p>تاريخ: {new Date(receiptOrder.createdAt).toLocaleDateString()}</p>
                <p>وقت: {new Date(receiptOrder.createdAt).toLocaleTimeString()}</p>
                <p>النوع: {receiptOrder.orderType === 'DINE_IN' ? 'صالة' : 'تيك أواي'}</p>
                {receiptOrder.tableId && (
                  <p>الترابيزة: {tables.find(t => t.id === receiptOrder.tableId)?.name || 'طاولة'}</p>
                )}
                <p>الكاشير: {user?.name}</p>
              </div>

              <div className="space-y-1 py-2 border-b border-dashed border-gray-400">
                {receiptOrder.items.map((item, idx) => {
                  const itDetails = items.find(i => i.id === item.itemId);
                  return (
                    <div key={idx} className="space-y-0.5">
                      <div className="flex justify-between flex-row-reverse">
                        <span>{itDetails?.name || 'صنف'} x{item.qty}</span>
                        <span>EGP {item.totalPrice.toFixed(2)}</span>
                      </div>
                      {item.modifiers.length > 0 && (
                        <div className="pr-3 text-[10px] opacity-75">
                          {item.modifiers.map((m, mIdx) => {
                            const modDetails = modifiers.find(mo => mo.id === m.modifierId);
                            return (
                              <p key={mIdx}>+{modDetails?.name || 'إضافة'}</p>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="my-2 space-y-1 text-left">
                <div className="flex justify-between flex-row-reverse">
                  <span>الإجمالي:</span>
                  <span>EGP {receiptOrder.subtotal.toFixed(2)}</span>
                </div>
                {receiptOrder.discount > 0 && (
                  <div className="flex justify-between text-red-600 flex-row-reverse">
                    <span>الخصم:</span>
                    <span>-EGP {receiptOrder.discount.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between flex-row-reverse">
                  <span>ضريبة 14%:</span>
                  <span>EGP {receiptOrder.tax.toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-bold text-xs border-t border-dashed border-gray-400 pt-1 flex-row-reverse">
                  <span>الإجمالي النهائي:</span>
                  <span>EGP {receiptOrder.total.toFixed(2)}</span>
                </div>
              </div>

              <div className="text-center font-bold uppercase mt-4 pt-2 border-t border-dashed border-gray-400">
                تم الدفع {receiptOrder.paymentMethod === 'CASH' ? 'كاش' : receiptOrder.paymentMethod === 'INSTAPAY' ? 'إنستا باي' : 'فيزا'}<br />
                شكراً لزيارتكم!
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 mt-6">
              <button
                onClick={() => { setShowPrintModal(false); setReceiptOrder(null); }}
                className="py-3.5 border border-white/10 hover:bg-white/5 text-white font-semibold rounded-xl text-xs"
              >
                قفل الفاتورة
              </button>
              
              <button
                onClick={handlePrintReceipt}
                className="py-3.5 bg-gradient-to-r from-cyan-500 to-purple-600 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5"
              >
                <Printer className="w-4 h-4" />
                <span>طباعة الريسيت</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 4. Thermal receipt print-only view (Active when printing) */}
      {/* ======================================================== */}
      {receiptOrder && (
        <div className="hidden print:block print-area font-mono text-[10px] text-black bg-white leading-relaxed text-right" dir="rtl">
          <div className="text-center font-bold text-xs uppercase border-b border-dashed border-gray-500 pb-2">
            كافيه داي أند نايت (Day & Night)<br />
            القاهرة، مصر<br />
            رقم الفاتورة: {receiptOrder.id.slice(0, 8)}
          </div>
          <div className="my-2 border-b border-dashed border-gray-500 pb-1">
            <p>تاريخ: {new Date(receiptOrder.createdAt).toLocaleDateString()}</p>
            <p>وقت: {new Date(receiptOrder.createdAt).toLocaleTimeString()}</p>
            <p>النوع: {receiptOrder.orderType === 'DINE_IN' ? 'صالة' : 'تيك أواي'}</p>
            {receiptOrder.tableId && (
              <p>الترابيزة: {tables.find(t => t.id === receiptOrder.tableId)?.name || 'طاولة'}</p>
            )}
            <p>الكاشير: {user?.name}</p>
          </div>

          <div className="space-y-1 py-1 border-b border-dashed border-gray-500">
            {receiptOrder.items.map((item, idx) => {
              const itDetails = items.find(i => i.id === item.itemId);
              return (
                <div key={idx} className="space-y-0.5">
                  <div className="flex justify-between flex-row-reverse">
                    <span>{itDetails?.name || 'صنف'} x{item.qty}</span>
                    <span>EGP {item.totalPrice.toFixed(2)}</span>
                  </div>
                  {item.modifiers.length > 0 && (
                    <div className="pr-3 text-[9px] opacity-75">
                      {item.modifiers.map((m, mIdx) => {
                        const modDetails = modifiers.find(mo => mo.id === m.modifierId);
                        return (
                          <p key={mIdx}>+{modDetails?.name || 'إضافة'}</p>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="my-1.5 text-right space-y-0.5">
            <div className="flex justify-between flex-row-reverse">
              <span>الإجمالي:</span>
              <span>EGP {receiptOrder.subtotal.toFixed(2)}</span>
            </div>
            {receiptOrder.discount > 0 && (
              <div className="flex justify-between text-red-600 flex-row-reverse">
                <span>الخصم:</span>
                <span>-EGP {receiptOrder.discount.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between flex-row-reverse">
              <span>ضريبة 14%:</span>
              <span>EGP {receiptOrder.tax.toFixed(2)}</span>
            </div>
            <div className="flex justify-between font-bold border-t border-dashed border-gray-500 pt-0.5 flex-row-reverse">
              <span>الإجمالي النهائي:</span>
              <span>EGP {receiptOrder.total.toFixed(2)}</span>
            </div>
          </div>

          <div className="text-center font-bold uppercase mt-4 pt-2 border-t border-dashed border-gray-500">
            تم الدفع {receiptOrder.paymentMethod === 'CASH' ? 'كاش' : receiptOrder.paymentMethod === 'INSTAPAY' ? 'إنستا باي' : 'فيزا'}<br />
            شكراً لزيارتكم!
          </div>
        </div>
      )}

      {/* CASHIER INVENTORY MODAL */}
      {showInventoryModal && (
        <div className="fixed inset-0 z-40 bg-black/75 flex items-center justify-center p-4 backdrop-blur-sm no-print">
          <div className="w-full max-w-3xl glass-panel rounded-2xl p-6 relative text-right max-h-[85vh] overflow-y-auto" dir="rtl">
            <button 
              onClick={() => setShowInventoryModal(false)}
              className="absolute top-4 left-4 text-gray-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
            
            {inventoryAction === 'view' && (
              <>
                <h3 className="text-xl font-bold text-white mb-2">مخزن وجرد الخامات</h3>
                <p className="text-xs text-gray-400 mb-6">تابع رصيد المكونات والخامات الحالي، وسجل التوريدات الجديدة أو الهوالك.</p>
                
                {loadingInventory ? (
                  <div className="flex items-center justify-center py-12 gap-2 text-sm text-gray-400">
                    <RefreshCw className="w-4 h-4 animate-spin text-cyan-400" />
                    <span>جاري تحميل بيانات وجرد المخزن...</span>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="overflow-x-auto rounded-xl border border-white/5">
                      <table className="w-full text-right text-xs border-collapse">
                        <thead>
                          <tr className="bg-slate-900/50 border-b border-white/5 text-gray-400">
                            <th className="p-3">اسم المادة الخام</th>
                            <th className="p-3">الرصيد الحالي بالمخزن</th>
                            <th className="p-3">حد التنبيه للنفاد</th>
                            <th className="p-3">الحالة</th>
                            <th className="p-3 text-left">العمليات</th>
                          </tr>
                        </thead>
                        <tbody>
                          {inventoryMaterials.map((mat) => (
                            <tr key={mat.id} className="border-b border-white/5 hover:bg-white/5 text-gray-300 transition-colors">
                              <td className="p-3 font-semibold text-white">{mat.name}</td>
                              <td className="p-3 font-mono font-bold text-cyan-400">
                                {mat.stockQty} {mat.deductUnit}
                                <span className="text-[10px] text-gray-500 block font-normal mt-0.5">
                                  (~{(mat.stockQty / mat.conversionFactor).toFixed(2)} {mat.purchaseUnit})
                                </span>
                              </td>
                              <td className="p-3 text-gray-400">{mat.minStockLevel} {mat.deductUnit}</td>
                              <td className="p-3">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  mat.isLowStock 
                                    ? 'bg-red-500/10 text-red-400 border border-red-500/15' 
                                    : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/15'
                                }`}>
                                  {mat.isLowStock ? 'ناقص / يحتاج توريد' : 'آمن'}
                                </span>
                              </td>
                              <td className="p-3 text-left space-x-2 space-x-reverse">
                                <button
                                  onClick={() => { setSelectedMatId(mat.id); setInventoryQty(''); setInventoryAction('restock'); }}
                                  className="px-2.5 py-1 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/20 rounded-lg text-[10px] font-bold transition-all"
                                >
                                  توريد
                                </button>
                                <button
                                  onClick={() => { setSelectedMatId(mat.id); setInventoryQty(''); setInventoryReason(''); setInventoryAction('wastage'); }}
                                  className="px-2.5 py-1 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 rounded-lg text-[10px] font-bold transition-all"
                                >
                                  تسجيل هالك
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            )}

            {inventoryAction === 'restock' && (
              <>
                <h3 className="text-xl font-bold text-white mb-2">توريد وشحن خامة للمخزن</h3>
                <p className="text-xs text-gray-400 mb-6">
                  الخامة: <span className="text-cyan-400 font-bold">{inventoryMaterials.find(m => m.id === selectedMatId)?.name}</span>
                  <br />
                  اكتب الكمية الموردة بوحدة الشراء الكبرى (مثال: بالكيلو، بالكرتونة). سيتم تحويلها تلقائياً.
                </p>
                
                <form onSubmit={handlePOSRestockSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-400 mb-2">
                      الكمية المراد إضافتها (بوحدة الشراء: {inventoryMaterials.find(m => m.id === selectedMatId)?.purchaseUnit})
                    </label>
                    <input
                      type="number"
                      required
                      value={inventoryQty}
                      onChange={(e) => setInventoryQty(e.target.value)}
                      className="w-full bg-slate-900 border border-white/10 rounded-xl py-2.5 px-4 text-white focus:outline-none focus:border-cyan-500 text-right"
                      placeholder="مثال: 5"
                      min="0"
                      step="any"
                    />
                  </div>

                  <div className="flex gap-3 justify-end pt-2">
                    <button
                      type="button"
                      onClick={() => setInventoryAction('view')}
                      className="px-4 py-2 border border-white/10 hover:bg-white/5 text-white font-semibold rounded-xl text-xs"
                    >
                      رجوع
                    </button>
                    <button
                      type="submit"
                      disabled={submitInventoryLoading}
                      className="px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-white font-bold rounded-xl text-xs"
                    >
                      {submitInventoryLoading ? 'جاري التوريد...' : 'تأكيد إضافة الرصيد'}
                    </button>
                  </div>
                </form>
              </>
            )}

            {inventoryAction === 'wastage' && (
              <>
                <h3 className="text-xl font-bold text-white mb-2">تسجيل هالك خامات ومواد</h3>
                <p className="text-xs text-gray-400 mb-6">
                  الخامة: <span className="text-rose-400 font-bold">{inventoryMaterials.find(m => m.id === selectedMatId)?.name}</span>
                  <br />
                  اكتب كمية الهالك بوحدة الاستهلاك الصغرى (مثال: جرام، مل).
                </p>
                
                <form onSubmit={handlePOSWastageSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-400 mb-2">
                      الكمية التالفة (بوحدة الاستهلاك: {inventoryMaterials.find(m => m.id === selectedMatId)?.deductUnit})
                    </label>
                    <input
                      type="number"
                      required
                      value={inventoryQty}
                      onChange={(e) => setInventoryQty(e.target.value)}
                      className="w-full bg-slate-900 border border-white/10 rounded-xl py-2.5 px-4 text-white focus:outline-none focus:border-rose-500 text-right"
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
                      value={inventoryReason}
                      onChange={(e) => setInventoryReason(e.target.value)}
                      className="w-full bg-slate-900 border border-white/10 rounded-xl py-2.5 px-4 text-white focus:outline-none focus:border-rose-500 text-right"
                      placeholder="مثال: انسكاب أثناء التحضير"
                    />
                  </div>

                  <div className="flex gap-3 justify-end pt-2">
                    <button
                      type="button"
                      onClick={() => setInventoryAction('view')}
                      className="px-4 py-2 border border-white/10 hover:bg-white/5 text-white font-semibold rounded-xl text-xs"
                    >
                      رجوع
                    </button>
                    <button
                      type="submit"
                      disabled={submitInventoryLoading}
                      className="px-4 py-2 bg-rose-500 hover:bg-rose-600 text-white font-bold rounded-xl text-xs"
                    >
                      {submitInventoryLoading ? 'جاري تسجيل الحركة...' : 'تأكيد تسجيل الهدر'}
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
