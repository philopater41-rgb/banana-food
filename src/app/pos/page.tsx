'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAppStore } from '@/lib/store';
import { useOfflineSync } from '@/hooks/useOfflineSync';
import { useScale } from '@/hooks/useScale';
import {
  offlineDB,
  type LocalCategory,
  type LocalItem,
  type LocalModifier,
  type LocalSalesOrder,
  type LocalCart,
  type LocalCartItem,
  type LocalDiscountReason,
  type PaymentMethodType,
} from '@/lib/dexie';
import { 
  LogOut, Wifi, WifiOff, ShoppingBag, 
  Trash2, Plus, Minus, DollarSign, RefreshCw, 
  CheckCircle2, AlertCircle, AlertTriangle, X, Printer, Lock,
  RotateCcw, Search, Tag, Check, Sparkles,
  Scale, Edit3, Calculator, TrendingUp, Store,
  HelpCircle, ChevronDown, ChevronUp
} from 'lucide-react';

// Native browser UUID
const generateUUID = (): string => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

// Generate Banana Food receipt number (BF-DD-MM-YYYY-XXXX)
const generateReceiptNumber = (): string => {
  const now = new Date();
  const dateKey = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('');
  const receiptDate = [
    String(now.getDate()).padStart(2, '0'),
    String(now.getMonth() + 1).padStart(2, '0'),
    now.getFullYear(),
  ].join('-');
  const counterKey = `bf_receipt_counter_${dateKey}`;
  const nextNumber = Number.parseInt(
    localStorage.getItem(counterKey) || '0', 
    10
  ) + 1;
  localStorage.setItem(counterKey, String(nextNumber));
  return `BF-${receiptDate}-${String(nextNumber).padStart(4, '0')}`;
};

export default function POSPage() {
  const router = useRouter();
  const {
    user,
    setUser,
    activeShift,
    setActiveShift,
    isOnline,
    logout,
  } = useAppStore();
  const { pendingCount, syncing, triggerSync } = useOfflineSync();
  const scale = useScale();
  const [showScaleModal, setShowScaleModal] = useState(false);
  const [showScaleHelp, setShowScaleHelp] = useState(false);

  const cleanUserName = user?.name || 'كاشير بانانا فود';

  // Local state for POS data loaded from Dexie / API
  const [categories, setCategories] = useState<LocalCategory[]>([]);
  const [items, setItems] = useState<LocalItem[]>([]);
  const [modifiers, setModifiers] = useState<LocalModifier[]>([]);
  const [discountReasons, setDiscountReasons] = useState<LocalDiscountReason[]>([]);

  // Search query for fast item selection
  const [itemSearchQuery, setItemSearchQuery] = useState('');

  // Selected category in menu (null = All items)
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);

  // Active direct counter cart
  const [cart, setCart] = useState<LocalCart | null>(null);

  // Payment Method selection (CASH default, optional INSTAPAY)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodType>('CASH');

  // Modals
  const [showOpenShift, setShowOpenShift] = useState(false);
  const [showCloseShift, setShowCloseShift] = useState(false);
  const [showModifiersModal, setShowModifiersModal] = useState(false);
  const [activeItemForMod, setActiveItemForMod] = useState<LocalItem | null>(null);
  const [selectedMods, setSelectedMods] = useState<string[]>([]);
  const [itemComment, setItemComment] = useState('');

  // Produce Pricing, Units & Profit Calculator Modal
  const [showProduceModal, setShowProduceModal] = useState(false);
  const [selectedProduceItem, setSelectedProduceItem] = useState<LocalItem | null>(null);
  const [editingCartItemId, setEditingCartItemId] = useState<string | null>(null);
  const [produceCost, setProduceCost] = useState<string>('');
  const [producePrice, setProducePrice] = useState<string>('');
  const [produceMargin, setProduceMargin] = useState<string>('25.0');
  const [produceUnit, setProduceUnit] = useState<'كيلو' | 'حزمة' | 'قطعة'>('كيلو');
  const [produceQty, setProduceQty] = useState<string>('1');
  const [savePricePermanently, setSavePricePermanently] = useState(true);

  // Auto-sync produce quantity when scale button is pressed while modal is open
  useEffect(() => {
    if (showProduceModal && produceUnit === 'كيلو' && scale.currentWeight > 0) {
      setProduceQty(scale.currentWeight.toFixed(3));
    }
  }, [scale.lastPacket, showProduceModal, produceUnit, scale.currentWeight]);

  // Returns / Refund Modal
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [returnSearchQuery, setReturnSearchQuery] = useState('');
  const [recentCompletedOrders, setRecentCompletedOrders] = useState<any[]>([]);
  const [selectedReturnOrder, setSelectedReturnOrder] = useState<any | null>(null);
  const [returnReason, setReturnReason] = useState('طلب الزبون');
  const [returnRestock, setReturnRestock] = useState(true);
  const [submittingReturn, setSubmittingReturn] = useState(false);

  // Shift inputs
  const [floatCash, setFloatCash] = useState('0');
  const [closedCash, setClosedCash] = useState('');
  const [closedInstaPay, setClosedInstaPay] = useState('');
  const [cashierName, setCashierName] = useState('');
  const [savedCashierNames, setSavedCashierNames] = useState<Array<{ id: string; name: string }>>([]);
  const [closedShiftReport, setClosedShiftReport] = useState<any | null>(null);
  const [showShiftReportModal, setShowShiftReportModal] = useState(false);

  // POS Discount inputs
  const [discountVal, setDiscountVal] = useState('');
  const [discountReason, setDiscountReason] = useState('');

  // Receipt print state
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [showPaymentConfirm, setShowPaymentConfirm] = useState(false);
  const [receiptOrder, setReceiptOrder] = useState<LocalSalesOrder | null>(null);

  // Mobile responsiveness tab
  const [mobileTab, setMobileTab] = useState<'menu' | 'cart'>('menu');

  // Loading & Alert status
  const [loading, setLoading] = useState(true);
  const [alertMsg, setAlertMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const triggerAlert = useCallback((type: 'success' | 'error', text: string) => {
    setAlertMsg({ type, text });
    setTimeout(() => setAlertMsg(null), 3500);
  }, []);

  // Check active shift from server (never auto-create in background)
  const ensureActiveShift = useCallback(async (): Promise<boolean> => {
    if (activeShift) return true;
    try {
      const res = await fetch('/api/shifts/active');
      if (res.ok) {
        const data = await res.json();
        if (data.activeShift) {
          setActiveShift(data.activeShift);
          return true;
        }
      }
    } catch (e) {
      console.warn('Check active shift error:', e);
    }
    return false;
  }, [activeShift, setActiveShift]);

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);

    // Check active shift from server on load without auto-opening
    fetch('/api/shifts/active')
      .then((r) => r.json())
      .then((data) => {
        if (data?.activeShift) {
          setActiveShift(data.activeShift);
        } else {
          setActiveShift(null);
        }
      })
      .catch(() => {});

    // Fetch saved cashier names
    fetch('/api/cashier-names')
      .then((r) => r.json())
      .then((data) => setSavedCashierNames(data.cashierNames || []))
      .catch(() => {});
  }, [setActiveShift]);

  // Load Cart from Dexie or auto-create direct counter cart
  const loadCart = useCallback(async () => {
    try {
      let localCart = await offlineDB.carts.get('direct_counter');
      if (!localCart) {
        localCart = {
          id: 'direct_counter',
          orderType: 'TAKEAWAY',
          tableId: null,
          tableName: 'كاشير مباشر',
          items: [],
          subtotal: 0,
          discount: 0,
          discountRate: 0,
          discountReason: null,
          tax: 0,
          total: 0,
          updatedAt: Date.now(),
        };
        await offlineDB.carts.put(localCart);
      }
      setCart(localCart);
      setDiscountReason(localCart.discountReason || '');
      setDiscountVal(localCart.discountRate && localCart.discountRate > 0 ? localCart.discountRate.toString() : '');
    } catch (e) {
      console.error('Error loading counter cart:', e);
    }
  }, []);

  useEffect(() => {
    loadCart();
  }, [loadCart]);

  // Clean up any legacy localStorage keys
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem('dn_user');
        localStorage.removeItem('dn_shift');
      } catch (e) {}
    }
  }, []);

  // Load POS initialization data (Categories, Items, Modifiers)
  const loadPOSData = useCallback(async () => {
    setLoading(true);
    try {
      let freshCategories: any[] = [];
      let freshItems: LocalItem[] = [];
      let freshModifiers: LocalModifier[] = [];
      let freshReasons: LocalDiscountReason[] = [];

      if (isOnline) {
        const res = await fetch('/api/pos-init');
        if (res.ok) {
          const data = await res.json();

          freshCategories = data.categories || [];
          freshModifiers = data.modifiers || [];
          freshReasons = data.discountReasons || [];

          // Flatten items
          data.categories.forEach((c: any) => {
            (c.items || []).forEach((i: any) => {
              freshItems.push({ id: i.id, name: i.name, price: i.price, cost: i.cost || 0, categoryId: c.id });
            });
          });

          // Sync into Dexie
          await offlineDB.categories.clear();
          await offlineDB.items.clear();
          await offlineDB.modifiers.clear();
          await offlineDB.discountReasons.clear();

          if (freshCategories.length > 0) {
            await offlineDB.categories.bulkAdd(freshCategories.map((c) => ({ id: c.id, name: c.name })));
          }
          if (freshItems.length > 0) {
            await offlineDB.items.bulkAdd(freshItems);
          }
          if (freshModifiers.length > 0) {
            await offlineDB.modifiers.bulkAdd(freshModifiers);
          }
          if (freshReasons.length > 0) {
            await offlineDB.discountReasons.bulkAdd(freshReasons);
          }

          if (typeof data.todayOrdersCount === 'number') {
            const now = new Date();
            const dateKey = [
              now.getFullYear(),
              String(now.getMonth() + 1).padStart(2, '0'),
              String(now.getDate()).padStart(2, '0'),
            ].join('');
            const counterKey = `bf_receipt_counter_${dateKey}`;
            if (data.todayOrdersCount === 0) {
              localStorage.setItem(counterKey, '0');
              try {
                await offlineDB.salesOrders.clear();
                await offlineDB.orderReturns.clear();
                await offlineDB.carts.clear();
              } catch (e) {
                console.error('Error clearing offline test orders:', e);
              }
            } else {
              const currentLocal = Number.parseInt(localStorage.getItem(counterKey) || '0', 10);
              if (data.todayOrdersCount > currentLocal) {
                localStorage.setItem(counterKey, String(data.todayOrdersCount));
              }
            }
          }
        }
      }

      // If offline or as fallback, load from Dexie
      if (freshItems.length === 0) {
        const [dbCats, dbItems, dbMods, dbReasons] = await Promise.all([
          offlineDB.categories.toArray(),
          offlineDB.items.toArray(),
          offlineDB.modifiers.toArray(),
          offlineDB.discountReasons.toArray(),
        ]);
        freshCategories = dbCats;
        freshItems = dbItems;
        freshModifiers = dbMods;
        freshReasons = dbReasons;
      }

      const orderedCategories = [...freshCategories].sort((a, b) => a.name.localeCompare(b.name, 'ar'));

      setCategories(orderedCategories);
      setItems(freshItems);
      setModifiers(freshModifiers);
      setDiscountReasons(freshReasons);
    } catch (error) {
      console.error('Error loading POS data:', error);
      triggerAlert('error', 'حصلت مشكلة في تحميل الأصناف، جرب تدوس على زرار التحديث.');
    } finally {
      setLoading(false);
    }
  }, [isOnline, triggerAlert]);

  useEffect(() => {
    loadPOSData();
  }, [loadPOSData]);

  // Refresh shift figures whenever close shift dialog opens
  useEffect(() => {
    if (showCloseShift && isOnline) {
      fetch('/api/shifts/active')
        .then((r) => r.json())
        .then((d) => {
          if (d.activeShift) setActiveShift(d.activeShift);
        })
        .catch(() => {});
    }
  }, [showCloseShift, isOnline, setActiveShift]);

  const handleAutoFillExpected = () => {
    if (!activeShift) return;
    setClosedCash(String((activeShift.expectedCash || 0).toFixed(2)));
    setClosedInstaPay(String((activeShift.expectedInstaPay || 0).toFixed(2)));
  };

  // Save and Recalculate Cart
  const saveAndRecalculateCart = async (
    updatedItems: LocalCartItem[],
    customDiscountRate: number | null = null,
    extraFields?: Partial<LocalCart>
  ) => {
    const baseCart = cart || {
      id: 'direct_counter',
      orderType: 'TAKEAWAY',
      tableId: null,
      tableName: 'كاشير مباشر',
      items: [],
      subtotal: 0,
      discount: 0,
      discountRate: 0,
      discountReason: null,
      tax: 0,
      total: 0,
      updatedAt: Date.now(),
    };

    const subtotal = updatedItems.reduce((acc, item) => acc + (item.totalPrice || 0), 0);
    const rate = customDiscountRate !== null ? customDiscountRate : (baseCart.discountRate || 0);
    const disc = Math.round((subtotal * (rate / 100)) * 100) / 100;
    const total = Math.max(0, subtotal - disc);

    const updatedCart: LocalCart = {
      ...baseCart,
      items: updatedItems,
      subtotal,
      discount: disc,
      discountRate: rate,
      tax: 0,
      total,
      updatedAt: Date.now(),
      ...extraFields,
    };

    setCart(updatedCart);
    await offlineDB.carts.put(updatedCart);
  };

  // Add Item Directly to Cart (bulletproof, auto-resolves cart and shift)
  const addItemToCartDirectly = async (
    item: LocalItem,
    selectedModList: LocalModifier[] = [],
    customUnitPrice?: number,
    comment = '',
    qty = 1,
    unit = 'كيلو',
    costPrice = 0,
    targetCartItemId?: string
  ) => {
    try {
      let currentCart = cart;
      if (!currentCart) {
        currentCart = (await offlineDB.carts.get('direct_counter')) || {
          id: 'direct_counter',
          orderType: 'TAKEAWAY',
          tableId: null,
          tableName: 'كاشير مباشر',
          items: [],
          subtotal: 0,
          discount: 0,
          discountRate: 0,
          discountReason: null,
          tax: 0,
          total: 0,
          updatedAt: Date.now(),
        };
      }

      const modPriceImpact = (selectedModList || []).reduce((acc, m) => acc + (m.priceImpact || 0), 0);
      const unitPrice = customUnitPrice ?? (item.price + modPriceImpact);

      const cartItems: LocalCartItem[] = Array.isArray(currentCart.items) ? [...currentCart.items] : [];

      if (targetCartItemId) {
        // In-place edit of an existing cart item
        const editIdx = cartItems.findIndex((ci) => ci.id === targetCartItemId);
        if (editIdx > -1) {
          cartItems[editIdx] = {
            ...cartItems[editIdx],
            qty,
            unit,
            costPrice,
            unitPrice,
            totalPrice: Math.round(qty * unitPrice * 100) / 100,
            comment: comment || null,
          };
        }
      } else {
        // Normal add or merge if same item & same price & same unit
        const existingIndex = cartItems.findIndex(
          (ci) =>
            ci.itemId === item.id &&
            ci.unitPrice === unitPrice &&
            (ci.unit || 'كيلو') === unit &&
            (ci.comment || '') === comment &&
            (ci.modifiers || []).length === (selectedModList || []).length &&
            (ci.modifiers || []).every((cm) => (selectedModList || []).some((sm) => sm.id === cm.modifierId))
        );

        if (existingIndex > -1) {
          const existing = cartItems[existingIndex];
          const newQty = Math.round(((existing.qty || 1) + qty) * 1000) / 1000;
          cartItems[existingIndex] = {
            ...existing,
            qty: newQty,
            unit,
            totalPrice: Math.round(newQty * unitPrice * 100) / 100,
          };
        } else {
          const newItem: LocalCartItem = {
            id: generateUUID(),
            itemId: item.id,
            name: item.name,
            qty,
            unit,
            costPrice,
            unitPrice,
            totalPrice: Math.round(qty * unitPrice * 100) / 100,
            comment: comment || null,
            modifiers: (selectedModList || []).map((m) => ({
              modifierId: m.id,
              name: m.name,
              unitPriceImpact: m.priceImpact,
            })),
          };
          cartItems.push(newItem);
        }
      }

      const subtotal = cartItems.reduce((acc, it) => acc + (it.totalPrice || 0), 0);
      const rate = currentCart.discountRate || 0;
      const disc = Math.round((subtotal * (rate / 100)) * 100) / 100;
      const total = Math.max(0, subtotal - disc);

      const updatedCart: LocalCart = {
        ...currentCart,
        items: cartItems,
        subtotal,
        discount: disc,
        discountRate: rate,
        tax: 0,
        total,
        updatedAt: Date.now(),
      };

      // State and storage update
      setCart(updatedCart);
      await offlineDB.carts.put(updatedCart);

      triggerAlert('success', `تمام يا باشا، نزلنا ${qty} ${unit} من "${item.name}" في الفاتورة`);
    } catch (err: any) {
      console.error('Failed to add item to cart:', err);
      triggerAlert('error', 'حصلت مشكلة ومعرفناش ننزل الصنف، جرب تاني');
    }
  };

  // Produce modal opener (detects unit, loads warehouse cost/price/margin from admin, sets save true by default)
  const openProduceModal = (item: LocalItem, existingCartItem?: LocalCartItem) => {
    // Always use latest item data from items list if available
    const freshItem = items.find((i) => i.id === item.id) || item;
    setSelectedProduceItem(freshItem);
    setEditingCartItemId(existingCartItem ? existingCartItem.id : null);

    const price = existingCartItem ? existingCartItem.unitPrice : freshItem.price;
    const rawCost = existingCartItem?.costPrice !== undefined && existingCartItem.costPrice > 0
      ? existingCartItem.costPrice
      : (freshItem.cost && freshItem.cost > 0 ? freshItem.cost : (price ? Math.round((price / 1.25) * 2) / 2 : 0));

    setProducePrice(price ? price.toString() : '');
    setProduceCost(rawCost > 0 ? rawCost.toString() : '');

    if (rawCost > 0 && price > 0) {
      const margin = ((price - rawCost) / rawCost) * 100;
      setProduceMargin(margin.toFixed(1));
    } else {
      setProduceMargin('25.0');
    }

    let calculatedUnit: 'كيلو' | 'حزمة' | 'قطعة' = 'كيلو';
    if (existingCartItem?.unit) {
      calculatedUnit = existingCartItem.unit as any;
    } else {
      const name = freshItem.name.toLowerCase();
      if (['بقدونس', 'شبت', 'كزبرة', 'جرجير', 'نعناع', 'خضرة', 'سلق', 'كرفس', 'روكا', 'ورقيات', 'فجل', 'كرات'].some((k) => name.includes(k))) {
        calculatedUnit = 'حزمة';
      } else if (['اناناس', 'أناناس', 'كابوتشا', 'كابوتشى', 'كرنب', 'بروكلي', 'بطيخ', 'شمام', 'كنتالوب', 'قرنبيط', 'خس'].some((k) => name.includes(k))) {
        calculatedUnit = 'قطعة';
      } else {
        calculatedUnit = 'كيلو';
      }
    }
    setProduceUnit(calculatedUnit);

    if (!existingCartItem && calculatedUnit === 'كيلو' && scale.isConnected && scale.currentWeight > 0) {
      setProduceQty(scale.currentWeight.toFixed(3));
    } else {
      setProduceQty(existingCartItem ? existingCartItem.qty.toString() : '1');
    }
    setSavePricePermanently(true);
    setShowProduceModal(true);
  };

  // 3-Way Auto-Calculator Handlers
  const handleProduceCostChange = (val: string) => {
    setProduceCost(val);
    const cost = parseFloat(val);
    const margin = parseFloat(produceMargin);
    const price = parseFloat(producePrice);

    if (!isNaN(cost) && cost > 0) {
      if (!isNaN(margin)) {
        // Price = Cost * (1 + Margin / 100)
        const calcPrice = cost * (1 + margin / 100);
        setProducePrice((Math.round(calcPrice * 100) / 100).toString());
      } else if (!isNaN(price) && price >= 0) {
        // Margin = ((Price - Cost) / Cost) * 100
        const calcMargin = ((price - cost) / cost) * 100;
        setProduceMargin(calcMargin.toFixed(1));
      }
    }
  };

  const handleProducePriceChange = (val: string) => {
    setProducePrice(val);
    const price = parseFloat(val);
    const cost = parseFloat(produceCost);
    const margin = parseFloat(produceMargin);

    if (!isNaN(price) && price >= 0) {
      if (!isNaN(cost) && cost > 0) {
        // Margin = ((Price - Cost) / Cost) * 100
        const calcMargin = ((price - cost) / cost) * 100;
        setProduceMargin(calcMargin.toFixed(1));
      } else if (!isNaN(margin) && margin > -100) {
        // Cost = Price / (1 + Margin / 100)
        const calcCost = price / (1 + margin / 100);
        setProduceCost((Math.round(calcCost * 100) / 100).toString());
      }
    }
  };

  const handleProduceMarginChange = (val: string) => {
    setProduceMargin(val);
    const margin = parseFloat(val);
    const cost = parseFloat(produceCost);
    const price = parseFloat(producePrice);

    if (!isNaN(margin)) {
      if (!isNaN(cost) && cost > 0) {
        // Price = Cost * (1 + Margin / 100)
        const calcPrice = cost * (1 + margin / 100);
        setProducePrice((Math.round(calcPrice * 100) / 100).toString());
      } else if (!isNaN(price) && price >= 0 && margin > -100) {
        // Cost = Price / (1 + Margin / 100)
        const calcCost = price / (1 + margin / 100);
        setProduceCost((Math.round(calcCost * 100) / 100).toString());
      }
    }
  };

  const handleConfirmProduceItem = async () => {
    if (!selectedProduceItem) return;

    const priceNum = parseFloat(producePrice);
    if (!Number.isFinite(priceNum) || priceNum < 0) {
      triggerAlert('error', 'من فضلك اكتب سعر بيع صحيح.');
      return;
    }

    const qtyNum = parseFloat(produceQty);
    if (!Number.isFinite(qtyNum) || qtyNum <= 0) {
      triggerAlert('error', 'من فضلك حدد كمية أو وزن صحيح أكبر من الصفر.');
      return;
    }

    const costNum = parseFloat(produceCost) || 0;

    // Permanent price update in DB & Dexie
    if (savePricePermanently) {
      try {
        await offlineDB.items.update(selectedProduceItem.id, {
          price: priceNum,
          cost: costNum,
        });

        setItems((prev) =>
          prev.map((it) =>
            it.id === selectedProduceItem.id ? { ...it, price: priceNum, cost: costNum } : it
          )
        );

        if (isOnline) {
          fetch('/api/items', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: selectedProduceItem.id,
              price: priceNum,
              cost: costNum,
            }),
          }).catch((e) => console.warn('Failed to patch item price:', e));
        }

        triggerAlert('success', `تم تحديث سعر "${selectedProduceItem.name}" في السيستم بنجاح`);
      } catch (err) {
        console.error('Error saving permanent price:', err);
      }
    }

    await addItemToCartDirectly(
      selectedProduceItem,
      [],
      priceNum,
      '',
      qtyNum,
      produceUnit,
      costNum,
      editingCartItemId || undefined
    );

    setShowProduceModal(false);
    setSelectedProduceItem(null);
    setEditingCartItemId(null);
  };

  const handleEditCartItem = (cartItem: LocalCartItem) => {
    const originalItem = items.find((i) => i.id === cartItem.itemId) || {
      id: cartItem.itemId,
      name: cartItem.name,
      price: cartItem.unitPrice,
      cost: cartItem.costPrice || 0,
      categoryId: '',
    };
    openProduceModal(originalItem, cartItem);
  };

  // Add Item to Cart click handler: opens the Produce pricing, unit & weight modal
  const handleItemClick = async (item: LocalItem) => {
    await ensureActiveShift();
    if (!activeShift) {
      triggerAlert('error', 'يجب فتح شفت أولاً لبدء البيع وتسجيل الحسابات');
      setShowOpenShift(true);
      return;
    }
    openProduceModal(item);
  };

  // Open modifiers modal if needed
  const handleOpenModifiers = (e: React.MouseEvent, item: LocalItem) => {
    e.stopPropagation();
    setActiveItemForMod(item);
    setSelectedMods([]);
    setItemComment('');
    setShowModifiersModal(true);
  };

  const confirmModifiers = () => {
    if (!activeItemForMod) return;
    const selectedModObjects = modifiers.filter((m) => selectedMods.includes(m.id));
    addItemToCartDirectly(activeItemForMod, selectedModObjects, undefined, itemComment.trim());
    setShowModifiersModal(false);
    setActiveItemForMod(null);
    setItemComment('');
  };

  const handleUpdateQty = async (cartItemId: string, delta: number) => {
    if (!cart) return;
    const cartItems = Array.isArray(cart.items) ? [...cart.items] : [];
    const updatedItems = cartItems.map((item) => {
      if (item.id === cartItemId) {
        const step = item.unit === 'كيلو' && Math.abs(delta) === 1 ? (delta > 0 ? 0.25 : -0.25) : delta;
        const newQty = Math.max(0.05, Math.round(((item.qty || 1) + step) * 1000) / 1000);
        return {
          ...item,
          qty: newQty,
          totalPrice: Math.round(newQty * item.unitPrice * 100) / 100,
        };
      }
      return item;
    });
    await saveAndRecalculateCart(updatedItems);
  };

  const handleRemoveItem = async (cartItemId: string) => {
    if (!cart) return;
    const cartItems = Array.isArray(cart.items) ? [...cart.items] : [];
    const updatedItems = cartItems.filter((item) => item.id !== cartItemId);
    await saveAndRecalculateCart(updatedItems);
  };

  const handleClearCart = async () => {
    await saveAndRecalculateCart([], 0, {
      customerId: null,
      customerName: null,
      discountReason: null,
    });
    setDiscountVal('');
    setDiscountReason('');
    triggerAlert('success', 'فضينا الفاتورة وخلاص جاهزة للزبون اللي جاي');
  };

  // Discount Handlers (Free entry + Reason mandatory)
  const handleDiscountChange = (value: string) => {
    setDiscountVal(value);
    if (!cart) return;

    const enteredDiscount = value === '' ? 0 : Number(value);
    if (!Number.isFinite(enteredDiscount) || enteredDiscount < 0) return;

    const discount = Math.min(enteredDiscount, 100);
    if (discount !== enteredDiscount) setDiscountVal(String(discount));
    void saveAndRecalculateCart(cart.items, discount, { discountReason });
  };

  const handleDiscountReasonChange = (value: string) => {
    setDiscountReason(value);
    if (!cart) return;
    void saveAndRecalculateCart(cart.items, null, { discountReason: value });
  };

  // Complete / Place Order
  const handleCompleteOrder = async () => {
    if (!cart || !Array.isArray(cart.items) || cart.items.length === 0) {
      triggerAlert('error', 'الفاتورة لسه فاضية! نزل خضار أو فاكهة الأول عشان تحاسب الزبون.');
      return;
    }

    await ensureActiveShift();
    if (!activeShift) {
      triggerAlert('error', 'لازم تفتح شفت الأول عشان تبدأ تبيع يا برنس.');
      setShowOpenShift(true);
      return;
    }

    // Mandatory reason for discount
    if (cart.discount > 0 && !discountReason.trim()) {
      triggerAlert('error', 'يا باشا لازم تكتب سبب الخصم الأول عشان ينزل في وصل الزبون.');
      return;
    }

    try {
      const orderId = generateUUID();
      const receiptNumber = generateReceiptNumber();

      const newOrder: LocalSalesOrder = {
        id: orderId,
        receiptNumber,
        orderType: 'TAKEAWAY',
        tableId: null,
        customerId: null,
        customerName: null,
        shiftId: activeShift.id,
        items: cart.items.map((i) => ({
          id: i.id || generateUUID(),
          itemId: i.itemId,
          qty: i.qty,
          unit: i.unit || 'كيلو',
          unitPrice: i.unitPrice,
          totalPrice: i.totalPrice,
          modifiers: (i.modifiers || []).map((m) => ({
            modifierId: m.modifierId,
            unitPriceImpact: m.unitPriceImpact,
          })),
          comment: i.comment || null,
        })),
        subtotal: cart.subtotal,
        discount: cart.discount,
        discountReason: discountReason.trim() || null,
        tax: 0,
        total: cart.total,
        paymentMethod,
        status: 'COMPLETED',
        syncStatus: 'PENDING',
        createdAt: new Date().toISOString(),
      };

      // 1. Save locally in Dexie
      await offlineDB.salesOrders.put(newOrder);

      // 2. Local shift statistics updates
      if (activeShift) {
        const updatedExpected = { ...activeShift };
        const orderNet = newOrder.total;
        if (paymentMethod === 'CASH') {
          updatedExpected.expectedCash = (updatedExpected.expectedCash || 0) + orderNet;
        } else if (paymentMethod === 'INSTAPAY') {
          updatedExpected.expectedInstaPay = (updatedExpected.expectedInstaPay || 0) + orderNet;
        }
        setActiveShift(updatedExpected);
      }

      // 3. If online, sync to server immediately
      if (isOnline) {
        fetch('/api/sales-orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newOrder),
        })
          .then((res) => {
            if (res.ok) {
              offlineDB.salesOrders.update(orderId, { syncStatus: 'SYNCED' });
            } else {
              triggerSync();
            }
          })
          .catch((err) => {
            console.warn('Direct order sync failed, falling back to batch sync:', err);
            triggerSync();
          });
      }

      // 3. Clear active cart
      await offlineDB.carts.delete(cart.id);
      setCart({
        ...cart,
        items: [],
        subtotal: 0,
        discount: 0,
        discountRate: 0,
        tax: 0,
        total: 0,
        customerId: null,
        customerName: null,
        discountReason: null,
      });
      setDiscountVal('');
      setDiscountReason('');

      // 4. Trigger print with Banana Food B&W receipt directly without blocking modal
      setReceiptOrder(newOrder);
      setTimeout(() => {
        window.print();
      }, 150);

      triggerAlert('success', `تمام يا فنان! قفلنا الحساب وجاري طباعة وصل ${receiptNumber}`);
      triggerSync();
    } catch (e) {
      console.error('Failed to complete order:', e);
      triggerAlert('error', 'حصلت مشكلة ومعرفناش نحفظ الفاتورة، جرب تاني.');
    }
  };

  // Returns / Refund Handler
  const openReturnModal = async () => {
    setShowReturnModal(true);
    setSelectedReturnOrder(null);
    try {
      const res = await fetch('/api/sales-orders?take=20');
      if (res.ok) {
        const data = await res.json();
        setRecentCompletedOrders(data.orders || []);
      }
    } catch (e) {
      console.error('Failed to load recent orders for returns:', e);
    }
  };

  const handleProcessReturn = async () => {
    if (!selectedReturnOrder || !activeShift) return;
    setSubmittingReturn(true);
    try {
      const res = await fetch('/api/returns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: selectedReturnOrder.id,
          receiptNumber: selectedReturnOrder.receiptNumber,
          shiftId: activeShift.id,
          refundAmount: selectedReturnOrder.total,
          paymentMethod: 'CASH',
          reason: returnReason.trim(),
          cashierName: activeShift.cashierName || cleanUserName,
          restockItems: returnRestock,
          items: selectedReturnOrder.items.map((oi: any) => ({
            itemId: oi.itemId,
            quantity: oi.qty,
            refundPrice: oi.totalPrice,
          })),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشلت عملية الترجيع');

      // 1. Immediately deduct refunded cash from drawer in POS state
      if (activeShift) {
        const refAmt = Number(selectedReturnOrder.total || 0);
        const updatedShift = {
          ...activeShift,
          expectedCash: Math.max(0, (activeShift.expectedCash || 0) - refAmt),
        };
        setActiveShift(updatedShift);
      }

      // 2. Refetch active shift from server for full synchronization
      fetch('/api/shifts/active')
        .then((r) => r.json())
        .then((d) => {
          if (d?.activeShift) setActiveShift(d.activeShift);
        })
        .catch((err) => console.warn('Sync active shift after return failed:', err));

      triggerAlert('success', `تمام يا فنان، رجعنا الفاتورة ${selectedReturnOrder.receiptNumber} والفلوس للزبون!`);
      setShowReturnModal(false);
      setSelectedReturnOrder(null);
    } catch (err: any) {
      triggerAlert('error', err.message || 'حصلت مشكلة أثناء الترجيع');
    } finally {
      setSubmittingReturn(false);
    }
  };

  // Open shift submit
  const handleOpenShiftSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalCashierName = cashierName.trim() || cleanUserName;

    try {
      const res = await fetch('/api/shifts/active', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user?.id,
          cashierName: finalCashierName,
          floatCash: parseFloat(floatCash) || 0,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشل فتح الشفت');

      setActiveShift(data.shift);
      setShowOpenShift(false);
      triggerAlert('success', `تم فتح الوردية بنجاح للكاشير ${finalCashierName}`);
    } catch (err: any) {
      triggerAlert('error', err.message || 'حصلت مشكلة في فتح الشفت');
    }
  };

  // Close shift submit (Cash + InstaPay only)
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
          closedVisa: 0,
          closedVodafoneCash: 0,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشل تقفيل الشفت');

      setActiveShift(null);
      setShowCloseShift(false);
      setClosedCash('');
      setClosedInstaPay('');

      // Open closed shift summary modal so cashier and admin see exact variance
      if (data.shift) {
        setClosedShiftReport(data.shift);
        setShowShiftReportModal(true);
      }

      triggerAlert('success', 'تم تقفيل الشفت واليومية بنجاح وحفظ الحسابات');
    } catch (err: any) {
      triggerAlert('error', err.message || 'حصلت مشكلة أثناء تقفيل الشفت');
    }
  };

  // Arabic text normalization for search
  const normalizeArabic = (text: string) => {
    return (text || '')
      .trim()
      .toLowerCase()
      .replace(/[\u064B-\u065F\u0670]/g, '') // remove tashkeel/diacritics
      .replace(/[أإآ]/g, 'ا')
      .replace(/ة/g, 'ه')
      .replace(/ى/g, 'ي');
  };

  const matchArabicSearch = (name: string, query: string): { matches: boolean; score: number } => {
    const q = normalizeArabic(query);
    if (!q) return { matches: true, score: 0 };

    const normName = normalizeArabic(name);
    if (!normName) return { matches: false, score: 0 };

    const nameWithoutAl = normName.startsWith('ال') ? normName.slice(2) : normName;

    // 1. Direct item prefix match (e.g. "ف" matches "فلفل", "فراولة", "الفلفل")
    if (normName.startsWith(q) || nameWithoutAl.startsWith(q)) {
      return { matches: true, score: 3 };
    }

    // 2. Word-start prefix match (e.g. "رومي" matches "فلفل رومي")
    // If query has 2+ characters, allow matching words that start with query
    if (q.length >= 2) {
      const words = normName.split(/\s+/).filter(Boolean);
      const matchesWordStart = words.some((word) => {
        const wordWithoutAl = word.startsWith('ال') ? word.slice(2) : word;
        return word.startsWith(q) || wordWithoutAl.startsWith(q);
      });

      if (matchesWordStart) {
        return { matches: true, score: 2 };
      }
    }

    return { matches: false, score: 0 };
  };

  // Filter items by category & prefix search query
  const filteredItems = useMemo(() => {
    const trimmed = itemSearchQuery.trim();
    return items
      .filter((item) => {
        const matchesCategory = !selectedCategoryId || item.categoryId === selectedCategoryId;
        if (!matchesCategory) return false;
        if (!trimmed) return true;
        return matchArabicSearch(item.name, trimmed).matches;
      })
      .sort((a, b) => {
        if (!trimmed) return 0;
        const scoreA = matchArabicSearch(a.name, trimmed).score;
        const scoreB = matchArabicSearch(b.name, trimmed).score;
        return scoreB - scoreA;
      });
  }, [items, selectedCategoryId, itemSearchQuery]);

  // Printable receipt helpers
  const getPaymentMethodArabic = (method: string) => {
    switch (method) {
      case 'INSTAPAY': return 'تحويل إنستا باي';
      case 'CASH':
      case 'CASH':
      default: return 'كاش نقدي';
    }
  };

  // Category helper
  const getCategoryEmoji = (_catName: string) => {
    return '';
  };

  // Banana Food Thermal Customer Receipt
  const ReceiptLayout = ({ preview = false }: { preview?: boolean }) => {
    if (!receiptOrder) return null;

    return (
      <div className={`receipt-layout ${preview ? 'receipt-preview' : ''}`} dir="rtl">
        {/* Brand Header with high-contrast B&W Thermal Logo */}
        <div className="receipt-brand">
          <img 
            src="/banana-logo-bw.png" 
            alt="بانانا فود" 
            className="receipt-logo" 
          />
          <div className="receipt-title mt-1 font-black text-sm">بانانا فود - Banana Food</div>
          <div className="text-[10px] font-bold text-gray-800">محل خضار وفاكهة - بانانا فود</div>
          <div className="text-[10px] font-bold text-gray-800">خدمة التوصيل والدليفري: 01224991397</div>
        </div>

        {/* Invoice Meta Grid */}
        <div className="receipt-meta-grid">
          <div className="receipt-meta-wide">
            <span>رقم الوصل</span>
            <strong className="receipt-number">{receiptOrder.receiptNumber}</strong>
          </div>
          <div className="receipt-meta-cell">
            <span>التاريخ</span>
            <strong>{new Date(receiptOrder.createdAt).toLocaleDateString('ar-EG')}</strong>
          </div>
          <div className="receipt-meta-cell">
            <span>الساعة</span>
            <strong>{new Date(receiptOrder.createdAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}</strong>
          </div>
          <div className="receipt-meta-cell">
            <span>الكاشير</span>
            <strong>{activeShift?.cashierName || cleanUserName}</strong>
          </div>
          <div className="receipt-meta-cell">
            <span>طريقة الدفع</span>
            <strong>{getPaymentMethodArabic(receiptOrder.paymentMethod)}</strong>
          </div>
        </div>

        {/* Items Table */}
        <table className="receipt-items-table">
          <colgroup>
            <col className="receipt-item-name" />
            <col className="receipt-item-price" />
            <col className="receipt-item-qty" />
            <col className="receipt-item-total" />
          </colgroup>
          <thead>
            <tr>
              <th>الصنف</th>
              <th>السعر</th>
              <th>الكمية</th>
              <th>المجموع</th>
            </tr>
          </thead>
          <tbody>
            {receiptOrder.items.map((item, idx) => {
              const itDetails = items.find((i) => i.id === item.itemId);
              const unitStr = (item as any).unit ? ` ${(item as any).unit}` : '';
              return (
                <tr key={idx}>
                  <td>
                    {itDetails?.name || item.itemId || 'صنف'}
                    {item.comment && <span className="receipt-addition">ملاحظة: {item.comment}</span>}
                  </td>
                  <td>{item.unitPrice.toFixed(2)}</td>
                  <td className="receipt-qty-cell" dir="rtl">
                    <span className="receipt-qty-content" dir="rtl">
                      <span>{item.qty}</span>
                      {(item as any).unit ? <span>{(item as any).unit}</span> : null}
                    </span>
                  </td>
                  <td>{item.totalPrice.toFixed(2)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Totals Table with Discount & Mandatory Reason Display */}
        <table className="receipt-totals-table">
          <tbody>
            <tr>
              <th>إجمالي الفاتورة:</th>
              <td>{receiptOrder.subtotal.toFixed(2)} جنيه</td>
            </tr>
            {receiptOrder.discount > 0 && (
              <>
                <tr className="receipt-discount">
                  <th>الخصم:</th>
                  <td>-{receiptOrder.discount.toFixed(2)} جنيه</td>
                </tr>
                {receiptOrder.discountReason && (
                  <tr className="receipt-discount-reason-row">
                    <th>سبب الخصم:</th>
                    <td className="font-bold">{receiptOrder.discountReason}</td>
                  </tr>
                )}
              </>
            )}
            <tr className="receipt-final-total">
              <th>المطلوب من الزبون:</th>
              <td>{receiptOrder.total.toFixed(2)} جنيه</td>
            </tr>
          </tbody>
        </table>

        {/* Receipt Footer */}
        <div className="receipt-footer">
          <div>طلبات وتوصيل دليفري: 01224991397</div>
          <div className="mt-0.5">نورتونا في بانانا فود وبالف هنا وشفا دايماً</div>
        </div>
      </div>
    );
  };

  if (!mounted) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-[#090d16] text-gray-200 text-right" dir="rtl">
        <RefreshCw className="w-8 h-8 animate-spin text-emerald-500" />
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col h-screen bg-[#090d16] text-gray-200 text-right no-print select-none" dir="rtl">
        {/* 1. Header Navigation Bar */}
        <header className="h-16 shrink-0 bg-[#0c1424] border-b border-white/5 px-4 sm:px-6 flex items-center justify-between z-10 no-print">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl overflow-hidden relative border border-emerald-500/30 shrink-0 bg-white shadow-md p-0.5">
              <img src="/banana-logo.jpg" alt="Banana Food" className="w-full h-full object-contain" />
            </div>
            <div className="hidden sm:block text-right">
              <h1 className="text-base font-black text-white leading-tight flex items-center gap-1.5">
                <span className="text-emerald-400">بانانا فود</span>
                <span className="text-xs text-gray-400 font-semibold">- Banana Food</span>
              </h1>
              <span className="text-[11px] text-gray-400 font-medium block">كاشير ومبيعات الخضار والفاكهة</span>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-4 flex-row-reverse overflow-x-auto py-1">
            {/* Online/Offline status */}
            <div className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] sm:text-xs font-semibold shrink-0 ${
              isOnline ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
            }`}>
              {isOnline ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">{isOnline ? 'متصل بالنت أونلاين' : 'شغال محلي ع الجهاز (أوفلاين)'}</span>
            </div>

            {/* Scale Status & Live Weight Indicator */}
            <div className="flex items-center gap-1.5 shrink-0">
              {scale.isConnected ? (
                <button
                  type="button"
                  onClick={() => setShowScaleModal(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 font-mono font-bold text-xs transition-all shadow-sm cursor-pointer"
                  title="الميزان الإلكتروني متصل - اضغط لفتح الإعدادات والتشخيص"
                >
                  <span className="relative flex h-2 w-2">
                    {scale.isStable && (
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    )}
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                  <Scale className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-[10px] text-emerald-400/80 font-sans">الميزان:</span>
                  <span className="text-white text-sm font-black tracking-wider">{scale.currentWeight.toFixed(3)}</span>
                  <span className="text-[10px] text-emerald-300">كجم</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowScaleModal(true)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white text-xs font-semibold transition-all cursor-pointer"
                  title="اضغط لربط ميزان الخضار والفاكهة RS232"
                >
                  <Scale className="w-3.5 h-3.5 text-amber-400" />
                  <span>ربط الميزان</span>
                </button>
              )}
            </div>

            {/* Returns Modal Button */}
            <button
              onClick={openReturnModal}
              className="px-2.5 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-[10px] sm:text-xs font-semibold text-rose-400 border border-rose-500/20 transition-all shrink-0 flex items-center gap-1 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>مرتجع وصل / ترجيع</span>
            </button>

            {/* Admin link */}
            {user?.role === 'ADMIN' && (
              <button 
                onClick={() => router.push('/admin')}
                className="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-[10px] sm:text-xs font-semibold border border-white/5 transition-all text-white shrink-0 cursor-pointer"
              >
                لوحة تحكم المدير
              </button>
            )}

            {activeShift ? (
              <div className="flex items-center gap-2 shrink-0">
                {/* Cash and InstaPay drawer indicators */}
                <div className="flex items-center gap-1.5 bg-slate-900/90 border border-white/10 rounded-xl p-1 text-xs shadow-inner shrink-0">
                  <div className="flex items-center gap-1 text-emerald-400 font-bold bg-emerald-500/10 px-2.5 py-1 rounded-lg border border-emerald-500/20" title="الكاش المتوقع في الدرج">
                    <span className="text-[10px] text-emerald-300/80 font-normal">كاش الدرج:</span>
                    <span className="font-mono font-bold">{(activeShift.expectedCash || 0).toFixed(0)} ج</span>
                  </div>
                  <div className="flex items-center gap-1 text-purple-400 font-bold bg-purple-500/10 px-2 py-1 rounded-lg border border-purple-500/20" title="إنستا باي">
                    <span className="text-[10px] text-purple-300/80 font-normal">إنستا باي:</span>
                    <span className="font-mono font-bold">{(activeShift.expectedInstaPay || 0).toFixed(0)} ج</span>
                  </div>
                </div>

                <button 
                  onClick={() => setShowCloseShift(true)}
                  className="px-2.5 py-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-[10px] sm:text-xs font-semibold text-rose-300 border border-rose-500/20 transition-all shrink-0 flex items-center gap-1 cursor-pointer"
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>تقفيل الشفت واليومية</span>
                </button>
              </div>
            ) : (
              <button 
                onClick={() => setShowOpenShift(true)}
                className="px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-xs font-bold text-white shadow-lg transition-all animate-pulse cursor-pointer"
              >
                افتح شفت جديد
              </button>
            )}

            <button 
              onClick={() => { logout(); router.push('/'); }}
              className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-all border border-white/5 cursor-pointer"
              title="اخرج من السيستم"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* 2. Main POS Workspace: Left is Fruit & Veg Menu, Right is Cart */}
        <main className="flex-1 flex flex-col lg:flex-row overflow-hidden no-print">
          {/* Menu Items Section (Takes full width, no tables) */}
          <section className={`flex-1 flex flex-col p-4 overflow-hidden gap-3 ${mobileTab === 'menu' ? 'flex' : 'hidden lg:flex'}`}>
            <div className="flex-1 glass-panel rounded-2xl p-4 flex flex-col gap-3.5 overflow-hidden">
              {/* Category selector & Search bar */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 border-b border-white/5 pb-3 shrink-0">
                <div className="flex gap-2 overflow-x-auto pb-1 pl-1 flex-1">
                  <button
                    onClick={() => setSelectedCategoryId(null)}
                    className={`px-4 py-2 rounded-xl text-xs font-bold border whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer ${
                      selectedCategoryId === null ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-sm' : 'bg-white/5 text-gray-400 border-transparent hover:bg-white/10'
                    }`}
                  >
                    <span>كل الخضار والفاكهة</span>
                    <span className="text-[10px] opacity-75 font-mono">({items.length})</span>
                  </button>
                  {categories.map((cat) => {
                    const count = items.filter((i) => i.categoryId === cat.id).length;
                    return (
                      <button
                        key={cat.id}
                        onClick={() => setSelectedCategoryId(cat.id)}
                        className={`px-4 py-2 rounded-xl text-xs font-bold border whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer ${
                          selectedCategoryId === cat.id ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-sm' : 'bg-white/5 text-gray-400 border-transparent hover:bg-white/10'
                        }`}
                      >
                        <span>{cat.name}</span>
                        <span className="text-[10px] opacity-75 font-mono">({count})</span>
                      </button>
                    );
                  })}
                </div>

                {/* Quick Search & Reload */}
                <div className="flex items-center gap-2 shrink-0">
                  <div className="relative w-full sm:w-60">
                    <Search className="w-4 h-4 text-gray-400 absolute right-3 top-2.5" />
                    <input
                      type="text"
                      value={itemSearchQuery}
                      onChange={(e) => setItemSearchQuery(e.target.value)}
                      placeholder="دور على أي خضار أو فاكهة..."
                      className="w-full bg-slate-900/80 border border-white/10 rounded-xl pr-9 pl-3 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500 text-right transition-colors"
                    />
                    {itemSearchQuery && (
                      <button 
                        onClick={() => setItemSearchQuery('')}
                        className="absolute left-2.5 top-2 text-gray-400 hover:text-white text-xs cursor-pointer"
                      >
                        ✕
                      </button>
                    )}
                  </div>

                  <button
                    onClick={() => { loadPOSData(); triggerAlert('success', 'تمام يا معلم، حدثنا الأسعار والأصناف كلها'); }}
                    className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-emerald-400 border border-white/5 transition-all cursor-pointer"
                    title="تحديث الأسعار والأصناف"
                  >
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-emerald-400' : ''}`} />
                  </button>
                </div>
              </div>

              {/* Items Grid */}
              <div className="flex-1 overflow-y-auto pl-1">
                {filteredItems.length > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
                    {filteredItems.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleItemClick(item)}
                        className="glass-panel-hover flex flex-col justify-between p-3.5 rounded-2xl text-right bg-slate-900/60 border border-white/10 h-[108px] cursor-pointer hover:border-emerald-500/50 hover:bg-emerald-950/25 active:scale-95 transition-all group relative overflow-hidden"
                      >
                        <div className="w-full">
                          <span className="font-bold text-xs sm:text-sm text-white line-clamp-2 leading-snug group-hover:text-yellow-300 transition-colors">
                            {item.name}
                          </span>
                        </div>
                        <div className="flex items-center justify-between w-full mt-2 flex-row-reverse border-t border-white/5 pt-1.5">
                          <span className="text-emerald-400 font-black text-sm font-mono tracking-tight">
                            {item.price.toFixed(2)} <span className="text-[10px] font-normal text-gray-300">جنيه</span>
                          </span>
                          <div className="w-7 h-7 rounded-xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center group-hover:bg-emerald-500 group-hover:text-black transition-all shadow-sm">
                            <Plus className="w-4 h-4 stroke-[2.5]" />
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-center text-gray-500 gap-2.5 py-12">
                    <ShoppingBag className="w-12 h-12 stroke-1 opacity-30 text-emerald-400" />
                    <p className="text-xs font-semibold text-gray-400">مفيش صنف بالاسم ده يا معلم!</p>
                    {itemSearchQuery && (
                      <button
                        onClick={() => setItemSearchQuery('')}
                        className="text-xs text-emerald-400 underline font-medium cursor-pointer"
                      >
                        اضغط هنا عشان ترجع تشوف كل الأصناف
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Right Side: Active Direct Counter Cart */}
          <section className={`w-full lg:w-[410px] xl:w-[450px] bg-[#0c1424] lg:border-r border-white/5 flex flex-col overflow-hidden shrink-0 ${mobileTab === 'cart' ? 'flex' : 'hidden lg:flex'}`}>
            {/* Cart Header (No customer selector at top) */}
            <div className="p-3.5 border-b border-white/5 flex items-center justify-between shrink-0 flex-row-reverse bg-slate-900/50">
              <div className="flex items-center gap-2">
                <ShoppingBag className="w-4 h-4 text-emerald-400" />
                <h3 className="font-bold text-xs sm:text-sm text-white">فاتورة وطلب الزبون</h3>
                {cart && Array.isArray(cart.items) && cart.items.length > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-extrabold font-mono">
                    {cart.items.length} صنف
                  </span>
                )}
              </div>
              <button 
                onClick={handleClearCart}
                disabled={!cart || !Array.isArray(cart.items) || cart.items.length === 0}
                className="text-xs text-gray-400 hover:text-rose-400 disabled:opacity-40 transition-all flex items-center gap-1 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>تفريغ الفاتورة</span>
              </button>
            </div>

            {/* Cart Items List */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {cart && Array.isArray(cart.items) && cart.items.length > 0 ? (
                cart.items.map((item) => (
                  <div key={item.id} className="p-2.5 bg-slate-900/80 border border-white/10 rounded-xl flex flex-col gap-1.5 hover:border-emerald-500/30 transition-all">
                    <div className="flex items-start justify-between gap-2 flex-row-reverse text-right">
                      <div>
                        <div className="flex items-center gap-1.5 flex-row-reverse">
                          <h4 className="font-bold text-xs text-white leading-tight">{item.name}</h4>
                          {item.unit && (
                            <span className="px-1.5 py-0.5 text-[9px] rounded-md bg-white/10 text-emerald-300 font-bold">
                              {item.unit}
                            </span>
                          )}
                        </div>
                        {item.comment && <p className="text-[10px] text-yellow-300 mt-0.5">{item.comment}</p>}
                      </div>
                      <span className="font-bold text-xs text-emerald-400 shrink-0 font-mono">
                        {item.totalPrice.toFixed(2)} جنيه
                      </span>
                    </div>

                    <div className="flex items-center justify-between border-t border-white/5 pt-1.5 flex-row-reverse">
                      <span className="text-[10px] text-gray-400 font-mono">
                        {item.unitPrice.toFixed(2)} ج {item.unit ? `لـ ${item.unit}` : 'للكيلو'}
                      </span>
                      <div className="flex items-center gap-1.5 flex-row-reverse">
                        <button 
                          onClick={() => handleUpdateQty(item.id, item.unit === 'كيلو' ? 0.25 : 1)} 
                          className="p-1 rounded-lg bg-white/5 hover:bg-emerald-500/20 text-gray-300 hover:text-emerald-300 transition-all active:scale-95 cursor-pointer"
                          title={`زود ${item.unit === 'كيلو' ? 'ربع كيلو' : 'واحدة'}`}
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                        <span className="text-xs font-black text-white px-1 text-center font-mono inline-flex items-center justify-center gap-1" dir="rtl">
                          <span>{item.qty}</span>
                          {item.unit && <span>{item.unit}</span>}
                        </span>
                        <button 
                          onClick={() => handleUpdateQty(item.id, item.unit === 'كيلو' ? -0.25 : -1)} 
                          className="p-1 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 transition-all active:scale-95 cursor-pointer"
                          title={`نقص ${item.unit === 'كيلو' ? 'ربع كيلو' : 'واحدة'}`}
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleEditCartItem(item)}
                          className="p-1 rounded-lg bg-white/5 hover:bg-yellow-500/20 text-gray-400 hover:text-yellow-400 transition-all active:scale-95 cursor-pointer"
                          title="تعديل السعر أو الوزن أو الوحدة"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button 
                          onClick={() => handleRemoveItem(item.id)} 
                          className="mr-1 text-gray-500 hover:text-rose-400 p-1 cursor-pointer"
                          title="شيل الصنف ده خالص"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center text-gray-500 gap-3 py-16">
                  <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center text-gray-400 border border-white/5">
                    <ShoppingBag className="w-8 h-8 stroke-1 text-emerald-400/60" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-gray-300">الفاتورة فاضية لسه!</p>
                    <p className="text-[10px] text-gray-500 mt-1">اضغط على أي صنف من الخضار والفاكهة عشان ينزل في الحساب على طول</p>
                  </div>
                </div>
              )}
            </div>

            {/* Bottom Checkout, Discount & Simple Payment */}
            <div className="p-3.5 border-t border-white/5 bg-[#090d16] shrink-0 space-y-3">
              {/* Discount Section (Editable & Reason Mandatory) */}
              <div className="bg-slate-900/80 border border-white/10 rounded-xl p-2.5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-gray-300 flex items-center gap-1">
                    <Tag className="w-3.5 h-3.5 text-yellow-400" />
                    <span>خصم للزبون (لو حابب تعمله تخفيض)</span>
                  </span>
                  {cart && cart.discount > 0 && (
                    <span className="text-[10px] text-rose-400 font-bold font-mono">
                      -{cart.discount.toFixed(2)} جنيه ({cart.discountRate}%)
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-12 gap-2">
                  <div className="col-span-4">
                    <input
                      type="number"
                      value={discountVal}
                      onChange={(e) => handleDiscountChange(e.target.value)}
                      className="w-full bg-slate-900 border border-white/15 rounded-lg py-1 px-2 text-xs text-white placeholder-gray-500 text-center focus:border-yellow-400 focus:outline-none font-mono"
                      placeholder="نسبة %"
                      min="0"
                      max="100"
                    />
                  </div>
                  <div className="col-span-8">
                    <input
                      type="text"
                      value={discountReason}
                      onChange={(e) => handleDiscountReasonChange(e.target.value)}
                      placeholder="اكتب سبب الخصم (لازم يتكتب عشان ينزل في الوصل) *"
                      className={`w-full bg-slate-900 border rounded-lg py-1 px-2 text-xs text-white placeholder-gray-500 text-right focus:outline-none ${
                        cart && cart.discount > 0 && !discountReason.trim()
                          ? 'border-rose-500/80 bg-rose-950/20'
                          : 'border-white/15 focus:border-yellow-400'
                      }`}
                    />
                  </div>
                </div>
              </div>

              {/* Price Calculation Summary */}
              <div className="space-y-1.5 border-b border-white/5 pb-2.5">
                <div className="flex justify-between text-xs text-gray-400 flex-row-reverse">
                  <span>الحساب قبل الخصم:</span>
                  <span className="font-mono">{cart?.subtotal.toFixed(2) || '0.00'} جنيه</span>
                </div>
                {cart && cart.discount > 0 && (
                  <div className="flex justify-between text-xs text-rose-400 flex-row-reverse">
                    <span>
                      الخصم ({cart.discountRate || 0}%)
                      {discountReason ? ` [${discountReason}]` : ''}:
                    </span>
                    <span className="font-mono">-{cart.discount.toFixed(2)} جنيه</span>
                  </div>
                )}
                <div className="flex justify-between text-sm font-bold text-white pt-1 flex-row-reverse">
                  <span>المطلوب من الزبون كاش:</span>
                  <span className="text-emerald-400 text-base font-black font-mono">
                    {cart?.total.toFixed(2) || '0.00'} جنيه
                  </span>
                </div>
              </div>

              {/* Payment Methods (Simplified: Cash default, optional InstaPay) */}
              <div className="space-y-1">
                <label className="text-[10px] font-semibold text-gray-400 block text-right">
                  طريقة استلام الفلوس من الزبون:
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('CASH')}
                    className={`flex items-center justify-center gap-1.5 py-2 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                      paymentMethod === 'CASH'
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-sm'
                        : 'bg-slate-900/60 border-white/5 text-gray-400 hover:text-white'
                    }`}
                  >
                    <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
                    <span>كاش في الدرج (نقدي)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPaymentMethod('INSTAPAY')}
                    className={`flex items-center justify-center gap-1.5 py-2 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                      paymentMethod === 'INSTAPAY'
                        ? 'bg-purple-500/20 text-purple-300 border-purple-500/50 shadow-sm'
                        : 'bg-slate-900/60 border-white/5 text-gray-400 hover:text-white'
                    }`}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 text-purple-400" />
                    <span>تحويل إنستا باي</span>
                  </button>
                </div>
              </div>

              {/* Confirm Checkout Button */}
              <button
                onClick={() => setShowPaymentConfirm(true)}
                disabled={!cart || !Array.isArray(cart.items) || cart.items.length === 0}
                className="w-full py-3 bg-gradient-to-r from-emerald-500 via-green-500 to-emerald-600 hover:from-emerald-600 hover:to-green-700 text-white font-black rounded-xl shadow-lg shadow-emerald-500/15 transition-all disabled:opacity-40 text-sm flex items-center justify-center gap-2 flex-row-reverse cursor-pointer active:scale-98"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{`قفل الحساب وطباعة الوصل (${cart?.total.toFixed(2) || '0.00'} جنيه)`}</span>
              </button>
            </div>
          </section>
        </main>

        {/* Mobile Tab Switcher */}
        <div className="lg:hidden h-14 bg-[#0c1424] border-t border-white/10 flex items-center justify-around px-4 shrink-0 z-20">
          <button
            onClick={() => setMobileTab('menu')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              mobileTab === 'menu' ? 'bg-emerald-500/20 text-emerald-400' : 'text-gray-400'
            }`}
          >
            <ShoppingBag className="w-4 h-4" />
            <span>قائمة الأصناف</span>
          </button>
          <button
            onClick={() => setMobileTab('cart')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              mobileTab === 'cart' ? 'bg-emerald-500/20 text-emerald-400' : 'text-gray-400'
            }`}
          >
            <DollarSign className="w-4 h-4" />
            <span>الفاتورة ({cart && Array.isArray(cart.items) ? cart.items.length : 0})</span>
          </button>
        </div>

        {/* PRODUCE PRICING, UNIT & 3-WAY AUTO-CALCULATOR MODAL */}
        {showProduceModal && selectedProduceItem && (() => {
          const currentCostVal = parseFloat(produceCost) || 0;
          const currentPriceVal = parseFloat(producePrice) || 0;
          const currentQtyVal = parseFloat(produceQty) || 0;
          const unitProfit = Math.round((currentPriceVal - currentCostVal) * 100) / 100;
          const totalItemPrice = Math.round(currentPriceVal * currentQtyVal * 100) / 100;
          const totalProfit = Math.round(unitProfit * currentQtyVal * 100) / 100;

          return (
            <div 
              className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-3 sm:p-4 backdrop-blur-md no-print"
              onClick={() => { setShowProduceModal(false); setSelectedProduceItem(null); setEditingCartItemId(null); }}
            >
              <div 
                className="w-full max-w-lg glass-panel bg-[#0d1527]/95 border border-emerald-500/30 rounded-3xl p-5 sm:p-6 relative text-right shadow-2xl overflow-y-auto max-h-[92vh]"
                dir="rtl"
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setShowProduceModal(false);
                    setSelectedProduceItem(null);
                    setEditingCartItemId(null);
                  } else if (e.key === 'Enter' && !e.shiftKey) {
                    handleConfirmProduceItem();
                  }
                }}
              >
                {/* Close Button */}
                <button 
                  type="button"
                  onClick={() => { setShowProduceModal(false); setSelectedProduceItem(null); setEditingCartItemId(null); }} 
                  className="absolute top-4 left-4 text-gray-400 hover:text-white p-1.5 rounded-xl bg-white/5 hover:bg-white/10 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>

                {/* Modal Header */}
                <div className="flex items-center gap-3 mb-4 border-b border-white/10 pb-3.5">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-yellow-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0 shadow-inner">
                    <Scale className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg sm:text-xl font-black text-white">
                        {selectedProduceItem.name}
                      </h3>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      حدّد السعر والوحدة والوزن (الأسعار بتتحسب تلقائياً لحظة بلحظة)
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  {/* 1. Unit Selector (كيلو / حزمة / قطعة) */}
                  <div>
                    <label className="block text-xs font-bold text-gray-300 mb-2 flex items-center justify-between">
                      <span>الوحدة وطريقة البيع:</span>
                      <span className="text-[11px] font-normal text-emerald-400">اختار الطريقة المناسبة للصنف</span>
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => setProduceUnit('كيلو')}
                        className={`py-2.5 px-3 rounded-2xl border text-xs font-black flex items-center justify-center gap-2 transition-all cursor-pointer ${
                          produceUnit === 'كيلو'
                            ? 'bg-emerald-500 text-slate-950 border-emerald-400 shadow-lg shadow-emerald-500/25 scale-[1.02]'
                            : 'bg-slate-900/80 border-white/10 text-gray-300 hover:text-white hover:border-white/20'
                        }`}
                      >
                        <Scale className="w-4 h-4" />
                        <span>كيلو (ميزان)</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setProduceUnit('حزمة')}
                        className={`py-2.5 px-3 rounded-2xl border text-xs font-black flex items-center justify-center gap-2 transition-all cursor-pointer ${
                          produceUnit === 'حزمة'
                            ? 'bg-emerald-500 text-slate-950 border-emerald-400 shadow-lg shadow-emerald-500/25 scale-[1.02]'
                            : 'bg-slate-900/80 border-white/10 text-gray-300 hover:text-white hover:border-white/20'
                        }`}
                      >
                        <span>حزمة (ربطة)</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setProduceUnit('قطعة')}
                        className={`py-2.5 px-3 rounded-2xl border text-xs font-black flex items-center justify-center gap-2 transition-all cursor-pointer ${
                          produceUnit === 'قطعة'
                            ? 'bg-emerald-500 text-slate-950 border-emerald-400 shadow-lg shadow-emerald-500/25 scale-[1.02]'
                            : 'bg-slate-900/80 border-white/10 text-gray-300 hover:text-white hover:border-white/20'
                        }`}
                      >
                        <span>قطعة (بالواحدة)</span>
                      </button>
                    </div>
                  </div>

                  {/* 2. 3-Way Auto-Calculator: Cost, Price, Margin % */}
                  <div className="p-3.5 bg-slate-900/90 border border-white/10 rounded-2xl space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black text-white flex items-center gap-1.5">
                        <Calculator className="w-4 h-4 text-emerald-400" />
                        <span>حسبة الأسعار والمكسب (3 خانات ذكية)</span>
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      {/* Cost Input */}
                      <div>
                        <label className="block text-[11px] font-bold text-gray-300 mb-1">
                          سعر التكلفة (شراء):
                        </label>
                        <div className="relative">
                          <input
                            type="number"
                            step="0.5"
                            min="0"
                            value={produceCost}
                            onChange={(e) => handleProduceCostChange(e.target.value)}
                            placeholder="مثلاً 20"
                            className="w-full bg-[#080d1a] border border-white/15 focus:border-amber-400 rounded-xl py-2 px-3 text-sm text-white font-mono text-center focus:outline-none transition-colors"
                          />
                          <span className="absolute left-2.5 top-2.5 text-[10px] text-gray-500">ج.م</span>
                        </div>
                        <span className="text-[9px] text-gray-500 block text-center mt-1">سعر الجملة</span>
                      </div>

                      {/* Price Input (Main Highlight) */}
                      <div>
                        <label className="block text-[11px] font-bold text-emerald-300 mb-1">
                          سعر البيع الحالي:
                        </label>
                        <div className="relative">
                          <input
                            type="number"
                            step="0.5"
                            min="0"
                            value={producePrice}
                            onChange={(e) => handleProducePriceChange(e.target.value)}
                            placeholder="مثلاً 25"
                            className="w-full bg-[#080d1a] border-2 border-emerald-500/60 focus:border-emerald-400 rounded-xl py-2 px-3 text-sm font-black text-emerald-300 font-mono text-center focus:outline-none transition-colors shadow-inner"
                          />
                          <span className="absolute left-2.5 top-2.5 text-[10px] text-emerald-400 font-bold">ج.م</span>
                        </div>
                        <span className="text-[9px] text-emerald-400 font-medium block text-center mt-1">
                          السعر لـ {produceUnit}
                        </span>
                      </div>

                      {/* Margin % Input */}
                      <div>
                        <label className="block text-[11px] font-bold text-gray-300 mb-1">
                          نسبة المكسب:
                        </label>
                        <div className="relative">
                          <input
                            type="number"
                            step="0.5"
                            value={produceMargin}
                            onChange={(e) => handleProduceMarginChange(e.target.value)}
                            placeholder="مثلاً 25%"
                            className="w-full bg-[#080d1a] border border-white/15 focus:border-yellow-400 rounded-xl py-2 px-3 text-sm text-yellow-300 font-mono text-center focus:outline-none transition-colors"
                          />
                          <span className="absolute left-2.5 top-2.5 text-[10px] text-yellow-500 font-bold">%</span>
                        </div>
                        <span className="text-[9px] text-gray-500 block text-center mt-1">هامش الربح %</span>
                      </div>
                    </div>

                    {/* Live Profit Banner */}
                    <div className="p-2.5 rounded-xl bg-white/5 border border-white/5 flex items-center justify-between flex-row-reverse text-xs">
                      <div className="flex items-center gap-1.5 text-gray-300">
                        <TrendingUp className="w-4 h-4 text-emerald-400" />
                        <span>صافي ربح {produceUnit}:</span>
                        <strong className={`font-mono ${unitProfit >= 0 ? 'text-emerald-400 font-black' : 'text-rose-400 font-black'}`}>
                          {unitProfit.toFixed(2)} ج.م
                        </strong>
                      </div>

                      <div>
                        {unitProfit > 0 ? (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold text-[10px]">
                            ربح {produceMargin}%
                          </span>
                        ) : unitProfit === 0 ? (
                          <span className="px-2 py-0.5 rounded-full bg-gray-500/20 text-gray-300 font-bold text-[10px]">
                            سعر التكلفة
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-400 font-bold text-[10px]">
                            أقل من التكلفة بخسارة!
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Live Scale Weight Card for Produce */}
                  {produceUnit === 'كيلو' && (
                    <div className={`p-3 rounded-xl border flex items-center justify-between transition-all ${
                      scale.isConnected 
                        ? 'bg-emerald-500/10 border-emerald-500/30' 
                        : 'bg-white/5 border-white/10'
                    }`}>
                      <div className="flex items-center gap-2.5">
                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                          scale.isConnected ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/10 text-gray-400'
                        }`}>
                          <Scale className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-bold text-white">
                              {scale.isConnected ? 'الميزان الإلكتروني' : 'الميزان الإلكتروني (RS232)'}
                            </span>
                            {scale.isConnected && (
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                                scale.isStable ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'
                              }`}>
                                {scale.isStable ? 'مستقر' : 'جاري الوزن...'}
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-gray-300 font-mono mt-0.5">
                            {scale.isConnected ? (
                              <>الوزن الحالي: <strong className="text-emerald-400 font-black text-sm">{scale.currentWeight.toFixed(3)}</strong> كجم</>
                            ) : (
                              'الميزان غير متصل - اضغط للربط'
                            )}
                          </div>
                        </div>
                      </div>

                      {scale.isConnected ? (
                        <button
                          type="button"
                          onClick={() => {
                            if (scale.currentWeight > 0) {
                              setProduceQty(scale.currentWeight.toFixed(3));
                            }
                          }}
                          className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-slate-950 font-black text-xs rounded-xl shadow-md transition-all flex items-center gap-1 cursor-pointer"
                          title="اسحب الوزن الحالي من الميزان"
                        >
                          <span>سحب الوزن</span>
                          <span className="font-mono">({scale.currentWeight.toFixed(3)})</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setShowScaleModal(true)}
                          className="px-2.5 py-1.5 bg-white/10 hover:bg-white/20 text-white text-xs font-bold rounded-xl transition-all flex items-center gap-1 cursor-pointer"
                        >
                          <Scale className="w-3.5 h-3.5 text-amber-400" />
                          <span>ربط الميزان</span>
                        </button>
                      )}
                    </div>
                  )}

                  {/* 3. Quantity / Weight Input + Quick Chips */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-bold text-gray-300">
                        {produceUnit === 'كيلو' ? 'الوزن من الميزان (كجم):' : 'العدد المطلوب:'}
                      </label>
                      <span className="text-[11px] text-gray-400 font-mono">
                        الوحدة: {produceUnit}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const current = parseFloat(produceQty) || 1;
                          const step = produceUnit === 'كيلو' ? 0.25 : 1;
                          setProduceQty((Math.round((current + step) * 1000) / 1000).toString());
                        }}
                        className="w-11 h-11 rounded-xl bg-white/10 hover:bg-emerald-500/30 text-emerald-300 flex items-center justify-center font-bold text-lg cursor-pointer transition-all active:scale-95"
                      >
                        <Plus className="w-5 h-5" />
                      </button>

                      <div className="flex-1 relative">
                        <input
                          type="number"
                          step={produceUnit === 'كيلو' ? '0.05' : '1'}
                          min="0.05"
                          value={produceQty}
                          onChange={(e) => setProduceQty(e.target.value)}
                          placeholder="1"
                          className="w-full bg-slate-900 border-2 border-white/20 focus:border-emerald-400 rounded-xl py-2.5 px-3 text-lg font-black text-white font-mono text-center focus:outline-none"
                        />
                        <span className="absolute left-3 top-3 text-xs text-gray-400 font-bold">
                          {produceUnit}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          const current = parseFloat(produceQty) || 1;
                          const step = produceUnit === 'كيلو' ? 0.25 : 1;
                          const nextVal = Math.max(step, Math.round((current - step) * 1000) / 1000);
                          setProduceQty(nextVal.toString());
                        }}
                        className="w-11 h-11 rounded-xl bg-white/10 hover:bg-white/20 text-gray-300 flex items-center justify-center font-bold text-lg cursor-pointer transition-all active:scale-95"
                      >
                        <Minus className="w-5 h-5" />
                      </button>
                    </div>

                    {/* Quick Select Chips */}
                    <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                      <span className="text-[10px] text-gray-400 shrink-0 ml-1">اختيار سريع:</span>
                      {produceUnit === 'كيلو' ? (
                        <>
                          {[
                            { label: '¼ ربع', val: '0.25' },
                            { label: '½ نص', val: '0.5' },
                            { label: '¾ إلا ربع', val: '0.75' },
                            { label: '1 كجم', val: '1' },
                            { label: '1.5 كجم', val: '1.5' },
                            { label: '2 كجم', val: '2' },
                            { label: '2.5 كجم', val: '2.5' },
                            { label: '3 كجم', val: '3' },
                            { label: '5 كجم', val: '5' },
                          ].map((chip) => (
                            <button
                              key={chip.val}
                              type="button"
                              onClick={() => setProduceQty(chip.val)}
                              className={`px-2 py-1 rounded-lg text-xs font-bold font-mono transition-all cursor-pointer ${
                                produceQty === chip.val
                                  ? 'bg-emerald-500 text-slate-950 font-black'
                                  : 'bg-white/5 text-gray-300 hover:bg-white/10 hover:text-white border border-white/5'
                              }`}
                            >
                              {chip.label}
                            </button>
                          ))}
                        </>
                      ) : (
                        <>
                          {['1', '2', '3', '4', '5', '6', '10', '12'].map((num) => (
                            <button
                              key={num}
                              type="button"
                              onClick={() => setProduceQty(num)}
                              className={`px-2.5 py-1 rounded-lg text-xs font-bold font-mono transition-all cursor-pointer ${
                                produceQty === num
                                  ? 'bg-emerald-500 text-slate-950 font-black'
                                  : 'bg-white/5 text-gray-300 hover:bg-white/10 hover:text-white border border-white/5'
                              }`}
                            >
                              {num}
                            </button>
                          ))}
                        </>
                      )}
                    </div>
                  </div>

                  {/* 4. Total Calculation Summary Card */}
                  <div className="p-3 bg-emerald-950/40 border border-emerald-500/30 rounded-2xl flex items-center justify-between flex-row-reverse">
                    <div className="text-right">
                      <span className="text-[11px] text-gray-300 block">إجمالي سعر الصنف للزبون:</span>
                      <div className="flex items-baseline gap-1 mt-0.5">
                        <span className="text-xl font-black text-emerald-300 font-mono">
                          {totalItemPrice.toFixed(2)}
                        </span>
                        <span className="text-xs text-emerald-400 font-bold">جنيه</span>
                      </div>
                    </div>

                    <div className="text-left text-xs text-gray-300 font-mono">
                      <div className="text-gray-400 text-[11px]">
                        {currentQtyVal} {produceUnit} × {currentPriceVal.toFixed(2)} ج
                      </div>
                      {currentCostVal > 0 && (
                        <div className="text-yellow-400 text-[10px] mt-0.5">
                          إجمالي الربح: {totalProfit.toFixed(2)} ج ({produceMargin}%)
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 5. Save Price Permanently Checkbox */}
                  <div 
                    className="p-3 bg-slate-900/60 border border-white/10 rounded-xl flex items-center justify-between gap-3 cursor-pointer hover:border-white/20 transition-all"
                    onClick={() => setSavePricePermanently(!savePricePermanently)}
                  >
                    <div className="text-right">
                      <div className="text-xs font-bold text-white flex items-center gap-1.5">
                        <span>حفظ السعر الجديد في النظام للمرات القادمة</span>
                      </div>
                      <span className="text-[10px] text-gray-400 block mt-0.5">
                        لو علمت عليها، السيستم هيسجل إن ده سعر بيع وتكلفة الصنف من هنا ورايح
                      </span>
                    </div>

                    <input
                      type="checkbox"
                      checked={savePricePermanently}
                      onChange={(e) => setSavePricePermanently(e.target.checked)}
                      className="w-4 h-4 rounded text-emerald-500 accent-emerald-500 cursor-pointer shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>

                  {/* 6. Action Buttons */}
                  <div className="grid grid-cols-2 gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setShowProduceModal(false);
                        setSelectedProduceItem(null);
                        setEditingCartItemId(null);
                      }}
                      className="py-3 border border-white/15 hover:bg-white/5 text-gray-300 hover:text-white rounded-xl text-xs font-bold transition-all cursor-pointer"
                    >
                      إلغاء (خروج)
                    </button>

                    <button
                      type="button"
                      onClick={handleConfirmProduceItem}
                      className="py-3 bg-gradient-to-r from-emerald-500 via-green-500 to-emerald-600 hover:from-emerald-600 hover:to-green-700 text-white font-black rounded-xl text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 active:scale-95 transition-all cursor-pointer"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>تأكيد الإضافة إلى الفاتورة (Enter)</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Returns / Refund Modal */}
        {showReturnModal && (
          <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setShowReturnModal(false)}>
            <div className="w-full max-w-2xl glass-panel rounded-2xl p-6 relative text-right max-h-[85vh] overflow-y-auto" dir="rtl" onClick={(e) => e.stopPropagation()}>
              <button onClick={() => setShowReturnModal(false)} className="absolute top-4 left-4 text-gray-400 hover:text-white cursor-pointer"><X className="w-5 h-5" /></button>
              <h3 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
                <RotateCcw className="w-5 h-5 text-rose-400" />
                <span>مرتجع أصناف / فاتورة للعميل</span>
              </h3>
              <p className="text-xs text-gray-400 mb-4">اختار الفاتورة اللي الزبون هيرجع منها أو اكتب رقم الوصل</p>

              {!selectedReturnOrder ? (
                <div className="space-y-3">
                  <div className="relative">
                    <Search className="w-4 h-4 text-gray-400 absolute right-3 top-2.5" />
                    <input
                      type="text"
                      value={returnSearchQuery}
                      onChange={(e) => setReturnSearchQuery(e.target.value)}
                      className="w-full bg-slate-900 border border-white/10 rounded-xl pr-9 pl-4 py-2 text-xs text-white text-right"
                      placeholder="ابحث برقم الوصل (مثال: BF-...)..."
                    />
                  </div>

                  <div className="space-y-2 max-h-[300px] overflow-y-auto">
                    {recentCompletedOrders
                      .filter((o) => !returnSearchQuery || o.receiptNumber?.includes(returnSearchQuery))
                      .map((ord) => (
                        <div
                          key={ord.id}
                          onClick={() => setSelectedReturnOrder(ord)}
                          className="p-3 bg-slate-900/60 hover:bg-white/5 border border-white/5 rounded-xl flex items-center justify-between cursor-pointer transition-all flex-row-reverse"
                        >
                          <div className="text-right">
                            <span className="font-bold text-xs text-white">{ord.receiptNumber}</span>
                            <span className="text-[10px] text-gray-400 block">{new Date(ord.createdAt).toLocaleTimeString()} - {getPaymentMethodArabic(ord.paymentMethod)}</span>
                          </div>
                          <span className="text-emerald-400 font-bold text-xs">{ord.total.toFixed(2)} جنيه</span>
                        </div>
                      ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="p-3 bg-white/5 border border-white/10 rounded-xl flex justify-between items-center flex-row-reverse">
                    <div>
                      <span className="font-bold text-sm text-white">وصل: {selectedReturnOrder.receiptNumber}</span>
                      <span className="text-xs text-gray-400 block">الإجمالي: {selectedReturnOrder.total.toFixed(2)} جنيه</span>
                    </div>
                    <button onClick={() => setSelectedReturnOrder(null)} className="text-xs text-emerald-400 underline cursor-pointer">اختار فاتورة تانية</button>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-300 mb-1">سبب الترجيع إيه؟</label>
                    <select value={returnReason} onChange={(e) => setReturnReason(e.target.value)} className="w-full bg-slate-900 border border-white/10 rounded-xl p-2 text-xs text-white text-right">
                      <option value="الزبون غير رأيه">الزبون غير رأيه</option>
                      <option value="غلطة في الميزان أو الصنف">غلطة في الميزان أو الصنف</option>
                      <option value="حاجة مش عاجبة الزبون أو تالفة">حاجة مش عاجبة الزبون أو تالفة</option>
                      <option value="أسباب تانية">سبب تاني</option>
                    </select>
                  </div>

                  <div className="flex items-center gap-2">
                    <input type="checkbox" id="restock" checked={returnRestock} onChange={(e) => setReturnRestock(e.target.checked)} className="rounded" />
                    <label htmlFor="restock" className="text-xs text-gray-300 cursor-pointer">رجع البضاعة للمحل والميزان تاني</label>
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-2">
                    <button onClick={() => setSelectedReturnOrder(null)} className="py-2.5 border border-white/10 text-white rounded-xl text-xs cursor-pointer">إلغاء</button>
                    <button disabled={submittingReturn} onClick={handleProcessReturn} className="py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs cursor-pointer">
                      {submittingReturn ? 'جاري الترجيع...' : `تأكيد ترجيع ${selectedReturnOrder.total.toFixed(2)} جنيه للزبون`}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Payment Confirm Modal */}
        {showPaymentConfirm && cart && (
          <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setShowPaymentConfirm(false)}>
            <div className="w-full max-w-sm glass-panel rounded-2xl p-6 text-right" dir="rtl" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-lg font-bold text-white">تأكيد استلام الفلوس وقفل الحساب</h3>
              <div className="my-4 p-3.5 rounded-xl bg-white/5 border border-white/10 space-y-2">
                <div className="flex justify-between text-xs text-gray-300 flex-row-reverse">
                  <span>المطلوب من الزبون</span>
                  <span className="font-bold text-emerald-400 text-base">{cart.total.toFixed(2)} جنيه</span>
                </div>
                <div className="flex justify-between text-xs text-gray-300 flex-row-reverse">
                  <span>طريقة الدفع</span>
                  <span className="font-bold text-white">{getPaymentMethodArabic(paymentMethod)}</span>
                </div>
                {cart.discount > 0 && (
                  <div className="flex justify-between text-xs text-rose-400 flex-row-reverse">
                    <span>الخصم المطبق</span>
                    <span>-{cart.discount.toFixed(2)} جنيه ({discountReason || 'بدون سبب'})</span>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button type="button" onClick={() => setShowPaymentConfirm(false)} className="py-2.5 border border-white/10 text-white rounded-xl text-xs cursor-pointer">ارجع للفاتورة</button>
                <button 
                  type="button" 
                  onClick={() => { 
                    setShowPaymentConfirm(false); 
                    handleCompleteOrder(); 
                  }} 
                  className="py-2.5 bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white font-bold rounded-xl text-xs cursor-pointer flex items-center justify-center gap-1.5 shadow-md shadow-emerald-500/20 active:scale-95 transition-all"
                >
                  <Printer className="w-4 h-4" />
                  <span>طباعة الإيصال</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* RECEIPT PRINTING PREVIEW MODAL */}
        {showPrintModal && receiptOrder && (
          <div className="fixed inset-0 z-45 bg-black/85 flex items-center justify-center p-4 backdrop-blur-sm no-print" onClick={() => { setShowPrintModal(false); setReceiptOrder(null); }}>
            <div className="w-full max-w-sm glass-panel rounded-2xl p-6 relative text-right" dir="rtl" onClick={(e) => e.stopPropagation()}>
              <button onClick={() => { setShowPrintModal(false); setReceiptOrder(null); }} className="absolute top-4 left-4 text-gray-400 hover:text-white cursor-pointer"><X className="w-5 h-5" /></button>
              <h3 className="text-base font-bold text-white mb-2 flex items-center gap-2 flex-row-reverse">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                <span>تم الدفع بنجاح! وده شكل وصل الزبون</span>
              </h3>
              
              <div className="p-3 bg-white text-black font-mono rounded-lg shadow-inner max-h-[380px] overflow-y-auto">
                <ReceiptLayout preview />
              </div>

              <div className="grid grid-cols-2 gap-3 mt-4">
                <button onClick={() => { setShowPrintModal(false); setReceiptOrder(null); }} className="py-2.5 border border-white/10 text-white rounded-xl text-xs cursor-pointer">خلاص تمام (اقفل)</button>
                <button onClick={() => window.print()} className="py-2.5 bg-gradient-to-r from-emerald-500 to-green-600 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1 cursor-pointer">
                  <Printer className="w-4 h-4" />
                  <span>إعادة طباعة الإيصال</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* OPEN SHIFT DIALOG */}
        {showOpenShift && (
          <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm no-print" onClick={() => setShowOpenShift(false)}>
            <div className="w-full max-w-md glass-panel rounded-2xl p-6 relative text-right" dir="rtl" onClick={(e) => e.stopPropagation()}>
              <button onClick={() => setShowOpenShift(false)} className="absolute top-4 left-4 text-gray-400 hover:text-white cursor-pointer">
                <X className="w-5 h-5" />
              </button>
              <div className="flex items-center gap-2.5 mb-1">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center text-emerald-400 border border-emerald-500/20">
                  <ShoppingBag className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">فتح شفت ويومية جديدة - بانانا فود</h3>
                  <p className="text-xs text-gray-400">اكتب اسم الكاشير ومبلغ الفكة اللي هتبدأ بيه في الدرج للبيع</p>
                </div>
              </div>

              <form onSubmit={handleOpenShiftSubmit} className="space-y-4 mt-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1">اسم الكاشير المسؤول عن الوردية *</label>
                  <input
                    required
                    type="text"
                    value={cashierName}
                    onChange={(e) => setCashierName(e.target.value)}
                    placeholder="اكتب اسم الكاشير (مثال: أحمد حسن)..."
                    className="w-full bg-slate-900 border border-white/10 rounded-xl py-2.5 px-3 text-white text-xs text-right placeholder-gray-500 focus:border-emerald-500"
                  />

                  {/* Quick Select Saved Cashier Names */}
                  {savedCashierNames.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <span className="text-[10px] text-gray-400 w-full">أسماء سريعة:</span>
                      {savedCashierNames.map((cn) => (
                        <button
                          key={cn.id}
                          type="button"
                          onClick={() => setCashierName(cn.name)}
                          className="px-2 py-0.5 rounded-lg bg-white/5 hover:bg-emerald-500/20 text-gray-300 hover:text-emerald-300 border border-white/5 text-[10px] transition-all cursor-pointer"
                        >
                          {cn.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1">مبلغ الفكة اللي هتبدأ بيه في الدرج (لو فيه)</label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={floatCash}
                    onChange={(e) => setFloatCash(e.target.value)}
                    placeholder="0.00"
                    className="w-full bg-slate-900 border border-white/10 rounded-xl py-2.5 px-3 text-white text-xs text-right placeholder-gray-500 focus:border-emerald-500 font-mono"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowOpenShift(false)}
                    className="py-2.5 border border-white/10 text-white rounded-xl text-xs hover:bg-white/5 cursor-pointer"
                  >
                    إلغاء
                  </button>
                  <button
                    type="submit"
                    className="py-2.5 bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white font-bold rounded-xl text-xs shadow-lg shadow-emerald-500/20 cursor-pointer"
                  >
                    تأكيد فتح الشفت
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* CLOSE SHIFT DIALOG (Cash and InstaPay only) */}
        {showCloseShift && (
          <div className="fixed inset-0 z-40 bg-black/75 flex items-center justify-center p-4 backdrop-blur-sm no-print" onClick={() => setShowCloseShift(false)}>
            <div className="w-full max-w-lg glass-panel rounded-2xl p-6 relative text-right" dir="rtl" onClick={(e) => e.stopPropagation()}>
              <button onClick={() => setShowCloseShift(false)} className="absolute top-4 left-4 text-gray-400 hover:text-white cursor-pointer"><X className="w-5 h-5" /></button>
              <h3 className="text-xl font-bold text-white mb-1">تسوية وتصفية الشفت واليومية</h3>
              <p className="text-xs text-gray-400 mb-4">عد الفلوس اللي في الدرج وطابقها مع الحسابات المسجلة في السيستم.</p>

              {/* Expected Totals Card */}
              <div className="bg-slate-900/80 border border-white/10 rounded-xl p-3.5 mb-4">
                <div className="flex items-center justify-between mb-2.5">
                  <span className="text-xs font-bold text-gray-200">المحسوب في السيستم:</span>
                  <button
                    type="button"
                    onClick={handleAutoFillExpected}
                    className="text-[11px] text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 px-2.5 py-1 rounded-lg font-semibold transition-all cursor-pointer"
                  >
                    نزّل المبلغ المحسوب تلقائي
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3 text-center text-xs">
                  <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3">
                    <span className="block text-[10px] text-emerald-300 mb-0.5">الكاش المفروض في الدرج</span>
                    <strong className="text-emerald-400 text-base font-bold font-mono">{(activeShift?.expectedCash || 0).toFixed(2)} جنيه</strong>
                  </div>
                  <div className="bg-purple-500/10 border border-purple-500/20 rounded-lg p-3">
                    <span className="block text-[10px] text-purple-300 mb-0.5">إنستا باي المتوقع</span>
                    <strong className="text-purple-400 text-base font-bold font-mono">{(activeShift?.expectedInstaPay || 0).toFixed(2)} جنيه</strong>
                  </div>
                </div>
              </div>

              <form onSubmit={handleCloseShiftSubmit} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-semibold text-gray-300">الكاش الفعلي اللي عديته في الدرج</label>
                      <span className="text-[10px] text-emerald-400 font-mono font-semibold">{(activeShift?.expectedCash || 0).toFixed(0)} ج</span>
                    </div>
                    <input 
                      type="number" 
                      step="any" 
                      required 
                      value={closedCash} 
                      onChange={(e) => setClosedCash(e.target.value)} 
                      className="w-full bg-slate-900 border border-white/10 rounded-xl py-2 px-3 text-white text-xs text-right font-mono focus:border-emerald-500" 
                      placeholder="0.00" 
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-semibold text-gray-300">مجموع إنستا باي الفعلي ع التليفون</label>
                      <span className="text-[10px] text-purple-400 font-mono font-semibold">{(activeShift?.expectedInstaPay || 0).toFixed(0)} ج</span>
                    </div>
                    <input 
                      type="number" 
                      step="any" 
                      value={closedInstaPay} 
                      onChange={(e) => setClosedInstaPay(e.target.value)} 
                      className="w-full bg-slate-900 border border-white/10 rounded-xl py-2 px-3 text-white text-xs text-right font-mono focus:border-purple-500" 
                      placeholder="0.00" 
                    />
                  </div>
                </div>

                {/* Live Cash Variance Preview */}
                {closedCash.trim() !== '' && (() => {
                  const entered = parseFloat(closedCash) || 0;
                  const expected = activeShift?.expectedCash || 0;
                  const diff = entered - expected;
                  if (diff < -0.01) {
                    return (
                      <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-between text-xs">
                        <span className="text-rose-300 font-bold flex items-center gap-1.5">
                          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                          <span>تنبيه: يوجد عجز في كاش الدرج بمقدار:</span>
                        </span>
                        <span className="font-mono font-bold text-rose-400 text-sm">{Math.abs(diff).toFixed(2)}- جنيه</span>
                      </div>
                    );
                  } else if (diff > 0.01) {
                    return (
                      <div className="p-3 rounded-xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-between text-xs">
                        <span className="text-cyan-300 font-bold flex items-center gap-1.5">
                          <span>يوجد زيادة في كاش الدرج بمقدار:</span>
                        </span>
                        <span className="font-mono font-bold text-cyan-400 text-sm">+{diff.toFixed(2)} جنيه</span>
                      </div>
                    );
                  } else {
                    return (
                      <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-between text-xs">
                        <span className="text-emerald-300 font-bold flex items-center gap-1.5">
                          <span>الكاش مطابق لحسابات السيستم بالمليم:</span>
                        </span>
                        <span className="font-mono font-bold text-emerald-400 text-sm">0.00 جنيه (مطابق)</span>
                      </div>
                    );
                  }
                })()}

                {/* Live InstaPay Variance Preview */}
                {(closedInstaPay.trim() !== '' || (activeShift?.expectedInstaPay || 0) > 0) && (() => {
                  const entered = parseFloat(closedInstaPay) || 0;
                  const expected = activeShift?.expectedInstaPay || 0;
                  const diff = entered - expected;
                  if (diff < -0.01) {
                    return (
                      <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-between text-xs">
                        <span className="text-rose-300 font-bold flex items-center gap-1.5">
                          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                          <span>تنبيه: يوجد عجز في تحويلات إنستا باي بمقدار:</span>
                        </span>
                        <span className="font-mono font-bold text-rose-400 text-sm">{Math.abs(diff).toFixed(2)}- جنيه</span>
                      </div>
                    );
                  } else if (diff > 0.01) {
                    return (
                      <div className="p-3 rounded-xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-between text-xs">
                        <span className="text-purple-300 font-bold flex items-center gap-1.5">
                          <span>يوجد زيادة في تحويلات إنستا باي بمقدار:</span>
                        </span>
                        <span className="font-mono font-bold text-purple-400 text-sm">+{diff.toFixed(2)} جنيه</span>
                      </div>
                    );
                  } else if (closedInstaPay.trim() !== '') {
                    return (
                      <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-between text-xs">
                        <span className="text-emerald-300 font-bold flex items-center gap-1.5">
                          <span>إنستا باي مطابق لتحويلات السيستم بالمليم:</span>
                        </span>
                        <span className="font-mono font-bold text-emerald-400 text-sm">0.00 جنيه (مطابق)</span>
                      </div>
                    );
                  }
                  return null;
                })()}

                <button type="submit" className="w-full py-3 mt-3 bg-gradient-to-r from-rose-500 to-rose-600 hover:from-rose-600 hover:to-rose-700 text-white font-bold rounded-xl text-xs shadow-lg shadow-rose-500/20 transition-all cursor-pointer">
                  تأكيد تصفية اليومية وقفل الشفت
                </button>
              </form>
            </div>
          </div>
        )}

        {/* Closed Shift Summary Report Modal */}
        {showShiftReportModal && closedShiftReport && (
          <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm no-print" onClick={() => setShowShiftReportModal(false)}>
            <div className="w-full max-w-md glass-panel rounded-2xl p-6 relative text-right" dir="rtl" onClick={(e) => e.stopPropagation()}>
              <button onClick={() => setShowShiftReportModal(false)} className="absolute top-4 left-4 text-gray-400 hover:text-white cursor-pointer">
                <X className="w-5 h-5" />
              </button>
              <div className="text-center mb-4">
                <div className="w-12 h-12 mx-auto rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mb-2">
                  <Lock className="w-6 h-6 text-emerald-400" />
                </div>
                <h3 className="text-lg font-bold text-white">تقرير تصفية وتقفيل الوردية</h3>
                <p className="text-xs text-gray-400">تم إغلاق الوردية وحفظ كافة الحسابات بنجاح</p>
              </div>

              <div className="space-y-3 mb-5">
                <div className="p-3 bg-slate-900/70 border border-white/10 rounded-xl space-y-2 text-xs">
                  <div className="flex justify-between items-center text-gray-300">
                    <span className="text-gray-400">الكاشير:</span>
                    <span className="font-bold text-cyan-300">{closedShiftReport.cashierName || 'كاشير'}</span>
                  </div>
                  <div className="flex justify-between items-center text-gray-300">
                    <span className="text-gray-400">تاريخ ووقت الفتح:</span>
                    <span className="font-mono text-gray-200">
                      {new Date(closedShiftReport.openedAt).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' })}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-gray-300">
                    <span className="text-gray-400">تاريخ ووقت الإغلاق:</span>
                    <span className="font-mono text-gray-200">
                      {new Date(closedShiftReport.closedAt).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' })}
                    </span>
                  </div>
                </div>

                {/* Cash Balance Breakdown */}
                <div className="p-3.5 bg-slate-900/90 border border-white/10 rounded-xl space-y-2.5 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-300">الكاش المتوقع في الدرج (السيستم):</span>
                    <span className="font-mono font-bold text-emerald-400 text-sm">
                      {(closedShiftReport.expectedCash || 0).toFixed(2)} ج
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-300">الكاش الفعلي المسلم من الكاشير:</span>
                    <span className="font-mono font-bold text-white text-sm">
                      {(closedShiftReport.closedCash || 0).toFixed(2)} ج
                    </span>
                  </div>

                  {/* Variance Banner */}
                  <div className="pt-2 border-t border-white/10">
                    {closedShiftReport.varianceCash < -0.01 ? (
                      <div className="p-3 rounded-xl bg-rose-500/20 border border-rose-500/40 text-center">
                        <span className="text-[11px] text-rose-300 block font-semibold">نتيجة المطابقة: يوجد عجز في الكاش</span>
                        <span className="text-xl font-bold font-mono text-rose-400 mt-0.5 block">
                          عجز: {Math.abs(closedShiftReport.varianceCash).toFixed(2)}- جنيه
                        </span>
                        <span className="text-[10px] text-rose-300/80 mt-1 block">تم تسجيل هذا العجز في تقرير اليومية وسجلات الإدارة</span>
                      </div>
                    ) : closedShiftReport.varianceCash > 0.01 ? (
                      <div className="p-3 rounded-xl bg-cyan-500/20 border border-cyan-500/40 text-center">
                        <span className="text-[11px] text-cyan-300 block font-semibold">نتيجة المطابقة: يوجد زيادة في الكاش</span>
                        <span className="text-xl font-bold font-mono text-cyan-400 mt-0.5 block">
                          زيادة: +{closedShiftReport.varianceCash.toFixed(2)} جنيه
                        </span>
                      </div>
                    ) : (
                      <div className="p-3 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-center">
                        <span className="text-xs text-emerald-300 font-bold block">
                          نتيجة المطابقة: الحساب مضبوط بدون أي عجز (0.00 ج)
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* InstaPay Balance Breakdown */}
                <div className="p-3.5 bg-slate-900/90 border border-purple-500/30 rounded-xl space-y-2.5 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-300">إنستا باي المتوقع (فواتير السيستم):</span>
                    <span className="font-mono font-bold text-purple-400 text-sm">
                      {(closedShiftReport.expectedInstaPay || 0).toFixed(2)} ج
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-300">إنستا باي الفعلي المسجل ع التليفون:</span>
                    <span className="font-mono font-bold text-white text-sm">
                      {(closedShiftReport.closedInstaPay || 0).toFixed(2)} ج
                    </span>
                  </div>

                  {/* InstaPay Variance Banner */}
                  <div className="pt-2 border-t border-white/10">
                    {(closedShiftReport.varianceInstaPay || 0) < -0.01 ? (
                      <div className="p-3 rounded-xl bg-rose-500/20 border border-rose-500/40 text-center">
                        <span className="text-[11px] text-rose-300 block font-semibold">نتيجة مطابقة إنستا باي: يوجد عجز في التحويلات</span>
                        <span className="text-xl font-bold font-mono text-rose-400 mt-0.5 block">
                          عجز إنستا: {Math.abs(closedShiftReport.varianceInstaPay).toFixed(2)}- جنيه
                        </span>
                        <span className="text-[10px] text-rose-300/80 mt-1 block">المبلغ الفعلي على التليفون أقل من فواتير إنستا باي بالسيستم</span>
                      </div>
                    ) : (closedShiftReport.varianceInstaPay || 0) > 0.01 ? (
                      <div className="p-3 rounded-xl bg-purple-500/20 border border-purple-500/40 text-center">
                        <span className="text-[11px] text-purple-300 block font-semibold">نتيجة مطابقة إنستا باي: يوجد زيادة في التحويلات</span>
                        <span className="text-xl font-bold font-mono text-purple-400 mt-0.5 block">
                          زيادة إنستا: +{(closedShiftReport.varianceInstaPay || 0).toFixed(2)} جنيه
                        </span>
                      </div>
                    ) : (
                      <div className="p-2.5 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-center">
                        <span className="text-xs text-emerald-300 font-bold block">
                          نتيجة المطابقة: إنستا باي مطابق للفواتير (0.00 ج)
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowShiftReportModal(false);
                    setShowOpenShift(true);
                  }}
                  className="py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white font-bold text-xs shadow-lg transition-all cursor-pointer"
                >
                  افتح شفت جديد
                </button>
                <button
                  type="button"
                  onClick={() => setShowShiftReportModal(false)}
                  className="py-2.5 rounded-xl border border-white/10 hover:bg-white/5 text-white font-semibold text-xs transition-all cursor-pointer"
                >
                  إغلاق التقرير
                </button>
              </div>
            </div>
          </div>
        )}

        {/* SCALE DIAGNOSTICS & SETTINGS MODAL */}
        {showScaleModal && (
          <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm no-print" onClick={() => setShowScaleModal(false)}>
            <div className="w-full max-w-lg glass-panel rounded-2xl p-5 sm:p-6 max-h-[92vh] overflow-y-auto relative text-right" dir="rtl" onClick={(e) => e.stopPropagation()}>
              <button onClick={() => setShowScaleModal(false)} className="absolute top-4 left-4 text-gray-400 hover:text-white cursor-pointer">
                <X className="w-5 h-5" />
              </button>

              <div className="flex items-center gap-3 mb-4">
                <div className="w-11 h-11 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
                  <Scale className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">إعدادات وتشخيص الميزان الإلكتروني (RS232)</h3>
                  <p className="text-xs text-gray-400">ربط وقراءة ميزان الخضار والفاكهة مباشرة عبر منفذ السيريال (COM Port)</p>
                </div>
              </div>

              {/* Large Digital Scale Readout Display */}
              <div className="p-4 rounded-2xl bg-slate-950 border-2 border-emerald-500/30 mb-4 text-center shadow-inner relative overflow-hidden">
                <div className="flex items-center justify-between text-[11px] text-gray-400 mb-1 px-1">
                  <span className="flex items-center gap-1.5 font-bold">
                    <span className={`w-2 h-2 rounded-full ${scale.isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-gray-500'}`}></span>
                    <span>{scale.isConnected ? 'متصل وجاهز للقراءة' : 'الميزان غير متصل'}</span>
                  </span>
                  <div className="flex items-center gap-2">
                    {scale.isConnected && (
                      <>
                        <span className={`px-2 py-0.5 rounded-md font-bold text-[10px] ${
                          scale.isStable ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'
                        }`}>
                          {scale.isStable ? 'مستقر (STABLE)' : 'متحرك (UNSTABLE)'}
                        </span>
                        {scale.isZero && (
                          <span className="px-1.5 py-0.5 rounded-md font-bold text-[10px] bg-cyan-500/20 text-cyan-300">
                            صفر (ZERO)
                          </span>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* Big Digital Number */}
                <div className="py-2">
                  <span className="text-5xl sm:text-6xl font-black font-mono tracking-wider text-emerald-400 drop-shadow-[0_0_15px_rgba(16,185,129,0.3)]">
                    {scale.currentWeight.toFixed(3)}
                  </span>
                  <span className="text-sm font-bold text-emerald-300/80 mr-2 font-mono">كجم (KG)</span>
                </div>

                {/* Scale Action Buttons (Tare / Zero) */}
                {scale.isConnected && (
                  <div className="flex items-center justify-center gap-2 pt-2 border-t border-white/10 mt-2">
                    <button
                      type="button"
                      onClick={scale.tare}
                      className="px-3 py-1 bg-white/10 hover:bg-white/20 text-gray-200 text-xs font-bold rounded-lg transition-all cursor-pointer"
                      title="تصفير الوزن الصافي (Tare)"
                    >
                      تصفير الصافي (Tare)
                    </button>
                    <button
                      type="button"
                      onClick={scale.zero}
                      className="px-3 py-1 bg-white/10 hover:bg-white/20 text-gray-200 text-xs font-bold rounded-lg transition-all cursor-pointer"
                      title="إلغاء التصفير والعودة للوزن الإجمالي"
                    >
                      إعادة ضبط (Reset)
                    </button>
                  </div>
                )}
              </div>

              {/* Connection Controls & Baud Rate */}
              <div className="bg-slate-900/80 border border-white/10 rounded-xl p-3.5 mb-4 space-y-3 text-xs">
                <div className="grid grid-cols-2 gap-3 items-center">
                  <div>
                    <label className="block text-gray-300 font-bold mb-1">سرعة النقل (Baud Rate):</label>
                    <select
                      value={scale.baudRate}
                      onChange={(e) => scale.setBaudRate(parseInt(e.target.value, 10))}
                      className="w-full bg-slate-950 border border-white/15 rounded-lg py-1.5 px-2 text-white font-mono focus:border-emerald-500"
                    >
                      <option value={9600}>9600 (الافتراضي - معظم موازين مصر)</option>
                      <option value={4800}>4800 (موازين CAS و Yaohua)</option>
                      <option value={2400}>2400 (موازين قديمة)</option>
                      <option value={19200}>19200</option>
                      <option value={115200}>115200</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-gray-300 font-bold mb-1">التحكم في الاتصال:</label>
                    {scale.isConnected ? (
                      <button
                        type="button"
                        onClick={scale.disconnectScale}
                        className="w-full py-2 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 font-bold rounded-lg transition-all cursor-pointer"
                      >
                        قطع الاتصال بالمنفذ
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={scale.connectScale}
                        className="w-full py-2 bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white font-bold rounded-lg shadow-md transition-all cursor-pointer flex items-center justify-center gap-1.5"
                      >
                        <Scale className="w-3.5 h-3.5" />
                        <span>ربط واختيار المنفذ (COM)</span>
                      </button>
                    )}
                  </div>
                </div>

                {scale.error && (
                  <div className="p-2.5 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-300 text-[11px] font-semibold">
                    {scale.error}
                  </div>
                )}
              </div>

              {/* Raw Serial Terminal Monitor */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-1.5 text-xs text-gray-400">
                  <span className="font-bold text-gray-300">شاشة مراقبة البيانات الحية (Serial Terminal):</span>
                  <span className="text-[10px] text-gray-500 font-mono">مراقبة البايتات الواردة لحظياً</span>
                </div>
                <div className="h-28 bg-slate-950 border border-white/10 rounded-xl p-2.5 font-mono text-[11px] text-emerald-400/90 overflow-y-auto space-y-0.5 text-left" dir="ltr">
                  {scale.rawTerminalLines.length > 0 ? (
                    scale.rawTerminalLines.map((line, idx) => (
                      <div key={idx} className="truncate">
                        <span className="text-gray-600 mr-2">&gt;</span>
                        {line}
                      </div>
                    ))
                  ) : (
                    <div className="text-gray-600 text-center py-8">
                      {scale.isConnected 
                        ? 'في انتظار وصول بايتات من الميزان... (تأكد أن الميزان في وضع Continuous Send)'
                        : 'الميزان غير متصل. اضغط على زر "ربط واختيار المنفذ" لبدء القراءة.'}
                    </div>
                  )}
                </div>
              </div>

              {/* Troubleshooting Accordion / Offline Technician Guide */}
              <div className="mb-4 bg-slate-900/70 border border-white/10 rounded-xl overflow-hidden shadow-sm">
                <button
                  type="button"
                  onClick={() => setShowScaleHelp(!showScaleHelp)}
                  className="w-full px-3.5 py-2.5 bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 flex items-center justify-between text-xs font-bold transition-all cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <HelpCircle className="w-4 h-4 text-amber-400" />
                    <span>دليل الطوارئ وإرشادات الفني (لو الميزان مقراش أو احتجت مساعدة)</span>
                  </div>
                  {showScaleHelp ? <ChevronUp className="w-4 h-4 text-amber-400" /> : <ChevronDown className="w-4 h-4 text-amber-400" />}
                </button>
                {showScaleHelp && (
                  <div className="p-3.5 space-y-3 text-[11px] text-gray-300 border-t border-white/10 bg-slate-950/90 leading-relaxed">
                    <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-200">
                      <strong className="block text-amber-300 mb-1 font-bold">الكلام اللي تقوله لفني الميزان لضبطه بالحرف:</strong>
                      &ldquo;اضبط الميزان يبعت الداتا Continuous Stream (بث مستمر أوتوماتيك) على سرعة Baud Rate 9600، وتوصيلة كابل RS232 تكون: Pin 2 (RX) و Pin 3 (TX) و Pin 5 (GND)&rdquo;
                    </div>

                    <div className="space-y-2">
                      <div className="p-2.5 rounded-lg bg-white/5 border border-white/5">
                        <span className="font-bold text-white block mb-0.5">1. لو ضغطت &ldquo;ربط واختيار المنفذ&rdquo; ومظهرش أي COM:</span>
                        <p className="text-gray-400">
                          كابل التحويلة (USB to RS232) محتاج تعريفه (Driver) على ويندوز. افتح هوت سبوت من الموبايل 30 ثانية بس عشان ويندوز ينزل تعريفه تلقائياً، أو اسأل الفني عن أسطوانة/ملف تعريف الكابل (CH340 أو Prolific PL2303).
                        </p>
                      </div>

                      <div className="p-2.5 rounded-lg bg-white/5 border border-white/5">
                        <span className="font-bold text-white block mb-0.5">2. لو اتصل والمنفذ ظهر بس الوزن 0 والشاشة السودة فاضية:</span>
                        <p className="text-gray-400">
                          الميزان مش باعت أوتوماتيك (مضبوط Manual أو مستني زرار Print). اطلب من الفني تفعيل الـ Continuous Send / Stream Mode من إعدادات الميزان.
                        </p>
                      </div>

                      <div className="p-2.5 rounded-lg bg-white/5 border border-white/5">
                        <span className="font-bold text-white block mb-0.5">3. لو الشاشة السودة بتجيب رموز غريبة أو شخابيط:</span>
                        <p className="text-gray-400">
                          سرعة النقل غير متطابقة. غير خيار &ldquo;سرعة النقل (Baud Rate)&rdquo; من القائمة بالأعلى من 9600 إلى 4800 (مشهور في موازين CAS و Yaohua) أو 2400 وستنتظم القراءة فوراً دون إعادة تحميل الصفحة.
                        </p>
                      </div>

                      <div className="p-2.5 rounded-lg bg-white/5 border border-white/5">
                        <span className="font-bold text-white block mb-0.5">4. لو رسالة &ldquo;Port is already open&rdquo; أو تعذر الفتح:</span>
                        <p className="text-gray-400">
                          افصل كابل الـ USB وركبه في مدخل USB آخر، وتأكد من إغلاق أي نافذة متصفح ثانية أو برنامج موازين شغال على اللاب.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Simulator & Hardware Help */}
              <div className="pt-3 border-t border-white/10 flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] text-gray-400">تجربة سريعة بدون كابل:</span>
                  {[0.5, 1.25, 2.5, 0].map((val) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => scale.simulateWeight(val)}
                      className="px-2 py-0.5 rounded bg-white/5 hover:bg-emerald-500/20 text-gray-300 hover:text-emerald-300 text-[10px] font-mono border border-white/5 transition-all cursor-pointer"
                    >
                      {val === 0 ? 'تصفير' : `${val} كجم`}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => setShowScaleModal(false)}
                  className="px-4 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold transition-all cursor-pointer text-xs"
                >
                  إغلاق
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Alert Banner */}
        {alertMsg && (
          <div dir="rtl" className={`fixed bottom-5 left-1/2 -translate-x-1/2 z-50 w-[calc(100vw-2rem)] max-w-xl p-4 rounded-xl shadow-2xl border text-sm flex items-start gap-3 transition-all no-print flex-row-reverse ${
            alertMsg.type === 'success' ? 'bg-emerald-950 border-emerald-400/40 text-emerald-100' : 'bg-rose-950 border-rose-400/40 text-rose-100'
          }`}>
            {alertMsg.type === 'success' ? <CheckCircle2 className="w-5 h-5 shrink-0" /> : <AlertCircle className="w-5 h-5 shrink-0" />}
            <span className="whitespace-pre-line font-semibold leading-relaxed text-right flex-1">{alertMsg.text}</span>
          </div>
        )}
      </div>

      {/* Thermal receipt print-only view: Clean Customer Sales Receipt (No KOT) */}
      {receiptOrder && (
        <div className="hidden print:block print-area font-mono text-black bg-white" dir="rtl">
          <ReceiptLayout />
        </div>
      )}
    </>
  );
}
