import { useState, useEffect, useCallback, useRef } from 'react';
import type { Tool } from '../types';
import {
  fetchTools,
  upsertTool,
  deleteTool as deleteToolFromDb,
} from '../lib/offlineData';

export const useTools = () => {
  const [tools, setTools] = useState<Tool[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  
  const syncTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Load tools on mount
  useEffect(() => {
    const loadTools = async () => {
      setIsLoading(true);

      const dbTools = await fetchTools();
      // Sort by order field if present
      dbTools.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      setTools(dbTools);

      setIsLoading(false);
    };

    loadTools();
  }, []);

  // Debounced sync to Supabase
  const debouncedSync = useCallback(async (tool: Tool) => {
    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current);
    }
    
    syncTimeoutRef.current = setTimeout(async () => {
      setIsSyncing(true);
      await upsertTool(tool);
      setIsSyncing(false);
    }, 500);
  }, []);

  // Update a tool
  const updateTool = useCallback((id: string, updates: Partial<Tool>) => {
    setTools(prev => {
      const updated = prev.map(t => {
        if (t.id === id) {
          const newTool = { ...t, ...updates };
          debouncedSync(newTool);
          return newTool;
        }
        return t;
      });
      return updated;
    });
  }, [debouncedSync]);

  // Add a new tool
  const addTool = useCallback(async () => {
    const newId = Math.random().toString(36).substr(2, 9);
    const newTool: Tool = {
      id: newId,
      name: '',
      description: '',
    };
    
    setTools(prev => [...prev, newTool]);
    
    setIsSyncing(true);
    await upsertTool(newTool);
    setIsSyncing(false);
    
    return newId;
  }, []);

  // Delete a tool
  const removeTool = useCallback(async (id: string) => {
    setTools(prev => prev.filter(t => t.id !== id));
    
    setIsSyncing(true);
    await deleteToolFromDb(id);
    setIsSyncing(false);
  }, []);

  // Reorder tools
  const reorderTools = useCallback(async (reorderedTools: Tool[]) => {
    // Update with new order values
    const toolsWithOrder = reorderedTools.map((tool, index) => ({
      ...tool,
      order: index,
    }));
    setTools(toolsWithOrder);

    // Sync all reordered tools to DB
    setIsSyncing(true);
    for (const tool of toolsWithOrder) {
      await upsertTool(tool);
    }
    setIsSyncing(false);
  }, []);

  // Refresh tools from Supabase
  const refreshTools = useCallback(async () => {
    setIsSyncing(true);
    const dbTools = await fetchTools();
    // Sort by order field if present
    dbTools.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    setTools(dbTools);
    setIsSyncing(false);
  }, []);

  // Restore tools from undo/redo state
  const restoreTools = useCallback(async (restoredTools: Tool[]) => {
    setTools(restoredTools);
    
    setIsSyncing(true);
    for (const tool of restoredTools) {
      await upsertTool(tool);
    }
    const currentDbTools = await fetchTools();
    const restoredIds = new Set(restoredTools.map(t => t.id));
    for (const dbTool of currentDbTools) {
      if (!restoredIds.has(dbTool.id)) {
        await deleteToolFromDb(dbTool.id);
      }
    }
    setIsSyncing(false);
  }, []);

  return {
    tools,
    isLoading,
    isSyncing,
    updateTool,
    addTool,
    removeTool,
    reorderTools,
    refreshTools,
    setTools: restoreTools,
  };
};
