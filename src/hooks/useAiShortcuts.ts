import { useCallback, useEffect, useRef, useState } from "react";
import type { AiShortcut } from "../types";
import {
  fetchAiShortcuts,
  upsertAiShortcut,
  deleteAiShortcut,
  deduplicateAiShortcuts,
} from "../lib/offlineData";
import { getSyncUserId } from "../lib/offlineSync";

// Generate a deterministic ID based on user_id and order index
// This prevents duplicate records when the same shortcut is upserted multiple times
const generateShortcutId = (index: number): string => {
  const userId = getSyncUserId() ?? "local";
  return `${userId}-shortcut-${index}`;
};

const normalizeShortcuts = (shortcuts: AiShortcut[]) =>
  shortcuts
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((item, index) => ({
      ...item,
      order: index,
    }));

export const useAiShortcuts = (fallback: string[] = []) => {
  const [shortcuts, setShortcuts] = useState<AiShortcut[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pendingUpsertsRef = useRef<Map<string, AiShortcut>>(new Map());
  const pendingDeletesRef = useRef<Set<string>>(new Set());

  const flushPendingOps = useCallback(async () => {
    const upserts = Array.from(pendingUpsertsRef.current.values());
    const deletes = Array.from(pendingDeletesRef.current);
    pendingUpsertsRef.current.clear();
    pendingDeletesRef.current.clear();

    if (upserts.length === 0 && deletes.length === 0) return;

    // Delete first to remove stale records before upserting new ones
    for (const id of deletes) {
      await deleteAiShortcut(id);
    }
    for (const item of upserts) {
      await upsertAiShortcut(item);
    }
  }, []);

  // Cleanup timeout on unmount and flush pending operations
  useEffect(() => {
    return () => {
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }
      void flushPendingOps();
    };
  }, [flushPendingOps]);

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      let loaded = await fetchAiShortcuts();

      // Auto-cleanup: remove blank labels and deduplicate on load
      if (loaded.length > 0) {
        const seen = new Map<string, AiShortcut>();
        const removeIds: string[] = [];
        for (const s of loaded) {
          const key = s.label.trim().toLowerCase();
          if (!key || seen.has(key)) {
            removeIds.push(s.id);
          } else {
            seen.set(key, s);
          }
        }
        if (removeIds.length > 0) {
          for (const id of removeIds) {
            await deleteAiShortcut(id);
          }
          loaded = loaded.filter((s) => !removeIds.includes(s.id));
        }
      }

      if (loaded.length === 0 && fallback.length > 0) {
        const seeded = fallback.map((label, index) => ({
          id: generateShortcutId(index),
          label,
          order: index,
        }));
        setShortcuts(seeded);
        setIsLoading(false);
        setIsSyncing(true);
        for (const shortcut of seeded) {
          await upsertAiShortcut(shortcut);
        }
        setIsSyncing(false);
        return;
      }
      setShortcuts(normalizeShortcuts(loaded));
      setIsLoading(false);
    };

    load();
  }, [fallback]);

  const refresh = useCallback(async () => {
    setIsSyncing(true);
    const loaded = await fetchAiShortcuts();
    setShortcuts(normalizeShortcuts(loaded));
    setIsSyncing(false);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleMigration = () => {
      refresh().catch(() => undefined);
    };
    window.addEventListener("split-settings-migrated", handleMigration);
    return () => {
      window.removeEventListener("split-settings-migrated", handleMigration);
    };
  }, [refresh]);

  const setShortcutLabels = useCallback(
    (labels: string[]) => {
      setShortcuts((prev) => {
        // Filter out blank labels
        const validLabels = labels.filter((l) => l.trim());
        // Build a map of label → existing ID so we reuse IDs regardless of index shifts
        const prevIdByLabel = new Map<string, string>();
        for (const item of prev) {
          prevIdByLabel.set(item.label, item.id);
        }
        const next = validLabels.map((label, index) => ({
          id: prevIdByLabel.get(label) ?? generateShortcutId(index),
          label,
          order: index,
        }));
        const nextIds = new Set(next.map((item) => item.id));
        const removedIds = prev
          .filter((item) => !nextIds.has(item.id))
          .map((item) => item.id);

        // Accumulate pending operations so debounce resets never lose deletes
        for (const item of next) {
          pendingUpsertsRef.current.set(item.id, item);
          pendingDeletesRef.current.delete(item.id);
        }
        for (const id of removedIds) {
          pendingDeletesRef.current.add(id);
          pendingUpsertsRef.current.delete(id);
        }

        if (syncTimeoutRef.current) {
          clearTimeout(syncTimeoutRef.current);
        }
        syncTimeoutRef.current = setTimeout(async () => {
          setIsSyncing(true);
          await flushPendingOps();
          setIsSyncing(false);
        }, 400);

        return next;
      });
    },
    [flushPendingOps],
  );

  const cleanupDuplicates = useCallback(async () => {
    setIsSyncing(true);
    const removedCount = await deduplicateAiShortcuts();
    if (removedCount > 0) {
      await refresh();
    }
    setIsSyncing(false);
    return removedCount;
  }, [refresh]);

  return {
    shortcuts: normalizeShortcuts(shortcuts).map((item) => item.label),
    setShortcuts: setShortcutLabels,
    isLoading,
    isSyncing,
    refresh,
    cleanupDuplicates,
  };
};
