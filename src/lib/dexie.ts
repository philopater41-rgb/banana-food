import Dexie, { type Table as DexieTable } from 'dexie';

export interface LocalCategory {
  id: string;
  name: string;
}

export interface LocalItem {
  id: string;
  name: string;
  price: number;
  cost?: number;
  categoryId: string;
}

export interface LocalModifier {
  id: string;
  name: string;
  priceImpact: number;
}

export interface LocalHall {
  id: string;
  name: string;
}

export interface LocalTable {
  id: string;
  name: string;
  hallId: string;
  status: string; // "VACANT" | "OCCUPIED" | "BILLING"
}

export interface LocalCustomer {
  id: string;
  name: string;
  phone?: string | null;
  type: string; // "INDIVIDUAL" | "COMPANY" | "HOSPITAL" | "CAFE" | "OTHER"
  discountRate: number; // e.g. 10.0 for 10%
  notes?: string | null;
}

export interface LocalDiscountReason {
  id: string;
  reason: string;
  rate?: number | null;
}

export interface LocalCartItemModifier {
  modifierId: string;
  name: string;
  unitPriceImpact: number;
}

export interface LocalCartItem {
  id: string; // client-side temp item uuid
  itemId: string;
  name: string;
  qty: number;
  unit?: string;
  costPrice?: number;
  unitPrice: number;
  totalPrice: number;
  comment?: string | null;
  modifiers: LocalCartItemModifier[];
}

export interface LocalCart {
  id: string; // key: tableId or "takeaway"
  orderType: 'DINE_IN' | 'TAKEAWAY';
  tableId: string | null;
  tableName: string | null;
  customerId?: string | null;
  customerName?: string | null;
  items: LocalCartItem[];
  subtotal: number;
  discount: number;
  discountRate?: number;
  discountReason?: string | null;
  tax: number;
  total: number;
  updatedAt: number;
}

export type PaymentMethodType = 'CASH' | 'VISA' | 'INSTAPAY' | 'VODAFONE_CASH' | 'CASH_OUT';

export interface LocalSalesOrder {
  id: string;
  receiptNumber: string;
  shiftId: string;
  tableId: string | null;
  customerId?: string | null;
  customerName?: string | null;
  orderType: 'DINE_IN' | 'TAKEAWAY';
  paymentMethod: PaymentMethodType;
  cashOutAmount?: number;
  cashOutFee?: number;
  status: 'COMPLETED' | 'CANCELLED' | 'REFUNDED';
  subtotal: number;
  discount: number;
  discountReason?: string | null;
  tax: number;
  total: number;
  returnStatus?: 'NONE' | 'PARTIAL' | 'FULL';
  returnedAmount?: number;
  returnReason?: string | null;
  createdAt: string;
  items: {
    id: string;
    itemId: string;
    qty: number;
    unit?: string;
    unitPrice: number;
    totalPrice: number;
    comment?: string | null;
    modifiers: {
      modifierId: string;
      unitPriceImpact: number;
    }[];
  }[];
  syncStatus: 'PENDING' | 'SYNCED' | 'FAILED';
}

export interface LocalOrderReturn {
  id: string;
  orderId: string;
  receiptNumber?: string | null;
  shiftId?: string | null;
  refundAmount: number;
  paymentMethod: string;
  reason: string;
  cashierName?: string | null;
  restockItems: boolean;
  createdAt: string;
  items: {
    itemId: string;
    quantity: number;
    refundPrice: number;
  }[];
  syncStatus: 'PENDING' | 'SYNCED' | 'FAILED';
}

class BananaFoodOfflineDB extends Dexie {
  categories!: DexieTable<LocalCategory, string>;
  items!: DexieTable<LocalItem, string>;
  modifiers!: DexieTable<LocalModifier, string>;
  halls!: DexieTable<LocalHall, string>;
  diningTables!: DexieTable<LocalTable, string>;
  carts!: DexieTable<LocalCart, string>;
  salesOrders!: DexieTable<LocalSalesOrder, string>;
  customers!: DexieTable<LocalCustomer, string>;
  discountReasons!: DexieTable<LocalDiscountReason, string>;
  orderReturns!: DexieTable<LocalOrderReturn, string>;

  constructor() {
    super('BananaFoodOfflineDB');
    this.version(1).stores({
      categories: 'id, name',
      items: 'id, name, categoryId',
      modifiers: 'id, name',
      halls: 'id, name',
      diningTables: 'id, name, hallId, status',
      carts: 'id, orderType, tableId, updatedAt',
      salesOrders: 'id, shiftId, tableId, syncStatus, createdAt',
    });
    this.version(2).stores({
      categories: 'id, name',
      items: 'id, name, categoryId',
      modifiers: 'id, name',
      halls: 'id, name',
      diningTables: 'id, name, hallId, status',
      carts: 'id, orderType, tableId, updatedAt',
      salesOrders: 'id, shiftId, tableId, customerId, syncStatus, createdAt',
      customers: 'id, name, phone, type',
      discountReasons: 'id, reason',
      orderReturns: 'id, orderId, shiftId, syncStatus, createdAt',
    });
  }
}

export const offlineDB = new BananaFoodOfflineDB();
