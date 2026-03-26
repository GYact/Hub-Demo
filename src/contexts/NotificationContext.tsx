import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { AiNotification, MediaFeedItem } from "../types";
import {
  fetchAiNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  fetchGmailUnreadCount,
  markGmailSyncMessageAsRead,
  fetchMediaFeedItems,
  markMediaFeedItemAsRead,
  markMediaFeedItemsAsReadBulk,
} from "../lib/offlineData";
import { supabase } from "../lib/offlineSync";
import { MEDIA_FEED_SOURCES } from "../lib/notificationConstants";
import { useAuth } from "./AuthContext";
import type { RealtimeChannel } from "@supabase/supabase-js";

interface NotificationContextValue {
  unreadCount: number;
  unreadBySource: Record<string, number>;
  notifications: AiNotification[];
  mediaFeedItems: MediaFeedItem[];
  gmailUnreadCount: number;
  refresh: () => Promise<void>;
  markAsRead: (notificationId: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  markGmailAsRead: (messageId: string) => Promise<void>;
  markMediaFeedAsRead: (id: string) => Promise<void>;
  markMediaFeedAsReadBulk: (ids: string[]) => Promise<void>;
}

const NotificationContext = createContext<NotificationContextValue | null>(
  null,
);

export const useNotificationBadge = () => {
  const ctx = useContext(NotificationContext);
  if (!ctx) {
    // Return default values when outside provider (e.g., login page)
    return {
      unreadCount: 0,
      unreadBySource: {},
      notifications: [],
      mediaFeedItems: [],
      gmailUnreadCount: 0,
      refresh: async () => {},
      markAsRead: async () => {},
      markAllAsRead: async () => {},
      markGmailAsRead: async () => {},
      markMediaFeedAsRead: async () => {},
      markMediaFeedAsReadBulk: async () => {},
    };
  }
  return ctx;
};

interface NotificationProviderProps {
  children: ReactNode;
}

export const NotificationProvider = ({
  children,
}: NotificationProviderProps) => {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<AiNotification[]>([]);
  const [mediaFeedItems, setMediaFeedItems] = useState<MediaFeedItem[]>([]);
  const [gmailUnreadCount, setGmailUnreadCount] = useState(0);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const mediaChannelRef = useRef<RealtimeChannel | null>(null);
  const gmailChannelRef = useRef<RealtimeChannel | null>(null);
  const prevCountRef = useRef<number>(0);

  const { unreadCount, unreadBySource } = useMemo(() => {
    const bySource: Record<string, number> = {};
    let total = 0;
    for (const n of notifications) {
      if (!n.isRead) {
        bySource[n.source] = (bySource[n.source] || 0) + 1;
        total++;
      }
    }
    for (const m of mediaFeedItems) {
      if (!m.isRead) {
        bySource[m.source] = (bySource[m.source] || 0) + 1;
        total++;
      }
    }
    if (gmailUnreadCount > 0) {
      bySource["gmail"] = gmailUnreadCount;
      total += gmailUnreadCount;
    }
    return { unreadCount: total, unreadBySource: bySource };
  }, [notifications, mediaFeedItems, gmailUnreadCount]);

  const load = useCallback(async () => {
    if (!user?.id) {
      setNotifications([]);
      setMediaFeedItems([]);
      setGmailUnreadCount(0);
      return;
    }
    try {
      const [notifs, media, gmailCount] = await Promise.all([
        fetchAiNotifications(),
        fetchMediaFeedItems(MEDIA_FEED_SOURCES),
        fetchGmailUnreadCount(),
      ]);
      setNotifications(notifs);
      setMediaFeedItems(media);
      setGmailUnreadCount(gmailCount);
    } catch (err) {
      console.error("Failed to load notifications for badge:", err);
    }
  }, [user?.id]);

  // Mark a single notification as read
  const markAsRead = useCallback(async (notificationId: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === notificationId ? { ...n, isRead: true } : n)),
    );
    await markNotificationAsRead(notificationId);
  }, []);

  // Mark all notifications as read
  const markAllAsReadHandler = useCallback(async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    await markAllNotificationsAsRead();
  }, []);

  // Mark a Gmail message as read
  const markGmailAsReadHandler = useCallback(async (messageId: string) => {
    setGmailUnreadCount((prev) => Math.max(0, prev - 1));
    await markGmailSyncMessageAsRead(messageId);
  }, []);

  // Mark a media feed item as read
  const markMediaFeedAsReadHandler = useCallback(async (id: string) => {
    setMediaFeedItems((prev) =>
      prev.map((m) => (m.id === id ? { ...m, isRead: true } : m)),
    );
    await markMediaFeedItemAsRead(id);
  }, []);

  // Bulk mark media feed items as read (single DB round-trip)
  const markMediaFeedAsReadBulkHandler = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return;
    setMediaFeedItems((prev) =>
      prev.map((m) => (ids.includes(m.id) ? { ...m, isRead: true } : m)),
    );
    await markMediaFeedItemsAsReadBulk(ids);
  }, []);

  // Setup Realtime subscription
  useEffect(() => {
    load();

    if (!supabase || !user?.id) return;

    // ai_notifications realtime
    const channel = supabase
      .channel("notification_badge_realtime")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "ai_notifications",
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
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "ai_notifications",
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
                : n,
            ),
          );
        },
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "ai_notifications",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          setNotifications((prev) =>
            prev.filter((n) => n.id !== payload.old.id),
          );
        },
      )
      .subscribe();

    channelRef.current = channel;

    // media_feed_items realtime
    const mediaChannel = supabase
      .channel("media_feed_badge_realtime")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "media_feed_items",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const item: MediaFeedItem = {
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
          setMediaFeedItems((prev) => [item, ...prev]);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "media_feed_items",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          setMediaFeedItems((prev) =>
            prev.map((m) =>
              m.id === payload.new.id
                ? {
                    ...m,
                    isRead: payload.new.is_read,
                    updatedAt: payload.new.updated_at,
                  }
                : m,
            ),
          );
        },
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "media_feed_items",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          setMediaFeedItems((prev) =>
            prev.filter((m) => m.id !== payload.old.id),
          );
        },
      )
      .subscribe();

    mediaChannelRef.current = mediaChannel;

    // google_gmail_messages realtime (for unread count)
    const gmailChannel = supabase
      .channel("gmail_badge_realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "google_gmail_messages",
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          // Re-fetch count on any change
          fetchGmailUnreadCount().then(setGmailUnreadCount);
        },
      )
      .subscribe();

    gmailChannelRef.current = gmailChannel;

    return () => {
      if (channelRef.current && supabase) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      if (mediaChannelRef.current && supabase) {
        supabase.removeChannel(mediaChannelRef.current);
        mediaChannelRef.current = null;
      }
      if (gmailChannelRef.current && supabase) {
        supabase.removeChannel(gmailChannelRef.current);
        gmailChannelRef.current = null;
      }
    };
  }, [user?.id, load]);

  // Refresh when app returns to foreground (handles cross-device read status)
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible" && user?.id) {
        load();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibility);
  }, [user?.id, load]);

  // Update prev count ref
  useEffect(() => {
    prevCountRef.current = unreadCount;
  }, [unreadCount]);

  // Note: PWA app badge is managed by useAppBadge hook which combines
  // task count and notification count for the total badge value

  const value = useMemo(
    () => ({
      unreadCount,
      unreadBySource,
      notifications,
      mediaFeedItems,
      gmailUnreadCount,
      refresh: load,
      markAsRead,
      markAllAsRead: markAllAsReadHandler,
      markGmailAsRead: markGmailAsReadHandler,
      markMediaFeedAsRead: markMediaFeedAsReadHandler,
      markMediaFeedAsReadBulk: markMediaFeedAsReadBulkHandler,
    }),
    [
      unreadCount,
      unreadBySource,
      notifications,
      mediaFeedItems,
      gmailUnreadCount,
      load,
      markAsRead,
      markAllAsReadHandler,
      markGmailAsReadHandler,
      markMediaFeedAsReadHandler,
      markMediaFeedAsReadBulkHandler,
    ],
  );

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
};
