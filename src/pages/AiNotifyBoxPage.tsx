import { useState, useMemo, useEffect } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { emojify } from "node-emoji";
import {
  Bell,
  Check,
  CheckCheck,
  Trash2,
  Settings,
  RefreshCw,
  Filter,
  Search,
  AlertTriangle,
  AlertCircle,
  Info,
  ChevronDown,
  Tag,
  ArrowLeft,
  X,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  CalendarPlus,
  MapPin,
  Loader2,
  Clock,
} from "lucide-react";
import { Layout, ConfirmDialog } from "../components";
import { useAiNotifications } from "../hooks/useAiNotifications";
import { useGoogleCalendar } from "../hooks/useGoogleCalendar";
import type { CreateEventInput } from "../hooks/useGoogleCalendar";
import { useUserSetting } from "../hooks/useUserSetting";
import { formatRelativeTime } from "../lib/formatters";
import { CATEGORY_COLORS } from "../lib/notificationConstants";
import type {
  NotificationSource,
  NotificationPriority,
  AiNotification,
  AiNotificationCategory,
} from "../types";

type DateRange = "all" | "today" | "week" | "month" | "3months";

type NotifyBoxFilters = {
  source: NotificationSource | "all";
  priority: NotificationPriority | "all";
  category: string | "all";
  unreadOnly: boolean;
  dateRange: DateRange;
};

const DEFAULT_FILTERS: NotifyBoxFilters = {
  source: "all",
  priority: "all",
  category: "all",
  unreadOnly: false,
  dateRange: "all",
};

const DATE_RANGE_OPTIONS: { value: DateRange; label: string }[] = [
  { value: "all", label: "All time" },
  { value: "today", label: "Today" },
  { value: "week", label: "This week" },
  { value: "month", label: "This month" },
  { value: "3months", label: "3 months" },
];

const PRIORITY_CONFIG: Record<
  NotificationPriority,
  { label: string; color: string; icon: typeof AlertCircle }
> = {
  urgent: {
    label: "Urgent",
    color: "text-red-600 bg-red-50",
    icon: AlertTriangle,
  },
  high: {
    label: "High",
    color: "text-orange-600 bg-orange-50",
    icon: AlertCircle,
  },
  medium: { label: "Medium", color: "text-blue-600 bg-blue-50", icon: Info },
  low: { label: "Low", color: "text-slate-500 bg-slate-50", icon: Info },
};

const SOURCE_CONFIG: Record<
  NotificationSource,
  { label: string; color: string }
> = {
  automation: { label: "Automation", color: "bg-emerald-100 text-emerald-700" },
  webhook: { label: "Webhook", color: "bg-purple-100 text-purple-700" },
  system: { label: "AI Agent", color: "bg-indigo-100 text-indigo-700" },
};

// Sources displayed in the AI Notify Box
const VISIBLE_SOURCES: NotificationSource[] = ["automation", "system"];

// Slack固有の絵文字名を標準的な絵文字名にマッピング
const SLACK_EMOJI_ALIASES: Record<string, string> = {
  robot_face: "robot",
  slightly_smiling_face: "slightly_smiling_face",
  thinking_face: "thinking",
  face_with_monocle: "monocle_face",
  nerd_face: "nerd_face",
  partying_face: "partying_face",
  star_struck: "star_struck",
  exploding_head: "exploding_head",
  face_with_rolling_eyes: "rolling_eyes",
  zipper_mouth_face: "zipper_mouth",
  money_mouth_face: "money_mouth_face",
  hugging_face: "hugs",
  face_with_hand_over_mouth: "hand_over_mouth",
  shushing_face: "shushing_face",
  face_with_raised_eyebrow: "raised_eyebrow",
  neutral_face: "neutral_face",
  expressionless_face: "expressionless",
  face_without_mouth: "no_mouth",
  smirking_face: "smirk",
  unamused_face: "unamused",
  face_with_rolling_eyes_face: "roll_eyes",
  grimacing_face: "grimacing",
  lying_face: "lying_face",
  relieved_face: "relieved",
  pensive_face: "pensive",
  sleepy_face: "sleepy",
  drooling_face: "drooling_face",
  sleeping_face: "sleeping",
  face_with_medical_mask: "mask",
  face_with_thermometer: "face_with_thermometer",
  face_with_head_bandage: "face_with_head_bandage",
  nauseated_face: "nauseated_face",
  sneezing_face: "sneezing_face",
  hot_face: "hot_face",
  cold_face: "cold_face",
  woozy_face: "woozy_face",
  dizzy_face: "dizzy_face",
  // よく使うアイコン
  memo: "memo",
  clipboard: "clipboard",
  pushpin: "pushpin",
  round_pushpin: "round_pushpin",
  triangular_flag_on_post: "triangular_flag_on_post",
  white_check_mark: "white_check_mark",
  ballot_box_with_check: "ballot_box_with_check",
};

// Slack絵文字を標準絵文字に変換してからemojifyする
const emojifySlack = (text: string): string => {
  // まずSlack固有の絵文字名を標準名に変換
  let converted = text;
  for (const [slackName, standardName] of Object.entries(SLACK_EMOJI_ALIASES)) {
    converted = converted.replace(
      new RegExp(`:${slackName}:`, "g"),
      `:${standardName}:`,
    );
  }
  // 次にnode-emojiで変換
  return emojify(converted);
};

const NotificationCard = ({
  notification,
  categories,
  onMarkAsRead,
  onDelete,
  onChangeCategory,
  onCardClick,
}: {
  notification: AiNotification;
  categories: AiNotificationCategory[];
  onMarkAsRead: (id: string) => void;
  onDelete: (id: string) => void;
  onChangeCategory: (id: string, categoryId: string | null) => void;
  onCardClick: (notification: AiNotification) => void;
}) => {
  const [showCategoryMenu, setShowCategoryMenu] = useState(false);
  const priorityConfig = PRIORITY_CONFIG[notification.priority];
  const sourceConfig = SOURCE_CONFIG[notification.source] ?? {
    label: notification.source,
    color: "bg-slate-100 text-slate-700",
  };
  const PriorityIcon = priorityConfig.icon;
  const category = categories.find((c) => c.id === notification.categoryId);

  return (
    <div
      className={`p-4 rounded-2xl transition-all cursor-pointer ${
        notification.isRead
          ? "neu-card neu-card-hover"
          : "neu-card neu-card-hover bg-amber-50/30"
      }`}
      onClick={() => onCardClick(notification)}
    >
      <div className="flex items-start gap-3">
        <div className={`p-2 rounded-lg ${priorityConfig.color}`}>
          <PriorityIcon size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-medium ${sourceConfig.color}`}
            >
              {sourceConfig.label}
            </span>
            {category && (
              <span
                className="text-xs px-2 py-0.5 rounded-full font-medium text-white"
                style={{
                  backgroundColor: CATEGORY_COLORS[category.color] || "#64748b",
                }}
              >
                {category.name}
              </span>
            )}
            <span className="text-xs neu-text-muted">
              {formatRelativeTime(notification.createdAt)}
            </span>
            {!notification.isRead && (
              <span className="w-2 h-2 bg-amber-500 rounded-full" />
            )}
          </div>
          <h4 className="font-medium neu-text-primary truncate">
            {emojifySlack(notification.title)}
          </h4>
          <p className="text-sm text-slate-600 mt-1 line-clamp-2">
            {emojifySlack(notification.body)}
          </p>
        </div>
        <div
          className="flex flex-col sm:flex-row items-center gap-1"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="relative">
            <button
              onClick={() => setShowCategoryMenu(!showCategoryMenu)}
              className="p-1.5 neu-text-muted hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
              title="Change category"
            >
              <Tag size={16} />
            </button>
            {showCategoryMenu && (
              <div className="absolute right-0 top-full mt-1 w-40 max-w-[calc(100vw-2rem)] neu-card z-20 py-1">
                <button
                  onClick={() => {
                    onChangeCategory(notification.id, null);
                    setShowCategoryMenu(false);
                  }}
                  className={`w-full text-left px-3 py-1.5 text-sm hover:neu-bg ${
                    !notification.categoryId
                      ? "text-amber-600 font-medium"
                      : "neu-text-secondary"
                  }`}
                >
                  None
                </button>
                {categories.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => {
                      onChangeCategory(notification.id, cat.id);
                      setShowCategoryMenu(false);
                    }}
                    className={`w-full text-left px-3 py-1.5 text-sm hover:neu-bg flex items-center gap-2 ${
                      notification.categoryId === cat.id
                        ? "text-amber-600 font-medium"
                        : "neu-text-secondary"
                    }`}
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-full"
                      style={{
                        backgroundColor:
                          CATEGORY_COLORS[cat.color] || "#64748b",
                      }}
                    />
                    {cat.name}
                  </button>
                ))}
              </div>
            )}
          </div>
          {!notification.isRead && (
            <button
              onClick={() => onMarkAsRead(notification.id)}
              className="p-1.5 neu-text-muted hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
              title="Mark as read"
            >
              <Check size={16} />
            </button>
          )}
          <button
            onClick={() => onDelete(notification.id)}
            className="p-1.5 neu-text-muted hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            title="Delete"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};

export const AiNotifyBoxPage = () => {
  const navigate = useNavigate();
  const {
    notifications,
    categories,
    isLoading,
    isSyncing,
    unreadCount,
    refresh,
    markAsRead,
    markAllAsRead,
    removeNotification,
    updateNotificationCategory,
  } = useAiNotifications();

  const { value: rawFilters, setValue: setFilters } =
    useUserSetting<NotifyBoxFilters>("ai_notify_box_filters", DEFAULT_FILTERS);

  // Merge with defaults to handle missing fields from older saved settings
  const filters = { ...DEFAULT_FILTERS, ...rawFilters };

  const setFilterSource = (source: NotificationSource | "all") => {
    setFilters({ ...filters, source });
  };
  const setFilterPriority = (priority: NotificationPriority | "all") => {
    setFilters({ ...filters, priority });
  };
  const setFilterCategory = (category: string | "all") => {
    setFilters({ ...filters, category });
  };
  const setShowUnreadOnly = (unreadOnly: boolean) => {
    setFilters({ ...filters, unreadOnly });
  };
  const setDateRange = (dateRange: DateRange) => {
    setFilters({ ...filters, dateRange });
  };

  const filterSource = filters.source;
  const filterPriority = filters.priority;
  const filterCategory = filters.category;
  const showUnreadOnly = filters.unreadOnly;
  const dateRange = filters.dateRange;

  const [searchQuery, setSearchQuery] = useState("");
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [deleteNotificationId, setDeleteNotificationId] = useState<
    string | null
  >(null);
  const [selectedNotification, setSelectedNotification] =
    useState<AiNotification | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 20;
  const { createEvent, calendars } = useGoogleCalendar();
  const [addingEventIdx, setAddingEventIdx] = useState<number | null>(null);
  const [addedEventIdxs, setAddedEventIdxs] = useState<Set<number>>(new Set());

  const handleAddEventToCalendar = async (
    event: {
      title: string;
      description?: string;
      startDate: string;
      endDate?: string;
      location?: string;
      url?: string;
    },
    idx: number,
  ) => {
    const primaryCalendar = calendars.find((c) => c.primary) || calendars[0];
    if (!primaryCalendar) return;

    setAddingEventIdx(idx);
    try {
      const isAllDay = !event.startDate.includes("T");
      const eventInput: CreateEventInput = {
        summary: event.title,
        description: [
          event.description || "",
          event.url ? `\nLink: ${event.url}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
        location: event.location,
        start: isAllDay
          ? { date: event.startDate }
          : { dateTime: new Date(event.startDate).toISOString() },
        end: isAllDay
          ? { date: event.endDate || event.startDate }
          : {
              dateTime: new Date(
                event.endDate || event.startDate,
              ).toISOString(),
            },
      };
      await createEvent(primaryCalendar.id, eventInput);
      setAddedEventIdxs((prev) => new Set(prev).add(idx));
    } catch (err) {
      console.error("Failed to add event to calendar:", err);
    } finally {
      setAddingEventIdx(null);
    }
  };

  const handleCardClick = (notification: AiNotification) => {
    setSelectedNotification(notification);
    if (!notification.isRead) {
      markAsRead(notification.id);
    }
  };

  const filteredNotifications = useMemo(() => {
    // Only show automation and system sources
    let filtered = notifications.filter((n) =>
      VISIBLE_SOURCES.includes(n.source),
    );
    if (filterSource !== "all") {
      filtered = filtered.filter((n) => n.source === filterSource);
    }
    if (filterPriority !== "all") {
      filtered = filtered.filter((n) => n.priority === filterPriority);
    }
    if (filterCategory !== "all") {
      filtered = filtered.filter(
        (n) =>
          n.categoryId === (filterCategory === "none" ? null : filterCategory),
      );
    }
    if (showUnreadOnly) {
      filtered = filtered.filter((n) => !n.isRead);
    }
    // Date range filter
    if (dateRange !== "all") {
      const now = new Date();
      let cutoff: Date;
      switch (dateRange) {
        case "today":
          cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          break;
        case "week":
          cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case "month":
          cutoff = new Date(now.getFullYear(), now.getMonth(), 1);
          break;
        case "3months":
          cutoff = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
          break;
      }
      filtered = filtered.filter((n) =>
        n.createdAt
          ? new Date(n.createdAt).getTime() >= cutoff.getTime()
          : false,
      );
    }
    // Text search
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      filtered = filtered.filter(
        (n) =>
          n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q),
      );
    }
    return filtered;
  }, [
    notifications,
    filterSource,
    filterPriority,
    filterCategory,
    showUnreadOnly,
    dateRange,
    searchQuery,
  ]);

  // ページネーション計算
  const totalPages = Math.ceil(filteredNotifications.length / ITEMS_PER_PAGE);
  const paginatedNotifications = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredNotifications.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredNotifications, currentPage]);

  // フィルター変更時にページをリセット
  useEffect(() => {
    setCurrentPage(1);
  }, [
    filterSource,
    filterPriority,
    filterCategory,
    showUnreadOnly,
    dateRange,
    searchQuery,
  ]);

  const headerLeft = (
    <div className="flex items-center gap-0.5 md:gap-1">
      <button
        onClick={() => navigate("/ai")}
        className="p-1.5 md:p-2 neu-btn neu-text-secondary hover:neu-text-primary rounded-lg transition-colors"
        title="Back to AI"
      >
        <ArrowLeft size={16} className="md:w-[18px] md:h-[18px]" />
      </button>
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
    </div>
  );

  const headerRight = (
    <Link
      to="/settings"
      className="p-1.5 md:p-2 neu-text-secondary hover:neu-text-primary neu-btn rounded-lg transition-colors"
      title="Settings"
    >
      <Settings size={16} className="md:w-[18px] md:h-[18px]" />
    </Link>
  );

  return (
    <Layout
      pageTitle="AI Notify Box"
      headerLeft={headerLeft}
      headerRight={headerRight}
    >
      <div className="h-full overflow-auto neu-bg mobile-scroll-pad">
        <main className="max-w-5xl mx-auto px-4 py-4 md:py-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-4 md:mb-6">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 shadow">
                <Bell className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold neu-text-primary">
                  AI Notify Box
                </h1>
                <p className="text-sm neu-text-secondary">
                  {unreadCount > 0
                    ? `${unreadCount} unread`
                    : "No unread notifications"}
                </p>
              </div>
            </div>
          </div>

          {/* Search Bar */}
          <div className="relative mb-3">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 neu-text-muted pointer-events-none"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search notifications..."
              className="w-full pl-9 pr-8 py-2.5 text-sm neu-input rounded-xl"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 neu-text-muted hover:neu-text-secondary rounded transition-colors"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Date Range + Filter Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
            <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide">
              {/* Date range chips */}
              <div className="flex items-center gap-1 shrink-0">
                <Clock size={14} className="neu-text-muted shrink-0" />
                {DATE_RANGE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setDateRange(opt.value)}
                    className={`shrink-0 px-2.5 py-1 text-xs rounded-lg transition-all ${
                      dateRange === opt.value
                        ? "bg-amber-100 text-amber-700 font-medium"
                        : "neu-text-muted hover:neu-text-secondary hover:bg-slate-100"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              <div className="w-px h-5 bg-slate-200 shrink-0 hidden sm:block" />

              {/* Filter dropdown */}
              <div className="relative shrink-0">
                <button
                  onClick={() => setShowFilterMenu(!showFilterMenu)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-lg transition-colors ${
                    filterSource !== "all" ||
                    filterPriority !== "all" ||
                    filterCategory !== "all" ||
                    showUnreadOnly
                      ? "bg-sky-100 text-sky-700 font-medium"
                      : "neu-text-muted hover:neu-text-secondary hover:bg-slate-100"
                  }`}
                >
                  <Filter size={13} />
                  Filter
                  <ChevronDown size={12} />
                </button>
                {showFilterMenu && (
                  <div className="absolute top-full left-0 mt-1 w-[calc(100vw-2rem)] sm:w-64 max-w-64 neu-card z-10 p-3">
                    <div className="mb-3">
                      <label
                        className="text-xs font-medium neu-text-secondary mb-1 block"
                        id="filter-source-label"
                      >
                        Source
                      </label>
                      <select
                        value={filterSource}
                        onChange={(e) =>
                          setFilterSource(
                            e.target.value as NotificationSource | "all",
                          )
                        }
                        className="w-full px-2 py-1.5 text-sm neu-input rounded-lg"
                        aria-labelledby="filter-source-label"
                      >
                        <option value="all">All</option>
                        {VISIBLE_SOURCES.map((src) => (
                          <option key={src} value={src}>
                            {SOURCE_CONFIG[src]?.label ?? src}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="mb-3">
                      <label
                        className="text-xs font-medium neu-text-secondary mb-1 block"
                        id="filter-priority-label"
                      >
                        Priority
                      </label>
                      <select
                        value={filterPriority}
                        onChange={(e) =>
                          setFilterPriority(
                            e.target.value as NotificationPriority | "all",
                          )
                        }
                        className="w-full px-2 py-1.5 text-sm neu-input rounded-lg"
                        aria-labelledby="filter-priority-label"
                      >
                        <option value="all">All</option>
                        <option value="urgent">Urgent</option>
                        <option value="high">High</option>
                        <option value="medium">Medium</option>
                        <option value="low">Low</option>
                      </select>
                    </div>
                    <div className="mb-3">
                      <label
                        className="text-xs font-medium neu-text-secondary mb-1 block"
                        id="filter-category-label"
                      >
                        Category
                      </label>
                      <select
                        value={filterCategory}
                        onChange={(e) => setFilterCategory(e.target.value)}
                        className="w-full px-2 py-1.5 text-sm neu-input rounded-lg"
                        aria-labelledby="filter-category-label"
                      >
                        <option value="all">All</option>
                        <option value="none">No category</option>
                        {categories.map((cat) => (
                          <option key={cat.id} value={cat.id}>
                            {cat.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={showUnreadOnly}
                        onChange={(e) => setShowUnreadOnly(e.target.checked)}
                        className="rounded border-slate-300"
                      />
                      Show unread only
                    </label>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {/* Result count */}
              <span className="text-xs neu-text-muted">
                {filteredNotifications.length} results
              </span>
              {unreadCount > 0 && (
                <button
                  onClick={markAllAsRead}
                  className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                >
                  <CheckCheck size={14} />
                  All read
                </button>
              )}
            </div>
          </div>

          {/* Active filter tags */}
          {(filterSource !== "all" ||
            filterPriority !== "all" ||
            filterCategory !== "all" ||
            showUnreadOnly ||
            searchQuery) && (
            <div className="flex items-center gap-1.5 flex-wrap mb-3">
              {searchQuery && (
                <span className="flex items-center gap-1 text-xs px-2 py-1 bg-slate-100 text-slate-600 rounded-full">
                  <Search size={11} />
                  &quot;{searchQuery}&quot;
                  <button
                    onClick={() => setSearchQuery("")}
                    className="ml-0.5 hover:text-slate-900"
                  >
                    <X size={11} />
                  </button>
                </span>
              )}
              {filterSource !== "all" && (
                <span className="flex items-center gap-1 text-xs px-2 py-1 bg-emerald-50 text-emerald-700 rounded-full">
                  {SOURCE_CONFIG[filterSource]?.label}
                  <button
                    onClick={() => setFilterSource("all")}
                    className="ml-0.5 hover:text-emerald-900"
                  >
                    <X size={11} />
                  </button>
                </span>
              )}
              {filterPriority !== "all" && (
                <span className="flex items-center gap-1 text-xs px-2 py-1 bg-blue-50 text-blue-700 rounded-full">
                  {PRIORITY_CONFIG[filterPriority]?.label}
                  <button
                    onClick={() => setFilterPriority("all")}
                    className="ml-0.5 hover:text-blue-900"
                  >
                    <X size={11} />
                  </button>
                </span>
              )}
              {filterCategory !== "all" && (
                <span className="flex items-center gap-1 text-xs px-2 py-1 bg-purple-50 text-purple-700 rounded-full">
                  {filterCategory === "none"
                    ? "No category"
                    : (categories.find((c) => c.id === filterCategory)?.name ??
                      filterCategory)}
                  <button
                    onClick={() => setFilterCategory("all")}
                    className="ml-0.5 hover:text-purple-900"
                  >
                    <X size={11} />
                  </button>
                </span>
              )}
              {showUnreadOnly && (
                <span className="flex items-center gap-1 text-xs px-2 py-1 bg-amber-50 text-amber-700 rounded-full">
                  Unread only
                  <button
                    onClick={() => setShowUnreadOnly(false)}
                    className="ml-0.5 hover:text-amber-900"
                  >
                    <X size={11} />
                  </button>
                </span>
              )}
              <button
                onClick={() => {
                  setSearchQuery("");
                  setFilters(DEFAULT_FILTERS);
                }}
                className="text-xs text-slate-500 hover:text-slate-700 px-1.5 py-1 transition-colors"
              >
                Clear all
              </button>
            </div>
          )}

          {/* Notifications List */}
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="animate-spin neu-text-muted" size={24} />
            </div>
          ) : filteredNotifications.length === 0 ? (
            <div className="text-center py-12">
              <Bell className="mx-auto neu-text-muted mb-3" size={48} />
              <p className="neu-text-secondary">No notifications</p>
            </div>
          ) : (
            <>
              <div className="space-y-3">
                {paginatedNotifications.map((notification) => (
                  <NotificationCard
                    key={notification.id}
                    notification={notification}
                    categories={categories}
                    onMarkAsRead={markAsRead}
                    onDelete={setDeleteNotificationId}
                    onChangeCategory={updateNotificationCategory}
                    onCardClick={handleCardClick}
                  />
                ))}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 mt-6 pb-4">
                  <button
                    onClick={() =>
                      setCurrentPage((prev) => Math.max(1, prev - 1))
                    }
                    disabled={currentPage === 1}
                    className="p-2 rounded-lg neu-btn disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    title="Previous page"
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <div className="flex items-center gap-1">
                    {Array.from({ length: totalPages }, (_, i) => i + 1)
                      .filter((page) => {
                        // 現在のページの前後2ページ、最初と最後のページを表示
                        return (
                          page === 1 ||
                          page === totalPages ||
                          Math.abs(page - currentPage) <= 2
                        );
                      })
                      .map((page, index, array) => (
                        <span key={page} className="flex items-center">
                          {index > 0 && array[index - 1] !== page - 1 && (
                            <span className="px-2 neu-text-muted">...</span>
                          )}
                          <button
                            onClick={() => setCurrentPage(page)}
                            className={`w-10 h-10 md:w-8 md:h-8 rounded-lg text-sm font-medium transition-colors ${
                              currentPage === page
                                ? "bg-sky-500 text-white"
                                : "neu-chip neu-text-secondary"
                            }`}
                          >
                            {page}
                          </button>
                        </span>
                      ))}
                  </div>
                  <button
                    onClick={() =>
                      setCurrentPage((prev) => Math.min(totalPages, prev + 1))
                    }
                    disabled={currentPage === totalPages}
                    className="p-2 rounded-lg neu-btn disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    title="Next page"
                  >
                    <ChevronRight size={18} />
                  </button>
                  <span className="ml-4 text-sm neu-text-secondary">
                    {(currentPage - 1) * ITEMS_PER_PAGE + 1}-
                    {Math.min(
                      currentPage * ITEMS_PER_PAGE,
                      filteredNotifications.length,
                    )}{" "}
                    of {filteredNotifications.length}
                  </span>
                </div>
              )}
            </>
          )}
        </main>
      </div>
      <ConfirmDialog
        isOpen={deleteNotificationId !== null}
        title="Delete Notification"
        message="Are you sure you want to delete this notification?"
        confirmLabel="Delete"
        onConfirm={async () => {
          if (deleteNotificationId) {
            await removeNotification(deleteNotificationId);
            setDeleteNotificationId(null);
          }
        }}
        onCancel={() => setDeleteNotificationId(null)}
      />

      {/* Detail Modal */}
      {selectedNotification &&
        createPortal(
          <div
            className="fixed inset-0 bg-black/50 flex justify-center z-[60] px-4 overflow-y-auto overscroll-contain"
            style={{
              paddingTop: "calc(4rem + env(safe-area-inset-top, 0px))",
              paddingBottom: "calc(5rem + env(safe-area-inset-bottom, 0px))",
            }}
            onClick={() => setSelectedNotification(null)}
          >
            <div
              className="neu-modal max-w-4xl w-full max-h-[60svh] md:max-h-[70svh] overflow-hidden flex flex-col my-auto"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="p-4 border-b border-slate-200 shrink-0 flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-2">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        SOURCE_CONFIG[selectedNotification.source]?.color ||
                        "bg-slate-100 text-slate-700"
                      }`}
                    >
                      {SOURCE_CONFIG[selectedNotification.source]?.label ||
                        selectedNotification.source}
                    </span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        PRIORITY_CONFIG[selectedNotification.priority].color
                      }`}
                    >
                      {PRIORITY_CONFIG[selectedNotification.priority].label}
                    </span>
                    {categories.find(
                      (c) => c.id === selectedNotification.categoryId,
                    ) && (
                      <span
                        className="text-xs px-2 py-0.5 rounded-full font-medium text-white"
                        style={{
                          backgroundColor:
                            CATEGORY_COLORS[
                              categories.find(
                                (c) => c.id === selectedNotification.categoryId,
                              )?.color || ""
                            ] || "#64748b",
                        }}
                      >
                        {
                          categories.find(
                            (c) => c.id === selectedNotification.categoryId,
                          )?.name
                        }
                      </span>
                    )}
                    <span className="text-xs neu-text-muted">
                      {formatRelativeTime(selectedNotification.createdAt)}
                    </span>
                  </div>
                  <h3 className="text-lg font-semibold neu-text-primary">
                    {emojifySlack(selectedNotification.title)}
                  </h3>
                </div>
                <button
                  onClick={() => setSelectedNotification(null)}
                  className="p-2 neu-text-muted hover:neu-text-secondary neu-btn rounded-lg transition-colors"
                  title="Close"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Modal Body */}
              <div className="flex-1 overflow-y-auto p-4">
                <div
                  className="prose prose-slate prose-sm max-w-none
                prose-headings:text-slate-800 prose-headings:font-semibold prose-headings:mt-4 prose-headings:mb-2
                prose-h1:text-lg prose-h2:text-base prose-h3:text-base prose-h4:text-sm
                prose-p:text-slate-700 prose-p:my-2 prose-p:text-sm prose-p:leading-relaxed
                prose-strong:text-slate-800 prose-strong:font-semibold
                prose-em:not-italic prose-em:font-medium prose-em:text-slate-800
                prose-ul:my-2 prose-ol:my-2 prose-li:my-1 prose-li:text-sm
                prose-a:text-sky-600 prose-a:no-underline hover:prose-a:underline prose-a:text-sm
              "
                >
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      table: ({ children }) => (
                        <div className="overflow-x-auto my-4 -mx-1">
                          <table className="min-w-full text-sm leading-normal border-collapse">
                            {children as React.ReactNode}
                          </table>
                        </div>
                      ),
                      thead: ({ children }) => (
                        <thead className="bg-slate-100">
                          {children as React.ReactNode}
                        </thead>
                      ),
                      th: ({ children }) => (
                        <th className="px-2 py-1.5 text-left font-medium text-slate-700 border border-slate-200 whitespace-nowrap text-xs">
                          {children as React.ReactNode}
                        </th>
                      ),
                      td: ({ children }) => (
                        <td className="px-2 py-1.5 border border-slate-200 text-slate-600 text-xs break-words">
                          {children as React.ReactNode}
                        </td>
                      ),
                      tr: ({ children, ...props }) => {
                        const isEven =
                          props.node?.position?.start?.line &&
                          props.node.position.start.line % 2 === 0;
                        return (
                          <tr className={isEven ? "bg-slate-50" : "bg-white"}>
                            {children as React.ReactNode}
                          </tr>
                        );
                      },
                    }}
                  >
                    {emojifySlack(selectedNotification.body)}
                  </ReactMarkdown>
                </div>

                {/* Event Discovery Cards */}
                {(selectedNotification.metadata as Record<string, unknown>)
                  ?.automationType === "event_discovery" &&
                  Array.isArray(
                    (selectedNotification.metadata as Record<string, unknown>)
                      .events,
                  ) && (
                    <div className="mt-4 space-y-3">
                      <h4 className="text-sm font-semibold neu-text-primary">
                        Events
                      </h4>
                      {(
                        (
                          selectedNotification.metadata as Record<
                            string,
                            unknown
                          >
                        ).events as {
                          title: string;
                          description?: string;
                          startDate: string;
                          endDate?: string;
                          location?: string;
                          url: string;
                          platform: string;
                          relevanceReason?: string;
                        }[]
                      ).map((event, idx) => (
                        <div
                          key={idx}
                          className="p-3 rounded-lg neu-flat border border-slate-100"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-xs px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-medium">
                                  {event.platform}
                                </span>
                                <span className="text-xs neu-text-muted">
                                  {event.startDate}
                                </span>
                              </div>
                              <h5 className="text-sm font-medium neu-text-primary">
                                {event.title}
                              </h5>
                              {event.location && (
                                <p className="text-xs neu-text-secondary flex items-center gap-1 mt-0.5">
                                  <MapPin size={12} />
                                  {event.location}
                                </p>
                              )}
                              {event.relevanceReason && (
                                <p className="text-xs text-teal-600 mt-1">
                                  {event.relevanceReason}
                                </p>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              {event.url && (
                                <a
                                  href={event.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="p-1.5 text-sky-600 hover:bg-sky-50 rounded-lg transition-colors"
                                  title="Open event page"
                                >
                                  <ExternalLink size={16} />
                                </a>
                              )}
                              <button
                                onClick={() =>
                                  handleAddEventToCalendar(event, idx)
                                }
                                disabled={
                                  addingEventIdx === idx ||
                                  addedEventIdxs.has(idx)
                                }
                                className={`p-1.5 rounded-lg transition-colors ${
                                  addedEventIdxs.has(idx)
                                    ? "text-green-600 bg-green-50"
                                    : "text-teal-600 hover:bg-teal-50"
                                } disabled:cursor-not-allowed`}
                                title={
                                  addedEventIdxs.has(idx)
                                    ? "Added to calendar"
                                    : "Add to Google Calendar"
                                }
                              >
                                {addingEventIdx === idx ? (
                                  <Loader2 size={16} className="animate-spin" />
                                ) : addedEventIdxs.has(idx) ? (
                                  <Check size={16} />
                                ) : (
                                  <CalendarPlus size={16} />
                                )}
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                {/* Metadata */}
                {selectedNotification.metadata &&
                  Object.keys(selectedNotification.metadata).length > 0 && (
                    <div className="mt-6 pt-4 border-t border-slate-200">
                      <h4 className="text-sm font-medium neu-text-secondary mb-3">
                        Details
                      </h4>
                      <div className="space-y-2">
                        {Boolean(
                          (
                            selectedNotification.metadata as Record<
                              string,
                              unknown
                            >
                          ).link,
                        ) && (
                          <a
                            href={
                              (
                                selectedNotification.metadata as Record<
                                  string,
                                  unknown
                                >
                              ).link as string
                            }
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 text-sm text-sky-600 hover:text-sky-700"
                          >
                            <ExternalLink size={14} />
                            Open link
                          </a>
                        )}
                        {Boolean(
                          (
                            selectedNotification.metadata as Record<
                              string,
                              unknown
                            >
                          ).feedName,
                        ) && (
                          <p className="text-sm neu-text-secondary">
                            Feed:{" "}
                            {String(
                              (
                                selectedNotification.metadata as Record<
                                  string,
                                  unknown
                                >
                              ).feedName,
                            )}
                          </p>
                        )}
                        {Boolean(
                          (
                            selectedNotification.metadata as Record<
                              string,
                              unknown
                            >
                          ).automationName,
                        ) && (
                          <p className="text-sm neu-text-secondary">
                            Automation:{" "}
                            {String(
                              (
                                selectedNotification.metadata as Record<
                                  string,
                                  unknown
                                >
                              ).automationName,
                            )}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
              </div>

              {/* Modal Footer */}
              <div className="p-4 border-t border-slate-200 shrink-0 flex justify-end gap-2">
                <button
                  onClick={() => {
                    setDeleteNotificationId(selectedNotification.id);
                    setSelectedNotification(null);
                  }}
                  className="px-4 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                >
                  Delete
                </button>
                <button
                  onClick={() => setSelectedNotification(null)}
                  className="px-4 py-2 text-sm neu-btn neu-text-primary rounded-lg transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </Layout>
  );
};
