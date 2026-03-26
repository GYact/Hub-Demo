import { useCallback, useEffect, useState } from 'react';
import type { AiAutomation } from '../types';
import { fetchAiAutomations, upsertAiAutomation, deleteAiAutomation } from '../lib/offlineData';
import { getSyncUserId } from '../lib/offlineSync';

export const useAiAutomations = () => {
  const [automations, setAutomations] = useState<AiAutomation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await fetchAiAutomations();
      setAutomations(data);
    } catch (err) {
      console.error('Failed to load automations:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const refresh = useCallback(async () => {
    setIsSyncing(true);
    await load();
    setIsSyncing(false);
  }, [load]);

  const createAutomation = useCallback(async (automation: Omit<AiAutomation, 'id' | 'createdAt' | 'updatedAt'>) => {
    const userId = getSyncUserId() ?? 'local';
    const id = `${userId}-automation-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const newAutomation: AiAutomation = {
      ...automation,
      id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setIsSyncing(true);
    try {
      await upsertAiAutomation(newAutomation);
      setAutomations((prev) => [...prev, newAutomation]);
    } finally {
      setIsSyncing(false);
    }

    return newAutomation;
  }, []);

  const updateAutomation = useCallback(async (id: string, updates: Partial<AiAutomation>) => {
    setIsSyncing(true);
    try {
      const existing = automations.find((a) => a.id === id);
      if (!existing) return;

      const updated: AiAutomation = {
        ...existing,
        ...updates,
        updatedAt: new Date().toISOString(),
      };

      await upsertAiAutomation(updated);
      setAutomations((prev) => prev.map((a) => (a.id === id ? updated : a)));
    } finally {
      setIsSyncing(false);
    }
  }, [automations]);

  const toggleEnabled = useCallback(async (id: string) => {
    const automation = automations.find((a) => a.id === id);
    if (!automation) return;

    await updateAutomation(id, { enabled: !automation.enabled });
  }, [automations, updateAutomation]);

  const removeAutomation = useCallback(async (id: string) => {
    setIsSyncing(true);
    try {
      await deleteAiAutomation(id);
      setAutomations((prev) => prev.filter((a) => a.id !== id));
    } finally {
      setIsSyncing(false);
    }
  }, []);

  return {
    automations,
    isLoading,
    isSyncing,
    refresh,
    createAutomation,
    updateAutomation,
    toggleEnabled,
    removeAutomation,
  };
};
