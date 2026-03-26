import { useState, useEffect, useCallback } from "react";
import {
  Calendar,
  Loader2,
  ExternalLink,
  RefreshCw,
  Sparkles,
  CheckCircle,
  AlertCircle,
  Repeat,
} from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { supabase } from "../../lib/supabase";
import { DriveFileList } from "./DriveFileList";

interface CalendarEvent {
  id: string;
  summary: string;
  description?: string;
  location?: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
  attendees?: {
    email: string;
    displayName?: string;
    responseStatus?: string;
  }[];
  recurrence?: string[];
  recurringEventId?: string;
  organizer?: { email: string; displayName?: string };
}

interface GenerateResult {
  eventId: string;
  status: "idle" | "generating" | "success" | "error";
  driveFileId?: string;
  fileName?: string;
  error?: string;
}

export const DocumentsPanel = () => {
  const { user, googleAccessToken, activeGoogleEmail } = useAuth();
  const [recurringEvents, setRecurringEvents] = useState<CalendarEvent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [generateResults, setGenerateResults] = useState<
    Record<string, GenerateResult>
  >({});

  const fetchRecurringMeetings = useCallback(async () => {
    if (!googleAccessToken) return;

    setIsLoading(true);
    try {
      const now = new Date();
      const twoWeeksLater = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

      const params = new URLSearchParams({
        timeMin: now.toISOString(),
        timeMax: twoWeeksLater.toISOString(),
        singleEvents: "true",
        orderBy: "startTime",
        maxResults: "50",
        fields:
          "items(id,summary,description,location,start,end,attendees,recurrence,recurringEventId,organizer)",
      });

      const res = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
        { headers: { Authorization: `Bearer ${googleAccessToken}` } },
      );

      if (!res.ok) throw new Error(`Calendar API: ${res.status}`);

      const data = await res.json();
      const events = (data.items ?? []) as CalendarEvent[];

      // Filter to recurring events only
      const recurring = events.filter(
        (e) => e.recurringEventId || (e.recurrence && e.recurrence.length > 0),
      );

      // Deduplicate by recurringEventId (keep earliest instance)
      const seen = new Map<string, CalendarEvent>();
      for (const ev of recurring) {
        const key = ev.recurringEventId || ev.id;
        if (!seen.has(key)) {
          seen.set(key, ev);
        }
      }

      setRecurringEvents(Array.from(seen.values()));
    } catch (err) {
      console.error("Failed to fetch recurring meetings:", err);
    } finally {
      setIsLoading(false);
    }
  }, [googleAccessToken]);

  useEffect(() => {
    fetchRecurringMeetings();
  }, [fetchRecurringMeetings]);

  const handleGenerateAgenda = useCallback(
    async (event: CalendarEvent) => {
      if (!user?.id || !activeGoogleEmail || !supabase) return;

      const eventId = event.id;
      setGenerateResults((prev) => ({
        ...prev,
        [eventId]: { eventId, status: "generating" },
      }));

      try {
        const eventDate =
          event.start.dateTime?.slice(0, 10) || event.start.date || undefined;

        const { data, error } = await supabase.functions.invoke(
          "generate_agenda",
          {
            body: {
              userId: user.id,
              googleEmail: activeGoogleEmail,
              eventId: event.recurringEventId || event.id,
              eventDate,
            },
          },
        );

        if (error) throw error;

        setGenerateResults((prev) => ({
          ...prev,
          [eventId]: {
            eventId,
            status: "success",
            driveFileId: data.driveFileId,
            fileName: data.fileName,
          },
        }));
      } catch (err) {
        console.error("Generate agenda failed:", err);
        setGenerateResults((prev) => ({
          ...prev,
          [eventId]: {
            eventId,
            status: "error",
            error: err instanceof Error ? err.message : "Failed",
          },
        }));
      }
    },
    [user?.id, activeGoogleEmail],
  );

  const formatEventTime = (event: CalendarEvent) => {
    if (!event.start.dateTime) return event.start.date || "";
    const start = new Date(event.start.dateTime);
    const end = event.end.dateTime ? new Date(event.end.dateTime) : null;
    const date = start.toLocaleDateString("ja-JP", {
      month: "short",
      day: "numeric",
      weekday: "short",
    });
    const startTime = start.toLocaleTimeString("ja-JP", {
      hour: "2-digit",
      minute: "2-digit",
    });
    const endTime = end
      ? end.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })
      : "";
    return `${date} ${startTime}${endTime ? ` - ${endTime}` : ""}`;
  };

  if (!googleAccessToken) {
    return (
      <div className="text-center py-16 neu-card">
        <Calendar size={48} className="mx-auto neu-text-muted mb-4" />
        <p className="neu-text-secondary">
          Connect Google to view recurring meetings
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Google Drive meetings folder */}
      <DriveFileList folderName="99_Meetings" />

      {/* Recurring Meetings List */}
      <div className="neu-card p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Repeat size={16} className="text-violet-600" />
            <h3 className="text-sm font-semibold neu-text-primary">
              Recurring Meetings (Next 2 Weeks)
            </h3>
          </div>
          <button
            onClick={fetchRecurringMeetings}
            disabled={isLoading}
            className="p-1.5 neu-btn rounded-lg neu-text-secondary hover:neu-text-primary transition-colors"
            title="Refresh"
          >
            <RefreshCw size={14} className={isLoading ? "animate-spin" : ""} />
          </button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-8 neu-text-secondary">
            <Loader2 size={18} className="animate-spin" />
            <span className="text-sm">Loading meetings...</span>
          </div>
        ) : recurringEvents.length === 0 ? (
          <div className="text-center py-8">
            <Calendar size={36} className="mx-auto neu-text-muted mb-3" />
            <p className="text-sm neu-text-secondary">
              No recurring meetings found in the next 2 weeks
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {recurringEvents.map((event) => {
              const result = generateResults[event.id];
              const isGenerating = result?.status === "generating";
              const isSuccess = result?.status === "success";
              const isError = result?.status === "error";

              return (
                <div
                  key={event.id}
                  className="flex items-center gap-3 p-3 rounded-xl neu-pressed"
                >
                  <div className="shrink-0">
                    <Calendar size={16} className="text-violet-500" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium neu-text-primary truncate">
                      {event.summary}
                    </div>
                    <div className="text-xs neu-text-secondary mt-0.5">
                      {formatEventTime(event)}
                      {event.location && ` / ${event.location}`}
                    </div>
                    {event.attendees && event.attendees.length > 0 && (
                      <div className="text-[10px] neu-text-muted mt-0.5 truncate">
                        {event.attendees
                          .slice(0, 5)
                          .map((a) => a.displayName || a.email.split("@")[0])
                          .join(", ")}
                        {event.attendees.length > 5 &&
                          ` +${event.attendees.length - 5}`}
                      </div>
                    )}

                    {/* Success message */}
                    {isSuccess && result.driveFileId && (
                      <div className="flex items-center gap-1.5 mt-1.5">
                        <CheckCircle size={12} className="text-emerald-500" />
                        <span className="text-[10px] text-emerald-600">
                          {result.fileName}
                        </span>
                        <a
                          href={`https://drive.google.com/file/d/${result.driveFileId}/view`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sky-600 hover:text-sky-500"
                        >
                          <ExternalLink size={10} />
                        </a>
                      </div>
                    )}

                    {/* Error message */}
                    {isError && (
                      <div className="flex items-center gap-1.5 mt-1.5">
                        <AlertCircle size={12} className="text-red-500" />
                        <span className="text-[10px] text-red-500 truncate">
                          {result.error}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Generate button */}
                  <button
                    onClick={() => handleGenerateAgenda(event)}
                    disabled={isGenerating}
                    className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      isGenerating
                        ? "neu-pressed neu-text-muted cursor-wait"
                        : isSuccess
                          ? "neu-btn text-emerald-600 hover:text-emerald-500"
                          : "neu-btn text-violet-600 hover:text-violet-500"
                    }`}
                    title="Generate Agenda PDF"
                  >
                    {isGenerating ? (
                      <>
                        <Loader2 size={12} className="animate-spin" />
                        <span className="hidden sm:inline">Generating...</span>
                      </>
                    ) : isSuccess ? (
                      <>
                        <Sparkles size={12} />
                        <span className="hidden sm:inline">Regenerate</span>
                      </>
                    ) : (
                      <>
                        <Sparkles size={12} />
                        <span className="hidden sm:inline">Generate</span>
                      </>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
