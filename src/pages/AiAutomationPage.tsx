import { useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Plus,
  Play,
  Pause,
  Trash2,
  RefreshCw,
  FileText,
  Newspaper,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  Settings2,
  ChevronRight,
  ChevronDown,
  Rocket,
  Bot,
  Pencil,
  Globe,
  CalendarDays,
  TrendingUp,
} from "lucide-react";
import { Layout, AlertDialog, ConfirmDialog, TimePicker } from "../components";
import { useAiAutomations } from "../hooks/useAiAutomations";
import { useRelaySchedulers } from "../hooks/useRelaySchedulers";
import type { RelaySchedulerStatus } from "../hooks/useRelaySchedulers";
import { useNodes } from "../hooks/useNodes";
import type {
  AiAutomation,
  AutomationType,
  AutomationSchedule,
  AiProvider,
} from "../types";

const AUTOMATION_TYPE_INFO: Record<
  AutomationType,
  { label: string; icon: typeof FileText; color: string; bgColor: string }
> = {
  paper_search: {
    label: "R&D",
    icon: FileText,
    color: "text-blue-600",
    bgColor: "bg-blue-50",
  },
  news_collection: {
    label: "News Collection",
    icon: Newspaper,
    color: "text-orange-600",
    bgColor: "bg-orange-50",
  },
  custom: {
    label: "Custom",
    icon: Settings2,
    color: "text-purple-600",
    bgColor: "bg-purple-50",
  },
  hp_post: {
    label: "HP Post",
    icon: Globe,
    color: "text-green-600",
    bgColor: "bg-green-50",
  },
  event_discovery: {
    label: "Event Discovery",
    icon: CalendarDays,
    color: "text-teal-600",
    bgColor: "bg-teal-50",
  },
  stock_analysis: {
    label: "Stock Analysis",
    icon: TrendingUp,
    color: "text-emerald-600",
    bgColor: "bg-emerald-50",
  },
  event_collect: {
    label: "Event Collect",
    icon: CalendarDays,
    color: "text-pink-600",
    bgColor: "bg-pink-50",
  },
  ai_news_digest: {
    label: "AI News",
    icon: Newspaper,
    color: "text-cyan-600",
    bgColor: "bg-cyan-50",
  },
};

const SCHEDULE_LABELS: Record<AutomationSchedule, string> = {
  hourly: "Hourly",
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  manual: "Manual",
};

const AI_PROVIDER_INFO: Record<
  AiProvider,
  { label: string; description: string }
> = {
  gemini: { label: "Gemini", description: "Google AI" },
  openai: { label: "OpenAI", description: "GPT-4o" },
  anthropic: { label: "Claude", description: "Anthropic" },
  perplexity: { label: "Perplexity", description: "Search-focused AI" },
};

const STATUS_INFO = {
  success: { label: "Success", icon: CheckCircle2, color: "text-green-600" },
  error: { label: "Error", icon: XCircle, color: "text-red-600" },
  running: { label: "Running", icon: Loader2, color: "text-blue-600" },
  pending: { label: "Pending", icon: Clock, color: "text-amber-600" },
};

type CreateModalMode =
  | "select"
  | "paper"
  | "news"
  | "hp_post"
  | "event_discovery"
  | "stock_analysis"
  | "event_collect"
  | "ai_news_digest"
  | null;

const runAutomation = async (
  automationId: string,
): Promise<{ success: boolean; error?: string }> => {
  const { supabase } = await import("../lib/supabase");
  if (!supabase) {
    return { success: false, error: "Supabase not configured" };
  }

  try {
    const { error } = await supabase.functions.invoke("run_automation", {
      body: { automationId },
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
};

export const AiAutomationPage = () => {
  const navigate = useNavigate();
  const {
    automations,
    isLoading,
    isSyncing,
    refresh,
    createAutomation,
    updateAutomation,
    toggleEnabled,
    removeAutomation,
  } = useAiAutomations();
  const { nodes } = useNodes();
  const {
    schedulers: relaySchedulers,
    triggerNow: relayTrigger,
    refresh: refreshRelay,
  } = useRelaySchedulers();
  const [createMode, setCreateMode] = useState<CreateModalMode>(null);
  const [editingAutomation, setEditingAutomation] =
    useState<AiAutomation | null>(null);
  const [runningIds, setRunningIds] = useState<Set<string>>(new Set());
  const [expandedPrompts, setExpandedPrompts] = useState<Set<string>>(
    new Set(),
  );
  const [alertState, setAlertState] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
  }>({ isOpen: false, title: "", message: "" });
  const [confirmState, setConfirmState] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: () => {},
  });
  const [newAutomation, setNewAutomation] = useState<{
    name: string;
    description: string;
    schedule: AutomationSchedule;
    scheduledTime: string;
    aiModel: AiProvider;
    category: string;
    keywords: string;
    location: string;
    platforms: ("peatix" | "luma")[];
  }>({
    name: "",
    description: "",
    schedule: "daily",
    scheduledTime: "09:00",
    aiModel: "gemini",
    category: "Release",
    keywords: "",
    location: "",
    platforms: ["peatix", "luma"],
  });
  const [editForm, setEditForm] = useState<{
    name: string;
    description: string;
    schedule: AutomationSchedule;
    scheduledTime: string;
    aiModel: AiProvider;
  }>({
    name: "",
    description: "",
    schedule: "daily",
    scheduledTime: "09:00",
    aiModel: "gemini",
  });

  const handleCreatePaperSearch = async () => {
    if (!newAutomation.name) return;

    await createAutomation({
      name: newAutomation.name,
      description: newAutomation.description || undefined,
      automationType: "paper_search",
      config: { prompt: newAutomation.description || undefined },
      schedule: newAutomation.schedule,
      scheduledTime: newAutomation.scheduledTime,
      aiModel: newAutomation.aiModel,
      enabled: true,
    });

    setCreateMode(null);
    resetForm();
  };

  const handleCreateNewsCollection = async () => {
    if (!newAutomation.name) return;

    await createAutomation({
      name: newAutomation.name,
      description: newAutomation.description || undefined,
      automationType: "news_collection",
      config: { prompt: newAutomation.description || undefined },
      schedule: newAutomation.schedule,
      scheduledTime: newAutomation.scheduledTime,
      aiModel: newAutomation.aiModel,
      enabled: true,
    });

    setCreateMode(null);
    resetForm();
  };

  const handleCreateHpPost = async () => {
    if (!newAutomation.name) return;

    await createAutomation({
      name: newAutomation.name,
      description: newAutomation.description || undefined,
      automationType: "hp_post",
      config: {
        prompt: newAutomation.description || undefined,
        category: newAutomation.category || "Release",
      },
      schedule: newAutomation.schedule,
      scheduledTime: newAutomation.scheduledTime,
      aiModel: newAutomation.aiModel,
      enabled: true,
    });

    setCreateMode(null);
    resetForm();
  };

  const handleCreateEventDiscovery = async () => {
    if (!newAutomation.name) return;
    const keywords = newAutomation.keywords
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean);
    if (keywords.length === 0) return;

    await createAutomation({
      name: newAutomation.name,
      description: newAutomation.description || undefined,
      automationType: "event_discovery",
      config: {
        prompt: newAutomation.description || undefined,
        keywords,
        location: newAutomation.location || undefined,
        platforms: newAutomation.platforms,
      },
      schedule: newAutomation.schedule,
      scheduledTime: newAutomation.scheduledTime,
      aiModel: newAutomation.aiModel,
      enabled: true,
    });

    setCreateMode(null);
    resetForm();
  };

  const handleCreateStockAnalysis = async () => {
    if (!newAutomation.name) return;

    await createAutomation({
      name: newAutomation.name,
      description: newAutomation.description || undefined,
      automationType: "stock_analysis",
      config: {
        prompt: newAutomation.description || undefined,
        analysisType: "portfolio",
      },
      schedule: newAutomation.schedule,
      scheduledTime: newAutomation.scheduledTime,
      aiModel: newAutomation.aiModel,
      enabled: true,
    });

    setCreateMode(null);
    resetForm();
  };

  const handleCreateEventCollect = async () => {
    if (!newAutomation.name) return;

    await createAutomation({
      name: newAutomation.name,
      description:
        newAutomation.description ||
        "技術・ビジネスイベントを収集してSlackに投稿",
      automationType: "event_collect",
      config: {
        platforms: ["connpass", "techplay", "luma", "peatix"],
        keywords: ["AI", "スタートアップ", "エンジニア"],
        location: "東京",
        slackChannelId: "",
      },
      schedule: newAutomation.schedule,
      scheduledTime: newAutomation.scheduledTime || undefined,
      aiModel: newAutomation.aiModel,
      enabled: true,
    });

    setCreateMode(null);
    resetForm();
  };

  const handleCreateAiNewsDigest = async () => {
    if (!newAutomation.name) return;

    await createAutomation({
      name: newAutomation.name,
      description:
        newAutomation.description ||
        "arXiv論文とAIブログから最新ニュースを収集・要約",
      automationType: "ai_news_digest",
      config: {
        arxivCategories: ["cs.AI", "cs.LG", "cs.CL", "cs.CV"],
        rssFeeds: [
          "https://openai.com/blog/rss.xml",
          "https://blog.google/technology/ai/rss",
          "https://techcrunch.com/category/artificial-intelligence/feed/",
          "https://venturebeat.com/category/ai/feed/",
        ],
        slackChannelId: "",
        lineEnabled: false,
      },
      schedule: newAutomation.schedule,
      scheduledTime: newAutomation.scheduledTime || undefined,
      aiModel: "openai",
      enabled: true,
    });

    setCreateMode(null);
    resetForm();
  };

  const resetForm = () => {
    setNewAutomation({
      name: "",
      description: "",
      schedule: "daily",
      scheduledTime: "09:00",
      aiModel: "gemini",
      category: "Release",
      keywords: "",
      location: "",
      platforms: ["peatix", "luma"],
    });
  };

  const handleEdit = (automation: AiAutomation) => {
    setEditingAutomation(automation);
    const config = automation.config as { prompt?: string };
    setEditForm({
      name: automation.name,
      description: config.prompt || automation.description || "",
      schedule: automation.schedule,
      scheduledTime: automation.scheduledTime || "09:00",
      aiModel: automation.aiModel,
    });
  };

  const handleSaveEdit = async () => {
    if (!editingAutomation || !editForm.name || !editForm.description) return;

    await updateAutomation(editingAutomation.id, {
      name: editForm.name,
      description: editForm.description,
      config: { prompt: editForm.description },
      schedule: editForm.schedule,
      scheduledTime: editForm.scheduledTime,
      aiModel: editForm.aiModel,
    });

    setEditingAutomation(null);
  };

  const handleDelete = async (id: string) => {
    setConfirmState({
      isOpen: true,
      title: "Delete Automation",
      message: "Are you sure you want to delete this automation?",
      onConfirm: async () => {
        await removeAutomation(id);
        setConfirmState({
          isOpen: false,
          title: "",
          message: "",
          onConfirm: () => {},
        });
      },
    });
  };

  const handleRunNow = async (id: string) => {
    setRunningIds((prev) => new Set(prev).add(id));
    try {
      const result = await runAutomation(id);
      if (result.success) {
        // Refresh to get updated status
        setTimeout(() => refresh(), 1000);
      } else {
        setAlertState({
          isOpen: true,
          title: "Execution Error",
          message: result.error || "Unknown error occurred",
        });
      }
    } finally {
      setRunningIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return "-";
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getPrompt = (automation: AiAutomation): string => {
    const config = automation.config as { prompt?: string };
    return config.prompt || "";
  };

  const handleRelayTrigger = async (scheduler: RelaySchedulerStatus) => {
    setRunningIds((prev) => new Set(prev).add(scheduler.id));
    try {
      const result = await relayTrigger(scheduler.triggerEndpoint);
      if (result.success) {
        setTimeout(() => refreshRelay(), 2000);
      } else {
        setAlertState({
          isOpen: true,
          title: "Relay Error",
          message: result.error || "Unknown error",
        });
      }
    } finally {
      setRunningIds((prev) => {
        const next = new Set(prev);
        next.delete(scheduler.id);
        return next;
      });
    }
  };

  const formatRelayNextRun = (nextRunAt: string | null) => {
    if (!nextRunAt) return null;
    const d = new Date(nextRunAt);
    const now = new Date();
    const diffMs = d.getTime() - now.getTime();
    if (diffMs <= 0) return "soon";
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 60) return `${diffMin}min`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `${diffH}h ${diffMin % 60}min`;
    return `${Math.floor(diffH / 24)}d ${diffH % 24}h`;
  };

  const togglePromptExpand = (id: string) => {
    setExpandedPrompts((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

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
        onClick={() => {
          refresh();
          refreshRelay();
        }}
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

  const headerCenter = (
    <button
      onClick={() => setCreateMode("select")}
      className="flex items-center gap-1.5 md:gap-2 px-2.5 md:px-3 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs md:text-sm font-medium transition-all active:scale-95 shadow"
    >
      <Plus size={16} />
      <span className="hidden sm:inline">Add Automation</span>
    </button>
  );

  return (
    <Layout
      pageTitle="Automations"
      headerLeft={headerLeft}
      headerCenter={headerCenter}
    >
      <div className="h-full overflow-auto neu-bg mobile-scroll-pad">
        <main className="max-w-5xl mx-auto px-4 py-3 md:py-10">
          {/* Automations List */}
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-8 h-8 neu-text-muted animate-spin" />
            </div>
          ) : automations.length === 0 ? (
            <div className="neu-card p-12 text-center">
              <div className="w-16 h-16 mx-auto mb-4 neu-flat rounded-full flex items-center justify-center">
                <Settings2 className="w-8 h-8 neu-text-muted" />
              </div>
              <h3 className="text-lg font-semibold neu-text-primary mb-2">
                No automations
              </h3>
              <p className="neu-text-secondary mb-6">
                Create AI workflows to collect information periodically
              </p>
              <button
                onClick={() => setCreateMode("select")}
                className="inline-flex items-center gap-2 px-4 py-2 bg-sky-600 text-white rounded-lg hover:bg-sky-700 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Create Automation
              </button>
            </div>
          ) : (
            <div className="space-y-3 md:space-y-4">
              {automations.map((automation) => {
                const typeInfo =
                  AUTOMATION_TYPE_INFO[automation.automationType];
                const statusInfo = automation.lastRunStatus
                  ? STATUS_INFO[automation.lastRunStatus]
                  : null;
                const TypeIcon = typeInfo.icon;
                const StatusIcon = statusInfo?.icon;

                return (
                  <div
                    key={automation.id}
                    className={`neu-card p-3 md:p-5 transition-all ${
                      automation.enabled ? "" : "opacity-60"
                    }`}
                  >
                    <div className="flex items-start gap-3 md:gap-4">
                      <div
                        className={`p-2 md:p-3 rounded-xl ${typeInfo.bgColor} shrink-0`}
                      >
                        <TypeIcon
                          className={`w-5 h-5 md:w-6 md:h-6 ${typeInfo.color}`}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        {/* Title row with actions */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 flex-wrap min-w-0">
                            <h3 className="text-base md:text-lg font-semibold neu-text-primary truncate">
                              {automation.name}
                            </h3>
                            <span
                              className={`text-[10px] md:text-xs px-1.5 md:px-2 py-0.5 rounded-full shrink-0 ${typeInfo.bgColor} ${typeInfo.color}`}
                            >
                              {typeInfo.label}
                            </span>
                            {automation.linkedNodeId &&
                              (() => {
                                const linkedNode = nodes.find(
                                  (n) => n.id === automation.linkedNodeId,
                                );
                                if (!linkedNode) return null;
                                return (
                                  <span className="text-[10px] md:text-xs px-1.5 md:px-2 py-0.5 rounded-full shrink-0 bg-indigo-50 text-indigo-600">
                                    {linkedNode.title}
                                  </span>
                                );
                              })()}
                          </div>
                          <div className="flex items-center gap-1 md:gap-2 shrink-0">
                            <button
                              onClick={() => handleRunNow(automation.id)}
                              disabled={
                                runningIds.has(automation.id) ||
                                !automation.enabled
                              }
                              className={`p-1.5 md:p-2 rounded-lg transition-colors ${
                                runningIds.has(automation.id)
                                  ? "text-blue-600 bg-blue-50"
                                  : automation.enabled
                                    ? "text-sky-600 hover:bg-sky-50"
                                    : "neu-text-muted cursor-not-allowed"
                              }`}
                              title="Run Now"
                            >
                              {runningIds.has(automation.id) ? (
                                <Loader2 className="w-4 h-4 md:w-5 md:h-5 animate-spin" />
                              ) : (
                                <Rocket className="w-4 h-4 md:w-5 md:h-5" />
                              )}
                            </button>
                            <button
                              onClick={() => toggleEnabled(automation.id)}
                              className={`p-1.5 md:p-2 rounded-lg transition-colors ${
                                automation.enabled
                                  ? "text-green-600 hover:bg-green-50"
                                  : "neu-text-muted hover:neu-bg"
                              }`}
                              title={automation.enabled ? "Disable" : "Enable"}
                            >
                              {automation.enabled ? (
                                <Play className="w-4 h-4 md:w-5 md:h-5" />
                              ) : (
                                <Pause className="w-4 h-4 md:w-5 md:h-5" />
                              )}
                            </button>
                            <button
                              onClick={() => handleEdit(automation)}
                              className="p-1.5 md:p-2 rounded-lg neu-text-muted hover:text-sky-600 hover:bg-sky-50 transition-colors"
                              title="Edit"
                            >
                              <Pencil className="w-4 h-4 md:w-5 md:h-5" />
                            </button>
                            <button
                              onClick={() => handleDelete(automation.id)}
                              className="p-1.5 md:p-2 rounded-lg neu-text-muted hover:text-red-500 hover:bg-red-50 transition-colors"
                              title="Delete"
                            >
                              <Trash2 className="w-4 h-4 md:w-5 md:h-5" />
                            </button>
                          </div>
                        </div>
                        {/* Prompt toggle button */}
                        {getPrompt(automation) && (
                          <button
                            onClick={() => togglePromptExpand(automation.id)}
                            className="flex items-center gap-1 text-xs neu-text-secondary hover:neu-text-primary transition-colors mt-1.5 md:mt-2"
                          >
                            <ChevronDown
                              className={`w-3.5 h-3.5 transition-transform ${
                                expandedPrompts.has(automation.id)
                                  ? "rotate-180"
                                  : ""
                              }`}
                            />
                            Prompt
                          </button>
                        )}
                        {/* Info row */}
                        <div className="flex items-center gap-3 md:gap-4 mt-2 md:mt-3 text-xs md:text-sm flex-wrap">
                          <span className="flex items-center gap-1 neu-text-secondary">
                            <Clock className="w-4 h-4" />
                            {SCHEDULE_LABELS[automation.schedule]}
                            {automation.scheduledTime &&
                              ` ${automation.scheduledTime}`}
                          </span>
                          <span className="flex items-center gap-1 neu-text-secondary">
                            <Bot className="w-4 h-4" />
                            {AI_PROVIDER_INFO[automation.aiModel]?.label ??
                              automation.aiModel}
                          </span>
                          {statusInfo && StatusIcon && (
                            <span
                              className={`flex items-center gap-1 ${statusInfo.color}`}
                            >
                              <StatusIcon
                                className={`w-4 h-4 ${automation.lastRunStatus === "running" ? "animate-spin" : ""}`}
                              />
                              {statusInfo.label}
                              {automation.lastRunAt && (
                                <span className="neu-text-muted ml-1">
                                  ({formatDate(automation.lastRunAt)})
                                </span>
                              )}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    {/* Expanded prompt - full width */}
                    {getPrompt(automation) &&
                      expandedPrompts.has(automation.id) && (
                        <div className="mt-2 p-2 md:p-3 neu-pressed rounded-lg text-xs md:text-sm neu-text-secondary whitespace-pre-wrap">
                          {getPrompt(automation)}
                        </div>
                      )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Relay Schedulers */}
          {relaySchedulers.length > 0 && (
            <div className="mt-6 md:mt-8">
              <h2 className="text-sm font-semibold neu-text-secondary uppercase tracking-wider mb-3 flex items-center gap-2">
                <Bot className="w-4 h-4" />
                AI Company Relay
              </h2>
              <div className="space-y-3 md:space-y-4">
                {relaySchedulers.map((s) => {
                  const isRunning = runningIds.has(s.id);
                  const nextIn = formatRelayNextRun(s.nextRunAt);
                  const extra = s.extra as
                    | {
                        gwsAuthValid?: boolean;
                        pending?: number;
                        running?: number;
                        completed?: number;
                      }
                    | undefined;
                  return (
                    <div
                      key={s.id}
                      className={`neu-card p-3 md:p-5 transition-all ${s.enabled ? "" : "opacity-60"}`}
                    >
                      <div className="flex items-start gap-3 md:gap-4">
                        <div className="p-2 md:p-3 rounded-xl bg-violet-50 shrink-0">
                          <Bot className="w-5 h-5 md:w-6 md:h-6 text-violet-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2 flex-wrap min-w-0">
                              <h3 className="text-base md:text-lg font-semibold neu-text-primary truncate">
                                {s.name}
                              </h3>
                              <span className="text-[10px] md:text-xs px-1.5 md:px-2 py-0.5 rounded-full shrink-0 bg-violet-50 text-violet-600">
                                Relay
                              </span>
                              {extra?.gwsAuthValid === false && (
                                <span className="text-[10px] md:text-xs px-1.5 md:px-2 py-0.5 rounded-full shrink-0 bg-red-50 text-red-600">
                                  GWS Auth Error
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1 md:gap-2 shrink-0">
                              {s.triggerEndpoint && (
                                <button
                                  onClick={() => handleRelayTrigger(s)}
                                  disabled={isRunning}
                                  className={`p-1.5 md:p-2 rounded-lg transition-colors ${
                                    isRunning
                                      ? "text-blue-600 bg-blue-50"
                                      : "text-sky-600 hover:bg-sky-50"
                                  }`}
                                  title="Run Now"
                                >
                                  {isRunning ? (
                                    <Loader2 className="w-4 h-4 md:w-5 md:h-5 animate-spin" />
                                  ) : (
                                    <Rocket className="w-4 h-4 md:w-5 md:h-5" />
                                  )}
                                </button>
                              )}
                            </div>
                          </div>
                          <p className="text-xs neu-text-secondary mt-1 line-clamp-2">
                            {s.description}
                          </p>
                          <div className="flex items-center gap-3 md:gap-4 mt-2 md:mt-3 text-xs md:text-sm flex-wrap">
                            <span className="flex items-center gap-1 neu-text-secondary">
                              <Clock className="w-4 h-4" />
                              {s.schedule}
                              {s.scheduledTime && ` ${s.scheduledTime}`}
                            </span>
                            <span className="flex items-center gap-1 neu-text-secondary">
                              <Bot className="w-4 h-4" />
                              Claude Code
                            </span>
                            {s.lastRunStatus && (
                              <span
                                className={`flex items-center gap-1 ${
                                  s.lastRunStatus === "success"
                                    ? "text-green-600"
                                    : s.lastRunStatus === "error"
                                      ? "text-red-600"
                                      : "text-blue-600"
                                }`}
                              >
                                {s.lastRunStatus === "success" ? (
                                  <CheckCircle2 className="w-4 h-4" />
                                ) : s.lastRunStatus === "error" ? (
                                  <XCircle className="w-4 h-4" />
                                ) : (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                )}
                                {s.lastRunStatus === "success"
                                  ? "Success"
                                  : s.lastRunStatus === "error"
                                    ? "Error"
                                    : "Running"}
                                {s.lastRunAt && (
                                  <span className="neu-text-muted ml-1">
                                    ({formatDate(s.lastRunAt)})
                                  </span>
                                )}
                              </span>
                            )}
                            {nextIn && (
                              <span className="flex items-center gap-1 text-violet-600">
                                <ChevronRight className="w-3.5 h-3.5" />
                                in {nextIn}
                              </span>
                            )}
                            {extra?.pending !== undefined && (
                              <span className="flex items-center gap-1 neu-text-secondary">
                                Queue: {extra.pending} pending, {extra.running}{" "}
                                running, {extra.completed} done
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Create Modal */}
          {createMode &&
            createPortal(
              <div
                className="fixed inset-0 bg-black/50 flex justify-center z-[60] px-4 overflow-y-auto overscroll-contain"
                style={{
                  paddingTop: "calc(4rem + env(safe-area-inset-top, 0px))",
                  paddingBottom:
                    "calc(5rem + env(safe-area-inset-bottom, 0px))",
                }}
                onClick={(e) => {
                  if (e.target === e.currentTarget) setCreateMode(null);
                }}
              >
                <div className="neu-modal max-w-md w-full max-h-[calc(100dvh-8rem)] overflow-y-auto my-auto">
                  {createMode === "select" && (
                    <>
                      <div className="p-6 border-b border-slate-200 shrink-0">
                        <h3 className="text-xl font-semibold neu-text-primary">
                          Create Automation
                        </h3>
                        <p className="neu-text-secondary text-sm mt-1">
                          Select a type
                        </p>
                      </div>
                      <div className="p-4 space-y-2">
                        <button
                          onClick={() => setCreateMode("paper")}
                          className="w-full flex items-center gap-4 p-4 rounded-xl neu-flat transition-colors text-left"
                        >
                          <div className="p-3 rounded-xl bg-blue-50">
                            <FileText className="w-6 h-6 text-blue-600" />
                          </div>
                          <div className="flex-1">
                            <h4 className="font-medium neu-text-primary">
                              R&D
                            </h4>
                            <p className="neu-text-secondary text-sm">
                              Search Arxiv for latest papers and create reports
                            </p>
                          </div>
                          <ChevronRight className="w-5 h-5 neu-text-muted" />
                        </button>
                        <button
                          onClick={() => setCreateMode("news")}
                          className="w-full flex items-center gap-4 p-4 rounded-xl neu-flat transition-colors text-left"
                        >
                          <div className="p-3 rounded-xl bg-orange-50">
                            <Newspaper className="w-6 h-6 text-orange-600" />
                          </div>
                          <div className="flex-1">
                            <h4 className="font-medium neu-text-primary">
                              News Collection
                            </h4>
                            <p className="neu-text-secondary text-sm">
                              Collect and summarize information on specific
                              topics
                            </p>
                          </div>
                          <ChevronRight className="w-5 h-5 neu-text-muted" />
                        </button>
                        <button
                          onClick={() => setCreateMode("hp_post")}
                          className="w-full flex items-center gap-4 p-4 rounded-xl neu-flat transition-colors text-left"
                        >
                          <div className="p-3 rounded-xl bg-green-50">
                            <Globe className="w-6 h-6 text-green-600" />
                          </div>
                          <div className="flex-1">
                            <h4 className="font-medium neu-text-primary">
                              HP Post
                            </h4>
                            <p className="neu-text-secondary text-sm">
                              Generate and publish articles to homepage
                            </p>
                          </div>
                          <ChevronRight className="w-5 h-5 neu-text-muted" />
                        </button>
                        <button
                          onClick={() => setCreateMode("event_discovery")}
                          className="w-full flex items-center gap-4 p-4 rounded-xl neu-flat transition-colors text-left"
                        >
                          <div className="p-3 rounded-xl bg-teal-50">
                            <CalendarDays className="w-6 h-6 text-teal-600" />
                          </div>
                          <div className="flex-1">
                            <h4 className="font-medium neu-text-primary">
                              Event Discovery
                            </h4>
                            <p className="neu-text-secondary text-sm">
                              Find interesting events from Peatix & Luma
                            </p>
                          </div>
                          <ChevronRight className="w-5 h-5 neu-text-muted" />
                        </button>
                        <button
                          onClick={() => setCreateMode("stock_analysis")}
                          className="w-full flex items-center gap-4 p-4 rounded-xl neu-flat transition-colors text-left"
                        >
                          <div className="p-3 rounded-xl bg-emerald-50">
                            <TrendingUp className="w-6 h-6 text-emerald-600" />
                          </div>
                          <div className="flex-1">
                            <h4 className="font-medium neu-text-primary">
                              Stock Analysis
                            </h4>
                            <p className="neu-text-secondary text-sm">
                              Analyze portfolio & watchlist with technical
                              indicators
                            </p>
                          </div>
                          <ChevronRight className="w-5 h-5 neu-text-muted" />
                        </button>
                        <button
                          onClick={() => setCreateMode("event_collect")}
                          className="w-full flex items-center gap-4 p-4 rounded-xl neu-flat transition-colors text-left"
                        >
                          <div className="p-3 rounded-xl bg-pink-50">
                            <CalendarDays className="w-6 h-6 text-pink-600" />
                          </div>
                          <div className="flex-1">
                            <h4 className="font-medium neu-text-primary">
                              Event Collect
                            </h4>
                            <p className="neu-text-secondary text-sm">
                              Collect tech & business events from multiple
                              platforms
                            </p>
                          </div>
                          <ChevronRight className="w-5 h-5 neu-text-muted" />
                        </button>
                        <button
                          onClick={() => setCreateMode("ai_news_digest")}
                          className="w-full flex items-center gap-4 p-4 rounded-xl neu-flat transition-colors text-left"
                        >
                          <div className="p-3 rounded-xl bg-cyan-50">
                            <Newspaper className="w-6 h-6 text-cyan-600" />
                          </div>
                          <div className="flex-1">
                            <h4 className="font-medium neu-text-primary">
                              AI News Digest
                            </h4>
                            <p className="neu-text-secondary text-sm">
                              Collect & summarize latest AI news from arXiv &
                              blogs
                            </p>
                          </div>
                          <ChevronRight className="w-5 h-5 neu-text-muted" />
                        </button>
                      </div>
                      <div className="p-4 border-t border-slate-200 shrink-0">
                        <button
                          onClick={() => setCreateMode(null)}
                          className="w-full py-2 neu-text-secondary hover:neu-text-primary transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </>
                  )}

                  {(createMode === "paper" || createMode === "news") && (
                    <>
                      <div className="p-6 border-b border-slate-200 shrink-0">
                        <h3 className="text-xl font-semibold neu-text-primary">
                          {createMode === "paper" ? "R&D" : "News Collection"}
                        </h3>
                        <p className="neu-text-secondary text-sm mt-1">
                          Enter configuration
                        </p>
                      </div>
                      <div className="p-6 space-y-4">
                        <div>
                          <label className="block text-sm font-medium neu-text-primary mb-1">
                            Name <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="text"
                            value={newAutomation.name}
                            onChange={(e) =>
                              setNewAutomation({
                                ...newAutomation,
                                name: e.target.value,
                              })
                            }
                            placeholder={
                              createMode === "paper"
                                ? "AI Paper Watcher"
                                : "Tech News"
                            }
                            className="w-full px-3 py-2 neu-input rounded-lg"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium neu-text-primary mb-1">
                            AI Prompt <span className="text-red-500">*</span>
                          </label>
                          <textarea
                            value={newAutomation.description}
                            onChange={(e) =>
                              setNewAutomation({
                                ...newAutomation,
                                description: e.target.value,
                              })
                            }
                            placeholder={
                              createMode === "paper"
                                ? "e.g.: Search for the latest papers on LLM and RAG, and summarize each paper in 3 lines"
                                : "e.g.: Find the latest AI industry news, select the top 5 important ones, and summarize them"
                            }
                            rows={4}
                            className="w-full px-3 py-2 neu-input rounded-lg resize-none"
                          />
                          <p className="text-xs neu-text-secondary mt-1">
                            This prompt will be sent to the AI
                          </p>
                        </div>
                        <div>
                          <label className="block text-sm font-medium neu-text-primary mb-1">
                            AI Provider
                          </label>
                          <select
                            value={newAutomation.aiModel}
                            onChange={(e) =>
                              setNewAutomation({
                                ...newAutomation,
                                aiModel: e.target.value as AiProvider,
                              })
                            }
                            title="AI Provider"
                            className="w-full px-3 py-2 neu-input rounded-lg"
                          >
                            {(
                              Object.keys(AI_PROVIDER_INFO) as AiProvider[]
                            ).map((provider) => (
                              <option key={provider} value={provider}>
                                {AI_PROVIDER_INFO[provider].label} -{" "}
                                {AI_PROVIDER_INFO[provider].description}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-medium neu-text-primary mb-1">
                              Frequency
                            </label>
                            <select
                              value={newAutomation.schedule}
                              onChange={(e) =>
                                setNewAutomation({
                                  ...newAutomation,
                                  schedule: e.target
                                    .value as AutomationSchedule,
                                })
                              }
                              title="Frequency"
                              className="w-full px-3 py-2 neu-input rounded-lg"
                            >
                              <option value="daily">Daily</option>
                              <option value="weekly">Weekly</option>
                              <option value="monthly">Monthly</option>
                            </select>
                          </div>
                          <div>
                            <TimePicker
                              label="Run Time"
                              value={newAutomation.scheduledTime}
                              onChange={(value) =>
                                setNewAutomation({
                                  ...newAutomation,
                                  scheduledTime: value,
                                })
                              }
                            />
                          </div>
                        </div>
                      </div>
                      <div className="p-4 border-t border-slate-200 shrink-0 flex gap-3">
                        <button
                          onClick={() => {
                            setCreateMode("select");
                            resetForm();
                          }}
                          className="flex-1 py-2 neu-text-secondary hover:neu-text-primary transition-colors"
                        >
                          Back
                        </button>
                        <button
                          onClick={
                            createMode === "paper"
                              ? handleCreatePaperSearch
                              : handleCreateNewsCollection
                          }
                          disabled={
                            !newAutomation.name || !newAutomation.description
                          }
                          className="flex-1 py-2 bg-sky-600 text-white rounded-lg hover:bg-sky-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Create
                        </button>
                      </div>
                    </>
                  )}

                  {createMode === "event_discovery" && (
                    <>
                      <div className="p-6 border-b border-slate-200 shrink-0">
                        <h3 className="text-xl font-semibold neu-text-primary">
                          Event Discovery
                        </h3>
                        <p className="neu-text-secondary text-sm mt-1">
                          Enter configuration
                        </p>
                      </div>
                      <div className="p-6 space-y-4">
                        <div>
                          <label className="block text-sm font-medium neu-text-primary mb-1">
                            Name <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="text"
                            value={newAutomation.name}
                            onChange={(e) =>
                              setNewAutomation({
                                ...newAutomation,
                                name: e.target.value,
                              })
                            }
                            placeholder="Tech Event Finder"
                            className="w-full px-3 py-2 neu-input rounded-lg"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium neu-text-primary mb-1">
                            Keywords <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="text"
                            value={newAutomation.keywords}
                            onChange={(e) =>
                              setNewAutomation({
                                ...newAutomation,
                                keywords: e.target.value,
                              })
                            }
                            placeholder="AI, LLM, Machine Learning"
                            className="w-full px-3 py-2 neu-input rounded-lg"
                          />
                          <p className="text-xs neu-text-secondary mt-1">
                            Comma-separated keywords for event search
                          </p>
                        </div>
                        <div>
                          <label className="block text-sm font-medium neu-text-primary mb-1">
                            Location
                          </label>
                          <input
                            type="text"
                            value={newAutomation.location}
                            onChange={(e) =>
                              setNewAutomation({
                                ...newAutomation,
                                location: e.target.value,
                              })
                            }
                            placeholder="tokyo"
                            className="w-full px-3 py-2 neu-input rounded-lg"
                          />
                          <p className="text-xs neu-text-secondary mt-1">
                            City or region (used for Luma location slug & Peatix
                            area)
                          </p>
                        </div>
                        <div>
                          <label className="block text-sm font-medium neu-text-primary mb-1">
                            Platforms
                          </label>
                          <div className="flex gap-4">
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={newAutomation.platforms.includes(
                                  "peatix",
                                )}
                                onChange={(e) => {
                                  const platforms = e.target.checked
                                    ? ([
                                        ...newAutomation.platforms,
                                        "peatix",
                                      ] as ("peatix" | "luma")[])
                                    : newAutomation.platforms.filter(
                                        (p) => p !== "peatix",
                                      );
                                  setNewAutomation({
                                    ...newAutomation,
                                    platforms,
                                  });
                                }}
                                className="rounded"
                              />
                              <span className="text-sm neu-text-primary">
                                Peatix
                              </span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={newAutomation.platforms.includes(
                                  "luma",
                                )}
                                onChange={(e) => {
                                  const platforms = e.target.checked
                                    ? ([...newAutomation.platforms, "luma"] as (
                                        | "peatix"
                                        | "luma"
                                      )[])
                                    : newAutomation.platforms.filter(
                                        (p) => p !== "luma",
                                      );
                                  setNewAutomation({
                                    ...newAutomation,
                                    platforms,
                                  });
                                }}
                                className="rounded"
                              />
                              <span className="text-sm neu-text-primary">
                                Luma
                              </span>
                            </label>
                          </div>
                        </div>
                        <div>
                          <label className="block text-sm font-medium neu-text-primary mb-1">
                            Additional Instructions
                          </label>
                          <textarea
                            value={newAutomation.description}
                            onChange={(e) =>
                              setNewAutomation({
                                ...newAutomation,
                                description: e.target.value,
                              })
                            }
                            placeholder="e.g.: Prefer free events, weekday evenings"
                            rows={3}
                            className="w-full px-3 py-2 neu-input rounded-lg resize-none"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium neu-text-primary mb-1">
                            AI Provider
                          </label>
                          <select
                            value={newAutomation.aiModel}
                            onChange={(e) =>
                              setNewAutomation({
                                ...newAutomation,
                                aiModel: e.target.value as AiProvider,
                              })
                            }
                            title="AI Provider"
                            className="w-full px-3 py-2 neu-input rounded-lg"
                          >
                            {(
                              Object.keys(AI_PROVIDER_INFO) as AiProvider[]
                            ).map((provider) => (
                              <option key={provider} value={provider}>
                                {AI_PROVIDER_INFO[provider].label} -{" "}
                                {AI_PROVIDER_INFO[provider].description}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-medium neu-text-primary mb-1">
                              Frequency
                            </label>
                            <select
                              value={newAutomation.schedule}
                              onChange={(e) =>
                                setNewAutomation({
                                  ...newAutomation,
                                  schedule: e.target
                                    .value as AutomationSchedule,
                                })
                              }
                              title="Frequency"
                              className="w-full px-3 py-2 neu-input rounded-lg"
                            >
                              <option value="daily">Daily</option>
                              <option value="weekly">Weekly</option>
                              <option value="monthly">Monthly</option>
                            </select>
                          </div>
                          <div>
                            <TimePicker
                              label="Run Time"
                              value={newAutomation.scheduledTime}
                              onChange={(value) =>
                                setNewAutomation({
                                  ...newAutomation,
                                  scheduledTime: value,
                                })
                              }
                            />
                          </div>
                        </div>
                      </div>
                      <div className="p-4 border-t border-slate-200 shrink-0 flex gap-3">
                        <button
                          onClick={() => {
                            setCreateMode("select");
                            resetForm();
                          }}
                          className="flex-1 py-2 neu-text-secondary hover:neu-text-primary transition-colors"
                        >
                          Back
                        </button>
                        <button
                          onClick={handleCreateEventDiscovery}
                          disabled={
                            !newAutomation.name || !newAutomation.keywords
                          }
                          className="flex-1 py-2 bg-sky-600 text-white rounded-lg hover:bg-sky-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Create
                        </button>
                      </div>
                    </>
                  )}

                  {createMode === "hp_post" && (
                    <>
                      <div className="p-6 border-b border-slate-200 shrink-0">
                        <h3 className="text-xl font-semibold neu-text-primary">
                          HP Post
                        </h3>
                        <p className="neu-text-secondary text-sm mt-1">
                          Enter configuration
                        </p>
                      </div>
                      <div className="p-6 space-y-4">
                        <div>
                          <label className="block text-sm font-medium neu-text-primary mb-1">
                            Name <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="text"
                            value={newAutomation.name}
                            onChange={(e) =>
                              setNewAutomation({
                                ...newAutomation,
                                name: e.target.value,
                              })
                            }
                            placeholder="HP Auto Post"
                            className="w-full px-3 py-2 neu-input rounded-lg"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium neu-text-primary mb-1">
                            AI Prompt <span className="text-red-500">*</span>
                          </label>
                          <textarea
                            value={newAutomation.description}
                            onChange={(e) =>
                              setNewAutomation({
                                ...newAutomation,
                                description: e.target.value,
                              })
                            }
                            placeholder="e.g.: Write a release announcement about our latest product update"
                            rows={4}
                            className="w-full px-3 py-2 neu-input rounded-lg resize-none"
                          />
                          <p className="text-xs neu-text-secondary mt-1">
                            This prompt will be sent to the AI to generate the
                            article
                          </p>
                        </div>
                        <div>
                          <label className="block text-sm font-medium neu-text-primary mb-1">
                            Category
                          </label>
                          <input
                            type="text"
                            value={newAutomation.category}
                            onChange={(e) =>
                              setNewAutomation({
                                ...newAutomation,
                                category: e.target.value,
                              })
                            }
                            placeholder="Release"
                            className="w-full px-3 py-2 neu-input rounded-lg"
                          />
                          <p className="text-xs neu-text-secondary mt-1">
                            Category for the HP media entry (e.g. Release, News,
                            Update)
                          </p>
                        </div>
                        <div>
                          <label className="block text-sm font-medium neu-text-primary mb-1">
                            AI Provider
                          </label>
                          <select
                            value={newAutomation.aiModel}
                            onChange={(e) =>
                              setNewAutomation({
                                ...newAutomation,
                                aiModel: e.target.value as AiProvider,
                              })
                            }
                            title="AI Provider"
                            className="w-full px-3 py-2 neu-input rounded-lg"
                          >
                            {(
                              Object.keys(AI_PROVIDER_INFO) as AiProvider[]
                            ).map((provider) => (
                              <option key={provider} value={provider}>
                                {AI_PROVIDER_INFO[provider].label} -{" "}
                                {AI_PROVIDER_INFO[provider].description}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-medium neu-text-primary mb-1">
                              Frequency
                            </label>
                            <select
                              value={newAutomation.schedule}
                              onChange={(e) =>
                                setNewAutomation({
                                  ...newAutomation,
                                  schedule: e.target
                                    .value as AutomationSchedule,
                                })
                              }
                              title="Frequency"
                              className="w-full px-3 py-2 neu-input rounded-lg"
                            >
                              <option value="daily">Daily</option>
                              <option value="weekly">Weekly</option>
                              <option value="monthly">Monthly</option>
                            </select>
                          </div>
                          <div>
                            <TimePicker
                              label="Run Time"
                              value={newAutomation.scheduledTime}
                              onChange={(value) =>
                                setNewAutomation({
                                  ...newAutomation,
                                  scheduledTime: value,
                                })
                              }
                            />
                          </div>
                        </div>
                      </div>
                      <div className="p-4 border-t border-slate-200 shrink-0 flex gap-3">
                        <button
                          onClick={() => {
                            setCreateMode("select");
                            resetForm();
                          }}
                          className="flex-1 py-2 neu-text-secondary hover:neu-text-primary transition-colors"
                        >
                          Back
                        </button>
                        <button
                          onClick={handleCreateHpPost}
                          disabled={
                            !newAutomation.name || !newAutomation.description
                          }
                          className="flex-1 py-2 bg-sky-600 text-white rounded-lg hover:bg-sky-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Create
                        </button>
                      </div>
                    </>
                  )}

                  {createMode === "stock_analysis" && (
                    <>
                      <div className="p-6 border-b border-slate-200 shrink-0">
                        <h3 className="text-xl font-semibold neu-text-primary">
                          Stock Analysis
                        </h3>
                        <p className="neu-text-secondary text-sm mt-1">
                          Analyze your portfolio & watchlist automatically
                        </p>
                      </div>
                      <div className="p-6 space-y-4">
                        <div>
                          <label className="block text-sm font-medium neu-text-primary mb-1">
                            Name <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="text"
                            value={newAutomation.name}
                            onChange={(e) =>
                              setNewAutomation({
                                ...newAutomation,
                                name: e.target.value,
                              })
                            }
                            placeholder="Daily Stock Report"
                            className="w-full px-3 py-2 neu-input rounded-lg"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium neu-text-primary mb-1">
                            Additional Instructions (optional)
                          </label>
                          <textarea
                            value={newAutomation.description}
                            onChange={(e) =>
                              setNewAutomation({
                                ...newAutomation,
                                description: e.target.value,
                              })
                            }
                            placeholder="e.g.: Focus on tech stocks, highlight any RSI extremes"
                            rows={3}
                            className="w-full px-3 py-2 neu-input rounded-lg resize-none"
                          />
                          <p className="text-xs neu-text-secondary mt-1">
                            Holdings & watchlist symbols are fetched
                            automatically
                          </p>
                        </div>
                        {/* Schedule */}
                        <div>
                          <label className="block text-sm font-medium neu-text-primary mb-1">
                            Schedule
                          </label>
                          <div className="flex gap-2">
                            {(["daily", "weekly", "manual"] as const).map(
                              (s) => (
                                <button
                                  key={s}
                                  onClick={() =>
                                    setNewAutomation({
                                      ...newAutomation,
                                      schedule: s,
                                    })
                                  }
                                  className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                                    newAutomation.schedule === s
                                      ? "bg-sky-600 text-white"
                                      : "neu-flat neu-text-secondary"
                                  }`}
                                >
                                  {SCHEDULE_LABELS[s]}
                                </button>
                              ),
                            )}
                          </div>
                        </div>
                        {newAutomation.schedule !== "manual" && (
                          <div>
                            <label className="block text-sm font-medium neu-text-primary mb-1">
                              Time
                            </label>
                            <TimePicker
                              value={newAutomation.scheduledTime}
                              onChange={(v) =>
                                setNewAutomation({
                                  ...newAutomation,
                                  scheduledTime: v,
                                })
                              }
                            />
                          </div>
                        )}
                        {/* AI Model */}
                        <div>
                          <label className="block text-sm font-medium neu-text-primary mb-1">
                            AI Model
                          </label>
                          <div className="grid grid-cols-2 gap-2">
                            {(
                              Object.entries(AI_PROVIDER_INFO) as [
                                AiProvider,
                                { label: string; description: string },
                              ][]
                            ).map(([key, info]) => (
                              <button
                                key={key}
                                onClick={() =>
                                  setNewAutomation({
                                    ...newAutomation,
                                    aiModel: key,
                                  })
                                }
                                className={`p-2 rounded-lg text-left text-sm transition-colors ${
                                  newAutomation.aiModel === key
                                    ? "bg-sky-600 text-white"
                                    : "neu-flat neu-text-secondary"
                                }`}
                              >
                                <div className="font-medium">{info.label}</div>
                                <div
                                  className={`text-xs ${newAutomation.aiModel === key ? "text-sky-100" : ""}`}
                                >
                                  {info.description}
                                </div>
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                      <div className="p-4 border-t border-slate-200 flex gap-2 shrink-0">
                        <button
                          onClick={() => {
                            setCreateMode("select");
                            resetForm();
                          }}
                          className="flex-1 py-2 neu-text-secondary hover:neu-text-primary transition-colors"
                        >
                          Back
                        </button>
                        <button
                          onClick={handleCreateStockAnalysis}
                          disabled={!newAutomation.name}
                          className="flex-1 py-2 bg-sky-600 text-white rounded-lg hover:bg-sky-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Create
                        </button>
                      </div>
                    </>
                  )}

                  {createMode === "event_collect" && (
                    <>
                      <div className="p-6 border-b border-slate-200 shrink-0">
                        <h3 className="text-xl font-semibold neu-text-primary">
                          Event Collect
                        </h3>
                        <p className="neu-text-secondary text-sm mt-1">
                          Collect events from connpass, techplay, luma & peatix
                        </p>
                      </div>
                      <div className="p-6 space-y-4">
                        <div>
                          <label className="block text-sm font-medium neu-text-primary mb-1">
                            Name <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="text"
                            value={newAutomation.name}
                            onChange={(e) =>
                              setNewAutomation({
                                ...newAutomation,
                                name: e.target.value,
                              })
                            }
                            placeholder="イベント収集"
                            className="w-full px-3 py-2 neu-input rounded-lg"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium neu-text-primary mb-1">
                            Additional Instructions (optional)
                          </label>
                          <textarea
                            value={newAutomation.description}
                            onChange={(e) =>
                              setNewAutomation({
                                ...newAutomation,
                                description: e.target.value,
                              })
                            }
                            placeholder="e.g.: Focus on AI/ML events in Tokyo area"
                            rows={3}
                            className="w-full px-3 py-2 neu-input rounded-lg resize-none"
                          />
                          <p className="text-xs neu-text-secondary mt-1">
                            Platforms, keywords, and location can be edited
                            after creation
                          </p>
                        </div>
                        {/* Schedule */}
                        <div>
                          <label className="block text-sm font-medium neu-text-primary mb-1">
                            Schedule
                          </label>
                          <div className="flex gap-2">
                            {(["daily", "weekly", "manual"] as const).map(
                              (s) => (
                                <button
                                  key={s}
                                  onClick={() =>
                                    setNewAutomation({
                                      ...newAutomation,
                                      schedule: s,
                                    })
                                  }
                                  className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                                    newAutomation.schedule === s
                                      ? "bg-sky-600 text-white"
                                      : "neu-flat neu-text-secondary"
                                  }`}
                                >
                                  {SCHEDULE_LABELS[s]}
                                </button>
                              ),
                            )}
                          </div>
                        </div>
                        {newAutomation.schedule !== "manual" && (
                          <div>
                            <label className="block text-sm font-medium neu-text-primary mb-1">
                              Time
                            </label>
                            <TimePicker
                              value={newAutomation.scheduledTime}
                              onChange={(v) =>
                                setNewAutomation({
                                  ...newAutomation,
                                  scheduledTime: v,
                                })
                              }
                            />
                          </div>
                        )}
                        {/* AI Model */}
                        <div>
                          <label className="block text-sm font-medium neu-text-primary mb-1">
                            AI Model
                          </label>
                          <div className="grid grid-cols-2 gap-2">
                            {(
                              Object.entries(AI_PROVIDER_INFO) as [
                                AiProvider,
                                { label: string; description: string },
                              ][]
                            ).map(([key, info]) => (
                              <button
                                key={key}
                                onClick={() =>
                                  setNewAutomation({
                                    ...newAutomation,
                                    aiModel: key,
                                  })
                                }
                                className={`p-2 rounded-lg text-left text-sm transition-colors ${
                                  newAutomation.aiModel === key
                                    ? "bg-sky-600 text-white"
                                    : "neu-flat neu-text-secondary"
                                }`}
                              >
                                <div className="font-medium">{info.label}</div>
                                <div
                                  className={`text-xs ${newAutomation.aiModel === key ? "text-sky-100" : ""}`}
                                >
                                  {info.description}
                                </div>
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                      <div className="p-4 border-t border-slate-200 flex gap-2 shrink-0">
                        <button
                          onClick={() => {
                            setCreateMode("select");
                            resetForm();
                          }}
                          className="flex-1 py-2 neu-text-secondary hover:neu-text-primary transition-colors"
                        >
                          Back
                        </button>
                        <button
                          onClick={handleCreateEventCollect}
                          disabled={!newAutomation.name}
                          className="flex-1 py-2 bg-sky-600 text-white rounded-lg hover:bg-sky-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Create
                        </button>
                      </div>
                    </>
                  )}

                  {createMode === "ai_news_digest" && (
                    <>
                      <div className="p-6 border-b border-slate-200 shrink-0">
                        <h3 className="text-xl font-semibold neu-text-primary">
                          AI News Digest
                        </h3>
                        <p className="neu-text-secondary text-sm mt-1">
                          Collect & summarize AI news from arXiv and blogs
                        </p>
                      </div>
                      <div className="p-6 space-y-4">
                        <div>
                          <label className="block text-sm font-medium neu-text-primary mb-1">
                            Name <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="text"
                            value={newAutomation.name}
                            onChange={(e) =>
                              setNewAutomation({
                                ...newAutomation,
                                name: e.target.value,
                              })
                            }
                            placeholder="AI ニュースダイジェスト"
                            className="w-full px-3 py-2 neu-input rounded-lg"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium neu-text-primary mb-1">
                            Additional Instructions (optional)
                          </label>
                          <textarea
                            value={newAutomation.description}
                            onChange={(e) =>
                              setNewAutomation({
                                ...newAutomation,
                                description: e.target.value,
                              })
                            }
                            placeholder="e.g.: Focus on LLM and multimodal research breakthroughs"
                            rows={3}
                            className="w-full px-3 py-2 neu-input rounded-lg resize-none"
                          />
                          <p className="text-xs neu-text-secondary mt-1">
                            arXiv categories and RSS feeds can be edited after
                            creation
                          </p>
                        </div>
                        {/* Schedule */}
                        <div>
                          <label className="block text-sm font-medium neu-text-primary mb-1">
                            Schedule
                          </label>
                          <div className="flex gap-2">
                            {(["daily", "weekly", "manual"] as const).map(
                              (s) => (
                                <button
                                  key={s}
                                  onClick={() =>
                                    setNewAutomation({
                                      ...newAutomation,
                                      schedule: s,
                                    })
                                  }
                                  className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                                    newAutomation.schedule === s
                                      ? "bg-sky-600 text-white"
                                      : "neu-flat neu-text-secondary"
                                  }`}
                                >
                                  {SCHEDULE_LABELS[s]}
                                </button>
                              ),
                            )}
                          </div>
                        </div>
                        {newAutomation.schedule !== "manual" && (
                          <div>
                            <label className="block text-sm font-medium neu-text-primary mb-1">
                              Time
                            </label>
                            <TimePicker
                              value={newAutomation.scheduledTime}
                              onChange={(v) =>
                                setNewAutomation({
                                  ...newAutomation,
                                  scheduledTime: v,
                                })
                              }
                            />
                          </div>
                        )}
                        {/* AI Model - default to openai */}
                        <div>
                          <label className="block text-sm font-medium neu-text-primary mb-1">
                            AI Model
                          </label>
                          <div className="grid grid-cols-2 gap-2">
                            {(
                              Object.entries(AI_PROVIDER_INFO) as [
                                AiProvider,
                                { label: string; description: string },
                              ][]
                            ).map(([key, info]) => (
                              <button
                                key={key}
                                onClick={() =>
                                  setNewAutomation({
                                    ...newAutomation,
                                    aiModel: key,
                                  })
                                }
                                className={`p-2 rounded-lg text-left text-sm transition-colors ${
                                  newAutomation.aiModel === key
                                    ? "bg-sky-600 text-white"
                                    : "neu-flat neu-text-secondary"
                                }`}
                              >
                                <div className="font-medium">{info.label}</div>
                                <div
                                  className={`text-xs ${newAutomation.aiModel === key ? "text-sky-100" : ""}`}
                                >
                                  {info.description}
                                </div>
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                      <div className="p-4 border-t border-slate-200 flex gap-2 shrink-0">
                        <button
                          onClick={() => {
                            setCreateMode("select");
                            resetForm();
                          }}
                          className="flex-1 py-2 neu-text-secondary hover:neu-text-primary transition-colors"
                        >
                          Back
                        </button>
                        <button
                          onClick={handleCreateAiNewsDigest}
                          disabled={!newAutomation.name}
                          className="flex-1 py-2 bg-sky-600 text-white rounded-lg hover:bg-sky-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Create
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>,
              document.body,
            )}

          {/* Edit Modal */}
          {editingAutomation &&
            createPortal(
              <div
                className="fixed inset-0 bg-black/50 flex justify-center z-[60] px-4 overflow-y-auto overscroll-contain"
                style={{
                  paddingTop: "calc(4rem + env(safe-area-inset-top, 0px))",
                  paddingBottom:
                    "calc(5rem + env(safe-area-inset-bottom, 0px))",
                }}
                onClick={(e) => {
                  if (e.target === e.currentTarget) setEditingAutomation(null);
                }}
              >
                <div className="neu-modal max-w-md w-full max-h-[calc(100dvh-8rem)] overflow-y-auto my-auto">
                  <div className="p-6 border-b border-slate-200 shrink-0">
                    <h3 className="text-xl font-semibold neu-text-primary">
                      Edit Automation
                    </h3>
                    <p className="neu-text-secondary text-sm mt-1">
                      {
                        AUTOMATION_TYPE_INFO[editingAutomation.automationType]
                          ?.label
                      }
                    </p>
                  </div>
                  <div className="p-6 space-y-4">
                    <div>
                      <label className="block text-sm font-medium neu-text-primary mb-1">
                        Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={editForm.name}
                        onChange={(e) =>
                          setEditForm({ ...editForm, name: e.target.value })
                        }
                        title="Automation name"
                        className="w-full px-3 py-2 neu-input rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium neu-text-primary mb-1">
                        AI Prompt <span className="text-red-500">*</span>
                      </label>
                      <textarea
                        value={editForm.description}
                        onChange={(e) =>
                          setEditForm({
                            ...editForm,
                            description: e.target.value,
                          })
                        }
                        rows={4}
                        title="AI prompt"
                        className="w-full px-3 py-2 neu-input rounded-lg resize-none"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium neu-text-primary mb-1">
                        AI Provider
                      </label>
                      <select
                        value={editForm.aiModel}
                        onChange={(e) =>
                          setEditForm({
                            ...editForm,
                            aiModel: e.target.value as AiProvider,
                          })
                        }
                        title="AI Provider"
                        className="w-full px-3 py-2 neu-input rounded-lg"
                      >
                        {(Object.keys(AI_PROVIDER_INFO) as AiProvider[]).map(
                          (provider) => (
                            <option key={provider} value={provider}>
                              {AI_PROVIDER_INFO[provider].label} -{" "}
                              {AI_PROVIDER_INFO[provider].description}
                            </option>
                          ),
                        )}
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium neu-text-primary mb-1">
                          Frequency
                        </label>
                        <select
                          value={editForm.schedule}
                          onChange={(e) =>
                            setEditForm({
                              ...editForm,
                              schedule: e.target.value as AutomationSchedule,
                            })
                          }
                          title="Frequency"
                          className="w-full px-3 py-2 neu-input rounded-lg"
                        >
                          <option value="daily">Daily</option>
                          <option value="weekly">Weekly</option>
                          <option value="monthly">Monthly</option>
                        </select>
                      </div>
                      <div>
                        <TimePicker
                          label="Run Time"
                          value={editForm.scheduledTime}
                          onChange={(value) =>
                            setEditForm({
                              ...editForm,
                              scheduledTime: value,
                            })
                          }
                        />
                      </div>
                    </div>
                  </div>
                  <div className="p-4 border-t border-slate-200 shrink-0 flex gap-3">
                    <button
                      onClick={() => setEditingAutomation(null)}
                      className="flex-1 py-2 neu-text-secondary hover:neu-text-primary transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveEdit}
                      disabled={!editForm.name || !editForm.description}
                      className="flex-1 py-2 bg-sky-600 text-white rounded-lg hover:bg-sky-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Save
                    </button>
                  </div>
                </div>
              </div>,
              document.body,
            )}
        </main>
      </div>

      <AlertDialog
        isOpen={alertState.isOpen}
        type="error"
        title={alertState.title}
        message={alertState.message}
        onClose={() => setAlertState({ isOpen: false, title: "", message: "" })}
      />

      <ConfirmDialog
        isOpen={confirmState.isOpen}
        title={confirmState.title}
        message={confirmState.message}
        onConfirm={confirmState.onConfirm}
        onCancel={() =>
          setConfirmState({
            isOpen: false,
            title: "",
            message: "",
            onConfirm: () => {},
          })
        }
      />
    </Layout>
  );
};
