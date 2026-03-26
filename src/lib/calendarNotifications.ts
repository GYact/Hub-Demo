import type { CalendarEvent } from "../hooks/useGoogleCalendar";
import { getUserSetting, setUserSetting } from "./offlineData";

interface ScheduledCalendarNotification {
  id: string;
  eventId: string;
  eventSummary: string;
  scheduledTime: number; // Unix timestamp in milliseconds
  type: "30min" | "2min";
  triggered: boolean;
}

interface CalendarNotificationSettings {
  pushCalendarEvent: boolean;
  soundEnabled: boolean;
}

const SETTINGS_CALENDAR_SCHEDULE = "calendar_notification_schedule";
const SETTINGS_NOTIFICATION_CONFIG = "notification_settings";

const getCalendarNotificationSettings =
  async (): Promise<CalendarNotificationSettings> => {
    try {
      const stored = await getUserSetting<
        Partial<CalendarNotificationSettings>
      >(SETTINGS_NOTIFICATION_CONFIG, {});
      return {
        pushCalendarEvent: stored.pushCalendarEvent ?? true,
        soundEnabled: stored.soundEnabled ?? true,
      };
    } catch {
      return { pushCalendarEvent: true, soundEnabled: true };
    }
  };

const getScheduledCalendarNotifications = async (): Promise<
  ScheduledCalendarNotification[]
> => {
  try {
    return await getUserSetting<ScheduledCalendarNotification[]>(
      SETTINGS_CALENDAR_SCHEDULE,
      [],
    );
  } catch (err) {
    console.error("Failed to load calendar notifications:", err);
    return [];
  }
};

const saveScheduledCalendarNotifications = async (
  notifications: ScheduledCalendarNotification[],
): Promise<void> => {
  try {
    await setUserSetting(SETTINGS_CALENDAR_SCHEDULE, notifications);
  } catch (err) {
    console.error("Failed to save calendar notifications:", err);
  }
};

// Schedule notifications for a list of calendar events
export const scheduleCalendarEventNotifications = async (
  events: CalendarEvent[],
): Promise<void> => {
  const settings = await getCalendarNotificationSettings();
  if (!settings.pushCalendarEvent) {
    // Clear all scheduled calendar notifications when disabled
    await saveScheduledCalendarNotifications([]);
    return;
  }

  const now = Date.now();
  const newNotifications: ScheduledCalendarNotification[] = [];

  for (const event of events) {
    const startStr = event.start.dateTime || event.start.date;
    if (!startStr) continue;

    // dateTime → exact time; date-only → midnight UTC (= 09:00 JST)
    const startTime = new Date(startStr).getTime();
    if (Number.isNaN(startTime)) continue;

    // 30 min before
    const time30min = startTime - 30 * 60 * 1000;
    if (time30min > now) {
      newNotifications.push({
        id: `cal-${event.id}-30min`,
        eventId: event.id,
        eventSummary: event.summary || "Untitled Event",
        scheduledTime: time30min,
        type: "30min",
        triggered: false,
      });
    }

    // 2 min before
    const time2min = startTime - 2 * 60 * 1000;
    if (time2min > now) {
      newNotifications.push({
        id: `cal-${event.id}-2min`,
        eventId: event.id,
        eventSummary: event.summary || "Untitled Event",
        scheduledTime: time2min,
        type: "2min",
        triggered: false,
      });
    }
  }

  // Merge with existing schedule:
  // - For events in the current view: replace with fresh notifications (preserve triggered status)
  // - For events NOT in the current view: keep existing entries (server-generated)
  // This prevents overwriting server-side notifications for events outside the current view.
  const existing = await getScheduledCalendarNotifications();
  const currentEventIds = new Set(events.map((e) => e.id));
  const triggeredIds = new Set(
    existing.filter((n) => n.triggered).map((n) => n.id),
  );

  // Prune old entries (>24 hours old)
  const dayAgo = now - 24 * 60 * 60 * 1000;

  const preserved = existing.filter(
    (n) => !currentEventIds.has(n.eventId) && n.scheduledTime > dayAgo,
  );
  const fresh = newNotifications.map((n) => ({
    ...n,
    triggered: triggeredIds.has(n.id),
  }));

  await saveScheduledCalendarNotifications([...preserved, ...fresh]);
};

// Cancel notifications for a specific event
export const cancelCalendarEventNotification = async (
  eventId: string,
): Promise<void> => {
  const notifications = await getScheduledCalendarNotifications();
  const filtered = notifications.filter((n) => n.eventId !== eventId);
  if (filtered.length !== notifications.length) {
    await saveScheduledCalendarNotifications(filtered);
  }
};

// Schedule notifications for a single calendar event (used on create/update)
export const scheduleSingleCalendarEventNotification = async (
  event: CalendarEvent,
): Promise<void> => {
  const settings = await getCalendarNotificationSettings();
  if (!settings.pushCalendarEvent) return;

  const startStr = event.start.dateTime || event.start.date;
  if (!startStr) return;

  const now = Date.now();
  const startTime = new Date(startStr).getTime();
  if (Number.isNaN(startTime)) return;

  const notifications = await getScheduledCalendarNotifications();
  // Remove existing notifications for this event
  const filtered = notifications.filter((n) => n.eventId !== event.id);

  const newEntries: ScheduledCalendarNotification[] = [];

  // 30 min before
  const time30min = startTime - 30 * 60 * 1000;
  if (time30min > now) {
    newEntries.push({
      id: `cal-${event.id}-30min`,
      eventId: event.id,
      eventSummary: event.summary || "Untitled Event",
      scheduledTime: time30min,
      type: "30min",
      triggered: false,
    });
  }

  // 2 min before
  const time2min = startTime - 2 * 60 * 1000;
  if (time2min > now) {
    newEntries.push({
      id: `cal-${event.id}-2min`,
      eventId: event.id,
      eventSummary: event.summary || "Untitled Event",
      scheduledTime: time2min,
      type: "2min",
      triggered: false,
    });
  }

  await saveScheduledCalendarNotifications([...filtered, ...newEntries]);
};
