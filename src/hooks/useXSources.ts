import { useCallback, useState } from "react";
import type { XSource, XSourceType } from "../types";
import {
  fetchXSources,
  upsertXSource,
  deleteXSource,
  toggleXSource,
  updateXSource,
} from "../lib/offlineData";

export const useXSources = () => {
  const [sources, setSources] = useState<XSource[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await fetchXSources();
      setSources(data);
    } catch (err) {
      console.error("Failed to load X sources:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const addSource = useCallback(
    async (source: {
      name: string;
      sourceType: XSourceType;
      query: string;
      category?: string;
    }) => {
      const result = await upsertXSource({
        name: source.name,
        sourceType: source.sourceType,
        query: source.query,
        category: source.category,
        isActive: true,
      });
      if (result) {
        setSources((prev) => [result, ...prev]);
      }
      return result;
    },
    [],
  );

  const removeSource = useCallback(async (sourceId: string) => {
    const success = await deleteXSource(sourceId);
    if (success) {
      setSources((prev) => prev.filter((s) => s.id !== sourceId));
    }
    return success;
  }, []);

  const toggle = useCallback(async (sourceId: string, isActive: boolean) => {
    const success = await toggleXSource(sourceId, isActive);
    if (success) {
      setSources((prev) =>
        prev.map((s) => (s.id === sourceId ? { ...s, isActive } : s)),
      );
    }
    return success;
  }, []);

  const update = useCallback(
    async (
      sourceId: string,
      updates: {
        name?: string;
        sourceType?: XSourceType;
        query?: string;
        category?: string | null;
      },
    ) => {
      const success = await updateXSource(sourceId, updates);
      if (success) {
        setSources((prev) =>
          prev.map((s) =>
            s.id === sourceId
              ? {
                  ...s,
                  ...(updates.name !== undefined && { name: updates.name }),
                  ...(updates.sourceType !== undefined && {
                    sourceType: updates.sourceType,
                  }),
                  ...(updates.query !== undefined && { query: updates.query }),
                  ...(updates.category !== undefined && {
                    category: updates.category || undefined,
                  }),
                }
              : s,
          ),
        );
      }
      return success;
    },
    [],
  );

  const activeSources = sources.filter((s) => s.isActive);

  return {
    sources,
    activeSources,
    isLoading,
    load,
    addSource,
    removeSource,
    toggle,
    update,
  };
};
