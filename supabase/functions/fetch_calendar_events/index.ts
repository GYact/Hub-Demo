import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  refreshAccessToken,
  getValidTokenEntries,
} from "../_shared/googleAuth.ts";
import { corsHeaders, handleCors } from "../_shared/cors.ts";

const CALENDAR_API_BASE = "https://www.googleapis.com/calendar/v3";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
  Deno.env.get("SERVICE_ROLE_KEY") ??
  "";

type CalendarEvent = {
  id: string;
  summary?: string;
  description?: string;
  location?: string;
  status?: string;
  htmlLink?: string;
  hangoutLink?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  attendees?: {
    email: string;
    displayName?: string;
    responseStatus?: string;
  }[];
};

type SyncState = {
  calendar_sync_tokens?: Record<string, string>;
  calendar_last_sync?: string;
  gmail_history_id?: string;
  gmail_last_sync?: string;
};

const processUserCalendar = async (
  supabaseAdmin: ReturnType<typeof createClient>,
  userId: string,
  googleEmail: string,
): Promise<{ newItems: number; deletedItems: number; error?: string }> => {
  const accessToken = await refreshAccessToken(
    supabaseAdmin,
    userId,
    googleEmail,
  );
  if (!accessToken) {
    return {
      newItems: 0,
      deletedItems: 0,
      error: "Failed to get access token",
    };
  }

  // Get sync state
  const { data: tokenRow } = await supabaseAdmin
    .from("user_google_tokens")
    .select("sync_state")
    .eq("user_id", userId)
    .eq("google_email", googleEmail)
    .single();

  const syncState = (tokenRow?.sync_state ?? {}) as SyncState;
  const calendarSyncTokens = syncState.calendar_sync_tokens ?? {};

  // Fetch calendar list
  const calListRes = await fetch(`${CALENDAR_API_BASE}/users/me/calendarList`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!calListRes.ok) {
    const err = await calListRes.text().catch(() => "");
    return {
      newItems: 0,
      deletedItems: 0,
      error: `Calendar list error: ${calListRes.status} ${err}`,
    };
  }

  const calListData = await calListRes.json();
  // Skip calendars with freeBusyReader access — they return time slots only (no summary/description)
  const calendars: { id: string; summary: string; accessRole?: string }[] = (
    calListData.items ?? []
  ).filter((c: { accessRole?: string }) => c.accessRole !== "freeBusyReader");

  if (calendars.length === 0) {
    return { newItems: 0, deletedItems: 0 };
  }

  // Get existing event IDs for dedup
  const existingEventIds = new Set<string>();
  {
    let offset = 0;
    const PAGE_SIZE = 1000;
    let hasMore = true;
    while (hasMore) {
      const { data } = await supabaseAdmin
        .from("google_calendar_events")
        .select("event_id")
        .eq("user_id", userId)
        .eq("google_email", googleEmail)
        .range(offset, offset + PAGE_SIZE - 1);
      const rows = data ?? [];
      for (const row of rows) {
        existingEventIds.add(row.event_id);
      }
      hasMore = rows.length === PAGE_SIZE;
      offset += PAGE_SIZE;
    }
  }

  let totalNew = 0;
  let totalDeleted = 0;
  const newCalSyncTokens: Record<string, string> = { ...calendarSyncTokens };

  for (const cal of calendars) {
    try {
      const allEvents: CalendarEvent[] = [];
      let usedSyncToken = false;
      let fullSyncTimeMin = "";
      let fullSyncTimeMax = "";
      const existingSyncToken = calendarSyncTokens[cal.id];

      // Try incremental sync with syncToken
      if (existingSyncToken) {
        let syncPageToken: string | undefined;
        let syncFailed = false;

        do {
          const params = new URLSearchParams({
            singleEvents: "true",
            maxResults: "2500",
          });
          if (syncPageToken) {
            params.set("pageToken", syncPageToken);
          } else {
            params.set("syncToken", existingSyncToken);
          }

          const res = await fetch(
            `${CALENDAR_API_BASE}/calendars/${encodeURIComponent(cal.id)}/events?${params}`,
            { headers: { Authorization: `Bearer ${accessToken}` } },
          );

          if (res.status === 410) {
            // syncToken expired, fall through to full sync
            console.log(
              `syncToken expired for calendar ${cal.id}, doing full sync`,
            );
            syncFailed = true;
            break;
          } else if (res.ok) {
            const data = await res.json();
            allEvents.push(...(data.items ?? []));
            syncPageToken = data.nextPageToken;
            if (data.nextSyncToken) {
              newCalSyncTokens[cal.id] = data.nextSyncToken;
            }
          } else {
            console.error(
              `Incremental sync error for ${cal.id}: ${res.status}`,
            );
            syncFailed = true;
            break;
          }
        } while (syncPageToken);

        if (!syncFailed) {
          usedSyncToken = true;
        }
      }

      // Full sync if no syncToken or expired
      if (!usedSyncToken) {
        const now = new Date();
        fullSyncTimeMin = new Date(2023, 0, 1).toISOString();
        // Cap at 6 months to prevent recurring events expanding infinitely
        fullSyncTimeMax = new Date(
          now.getFullYear(),
          now.getMonth() + 6,
          now.getDate(),
        ).toISOString();

        let pageToken: string | undefined;
        let nextSyncToken: string | undefined;

        do {
          const params = new URLSearchParams({
            maxResults: "250",
            singleEvents: "true",
            orderBy: "startTime",
            timeMin: fullSyncTimeMin,
            timeMax: fullSyncTimeMax,
          });
          if (pageToken) params.set("pageToken", pageToken);

          const res = await fetch(
            `${CALENDAR_API_BASE}/calendars/${encodeURIComponent(cal.id)}/events?${params}`,
            { headers: { Authorization: `Bearer ${accessToken}` } },
          );

          if (!res.ok) {
            console.error(`Calendar events error for ${cal.id}: ${res.status}`);
            break;
          }

          const data = await res.json();
          allEvents.push(...(data.items ?? []));
          pageToken = data.nextPageToken;
          if (data.nextSyncToken) {
            nextSyncToken = data.nextSyncToken;
          }
        } while (pageToken);

        if (nextSyncToken) {
          newCalSyncTokens[cal.id] = nextSyncToken;
        }
      }

      // Process events
      for (const event of allEvents) {
        if (!event.id) continue;

        // Handle cancelled events
        if (event.status === "cancelled") {
          if (existingEventIds.has(event.id)) {
            const { count } = await supabaseAdmin
              .from("google_calendar_events")
              .delete({ count: "exact" })
              .eq("user_id", userId)
              .eq("google_email", googleEmail)
              .eq("event_id", event.id);
            totalDeleted += count ?? 0;
            existingEventIds.delete(event.id);
          }
          continue;
        }

        const isNew = !existingEventIds.has(event.id);
        const start = event.start?.dateTime || event.start?.date || "";
        const end = event.end?.dateTime || event.end?.date || "";

        const nowIso = new Date().toISOString();

        const { error: insertError } = await supabaseAdmin
          .from("google_calendar_events")
          .upsert(
            {
              user_id: userId,
              google_email: googleEmail,
              event_id: event.id,
              calendar_id: cal.id,
              calendar_name: cal.summary,
              summary:
                event.summary ||
                (event.description || event.location ? "(No title)" : "(Busy)"),
              start_time: start || null,
              end_time: end || null,
              location: event.location || null,
              description: event.description?.slice(0, 2000) || null,
              html_link: event.htmlLink || null,
              hangout_link: event.hangoutLink || null,
              status: event.status || null,
              attendees:
                event.attendees?.map((a) => ({
                  email: a.email,
                  name: a.displayName,
                  status: a.responseStatus,
                })) ?? [],
              created_at: start ? new Date(start).toISOString() : nowIso,
              updated_at: nowIso,
            },
            { onConflict: "user_id,google_email,event_id" },
          );

        if (insertError) {
          console.error("Failed to upsert calendar event:", insertError);
        } else {
          existingEventIds.add(event.id);
          if (isNew) totalNew++;
        }
      }
      // Full sync: remove DB events not returned by API (deleted in Google Calendar)
      if (!usedSyncToken) {
        const apiEventIds = new Set(allEvents.map((e) => e.id));
        const { data: dbEventsForCal } = await supabaseAdmin
          .from("google_calendar_events")
          .select("event_id")
          .eq("user_id", userId)
          .eq("google_email", googleEmail)
          .eq("calendar_id", cal.id)
          .gte("start_time", fullSyncTimeMin)
          .lte("start_time", fullSyncTimeMax);

        const staleIds = (dbEventsForCal ?? [])
          .filter((e) => !apiEventIds.has(e.event_id))
          .map((e) => e.event_id);

        if (staleIds.length > 0) {
          const { count } = await supabaseAdmin
            .from("google_calendar_events")
            .delete({ count: "exact" })
            .eq("user_id", userId)
            .eq("google_email", googleEmail)
            .in("event_id", staleIds);
          totalDeleted += count ?? 0;
          for (const id of staleIds) existingEventIds.delete(id);
        }
      }
    } catch (err) {
      console.error(`Error processing calendar ${cal.id}:`, err);
    }
  }

  // Update sync state
  await supabaseAdmin
    .from("user_google_tokens")
    .update({
      sync_state: {
        ...syncState,
        calendar_sync_tokens: newCalSyncTokens,
        calendar_last_sync: new Date().toISOString(),
      },
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("google_email", googleEmail);

  return { newItems: totalNew, deletedItems: totalDeleted };
};

type ScheduledCalendarNotification = {
  id: string;
  eventId: string;
  eventSummary: string;
  scheduledTime: number;
  type: "30min" | "2min";
  triggered: boolean;
};

/**
 * After syncing calendar events, immediately validate and clean up
 * the notification schedule so that deleted/moved events don't fire stale notifications.
 */
const syncCalendarNotifications = async (
  supabaseAdmin: ReturnType<typeof createClient>,
  userId: string,
): Promise<void> => {
  const { data: scheduleRow } = await supabaseAdmin
    .from("user_settings")
    .select("id, value")
    .eq("user_id", userId)
    .eq("key", "calendar_notification_schedule")
    .maybeSingle();

  if (!scheduleRow) return;

  const schedule = Array.isArray(scheduleRow.value)
    ? (scheduleRow.value as ScheduledCalendarNotification[])
    : [];

  if (schedule.length === 0) return;

  // Get all unique event IDs referenced in the schedule
  const eventIds = [...new Set(schedule.map((n) => n.eventId))];

  // Look up current event data in DB
  const { data: events } = await supabaseAdmin
    .from("google_calendar_events")
    .select("event_id, start_time, summary, status")
    .eq("user_id", userId)
    .in("event_id", eventIds);

  const eventMap = new Map<string, { startMs: number; summary: string }>();
  const invalidIds = new Set<string>();
  const foundIds = new Set<string>();

  for (const ev of events ?? []) {
    foundIds.add(ev.event_id);
    if (ev.status === "cancelled" || !ev.start_time) {
      invalidIds.add(ev.event_id);
    } else {
      eventMap.set(ev.event_id, {
        startMs: new Date(ev.start_time as string).getTime(),
        summary: (ev.summary as string) || "Untitled Event",
      });
    }
  }

  // Events not found in DB are also invalid (deleted)
  for (const eid of eventIds) {
    if (!foundIds.has(eid)) invalidIds.add(eid);
  }

  const now = Date.now();
  let changed = false;
  const rebuilt: ScheduledCalendarNotification[] = [];
  const regeneratedEvents = new Set<string>();

  for (const n of schedule) {
    // Remove entries for deleted/cancelled events
    if (invalidIds.has(n.eventId)) {
      changed = true;
      continue;
    }

    const data = eventMap.get(n.eventId);
    if (!data) {
      rebuilt.push(n);
      continue;
    }

    // Check if the notification's scheduled time matches the actual event time
    const expectedTime =
      n.type === "30min"
        ? data.startMs - 30 * 60 * 1000
        : data.startMs - 2 * 60 * 1000;

    if (n.scheduledTime === expectedTime) {
      rebuilt.push(n);
      continue;
    }

    // Time mismatch — event has moved. Regenerate notifications (once per event).
    changed = true;
    if (!regeneratedEvents.has(n.eventId)) {
      regeneratedEvents.add(n.eventId);
      const t30 = data.startMs - 30 * 60 * 1000;
      if (t30 > now) {
        rebuilt.push({
          id: `cal-${n.eventId}-30min`,
          eventId: n.eventId,
          eventSummary: data.summary,
          scheduledTime: t30,
          type: "30min",
          triggered: false,
        });
      }
      const t2 = data.startMs - 2 * 60 * 1000;
      if (t2 > now) {
        rebuilt.push({
          id: `cal-${n.eventId}-2min`,
          eventId: n.eventId,
          eventSummary: data.summary,
          scheduledTime: t2,
          type: "2min",
          triggered: false,
        });
      }
    }
  }

  if (!changed) return;

  // Prune old entries (>24 hours old)
  const dayAgo = now - 24 * 60 * 60 * 1000;
  const cleaned = rebuilt.filter((n) => n.scheduledTime > dayAgo);

  await supabaseAdmin
    .from("user_settings")
    .update({ value: cleaned })
    .eq("id", scheduleRow.id);
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

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  // Get user ID and google_email from request body or auth header
  let userId: string | null = null;
  let googleEmail: string | null = null;
  try {
    const body = await req.json();
    userId = body.user_id;
    googleEmail = body.google_email;
  } catch {
    // No body (cron job)
  }

  if (!userId) {
    const authHeader = req.headers.get("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice(7);
      const {
        data: { user },
      } = await supabaseAdmin.auth.getUser(token);
      userId = user?.id ?? null;
    }
  }

  // Cron mode: process all accounts with valid tokens
  if (!userId) {
    const entries = await getValidTokenEntries(supabaseAdmin);

    if (entries.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "No accounts with valid Google tokens",
          accounts_processed: 0,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    let totalNew = 0;
    const allResults: Record<string, unknown>[] = [];

    for (const { user_id, google_email } of entries) {
      const result = await processUserCalendar(
        supabaseAdmin,
        user_id,
        google_email,
      );
      totalNew += result.newItems;
      allResults.push({ user_id, google_email, ...result });
    }

    // Clean up notification schedules for all processed users
    const processedUserIds = new Set(entries.map((e) => e.user_id));
    for (const uid of processedUserIds) {
      await syncCalendarNotifications(supabaseAdmin, uid);
    }

    return new Response(
      JSON.stringify({
        success: true,
        accounts_processed: entries.length,
        new_items: totalNew,
        results: allResults,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  // Single user mode (manual refresh)
  // If google_email specified, sync that account only; otherwise sync all accounts for this user
  if (googleEmail) {
    const result = await processUserCalendar(
      supabaseAdmin,
      userId,
      googleEmail,
    );
    await syncCalendarNotifications(supabaseAdmin, userId);
    return new Response(JSON.stringify({ success: true, ...result }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Sync all accounts for this user
  const entries = await getValidTokenEntries(supabaseAdmin);
  const userEntries = entries.filter((e) => e.user_id === userId);
  let totalNew = 0;
  const results: Record<string, unknown>[] = [];

  for (const { google_email } of userEntries) {
    const result = await processUserCalendar(
      supabaseAdmin,
      userId,
      google_email,
    );
    totalNew += result.newItems;
    results.push({ google_email, ...result });
  }

  await syncCalendarNotifications(supabaseAdmin, userId);

  return new Response(
    JSON.stringify({ success: true, new_items: totalNew, results }),
    {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
});
