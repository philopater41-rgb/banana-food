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
      const u = JSON.parse(localStorage.getItem('dn_user') || 'null');
      if (u && typeof u.name === 'string') {
        if (/bon/i.test(u.name) || /مون/.test(u.name)) {
          u.name = u.role === 'ADMIN' ? 'إدارة BANANA FOOD' : 'كاشير بانانا فود';
          localStorage.setItem('dn_user', JSON.stringify(u));
        }
      }
      return u;
    } catch {
      return null;
    }
  })() : null,
  activeShift: typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('dn_shift') || 'null') : null,
  isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
  activeHallId: null,
  activeTableId: null,

  setUser: (user) => {
    if (user) {
      if (user.name && (/bon/i.test(user.name) || /مون/.test(user.name))) {
        user.name = user.role === 'ADMIN' ? 'إدارة BANANA FOOD' : 'كاشير بانانا فود';
      }
      localStorage.setItem('dn_user', JSON.stringify(user));
    } else {
      localStorage.removeItem('dn_user');
    }
    set({ user });
  },

  setActiveShift: (shift) => {
    if (shift) {
      localStorage.setItem('dn_shift', JSON.stringify(shift));
    } else {
      localStorage.removeItem('dn_shift');
    }
    set({ activeShift: shift });
  },

  setIsOnline: (isOnline) => set({ isOnline }),
  
  setActiveHallId: (activeHallId) => set({ activeHallId }),
  
  setActiveTableId: (activeTableId) => set({ activeTableId }),

  logout: () => {
    localStorage.removeItem('dn_user');
    localStorage.removeItem('dn_shift');
    set({ user: null, activeShift: null, activeHallId: null, activeTableId: null });
  },
}));
