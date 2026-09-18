import { create } from 'zustand';

export interface UserState {
  id: string;
  name: string;
  username: string;
  role: 'ADMIN' | 'CASHIER';
}

export interface ShiftState {
  id: string;
  userId: string;
  cashierName?: string | null;
  floatCash: number;
  expectedCash: number;
  expectedInstaPay: number;
  expectedVisa: number;
  expectedVodafoneCash?: number;
  expectedCashOut?: number;
  openedAt: string;
}

interface AppStore {
  user: UserState | null;
  activeShift: ShiftState | null;
  isOnline: boolean;
  activeHallId: string | null;
  activeTableId: string | null; // active table currently being viewed in POS
  
  setUser: (user: UserState | null) => void;
  setActiveShift: (shift: ShiftState | null) => void;
  setIsOnline: (status: boolean) => void;
  setActiveHallId: (hallId: string | null) => void;
  setActiveTableId: (tableId: string | null) => void;
  logout: () => void;
}

export const useAppStore = create<AppStore>((set) => ({
  user: typeof window !== 'undefined' ? (() => {
    try {
      return JSON.parse(localStorage.getItem('bf_user') || localStorage.getItem('dn_user') || 'null');
    } catch {
      return null;
    }
  })() : null,
  activeShift: typeof window !== 'undefined' ? (() => {
    try {
      return JSON.parse(localStorage.getItem('bf_shift') || localStorage.getItem('dn_shift') || 'null');
    } catch {
      return null;
    }
  })() : null,
  isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
  activeHallId: null,
  activeTableId: null,

  setUser: (user) => {
    if (user) {
      localStorage.setItem('bf_user', JSON.stringify(user));
      localStorage.removeItem('dn_user');
    } else {
      localStorage.removeItem('bf_user');
      localStorage.removeItem('dn_user');
    }
    set({ user });
  },

  setActiveShift: (shift) => {
    if (shift) {
      localStorage.setItem('bf_shift', JSON.stringify(shift));
      localStorage.removeItem('dn_shift');
    } else {
      localStorage.removeItem('bf_shift');
      localStorage.removeItem('dn_shift');
    }
    set({ activeShift: shift });
  },

  setIsOnline: (isOnline) => set({ isOnline }),
  setActiveHallId: (activeHallId) => set({ activeHallId }),
  setActiveTableId: (activeTableId) => set({ activeTableId }),

  logout: () => {
    localStorage.removeItem('bf_user');
    localStorage.removeItem('dn_user');
    localStorage.removeItem('bf_shift');
    localStorage.removeItem('dn_shift');
    set({ user: null, activeShift: null, activeHallId: null, activeTableId: null });
  },
}));
