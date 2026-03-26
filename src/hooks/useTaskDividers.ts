import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TaskDivider } from '../types';
import {
  fetchTaskDividers,
  upsertTaskDivider,
  deleteTaskDivider,
  deleteTaskDividersByList,
} from '../lib/offlineData';

const PLACEHOLDER_POSITION = -1;

const normalizeDividers = (listId: string, dividers: TaskDivider[]) =>
  dividers
    .map((divider, index) => ({
      ...divider,
      listId,
      position: typeof divider.position === 'number' ? divider.position : index,
    }))
    .sort((a, b) => {
      const posDiff = a.position - b.position;
      if (posDiff !== 0) return posDiff;
      const aCreated = String(a.createdAt ?? '');
      const bCreated = String(b.createdAt ?? '');
      if (aCreated !== bCreated) return aCreated.localeCompare(bCreated);
      return String(a.id).localeCompare(String(b.id));
    });

export const useTaskDividers = () => {
  const [dividers, setDividers] = useState<TaskDivider[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const syncTimeoutsRef = useRef<Record<string, NodeJS.Timeout>>({});

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      const loaded = await fetchTaskDividers();
      setDividers(loaded);
      setIsLoading(false);
    };
    load();
  }, []);

  const scheduleSync = useCallback((listId: string, next: TaskDivider[], removedIds: string[]) => {
    const timeouts = syncTimeoutsRef.current;
    if (timeouts[listId]) {
      clearTimeout(timeouts[listId]);
    }
    timeouts[listId] = setTimeout(async () => {
      setIsSyncing(true);
      for (const divider of next) {
        await upsertTaskDivider(divider);
      }
      for (const id of removedIds) {
        await deleteTaskDivider(id);
      }
      setIsSyncing(false);
    }, 300);
  }, []);

  const updateDividers = useCallback((listId: string, nextDividers: TaskDivider[]) => {
    setDividers((prev) => {
      const prevList = prev.filter((divider) => divider.listId === listId);
      const normalized = nextDividers.length > 0
        ? normalizeDividers(listId, nextDividers)
        : [
            {
              id: `divider-placeholder-${listId}`,
              listId,
              position: PLACEHOLDER_POSITION,
              color: 'rose',
            },
          ];
      const nextIds = new Set(normalized.map((divider) => divider.id));
      const removedIds = prevList.filter((divider) => !nextIds.has(divider.id)).map((divider) => divider.id);

      scheduleSync(listId, normalized, removedIds);
      return [...prev.filter((divider) => divider.listId !== listId), ...normalized];
    });
  }, [scheduleSync]);

  const removeDividersForList = useCallback(async (listId: string) => {
    setDividers((prev) => prev.filter((divider) => divider.listId !== listId));
    setIsSyncing(true);
    await deleteTaskDividersByList(listId);
    setIsSyncing(false);
  }, []);

  const dividersByList = useMemo(() => {
    const map: Record<string, TaskDivider[]> = {};
    for (const divider of dividers) {
      if (divider.position < 0) continue;
      if (!map[divider.listId]) {
        map[divider.listId] = [];
      }
      map[divider.listId].push(divider);
    }
    Object.keys(map).forEach((listId) => {
      map[listId] = normalizeDividers(listId, map[listId]);
    });
    return map;
  }, [dividers]);

  const dividerListIds = useMemo(() => {
    return new Set(dividers.map((divider) => divider.listId));
  }, [dividers]);

  const refresh = useCallback(async () => {
    setIsSyncing(true);
    const loaded = await fetchTaskDividers();
    setDividers(loaded);
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
    dividersByList,
    dividerListIds,
    updateDividers,
    removeDividersForList,
    isLoading,
    isSyncing,
    refresh,
  };
};
