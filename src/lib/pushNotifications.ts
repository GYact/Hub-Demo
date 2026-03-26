import { supabase } from "./supabase";

const getVapidPublicKey = (): string | null => {
  const key = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;
  return key ?? null;
};

const urlBase64ToUint8Array = (base64String: string) => {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
};

export const registerPushSubscription = async (
  userId: string,
): Promise<boolean> => {
  if (!supabase) {
    console.warn("Supabase not configured. Skipping push subscription.");
    return false;
  }
  if (
    typeof window === "undefined" ||
    !("serviceWorker" in navigator) ||
    !("PushManager" in window)
  ) {
    console.warn("Push notifications not supported in this browser.");
    return false;
  }

  const vapidPublicKey = getVapidPublicKey();
  if (!vapidPublicKey) {
    console.warn(
      "Missing VITE_VAPID_PUBLIC_KEY. Push subscription not created.",
    );
    return false;
  }

  try {
    // Check if there's an active service worker registration
    const registrations = await navigator.serviceWorker.getRegistrations();
    if (registrations.length === 0) {
      console.warn(
        "No service worker registered. Push notifications require a service worker.",
      );
      return false;
    }

    // Add timeout to prevent hanging
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("ServiceWorker ready timeout")), 10000),
    );

    const registration = await Promise.race([
      navigator.serviceWorker.ready,
      timeoutPromise,
    ]);
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });
    }

    const keys = subscription.toJSON().keys;
    if (!keys?.p256dh || !keys?.auth) {
      console.error("Push subscription keys missing.");
      return false;
    }

    // Clean up stale subscriptions from the same push service (same device).
    // When SW reinstalls, Safari/Chrome generate a new endpoint on the same
    // origin.  The old row stays in the DB and causes duplicate deliveries.
    const endpointOrigin = new URL(subscription.endpoint).origin;
    const { data: existing } = await supabase
      .from("push_subscriptions")
      .select("endpoint")
      .eq("user_id", userId);
    if (existing) {
      const stale = existing.filter(
        (row) =>
          row.endpoint !== subscription.endpoint &&
          row.endpoint.startsWith(endpointOrigin),
      );
      if (stale.length > 0) {
        await supabase
          .from("push_subscriptions")
          .delete()
          .eq("user_id", userId)
          .in(
            "endpoint",
            stale.map((r) => r.endpoint),
          );
      }
    }

    const { error } = await supabase.from("push_subscriptions").upsert(
      {
        user_id: userId,
        endpoint: subscription.endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        user_agent: navigator.userAgent,
      },
      { onConflict: "endpoint" },
    );

    if (error) {
      console.error("Failed to save push subscription:", error);
      return false;
    }

    return true;
  } catch (err) {
    console.error("Failed to register push subscription:", err);
    return false;
  }
};

export const unregisterPushSubscription = async (
  userId: string,
): Promise<void> => {
  if (!supabase) return;
  if (
    typeof window === "undefined" ||
    !("serviceWorker" in navigator) ||
    !("PushManager" in window)
  ) {
    return;
  }

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;

  await subscription.unsubscribe();
  const { error } = await supabase
    .from("push_subscriptions")
    .delete()
    .eq("user_id", userId)
    .eq("endpoint", subscription.endpoint);

  if (error) {
    console.error("Failed to remove push subscription:", error);
  }
};
