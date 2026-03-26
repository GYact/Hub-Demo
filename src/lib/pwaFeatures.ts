/**
 * PWA Features: Background Sync and Badging API
 */

// Type declarations for PWA APIs
declare global {
  interface ServiceWorkerRegistration {
    sync?: {
      register(tag: string): Promise<void>;
      getTags(): Promise<string[]>;
    };
    periodicSync?: {
      register(tag: string, options?: { minInterval: number }): Promise<void>;
      unregister(tag: string): Promise<void>;
      getTags(): Promise<string[]>;
    };
  }

  interface Navigator {
    setAppBadge?(count?: number): Promise<void>;
    clearAppBadge?(): Promise<void>;
  }
}

// ============================================
// Background Sync
// ============================================

/**
 * Request a one-time background sync
 * This will be triggered when the device comes back online
 */
export const requestBackgroundSync = async (): Promise<boolean> => {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return false;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    if (registration.sync) {
      await registration.sync.register('hub-data-sync');
      return true;
    }
  } catch (err) {
    console.warn('Background sync registration failed:', err);
  }
  return false;
};

/**
 * Check if background sync is supported
 */
export const isBackgroundSyncSupported = (): boolean => {
  return typeof window !== 'undefined' &&
         'serviceWorker' in navigator &&
         'SyncManager' in window;
};

/**
 * Register periodic background sync for calendar/RSS updates
 * Requires permission and browser support
 */
export const registerPeriodicSync = async (minIntervalMs: number = 12 * 60 * 60 * 1000): Promise<boolean> => {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return false;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    if (registration.periodicSync) {
      // Check permission
      const status = await navigator.permissions.query({
        name: 'periodic-background-sync' as PermissionName,
      });

      if (status.state === 'granted') {
        await registration.periodicSync.register('hub-periodic-sync', {
          minInterval: minIntervalMs,
        });
        return true;
      }
    }
  } catch (err) {
    console.warn('Periodic sync registration failed:', err);
  }
  return false;
};

/**
 * Unregister periodic background sync
 */
export const unregisterPeriodicSync = async (): Promise<void> => {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    if (registration.periodicSync) {
      await registration.periodicSync.unregister('hub-periodic-sync');
    }
  } catch (err) {
    console.warn('Failed to unregister periodic sync:', err);
  }
};

// ============================================
// Badging API
// ============================================

/**
 * Set the app badge with a count (e.g., pending tasks, unread notifications)
 */
export const setAppBadge = async (count: number): Promise<boolean> => {
  if (typeof navigator === 'undefined' || !navigator.setAppBadge) {
    return false;
  }

  try {
    if (count > 0) {
      await navigator.setAppBadge(count);
    } else {
      await navigator.clearAppBadge?.();
    }
    return true;
  } catch (err) {
    console.warn('Failed to set app badge:', err);
    return false;
  }
};

/**
 * Clear the app badge
 */
export const clearAppBadge = async (): Promise<boolean> => {
  if (typeof navigator === 'undefined' || !navigator.clearAppBadge) {
    return false;
  }

  try {
    await navigator.clearAppBadge();
    return true;
  } catch (err) {
    console.warn('Failed to clear app badge:', err);
    return false;
  }
};

/**
 * Check if Badging API is supported
 */
export const isBadgingSupported = (): boolean => {
  return typeof navigator !== 'undefined' &&
         ('setAppBadge' in navigator || 'clearAppBadge' in navigator);
};

// ============================================
// Service Worker Message Listener Setup
// ============================================

/**
 * Set up listeners for Service Worker messages
 * Call this from your app initialization
 */
export const setupSyncMessageListener = (onSync: () => void): (() => void) => {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return () => {};
  }

  const handler = (event: MessageEvent) => {
    if (event.data?.type === 'BACKGROUND_SYNC_TRIGGERED' ||
        event.data?.type === 'PERIODIC_SYNC_TRIGGERED') {
      onSync();
    }
  };

  navigator.serviceWorker.addEventListener('message', handler);

  return () => {
    navigator.serviceWorker.removeEventListener('message', handler);
  };
};
