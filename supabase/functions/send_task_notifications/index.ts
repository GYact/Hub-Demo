import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isPushCategoryEnabled } from "../_shared/pushSettings.ts";
import {
  configureVapid,
  sendPushToUser,
  sendPushToUserDetailed,
} from "../_shared/pushSend.ts";
import { refreshAccessToken } from "../_shared/googleAuth.ts";
import type { PushResult } from "../_shared/pushSend.ts";
import { corsHeaders, handleCors } from "../_shared/cors.ts";
import { buildInvoicePdf } from "../_shared/invoicePdfBuilder.ts";

type ScheduledNotification = {
  id: string;
  taskId: string;
  taskTitle: string;
  scheduledTime: number;
  type: "reminder" | "exact";
  triggered: boolean;
};

type ScheduledCalendarNotification = {
  id: string;
  eventId: string;
  eventSummary: string;
  scheduledTime: number;
  type: "30min" | "2min";
  triggered: boolean;
};

type TaskRow = {
  id: string;
  user_id: string;
  title: string;
  status: string;
  due_date: string | null;
};

const calcRepeatNext = (
  baseDate: string,
  repeatType: string,
): string | null => {
  if (repeatType === "none") return null;
  const d = new Date(baseDate + "T00:00:00+09:00");
  switch (repeatType) {
    case "monthly":
      d.setMonth(d.getMonth() + 1);
      break;
    case "quarterly":
      d.setMonth(d.getMonth() + 3);
      break;
    case "yearly":
      d.setFullYear(d.getFullYear() + 1);
      break;
    default:
      return null;
  }
  return d.toISOString().split("T")[0];
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
  Deno.env.get("SERVICE_ROLE_KEY") ??
  "";
const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

const dueNotificationTitle = (notification: ScheduledNotification) => {
  return notification.type === "reminder" ? "Task Reminder" : "Task Due";
};

const pruneSchedule = <T extends { scheduledTime: number }>(
  notifications: T[],
  now: number,
): T[] => {
  const dayAgo = now - 24 * 60 * 60 * 1000;
  return notifications.filter((n) => n.scheduledTime > dayAgo);
};

const CALENDAR_API_BASE = "https://www.googleapis.com/calendar/v3";

const calendarNotificationTitle = (
  notification: ScheduledCalendarNotification,
) => {
  return notification.type === "30min"
    ? "Calendar Reminder (30 min)"
    : "Calendar Reminder (2 min)";
};

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(
      JSON.stringify({ error: "Missing Supabase configuration" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
  const now = Date.now();
  // Use JST (UTC+9) date for overdue detection so it matches the user's calendar day
  const jstNow = new Date(now + 9 * 60 * 60 * 1000);
  const todayStr = jstNow.toISOString().split("T")[0];

  let scheduledNotificationsSent = 0;
  let overdueNotificationsSent = 0;
  const pushDiag: PushResult[] = [];

  // ========================================
  // Part 1: Process scheduled notifications (reminder & exact time)
  // ========================================
  const { data: schedules, error: scheduleError } = await supabase
    .from("user_settings")
    .select("id,user_id,value")
    .eq("key", "task_notification_schedule");

  if (scheduleError) {
    console.error("Failed to load schedules:", scheduleError);
  } else {
    for (const scheduleRow of schedules ?? []) {
      const rawValue = scheduleRow.value as ScheduledNotification[] | null;
      if (!Array.isArray(rawValue) || rawValue.length === 0) {
        continue;
      }

      const dueNotifications = rawValue.filter(
        (n) => !n.triggered && n.scheduledTime <= now,
      );

      if (dueNotifications.length === 0) {
        continue;
      }

      if (
        !(await isPushCategoryEnabled(
          supabase,
          scheduleRow.user_id,
          "pushTaskDue",
        ))
      ) {
        continue;
      }

      const successfulTaskIds = new Set<string>();

      for (const notification of dueNotifications) {
        const payload = {
          title: dueNotificationTitle(notification),
          body: notification.taskTitle,
          url: "/tasks",
          tag: notification.id,
          taskId: notification.taskId,
        };

        const detail = await sendPushToUserDetailed(
          supabase,
          scheduleRow.user_id,
          payload,
        );
        // Mark as processed if sent successfully or no subscriptions exist
        if (detail.sent > 0 || detail.subscriptionCount === 0) {
          successfulTaskIds.add(notification.id);
        }
        scheduledNotificationsSent += detail.sent;
        pushDiag.push(detail);
      }

      const updatedSchedule = rawValue.map((n) =>
        successfulTaskIds.has(n.id) ? { ...n, triggered: true } : n,
      );
      const cleanedSchedule = pruneSchedule(updatedSchedule, now);

      const { error: updateError } = await supabase
        .from("user_settings")
        .update({ value: cleanedSchedule })
        .eq("id", scheduleRow.id);

      if (updateError) {
        console.error("Failed to update schedule:", updateError);
      }
    }
  }

  // ========================================
  // Part 2: Process overdue task notifications
  // ========================================

  // Get all overdue tasks grouped by user
  const { data: overdueTasks, error: overdueError } = await supabase
    .from("tasks")
    .select("id, user_id, title, status, due_date")
    .eq("status", "needsAction")
    .not("due_date", "is", null)
    .lt("due_date", todayStr);

  if (overdueError) {
    console.error("Failed to load overdue tasks:", overdueError);
  } else if (overdueTasks && overdueTasks.length > 0) {
    // Group overdue tasks by user
    const tasksByUser = new Map<string, TaskRow[]>();
    for (const task of overdueTasks as TaskRow[]) {
      const existing = tasksByUser.get(task.user_id) ?? [];
      existing.push(task);
      tasksByUser.set(task.user_id, existing);
    }

    // Process each user's overdue tasks
    for (const [userId, tasks] of tasksByUser) {
      // Get user's notification settings
      const { data: settingsData } = await supabase
        .from("user_settings")
        .select("value")
        .eq("user_id", userId)
        .eq("key", "notification_settings")
        .single();

      const settings =
        (settingsData?.value as {
          taskNotificationsEnabled?: boolean;
        }) ?? {};

      if (settings.taskNotificationsEnabled === false) {
        continue;
      }

      // Get already notified task IDs for this user
      const { data: notifiedData } = await supabase
        .from("user_settings")
        .select("id, value")
        .eq("user_id", userId)
        .eq("key", "overdue_tasks_notified")
        .single();

      const notifiedIds = new Set<string>(
        Array.isArray(notifiedData?.value) ? notifiedData.value : [],
      );

      // Find new overdue tasks that haven't been notified
      const newOverdueTasks = tasks.filter((task) => !notifiedIds.has(task.id));

      if (newOverdueTasks.length === 0) {
        continue;
      }

      if (!(await isPushCategoryEnabled(supabase, userId, "pushTaskOverdue"))) {
        continue;
      }

      // Send push notification for each new overdue task
      for (const task of newOverdueTasks) {
        const payload = {
          title: "⚠️ 期限切れタスク",
          body: `「${task.title}」の期限が過ぎています`,
          url: "/tasks",
          tag: `overdue-${task.id}`,
          taskId: task.id,
        };

        const sent = await sendPushToUser(supabase, userId, payload);
        overdueNotificationsSent += sent;
        notifiedIds.add(task.id);
      }

      // Clean up: only keep IDs of tasks that are still overdue
      const currentOverdueIds = new Set(tasks.map((t) => t.id));
      const cleanedNotifiedIds = Array.from(notifiedIds).filter((id) =>
        currentOverdueIds.has(id),
      );

      // Save updated notified IDs
      if (notifiedData?.id) {
        await supabase
          .from("user_settings")
          .update({ value: cleanedNotifiedIds })
          .eq("id", notifiedData.id);
      } else {
        await supabase.from("user_settings").insert({
          user_id: userId,
          key: "overdue_tasks_notified",
          value: cleanedNotifiedIds,
        });
      }
    }
  }

  // ========================================
  // Part 2.5: Validate due calendar events against Google Calendar API
  // Before sending calendar notifications, verify the specific events that
  // are about to fire still exist and haven't moved, catching deletions and
  // time changes not yet synced by the fetch_calendar_events cron.
  // ========================================
  {
    const { data: preCalSchedules } = await supabase
      .from("user_settings")
      .select("user_id, value")
      .eq("key", "calendar_notification_schedule");

    // Collect unique (userId, eventId) pairs with due notifications
    const dueEventsByUser = new Map<string, Set<string>>();
    for (const row of preCalSchedules ?? []) {
      const schedule = Array.isArray(row.value)
        ? (row.value as ScheduledCalendarNotification[])
        : [];
      const dueOnes = schedule.filter(
        (n) => !n.triggered && n.scheduledTime <= now,
      );
      if (dueOnes.length === 0) continue;

      const eventIds = dueEventsByUser.get(row.user_id) ?? new Set<string>();
      for (const n of dueOnes) eventIds.add(n.eventId);
      dueEventsByUser.set(row.user_id, eventIds);
    }

    for (const [userId, eventIdSet] of dueEventsByUser) {
      const eventIds = [...eventIdSet];

      // Get calendar_id and google_email for each event from DB
      const { data: eventRows } = await supabase
        .from("google_calendar_events")
        .select("event_id, calendar_id, google_email")
        .eq("user_id", userId)
        .in("event_id", eventIds);

      if (!eventRows || eventRows.length === 0) continue;

      // Group by google_email to refresh token once per account
      const byEmail = new Map<
        string,
        { event_id: string; calendar_id: string }[]
      >();
      for (const row of eventRows) {
        const list = byEmail.get(row.google_email) ?? [];
        list.push({ event_id: row.event_id, calendar_id: row.calendar_id });
        byEmail.set(row.google_email, list);
      }

      for (const [googleEmail, events] of byEmail) {
        const accessToken = await refreshAccessToken(
          supabase,
          userId,
          googleEmail,
        );
        if (!accessToken) continue;

        for (const ev of events) {
          try {
            const res = await fetch(
              `${CALENDAR_API_BASE}/calendars/${encodeURIComponent(ev.calendar_id)}/events/${encodeURIComponent(ev.event_id)}`,
              { headers: { Authorization: `Bearer ${accessToken}` } },
            );

            if (res.status === 404 || res.status === 410) {
              // Event deleted from Google Calendar — remove from DB
              await supabase
                .from("google_calendar_events")
                .delete()
                .eq("user_id", userId)
                .eq("google_email", googleEmail)
                .eq("event_id", ev.event_id);
            } else if (res.ok) {
              const data = await res.json();
              if (data.status === "cancelled") {
                // Event cancelled — remove from DB
                await supabase
                  .from("google_calendar_events")
                  .delete()
                  .eq("user_id", userId)
                  .eq("google_email", googleEmail)
                  .eq("event_id", ev.event_id);
              } else {
                // Update DB with fresh start/end times and summary
                const start = data.start?.dateTime || data.start?.date || null;
                const end = data.end?.dateTime || data.end?.date || null;
                await supabase
                  .from("google_calendar_events")
                  .update({
                    start_time: start,
                    end_time: end,
                    summary: data.summary || "(No title)",
                    status: data.status || null,
                    updated_at: new Date().toISOString(),
                  })
                  .eq("user_id", userId)
                  .eq("google_email", googleEmail)
                  .eq("event_id", ev.event_id);
              }
            }
            // Ignore transient HTTP errors — fall back to existing DB data
          } catch (err) {
            console.error(
              `Failed to verify calendar event ${ev.event_id}:`,
              err,
            );
          }
        }
      }
    }
  }

  // ========================================
  // Part 3: Process calendar scheduled notifications
  // ========================================
  let calendarNotificationsSent = 0;

  const { data: calSchedules, error: calScheduleError } = await supabase
    .from("user_settings")
    .select("id,user_id,value")
    .eq("key", "calendar_notification_schedule");

  if (calScheduleError) {
    console.error("Failed to load calendar schedules:", calScheduleError);
  } else {
    for (const scheduleRow of calSchedules ?? []) {
      const rawValue = scheduleRow.value as
        | ScheduledCalendarNotification[]
        | null;
      if (!Array.isArray(rawValue) || rawValue.length === 0) {
        continue;
      }

      const dueNotifications = rawValue.filter(
        (n) => !n.triggered && n.scheduledTime <= now,
      );

      if (dueNotifications.length === 0) {
        continue;
      }

      if (
        !(await isPushCategoryEnabled(
          supabase,
          scheduleRow.user_id,
          "pushCalendarEvent",
        ))
      ) {
        continue;
      }

      const successfulCalIds = new Set<string>();

      // Validate due notifications against actual event data in DB
      const dueEventIds = [...new Set(dueNotifications.map((n) => n.eventId))];
      const { data: verifyEvents } = await supabase
        .from("google_calendar_events")
        .select("event_id, start_time, status")
        .eq("user_id", scheduleRow.user_id)
        .in("event_id", dueEventIds);

      const actualCalTimes = new Map<string, number>();
      const staleCalEventIds = new Set<string>();
      const foundCalIds = new Set<string>();
      for (const ev of verifyEvents ?? []) {
        foundCalIds.add(ev.event_id);
        if (ev.status === "cancelled" || !ev.start_time) {
          staleCalEventIds.add(ev.event_id);
        } else {
          actualCalTimes.set(
            ev.event_id,
            new Date(ev.start_time as string).getTime(),
          );
        }
      }
      for (const eid of dueEventIds) {
        if (!foundCalIds.has(eid)) staleCalEventIds.add(eid);
      }

      // Deduplicate: only send one notification per event+type combo
      const sentEventTypes = new Set<string>();

      for (const notification of dueNotifications) {
        // Skip stale notifications (event cancelled/deleted/time changed)
        if (staleCalEventIds.has(notification.eventId)) {
          successfulCalIds.add(notification.id);
          continue;
        }
        const actualStart = actualCalTimes.get(notification.eventId);
        if (actualStart !== undefined) {
          const expectedTime =
            notification.type === "30min"
              ? actualStart - 30 * 60 * 1000
              : actualStart - 2 * 60 * 1000;
          if (notification.scheduledTime !== expectedTime) {
            successfulCalIds.add(notification.id);
            continue;
          }
        }

        // Skip if we already sent this event+type combo (dedup)
        const dedupeKey = `${notification.eventId}-${notification.type}`;
        if (sentEventTypes.has(dedupeKey)) {
          successfulCalIds.add(notification.id);
          continue;
        }
        sentEventTypes.add(dedupeKey);

        const payload = {
          title: calendarNotificationTitle(notification),
          body: notification.eventSummary,
          url: "/calendar",
          tag: `cal-${notification.eventId}-${notification.type}`,
          eventId: notification.eventId,
        };

        const detail = await sendPushToUserDetailed(
          supabase,
          scheduleRow.user_id,
          payload,
        );
        if (detail.sent > 0 || detail.subscriptionCount === 0) {
          successfulCalIds.add(notification.id);
        }
        calendarNotificationsSent += detail.sent;
      }

      const updatedSchedule = rawValue.map((n) =>
        successfulCalIds.has(n.id) ? { ...n, triggered: true } : n,
      );
      const cleanedSchedule = pruneSchedule(updatedSchedule, now);

      const { error: updateError } = await supabase
        .from("user_settings")
        .update({ value: cleanedSchedule })
        .eq("id", scheduleRow.id);

      if (updateError) {
        console.error("Failed to update calendar schedule:", updateError);
      }
    }
  }

  // ========================================
  // Part 4: Monthly invoice reminders
  // ========================================
  let invoiceRemindersSent = 0;

  // Reuse jstNow (computed at top) for consistent JST date/time
  const currentMonth = jstNow.toISOString().slice(0, 7); // YYYY-MM in JST
  const jstHour = jstNow.getUTCHours();
  const jstDay = jstNow.getUTCDate();

  const { data: reminderSettings, error: reminderError } = await supabase
    .from("user_settings")
    .select("id,user_id,value")
    .eq("key", "invoice_reminder_settings");

  if (reminderError) {
    console.error("Failed to load invoice reminder settings:", reminderError);
  } else {
    for (const row of reminderSettings ?? []) {
      const settings = row.value as {
        enabled?: boolean;
        dayOfMonth?: number;
        hour?: number;
      } | null;
      if (!settings?.enabled) continue;
      if (jstDay !== (settings.dayOfMonth ?? 1)) continue;
      if (jstHour !== (settings.hour ?? 9)) continue;

      // Check dedup: last_sent month
      const { data: lastSentRow } = await supabase
        .from("user_settings")
        .select("value")
        .eq("user_id", row.user_id)
        .eq("key", "invoice_reminder_last_sent")
        .maybeSingle();

      const lastSentMonth = (lastSentRow?.value as string) ?? "";
      if (lastSentMonth === currentMonth) continue;

      // Count unpaid invoices
      const { data: unpaidInvoices } = await supabase
        .from("invoices")
        .select("amount,currency")
        .eq("user_id", row.user_id)
        .in("status", ["issued", "overdue"]);

      const unpaidCount = unpaidInvoices?.length ?? 0;
      if (unpaidCount === 0) continue;

      if (
        !(await isPushCategoryEnabled(
          supabase,
          row.user_id,
          "pushInvoiceReminder",
        ))
      ) {
        continue;
      }

      const totalJpy = (unpaidInvoices ?? []).reduce((sum, inv) => {
        const rates: Record<string, number> = { JPY: 1, USD: 155, EUR: 165 };
        return sum + (inv.amount ?? 0) * (rates[inv.currency ?? "JPY"] ?? 1);
      }, 0);

      const payload = {
        title: "Invoice Reminder",
        body: `${unpaidCount} unpaid invoices (total: ¥${Math.round(totalJpy).toLocaleString()})`,
        url: "/finance",
        tag: `invoice-reminder-${currentMonth}`,
      };

      const sent = await sendPushToUser(supabase, row.user_id, payload);
      invoiceRemindersSent += sent;

      // Update last_sent month
      await supabase.from("user_settings").upsert(
        {
          user_id: row.user_id,
          key: "invoice_reminder_last_sent",
          value: currentMonth,
        },
        { onConflict: "user_id,key" },
      );
    }
  }

  // ========================================
  // Part 5: Server-side calendar notification schedule generation
  // Generate notification schedules from google_calendar_events table
  // so that CalendarPage does NOT need to be open for notifications.
  // ========================================
  const lookAheadMs = 2 * 60 * 60 * 1000; // 2 hours ahead
  const lookAheadIso = new Date(now + lookAheadMs).toISOString();
  const nowIso = new Date(now).toISOString();

  const { data: upcomingCalEvents, error: upcomingError } = await supabase
    .from("google_calendar_events")
    .select("user_id, event_id, summary, start_time, end_time")
    .gt("start_time", nowIso)
    .lte("start_time", lookAheadIso)
    .neq("status", "cancelled");

  if (upcomingError) {
    console.error("Failed to load upcoming calendar events:", upcomingError);
  } else if (upcomingCalEvents && upcomingCalEvents.length > 0) {
    // Group events by user
    const calEventsByUser = new Map<string, typeof upcomingCalEvents>();
    for (const ev of upcomingCalEvents) {
      const list = calEventsByUser.get(ev.user_id) ?? [];
      list.push(ev);
      calEventsByUser.set(ev.user_id, list);
    }

    for (const [userId, userCalEvents] of calEventsByUser) {
      if (
        !(await isPushCategoryEnabled(supabase, userId, "pushCalendarEvent"))
      ) {
        continue;
      }

      // Get existing schedule for this user
      const { data: existingCalRow } = await supabase
        .from("user_settings")
        .select("id, value")
        .eq("user_id", userId)
        .eq("key", "calendar_notification_schedule")
        .maybeSingle();

      const existingCalSchedule = Array.isArray(existingCalRow?.value)
        ? (existingCalRow.value as ScheduledCalendarNotification[])
        : [];
      // Build map of actual event start times from server events
      const serverStartTimes = new Map<string, number>();
      for (const ev of userCalEvents) {
        if (ev.start_time) {
          serverStartTimes.set(
            ev.event_id,
            new Date(ev.start_time as string).getTime(),
          );
        }
      }
      // Only treat notifications as "triggered" if their time still matches the actual event.
      // If the event moved, discard the old triggered entry so a new one can be generated.
      const calTriggeredIds = new Set(
        existingCalSchedule
          .filter((n) => {
            if (!n.triggered) return false;
            const startMs = serverStartTimes.get(n.eventId);
            if (startMs === undefined) return true; // Event not in window, preserve
            const expected =
              n.type === "30min"
                ? startMs - 30 * 60 * 1000
                : startMs - 2 * 60 * 1000;
            return n.scheduledTime === expected;
          })
          .map((n) => n.id),
      );
      const serverEventIds = new Set(userCalEvents.map((e) => e.event_id));

      const serverNotifications: ScheduledCalendarNotification[] = [];

      for (const ev of userCalEvents) {
        if (!ev.start_time) continue;
        const startMs = new Date(ev.start_time as string).getTime();
        if (Number.isNaN(startMs)) continue;

        // 30 min before (all-day events: 00:00 UTC = 09:00 JST → 30min = 08:30 JST)
        const t30 = startMs - 30 * 60 * 1000;
        const id30 = `cal-${ev.event_id}-30min`;
        if (t30 > now && !calTriggeredIds.has(id30)) {
          serverNotifications.push({
            id: id30,
            eventId: ev.event_id,
            eventSummary: (ev.summary as string) || "Untitled Event",
            scheduledTime: t30,
            type: "30min",
            triggered: false,
          });
        }

        // 2 min before
        const t2 = startMs - 2 * 60 * 1000;
        const id2 = `cal-${ev.event_id}-2min`;
        if (t2 > now && !calTriggeredIds.has(id2)) {
          serverNotifications.push({
            id: id2,
            eventId: ev.event_id,
            eventSummary: (ev.summary as string) || "Untitled Event",
            scheduledTime: t2,
            type: "2min",
            triggered: false,
          });
        }
      }

      // Validate preserved entries against DB — events outside the 2h window
      // may have been deleted/cancelled since the schedule was last written.
      const preservedEventIds = [
        ...new Set(
          existingCalSchedule
            .filter((n) => !serverEventIds.has(n.eventId))
            .map((n) => n.eventId),
        ),
      ];
      const deletedPreservedIds = new Set<string>();
      if (preservedEventIds.length > 0) {
        const { data: checkEvents } = await supabase
          .from("google_calendar_events")
          .select("event_id, status")
          .eq("user_id", userId)
          .in("event_id", preservedEventIds);
        const validIds = new Set(
          (checkEvents ?? [])
            .filter((e) => e.status !== "cancelled")
            .map((e) => e.event_id),
        );
        for (const eid of preservedEventIds) {
          if (!validIds.has(eid)) deletedPreservedIds.add(eid);
        }
      }

      // Merge: keep existing entries for events outside server window,
      // preserve triggered entries for events inside the window only if their time is correct,
      // and add server-generated untriggered entries (deduped by ID)
      const preserved = existingCalSchedule.filter(
        (n) =>
          !serverEventIds.has(n.eventId) && !deletedPreservedIds.has(n.eventId),
      );
      const triggeredKept = existingCalSchedule.filter(
        (n) =>
          serverEventIds.has(n.eventId) &&
          n.triggered &&
          calTriggeredIds.has(n.id),
      );
      // Deduplicate: don't add server notifications whose ID already exists
      const existingIds = new Set([
        ...preserved.map((n) => n.id),
        ...triggeredKept.map((n) => n.id),
      ]);
      const dedupedServer = serverNotifications.filter(
        (n) => !existingIds.has(n.id),
      );
      const mergedCal = [...preserved, ...triggeredKept, ...dedupedServer];
      const cleanedCal = pruneSchedule(mergedCal, now);

      if (existingCalRow?.id) {
        await supabase
          .from("user_settings")
          .update({ value: cleanedCal })
          .eq("id", existingCalRow.id);
      } else if (cleanedCal.length > 0) {
        await supabase.from("user_settings").insert({
          user_id: userId,
          key: "calendar_notification_schedule",
          value: cleanedCal,
        });
      }
    }
  }

  // ========================================
  // Part 5a: Validate existing notification schedules against actual event data
  // Catches stale notifications for events moved outside the 2-hour window
  // ========================================
  const { data: allCalScheduleRows, error: calValidationError } = await supabase
    .from("user_settings")
    .select("id, user_id, value")
    .eq("key", "calendar_notification_schedule");

  if (calValidationError) {
    console.error(
      "Failed to load calendar schedules for validation:",
      calValidationError,
    );
  } else {
    for (const row of allCalScheduleRows ?? []) {
      const schedule = Array.isArray(row.value)
        ? (row.value as ScheduledCalendarNotification[])
        : [];

      if (schedule.length === 0) continue;

      const eventIds = [...new Set(schedule.map((n) => n.eventId))];

      const { data: actualEvents } = await supabase
        .from("google_calendar_events")
        .select("event_id, start_time, summary, status")
        .eq("user_id", row.user_id)
        .in("event_id", eventIds);

      const eventDataMap = new Map<
        string,
        { startMs: number; summary: string }
      >();
      const invalidIds = new Set<string>();
      const foundIds = new Set<string>();

      for (const ev of actualEvents ?? []) {
        foundIds.add(ev.event_id);
        if (ev.status === "cancelled" || !ev.start_time) {
          invalidIds.add(ev.event_id);
        } else {
          eventDataMap.set(ev.event_id, {
            startMs: new Date(ev.start_time as string).getTime(),
            summary: (ev.summary as string) || "Untitled Event",
          });
        }
      }
      for (const eid of eventIds) {
        if (!foundIds.has(eid)) invalidIds.add(eid);
      }

      // Quick check: any stale notifications?
      let hasStale = false;
      for (const n of schedule) {
        if (invalidIds.has(n.eventId)) {
          hasStale = true;
          break;
        }
        const data = eventDataMap.get(n.eventId);
        if (data) {
          const expected =
            n.type === "30min"
              ? data.startMs - 30 * 60 * 1000
              : data.startMs - 2 * 60 * 1000;
          if (n.scheduledTime !== expected) {
            hasStale = true;
            break;
          }
        }
      }
      if (!hasStale) continue;

      // Rebuild schedule: keep valid triggered, remove stale, regenerate moved
      const rebuilt: ScheduledCalendarNotification[] = [];
      const regenerated = new Set<string>();
      // Only consider notifications as "triggered" if their time still matches the actual event.
      // This allows regeneration for events whose time has changed.
      const triggeredIds = new Set<string>();
      for (const tn of schedule) {
        if (!tn.triggered) continue;
        if (invalidIds.has(tn.eventId)) continue;
        const tnData = eventDataMap.get(tn.eventId);
        if (tnData) {
          const tnExpected =
            tn.type === "30min"
              ? tnData.startMs - 30 * 60 * 1000
              : tnData.startMs - 2 * 60 * 1000;
          if (tn.scheduledTime !== tnExpected) continue;
        }
        triggeredIds.add(tn.id);
      }

      for (const n of schedule) {
        if (invalidIds.has(n.eventId)) continue;

        if (n.triggered) {
          // Keep triggered entries only if their time matches the actual event
          const tData = eventDataMap.get(n.eventId);
          if (tData) {
            const tExpected =
              n.type === "30min"
                ? tData.startMs - 30 * 60 * 1000
                : tData.startMs - 2 * 60 * 1000;
            if (n.scheduledTime !== tExpected) {
              // Time changed — discard old triggered entry and regenerate
              // so the user gets a fresh notification at the correct time.
              if (!regenerated.has(n.eventId)) {
                regenerated.add(n.eventId);
                const t30 = tData.startMs - 30 * 60 * 1000;
                const id30 = `cal-${n.eventId}-30min`;
                if (t30 > now && !triggeredIds.has(id30)) {
                  rebuilt.push({
                    id: id30,
                    eventId: n.eventId,
                    eventSummary: tData.summary,
                    scheduledTime: t30,
                    type: "30min",
                    triggered: false,
                  });
                }
                const t2 = tData.startMs - 2 * 60 * 1000;
                const id2 = `cal-${n.eventId}-2min`;
                if (t2 > now && !triggeredIds.has(id2)) {
                  rebuilt.push({
                    id: id2,
                    eventId: n.eventId,
                    eventSummary: tData.summary,
                    scheduledTime: t2,
                    type: "2min",
                    triggered: false,
                  });
                }
              }
              continue;
            }
          }
          rebuilt.push(n);
          continue;
        }

        const data = eventDataMap.get(n.eventId);
        if (!data) {
          rebuilt.push(n); // Not in validation set, keep as-is
          continue;
        }

        const expected =
          n.type === "30min"
            ? data.startMs - 30 * 60 * 1000
            : data.startMs - 2 * 60 * 1000;

        if (n.scheduledTime === expected) {
          rebuilt.push(n);
        } else if (!regenerated.has(n.eventId)) {
          regenerated.add(n.eventId);
          // Regenerate both notifications from actual event time
          const t30 = data.startMs - 30 * 60 * 1000;
          const id30 = `cal-${n.eventId}-30min`;
          if (t30 > now && !triggeredIds.has(id30)) {
            rebuilt.push({
              id: id30,
              eventId: n.eventId,
              eventSummary: data.summary,
              scheduledTime: t30,
              type: "30min",
              triggered: false,
            });
          }
          const t2 = data.startMs - 2 * 60 * 1000;
          const id2 = `cal-${n.eventId}-2min`;
          if (t2 > now && !triggeredIds.has(id2)) {
            rebuilt.push({
              id: id2,
              eventId: n.eventId,
              eventSummary: data.summary,
              scheduledTime: t2,
              type: "2min",
              triggered: false,
            });
          }
        }
      }

      const cleaned = pruneSchedule(rebuilt, now);
      await supabase
        .from("user_settings")
        .update({ value: cleaned })
        .eq("id", row.id);
    }
  }

  // ========================================
  // Part 5.5: Auto-update overdue invoices
  // Mark "issued" invoices as "overdue" when past due_date
  // ========================================
  let invoicesMarkedOverdue = 0;

  const { data: overdueInvoices, error: overdueInvError } = await supabase
    .from("invoices")
    .select("id")
    .eq("status", "issued")
    .not("due_date", "is", null)
    .lt("due_date", todayStr);

  if (overdueInvError) {
    console.error("Failed to load overdue invoices:", overdueInvError);
  } else if (overdueInvoices && overdueInvoices.length > 0) {
    const ids = overdueInvoices.map((i) => i.id);
    const { error: updateErr } = await supabase
      .from("invoices")
      .update({ status: "overdue", updated_at: new Date().toISOString() })
      .in("id", ids);

    if (updateErr) {
      console.error("Failed to update overdue invoices:", updateErr);
    } else {
      invoicesMarkedOverdue = ids.length;
    }
  }

  // ========================================
  // Part 6: Recurring invoice auto-generation
  // Run once daily at 9:00 JST
  // ========================================
  let recurringInvoicesCreated = 0;

  if (jstHour === 9) {
    const { data: dueInvoices, error: recurError } = await supabase
      .from("invoices")
      .select("*")
      .neq("repeat_type", "none")
      .not("repeat_next_date", "is", null)
      .lte("repeat_next_date", todayStr);

    if (recurError) {
      console.error("Failed to load recurring invoices:", recurError);
    } else {
      for (const src of dueInvoices ?? []) {
        const newIssueDate = src.repeat_next_date as string;

        // Dedup: check if we already created an invoice for this source + date
        const { data: existing } = await supabase
          .from("invoices")
          .select("id")
          .eq("repeat_source_id", src.id)
          .eq("issue_date", newIssueDate)
          .limit(1);

        if (existing && existing.length > 0) {
          // Already generated — stop source from repeating
          await supabase
            .from("invoices")
            .update({ repeat_type: "none", repeat_next_date: null })
            .eq("id", src.id);
          continue;
        }

        // Auto-increment invoice number
        let newInvoiceNumber = "";
        if (src.invoice_number) {
          const match = (src.invoice_number as string).match(/^(.*?)(\d+)$/);
          if (match) {
            const prefix = match[1];
            const num = parseInt(match[2], 10) + 1;
            newInvoiceNumber =
              prefix + String(num).padStart(match[2].length, "0");
          } else {
            newInvoiceNumber = `${src.invoice_number}-${newIssueDate.replace(/-/g, "")}`;
          }
        }

        // Calculate due date (same offset as original)
        let newDueDate: string | null = null;
        if (src.issue_date && src.due_date) {
          const origIssue = new Date(src.issue_date + "T00:00:00+09:00");
          const origDue = new Date(src.due_date + "T00:00:00+09:00");
          const offsetMs = origDue.getTime() - origIssue.getTime();
          const newDue = new Date(
            new Date(newIssueDate + "T00:00:00+09:00").getTime() + offsetMs,
          );
          newDueDate = newDue.toISOString().split("T")[0];
        }

        const newId = crypto.randomUUID();
        const nowIsoStr = new Date().toISOString();

        // New card inherits repeat settings (rolling chain)
        const nextRepeatDate = calcRepeatNext(newIssueDate, src.repeat_type);

        const newInvoice = {
          id: newId,
          user_id: src.user_id,
          invoice_number: newInvoiceNumber,
          client_id: src.client_id,
          project_id: src.project_id,
          issue_date: newIssueDate,
          due_date: newDueDate,
          paid_date: null,
          amount: src.amount,
          currency: src.currency,
          status: "draft",
          notes: src.notes,
          repeat_type: src.repeat_type,
          repeat_next_date: nextRepeatDate,
          repeat_source_id: src.id,
          pdf_storage_path: null as string | null,
          order_index: null,
          created_at: nowIsoStr,
          updated_at: nowIsoStr,
        };

        // AI PDF generation for repeat invoices
        try {
          const { data: settingRow } = await supabase
            .from("user_settings")
            .select("value")
            .eq("user_id", src.user_id)
            .eq("key", "invoice_business_info")
            .single();

          const business = settingRow?.value;

          if (business?.companyName) {
            let clientName = "";
            let clientAddress = "";
            let clientContactName = "";
            if (src.client_id) {
              const { data: client } = await supabase
                .from("clients")
                .select("name, address, contact_name")
                .eq("id", src.client_id)
                .single();
              if (client) {
                clientName = client.name ?? "";
                clientAddress = client.address ?? "";
                clientContactName = client.contact_name ?? "";
              }
            }

            let projectName = "";
            if (src.project_id) {
              const { data: projectRow } = await supabase
                .from("projects")
                .select("name")
                .eq("id", src.project_id)
                .single();
              projectName = projectRow?.name ?? "";
            }

            const pdfBytes = await buildInvoicePdf({
              invoiceNumber: newInvoiceNumber,
              issueDate: newIssueDate,
              dueDate: newDueDate,
              amount: src.amount ?? 0,
              currency: src.currency ?? "JPY",
              notes: src.notes ?? "",
              clientName,
              clientAddress,
              clientContactName,
              projectName,
              business,
            });

            const newPdfPath = `${src.user_id}/invoices/${newId}.pdf`;
            const { error: upError } = await supabase.storage
              .from("money-files")
              .upload(newPdfPath, pdfBytes, {
                contentType: "application/pdf",
                upsert: true,
              });

            if (!upError) {
              newInvoice.pdf_storage_path = newPdfPath;
            } else {
              console.error("Failed to upload AI PDF:", upError);
            }
          } else {
            console.warn(
              `Business info not configured for user ${src.user_id} — repeat invoice created without PDF`,
            );
          }
        } catch (pdfErr) {
          console.error("AI PDF generation error for repeat:", pdfErr);
        }

        // Insert new invoice
        const { error: insertError } = await supabase
          .from("invoices")
          .insert(newInvoice);

        if (insertError) {
          console.error("Failed to insert recurring invoice:", insertError);
          continue;
        }

        recurringInvoicesCreated++;

        // Stop repeating on source (new card takes over)
        await supabase
          .from("invoices")
          .update({ repeat_type: "none", repeat_next_date: null })
          .eq("id", src.id);
      }
    }
  }

  const vapidOk = configureVapid();
  const result = {
    success: true,
    vapidConfigured: vapidOk,
    pushDiag: pushDiag.length > 0 ? pushDiag : undefined,
    timestamp: new Date().toISOString(),
    scheduledNotificationsSent,
    overdueNotificationsSent,
    calendarNotificationsSent,
    invoiceRemindersSent,
    invoicesMarkedOverdue,
    recurringInvoicesCreated,
    totalSent:
      scheduledNotificationsSent +
      overdueNotificationsSent +
      calendarNotificationsSent +
      invoiceRemindersSent,
  };

  console.log("Notification run complete:", result);

  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
