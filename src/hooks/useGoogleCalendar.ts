import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useUserSetting } from "./useUserSetting";
import { supabase } from "../lib/supabase";
import {
  cancelCalendarEventNotification,
  scheduleSingleCalendarEventNotification,
} from "../lib/calendarNotifications";

const CALENDAR_API_BASE = "https://www.googleapis.com/calendar/v3";

export interface CalendarEvent {
  id: string;
  summary: string;
  description?: string;
  location?: string;
  start: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  end: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  status?: string;
  htmlLink?: string;
  colorId?: string;
  creator?: {
    email: string;
    displayName?: string;
  };
  organizer?: {
    email: string;
    displayName?: string;
  };
  attendees?: {
    email: string;
    displayName?: string;
    responseStatus?: "needsAction" | "declined" | "tentative" | "accepted";
  }[];
  recurrence?: string[];
  recurringEventId?: string;
  reminders?: {
    useDefault: boolean;
    overrides?: { method: string; minutes: number }[];
  };
  // Attachments
  attachments?: {
    fileUrl: string;
    title: string;
    mimeType?: string;
    iconLink?: string;
  }[];
  // Google Meet / Conference data
  hangoutLink?: string;
  conferenceData?: {
    conferenceId?: string;
    conferenceSolution?: {
      key?: { type: string };
      name?: string;
      iconUri?: string;
    };
    entryPoints?: {
      entryPointType: string;
      uri: string;
      label?: string;
      pin?: string;
      regionCode?: string;
    }[];
    createRequest?: {
      requestId: string;
      conferenceSolutionKey?: { type: string };
      status?: { statusCode: string };
    };
  };
  // Extended properties (for tentative booking groups etc.)
  extendedProperties?: {
    private?: Record<string, string>;
    shared?: Record<string, string>;
  };
  // Added for multi-calendar support
  calendarId?: string;
}

export interface CalendarList {
  id: string;
  summary: string;
  description?: string;
  backgroundColor?: string;
  foregroundColor?: string;
  primary?: boolean;
  accessRole?: string;
}

export interface CreateEventInput {
  summary: string;
  description?: string;
  location?: string;
  start: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  end: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  colorId?: string;
  recurrence?: string[];
  attendees?: { email: string }[];
  reminders?: {
    useDefault: boolean;
    overrides?: { method: string; minutes: number }[];
  };
  // For creating Google Meet
  conferenceData?: {
    createRequest: {
      requestId: string;
      conferenceSolutionKey: { type: string };
    };
  };
  // Extended properties (for tentative booking groups etc.)
  extendedProperties?: {
    private?: Record<string, string>;
    shared?: Record<string, string>;
  };
}

const SETTINGS_SELECTED_CALENDARS = "google_calendar_selected_ids";

/** Flamingo color ID used for tentative bookings */
export const TENTATIVE_COLOR_ID = "4";
/** Key in extendedProperties.private to store tentative group ID */
export const TENTATIVE_GROUP_KEY = "tentativeGroupId";

export type RSVPStatus = "accepted" | "declined" | "tentative";

export const useGoogleCalendar = () => {
  const {
    googleAccessToken,
    hasGoogleCalendarAccess,
    user,
    activeGoogleEmail,
    isDemoMode,
  } = useAuth();
  const [calendars, setCalendars] = useState<CalendarList[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [selectedCalendarId, setSelectedCalendarId] =
    useState<string>("primary");
  const {
    value: selectedCalendarIds,
    setValue: setSelectedCalendarIdsSetting,
    isLoading: isLoadingCalendarSettings,
  } = useUserSetting<string[]>(SETTINGS_SELECTED_CALENDARS, []);
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setSelectedCalendarIds = useCallback(
    (ids: string[] | ((prev: string[]) => string[])) => {
      const next = typeof ids === "function" ? ids(selectedCalendarIds) : ids;
      setSelectedCalendarIdsSetting(next);
    },
    [selectedCalendarIds, setSelectedCalendarIdsSetting],
  );

  // Sync a calendar event to google_calendar_events DB table (fire-and-forget)
  const syncEventToDb = useCallback(
    (
      calendarId: string,
      event: {
        id: string;
        summary?: string;
        start?: { dateTime?: string; date?: string };
        end?: { dateTime?: string; date?: string };
        location?: string;
        description?: string;
        htmlLink?: string;
        hangoutLink?: string;
        status?: string;
        attendees?: {
          email?: string;
          displayName?: string;
          responseStatus?: string;
        }[];
      },
    ) => {
      if (!user?.id || !activeGoogleEmail || !supabase) return;
      const start = event.start?.dateTime || event.start?.date || null;
      const end = event.end?.dateTime || event.end?.date || null;
      const calName =
        calendars.find((c) => c.id === calendarId)?.summary ?? null;
      supabase
        .from("google_calendar_events")
        .upsert(
          {
            user_id: user.id,
            google_email: activeGoogleEmail,
            event_id: event.id,
            calendar_id: calendarId,
            calendar_name: calName,
            summary:
              event.summary ||
              (event.description || event.location ? "(No title)" : "(Busy)"),
            start_time: start,
            end_time: end,
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
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id,google_email,event_id" },
        )
        .then(({ error: err }) => {
          if (err) console.error("Failed to sync event to DB:", err);
        });
    },
    [user?.id, activeGoogleEmail, calendars],
  );

  // Delete a calendar event from google_calendar_events DB table
  const deleteEventFromDb = useCallback(
    async (eventId: string): Promise<void> => {
      if (!user?.id || !activeGoogleEmail || !supabase) return;
      const { error: err } = await supabase
        .from("google_calendar_events")
        .delete()
        .eq("user_id", user.id)
        .eq("google_email", activeGoogleEmail)
        .eq("event_id", eventId);
      if (err) console.error("Failed to delete event from DB:", err);
    },
    [user?.id, activeGoogleEmail],
  );

  // Fetch all calendars
  const fetchCalendars = useCallback(
    async (silent = false) => {
      if (isDemoMode) return;
      if (!googleAccessToken) {
        setError(
          "No Google access token available. Please connect Google Services.",
        );
        return;
      }

      if (!silent) setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(
          `${CALENDAR_API_BASE}/users/me/calendarList`,
          {
            headers: {
              Authorization: `Bearer ${googleAccessToken}`,
            },
          },
        );

        if (!response.ok) {
          const errorText = await response.text().catch(() => "Unknown error");
          let errorMessage = `Failed to fetch calendars: ${response.status} ${response.statusText}`;

          if (response.status === 401) {
            errorMessage =
              "Google session expired. Please reconnect Google Services from Settings.";
            localStorage.removeItem("hub_google_access_token");
            window.dispatchEvent(new CustomEvent("google-token-expired"));
          } else if (response.status === 403) {
            errorMessage =
              "Google Calendar permission not granted. Please reconnect Google Services from Settings.";
            localStorage.removeItem("hub_google_access_token");
            window.dispatchEvent(new CustomEvent("google-token-expired"));
          }

          console.error("Error fetching calendars:", {
            status: response.status,
            errorText,
          });
          setError(errorMessage);
          return;
        }

        const data = await response.json();
        // Filter out freeBusyReader calendars — they only show time slots without event details
        const items = (data.items || []).filter(
          (c: CalendarList) => c.accessRole !== "freeBusyReader",
        );
        setCalendars(items);

        // Set primary calendar as default
        const primaryCal = data.items?.find((c: CalendarList) => c.primary);
        if (primaryCal) {
          setSelectedCalendarId(primaryCal.id);
        }
      } catch (err) {
        console.error("Error fetching calendars:", err);
        setError(
          err instanceof Error ? err.message : "Failed to fetch calendars",
        );
      } finally {
        if (!silent) setIsLoading(false);
      }
    },
    [googleAccessToken],
  );

  const fetchAllCalendarEvents = useCallback(
    async (
      calendarId: string,
      timeMin?: string,
      timeMax?: string,
    ): Promise<CalendarEvent[]> => {
      if (isDemoMode) return [];
      if (!googleAccessToken) {
        throw new Error(
          "No Google access token available. Please connect Google Services.",
        );
      }

      const baseParams = new URLSearchParams({
        maxResults: "250",
        singleEvents: "true",
        orderBy: "startTime",
        supportsAttachments: "true",
        fields:
          "items(id,summary,description,location,start,end,status,htmlLink,colorId,creator,organizer,attendees,recurrence,recurringEventId,reminders,hangoutLink,conferenceData,attachments,extendedProperties),nextPageToken",
      });

      if (timeMin) baseParams.append("timeMin", timeMin);
      if (timeMax) baseParams.append("timeMax", timeMax);

      const allEvents: CalendarEvent[] = [];
      let pageToken: string | undefined;

      do {
        const params = new URLSearchParams(baseParams);
        if (pageToken) params.append("pageToken", pageToken);

        const response = await fetch(
          `${CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
          {
            headers: {
              Authorization: `Bearer ${googleAccessToken}`,
            },
          },
        );

        if (!response.ok) {
          const errorText = await response.text().catch(() => "Unknown error");
          let errorMessage = `Failed to fetch events: ${response.status} ${response.statusText}`;

          if (response.status === 401 || response.status === 403) {
            errorMessage =
              "Google Calendar permission not granted. Please reconnect Google Services from Settings.";
            localStorage.removeItem("hub_google_access_token");
            window.dispatchEvent(new CustomEvent("google-token-expired"));
          }

          console.error("Error fetching events:", {
            status: response.status,
            errorText,
          });
          throw new Error(errorMessage);
        }

        const data = await response.json();
        allEvents.push(...(data.items || []));
        pageToken = data.nextPageToken;
      } while (pageToken);

      return allEvents;
    },
    [googleAccessToken],
  );

  // Fetch events for a specific calendar and date range
  const fetchEvents = useCallback(
    async (
      calendarId: string = "primary",
      timeMin?: string,
      timeMax?: string,
      silent = false,
    ) => {
      if (isDemoMode) return null;
      if (!googleAccessToken) {
        setError(
          "No Google access token available. Please connect Google Services.",
        );
        return;
      }

      if (!silent) setIsLoading(true);
      setError(null);

      try {
        const allEvents = await fetchAllCalendarEvents(
          calendarId,
          timeMin,
          timeMax,
        );
        setEvents(allEvents);
      } catch (err) {
        console.error("Error fetching events:", err);
        setError(err instanceof Error ? err.message : "Failed to fetch events");
      } finally {
        if (!silent) setIsLoading(false);
      }
    },
    [googleAccessToken, fetchAllCalendarEvents],
  );

  // Fetch events from multiple calendars
  const fetchMultipleCalendarEvents = useCallback(
    async (
      calendarIds: string[],
      timeMin?: string,
      timeMax?: string,
      silent = false,
    ) => {
      if (isDemoMode) return null;
      if (!googleAccessToken) {
        setError(
          "No Google access token available. Please connect Google Services.",
        );
        return;
      }

      if (calendarIds.length === 0) {
        setEvents([]);
        return;
      }

      if (!silent) setIsLoading(true);
      setError(null);

      try {
        // Fetch events from all selected calendars in parallel
        const fetchPromises = calendarIds.map(async (calendarId) => {
          const items = await fetchAllCalendarEvents(
            calendarId,
            timeMin,
            timeMax,
          );
          // Add calendarId to each event for tracking
          return items.map((event: CalendarEvent) => ({
            ...event,
            calendarId,
          }));
        });

        const results = await Promise.all(fetchPromises);

        // Merge all events and sort by start time
        const allEvents = results.flat().sort((a, b) => {
          const aStart = a.start.dateTime || a.start.date || "";
          const bStart = b.start.dateTime || b.start.date || "";
          return aStart.localeCompare(bStart);
        });

        setEvents(allEvents);
      } catch (err) {
        console.error("Error fetching events:", err);
        if (err instanceof Error && err.message.includes("permission")) {
          localStorage.removeItem("hub_google_access_token");
          window.dispatchEvent(new CustomEvent("google-token-expired"));
        }
        setError(err instanceof Error ? err.message : "Failed to fetch events");
      } finally {
        if (!silent) setIsLoading(false);
      }
    },
    [googleAccessToken, fetchAllCalendarEvents],
  );

  // Create a new event
  const createEvent = useCallback(
    async (
      calendarId: string,
      event: CreateEventInput,
      sendUpdates?: "all" | "externalOnly" | "none",
    ) => {
      if (isDemoMode) return null;
      if (!googleAccessToken) {
        setError("No Google access token available");
        return null;
      }

      setIsLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams();
        if (event.conferenceData) params.set("conferenceDataVersion", "1");
        if (sendUpdates) params.set("sendUpdates", sendUpdates);
        const qs = params.toString();
        const url = `${CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events${qs ? `?${qs}` : ""}`;

        const response = await fetch(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${googleAccessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(event),
        });

        if (!response.ok) {
          throw new Error(`Failed to create event: ${response.statusText}`);
        }

        const newEvent = await response.json();
        setEvents((prev) =>
          [...prev, newEvent].sort((a, b) => {
            const aStart = a.start.dateTime || a.start.date || "";
            const bStart = b.start.dateTime || b.start.date || "";
            return aStart.localeCompare(bStart);
          }),
        );

        // Sync to DB so server-side notifications use correct data
        syncEventToDb(calendarId, newEvent);

        // Schedule push notification for the new event
        if (newEvent.start?.dateTime || newEvent.start?.date) {
          scheduleSingleCalendarEventNotification(
            newEvent as CalendarEvent,
          ).catch(console.error);
        }

        return newEvent;
      } catch (err) {
        console.error("Error creating event:", err);
        setError(err instanceof Error ? err.message : "Failed to create event");
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [googleAccessToken, syncEventToDb],
  );

  // Fetch a single event by ID (used to get master event recurrence)
  const getEvent = useCallback(
    async (
      calendarId: string,
      eventId: string,
    ): Promise<CalendarEvent | null> => {
      if (!googleAccessToken) return null;
      try {
        const url = `${CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`;
        const response = await fetch(url, {
          headers: { Authorization: `Bearer ${googleAccessToken}` },
        });
        if (!response.ok) return null;
        return await response.json();
      } catch {
        return null;
      }
    },
    [googleAccessToken],
  );

  // Update an event
  const updateEvent = useCallback(
    async (
      calendarId: string,
      eventId: string,
      updates: Partial<CreateEventInput>,
      sendUpdates?: "all" | "externalOnly" | "none",
    ) => {
      if (isDemoMode) return null;
      if (!googleAccessToken) {
        setError("No Google access token available");
        return null;
      }

      try {
        const hasConferenceData =
          "conferenceData" in updates && updates.conferenceData;
        const params = new URLSearchParams();
        if (hasConferenceData) params.set("conferenceDataVersion", "1");
        if (sendUpdates) params.set("sendUpdates", sendUpdates);
        const qs = params.toString();
        const url = `${CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events/${eventId}${qs ? `?${qs}` : ""}`;

        const response = await fetch(url, {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${googleAccessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(updates),
        });

        if (!response.ok) {
          throw new Error(`Failed to update event: ${response.statusText}`);
        }

        const updatedEvent = await response.json();
        setEvents((prev) =>
          prev.map((e) => (e.id === eventId ? updatedEvent : e)),
        );

        // Sync to DB so server-side notifications use correct data
        syncEventToDb(calendarId, updatedEvent);

        // Re-schedule push notification with updated time
        if (updatedEvent.start?.dateTime || updatedEvent.start?.date) {
          scheduleSingleCalendarEventNotification(
            updatedEvent as CalendarEvent,
          ).catch(console.error);
        }

        return updatedEvent;
      } catch (err) {
        console.error("Error updating event:", err);
        setError(err instanceof Error ? err.message : "Failed to update event");
        return null;
      }
    },
    [googleAccessToken, syncEventToDb],
  );

  // Update a recurring event with mode support (single / thisAndFuture / all)
  const updateRecurringEvent = useCallback(
    async (
      calendarId: string,
      eventId: string,
      updates: Partial<CreateEventInput>,
      recurringEditMode: "single" | "thisAndFuture" | "all",
      recurringEventId: string,
      instanceStartDate: string,
      sendUpdates?: "all" | "externalOnly" | "none",
    ) => {
      if (isDemoMode) return null;
      if (!googleAccessToken) {
        setError("No Google access token available");
        return null;
      }

      const encodedCalendar = encodeURIComponent(calendarId);
      const authHeaders = {
        Authorization: `Bearer ${googleAccessToken}`,
      };

      try {
        if (recurringEditMode === "all") {
          // PATCH the master recurring event to update all instances
          const params = new URLSearchParams();
          if (sendUpdates) params.set("sendUpdates", sendUpdates);
          const qs = params.toString();
          const url = `${CALENDAR_API_BASE}/calendars/${encodedCalendar}/events/${recurringEventId}${qs ? `?${qs}` : ""}`;

          const response = await fetch(url, {
            method: "PATCH",
            headers: { ...authHeaders, "Content-Type": "application/json" },
            body: JSON.stringify(updates),
          });
          if (!response.ok) {
            throw new Error(
              `Failed to update master event: ${response.statusText}`,
            );
          }

          // Refresh to get updated instances from Google
          const now = new Date();
          const timeMin = new Date(
            now.getFullYear(),
            now.getMonth() - 1,
            1,
          ).toISOString();
          const timeMax = new Date(
            now.getFullYear(),
            now.getMonth() + 6,
            now.getDate(),
          ).toISOString();
          const calIds =
            selectedCalendarIds.length > 0 ? selectedCalendarIds : [calendarId];
          await fetchMultipleCalendarEvents(calIds, timeMin, timeMax);

          return true;
        } else if (recurringEditMode === "thisAndFuture") {
          // 1. GET the master event to retrieve its RRULE
          const getResp = await fetch(
            `${CALENDAR_API_BASE}/calendars/${encodedCalendar}/events/${recurringEventId}`,
            { headers: authHeaders },
          );
          if (!getResp.ok) {
            throw new Error(
              `Failed to get master event: ${getResp.statusText}`,
            );
          }
          const masterEvent = await getResp.json();
          const masterRecurrence = masterEvent.recurrence as
            | string[]
            | undefined;

          if (!masterRecurrence || masterRecurrence.length === 0) {
            // No RRULE found — fallback to updating single instance
            return await updateEvent(calendarId, eventId, updates, sendUpdates);
          }

          // 2. Truncate original series: set UNTIL to day before this instance
          const instanceDate = new Date(instanceStartDate);
          instanceDate.setDate(instanceDate.getDate() - 1);
          const untilStr =
            instanceDate.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";

          const truncatedRecurrence = masterRecurrence.map((rule: string) => {
            if (rule.startsWith("RRULE:")) {
              const cleaned = rule
                .replace(/;UNTIL=[^;]*/g, "")
                .replace(/;COUNT=[^;]*/g, "");
              return `${cleaned};UNTIL=${untilStr}`;
            }
            return rule;
          });

          const patchResp = await fetch(
            `${CALENDAR_API_BASE}/calendars/${encodedCalendar}/events/${recurringEventId}`,
            {
              method: "PATCH",
              headers: { ...authHeaders, "Content-Type": "application/json" },
              body: JSON.stringify({ recurrence: truncatedRecurrence }),
            },
          );
          if (!patchResp.ok) {
            throw new Error(
              `Failed to truncate recurring event: ${patchResp.statusText}`,
            );
          }

          // 3. Create new recurring event with edited data
          // Use user-specified recurrence if provided, otherwise keep original RRULE
          const newRecurrence =
            updates.recurrence && updates.recurrence.length > 0
              ? updates.recurrence
              : masterRecurrence.map((rule: string) => {
                  if (rule.startsWith("RRULE:")) {
                    return rule
                      .replace(/;UNTIL=[^;]*/g, "")
                      .replace(/;COUNT=[^;]*/g, "");
                  }
                  return rule;
                });

          const createParams = new URLSearchParams();
          if (sendUpdates) createParams.set("sendUpdates", sendUpdates);
          const createQs = createParams.toString();
          const createUrl = `${CALENDAR_API_BASE}/calendars/${encodedCalendar}/events${createQs ? `?${createQs}` : ""}`;

          const createResp = await fetch(createUrl, {
            method: "POST",
            headers: { ...authHeaders, "Content-Type": "application/json" },
            body: JSON.stringify({ ...updates, recurrence: newRecurrence }),
          });
          if (!createResp.ok) {
            throw new Error(
              `Failed to create new recurring event: ${createResp.statusText}`,
            );
          }

          // 4. Refresh to get the updated series from Google
          const now = new Date();
          const timeMin = new Date(
            now.getFullYear(),
            now.getMonth() - 1,
            1,
          ).toISOString();
          const timeMax = new Date(
            now.getFullYear(),
            now.getMonth() + 6,
            now.getDate(),
          ).toISOString();
          const calIds =
            selectedCalendarIds.length > 0 ? selectedCalendarIds : [calendarId];
          await fetchMultipleCalendarEvents(calIds, timeMin, timeMax);

          return true;
        } else {
          // "single" — update just this instance
          return await updateEvent(calendarId, eventId, updates, sendUpdates);
        }
      } catch (err) {
        console.error("Error updating recurring event:", err);
        setError(
          err instanceof Error
            ? err.message
            : "Failed to update recurring event",
        );
        return null;
      }
    },
    [
      googleAccessToken,
      selectedCalendarIds,
      fetchMultipleCalendarEvents,
      updateEvent,
    ],
  );

  // Delete an event (supports recurring event delete modes)
  const deleteEvent = useCallback(
    async (
      calendarId: string,
      eventId: string,
      recurringDeleteMode?: "single" | "thisAndFuture" | "all",
      recurringEventId?: string,
      instanceStartDate?: string,
    ) => {
      if (isDemoMode) return null;
      if (!googleAccessToken) {
        setError("No Google access token available");
        return false;
      }

      const encodedCalendar = encodeURIComponent(calendarId);
      const authHeaders = {
        Authorization: `Bearer ${googleAccessToken}`,
      };

      try {
        if (recurringDeleteMode === "all" && recurringEventId) {
          // Delete the master recurring event (removes all instances)
          const response = await fetch(
            `${CALENDAR_API_BASE}/calendars/${encodedCalendar}/events/${recurringEventId}`,
            { method: "DELETE", headers: authHeaders },
          );
          if (!response.ok) {
            throw new Error(
              `Failed to delete recurring event: ${response.statusText}`,
            );
          }
          // Cancel notifications and remove from DB for master + all instances
          let idsToCleanup: string[] = [];
          setEvents((prev) => {
            idsToCleanup = prev
              .filter(
                (e) =>
                  e.id === recurringEventId ||
                  e.recurringEventId === recurringEventId,
              )
              .map((e) => e.id);
            return prev.filter(
              (e) =>
                e.id !== recurringEventId &&
                e.recurringEventId !== recurringEventId,
            );
          });
          await Promise.all(
            idsToCleanup.map(async (id) => {
              await deleteEventFromDb(id);
              await cancelCalendarEventNotification(id);
            }),
          );
        } else if (
          recurringDeleteMode === "thisAndFuture" &&
          recurringEventId &&
          instanceStartDate
        ) {
          // Get the master event to modify its RRULE
          const getResp = await fetch(
            `${CALENDAR_API_BASE}/calendars/${encodedCalendar}/events/${recurringEventId}`,
            { headers: authHeaders },
          );
          if (!getResp.ok) {
            throw new Error(
              `Failed to get master event: ${getResp.statusText}`,
            );
          }
          const masterEvent = await getResp.json();

          // Calculate UNTIL date (day before the instance, in UTC format)
          const instanceDate = new Date(instanceStartDate);
          instanceDate.setDate(instanceDate.getDate() - 1);
          const untilStr =
            instanceDate.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";

          // Update RRULE with UNTIL
          const updatedRecurrence = (masterEvent.recurrence as string[])?.map(
            (rule: string) => {
              if (rule.startsWith("RRULE:")) {
                // Remove existing UNTIL/COUNT if present
                const cleaned = rule
                  .replace(/;UNTIL=[^;]*/g, "")
                  .replace(/;COUNT=[^;]*/g, "");
                return `${cleaned};UNTIL=${untilStr}`;
              }
              return rule;
            },
          );

          const patchResp = await fetch(
            `${CALENDAR_API_BASE}/calendars/${encodedCalendar}/events/${recurringEventId}`,
            {
              method: "PATCH",
              headers: {
                ...authHeaders,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ recurrence: updatedRecurrence }),
            },
          );
          if (!patchResp.ok) {
            throw new Error(
              `Failed to update recurring event: ${patchResp.statusText}`,
            );
          }

          // Remove this instance and all future instances from local state
          const cutoffDate = new Date(instanceStartDate);
          let futureIdsToCleanup: string[] = [];
          setEvents((prev) => {
            futureIdsToCleanup = prev
              .filter((e) => {
                if (
                  e.recurringEventId !== recurringEventId ||
                  e.id === recurringEventId
                )
                  return false;
                const eventDate = new Date(
                  e.start.dateTime || e.start.date || "",
                );
                return eventDate >= cutoffDate;
              })
              .map((e) => e.id);
            return prev.filter((e) => {
              if (
                e.recurringEventId !== recurringEventId &&
                e.id !== recurringEventId
              )
                return true;
              if (e.id === recurringEventId) return true; // Keep master event
              const eventDate = new Date(
                e.start.dateTime || e.start.date || "",
              );
              return eventDate < cutoffDate;
            });
          });
          await Promise.all(
            futureIdsToCleanup.map(async (id) => {
              await deleteEventFromDb(id);
              await cancelCalendarEventNotification(id);
            }),
          );
        } else {
          // Default: delete single instance
          const response = await fetch(
            `${CALENDAR_API_BASE}/calendars/${encodedCalendar}/events/${eventId}`,
            { method: "DELETE", headers: authHeaders },
          );
          if (!response.ok) {
            throw new Error(`Failed to delete event: ${response.statusText}`);
          }
          setEvents((prev) => prev.filter((e) => e.id !== eventId));
          await deleteEventFromDb(eventId);
          await cancelCalendarEventNotification(eventId);
        }

        return true;
      } catch (err) {
        console.error("Error deleting event:", err);
        setError(err instanceof Error ? err.message : "Failed to delete event");
        return false;
      }
    },
    [googleAccessToken, deleteEventFromDb],
  );

  // Respond to event invitation (RSVP)
  const respondToEvent = useCallback(
    async (
      calendarId: string,
      eventId: string,
      response: RSVPStatus,
    ): Promise<CalendarEvent | null> => {
      if (isDemoMode) return null;
      if (!googleAccessToken) {
        setError("No Google access token available");
        return null;
      }

      if (!user?.email) {
        setError("User email not available");
        return null;
      }

      try {
        // First, get the current event to get attendees list
        const getResponse = await fetch(
          `${CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`,
          {
            headers: {
              Authorization: `Bearer ${googleAccessToken}`,
            },
          },
        );

        if (!getResponse.ok) {
          throw new Error(`Failed to get event: ${getResponse.statusText}`);
        }

        const currentEvent: CalendarEvent = await getResponse.json();

        // Update the user's response status in the attendees list
        const updatedAttendees = currentEvent.attendees?.map((attendee) => {
          if (attendee.email.toLowerCase() === user.email?.toLowerCase()) {
            return { ...attendee, responseStatus: response };
          }
          return attendee;
        });

        // Patch the event with updated attendees
        const patchResponse = await fetch(
          `${CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events/${eventId}?sendUpdates=all`,
          {
            method: "PATCH",
            headers: {
              Authorization: `Bearer ${googleAccessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              attendees: updatedAttendees,
            }),
          },
        );

        if (!patchResponse.ok) {
          throw new Error(`Failed to update RSVP: ${patchResponse.statusText}`);
        }

        const updatedEvent = await patchResponse.json();
        setEvents((prev) =>
          prev.map((e) =>
            e.id === eventId ? { ...updatedEvent, calendarId } : e,
          ),
        );
        return updatedEvent;
      } catch (err) {
        console.error("Error responding to event:", err);
        setError(
          err instanceof Error ? err.message : "Failed to respond to event",
        );
        return null;
      }
    },
    [googleAccessToken, user?.email],
  );

  // Quick add event using natural language
  const quickAddEvent = useCallback(
    async (calendarId: string, text: string) => {
      if (isDemoMode) return null;
      if (!googleAccessToken) {
        setError("No Google access token available");
        return null;
      }

      try {
        const response = await fetch(
          `${CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events/quickAdd?text=${encodeURIComponent(text)}`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${googleAccessToken}`,
            },
          },
        );

        if (!response.ok) {
          throw new Error(`Failed to quick add event: ${response.statusText}`);
        }

        const newEvent = await response.json();
        setEvents((prev) =>
          [...prev, newEvent].sort((a, b) => {
            const aStart = a.start.dateTime || a.start.date || "";
            const bStart = b.start.dateTime || b.start.date || "";
            return aStart.localeCompare(bStart);
          }),
        );
        return newEvent;
      } catch (err) {
        console.error("Error quick adding event:", err);
        setError(
          err instanceof Error ? err.message : "Failed to quick add event",
        );
        return null;
      }
    },
    [googleAccessToken],
  );

  // Search events across calendars
  const searchEvents = useCallback(
    async (calendarIds: string[], query: string): Promise<CalendarEvent[]> => {
      if (!googleAccessToken || !query.trim()) return [];

      const fetchPromises = calendarIds.map(async (calendarId) => {
        const params = new URLSearchParams({
          q: query,
          maxResults: "50",
          singleEvents: "true",
          orderBy: "startTime",
          timeMin: new Date(
            Date.now() - 365 * 24 * 60 * 60 * 1000,
          ).toISOString(),
          timeMax: new Date(
            Date.now() + 365 * 24 * 60 * 60 * 1000,
          ).toISOString(),
        });

        const response = await fetch(
          `${CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
          { headers: { Authorization: `Bearer ${googleAccessToken}` } },
        );
        if (!response.ok) return [];
        const data = await response.json();
        return (data.items || []).map((e: CalendarEvent) => ({
          ...e,
          calendarId,
        }));
      });

      const results = await Promise.all(fetchPromises);
      return results.flat().sort((a, b) => {
        const aStart = a.start.dateTime || a.start.date || "";
        const bStart = b.start.dateTime || b.start.date || "";
        return aStart.localeCompare(bStart);
      });
    },
    [googleAccessToken],
  );

  // Query free/busy information
  const queryFreeBusy = useCallback(
    async (request: {
      timeMin: string;
      timeMax: string;
      items: { id: string }[];
    }): Promise<Record<string, { busy: { start: string; end: string }[] }>> => {
      if (!googleAccessToken) return {};

      try {
        const response = await fetch(`${CALENDAR_API_BASE}/freeBusy`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${googleAccessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(request),
        });

        if (!response.ok) return {};
        const data = await response.json();
        return data.calendars || {};
      } catch {
        return {};
      }
    },
    [googleAccessToken],
  );

  // Move an event to another calendar
  const moveEvent = useCallback(
    async (
      sourceCalendarId: string,
      eventId: string,
      destinationCalendarId: string,
    ): Promise<CalendarEvent | null> => {
      if (!googleAccessToken) return null;

      try {
        const response = await fetch(
          `${CALENDAR_API_BASE}/calendars/${encodeURIComponent(sourceCalendarId)}/events/${eventId}/move?destination=${encodeURIComponent(destinationCalendarId)}`,
          {
            method: "POST",
            headers: { Authorization: `Bearer ${googleAccessToken}` },
          },
        );

        if (!response.ok) {
          throw new Error(`Failed to move event: ${response.statusText}`);
        }

        const movedEvent = await response.json();
        // Remove from old calendar, add to new
        setEvents((prev) =>
          prev
            .filter((e) => e.id !== eventId)
            .concat({ ...movedEvent, calendarId: destinationCalendarId })
            .sort((a, b) => {
              const aStart = a.start.dateTime || a.start.date || "";
              const bStart = b.start.dateTime || b.start.date || "";
              return aStart.localeCompare(bStart);
            }),
        );
        return movedEvent;
      } catch (err) {
        console.error("Error moving event:", err);
        setError(err instanceof Error ? err.message : "Failed to move event");
        return null;
      }
    },
    [googleAccessToken],
  );

  // Create a new calendar
  const createCalendar = useCallback(
    async (
      summary: string,
      description?: string,
    ): Promise<CalendarList | null> => {
      if (!googleAccessToken) return null;

      try {
        const response = await fetch(`${CALENDAR_API_BASE}/calendars`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${googleAccessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ summary, description }),
        });

        if (!response.ok) {
          throw new Error(`Failed to create calendar: ${response.statusText}`);
        }

        const newCalendar = await response.json();
        setCalendars((prev) => [...prev, newCalendar]);
        return newCalendar;
      } catch (err) {
        console.error("Error creating calendar:", err);
        setError(
          err instanceof Error ? err.message : "Failed to create calendar",
        );
        return null;
      }
    },
    [googleAccessToken],
  );

  // Delete a calendar
  const deleteCalendar = useCallback(
    async (calendarId: string): Promise<boolean> => {
      if (!googleAccessToken) return false;

      try {
        const response = await fetch(
          `${CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId)}`,
          {
            method: "DELETE",
            headers: { Authorization: `Bearer ${googleAccessToken}` },
          },
        );

        if (!response.ok) {
          throw new Error(`Failed to delete calendar: ${response.statusText}`);
        }

        setCalendars((prev) => prev.filter((c) => c.id !== calendarId));
        return true;
      } catch (err) {
        console.error("Error deleting calendar:", err);
        setError(
          err instanceof Error ? err.message : "Failed to delete calendar",
        );
        return false;
      }
    },
    [googleAccessToken],
  );

  // Get calendar ACL rules
  const getCalendarAcl = useCallback(
    async (
      calendarId: string,
    ): Promise<
      { id: string; role: string; scope: { type: string; value: string } }[]
    > => {
      if (!googleAccessToken) return [];

      try {
        const response = await fetch(
          `${CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId)}/acl`,
          { headers: { Authorization: `Bearer ${googleAccessToken}` } },
        );

        if (!response.ok) return [];
        const data = await response.json();
        return data.items || [];
      } catch {
        return [];
      }
    },
    [googleAccessToken],
  );

  // Add ACL rule to calendar
  const addCalendarAcl = useCallback(
    async (
      calendarId: string,
      email: string,
      role: "reader" | "writer" | "owner",
    ): Promise<boolean> => {
      if (!googleAccessToken) return false;

      try {
        const response = await fetch(
          `${CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId)}/acl`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${googleAccessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              role,
              scope: { type: "user", value: email },
            }),
          },
        );

        return response.ok;
      } catch {
        return false;
      }
    },
    [googleAccessToken],
  );

  // Remove ACL rule from calendar
  const removeCalendarAcl = useCallback(
    async (calendarId: string, ruleId: string): Promise<boolean> => {
      if (!googleAccessToken) return false;

      try {
        const response = await fetch(
          `${CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId)}/acl/${encodeURIComponent(ruleId)}`,
          {
            method: "DELETE",
            headers: { Authorization: `Bearer ${googleAccessToken}` },
          },
        );

        return response.ok;
      } catch {
        return false;
      }
    },
    [googleAccessToken],
  );

  // Fetch calendar settings
  const fetchCalendarSettings = useCallback(async (): Promise<
    Record<string, string>
  > => {
    if (!googleAccessToken) return {};

    try {
      const response = await fetch(`${CALENDAR_API_BASE}/users/me/settings`, {
        headers: { Authorization: `Bearer ${googleAccessToken}` },
      });

      if (!response.ok) return {};
      const data = await response.json();
      const settings: Record<string, string> = {};
      for (const item of data.items || []) {
        settings[item.id] = item.value;
      }
      return settings;
    } catch {
      return {};
    }
  }, [googleAccessToken]);

  // ── Tentative booking (仮押さえ) ──────────────────────────────────────

  /** Check if an event is a tentative booking */
  const isTentativeEvent = useCallback((event: CalendarEvent): boolean => {
    return (
      event.colorId === TENTATIVE_COLOR_ID &&
      !!event.extendedProperties?.private?.[TENTATIVE_GROUP_KEY]
    );
  }, []);

  /** Get the tentative group ID from an event */
  const getTentativeGroupId = useCallback(
    (event: CalendarEvent): string | null => {
      return event.extendedProperties?.private?.[TENTATIVE_GROUP_KEY] ?? null;
    },
    [],
  );

  /** Find all events in the same tentative group from local state */
  const getTentativeGroupEvents = useCallback(
    (groupId: string): CalendarEvent[] => {
      return events.filter(
        (e) => e.extendedProperties?.private?.[TENTATIVE_GROUP_KEY] === groupId,
      );
    },
    [events],
  );

  /**
   * Confirm a tentative event:
   * 1. Change its color to Graphite (default) and remove tentativeGroupId
   * 2. Delete all other events in the same tentative group
   */
  const confirmTentativeEvent = useCallback(
    async (calendarId: string, event: CalendarEvent): Promise<boolean> => {
      if (isDemoMode) return false;
      if (!googleAccessToken) {
        setError("No Google access token available");
        return false;
      }

      const groupId = event.extendedProperties?.private?.[TENTATIVE_GROUP_KEY];
      if (!groupId) {
        setError("This event is not a tentative booking");
        return false;
      }

      try {
        // 1. Update confirmed event: change color to Graphite, remove tentative group
        const encodedCal = encodeURIComponent(calendarId);
        const patchRes = await fetch(
          `${CALENDAR_API_BASE}/calendars/${encodedCal}/events/${event.id}`,
          {
            method: "PATCH",
            headers: {
              Authorization: `Bearer ${googleAccessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              colorId: "8", // Graphite (default)
              extendedProperties: {
                private: { [TENTATIVE_GROUP_KEY]: "" },
              },
            }),
          },
        );
        if (!patchRes.ok) {
          throw new Error(`Failed to confirm event: ${patchRes.statusText}`);
        }
        const updatedEvent = await patchRes.json();

        // 2. Find and delete all other events in the same group
        const otherEvents = events.filter(
          (e) =>
            e.id !== event.id &&
            e.extendedProperties?.private?.[TENTATIVE_GROUP_KEY] === groupId,
        );

        const deletePromises = otherEvents.map(async (e) => {
          const eCalId = encodeURIComponent(e.calendarId || calendarId);
          try {
            const delRes = await fetch(
              `${CALENDAR_API_BASE}/calendars/${eCalId}/events/${e.id}`,
              {
                method: "DELETE",
                headers: {
                  Authorization: `Bearer ${googleAccessToken}`,
                },
              },
            );
            if (delRes.ok) {
              await deleteEventFromDb(e.id);
              await cancelCalendarEventNotification(e.id);
            }
          } catch (err) {
            console.error("Failed to delete tentative event:", e.id, err);
          }
        });

        await Promise.all(deletePromises);

        // 3. Update local state
        const deletedIds = new Set(otherEvents.map((e) => e.id));
        setEvents((prev) =>
          prev
            .filter((e) => !deletedIds.has(e.id))
            .map((e) => (e.id === event.id ? { ...e, ...updatedEvent } : e)),
        );

        // Sync updated event to DB
        syncEventToDb(calendarId, updatedEvent);

        return true;
      } catch (err) {
        console.error("Error confirming tentative event:", err);
        setError(
          err instanceof Error ? err.message : "Failed to confirm event",
        );
        return false;
      }
    },
    [googleAccessToken, events, deleteEventFromDb, syncEventToDb],
  );

  // Demo mode: load events directly from Supabase DB
  useEffect(() => {
    if (!isDemoMode || !user?.id || !supabase) return;
    setIsLoading(true);
    supabase
      .from("google_calendar_events")
      .select("*")
      .eq("user_id", user.id)
      .then(({ data, error: err }) => {
        if (err) {
          console.error("Demo calendar fetch error:", err);
          setIsLoading(false);
          return;
        }
        const mapped: CalendarEvent[] = (data || []).map(
          (row: Record<string, unknown>) => ({
            id: row.event_id as string,
            summary: (row.summary as string) || "(No title)",
            description: (row.description as string) || undefined,
            location: (row.location as string) || undefined,
            start: { dateTime: row.start_time as string },
            end: { dateTime: row.end_time as string },
            status: (row.status as string) || "confirmed",
            htmlLink: (row.html_link as string) || undefined,
            hangoutLink: (row.hangout_link as string) || undefined,
            colorId: undefined,
            attendees: Array.isArray(row.attendees)
              ? (row.attendees as CalendarEvent["attendees"])
              : [],
            calendarId: (row.calendar_id as string) || "primary",
          }),
        );
        setEvents(mapped);
        setCalendars([{ id: "primary", summary: "メイン", primary: true }]);
        setIsLoading(false);
      });
  }, [isDemoMode, user?.id]);

  // Fetch calendars on mount if we have access (non-demo)
  useEffect(() => {
    if (isDemoMode) return;
    if (hasGoogleCalendarAccess && googleAccessToken) {
      fetchCalendars();
    }
  }, [isDemoMode, hasGoogleCalendarAccess, googleAccessToken, fetchCalendars]);

  // Note: Event fetching is now handled by CalendarPage using fetchMultipleCalendarEvents
  // to support multiple calendar selection

  return {
    calendars,
    events,
    selectedCalendarId,
    setSelectedCalendarId,
    selectedCalendarIds,
    setSelectedCalendarIds,
    isLoading,
    isSyncing,
    isLoadingCalendarSettings,
    error,
    isConnected: isDemoMode || (hasGoogleCalendarAccess && !!googleAccessToken),
    fetchCalendars,
    fetchEvents,
    fetchMultipleCalendarEvents,
    getEvent,
    createEvent,
    updateEvent,
    updateRecurringEvent,
    deleteEvent,
    respondToEvent,
    quickAddEvent,
    searchEvents,
    queryFreeBusy,
    moveEvent,
    createCalendar,
    deleteCalendar,
    getCalendarAcl,
    addCalendarAcl,
    removeCalendarAcl,
    fetchCalendarSettings,
    // Tentative booking (仮押さえ)
    isTentativeEvent,
    getTentativeGroupId,
    getTentativeGroupEvents,
    confirmTentativeEvent,
    refresh: async () => {
      setIsSyncing(true);
      try {
        const now = new Date();
        const timeMin = new Date(
          now.getFullYear(),
          now.getMonth() - 1,
          1,
        ).toISOString();
        const timeMax = new Date(
          now.getFullYear(),
          now.getMonth() + 2,
          0,
        ).toISOString();
        if (selectedCalendarIds.length > 0) {
          await fetchMultipleCalendarEvents(
            selectedCalendarIds,
            timeMin,
            timeMax,
            true,
          );
        } else if (selectedCalendarId) {
          await fetchEvents(selectedCalendarId, timeMin, timeMax, true);
        }
        await fetchCalendars(true);
      } finally {
        setIsSyncing(false);
      }
    },
  };
};
