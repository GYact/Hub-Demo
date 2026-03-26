import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import {
  Plus,
  Trash2,
  Archive,
  StickyNote,
  Loader2,
  RefreshCw,
  X,
  FolderPlus,
  Pencil,
  ChevronDown,
  ChevronUp,
  GripVertical,
  Search,
  Play,
  Terminal,
  Send,
  User,
  AlertCircle,
} from "lucide-react";
import { DndContext, closestCenter, DragEndEvent } from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  horizontalListSortingStrategy,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import type { GroupColor, Memo, MemoTab, MemoTrash } from "../types";
import { offlineDb } from "../lib/offlineDb";
import { useMemos } from "../hooks/useMemos";
import { useMemoTrash } from "../hooks/useMemoTrash";
import { useAiNotifications } from "../hooks/useAiNotifications";
import { useAuth } from "../contexts/AuthContext";
import { useUndoRedo } from "../contexts/UndoRedoContext";
import { Layout, ConfirmDialog } from "../components";
import { useUserSetting } from "../hooks/useUserSetting";
import { useSwipeableTabs } from "../hooks/useSwipeableTabs";
import { TAB_COLORS, getTabColorClasses } from "../utils/colors";
import { sanitizeMarkdown } from "../lib/formatters";
import { useDndSensors } from "../hooks/useDndSensors";
import { SortableTab } from "../components/SortableTab";
import { SortableWrapper } from "../components/SortableWrapper";
import {
  saveApplySession,
  deleteApplySession,
  loadAllApplySessions,
} from "../lib/ai-company/supabaseHistory";

// Apply chat types & persistent store (survives page navigation)
type ApplyMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};
type ApplySession = {
  messages: ApplyMessage[];
  cliSessionId?: string;
  jobId?: string;
  isStreaming: boolean;
  streamingContent: string;
  wasInterrupted?: boolean;
};
const applySessions = new Map<string, ApplySession>();
// Module-level render notifier — updated by the mounted component instance
let notifyApplyRender: (() => void) | null = null;
// AbortController for in-flight apply requests — allows cancellation on unmount/modal close
let activeApplyAbort: AbortController | null = null;

// Persist apply sessions to IndexedDB (survives full page reload)
const APPLY_SESSION_PREFIX = "apply_session:";

// Module-level userId cache — set by mounted component for Supabase sync
let _applyUserId: string | null = null;

async function persistApplySession(memoId: string) {
  const session = applySessions.get(memoId);
  if (!session) return;
  await offlineDb.meta.put({
    key: `${APPLY_SESSION_PREFIX}${memoId}`,
    value: JSON.stringify({
      messages: session.messages,
      cliSessionId: session.cliSessionId,
      jobId: session.jobId,
      wasStreaming: session.isStreaming || session.wasInterrupted === true,
    }),
  });
  // Also persist to Supabase for cross-device access
  if (_applyUserId && session.messages.length > 0) {
    saveApplySession(
      _applyUserId,
      memoId,
      session.messages,
      session.cliSessionId,
    ).catch(console.error);
  }
}

/** Returns memoIds that have a jobId (need reconnection attempt) */
async function loadPersistedApplySessions(): Promise<string[]> {
  // First, check localStorage for rescue data saved during beforeunload
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith("__apply_rescue_")) continue;
      const memoId = key.slice("__apply_rescue_".length);
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      // Promote rescue data to IndexedDB
      await offlineDb.meta.put({
        key: `${APPLY_SESSION_PREFIX}${memoId}`,
        value: raw,
      });
      localStorage.removeItem(key);
    }
  } catch {
    // ignore localStorage errors
  }

  // Load from IndexedDB (local device)
  const rows = await offlineDb.meta
    .where("key")
    .startsWith(APPLY_SESSION_PREFIX)
    .toArray();
  for (const row of rows) {
    const memoId = row.key.slice(APPLY_SESSION_PREFIX.length);
    if (applySessions.has(memoId)) continue; // don't overwrite live sessions
    try {
      const data = JSON.parse(row.value);
      applySessions.set(memoId, {
        messages: data.messages || [],
        cliSessionId: data.cliSessionId,
        jobId: data.jobId,
        isStreaming: false,
        streamingContent: "",
        wasInterrupted: data.wasStreaming === true,
      });
    } catch {
      // ignore corrupt entries
    }
  }

  // Load from Supabase (cross-device sync)
  if (_applyUserId) {
    try {
      const cloudSessions = await loadAllApplySessions(_applyUserId);
      for (const cs of cloudSessions) {
        if (applySessions.has(cs.memoId)) {
          // Local version exists — merge: prefer local if it has more messages
          // (local may have streaming content not yet synced to Supabase)
          const local = applySessions.get(cs.memoId)!;
          if (cs.messages.length > local.messages.length) {
            local.messages = cs.messages as ApplyMessage[];
            local.cliSessionId = cs.cliSessionId ?? local.cliSessionId;
          }
          continue;
        }
        // New session from another device
        applySessions.set(cs.memoId, {
          messages: cs.messages as ApplyMessage[],
          cliSessionId: cs.cliSessionId,
          isStreaming: false,
          streamingContent: "",
        });
      }
    } catch (err) {
      console.error("Failed to load apply sessions from Supabase:", err);
    }
  }

  // Return memoIds that have a running job to reconnect
  const reconnectIds: string[] = [];
  for (const [id, s] of applySessions) {
    if (s.jobId && s.wasInterrupted) reconnectIds.push(id);
  }
  return reconnectIds;
}

async function clearApplySession(memoId: string) {
  applySessions.delete(memoId);
  await offlineDb.meta.delete(`${APPLY_SESSION_PREFIX}${memoId}`);
  if (_applyUserId) {
    deleteApplySession(_applyUserId, memoId).catch(console.error);
  }
}

/** Reconnect to a running relay job by jobId (GET /api/claude-code/jobs/:id) */
async function reconnectApply(
  memoId: string,
  relayUrl: string,
  relayToken: string,
) {
  const session = applySessions.get(memoId);
  if (!session?.jobId || session.isStreaming) return;

  const baseUrl = relayUrl.replace(/\/+$/, "");

  session.isStreaming = true;
  session.streamingContent = "";
  session.wasInterrupted = false;
  notifyApplyRender?.();

  const headers: Record<string, string> = {};
  if (relayToken) headers["Authorization"] = `Bearer ${relayToken}`;

  try {
    const response = await fetch(
      `${baseUrl}/api/claude-code/jobs/${session.jobId}`,
      { headers },
    );
    if (!response.ok) {
      // Job expired or not found — mark as interrupted, clear jobId
      session.jobId = undefined;
      session.isStreaming = false;
      session.wasInterrupted = true;
      notifyApplyRender?.();
      void persistApplySession(memoId);
      return;
    }
    if (!response.body) throw new Error("Response body is empty");

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let accumulated = "";

    try {
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const dataStr = line.slice(6).trim();
          if (!dataStr) continue;
          try {
            const event = JSON.parse(dataStr) as {
              type: string;
              content?: string;
              error?: string;
              sessionId?: string;
              assistantMessage?: { content: string };
            };
            if (event.type === "session" && event.sessionId) {
              session.cliSessionId = event.sessionId;
            } else if (event.type === "chunk" && event.content) {
              accumulated += event.content;
              session.streamingContent = accumulated;
              notifyApplyRender?.();
            } else if (event.type === "done") {
              accumulated = event.assistantMessage?.content || accumulated;
              if (event.sessionId) session.cliSessionId = event.sessionId;
            } else if (event.type === "error") {
              accumulated = accumulated
                ? `${accumulated}\n\n---\nError: ${event.error}`
                : `Error: ${event.error || "Unknown error"}`;
            }
          } catch (e) {
            if (e instanceof SyntaxError) continue;
            throw e;
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    if (accumulated) {
      session.messages.push({
        id: crypto.randomUUID(),
        role: "assistant",
        content: accumulated,
      });
    }
  } catch {
    // Reconnection failed
    session.wasInterrupted = true;
  } finally {
    session.isStreaming = false;
    session.streamingContent = "";
    session.jobId = undefined; // Job consumed
    notifyApplyRender?.();
    void persistApplySession(memoId);
  }
}

type MutableRef<T> = { current: T };

/** Module-level send function — no stale closures, reads latest values via refs */
async function sendApply(
  content: string,
  memoId: string,
  relayUrlRef: MutableRef<string>,
  relayTokenRef: MutableRef<string>,
  memosRef: MutableRef<Memo[]>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  createNotificationRef: MutableRef<(opts: any) => Promise<any>>,
  displayContent?: string,
) {
  const relayUrl = relayUrlRef.current?.replace(/\/+$/, "");
  if (!relayUrl || !content.trim()) return;

  let session = applySessions.get(memoId);
  if (!session) {
    session = { messages: [], isStreaming: false, streamingContent: "" };
    applySessions.set(memoId, session);
  }
  if (session.isStreaming) return;

  session.messages.push({
    id: crypto.randomUUID(),
    role: "user",
    content: displayContent || content,
  });
  session.isStreaming = true;
  session.streamingContent = "";
  session.wasInterrupted = false;
  notifyApplyRender?.();

  // Cancel any previous in-flight request
  activeApplyAbort?.abort();
  const abortController = new AbortController();
  activeApplyAbort = abortController;

  // Persist streaming state so browser close/reload is detected as interruption
  void persistApplySession(memoId);

  // Save partial progress on browser close/reload
  const handleBeforeUnload = () => {
    const s = applySessions.get(memoId);
    if (s?.isStreaming && s.streamingContent) {
      s.messages.push({
        id: crypto.randomUUID(),
        role: "assistant",
        content: s.streamingContent,
      });
    }
    // Best-effort sync persist — use localStorage as IndexedDB may not flush
    try {
      if (s) {
        localStorage.setItem(
          `__apply_rescue_${memoId}`,
          JSON.stringify({
            messages: s.messages,
            cliSessionId: s.cliSessionId,
            jobId: s.jobId,
            wasStreaming: true,
          }),
        );
      }
    } catch {
      // best effort
    }
  };
  window.addEventListener("beforeunload", handleBeforeUnload);

  const memo = memosRef.current.find((m) => m.id === memoId);
  const memoTitle = memo?.title || "Untitled";
  let finalLog = "";
  let success = false;

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    const token = relayTokenRef.current;
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const response = await fetch(`${relayUrl}/api/claude-code`, {
      method: "POST",
      headers,
      signal: abortController.signal,
      body: JSON.stringify({
        content,
        sessionId: session.cliSessionId,
        workDir: import.meta.env.VITE_RELAY_WORK_DIR || "",
        autoGit: true,
        memoTitle,
      }),
    });

    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}));
      throw new Error(
        (errBody as { error?: string }).error || `HTTP ${response.status}`,
      );
    }
    if (!response.body) throw new Error("Response body is empty");

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let accumulated = "";

    try {
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const dataStr = line.slice(6).trim();
          if (!dataStr) continue;
          try {
            const event = JSON.parse(dataStr) as {
              type: string;
              content?: string;
              error?: string;
              sessionId?: string;
              jobId?: string;
              assistantMessage?: { content: string };
            };
            if (event.type === "job" && event.jobId) {
              // Capture relay job ID for reconnection
              session.jobId = event.jobId;
              void persistApplySession(memoId);
            } else if (event.type === "session" && event.sessionId) {
              // Capture CLI session ID early (from init event)
              session.cliSessionId = event.sessionId;
              void persistApplySession(memoId);
            } else if (event.type === "chunk" && event.content) {
              accumulated += event.content;
              session.streamingContent = accumulated;
              notifyApplyRender?.();
            } else if (event.type === "done") {
              accumulated = event.assistantMessage?.content || accumulated;
              success = true;
              if (event.sessionId) session.cliSessionId = event.sessionId;
            } else if (event.type === "error") {
              accumulated = accumulated
                ? `${accumulated}\n\n---\nError: ${event.error}`
                : `Error: ${event.error || "Unknown error"}`;
              if (event.sessionId) session.cliSessionId = event.sessionId;
            }
          } catch (e) {
            if (e instanceof SyntaxError) continue;
            throw e;
          }
        }
      }
    } finally {
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }

    finalLog = accumulated;
    if (!success && accumulated) success = true;
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      // Navigation or manual abort — state is saved by unmount cleanup.
      // Set flag so finally block skips normal finalization.
      session.wasInterrupted = true;
      return;
    }
    const msg = err instanceof Error ? err.message : "Unknown error";
    finalLog = finalLog ? `${finalLog}\n\nError: ${msg}` : `Error: ${msg}`;
  } finally {
    window.removeEventListener("beforeunload", handleBeforeUnload);
    if (activeApplyAbort === abortController) activeApplyAbort = null;
    try {
      localStorage.removeItem(`__apply_rescue_${memoId}`);
    } catch {
      // ignore
    }

    if (session.wasInterrupted) {
      // Abort due to navigation — partial progress already saved by cleanup.
      // Just ensure isStreaming is cleared for the in-memory object.
      session.isStreaming = false;
      session.streamingContent = "";
    } else {
      // Normal completion or error
      session.messages.push({
        id: crypto.randomUUID(),
        role: "assistant",
        content: finalLog || "No response generated.",
      });
      session.isStreaming = false;
      session.streamingContent = "";
      session.jobId = undefined; // Job consumed
      notifyApplyRender?.();
      void persistApplySession(memoId);
    }
  }

  // AI notification
  const truncatedLog =
    finalLog.length > 2000 ? `${finalLog.slice(-2000)}\n...` : finalLog;
  await createNotificationRef
    .current({
      source: "system",
      priority: success ? "medium" : "high",
      title: success
        ? `Backlog適用完了: ${memoTitle}`
        : `Backlog適用失敗: ${memoTitle}`,
      body: truncatedLog || "No output",
      metadata: { backlog_apply: true, memo_title: memoTitle, success },
    })
    .catch(console.error);
}

const MemoCard = ({
  memo,
  tabColor,
  tabs,
  onMove,
  onUpdate,
  onDelete,
  onApply,
  applyStatus,
  dragHandleProps,
}: {
  memo: Memo;
  tabColor: GroupColor;
  tabs: MemoTab[];
  onMove: (id: string, tabId: string) => void;
  onUpdate: (id: string, updates: Partial<Memo>) => void;
  onDelete: (id: string) => void;
  onApply?: (memo: Memo) => void;
  applyStatus?: "running" | "interrupted" | "done";
  dragHandleProps?: React.HTMLAttributes<HTMLDivElement>;
}) => {
  const [isExpanded, setIsExpanded] = useState(!memo.title);
  const colors = getTabColorClasses(tabColor);

  return (
    <div className="neu-card overflow-hidden">
      <div className="p-4 md:p-5">
        <div className="flex items-start gap-2 md:gap-3">
          {/* Drag handle */}
          <div
            {...dragHandleProps}
            className="touch-none cursor-grab active:cursor-grabbing p-1 text-slate-300 hover:text-slate-500 shrink-0 mt-1"
          >
            <GripVertical size={18} />
          </div>
          <div className={`${colors.bgLight} p-2 rounded-lg shrink-0`}>
            <StickyNote size={20} className={colors.text} />
          </div>
          <div className="flex-1 min-w-0">
            {isExpanded ? (
              <textarea
                ref={(el) => {
                  if (el) {
                    el.style.height = "auto";
                    el.style.height = el.scrollHeight + "px";
                  }
                }}
                value={memo.title}
                onChange={(e) => onUpdate(memo.id, { title: e.target.value })}
                placeholder="Title..."
                className="w-full text-base md:text-lg font-semibold neu-text-primary bg-transparent border-none outline-none placeholder:text-slate-300 focus:ring-0 resize-none overflow-hidden"
                rows={1}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    e.currentTarget.blur();
                  }
                }}
              />
            ) : (
              <span
                onClick={() => setIsExpanded(true)}
                className="w-full text-base md:text-lg font-semibold neu-text-primary cursor-text truncate block"
                title={memo.title}
              >
                {memo.title || <span className="text-slate-300">Title...</span>}
              </span>
            )}

            {/* Summary when collapsed */}
            {!isExpanded && memo.content && (
              <p className="mt-1 text-sm neu-text-secondary line-clamp-1">
                {memo.content}
              </p>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {onApply && (
              <button
                onClick={() => onApply(memo)}
                className={`p-2 rounded-lg transition-colors ${
                  applyStatus === "running"
                    ? "text-orange-500 bg-orange-50 animate-pulse"
                    : applyStatus === "interrupted"
                      ? "text-amber-500 bg-amber-50"
                      : applyStatus === "done"
                        ? "text-green-500 bg-green-50"
                        : "text-slate-400 hover:text-orange-500 hover:bg-orange-50"
                }`}
                title={
                  applyStatus === "running"
                    ? "実行中 — クリックで確認"
                    : applyStatus === "interrupted"
                      ? "中断 — クリックで再開"
                      : applyStatus === "done"
                        ? "完了 — クリックで結果確認"
                        : "Apply via Claude Code"
                }
              >
                <Play size={18} />
              </button>
            )}
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              title={isExpanded ? "Collapse" : "Expand"}
            >
              {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </button>
            <button
              onClick={() => onDelete(memo.id)}
              className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
              title="Delete"
            >
              <Trash2 size={18} />
            </button>
          </div>
        </div>

        {/* Expanded details - full width */}
        {isExpanded && (
          <div className="mt-3">
            <textarea
              value={memo.content}
              onChange={(e) => onUpdate(memo.id, { content: e.target.value })}
              placeholder="Content..."
              rows={4}
              className="w-full text-sm neu-text-secondary neu-input rounded-lg px-3 py-2 resize-y min-h-[100px]"
            />
            <div className="mt-3 flex items-center gap-2 text-xs neu-text-secondary">
              <span className="font-medium">Move to</span>
              <select
                value={memo.tabId}
                onChange={(e) => onMove(memo.id, e.target.value)}
                className="rounded-md neu-input px-2 py-1 text-xs neu-text-secondary"
              >
                {tabs.map((tab) => (
                  <option key={tab.id} value={tab.id}>
                    {tab.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export const MemosPage = () => {
  const { user } = useAuth();

  // Keep module-level userId in sync for persistApplySession.
  // Set synchronously so it's available before effects run.
  _applyUserId = user?.id ?? null;

  const {
    tabs,
    memos,
    isLoading,
    loadError,
    isSyncing,
    addTab,
    updateTab,
    removeTab,
    addMemo,
    updateMemo,
    removeMemo,
    restoreMemo,
    getMemosByTab,
    reorderTabs,
    reorderMemos,
    refresh,
    restoreState,
  } = useMemos();

  const {
    trash: trashedMemos,
    addToTrash,
    removeFromTrash,
    replaceTrash,
  } = useMemoTrash();

  const { createNotification } = useAiNotifications();

  useEffect(() => {
    if (trashedMemos.length === 0) return;
    const activeIds = new Set(memos.map((memo) => memo.id));
    const filtered = trashedMemos.filter((item) => !activeIds.has(item.id));
    if (filtered.length !== trashedMemos.length) {
      replaceTrash(filtered);
    }
  }, [memos, trashedMemos, replaceTrash]);

  const { registerPage, unregisterPage, setCurrentPage, saveState } =
    useUndoRedo();
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Set current page and register with undo/redo system
  useEffect(() => {
    setCurrentPage("memos");

    const getCurrentState = () => ({ tabs, memos });
    const handleRestore = async (state: unknown) => {
      const s = state as { tabs: MemoTab[]; memos: Memo[] };
      if (restoreState) {
        await restoreState(s);
      }
    };

    registerPage("memos", getCurrentState, handleRestore);
    return () => unregisterPage("memos");
  }, [tabs, memos, registerPage, unregisterPage, restoreState, setCurrentPage]);

  // Save state to history on changes (debounced)
  const saveToHistory = useCallback(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(() => {
      saveState("memos");
    }, 500);
  }, [saveState]);

  // Wrapped handlers that save to history
  const addTabWithHistory = useCallback(
    async (name: string, color: GroupColor) => {
      const result = await addTab(name, color);
      saveToHistory();
      return result;
    },
    [addTab, saveToHistory],
  );

  const updateTabWithHistory = useCallback(
    (id: string, updates: Partial<MemoTab>) => {
      updateTab(id, updates);
      saveToHistory();
    },
    [updateTab, saveToHistory],
  );

  const removeTabWithHistory = useCallback(
    async (id: string) => {
      await removeTab(id);
      saveToHistory();
    },
    [removeTab, saveToHistory],
  );

  const addMemoWithHistory = useCallback(
    async (tabId: string) => {
      const result = await addMemo(tabId);
      saveToHistory();
      return result;
    },
    [addMemo, saveToHistory],
  );

  const addMemosToTrash = useCallback(
    (memoList: Memo[]) => {
      if (memoList.length === 0) return;
      const now = new Date().toISOString();
      const tabNameMap = new Map(tabs.map((tab) => [tab.id, tab.name]));
      const additions: MemoTrash[] = memoList.map((memo, index) => ({
        id: memo.id,
        tabId: memo.tabId,
        title: memo.title,
        content: memo.content,
        order: memo.order ?? index,
        deletedAt: now,
        originalTabId: memo.tabId,
        originalTabName: tabNameMap.get(memo.tabId) ?? "",
      }));
      addToTrash(additions);
    },
    [addToTrash, tabs],
  );

  const updateMemoWithHistory = useCallback(
    (id: string, updates: Partial<Memo>) => {
      updateMemo(id, updates);
      saveToHistory();
    },
    [updateMemo, saveToHistory],
  );

  const moveMemoWithHistory = useCallback(
    (id: string, targetTabId: string) => {
      const memo = memos.find((item) => item.id === id);
      if (!memo || memo.tabId === targetTabId) return;
      const targetMemos = getMemosByTab(targetTabId);
      const nextOrder =
        targetMemos.reduce((max, item) => Math.max(max, item.order), -1) + 1;
      updateMemoWithHistory(id, { tabId: targetTabId, order: nextOrder });
    },
    [memos, getMemosByTab, updateMemoWithHistory],
  );

  const removeMemoWithHistory = useCallback(
    async (id: string) => {
      const memo = memos.find((item) => item.id === id);
      if (memo) {
        addMemosToTrash([memo]);
      }
      await removeMemo(id);
      saveToHistory();
    },
    [removeMemo, saveToHistory, memos, addMemosToTrash],
  );

  const [activeTabId, setActiveTabId] = useState<string | null>(null);

  // Drag and drop sensors
  const sensors = useDndSensors();

  // Handle tab drag end
  const handleTabDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (over && active.id !== over.id) {
        const oldIndex = tabs.findIndex((t) => t.id === active.id);
        const newIndex = tabs.findIndex((t) => t.id === over.id);
        const newTabs = arrayMove(tabs, oldIndex, newIndex);
        reorderTabs(newTabs);
        saveToHistory();
      }
    },
    [tabs, reorderTabs, saveToHistory],
  );

  // Handle memo drag end
  const handleMemoDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (over && active.id !== over.id && activeTabId) {
        const currentMemos = getMemosByTab(activeTabId);
        const oldIndex = currentMemos.findIndex((m) => m.id === active.id);
        const newIndex = currentMemos.findIndex((m) => m.id === over.id);
        const newMemos = arrayMove(currentMemos, oldIndex, newIndex);
        reorderMemos(newMemos);
        saveToHistory();
      }
    },
    [activeTabId, getMemosByTab, reorderMemos, saveToHistory],
  );
  const [showNewTabModal, setShowNewTabModal] = useState(false);
  const [newTabName, setNewTabName] = useState("");
  const [newTabColor, setNewTabColor] = useState<GroupColor>("blue");
  const [editingTab, setEditingTab] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [deleteTabId, setDeleteTabId] = useState<string | null>(null);
  const [deleteTrashMemoId, setDeleteTrashMemoId] = useState<string | null>(
    null,
  );
  const [activeTabMenu, setActiveTabMenu] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState<{
    top: number;
    left: number;
  }>({ top: 0, left: 0 });
  const [showTrash, setShowTrash] = useState(false);

  // Ref for scrolling to newly added memo
  const memoListEndRef = useRef<HTMLDivElement>(null);

  // Set initial active tab
  if (activeTabId === null && tabs.length > 0) {
    setActiveTabId(tabs[0].id);
  }

  const { value: memoSearch, setValue: setMemoSearch } = useUserSetting<string>(
    "memos_filter_search",
    "",
  );

  const activeTab = tabs.find((t) => t.id === activeTabId);
  const isBacklogTab =
    activeTab?.name.toLowerCase().includes("backlog") ?? false;
  const allActiveMemos = activeTabId ? getMemosByTab(activeTabId) : [];

  // Claude Code Apply chat state
  const { value: relayUrl } = useUserSetting<string>(
    "claude_code_relay_url",
    "",
  );
  const { value: relayToken } = useUserSetting<string>(
    "claude_code_relay_token",
    "",
  );
  const [applyMemoId, setApplyMemoId] = useState<string | null>(null);
  const [applyInput, setApplyInput] = useState("");
  const [, setApplyTick] = useState(0);
  const applyMessagesEndRef = useRef<HTMLDivElement>(null);
  const applyInputRef = useRef<HTMLTextAreaElement>(null);

  // Register this instance's render notifier so background streams can update UI
  useEffect(() => {
    notifyApplyRender = () => setApplyTick((n) => n + 1);
    return () => {
      notifyApplyRender = null;
      // Save streaming sessions' partial progress before aborting so they can
      // be reconnected when the user returns to this page.
      for (const [id, s] of applySessions) {
        if (s.isStreaming && s.jobId) {
          if (s.streamingContent) {
            s.messages.push({
              id: crypto.randomUUID(),
              role: "assistant",
              content: s.streamingContent,
            });
            s.streamingContent = "";
          }
          s.isStreaming = false;
          s.wasInterrupted = true;
          // Persist to IndexedDB (wasStreaming=true for auto-reconnect)
          // AND to Supabase for cross-device access
          void persistApplySession(id);
        }
      }
      activeApplyAbort?.abort();
      activeApplyAbort = null;
    };
  }, []);

  // Load persisted apply sessions from IndexedDB on mount
  const [applySessionsLoaded, setApplySessionsLoaded] = useState(false);
  const [reconnectIds, setReconnectIds] = useState<string[]>([]);
  useEffect(() => {
    void loadPersistedApplySessions().then((ids) => {
      setApplyTick((n) => n + 1);
      setReconnectIds(ids);
      setApplySessionsLoaded(true);
    });
  }, []);

  // Auto-reconnect when both sessions are loaded AND relayUrl is available
  useEffect(() => {
    if (!applySessionsLoaded || !relayUrl || reconnectIds.length === 0) return;
    for (const id of reconnectIds) {
      void reconnectApply(id, relayUrl.replace(/\/+$/, ""), relayToken);
    }
    setReconnectIds([]);
  }, [applySessionsLoaded, relayUrl, relayToken, reconnectIds]);

  const applyMemo = useMemo(
    () => memos.find((m) => m.id === applyMemoId) ?? null,
    [memos, applyMemoId],
  );
  const applySession = applyMemoId ? applySessions.get(applyMemoId) : undefined;

  // Auto-scroll apply chat
  useEffect(() => {
    applyMessagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [applySession?.messages.length, applySession?.streamingContent]);

  const handleApplyMemo = useCallback((memo: Memo) => {
    setApplyMemoId(memo.id);
    setApplyInput("");
  }, []);

  // Refs for values needed inside the module-level sendApply function
  const relayUrlRef = useRef(relayUrl);
  relayUrlRef.current = relayUrl;
  const relayTokenRef = useRef(relayToken);
  relayTokenRef.current = relayToken;
  const memosRef = useRef(memos);
  memosRef.current = memos;
  const createNotificationRef = useRef(createNotification);
  createNotificationRef.current = createNotification;

  const handleApplySubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!applyMemoId) return;
      const memo = memosRef.current.find((m) => m.id === applyMemoId);
      if (!memo) return;

      const session = applySessions.get(applyMemoId);
      const isFirstMessage = !session || session.messages.length === 0;

      // Follow-up messages require non-empty input
      if (!isFirstMessage && !applyInput.trim()) return;

      let content: string;
      if (isFirstMessage) {
        content = [
          `以下のBacklogアイテムをHub（このプロジェクト）に実装してください。`,
          `実装後、変更内容をgit commitしてpushしてください。コミットメッセージは日本語で変更内容を要約してください。`,
          `最後に、変更内容のサマリーを日本語で出力してください。`,
          ``,
          `## タイトル`,
          memo.title || "(no title)",
          ``,
          `## 内容`,
          memo.content || "(no content)",
          ...(applyInput.trim() ? [``, `## 追加指示`, applyInput.trim()] : []),
        ].join("\n");
      } else {
        content = applyInput.trim();
      }

      const displayMsg = isFirstMessage
        ? applyInput.trim()
          ? `Apply: ${memo.title || "Untitled"}\n\n${applyInput.trim()}`
          : `Apply: ${memo.title || "Untitled"}`
        : undefined;

      setApplyInput("");
      if (applyInputRef.current) applyInputRef.current.style.height = "auto";

      // Fire-and-forget — uses refs so no stale closure issues
      void sendApply(
        content,
        applyMemoId,
        relayUrlRef,
        relayTokenRef,
        memosRef,
        createNotificationRef,
        displayMsg,
      );
    },
    [applyMemoId, applyInput],
  );

  const handleApplyKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && e.metaKey) {
        e.preventDefault();
        handleApplySubmit(e);
      }
    },
    [handleApplySubmit],
  );

  const handleNewSession = useCallback(() => {
    if (!applyMemoId || applySession?.isStreaming) return;
    void clearApplySession(applyMemoId).then(() => setApplyTick((n) => n + 1));
  }, [applyMemoId, applySession?.isStreaming]);

  const handleResume = useCallback(() => {
    if (
      !applyMemoId ||
      applySession?.isStreaming ||
      !applySession?.wasInterrupted
    )
      return;

    // If we have a jobId, try reconnecting to the running process first
    if (applySession.jobId && relayUrlRef.current) {
      void reconnectApply(
        applyMemoId,
        relayUrlRef.current,
        relayTokenRef.current,
      );
      return;
    }

    // No jobId — use Claude's --resume with a new prompt
    applySession.wasInterrupted = false;
    setApplyTick((n) => n + 1);

    const resumePrompt =
      "前回の作業が中断されました。中断時点から続きを実行してください。完了後、変更内容のサマリーを日本語で出力してください。";

    void sendApply(
      resumePrompt,
      applyMemoId,
      relayUrlRef,
      relayTokenRef,
      memosRef,
      createNotificationRef,
      "再開リクエスト",
    );
  }, [applyMemoId, applySession]);

  const activeMemos = useMemo(() => {
    if (!memoSearch.trim()) return allActiveMemos;
    const q = memoSearch.toLowerCase();
    return allActiveMemos.filter(
      (memo) =>
        memo.title?.toLowerCase().includes(q) ||
        memo.content?.toLowerCase().includes(q),
    );
  }, [allActiveMemos, memoSearch]);

  // Swipe handlers
  const handleNextTab = () => {
    if (!activeTabId || tabs.length <= 1) return;
    const currentIndex = tabs.findIndex((t) => t.id === activeTabId);
    if (currentIndex < tabs.length - 1) {
      setActiveTabId(tabs[currentIndex + 1].id);
    }
  };

  const handlePrevTab = () => {
    if (!activeTabId || tabs.length <= 1) return;
    const currentIndex = tabs.findIndex((t) => t.id === activeTabId);
    if (currentIndex > 0) {
      setActiveTabId(tabs[currentIndex - 1].id);
    }
  };

  const { onTouchStart, onTouchEnd } = useSwipeableTabs({
    onNext: handleNextTab,
    onPrev: handlePrevTab,
  });

  // Handle Web Share Target
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const title = params.get("title");
    const text = params.get("text");
    const url = params.get("url");

    // If we have share data and tabs exist
    if ((title || text || url) && tabs.length > 0) {
      // Clean up URL parameters immediately
      window.history.replaceState({}, "", "/memos");

      // Determine target tab (use first tab if no active tab)
      const targetTabId = activeTabId || tabs[0].id;
      if (!activeTabId) setActiveTabId(targetTabId);

      // Create content from text and url
      let content = text || "";
      if (url) {
        content = content ? `${content}\n${url}` : url;
      }

      // Add new memo
      addMemoWithHistory(targetTabId).then((newMemoId) => {
        if (newMemoId) {
          // Update with shared content
          updateMemoWithHistory(newMemoId, {
            title: title || "Shared Content",
            content: content,
          });
          // Scroll to new memo
          setTimeout(() => {
            memoListEndRef.current?.scrollIntoView({ behavior: "smooth" });
          }, 100);
        }
      });
    }
  }, [tabs, activeTabId, addMemoWithHistory, updateMemoWithHistory]);

  const handleAddTab = async () => {
    if (!newTabName.trim()) return;
    const id = await addTabWithHistory(newTabName.trim(), newTabColor);
    setActiveTabId(id);
    setShowNewTabModal(false);
    setNewTabName("");
    setNewTabColor("blue");
  };

  const handleDeleteTab = (tabId: string) => {
    setDeleteTabId(tabId);
  };

  const handleUpdateTab = () => {
    if (!editingTab || !editingTab.name.trim()) return;
    updateTabWithHistory(editingTab.id, { name: editingTab.name.trim() });
    setEditingTab(null);
  };

  const confirmDeleteTab = async () => {
    if (!deleteTabId) return;
    const tabMemos = memos.filter((memo) => memo.tabId === deleteTabId);
    addMemosToTrash(tabMemos);
    await removeTabWithHistory(deleteTabId);
    if (activeTabId === deleteTabId) {
      setActiveTabId(tabs.find((t) => t.id !== deleteTabId)?.id || null);
    }
    setDeleteTabId(null);
  };

  const handleAddMemo = async () => {
    if (!activeTabId) return;
    await addMemoWithHistory(activeTabId);
    // Scroll to the newly added memo
    setTimeout(() => {
      memoListEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 100);
  };

  const handleRestoreMemo = async (memo: MemoTrash) => {
    let targetTabId = tabs.find((tab) => tab.id === memo.originalTabId)?.id;
    if (!targetTabId) {
      targetTabId = activeTabId || tabs[0]?.id;
    }
    if (!targetTabId) {
      const id = await addTabWithHistory("Recovered", "blue");
      targetTabId = id;
      setActiveTabId(id);
    }
    const targetMemos = getMemosByTab(targetTabId);
    const nextOrder =
      targetMemos.reduce((max, item) => Math.max(max, item.order), -1) + 1;
    await restoreMemo({
      id: memo.id,
      tabId: targetTabId,
      title: memo.title,
      content: memo.content,
      order: nextOrder,
      createdAt: memo.createdAt,
      updatedAt: new Date().toISOString(),
    });
    await removeFromTrash(memo.id);
    saveToHistory();
  };

  const handleDeleteTrashedMemo = (id: string) => {
    setDeleteTrashMemoId(id);
  };

  const confirmDeleteTrashedMemo = async () => {
    if (deleteTrashMemoId) {
      await removeFromTrash(deleteTrashMemoId);
      setDeleteTrashMemoId(null);
    }
  };

  const headerLeft = (
    <button
      onClick={refresh}
      disabled={isSyncing}
      className="p-1.5 md:p-2 neu-text-secondary hover:neu-text-primary neu-btn rounded-lg transition-colors disabled:opacity-50"
      title="Refresh data"
    >
      <RefreshCw
        size={16}
        className={`md:w-[18px] md:h-[18px] ${isSyncing ? "animate-spin" : ""}`}
      />
    </button>
  );

  const headerCenter = (
    <button
      onClick={() => setShowNewTabModal(true)}
      className="flex items-center gap-1.5 md:gap-2 px-2.5 md:px-3 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs md:text-sm font-medium transition-all active:scale-95 shadow"
    >
      <FolderPlus size={16} />
      <span className="hidden sm:inline">Add Tab</span>
    </button>
  );

  const headerRight = (
    <button
      onClick={() => setShowTrash(true)}
      className="flex items-center gap-1.5 px-3 py-2 rounded-lg hover:bg-slate-100 neu-text-secondary text-sm font-medium transition-all"
      title="Trash"
    >
      <Archive size={14} />
      <span className="hidden sm:inline">Trash</span>
    </button>
  );

  return (
    <Layout
      pageTitle="Memos"
      headerLeft={headerLeft}
      headerCenter={headerCenter}
      headerRight={headerRight}
    >
      {isLoading ? (
        <div className="h-full flex items-center justify-center">
          <Loader2 size={32} className="animate-spin neu-text-secondary" />
        </div>
      ) : loadError ? (
        <div className="h-full flex flex-col items-center justify-center gap-4 px-4">
          <AlertCircle size={40} className="text-red-400" />
          <p className="text-red-600 text-sm text-center">{loadError}</p>
          <button
            onClick={refresh}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-sm font-medium transition-all active:scale-95"
          >
            <RefreshCw size={14} />
            再読み込み
          </button>
        </div>
      ) : (
        <div className="flex-1 flex flex-col min-h-0 neu-bg">
          {/* Tabs */}
          <div className="shrink-0 neu-bg border-b border-slate-300 sticky top-0 z-30 no-select min-h-14">
            <div className="overflow-x-auto px-4 py-2 flex items-center h-full">
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleTabDragEnd}
              >
                <SortableContext
                  items={tabs.map((t) => t.id)}
                  strategy={horizontalListSortingStrategy}
                >
                  <div className="flex items-center gap-2 min-w-max">
                    {tabs.map((tab) => {
                      const colors = getTabColorClasses(tab.color);
                      return (
                        <SortableTab
                          key={tab.id}
                          id={tab.id}
                          name={tab.name}
                          isActive={activeTabId === tab.id}
                          colorDot={colors.bg}
                          activeTextClass={colors.text}
                          onSelect={() => setActiveTabId(tab.id)}
                          onMenuOpen={(e) => {
                            const rect =
                              e.currentTarget.getBoundingClientRect();
                            setMenuPosition({
                              top: rect.bottom + 4,
                              left: rect.left,
                            });
                            setActiveTabMenu(
                              activeTabMenu === tab.id ? null : tab.id,
                            );
                          }}
                        />
                      );
                    })}
                  </div>
                </SortableContext>
              </DndContext>
            </div>
          </div>

          {activeTabMenu && (
            <>
              <div
                className="fixed inset-0 z-[100]"
                onClick={() => setActiveTabMenu(null)}
              />
              {(() => {
                const tab = tabs.find((t) => t.id === activeTabMenu);
                if (!tab) return null;
                return (
                  <div
                    className="fixed z-[101] neu-card py-1 min-w-[140px]"
                    style={{ top: menuPosition.top, left: menuPosition.left }}
                  >
                    <button
                      onClick={() => {
                        setEditingTab({ id: tab.id, name: tab.name });
                        setActiveTabMenu(null);
                      }}
                      className="w-full px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-100 flex items-center gap-2"
                    >
                      <Pencil size={14} /> Rename
                    </button>
                    <button
                      onClick={() => {
                        handleDeleteTab(tab.id);
                        setActiveTabMenu(null);
                      }}
                      className="w-full px-4 py-2.5 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                    >
                      <Trash2 size={14} /> Delete
                    </button>
                  </div>
                );
              })()}
            </>
          )}

          {/* Content */}
          <main
            className="flex-1 min-h-0 overflow-auto p-4 md:p-6 mobile-scroll-pad"
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
          >
            {!activeTab ? (
              <div className="text-center py-16">
                <StickyNote size={48} className="mx-auto text-slate-300 mb-4" />
                <p className="text-slate-500 mb-4">
                  Create a tab to start taking notes
                </p>
                <button
                  onClick={() => setShowNewTabModal(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-sm font-medium transition-all"
                >
                  <FolderPlus size={16} /> Create first tab
                </button>
              </div>
            ) : (
              <div className="max-w-4xl mx-auto">
                {/* Tab Header */}
                <div className="flex flex-wrap items-center gap-2 mb-6">
                  <div className="flex items-center gap-3 mr-auto">
                    <div
                      className={`w-4 h-4 rounded-full ${getTabColorClasses(activeTab.color).bg}`}
                    />
                    <h2 className="text-xl font-bold neu-text-primary">
                      {activeTab.name}
                    </h2>
                    <span className="text-sm neu-text-secondary">
                      {memoSearch.trim()
                        ? `(${activeMemos.length}/${allActiveMemos.length})`
                        : `(${activeMemos.length})`}
                    </span>
                  </div>
                  <button
                    onClick={handleAddMemo}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-medium transition-all active:scale-95 shadow"
                  >
                    <Plus size={14} /> Add Memo
                  </button>
                </div>

                {/* Search */}
                <div className="relative mb-4">
                  <Search
                    size={14}
                    className="absolute left-3 top-1/2 -translate-y-1/2 neu-text-muted"
                  />
                  <input
                    type="text"
                    value={memoSearch}
                    onChange={(e) => setMemoSearch(e.target.value)}
                    placeholder="Search memos..."
                    className="w-full sm:w-64 pl-9 pr-8 py-2 text-sm neu-input rounded-lg"
                  />
                  {memoSearch && (
                    <button
                      onClick={() => setMemoSearch("")}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 neu-text-muted hover:neu-text-secondary"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>

                {/* Memos */}
                {activeMemos.length === 0 ? (
                  <div className="text-center py-12 neu-card">
                    <StickyNote
                      size={40}
                      className="mx-auto neu-text-muted mb-3"
                    />
                    <p className="neu-text-secondary mb-4">
                      {memoSearch.trim()
                        ? "No memos matching search"
                        : "No memos in this tab yet"}
                    </p>
                    <button
                      onClick={handleAddMemo}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-sm font-medium transition-all"
                    >
                      <Plus size={16} /> Add first memo
                    </button>
                  </div>
                ) : (
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleMemoDragEnd}
                  >
                    <SortableContext
                      items={activeMemos.map((m) => m.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      <div className="space-y-4 no-select">
                        {activeMemos.map((memo) => (
                          <SortableWrapper key={memo.id} id={memo.id}>
                            {(dragHandleProps) => (
                              <MemoCard
                                memo={memo}
                                tabColor={activeTab.color}
                                tabs={tabs}
                                onMove={moveMemoWithHistory}
                                onUpdate={updateMemoWithHistory}
                                onDelete={removeMemoWithHistory}
                                onApply={
                                  isBacklogTab ? handleApplyMemo : undefined
                                }
                                applyStatus={
                                  isBacklogTab
                                    ? (() => {
                                        const s = applySessions.get(memo.id);
                                        if (!s) return undefined;
                                        if (s.isStreaming) return "running";
                                        if (s.wasInterrupted && s.jobId)
                                          return "interrupted";
                                        if (
                                          s.messages.some(
                                            (m) => m.role === "assistant",
                                          )
                                        )
                                          return "done";
                                        return undefined;
                                      })()
                                    : undefined
                                }
                                dragHandleProps={dragHandleProps}
                              />
                            )}
                          </SortableWrapper>
                        ))}
                        <div ref={memoListEndRef} />
                      </div>
                    </SortableContext>
                  </DndContext>
                )}
              </div>
            )}
          </main>

          {/* New Tab Modal */}
          {showNewTabModal &&
            createPortal(
              <div
                className="fixed inset-0 z-[60] bg-black/50 px-4 overflow-y-auto overscroll-contain flex justify-center"
                style={{
                  paddingTop: "calc(4rem + env(safe-area-inset-top, 0px))",
                  paddingBottom:
                    "calc(5rem + env(safe-area-inset-bottom, 0px))",
                }}
                onClick={(e) => {
                  if (e.target === e.currentTarget) setShowNewTabModal(false);
                }}
              >
                <div className="neu-modal w-full max-w-md max-h-[70svh] md:max-h-[calc(100dvh-8rem)] overflow-y-auto overscroll-contain my-auto">
                  <div className="flex items-center justify-between p-4 border-b border-slate-200 shrink-0">
                    <h3 className="text-lg font-semibold neu-text-primary">
                      Create New Tab
                    </h3>
                    <button
                      onClick={() => setShowNewTabModal(false)}
                      className="p-2 hover:bg-slate-100 rounded-lg text-slate-500"
                    >
                      <X size={20} />
                    </button>
                  </div>
                  <div className="p-4 space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">
                        Tab Name
                      </label>
                      <input
                        type="text"
                        value={newTabName}
                        onChange={(e) => setNewTabName(e.target.value)}
                        placeholder="e.g., Feature Ideas, Work Notes..."
                        className="w-full px-4 py-2.5 neu-input rounded-xl"
                        autoFocus
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">
                        Color
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {TAB_COLORS.map((color) => (
                          <button
                            key={color.value}
                            onClick={() => setNewTabColor(color.value)}
                            className={`w-8 h-8 rounded-full ${color.bg} transition-all ${
                              newTabColor === color.value
                                ? "ring-2 ring-offset-2 ring-slate-400 scale-110"
                                : "hover:scale-105"
                            }`}
                            title={color.label}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-end gap-2 p-4 border-t border-slate-200">
                    <button
                      onClick={() => setShowNewTabModal(false)}
                      className="px-4 py-2 neu-text-secondary hover:bg-slate-100 rounded-lg transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleAddTab}
                      disabled={!newTabName.trim()}
                      className="px-4 py-2 bg-sky-600 hover:bg-sky-500 disabled:bg-slate-300 text-white rounded-lg transition-colors disabled:cursor-not-allowed"
                    >
                      Create
                    </button>
                  </div>
                </div>
              </div>,
              document.body,
            )}

          {/* Rename Tab Modal */}
          {editingTab &&
            createPortal(
              <div
                className="fixed inset-0 z-[60] bg-black/50 px-4 overflow-y-auto overscroll-contain flex justify-center"
                style={{
                  paddingTop: "calc(4rem + env(safe-area-inset-top, 0px))",
                  paddingBottom:
                    "calc(5rem + env(safe-area-inset-bottom, 0px))",
                }}
                onClick={(e) => {
                  if (e.target === e.currentTarget) setEditingTab(null);
                }}
              >
                <div className="neu-modal max-w-md w-full max-h-[70svh] md:max-h-[calc(100dvh-8rem)] overflow-y-auto overscroll-contain my-auto">
                  <div className="flex items-center justify-between p-4 border-b border-slate-200 shrink-0">
                    <h3 className="text-lg font-bold neu-text-primary">
                      Rename Tab
                    </h3>
                    <button
                      onClick={() => setEditingTab(null)}
                      className="p-2 hover:bg-slate-100 rounded-lg"
                    >
                      <X size={20} className="text-slate-500" />
                    </button>
                  </div>
                  <div className="p-4">
                    <input
                      type="text"
                      value={editingTab.name}
                      onChange={(e) =>
                        setEditingTab({ ...editingTab, name: e.target.value })
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                          e.preventDefault();
                          handleUpdateTab();
                        }
                      }}
                      placeholder="Tab name..."
                      className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent mb-4"
                      autoFocus
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => setEditingTab(null)}
                        className="px-4 py-2 neu-text-secondary hover:bg-slate-100 rounded-lg font-medium"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleUpdateTab}
                        disabled={!editingTab.name.trim()}
                        className="px-4 py-2 bg-sky-600 hover:bg-sky-500 disabled:bg-slate-300 text-white rounded-lg font-medium"
                      >
                        Save
                      </button>
                    </div>
                  </div>
                </div>
              </div>,
              document.body,
            )}

          {/* Delete Tab Confirmation */}
          <ConfirmDialog
            isOpen={deleteTabId !== null}
            title="Delete Tab"
            message="Are you sure you want to delete this tab and all its memos? This action cannot be undone."
            confirmLabel="Delete"
            onConfirm={confirmDeleteTab}
            onCancel={() => setDeleteTabId(null)}
          />

          {/* Trash Modal */}
          {showTrash &&
            createPortal(
              <div
                className="fixed inset-0 z-[60] bg-black/50 px-4 overflow-y-auto overscroll-contain flex justify-center"
                style={{
                  paddingTop: "calc(4rem + env(safe-area-inset-top, 0px))",
                  paddingBottom:
                    "calc(5rem + env(safe-area-inset-bottom, 0px))",
                }}
                onClick={(e) => {
                  if (e.target === e.currentTarget) setShowTrash(false);
                }}
              >
                <div className="neu-modal w-full max-w-2xl max-h-[70svh] md:max-h-[calc(100dvh-8rem)] overflow-y-auto overscroll-contain my-auto">
                  <div className="flex items-center justify-between p-4 border-b border-slate-200 shrink-0">
                    <div className="flex items-center gap-2">
                      <Archive size={18} className="neu-text-secondary" />
                      <h3 className="text-lg font-semibold neu-text-primary">
                        Trash
                      </h3>
                    </div>
                    <button
                      onClick={() => setShowTrash(false)}
                      className="p-2 hover:bg-slate-100 rounded-lg text-slate-500"
                    >
                      <X size={20} />
                    </button>
                  </div>
                  <div className="p-4">
                    {trashedMemos.length === 0 ? (
                      <div className="text-center py-12 text-slate-400">
                        Trash is empty
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {trashedMemos.map((memo) => (
                          <div
                            key={memo.id}
                            className="flex items-start gap-3 neu-pressed rounded-xl p-3"
                          >
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium neu-text-primary truncate">
                                {memo.title || "Untitled"}
                              </p>
                              <p className="text-xs neu-text-secondary mt-1 line-clamp-1">
                                {memo.content || "No content"}
                              </p>
                              <div className="text-[11px] text-slate-400 mt-2 flex items-center gap-2">
                                <span>
                                  From: {memo.originalTabName || "Unknown tab"}
                                </span>
                                <span>•</span>
                                <span>
                                  {new Date(memo.deletedAt).toLocaleString(
                                    "en-US",
                                  )}
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <button
                                onClick={() => handleRestoreMemo(memo)}
                                className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold"
                              >
                                Restore
                              </button>
                              <button
                                onClick={() => handleDeleteTrashedMemo(memo.id)}
                                className="p-2 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50"
                                title="Delete permanently"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>,
              document.body,
            )}

          {/* Delete Trash Memo Confirmation */}
          <ConfirmDialog
            isOpen={deleteTrashMemoId !== null}
            title="Permanently Delete Memo"
            message={`Are you sure you want to permanently delete "${trashedMemos.find((m) => m.id === deleteTrashMemoId)?.title || "Untitled"}"? This action cannot be undone.`}
            confirmLabel="Delete"
            onConfirm={confirmDeleteTrashedMemo}
            onCancel={() => setDeleteTrashMemoId(null)}
          />

          {/* Apply via Claude Code Chat Modal */}
          {applyMemoId &&
            applyMemo &&
            createPortal(
              <div
                className="fixed inset-0 z-[60] bg-black/50 px-4 flex justify-center"
                style={{
                  paddingTop: "calc(2rem + env(safe-area-inset-top, 0px))",
                  paddingBottom:
                    "calc(2rem + env(safe-area-inset-bottom, 0px))",
                }}
                onClick={(e) => {
                  if (e.target === e.currentTarget) setApplyMemoId(null);
                }}
              >
                <div
                  className="w-full max-w-2xl flex flex-col my-auto"
                  style={{ maxHeight: "calc(100vh - 8rem)" }}
                >
                  <div className="neu-card flex flex-col overflow-hidden h-full">
                    {/* Header */}
                    <div className="flex items-center justify-between p-4 border-b border-slate-200/50 shrink-0">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="p-2 rounded-lg bg-gradient-to-br from-orange-500 to-amber-600 shrink-0">
                          <Terminal size={20} className="text-white" />
                        </div>
                        <div className="min-w-0">
                          <h3 className="text-lg font-bold neu-text-primary">
                            Apply via Claude Code
                          </h3>
                          <p className="text-xs neu-text-secondary truncate max-w-[300px]">
                            {applyMemo.title || "Untitled"}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {applySession &&
                          applySession.messages.length > 0 &&
                          !applySession.isStreaming && (
                            <button
                              onClick={handleNewSession}
                              className="p-2 text-slate-400 hover:text-orange-500 rounded-lg transition-colors"
                              title="新規セッション"
                            >
                              <RefreshCw size={18} />
                            </button>
                          )}
                        <button
                          onClick={() => setApplyMemoId(null)}
                          className="p-2 text-slate-400 hover:text-slate-600 rounded-lg"
                        >
                          <X size={20} />
                        </button>
                      </div>
                    </div>

                    {/* Messages area */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
                      {/* Show memo context if no messages yet */}
                      {(!applySession ||
                        applySession.messages.length === 0) && (
                        <div className="p-3 neu-pressed rounded-lg text-sm neu-text-secondary max-h-40 overflow-y-auto">
                          <p className="font-medium neu-text-primary mb-1">
                            {applyMemo.title || "Untitled"}
                          </p>
                          <p className="whitespace-pre-wrap">
                            {applyMemo.content || "(no content)"}
                          </p>
                        </div>
                      )}

                      {/* Resume banner for interrupted sessions */}
                      {applySession?.wasInterrupted &&
                        !applySession.isStreaming && (
                          <div className="flex items-center gap-3 p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm">
                            <span className="text-amber-600 font-medium flex-1">
                              前回の実行が中断されました
                            </span>
                            <button
                              onClick={handleResume}
                              className="px-3 py-1.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold transition-colors"
                            >
                              続きから再開
                            </button>
                          </div>
                        )}

                      {/* Chat messages */}
                      {applySession?.messages.map((msg) => (
                        <div
                          key={msg.id}
                          className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}
                        >
                          <div
                            className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                              msg.role === "user"
                                ? "bg-slate-700"
                                : "bg-gradient-to-br from-orange-500 to-amber-600"
                            }`}
                          >
                            {msg.role === "user" ? (
                              <User size={16} className="text-white" />
                            ) : (
                              <Terminal size={16} className="text-white" />
                            )}
                          </div>
                          <div
                            className={`flex-1 min-w-0 max-w-[calc(100%-3rem)] ${
                              msg.role === "user" ? "text-right" : ""
                            }`}
                          >
                            <div
                              className={`w-fit max-w-full px-3 py-2 rounded-2xl text-left text-sm ${
                                msg.role === "user"
                                  ? "ml-auto bg-slate-700 text-white rounded-tr-sm"
                                  : "neu-card neu-text-primary rounded-tl-sm"
                              }`}
                            >
                              <div
                                className={`prose prose-sm max-w-none [overflow-wrap:anywhere] ${
                                  msg.role === "user"
                                    ? "prose-invert"
                                    : "prose-slate"
                                }`}
                              >
                                {msg.role === "assistant" ? (
                                  <ReactMarkdown
                                    remarkPlugins={[remarkGfm, remarkBreaks]}
                                  >
                                    {sanitizeMarkdown(msg.content)}
                                  </ReactMarkdown>
                                ) : (
                                  <span className="whitespace-pre-wrap">
                                    {msg.content}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}

                      {/* Streaming indicator */}
                      {applySession?.isStreaming && (
                        <div className="flex gap-3">
                          <div className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-gradient-to-br from-orange-500 to-amber-600">
                            <Terminal size={16} className="text-white" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="w-fit max-w-full px-3 py-2 rounded-2xl rounded-tl-sm neu-card text-sm">
                              <div className="prose prose-sm max-w-none prose-slate [overflow-wrap:anywhere]">
                                {applySession.streamingContent ? (
                                  <ReactMarkdown
                                    remarkPlugins={[remarkGfm, remarkBreaks]}
                                  >
                                    {sanitizeMarkdown(
                                      applySession.streamingContent,
                                    )}
                                  </ReactMarkdown>
                                ) : (
                                  <span className="flex items-center gap-2 neu-text-secondary">
                                    <Loader2
                                      size={14}
                                      className="animate-spin text-orange-500"
                                    />
                                    Running...
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      <div ref={applyMessagesEndRef} />
                    </div>

                    {/* Input area */}
                    <div className="p-4 border-t border-slate-200/50 shrink-0">
                      {!relayUrl ? (
                        <p className="text-sm text-amber-600 text-center">
                          Relay URL not configured. Set it in Settings &gt; AI.
                        </p>
                      ) : (
                        <form
                          onSubmit={handleApplySubmit}
                          className="flex items-end gap-2"
                        >
                          <textarea
                            ref={applyInputRef}
                            value={applyInput}
                            onChange={(e) => {
                              setApplyInput(e.target.value);
                              const el = e.target;
                              el.style.height = "auto";
                              el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
                            }}
                            onKeyDown={handleApplyKeyDown}
                            placeholder={
                              !applySession ||
                              applySession.messages.length === 0
                                ? "指示を追加して Apply（空でもOK）..."
                                : "追加の指示..."
                            }
                            className="flex-1 neu-pressed rounded-xl px-4 py-2.5 text-sm neu-text-primary resize-none outline-none focus:ring-2 focus:ring-orange-500/30"
                            rows={1}
                            disabled={applySession?.isStreaming}
                          />
                          <button
                            type="submit"
                            disabled={
                              applySession?.isStreaming ||
                              (!applyInput.trim() &&
                                !!applySession &&
                                applySession.messages.length > 0)
                            }
                            className="p-2.5 rounded-xl bg-gradient-to-r from-orange-500 to-amber-600 text-white hover:opacity-90 transition-opacity disabled:opacity-50 shrink-0"
                          >
                            {applySession?.isStreaming ? (
                              <Loader2 size={18} className="animate-spin" />
                            ) : !applySession ||
                              applySession.messages.length === 0 ? (
                              <Play size={18} />
                            ) : (
                              <Send size={18} />
                            )}
                          </button>
                        </form>
                      )}
                    </div>
                  </div>
                </div>
              </div>,
              document.body,
            )}
        </div>
      )}
    </Layout>
  );
};
