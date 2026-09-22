import { useEffect, useState, useCallback } from 'react';
import { useAppStore } from '@/lib/store';
import { offlineDB } from '@/lib/dexie';

export function useOfflineSync() {
  const { isOnline, setIsOnline } = useAppStore();
  const [syncing, setSyncing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  // Update online status
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial check
    setIsOnline(navigator.onLine);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [setIsOnline]);

  // Count pending offline orders
  const refreshPendingCount = useCallback(async () => {
    try {
      const count = await offlineDB.salesOrders
        .where('syncStatus')
        .equals('PENDING')
        .count();
      setPendingCount(count);
    } catch (e) {
      console.error('Error counting pending orders:', e);
    }
  }, []);

  // Set up counter refresh interval
  useEffect(() => {
    refreshPendingCount();
    const interval = setInterval(refreshPendingCount, 5000);
    return () => clearInterval(interval);
  }, [refreshPendingCount]);

  // Sync function
  const triggerSync = useCallback(async () => {
    if (!isOnline || syncing) return;

    try {
      const pendingOrders = await offlineDB.salesOrders
        .where('syncStatus')
        .equals('PENDING')
        .toArray();

      if (pendingOrders.length === 0) return;

      setSyncing(true);
      console.log(`Syncing ${pendingOrders.length} pending orders to server...`);

      // Format orders to match the API expectation
      const ordersToSync = pendingOrders.map((order) => ({
        id: order.id,
        receiptNumber: order.receiptNumber,
        shiftId: order.shiftId,
        tableId: order.tableId,
        customerId: order.customerId || null,
        customerName: order.customerName || null,
        orderType: order.orderType,
        paymentMethod: order.paymentMethod,
        cashOutAmount: order.cashOutAmount || 0,
        cashOutFee: order.cashOutFee || 0,
        status: order.status,
        subtotal: order.subtotal,
        discount: order.discount,
        discountReason: order.discountReason,
        tax: order.tax,
        total: order.total,
        returnStatus: order.returnStatus || 'NONE',
        returnedAmount: order.returnedAmount || 0,
        returnReason: order.returnReason || null,
        createdAt: order.createdAt,
        items: order.items,
      }));

      const res = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orders: ordersToSync }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        // Update local sync status for successfully synced order IDs
        const syncedIds: string[] = data.syncedIds || [];
        for (const id of syncedIds) {
          await offlineDB.salesOrders.update(id, { syncStatus: 'SYNCED' });
        }
        if (data.errors && data.errors.length > 0) {
          console.warn('Some orders failed to sync:', data.errors);
        }
      } else {
        console.error('Batch sync endpoint failed:', data.error);
      }
    } catch (error) {
      console.error('Offline background sync error:', error);
    } finally {
      setSyncing(false);
      refreshPendingCount();
    }
  }, [isOnline, syncing, refreshPendingCount]);

  // Automatically trigger sync when coming online
  useEffect(() => {
    if (isOnline) {
      triggerSync();
    }
  }, [isOnline, triggerSync]);

  return {
    isOnline,
    syncing,
    pendingCount,
    triggerSync,
  };
}
