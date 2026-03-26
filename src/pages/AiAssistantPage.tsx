import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import {
  Send,
  Bot,
  User,
  Loader2,
  Sparkles,
  AlertCircle,
  MessageSquare,
  Plus,
  ChevronLeft,
  ArrowLeft,
  X,
  Paperclip,
  FileText,
  Search,
  Zap,
} from "lucide-react";
import { Layout, ConfirmDialog } from "../components";
import { useAuth } from "../contexts/AuthContext";
import {
  useAiChat,
  type FileAttachment,
  type SearchMode,
} from "../hooks/useAiChat";
import type { ChatMessage } from "../types/ai";
import { sanitizeMarkdown } from "../lib/formatters";
import { useUserSetting } from "../hooks/useUserSetting";
import { useAiShortcuts } from "../hooks/useAiShortcuts";
import {
  deleteAiSession,
  fetchAiMessagesBySession,
  fetchAiSessionsWithMessageCount,
  searchAiMessages,
  toChatMessages,
  upsertAiMessages,
  upsertAiSession,
} from "../lib/offlineData";
import {
  type AiProvider,
  AI_PROVIDER_OPTIONS,
  DEFAULT_AI_SHORTCUTS,
} from "../lib/aiDefaults";
import { registerPushSubscription } from "../lib/pushNotifications";

interface AttachedFile {
  id: string;
  file: File;
  preview?: string;
  type: "image" | "document";
}

interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  messageCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

// Default shortcuts
const DEFAULT_SHORTCUTS = DEFAULT_AI_SHORTCUTS;

const mapSessionRow = (
  row: {
    id: string;
    title: string;
    created_at?: string;
    updated_at?: string;
    messageCount?: number;
  },
  messages: ChatMessage[],
): ChatSession => ({
  id: row.id,
  title: row.title,
  messages,
  messageCount: row.messageCount ?? messages.length,
  createdAt: new Date(row.created_at || new Date().toISOString()),
  updatedAt: new Date(row.updated_at || new Date().toISOString()),
});

export const AiAssistantPage = () => {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const {
    messages,
    isLoading,
    error,
    searchStatus,
    sendMessage,
    clearHistory,
    setMessages,
  } = useAiChat(currentSessionId);
  const { value: searchMode, setValue: setSearchMode } =
    useUserSetting<SearchMode>("ai_search_mode", "standard");
  const [input, setInput] = useState("");
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [showSidebar, setShowSidebar] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [contentMatchIds, setContentMatchIds] = useState<Map<string, string>>(
    new Map(),
  );
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const { shortcuts } = useAiShortcuts(DEFAULT_SHORTCUTS);
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const { value: selectedProvider, setValue: setSelectedProvider } =
    useUserSetting<AiProvider>("ai_provider", "gemini");
  const { value: claudeCodeRelayUrl } = useUserSetting<string>(
    "claude_code_relay_url",
    "",
  );
  const { value: claudeCodeRelayToken } = useUserSetting<string>(
    "claude_code_relay_token",
    "",
  );
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const persistedMessageIdsRef = useRef<Set<string>>(new Set());
  const lastLoadedSessionIdRef = useRef<string | null>(null);
  const sessionsRef = useRef<ChatSession[]>([]);
  const allSessionTitlesRef = useRef<Map<string, string>>(new Map());
  const [deleteSessionId, setDeleteSessionId] = useState<string | null>(null);

  useEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);

  const ensurePushSubscription = useCallback(async () => {
    if (!user) return;
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission !== "granted") return;
    await registerPushSubscription(user.id);
  }, [user]);

  // Revoke blob URLs on unmount to prevent memory leaks
  const attachedFilesRef = useRef(attachedFiles);
  useEffect(() => {
    attachedFilesRef.current = attachedFiles;
  }, [attachedFiles]);
  useEffect(() => {
    return () => {
      attachedFilesRef.current.forEach((f) => {
        if (f.preview) URL.revokeObjectURL(f.preview);
      });
    };
  }, []);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Close sidebar on navigation
  useEffect(() => {
    setShowSidebar(false);
  }, [location.pathname]);

  useEffect(() => {
    const loadSessions = async () => {
      const stored = await fetchAiSessionsWithMessageCount();

      // Cache all session titles so restoreSession can guard against ch: sessions
      const titleMap = new Map<string, string>();
      for (const row of stored) {
        titleMap.set(row.id, row.title);
      }
      allSessionTitlesRef.current = titleMap;

      const nonEmpty = stored.filter(
        (row) => (row.messageCount ?? 0) > 0 && !row.title.startsWith("ch:"),
      );
      // Clean up empty sessions from DB
      const emptySessions = stored.filter(
        (row) => (row.messageCount ?? 0) === 0 && !row.title.startsWith("ch:"),
      );
      for (const s of emptySessions) {
        deleteAiSession(s.id).catch(() => {});
      }
      const mapped: ChatSession[] = nonEmpty.map((row) =>
        mapSessionRow(row, []),
      );
      setSessions(mapped);
    };
    loadSessions();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const sessionFromUrl = params.get("session");
    if (!sessionFromUrl || sessionFromUrl === currentSessionId) return;

    // Guard: reject AI Channel sessions
    const title = allSessionTitlesRef.current.get(sessionFromUrl);
    if (title && title.startsWith("ch:")) return;

    setCurrentSessionId(sessionFromUrl);
    fetchAiMessagesBySession(sessionFromUrl)
      .then((rows) => {
        const chatMessages = toChatMessages(rows);
        persistedMessageIdsRef.current = new Set(chatMessages.map((m) => m.id));
        setMessages(chatMessages);
        lastLoadedSessionIdRef.current = sessionFromUrl;
      })
      .catch((err) =>
        console.error("Failed to load AI session from URL:", err),
      );
  }, [location.search, currentSessionId, setCurrentSessionId, setMessages]);

  useEffect(() => {
    if (!currentSessionId) return;
    let isCancelled = false;

    const refreshMessages = async () => {
      if (isCancelled || !currentSessionId) return;
      try {
        const rows = await fetchAiMessagesBySession(currentSessionId);
        if (isCancelled) return;
        const chatMessages = toChatMessages(rows);
        persistedMessageIdsRef.current = new Set(chatMessages.map((m) => m.id));
        setMessages(chatMessages);
        lastLoadedSessionIdRef.current = currentSessionId;
      } catch (err) {
        console.error("Failed to refresh AI messages:", err);
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        refreshMessages();
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      isCancelled = true;
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [currentSessionId, setMessages]);

  useEffect(() => {
    if (
      !currentSessionId ||
      lastLoadedSessionIdRef.current === currentSessionId
    ) {
      if (!currentSessionId) lastLoadedSessionIdRef.current = null;
      return;
    }

    lastLoadedSessionIdRef.current = currentSessionId;

    let isCancelled = false;
    const restoreSession = async () => {
      try {
        const rows = await fetchAiMessagesBySession(currentSessionId);
        if (isCancelled) return;
        const chatMessages = toChatMessages(rows);
        persistedMessageIdsRef.current = new Set(chatMessages.map((m) => m.id));
        setMessages(chatMessages);
      } catch (err) {
        console.error("Failed to restore AI session:", err);
      }
    };
    restoreSession();
    return () => {
      isCancelled = true;
    };
  }, [currentSessionId, setMessages]);

  // Save current session when messages change
  useEffect(() => {
    if (currentSessionId && messages.length > 0) {
      const currentSession = sessionsRef.current.find(
        (s) => s.id === currentSessionId,
      );
      if (!currentSession) return;
      const title =
        currentSession.title === "New Chat"
          ? messages[0].content.slice(0, 30) +
            (messages[0].content.length > 30 ? "..." : "")
          : currentSession.title || "New Chat";

      setSessions((prev) =>
        prev.map((s) =>
          s.id === currentSessionId
            ? {
                ...s,
                title,
                messages,
                messageCount: messages.length,
                updatedAt: new Date(),
              }
            : s,
        ),
      );

      upsertAiSession({
        id: currentSessionId,
        title,
        created_at: currentSession.createdAt.toISOString(),
        updated_at: new Date().toISOString(),
      }).catch((err) => console.error("Failed to save AI session:", err));

      // Only persist user messages here; assistant messages are persisted
      // by useAiChat after streaming completes (with the server-assigned ID).
      // Persisting assistant placeholders/streaming state would create orphaned
      // rows in IndexedDB that resurface as empty bubbles on reload.
      const newMessages = messages.filter(
        (m) =>
          m.role === "user" &&
          m.content &&
          !persistedMessageIdsRef.current.has(m.id),
      );
      if (newMessages.length > 0) {
        upsertAiMessages(currentSessionId, newMessages).catch((err) => {
          console.error("Failed to save AI messages:", err);
        });
        newMessages.forEach((m) => persistedMessageIdsRef.current.add(m.id));
      }
    }
  }, [messages, currentSessionId]);

  // Remove empty (0 messages) sessions from state and DB
  const removeEmptySessions = useCallback((excludeId?: string) => {
    setSessions((prev) => {
      const empty = prev.filter(
        (s) => s.messageCount === 0 && s.id !== excludeId,
      );
      for (const s of empty) {
        deleteAiSession(s.id).catch(() => {});
      }
      return prev.filter((s) => s.messageCount > 0 || s.id === excludeId);
    });
  }, []);

  // Create new session
  const createNewSession = useCallback(() => {
    const newSession: ChatSession = {
      id: Math.random().toString(36).substr(2, 9),
      title: "New Chat",
      messages: [],
      messageCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    // Remove any existing empty sessions before adding the new one
    removeEmptySessions(newSession.id);
    setSessions((prev) => [newSession, ...prev]);
    setCurrentSessionId(newSession.id);
    persistedMessageIdsRef.current = new Set();
    lastLoadedSessionIdRef.current = newSession.id;
    // Don't persist to DB yet — saved on first message send
    clearHistory();
    setShowSidebar(false);
    return newSession;
  }, [clearHistory, removeEmptySessions]);

  // Switch session
  const switchSession = useCallback(
    async (sessionId: string) => {
      const session = sessions.find((s) => s.id === sessionId);
      if (session) {
        removeEmptySessions(sessionId);
        setCurrentSessionId(sessionId);
        const rows = await fetchAiMessagesBySession(sessionId);
        const chatMessages = toChatMessages(rows);
        persistedMessageIdsRef.current = new Set(chatMessages.map((m) => m.id));
        setMessages(chatMessages);
        lastLoadedSessionIdRef.current = sessionId;
        setShowSidebar(false);
      }
    },
    [sessions, setMessages, removeEmptySessions],
  );

  // Delete session
  const deleteSession = useCallback(
    (sessionId: string, e: React.MouseEvent) => {
      e.stopPropagation();
      setDeleteSessionId(sessionId);
    },
    [],
  );

  const confirmDeleteSession = useCallback(() => {
    if (!deleteSessionId) return;
    setSessions((prev) => {
      return prev.filter((s) => s.id !== deleteSessionId);
    });
    if (currentSessionId === deleteSessionId) {
      setCurrentSessionId(null);
      persistedMessageIdsRef.current = new Set();
      clearHistory();
    }
    deleteAiSession(deleteSessionId).catch((err) =>
      console.error("Failed to delete AI session:", err),
    );
    setDeleteSessionId(null);
  }, [deleteSessionId, currentSessionId, clearHistory, setCurrentSessionId]);

  // Auto-resize textarea
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 200) + "px";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!input.trim() && attachedFiles.length === 0) || isLoading) return;

    // Convert attached files to base64
    let fileAttachments: FileAttachment[] = [];
    if (attachedFiles.length > 0) {
      fileAttachments = await Promise.all(
        attachedFiles.map(async (f) => ({
          name: f.file.name,
          mimeType: f.file.type || "application/octet-stream",
          base64Data: await fileToBase64(f.file),
        })),
      );
    }

    // Build message content with attachment note
    const parts: string[] = [];
    if (input.trim()) parts.push(input.trim());
    if (fileAttachments.length > 0) {
      parts.push(`📎 ${fileAttachments.map((f) => f.name).join(", ")}`);
    }
    const message = parts.join("\n\n");

    // Create session if none exists
    let sessionId = currentSessionId;
    let sessionTitle =
      sessions.find((s) => s.id === sessionId)?.title ?? "New Chat";
    if (!sessionId) {
      const newSession: ChatSession = {
        id: Math.random().toString(36).substr(2, 9),
        title: message.slice(0, 30) + (message.length > 30 ? "..." : ""),
        messages: [],
        messageCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      setSessions((prev) => {
        return [newSession, ...prev];
      });
      sessionId = newSession.id;
      setCurrentSessionId(newSession.id);
      persistedMessageIdsRef.current = new Set();
      lastLoadedSessionIdRef.current = newSession.id;
      upsertAiSession({
        id: newSession.id,
        title: newSession.title,
        created_at: newSession.createdAt.toISOString(),
        updated_at: newSession.updatedAt.toISOString(),
      }).catch((err) => console.error("Failed to save AI session:", err));
      sessionTitle = newSession.title;
    }

    setInput("");
    // Clean up file previews and clear attachments
    attachedFiles.forEach((f) => {
      if (f.preview) URL.revokeObjectURL(f.preview);
    });
    setAttachedFiles([]);
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
    }
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(max-width: 767px)").matches
    ) {
      inputRef.current?.blur();
    }

    void ensurePushSubscription().catch((err) => {
      console.error("Failed to ensure push subscription:", err);
    });
    void sendMessage(message, {
      provider: selectedProvider,
      sessionId,
      sessionTitle,
      ...(fileAttachments.length > 0 ? { attachments: fileAttachments } : {}),
      searchMode,
      ...(selectedProvider === "claude-code"
        ? {
            claudeCodeUrl: claudeCodeRelayUrl,
            claudeCodeToken: claudeCodeRelayToken,
          }
        : {}),
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && e.metaKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleShortcutClick = (shortcut: string) => {
    // Create session inline (like handleSubmit) instead of via createNewSession
    // to avoid clearHistory() which resets messages and causes a flash.
    let sessionId = currentSessionId;
    let sessionTitle =
      sessions.find((s) => s.id === sessionId)?.title ?? "New Chat";
    if (!sessionId) {
      const newSession: ChatSession = {
        id: Math.random().toString(36).substr(2, 9),
        title: shortcut.slice(0, 30) + (shortcut.length > 30 ? "..." : ""),
        messages: [],
        messageCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      setSessions((prev) => [newSession, ...prev]);
      sessionId = newSession.id;
      setCurrentSessionId(newSession.id);
      persistedMessageIdsRef.current = new Set();
      lastLoadedSessionIdRef.current = newSession.id;
      upsertAiSession({
        id: newSession.id,
        title: newSession.title,
        created_at: newSession.createdAt.toISOString(),
        updated_at: newSession.updatedAt.toISOString(),
      }).catch((err) => console.error("Failed to save AI session:", err));
      sessionTitle = newSession.title;
    }
    void ensurePushSubscription().catch((err) => {
      console.error("Failed to ensure push subscription:", err);
    });
    void sendMessage(shortcut, {
      provider: selectedProvider,
      sessionId,
      sessionTitle,
      searchMode,
      ...(selectedProvider === "claude-code"
        ? {
            claudeCodeUrl: claudeCodeRelayUrl,
            claudeCodeToken: claudeCodeRelayToken,
          }
        : {}),
    });
  };

  const handleProviderChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const nextProvider = e.target.value as AiProvider;
    setSelectedProvider(nextProvider);
  };

  // File attachment handlers
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const newFiles: AttachedFile[] = Array.from(files).map((file) => {
      const isImage = file.type.startsWith("image/");
      const attached: AttachedFile = {
        id: Math.random().toString(36).substr(2, 9),
        file,
        type: isImage ? "image" : "document",
      };

      if (isImage) {
        attached.preview = URL.createObjectURL(file);
      }

      return attached;
    });

    setAttachedFiles((prev) => [...prev, ...newFiles]);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const removeAttachment = (id: string) => {
    setAttachedFiles((prev) => {
      const file = prev.find((f) => f.id === id);
      if (file?.preview) {
        URL.revokeObjectURL(file.preview);
      }
      return prev.filter((f) => f.id !== id);
    });
  };

  const headerLeft = (
    <button
      onClick={() => navigate("/ai")}
      className="p-1.5 md:p-2 neu-btn neu-text-secondary hover:neu-text-primary rounded-lg transition-colors"
      title="Back to AI"
    >
      <ArrowLeft size={16} className="md:w-[18px] md:h-[18px]" />
    </button>
  );

  // Debounced message content search
  useEffect(() => {
    if (!searchQuery.trim()) {
      setContentMatchIds(new Map());
      return;
    }
    clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(async () => {
      const matches = await searchAiMessages(searchQuery);
      setContentMatchIds(matches);
    }, 300);
    return () => clearTimeout(searchTimerRef.current);
  }, [searchQuery]);

  // Filter sessions by title + message content
  const filteredSessions = useMemo(() => {
    if (!searchQuery.trim()) return sessions;
    const lower = searchQuery.toLowerCase();
    return sessions.filter(
      (s) => s.title.toLowerCase().includes(lower) || contentMatchIds.has(s.id),
    );
  }, [sessions, searchQuery, contentMatchIds]);

  const headerCenter = (
    <button
      onClick={createNewSession}
      className="flex items-center gap-1.5 md:gap-2 px-2.5 md:px-3 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs md:text-sm font-medium transition-all active:scale-95 shadow"
    >
      <Plus size={14} />
      <span className="hidden sm:inline">New Chat</span>
    </button>
  );

  const headerRight = (
    <button
      onClick={() => setShowSidebar(!showSidebar)}
      className="flex items-center gap-1.5 px-2 py-1.5 md:px-3 md:py-2 rounded-lg neu-btn neu-text-secondary text-sm font-medium transition-all"
    >
      <MessageSquare size={14} />
      <span className="hidden sm:inline">History ({sessions.length})</span>
    </button>
  );

  return (
    <Layout
      pageTitle="Hub-AI"
      headerLeft={headerLeft}
      headerCenter={headerCenter}
      headerRight={headerRight}
    >
      <div className="flex-1 min-h-0 relative neu-bg">
        <div className="fixed inset-x-0 top-[calc(env(safe-area-inset-top,0px)+68px)] bottom-[calc(5rem+env(safe-area-inset-bottom,0px))] z-30 md:absolute md:inset-0 md:z-auto flex overflow-hidden">
          {/* Sidebar for chat history */}
          {showSidebar && (
            <>
              <div
                className="absolute inset-0 bg-black/50 z-40 md:hidden"
                onClick={() => setShowSidebar(false)}
              />
              <div className="absolute left-0 top-0 bottom-0 w-[calc(100vw-3rem)] max-w-72 z-50 shadow-[0_0_50px_rgba(0,0,0,0.4)] border-r-2 border-slate-400">
                <div className="h-full bg-white flex flex-col">
                  <div className="bg-slate-100 border-b-2 border-slate-300">
                    <div className="h-14 px-4 flex items-center justify-between">
                      <h3 className="font-bold text-slate-900 text-base leading-none">
                        Chat History
                      </h3>
                      <button
                        onClick={() => setShowSidebar(false)}
                        className="p-1.5 neu-btn rounded-lg neu-text-secondary"
                      >
                        <ChevronLeft size={18} />
                      </button>
                    </div>
                    <div className="px-3 pb-3">
                      <div className="relative">
                        <Search
                          size={14}
                          className="absolute left-2.5 top-1/2 -translate-y-1/2 neu-text-muted pointer-events-none"
                        />
                        <input
                          type="text"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          placeholder="Search chats..."
                          className="w-full pl-8 pr-8 py-2 text-sm neu-input rounded-lg"
                        />
                        {searchQuery && (
                          <button
                            type="button"
                            onClick={() => setSearchQuery("")}
                            className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-slate-200 transition-colors"
                          >
                            <X size={12} className="neu-text-muted" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto p-2">
                    {filteredSessions.length === 0 ? (
                      <p className="text-center text-sm neu-text-muted py-8">
                        {searchQuery ? "No matching chats" : "No history"}
                      </p>
                    ) : (
                      <div className="space-y-1">
                        {filteredSessions.map((session) => (
                          <div
                            key={session.id}
                            onClick={() => switchSession(session.id)}
                            className={`group flex items-center gap-2 px-3 py-2.5 rounded-xl cursor-pointer transition-all ${
                              session.id === currentSessionId
                                ? "neu-pressed text-purple-700"
                                : "neu-flat neu-text-secondary"
                            }`}
                          >
                            <MessageSquare size={16} className="shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">
                                {session.title}
                              </p>
                              {searchQuery &&
                              contentMatchIds.has(session.id) &&
                              !session.title
                                .toLowerCase()
                                .includes(searchQuery.toLowerCase()) ? (
                                <p className="text-xs text-purple-500 truncate">
                                  {contentMatchIds.get(session.id)}
                                </p>
                              ) : (
                                <p className="text-xs neu-text-muted">
                                  {session.messageCount} msgs •{" "}
                                  {session.updatedAt.toLocaleDateString(
                                    "en-US",
                                  )}
                                </p>
                              )}
                            </div>
                            <button
                              onClick={(e) => deleteSession(session.id, e)}
                              className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-100 hover:text-red-500 rounded transition-all"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Main Chat Area */}
          <div
            className={`flex-1 flex flex-col neu-bg min-h-0 transition-all duration-300 ${showSidebar ? "md:ml-72" : ""}`}
          >
            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto min-h-0">
              <div className="max-w-4xl mx-auto px-4 py-4 md:py-6">
                {/* Welcome Message */}
                {messages.length === 0 && (
                  <div className="relative py-12">
                    <div className="text-center">
                      <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-purple-500 to-indigo-600 mb-4 md:mb-6">
                        <Sparkles size={40} className="text-white" />
                      </div>
                      <h2 className="text-2xl font-bold neu-text-primary mb-3 md:mb-6">
                        Hub-AI
                      </h2>

                      {/* Quick Shortcuts from Settings */}
                      {shortcuts.length > 0 && (
                        <div className="flex flex-wrap justify-center gap-2">
                          {shortcuts.map((shortcut, index) => (
                            <button
                              key={index}
                              onClick={() => handleShortcutClick(shortcut)}
                              className="px-4 py-2 rounded-full neu-btn text-sm neu-text-secondary transition-all"
                            >
                              {shortcut}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Message List */}
                <div className="space-y-4 md:space-y-6">
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={`flex gap-4 ${
                        message.role === "user" ? "flex-row-reverse" : ""
                      }`}
                    >
                      {/* Avatar */}
                      <div
                        className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
                          message.role === "user"
                            ? "bg-slate-700"
                            : "bg-gradient-to-br from-purple-500 to-indigo-600"
                        }`}
                      >
                        {message.role === "user" ? (
                          <User size={20} className="text-white" />
                        ) : (
                          <Bot size={20} className="text-white" />
                        )}
                      </div>

                      {/* Message Content */}
                      <div
                        className={`flex-1 min-w-0 max-w-[calc(100%-4rem)] sm:max-w-[80%] ${
                          message.role === "user" ? "text-right" : ""
                        }`}
                      >
                        <div
                          className={`w-fit max-w-full px-4 py-3 rounded-2xl text-left ${
                            message.role === "user"
                              ? "ml-auto bg-slate-700 text-white rounded-tr-sm"
                              : "neu-card neu-text-primary rounded-tl-sm"
                          }`}
                        >
                          <div
                            className={`prose prose-sm max-w-none [overflow-wrap:anywhere] ${
                              message.role === "user"
                                ? "prose-invert"
                                : "prose-slate"
                            }`}
                          >
                            {message.role === "assistant" ? (
                              <ReactMarkdown
                                remarkPlugins={[remarkGfm, remarkBreaks]}
                              >
                                {sanitizeMarkdown(message.content)}
                              </ReactMarkdown>
                            ) : (
                              <span className="whitespace-pre-wrap">
                                {message.content}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="mt-1 text-xs neu-text-muted">
                          {message.timestamp.toLocaleTimeString("en-US", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </div>
                      </div>
                    </div>
                  ))}

                  {/* Loading Indicator — hide once the streaming placeholder
                      has content so it doesn't look like a second bot bubble. */}
                  {isLoading &&
                    !(
                      messages.length > 0 &&
                      messages[messages.length - 1].role === "assistant" &&
                      messages[messages.length - 1].content
                    ) && (
                      <div className="flex gap-4">
                        <div className="shrink-0 w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center">
                          <Bot size={20} className="text-white" />
                        </div>
                        <div className="flex items-center gap-2 px-4 py-3 neu-card rounded-2xl rounded-tl-sm">
                          <Loader2
                            size={16}
                            className="animate-spin text-purple-500"
                          />
                          <span className="text-sm neu-text-secondary">
                            {searchStatus ?? "Thinking..."}
                          </span>
                        </div>
                      </div>
                    )}

                  <div ref={messagesEndRef} />
                </div>
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="px-4 py-2 bg-red-500/10 border-t border-red-500/20">
                <div className="max-w-4xl mx-auto flex items-center gap-2 text-red-500 text-sm">
                  <AlertCircle size={20} className="shrink-0" />
                  {error}
                </div>
              </div>
            )}

            {/* Input Area */}
            <div className="shrink-0 border-t border-slate-300 neu-bg px-4 pt-2 md:pt-3 pb-2 md:pb-3">
              <form onSubmit={handleSubmit} className="max-w-4xl mx-auto">
                {/* Attached Files Preview */}
                {attachedFiles.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-2">
                    {attachedFiles.map((file) => (
                      <div
                        key={file.id}
                        className="relative group flex items-center gap-2 px-3 py-2 neu-flat rounded-lg"
                      >
                        {file.type === "image" && file.preview ? (
                          <img
                            src={file.preview}
                            alt={file.file.name}
                            className="w-10 h-10 object-cover rounded"
                          />
                        ) : (
                          <FileText size={20} className="neu-text-secondary" />
                        )}
                        <span className="text-sm neu-text-secondary max-w-[120px] truncate">
                          {file.file.name}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeAttachment(file.id)}
                          className="p-1 neu-text-muted hover:text-red-500 hover:bg-red-50 rounded transition-all"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex items-end gap-1.5 md:gap-2">
                  {/* AI Provider Select */}
                  <select
                    value={selectedProvider}
                    onChange={handleProviderChange}
                    className="shrink-0 rounded-lg neu-input px-2 py-2.5 text-xs neu-text-primary self-center"
                    disabled={isLoading}
                  >
                    {AI_PROVIDER_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  {/* Search Mode Toggle */}
                  <button
                    type="button"
                    onClick={() =>
                      setSearchMode(
                        searchMode === "standard" ? "agentic" : "standard",
                      )
                    }
                    className={`shrink-0 rounded-lg px-2 py-2.5 text-xs font-medium transition-all self-center flex items-center gap-1 ${
                      searchMode === "agentic"
                        ? "bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-md"
                        : "neu-btn neu-text-secondary"
                    }`}
                    disabled={isLoading}
                    title={
                      searchMode === "agentic"
                        ? "Agentic Search: ON"
                        : "Agentic Search: OFF"
                    }
                  >
                    <Zap size={14} />
                    <span className="hidden sm:inline">
                      {searchMode === "agentic" ? "Agentic" : "Standard"}
                    </span>
                  </button>
                  {/* Attach Button */}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="shrink-0 w-10 h-10 neu-circle-btn neu-text-secondary flex items-center justify-center transition-all self-center"
                    title="Attach file"
                  >
                    <Paperclip size={18} />
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept="image/*,.pdf,.doc,.docx,.txt,.csv,.xlsx,.json"
                    onChange={handleFileSelect}
                    className="hidden"
                  />

                  <div className="flex-1 relative">
                    <textarea
                      ref={inputRef}
                      value={input}
                      onChange={handleInputChange}
                      onKeyDown={handleKeyDown}
                      placeholder="Type a message..."
                      rows={1}
                      className="w-full px-3 py-2.5 rounded-2xl neu-input resize-none neu-text-primary placeholder:neu-text-muted transition-all"
                      style={{ maxHeight: "200px" }}
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={
                      (!input.trim() && attachedFiles.length === 0) || isLoading
                    }
                    className="shrink-0 w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-indigo-600 text-white flex items-center justify-center hover:from-purple-600 hover:to-indigo-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl active:scale-95"
                  >
                    {isLoading ? (
                      <Loader2 size={20} className="animate-spin" />
                    ) : (
                      <Send size={20} />
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
      <ConfirmDialog
        isOpen={deleteSessionId !== null}
        title="Delete Chat"
        message={`Are you sure you want to delete "${sessions.find((s) => s.id === deleteSessionId)?.title || ""}"?`}
        confirmLabel="Delete"
        onConfirm={confirmDeleteSession}
        onCancel={() => setDeleteSessionId(null)}
      />
    </Layout>
  );
};
