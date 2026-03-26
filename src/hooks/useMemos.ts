import { useState, useEffect, useCallback, useRef } from 'react';
import type { MemoTab, Memo, GroupColor } from '../types';
import {
  fetchMemoTabs,
  fetchMemos,
  upsertMemoTab,
  upsertMemo,
  deleteMemoTab as deleteTabFromDb,
  deleteMemo as deleteMemoFromDb,
  deleteMemosOfTab,
} from '../lib/offlineData';

const DEFAULT_TABS: MemoTab[] = [
  { id: 'features', name: 'Feature Ideas', color: 'blue', order: 0 },
  { id: 'business', name: 'Business Ideas', color: 'green', order: 1 },
];

export const useMemos = () => {
  const [tabs, setTabs] = useState<MemoTab[]>([]);
  const [memos, setMemos] = useState<Memo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Initial load with retry
  useEffect(() => {
    let retryCount = 0;
    const MAX_RETRIES = 2;

    const loadData = async () => {
      try {
        setLoadError(null);
        const [loadedTabs, loadedMemos] = await Promise.all([
          fetchMemoTabs(),
          fetchMemos(),
        ]);
        setTabs(loadedTabs.length > 0 ? loadedTabs : DEFAULT_TABS);
        setMemos(loadedMemos);
        setIsLoading(false);
      } catch (err) {
        console.error("Failed to load memos:", err);
        if (retryCount < MAX_RETRIES) {
          retryCount++;
          const delay = retryCount * 1500;
          console.log(`Retrying memo load (${retryCount}/${MAX_RETRIES}) in ${delay}ms...`);
          setTimeout(loadData, delay);
        } else {
          setLoadError(
            err instanceof Error ? err.message : "データの読み込みに失敗しました"
          );
          setIsLoading(false);
        }
      }
    };
    loadData();
  }, []);

  // Debounced sync
  const debouncedSync = useCallback((syncFn: () => Promise<void>) => {
    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current);
    }
    syncTimeoutRef.current = setTimeout(async () => {
      setIsSyncing(true);
      await syncFn();
      setIsSyncing(false);
    }, 500);
  }, []);

  // Tab operations
  const addTab = useCallback(async (name: string, color: GroupColor = 'blue') => {
    const newTab: MemoTab = {
      id: Math.random().toString(36).substr(2, 9),
      name,
      color,
      order: tabs.length,
    };
    
    setTabs(prev => [...prev, newTab]);
    debouncedSync(async () => {
      await upsertMemoTab(newTab);
    });
    
    return newTab.id;
  }, [tabs, debouncedSync]);

  const updateTab = useCallback((id: string, updates: Partial<MemoTab>) => {
    setTabs(prev => {
      const updated = prev.map(tab =>
        tab.id === id ? { ...tab, ...updates } : tab
      );
      
      const updatedTab = updated.find(t => t.id === id);
      if (updatedTab) {
        debouncedSync(async () => {
          await upsertMemoTab(updatedTab);
        });
      }
      
      return updated;
    });
  }, [debouncedSync]);

  const removeTab = useCallback(async (id: string) => {
    setTabs(prev => prev.filter(tab => tab.id !== id));
    setMemos(prev => prev.filter(memo => memo.tabId !== id));

    setIsSyncing(true);
    await deleteMemosOfTab(id);
    await deleteTabFromDb(id);
    setIsSyncing(false);
  }, [tabs, memos]);

  // Memo operations
  const addMemo = useCallback(async (tabId: string) => {
    const tabMemos = memos.filter(m => m.tabId === tabId);
    const newMemo: Memo = {
      id: Math.random().toString(36).substr(2, 9),
      tabId,
      title: '',
      content: '',
      order: tabMemos.length,
    };
    
    setMemos(prev => [...prev, newMemo]);
    debouncedSync(async () => {
      await upsertMemo(newMemo);
    });
    
    return newMemo.id;
  }, [memos, debouncedSync]);

  const updateMemo = useCallback((id: string, updates: Partial<Memo>) => {
    setMemos(prev => {
      const updated = prev.map(memo =>
        memo.id === id ? { ...memo, ...updates } : memo
      );
      
      const updatedMemo = updated.find(m => m.id === id);
      if (updatedMemo) {
        debouncedSync(async () => {
          await upsertMemo(updatedMemo);
        });
      }
      
      return updated;
    });
  }, [debouncedSync]);

  const removeMemo = useCallback(async (id: string) => {
    setMemos(prev => prev.filter(memo => memo.id !== id));

    setIsSyncing(true);
    await deleteMemoFromDb(id);
    setIsSyncing(false);
  }, [memos]);

  const restoreMemo = useCallback(async (memo: Memo) => {
    setMemos(prev => {
      if (prev.some(item => item.id === memo.id)) {
        return prev;
      }
      return [...prev, memo];
    });

    setIsSyncing(true);
    await upsertMemo(memo);
    setIsSyncing(false);
  }, []);

  const getMemosByTab = useCallback((tabId: string) => {
    return memos.filter(memo => memo.tabId === tabId);
  }, [memos]);

  const reorderTabs = useCallback((reorderedTabs: MemoTab[]) => {
    // Update order property for each tab
    const tabsWithOrder = reorderedTabs.map((tab, index) => ({
      ...tab,
      order: index,
    }));

    setTabs(tabsWithOrder);

    debouncedSync(async () => {
      for (const tab of tabsWithOrder) {
        await upsertMemoTab(tab);
      }
    });
  }, [debouncedSync]);

  // Reorder memos within a tab
  const reorderMemos = useCallback((reorderedMemos: Memo[]) => {
    // Update order property for each memo
    const memosWithOrder = reorderedMemos.map((memo, index) => ({
      ...memo,
      order: index,
    }));

    // Update only the memos that were reordered, keep others unchanged
    setMemos(prev => {
      const tabId = memosWithOrder[0]?.tabId;
      if (!tabId) return prev;
      
      // Keep memos from other tabs, replace memos from this tab
      const otherMemos = prev.filter(m => m.tabId !== tabId);
      return [...otherMemos, ...memosWithOrder];
    });

    debouncedSync(async () => {
      for (const memo of memosWithOrder) {
        await upsertMemo(memo);
      }
    });
  }, [debouncedSync]);

  const refresh = useCallback(async () => {
    setIsSyncing(true);
    setLoadError(null);
    try {
      const [loadedTabs, loadedMemos] = await Promise.all([
        fetchMemoTabs(),
        fetchMemos(),
      ]);
      setTabs(loadedTabs.length > 0 ? loadedTabs : DEFAULT_TABS);
      setMemos(loadedMemos);
    } catch (err) {
      console.error("Failed to refresh memos:", err);
      setLoadError(
        err instanceof Error ? err.message : "データの再読み込みに失敗しました"
      );
    } finally {
      setIsSyncing(false);
    }
  }, []);

  // Restore state for undo/redo
  const restoreState = useCallback(async (state: { tabs: MemoTab[]; memos: Memo[] }) => {
    setTabs(state.tabs);
    setMemos(state.memos);

    setIsSyncing(true);
    for (const tab of state.tabs) {
      await upsertMemoTab(tab);
    }
    for (const memo of state.memos) {
      await upsertMemo(memo);
    }
    setIsSyncing(false);
  }, []);

  return {
    tabs,
    memos,
    isLoading,
    loadError,
    isSyncing,
    addTab,
    updateTab,
    removeTab,
    addMemo,
    updateMemo,
    removeMemo,
    restoreMemo,
    getMemosByTab,
    reorderTabs,
    reorderMemos,
    refresh,
    restoreState,
  };
};
