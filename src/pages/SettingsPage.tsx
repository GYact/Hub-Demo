import { useEffect, useState } from "react";
import {
  Plus,
  Link as LinkIcon,
  Unlink,
  CheckCircle,
  Calendar,
  Smartphone,
  GripVertical,
  ArrowDown,
  ArrowUp,
  Bot,
  X,
  Bell,
  Key,
  Hash,
  Filter,
  Copy,
  Eye,
  EyeOff,
  Trash2,
  Pencil,
  Save,
  ChevronDown,
  ChevronUp,
  Rss,
  Twitter,
  Clock,
  Loader2,
  FileText,
  BrainCircuit,
  BellRing,
  Mail,
  Zap,
  Globe,
  SlidersHorizontal,
  MessageSquareText,
  Timer,
  Users,
  Monitor,
  MapPin,
  DollarSign,
  RefreshCw,
} from "lucide-react";
import { DndContext, closestCenter, DragEndEvent } from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useDndSensors } from "../hooks/useDndSensors";
import { useAuth } from "../contexts/AuthContext";
import {
  Layout,
  ConfirmDialog,
  AlertDialog,
  TimePicker,
  UrlInput,
} from "../components";
import { useMobileNavConfig, NavItem } from "../hooks/useMobileNavConfig";
import { useAiShortcuts } from "../hooks/useAiShortcuts";
import { DEFAULT_AI_SHORTCUTS } from "../lib/aiDefaults";
import { useAiNotifications } from "../hooks/useAiNotifications";
import { formatRelativeTime } from "../lib/formatters";
import { CATEGORY_COLORS } from "../lib/notificationConstants";
import { useRssFeeds } from "../hooks/useRssFeeds";
import { useXSources } from "../hooks/useXSources";
import {
  useNotificationSettings,
  REMINDER_OPTIONS,
  type NotificationSettings,
} from "../hooks/useNotificationSettings";
import {
  useAvailabilitySettings,
  DAY_LABELS,
  SLOT_DURATION_OPTIONS,
} from "../hooks/useAvailabilitySettings";
import {
  registerPushSubscription,
  unregisterPushSubscription,
} from "../lib/pushNotifications";
import { clearGoogleTokens } from "../lib/googleTokenRefresh";
import { supabase } from "../lib/offlineSync";
import { useInvoiceReminders } from "../hooks/useInvoiceReminders";
import { useUserSetting } from "../hooks/useUserSetting";
import { useCostManagement } from "../hooks/useCostManagement";
import {
  DEFAULT_PROACTIVE_SETTINGS,
  DEFAULT_AGENT_ROLES,
  DATA_SOURCE_LABELS,
  AGENT_ROLE_LABELS,
  type ProactiveAgentSettings,
} from "../types";

// Google Services Integration Card (Calendar + Drive + Gmail)
const GoogleServicesCard = () => {
  const {
    hasGoogleCalendarAccess,
    connectGoogleCalendar,
    googleAccounts,
    connectAdditionalGoogleAccount,
    removeGoogleAccount,
  } = useAuth();
  const [isExpanded, setIsExpanded] = useState(false);

  const handleDisconnect = () => {
    clearGoogleTokens();
    window.location.reload();
  };

  return (
    <div className="neu-card overflow-hidden">
      <div className="p-4 md:p-5">
        <div className="flex items-start gap-3">
          <div className="bg-gradient-to-br from-indigo-500 to-purple-500 p-2 rounded-lg shrink-0">
            <Calendar size={20} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-lg font-semibold neu-text-primary">
                Google Services
              </h3>
              {hasGoogleCalendarAccess && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-100 text-emerald-700 text-xs font-medium rounded-full">
                  <CheckCircle size={12} />
                  Connected
                </span>
              )}
            </div>
            <p className="mt-1 text-sm neu-text-secondary">
              {hasGoogleCalendarAccess
                ? "Calendar, Drive & Gmail connected."
                : "Connect Google to use Calendar, Drive & Gmail."}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {!hasGoogleCalendarAccess && (
              <button
                onClick={connectGoogleCalendar}
                className="flex items-center gap-2 px-3 py-2 bg-sky-600 hover:bg-sky-500 text-white text-sm font-medium rounded-lg transition-colors"
              >
                <LinkIcon size={16} />
                Connect
              </button>
            )}
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="neu-btn p-2 neu-text-muted hover:neu-text-secondary transition-colors"
              title={isExpanded ? "Collapse" : "Expand"}
            >
              {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
            </button>
          </div>
        </div>

        {/* Connected accounts list */}
        {isExpanded && hasGoogleCalendarAccess && googleAccounts.length > 0 && (
          <div className="mt-4 space-y-2">
            {googleAccounts.map((account) => (
              <div
                key={account.email}
                className="flex items-center justify-between px-3 py-2 rounded-lg bg-[var(--color-bg-secondary)]"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm neu-text-primary truncate">
                    {account.email}
                  </span>
                  {account.isPrimary && (
                    <span className="inline-flex items-center px-1.5 py-0.5 bg-indigo-100 text-indigo-700 text-[10px] font-medium rounded">
                      Primary
                    </span>
                  )}
                </div>
                {account.isPrimary ? (
                  <button
                    onClick={handleDisconnect}
                    className="text-xs neu-text-secondary hover:text-red-600 transition-colors shrink-0"
                  >
                    <Unlink size={14} />
                  </button>
                ) : (
                  <button
                    onClick={() => removeGoogleAccount(account.email)}
                    className="text-xs neu-text-secondary hover:text-red-600 transition-colors shrink-0"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))}

            <button
              onClick={connectAdditionalGoogleAccount}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm font-medium text-sky-600 hover:bg-sky-50 rounded-lg transition-colors"
            >
              <Plus size={16} />
              Add Google Account
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// Sortable Item Component
interface SortableItemProps {
  item: NavItem;
  onAction: () => void;
  actionIcon: React.ReactNode;
  variant: "nav" | "more";
}

const SortableItem = ({
  item,
  onAction,
  actionIcon,
  variant,
}: SortableItemProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 1 : 0,
    opacity: isDragging ? 0.5 : 1,
  };

  const Icon = item.icon;
  const isNav = variant === "nav";

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 p-3 rounded-xl select-none touch-manipulation ${
        isNav ? "neu-pressed" : "neu-flat"
      }`}
    >
      <div
        {...attributes}
        {...listeners}
        className={`cursor-grab active:cursor-grabbing p-1 -ml-1 touch-none ${isNav ? "text-purple-400" : "neu-text-muted"}`}
      >
        <GripVertical size={16} />
      </div>
      <Icon
        size={20}
        className={isNav ? "text-purple-600" : "neu-text-secondary"}
      />
      <span className="flex-1 font-medium neu-text-primary">{item.label}</span>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onAction();
        }}
        className={`p-1.5 rounded-lg transition-colors ${
          isNav
            ? "text-purple-600 hover:neu-pressed"
            : "neu-text-secondary hover:neu-pressed"
        }`}
      >
        {actionIcon}
      </button>
    </div>
  );
};

// Mobile Navigation Config Card
const MobileNavConfigCard = () => {
  const { navIds, moreIds, saveNavConfig, saveMoreConfig, getAvailableItems } =
    useMobileNavConfig();
  const [localNavIds, setLocalNavIds] = useState<string[]>(navIds || []);
  const [localMoreIds, setLocalMoreIds] = useState<string[]>(moreIds || []);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    if (navIds) setLocalNavIds(navIds);
  }, [navIds]);

  useEffect(() => {
    if (moreIds) setLocalMoreIds(moreIds);
  }, [moreIds]);

  const sensors = useDndSensors();

  const handleNavDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = localNavIds.indexOf(active.id as string);
      const newIndex = localNavIds.indexOf(over.id as string);
      const newIds = arrayMove(localNavIds, oldIndex, newIndex);
      setLocalNavIds(newIds);
      saveNavConfig(newIds);
    }
  };

  const handleMoreDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = localMoreIds.indexOf(active.id as string);
      const newIndex = localMoreIds.indexOf(over.id as string);
      const newIds = arrayMove(localMoreIds, oldIndex, newIndex);
      setLocalMoreIds(newIds);
      saveMoreConfig(newIds);
    }
  };

  const moveToMore = (id: string) => {
    if (localNavIds.length <= 1) return; // Keep at least 1 item
    const newNavIds = localNavIds.filter((i) => i !== id);
    const newMoreIds = [id, ...localMoreIds];
    setLocalNavIds(newNavIds);
    setLocalMoreIds(newMoreIds);
    saveNavConfig(newNavIds); // Will trigger saveMoreConfig internally via hook logic
  };

  const moveToNav = (id: string) => {
    if (localNavIds.length >= 4) {
      // Swap with last item if full
      const lastNavId = localNavIds[localNavIds.length - 1];
      const newNavIds = [...localNavIds.slice(0, -1), id];
      const newMoreIds = [lastNavId, ...localMoreIds.filter((i) => i !== id)];
      setLocalNavIds(newNavIds);
      setLocalMoreIds(newMoreIds);
      saveNavConfig(newNavIds);
    } else {
      const newNavIds = [...localNavIds, id];
      const newMoreIds = localMoreIds.filter((i) => i !== id);
      setLocalNavIds(newNavIds);
      setLocalMoreIds(newMoreIds);
      saveNavConfig(newNavIds);
    }
  };

  const allNavItems = getAvailableItems();

  const navItems = (localNavIds || [])
    .map((id) => allNavItems.find((item) => item.id === id))
    .filter((item): item is NavItem => item !== undefined);

  const moreItems = (localMoreIds || [])
    .map((id) => allNavItems.find((item) => item.id === id))
    .filter((item): item is NavItem => item !== undefined);

  return (
    <div className="neu-card overflow-hidden">
      <div className="p-4 md:p-5">
        <div className="flex items-start gap-3">
          <div className="bg-purple-100 p-2 rounded-lg shrink-0">
            <Smartphone size={20} className="text-purple-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold neu-text-primary">
              Mobile Navigation
            </h3>
            <p className="mt-1 text-sm neu-text-secondary">
              Customize mobile navigation bar
            </p>
          </div>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="neu-btn p-2 neu-text-muted hover:neu-text-secondary transition-colors"
            title={isExpanded ? "Collapse" : "Expand"}
          >
            {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
          </button>
        </div>

        {isExpanded && (
          <div className="mt-4">
            {/* Navigation Bar Items */}
            <div className="mb-4 md:mb-6">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Navigation Bar ({navItems.length}/4)
                </h4>
              </div>
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleNavDragEnd}
              >
                <SortableContext
                  items={navItems.map((i) => i.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-2 no-select">
                    {navItems.map((item) => (
                      <SortableItem
                        key={item.id}
                        item={item}
                        variant="nav"
                        onAction={() => moveToMore(item.id)}
                        actionIcon={<ArrowDown size={16} />}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            </div>

            {/* More Menu Items */}
            <div>
              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                More Menu ({moreItems.length} items)
              </h4>
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleMoreDragEnd}
              >
                <SortableContext
                  items={moreItems.map((i) => i.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-2 no-select">
                    {moreItems.map((item) => (
                      <SortableItem
                        key={item.id}
                        item={item}
                        variant="more"
                        onAction={() => moveToNav(item.id)}
                        actionIcon={<ArrowUp size={16} />}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
              <p className="mt-3 text-xs neu-text-secondary">
                Long press to drag and reorder. Use arrows to move between
                sections.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// Claude Code Relay Settings Card
const ClaudeCodeRelayCard = () => {
  const { value: relayUrl, setValue: setRelayUrl } = useUserSetting<string>(
    "claude_code_relay_url",
    "",
  );
  const { value: relayToken, setValue: setRelayToken } = useUserSetting<string>(
    "claude_code_relay_token",
    "",
  );
  const [isExpanded, setIsExpanded] = useState(false);
  const [healthStatus, setHealthStatus] = useState<
    "unknown" | "checking" | "online" | "offline"
  >("unknown");
  const [showToken, setShowToken] = useState(false);

  const checkHealth = async () => {
    if (!relayUrl) return;
    setHealthStatus("checking");
    try {
      const headers: Record<string, string> = {};
      if (relayToken) {
        headers["Authorization"] = `Bearer ${relayToken}`;
      }
      const res = await fetch(`${relayUrl.replace(/\/+$/, "")}/api/health`, {
        headers,
        signal: AbortSignal.timeout(5000),
      });
      setHealthStatus(res.ok ? "online" : "offline");
    } catch {
      setHealthStatus("offline");
    }
  };

  return (
    <div className="neu-card overflow-hidden">
      <div className="p-4 md:p-5">
        <div className="flex items-start gap-3">
          <div className="bg-orange-100 p-2 rounded-lg shrink-0">
            <Monitor size={20} className="text-orange-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold neu-text-primary">
              Claude Code
            </h3>
            <p className="mt-1 text-sm neu-text-secondary">
              Connect to Claude Code on your Mac via Tailscale
            </p>
          </div>
          <div className="flex items-center gap-2">
            {healthStatus === "online" && (
              <span
                className="w-2.5 h-2.5 rounded-full bg-green-500"
                title="Online"
              />
            )}
            {healthStatus === "offline" && (
              <span
                className="w-2.5 h-2.5 rounded-full bg-red-500"
                title="Offline"
              />
            )}
            {healthStatus === "checking" && (
              <Loader2 size={14} className="animate-spin neu-text-muted" />
            )}
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="neu-btn p-2 neu-text-muted hover:neu-text-secondary transition-colors"
              title={isExpanded ? "Collapse" : "Expand"}
            >
              {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
            </button>
          </div>
        </div>

        {isExpanded && (
          <div className="mt-4 space-y-3">
            <div>
              <label className="block text-xs font-medium neu-text-secondary mb-1">
                Relay URL
              </label>
              <input
                type="url"
                value={relayUrl}
                onChange={(e) =>
                  setRelayUrl(e.target.value.replace(/\/+$/, ""))
                }
                placeholder="http://100.x.x.x:3100"
                className="w-full rounded-lg neu-input px-3 py-2 text-sm neu-text-primary"
              />
              <p className="mt-1 text-xs neu-text-muted">
                Mac's Tailscale IP + relay port (e.g. http://100.64.0.1:3100)
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium neu-text-secondary mb-1">
                Auth Token
              </label>
              <div className="flex gap-2">
                <input
                  type={showToken ? "text" : "password"}
                  value={relayToken}
                  onChange={(e) => setRelayToken(e.target.value)}
                  placeholder="your-secret-token"
                  className="flex-1 rounded-lg neu-input px-3 py-2 text-sm neu-text-primary"
                />
                <button
                  onClick={() => setShowToken(!showToken)}
                  className="neu-btn p-2 neu-text-muted hover:neu-text-secondary"
                  title={showToken ? "Hide" : "Show"}
                >
                  {showToken ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <p className="mt-1 text-xs neu-text-muted">
                Must match RELAY_AUTH_TOKEN in relay/.env
              </p>
            </div>

            <button
              onClick={checkHealth}
              disabled={!relayUrl || healthStatus === "checking"}
              className="neu-btn px-4 py-2 text-sm font-medium neu-text-primary disabled:opacity-50"
            >
              {healthStatus === "checking" ? (
                <span className="flex items-center gap-2">
                  <Loader2 size={14} className="animate-spin" />
                  Checking...
                </span>
              ) : (
                "Test Connection"
              )}
            </button>

            {healthStatus === "online" && (
              <p className="text-sm text-green-600 font-medium">
                Connected — Mac relay is online
              </p>
            )}
            {healthStatus === "offline" && (
              <p className="text-sm text-red-600 font-medium">
                Connection failed — check Mac relay is running
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// Location Tracker Webhook Card
const LocationTrackerCard = () => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [webhookUrl, setWebhookUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState<"url" | "token" | null>(null);

  const fetchToken = async () => {
    if (!supabase) return;
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("log_location", {
        method: "GET",
      });
      if (error) throw error;
      setToken(data.token);
      setWebhookUrl(data.url);
    } catch (err) {
      console.error("Failed to fetch location webhook token:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = async (text: string, type: "url" | "token") => {
    await navigator.clipboard.writeText(text);
    setCopied(type);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="neu-card overflow-hidden">
      <div className="p-4 md:p-5">
        <div className="flex items-start gap-3">
          <div className="bg-emerald-100 p-2 rounded-lg shrink-0">
            <MapPin size={20} className="text-emerald-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold neu-text-primary">
              Location Tracker
            </h3>
            <p className="mt-1 text-sm neu-text-secondary">
              iOSショートカットでバックグラウンド位置記録
            </p>
          </div>
          <button
            onClick={() => {
              setIsExpanded(!isExpanded);
              if (!isExpanded && !token) fetchToken();
            }}
            className="neu-btn p-2 neu-text-muted hover:neu-text-secondary transition-colors"
          >
            {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
          </button>
        </div>

        {isExpanded && (
          <div className="mt-4 space-y-3">
            {isLoading ? (
              <div className="flex items-center gap-2 text-sm neu-text-muted">
                <Loader2 size={14} className="animate-spin" />
                Generating token...
              </div>
            ) : token && webhookUrl ? (
              <>
                <div>
                  <label className="block text-xs font-medium neu-text-secondary mb-1">
                    Webhook URL
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      readOnly
                      value={webhookUrl}
                      className="flex-1 rounded-lg neu-input px-3 py-2 text-sm neu-text-primary bg-slate-50"
                    />
                    <button
                      onClick={() => handleCopy(webhookUrl, "url")}
                      className="neu-btn p-2 neu-text-muted hover:neu-text-secondary"
                    >
                      {copied === "url" ? (
                        <CheckCircle size={16} className="text-green-500" />
                      ) : (
                        <Copy size={16} />
                      )}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium neu-text-secondary mb-1">
                    Webhook Token
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      readOnly
                      value={token}
                      className="flex-1 rounded-lg neu-input px-3 py-2 text-sm neu-text-primary bg-slate-50 font-mono"
                    />
                    <button
                      onClick={() => handleCopy(token, "token")}
                      className="neu-btn p-2 neu-text-muted hover:neu-text-secondary"
                    >
                      {copied === "token" ? (
                        <CheckCircle size={16} className="text-green-500" />
                      ) : (
                        <Copy size={16} />
                      )}
                    </button>
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-slate-50 text-xs neu-text-secondary space-y-2">
                  <p className="font-semibold neu-text-primary">
                    iOSショートカット設定
                  </p>
                  <ol className="list-decimal list-inside space-y-1">
                    <li>ショートカットApp →「+」→ 新規ショートカット</li>
                    <li>「現在地を取得」アクションを追加</li>
                    <li>「URLの内容を取得」アクションを追加</li>
                    <li>URL: 上記のWebhook URL</li>
                    <li>
                      方法: POST / ヘッダー: X-Webhook-Token = 上記トークン
                    </li>
                    <li>
                      本文(JSON): {"{"}&quot;lat&quot;: 現在地.緯度,
                      &quot;lng&quot;: 現在地.経度{"}"}
                    </li>
                    <li>
                      オートメーション → 個人 → 時刻(毎時) →
                      このショートカットを実行
                    </li>
                  </ol>
                </div>
              </>
            ) : (
              <button
                onClick={fetchToken}
                className="neu-btn px-4 py-2 text-sm font-medium neu-text-primary"
              >
                Generate Token
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// AI Shortcuts Config Card
const AiShortcutsCard = () => {
  const { shortcuts, setShortcuts, cleanupDuplicates, isSyncing } =
    useAiShortcuts(DEFAULT_AI_SHORTCUTS);
  const [newShortcut, setNewShortcut] = useState("");
  const [isExpanded, setIsExpanded] = useState(false);
  const [deleteIndex, setDeleteIndex] = useState<number | null>(null);
  const [cleanupMessage, setCleanupMessage] = useState<string | null>(null);

  const handleAdd = () => {
    if (!newShortcut.trim()) return;
    // Check for duplicates
    const normalizedNew = newShortcut.trim().toLowerCase();
    const isDuplicate = shortcuts.some(
      (s) => s.toLowerCase().trim() === normalizedNew,
    );
    if (isDuplicate) {
      setCleanupMessage("This shortcut already exists");
      setTimeout(() => setCleanupMessage(null), 3000);
      return;
    }
    const updated = [...shortcuts, newShortcut.trim()];
    setShortcuts(updated);
    setNewShortcut("");
  };

  const handleRemove = (index: number) => {
    setDeleteIndex(index);
  };

  const confirmRemove = () => {
    if (deleteIndex !== null) {
      const updated = shortcuts.filter((_, i) => i !== deleteIndex);
      setShortcuts(updated);
      setDeleteIndex(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleAdd();
    }
  };

  const handleCleanupDuplicates = async () => {
    const removedCount = await cleanupDuplicates();
    if (removedCount > 0) {
      setCleanupMessage(`Removed ${removedCount} duplicates`);
    } else {
      setCleanupMessage("No duplicates found");
    }
    setTimeout(() => setCleanupMessage(null), 3000);
  };

  return (
    <div className="neu-card overflow-hidden">
      <div className="p-4 md:p-5">
        <div className="flex items-start gap-3">
          <div className="bg-purple-100 p-2 rounded-lg shrink-0">
            <Bot size={20} className="text-purple-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold neu-text-primary">
              AI Shortcuts
            </h3>
            <p className="mt-1 text-sm neu-text-secondary">
              Quick shortcuts displayed on the Hub-AI page
            </p>
          </div>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="neu-btn p-2 neu-text-muted hover:neu-text-secondary transition-colors"
            title={isExpanded ? "Collapse" : "Expand"}
          >
            {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
          </button>
        </div>

        {isExpanded && (
          <div className="mt-4">
            {/* Add new shortcut */}
            <div className="flex gap-2 mb-4">
              <input
                type="text"
                value={newShortcut}
                onChange={(e) => setNewShortcut(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Add new shortcut..."
                className="flex-1 px-3 py-2 neu-input text-sm"
              />
              <button
                onClick={handleAdd}
                disabled={!newShortcut.trim()}
                className="px-4 py-2 bg-sky-600 hover:bg-sky-500 disabled:bg-slate-300 text-white text-sm font-medium rounded-lg transition-colors"
                title="Add"
              >
                <Plus size={16} />
              </button>
            </div>

            {/* Cleanup/warning message */}
            {cleanupMessage && (
              <div
                className={`mb-4 p-2 text-sm rounded-lg ${
                  cleanupMessage.includes("already exists")
                    ? "bg-amber-50 text-amber-700"
                    : "bg-emerald-50 text-emerald-700"
                }`}
              >
                {cleanupMessage}
              </div>
            )}

            {/* Shortcut list */}
            <div className="space-y-2">
              {shortcuts.length === 0 ? (
                <p className="text-center text-sm neu-text-muted py-4">
                  No shortcuts
                </p>
              ) : (
                shortcuts.map((shortcut, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-3 p-3 neu-flat rounded-xl"
                  >
                    <span className="flex-1 text-sm neu-text-primary">
                      {shortcut}
                    </span>
                    <button
                      onClick={() => handleRemove(index)}
                      className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors"
                      title="Delete"
                    >
                      <X size={16} />
                    </button>
                  </div>
                ))
              )}
            </div>

            {/* Cleanup duplicates button - show if there might be duplicates */}
            {shortcuts.length > 0 &&
              shortcuts.length !==
                new Set(shortcuts.map((s) => s.toLowerCase().trim())).size && (
                <button
                  onClick={handleCleanupDuplicates}
                  disabled={isSyncing}
                  className="mt-4 w-full px-3 py-2 text-sm text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-lg transition-colors disabled:opacity-50"
                >
                  {isSyncing ? "Processing..." : "Remove duplicates"}
                </button>
              )}
          </div>
        )}
      </div>
      <ConfirmDialog
        isOpen={deleteIndex !== null}
        title="Delete Shortcut"
        message={
          deleteIndex !== null
            ? `Are you sure you want to delete "${shortcuts[deleteIndex]}"?`
            : ""
        }
        onConfirm={confirmRemove}
        onCancel={() => setDeleteIndex(null)}
      />
    </div>
  );
};

// Slack Integration Card (separate from AI Notification)
const SlackIntegrationCard = () => {
  const {
    categories,
    slackIntegrations,
    addSlackIntegration,
    removeSlackIntegration,
    toggleSlack,
    updateSlackIntegration,
  } = useAiNotifications();

  const [isExpanded, setIsExpanded] = useState(false);
  const [showSlackForm, setShowSlackForm] = useState(false);
  const [slackTeamId, setSlackTeamId] = useState("");
  const [slackTeamName, setSlackTeamName] = useState("");
  const [slackBotToken, setSlackBotToken] = useState("");
  const [slackDefaultCategory, setSlackDefaultCategory] = useState<string>("");

  const [editingSlackId, setEditingSlackId] = useState<string | null>(null);
  const [editSlackTeamName, setEditSlackTeamName] = useState("");
  const [editSlackBotToken, setEditSlackBotToken] = useState("");
  const [editSlackDefaultCategory, setEditSlackDefaultCategory] =
    useState<string>("");
  const [deleteSlackId, setDeleteSlackId] = useState<string | null>(null);

  const handleAddSlackIntegration = async () => {
    if (!slackTeamId.trim() || !slackTeamName.trim() || !slackBotToken.trim())
      return;
    await addSlackIntegration({
      teamId: slackTeamId.trim(),
      teamName: slackTeamName.trim(),
      botToken: slackBotToken.trim(),
      channelFilters: { mode: "all", channels: [] },
      defaultCategoryId: slackDefaultCategory || null,
      isActive: true,
    });
    setSlackTeamId("");
    setSlackTeamName("");
    setSlackBotToken("");
    setSlackDefaultCategory("");
    setShowSlackForm(false);
  };

  const handleStartEditSlack = (integration: (typeof slackIntegrations)[0]) => {
    setEditingSlackId(integration.id);
    setEditSlackTeamName(integration.teamName);
    setEditSlackBotToken("");
    setEditSlackDefaultCategory(integration.defaultCategoryId || "");
  };

  const handleCancelEditSlack = () => {
    setEditingSlackId(null);
    setEditSlackTeamName("");
    setEditSlackBotToken("");
    setEditSlackDefaultCategory("");
  };

  const handleSaveEditSlack = async () => {
    if (!editingSlackId || !editSlackTeamName.trim()) return;

    const updates: {
      teamName?: string;
      botToken?: string;
      defaultCategoryId?: string | null;
    } = {
      teamName: editSlackTeamName.trim(),
      defaultCategoryId: editSlackDefaultCategory || null,
    };

    if (editSlackBotToken.trim()) {
      updates.botToken = editSlackBotToken.trim();
    }

    await updateSlackIntegration(editingSlackId, updates);
    handleCancelEditSlack();
  };

  return (
    <div className="neu-card overflow-hidden">
      <div className="p-4 md:p-5">
        <div className="flex items-start gap-3">
          <div className="bg-gradient-to-br from-sky-500 to-indigo-500 p-2 rounded-lg shrink-0">
            <Hash size={20} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-lg font-semibold neu-text-primary">
                Slack Integration
              </h3>
              {slackIntegrations.length > 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-sky-100 text-sky-700 text-xs font-medium rounded-full">
                  {slackIntegrations.filter((s) => s.isActive).length} active
                </span>
              )}
            </div>
            <p className="mt-1 text-sm neu-text-secondary">
              Forward messages from Slack workspace to Hub
            </p>
          </div>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="neu-btn p-2 neu-text-muted hover:neu-text-secondary transition-colors"
            title={isExpanded ? "Collapse" : "Expand"}
          >
            {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
          </button>
        </div>

        {isExpanded && (
          <div className="mt-4 space-y-4">
            {!showSlackForm ? (
              <button
                onClick={() => setShowSlackForm(true)}
                className="flex items-center gap-2 px-3 py-2 bg-sky-500 text-white rounded-lg hover:bg-sky-600 transition-colors text-sm"
              >
                <Plus size={14} />
                Add Slack Integration
              </button>
            ) : (
              <div className="space-y-3 p-3 neu-pressed rounded-xl">
                <div>
                  <label className="block text-xs font-medium neu-text-primary mb-1">
                    Workspace ID
                  </label>
                  <input
                    type="text"
                    value={slackTeamId}
                    onChange={(e) => setSlackTeamId(e.target.value)}
                    placeholder="T0123456789"
                    className="w-full px-3 py-2 neu-input text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium neu-text-primary mb-1">
                    Workspace Name
                  </label>
                  <input
                    type="text"
                    value={slackTeamName}
                    onChange={(e) => setSlackTeamName(e.target.value)}
                    placeholder="My Workspace"
                    className="w-full px-3 py-2 neu-input text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium neu-text-primary mb-1">
                    Bot Token
                  </label>
                  <input
                    type="password"
                    value={slackBotToken}
                    onChange={(e) => setSlackBotToken(e.target.value)}
                    placeholder="xoxb-..."
                    className="w-full px-3 py-2 neu-input text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium neu-text-primary mb-1">
                    Default Category (optional)
                  </label>
                  <select
                    value={slackDefaultCategory}
                    onChange={(e) => setSlackDefaultCategory(e.target.value)}
                    className="w-full px-3 py-2 neu-input text-sm"
                    title="Default category"
                  >
                    <option value="">No category</option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleAddSlackIntegration}
                    className="px-3 py-1.5 bg-sky-500 text-white rounded-lg hover:bg-sky-600 transition-colors text-sm"
                  >
                    Add
                  </button>
                  <button
                    onClick={() => setShowSlackForm(false)}
                    className="px-3 py-1.5 neu-text-secondary hover:bg-slate-100 rounded-lg transition-colors text-sm"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {slackIntegrations.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-medium neu-text-secondary uppercase">
                  Connected Workspaces
                </h4>
                {slackIntegrations.map((integration) => (
                  <div key={integration.id} className="p-2 neu-flat rounded-xl">
                    {editingSlackId === integration.id ? (
                      <div className="space-y-2">
                        <input
                          type="text"
                          value={editSlackTeamName}
                          onChange={(e) => setEditSlackTeamName(e.target.value)}
                          placeholder="Workspace name"
                          className="w-full px-2 py-1.5 border border-slate-200 rounded text-sm"
                        />
                        <input
                          type="password"
                          value={editSlackBotToken}
                          onChange={(e) => setEditSlackBotToken(e.target.value)}
                          placeholder="New token (only if changing)"
                          className="w-full px-2 py-1.5 border border-slate-200 rounded text-sm font-mono"
                        />
                        <select
                          value={editSlackDefaultCategory}
                          onChange={(e) =>
                            setEditSlackDefaultCategory(e.target.value)
                          }
                          className="w-full px-2 py-1.5 border border-slate-200 rounded text-sm"
                          title="Default category"
                        >
                          <option value="">No category</option>
                          {categories.map((cat) => (
                            <option key={cat.id} value={cat.id}>
                              {cat.name}
                            </option>
                          ))}
                        </select>
                        <div className="flex gap-2">
                          <button
                            onClick={handleSaveEditSlack}
                            className="flex items-center gap-1 px-2 py-1 bg-sky-500 text-white rounded text-xs"
                          >
                            <Save size={12} /> Save
                          </button>
                          <button
                            onClick={handleCancelEditSlack}
                            className="px-2 py-1 neu-text-secondary hover:bg-slate-100 rounded text-xs"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium neu-text-primary">
                            {integration.teamName}
                          </p>
                          <p className="text-xs neu-text-secondary">
                            {integration.teamId}
                          </p>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleStartEditSlack(integration)}
                            className="p-1.5 text-slate-400 hover:text-sky-600 hover:bg-sky-50 rounded-lg transition-colors"
                            title="Edit"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            onClick={() =>
                              toggleSlack(integration.id, !integration.isActive)
                            }
                            className={`p-1.5 rounded-lg transition-colors ${
                              integration.isActive
                                ? "text-emerald-600 hover:bg-emerald-50"
                                : "text-slate-400 hover:bg-slate-100"
                            }`}
                            title={integration.isActive ? "Disable" : "Enable"}
                          >
                            {integration.isActive ? (
                              <Eye size={14} />
                            ) : (
                              <EyeOff size={14} />
                            )}
                          </button>
                          <button
                            onClick={() => setDeleteSlackId(integration.id)}
                            className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                            title="Delete"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      <ConfirmDialog
        isOpen={deleteSlackId !== null}
        title="Delete Slack Integration"
        message={`Are you sure you want to delete the integration with "${slackIntegrations.find((s) => s.id === deleteSlackId)?.teamName || ""}"?`}
        onConfirm={async () => {
          if (deleteSlackId) {
            await removeSlackIntegration(deleteSlackId);
            setDeleteSlackId(null);
          }
        }}
        onCancel={() => setDeleteSlackId(null)}
      />
    </div>
  );
};

// AI Notification Settings Card
type NotifySettingsTab = "api-keys" | "categories";

const AiNotificationSettingsCard = () => {
  const {
    categories,
    apiKeys,
    createApiKey,
    removeApiKey,
    toggleApiKey,
    addCategory,
    removeCategory,
  } = useAiNotifications();

  const [isExpanded, setIsExpanded] = useState(false);
  const [settingsTab, setSettingsTab] = useState<NotifySettingsTab>("api-keys");

  // API Key creation
  const [newKeyName, setNewKeyName] = useState("");
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [isCreatingKey, setIsCreatingKey] = useState(false);

  // Category creation
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryColor, setNewCategoryColor] = useState("blue");

  // Delete confirmations
  const [deleteApiKeyId, setDeleteApiKeyId] = useState<string | null>(null);
  const [deleteCategoryId, setDeleteCategoryId] = useState<string | null>(null);

  const handleCreateApiKey = async () => {
    if (!newKeyName.trim()) return;
    setIsCreatingKey(true);
    const result = await createApiKey(newKeyName.trim());
    if (result) {
      setCreatedKey(result.rawKey);
      setNewKeyName("");
    }
    setIsCreatingKey(false);
  };

  const handleCopyKey = async () => {
    if (createdKey) {
      await navigator.clipboard.writeText(createdKey);
    }
  };

  const handleCreateCategory = async () => {
    if (!newCategoryName.trim()) return;
    await addCategory({
      name: newCategoryName.trim(),
      color: newCategoryColor,
      orderIndex: categories.length,
    });
    setNewCategoryName("");
  };

  return (
    <div className="neu-card overflow-hidden">
      <div className="p-4 md:p-5">
        <div className="flex items-start gap-3">
          <div className="bg-gradient-to-br from-amber-500 to-orange-500 p-2 rounded-lg shrink-0">
            <Bell size={20} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold neu-text-primary">
              AI Notify Box
            </h3>
            <p className="mt-1 text-sm neu-text-secondary">
              API keys and category settings
            </p>
          </div>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="neu-btn p-2 neu-text-muted hover:neu-text-secondary transition-colors"
            title={isExpanded ? "Collapse" : "Expand"}
          >
            {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
          </button>
        </div>

        {isExpanded && (
          <div className="mt-4">
            {/* Settings Sub-tabs */}
            <div className="flex gap-2 mb-4 border-b border-slate-100 pb-3">
              {[
                {
                  id: "api-keys" as NotifySettingsTab,
                  label: "API Keys",
                  icon: Key,
                },
                {
                  id: "categories" as NotifySettingsTab,
                  label: "Categories",
                  icon: Filter,
                },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setSettingsTab(tab.id)}
                  className={`flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                    settingsTab === tab.id
                      ? "bg-amber-100 text-amber-700"
                      : "text-slate-500 hover:bg-slate-100"
                  }`}
                >
                  <tab.icon size={14} />
                  {tab.label}
                </button>
              ))}
            </div>

            {/* API Keys Settings */}
            {settingsTab === "api-keys" && (
              <div className="space-y-4">
                <div>
                  <p className="text-sm neu-text-secondary mb-3">
                    Use API keys to send notifications via Webhook from external
                    services.
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newKeyName}
                      onChange={(e) => setNewKeyName(e.target.value)}
                      placeholder="Key name (e.g. n8n integration)"
                      className="flex-1 px-3 py-2 neu-input text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                    />
                    <button
                      onClick={handleCreateApiKey}
                      disabled={isCreatingKey || !newKeyName.trim()}
                      className="flex items-center gap-2 px-3 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors disabled:opacity-50 text-sm"
                    >
                      <Plus size={14} />
                      Create
                    </button>
                  </div>

                  {createdKey && (
                    <div className="mt-3 p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                      <p className="text-xs font-medium text-emerald-800 mb-2">
                        API key created! This key will only be shown once.
                      </p>
                      <div className="flex items-center gap-2">
                        <code className="flex-1 px-2 py-1 bg-white border border-emerald-200 rounded text-xs font-mono overflow-x-auto">
                          {createdKey}
                        </code>
                        <button
                          onClick={handleCopyKey}
                          className="p-1.5 text-emerald-600 hover:bg-emerald-100 rounded-lg transition-colors"
                          title="Copy"
                        >
                          <Copy size={14} />
                        </button>
                      </div>
                      <button
                        onClick={() => setCreatedKey(null)}
                        className="mt-2 text-xs text-emerald-600 hover:underline"
                      >
                        Close
                      </button>
                    </div>
                  )}
                </div>

                {apiKeys.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-medium neu-text-secondary uppercase">
                      API Keys
                    </h4>
                    {apiKeys.map((key) => (
                      <div
                        key={key.id}
                        className="flex items-center justify-between p-2 neu-flat rounded-xl"
                      >
                        <div>
                          <p className="text-sm font-medium neu-text-primary">
                            {key.name}
                          </p>
                          <p className="text-xs neu-text-secondary font-mono">
                            {key.keyPrefix}
                          </p>
                          {key.lastUsedAt && (
                            <p className="text-xs neu-text-muted">
                              Last used: {formatRelativeTime(key.lastUsedAt)}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => toggleApiKey(key.id, !key.isActive)}
                            className={`p-1.5 rounded-lg transition-colors ${
                              key.isActive
                                ? "text-emerald-600 hover:bg-emerald-50"
                                : "text-slate-400 hover:bg-slate-100"
                            }`}
                            title={key.isActive ? "Disable" : "Enable"}
                          >
                            {key.isActive ? (
                              <Eye size={14} />
                            ) : (
                              <EyeOff size={14} />
                            )}
                          </button>
                          <button
                            onClick={() => setDeleteApiKeyId(key.id)}
                            className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                            title="Delete"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Categories Settings */}
            {settingsTab === "categories" && (
              <div className="space-y-4">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    placeholder="Category name"
                    className="flex-1 px-3 py-2 neu-input text-sm"
                  />
                  <select
                    value={newCategoryColor}
                    onChange={(e) => setNewCategoryColor(e.target.value)}
                    className="px-3 py-2 neu-input text-sm"
                    title="Category color"
                  >
                    <option value="blue">Blue</option>
                    <option value="green">Green</option>
                    <option value="purple">Purple</option>
                    <option value="orange">Orange</option>
                    <option value="red">Red</option>
                    <option value="pink">Pink</option>
                  </select>
                  <button
                    onClick={handleCreateCategory}
                    disabled={!newCategoryName.trim()}
                    className="flex items-center gap-2 px-3 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors disabled:opacity-50 text-sm"
                  >
                    <Plus size={14} />
                    Add
                  </button>
                </div>

                {categories.length > 0 && (
                  <div className="space-y-2">
                    {categories.map((category) => (
                      <div
                        key={category.id}
                        className="flex items-center justify-between p-2 neu-flat rounded-xl"
                      >
                        <div className="flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{
                              backgroundColor:
                                CATEGORY_COLORS[category.color] || "#64748b",
                            }}
                          />
                          <span className="text-sm font-medium neu-text-primary">
                            {category.name}
                          </span>
                        </div>
                        <button
                          onClick={() => setDeleteCategoryId(category.id)}
                          className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                          title="Delete"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
      <ConfirmDialog
        isOpen={deleteApiKeyId !== null}
        title="Delete API Key"
        message={`Are you sure you want to delete "${apiKeys.find((k) => k.id === deleteApiKeyId)?.name || ""}"? This action cannot be undone.`}
        onConfirm={async () => {
          if (deleteApiKeyId) {
            await removeApiKey(deleteApiKeyId);
            setDeleteApiKeyId(null);
          }
        }}
        onCancel={() => setDeleteApiKeyId(null)}
      />
      <ConfirmDialog
        isOpen={deleteCategoryId !== null}
        title="Delete Category"
        message={`Are you sure you want to delete "${categories.find((c) => c.id === deleteCategoryId)?.name || ""}"?`}
        onConfirm={async () => {
          if (deleteCategoryId) {
            await removeCategory(deleteCategoryId);
            setDeleteCategoryId(null);
          }
        }}
        onCancel={() => setDeleteCategoryId(null)}
      />
    </div>
  );
};

// LINE Integration Card
interface LineIntegrationSettings {
  channelAccessToken: string;
  groupIds: string[];
}

const LINE_DEFAULT: LineIntegrationSettings = {
  channelAccessToken: "",
  groupIds: [],
};

const LineIntegrationCard = () => {
  const {
    value: lineSettings,
    setValue: setLineSettings,
    isLoading,
  } = useUserSetting<LineIntegrationSettings>(
    "line_integration_settings",
    LINE_DEFAULT,
  );

  const [isExpanded, setIsExpanded] = useState(false);
  const [tokenInput, setTokenInput] = useState("");
  const [newGroupId, setNewGroupId] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!isLoading) {
      setTokenInput(lineSettings.channelAccessToken);
    }
  }, [isLoading, lineSettings.channelAccessToken]);

  const handleSaveToken = () => {
    setLineSettings({
      ...lineSettings,
      channelAccessToken: tokenInput.trim(),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleAddGroupId = () => {
    const id = newGroupId.trim();
    if (!id || lineSettings.groupIds.includes(id)) return;
    setLineSettings({
      ...lineSettings,
      groupIds: [...lineSettings.groupIds, id],
    });
    setNewGroupId("");
  };

  const handleRemoveGroupId = (id: string) => {
    setLineSettings({
      ...lineSettings,
      groupIds: lineSettings.groupIds.filter((g) => g !== id),
    });
  };

  return (
    <div className="neu-card overflow-hidden">
      <div className="p-4 md:p-5">
        <div className="flex items-start gap-3">
          <div className="bg-gradient-to-br from-green-500 to-emerald-500 p-2 rounded-lg shrink-0">
            <MessageSquareText size={20} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-lg font-semibold neu-text-primary">
                LINE Integration
              </h3>
              {lineSettings.channelAccessToken && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 text-xs font-medium rounded-full">
                  Connected
                </span>
              )}
            </div>
            <p className="mt-1 text-sm neu-text-secondary">
              Send automation results to LINE groups
            </p>
          </div>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="neu-btn p-2 neu-text-muted hover:neu-text-secondary transition-colors"
            title={isExpanded ? "Collapse" : "Expand"}
          >
            {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
          </button>
        </div>

        {isExpanded && (
          <div className="mt-4 space-y-4">
            {/* Channel Access Token */}
            <div className="space-y-2 p-3 neu-pressed rounded-xl">
              <label className="block text-xs font-medium neu-text-primary">
                Channel Access Token
              </label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type={showToken ? "text" : "password"}
                    value={tokenInput}
                    onChange={(e) => setTokenInput(e.target.value)}
                    placeholder="LINE Messaging API token"
                    className="w-full px-3 py-2 pr-10 neu-input text-sm font-mono"
                  />
                  <button
                    onClick={() => setShowToken(!showToken)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 neu-text-muted hover:neu-text-secondary transition-colors"
                    title={showToken ? "Hide" : "Show"}
                  >
                    {showToken ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                <button
                  onClick={handleSaveToken}
                  disabled={tokenInput === lineSettings.channelAccessToken}
                  className="px-3 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                >
                  {saved ? <CheckCircle size={14} /> : <Save size={14} />}
                  {saved ? "Saved" : "Save"}
                </button>
              </div>
            </div>

            {/* Group IDs */}
            <div className="space-y-2 p-3 neu-pressed rounded-xl">
              <label className="block text-xs font-medium neu-text-primary">
                Group IDs
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newGroupId}
                  onChange={(e) => setNewGroupId(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleAddGroupId();
                  }}
                  placeholder="C1234567890abcdef..."
                  className="flex-1 px-3 py-2 neu-input text-sm font-mono"
                />
                <button
                  onClick={handleAddGroupId}
                  disabled={!newGroupId.trim()}
                  className="px-3 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Plus size={14} />
                </button>
              </div>
              {lineSettings.groupIds.length > 0 && (
                <div className="space-y-1 mt-2">
                  {lineSettings.groupIds.map((gid) => (
                    <div
                      key={gid}
                      className="flex items-center gap-2 px-3 py-1.5 neu-flat rounded-lg"
                    >
                      <span className="flex-1 text-sm font-mono neu-text-secondary truncate">
                        {gid}
                      </span>
                      <button
                        onClick={() => handleRemoveGroupId(gid)}
                        className="text-red-400 hover:text-red-600 transition-colors"
                        title="Remove"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {lineSettings.groupIds.length === 0 && (
                <p className="text-xs neu-text-muted mt-1">
                  No group IDs configured. Add a LINE group ID to enable
                  notifications.
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// RSS Feed Settings Card
const RssFeedCard = () => {
  const { feeds, isLoading, load, addFeed, removeFeed, toggle, update } =
    useRssFeeds();
  const [isExpanded, setIsExpanded] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editUrl, setEditUrl] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [deleteFeedId, setDeleteFeedId] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, [load]);

  const handleAdd = async () => {
    if (!newName.trim() || !newUrl.trim()) return;
    await addFeed({
      name: newName.trim(),
      url: newUrl.trim(),
      category: newCategory.trim() || undefined,
    });
    setNewName("");
    setNewUrl("");
    setNewCategory("");
    setShowForm(false);
  };

  const handleStartEdit = (feed: {
    id: string;
    name: string;
    url: string;
    category?: string;
  }) => {
    setEditingId(feed.id);
    setEditName(feed.name);
    setEditUrl(feed.url);
    setEditCategory(feed.category || "");
  };

  const handleSaveEdit = async () => {
    if (!editingId || !editName.trim() || !editUrl.trim()) return;
    await update(editingId, {
      name: editName.trim(),
      url: editUrl.trim(),
      category: editCategory.trim() || null,
    });
    setEditingId(null);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
  };

  const activeCount = feeds.filter((f) => f.isActive).length;

  return (
    <div className="neu-card overflow-hidden">
      <div className="p-4 md:p-5">
        <div className="flex items-start gap-3">
          <div className="bg-gradient-to-br from-orange-500 to-amber-500 p-2 rounded-lg shrink-0">
            <Rss size={20} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-lg font-semibold neu-text-primary">
                RSS Feeds
              </h3>
              {feeds.length > 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-orange-100 text-orange-700 text-xs font-medium rounded-full">
                  {activeCount} active
                </span>
              )}
            </div>
            <p className="mt-1 text-sm neu-text-secondary">
              Register RSS feeds and browse on the Media page
            </p>
          </div>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="neu-btn p-2 neu-text-muted hover:neu-text-secondary transition-colors"
            title={isExpanded ? "Collapse" : "Expand"}
          >
            {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
          </button>
        </div>

        {isExpanded && (
          <div className="mt-4 space-y-4">
            {!showForm ? (
              <button
                onClick={() => setShowForm(true)}
                className="flex items-center gap-2 px-3 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors text-sm"
              >
                <Plus size={14} />
                Add RSS Feed
              </button>
            ) : (
              <div className="space-y-3 p-3 neu-pressed rounded-xl">
                <div>
                  <label className="block text-xs font-medium neu-text-primary mb-1">
                    Name
                  </label>
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Tech News"
                    className="w-full px-3 py-2 neu-input text-sm"
                  />
                </div>
                <UrlInput
                  label="URL"
                  value={newUrl}
                  onChange={setNewUrl}
                  placeholder="https://example.com/feed.xml"
                  showValidation={false}
                />
                <div>
                  <label className="block text-xs font-medium neu-text-primary mb-1">
                    Category (optional)
                  </label>
                  <input
                    type="text"
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    placeholder="Tech"
                    className="w-full px-3 py-2 neu-input text-sm"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleAdd}
                    disabled={!newName.trim() || !newUrl.trim()}
                    className="px-3 py-1.5 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors text-sm disabled:opacity-50"
                  >
                    Add
                  </button>
                  <button
                    onClick={() => setShowForm(false)}
                    className="px-3 py-1.5 neu-text-secondary hover:bg-slate-100 rounded-lg transition-colors text-sm"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {isLoading ? (
              <Loader2 size={20} className="animate-spin neu-text-secondary" />
            ) : feeds.length > 0 ? (
              <div className="space-y-2">
                <h4 className="text-xs font-medium neu-text-secondary uppercase">
                  Registered Feeds
                </h4>
                {feeds.map((feed) => (
                  <div key={feed.id} className="p-2 neu-flat rounded-xl">
                    {editingId === feed.id ? (
                      <div className="space-y-2">
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          placeholder="Name"
                          className="w-full px-2 py-1.5 border border-slate-200 rounded text-sm"
                        />
                        <UrlInput
                          value={editUrl}
                          onChange={setEditUrl}
                          placeholder="URL"
                          showValidation={false}
                        />
                        <input
                          type="text"
                          value={editCategory}
                          onChange={(e) => setEditCategory(e.target.value)}
                          placeholder="Category (optional)"
                          className="w-full px-2 py-1.5 border border-slate-200 rounded text-sm"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={handleSaveEdit}
                            className="flex items-center gap-1 px-2 py-1 bg-orange-500 text-white rounded text-xs"
                          >
                            <Save size={12} /> Save
                          </button>
                          <button
                            onClick={handleCancelEdit}
                            className="px-2 py-1 neu-text-secondary hover:bg-slate-100 rounded text-xs"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium neu-text-primary truncate">
                            {feed.name}
                          </p>
                          <p className="text-xs neu-text-secondary truncate">
                            {feed.url}
                          </p>
                          {feed.category && (
                            <span className="inline-block mt-1 px-2 py-0.5 bg-slate-200 neu-text-secondary text-xs rounded">
                              {feed.category}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0 ml-2">
                          <button
                            onClick={() => handleStartEdit(feed)}
                            className="p-1.5 text-slate-400 hover:text-orange-600 hover:bg-orange-50 rounded-lg transition-colors"
                            title="Edit"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            onClick={() => toggle(feed.id, !feed.isActive)}
                            className={`p-1.5 rounded-lg transition-colors ${
                              feed.isActive
                                ? "text-emerald-600 hover:bg-emerald-50"
                                : "text-slate-400 hover:bg-slate-100"
                            }`}
                            title={feed.isActive ? "Disable" : "Enable"}
                          >
                            {feed.isActive ? (
                              <Eye size={14} />
                            ) : (
                              <EyeOff size={14} />
                            )}
                          </button>
                          <button
                            onClick={() => setDeleteFeedId(feed.id)}
                            className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                            title="Delete"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        )}
      </div>
      <ConfirmDialog
        isOpen={deleteFeedId !== null}
        title="Delete RSS Feed"
        message={`Are you sure you want to delete "${feeds.find((f) => f.id === deleteFeedId)?.name || ""}"?`}
        onConfirm={async () => {
          if (deleteFeedId) {
            await removeFeed(deleteFeedId);
            setDeleteFeedId(null);
          }
        }}
        onCancel={() => setDeleteFeedId(null)}
      />
    </div>
  );
};

// X Source Settings Card
const XSourceCard = () => {
  const { sources, isLoading, load, addSource, removeSource, toggle, update } =
    useXSources();
  const [isExpanded, setIsExpanded] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newSourceType, setNewSourceType] = useState<"account" | "keyword">(
    "account",
  );
  const [newQuery, setNewQuery] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editSourceType, setEditSourceType] = useState<"account" | "keyword">(
    "account",
  );
  const [editQuery, setEditQuery] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [deleteSourceId, setDeleteSourceId] = useState<string | null>(null);

  // Auto-fetch toggle state
  const [isAutoFetchActive, setIsAutoFetchActive] = useState(true);
  const [isTogglingActive, setIsTogglingActive] = useState(false);
  const [alertState, setAlertState] = useState<{
    isOpen: boolean;
    type: "error" | "success";
    title: string;
    message: string;
  }>({ isOpen: false, type: "error", title: "", message: "" });

  useEffect(() => {
    load();
  }, [load]);

  // Load auto-fetch active state
  useEffect(() => {
    const loadActive = async () => {
      try {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        if (!supabaseUrl || !supabase) return;

        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session?.access_token) return;

        const response = await fetch(
          `${supabaseUrl}/functions/v1/update_cron_schedule`,
          {
            method: "GET",
            headers: {
              Authorization: `Bearer ${session.access_token}`,
            },
          },
        );

        if (response.ok) {
          const result = await response.json();
          if (result.schedules && Array.isArray(result.schedules)) {
            const job = result.schedules.find(
              (s: { job_name: string }) => s.job_name === "fetch-x-posts",
            );
            if (job && typeof job.active === "boolean") {
              setIsAutoFetchActive(job.active);
            }
          }
        }
      } catch (err) {
        console.error("Failed to load X Posts auto-fetch state:", err);
      }
    };
    loadActive();
  }, []);

  const handleToggleAutoFetch = async () => {
    setIsTogglingActive(true);
    try {
      if (!supabase) return;

      const newActive = !isAutoFetchActive;
      const { data, error } = await supabase.functions.invoke(
        "update_cron_schedule",
        {
          body: { job_name: "fetch-x-posts", active: newActive },
        },
      );

      if (error) {
        setAlertState({
          isOpen: true,
          type: "error",
          title: "Error",
          message: "Failed to toggle auto-fetch",
        });
        return;
      }

      if (data?.success) {
        setIsAutoFetchActive(newActive);
      } else {
        setAlertState({
          isOpen: true,
          type: "error",
          title: "Error",
          message: data?.error || "Failed to toggle auto-fetch",
        });
      }
    } catch (err) {
      console.error("Failed to toggle auto-fetch:", err);
      setAlertState({
        isOpen: true,
        type: "error",
        title: "Error",
        message: "Failed to toggle auto-fetch",
      });
    } finally {
      setIsTogglingActive(false);
    }
  };

  const handleAdd = async () => {
    if (!newName.trim() || !newQuery.trim()) return;
    await addSource({
      name: newName.trim(),
      sourceType: newSourceType,
      query: newQuery.trim(),
      category: newCategory.trim() || undefined,
    });
    setNewName("");
    setNewQuery("");
    setNewCategory("");
    setShowForm(false);
  };

  const handleStartEdit = (source: {
    id: string;
    name: string;
    sourceType: "account" | "keyword";
    query: string;
    category?: string;
  }) => {
    setEditingId(source.id);
    setEditName(source.name);
    setEditSourceType(source.sourceType);
    setEditQuery(source.query);
    setEditCategory(source.category || "");
  };

  const handleSaveEdit = async () => {
    if (!editingId || !editName.trim() || !editQuery.trim()) return;
    await update(editingId, {
      name: editName.trim(),
      sourceType: editSourceType,
      query: editQuery.trim(),
      category: editCategory.trim() || null,
    });
    setEditingId(null);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
  };

  const activeCount = sources.filter((s) => s.isActive).length;

  return (
    <div className="neu-card overflow-hidden">
      <div className="p-4 md:p-5">
        <div className="flex items-start gap-3">
          <div className="bg-gradient-to-br from-sky-500 to-blue-500 p-2 rounded-lg shrink-0">
            <Twitter size={20} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-lg font-semibold neu-text-primary">
                X (Twitter)
              </h3>
              {sources.length > 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-sky-100 text-sky-700 text-xs font-medium rounded-full">
                  {activeCount} active
                </span>
              )}
            </div>
            <p className="mt-1 text-sm neu-text-secondary">
              Collect X posts by account or keyword
            </p>
          </div>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="neu-btn p-2 neu-text-muted hover:neu-text-secondary transition-colors"
            title={isExpanded ? "Collapse" : "Expand"}
          >
            {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
          </button>
        </div>

        {isExpanded && (
          <div className="mt-4 space-y-4">
            {!showForm ? (
              <button
                onClick={() => setShowForm(true)}
                className="flex items-center gap-2 px-3 py-2 bg-sky-500 text-white rounded-lg hover:bg-sky-600 transition-colors text-sm"
              >
                <Plus size={14} />
                Add X Source
              </button>
            ) : (
              <div className="space-y-3 p-3 neu-pressed rounded-xl">
                <div>
                  <label className="block text-xs font-medium neu-text-primary mb-1">
                    Name
                  </label>
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Elon Musk / AI News"
                    className="w-full px-3 py-2 neu-input text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium neu-text-primary mb-1">
                    Type
                  </label>
                  <select
                    value={newSourceType}
                    onChange={(e) =>
                      setNewSourceType(e.target.value as "account" | "keyword")
                    }
                    className="w-full px-3 py-2 neu-input text-sm"
                  >
                    <option value="account">Account</option>
                    <option value="keyword">Keyword</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium neu-text-primary mb-1">
                    {newSourceType === "account"
                      ? "Username (without @)"
                      : "Search keyword"}
                  </label>
                  <input
                    type="text"
                    value={newQuery}
                    onChange={(e) => setNewQuery(e.target.value)}
                    placeholder={
                      newSourceType === "account"
                        ? "elonmusk"
                        : "#AI OR artificial intelligence"
                    }
                    className="w-full px-3 py-2 neu-input text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium neu-text-primary mb-1">
                    Category (optional)
                  </label>
                  <input
                    type="text"
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    placeholder="Tech"
                    className="w-full px-3 py-2 neu-input text-sm"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleAdd}
                    disabled={!newName.trim() || !newQuery.trim()}
                    className="px-3 py-1.5 bg-sky-500 text-white rounded-lg hover:bg-sky-600 transition-colors text-sm disabled:opacity-50"
                  >
                    Add
                  </button>
                  <button
                    onClick={() => setShowForm(false)}
                    className="px-3 py-1.5 neu-text-secondary hover:bg-slate-100 rounded-lg transition-colors text-sm"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {isLoading ? (
              <Loader2 size={20} className="animate-spin neu-text-secondary" />
            ) : sources.length > 0 ? (
              <div className="space-y-2">
                <h4 className="text-xs font-medium neu-text-secondary uppercase">
                  Registered Sources
                </h4>
                {sources.map((source) => (
                  <div key={source.id} className="p-2 neu-flat rounded-xl">
                    {editingId === source.id ? (
                      <div className="space-y-2">
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          placeholder="Name"
                          className="w-full px-2 py-1.5 border border-slate-200 rounded text-sm"
                        />
                        <select
                          value={editSourceType}
                          onChange={(e) =>
                            setEditSourceType(
                              e.target.value as "account" | "keyword",
                            )
                          }
                          className="w-full px-2 py-1.5 border border-slate-200 rounded text-sm"
                        >
                          <option value="account">Account</option>
                          <option value="keyword">Keyword</option>
                        </select>
                        <input
                          type="text"
                          value={editQuery}
                          onChange={(e) => setEditQuery(e.target.value)}
                          placeholder="Query"
                          className="w-full px-2 py-1.5 border border-slate-200 rounded text-sm"
                        />
                        <input
                          type="text"
                          value={editCategory}
                          onChange={(e) => setEditCategory(e.target.value)}
                          placeholder="Category (optional)"
                          className="w-full px-2 py-1.5 border border-slate-200 rounded text-sm"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={handleSaveEdit}
                            className="flex items-center gap-1 px-2 py-1 bg-sky-500 text-white rounded text-xs"
                          >
                            <Save size={12} /> Save
                          </button>
                          <button
                            onClick={handleCancelEdit}
                            className="px-2 py-1 neu-text-secondary hover:bg-slate-100 rounded text-xs"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium neu-text-primary truncate">
                            {source.name}
                          </p>
                          <p className="text-xs neu-text-secondary truncate">
                            {source.sourceType === "account" ? "@" : ""}
                            {source.query}
                          </p>
                          <div className="flex items-center gap-1 mt-1">
                            <span className="inline-block px-2 py-0.5 bg-sky-100 text-sky-700 text-xs rounded">
                              {source.sourceType === "account"
                                ? "Account"
                                : "Keyword"}
                            </span>
                            {source.category && (
                              <span className="inline-block px-2 py-0.5 bg-slate-200 neu-text-secondary text-xs rounded">
                                {source.category}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0 ml-2">
                          <button
                            onClick={() => handleStartEdit(source)}
                            className="p-1.5 text-slate-400 hover:text-sky-600 hover:bg-sky-50 rounded-lg transition-colors"
                            title="Edit"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            onClick={() => toggle(source.id, !source.isActive)}
                            className={`p-1.5 rounded-lg transition-colors ${
                              source.isActive
                                ? "text-emerald-600 hover:bg-emerald-50"
                                : "text-slate-400 hover:bg-slate-100"
                            }`}
                            title={source.isActive ? "Disable" : "Enable"}
                          >
                            {source.isActive ? (
                              <Eye size={14} />
                            ) : (
                              <EyeOff size={14} />
                            )}
                          </button>
                          <button
                            onClick={() => setDeleteSourceId(source.id)}
                            className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                            title="Delete"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : null}

            {/* Auto-fetch Toggle */}
            <div className="mt-4 pt-4 border-t border-slate-200">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-semibold neu-text-primary">
                    Auto Fetch
                  </h4>
                  <p className="text-xs neu-text-secondary mt-0.5">
                    Automatically fetch X posts on schedule
                  </p>
                </div>
                <button
                  onClick={handleToggleAutoFetch}
                  disabled={isTogglingActive}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50 ${
                    isAutoFetchActive ? "bg-sky-500" : "bg-slate-300"
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      isAutoFetchActive ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      <ConfirmDialog
        isOpen={deleteSourceId !== null}
        title="Delete X Source"
        message={`Are you sure you want to delete "${sources.find((s) => s.id === deleteSourceId)?.name || ""}"?`}
        onConfirm={async () => {
          if (deleteSourceId) {
            await removeSource(deleteSourceId);
            setDeleteSourceId(null);
          }
        }}
        onCancel={() => setDeleteSourceId(null)}
      />
      <AlertDialog
        isOpen={alertState.isOpen}
        type={alertState.type}
        title={alertState.title}
        message={alertState.message}
        onClose={() =>
          setAlertState({
            isOpen: false,
            type: "error",
            title: "",
            message: "",
          })
        }
      />
    </div>
  );
};

// Task Notification Settings Card
const TaskNotificationSettingsCard = () => {
  const { user } = useAuth();
  const {
    settings,
    isLoading,
    permissionStatus,
    updateSetting,
    requestPermission,
    resetToDefaults,
  } = useNotificationSettings();

  const [isExpanded, setIsExpanded] = useState(false);
  const [isRequestingPermission, setIsRequestingPermission] = useState(false);
  const [isTogglingPush, setIsTogglingPush] = useState(false);

  const handleRequestPermission = async () => {
    setIsRequestingPermission(true);
    await requestPermission();
    setIsRequestingPermission(false);
  };

  const handleTogglePush = async (enabled: boolean) => {
    if (!user) return;
    setIsTogglingPush(true);

    try {
      if (enabled) {
        // Request permission first if needed
        if (permissionStatus !== "granted") {
          const granted = await requestPermission();
          if (!granted) {
            setIsTogglingPush(false);
            return;
          }
        }
        // Register push subscription
        const success = await registerPushSubscription(user.id);
        if (success) {
          await updateSetting("pushNotificationsEnabled", true);
        }
      } else {
        // Unregister push subscription
        await unregisterPushSubscription(user.id);
        await updateSetting("pushNotificationsEnabled", false);
      }
    } catch (err) {
      console.error("Failed to toggle push notifications:", err);
    }

    setIsTogglingPush(false);
  };

  if (isLoading) {
    return (
      <div className="neu-card p-4 md:p-5">
        <div className="animate-pulse flex items-center gap-3">
          <div className="w-10 h-10 bg-slate-200 rounded-lg" />
          <div className="flex-1">
            <div className="h-4 bg-slate-200 rounded w-1/3 mb-2" />
            <div className="h-3 bg-slate-100 rounded w-2/3" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="neu-card overflow-hidden">
      <div className="p-4 md:p-5">
        <div className="flex items-start gap-3">
          <div className="bg-gradient-to-br from-rose-500 to-pink-500 p-2 rounded-lg shrink-0">
            <Bell size={20} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-lg font-semibold neu-text-primary">
                Task Notifications
              </h3>
              {permissionStatus === "granted" &&
                settings.taskNotificationsEnabled && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-100 text-emerald-700 text-xs font-medium rounded-full">
                    <CheckCircle size={12} />
                    Enabled
                  </span>
                )}
              {permissionStatus === "denied" && (
                <span className="inline-flex items-center px-2 py-0.5 bg-red-100 text-red-700 text-xs font-medium rounded-full">
                  Blocked
                </span>
              )}
            </div>
            <p className="mt-1 text-sm neu-text-secondary">
              Receive reminder notifications before task deadlines
            </p>
          </div>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="neu-btn p-2 neu-text-muted hover:neu-text-secondary transition-colors"
            title={isExpanded ? "Collapse" : "Expand"}
          >
            {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
          </button>
        </div>

        {isExpanded && (
          <div className="mt-4 space-y-4">
            {/* Permission Status */}
            {permissionStatus !== "granted" && (
              <div
                className={`p-3 rounded-lg ${
                  permissionStatus === "denied"
                    ? "bg-red-50 border border-red-200"
                    : "bg-amber-50 border border-amber-200"
                }`}
              >
                <p
                  className={`text-sm ${
                    permissionStatus === "denied"
                      ? "text-red-700"
                      : "text-amber-700"
                  }`}
                >
                  {permissionStatus === "denied"
                    ? "Notifications are blocked in your browser. Please allow them in settings."
                    : "Browser permission is required to receive notifications."}
                </p>
                {permissionStatus !== "denied" && (
                  <button
                    onClick={handleRequestPermission}
                    disabled={isRequestingPermission}
                    className="mt-2 px-3 py-1.5 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 transition-colors disabled:opacity-50"
                  >
                    {isRequestingPermission
                      ? "Checking..."
                      : "Allow Notifications"}
                  </button>
                )}
              </div>
            )}

            {/* Task Notifications Toggle */}
            <div className="flex items-center justify-between p-3 neu-flat rounded-xl">
              <div>
                <p className="text-sm font-medium neu-text-primary">
                  Task Notifications
                </p>
                <p className="text-xs neu-text-secondary">
                  Show reminders before deadlines
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  updateSetting(
                    "taskNotificationsEnabled",
                    !settings.taskNotificationsEnabled,
                  )
                }
                className={`relative w-12 h-6 rounded-full transition-colors cursor-pointer ${
                  settings.taskNotificationsEnabled
                    ? "bg-emerald-500"
                    : "bg-slate-300"
                }`}
                title={settings.taskNotificationsEnabled ? "Disable" : "Enable"}
              >
                <span
                  className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow transition-transform pointer-events-none ${
                    settings.taskNotificationsEnabled
                      ? "translate-x-6"
                      : "translate-x-0"
                  }`}
                />
              </button>
            </div>

            {/* Reminder Time */}
            <div className="p-3 neu-flat rounded-xl">
              <label className="block text-sm font-medium neu-text-primary mb-2">
                Reminder Time
              </label>
              <select
                value={settings.reminderMinutes}
                onChange={(e) =>
                  updateSetting("reminderMinutes", Number(e.target.value))
                }
                className="w-full px-3 py-2 neu-input text-sm"
                disabled={!settings.taskNotificationsEnabled}
                title="Reminder Time"
              >
                {REMINDER_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Exact Time Notification */}
            <div className="flex items-center justify-between p-3 neu-flat rounded-xl">
              <div>
                <p className="text-sm font-medium neu-text-primary">
                  Notify at Due Time
                </p>
                <p className="text-xs neu-text-secondary">
                  Also notify at the exact task deadline
                </p>
              </div>
              <button
                onClick={() =>
                  updateSetting(
                    "exactTimeNotification",
                    !settings.exactTimeNotification,
                  )
                }
                disabled={!settings.taskNotificationsEnabled}
                className={`relative w-12 h-6 rounded-full transition-colors ${
                  settings.exactTimeNotification &&
                  settings.taskNotificationsEnabled
                    ? "bg-emerald-500"
                    : "bg-slate-300"
                } ${!settings.taskNotificationsEnabled ? "opacity-50" : ""}`}
                title={settings.exactTimeNotification ? "Disable" : "Enable"}
              >
                <span
                  className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                    settings.exactTimeNotification &&
                    settings.taskNotificationsEnabled
                      ? "translate-x-6"
                      : "translate-x-0"
                  }`}
                />
              </button>
            </div>

            {/* Push Notifications */}
            <div className="flex items-center justify-between p-3 neu-flat rounded-xl">
              <div>
                <p className="text-sm font-medium neu-text-primary">
                  Push Notifications
                </p>
                <p className="text-xs neu-text-secondary">
                  Tasks, calendar reminders via server-side push
                </p>
              </div>
              <button
                onClick={() =>
                  handleTogglePush(!settings.pushNotificationsEnabled)
                }
                disabled={isTogglingPush || permissionStatus === "denied"}
                className={`relative w-12 h-6 rounded-full transition-colors ${
                  settings.pushNotificationsEnabled
                    ? "bg-emerald-500"
                    : "bg-slate-300"
                } ${isTogglingPush || permissionStatus === "denied" ? "opacity-50" : ""}`}
                title={settings.pushNotificationsEnabled ? "Disable" : "Enable"}
              >
                <span
                  className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                    settings.pushNotificationsEnabled
                      ? "translate-x-6"
                      : "translate-x-0"
                  }`}
                />
              </button>
            </div>

            {/* Sound */}
            <div className="flex items-center justify-between p-3 neu-flat rounded-xl">
              <div>
                <p className="text-sm font-medium neu-text-primary">
                  Notification Sound
                </p>
                <p className="text-xs neu-text-secondary">
                  Play sound when a notification is received
                </p>
              </div>
              <button
                onClick={() =>
                  updateSetting("soundEnabled", !settings.soundEnabled)
                }
                className={`relative w-12 h-6 rounded-full transition-colors ${
                  settings.soundEnabled ? "bg-emerald-500" : "bg-slate-300"
                }`}
                title={settings.soundEnabled ? "Disable" : "Enable"}
              >
                <span
                  className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                    settings.soundEnabled ? "translate-x-6" : "translate-x-0"
                  }`}
                />
              </button>
            </div>

            {/* Daily Summary */}
            <div className="p-3 neu-flat rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium neu-text-primary">
                    Daily Summary
                  </p>
                  <p className="text-xs neu-text-secondary">
                    Notify today's tasks at a set time each day
                  </p>
                </div>
                <button
                  onClick={() =>
                    updateSetting(
                      "dailySummaryEnabled",
                      !settings.dailySummaryEnabled,
                    )
                  }
                  className={`relative w-12 h-6 rounded-full transition-colors ${
                    settings.dailySummaryEnabled
                      ? "bg-emerald-500"
                      : "bg-slate-300"
                  }`}
                  title={settings.dailySummaryEnabled ? "Disable" : "Enable"}
                >
                  <span
                    className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                      settings.dailySummaryEnabled
                        ? "translate-x-6"
                        : "translate-x-0"
                    }`}
                  />
                </button>
              </div>
              {settings.dailySummaryEnabled && (
                <div>
                  <TimePicker
                    label="Notification Time"
                    value={settings.dailySummaryTime}
                    onChange={(value) =>
                      updateSetting("dailySummaryTime", value)
                    }
                  />
                </div>
              )}
            </div>

            {/* Reset Button */}
            <button
              onClick={resetToDefaults}
              className="w-full px-3 py-2 text-sm neu-text-secondary hover:bg-slate-100 rounded-lg transition-colors"
            >
              Reset to Defaults
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// Proactive Agent Settings Card
const ProactiveAgentSettingsCard = () => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [openSection, setOpenSection] = useState<string | null>(null);
  const {
    value: settings,
    setValue: setSettings,
    isLoading,
  } = useUserSetting<ProactiveAgentSettings>(
    "proactive_agent_settings",
    DEFAULT_PROACTIVE_SETTINGS,
  );

  if (isLoading) {
    return (
      <div className="neu-card p-4 md:p-5">
        <div className="animate-pulse flex items-center gap-3">
          <div className="w-10 h-10 bg-slate-200 rounded-lg" />
          <div className="flex-1">
            <div className="h-4 bg-slate-200 rounded w-1/3 mb-2" />
            <div className="h-3 bg-slate-100 rounded w-2/3" />
          </div>
        </div>
      </div>
    );
  }

  const mergedSettings: ProactiveAgentSettings = {
    ...DEFAULT_PROACTIVE_SETTINGS,
    ...settings,
    data_sources: {
      ...DEFAULT_PROACTIVE_SETTINGS.data_sources,
      ...(settings?.data_sources ?? {}),
    },
    agent_roles: {
      ...DEFAULT_AGENT_ROLES,
      ...(settings?.agent_roles ?? {}),
    },
  };

  const toggleSource = (key: keyof ProactiveAgentSettings["data_sources"]) => {
    setSettings({
      ...mergedSettings,
      data_sources: {
        ...mergedSettings.data_sources,
        [key]: !mergedSettings.data_sources[key],
      },
    });
  };

  const toggleSection = (name: string) =>
    setOpenSection((prev) => (prev === name ? null : name));

  const rangeClass =
    "w-full h-1.5 bg-slate-200 rounded-full appearance-none cursor-pointer " +
    "[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 " +
    "[&::-webkit-slider-thumb]:bg-violet-500 [&::-webkit-slider-thumb]:rounded-full " +
    "[&::-webkit-slider-thumb]:shadow [&::-webkit-slider-thumb]:cursor-pointer";

  return (
    <div className="neu-card overflow-hidden">
      <div className="p-4 md:p-5">
        <div className="flex items-start gap-3">
          <div className="bg-gradient-to-br from-violet-500 to-purple-600 p-2 rounded-lg shrink-0">
            <BrainCircuit size={20} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-lg font-semibold neu-text-primary">
                Proactive Agent
              </h3>
              {mergedSettings.enabled && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-violet-100 text-violet-700 text-xs font-medium rounded-full">
                  <CheckCircle size={12} />
                  Enabled
                </span>
              )}
            </div>
            <p className="mt-1 text-sm neu-text-secondary">
              AI analyzes your data and proactively notifies you
            </p>
          </div>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="neu-btn p-2 neu-text-muted hover:neu-text-secondary transition-colors"
            title={isExpanded ? "Collapse" : "Expand"}
          >
            {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
          </button>
        </div>

        {isExpanded && (
          <div className="mt-4 space-y-4">
            {/* Enable Toggle */}
            <div className="flex items-center justify-between p-3 neu-flat rounded-xl">
              <div>
                <p className="text-sm font-medium neu-text-primary">
                  Proactive Agent
                </p>
                <p className="text-xs neu-text-secondary">
                  Enable AI-driven proactive insights
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  setSettings({
                    ...mergedSettings,
                    enabled: !mergedSettings.enabled,
                  })
                }
                className={`relative w-12 h-6 rounded-full transition-colors ${
                  mergedSettings.enabled ? "bg-violet-500" : "bg-slate-300"
                }`}
                title={mergedSettings.enabled ? "Disable" : "Enable"}
              >
                <span
                  className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                    mergedSettings.enabled ? "translate-x-6" : "translate-x-0"
                  }`}
                />
              </button>
            </div>

            {mergedSettings.enabled && (
              <>
                {/* AI Model */}
                <div>
                  <label className="text-xs neu-text-secondary mb-1 block">
                    AI Model
                  </label>
                  <select
                    value={mergedSettings.ai_model}
                    onChange={(e) =>
                      setSettings({
                        ...mergedSettings,
                        ai_model: e.target.value as
                          | "gemini"
                          | "openai"
                          | "anthropic",
                      })
                    }
                    className="w-full px-3 py-2 text-sm neu-input"
                  >
                    <option value="gemini">Gemini 2.5 Flash</option>
                    <option value="openai">GPT-4.1 mini</option>
                    <option value="anthropic">Claude Sonnet 4.6</option>
                  </select>
                </div>

                {/* Data Sources */}
                <div>
                  <label className="text-xs neu-text-secondary mb-2 block">
                    Data Sources
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {(
                      Object.entries(DATA_SOURCE_LABELS) as [
                        keyof ProactiveAgentSettings["data_sources"],
                        string,
                      ][]
                    ).map(([key, label]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => toggleSource(key)}
                        className={`text-xs px-3 py-2 rounded-lg border transition-colors text-left ${
                          mergedSettings.data_sources[key]
                            ? "bg-violet-50 border-violet-300 text-violet-700"
                            : "bg-white border-slate-200 text-slate-400"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* ── Agent Team Mode ── */}
                <div className="neu-flat rounded-xl overflow-hidden">
                  <button
                    type="button"
                    onClick={() => toggleSection("team")}
                    className="w-full flex items-center justify-between p-3"
                  >
                    <div className="flex items-center gap-2">
                      <Users size={14} className="text-violet-500" />
                      <span className="text-sm font-medium neu-text-primary">
                        Agent Team Mode
                      </span>
                      {mergedSettings.team_mode && (
                        <span className="w-1.5 h-1.5 bg-violet-500 rounded-full" />
                      )}
                    </div>
                    {openSection === "team" ? (
                      <ChevronUp size={16} className="neu-text-muted" />
                    ) : (
                      <ChevronDown size={16} className="neu-text-muted" />
                    )}
                  </button>
                  {openSection === "team" && (
                    <div className="px-3 pb-3 space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs font-medium neu-text-primary">
                            Team Mode
                          </p>
                          <p className="text-[11px] neu-text-secondary">
                            専門エージェントチームが分析を分担
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            setSettings({
                              ...mergedSettings,
                              team_mode: !mergedSettings.team_mode,
                            })
                          }
                          className={`relative w-10 h-5 rounded-full transition-colors ${
                            mergedSettings.team_mode
                              ? "bg-violet-500"
                              : "bg-slate-300"
                          }`}
                        >
                          <span
                            className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                              mergedSettings.team_mode
                                ? "translate-x-5"
                                : "translate-x-0"
                            }`}
                          />
                        </button>
                      </div>

                      {mergedSettings.team_mode && (
                        <div className="space-y-2">
                          <p className="text-[11px] neu-text-secondary">
                            Active Agents
                          </p>
                          {AGENT_ROLE_LABELS.map(
                            ({ name, label, description }) => {
                              const roles =
                                mergedSettings.agent_roles ??
                                DEFAULT_AGENT_ROLES;
                              const isOn = roles[name]?.enabled ?? true;
                              return (
                                <button
                                  key={name}
                                  type="button"
                                  onClick={() => {
                                    const current =
                                      mergedSettings.agent_roles ??
                                      DEFAULT_AGENT_ROLES;
                                    setSettings({
                                      ...mergedSettings,
                                      agent_roles: {
                                        ...current,
                                        [name]: {
                                          ...current[name],
                                          enabled: !isOn,
                                        },
                                      },
                                    });
                                  }}
                                  className={`w-full text-left px-3 py-2 rounded-lg border transition-colors ${
                                    isOn
                                      ? "bg-violet-50 border-violet-300"
                                      : "bg-white border-slate-200"
                                  }`}
                                >
                                  <div className="flex items-center justify-between">
                                    <span
                                      className={`text-xs font-medium ${
                                        isOn
                                          ? "text-violet-700"
                                          : "text-slate-400"
                                      }`}
                                    >
                                      {label}
                                    </span>
                                    <span
                                      className={`text-[10px] ${
                                        isOn
                                          ? "text-violet-500"
                                          : "text-slate-300"
                                      }`}
                                    >
                                      {isOn ? "ON" : "OFF"}
                                    </span>
                                  </div>
                                  <p
                                    className={`text-[10px] mt-0.5 ${
                                      isOn
                                        ? "text-violet-500"
                                        : "text-slate-300"
                                    }`}
                                  >
                                    {description}
                                  </p>
                                </button>
                              );
                            },
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Push notification setting */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium neu-text-primary">
                      Push: High/Urgent only
                    </p>
                    <p className="text-[11px] neu-text-secondary">
                      Only send push for high priority insights
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setSettings({
                        ...mergedSettings,
                        push_high_only: !mergedSettings.push_high_only,
                      })
                    }
                    className={`relative w-10 h-5 rounded-full transition-colors ${
                      mergedSettings.push_high_only
                        ? "bg-violet-500"
                        : "bg-slate-300"
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                        mergedSettings.push_high_only
                          ? "translate-x-5"
                          : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>

                {/* ── Generation Settings ── */}
                <div className="neu-flat rounded-xl overflow-hidden">
                  <button
                    type="button"
                    onClick={() => toggleSection("generation")}
                    className="w-full flex items-center justify-between p-3"
                  >
                    <div className="flex items-center gap-2">
                      <SlidersHorizontal
                        size={14}
                        className="text-violet-500"
                      />
                      <span className="text-sm font-medium neu-text-primary">
                        Generation
                      </span>
                    </div>
                    {openSection === "generation" ? (
                      <ChevronUp size={16} className="neu-text-muted" />
                    ) : (
                      <ChevronDown size={16} className="neu-text-muted" />
                    )}
                  </button>
                  {openSection === "generation" && (
                    <div className="px-3 pb-3 space-y-4">
                      {/* Temperature */}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-xs neu-text-secondary">
                            Temperature
                          </label>
                          <span className="text-xs font-mono text-violet-600">
                            {mergedSettings.temperature.toFixed(1)}
                          </span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={1}
                          step={0.1}
                          value={mergedSettings.temperature}
                          onChange={(e) =>
                            setSettings({
                              ...mergedSettings,
                              temperature: parseFloat(e.target.value),
                            })
                          }
                          className={rangeClass}
                        />
                        <div className="flex justify-between text-[10px] neu-text-muted mt-0.5">
                          <span>Precise</span>
                          <span>Creative</span>
                        </div>
                      </div>

                      {/* Max Insights */}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-xs neu-text-secondary">
                            Max Insights / Run
                          </label>
                          <span className="text-xs font-mono text-violet-600">
                            {mergedSettings.max_insights}
                          </span>
                        </div>
                        <input
                          type="range"
                          min={1}
                          max={10}
                          step={1}
                          value={mergedSettings.max_insights}
                          onChange={(e) =>
                            setSettings({
                              ...mergedSettings,
                              max_insights: parseInt(e.target.value, 10),
                            })
                          }
                          className={rangeClass}
                        />
                        <div className="flex justify-between text-[10px] neu-text-muted mt-0.5">
                          <span>1</span>
                          <span>10</span>
                        </div>
                      </div>

                      {/* Max Tokens */}
                      <div>
                        <label className="text-xs neu-text-secondary mb-1 block">
                          Max Response Tokens
                        </label>
                        <select
                          value={mergedSettings.max_tokens}
                          onChange={(e) =>
                            setSettings({
                              ...mergedSettings,
                              max_tokens: parseInt(e.target.value, 10),
                            })
                          }
                          className="w-full px-3 py-2 text-sm neu-input"
                        >
                          <option value={1024}>1,024 (Short)</option>
                          <option value={2048}>2,048 (Default)</option>
                          <option value={4096}>4,096 (Long)</option>
                        </select>
                      </div>
                    </div>
                  )}
                </div>

                {/* ── Behavior Settings ── */}
                <div className="neu-flat rounded-xl overflow-hidden">
                  <button
                    type="button"
                    onClick={() => toggleSection("behavior")}
                    className="w-full flex items-center justify-between p-3"
                  >
                    <div className="flex items-center gap-2">
                      <Timer size={14} className="text-violet-500" />
                      <span className="text-sm font-medium neu-text-primary">
                        Behavior
                      </span>
                    </div>
                    {openSection === "behavior" ? (
                      <ChevronUp size={16} className="neu-text-muted" />
                    ) : (
                      <ChevronDown size={16} className="neu-text-muted" />
                    )}
                  </button>
                  {openSection === "behavior" && (
                    <div className="px-3 pb-3 space-y-4">
                      {/* Min Run Interval */}
                      <div>
                        <label className="text-xs neu-text-secondary mb-1 block">
                          Min Run Interval
                        </label>
                        <select
                          value={mergedSettings.min_interval_minutes}
                          onChange={(e) =>
                            setSettings({
                              ...mergedSettings,
                              min_interval_minutes: parseInt(
                                e.target.value,
                                10,
                              ),
                            })
                          }
                          className="w-full px-3 py-2 text-sm neu-input"
                        >
                          <option value={15}>15 min</option>
                          <option value={30}>30 min (Default)</option>
                          <option value={60}>1 hour</option>
                          <option value={120}>2 hours</option>
                        </select>
                        <p className="text-[10px] neu-text-muted mt-1">
                          Cron runs every 30min. Agent skips if interval not
                          reached.
                        </p>
                      </div>

                      {/* Category Cooldown */}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-xs neu-text-secondary">
                            Category Cooldown
                          </label>
                          <span className="text-xs font-mono text-violet-600">
                            {mergedSettings.category_cooldown_hours}h
                          </span>
                        </div>
                        <input
                          type="range"
                          min={1}
                          max={24}
                          step={1}
                          value={mergedSettings.category_cooldown_hours}
                          onChange={(e) =>
                            setSettings({
                              ...mergedSettings,
                              category_cooldown_hours: parseInt(
                                e.target.value,
                                10,
                              ),
                            })
                          }
                          className={rangeClass}
                        />
                        <div className="flex justify-between text-[10px] neu-text-muted mt-0.5">
                          <span>1h</span>
                          <span>24h</span>
                        </div>
                      </div>

                      {/* Response Language */}
                      <div>
                        <label className="text-xs neu-text-secondary mb-1 block">
                          Response Language
                        </label>
                        <select
                          value={mergedSettings.response_language}
                          onChange={(e) =>
                            setSettings({
                              ...mergedSettings,
                              response_language: e.target.value as "ja" | "en",
                            })
                          }
                          className="w-full px-3 py-2 text-sm neu-input"
                        >
                          <option value="ja">日本語</option>
                          <option value="en">English</option>
                        </select>
                      </div>
                    </div>
                  )}
                </div>

                {/* ── Custom Instructions ── */}
                <div className="neu-flat rounded-xl overflow-hidden">
                  <button
                    type="button"
                    onClick={() => toggleSection("instructions")}
                    className="w-full flex items-center justify-between p-3"
                  >
                    <div className="flex items-center gap-2">
                      <MessageSquareText
                        size={14}
                        className="text-violet-500"
                      />
                      <span className="text-sm font-medium neu-text-primary">
                        Custom Instructions
                      </span>
                      {mergedSettings.custom_instructions.trim() && (
                        <span className="w-1.5 h-1.5 bg-violet-500 rounded-full" />
                      )}
                    </div>
                    {openSection === "instructions" ? (
                      <ChevronUp size={16} className="neu-text-muted" />
                    ) : (
                      <ChevronDown size={16} className="neu-text-muted" />
                    )}
                  </button>
                  {openSection === "instructions" && (
                    <div className="px-3 pb-3">
                      <textarea
                        value={mergedSettings.custom_instructions}
                        onChange={(e) => {
                          if (e.target.value.length <= 500) {
                            setSettings({
                              ...mergedSettings,
                              custom_instructions: e.target.value,
                            });
                          }
                        }}
                        placeholder="例: タスクの優先順位を厳しく判断して / Always suggest time-blocking for tasks"
                        className="w-full px-3 py-2 text-sm neu-input resize-none"
                        rows={3}
                      />
                      <p className="text-[10px] neu-text-muted text-right mt-1">
                        {mergedSettings.custom_instructions.length}/500
                      </p>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// Invoice Business Info Card
interface BusinessInfo {
  companyName: string;
  name: string;
  address: string;
  phone: string;
  email: string;
  bankName: string;
  bankBranch: string;
  accountType: string;
  accountNumber: string;
  accountHolder: string;
}

const DEFAULT_BUSINESS_INFO: BusinessInfo = {
  companyName: "",
  name: "",
  address: "",
  phone: "",
  email: "",
  bankName: "",
  bankBranch: "",
  accountType: "普通",
  accountNumber: "",
  accountHolder: "",
};

const InvoiceBusinessInfoCard = () => {
  const {
    value: biz,
    setValue: setBiz,
    isLoading,
  } = useUserSetting<BusinessInfo>(
    "invoice_business_info",
    DEFAULT_BUSINESS_INFO,
  );
  const [isExpanded, setIsExpanded] = useState(false);

  const update = (field: keyof BusinessInfo, val: string) => {
    setBiz({ ...biz, [field]: val });
  };

  if (isLoading) {
    return (
      <div className="neu-card p-4 md:p-5">
        <div className="animate-pulse flex items-center gap-3">
          <div className="w-10 h-10 bg-slate-200 rounded-lg" />
          <div className="flex-1">
            <div className="h-4 bg-slate-200 rounded w-1/3 mb-2" />
            <div className="h-3 bg-slate-100 rounded w-2/3" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="neu-card overflow-hidden">
      <div className="p-4 md:p-5">
        <div className="flex items-start gap-3">
          <div className="bg-gradient-to-br from-blue-500 to-indigo-500 p-2 rounded-lg shrink-0">
            <FileText size={20} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-lg font-semibold neu-text-primary">
                Invoice Business Info
              </h3>
              {biz.companyName && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-medium rounded-full">
                  <CheckCircle size={12} />
                  Configured
                </span>
              )}
            </div>
            <p className="text-sm neu-text-secondary mt-1">
              Business info used for automatic invoice PDF generation
            </p>
          </div>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="neu-btn p-2 neu-text-muted hover:neu-text-secondary transition-colors"
            title={isExpanded ? "Collapse" : "Expand"}
          >
            {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
          </button>
        </div>

        {isExpanded && (
          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs neu-text-secondary block mb-1">
                  Company Name
                </label>
                <input
                  type="text"
                  value={biz.companyName}
                  onChange={(e) => update("companyName", e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg neu-input"
                  placeholder="Acme Inc."
                />
              </div>
              <div>
                <label className="text-xs neu-text-secondary block mb-1">
                  Name
                </label>
                <input
                  type="text"
                  value={biz.name}
                  onChange={(e) => update("name", e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg neu-input"
                  placeholder="John Doe"
                />
              </div>
              <div>
                <label className="text-xs neu-text-secondary block mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={biz.email}
                  onChange={(e) => update("email", e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg neu-input"
                  placeholder="info@example.com"
                />
              </div>
              <div className="md:col-span-2">
                <label className="text-xs neu-text-secondary block mb-1">
                  Address
                </label>
                <input
                  type="text"
                  value={biz.address}
                  onChange={(e) => update("address", e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg neu-input"
                  placeholder="123 Main St, City, State"
                />
              </div>
              <div>
                <label className="text-xs neu-text-secondary block mb-1">
                  Phone
                </label>
                <input
                  type="tel"
                  value={biz.phone}
                  onChange={(e) => update("phone", e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg neu-input"
                  placeholder="03-0000-0000"
                />
              </div>
            </div>

            <div className="border-t pt-4 mt-4">
              <h4 className="text-sm font-medium neu-text-primary mb-3">
                Bank Transfer Info
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs neu-text-secondary block mb-1">
                    Bank Name
                  </label>
                  <input
                    type="text"
                    value={biz.bankName}
                    onChange={(e) => update("bankName", e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg neu-input"
                    placeholder="Example Bank"
                  />
                </div>
                <div>
                  <label className="text-xs neu-text-secondary block mb-1">
                    Branch Name
                  </label>
                  <input
                    type="text"
                    value={biz.bankBranch}
                    onChange={(e) => update("bankBranch", e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg neu-input"
                    placeholder="Main Branch"
                  />
                </div>
                <div>
                  <label className="text-xs neu-text-secondary block mb-1">
                    Account Type
                  </label>
                  <select
                    value={biz.accountType}
                    onChange={(e) => update("accountType", e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg neu-input"
                  >
                    <option value="普通">Savings</option>
                    <option value="当座">Checking</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs neu-text-secondary block mb-1">
                    Account Number
                  </label>
                  <input
                    type="text"
                    value={biz.accountNumber}
                    onChange={(e) => update("accountNumber", e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg neu-input"
                    placeholder="1234567"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="text-xs neu-text-secondary block mb-1">
                    Account Holder
                  </label>
                  <input
                    type="text"
                    value={biz.accountHolder}
                    onChange={(e) => update("accountHolder", e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg neu-input"
                    placeholder="John Doe"
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// Invoice Reminder Settings Card
const InvoiceReminderSettingsCard = () => {
  const {
    settings: reminderSettings,
    setSettings: setReminderSettings,
    isLoading,
  } = useInvoiceReminders();
  const [isExpanded, setIsExpanded] = useState(false);

  if (isLoading) {
    return (
      <div className="neu-card p-4 md:p-5">
        <div className="animate-pulse flex items-center gap-3">
          <div className="w-10 h-10 bg-slate-200 rounded-lg" />
          <div className="flex-1">
            <div className="h-4 bg-slate-200 rounded w-1/3 mb-2" />
            <div className="h-3 bg-slate-100 rounded w-2/3" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="neu-card overflow-hidden">
      <div className="p-4 md:p-5">
        <div className="flex items-start gap-3">
          <div className="bg-gradient-to-br from-emerald-500 to-teal-500 p-2 rounded-lg shrink-0">
            <FileText size={20} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-lg font-semibold neu-text-primary">
                Invoice Reminders
              </h3>
              {reminderSettings.enabled && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-100 text-emerald-700 text-xs font-medium rounded-full">
                  <CheckCircle size={12} />
                  Enabled
                </span>
              )}
            </div>
            <p className="mt-1 text-sm neu-text-secondary">
              Monthly reminder for unpaid invoices
            </p>
          </div>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="neu-btn p-2 neu-text-muted hover:neu-text-secondary transition-colors"
            title={isExpanded ? "Collapse" : "Expand"}
          >
            {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
          </button>
        </div>

        {isExpanded && (
          <div className="mt-4 space-y-4">
            {/* Enable Toggle */}
            <div className="flex items-center justify-between p-3 neu-flat rounded-xl">
              <div>
                <p className="text-sm font-medium neu-text-primary">
                  Invoice Reminders
                </p>
                <p className="text-xs neu-text-secondary">
                  Notify monthly about unpaid invoices
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  setReminderSettings({
                    ...reminderSettings,
                    enabled: !reminderSettings.enabled,
                  })
                }
                className={`relative w-12 h-6 rounded-full transition-colors ${
                  reminderSettings.enabled ? "bg-emerald-500" : "bg-slate-300"
                }`}
                title={reminderSettings.enabled ? "Disable" : "Enable"}
              >
                <span
                  className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                    reminderSettings.enabled ? "translate-x-6" : "translate-x-0"
                  }`}
                />
              </button>
            </div>

            {/* Schedule */}
            {reminderSettings.enabled && (
              <div className="p-3 neu-flat rounded-xl">
                <p className="text-sm font-medium neu-text-primary mb-3">
                  Schedule
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs neu-text-secondary mb-1 block">
                      Day of Month
                    </label>
                    <select
                      value={reminderSettings.dayOfMonth}
                      onChange={(e) =>
                        setReminderSettings({
                          ...reminderSettings,
                          dayOfMonth: Number(e.target.value),
                        })
                      }
                      className="w-full px-3 py-2 text-sm neu-input"
                    >
                      {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs neu-text-secondary mb-1 block">
                      Time
                    </label>
                    <select
                      value={reminderSettings.hour}
                      onChange={(e) =>
                        setReminderSettings({
                          ...reminderSettings,
                          hour: Number(e.target.value),
                        })
                      }
                      className="w-full px-3 py-2 text-sm neu-input"
                    >
                      {Array.from({ length: 24 }, (_, i) => i).map((h) => (
                        <option key={h} value={h}>
                          {String(h).padStart(2, "0")}:00
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// Notification Sources Card
const NOTIFICATION_SOURCES: {
  key: keyof NotificationSettings;
  label: string;
  description: string;
  icon: React.ReactNode;
}[] = [
  {
    key: "pushTaskDue",
    label: "Task Due",
    description: "Reminders before task deadlines",
    icon: <Clock size={16} className="text-rose-400" />,
  },
  {
    key: "pushTaskOverdue",
    label: "Overdue Tasks",
    description: "Alerts for overdue tasks",
    icon: <Bell size={16} className="text-red-400" />,
  },
  {
    key: "pushCalendarEvent",
    label: "Calendar Events",
    description: "Reminders before calendar events",
    icon: <Calendar size={16} className="text-blue-400" />,
  },
  {
    key: "pushInvoiceReminder",
    label: "Invoice Reminders",
    description: "Monthly unpaid invoice reminders",
    icon: <FileText size={16} className="text-emerald-400" />,
  },
  {
    key: "pushAiChat",
    label: "AI Chat",
    description: "AI chat session responses",
    icon: <Bot size={16} className="text-violet-400" />,
  },
  {
    key: "pushAiCompany",
    label: "AI Company",
    description: "AI Company follow-up questions",
    icon: <Users size={16} className="text-indigo-400" />,
  },
  {
    key: "pushProactiveAgent",
    label: "Proactive Agent",
    description: "AI-generated insights and suggestions",
    icon: <BrainCircuit size={16} className="text-amber-400" />,
  },
  {
    key: "pushAutomation",
    label: "Automations",
    description: "Automation execution results",
    icon: <Zap size={16} className="text-yellow-400" />,
  },
  {
    key: "pushSlack",
    label: "Slack",
    description: "Slack channel messages",
    icon: <Hash size={16} className="text-purple-400" />,
  },
  {
    key: "pushRss",
    label: "RSS",
    description: "New articles from RSS feeds",
    icon: <Rss size={16} className="text-orange-400" />,
  },
  {
    key: "pushWebhook",
    label: "Webhook",
    description: "External webhook notifications",
    icon: <Globe size={16} className="text-cyan-400" />,
  },
  {
    key: "pushGmail",
    label: "Gmail",
    description: "New Gmail messages",
    icon: <Mail size={16} className="text-red-400" />,
  },
];

const NotificationSourcesCard = () => {
  const { settings, isLoading, updateSetting } = useNotificationSettings();
  const [isExpanded, setIsExpanded] = useState(false);

  const enabledCount = NOTIFICATION_SOURCES.filter(
    (s) => settings[s.key],
  ).length;

  if (isLoading) {
    return (
      <div className="neu-card p-4 md:p-5">
        <div className="animate-pulse flex items-center gap-3">
          <div className="w-10 h-10 bg-slate-200 rounded-lg" />
          <div className="flex-1">
            <div className="h-4 bg-slate-200 rounded w-1/3 mb-2" />
            <div className="h-3 bg-slate-100 rounded w-2/3" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="neu-card overflow-hidden">
      <div className="p-4 md:p-5">
        <div className="flex items-start gap-3">
          <div className="bg-gradient-to-br from-violet-500 to-purple-500 p-2 rounded-lg shrink-0">
            <BellRing size={20} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-lg font-semibold neu-text-primary">
                Notification Sources
              </h3>
              <span className="inline-flex items-center px-2 py-0.5 bg-violet-100 text-violet-700 text-xs font-medium rounded-full">
                {enabledCount}/{NOTIFICATION_SOURCES.length}
              </span>
            </div>
            <p className="mt-1 text-sm neu-text-secondary">
              Choose which sources can send you push notifications
            </p>
          </div>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="neu-btn p-2 neu-text-muted hover:neu-text-secondary transition-colors"
            title={isExpanded ? "Collapse" : "Expand"}
          >
            {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
          </button>
        </div>

        {isExpanded && (
          <div className="mt-4 space-y-1">
            {NOTIFICATION_SOURCES.map(({ key, label, description, icon }) => (
              <div
                key={key}
                className="flex items-center justify-between p-2.5 rounded-lg hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="shrink-0">{icon}</span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium neu-text-primary">
                      {label}
                    </p>
                    <p className="text-xs neu-text-secondary truncate">
                      {description}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => updateSetting(key, !settings[key])}
                  className={`relative w-10 h-5 rounded-full transition-colors shrink-0 ml-3 ${
                    settings[key] ? "bg-emerald-500" : "bg-slate-300"
                  }`}
                  title={settings[key] ? "Disable" : "Enable"}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                      settings[key] ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// Availability Schedule Card
const AvailabilityScheduleCard = () => {
  const { settings, isLoading, updateSettings, updateDaySchedule } =
    useAvailabilitySettings();
  const [isExpanded, setIsExpanded] = useState(false);
  const [alertState, setAlertState] = useState<{
    isOpen: boolean;
    type: "error" | "success";
    title: string;
    message: string;
  }>({ isOpen: false, type: "error", title: "", message: "" });

  if (isLoading) {
    return (
      <div className="neu-card p-4 md:p-5">
        <div className="animate-pulse flex items-center gap-3">
          <div className="w-10 h-10 bg-slate-200 rounded-lg" />
          <div className="flex-1">
            <div className="h-4 bg-slate-200 rounded w-1/3 mb-2" />
            <div className="h-3 bg-slate-100 rounded w-2/3" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="neu-card overflow-hidden">
      <div className="p-4 md:p-5">
        <div className="flex items-start gap-3">
          <div className="bg-gradient-to-br from-teal-500 to-cyan-500 p-2 rounded-lg shrink-0">
            <Clock size={20} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold neu-text-primary">
              Availability Schedule
            </h3>
            <p className="mt-1 text-sm neu-text-secondary">
              Set your available hours per day for scheduling
            </p>
          </div>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="neu-btn p-2 neu-text-muted hover:neu-text-secondary transition-colors"
            title={isExpanded ? "Collapse" : "Expand"}
          >
            {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
          </button>
        </div>

        {isExpanded && (
          <div className="mt-4 space-y-4">
            {/* Slot Duration */}
            <div className="flex items-center justify-between p-3 neu-flat rounded-xl">
              <div>
                <p className="text-sm font-medium neu-text-primary">
                  Minimum Slot Duration
                </p>
                <p className="text-xs neu-text-secondary">
                  Hide slots shorter than this
                </p>
              </div>
              <select
                value={settings.slotDurationMinutes}
                onChange={(e) =>
                  updateSettings({
                    slotDurationMinutes: Number(e.target.value),
                  })
                }
                className="neu-flat rounded-lg px-3 py-1.5 text-sm neu-text-primary border-0 outline-none"
              >
                {SLOT_DURATION_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Day-by-day schedule */}
            <div className="space-y-2">
              {[1, 2, 3, 4, 5, 6, 0].map((day) => {
                const schedule = settings.weekSchedule[day];
                return (
                  <div
                    key={day}
                    className="flex items-center gap-2 md:gap-3 p-2.5 md:p-3 neu-flat rounded-xl"
                  >
                    {/* Day label + toggle */}
                    <button
                      type="button"
                      onClick={() =>
                        updateDaySchedule(day, { enabled: !schedule.enabled })
                      }
                      className={`relative w-10 h-5 rounded-full transition-colors shrink-0 ${
                        schedule.enabled ? "bg-emerald-500" : "bg-slate-300"
                      }`}
                      title={schedule.enabled ? "Disable" : "Enable"}
                    >
                      <span
                        className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                          schedule.enabled ? "translate-x-5" : "translate-x-0"
                        }`}
                      />
                    </button>
                    <span
                      className={`text-sm font-medium w-8 ${
                        schedule.enabled ? "neu-text-primary" : "neu-text-muted"
                      }`}
                    >
                      {DAY_LABELS[day]}
                    </span>

                    {/* Time inputs */}
                    {schedule.enabled ? (
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <TimePicker
                          value={schedule.startTime}
                          onChange={(value) =>
                            updateDaySchedule(day, {
                              startTime: value,
                            })
                          }
                          className="w-[4.5rem]"
                          compact
                        />
                        <span className="text-xs neu-text-muted shrink-0">
                          ~
                        </span>
                        <TimePicker
                          value={schedule.endTime}
                          onChange={(value) =>
                            updateDaySchedule(day, { endTime: value })
                          }
                          className="w-[4.5rem]"
                          compact
                        />
                      </div>
                    ) : (
                      <span className="text-sm neu-text-muted italic">Off</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <AlertDialog
        isOpen={alertState.isOpen}
        type={alertState.type}
        title={alertState.title}
        message={alertState.message}
        onClose={() =>
          setAlertState({
            isOpen: false,
            type: "error",
            title: "",
            message: "",
          })
        }
      />
    </div>
  );
};

// Cron Schedule Presets
const CRON_PRESETS = [
  { label: "Every 1 min", value: "*/1 * * * *" },
  { label: "Every 5 min", value: "*/5 * * * *" },
  { label: "Every 10 min", value: "*/10 * * * *" },
  { label: "Every 15 min", value: "*/15 * * * *" },
  { label: "Every 30 min", value: "*/30 * * * *" },
  { label: "Every hour", value: "0 * * * *" },
  { label: "Every 6 hours", value: "0 */6 * * *" },
  { label: "Every 12 hours", value: "0 */12 * * *" },
  { label: "Daily", value: "daily" },
] as const;

// Check if a cron expression represents a daily schedule (0 H * * *)
const isDailyCron = (cron: string): boolean => {
  const parts = cron.trim().split(/\s+/);
  return (
    parts.length === 5 &&
    parts[0] === "0" &&
    /^\d{1,2}$/.test(parts[1]) &&
    parts[2] === "*" &&
    parts[3] === "*" &&
    parts[4] === "*"
  );
};

// Convert JST hour (0-23) to a daily cron expression in UTC
const jstHourToCron = (jstHour: number): string => {
  const utcHour = (jstHour - 9 + 24) % 24;
  return `0 ${utcHour} * * *`;
};

// Extract JST hour from a daily cron expression
const cronToJstHour = (cron: string): number => {
  const parts = cron.trim().split(/\s+/);
  const utcHour = parseInt(parts[1], 10);
  return (utcHour + 9) % 24;
};

const CRON_JOBS = [
  {
    name: "send-task-notifications" as const,
    label: "Notifications",
    icon: Bell,
    description: "Send task/calendar push notifications",
    color: "from-amber-400 to-amber-600",
  },
  {
    name: "fetch-x-posts" as const,
    label: "X Posts",
    icon: Twitter,
    description: "Fetch posts from X sources",
    color: "from-sky-400 to-sky-600",
  },
  {
    name: "fetch-calendar-events" as const,
    label: "Calendar",
    icon: Calendar,
    description: "Sync Google Calendar events",
    color: "from-indigo-400 to-indigo-600",
  },
  {
    name: "fetch-gmail-messages" as const,
    label: "Gmail",
    icon: Clock,
    description: "Sync Gmail messages",
    color: "from-red-400 to-red-600",
  },
  {
    name: "automation-scheduler" as const,
    label: "AI Automations",
    icon: Bot,
    description: "Run scheduled AI automation tasks",
    color: "from-purple-400 to-purple-600",
  },
  {
    name: "slack-fetch-history" as const,
    label: "Slack Sync",
    icon: Hash,
    description: "Sync Slack message history",
    color: "from-pink-400 to-pink-600",
  },
  {
    name: "fetch-rss" as const,
    label: "RSS Feeds",
    icon: Rss,
    description: "Fetch RSS feed updates",
    color: "from-orange-400 to-orange-600",
  },
  {
    name: "fetch-switchbot-status" as const,
    label: "SwitchBot",
    icon: Smartphone,
    description: "Fetch smart home device status",
    color: "from-teal-400 to-teal-600",
  },
  {
    name: "proactive-agent" as const,
    label: "Proactive Agent",
    icon: BrainCircuit,
    description: "AI-driven proactive insights and recommendations",
    color: "from-violet-400 to-violet-600",
  },
];

type CronJobName =
  | "send-task-notifications"
  | "fetch-x-posts"
  | "fetch-calendar-events"
  | "fetch-gmail-messages"
  | "automation-scheduler"
  | "slack-fetch-history"
  | "fetch-rss"
  | "fetch-switchbot-status"
  | "proactive-agent";

type CronSchedules = Record<CronJobName, string>;

const DEFAULT_SCHEDULES: CronSchedules = {
  "send-task-notifications": "*/5 * * * *",
  "fetch-x-posts": "0 7 * * *",
  "fetch-calendar-events": "*/15 * * * *",
  "fetch-gmail-messages": "*/15 * * * *",
  "automation-scheduler": "*/5 * * * *",
  "slack-fetch-history": "*/30 * * * *",
  "fetch-rss": "0 */6 * * *",
  "fetch-switchbot-status": "*/10 * * * *",
  "proactive-agent": "*/30 * * * *",
};

interface CronScheduleCardProps {
  jobFilter?: CronJobName[];
  title?: string;
  description?: string;
  defaultExpanded?: boolean;
  showExpandToggle?: boolean;
}

const CronScheduleCard = ({
  jobFilter,
  title = "Sync Schedules",
  description = "Configure how often each background sync job runs",
  defaultExpanded = false,
  showExpandToggle = true,
}: CronScheduleCardProps) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [schedules, setSchedules] = useState<CronSchedules>(DEFAULT_SCHEDULES);
  const [customInputs, setCustomInputs] = useState<Record<string, string>>({});
  const [showCustom, setShowCustom] = useState<Record<string, boolean>>({});
  const [dailyHours, setDailyHours] = useState<Record<string, number>>({});
  const [savingJob, setSavingJob] = useState<string | null>(null);
  const [savedJob, setSavedJob] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [alertState, setAlertState] = useState<{
    isOpen: boolean;
    type: "error" | "success";
    title: string;
    message: string;
  }>({ isOpen: false, type: "error", title: "", message: "" });

  // Filter jobs based on jobFilter prop
  const filteredJobs = jobFilter
    ? CRON_JOBS.filter((job) => jobFilter.includes(job.name))
    : CRON_JOBS;

  // Load current schedules from server
  useEffect(() => {
    const load = async () => {
      try {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        if (!supabaseUrl || !supabase) return;

        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session?.access_token) return;

        const response = await fetch(
          `${supabaseUrl}/functions/v1/update_cron_schedule`,
          {
            method: "GET",
            headers: {
              Authorization: `Bearer ${session.access_token}`,
            },
          },
        );

        if (response.ok) {
          const result = await response.json();
          if (result.schedules && Array.isArray(result.schedules)) {
            const loaded = { ...DEFAULT_SCHEDULES };
            for (const row of result.schedules) {
              if (row.job_name in loaded) {
                loaded[row.job_name as CronJobName] = row.schedule;
              }
            }
            setSchedules(loaded);
            // Initialize daily hours from loaded schedules
            const hours: Record<string, number> = {};
            for (const [name, cron] of Object.entries(loaded)) {
              if (isDailyCron(cron)) {
                hours[name] = cronToJstHour(cron);
              }
            }
            setDailyHours(hours);
          }
        }
      } catch (err) {
        console.error("Failed to load cron schedules:", err);
        setLoadError("Failed to load schedules");
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, []);

  const handlePresetChange = (jobName: CronJobName, value: string) => {
    if (value === "custom") {
      setShowCustom((prev) => ({ ...prev, [jobName]: true }));
      setCustomInputs((prev) => ({
        ...prev,
        [jobName]: schedules[jobName],
      }));
    } else if (value === "daily") {
      setShowCustom((prev) => ({ ...prev, [jobName]: false }));
      const hour = dailyHours[jobName] ?? 16; // default 16:00 JST
      setDailyHours((prev) => ({ ...prev, [jobName]: hour }));
      setSchedules((prev) => ({ ...prev, [jobName]: jstHourToCron(hour) }));
    } else {
      setShowCustom((prev) => ({ ...prev, [jobName]: false }));
      setDailyHours((prev) => {
        const next = { ...prev };
        delete next[jobName];
        return next;
      });
      setSchedules((prev) => ({ ...prev, [jobName]: value }));
    }
  };

  const handleDailyHourChange = (jobName: CronJobName, jstHour: number) => {
    setDailyHours((prev) => ({ ...prev, [jobName]: jstHour }));
    setSchedules((prev) => ({ ...prev, [jobName]: jstHourToCron(jstHour) }));
  };

  const handleCustomChange = (jobName: CronJobName, value: string) => {
    setCustomInputs((prev) => ({ ...prev, [jobName]: value }));
    setSchedules((prev) => ({ ...prev, [jobName]: value }));
  };

  const handleSave = async (jobName: CronJobName) => {
    const schedule = showCustom[jobName]
      ? customInputs[jobName]
      : schedules[jobName];
    if (!schedule) return;

    setSavingJob(jobName);
    setSavedJob(null);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      if (!supabaseUrl || !supabase) return;

      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) return;

      const response = await fetch(
        `${supabaseUrl}/functions/v1/update_cron_schedule`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ job_name: jobName, schedule }),
        },
      );

      const result = await response.json();
      if (!response.ok) {
        setAlertState({
          isOpen: true,
          type: "error",
          title: "Error",
          message: result.error || "Failed to update schedule",
        });
        return;
      }

      setSchedules((prev) => ({ ...prev, [jobName]: schedule }));
      setSavedJob(jobName);
      setTimeout(() => setSavedJob(null), 2000);
    } catch (err) {
      console.error("Failed to save cron schedule:", err);
      setAlertState({
        isOpen: true,
        type: "error",
        title: "Error",
        message: "Failed to save schedule",
      });
    } finally {
      setSavingJob(null);
    }
  };

  const getSelectedPreset = (jobName: CronJobName) => {
    if (showCustom[jobName]) return "custom";
    const current = schedules[jobName];
    // Check if it's a daily schedule
    if (isDailyCron(current) || dailyHours[jobName] !== undefined)
      return "daily";
    const match = CRON_PRESETS.find(
      (p) => p.value !== "daily" && p.value === current,
    );
    return match ? match.value : "custom";
  };

  // Manual sync function
  const [syncingJob, setSyncingJob] = useState<string | null>(null);
  const handleManualSync = async (jobName: CronJobName) => {
    setSyncingJob(jobName);
    try {
      if (!supabase) {
        setAlertState({
          isOpen: true,
          type: "error",
          title: "Error",
          message: "Supabase client not available",
        });
        return;
      }

      // Map job names to their corresponding Edge Function endpoints
      const endpointMap: Record<CronJobName, string> = {
        "fetch-x-posts": "fetch_x_posts",
        "fetch-calendar-events": "fetch_calendar_events",
        "fetch-gmail-messages": "fetch_gmail_messages",
        "send-task-notifications": "send_task_notifications",
        "automation-scheduler": "automation_scheduler",
        "slack-fetch-history": "slack_fetch_history",
        "fetch-rss": "fetch_rss",
        "fetch-switchbot-status": "fetch_switchbot_status",
        "proactive-agent": "proactive_agent",
      };

      const endpoint = endpointMap[jobName];
      if (!endpoint) {
        setAlertState({
          isOpen: true,
          type: "error",
          title: "Error",
          message: `Unknown job: ${jobName}`,
        });
        return;
      }

      const { error } = await supabase.functions.invoke(endpoint, {
        body: {},
      });

      if (error) {
        setAlertState({
          isOpen: true,
          type: "error",
          title: "Sync Failed",
          message: error.message || "Failed to run manual sync",
        });
        return;
      }

      setAlertState({
        isOpen: true,
        type: "success",
        title: "Success",
        message: "Manual sync started successfully",
      });
    } catch (err) {
      console.error("Failed to run manual sync:", err);
      setAlertState({
        isOpen: true,
        type: "error",
        title: "Error",
        message: "Failed to run manual sync",
      });
    } finally {
      setSyncingJob(null);
    }
  };

  return (
    <div className="neu-card overflow-hidden">
      <div className="p-4 md:p-5">
        <div className="flex items-start gap-3">
          <div className="bg-gradient-to-br from-slate-500 to-slate-700 p-2 rounded-lg shrink-0">
            <Clock size={20} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold neu-text-primary">{title}</h3>
            <p className="mt-1 text-sm neu-text-secondary">{description}</p>
          </div>
          {showExpandToggle && (
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="neu-btn p-2 neu-text-muted hover:neu-text-secondary transition-colors"
              title={isExpanded ? "Collapse" : "Expand"}
            >
              {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
            </button>
          )}
        </div>

        {isExpanded && (
          <div className="mt-4">
            {loadError && (
              <div className="mb-4 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                {loadError}
              </div>
            )}

            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2
                  size={24}
                  className="animate-spin neu-text-secondary"
                />
              </div>
            ) : (
              <div className="space-y-3">
                {filteredJobs.map((job) => {
                  const Icon = job.icon;
                  const selected = getSelectedPreset(job.name);
                  const isSaving = savingJob === job.name;
                  const isSaved = savedJob === job.name;
                  const isCustom =
                    showCustom[job.name] || selected === "custom";

                  // Check if current value differs from what's loaded (unsaved change)
                  const hasChange =
                    isCustom && customInputs[job.name] !== undefined
                      ? customInputs[job.name] !== schedules[job.name]
                      : false;

                  return (
                    <div
                      key={job.name}
                      className="p-3 neu-flat rounded-xl space-y-2"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-8 h-8 rounded-lg bg-gradient-to-br ${job.color} flex items-center justify-center text-white shrink-0`}
                        >
                          <Icon size={16} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium neu-text-primary">
                            {job.label}
                          </p>
                          <p className="text-xs neu-text-muted">
                            {job.description}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-wrap">
                        <select
                          value={selected}
                          onChange={(e) =>
                            handlePresetChange(job.name, e.target.value)
                          }
                          className="flex-1 min-w-[140px] px-2 py-1.5 text-sm neu-input rounded-lg"
                          title={`Schedule for ${job.label}`}
                        >
                          {CRON_PRESETS.map((preset) => (
                            <option key={preset.value} value={preset.value}>
                              {preset.label}
                            </option>
                          ))}
                          <option value="custom">Custom...</option>
                        </select>

                        <button
                          type="button"
                          onClick={() => handleSave(job.name)}
                          disabled={isSaving}
                          className={`shrink-0 flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                            isSaved
                              ? "bg-green-100 text-green-700"
                              : "bg-slate-600 text-white hover:bg-slate-700"
                          } disabled:opacity-50`}
                        >
                          {isSaving ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : isSaved ? (
                            <CheckCircle size={14} />
                          ) : (
                            <Save size={14} />
                          )}
                          {isSaved ? "Saved" : "Save"}
                        </button>

                        <button
                          type="button"
                          onClick={() => handleManualSync(job.name)}
                          disabled={syncingJob === job.name}
                          className="shrink-0 flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                          title="Run sync now"
                        >
                          {syncingJob === job.name ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <ArrowDown size={14} />
                          )}
                          Sync Now
                        </button>
                      </div>

                      {selected === "daily" &&
                        dailyHours[job.name] !== undefined && (
                          <div className="flex items-center gap-2">
                            <select
                              value={dailyHours[job.name]}
                              onChange={(e) =>
                                handleDailyHourChange(
                                  job.name,
                                  parseInt(e.target.value, 10),
                                )
                              }
                              className="px-2 py-1.5 text-sm neu-input rounded-lg"
                              title="Time (JST)"
                            >
                              {Array.from({ length: 24 }, (_, h) => (
                                <option key={h} value={h}>
                                  {String(h).padStart(2, "0")}:00 JST
                                </option>
                              ))}
                            </select>
                          </div>
                        )}

                      {isCustom && (
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={
                              customInputs[job.name] ?? schedules[job.name]
                            }
                            onChange={(e) =>
                              handleCustomChange(job.name, e.target.value)
                            }
                            placeholder="*/15 * * * *"
                            className={`flex-1 px-2 py-1.5 text-sm font-mono neu-input rounded-lg ${hasChange ? "ring-2 ring-blue-300" : ""}`}
                            title="Cron expression (5 fields)"
                          />
                          <span className="text-xs neu-text-muted whitespace-nowrap">
                            min hour day mon weekday
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      <AlertDialog
        isOpen={alertState.isOpen}
        type={alertState.type}
        title={alertState.title}
        message={alertState.message}
        onClose={() =>
          setAlertState({
            isOpen: false,
            type: "error",
            title: "",
            message: "",
          })
        }
      />
    </div>
  );
};

const PROVIDER_LABELS: Record<string, { name: string; color: string }> = {
  gemini: { name: "Google Gemini", color: "from-blue-500 to-blue-700" },
  openai: { name: "OpenAI", color: "from-emerald-500 to-emerald-700" },
  anthropic: { name: "Anthropic", color: "from-amber-500 to-amber-700" },
  perplexity: { name: "Perplexity", color: "from-purple-500 to-purple-700" },
};

const CostManagementCard = () => {
  const {
    providers,
    limits,
    totalTodayCost,
    totalMonthCost,
    isLoading,
    error,
    refresh,
    updateLimit,
  } = useCostManagement();
  const [isExpanded, setIsExpanded] = useState(false);
  const [editingProvider, setEditingProvider] = useState<string | null>(null);
  const [editDaily, setEditDaily] = useState("");
  const [editMonthly, setEditMonthly] = useState("");

  const handleSaveLimit = async (provider: string) => {
    await updateLimit(provider, {
      daily_limit_usd: editDaily ? parseFloat(editDaily) : null,
      monthly_limit_usd: editMonthly ? parseFloat(editMonthly) : null,
    });
    setEditingProvider(null);
  };

  const startEdit = (provider: string) => {
    const limit = limits.find((l) => l.provider === provider);
    setEditDaily(limit?.daily_limit_usd?.toString() ?? "");
    setEditMonthly(limit?.monthly_limit_usd?.toString() ?? "");
    setEditingProvider(provider);
  };

  return (
    <div className="neu-card overflow-hidden">
      <div className="p-4 md:p-5">
        <div className="flex items-start gap-3">
          <div className="bg-gradient-to-br from-rose-500 to-rose-700 p-2 rounded-lg shrink-0">
            <DollarSign size={20} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold neu-text-primary">
              Cost Management
            </h3>
            <p className="mt-1 text-sm neu-text-secondary">
              AI API usage tracking and spending limits
            </p>
          </div>
          <button
            onClick={() => {
              if (!isExpanded) refresh();
              setIsExpanded(!isExpanded);
            }}
            className="neu-btn p-2 neu-text-muted hover:neu-text-secondary transition-colors"
          >
            {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
          </button>
        </div>

        {/* Summary — always visible */}
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div className="neu-btn rounded-lg p-3">
            <p className="text-xs neu-text-muted">Today</p>
            <p className="text-lg font-bold neu-text-primary">
              ${totalTodayCost.toFixed(4)}
            </p>
          </div>
          <div className="neu-btn rounded-lg p-3">
            <p className="text-xs neu-text-muted">This Month</p>
            <p className="text-lg font-bold neu-text-primary">
              ${totalMonthCost.toFixed(4)}
            </p>
          </div>
        </div>

        {isExpanded && (
          <div className="mt-4 space-y-3">
            {isLoading ? (
              <div className="flex justify-center py-4">
                <Loader2
                  size={24}
                  className="animate-spin neu-text-secondary"
                />
              </div>
            ) : error ? (
              <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                {error}
              </div>
            ) : (
              <>
                {providers.map((p) => {
                  const info = PROVIDER_LABELS[p.provider] ?? {
                    name: p.provider,
                    color: "from-slate-500 to-slate-700",
                  };
                  const limit = limits.find((l) => l.provider === p.provider);
                  const isEditing = editingProvider === p.provider;
                  const monthlyPct =
                    limit?.enabled && limit.monthly_limit_usd
                      ? Math.min(
                          (p.monthCost / Number(limit.monthly_limit_usd)) * 100,
                          100,
                        )
                      : 0;

                  return (
                    <div key={p.provider} className="neu-btn rounded-lg p-3">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <div
                            className={`w-2 h-2 rounded-full bg-gradient-to-br ${info.color}`}
                          />
                          <span className="text-sm font-medium neu-text-primary">
                            {info.name}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs neu-text-muted">
                            {p.monthCount} calls
                          </span>
                          {!isEditing && (
                            <button
                              onClick={() => startEdit(p.provider)}
                              className="p-1 neu-text-muted hover:neu-text-secondary"
                            >
                              <Pencil size={14} />
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs mb-2">
                        <div>
                          <span className="neu-text-muted">Today: </span>
                          <span className="font-medium neu-text-primary">
                            ${p.todayCost.toFixed(4)}
                          </span>
                        </div>
                        <div>
                          <span className="neu-text-muted">Month: </span>
                          <span className="font-medium neu-text-primary">
                            ${p.monthCost.toFixed(4)}
                          </span>
                        </div>
                      </div>

                      {/* Progress bar when limits are enabled */}
                      {limit?.enabled && limit.monthly_limit_usd && (
                        <div className="mb-2">
                          <div className="h-1.5 rounded-full bg-slate-200 overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${
                                monthlyPct > 80
                                  ? "bg-red-500"
                                  : monthlyPct > 50
                                    ? "bg-amber-500"
                                    : "bg-emerald-500"
                              }`}
                              style={{ width: `${monthlyPct}%` }}
                            />
                          </div>
                          <p className="text-[10px] neu-text-muted mt-0.5 text-right">
                            ${p.monthCost.toFixed(2)} / $
                            {limit.monthly_limit_usd}
                          </p>
                        </div>
                      )}

                      {/* Edit limits inline */}
                      {isEditing && (
                        <div className="mt-2 space-y-2 border-t border-slate-200 pt-2">
                          <div className="flex items-center gap-2">
                            <label className="text-xs neu-text-muted w-16">
                              Daily $
                            </label>
                            <input
                              type="number"
                              step="0.5"
                              value={editDaily}
                              onChange={(e) => setEditDaily(e.target.value)}
                              placeholder="5.00"
                              className="flex-1 px-2 py-1 text-sm neu-input rounded-lg"
                            />
                          </div>
                          <div className="flex items-center gap-2">
                            <label className="text-xs neu-text-muted w-16">
                              Monthly $
                            </label>
                            <input
                              type="number"
                              step="1"
                              value={editMonthly}
                              onChange={(e) => setEditMonthly(e.target.value)}
                              placeholder="50.00"
                              className="flex-1 px-2 py-1 text-sm neu-input rounded-lg"
                            />
                          </div>
                          <div className="flex items-center justify-between">
                            <label className="flex items-center gap-2 text-xs">
                              <input
                                type="checkbox"
                                checked={limit?.enabled ?? false}
                                onChange={(e) =>
                                  updateLimit(p.provider, {
                                    enabled: e.target.checked,
                                  })
                                }
                                className="rounded"
                              />
                              <span className="neu-text-muted">
                                Enable limits
                              </span>
                            </label>
                            <div className="flex gap-1">
                              <button
                                onClick={() => setEditingProvider(null)}
                                className="px-2 py-1 text-xs neu-btn rounded"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={() => handleSaveLimit(p.provider)}
                                className="px-2 py-1 text-xs bg-sky-600 text-white rounded hover:bg-sky-500"
                              >
                                Save
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}

                <button
                  onClick={refresh}
                  className="w-full flex items-center justify-center gap-2 py-2 text-xs neu-btn rounded-lg neu-text-muted hover:neu-text-secondary"
                >
                  <RefreshCw size={14} />
                  Refresh
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export const SettingsPage = () => {
  useAuth(); // For authentication context

  return (
    <Layout pageTitle="Settings">
      <div className="h-full overflow-auto p-4 md:p-6 neu-bg mobile-scroll-pad">
        <div className="max-w-5xl mx-auto space-y-4 md:space-y-6">
          {/* Invoice Section */}
          <div>
            <h2 className="text-sm font-semibold neu-text-secondary uppercase tracking-wider mb-3">
              Invoice
            </h2>
            <div className="space-y-4">
              <InvoiceBusinessInfoCard />
            </div>
          </div>

          {/* Notifications Section */}
          <div>
            <h2 className="text-sm font-semibold neu-text-secondary uppercase tracking-wider mb-3">
              Notifications
            </h2>
            <div className="space-y-4">
              <TaskNotificationSettingsCard />
              <InvoiceReminderSettingsCard />
              <NotificationSourcesCard />
            </div>
          </div>

          {/* Calendar Section */}
          <div>
            <h2 className="text-sm font-semibold neu-text-secondary uppercase tracking-wider mb-3">
              Calendar
            </h2>
            <div className="space-y-4">
              <AvailabilityScheduleCard />
            </div>
          </div>

          {/* Mobile Navigation Section */}
          <div>
            <h2 className="text-sm font-semibold neu-text-secondary uppercase tracking-wider mb-3">
              Mobile Navigation
            </h2>
            <MobileNavConfigCard />
          </div>

          {/* Cost Management Section */}
          <div>
            <h2 className="text-sm font-semibold neu-text-secondary uppercase tracking-wider mb-3">
              Cost Management
            </h2>
            <div className="space-y-4">
              <CostManagementCard />
            </div>
          </div>

          {/* AI Section */}
          <div>
            <h2 className="text-sm font-semibold neu-text-secondary uppercase tracking-wider mb-3">
              AI
            </h2>
            <div className="space-y-4">
              <ClaudeCodeRelayCard />
              <LocationTrackerCard />
              <ProactiveAgentSettingsCard />
              <AiShortcutsCard />
              <AiNotificationSettingsCard />
            </div>
          </div>

          {/* Integrations Section */}
          <div>
            <h2 className="text-sm font-semibold neu-text-secondary uppercase tracking-wider mb-3">
              Integrations
            </h2>
            <div className="space-y-4">
              <SlackIntegrationCard />
              <LineIntegrationCard />
              <RssFeedCard />
              <XSourceCard />
              <GoogleServicesCard />

              {/* System Sync Settings - All background sync jobs */}
              <CronScheduleCard />
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};
