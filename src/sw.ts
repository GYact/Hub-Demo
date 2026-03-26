/// <reference lib="webworker" />

import { CacheableResponsePlugin } from "workbox-cacheable-response";
import { clientsClaim, skipWaiting } from "workbox-core";
import { ExpirationPlugin } from "workbox-expiration";
import {
  precacheAndRoute,
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
} from "workbox-precaching";
import { registerRoute, NavigationRoute } from "workbox-routing";
import { CacheFirst, NetworkOnly } from "workbox-strategies";

// Type declarations for Background Sync API
interface SyncEvent extends ExtendableEvent {
  tag: string;
}

interface PeriodicSyncEvent extends ExtendableEvent {
  tag: string;
}

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
};

skipWaiting();
clientsClaim();

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// Background Sync for offline data synchronization
self.addEventListener("sync", (event: Event) => {
  const syncEvent = event as SyncEvent;
  if (syncEvent.tag === "hub-data-sync") {
    syncEvent.waitUntil(handleBackgroundSync());
  }
});

async function handleBackgroundSync() {
  // Notify all clients to perform sync
  const clients = await self.clients.matchAll({ type: "window" });
  for (const client of clients) {
    client.postMessage({ type: "BACKGROUND_SYNC_TRIGGERED" });
  }
}

// Periodic Background Sync for calendar/RSS updates (if supported)
self.addEventListener("periodicsync", (event: Event) => {
  const periodicEvent = event as PeriodicSyncEvent;
  if (periodicEvent.tag === "hub-periodic-sync") {
    periodicEvent.waitUntil(handlePeriodicSync());
  }
});

async function handlePeriodicSync() {
  const clients = await self.clients.matchAll({ type: "window" });
  for (const client of clients) {
    client.postMessage({ type: "PERIODIC_SYNC_TRIGGERED" });
  }
}

// Supabase API: NetworkOnly (offline is handled by IndexedDB in offlineData.ts)
registerRoute(
  ({ url }) => url.origin.endsWith(".supabase.co"),
  new NetworkOnly(),
);

registerRoute(
  ({ url }) => url.origin === "https://fonts.googleapis.com",
  new CacheFirst({
    cacheName: "google-fonts-cache",
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({
        maxEntries: 10,
        maxAgeSeconds: 60 * 60 * 24 * 365,
      }),
    ],
  }),
);

const navigationHandler = createHandlerBoundToURL("/index.html");
registerRoute(new NavigationRoute(navigationHandler));

self.addEventListener("push", (event) => {
  const payload = event.data?.json() as
    | {
        title?: string;
        body?: string;
        url?: string;
        tag?: string;
        taskId?: string;
      }
    | undefined;

  const title = payload?.title ?? "Task Reminder";
  const options: NotificationOptions = {
    body: payload?.body ?? "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: payload?.tag,
    data: {
      url: payload?.url ?? "/tasks",
      taskId: payload?.taskId,
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl =
    (event.notification.data as { url?: string } | undefined)?.url ?? "/tasks";
  const absoluteTargetUrl = new URL(targetUrl, self.location.origin).href;

  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of clientList) {
        if ("focus" in client) {
          const windowClient = client as WindowClient;
          if (
            "navigate" in windowClient &&
            windowClient.url !== absoluteTargetUrl
          ) {
            await windowClient.navigate(absoluteTargetUrl);
          }
          await windowClient.focus();
          return;
        }
      }
      if (self.clients.openWindow) {
        await self.clients.openWindow(absoluteTargetUrl);
      }
    })(),
  );
});
