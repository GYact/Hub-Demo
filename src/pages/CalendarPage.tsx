import { useState, useMemo, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import {
  Plus,
  Trash2,
  Loader2,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Calendar as CalendarIcon,
  Clock,
  MapPin,
  X,
  ChevronDown,
  Users,
  Repeat,
  Bell,
  Video,
  ExternalLink,
  Copy,
  Check,
  Search,
  Paperclip,
  Settings,
  Share2,
  UserPlus,
  ArrowRightLeft,
  CalendarPlus,
} from "lucide-react";
import { Link } from "react-router-dom";
import {
  useGoogleCalendar,
  CalendarEvent,
  CalendarList,
  CreateEventInput,
  RSVPStatus,
  TENTATIVE_COLOR_ID,
  TENTATIVE_GROUP_KEY,
} from "../hooks/useGoogleCalendar";
import { useAuth } from "../contexts/AuthContext";
import { Layout, ConfirmDialog, DatePicker, EmailInput } from "../components";
import { ErrorBanner } from "../components/ErrorBanner";
import { useSwipeableTabs } from "../hooks/useSwipeableTabs";
import { scheduleCalendarEventNotifications } from "../lib/calendarNotifications";
import { useAvailabilitySettings } from "../hooks/useAvailabilitySettings";
import { useTentativeBatchMode } from "../hooks/useTentativeBatchMode";
import { TentativeBatchPanel } from "../components/calendar/TentativeBatchPanel";

// Color palette for events
interface EventColor {
  id: string;
  name: string;
  bg: string;
  text: string;
  border: string;
  style?: {
    backgroundColor: string;
    color: string;
    borderColor: string;
    textDecoration?: string;
  };
}

const EVENT_COLORS: EventColor[] = [
  {
    id: "1",
    name: "Lavender",
    bg: "bg-indigo-100",
    text: "text-indigo-800",
    border: "border-indigo-300",
  },
  {
    id: "2",
    name: "Sage",
    bg: "bg-green-100",
    text: "text-green-800",
    border: "border-green-300",
  },
  {
    id: "3",
    name: "Grape",
    bg: "bg-purple-100",
    text: "text-purple-800",
    border: "border-purple-300",
  },
  {
    id: "4",
    name: "Flamingo",
    bg: "bg-pink-100",
    text: "text-pink-800",
    border: "border-pink-300",
  },
  {
    id: "5",
    name: "Banana",
    bg: "bg-yellow-100",
    text: "text-yellow-800",
    border: "border-yellow-300",
  },
  {
    id: "6",
    name: "Tangerine",
    bg: "bg-orange-100",
    text: "text-orange-800",
    border: "border-orange-300",
  },
  {
    id: "7",
    name: "Peacock",
    bg: "bg-cyan-100",
    text: "text-cyan-800",
    border: "border-cyan-300",
  },
  {
    id: "8",
    name: "Graphite",
    bg: "bg-slate-300",
    text: "text-slate-900",
    border: "border-slate-500",
  },
  {
    id: "9",
    name: "Blueberry",
    bg: "bg-blue-100",
    text: "text-blue-800",
    border: "border-blue-300",
  },
  {
    id: "10",
    name: "Basil",
    bg: "bg-emerald-100",
    text: "text-emerald-800",
    border: "border-emerald-300",
  },
  {
    id: "11",
    name: "Tomato",
    bg: "bg-red-100",
    text: "text-red-800",
    border: "border-red-300",
  },
];

const DECLINED_COLOR: EventColor = {
  id: "declined",
  name: "Declined",
  bg: "",
  text: "",
  border: "",
  style: {
    backgroundColor: "rgba(148, 163, 184, 0.15)",
    color: "rgb(148, 163, 184)",
    borderColor: "rgba(148, 163, 184, 0.3)",
    textDecoration: "line-through",
  },
};

const getEventColor = (
  colorId?: string,
  responseStatus?: string,
): EventColor => {
  // Declined events: muted gray + strikethrough (matching Google Calendar)
  if (responseStatus === "declined") {
    return DECLINED_COLOR;
  }
  // Event-level color takes priority; otherwise default to Graphite
  if (colorId) {
    return EVENT_COLORS.find((c) => c.id === colorId) || EVENT_COLORS[7];
  }
  return EVENT_COLORS[7];
};

const toLocalDateString = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const toLocalDateTimeInput = (value: string | Date) => {
  const date = typeof value === "string" ? new Date(value) : value;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

// Format time for display
const formatTime = (event: CalendarEvent) => {
  if (event.start.date) {
    // All-day event
    return "All day";
  }
  if (event.start.dateTime) {
    const date = new Date(event.start.dateTime);
    return date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }
  return "";
};

// Parse HTML description to readable text and extract links
const parseHTMLDescription = (html: string) => {
  // Create a temporary div to parse HTML
  const tempDiv = document.createElement("div");
  tempDiv.innerHTML = html;

  // Extract links from anchor tags
  const links: { text: string; url: string; isMeetingLink?: boolean }[] = [];
  const anchors = tempDiv.querySelectorAll("a");
  anchors.forEach((a, idx) => {
    const placeholder = `[LINK_${idx}]`;
    const url = a.href;
    const isMeetingLink = isMeetingUrl(url);
    links.push({ text: a.textContent || a.href, url, isMeetingLink });
    a.replaceWith(document.createTextNode(placeholder));
  });

  // Replace <br> with newlines
  tempDiv.querySelectorAll("br").forEach((br) => {
    br.replaceWith(document.createTextNode("\n"));
  });

  // Get text content
  let text = tempDiv.textContent || "";

  // Replace link placeholders
  links.forEach((link, idx) => {
    text = text.replace(`[LINK_${idx}]`, link.text);
  });

  // Also detect plain text URLs that aren't wrapped in anchor tags
  const urlRegex = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;
  const plainUrls = text.match(urlRegex) || [];
  plainUrls.forEach((url) => {
    // Check if this URL is already in links (to avoid duplicates)
    if (!links.some((link) => link.url === url)) {
      links.push({ text: url, url, isMeetingLink: isMeetingUrl(url) });
    }
  });

  return { text, links };
};

// Check if URL is a video meeting link
const isMeetingUrl = (url: string): boolean => {
  const meetingPatterns = [
    /meet\.google\.com/i,
    /zoom\.us/i,
    /teams\.microsoft\.com/i,
    /webex\.com/i,
    /whereby\.com/i,
    /around\.co/i,
    /gather\.town/i,
    /discord\.gg/i,
    /slack\.com.*\/calls/i,
  ];
  return meetingPatterns.some((pattern) => pattern.test(url));
};

// Format date for display
const formatDateRange = (event: CalendarEvent) => {
  const start = event.start.dateTime ? new Date(event.start.dateTime) : null;
  const end = event.end.dateTime ? new Date(event.end.dateTime) : null;

  if (!start || !end) {
    if (event.start.date && event.end.date) {
      const startDate = new Date(event.start.date);
      const endDate = new Date(event.end.date);
      endDate.setDate(endDate.getDate() - 1); // End date is exclusive
      if (startDate.toDateString() === endDate.toDateString()) {
        return startDate.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        });
      }
      return `${startDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })} - ${endDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
    }
    return "";
  }

  const startTime = start.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const endTime = end.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  return `${startTime} - ${endTime}`;
};

// Get days in month
const getDaysInMonth = (year: number, month: number) => {
  return new Date(year, month + 1, 0).getDate();
};

// Get day of week for first day of month
const getFirstDayOfMonth = (year: number, month: number) => {
  return new Date(year, month, 1).getDay();
};

// Event Card Component (reserved for future use)
// @ts-expect-error Reserved for future use
const _EventCard = ({
  event,
  calendarId,
  onEdit,
  onDeleteClick,
}: {
  event: CalendarEvent;
  calendarId: string;
  onEdit: (event: CalendarEvent) => void;
  onDeleteClick: (
    calendarId: string,
    eventId: string,
    recurringEventId?: string,
    startDate?: string,
  ) => void;
}) => {
  const [showDetails, setShowDetails] = useState(false);
  const color = getEventColor(event.colorId);

  return (
    <div
      className={`${color.bg} ${color.border} border-l-4 rounded-r-lg px-3 py-2 mb-2 cursor-pointer hover:shadow-md transition-all`}
    >
      <div onClick={() => setShowDetails(!showDetails)}>
        <div className="flex items-center justify-between">
          <span className={`font-medium text-sm ${color.text} truncate`}>
            {event.summary || "(No title)"}
          </span>
          <span className="text-xs neu-text-secondary shrink-0 ml-2">
            {formatTime(event)}
          </span>
        </div>
        {event.location && (
          <div className="flex items-center gap-1 mt-1 text-xs neu-text-secondary">
            <MapPin size={10} />
            <span className="truncate">{event.location}</span>
          </div>
        )}
      </div>

      {showDetails && (
        <div className="mt-3 pt-3 neu-divider">
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2 neu-text-secondary">
              <Clock size={14} />
              <span>{formatDateRange(event)}</span>
            </div>
            {event.description &&
              (() => {
                const { text, links } = parseHTMLDescription(event.description);
                return (
                  <div className="space-y-1">
                    <p className="neu-text-secondary text-xs whitespace-pre-wrap leading-relaxed">
                      {text.length > 200
                        ? text.substring(0, 200) + "..."
                        : text}
                    </p>
                    {links.length > 0 && (
                      <div className="space-y-0.5">
                        {links.slice(0, 2).map((link, idx) => (
                          <a
                            key={idx}
                            href={link.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block text-blue-600 hover:text-blue-800 hover:underline text-xs truncate"
                            onClick={(e) => e.stopPropagation()}
                          >
                            🔗 {link.text}
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}
            {event.attendees && event.attendees.length > 0 && (
              <div className="flex items-start gap-2 neu-text-secondary">
                <Users size={14} className="shrink-0 mt-0.5" />
                <div className="text-xs">
                  {event.attendees.map((a, i) => (
                    <span key={i} className="block">
                      {a.displayName || a.email}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {event.recurrence && (
              <div className="flex items-center gap-2 neu-text-secondary">
                <Repeat size={14} />
                <span className="text-xs">Recurring event</span>
              </div>
            )}
          </div>
          <div className="flex gap-2 mt-3">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onEdit(event);
              }}
              className="flex-1 text-xs px-3 py-1.5 neu-chip rounded-lg transition-colors"
            >
              Edit
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDeleteClick(
                  calendarId,
                  event.id,
                  event.recurringEventId,
                  event.start.dateTime || event.start.date,
                );
              }}
              className="text-xs px-3 py-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            >
              <Trash2 size={14} />
            </button>
          </div>
          {event.htmlLink && (
            <a
              href={event.htmlLink}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-center text-xs text-blue-600 hover:underline mt-2"
            >
              Open in Google Calendar
            </a>
          )}
        </div>
      )}
    </div>
  );
};

// Event Details Modal
const EventDetailsModal = ({
  event,
  calendarId,
  onClose,
  onEdit,
  onDeleteClick,
  onRSVP,
  onMoveEvent,
  onConfirmTentative,
  calendars,
  userEmail,
  tentativeGroupCount,
}: {
  event: CalendarEvent | null;
  calendarId: string;
  onClose: () => void;
  onEdit: (event: CalendarEvent) => void;
  onDeleteClick: (
    calendarId: string,
    eventId: string,
    recurringEventId?: string,
    startDate?: string,
  ) => void;
  onRSVP?: (
    calendarId: string,
    eventId: string,
    response: RSVPStatus,
  ) => Promise<void>;
  onMoveEvent?: (
    sourceCalId: string,
    eventId: string,
    destCalId: string,
  ) => Promise<void>;
  onConfirmTentative?: (
    calendarId: string,
    event: CalendarEvent,
  ) => Promise<void>;
  calendars?: CalendarList[];
  userEmail?: string;
  tentativeGroupCount?: number;
}) => {
  const [isRsvpLoading, setIsRsvpLoading] = useState(false);
  const [copiedMeetLink, setCopiedMeetLink] = useState(false);
  const [showMoveDropdown, setShowMoveDropdown] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);

  if (!event) return null;

  // Check if this is a tentative booking
  const isTentativeEvent =
    event.colorId === TENTATIVE_COLOR_ID &&
    !!event.extendedProperties?.private?.[TENTATIVE_GROUP_KEY];

  // Find current user's attendance status
  const currentUserAttendee = userEmail
    ? event.attendees?.find(
        (a) => a.email.toLowerCase() === userEmail.toLowerCase(),
      )
    : null;

  const handleRSVP = async (response: RSVPStatus) => {
    if (!onRSVP) return;
    setIsRsvpLoading(true);
    try {
      await onRSVP(calendarId, event.id, response);
    } finally {
      setIsRsvpLoading(false);
    }
  };

  const handleCopyMeetLink = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedMeetLink(true);
      setTimeout(() => setCopiedMeetLink(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const color = getEventColor(
    event.colorId,
    currentUserAttendee?.responseStatus,
  );

  return createPortal(
    <div
      className="fixed inset-0 z-[60] bg-black/50 px-4 overflow-y-auto overflow-x-hidden overscroll-contain flex justify-center"
      style={{
        paddingTop: "calc(4rem + env(safe-area-inset-top, 0px))",
        paddingBottom: "calc(4rem + env(safe-area-inset-bottom, 0px))",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="neu-modal w-full max-w-sm md:max-w-lg max-h-[60svh] md:max-h-[calc(100dvh-8rem)] overflow-y-auto overscroll-contain my-auto">
        <div
          className={`flex items-center justify-between p-4 border-b ${color.border} border-l-8 ${color.bg} shrink-0`}
          style={
            color.style
              ? {
                  backgroundColor: color.style.backgroundColor,
                  borderLeftColor: color.style.borderColor,
                  borderBottomColor: color.style.borderColor,
                }
              : undefined
          }
        >
          <h2
            className={`text-xl font-semibold ${color.text}`}
            style={
              color.style
                ? {
                    color: color.style.color,
                    textDecoration: color.style.textDecoration,
                  }
                : undefined
            }
          >
            {event.summary || "(No title)"}
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/50 rounded-lg transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Date and Time */}
          <div className="flex items-start gap-3">
            <Clock size={20} className="neu-text-secondary mt-0.5" />
            <div>
              <div className="font-medium neu-text-primary">
                {event.start.date && event.end.date ? (
                  <>
                    {new Date(event.start.date).toLocaleDateString("en-US", {
                      weekday: "long",
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                    {event.end.date !== event.start.date && (
                      <>
                        {" - "}
                        {new Date(
                          new Date(event.end.date).getTime() - 86400000,
                        ).toLocaleDateString("en-US", {
                          weekday: "long",
                          year: "numeric",
                          month: "long",
                          day: "numeric",
                        })}
                      </>
                    )}
                  </>
                ) : (
                  <>
                    {event.start.dateTime &&
                      new Date(event.start.dateTime).toLocaleDateString(
                        "en-US",
                        {
                          weekday: "long",
                          year: "numeric",
                          month: "long",
                          day: "numeric",
                        },
                      )}
                  </>
                )}
              </div>
              <div className="text-sm neu-text-secondary mt-1">
                {formatDateRange(event)}
              </div>
            </div>
          </div>

          {/* Location */}
          {event.location && (
            <div className="flex items-start gap-3">
              <MapPin size={20} className="neu-text-secondary mt-0.5" />
              <div>
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.location)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="neu-text-primary hover:text-sky-600 hover:underline inline-flex items-center gap-1.5 transition-colors"
                >
                  {event.location}
                  <ExternalLink
                    size={14}
                    className="neu-text-secondary shrink-0"
                  />
                </a>
              </div>
            </div>
          )}

          {/* Google Meet / Video Conference Link */}
          {(event.hangoutLink || event.conferenceData?.entryPoints) &&
            (() => {
              const meetUrl =
                event.hangoutLink ||
                event.conferenceData?.entryPoints?.find(
                  (e) => e.entryPointType === "video",
                )?.uri;
              const conferenceName =
                event.conferenceData?.conferenceSolution?.name || "Google Meet";

              if (!meetUrl) return null;

              return (
                <div className="flex items-start gap-3">
                  <Video size={20} className="text-blue-600 mt-0.5" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <a
                        href={meetUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-lg transition-colors font-medium text-sm"
                      >
                        <Video size={16} />
                        Join {conferenceName}
                        <ExternalLink size={14} />
                      </a>
                      <button
                        type="button"
                        onClick={() => handleCopyMeetLink(meetUrl)}
                        className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg transition-colors text-sm font-medium ${
                          copiedMeetLink
                            ? "bg-green-200 text-green-700"
                            : "bg-slate-200 hover:bg-slate-300 text-slate-700"
                        }`}
                      >
                        {copiedMeetLink ? (
                          <>
                            <Check size={14} />
                            Copied!
                          </>
                        ) : (
                          <>
                            <Copy size={14} />
                            Copy Link
                          </>
                        )}
                      </button>
                    </div>
                    <div className="text-xs neu-text-secondary mt-2 truncate">
                      {meetUrl}
                    </div>
                  </div>
                </div>
              );
            })()}

          {/* Calendar */}
          <div className="flex items-start gap-3">
            <CalendarIcon size={20} className="neu-text-secondary mt-0.5" />
            <div>
              <div className="neu-text-primary">Calendar</div>
              <div className="text-sm neu-text-secondary mt-1">
                {event.organizer?.displayName ||
                  event.organizer?.email ||
                  "Primary"}
              </div>
            </div>
          </div>

          {/* Description */}
          {event.description &&
            (() => {
              const { text, links } = parseHTMLDescription(event.description);
              return (
                <div className="pt-4 border-t border-slate-200 mt-4">
                  <h3 className="text-sm font-semibold neu-text-primary mb-2">
                    Description
                  </h3>
                  <div className="text-sm neu-text-secondary space-y-2">
                    <div className="whitespace-pre-wrap leading-relaxed">
                      {text}
                    </div>
                    {links.length > 0 && (
                      <div className="space-y-2 pt-2 mt-2 border-t border-slate-100">
                        {/* Meeting links displayed prominently */}
                        {links
                          .filter((l) => l.isMeetingLink)
                          .map((link, idx) => (
                            <a
                              key={`meet-${idx}`}
                              href={link.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-2 px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg transition-colors text-sm font-medium"
                            >
                              <Video size={16} />
                              <span className="flex-1 truncate">
                                {link.text}
                              </span>
                              <ExternalLink size={14} />
                            </a>
                          ))}
                        {/* Regular links */}
                        {links
                          .filter((l) => !l.isMeetingLink)
                          .map((link, idx) => (
                            <a
                              key={`link-${idx}`}
                              href={link.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 text-blue-600 hover:text-blue-800 hover:underline text-xs"
                            >
                              🔗 {link.text}
                            </a>
                          ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

          {/* Attendees */}
          {event.attendees && event.attendees.length > 0 && (
            <div className="pt-4 border-t border-slate-200 mt-4">
              <h3 className="text-sm font-semibold neu-text-primary mb-2 flex items-center gap-2">
                <Users size={16} />
                Guests ({event.attendees.length})
              </h3>
              <div className="space-y-2">
                {event.attendees.map((attendee, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-sm">
                    <div className="w-8 h-8 rounded-full neu-pressed flex items-center justify-center neu-text-secondary font-medium">
                      {(attendee.displayName || attendee.email)
                        .charAt(0)
                        .toUpperCase()}
                    </div>
                    <div className="flex-1">
                      <div className="neu-text-primary">
                        {attendee.displayName || attendee.email}
                      </div>
                      {attendee.displayName && (
                        <div className="text-xs neu-text-secondary">
                          {attendee.email}
                        </div>
                      )}
                    </div>
                    <div className="text-xs">
                      {attendee.responseStatus === "accepted" && (
                        <span className="px-2 py-1 bg-green-200 text-green-700 rounded">
                          Yes
                        </span>
                      )}
                      {attendee.responseStatus === "declined" && (
                        <span className="px-2 py-1 bg-red-200 text-red-700 rounded">
                          No
                        </span>
                      )}
                      {attendee.responseStatus === "tentative" && (
                        <span className="px-2 py-1 bg-yellow-200 text-yellow-700 rounded">
                          Maybe
                        </span>
                      )}
                      {attendee.responseStatus === "needsAction" && (
                        <span className="px-2 py-1 neu-pressed neu-text-secondary rounded">
                          Pending
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recurrence */}
          {event.recurrence && (
            <div className="pt-4 border-t border-slate-200 mt-4">
              <h3 className="text-sm font-semibold neu-text-primary mb-2 flex items-center gap-2">
                <Repeat size={16} />
                Recurring Event
              </h3>
              <div className="text-sm neu-text-secondary">
                {event.recurrence.join(", ")}
              </div>
            </div>
          )}

          {/* Reminders */}
          {event.reminders &&
            !event.reminders.useDefault &&
            event.reminders.overrides && (
              <div className="pt-4 border-t border-slate-200 mt-4">
                <h3 className="text-sm font-semibold neu-text-primary mb-2 flex items-center gap-2">
                  <Bell size={16} />
                  Reminders
                </h3>
                <div className="space-y-1">
                  {event.reminders.overrides.map((reminder, idx) => (
                    <div key={idx} className="text-sm neu-text-secondary">
                      {reminder.minutes === 0 && "At time of event"}
                      {reminder.minutes === 5 && "5 minutes before"}
                      {reminder.minutes === 10 && "10 minutes before"}
                      {reminder.minutes === 15 && "15 minutes before"}
                      {reminder.minutes === 30 && "30 minutes before"}
                      {reminder.minutes === 60 && "1 hour before"}
                      {reminder.minutes === 1440 && "1 day before"}
                      {![0, 5, 10, 15, 30, 60, 1440].includes(
                        reminder.minutes,
                      ) && `${reminder.minutes} minutes before`}
                    </div>
                  ))}
                </div>
              </div>
            )}

          {/* Attachments */}
          {event.attachments && event.attachments.length > 0 && (
            <div className="pt-4 border-t border-slate-200 mt-4">
              <h3 className="text-sm font-semibold neu-text-primary mb-2 flex items-center gap-2">
                <Paperclip size={16} />
                Attachments ({event.attachments.length})
              </h3>
              <div className="space-y-2">
                {event.attachments.map((att, idx) => (
                  <a
                    key={idx}
                    href={att.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-3 py-2 bg-slate-50 hover:bg-slate-100 rounded-lg transition-colors text-sm"
                  >
                    {att.iconLink && (
                      <img src={att.iconLink} alt="" className="w-4 h-4" />
                    )}
                    <span className="flex-1 truncate text-slate-700">
                      {att.title}
                    </span>
                    <ExternalLink
                      size={14}
                      className="neu-text-secondary shrink-0"
                    />
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* RSVP Section */}
          {currentUserAttendee && onRSVP && (
            <div className="pt-4 border-t border-slate-200 mt-4">
              <h3 className="text-sm font-semibold neu-text-primary mb-3">
                Going?
              </h3>
              <div className="flex gap-2">
                <button
                  onClick={() => handleRSVP("accepted")}
                  disabled={isRsvpLoading}
                  className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${
                    currentUserAttendee.responseStatus === "accepted"
                      ? "bg-green-600 text-white"
                      : "bg-green-200 text-green-700 hover:bg-green-300"
                  } disabled:opacity-50`}
                >
                  Yes
                </button>
                <button
                  onClick={() => handleRSVP("tentative")}
                  disabled={isRsvpLoading}
                  className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${
                    currentUserAttendee.responseStatus === "tentative"
                      ? "bg-yellow-500 text-white"
                      : "bg-yellow-200 text-yellow-700 hover:bg-yellow-300"
                  } disabled:opacity-50`}
                >
                  Maybe
                </button>
                <button
                  onClick={() => handleRSVP("declined")}
                  disabled={isRsvpLoading}
                  className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${
                    currentUserAttendee.responseStatus === "declined"
                      ? "bg-red-600 text-white"
                      : "bg-red-200 text-red-700 hover:bg-red-300"
                  } disabled:opacity-50`}
                >
                  No
                </button>
              </div>
            </div>
          )}

          {/* Move to another calendar */}
          {onMoveEvent && calendars && calendars.length > 1 && (
            <div className="pt-4 border-t border-slate-200 mt-4 relative">
              <button
                onClick={() => setShowMoveDropdown(!showMoveDropdown)}
                className="flex items-center gap-2 text-sm neu-text-secondary hover:text-sky-600 transition-colors"
              >
                <ArrowRightLeft size={16} />
                Move to another calendar...
              </button>
              {showMoveDropdown && (
                <div className="mt-2 bg-slate-50 rounded-lg border border-slate-200 overflow-hidden">
                  {calendars
                    .filter((c) => c.id !== calendarId)
                    .map((cal) => (
                      <button
                        key={cal.id}
                        onClick={async () => {
                          await onMoveEvent(calendarId, event.id, cal.id);
                          setShowMoveDropdown(false);
                          onClose();
                        }}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100 transition-colors flex items-center gap-2"
                      >
                        <div
                          className="w-3 h-3 rounded-sm shrink-0"
                          style={{
                            backgroundColor: cal.backgroundColor || "#4285f4",
                          }}
                        />
                        {cal.summary}
                      </button>
                    ))}
                </div>
              )}
            </div>
          )}

          {/* Tentative Booking Banner */}
          {isTentativeEvent && (
            <div className="p-3 bg-pink-50 border border-pink-200 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-3 h-3 rounded-full bg-pink-400" />
                <span className="text-sm font-medium text-pink-700">
                  仮押さえ
                </span>
                {tentativeGroupCount != null && tentativeGroupCount > 1 && (
                  <span className="text-xs text-pink-500">
                    (候補 {tentativeGroupCount}件)
                  </span>
                )}
              </div>
              {onConfirmTentative && (
                <button
                  onClick={async () => {
                    setIsConfirming(true);
                    try {
                      await onConfirmTentative(calendarId, event);
                      onClose();
                    } finally {
                      setIsConfirming(false);
                    }
                  }}
                  disabled={isConfirming}
                  className="w-full px-4 py-2 bg-pink-600 text-white rounded-lg hover:bg-pink-500 transition-colors font-medium disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isConfirming ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Check size={16} />
                  )}
                  この日程で確定する
                  {tentativeGroupCount != null && tentativeGroupCount > 1 && (
                    <span className="text-pink-200 text-xs ml-1">
                      (他{tentativeGroupCount - 1}件を削除)
                    </span>
                  )}
                </button>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-6 border-t border-slate-200 mt-4">
            <button
              onClick={() => {
                onEdit(event);
                onClose();
              }}
              className="flex-1 px-4 py-2 bg-sky-600 text-white rounded-lg hover:bg-sky-500 transition-colors font-medium"
            >
              Edit Event
            </button>
            <button
              onClick={() => {
                onDeleteClick(
                  calendarId,
                  event.id,
                  event.recurringEventId,
                  event.start.dateTime || event.start.date,
                );
                onClose();
              }}
              className="px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors border border-red-200"
            >
              <Trash2 size={18} />
            </button>
          </div>

          {/* Google Calendar Link */}
          {event.htmlLink && (
            <a
              href={event.htmlLink}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-center text-sm text-blue-600 hover:underline pt-2"
            >
              Open in Google Calendar →
            </a>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
};

// Recurrence helpers
const DAY_ABBR = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"] as const;
const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

const getRecurrenceOptions = (
  dateStr: string,
): { value: string; label: string }[] => {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) {
    return [{ value: "none", label: "Does not repeat" }];
  }
  const dayOfWeek = date.getDay();
  const dayOfMonth = date.getDate();
  return [
    { value: "none", label: "Does not repeat" },
    { value: "RRULE:FREQ=DAILY", label: "Daily" },
    {
      value: `RRULE:FREQ=WEEKLY;BYDAY=${DAY_ABBR[dayOfWeek]}`,
      label: `Weekly on ${DAY_NAMES[dayOfWeek]}`,
    },
    {
      value: "RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR",
      label: "Every weekday (Mon-Fri)",
    },
    {
      value: `RRULE:FREQ=MONTHLY;BYMONTHDAY=${dayOfMonth}`,
      label: `Monthly on day ${dayOfMonth}`,
    },
    { value: "RRULE:FREQ=YEARLY", label: "Yearly" },
  ];
};

// Event Form Modal
const EventFormModal = ({
  isOpen,
  onClose,
  onSubmit,
  initialData,
  isLoading,
  calendars,
  selectedCalendarId,
  tentativeGroupId,
  onTentativeCreated,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (
    data: CreateEventInput,
    calendarId: string,
    sendUpdates?: "all" | "externalOnly" | "none",
  ) => void;
  initialData?: CalendarEvent | null;
  isLoading: boolean;
  calendars: CalendarList[];
  selectedCalendarId: string;
  tentativeGroupId?: string | null;
  onTentativeCreated?: (groupId: string) => void;
}) => {
  const formatDateInput = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const shiftDateInput = (dateStr: string, days: number) => {
    const base = new Date(`${dateStr}T00:00:00`);
    base.setDate(base.getDate() + days);
    return formatDateInput(base);
  };

  const [summary, setSummary] = useState(initialData?.summary || "");
  const [description, setDescription] = useState(
    initialData?.description || "",
  );
  const [location, setLocation] = useState(initialData?.location || "");
  const [startDate, setStartDate] = useState(() => {
    if (initialData?.start.dateTime) {
      return toLocalDateTimeInput(initialData.start.dateTime);
    }
    if (initialData?.start.date) {
      return initialData.start.date;
    }
    const now = new Date();
    now.setMinutes(0);
    now.setHours(now.getHours() + 1);
    return toLocalDateTimeInput(now);
  });
  const [endDate, setEndDate] = useState(() => {
    if (initialData?.end.dateTime) {
      return toLocalDateTimeInput(initialData.end.dateTime);
    }
    if (initialData?.end.date) {
      return shiftDateInput(initialData.end.date, -1);
    }
    const now = new Date();
    now.setMinutes(0);
    now.setHours(now.getHours() + 2);
    return toLocalDateTimeInput(now);
  });
  const [isAllDay, setIsAllDay] = useState(
    !!(initialData?.start.date && !initialData?.start.dateTime),
  );
  const [colorId, setColorId] = useState(initialData?.colorId || "8");
  // Tentative booking (仮押さえ) state
  const isExistingTentative =
    initialData?.colorId === TENTATIVE_COLOR_ID &&
    !!initialData?.extendedProperties?.private?.[TENTATIVE_GROUP_KEY];
  const [isTentative, setIsTentative] = useState(
    !!tentativeGroupId || isExistingTentative,
  );
  const handleTentativeToggle = (checked: boolean) => {
    setIsTentative(checked);
    if (checked) {
      setColorId(TENTATIVE_COLOR_ID); // Flamingo
    } else {
      setColorId("8"); // Graphite (default)
    }
  };
  // Duration-preserving handlers for start/end date changes
  const handleStartDateChange = (newStart: string) => {
    const prevStart = isAllDay
      ? new Date(`${startDate.split("T")[0]}T00:00:00`)
      : new Date(startDate);
    const prevEnd = isAllDay
      ? new Date(`${endDate.split("T")[0]}T00:00:00`)
      : new Date(endDate);
    const duration = prevEnd.getTime() - prevStart.getTime();

    setStartDate(newStart);

    const newStartDate = isAllDay
      ? new Date(`${newStart}T00:00:00`)
      : new Date(newStart);
    if (!isNaN(newStartDate.getTime()) && duration > 0) {
      const newEnd = new Date(newStartDate.getTime() + duration);
      setEndDate(
        isAllDay ? formatDateInput(newEnd) : toLocalDateTimeInput(newEnd),
      );
    }
  };

  const handleEndDateChange = (newEnd: string) => {
    const startMs = isAllDay
      ? new Date(`${startDate.split("T")[0]}T00:00:00`).getTime()
      : new Date(startDate).getTime();
    const endMs = isAllDay
      ? new Date(`${newEnd}T00:00:00`).getTime()
      : new Date(newEnd).getTime();

    // If end is before start, push end to start + 1 hour (or same day for all-day)
    if (!isNaN(endMs) && !isNaN(startMs) && endMs <= startMs) {
      if (isAllDay) {
        setEndDate(startDate.split("T")[0]);
      } else {
        const adjusted = new Date(startMs + 60 * 60 * 1000);
        setEndDate(toLocalDateTimeInput(adjusted));
      }
    } else {
      setEndDate(newEnd);
    }
  };

  const [attendeeEmail, setAttendeeEmail] = useState("");
  const [attendees, setAttendees] = useState<{ email: string }[]>(
    initialData?.attendees?.map((a) => ({ email: a.email })) || [],
  );
  const [reminders, setReminders] = useState<
    { method: string; minutes: number }[]
  >([{ method: "popup", minutes: 30 }]);
  const [recurrenceType, setRecurrenceType] = useState("none");
  const [sendUpdates, setSendUpdates] = useState<
    "all" | "externalOnly" | "none"
  >("all");
  const [addGoogleMeet, setAddGoogleMeet] = useState(false);
  const [targetCalendarId, setTargetCalendarId] = useState(
    initialData?.calendarId || selectedCalendarId,
  );
  const isEditing = Boolean(initialData?.id);
  // Check if event already has a Meet link
  const hasMeetLink = Boolean(
    initialData?.hangoutLink ||
    initialData?.conferenceData?.entryPoints?.length,
  );

  useEffect(() => {
    if (!isOpen) return;
    const originalBodyOverflow = document.body.style.overflow;
    const originalHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalBodyOverflow;
      document.documentElement.style.overflow = originalHtmlOverflow;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const now = new Date();
    now.setMinutes(0);
    now.setHours(now.getHours() + 1);
    const defaultStart = toLocalDateTimeInput(now);
    const defaultEndDate = new Date(now);
    defaultEndDate.setHours(defaultEndDate.getHours() + 1);
    const defaultEnd = toLocalDateTimeInput(defaultEndDate);

    const nextIsAllDay = !!(
      initialData?.start.date && !initialData?.start.dateTime
    );
    const nextStart = initialData?.start.dateTime
      ? toLocalDateTimeInput(initialData.start.dateTime)
      : initialData?.start.date ||
        (nextIsAllDay ? defaultStart.split("T")[0] : defaultStart);
    const nextEnd = initialData?.end.dateTime
      ? toLocalDateTimeInput(initialData.end.dateTime)
      : initialData?.end.date
        ? shiftDateInput(initialData.end.date, -1)
        : nextIsAllDay
          ? nextStart.split("T")[0]
          : defaultEnd;

    setSummary(initialData?.summary || "");
    setDescription(initialData?.description || "");
    setLocation(initialData?.location || "");
    setIsAllDay(nextIsAllDay);
    setStartDate(nextStart);
    setEndDate(nextEnd);
    const nextIsTentative =
      !!tentativeGroupId ||
      (initialData?.colorId === TENTATIVE_COLOR_ID &&
        !!initialData?.extendedProperties?.private?.[TENTATIVE_GROUP_KEY]);
    setIsTentative(nextIsTentative);
    setColorId(
      nextIsTentative ? TENTATIVE_COLOR_ID : initialData?.colorId || "8",
    );
    setAttendees(
      initialData?.attendees?.map((a) => ({ email: a.email })) || [],
    );
    setAttendeeEmail("");
    setReminders(
      initialData?.reminders?.overrides?.length
        ? initialData.reminders.overrides
        : [{ method: "popup", minutes: 30 }],
    );
    setSendUpdates("all");
    // Restore recurrence from existing event (master events have recurrence array)
    if (initialData?.recurrence?.length) {
      setRecurrenceType(initialData.recurrence[0]);
    } else {
      setRecurrenceType("none");
    }
    // Reset Google Meet toggle - only show for new events (not editing)
    setAddGoogleMeet(false);
    setTargetCalendarId(initialData?.calendarId || selectedCalendarId);
  }, [initialData?.id, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const eventData: CreateEventInput = {
      summary,
      description: description || undefined,
      location: location || undefined,
      colorId,
      start: isAllDay
        ? { date: startDate.split("T")[0] }
        : {
            dateTime: new Date(startDate).toISOString(),
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          },
      end: isAllDay
        ? { date: shiftDateInput(endDate.split("T")[0], 1) }
        : {
            dateTime: new Date(endDate).toISOString(),
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          },
      attendees: attendees.length > 0 ? attendees : undefined,
      recurrence:
        recurrenceType !== "none"
          ? [recurrenceType]
          : isEditing
            ? []
            : undefined,
      reminders:
        reminders.length > 0
          ? { useDefault: false, overrides: reminders }
          : { useDefault: true },
      // Add Google Meet conferenceData if enabled (for new events or editing without existing Meet)
      ...(addGoogleMeet && !hasMeetLink
        ? {
            conferenceData: {
              createRequest: {
                requestId: `meet-${Date.now()}-${Math.random().toString(36).substring(7)}`,
                conferenceSolutionKey: { type: "hangoutsMeet" },
              },
            },
          }
        : {}),
      // Tentative booking: set extendedProperties with group ID
      ...(isTentative
        ? {
            extendedProperties: {
              private: {
                [TENTATIVE_GROUP_KEY]:
                  tentativeGroupId ||
                  initialData?.extendedProperties?.private?.[
                    TENTATIVE_GROUP_KEY
                  ] ||
                  crypto.randomUUID(),
              },
            },
          }
        : {}),
    };

    onSubmit(eventData, targetCalendarId, sendUpdates);

    // Notify parent about tentative group creation
    if (isTentative && !isEditing && onTentativeCreated) {
      const groupId =
        eventData.extendedProperties?.private?.[TENTATIVE_GROUP_KEY];
      if (groupId) onTentativeCreated(groupId);
    }
  };

  const addAttendee = () => {
    if (attendeeEmail && !attendees.find((a) => a.email === attendeeEmail)) {
      setAttendees([...attendees, { email: attendeeEmail }]);
      setAttendeeEmail("");
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[60] bg-black/50 px-4 overflow-y-auto overscroll-contain flex justify-center"
      style={{
        paddingTop: "calc(4rem + env(safe-area-inset-top, 0px))",
        paddingBottom: "calc(4rem + env(safe-area-inset-bottom, 0px))",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="neu-modal w-full max-w-[calc(100vw-2rem)] md:max-w-lg h-[80svh] md:h-[calc(100dvh-6rem)] max-h-[80svh] md:max-h-[calc(100dvh-6rem)] overflow-y-auto overflow-x-hidden overscroll-contain my-auto">
        <div className="flex items-center justify-between p-3 md:p-4 border-b border-slate-200 shrink-0">
          <h2 className="text-base md:text-lg font-semibold neu-text-primary">
            {isEditing ? "Edit Event" : "Add Event"}
          </h2>
          <button onClick={onClose} className="p-1.5 md:p-2 neu-btn rounded-lg">
            <X size={18} />
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          className="p-3 md:p-4 space-y-3 md:space-y-4"
        >
          {/* Title */}
          <div>
            <input
              type="text"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="Add title"
              className="w-full text-lg md:text-xl font-medium px-0 py-1.5 md:py-2 border-0 border-b-2 border-slate-200 focus:border-sky-500 outline-none neu-text-primary bg-transparent"
              required
            />
          </div>

          {/* Calendar Selector */}
          {calendars.length > 1 && (
            <div>
              <label className="text-xs font-medium neu-text-secondary mb-1 flex items-center gap-1">
                <CalendarIcon size={12} /> Calendar
              </label>
              <select
                value={targetCalendarId}
                onChange={(e) => setTargetCalendarId(e.target.value)}
                className="w-full text-base md:text-sm neu-input rounded-lg px-3 py-2 focus:ring-2 focus:ring-sky-500"
                title="Select calendar"
              >
                {calendars.map((cal) => (
                  <option key={cal.id} value={cal.id}>
                    {cal.summary}
                    {cal.primary ? " (Primary)" : ""}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* All Day Toggle */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="allDay"
              checked={isAllDay}
              onChange={(e) => setIsAllDay(e.target.checked)}
              className="rounded border-slate-300"
            />
            <label htmlFor="allDay" className="text-sm neu-text-secondary">
              All day
            </label>
          </div>

          {/* Date/Time */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
            <div className="min-w-0">
              <label className="text-xs font-medium neu-text-secondary mb-1 block">
                Start
              </label>
              <div className="relative">
                <input
                  type={isAllDay ? "date" : "datetime-local"}
                  value={isAllDay ? startDate.split("T")[0] : startDate}
                  onChange={(e) => handleStartDateChange(e.target.value)}
                  className="block w-full min-w-0 max-w-full text-base md:text-sm neu-input rounded-lg px-3 py-2 pr-9 focus:ring-2 focus:ring-sky-500"
                  required
                />
                {startDate && (
                  <button
                    type="button"
                    onClick={() => setStartDate("")}
                    aria-label="Clear start date"
                    className="absolute right-2 top-1/2 -translate-y-1/2 neu-text-muted hover:neu-text-secondary"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            </div>
            <div className="min-w-0">
              <label className="text-xs font-medium neu-text-secondary mb-1 block">
                End
              </label>
              <div className="relative">
                <input
                  type={isAllDay ? "date" : "datetime-local"}
                  value={isAllDay ? endDate.split("T")[0] : endDate}
                  onChange={(e) => handleEndDateChange(e.target.value)}
                  className="block w-full min-w-0 max-w-full text-base md:text-sm neu-input rounded-lg px-3 py-2 pr-9 focus:ring-2 focus:ring-sky-500"
                  required
                />
                {endDate && (
                  <button
                    type="button"
                    onClick={() => setEndDate("")}
                    aria-label="Clear end date"
                    className="absolute right-2 top-1/2 -translate-y-1/2 neu-text-muted hover:neu-text-secondary"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Location */}
          <div>
            <label className="text-xs font-medium neu-text-secondary mb-1 flex items-center gap-1">
              <MapPin size={12} /> Location
            </label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Add location"
              className="w-full text-base md:text-sm neu-input rounded-lg px-3 py-2 focus:ring-2 focus:ring-sky-500"
            />
          </div>

          {/* Recurrence */}
          <div>
            <label className="text-xs font-medium neu-text-secondary mb-1 flex items-center gap-1">
              <Repeat size={12} /> Repeat
            </label>
            <select
              value={recurrenceType}
              onChange={(e) => setRecurrenceType(e.target.value)}
              className="w-full text-base md:text-sm neu-input rounded-lg px-3 py-2 focus:ring-2 focus:ring-sky-500"
            >
              {getRecurrenceOptions(startDate).map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
              {/* Show current recurrence as option if not in standard list */}
              {isEditing &&
                recurrenceType !== "none" &&
                !getRecurrenceOptions(startDate).some(
                  (opt) => opt.value === recurrenceType,
                ) && (
                  <option value={recurrenceType}>
                    {recurrenceType.replace("RRULE:", "")}
                  </option>
                )}
            </select>
          </div>

          {/* Google Meet Toggle - Show for new events or editing events without Meet */}
          {!hasMeetLink && (
            <div className="flex items-center gap-3 p-3 neu-pressed rounded-lg">
              <Video size={18} className="text-blue-600" />
              <div className="flex-1">
                <div className="text-sm font-medium neu-text-primary">
                  Add Google Meet
                </div>
                <div className="text-xs neu-text-secondary">
                  Generate a video conferencing link
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={addGoogleMeet}
                  onChange={(e) => setAddGoogleMeet(e.target.checked)}
                  className="sr-only peer"
                  aria-label="Add Google Meet"
                />
                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-sky-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-sky-600"></div>
              </label>
            </div>
          )}

          {/* Show existing Meet link when editing */}
          {hasMeetLink && (
            <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
              <Video size={18} className="text-blue-600" />
              <div className="flex-1">
                <div className="text-sm font-medium text-blue-700">
                  Google Meet added
                </div>
                <div className="text-xs text-blue-600">
                  This event has a video conferencing link
                </div>
              </div>
              <span className="text-xs text-blue-600 font-medium">✓</span>
            </div>
          )}

          {/* Description */}
          <div>
            <label className="text-xs font-medium neu-text-secondary mb-1 block">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add description"
              rows={2}
              className="w-full text-base md:text-sm neu-input rounded-lg px-3 py-2 focus:ring-2 focus:ring-sky-500 resize-y"
            />
          </div>

          {/* Tentative Booking Toggle (仮押さえ) */}
          {!isEditing && (
            <div className="flex items-center gap-3 p-3 rounded-lg border border-pink-200 bg-pink-50/50">
              <input
                type="checkbox"
                id="tentativeToggle"
                checked={isTentative}
                onChange={(e) => handleTentativeToggle(e.target.checked)}
                className="rounded border-pink-300 text-pink-500 focus:ring-pink-500"
              />
              <label
                htmlFor="tentativeToggle"
                className="flex-1 cursor-pointer"
              >
                <span className="text-sm font-medium text-pink-700">
                  仮押さえ
                </span>
                <span className="block text-xs text-pink-500">
                  フラミンゴ色で作成。確定時に他の候補を自動削除
                </span>
              </label>
            </div>
          )}

          {/* Color */}
          <div>
            <label className="text-xs font-medium neu-text-secondary mb-2 block">
              Color
              {isTentative && (
                <span className="ml-2 text-pink-500 font-normal">
                  (仮押さえ: Flamingo固定)
                </span>
              )}
            </label>
            <div
              className={`flex flex-wrap gap-2 ${isTentative ? "opacity-40 pointer-events-none" : ""}`}
            >
              {EVENT_COLORS.map((color) => (
                <button
                  key={color.id}
                  type="button"
                  onClick={() => setColorId(color.id)}
                  className={`w-6 h-6 rounded-full ${color.bg} ${color.border} border-2 ${
                    colorId === color.id
                      ? "ring-2 ring-offset-2 ring-blue-500"
                      : ""
                  }`}
                  title={color.name}
                />
              ))}
            </div>
          </div>

          {/* Attendees */}
          <div>
            <label className="text-xs font-medium neu-text-secondary mb-1 flex items-center gap-1">
              <Users size={12} /> Guests
            </label>
            <div className="flex gap-2">
              <EmailInput
                value={attendeeEmail}
                onChange={setAttendeeEmail}
                placeholder="Add guest email"
                className="flex-1"
                showValidation={false}
              />
              <button
                type="button"
                onClick={addAttendee}
                className="px-3 py-2 neu-btn rounded-lg transition-colors"
              >
                <Plus size={16} />
              </button>
            </div>
            {attendees.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {attendees.map((a, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1 px-2 py-1 neu-chip-active rounded-full text-xs"
                  >
                    {a.email}
                    <button
                      type="button"
                      onClick={() =>
                        setAttendees(attendees.filter((_, idx) => idx !== i))
                      }
                      className="hover:text-red-500"
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Reminders */}
          <div>
            <label className="text-xs font-medium neu-text-secondary mb-1 flex items-center gap-1">
              <Bell size={12} /> Reminders
            </label>
            <div className="space-y-2">
              {reminders.map((r, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <select
                    value={r.method}
                    onChange={(e) => {
                      const next = [...reminders];
                      next[idx] = { ...next[idx], method: e.target.value };
                      setReminders(next);
                    }}
                    className="text-base md:text-sm neu-input rounded-lg px-2 py-2 focus:ring-2 focus:ring-sky-500 w-24"
                  >
                    <option value="popup">Popup</option>
                    <option value="email">Email</option>
                  </select>
                  <select
                    value={r.minutes}
                    onChange={(e) => {
                      const next = [...reminders];
                      next[idx] = {
                        ...next[idx],
                        minutes: Number(e.target.value),
                      };
                      setReminders(next);
                    }}
                    className="flex-1 text-base md:text-sm neu-input rounded-lg px-2 py-2 focus:ring-2 focus:ring-sky-500"
                  >
                    <option value={0}>At time of event</option>
                    <option value={5}>5 minutes before</option>
                    <option value={10}>10 minutes before</option>
                    <option value={15}>15 minutes before</option>
                    <option value={30}>30 minutes before</option>
                    <option value={60}>1 hour before</option>
                    <option value={1440}>1 day before</option>
                  </select>
                  <button
                    type="button"
                    onClick={() =>
                      setReminders(reminders.filter((_, i) => i !== idx))
                    }
                    className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
              {reminders.length < 5 && (
                <button
                  type="button"
                  onClick={() =>
                    setReminders([
                      ...reminders,
                      { method: "popup", minutes: 30 },
                    ])
                  }
                  className="text-xs text-sky-600 hover:text-sky-500 font-medium flex items-center gap-1"
                >
                  <Plus size={12} /> Add Reminder
                </button>
              )}
            </div>
          </div>

          {/* Send Updates (when attendees present) */}
          {attendees.length > 0 && (
            <div>
              <label className="text-xs font-medium neu-text-secondary mb-1 flex items-center gap-1">
                <Users size={12} /> Send Updates
              </label>
              <select
                value={sendUpdates}
                onChange={(e) =>
                  setSendUpdates(
                    e.target.value as "all" | "externalOnly" | "none",
                  )
                }
                className="w-full text-base md:text-sm neu-input rounded-lg px-3 py-2 focus:ring-2 focus:ring-sky-500"
              >
                <option value="all">All guests</option>
                <option value="externalOnly">External only</option>
                <option value="none">None</option>
              </select>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 md:gap-3 pt-3 md:pt-4 border-t border-slate-200 mt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-3 md:px-4 py-2 text-sm md:text-base neu-btn rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading || !summary}
              className="flex-1 px-3 md:px-4 py-2 text-sm md:text-base bg-sky-600 text-white rounded-lg hover:bg-sky-500 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
            >
              {isLoading && <Loader2 size={16} className="animate-spin" />}
              {isEditing ? "Update" : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
};

// Recurring Delete Modal
const RecurringDeleteModal = ({
  isOpen,
  onClose,
  onDelete,
}: {
  isOpen: boolean;
  onClose: () => void;
  onDelete: (mode: "single" | "thisAndFuture" | "all") => void;
}) => {
  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[60] bg-black/50 px-4 overflow-y-auto overscroll-contain flex justify-center"
      style={{
        paddingTop: "calc(4rem + env(safe-area-inset-top, 0px))",
        paddingBottom: "calc(4rem + env(safe-area-inset-bottom, 0px))",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="neu-modal w-full max-w-sm p-5 my-auto">
        <h3 className="text-lg font-semibold neu-text-primary mb-1">
          Delete recurring event
        </h3>
        <p className="text-sm neu-text-secondary mb-5">
          This event is part of a series. What would you like to delete?
        </p>
        <div className="space-y-2">
          <button
            onClick={() => onDelete("single")}
            className="w-full text-left px-4 py-3 neu-btn rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
          >
            This event
          </button>
          <button
            onClick={() => onDelete("thisAndFuture")}
            className="w-full text-left px-4 py-3 neu-btn rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
          >
            This and following events
          </button>
          <button
            onClick={() => onDelete("all")}
            className="w-full text-left px-4 py-3 neu-btn rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
          >
            All events in series
          </button>
        </div>
        <button
          onClick={onClose}
          className="w-full mt-3 px-4 py-2.5 text-sm font-medium neu-text-secondary hover:text-slate-700 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>,
    document.body,
  );
};

// Recurring Edit Mode Selection Modal
const RecurringEditModal = ({
  isOpen,
  onClose,
  onSelect,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (mode: "single" | "thisAndFuture" | "all") => void;
}) => {
  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[60] bg-black/50 px-4 overflow-y-auto overscroll-contain flex justify-center"
      style={{
        paddingTop: "calc(4rem + env(safe-area-inset-top, 0px))",
        paddingBottom: "calc(4rem + env(safe-area-inset-bottom, 0px))",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="neu-modal w-full max-w-sm p-5 my-auto">
        <h3 className="text-lg font-semibold neu-text-primary mb-1">
          Edit recurring event
        </h3>
        <p className="text-sm neu-text-secondary mb-5">
          This event is part of a series. What would you like to edit?
        </p>
        <div className="space-y-2">
          <button
            onClick={() => onSelect("single")}
            className="w-full text-left px-4 py-3 neu-btn rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
          >
            This event
          </button>
          <button
            onClick={() => onSelect("thisAndFuture")}
            className="w-full text-left px-4 py-3 neu-btn rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
          >
            This and following events
          </button>
          <button
            onClick={() => onSelect("all")}
            className="w-full text-left px-4 py-3 neu-btn rounded-lg text-sm font-medium text-sky-600 hover:bg-sky-50 transition-colors"
          >
            All events in series
          </button>
        </div>
        <button
          onClick={onClose}
          className="w-full mt-3 px-4 py-2.5 text-sm font-medium neu-text-secondary hover:text-slate-700 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>,
    document.body,
  );
};

// Scheduling Modal - Find available time slots
const SchedulingModal = ({
  events,
  onClose,
}: {
  events: CalendarEvent[];
  onClose: () => void;
}) => {
  const { settings } = useAvailabilitySettings();
  const today = new Date();
  const nextWeek = new Date(today);
  nextWeek.setDate(nextWeek.getDate() + 7);

  const toDateStr = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  const [startDate, setStartDate] = useState(toDateStr(today));
  const [endDate, setEndDate] = useState(toDateStr(nextWeek));
  const [result, setResult] = useState<string>("");
  const [copied, setCopied] = useState(false);

  const DAY_ABBR = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  const handleGenerate = () => {
    const start = new Date(startDate + "T00:00:00");
    const end = new Date(endDate + "T23:59:59");
    if (start > end) return;

    const lines: string[] = [];
    const current = new Date(start);

    while (current <= end) {
      const dayOfWeek = current.getDay();
      const schedule = settings.weekSchedule[dayOfWeek];

      if (schedule?.enabled) {
        // Parse work hours
        const [startH, startM] = schedule.startTime.split(":").map(Number);
        const [endH, endM] = schedule.endTime.split(":").map(Number);
        const workStart = startH * 60 + startM;
        const workEnd = endH * 60 + endM;

        if (workStart < workEnd) {
          // Get events for this day
          const dayStart = new Date(current);
          dayStart.setHours(0, 0, 0, 0);
          const dayEnd = new Date(current);
          dayEnd.setHours(23, 59, 59, 999);

          const dayEvents = events.filter((e) => {
            const eStart = e.start.dateTime
              ? new Date(e.start.dateTime)
              : e.start.date
                ? new Date(e.start.date + "T00:00:00")
                : null;
            const eEnd = e.end.dateTime
              ? new Date(e.end.dateTime)
              : e.end.date
                ? new Date(e.end.date + "T00:00:00")
                : null;
            if (!eStart || !eEnd) return false;

            // All-day events
            if (!e.start.dateTime && e.start.date) {
              const eventDate = new Date(e.start.date + "T00:00:00");
              const eventEndDate = new Date(e.end.date + "T00:00:00");
              return eventDate <= dayEnd && eventEndDate > dayStart;
            }

            return eStart < dayEnd && eEnd > dayStart;
          });

          // Build busy intervals in minutes from midnight
          const busyIntervals: [number, number][] = [];
          for (const e of dayEvents) {
            if (!e.start.dateTime && e.start.date) {
              // All-day event blocks entire work hours
              busyIntervals.push([workStart, workEnd]);
              continue;
            }
            const eStart = new Date(e.start.dateTime!);
            const eEnd = new Date(e.end.dateTime!);

            let busyStart: number;
            let busyEnd: number;

            if (eStart.toDateString() === current.toDateString()) {
              busyStart = eStart.getHours() * 60 + eStart.getMinutes();
            } else {
              busyStart = 0;
            }

            if (eEnd.toDateString() === current.toDateString()) {
              busyEnd = eEnd.getHours() * 60 + eEnd.getMinutes();
            } else {
              busyEnd = 24 * 60;
            }

            busyIntervals.push([busyStart, busyEnd]);
          }

          // Merge overlapping busy intervals
          busyIntervals.sort((a, b) => a[0] - b[0]);
          const merged: [number, number][] = [];
          for (const interval of busyIntervals) {
            if (
              merged.length > 0 &&
              interval[0] <= merged[merged.length - 1][1]
            ) {
              merged[merged.length - 1][1] = Math.max(
                merged[merged.length - 1][1],
                interval[1],
              );
            } else {
              merged.push([...interval]);
            }
          }

          // Find free slots within work hours
          const freeSlots: [number, number][] = [];
          let pointer = workStart;
          for (const [busyStart, busyEnd] of merged) {
            if (busyStart > pointer) {
              const freeStart = Math.max(pointer, workStart);
              const freeEnd = Math.min(busyStart, workEnd);
              if (freeEnd > freeStart) {
                freeSlots.push([freeStart, freeEnd]);
              }
            }
            pointer = Math.max(pointer, busyEnd);
          }
          if (pointer < workEnd) {
            freeSlots.push([pointer, workEnd]);
          }

          // Filter by minimum slot duration
          const validSlots = freeSlots.filter(
            ([s, e]) => e - s >= settings.slotDurationMinutes,
          );

          if (validSlots.length > 0) {
            const m = current.getMonth() + 1;
            const d = current.getDate();
            const dayLabel = DAY_ABBR[dayOfWeek];
            const slotsStr = validSlots
              .map(([s, e]) => {
                const sh = String(Math.floor(s / 60)).padStart(2, "0");
                const sm = String(s % 60).padStart(2, "0");
                const eh = String(Math.floor(e / 60)).padStart(2, "0");
                const em = String(e % 60).padStart(2, "0");
                return `${sh}:${sm}~${eh}:${em}`;
              })
              .join(", ");
            lines.push(`${m}/${d}(${dayLabel}) ${slotsStr}`);
          }
        }
      }

      current.setDate(current.getDate() + 1);
    }

    setResult(
      lines.length > 0
        ? lines.join("\n")
        : "No available slots in the selected period.",
    );
  };

  const handleCopy = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const modal = (
    <div
      className="fixed inset-0 z-[60] bg-black/50 px-4 overflow-y-auto overflow-x-hidden overscroll-contain flex justify-center"
      style={{
        paddingTop: "calc(4rem + env(safe-area-inset-top, 0px))",
        paddingBottom: "calc(4rem + env(safe-area-inset-bottom, 0px))",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="neu-card rounded-2xl shadow-2xl w-full max-w-md my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-200">
          <h2 className="text-lg font-bold neu-text-primary flex items-center gap-2">
            <Clock size={20} className="text-teal-600" />
            Find Available Slots
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 neu-text-secondary hover:neu-text-primary rounded-lg transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-4">
          {/* Date Range */}
          <div className="grid grid-cols-2 gap-3">
            <DatePicker
              label="From"
              value={startDate}
              onChange={setStartDate}
            />
            <DatePicker label="To" value={endDate} onChange={setEndDate} />
          </div>

          {/* Generate Button */}
          <button
            onClick={handleGenerate}
            className="w-full px-4 py-2.5 bg-sky-600 text-white text-sm font-medium rounded-lg hover:bg-sky-500 transition-colors"
          >
            Find Available Slots
          </button>

          {/* Result */}
          {result && (
            <div className="space-y-2">
              <div className="neu-flat rounded-xl p-3">
                <pre className="text-sm neu-text-primary whitespace-pre-wrap font-mono leading-relaxed">
                  {result}
                </pre>
              </div>
              <button
                onClick={handleCopy}
                className="flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-colors w-full justify-center neu-btn neu-text-secondary hover:neu-text-primary"
              >
                {copied ? (
                  <>
                    <Check size={16} className="text-emerald-500" />
                    <span className="text-emerald-600">Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy size={16} />
                    Copy to Clipboard
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
};

// Day Schedule Modal - Shows all events for a specific date
const DayScheduleModal = ({
  date,
  events,
  onClose,
  onEventClick,
  onEventTimeChange,
  onCreateEvent,
}: {
  date: Date | null;
  events: CalendarEvent[];
  onClose: () => void;
  onEventClick: (event: CalendarEvent) => void;
  onEventTimeChange?: (
    event: CalendarEvent,
    newStart: Date,
    newEnd: Date,
  ) => Promise<void>;
  onCreateEvent?: (start: Date, end: Date) => void;
}) => {
  const [draggingEvent, setDraggingEvent] = useState<CalendarEvent | null>(
    null,
  );
  const [dragStartY, setDragStartY] = useState(0);
  const [dragCurrentY, setDragCurrentY] = useState(0);
  const [dragMode, setDragMode] = useState<
    "move" | "resize-top" | "resize-bottom" | null
  >(null);
  const [isSaving, setIsSaving] = useState(false);
  const dragCurrentYRef = useRef(0);
  const hasDraggedRef = useRef(false);
  const dragStartYRef = useRef(0);
  const timelineRef = useRef<HTMLDivElement>(null);
  const clickPreventedRef = useRef(false);
  const longPressActiveRef = useRef(false);
  const [isEditMode, setIsEditMode] = useState(false);

  // New event creation by dragging on empty space
  const [isCreating, setIsCreating] = useState(false);
  const [createStartY, setCreateStartY] = useState(0);
  const [createCurrentY, setCreateCurrentY] = useState(0);
  const [createStartHour, setCreateStartHour] = useState(0);

  // Touch-specific state for long-press detection
  const [isTouchPending, setIsTouchPending] = useState(false);
  const touchStartRef = useRef<{
    x: number;
    y: number;
    hour: number;
    element: HTMLElement | null;
  }>({ x: 0, y: 0, hour: 0, element: null });
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const LONG_PRESS_DURATION = 400; // ms
  const TOUCH_MOVE_THRESHOLD = 10; // px - if moved more than this, it's a scroll
  const [isEventTouchPending, setIsEventTouchPending] = useState(false);
  const eventTouchStartRef = useRef<{
    x: number;
    y: number;
    event: CalendarEvent | null;
    mode: "move" | "resize-top" | "resize-bottom" | null;
  }>({ x: 0, y: 0, event: null, mode: null });
  const eventLongPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const EVENT_LONG_PRESS_DURATION = 350; // ms

  // Ref for onEventClick to avoid stale closure in touch effect
  const onEventClickRef = useRef(onEventClick);
  onEventClickRef.current = onEventClick;

  useEffect(() => {
    if (!date) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [date]);

  const dateStr = date ? toLocalDateString(date) : "";
  const dayEvents = date
    ? events
        .filter((event) => {
          if (event.start.date) {
            const start = event.start.date;
            const end = event.end.date || event.start.date;
            return dateStr >= start && dateStr < end;
          }
          if (event.start.dateTime) {
            const eventDate = toLocalDateString(new Date(event.start.dateTime));
            return eventDate === dateStr;
          }
          return false;
        })
        .sort((a, b) => {
          const aTime = a.start.dateTime
            ? new Date(a.start.dateTime).getTime()
            : 0;
          const bTime = b.start.dateTime
            ? new Date(b.start.dateTime).getTime()
            : 0;
          return aTime - bTime;
        })
    : [];

  const isToday = date
    ? date.toDateString() === new Date().toDateString()
    : false;
  const allDayEvents = dayEvents.filter((event) => event.start.date);
  const timedEvents = dayEvents.filter((event) => event.start.dateTime);
  const hourHeight = 64;
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const nowOffset = (nowMinutes / 60) * hourHeight;
  const nowLabel = `${now.getHours().toString().padStart(2, "0")}:${now
    .getMinutes()
    .toString()
    .padStart(2, "0")}`;

  // Snap to 15-minute intervals
  const snapToGrid = (minutes: number) => Math.round(minutes / 15) * 15;

  // Calculate new times based on drag
  const getDraggedTimes = (
    event: CalendarEvent,
    overrideCurrentY?: number,
    overrideStartY?: number,
  ) => {
    if (!draggingEvent || draggingEvent.id !== event.id || !dragMode || !date)
      return null;

    const currentY =
      overrideCurrentY !== undefined ? overrideCurrentY : dragCurrentY;
    const startY = overrideStartY !== undefined ? overrideStartY : dragStartY;
    const deltaY = currentY - startY;
    const deltaMinutes = snapToGrid((deltaY / hourHeight) * 60);

    const originalStart = new Date(event.start.dateTime!);
    const originalEnd = new Date(event.end.dateTime!);
    const originalDuration = originalEnd.getTime() - originalStart.getTime();

    let newStart: Date;
    let newEnd: Date;

    if (dragMode === "move") {
      const newStartMinutes = snapToGrid(
        originalStart.getHours() * 60 +
          originalStart.getMinutes() +
          deltaMinutes,
      );
      const clampedMinutes = Math.max(
        0,
        Math.min(24 * 60 - originalDuration / (1000 * 60), newStartMinutes),
      );
      newStart = new Date(date);
      newStart.setHours(
        Math.floor(clampedMinutes / 60),
        clampedMinutes % 60,
        0,
        0,
      );
      newEnd = new Date(newStart.getTime() + originalDuration);
    } else if (dragMode === "resize-top") {
      const newStartMinutes = snapToGrid(
        originalStart.getHours() * 60 +
          originalStart.getMinutes() +
          deltaMinutes,
      );
      const endMinutes = originalEnd.getHours() * 60 + originalEnd.getMinutes();
      const clampedMinutes = Math.max(
        0,
        Math.min(endMinutes - 15, newStartMinutes),
      );
      newStart = new Date(date);
      newStart.setHours(
        Math.floor(clampedMinutes / 60),
        clampedMinutes % 60,
        0,
        0,
      );
      newEnd = new Date(originalEnd);
    } else {
      // resize-bottom
      const startMinutes =
        originalStart.getHours() * 60 + originalStart.getMinutes();
      const newEndMinutes = snapToGrid(
        originalEnd.getHours() * 60 + originalEnd.getMinutes() + deltaMinutes,
      );
      const clampedMinutes = Math.max(
        startMinutes + 15,
        Math.min(24 * 60, newEndMinutes),
      );
      newStart = new Date(originalStart);
      newEnd = new Date(date);
      newEnd.setHours(
        Math.floor(clampedMinutes / 60),
        clampedMinutes % 60,
        0,
        0,
      );
    }

    return { newStart, newEnd };
  };

  const startDrag = (
    event: CalendarEvent,
    mode: "move" | "resize-top" | "resize-bottom",
    clientY: number,
  ) => {
    if (!onEventTimeChange || event.start.date) return; // Don't drag all-day events

    dragStartYRef.current = clientY;
    dragCurrentYRef.current = clientY;
    hasDraggedRef.current = false;
    setDraggingEvent(event);
    setDragStartY(clientY);
    setDragCurrentY(clientY);
    setDragMode(mode);
  };

  // Handle drag start
  const handleDragStart = (
    e: React.MouseEvent | React.TouchEvent,
    event: CalendarEvent,
    mode: "move" | "resize-top" | "resize-bottom",
  ) => {
    if (!onEventTimeChange || event.start.date) return; // Don't drag all-day events

    e.preventDefault();
    e.stopPropagation();

    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    startDrag(event, mode, clientY);
  };

  const handleEventTouchStart = (
    e: React.TouchEvent,
    event: CalendarEvent,
    mode: "move" | "resize-top" | "resize-bottom",
  ) => {
    if (!onEventTimeChange || event.start.date) return; // Don't drag all-day events

    e.stopPropagation();
    const touch = e.touches[0];
    eventTouchStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      event,
      mode,
    };
    setIsEventTouchPending(true);

    eventLongPressTimerRef.current = setTimeout(() => {
      const pending = eventTouchStartRef.current;
      if (!pending.event || !pending.mode) return;
      longPressActiveRef.current = true;
      startDrag(pending.event, pending.mode, pending.y);
      setIsEventTouchPending(false);
      eventLongPressTimerRef.current = null;
      if (navigator.vibrate) {
        navigator.vibrate(40);
      }
    }, EVENT_LONG_PRESS_DURATION);
  };

  // Handle drag move
  useEffect(() => {
    if (!draggingEvent) return;

    const handleMouseMove = (e: MouseEvent) => {
      const clientY = e.clientY;
      dragCurrentYRef.current = clientY;
      setDragCurrentY(clientY);
      if (Math.abs(clientY - dragStartYRef.current) > 5) {
        hasDraggedRef.current = true;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      const clientY = e.touches[0]?.clientY ?? 0;
      dragCurrentYRef.current = clientY;
      setDragCurrentY(clientY);
      if (Math.abs(clientY - dragStartYRef.current) > 5) {
        hasDraggedRef.current = true;
      }
    };

    const handleEnd = async () => {
      try {
        const didDrag =
          hasDraggedRef.current ||
          Math.abs(dragCurrentYRef.current - dragStartYRef.current) > 5;

        if (draggingEvent && onEventTimeChange && didDrag) {
          const times = getDraggedTimes(
            draggingEvent,
            dragCurrentYRef.current,
            dragStartYRef.current,
          );
          if (
            times &&
            (times.newStart.getTime() !==
              new Date(draggingEvent.start.dateTime!).getTime() ||
              times.newEnd.getTime() !==
                new Date(draggingEvent.end.dateTime!).getTime())
          ) {
            setIsSaving(true);
            clickPreventedRef.current = true;
            longPressActiveRef.current = false;
            await onEventTimeChange(
              draggingEvent,
              times.newStart,
              times.newEnd,
            );
            setIsSaving(false);
            setTimeout(() => {
              clickPreventedRef.current = false;
            }, 100);
          }
        }

        if (didDrag) {
          clickPreventedRef.current = true;
          longPressActiveRef.current = false;
          setTimeout(() => {
            clickPreventedRef.current = false;
          }, 100);
        }
        if (!didDrag && longPressActiveRef.current) {
          clickPreventedRef.current = true;
          longPressActiveRef.current = false;
          setTimeout(() => {
            clickPreventedRef.current = false;
          }, 100);
        }
      } finally {
        setDraggingEvent(null);
        setDragMode(null);
        setIsSaving(false);
      }
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleEnd);
    document.addEventListener("touchmove", handleTouchMove, { passive: false });
    document.addEventListener("touchend", handleEnd);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleEnd);
      document.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("touchend", handleEnd);
    };
  }, [draggingEvent, onEventTimeChange]);

  useEffect(() => {
    if (!isEventTouchPending) return;

    const handleTouchMove = (e: TouchEvent) => {
      const touch = e.touches[0];
      const deltaX = Math.abs(touch.clientX - eventTouchStartRef.current.x);
      const deltaY = Math.abs(touch.clientY - eventTouchStartRef.current.y);

      if (deltaX > TOUCH_MOVE_THRESHOLD || deltaY > TOUCH_MOVE_THRESHOLD) {
        if (eventLongPressTimerRef.current) {
          clearTimeout(eventLongPressTimerRef.current);
          eventLongPressTimerRef.current = null;
        }
        setIsEventTouchPending(false);
        return;
      }

      eventTouchStartRef.current.x = touch.clientX;
      eventTouchStartRef.current.y = touch.clientY;
    };

    const handleTouchEnd = () => {
      if (eventLongPressTimerRef.current) {
        clearTimeout(eventLongPressTimerRef.current);
        eventLongPressTimerRef.current = null;
      }
      // Quick tap (no long-press, no drag) — trigger event click directly
      // On mobile, synthetic click may not fire reliably after stopPropagation in touchstart
      const pending = eventTouchStartRef.current;
      if (pending.event && !longPressActiveRef.current) {
        clickPreventedRef.current = true;
        onEventClickRef.current(pending.event);
        setTimeout(() => {
          clickPreventedRef.current = false;
        }, 300);
      }
      setIsEventTouchPending(false);
    };

    document.addEventListener("touchmove", handleTouchMove);
    document.addEventListener("touchend", handleTouchEnd);
    document.addEventListener("touchcancel", handleTouchEnd);

    return () => {
      document.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("touchend", handleTouchEnd);
      document.removeEventListener("touchcancel", handleTouchEnd);
      if (eventLongPressTimerRef.current) {
        clearTimeout(eventLongPressTimerRef.current);
        eventLongPressTimerRef.current = null;
      }
    };
  }, [isEventTouchPending]);

  // Handle new event creation by dragging on empty space
  const getCreateTimes = () => {
    if (!isCreating || !date) return null;

    const deltaY = createCurrentY - createStartY;
    const deltaMinutes = (deltaY / hourHeight) * 60;

    const startMinutes =
      createStartHour * 60 +
      Math.floor((((createStartY % hourHeight) / hourHeight) * 60) / 15) * 15;
    const endMinutes = startMinutes + Math.round(deltaMinutes / 15) * 15;

    const minTime = Math.max(0, Math.min(startMinutes, endMinutes));
    const maxTime = Math.min(24 * 60, Math.max(startMinutes, endMinutes));

    // Ensure minimum 15 min duration
    const finalEnd = Math.max(minTime + 15, maxTime);

    const newStart = new Date(date);
    newStart.setHours(Math.floor(minTime / 60), minTime % 60, 0, 0);

    const newEnd = new Date(date);
    newEnd.setHours(Math.floor(finalEnd / 60), finalEnd % 60, 0, 0);

    return { newStart, newEnd };
  };

  const getTimelinePosition = (clientY: number) => {
    const timelineElement = timelineRef.current;
    if (!timelineElement) return null;
    const rect = timelineElement.getBoundingClientRect();
    const relativeY = clientY - rect.top;
    const clampedY = Math.max(0, Math.min(hourHeight * 24 - 1, relativeY));
    const hour = Math.floor(clampedY / hourHeight);
    const offsetY = clampedY - hour * hourHeight;
    return { hour, offsetY };
  };

  // Mouse-only: start event creation immediately
  const handleMouseCreateStart = (
    e: React.MouseEvent,
    hour: number,
    cellElement: HTMLElement,
  ) => {
    if (!onCreateEvent || draggingEvent) return;

    e.preventDefault();
    e.stopPropagation();

    const timelinePos = getTimelinePosition(e.clientY);
    const rect = cellElement.getBoundingClientRect();
    const offsetY = e.clientY - rect.top;

    setIsCreating(true);
    setCreateStartHour(timelinePos?.hour ?? hour);
    setCreateStartY(timelinePos?.offsetY ?? offsetY);
    setCreateCurrentY(timelinePos?.offsetY ?? offsetY);
  };

  const handleDragCreateFromTop = (clientY: number) => {
    if (!onCreateEvent || draggingEvent || isCreating) return;
    const timelineElement = timelineRef.current;
    if (!timelineElement) return;

    const rect = timelineElement.getBoundingClientRect();
    const relativeY = clientY - rect.top;
    const clampedY = Math.max(0, Math.min(hourHeight * 24 - 1, relativeY));
    const hour = Math.floor(clampedY / hourHeight);
    const offsetY = clampedY - hour * hourHeight;

    setIsCreating(true);
    setCreateStartHour(hour);
    setCreateStartY(offsetY);
    setCreateCurrentY(offsetY);
  };

  // Touch: start pending long-press detection
  const handleTouchCreateStart = (
    e: React.TouchEvent,
    hour: number,
    cellElement: HTMLElement,
  ) => {
    if (!onCreateEvent || draggingEvent) return;

    const touch = e.touches[0];
    // Calculate timeline-relative position immediately at touch start
    // to avoid offset caused by scroll during long-press detection
    const timelinePos = getTimelinePosition(touch.clientY);
    const rect = cellElement.getBoundingClientRect();
    const fallbackOffsetY = touch.clientY - rect.top;

    touchStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      hour: timelinePos?.hour ?? hour,
      element: cellElement,
    };
    // Store computed position for use in the long-press callback
    const savedHour = timelinePos?.hour ?? hour;
    const savedOffsetY = timelinePos?.offsetY ?? fallbackOffsetY;

    setIsTouchPending(true);

    // Start long-press timer
    longPressTimerRef.current = setTimeout(() => {
      setIsCreating(true);
      setCreateStartHour(savedHour);
      setCreateStartY(savedOffsetY);
      setCreateCurrentY(savedOffsetY);
      setIsTouchPending(false);

      // Haptic feedback if available
      if (navigator.vibrate) {
        navigator.vibrate(50);
      }
    }, LONG_PRESS_DURATION);
  };

  // Cancel touch creation on move (allows scrolling)
  useEffect(() => {
    if (!isTouchPending) return;

    const handleTouchMove = (e: TouchEvent) => {
      const touch = e.touches[0];
      const deltaX = Math.abs(touch.clientX - touchStartRef.current.x);
      const deltaY = Math.abs(touch.clientY - touchStartRef.current.y);

      // If moved beyond threshold, cancel long-press and allow scroll
      if (deltaX > TOUCH_MOVE_THRESHOLD || deltaY > TOUCH_MOVE_THRESHOLD) {
        if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current);
          longPressTimerRef.current = null;
        }
        setIsTouchPending(false);
      }
    };

    const handleTouchEnd = () => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
      setIsTouchPending(false);
    };

    document.addEventListener("touchmove", handleTouchMove);
    document.addEventListener("touchend", handleTouchEnd);
    document.addEventListener("touchcancel", handleTouchEnd);

    return () => {
      document.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("touchend", handleTouchEnd);
      document.removeEventListener("touchcancel", handleTouchEnd);
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
    };
  }, [isTouchPending]);

  useEffect(() => {
    if (!isCreating) return;

    const handleMouseMove = (e: MouseEvent) => {
      const timelineElement = timelineRef.current;
      if (!timelineElement) return;
      const rect = timelineElement.getBoundingClientRect();
      const relativeY = e.clientY - rect.top;
      setCreateCurrentY(relativeY - createStartHour * hourHeight);
    };

    const handleTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      const timelineElement = timelineRef.current;
      if (!timelineElement) return;
      const clientY = e.touches[0]?.clientY ?? 0;
      const rect = timelineElement.getBoundingClientRect();
      const relativeY = clientY - rect.top;
      setCreateCurrentY(relativeY - createStartHour * hourHeight);
    };

    const handleEnd = () => {
      const times = getCreateTimes();
      if (times && onCreateEvent) {
        const duration = times.newEnd.getTime() - times.newStart.getTime();
        if (duration >= 15 * 60 * 1000) {
          // At least 15 min
          onCreateEvent(times.newStart, times.newEnd);
        }
      }
      setIsCreating(false);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleEnd);
    document.addEventListener("touchmove", handleTouchMove, { passive: false });
    document.addEventListener("touchend", handleEnd);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleEnd);
      document.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("touchend", handleEnd);
    };
  }, [
    isCreating,
    createStartY,
    createCurrentY,
    createStartHour,
    date,
    onCreateEvent,
  ]);

  useEffect(() => {
    const shouldLockScroll = isCreating || Boolean(draggingEvent);
    if (!shouldLockScroll) return;

    // Lock ALL scrollable ancestors (both inner content and backdrop)
    const scrollParents: HTMLElement[] = [];
    let el = timelineRef.current?.parentElement;
    while (el) {
      const style = window.getComputedStyle(el);
      if (
        style.overflow === "auto" ||
        style.overflow === "scroll" ||
        style.overflowY === "auto" ||
        style.overflowY === "scroll"
      ) {
        scrollParents.push(el);
      }
      el = el.parentElement;
    }

    const originals = scrollParents.map((p) => ({
      el: p,
      overflow: p.style.overflow,
    }));
    scrollParents.forEach((p) => {
      p.style.overflow = "hidden";
    });

    return () => {
      originals.forEach(({ el: p, overflow }) => {
        p.style.overflow = overflow;
      });
    };
  }, [isCreating, draggingEvent]);

  // Early return after all hooks are called
  if (!date) return null;

  // Calculate overlapping event positions (like Google Calendar)
  const getEventPositions = (events: CalendarEvent[]) => {
    const positions: Map<string, { column: number; totalColumns: number }> =
      new Map();

    // Get start/end times in minutes from midnight
    const getEventTimes = (event: CalendarEvent) => {
      const start = new Date(event.start.dateTime!);
      const end = new Date(event.end.dateTime!);
      return {
        startMin: start.getHours() * 60 + start.getMinutes(),
        endMin: end.getHours() * 60 + end.getMinutes(),
      };
    };

    // Check if two events overlap
    const eventsOverlap = (e1: CalendarEvent, e2: CalendarEvent) => {
      const t1 = getEventTimes(e1);
      const t2 = getEventTimes(e2);
      return t1.startMin < t2.endMin && t2.startMin < t1.endMin;
    };

    // Group overlapping events
    const groups: CalendarEvent[][] = [];
    const assigned = new Set<string>();

    events.forEach((event) => {
      if (assigned.has(event.id)) return;

      const group: CalendarEvent[] = [event];
      assigned.add(event.id);

      // Find all events that overlap with any event in this group
      let expanded = true;
      while (expanded) {
        expanded = false;
        events.forEach((other) => {
          if (assigned.has(other.id)) return;
          const overlapsWithGroup = group.some((e) => eventsOverlap(e, other));
          if (overlapsWithGroup) {
            group.push(other);
            assigned.add(other.id);
            expanded = true;
          }
        });
      }

      groups.push(group);
    });

    // Assign columns within each group
    groups.forEach((group) => {
      // Sort by start time, then by duration (longer first)
      group.sort((a, b) => {
        const aT = getEventTimes(a);
        const bT = getEventTimes(b);
        if (aT.startMin !== bT.startMin) return aT.startMin - bT.startMin;
        return bT.endMin - bT.startMin - (aT.endMin - aT.startMin);
      });

      const columns: CalendarEvent[][] = [];

      group.forEach((event) => {
        const eventTimes = getEventTimes(event);
        let placed = false;

        // Try to place in existing column
        for (let col = 0; col < columns.length; col++) {
          const canPlace = columns[col].every((existing) => {
            const existingTimes = getEventTimes(existing);
            return eventTimes.startMin >= existingTimes.endMin;
          });

          if (canPlace) {
            columns[col].push(event);
            positions.set(event.id, { column: col, totalColumns: 0 });
            placed = true;
            break;
          }
        }

        // Create new column if needed
        if (!placed) {
          columns.push([event]);
          positions.set(event.id, {
            column: columns.length - 1,
            totalColumns: 0,
          });
        }
      });

      // Update total columns for all events in the group
      const totalCols = columns.length;
      group.forEach((event) => {
        const pos = positions.get(event.id)!;
        pos.totalColumns = totalCols;
      });
    });

    return positions;
  };

  const eventPositions = getEventPositions(timedEvents);

  const isDragActive = isCreating || Boolean(draggingEvent);

  const modal = (
    <div
      className="fixed inset-0 z-[60] bg-black/50 px-4 overflow-y-auto overscroll-contain flex justify-center"
      style={{
        paddingTop: "calc(4rem + env(safe-area-inset-top, 0px))",
        paddingBottom: "calc(4rem + env(safe-area-inset-bottom, 0px))",
        touchAction: isDragActive ? "none" : undefined,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="neu-modal w-full max-w-[calc(100vw-2rem)] md:max-w-lg h-[80svh] md:h-[calc(100dvh-6rem)] max-h-[80svh] md:max-h-[calc(100dvh-6rem)] overflow-hidden flex flex-col my-auto">
        <div
          className={`flex items-center justify-between p-4 border-b border-slate-200 shrink-0 ${isToday ? "bg-blue-50" : "bg-slate-50"}`}
        >
          <div>
            <h2
              className={`text-lg font-semibold ${isToday ? "text-blue-700" : "neu-text-primary"}`}
            >
              {date.toLocaleDateString("en-US", {
                weekday: "long",
                month: "long",
                day: "numeric",
              })}
            </h2>
            {isToday && (
              <span className="text-xs text-blue-600 font-medium">Today</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsEditMode((prev) => !prev)}
              className={`px-2.5 py-1 text-xs font-medium rounded-md border transition-colors ${
                isEditMode
                  ? "bg-sky-600 text-white border-blue-600"
                  : "neu-btn neu-text-secondary"
              }`}
            >
              {isEditMode ? "Done" : "Edit"}
            </button>
            <button
              onClick={onClose}
              className="p-2 neu-btn rounded-lg transition-colors"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="p-4 flex-1 min-h-0 overflow-y-auto">
          {dayEvents.length === 0 && (
            <div className="mb-3 rounded-lg neu-pressed px-3 py-2 text-xs neu-text-secondary">
              No events scheduled
            </div>
          )}

          {allDayEvents.length > 0 && (
            <div className="mb-4 space-y-2">
              <div className="text-xs font-semibold neu-text-secondary uppercase tracking-wide">
                All day
              </div>
              {allDayEvents.map((event) => {
                const color = getEventColor(event.colorId);
                return (
                  <button
                    key={event.id}
                    onClick={() => {
                      onEventClick(event);
                    }}
                    className={`w-full text-left ${color.bg} ${color.border} border-l-4 rounded-r-lg px-3 py-2 hover:brightness-95 transition-all`}
                    style={
                      color.style
                        ? {
                            backgroundColor: color.style.backgroundColor,
                            borderLeftColor: color.style.borderColor,
                          }
                        : undefined
                    }
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={`font-medium text-sm ${color.text}`}
                        style={
                          color.style
                            ? {
                                color: color.style.color,
                                textDecoration: color.style.textDecoration,
                              }
                            : undefined
                        }
                      >
                        {event.summary || "(No title)"}
                      </span>
                      <span className="text-xs neu-text-secondary">
                        All day
                      </span>
                    </div>
                    {event.location && (
                      <div className="flex items-center gap-1 text-xs neu-text-secondary mt-1">
                        <MapPin size={10} />
                        <span className="truncate">{event.location}</span>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          <div
            className="relative no-select"
            ref={timelineRef}
            style={{
              touchAction: isCreating || draggingEvent ? "none" : "auto",
            }}
          >
            {isEditMode && onCreateEvent && (
              <div
                className="absolute left-16 right-0 top-0 z-30 flex h-6 items-center justify-center neu-divider bg-blue-50/80 text-[10px] font-medium text-blue-700"
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleDragCreateFromTop(e.clientY);
                }}
                onTouchStart={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleDragCreateFromTop(e.touches[0].clientY);
                }}
              >
                Drag down to add
              </div>
            )}
            {isToday && (
              <div
                className="absolute left-0 right-0 z-20 pointer-events-none"
                style={{ top: `${nowOffset}px` }}
              >
                <div className="flex items-center">
                  <div className="w-16 shrink-0 pr-2 text-[10px] text-red-500 text-right font-medium">
                    {nowLabel}
                  </div>
                  <div className="flex-1 relative">
                    <div className="h-px bg-red-500" />
                    <div className="absolute -left-1.5 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-red-500" />
                  </div>
                </div>
              </div>
            )}

            {/* Creation highlight overlay */}
            {isCreating &&
              (() => {
                const times = getCreateTimes();
                if (!times) return null;
                const startMin =
                  times.newStart.getHours() * 60 + times.newStart.getMinutes();
                const endMin =
                  times.newEnd.getHours() * 60 + times.newEnd.getMinutes();
                const top = (startMin / 60) * hourHeight;
                const height = ((endMin - startMin) / 60) * hourHeight;
                return (
                  <div
                    className="absolute left-16 right-0 bg-blue-200/50 border-l-4 border-blue-500 rounded-r-lg z-30 pointer-events-none"
                    style={{
                      top: `${top}px`,
                      height: `${Math.max(height, 16)}px`,
                    }}
                  >
                    <div className="px-2 py-1 text-xs text-blue-700 font-medium">
                      {times.newStart.getHours().toString().padStart(2, "0")}:
                      {times.newStart.getMinutes().toString().padStart(2, "0")}{" "}
                      - {times.newEnd.getHours().toString().padStart(2, "0")}:
                      {times.newEnd.getMinutes().toString().padStart(2, "0")}
                    </div>
                  </div>
                );
              })()}

            {Array.from({ length: 24 }).map((_, hour) => {
              const hourEvents = timedEvents.filter((event) => {
                if (!event.start.dateTime) return false;
                const eventHour = new Date(event.start.dateTime).getHours();
                return eventHour === hour;
              });

              return (
                <div
                  key={hour}
                  className="flex border-b border-slate-200"
                  style={{ height: `${hourHeight}px` }}
                >
                  <div className="w-16 shrink-0 text-xs neu-text-muted text-right pr-2 pt-1">
                    {hour.toString().padStart(2, "0")}:00
                  </div>
                  <div
                    className={`flex-1 border-l border-slate-200 relative px-1 ${onCreateEvent ? "cursor-crosshair" : ""}`}
                    onMouseDown={(e) => {
                      // In edit mode, allow drag-to-create even when starting on events.
                      // Otherwise, only start when clicking on empty cell space (not on events).
                      if (
                        isEditMode ||
                        e.target === e.currentTarget ||
                        !(e.target as HTMLElement).closest("[data-event]")
                      ) {
                        handleMouseCreateStart(e, hour, e.currentTarget);
                      }
                    }}
                    onTouchStart={(e) => {
                      // Touch: use long-press detection (allows scrolling)
                      if (
                        isEditMode ||
                        e.target === e.currentTarget ||
                        !(e.target as HTMLElement).closest("[data-event]")
                      ) {
                        handleTouchCreateStart(e, hour, e.currentTarget);
                      }
                    }}
                    data-hour-cell
                  >
                    {hourEvents.map((event) => {
                      const color = getEventColor(event.colorId);
                      const isDragging = draggingEvent?.id === event.id;

                      // Use dragged times if currently dragging this event
                      const draggedTimes = getDraggedTimes(event);
                      const displayStart = draggedTimes
                        ? draggedTimes.newStart
                        : new Date(event.start.dateTime!);
                      const displayEnd = draggedTimes
                        ? draggedTimes.newEnd
                        : new Date(event.end.dateTime!);

                      const startHour = displayStart.getHours();
                      // Only render in the starting hour row
                      if (startHour !== hour && !isDragging) return null;

                      const topOffset = isDragging
                        ? (displayStart.getHours() - hour) * hourHeight +
                          (displayStart.getMinutes() / 60) * hourHeight
                        : (displayStart.getMinutes() / 60) * hourHeight;
                      const duration =
                        (displayEnd.getTime() - displayStart.getTime()) /
                        (1000 * 60);
                      const height = (duration / 60) * hourHeight;

                      // Get position for overlapping events
                      const pos = eventPositions.get(event.id) || {
                        column: 0,
                        totalColumns: 1,
                      };
                      const widthPercent = 100 / pos.totalColumns;
                      const leftPercent = pos.column * widthPercent;

                      // Size categories based on height
                      // hourHeight = 80, so 15min = 20px, 30min = 40px
                      const isTiny = height <= 20; // 15min or less
                      const isSmall = height <= 32; // ~24min or less
                      const isCompact = height <= 45; // ~34min or less
                      const canDrag = !!onEventTimeChange && !isEditMode;

                      // Format time for display during drag
                      const formatDragTime = (d: Date) =>
                        `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;

                      // Short time format for tiny events
                      const shortTime = `${displayStart.getHours()}:${displayStart.getMinutes().toString().padStart(2, "0")}`;

                      return (
                        <div
                          key={event.id}
                          data-event="true"
                          className={`absolute ${color.bg} ${color.text} ${color.border} border-l-4 rounded-r-lg overflow-hidden select-none
                            ${isDragging ? "ring-2 ring-blue-400 z-50 opacity-90" : "z-10 hover:brightness-95"}
                            ${canDrag ? "cursor-grab active:cursor-grabbing" : ""}
                            ${isSaving ? "pointer-events-none opacity-50" : ""}
                            ${isTiny ? "text-[9px]" : isSmall ? "text-[10px]" : "text-xs"}`}
                          style={{
                            top: `${topOffset}px`,
                            height: `${Math.max(height, 16)}px`,
                            left: `calc(${leftPercent}% + ${pos.column > 0 ? 2 : 0}px)`,
                            width: `calc(${widthPercent}% - ${pos.totalColumns > 1 ? 4 : 2}px)`,
                            transition: isDragging
                              ? "none"
                              : "box-shadow 0.15s",
                            ...(color.style
                              ? {
                                  backgroundColor: color.style.backgroundColor,
                                  color: color.style.color,
                                  borderLeftColor: color.style.borderColor,
                                  textDecoration: color.style.textDecoration,
                                }
                              : {}),
                          }}
                        >
                          {/* Top resize handle */}
                          {canDrag && !isTiny && (
                            <div
                              className="absolute top-0 left-0 right-0 h-2 cursor-ns-resize hover:bg-black/10 z-20"
                              onMouseDown={(e) =>
                                handleDragStart(e, event, "resize-top")
                              }
                              onTouchStart={(e) =>
                                handleEventTouchStart(e, event, "resize-top")
                              }
                            />
                          )}

                          {/* Main content area - for moving */}
                          <div
                            className={`h-full flex ${isTiny ? "px-1 items-center" : "px-2 py-1 flex-col"}`}
                            onMouseDown={(e) =>
                              canDrag && handleDragStart(e, event, "move")
                            }
                            onTouchStart={(e) =>
                              canDrag && handleEventTouchStart(e, event, "move")
                            }
                            onClick={(e) => {
                              e.stopPropagation();
                              // Only trigger click if no actual drag occurred
                              // (isDragging state may lag behind due to React batching,
                              //  so rely on clickPreventedRef which is set synchronously)
                              if (!clickPreventedRef.current && !isSaving) {
                                onEventClick(event);
                              }
                            }}
                          >
                            {isTiny ? (
                              // Tiny events: single line with time and title
                              <div className="flex items-center gap-1 w-full min-w-0">
                                <span className="opacity-75 shrink-0">
                                  {shortTime}
                                </span>
                                <span className="font-medium truncate">
                                  {event.summary || "(No title)"}
                                </span>
                              </div>
                            ) : isSmall ? (
                              // Small events: title on one line, maybe time
                              <>
                                <div className="font-semibold truncate leading-tight">
                                  {event.summary || "(No title)"}
                                </div>
                                {!isDragging && (
                                  <div className="text-[9px] opacity-75 truncate">
                                    {shortTime}
                                  </div>
                                )}
                                {isDragging && (
                                  <div className="text-[9px] font-medium opacity-90">
                                    {formatDragTime(displayStart)} -{" "}
                                    {formatDragTime(displayEnd)}
                                  </div>
                                )}
                              </>
                            ) : (
                              // Normal/compact events
                              <>
                                <div
                                  className={`font-semibold truncate leading-tight ${isCompact ? "text-[11px]" : ""}`}
                                >
                                  {event.summary || "(No title)"}
                                </div>
                                {isDragging ? (
                                  <div className="text-[10px] font-medium opacity-90">
                                    {formatDragTime(displayStart)} -{" "}
                                    {formatDragTime(displayEnd)}
                                  </div>
                                ) : (
                                  !isCompact && (
                                    <>
                                      <div className="text-[10px] opacity-75 truncate">
                                        {formatDateRange(event)}
                                      </div>
                                      {event.location && height >= 60 && (
                                        <div className="flex items-center gap-1 text-[10px] opacity-75 truncate">
                                          <MapPin size={8} />
                                          <span className="truncate">
                                            {event.location}
                                          </span>
                                        </div>
                                      )}
                                    </>
                                  )
                                )}
                              </>
                            )}
                          </div>

                          {/* Bottom resize handle */}
                          {canDrag && !isTiny && (
                            <div
                              className="absolute bottom-0 left-0 right-0 h-2 cursor-ns-resize hover:bg-black/10 z-20"
                              onMouseDown={(e) =>
                                handleDragStart(e, event, "resize-bottom")
                              }
                              onTouchStart={(e) =>
                                handleEventTouchStart(e, event, "resize-bottom")
                              }
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
};

// Main Calendar Page
export const CalendarPage = () => {
  const { connectGoogleCalendar, user } = useAuth();
  const {
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
    isConnected,
    getEvent,
    createEvent,
    updateEvent,
    updateRecurringEvent,
    deleteEvent,
    respondToEvent,
    fetchMultipleCalendarEvents,
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
    getTentativeGroupId,
    getTentativeGroupEvents,
    confirmTentativeEvent,
    refresh,
  } = useGoogleCalendar();

  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<"month" | "week" | "day" | "agenda">(
    "month",
  );
  const [showEventModal, setShowEventModal] = useState(false);
  const [_showDetailsModal, setShowDetailsModal] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(
    null,
  );
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [showCalendarDropdown, setShowCalendarDropdown] = useState(false);
  const [showDayModal, setShowDayModal] = useState(false);
  const [selectedModalDate, setSelectedModalDate] = useState<Date | null>(null);
  const [deleteEventData, setDeleteEventData] = useState<{
    calendarId: string;
    eventId: string;
    recurringEventId?: string;
    instanceStartDate?: string;
  } | null>(null);
  const [showSchedulingModal, setShowSchedulingModal] = useState(false);
  const [recurringEditPending, setRecurringEditPending] = useState<{
    event: CalendarEvent;
    data: CreateEventInput;
    calendarId: string;
    sendUpdates?: "all" | "externalOnly" | "none";
  } | null>(null);

  // Tentative booking (仮押さえ) state
  const [tentativeGroupId, setTentativeGroupId] = useState<string | null>(null);
  const [showTentativeAddMore, setShowTentativeAddMore] = useState(false);

  // Tentative batch mode (一括仮押さえ)
  const tentativeBatch = useTentativeBatchMode({ createEvent, refresh });

  // Search state (Cal-1)
  const [showSearchBar, setShowSearchBar] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<CalendarEvent[] | null>(
    null,
  );
  const [isSearching, setIsSearching] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Free/Busy state (Cal-5)
  const [showFreeBusyModal, setShowFreeBusyModal] = useState(false);

  // Calendar Settings state (Cal-10)
  const [showCalSettingsModal, setShowCalSettingsModal] = useState(false);
  const [calSettings, setCalSettings] = useState<Record<string, string>>({});

  // Calendar Share state (Cal-9)
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareCalendarId, setShareCalendarId] = useState<string | null>(null);
  const [aclRules, setAclRules] = useState<
    { id: string; role: string; scope: { type: string; value: string } }[]
  >([]);
  const [shareEmail, setShareEmail] = useState("");
  const [shareRole, setShareRole] = useState<"reader" | "writer" | "owner">(
    "reader",
  );

  // Calendar CRUD state (Cal-8)
  const [showCreateCalendar, setShowCreateCalendar] = useState(false);
  const [newCalendarName, setNewCalendarName] = useState("");
  const [deleteCalendarConfirm, setDeleteCalendarConfirm] = useState<
    string | null
  >(null);

  // Drag state for week/day views
  const [draggingEvent, setDraggingEvent] = useState<CalendarEvent | null>(
    null,
  );
  const [dragStartY, setDragStartY] = useState(0);
  const [dragCurrentY, setDragCurrentY] = useState(0);
  const [dragMode, setDragMode] = useState<
    "move" | "resize-top" | "resize-bottom" | null
  >(null);
  const [isSavingDrag, setIsSavingDrag] = useState(false);
  const dragCurrentYRef = useRef(0);
  const hasDraggedRef = useRef(false);
  const dragStartYRef = useRef(0);
  const clickPreventedRef = useRef(false);

  // Drag-to-create state for week/day views
  const [isCreatingView, setIsCreatingView] = useState(false);
  const [createViewStartY, setCreateViewStartY] = useState(0);
  const [createViewCurrentY, setCreateViewCurrentY] = useState(0);
  const [createViewDate, setCreateViewDate] = useState<Date | null>(null);
  const [createViewStartHour, setCreateViewStartHour] = useState(0);
  const viewTimelineRef = useRef<HTMLDivElement>(null);

  // Touch-specific state for long-press detection in week/day views
  const [isViewTouchPending, setIsViewTouchPending] = useState(false);
  const viewTouchStartRef = useRef<{
    x: number;
    y: number;
    date: Date | null;
    hour: number;
  }>({ x: 0, y: 0, date: null, hour: 0 });
  const viewLongPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const VIEW_LONG_PRESS_DURATION = 400; // ms
  const VIEW_TOUCH_MOVE_THRESHOLD = 10; // px - if moved more than this, it's a scroll

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  // Helper to get user's response status for an event
  const getUserResponseStatus = (event: CalendarEvent): string | undefined => {
    if (!user?.email || !event.attendees) return undefined;
    const attendee = event.attendees.find(
      (a) => a.email.toLowerCase() === user.email!.toLowerCase(),
    );
    return attendee?.responseStatus;
  };

  // Helper to get event color considering attendance status
  const getColor = (event: CalendarEvent) => {
    return getEventColor(event.colorId, getUserResponseStatus(event));
  };

  // Navigate to previous/next month
  // Search handler with debounce (Cal-1)
  const handleSearchChange = (query: string) => {
    setSearchQuery(query);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (!query.trim()) {
      setSearchResults(null);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    searchTimerRef.current = setTimeout(async () => {
      const results = await searchEvents(selectedCalendarIds, query);
      setSearchResults(results);
      setIsSearching(false);
    }, 300);
  };

  const goToPrev = () => {
    if (view === "month") {
      setCurrentDate(new Date(year, month - 1, 1));
    } else if (view === "week") {
      const newDate = new Date(currentDate);
      newDate.setDate(newDate.getDate() - 7);
      setCurrentDate(newDate);
    } else if (view === "day") {
      const newDate = new Date(currentDate);
      newDate.setDate(newDate.getDate() - 1);
      setCurrentDate(newDate);
    }
  };

  const goToNext = () => {
    if (view === "month") {
      setCurrentDate(new Date(year, month + 1, 1));
    } else if (view === "week") {
      const newDate = new Date(currentDate);
      newDate.setDate(newDate.getDate() + 7);
      setCurrentDate(newDate);
    } else if (view === "day") {
      const newDate = new Date(currentDate);
      newDate.setDate(newDate.getDate() + 1);
      setCurrentDate(newDate);
    }
  };

  const goToToday = () => {
    setCurrentDate(new Date());
  };

  // Swipe handlers
  const { onTouchStart, onTouchEnd } = useSwipeableTabs({
    onNext: goToNext,
    onPrev: goToPrev,
  });
  const disableSwipe = view === "week";

  // Get events for a specific date
  const getEventsForDate = (date: Date) => {
    const dateStr = toLocalDateString(date);
    return events.filter((event) => {
      if (event.start.date) {
        // All-day event
        const start = event.start.date;
        const end = event.end.date || event.start.date;
        return dateStr >= start && dateStr < end;
      }
      if (event.start.dateTime) {
        const eventDate = toLocalDateString(new Date(event.start.dateTime));
        return eventDate === dateStr;
      }
      return false;
    });
  };

  // Get event positions for overlapping events (same logic as DayScheduleModal)
  const getEventPositionsForView = (viewEvents: CalendarEvent[]) => {
    const positions: Map<string, { column: number; totalColumns: number }> =
      new Map();

    const getEventTimes = (event: CalendarEvent) => {
      const start = new Date(event.start.dateTime!);
      const end = new Date(event.end.dateTime!);
      return {
        startMin: start.getHours() * 60 + start.getMinutes(),
        endMin: end.getHours() * 60 + end.getMinutes(),
      };
    };

    const eventsOverlap = (e1: CalendarEvent, e2: CalendarEvent) => {
      const t1 = getEventTimes(e1);
      const t2 = getEventTimes(e2);
      return t1.startMin < t2.endMin && t2.startMin < t1.endMin;
    };

    const groups: CalendarEvent[][] = [];
    const assigned = new Set<string>();

    viewEvents.forEach((event) => {
      if (assigned.has(event.id)) return;
      const group: CalendarEvent[] = [event];
      assigned.add(event.id);

      let expanded = true;
      while (expanded) {
        expanded = false;
        viewEvents.forEach((other) => {
          if (assigned.has(other.id)) return;
          const overlapsWithGroup = group.some((e) => eventsOverlap(e, other));
          if (overlapsWithGroup) {
            group.push(other);
            assigned.add(other.id);
            expanded = true;
          }
        });
      }
      groups.push(group);
    });

    groups.forEach((group) => {
      group.sort((a, b) => {
        const aT = getEventTimes(a);
        const bT = getEventTimes(b);
        if (aT.startMin !== bT.startMin) return aT.startMin - bT.startMin;
        return bT.endMin - bT.startMin - (aT.endMin - aT.startMin);
      });

      const columns: CalendarEvent[][] = [];

      group.forEach((event) => {
        const eventTimes = getEventTimes(event);
        let placed = false;

        for (let col = 0; col < columns.length; col++) {
          const canPlace = columns[col].every((existing) => {
            const existingTimes = getEventTimes(existing);
            return eventTimes.startMin >= existingTimes.endMin;
          });

          if (canPlace) {
            columns[col].push(event);
            positions.set(event.id, { column: col, totalColumns: 0 });
            placed = true;
            break;
          }
        }

        if (!placed) {
          columns.push([event]);
          positions.set(event.id, {
            column: columns.length - 1,
            totalColumns: 0,
          });
        }
      });

      const totalCols = columns.length;
      group.forEach((event) => {
        const pos = positions.get(event.id)!;
        pos.totalColumns = totalCols;
      });
    });

    return positions;
  };

  // Drag helpers for week/day views
  const hourHeightWeek = 60;
  const hourHeightDay = 80;

  const snapToGrid = (minutes: number) => Math.round(minutes / 15) * 15;

  const getDraggedTimesForView = (
    event: CalendarEvent,
    hourHeight: number,
    overrideCurrentY?: number,
    overrideStartY?: number,
  ) => {
    if (!draggingEvent || draggingEvent.id !== event.id || !dragMode)
      return null;

    const currentY =
      overrideCurrentY !== undefined ? overrideCurrentY : dragCurrentY;
    const startY = overrideStartY !== undefined ? overrideStartY : dragStartY;
    const deltaY = currentY - startY;
    const deltaMinutes = snapToGrid((deltaY / hourHeight) * 60);

    const originalStart = new Date(event.start.dateTime!);
    const originalEnd = new Date(event.end.dateTime!);
    const originalDuration = originalEnd.getTime() - originalStart.getTime();
    const eventDate = new Date(originalStart);
    eventDate.setHours(0, 0, 0, 0);

    let newStart: Date;
    let newEnd: Date;

    if (dragMode === "move") {
      const newStartMinutes = snapToGrid(
        originalStart.getHours() * 60 +
          originalStart.getMinutes() +
          deltaMinutes,
      );
      const clampedMinutes = Math.max(
        0,
        Math.min(24 * 60 - originalDuration / (1000 * 60), newStartMinutes),
      );
      newStart = new Date(eventDate);
      newStart.setHours(
        Math.floor(clampedMinutes / 60),
        clampedMinutes % 60,
        0,
        0,
      );
      newEnd = new Date(newStart.getTime() + originalDuration);
    } else if (dragMode === "resize-top") {
      const newStartMinutes = snapToGrid(
        originalStart.getHours() * 60 +
          originalStart.getMinutes() +
          deltaMinutes,
      );
      const endMinutes = originalEnd.getHours() * 60 + originalEnd.getMinutes();
      const clampedMinutes = Math.max(
        0,
        Math.min(endMinutes - 15, newStartMinutes),
      );
      newStart = new Date(eventDate);
      newStart.setHours(
        Math.floor(clampedMinutes / 60),
        clampedMinutes % 60,
        0,
        0,
      );
      newEnd = new Date(originalEnd);
    } else {
      const startMinutes =
        originalStart.getHours() * 60 + originalStart.getMinutes();
      const newEndMinutes = snapToGrid(
        originalEnd.getHours() * 60 + originalEnd.getMinutes() + deltaMinutes,
      );
      const clampedMinutes = Math.max(
        startMinutes + 15,
        Math.min(24 * 60, newEndMinutes),
      );
      newStart = new Date(originalStart);
      newEnd = new Date(eventDate);
      newEnd.setHours(
        Math.floor(clampedMinutes / 60),
        clampedMinutes % 60,
        0,
        0,
      );
    }

    return { newStart, newEnd };
  };

  const handleViewDragStart = (
    e: React.MouseEvent | React.TouchEvent,
    event: CalendarEvent,
    mode: "move" | "resize-top" | "resize-bottom",
  ) => {
    if (event.start.date) return; // Don't drag all-day events

    e.preventDefault();
    e.stopPropagation();

    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    dragStartYRef.current = clientY;
    dragCurrentYRef.current = clientY;
    hasDraggedRef.current = false;
    setDraggingEvent(event);
    setDragStartY(clientY);
    setDragCurrentY(clientY);
    setDragMode(mode);
  };

  // Calculate times for drag-to-create in week/day views
  const getCreateViewTimes = () => {
    if (!isCreatingView || !createViewDate) return null;

    const hourHeight = view === "week" ? hourHeightWeek : hourHeightDay;
    const deltaY = createViewCurrentY - createViewStartY;
    const deltaMinutes = snapToGrid((deltaY / hourHeight) * 60);

    const baseMinutes = createViewStartHour * 60;
    let startMinutes: number;
    let endMinutes: number;

    if (deltaMinutes >= 0) {
      startMinutes = baseMinutes;
      endMinutes = Math.max(baseMinutes + 15, baseMinutes + deltaMinutes);
    } else {
      startMinutes = Math.max(0, baseMinutes + deltaMinutes);
      endMinutes = baseMinutes + 15;
    }

    // Clamp values
    startMinutes = Math.max(0, Math.min(24 * 60 - 15, startMinutes));
    endMinutes = Math.max(15, Math.min(24 * 60, endMinutes));

    const start = new Date(createViewDate);
    start.setHours(Math.floor(startMinutes / 60), startMinutes % 60, 0, 0);
    const end = new Date(createViewDate);
    end.setHours(Math.floor(endMinutes / 60), endMinutes % 60, 0, 0);

    return { start, end };
  };

  // Mouse-only: Handle create drag start for week/day views
  const handleViewMouseCreateStart = (
    e: React.MouseEvent,
    date: Date,
    hour: number,
  ) => {
    // Don't start new creation if already creating
    if (isCreatingView) return;

    // Check if clicking on an event
    if ((e.target as HTMLElement).closest("[data-event]")) return;

    e.preventDefault();
    setIsCreatingView(true);
    setCreateViewStartY(e.clientY);
    setCreateViewCurrentY(e.clientY);
    setCreateViewDate(date);
    setCreateViewStartHour(hour);
  };

  // Touch: start pending long-press detection for week/day views
  const handleViewTouchCreateStart = (
    e: React.TouchEvent,
    date: Date,
    hour: number,
  ) => {
    // Don't start new creation if already creating
    if (isCreatingView || isViewTouchPending) return;

    // Check if touching an event
    if ((e.target as HTMLElement).closest("[data-event]")) return;

    const touch = e.touches[0];
    viewTouchStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      date,
      hour,
    };
    setIsViewTouchPending(true);

    // Start long-press timer
    viewLongPressTimerRef.current = setTimeout(() => {
      // Long-press detected - start event creation
      if (viewTouchStartRef.current.date) {
        setIsCreatingView(true);
        setCreateViewStartY(viewTouchStartRef.current.y);
        setCreateViewCurrentY(viewTouchStartRef.current.y);
        setCreateViewDate(viewTouchStartRef.current.date);
        setCreateViewStartHour(viewTouchStartRef.current.hour);
        setIsViewTouchPending(false);

        // Haptic feedback if available
        if (navigator.vibrate) {
          navigator.vibrate(50);
        }
      }
    }, VIEW_LONG_PRESS_DURATION);
  };

  // Cancel touch creation on move (allows scrolling) for week/day views
  // Only lock scrolling once creation starts to avoid blocking normal swipe/scroll.
  useEffect(() => {
    if (!isViewTouchPending && !isCreatingView) return;

    // Find the scrollable parent and disable scrolling only while creating
    const scrollParent = viewTimelineRef.current?.closest(
      ".overflow-auto",
    ) as HTMLElement | null;
    let originalOverflow = "";
    const lockScroll = Boolean(scrollParent && isCreatingView);
    if (lockScroll && scrollParent) {
      originalOverflow = scrollParent.style.overflow;
      scrollParent.style.overflow = "hidden";
    }

    const handleTouchMove = (e: TouchEvent) => {
      if (isCreatingView) {
        // During creation, prevent scroll completely
        e.preventDefault();
        return;
      }

      // During long-press pending, check if user is trying to scroll
      const touch = e.touches[0];
      const deltaX = Math.abs(touch.clientX - viewTouchStartRef.current.x);
      const deltaY = Math.abs(touch.clientY - viewTouchStartRef.current.y);

      // If moved beyond threshold, cancel long-press and allow scroll
      if (
        deltaX > VIEW_TOUCH_MOVE_THRESHOLD ||
        deltaY > VIEW_TOUCH_MOVE_THRESHOLD
      ) {
        if (viewLongPressTimerRef.current) {
          clearTimeout(viewLongPressTimerRef.current);
          viewLongPressTimerRef.current = null;
        }
        setIsViewTouchPending(false);
      }
    };

    const handleTouchEnd = () => {
      if (viewLongPressTimerRef.current) {
        clearTimeout(viewLongPressTimerRef.current);
        viewLongPressTimerRef.current = null;
      }
      setIsViewTouchPending(false);
    };

    document.addEventListener("touchmove", handleTouchMove);
    document.addEventListener("touchend", handleTouchEnd);
    document.addEventListener("touchcancel", handleTouchEnd);

    return () => {
      document.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("touchend", handleTouchEnd);
      document.removeEventListener("touchcancel", handleTouchEnd);
      if (viewLongPressTimerRef.current) {
        clearTimeout(viewLongPressTimerRef.current);
        viewLongPressTimerRef.current = null;
      }
      // Restore scroll on cleanup
      if (lockScroll && scrollParent) {
        scrollParent.style.overflow = originalOverflow;
      }
    };
  }, [isViewTouchPending, isCreatingView]);

  // Handle create drag move/end for week/day views
  useEffect(() => {
    if (!isCreatingView) return;

    const handleMouseMove = (e: MouseEvent) => {
      setCreateViewCurrentY(e.clientY);
    };

    const handleTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      const clientY = e.touches[0]?.clientY ?? 0;
      setCreateViewCurrentY(clientY);
    };

    const handleEnd = () => {
      const times = getCreateViewTimes();
      if (times) {
        if (tentativeBatch.isActive) {
          tentativeBatch.addSlotFromDateRange(times.start, times.end);
        } else {
          setEditingEvent({
            id: "",
            summary: "",
            start: { dateTime: times.start.toISOString() },
            end: { dateTime: times.end.toISOString() },
          } as CalendarEvent);
          setShowEventModal(true);
        }
      }

      setIsCreatingView(false);
      setCreateViewDate(null);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleEnd);
    document.addEventListener("touchmove", handleTouchMove, { passive: false });
    document.addEventListener("touchend", handleEnd);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleEnd);
      document.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("touchend", handleEnd);
    };
  }, [
    isCreatingView,
    createViewStartY,
    createViewCurrentY,
    createViewDate,
    createViewStartHour,
    view,
  ]);

  // Handle drag move and end for week/day views
  useEffect(() => {
    if (!draggingEvent || (view !== "week" && view !== "day")) return;

    const handleMouseMove = (e: MouseEvent) => {
      const clientY = e.clientY;
      dragCurrentYRef.current = clientY;
      setDragCurrentY(clientY);
      if (Math.abs(clientY - dragStartYRef.current) > 5) {
        hasDraggedRef.current = true;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      const clientY = e.touches[0]?.clientY ?? 0;
      dragCurrentYRef.current = clientY;
      setDragCurrentY(clientY);
      if (Math.abs(clientY - dragStartYRef.current) > 5) {
        hasDraggedRef.current = true;
      }
    };

    const handleEnd = async () => {
      try {
        const didDrag =
          hasDraggedRef.current ||
          Math.abs(dragCurrentYRef.current - dragStartYRef.current) > 5;
        const hourHeight = view === "week" ? hourHeightWeek : hourHeightDay;

        if (draggingEvent && didDrag) {
          const times = getDraggedTimesForView(
            draggingEvent,
            hourHeight,
            dragCurrentYRef.current,
            dragStartYRef.current,
          );
          if (
            times &&
            (times.newStart.getTime() !==
              new Date(draggingEvent.start.dateTime!).getTime() ||
              times.newEnd.getTime() !==
                new Date(draggingEvent.end.dateTime!).getTime())
          ) {
            setIsSavingDrag(true);
            clickPreventedRef.current = true;
            const calendarId = draggingEvent.calendarId || selectedCalendarId;
            await updateEvent(calendarId, draggingEvent.id, {
              start: { dateTime: times.newStart.toISOString() },
              end: { dateTime: times.newEnd.toISOString() },
            });
            setIsSavingDrag(false);
            setTimeout(() => {
              clickPreventedRef.current = false;
            }, 100);
          }
        }

        if (didDrag) {
          clickPreventedRef.current = true;
          setTimeout(() => {
            clickPreventedRef.current = false;
          }, 100);
        }
      } finally {
        setDraggingEvent(null);
        setDragMode(null);
        setIsSavingDrag(false);
      }
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleEnd);
    document.addEventListener("touchmove", handleTouchMove, { passive: false });
    document.addEventListener("touchend", handleEnd);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleEnd);
      document.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("touchend", handleEnd);
    };
  }, [draggingEvent, view, selectedCalendarId, updateEvent]);

  // Generate calendar days
  const calendarDays = useMemo(() => {
    const daysInMonth = getDaysInMonth(year, month);
    const firstDay = getFirstDayOfMonth(year, month);
    const days: { date: Date; isCurrentMonth: boolean }[] = [];

    // Previous month days
    const prevMonthDays = getDaysInMonth(year, month - 1);
    for (let i = firstDay - 1; i >= 0; i--) {
      days.push({
        date: new Date(year, month - 1, prevMonthDays - i),
        isCurrentMonth: false,
      });
    }

    // Current month days
    for (let i = 1; i <= daysInMonth; i++) {
      days.push({
        date: new Date(year, month, i),
        isCurrentMonth: true,
      });
    }

    // Next month days
    const remainingDays = 42 - days.length;
    for (let i = 1; i <= remainingDays; i++) {
      days.push({
        date: new Date(year, month + 1, i),
        isCurrentMonth: false,
      });
    }

    return days;
  }, [year, month]);
  const calendarWeeks = useMemo(() => {
    const weeks: { date: Date; isCurrentMonth: boolean }[][] = [];
    for (let i = 0; i < calendarDays.length; i += 7) {
      weeks.push(calendarDays.slice(i, i + 7));
    }
    return weeks;
  }, [calendarDays]);

  // Initialize or validate selectedCalendarIds when calendars load
  // Wait for settings to finish loading before setting defaults to avoid overwriting saved values
  const calendarsLoadedRef = useRef(false);
  useEffect(() => {
    // Don't initialize until settings are loaded AND calendars are available
    if (isLoadingCalendarSettings || calendars.length === 0) {
      return;
    }

    if (!calendarsLoadedRef.current) {
      calendarsLoadedRef.current = true;
      const calendarIdSet = new Set(calendars.map((c) => c.id));

      if (selectedCalendarIds.length === 0) {
        // No saved selection - select the primary calendar by default
        const primaryId =
          calendars.find((c) => c.primary)?.id || calendars[0]?.id;
        if (primaryId) {
          setSelectedCalendarIds([primaryId]);
          setSelectedCalendarId(primaryId);
        }
      } else {
        // Validate stored IDs - filter out any that no longer exist
        const validIds = selectedCalendarIds.filter((id) =>
          calendarIdSet.has(id),
        );
        if (validIds.length === 0) {
          // All stored IDs were invalid - fall back to primary
          const primaryId =
            calendars.find((c) => c.primary)?.id || calendars[0]?.id;
          if (primaryId) {
            setSelectedCalendarIds([primaryId]);
            setSelectedCalendarId(primaryId);
          }
        } else if (validIds.length !== selectedCalendarIds.length) {
          // Some IDs were invalid - update with valid ones only
          setSelectedCalendarIds(validIds);
          setSelectedCalendarId(validIds[0]);
        } else {
          // All IDs valid - just set selectedCalendarId for operations
          setSelectedCalendarId(selectedCalendarIds[0]);
        }
      }
    }
  }, [
    calendars,
    selectedCalendarIds,
    setSelectedCalendarIds,
    setSelectedCalendarId,
    isLoadingCalendarSettings,
  ]);

  // Get filtered events based on selected calendars
  const filteredEvents = useMemo(() => {
    // For now, events come from selectedCalendarId, but we keep selectedCalendarIds for future multi-calendar support
    return events;
  }, [events]);

  // Fetch events when date range or selected calendars change
  // Only fetch after calendars are loaded and settings are loaded to ensure IDs are validated
  useEffect(() => {
    if (
      isConnected &&
      calendars.length > 0 &&
      selectedCalendarIds.length > 0 &&
      !isLoadingCalendarSettings
    ) {
      let timeMin: string;
      let timeMax: string;

      if (view === "week") {
        // Get week range
        const startOfWeek = new Date(currentDate);
        const dayOfWeek = startOfWeek.getDay();
        startOfWeek.setDate(startOfWeek.getDate() - dayOfWeek);
        startOfWeek.setHours(0, 0, 0, 0);

        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(endOfWeek.getDate() + 7);

        timeMin = startOfWeek.toISOString();
        timeMax = endOfWeek.toISOString();
      } else if (view === "day") {
        // Get day range
        const startOfDay = new Date(currentDate);
        startOfDay.setHours(0, 0, 0, 0);

        const endOfDay = new Date(currentDate);
        endOfDay.setHours(23, 59, 59, 999);

        timeMin = startOfDay.toISOString();
        timeMax = endOfDay.toISOString();
      } else {
        // Month view - get ±1 month
        timeMin = new Date(year, month - 1, 1).toISOString();
        timeMax = new Date(year, month + 2, 0).toISOString();
      }

      fetchMultipleCalendarEvents(selectedCalendarIds, timeMin, timeMax);
    }
  }, [
    year,
    month,
    currentDate,
    view,
    selectedCalendarIds,
    isConnected,
    calendars.length,
    fetchMultipleCalendarEvents,
    isLoadingCalendarSettings,
  ]);

  // Stable key derived from event IDs + start times to avoid excessive re-scheduling
  const eventsKey = useMemo(
    () =>
      events
        .map((e) => `${e.id}:${e.start.dateTime ?? e.start.date}`)
        .sort()
        .join(","),
    [events],
  );

  // Schedule calendar event notifications only when events actually change
  useEffect(() => {
    if (events.length > 0) {
      scheduleCalendarEventNotifications(events).catch((err) => {
        console.error("Failed to schedule calendar notifications:", err);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventsKey]);

  const handleCreateEvent = async (
    data: CreateEventInput,
    calendarId: string,
    sendUpdatesParam?: "all" | "externalOnly" | "none",
  ) => {
    if (editingEvent && editingEvent.id) {
      // If this is a recurring event instance, ask user which scope to edit
      if (editingEvent.recurringEventId) {
        setRecurringEditPending({
          event: editingEvent,
          data,
          calendarId: editingEvent.calendarId || selectedCalendarId,
          sendUpdates: sendUpdatesParam,
        });
        setShowEventModal(false);
        return;
      }
      const originalCalendarId = editingEvent.calendarId || selectedCalendarId;
      const hasRecurrenceChange =
        (data.recurrence && data.recurrence.length > 0) !==
        (editingEvent.recurrence && editingEvent.recurrence.length > 0);
      await updateEvent(
        originalCalendarId,
        editingEvent.id,
        data,
        sendUpdatesParam,
      );
      // Refresh to get proper instances after recurrence change
      if (hasRecurrenceChange) {
        refresh();
      }
    } else {
      const created = await createEvent(calendarId, data, sendUpdatesParam);
      // Refresh to get instances if new recurring event was created
      if (created && data.recurrence?.length) {
        refresh();
      }
    }
    setShowEventModal(false);
    setEditingEvent(null);
  };

  const handleRecurringEditSelect = async (
    mode: "single" | "thisAndFuture" | "all",
  ) => {
    if (!recurringEditPending) return;
    const { event, data, calendarId, sendUpdates: su } = recurringEditPending;

    if (event.recurringEventId) {
      const instanceStart = event.start.dateTime || event.start.date || "";
      // For single instance edit, strip recurrence (only applies to series)
      const patchData =
        mode === "single" ? { ...data, recurrence: undefined } : data;
      await updateRecurringEvent(
        calendarId,
        event.id,
        patchData,
        mode,
        event.recurringEventId,
        instanceStart,
        su,
      );
    } else {
      // Not a recurring instance — update directly
      await updateEvent(calendarId, event.id, data, su);
    }

    setRecurringEditPending(null);
    setEditingEvent(null);
  };

  const handleShowEventDetails = (event: CalendarEvent) => {
    setSelectedEvent(event);
    setShowDetailsModal(true);
  };

  const handleEditEvent = async (event: CalendarEvent) => {
    // For recurring instances, fetch master event to get recurrence rules
    if (event.recurringEventId && !event.recurrence?.length) {
      const calId = event.calendarId || selectedCalendarId;
      const master = await getEvent(calId, event.recurringEventId);
      if (master?.recurrence?.length) {
        setEditingEvent({ ...event, recurrence: master.recurrence });
        setShowEventModal(true);
        return;
      }
    }
    setEditingEvent(event);
    setShowEventModal(true);
  };

  // Header buttons
  const headerLeft = (
    <div className="flex items-center gap-0.5 md:gap-1">
      <button
        onClick={refresh}
        disabled={isSyncing}
        className="p-1.5 md:p-2 neu-text-secondary hover:neu-text-primary neu-btn rounded-lg transition-colors disabled:opacity-50"
        title="Refresh"
      >
        <RefreshCw
          size={16}
          className={`md:w-[18px] md:h-[18px] ${isSyncing ? "animate-spin" : ""}`}
        />
      </button>
      <button
        onClick={() => {
          setShowSearchBar(!showSearchBar);
          if (showSearchBar) {
            setSearchQuery("");
            setSearchResults(null);
          }
        }}
        className={`p-1.5 md:p-2 neu-btn rounded-lg transition-colors ${showSearchBar ? "text-sky-600" : "neu-text-secondary hover:neu-text-primary"}`}
        title="Search Events"
      >
        <Search size={16} className="md:w-[18px] md:h-[18px]" />
      </button>
      <button
        onClick={() => setShowSchedulingModal(true)}
        className="p-1.5 md:p-2 neu-text-secondary hover:neu-text-primary neu-btn rounded-lg transition-colors"
        title="Find Available Slots"
      >
        <Clock size={16} className="md:w-[18px] md:h-[18px]" />
      </button>
      <button
        onClick={() => setShowFreeBusyModal(true)}
        className="p-1.5 md:p-2 neu-text-secondary hover:neu-text-primary neu-btn rounded-lg transition-colors"
        title="Free/Busy Check"
      >
        <Users size={16} className="md:w-[18px] md:h-[18px]" />
      </button>
      <button
        onClick={() =>
          tentativeBatch.isActive
            ? tentativeBatch.deactivate()
            : tentativeBatch.activate()
        }
        className={`p-1.5 md:p-2 neu-btn rounded-lg transition-colors ${
          tentativeBatch.isActive
            ? "text-pink-600 bg-pink-50 ring-1 ring-pink-200"
            : "neu-text-secondary hover:neu-text-primary"
        }`}
        title="仮押さえモード"
      >
        <CalendarPlus size={16} className="md:w-[18px] md:h-[18px]" />
      </button>
    </div>
  );

  const headerRight = (
    <button
      onClick={async () => {
        const settings = await fetchCalendarSettings();
        setCalSettings(settings);
        setShowCalSettingsModal(true);
      }}
      className="p-1.5 md:p-2 neu-text-secondary hover:neu-text-primary neu-btn rounded-lg transition-colors"
      title="Calendar Settings"
    >
      <Settings size={16} className="md:w-[18px] md:h-[18px]" />
    </button>
  );

  const headerCenter = (
    <button
      onClick={() => {
        setEditingEvent(null);
        setShowEventModal(true);
      }}
      className="flex items-center gap-1.5 md:gap-2 px-2.5 md:px-3 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs md:text-sm font-medium transition-all active:scale-95 shadow"
    >
      <Plus size={16} />
      <span className="hidden sm:inline">Add Event</span>
    </button>
  );

  // Not connected state
  if (!isConnected) {
    return (
      <Layout
        pageTitle="Calendar"
        headerCenter={headerCenter}
        headerRight={headerRight}
      >
        <div className="h-full flex items-center justify-center neu-bg p-4">
          <div className="neu-card rounded-2xl p-8 max-w-md text-center">
            <div className="bg-blue-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
              <CalendarIcon size={32} className="text-blue-600" />
            </div>
            <h2 className="text-xl font-bold neu-text-primary mb-2">
              Connect Google Calendar
            </h2>
            <p className="neu-text-secondary mb-6">
              Connect your Google account to view and manage your calendar
              events.
            </p>
            <button
              onClick={connectGoogleCalendar}
              className="w-full px-4 py-3 bg-sky-600 text-white font-medium rounded-xl hover:bg-sky-500 transition-colors flex items-center justify-center gap-2"
            >
              <CalendarIcon size={20} />
              Connect Google Calendar
            </button>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout
      pageTitle="Calendar"
      headerLeft={headerLeft}
      headerCenter={headerCenter}
      headerRight={headerRight}
    >
      <div className="flex-1 flex flex-col min-h-0 neu-bg">
        {/* Error Banner */}
        {error && (
          <ErrorBanner
            message={error}
            action={
              error.includes("reconnect") ? (
                <Link
                  to="/settings"
                  className="text-xs text-red-600 hover:text-red-800 underline font-medium mt-1"
                >
                  Go to Settings to reconnect →
                </Link>
              ) : undefined
            }
          />
        )}

        {/* Search Bar (Cal-1) */}
        {showSearchBar && (
          <div className="shrink-0 px-4 py-2 border-b border-slate-200 bg-slate-50">
            <div className="relative">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 neu-text-secondary"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder="Search events..."
                className="w-full pl-9 pr-9 py-2 text-sm neu-input rounded-lg focus:ring-2 focus:ring-sky-500"
                autoFocus
              />
              {searchQuery && (
                <button
                  onClick={() => {
                    setSearchQuery("");
                    setSearchResults(null);
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 neu-text-secondary hover:neu-text-primary"
                >
                  <X size={14} />
                </button>
              )}
            </div>
            {isSearching && (
              <div className="mt-2 flex items-center gap-2 text-xs neu-text-secondary">
                <Loader2 size={12} className="animate-spin" />
                Searching...
              </div>
            )}
            {searchResults && !isSearching && (
              <div className="mt-2 max-h-64 overflow-y-auto space-y-1">
                {searchResults.length === 0 ? (
                  <div className="text-xs neu-text-secondary py-2">
                    No events found
                  </div>
                ) : (
                  searchResults.map((event) => {
                    const color = getColor(event);
                    return (
                      <button
                        key={event.id}
                        onClick={() => {
                          setSelectedEvent(event);
                          setShowDetailsModal(true);
                        }}
                        className={`w-full text-left px-3 py-2 text-sm ${color.bg} ${color.text} rounded-lg hover:opacity-80 transition-opacity`}
                        style={
                          color.style
                            ? {
                                backgroundColor: color.style.backgroundColor,
                                color: color.style.color,
                                textDecoration: color.style.textDecoration,
                              }
                            : undefined
                        }
                      >
                        <div className="font-medium truncate">
                          {event.summary}
                        </div>
                        <div className="text-xs opacity-75">
                          {event.start.dateTime
                            ? new Date(event.start.dateTime).toLocaleDateString(
                                "en-US",
                                {
                                  month: "short",
                                  day: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                  hour12: false,
                                },
                              )
                            : event.start.date}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            )}
          </div>
        )}

        {/* Calendar Header */}
        <div className="shrink-0 neu-bg border-b border-slate-300 relative z-20 no-select min-h-14">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-3 h-full px-4 pt-5 pb-3 md:py-2">
            {/* Navigation & Date */}
            <div className="flex items-center justify-between w-full sm:w-auto">
              <div className="flex items-center gap-1">
                <button
                  onClick={goToPrev}
                  className="p-1.5 neu-btn rounded-lg transition-colors"
                >
                  <ChevronLeft size={20} />
                </button>
                <h2 className="text-lg font-semibold neu-text-primary min-w-[100px] text-center">
                  {currentDate.toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "short",
                    ...(view === "day" ? { day: "numeric" } : {}),
                  })}
                </h2>
                <button
                  onClick={goToNext}
                  className="p-1.5 neu-btn rounded-lg transition-colors"
                >
                  <ChevronRight size={20} />
                </button>
              </div>
              <button
                onClick={goToToday}
                className="px-3 py-1.5 text-xs font-medium neu-chip rounded-lg transition-colors ml-2"
              >
                Today
              </button>
            </div>

            {/* Controls */}
            <div className="flex items-center justify-between sm:justify-end gap-2">
              {/* Calendar Selector */}
              <div className="relative flex-1 sm:flex-none">
                <button
                  onClick={() => setShowCalendarDropdown(!showCalendarDropdown)}
                  className="w-full sm:w-auto flex items-center justify-center gap-2 px-2 py-1.5 sm:px-3 sm:py-1.5 text-sm neu-btn rounded-lg transition-colors"
                >
                  {/* Show color indicators for selected calendars */}
                  <div className="flex -space-x-1">
                    {calendars
                      .filter((c) => selectedCalendarIds.includes(c.id))
                      .slice(0, 3)
                      .map((cal) => (
                        <div
                          key={cal.id}
                          className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-sm border border-white"
                          style={{
                            backgroundColor: cal.backgroundColor || "#4285f4",
                          }}
                        />
                      ))}
                  </div>
                  <span className="max-w-[100px] truncate text-xs sm:text-sm">
                    {selectedCalendarIds.length === 1
                      ? calendars.find((c) => c.id === selectedCalendarIds[0])
                          ?.summary || "Calendar"
                      : `${selectedCalendarIds.length} Cals`}
                  </span>
                  <ChevronDown size={14} />
                </button>

                {showCalendarDropdown && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setShowCalendarDropdown(false)}
                    />
                    <div className="absolute top-full left-0 sm:left-auto sm:right-0 mt-2 w-[calc(100vw-2rem)] max-w-64 sm:max-w-72 bg-white rounded-xl z-50 shadow-xl border border-slate-200">
                      <div className="p-3 border-b border-slate-100">
                        <div className="flex items-center justify-between">
                          <span className="font-medium neu-text-primary">
                            Calendars
                          </span>
                          <button
                            onClick={() => {
                              if (
                                selectedCalendarIds.length === calendars.length
                              ) {
                                setSelectedCalendarIds(
                                  [
                                    calendars.find((c) => c.primary)?.id ||
                                      calendars[0]?.id,
                                  ].filter(Boolean) as string[],
                                );
                              } else {
                                setSelectedCalendarIds(
                                  calendars.map((c) => c.id),
                                );
                              }
                            }}
                            className="text-xs text-blue-600 hover:text-blue-800"
                          >
                            {selectedCalendarIds.length === calendars.length
                              ? "Deselect All"
                              : "Select All"}
                          </button>
                        </div>
                      </div>
                      <div className="p-2 max-h-64 overflow-y-auto">
                        {calendars.map((cal) => (
                          <label
                            key={cal.id}
                            className="flex items-center gap-3 px-3 py-2 text-sm rounded-lg hover:bg-slate-50 cursor-pointer transition-colors"
                          >
                            <input
                              type="checkbox"
                              checked={selectedCalendarIds.includes(cal.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedCalendarIds([
                                    ...selectedCalendarIds,
                                    cal.id,
                                  ]);
                                } else {
                                  const newIds = selectedCalendarIds.filter(
                                    (id) => id !== cal.id,
                                  );
                                  // Keep at least one calendar selected
                                  if (newIds.length > 0) {
                                    setSelectedCalendarIds(newIds);
                                  }
                                }
                              }}
                              className="rounded border-slate-300 text-blue-600 focus:ring-sky-500"
                            />
                            <div
                              className="w-3 h-3 rounded-sm shrink-0"
                              style={{
                                backgroundColor:
                                  cal.backgroundColor || "#4285f4",
                              }}
                            />
                            <span className="truncate flex-1 text-slate-700">
                              {cal.summary}
                            </span>
                            {cal.primary && (
                              <span className="text-xs text-slate-400">
                                (Primary)
                              </span>
                            )}
                            {cal.accessRole === "owner" && !cal.primary && (
                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setShareCalendarId(cal.id);
                                  }}
                                  className="p-1 text-slate-400 hover:text-sky-600 rounded transition-colors"
                                  title="Share"
                                >
                                  <Share2 size={12} />
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setDeleteCalendarConfirm(cal.id);
                                  }}
                                  className="p-1 text-slate-400 hover:text-red-500 rounded transition-colors"
                                  title="Delete"
                                >
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            )}
                          </label>
                        ))}
                      </div>
                      {/* Create Calendar */}
                      <div className="border-t border-slate-200 p-2">
                        {showCreateCalendar ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={newCalendarName}
                              onChange={(e) =>
                                setNewCalendarName(e.target.value)
                              }
                              placeholder="Calendar name..."
                              className="flex-1 text-sm px-2 py-1.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500 outline-none"
                              autoFocus
                              onKeyDown={async (e) => {
                                if (
                                  e.key === "Enter" &&
                                  newCalendarName.trim()
                                ) {
                                  await createCalendar(newCalendarName.trim());
                                  setNewCalendarName("");
                                  setShowCreateCalendar(false);
                                  refresh();
                                } else if (e.key === "Escape") {
                                  setShowCreateCalendar(false);
                                  setNewCalendarName("");
                                }
                              }}
                            />
                            <button
                              onClick={async () => {
                                if (newCalendarName.trim()) {
                                  await createCalendar(newCalendarName.trim());
                                  setNewCalendarName("");
                                  setShowCreateCalendar(false);
                                  refresh();
                                }
                              }}
                              className="text-xs px-2 py-1.5 bg-sky-600 text-white rounded-lg hover:bg-sky-700 transition-colors"
                            >
                              Create
                            </button>
                            <button
                              onClick={() => {
                                setShowCreateCalendar(false);
                                setNewCalendarName("");
                              }}
                              className="text-xs px-2 py-1.5 text-slate-500 hover:text-slate-700 transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setShowCreateCalendar(true)}
                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-sky-600 hover:bg-sky-50 rounded-lg transition-colors"
                          >
                            <Plus size={14} />
                            Create Calendar
                          </button>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* View Selector (Desktop) */}
              <div className="hidden md:flex items-center neu-pressed rounded-lg p-1">
                {(["month", "week", "day", "agenda"] as const).map((v) => (
                  <button
                    key={v}
                    onClick={() => setView(v)}
                    className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                      view === v
                        ? "neu-card shadow neu-text-primary"
                        : "neu-text-secondary hover:neu-text-primary"
                    }`}
                  >
                    {v.charAt(0).toUpperCase() + v.slice(1)}
                  </button>
                ))}
              </div>

              {/* View Selector (Mobile) */}
              <div className="md:hidden flex items-center neu-pressed rounded-lg p-0.5">
                {(["month", "day", "agenda"] as const).map((v) => (
                  <button
                    key={v}
                    onClick={() => setView(v)}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                      (view === "week" ? "month" : view) === v
                        ? "neu-card shadow neu-text-primary"
                        : "neu-text-secondary"
                    }`}
                  >
                    {v.charAt(0).toUpperCase() + v.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Calendar Content */}
        <div
          className="flex-1 min-h-0 flex flex-col overflow-hidden"
          onTouchStart={disableSwipe ? undefined : onTouchStart}
          onTouchEnd={disableSwipe ? undefined : onTouchEnd}
        >
          {view === "month" && (
            <div className="flex-1 min-h-0 flex flex-col overflow-auto px-4 mobile-scroll-pad">
              <div className="w-full flex-1 flex flex-col">
                {/* Day Headers */}
                <div className="shrink-0 grid grid-cols-7 bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
                  {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(
                    (day, idx) => (
                      <div
                        key={day}
                        className={`px-1 py-2 text-[10px] sm:text-xs font-medium neu-text-secondary text-center ${idx > 0 ? "border-l border-slate-200" : ""}`}
                      >
                        {day}
                      </div>
                    ),
                  )}
                </div>

                {/* Calendar Grid */}
                <div className="flex-1 flex flex-col border-l border-slate-200">
                  {calendarWeeks.map((week, weekIndex) => (
                    <div key={`week-${weekIndex}`} className="grid grid-cols-7">
                      {week.map((day, dayIndex) => {
                        const dayEvents = getEventsForDate(day.date);
                        const isToday =
                          day.date.toDateString() === new Date().toDateString();

                        return (
                          <div
                            key={`${day.date.toISOString()}-${dayIndex}`}
                            className={`border-r border-b border-slate-200 p-0.5 sm:p-1 cursor-pointer hover:bg-slate-50/50 transition-colors relative flex flex-col min-h-[90px] ${
                              !day.isCurrentMonth
                                ? "bg-slate-50/50 neu-text-muted"
                                : ""
                            }`}
                            onClick={() => {
                              setSelectedModalDate(day.date);
                              setShowDayModal(true);
                            }}
                          >
                            <div
                              className={`text-[10px] sm:text-xs font-medium mb-0.5 w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center rounded-full self-center sm:self-start shrink-0 ${
                                isToday
                                  ? "bg-sky-600 text-white"
                                  : day.isCurrentMonth
                                    ? "neu-text-primary"
                                    : "neu-text-muted"
                              }`}
                            >
                              {day.date.getDate()}
                            </div>

                            {/* Event List (Responsive) */}
                            <div className="space-y-px sm:space-y-0.5">
                              {dayEvents.map((event) => {
                                const color = getColor(event);
                                return (
                                  <button
                                    key={event.id}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleShowEventDetails(event);
                                    }}
                                    className={`w-full text-left px-0.5 sm:px-1 text-[8px] sm:text-[10px] ${color.bg} ${color.text} rounded truncate hover:opacity-80 transition-opacity block leading-tight sm:leading-normal`}
                                    style={
                                      color.style
                                        ? {
                                            backgroundColor:
                                              color.style.backgroundColor,
                                            color: color.style.color,
                                            textDecoration:
                                              color.style.textDecoration,
                                          }
                                        : undefined
                                    }
                                  >
                                    {formatTime(event) !== "All day" && (
                                      <span className="font-medium hidden sm:inline">
                                        {formatTime(event)}{" "}
                                      </span>
                                    )}
                                    {event.summary || "(No title)"}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {view === "agenda" && (
            <div className="p-4 flex-1 min-h-0 overflow-auto mobile-scroll-pad">
              <div className="mb-6">
                <h2 className="text-2xl font-bold neu-text-primary">
                  Today's Schedule
                </h2>
                <p className="neu-text-secondary mt-1">
                  {new Date().toLocaleDateString("en-US", {
                    weekday: "long",
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </p>
              </div>
              {(() => {
                const today = new Date();
                const todayStr = toLocalDateString(today);
                const todayEvents = filteredEvents
                  .filter((event) => {
                    if (event.start.date) {
                      const start = event.start.date;
                      const end = event.end.date || event.start.date;
                      return todayStr >= start && todayStr < end;
                    }
                    if (event.start.dateTime) {
                      const eventDate = toLocalDateString(
                        new Date(event.start.dateTime),
                      );
                      return eventDate === todayStr;
                    }
                    return false;
                  })
                  .sort((a, b) => {
                    const aTime = a.start.dateTime
                      ? new Date(a.start.dateTime).getTime()
                      : 0;
                    const bTime = b.start.dateTime
                      ? new Date(b.start.dateTime).getTime()
                      : 0;
                    return aTime - bTime;
                  });

                if (todayEvents.length === 0) {
                  return (
                    <div className="text-center py-16 neu-pressed rounded-xl">
                      <CalendarIcon
                        size={48}
                        className="mx-auto neu-text-muted mb-4"
                      />
                      <p className="neu-text-secondary">
                        No events scheduled for today
                      </p>
                    </div>
                  );
                }

                return (
                  <div className="space-y-3">
                    {todayEvents.map((event) => {
                      const color = getColor(event);
                      return (
                        <button
                          key={event.id}
                          onClick={() => handleShowEventDetails(event)}
                          className={`w-full text-left neu-pressed rounded-xl px-4 py-3 hover:shadow-inner transition-shadow ${color.border} border-l-4`}
                          style={
                            color.style
                              ? { borderLeftColor: color.style.borderColor }
                              : undefined
                          }
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              <div
                                className={`font-semibold ${color.text}`}
                                style={
                                  color.style
                                    ? {
                                        color: color.style.color,
                                        textDecoration:
                                          color.style.textDecoration,
                                      }
                                    : undefined
                                }
                              >
                                {event.summary || "(No title)"}
                              </div>
                              {event.location && (
                                <div className="flex items-center gap-1 text-sm neu-text-secondary mt-1">
                                  <MapPin size={12} />
                                  <span className="truncate">
                                    {event.location}
                                  </span>
                                </div>
                              )}
                            </div>
                            <div className="text-sm font-medium neu-text-secondary shrink-0">
                              {formatTime(event)}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          )}

          {view === "week" && (
            <div className="flex-1 min-h-0 overflow-auto mobile-scroll-pad">
              {/* Week View */}
              <div className="min-w-[700px]">
                {/* Time slots header - fixed with proper background */}
                <div className="flex flex-col neu-flat sticky top-0 z-20">
                  {/* Day headers */}
                  <div className="flex">
                    <div className="w-16 shrink-0" />
                    {Array.from({ length: 7 }).map((_, i) => {
                      const date = new Date(currentDate);
                      const dayOfWeek = currentDate.getDay();
                      const diff = i - dayOfWeek;
                      date.setDate(date.getDate() + diff);
                      const isToday =
                        date.toDateString() === new Date().toDateString();

                      return (
                        <div
                          key={i}
                          className="flex-1 text-center py-2 border-l border-slate-200"
                        >
                          <div className="text-xs neu-text-secondary mb-1">
                            {date.toLocaleDateString("en-US", {
                              weekday: "short",
                            })}
                          </div>
                          <div
                            className={`text-sm font-medium ${isToday ? "text-blue-600" : "neu-text-primary"}`}
                          >
                            {date.getDate()}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {/* All-day events */}
                  <div className="flex border-b border-slate-200">
                    <div className="w-16 shrink-0 text-xs neu-text-muted text-right pr-2 py-1 flex items-start justify-end">
                      All day
                    </div>
                    {Array.from({ length: 7 }).map((_, i) => {
                      const date = new Date(currentDate);
                      const dayOfWeek = currentDate.getDay();
                      const diff = i - dayOfWeek;
                      date.setDate(date.getDate() + diff);
                      const allDayEvents = getEventsForDate(date).filter(
                        (event) => !!event.start.date,
                      );

                      return (
                        <div
                          key={i}
                          className="flex-1 border-l border-slate-100 min-h-[24px] py-0.5 px-1"
                        >
                          {allDayEvents.map((event) => {
                            const color = getColor(event);
                            return (
                              <button
                                key={event.id}
                                onClick={() => handleShowEventDetails(event)}
                                className={`w-full mb-1 ${color.bg} ${color.text} ${color.border} border-l-2 rounded px-1 py-0.5 text-xs overflow-hidden hover:shadow-md transition-shadow`}
                                style={
                                  color.style
                                    ? {
                                        backgroundColor:
                                          color.style.backgroundColor,
                                        color: color.style.color,
                                        borderLeftColor:
                                          color.style.borderColor,
                                        textDecoration:
                                          color.style.textDecoration,
                                      }
                                    : undefined
                                }
                              >
                                <div className="font-medium truncate">
                                  {event.summary}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Time grid */}
                <div className="relative no-select" ref={viewTimelineRef}>
                  {Array.from({ length: 24 }).map((_, hour) => (
                    <div
                      key={hour}
                      className="flex border-b border-slate-200"
                      style={{ height: "60px" }}
                    >
                      <div className="w-16 shrink-0 text-xs neu-text-muted text-right pr-2 pt-0.5">
                        {hour.toString().padStart(2, "0")}:00
                      </div>
                      {Array.from({ length: 7 }).map((_, dayIdx) => {
                        const cellDate = new Date(currentDate);
                        const dayOfWeek = currentDate.getDay();
                        const diff = dayIdx - dayOfWeek;
                        cellDate.setDate(cellDate.getDate() + diff);
                        const dateCopy = new Date(cellDate);
                        dateCopy.setHours(hour, 0, 0, 0);

                        const dayEvents = getEventsForDate(cellDate).filter(
                          (event) => {
                            if (!event.start.dateTime) return false;
                            const eventHour = new Date(
                              event.start.dateTime,
                            ).getHours();
                            return eventHour === hour;
                          },
                        );

                        // Check if this cell is part of the creation selection
                        const isCreatingInThisCell =
                          isCreatingView &&
                          createViewDate &&
                          dateCopy.toDateString() ===
                            createViewDate.toDateString();
                        const createTimes = getCreateViewTimes();

                        return (
                          <div
                            key={dayIdx}
                            className={`flex-1 border-l border-slate-200 relative cursor-crosshair ${isCreatingView ? "touch-none" : ""}`}
                            onMouseDown={(e) => {
                              const cellDateForCreate = new Date(currentDate);
                              cellDateForCreate.setDate(
                                cellDateForCreate.getDate() + diff,
                              );
                              cellDateForCreate.setHours(0, 0, 0, 0);
                              handleViewMouseCreateStart(
                                e,
                                cellDateForCreate,
                                hour,
                              );
                            }}
                            onTouchStart={(e) => {
                              // Touch: use long-press detection (allows scrolling)
                              const cellDateForCreate = new Date(currentDate);
                              cellDateForCreate.setDate(
                                cellDateForCreate.getDate() + diff,
                              );
                              cellDateForCreate.setHours(0, 0, 0, 0);
                              handleViewTouchCreateStart(
                                e,
                                cellDateForCreate,
                                hour,
                              );
                            }}
                          >
                            {/* Creation highlight overlay */}
                            {isCreatingInThisCell &&
                              createTimes &&
                              (() => {
                                const startMinutes =
                                  createTimes.start.getHours() * 60 +
                                  createTimes.start.getMinutes();
                                const endMinutes =
                                  createTimes.end.getHours() * 60 +
                                  createTimes.end.getMinutes();
                                const hourStartMinutes = hour * 60;
                                const hourEndMinutes = (hour + 1) * 60;

                                // Check if this hour overlaps with the selection
                                if (
                                  endMinutes <= hourStartMinutes ||
                                  startMinutes >= hourEndMinutes
                                )
                                  return null;

                                const topOffset =
                                  Math.max(
                                    0,
                                    (startMinutes - hourStartMinutes) / 60,
                                  ) * hourHeightWeek;
                                const bottomOffset =
                                  Math.max(
                                    0,
                                    (hourEndMinutes - endMinutes) / 60,
                                  ) * hourHeightWeek;

                                // Only show time label in the first (starting) hour cell
                                const isStartHour =
                                  Math.floor(startMinutes / 60) === hour;

                                return (
                                  <div
                                    className="absolute left-0.5 right-0.5 bg-blue-100 border-l-4 border-blue-500 z-30 pointer-events-none"
                                    style={{
                                      top: `${topOffset}px`,
                                      bottom: `${bottomOffset}px`,
                                    }}
                                  >
                                    {isStartHour && (
                                      <div className="px-2 py-1 text-xs text-blue-700 font-medium">
                                        {`${createTimes.start.getHours().toString().padStart(2, "0")}:${createTimes.start.getMinutes().toString().padStart(2, "0")} - ${createTimes.end.getHours().toString().padStart(2, "0")}:${createTimes.end.getMinutes().toString().padStart(2, "0")}`}
                                      </div>
                                    )}
                                  </div>
                                );
                              })()}
                            {/* Render all timed events with column layout */}
                            {(() => {
                              // Get ALL timed events for this day (not just for this hour)
                              const allDayTimedEvents = getEventsForDate(
                                cellDate,
                              ).filter((e) => !!e.start.dateTime);
                              const eventPositions =
                                getEventPositionsForView(allDayTimedEvents);

                              return dayEvents.map((event) => {
                                const color = getColor(event);
                                const isDragging =
                                  draggingEvent?.id === event.id;

                                const draggedTimes = getDraggedTimesForView(
                                  event,
                                  hourHeightWeek,
                                );
                                const displayStart = draggedTimes
                                  ? draggedTimes.newStart
                                  : new Date(event.start.dateTime!);
                                const displayEnd = draggedTimes
                                  ? draggedTimes.newEnd
                                  : new Date(event.end.dateTime!);

                                const startHour = displayStart.getHours();
                                if (startHour !== hour && !isDragging)
                                  return null;

                                const topOffset = isDragging
                                  ? (displayStart.getHours() - hour) *
                                      hourHeightWeek +
                                    (displayStart.getMinutes() / 60) *
                                      hourHeightWeek
                                  : (displayStart.getMinutes() / 60) *
                                    hourHeightWeek;
                                const duration =
                                  (displayEnd.getTime() -
                                    displayStart.getTime()) /
                                  (1000 * 60);
                                const height = (duration / 60) * hourHeightWeek;

                                // Size categories based on height
                                // hourHeightWeek = 60, so 15min = 15px, 30min = 30px
                                const isTiny = height <= 15; // 15min or less
                                const isSmall = height <= 24; // ~24min or less
                                const isCompact = height <= 36; // ~36min or less

                                const formatDragTime = (d: Date) =>
                                  `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
                                const shortTime = `${displayStart.getHours()}:${displayStart.getMinutes().toString().padStart(2, "0")}`;

                                // Calculate column position
                                const position = eventPositions.get(
                                  event.id,
                                ) || { column: 0, totalColumns: 1 };
                                const columnWidth = 100 / position.totalColumns;
                                const leftPercent =
                                  position.column * columnWidth;

                                return (
                                  <div
                                    key={event.id}
                                    data-event="true"
                                    className={`absolute ${color.bg} ${color.text} ${color.border} border-l-4 rounded-r-lg overflow-hidden select-none
                                    ${isDragging ? "shadow-lg ring-2 ring-blue-400 z-50 opacity-90" : "z-10 hover:shadow-md"}
                                    cursor-grab active:cursor-grabbing
                                    ${isSavingDrag && isDragging ? "pointer-events-none opacity-50" : ""}
                                    ${isTiny ? "text-[9px]" : isSmall ? "text-[10px]" : "text-xs"}`}
                                    style={{
                                      top: `${topOffset}px`,
                                      height: `${Math.max(height, 14)}px`,
                                      left: `calc(${leftPercent}% + 2px)`,
                                      width: `calc(${columnWidth}% - 4px)`,
                                      transition: isDragging
                                        ? "none"
                                        : "box-shadow 0.15s",
                                      ...(color.style
                                        ? {
                                            backgroundColor:
                                              color.style.backgroundColor,
                                            color: color.style.color,
                                            borderLeftColor:
                                              color.style.borderColor,
                                            textDecoration:
                                              color.style.textDecoration,
                                          }
                                        : {}),
                                    }}
                                  >
                                    {!isTiny && (
                                      <div
                                        className="absolute top-0 left-0 right-0 h-2 cursor-ns-resize hover:bg-black/10 z-20"
                                        onMouseDown={(e) =>
                                          handleViewDragStart(
                                            e,
                                            event,
                                            "resize-top",
                                          )
                                        }
                                        onTouchStart={(e) =>
                                          handleViewDragStart(
                                            e,
                                            event,
                                            "resize-top",
                                          )
                                        }
                                      />
                                    )}

                                    <div
                                      className={`h-full flex ${isTiny ? "px-1 items-center" : "px-2 py-1 flex-col"}`}
                                      onMouseDown={(e) =>
                                        handleViewDragStart(e, event, "move")
                                      }
                                      onTouchStart={(e) =>
                                        handleViewDragStart(e, event, "move")
                                      }
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (
                                          !isDragging &&
                                          !clickPreventedRef.current &&
                                          !isSavingDrag
                                        ) {
                                          handleShowEventDetails(event);
                                        }
                                      }}
                                    >
                                      {isTiny ? (
                                        <div className="flex items-center gap-1 w-full min-w-0">
                                          <span className="opacity-75 shrink-0">
                                            {shortTime}
                                          </span>
                                          <span className="font-medium truncate">
                                            {event.summary || "(No title)"}
                                          </span>
                                        </div>
                                      ) : isSmall ? (
                                        <>
                                          <div className="font-semibold truncate leading-tight">
                                            {event.summary || "(No title)"}
                                          </div>
                                          {isDragging ? (
                                            <div className="text-[9px] font-medium opacity-90">
                                              {formatDragTime(displayStart)} -{" "}
                                              {formatDragTime(displayEnd)}
                                            </div>
                                          ) : (
                                            <div className="text-[9px] opacity-75 truncate">
                                              {shortTime}
                                            </div>
                                          )}
                                        </>
                                      ) : (
                                        <>
                                          <div
                                            className={`font-semibold truncate leading-tight ${isCompact ? "text-[11px]" : ""}`}
                                          >
                                            {event.summary || "(No title)"}
                                          </div>
                                          {isDragging ? (
                                            <div className="text-[10px] font-medium opacity-90">
                                              {formatDragTime(displayStart)} -{" "}
                                              {formatDragTime(displayEnd)}
                                            </div>
                                          ) : (
                                            !isCompact && (
                                              <div className="text-[10px] opacity-75 truncate">
                                                {formatTime(event)}
                                              </div>
                                            )
                                          )}
                                        </>
                                      )}
                                    </div>

                                    {!isTiny && (
                                      <div
                                        className="absolute bottom-0 left-0 right-0 h-2 cursor-ns-resize hover:bg-black/10 z-20"
                                        onMouseDown={(e) =>
                                          handleViewDragStart(
                                            e,
                                            event,
                                            "resize-bottom",
                                          )
                                        }
                                        onTouchStart={(e) =>
                                          handleViewDragStart(
                                            e,
                                            event,
                                            "resize-bottom",
                                          )
                                        }
                                      />
                                    )}
                                  </div>
                                );
                              });
                            })()}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {view === "day" && (
            <div className="flex-1 min-h-0 overflow-auto mobile-scroll-pad">
              {/* Day View */}
              <div className="w-full">
                {/* All-day events header */}
                <div className="flex flex-col neu-flat sticky top-0 z-20">
                  {/* All-day events section - always visible */}
                  {(() => {
                    const allDayEvents = getEventsForDate(currentDate).filter(
                      (event) => !!event.start.date,
                    );
                    return (
                      <div className="flex border-b border-slate-200">
                        <div className="w-16 shrink-0 text-xs neu-text-muted text-right pr-2 py-2 flex items-start justify-end">
                          All day
                        </div>
                        <div className="flex-1 border-l border-slate-100 py-2 px-2 min-h-[44px]">
                          {allDayEvents.length > 0 ? (
                            <div className="space-y-1">
                              {allDayEvents.map((event) => {
                                const color = getColor(event);
                                return (
                                  <button
                                    key={event.id}
                                    onClick={() =>
                                      handleShowEventDetails(event)
                                    }
                                    className={`w-full ${color.bg} ${color.text} ${color.border} border-l-4 rounded-r-lg px-3 py-2 text-sm hover:shadow-md transition-shadow text-left`}
                                    style={
                                      color.style
                                        ? {
                                            backgroundColor:
                                              color.style.backgroundColor,
                                            color: color.style.color,
                                            borderLeftColor:
                                              color.style.borderColor,
                                            textDecoration:
                                              color.style.textDecoration,
                                          }
                                        : undefined
                                    }
                                  >
                                    <div className="font-semibold">
                                      {event.summary}
                                    </div>
                                    {event.location && (
                                      <div className="flex items-center gap-1 text-xs opacity-75 mt-1">
                                        <MapPin size={10} />
                                        <span className="truncate">
                                          {event.location}
                                        </span>
                                      </div>
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="text-xs neu-text-muted py-1">
                              No all-day events
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* Time grid */}
                <div className="relative no-select">
                  {Array.from({ length: 24 }).map((_, hour) => {
                    const dateForHour = new Date(currentDate);
                    dateForHour.setHours(hour, 0, 0, 0);

                    const hourEvents = getEventsForDate(currentDate).filter(
                      (event) => {
                        if (!event.start.dateTime) return false;
                        const eventHour = new Date(
                          event.start.dateTime,
                        ).getHours();
                        return eventHour === hour;
                      },
                    );

                    // Check if this hour is part of the creation selection
                    const isCreatingInThisHour =
                      isCreatingView &&
                      createViewDate &&
                      currentDate.toDateString() ===
                        createViewDate.toDateString();
                    const createTimes = getCreateViewTimes();

                    return (
                      <div
                        key={hour}
                        className="flex border-b border-slate-200"
                        style={{ height: "80px" }}
                      >
                        <div className="w-16 shrink-0 text-xs neu-text-muted text-right pr-2 pt-0.5">
                          {hour.toString().padStart(2, "0")}:00
                        </div>
                        <div
                          className={`flex-1 border-l border-slate-200 relative px-1 cursor-crosshair ${isCreatingView ? "touch-none" : ""}`}
                          onMouseDown={(e) => {
                            const cellDateForCreate = new Date(currentDate);
                            cellDateForCreate.setHours(0, 0, 0, 0);
                            handleViewMouseCreateStart(
                              e,
                              cellDateForCreate,
                              hour,
                            );
                          }}
                          onTouchStart={(e) => {
                            // Touch: use long-press detection (allows scrolling)
                            const cellDateForCreate = new Date(currentDate);
                            cellDateForCreate.setHours(0, 0, 0, 0);
                            handleViewTouchCreateStart(
                              e,
                              cellDateForCreate,
                              hour,
                            );
                          }}
                        >
                          {/* Creation highlight overlay */}
                          {isCreatingInThisHour &&
                            createTimes &&
                            (() => {
                              const startMinutes =
                                createTimes.start.getHours() * 60 +
                                createTimes.start.getMinutes();
                              const endMinutes =
                                createTimes.end.getHours() * 60 +
                                createTimes.end.getMinutes();
                              const hourStartMinutes = hour * 60;
                              const hourEndMinutes = (hour + 1) * 60;

                              // Check if this hour overlaps with the selection
                              if (
                                endMinutes <= hourStartMinutes ||
                                startMinutes >= hourEndMinutes
                              )
                                return null;

                              const topOffset =
                                Math.max(
                                  0,
                                  (startMinutes - hourStartMinutes) / 60,
                                ) * hourHeightDay;
                              const bottomOffset =
                                Math.max(
                                  0,
                                  (hourEndMinutes - endMinutes) / 60,
                                ) * hourHeightDay;

                              // Only show time label in the first (starting) hour cell
                              const isStartHour =
                                Math.floor(startMinutes / 60) === hour;

                              return (
                                <div
                                  className="absolute left-0.5 right-0.5 bg-blue-100 border-l-4 border-blue-500 z-30 pointer-events-none"
                                  style={{
                                    top: `${topOffset}px`,
                                    bottom: `${bottomOffset}px`,
                                  }}
                                >
                                  {isStartHour && (
                                    <div className="px-2 py-1 text-xs text-blue-700 font-medium">
                                      {`${createTimes.start.getHours().toString().padStart(2, "0")}:${createTimes.start.getMinutes().toString().padStart(2, "0")} - ${createTimes.end.getHours().toString().padStart(2, "0")}:${createTimes.end.getMinutes().toString().padStart(2, "0")}`}
                                    </div>
                                  )}
                                </div>
                              );
                            })()}
                          {/* Render all timed events with column layout */}
                          {(() => {
                            // Get ALL timed events for this day
                            const allDayTimedEvents = getEventsForDate(
                              currentDate,
                            ).filter((e) => !!e.start.dateTime);
                            const eventPositions =
                              getEventPositionsForView(allDayTimedEvents);

                            return hourEvents.map((event) => {
                              const color = getColor(event);
                              const isDragging = draggingEvent?.id === event.id;

                              const draggedTimes = getDraggedTimesForView(
                                event,
                                hourHeightDay,
                              );
                              const displayStart = draggedTimes
                                ? draggedTimes.newStart
                                : new Date(event.start.dateTime!);
                              const displayEnd = draggedTimes
                                ? draggedTimes.newEnd
                                : new Date(event.end.dateTime!);

                              const startHour = displayStart.getHours();
                              if (startHour !== hour && !isDragging)
                                return null;

                              const topOffset = isDragging
                                ? (displayStart.getHours() - hour) *
                                    hourHeightDay +
                                  (displayStart.getMinutes() / 60) *
                                    hourHeightDay
                                : (displayStart.getMinutes() / 60) *
                                  hourHeightDay;
                              const duration =
                                (displayEnd.getTime() -
                                  displayStart.getTime()) /
                                (1000 * 60);
                              const height = (duration / 60) * hourHeightDay;

                              // Size categories based on height - matching modal style
                              // hourHeightDay = 80, so 15min = 20px, 30min = 40px
                              const isTiny = height <= 20; // 15min or less
                              const isSmall = height <= 32; // ~24min or less
                              const isCompact = height <= 45; // ~34min or less
                              const formatDragTime = (d: Date) =>
                                `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
                              const shortTime = `${displayStart.getHours()}:${displayStart.getMinutes().toString().padStart(2, "0")}`;

                              // Calculate column position
                              const position = eventPositions.get(event.id) || {
                                column: 0,
                                totalColumns: 1,
                              };
                              const columnWidth = 100 / position.totalColumns;
                              const leftPercent = position.column * columnWidth;

                              return (
                                <div
                                  data-event="true"
                                  key={event.id}
                                  className={`absolute ${color.bg} ${color.text} ${color.border} border-l-4 rounded-r-lg overflow-hidden select-none
                                  ${isDragging ? "shadow-lg ring-2 ring-blue-400 z-50 opacity-90" : "z-10 hover:shadow-md"}
                                  cursor-grab active:cursor-grabbing
                                  ${isSavingDrag && isDragging ? "pointer-events-none opacity-50" : ""}
                                  ${isTiny ? "text-[9px]" : isSmall ? "text-[10px]" : "text-xs"}`}
                                  style={{
                                    top: `${topOffset}px`,
                                    height: `${Math.max(height, 16)}px`,
                                    left: `calc(${leftPercent}% + 4px)`,
                                    width: `calc(${columnWidth}% - 8px)`,
                                    transition: isDragging
                                      ? "none"
                                      : "box-shadow 0.15s",
                                    ...(color.style
                                      ? {
                                          backgroundColor:
                                            color.style.backgroundColor,
                                          color: color.style.color,
                                          borderLeftColor:
                                            color.style.borderColor,
                                          textDecoration:
                                            color.style.textDecoration,
                                        }
                                      : {}),
                                  }}
                                >
                                  {!isTiny && (
                                    <div
                                      className="absolute top-0 left-0 right-0 h-2 cursor-ns-resize hover:bg-black/10 z-20"
                                      onMouseDown={(e) =>
                                        handleViewDragStart(
                                          e,
                                          event,
                                          "resize-top",
                                        )
                                      }
                                      onTouchStart={(e) =>
                                        handleViewDragStart(
                                          e,
                                          event,
                                          "resize-top",
                                        )
                                      }
                                    />
                                  )}

                                  <div
                                    className={`h-full flex ${isTiny ? "px-1 items-center" : "px-2 py-1 flex-col"}`}
                                    onMouseDown={(e) =>
                                      handleViewDragStart(e, event, "move")
                                    }
                                    onTouchStart={(e) =>
                                      handleViewDragStart(e, event, "move")
                                    }
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (
                                        !isDragging &&
                                        !clickPreventedRef.current &&
                                        !isSavingDrag
                                      ) {
                                        handleShowEventDetails(event);
                                      }
                                    }}
                                  >
                                    {isTiny ? (
                                      <div className="flex items-center gap-1 w-full min-w-0">
                                        <span className="opacity-75 shrink-0">
                                          {shortTime}
                                        </span>
                                        <span className="font-medium truncate">
                                          {event.summary || "(No title)"}
                                        </span>
                                      </div>
                                    ) : isSmall ? (
                                      <>
                                        <div className="font-semibold truncate leading-tight">
                                          {event.summary || "(No title)"}
                                        </div>
                                        {isDragging ? (
                                          <div className="text-[9px] font-medium opacity-90">
                                            {formatDragTime(displayStart)} -{" "}
                                            {formatDragTime(displayEnd)}
                                          </div>
                                        ) : (
                                          <div className="text-[9px] opacity-75 truncate">
                                            {shortTime}
                                          </div>
                                        )}
                                      </>
                                    ) : (
                                      <>
                                        <div
                                          className={`font-semibold truncate leading-tight ${isCompact ? "text-[11px]" : ""}`}
                                        >
                                          {event.summary || "(No title)"}
                                        </div>
                                        {isDragging ? (
                                          <div className="text-[10px] font-medium opacity-90">
                                            {formatDragTime(displayStart)} -{" "}
                                            {formatDragTime(displayEnd)}
                                          </div>
                                        ) : (
                                          !isCompact && (
                                            <>
                                              <div className="text-[10px] opacity-75 truncate">
                                                {formatDateRange(event)}
                                              </div>
                                              {event.location &&
                                                height >= 60 && (
                                                  <div className="flex items-center gap-1 text-[10px] opacity-75 truncate">
                                                    <MapPin size={8} />
                                                    <span className="truncate">
                                                      {event.location}
                                                    </span>
                                                  </div>
                                                )}
                                            </>
                                          )
                                        )}
                                      </>
                                    )}
                                  </div>

                                  {!isTiny && (
                                    <div
                                      className="absolute bottom-0 left-0 right-0 h-2 cursor-ns-resize hover:bg-black/10 z-20"
                                      onMouseDown={(e) =>
                                        handleViewDragStart(
                                          e,
                                          event,
                                          "resize-bottom",
                                        )
                                      }
                                      onTouchStart={(e) =>
                                        handleViewDragStart(
                                          e,
                                          event,
                                          "resize-bottom",
                                        )
                                      }
                                    />
                                  )}
                                </div>
                              );
                            });
                          })()}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Loading Overlay */}
        {isLoading && (
          <div className="absolute inset-0 bg-white/50 flex items-center justify-center z-30">
            <Loader2 size={32} className="animate-spin neu-text-secondary" />
          </div>
        )}

        {/* Event Details Modal */}
        <EventDetailsModal
          event={selectedEvent}
          calendarId={selectedEvent?.calendarId || selectedCalendarId}
          calendars={calendars}
          onClose={() => {
            setShowDetailsModal(false);
            setSelectedEvent(null);
          }}
          onEdit={handleEditEvent}
          onDeleteClick={(calId, eventId, recurringEventId, startDate) =>
            setDeleteEventData({
              calendarId: calId,
              eventId,
              recurringEventId,
              instanceStartDate: startDate,
            })
          }
          userEmail={user?.email}
          onRSVP={async (calId, eventId, response) => {
            const updatedEvent = await respondToEvent(calId, eventId, response);
            if (updatedEvent) {
              setSelectedEvent({ ...updatedEvent, calendarId: calId });
            }
          }}
          onMoveEvent={async (sourceCalId, eventId, destCalId) => {
            await moveEvent(sourceCalId, eventId, destCalId);
          }}
          onConfirmTentative={async (calId, ev) => {
            const ok = await confirmTentativeEvent(calId, ev);
            if (ok) {
              refresh();
            }
          }}
          tentativeGroupCount={
            selectedEvent
              ? (() => {
                  const gid = getTentativeGroupId(selectedEvent);
                  return gid ? getTentativeGroupEvents(gid).length : undefined;
                })()
              : undefined
          }
        />

        {/* "Add more candidates?" dialog after creating a tentative event */}
        {showTentativeAddMore && (
          <ConfirmDialog
            isOpen={showTentativeAddMore}
            title="別の候補日を追加"
            message="同じ仮押さえグループに別の候補日時を追加しますか？"
            confirmLabel="追加する"
            cancelLabel="完了"
            onConfirm={() => {
              setShowTentativeAddMore(false);
              setEditingEvent(null);
              setShowEventModal(true);
            }}
            onCancel={() => {
              setShowTentativeAddMore(false);
              setTentativeGroupId(null);
            }}
          />
        )}

        {/* Event Form Modal */}
        <EventFormModal
          isOpen={showEventModal}
          onClose={() => {
            setShowEventModal(false);
            setEditingEvent(null);
            setTentativeGroupId(null);
          }}
          onSubmit={handleCreateEvent}
          initialData={editingEvent}
          isLoading={isLoading}
          calendars={calendars}
          selectedCalendarId={selectedCalendarId}
          tentativeGroupId={tentativeGroupId}
          onTentativeCreated={(groupId) => {
            setTentativeGroupId(groupId);
            setShowEventModal(false);
            setShowTentativeAddMore(true);
          }}
        />

        {/* Tentative batch mode banner */}
        {tentativeBatch.isActive && (
          <div className="bg-pink-50 border-b border-pink-200 px-3 py-2 flex items-center justify-between">
            <span className="text-sm text-pink-700 font-medium">
              仮押さえモード: カレンダーをタップして候補日時を選択
            </span>
            <span className="text-xs text-pink-500">
              {tentativeBatch.selectedSlots.length}件選択中
            </span>
          </div>
        )}

        {/* Tentative batch panel */}
        <TentativeBatchPanel
          isActive={tentativeBatch.isActive}
          onClose={tentativeBatch.deactivate}
          selectedSlots={tentativeBatch.selectedSlots}
          onRemoveSlot={tentativeBatch.removeSlot}
          onClearSlots={tentativeBatch.clearSlots}
          onUpdateSlotTime={tentativeBatch.updateSlotTime}
          onSubmit={tentativeBatch.createBatchEvents}
          isCreating={tentativeBatch.isCreating}
          defaultDuration={tentativeBatch.defaultDuration}
          onSetDuration={tentativeBatch.setDefaultDuration}
          selectedCalendarId={selectedCalendarId}
        />

        {/* Day Schedule Modal */}
        {showDayModal && (
          <DayScheduleModal
            date={selectedModalDate}
            events={filteredEvents}
            onClose={() => {
              setShowDayModal(false);
              setSelectedModalDate(null);
            }}
            onEventClick={(event) => {
              setShowDayModal(false);
              handleShowEventDetails(event);
            }}
            onEventTimeChange={async (event, newStart, newEnd) => {
              const calendarId = event.calendarId || selectedCalendarId;
              await updateEvent(calendarId, event.id, {
                start: { dateTime: newStart.toISOString() },
                end: { dateTime: newEnd.toISOString() },
              });
            }}
            onCreateEvent={(start, end) => {
              if (tentativeBatch.isActive) {
                tentativeBatch.addSlotFromDateRange(start, end);
              } else {
                setShowDayModal(false);
                setEditingEvent({
                  id: "",
                  summary: "",
                  start: { dateTime: start.toISOString() },
                  end: { dateTime: end.toISOString() },
                } as CalendarEvent);
                setShowEventModal(true);
              }
            }}
          />
        )}

        {/* Scheduling Modal */}
        {showSchedulingModal && (
          <SchedulingModal
            events={filteredEvents}
            onClose={() => setShowSchedulingModal(false)}
          />
        )}

        {/* Delete Event Confirmation */}
        {deleteEventData?.recurringEventId ? (
          <RecurringDeleteModal
            isOpen={deleteEventData !== null}
            onClose={() => setDeleteEventData(null)}
            onDelete={async (mode) => {
              if (deleteEventData) {
                await deleteEvent(
                  deleteEventData.calendarId,
                  deleteEventData.eventId,
                  mode,
                  deleteEventData.recurringEventId,
                  deleteEventData.instanceStartDate,
                );
                setDeleteEventData(null);
              }
            }}
          />
        ) : (
          <ConfirmDialog
            isOpen={deleteEventData !== null}
            title="Delete Event"
            message="Are you sure you want to delete this event? This action cannot be undone."
            confirmLabel="Delete"
            onConfirm={async () => {
              if (deleteEventData) {
                await deleteEvent(
                  deleteEventData.calendarId,
                  deleteEventData.eventId,
                );
                setDeleteEventData(null);
              }
            }}
            onCancel={() => setDeleteEventData(null)}
          />
        )}

        {/* Recurring Edit Mode Selection */}
        <RecurringEditModal
          isOpen={recurringEditPending !== null}
          onClose={() => {
            setRecurringEditPending(null);
            setEditingEvent(null);
          }}
          onSelect={handleRecurringEditSelect}
        />

        {/* Free/Busy Modal (Cal-5) */}
        {showFreeBusyModal &&
          (() => {
            const FreeBusyContent = () => {
              const [emails, setFbEmails] = useState<string[]>([]);
              const [emailInput, setEmailInput] = useState("");
              const [fbStart, setFbStart] = useState(
                new Date().toISOString().split("T")[0],
              );
              const [fbEnd, setFbEnd] = useState(
                new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0],
              );
              const [fbResults, setFbResults] = useState<Record<
                string,
                { busy: { start: string; end: string }[] }
              > | null>(null);
              const [fbLoading, setFbLoading] = useState(false);

              const handleCheck = async () => {
                if (emails.length === 0) return;
                setFbLoading(true);
                const result = await queryFreeBusy({
                  timeMin: new Date(`${fbStart}T00:00:00`).toISOString(),
                  timeMax: new Date(`${fbEnd}T23:59:59`).toISOString(),
                  items: emails.map((id) => ({ id })),
                });
                setFbResults(result);
                setFbLoading(false);
              };

              return (
                <div
                  className="fixed inset-0 z-[60] bg-black/50 px-4 overflow-y-auto overscroll-contain flex justify-center"
                  style={{
                    paddingTop: "calc(4rem + env(safe-area-inset-top, 0px))",
                    paddingBottom:
                      "calc(4rem + env(safe-area-inset-bottom, 0px))",
                  }}
                  onClick={(e) => {
                    if (e.target === e.currentTarget)
                      setShowFreeBusyModal(false);
                  }}
                >
                  <div className="neu-modal w-full max-w-[calc(100vw-2rem)] md:max-w-xl max-h-[70svh] md:max-h-[calc(100dvh-8rem)] overflow-y-auto overscroll-contain p-5 my-auto">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold neu-text-primary">
                        Free/Busy Check
                      </h3>
                      <button
                        onClick={() => setShowFreeBusyModal(false)}
                        className="p-1.5 neu-btn rounded-lg"
                      >
                        <X size={18} />
                      </button>
                    </div>

                    <div className="space-y-3">
                      <div className="flex gap-2">
                        <EmailInput
                          value={emailInput}
                          onChange={setEmailInput}
                          onKeyDown={(e) => {
                            if (
                              e.key === "Enter" &&
                              !e.nativeEvent.isComposing &&
                              emailInput.trim()
                            ) {
                              e.preventDefault();
                              setFbEmails([...emails, emailInput.trim()]);
                              setEmailInput("");
                            }
                          }}
                          placeholder="Add email address"
                          className="flex-1"
                          showValidation={false}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            if (emailInput.trim()) {
                              setFbEmails([...emails, emailInput.trim()]);
                              setEmailInput("");
                            }
                          }}
                          className="px-3 py-2 neu-btn rounded-lg"
                        >
                          <Plus size={16} />
                        </button>
                      </div>

                      {emails.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {emails.map((email, i) => (
                            <span
                              key={i}
                              className="inline-flex items-center gap-1 px-2 py-1 neu-chip-active rounded-full text-xs"
                            >
                              {email}
                              <button
                                onClick={() =>
                                  setFbEmails(
                                    emails.filter((_, idx) => idx !== i),
                                  )
                                }
                              >
                                <X size={10} />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <DatePicker
                            label="From"
                            value={fbStart}
                            onChange={setFbStart}
                          />
                        </div>
                        <div>
                          <DatePicker
                            label="To"
                            value={fbEnd}
                            onChange={setFbEnd}
                          />
                        </div>
                      </div>

                      <button
                        onClick={handleCheck}
                        disabled={emails.length === 0 || fbLoading}
                        className="w-full px-4 py-2 bg-sky-600 text-white rounded-lg hover:bg-sky-500 disabled:opacity-50 transition-colors text-sm font-medium flex items-center justify-center gap-2"
                      >
                        {fbLoading && (
                          <Loader2 size={14} className="animate-spin" />
                        )}
                        Check Availability
                      </button>

                      {fbResults && (
                        <div className="space-y-3 pt-3 border-t border-slate-200">
                          {Object.entries(fbResults).map(([email, data]) => (
                            <div key={email}>
                              <div className="text-sm font-medium text-slate-700 mb-1">
                                {email}
                              </div>
                              {data.busy.length === 0 ? (
                                <div className="text-xs text-green-600">
                                  Free during this period
                                </div>
                              ) : (
                                <div className="space-y-1">
                                  {data.busy.map((slot, i) => (
                                    <div
                                      key={i}
                                      className="text-xs bg-red-50 text-red-700 px-2 py-1 rounded"
                                    >
                                      Busy:{" "}
                                      {new Date(slot.start).toLocaleString()} -{" "}
                                      {new Date(slot.end).toLocaleString()}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            };
            return <FreeBusyContent />;
          })()}

        {/* Calendar Settings Modal (Cal-10) */}
        {showCalSettingsModal && (
          <div
            className="fixed inset-0 z-[60] bg-black/50 px-4 overflow-y-auto overscroll-contain flex justify-center"
            style={{
              paddingTop: "calc(4rem + env(safe-area-inset-top, 0px))",
              paddingBottom: "calc(4rem + env(safe-area-inset-bottom, 0px))",
            }}
            onClick={(e) => {
              if (e.target === e.currentTarget) setShowCalSettingsModal(false);
            }}
          >
            <div className="neu-modal w-full max-w-[calc(100vw-2rem)] md:max-w-lg p-5 my-auto">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold neu-text-primary">
                  Calendar Settings
                </h3>
                <button
                  onClick={() => setShowCalSettingsModal(false)}
                  className="p-1.5 neu-btn rounded-lg"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="space-y-3">
                {[
                  { key: "timezone", label: "Timezone" },
                  { key: "weekStart", label: "Week Start" },
                  { key: "defaultEventLength", label: "Default Event Length" },
                  { key: "format24HourTime", label: "24-Hour Format" },
                  { key: "showDeclinedEvents", label: "Show Declined Events" },
                ].map(({ key, label }) => (
                  <div
                    key={key}
                    className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0"
                  >
                    <span className="text-sm neu-text-secondary">{label}</span>
                    <span className="text-sm font-medium neu-text-primary">
                      {calSettings[key] || "—"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Calendar Share Modal (Cal-9) */}
        {showShareModal &&
          shareCalendarId &&
          (() => {
            const ShareContent = () => {
              return (
                <div
                  className="fixed inset-0 z-[60] bg-black/50 px-4 overflow-y-auto overscroll-contain flex justify-center"
                  style={{
                    paddingTop: "calc(4rem + env(safe-area-inset-top, 0px))",
                    paddingBottom:
                      "calc(4rem + env(safe-area-inset-bottom, 0px))",
                  }}
                  onClick={(e) => {
                    if (e.target === e.currentTarget) {
                      setShowShareModal(false);
                      setShareCalendarId(null);
                    }
                  }}
                >
                  <div className="neu-modal w-full max-w-[calc(100vw-2rem)] md:max-w-lg max-h-[70svh] md:max-h-[calc(100dvh-8rem)] overflow-y-auto overscroll-contain p-5 my-auto">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold neu-text-primary">
                        Share Calendar
                      </h3>
                      <button
                        onClick={() => {
                          setShowShareModal(false);
                          setShareCalendarId(null);
                        }}
                        className="p-1.5 neu-btn rounded-lg"
                      >
                        <X size={18} />
                      </button>
                    </div>

                    <div className="space-y-3">
                      <div className="flex gap-2">
                        <EmailInput
                          value={shareEmail}
                          onChange={setShareEmail}
                          placeholder="Email address"
                          className="flex-1"
                          showValidation={false}
                        />
                        <select
                          value={shareRole}
                          onChange={(e) =>
                            setShareRole(
                              e.target.value as "reader" | "writer" | "owner",
                            )
                          }
                          className="text-sm neu-input rounded-lg px-2 py-2 w-24"
                        >
                          <option value="reader">Reader</option>
                          <option value="writer">Writer</option>
                          <option value="owner">Owner</option>
                        </select>
                        <button
                          onClick={async () => {
                            if (!shareEmail.trim()) return;
                            const ok = await addCalendarAcl(
                              shareCalendarId,
                              shareEmail.trim(),
                              shareRole,
                            );
                            if (ok) {
                              setShareEmail("");
                              const rules =
                                await getCalendarAcl(shareCalendarId);
                              setAclRules(rules);
                            }
                          }}
                          className="px-3 py-2 bg-sky-600 text-white rounded-lg hover:bg-sky-500 transition-colors"
                        >
                          <UserPlus size={16} />
                        </button>
                      </div>

                      <div className="space-y-2 pt-3 border-t border-slate-200">
                        {aclRules.map((rule) => (
                          <div
                            key={rule.id}
                            className="flex items-center justify-between text-sm py-1.5"
                          >
                            <div>
                              <div className="text-slate-700">
                                {rule.scope.value}
                              </div>
                              <div className="text-xs neu-text-secondary capitalize">
                                {rule.role}
                              </div>
                            </div>
                            {rule.scope.type === "user" && (
                              <button
                                onClick={async () => {
                                  const ok = await removeCalendarAcl(
                                    shareCalendarId,
                                    rule.id,
                                  );
                                  if (ok) {
                                    setAclRules(
                                      aclRules.filter((r) => r.id !== rule.id),
                                    );
                                  }
                                }}
                                className="p-1 text-red-500 hover:bg-red-50 rounded transition-colors"
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              );
            };
            return <ShareContent />;
          })()}

        {/* Delete Calendar Confirm (Cal-8) */}
        <ConfirmDialog
          isOpen={deleteCalendarConfirm !== null}
          title="Delete Calendar"
          message="Are you sure you want to delete this calendar? All events will be removed. This action cannot be undone."
          confirmLabel="Delete"
          onConfirm={async () => {
            if (deleteCalendarConfirm) {
              await deleteCalendar(deleteCalendarConfirm);
              setSelectedCalendarIds((prev: string[]) =>
                prev.filter((id: string) => id !== deleteCalendarConfirm),
              );
              setDeleteCalendarConfirm(null);
            }
          }}
          onCancel={() => setDeleteCalendarConfirm(null)}
        />
      </div>
    </Layout>
  );
};
