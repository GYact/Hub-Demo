import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  AiNotification,
  AiNotificationCategory,
  AiNotificationApiKey,
  SlackIntegration,
  NotificationSource,
  NotificationPriority,
} from '../types';
import {
  fetchAiNotifications,
  upsertAiNotification,
  deleteAiNotification,
  fetchAiNotificationCategories,
  upsertAiNotificationCategory,
  deleteAiNotificationCategory,
  fetchAiNotificationApiKeys,
  createAiNotificationApiKey,
  deleteAiNotificationApiKey,
  toggleAiNotificationApiKey,
  fetchSlackIntegrations,
  upsertSlackIntegration,
  deleteSlackIntegration,
  toggleSlackIntegration,
  updateSlackIntegrationFields,
} from '../lib/offlineData';
import { supabase } from '../lib/offlineSync';
import { useAuth } from '../contexts/AuthContext';
import { useNotificationBadge } from '../contexts/NotificationContext';
import type { RealtimeChannel } from '@supabase/supabase-js';

export const useAiNotifications = () => {
  const { user } = useAuth();
  const { markAsRead: badgeMarkAsRead, markAllAsRead: badgeMarkAllAsRead } = useNotificationBadge();
  const [notifications, setNotifications] = useState<AiNotification[]>([]);
  const [categories, setCategories] = useState<AiNotificationCategory[]>([]);
  const [apiKeys, setApiKeys] = useState<AiNotificationApiKey[]>([]);
  const [slackIntegrations, setSlackIntegrations] = useState<SlackIntegration[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);

  // Computed values
  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.isRead).length,
    [notifications]
  );

  const unreadNotifications = useMemo(
    () => notifications.filter((n) => !n.isRead),
    [notifications]
  );

  // Load all data
  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const [notifs, cats, keys, slacks] = await Promise.all([
        fetchAiNotifications(),
        fetchAiNotificationCategories(),
        fetchAiNotificationApiKeys(),
        fetchSlackIntegrations(),
      ]);
      setNotifications(notifs);
      setCategories(cats);
      setApiKeys(keys);
      setSlackIntegrations(slacks);
    } catch (err) {
      console.error('Failed to load notifications:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Setup Realtime subscription
  useEffect(() => {
    load();

    if (!supabase || !user?.id) return;

    // Subscribe to realtime changes
    const channel = supabase
      .channel('ai_notifications_realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'ai_notifications',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const newNotification: AiNotification = {
            id: payload.new.id,
            userId: payload.new.user_id,
            categoryId: payload.new.category_id,
            source: payload.new.source,
            priority: payload.new.priority,
            title: payload.new.title,
            body: payload.new.body,
            metadata: payload.new.metadata,
            isRead: payload.new.is_read,
            createdAt: payload.new.created_at,
            updatedAt: payload.new.updated_at,
          };
          setNotifications((prev) => [newNotification, ...prev]);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'ai_notifications',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          setNotifications((prev) =>
            prev.map((n) =>
              n.id === payload.new.id
                ? {
                    ...n,
                    isRead: payload.new.is_read,
                    updatedAt: payload.new.updated_at,
                  }
                : n
            )
          );
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'ai_notifications',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          setNotifications((prev) => prev.filter((n) => n.id !== payload.old.id));
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (channelRef.current && supabase) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [user?.id, load]);

  const refresh = useCallback(async () => {
    setIsSyncing(true);
    await load();
    setIsSyncing(false);
  }, [load]);

  // Notification CRUD
  const markAsRead = useCallback(async (notificationId: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === notificationId ? { ...n, isRead: true } : n))
    );
    // Sync with NotificationContext (badge)
    await badgeMarkAsRead(notificationId);
  }, [badgeMarkAsRead]);

  const markAllAsRead = useCallback(async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    // Sync with NotificationContext (badge)
    await badgeMarkAllAsRead();
  }, [badgeMarkAllAsRead]);

  const removeNotification = useCallback(async (notificationId: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== notificationId));
    await deleteAiNotification(notificationId);
  }, []);

  const updateNotificationCategory = useCallback(
    async (notificationId: string, categoryId: string | null) => {
      const existing = notifications.find((n) => n.id === notificationId);
      if (!existing) return;

      const updated: AiNotification = {
        ...existing,
        categoryId: categoryId ?? undefined,
        updatedAt: new Date().toISOString(),
      };

      setNotifications((prev) =>
        prev.map((n) => (n.id === notificationId ? updated : n))
      );
      await upsertAiNotification(updated);
    },
    [notifications]
  );

  const createNotification = useCallback(
    async (
      notification: Omit<AiNotification, 'id' | 'isRead' | 'createdAt' | 'updatedAt'>
    ) => {
      const id = `notif-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const now = new Date().toISOString();
      const newNotification: AiNotification = {
        ...notification,
        id,
        isRead: false,
        createdAt: now,
        updatedAt: now,
      };

      setNotifications((prev) => [newNotification, ...prev]);
      await upsertAiNotification(newNotification);
      return newNotification;
    },
    []
  );

  // Category CRUD
  const addCategory = useCallback(
    async (category: Omit<AiNotificationCategory, 'id' | 'createdAt' | 'updatedAt'>) => {
      const id = `cat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const now = new Date().toISOString();
      const newCategory: AiNotificationCategory = {
        ...category,
        id,
        createdAt: now,
        updatedAt: now,
      };

      setCategories((prev) => [...prev, newCategory]);
      await upsertAiNotificationCategory(newCategory);
      return newCategory;
    },
    []
  );

  const updateCategory = useCallback(
    async (categoryId: string, updates: Partial<AiNotificationCategory>) => {
      setCategories((prev) =>
        prev.map((c) => (c.id === categoryId ? { ...c, ...updates } : c))
      );
      const existing = categories.find((c) => c.id === categoryId);
      if (existing) {
        await upsertAiNotificationCategory({ ...existing, ...updates });
      }
    },
    [categories]
  );

  const removeCategory = useCallback(async (categoryId: string) => {
    setCategories((prev) => prev.filter((c) => c.id !== categoryId));
    await deleteAiNotificationCategory(categoryId);
  }, []);

  // API Key CRUD
  const createApiKey = useCallback(async (name: string) => {
    const result = await createAiNotificationApiKey(name);
    if (result) {
      setApiKeys((prev) => [...prev, result.apiKey]);
    }
    return result;
  }, []);

  const removeApiKey = useCallback(async (keyId: string) => {
    setApiKeys((prev) => prev.filter((k) => k.id !== keyId));
    await deleteAiNotificationApiKey(keyId);
  }, []);

  const toggleApiKey = useCallback(async (keyId: string, isActive: boolean) => {
    setApiKeys((prev) =>
      prev.map((k) => (k.id === keyId ? { ...k, isActive } : k))
    );
    await toggleAiNotificationApiKey(keyId, isActive);
  }, []);

  // Slack Integration CRUD
  const addSlackIntegration = useCallback(
    async (integration: {
      teamId: string;
      teamName: string;
      botToken: string;
      channelFilters: { mode: 'all' | 'include' | 'exclude'; channels: string[] };
      defaultCategoryId?: string | null;
      isActive: boolean;
    }) => {
      const result = await upsertSlackIntegration(integration);
      if (result) {
        setSlackIntegrations((prev) => [...prev, result]);
      }
      return result;
    },
    []
  );

  const removeSlackIntegration = useCallback(async (integrationId: string) => {
    setSlackIntegrations((prev) => prev.filter((s) => s.id !== integrationId));
    await deleteSlackIntegration(integrationId);
  }, []);

  const toggleSlack = useCallback(async (integrationId: string, isActive: boolean) => {
    setSlackIntegrations((prev) =>
      prev.map((s) => (s.id === integrationId ? { ...s, isActive } : s))
    );
    await toggleSlackIntegration(integrationId, isActive);
  }, []);

  const updateSlackIntegration = useCallback(
    async (
      integrationId: string,
      updates: {
        teamName?: string;
        botToken?: string;
        channelFilters?: { mode: 'all' | 'include' | 'exclude'; channels: string[] };
        defaultCategoryId?: string | null;
      }
    ) => {
      const existing = slackIntegrations.find((s) => s.id === integrationId);
      if (!existing) return null;

      const updated: SlackIntegration = {
        ...existing,
        ...updates,
        updatedAt: new Date().toISOString(),
      };

      setSlackIntegrations((prev) =>
        prev.map((s) => (s.id === integrationId ? updated : s))
      );

      // Use partial update to avoid overwriting bot_token with empty string
      await updateSlackIntegrationFields(integrationId, updates);

      return updated;
    },
    [slackIntegrations]
  );

  // Filtering helpers
  const filterBySource = useCallback(
    (source: NotificationSource) => notifications.filter((n) => n.source === source),
    [notifications]
  );

  const filterByPriority = useCallback(
    (priority: NotificationPriority) => notifications.filter((n) => n.priority === priority),
    [notifications]
  );

  const filterByCategory = useCallback(
    (categoryId: string | null) =>
      notifications.filter((n) => n.categoryId === categoryId),
    [notifications]
  );

  return {
    // State
    notifications,
    categories,
    apiKeys,
    slackIntegrations,
    isLoading,
    isSyncing,
    unreadCount,
    unreadNotifications,

    // Actions
    refresh,
    markAsRead,
    markAllAsRead,
    removeNotification,
    createNotification,
    updateNotificationCategory,

    // Categories
    addCategory,
    updateCategory,
    removeCategory,

    // API Keys
    createApiKey,
    removeApiKey,
    toggleApiKey,

    // Slack
    addSlackIntegration,
    removeSlackIntegration,
    toggleSlack,
    updateSlackIntegration,

    // Filters
    filterBySource,
    filterByPriority,
    filterByCategory,
  };
};
