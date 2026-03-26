import { useState, useCallback } from "react";
import { TENTATIVE_COLOR_ID, TENTATIVE_GROUP_KEY } from "./useGoogleCalendar";
import type { CreateEventInput, CalendarEvent } from "./useGoogleCalendar";

export interface TentativeSlot {
  id: string;
  date: Date;
  startTime: string; // "HH:mm"
  endTime: string; // "HH:mm"
  label: string;
}

export interface BatchCreateParams {
  summary: string;
  description?: string;
  location?: string;
  calendarId: string;
  slots: TentativeSlot[];
}

const DAY_NAMES = ["日", "月", "火", "水", "木", "金", "土"];

function formatSlotLabel(date: Date, start: string, end: string): string {
  const m = date.getMonth() + 1;
  const d = date.getDate();
  const day = DAY_NAMES[date.getDay()];
  return `${m}/${d} (${day}) ${start}-${end}`;
}

function nextHalfHour(): string {
  const now = new Date();
  let h = now.getHours();
  let m = now.getMinutes();
  if (m < 30) {
    m = 30;
  } else {
    h++;
    m = 0;
  }
  if (h >= 24) h = 9;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function addMinutesToTime(time: string, minutes: number): string {
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m + minutes;
  const nh = Math.floor(total / 60) % 24;
  const nm = total % 60;
  return `${String(nh).padStart(2, "0")}:${String(nm).padStart(2, "0")}`;
}

export function useTentativeBatchMode(deps: {
  createEvent: (
    calendarId: string,
    event: CreateEventInput,
    sendUpdates?: "all" | "externalOnly" | "none",
  ) => Promise<CalendarEvent | null>;
  refresh: () => void;
}) {
  const [isActive, setIsActive] = useState(false);
  const [selectedSlots, setSelectedSlots] = useState<TentativeSlot[]>([]);
  const [defaultDuration, setDefaultDuration] = useState(60);
  const [isCreating, setIsCreating] = useState(false);

  const activate = useCallback(() => {
    setIsActive(true);
    setSelectedSlots([]);
  }, []);

  const deactivate = useCallback(() => {
    setIsActive(false);
    setSelectedSlots([]);
  }, []);

  /** Add a slot from a date only (month view tap) — uses default duration */
  const addSlot = useCallback(
    (date: Date, startTimeOverride?: string) => {
      const startTime = startTimeOverride ?? nextHalfHour();
      const endTime = addMinutesToTime(startTime, defaultDuration);
      const slot: TentativeSlot = {
        id: crypto.randomUUID(),
        date: new Date(date.getFullYear(), date.getMonth(), date.getDate()),
        startTime,
        endTime,
        label: formatSlotLabel(date, startTime, endTime),
      };
      setSelectedSlots((prev) => [...prev, slot]);
    },
    [defaultDuration],
  );

  /** Add a slot from a precise date range (week/day view drag) */
  const addSlotFromDateRange = useCallback((start: Date, end: Date) => {
    const startTime = `${String(start.getHours()).padStart(2, "0")}:${String(start.getMinutes()).padStart(2, "0")}`;
    const endTime = `${String(end.getHours()).padStart(2, "0")}:${String(end.getMinutes()).padStart(2, "0")}`;
    const slot: TentativeSlot = {
      id: crypto.randomUUID(),
      date: new Date(start.getFullYear(), start.getMonth(), start.getDate()),
      startTime,
      endTime,
      label: formatSlotLabel(start, startTime, endTime),
    };
    setSelectedSlots((prev) => [...prev, slot]);
  }, []);

  const removeSlot = useCallback((index: number) => {
    setSelectedSlots((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const clearSlots = useCallback(() => {
    setSelectedSlots([]);
  }, []);

  const updateSlotTime = useCallback(
    (index: number, startTime: string, endTime: string) => {
      setSelectedSlots((prev) =>
        prev.map((s, i) =>
          i === index
            ? {
                ...s,
                startTime,
                endTime,
                label: formatSlotLabel(s.date, startTime, endTime),
              }
            : s,
        ),
      );
    },
    [],
  );

  /** Create all slots as Google Calendar events with same groupId */
  const createBatchEvents = useCallback(
    async (params: BatchCreateParams): Promise<boolean> => {
      if (params.slots.length === 0) return false;
      setIsCreating(true);

      const groupId = crypto.randomUUID();
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      let successCount = 0;

      try {
        const results = await Promise.all(
          params.slots.map(async (slot) => {
            const startDt = new Date(slot.date);
            const [sh, sm] = slot.startTime.split(":").map(Number);
            startDt.setHours(sh, sm, 0, 0);

            const endDt = new Date(slot.date);
            const [eh, em] = slot.endTime.split(":").map(Number);
            endDt.setHours(eh, em, 0, 0);

            const input: CreateEventInput = {
              summary: params.summary,
              description: params.description,
              location: params.location,
              start: { dateTime: startDt.toISOString(), timeZone: tz },
              end: { dateTime: endDt.toISOString(), timeZone: tz },
              colorId: TENTATIVE_COLOR_ID,
              extendedProperties: {
                private: { [TENTATIVE_GROUP_KEY]: groupId },
              },
            };

            return deps.createEvent(params.calendarId, input);
          }),
        );

        successCount = results.filter((r) => r !== null).length;

        if (successCount > 0) {
          deps.refresh();
          setSelectedSlots([]);
          setIsActive(false);
        }

        return successCount === params.slots.length;
      } catch (err) {
        console.error("[tentative-batch] Error creating events:", err);
        return false;
      } finally {
        setIsCreating(false);
      }
    },
    [deps],
  );

  return {
    isActive,
    selectedSlots,
    defaultDuration,
    isCreating,
    activate,
    deactivate,
    addSlot,
    addSlotFromDateRange,
    removeSlot,
    clearSlots,
    updateSlotTime,
    setDefaultDuration,
    createBatchEvents,
  };
}
