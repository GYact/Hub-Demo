import { useState, useEffect, useCallback, useRef } from 'react';
import type { OrgNode, Position } from '../types';
import {
  fetchNodes,
  upsertNode,
  deleteNode as deleteNodeFromDb,
} from '../lib/offlineData';

export const useNodes = () => {
  const [nodes, setNodes] = useState<OrgNode[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  
  // Debounce timer ref
  const syncTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Load nodes on mount
  useEffect(() => {
    const loadNodes = async () => {
      setIsLoading(true);
      const dbNodes = await fetchNodes();
      setNodes(dbNodes);
      
      setIsLoading(false);
    };
    
    loadNodes();
  }, []);

  // Debounced sync to Supabase
  const debouncedSync = useCallback(async (node: OrgNode) => {
    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current);
    }
    
    syncTimeoutRef.current = setTimeout(async () => {
      setIsSyncing(true);
      await upsertNode(node);
      setIsSyncing(false);
    }, 500);
  }, []);

  // Update a node
  const updateNode = useCallback((id: string, updates: Partial<OrgNode>) => {
    setNodes(prev => {
      const updated = prev.map(n => {
        if (n.id === id) {
          const newNode = { ...n, ...updates };
          debouncedSync(newNode);
          return newNode;
        }
        return n;
      });
      return updated;
    });
  }, [debouncedSync]);

  // Update node position
  const updateNodePosition = useCallback((id: string, position: Position) => {
    updateNode(id, { position });
  }, [updateNode]);

  // Add a new node
  const addNode = useCallback(async (node: OrgNode) => {
    setNodes(prev => [...prev, node]);
    
    setIsSyncing(true);
    await upsertNode(node);
    setIsSyncing(false);
  }, []);

  // Delete a node
  const removeNode = useCallback(async (id: string) => {
    // Get nodes that reference this node before removing
    const affectedNodes = nodes.filter(n => n.id !== id && n.linkedTo.includes(id));
    
    setNodes(prev => prev
      .filter(n => n.id !== id)
      .map(n => ({
        ...n,
        linkedTo: n.linkedTo.filter(lid => lid !== id)
      }))
    );
    
    setIsSyncing(true);
    await deleteNodeFromDb(id);
    
    // Update linkedTo references in other nodes
    for (const node of affectedNodes) {
      await upsertNode({
        ...node,
        linkedTo: node.linkedTo.filter(lid => lid !== id)
      });
    }
    setIsSyncing(false);
  }, [nodes]);

  // Refresh nodes from Supabase
  const refreshNodes = useCallback(async () => {
    setIsSyncing(true);
    const dbNodes = await fetchNodes();
    setNodes(dbNodes);
    setIsSyncing(false);
  }, []);

  return {
    nodes,
    isLoading,
    isSyncing,
    updateNode,
    updateNodePosition,
    addNode,
    removeNode,
    refreshNodes,
  };
};
