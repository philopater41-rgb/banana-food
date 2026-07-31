import Dexie, { type Table as DexieTable } from 'dexie';

export interface LocalCategory {
  id: string;
  name: string;
}

export interface LocalItem {
  id: string;
  name: string;
  price: number;
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
  items: LocalCartItem[];
  subtotal: number;
  discount: number;
  discountRate?: number;
  tax: number;
  total: number;
  updatedAt: number;
}

export interface LocalSalesOrder {
  id: string;
  receiptNumber: string;
  shiftId: string;
  tableId: string | null;
  orderType: 'DINE_IN' | 'TAKEAWAY';
  paymentMethod: 'CASH' | 'INSTAPAY';
  status: 'COMPLETED' | 'CANCELLED';
  subtotal: number;
  discount: number;
  discountReason?: string | null;
  tax: number;
  total: number;
  createdAt: string;
  items: {
    id: string;
    itemId: string;
    qty: number;
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

class DayNightOfflineDB extends Dexie {
  categories!: DexieTable<LocalCategory, string>;
  items!: DexieTable<LocalItem, string>;
  modifiers!: DexieTable<LocalModifier, string>;
  halls!: DexieTable<LocalHall, string>;
  diningTables!: DexieTable<LocalTable, string>;
  carts!: DexieTable<LocalCart, string>;
  salesOrders!: DexieTable<LocalSalesOrder, string>;

  constructor() {
    super('DayNightOfflineDB');
    this.version(1).stores({
      categories: 'id, name',
      items: 'id, name, categoryId',
      modifiers: 'id, name',
      halls: 'id, name',
      diningTables: 'id, name, hallId, status',
      carts: 'id, orderType, tableId, updatedAt',
      salesOrders: 'id, shiftId, tableId, syncStatus, createdAt',
    });
  }
}

export const offlineDB = new DayNightOfflineDB();
