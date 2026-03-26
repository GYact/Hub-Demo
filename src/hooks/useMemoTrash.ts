import { useCallback, useEffect, useRef, useState } from 'react';
import type { MemoTrash } from '../types';
import { fetchMemoTrash, upsertMemoTrash, deleteMemoTrash } from '../lib/offlineData';

export const useMemoTrash = () => {
  const [trash, setTrash] = useState<MemoTrash[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      const loaded = await fetchMemoTrash();
      setTrash(loaded);
      setIsLoading(false);
    };
    load();
  }, []);

  const debouncedSync = useCallback((syncFn: () => Promise<void>) => {
    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current);
    }
    syncTimeoutRef.current = setTimeout(async () => {
      setIsSyncing(true);
      await syncFn();
      setIsSyncing(false);
    }, 300);
  }, []);

  const addToTrash = useCallback((items: MemoTrash[]) => {
    if (items.length === 0) return;
    setTrash((prev) => {
      const existingIds = new Set(prev.map((item) => item.id));
      const additions = items.filter((item) => !existingIds.has(item.id));
      const next = [...additions, ...prev];
      debouncedSync(async () => {
        for (const item of additions) {
          await upsertMemoTrash(item);
        }
      });
      return next;
    });
  }, [debouncedSync]);

  const removeFromTrash = useCallback(async (id: string) => {
    setTrash((prev) => prev.filter((item) => item.id !== id));
    setIsSyncing(true);
    await deleteMemoTrash(id);
    setIsSyncing(false);
  }, []);

  const replaceTrash = useCallback((next: MemoTrash[]) => {
    setTrash((prev) => {
      const nextIds = new Set(next.map((item) => item.id));
      const removedIds = prev.filter((item) => !nextIds.has(item.id)).map((item) => item.id);
      debouncedSync(async () => {
        for (const item of next) {
          await upsertMemoTrash(item);
        }
        for (const id of removedIds) {
          await deleteMemoTrash(id);
        }
      });
      return next;
    });
  }, [debouncedSync]);

  const refresh = useCallback(async () => {
    setIsSyncing(true);
    const loaded = await fetchMemoTrash();
    setTrash(loaded);
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

  return {
    trash,
    isLoading,
    isSyncing,
    addToTrash,
    removeFromTrash,
    replaceTrash,
    refresh,
  };
};
