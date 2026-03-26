import { useCallback, useEffect, useRef, useState } from 'react';
import type { DataCatalogItem } from '../types';
import {
  fetchDataCatalogItems,
  upsertDataCatalogItem,
  deleteDataCatalogItem,
} from '../lib/offlineData';

const withOrder = (items: DataCatalogItem[]) =>
  items.map((item, index) => ({
    ...item,
    order: index,
  }));

export const useDataCatalogItems = (defaults: DataCatalogItem[] = []) => {
  const [items, setItems] = useState<DataCatalogItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      const loaded = await fetchDataCatalogItems();
      if (loaded.length === 0 && defaults.length > 0) {
        const seeded = withOrder(defaults);
        setItems(seeded);
        setIsLoading(false);
        setIsSyncing(true);
        for (const item of seeded) {
          await upsertDataCatalogItem(item);
        }
        setIsSyncing(false);
        return;
      }
      setItems(withOrder(loaded));
      setIsLoading(false);
    };

    load();
  }, [defaults]);

  const debouncedSync = useCallback((syncFn: () => Promise<void>) => {
    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current);
    }
    syncTimeoutRef.current = setTimeout(async () => {
      setIsSyncing(true);
      await syncFn();
      setIsSyncing(false);
    }, 400);
  }, []);

  const refresh = useCallback(async () => {
    setIsSyncing(true);
    const loaded = await fetchDataCatalogItems();
    setItems(withOrder(loaded));
    setIsSyncing(false);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleMigration = () => {
      refresh().catch(() => undefined);
    };
    window.addEventListener('split-settings-migrated', handleMigration);
    return () => {
      window.removeEventListener('split-settings-migrated', handleMigration);
    };
  }, [refresh]);

  const addItem = useCallback((item: DataCatalogItem) => {
    setItems((prev) => {
      const next = withOrder([...prev, item]);
      const added = next[next.length - 1];
      debouncedSync(async () => {
        await upsertDataCatalogItem(added);
      });
      return next;
    });
  }, [debouncedSync]);

  const updateItem = useCallback((id: string, updates: Partial<DataCatalogItem>) => {
    setItems((prev) => {
      const next = prev.map((item) => (item.id === id ? { ...item, ...updates } : item));
      const updatedItem = next.find((item) => item.id === id);
      if (updatedItem) {
        debouncedSync(async () => {
          await upsertDataCatalogItem(updatedItem);
        });
      }
      return next;
    });
  }, [debouncedSync]);

  const removeItem = useCallback(async (id: string) => {
    setItems((prev) => withOrder(prev.filter((item) => item.id !== id)));
    setIsSyncing(true);
    await deleteDataCatalogItem(id);
    setIsSyncing(false);
  }, []);

  const reorderItems = useCallback((nextItems: DataCatalogItem[]) => {
    const ordered = withOrder(nextItems);
    setItems(ordered);
    debouncedSync(async () => {
      for (const item of ordered) {
        await upsertDataCatalogItem(item);
      }
    });
  }, [debouncedSync]);

  return {
    items,
    isLoading,
    isSyncing,
    addItem,
    updateItem,
    removeItem,
    reorderItems,
    refresh,
    setItems,
  };
};
