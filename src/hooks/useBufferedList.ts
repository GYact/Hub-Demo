import { useState, useEffect, useCallback, useRef } from 'react';
import { BaseEntity } from './useCRUD';

interface UseBufferedListOptions<T extends BaseEntity> {
  items: T[];
  updateRemote: (id: string, updates: Partial<T>) => Promise<void>;
}

export function useBufferedList<T extends BaseEntity>({ 
  items, 
  updateRemote 
}: UseBufferedListOptions<T>) {
  const [localItems, setLocalItems] = useState<T[]>(items);
  const [changedItemIds, setChangedItemIds] = useState<Set<string>>(new Set());
  
  // Sync with remote items when they change (e.g. initial load, add/delete)
  // We only sync if the length changes or if we haven't touched the item locally
  // However, simple length check is good for add/delete.
  // For external updates, it's harder. usage of useCRUD implies we are the main editor.
  // So we sync when items reference changes, but we try to preserve local edits?
  // Actually, standard pattern: if `items` changes, we reset `localItems` IF we assume
  // no concurrent editing. But here we want to keep `localItems` as the "draft".
  // A safe bet: Update localItems when `items` length changes (added/removed).
  // Or if `items` changes and we have no pending changes?
  
  // Let's use a simpler approach: Initialize with items. 
  // Watch for add/removes by comparing IDs.
  
  const prevItemsRef = useRef(items);

  useEffect(() => {
    const prevItems = prevItemsRef.current;
    if (changedItemIds.size === 0) {
      if (prevItems !== items) {
        setLocalItems(items);
      }
      prevItemsRef.current = items;
      return;
    }

    const currentIds = new Set(items.map(i => i.id));
    const prevIds = new Set(prevItems.map(i => i.id));
    
    // Check if items were added or removed
    const hasAddedOrRemoved = 
      items.length !== prevItems.length || 
      items.some(i => !prevIds.has(i.id)) ||
      prevItems.some(i => !currentIds.has(i.id));

    if (hasAddedOrRemoved) {
      setLocalItems(prevLocal => {
        // Keep existing local edits for items that still exist
        const localMap = new Map(prevLocal.map(i => [i.id, i]));
        
        return items.map(serverItem => {
          // If we have a local version and it's marked as changed, keep local.
          // Otherwise take server item (which might be the newly added one).
          if (localMap.has(serverItem.id) && changedItemIds.has(serverItem.id)) {
            return localMap.get(serverItem.id)!;
          }
          return serverItem;
        });
      });
    }
    
    prevItemsRef.current = items;
  }, [items, changedItemIds]);

  const updateLocal = useCallback((id: string, field: keyof T, value: unknown) => {
    setLocalItems(prev => prev.map(item => {
      if (item.id === id) {
        return { ...item, [field]: value };
      }
      return item;
    }));
    setChangedItemIds(prev => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  const saveAll = useCallback(async () => {
    const promises = Array.from(changedItemIds).map(id => {
      const item = localItems.find(i => i.id === id);
      if (!item) return Promise.resolve();
      
      // Find what changed vs remote? 
      // Simplified: just send the whole item or relevant fields?
      // useCRUD update takes Partial<T>.
      // We can send the whole object or diff it.
      // Sending whole object is safer/easier if API allows.
      // But we should exclude created_at/updated_at/etc if they shouldn't be sent.
      // But useCRUD handles that (it's typed Partial<T>).
      
      const { id: _, user_id: __, created_at: ___, updated_at: ____, ...updates } = item;
      return updateRemote(id, updates as unknown as Partial<T>);
    });

    await Promise.all(promises);
    setChangedItemIds(new Set());
  }, [changedItemIds, localItems, updateRemote]);

  const reset = useCallback(() => {
    setLocalItems(items);
    setChangedItemIds(new Set());
  }, [items]);

  return {
    localItems,
    updateLocal,
    saveAll,
    isDirty: changedItemIds.size > 0,
    reset
  };
}
