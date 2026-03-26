import { useEffect, useRef, useCallback } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useNotificationBadge } from "../contexts/NotificationContext";
import { offlineDb } from "../lib/offlineDb";
import {
  setAppBadge,
  clearAppBadge,
  isBadgingSupported,
  setupSyncMessageListener,
} from "../lib/pwaFeatures";

/**
 * Hook to manage PWA app badge based on overdue task count + unread notifications
 * Updates badge when sync events occur, notification count changes, or on interval
 */
export const useAppBadge = () => {
  const { user } = useAuth();
  const { unreadCount: notificationUnreadCount, gmailUnreadCount } =
    useNotificationBadge();
  const updateTimeoutRef = useRef<number | null>(null);

  const updateBadge = useCallback(async () => {
    if (!user || !isBadgingSupported()) return;

    try {
      // Count overdue tasks for the current user (due_date < today JST)
      // Always use JST (UTC+9) regardless of browser timezone
      const jstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
      const todayStr = jstNow.toISOString().split("T")[0];

      const overdueTasks = await offlineDb.tasks
        .where("user_id")
        .equals(user.id)
        .filter(
          (task) =>
            task.status === "needsAction" &&
            !!task.due_date &&
            task.due_date.split("T")[0] < todayStr,
        )
        .count();

      // Combine overdue task count with notification unread count
      // Exclude Gmail unreads (Gmail has its own badge in the app UI)
      const totalBadgeCount =
        overdueTasks + notificationUnreadCount - gmailUnreadCount;

      if (totalBadgeCount > 0) {
        await setAppBadge(totalBadgeCount);
      } else {
        await clearAppBadge();
      }
    } catch (err) {
      console.warn("Failed to update app badge:", err);
    }
  }, [user, notificationUnreadCount, gmailUnreadCount]);

  useEffect(() => {
    if (!user || !isBadgingSupported()) return;

    // Debounced badge update
    const debouncedUpdateBadge = () => {
      if (updateTimeoutRef.current) {
        window.clearTimeout(updateTimeoutRef.current);
      }
      updateTimeoutRef.current = window.setTimeout(() => {
        updateBadge();
      }, 500);
    };

    // Initial update
    updateBadge();

    // Listen for sync events from Service Worker
    const cleanupSyncListener = setupSyncMessageListener(() => {
      debouncedUpdateBadge();
    });

    // Listen for sync-complete events
    const handleSyncComplete = () => {
      debouncedUpdateBadge();
    };
    window.addEventListener("sync-complete", handleSyncComplete);

    // Periodic update every 30 seconds as fallback
    const intervalId = window.setInterval(() => {
      updateBadge();
    }, 30000);

    return () => {
      cleanupSyncListener();
      window.removeEventListener("sync-complete", handleSyncComplete);
      window.clearInterval(intervalId);
      if (updateTimeoutRef.current) {
        window.clearTimeout(updateTimeoutRef.current);
      }
    };
  }, [user, updateBadge]);
};
