import { useState, useEffect, useCallback } from 'react';
import { offlineDb } from '../lib/offlineDb';
import { upsertLocalRow, deleteLocalRow } from '../lib/offlineStore';
import { useAuth } from '../contexts/AuthContext';

/**
 * Base interface for entities managed by useCRUD.
 * All entities must have at least an id and user_id.
 */
export interface BaseEntity {
  id: string;
  user_id: string;
  order_index?: number;
  created_at?: string;
  updated_at?: string;
}

/**
 * Configuration options for useCRUD hook.
 */
export interface UseCRUDOptions<T extends BaseEntity> {
  /** Supabase table name */
  tableName: string;
  /** localStorage key for offline fallback */
  localStorageKey: string;
  /** Function to create a new empty item with default values */
  createEmptyItem: (userId: string, currentLength: number) => Omit<T, 'id' | 'user_id'>;
  /** ID prefix for generated IDs (e.g., 'edu', 'exp') */
  idPrefix: string;
  /** Column to order by when fetching (default: 'order_index') */
  orderColumn?: string;
  /** Order direction (default: 'ascending') */
  orderDirection?: 'ascending' | 'descending';
}

/**
 * Return type for useCRUD hook.
 */
export interface UseCRUDReturn<T extends BaseEntity> {
  items: T[];
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
  add: () => Promise<T | null>;
  update: (id: string, updates: Partial<T>) => Promise<void>;
  remove: (id: string) => Promise<void>;
  reload: () => Promise<void>;
}

/**
 * Generate a unique ID with the given prefix.
 */
const generateId = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

/**
 * Generic CRUD hook for Supabase entities with localStorage fallback.
 * 
 * @example
 * ```typescript
 * const { items, add, update, remove } = useCRUD<Education>({
 *   tableName: 'educations',
 *   localStorageKey: 'hub-workspace-educations',
 *   idPrefix: 'edu',
 *   createEmptyItem: (userId, length) => ({
 *     school: '',
 *     degree: '',
 *     order_index: length,
 *   }),
 * });
 * ```
 */
export function useCRUD<T extends BaseEntity>(
  options: UseCRUDOptions<T>
): UseCRUDReturn<T> {
  const {
    tableName,
    localStorageKey,
    createEmptyItem,
    idPrefix,
    orderColumn = 'order_index',
    orderDirection = 'ascending',
  } = options;

  const { user } = useAuth();
  const [items, setItems] = useState<T[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load items from offline store
  const load = useCallback(async () => {
    if (!user) {
      setItems([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const rows = await offlineDb
        .table(tableName)
        .where('user_id')
        .equals(user.id)
        .toArray();
      const sorted = [...(rows as T[])].sort((a, b) => {
        const aValue = (a as Record<string, unknown>)[orderColumn] as number | undefined;
        const bValue = (b as Record<string, unknown>)[orderColumn] as number | undefined;
        if (aValue === undefined || bValue === undefined) return 0;
        return orderDirection === 'ascending' ? aValue - bValue : bValue - aValue;
      });
      setItems(sorted);
    } catch (err) {
      console.error(`Error loading ${tableName}:`, err);
      setError(`Failed to load ${tableName}`);
    }

    setIsLoading(false);
  }, [user, tableName, localStorageKey, orderColumn, orderDirection]);

  // Add new item
  const add = useCallback(async (): Promise<T | null> => {
    if (!user) return null;

    setIsSaving(true);
    setError(null);

    const newItem = {
      id: generateId(idPrefix),
      user_id: user.id,
      ...createEmptyItem(user.id, items.length),
    } as T;

    try {
      await upsertLocalRow(tableName, newItem as unknown as Record<string, unknown>);
      setItems(prev => [...prev, newItem]);
    } catch (err) {
      console.error(`Error adding ${tableName}:`, err);
      setError(`Failed to add item`);
      setIsSaving(false);
      return null;
    }

    setIsSaving(false);
    return newItem;
  }, [user, items, tableName, localStorageKey, idPrefix, createEmptyItem]);

  // Update item
  const update = useCallback(
    async (id: string, updates: Partial<T>) => {
      if (!user) return;

      setIsSaving(true);
      setError(null);

      // Optimistic update
      setItems(prevItems => prevItems.map(item =>
        item.id === id
          ? { ...item, ...updates, updated_at: new Date().toISOString() }
          : item
      ));

      const updatedItem = items.find(item => item.id === id);
      if (updatedItem) {
        try {
          await upsertLocalRow(tableName, {
            ...updatedItem,
            ...updates,
            updated_at: new Date().toISOString(),
          } as unknown as Record<string, unknown>);
        } catch (err) {
          console.error(`Error updating ${tableName}:`, err);
          setError(`Failed to update item`);
        }
      }

      setIsSaving(false);
    },
    [user, tableName, localStorageKey]
  );

  // Remove item
  const remove = useCallback(
    async (id: string) => {
      if (!user) return;

      setIsSaving(true);
      setError(null);

      try {
        await deleteLocalRow(tableName, id);
        setItems(prev => prev.filter(item => item.id !== id));
      } catch (err) {
        console.error(`Error deleting ${tableName}:`, err);
        setError(`Failed to delete item`);
      }

      setIsSaving(false);
    },
    [user, items, tableName, localStorageKey]
  );

  // Load on mount
  useEffect(() => {
    load();
  }, [load]);

  return {
    items,
    isLoading,
    isSaving,
    error,
    add,
    update,
    remove,
    reload: load,
  };
}
