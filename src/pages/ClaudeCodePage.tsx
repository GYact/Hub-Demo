import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import {
  Send,
  User,
  Loader2,
  AlertCircle,
  MessageSquare,
  Plus,
  ChevronLeft,
  ArrowLeft,
  X,
  Terminal,
  Wifi,
  WifiOff,
} from "lucide-react";
import { Layout, ConfirmDialog } from "../components";
import { useAuth } from "../contexts/AuthContext";
import { useAiChat } from "../hooks/useAiChat";
import type { ChatMessage } from "../types/ai";
import { sanitizeMarkdown } from "../lib/formatters";
import { useUserSetting } from "../hooks/useUserSetting";
import {
  deleteAiSession,
  fetchAiMessagesBySession,
  fetchAiSessionsWithMessageCount,
  toChatMessages,
  upsertAiMessages,
  upsertAiSession,
} from "../lib/offlineData";
import {
  saveClaudeSessionId,
  loadClaudeSessionMap,
} from "../lib/ai-company/supabaseHistory";

interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  messageCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const SESSION_PREFIX = "cc:";

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

export const ClaudeCodePage = () => {
  const { user } = useAuth();
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

  const [input, setInput] = useState("");
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [showSidebar, setShowSidebar] = useState(false);
  const [deleteSessionId, setDeleteSessionId] = useState<string | null>(null);

  // Map Hub session ID → Claude CLI session ID for --resume
  const claudeSessionMapRef = useRef<Map<string, string>>(new Map());

  // Load persisted CLI session mapping from Supabase
  useEffect(() => {
    if (!user?.id) return;
    loadClaudeSessionMap(user.id)
      .then((map) => {
        for (const [k, v] of map) {
          if (!claudeSessionMapRef.current.has(k)) {
            claudeSessionMapRef.current.set(k, v);
          }
        }
      })
      .catch(console.error);
  }, [user?.id]);

  const { value: relayUrl } = useUserSetting<string>(
    "claude_code_relay_url",
    "",
  );
  const { value: relayToken } = useUserSetting<string>(
    "claude_code_relay_token",
    "",
  );

  const [relayOnline, setRelayOnline] = useState<boolean | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const persistedMessageIdsRef = useRef<Set<string>>(new Set());
  const lastLoadedSessionIdRef = useRef<string | null>(null);
  const sessionsRef = useRef<ChatSession[]>([]);

  useEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Check relay health
  useEffect(() => {
    if (!relayUrl) {
      setRelayOnline(null);
      return;
    }
    let cancelled = false;
    const check = async () => {
      try {
        const headers: Record<string, string> = {};
        if (relayToken) headers["Authorization"] = `Bearer ${relayToken}`;
        const res = await fetch(`${relayUrl.replace(/\/+$/, "")}/api/health`, {
          headers,
          signal: AbortSignal.timeout(5000),
        });
        if (!cancelled) setRelayOnline(res.ok);
      } catch {
        if (!cancelled) setRelayOnline(false);
      }
    };
    check();
    const interval = setInterval(check, 30000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [relayUrl, relayToken]);

  // Load sessions (only cc: prefixed)
  useEffect(() => {
    const loadSessions = async () => {
      const stored = await fetchAiSessionsWithMessageCount();
      const ccSessions = stored.filter(
        (row) =>
          row.title.startsWith(SESSION_PREFIX) && (row.messageCount ?? 0) > 0,
      );
      const empty = stored.filter(
        (row) =>
          row.title.startsWith(SESSION_PREFIX) && (row.messageCount ?? 0) === 0,
      );
      for (const s of empty) {
        deleteAiSession(s.id).catch(() => {});
      }
      setSessions(ccSessions.map((row) => mapSessionRow(row, [])));
    };
    loadSessions();
  }, []);

  // Persist messages (ensure session exists first)
  // Skip while streaming (isLoading) to avoid writing incomplete assistant messages.
  // User messages are persisted immediately in useAiChat; final assistant messages
  // are persisted in useAiChat after streaming completes.
  useEffect(() => {
    if (!currentSessionId || messages.length === 0 || isLoading) return;
    const newMessages = messages.filter(
      (m) => !persistedMessageIdsRef.current.has(m.id),
    );
    if (newMessages.length === 0) return;
    const sessionTitle =
      sessions.find((s) => s.id === currentSessionId)?.title ??
      `${SESSION_PREFIX}New Session`;
    const now = new Date().toISOString();
    upsertAiSession({
      id: currentSessionId,
      title: sessionTitle,
      created_at: now,
      updated_at: now,
    })
      .then(() => upsertAiMessages(currentSessionId, newMessages))
      .then(() => {
        for (const m of newMessages) persistedMessageIdsRef.current.add(m.id);
      })
      .catch(console.error);
  }, [messages, currentSessionId, sessions, isLoading]);

  // Load messages on session switch
  useEffect(() => {
    if (!currentSessionId) return;
    if (lastLoadedSessionIdRef.current === currentSessionId) return;
    lastLoadedSessionIdRef.current = currentSessionId;
    persistedMessageIdsRef.current = new Set();

    const loadMessages = async () => {
      const rows = await fetchAiMessagesBySession(currentSessionId);
      if (rows.length > 0) {
        const loaded = toChatMessages(rows);
        setMessages(loaded);
        for (const m of loaded) persistedMessageIdsRef.current.add(m.id);
      }
    };
    loadMessages();
  }, [currentSessionId, setMessages]);

  const displayTitle = (title: string) =>
    title.startsWith(SESSION_PREFIX)
      ? title.slice(SESSION_PREFIX.length)
      : title;

  const createNewSession = useCallback(() => {
    clearHistory();
    const newSession: ChatSession = {
      id: crypto.randomUUID(),
      title: `${SESSION_PREFIX}New Session`,
      messages: [],
      messageCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    setSessions((prev) => [newSession, ...prev]);
    setCurrentSessionId(newSession.id);
    persistedMessageIdsRef.current = new Set();
    lastLoadedSessionIdRef.current = newSession.id;
    setShowSidebar(false);
  }, [clearHistory]);

  const switchSession = useCallback(
    (sessionId: string) => {
      if (sessionId === currentSessionId) {
        setShowSidebar(false);
        return;
      }
      clearHistory();
      setCurrentSessionId(sessionId);
      lastLoadedSessionIdRef.current = null;
      setShowSidebar(false);
    },
    [currentSessionId, clearHistory],
  );

  const deleteSession = (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteSessionId(sessionId);
  };

  const confirmDeleteSession = async () => {
    if (!deleteSessionId) return;
    await deleteAiSession(deleteSessionId);
    setSessions((prev) => prev.filter((s) => s.id !== deleteSessionId));
    if (currentSessionId === deleteSessionId) {
      clearHistory();
      setCurrentSessionId(null);
      lastLoadedSessionIdRef.current = null;
    }
    setDeleteSessionId(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const message = input.trim();
    if (!message || isLoading) return;

    if (!relayUrl) {
      return;
    }

    let sessionId = currentSessionId;
    let sessionTitle =
      sessions.find((s) => s.id === sessionId)?.title ??
      `${SESSION_PREFIX}New Session`;

    if (!sessionId) {
      const truncated =
        message.slice(0, 30) + (message.length > 30 ? "..." : "");
      const newSession: ChatSession = {
        id: crypto.randomUUID(),
        title: `${SESSION_PREFIX}${truncated}`,
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
      }).catch(console.error);
      sessionTitle = newSession.title;
    } else if (sessionTitle === `${SESSION_PREFIX}New Session`) {
      // Update title from first message content when created via "New Session" button
      const truncated =
        message.slice(0, 30) + (message.length > 30 ? "..." : "");
      sessionTitle = `${SESSION_PREFIX}${truncated}`;
      setSessions((prev) =>
        prev.map((s) =>
          s.id === sessionId
            ? { ...s, title: sessionTitle, updatedAt: new Date() }
            : s,
        ),
      );
      upsertAiSession({
        id: sessionId,
        title: sessionTitle,
        updated_at: new Date().toISOString(),
      }).catch(console.error);
    }

    setInput("");
    if (inputRef.current) inputRef.current.style.height = "auto";
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(max-width: 767px)").matches
    ) {
      inputRef.current?.blur();
    }

    const hubSessionId = sessionId;
    void sendMessage(message, {
      provider: "claude-code",
      sessionId: hubSessionId,
      sessionTitle,
      claudeCodeUrl: relayUrl,
      claudeCodeToken: relayToken,
      claudeCodeSessionId: hubSessionId
        ? claudeSessionMapRef.current.get(hubSessionId)
        : undefined,
      onClaudeSessionId: (cliSessionId) => {
        if (hubSessionId) {
          claudeSessionMapRef.current.set(hubSessionId, cliSessionId);
          if (user?.id) {
            saveClaudeSessionId(user.id, hubSessionId, cliSessionId).catch(
              console.error,
            );
          }
        }
      },
      skipRag: true,
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && e.metaKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  };

  const filteredSessions = useMemo(() => sessions, [sessions]);

  const headerLeft = (
    <button
      onClick={() => navigate("/ai")}
      className="p-1.5 md:p-2 neu-btn neu-text-secondary hover:neu-text-primary rounded-lg transition-colors"
      title="Back to AI"
    >
      <ArrowLeft size={16} className="md:w-[18px] md:h-[18px]" />
    </button>
  );

  const headerCenter = (
    <button
      onClick={createNewSession}
      className="flex items-center gap-1.5 md:gap-2 px-2.5 md:px-3 py-2 rounded-lg bg-orange-600 hover:bg-orange-500 text-white text-xs md:text-sm font-medium transition-all active:scale-95 shadow"
    >
      <Plus size={14} />
      <span className="hidden sm:inline">New Session</span>
    </button>
  );

  const headerRight = (
    <div className="flex items-center gap-2">
      {relayOnline === true && <Wifi size={16} className="text-green-500" />}
      {relayOnline === false && <WifiOff size={16} className="text-red-500" />}
      <button
        onClick={() => setShowSidebar(!showSidebar)}
        className="flex items-center gap-1.5 px-2 py-1.5 md:px-3 md:py-2 rounded-lg neu-btn neu-text-secondary text-sm font-medium transition-all"
      >
        <MessageSquare size={14} />
        <span className="hidden sm:inline">History ({sessions.length})</span>
      </button>
    </div>
  );

  return (
    <Layout
      pageTitle="Claude Code"
      headerLeft={headerLeft}
      headerCenter={headerCenter}
      headerRight={headerRight}
    >
      <div className="flex-1 min-h-0 relative neu-bg">
        <div className="fixed inset-x-0 top-[calc(env(safe-area-inset-top,0px)+68px)] bottom-[calc(5rem+env(safe-area-inset-bottom,0px))] z-30 md:absolute md:inset-0 md:z-auto flex overflow-hidden">
          {/* Sidebar */}
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
                        Sessions
                      </h3>
                      <button
                        onClick={() => setShowSidebar(false)}
                        className="p-1.5 neu-btn rounded-lg neu-text-secondary"
                      >
                        <ChevronLeft size={18} />
                      </button>
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto p-2">
                    {filteredSessions.length === 0 ? (
                      <p className="text-center text-sm neu-text-muted py-8">
                        No sessions
                      </p>
                    ) : (
                      <div className="space-y-1">
                        {filteredSessions.map((session) => (
                          <div
                            key={session.id}
                            onClick={() => switchSession(session.id)}
                            className={`group flex items-center gap-2 px-3 py-2.5 rounded-xl cursor-pointer transition-all ${
                              session.id === currentSessionId
                                ? "neu-pressed text-orange-700"
                                : "neu-flat neu-text-secondary"
                            }`}
                          >
                            <Terminal size={16} className="shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">
                                {displayTitle(session.title)}
                              </p>
                              <p className="text-xs neu-text-muted">
                                {session.messageCount} msgs
                              </p>
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

          {/* Main Chat */}
          <div
            className={`flex-1 flex flex-col neu-bg min-h-0 transition-all duration-300 ${showSidebar ? "md:ml-72" : ""}`}
          >
            {/* Messages */}
            <div className="flex-1 overflow-y-auto min-h-0">
              <div className="max-w-4xl mx-auto px-4 py-4 md:py-6">
                {/* Welcome */}
                {messages.length === 0 && (
                  <div className="relative py-12">
                    <div className="text-center">
                      <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-orange-500 to-amber-600 mb-4 md:mb-6">
                        <Terminal size={40} className="text-white" />
                      </div>
                      <h2 className="text-2xl font-bold neu-text-primary mb-2">
                        Claude Code
                      </h2>
                      <p className="text-sm neu-text-secondary mb-4">
                        Mac's Claude Code via Tailscale
                      </p>
                      {relayOnline === false && (
                        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-50 text-red-600 text-sm">
                          <WifiOff size={16} />
                          Mac relay is offline
                        </div>
                      )}
                      {relayOnline === null && !relayUrl && (
                        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-50 text-amber-600 text-sm">
                          <AlertCircle size={16} />
                          Relay URL not configured — set it in Settings &gt; AI
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
                      <div
                        className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
                          message.role === "user"
                            ? "bg-slate-700"
                            : "bg-gradient-to-br from-orange-500 to-amber-600"
                        }`}
                      >
                        {message.role === "user" ? (
                          <User size={20} className="text-white" />
                        ) : (
                          <Terminal size={20} className="text-white" />
                        )}
                      </div>
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
                              message.content ? (
                                <ReactMarkdown
                                  remarkPlugins={[remarkGfm, remarkBreaks]}
                                >
                                  {sanitizeMarkdown(message.content)}
                                </ReactMarkdown>
                              ) : (
                                <span className="flex items-center gap-2 text-sm neu-text-secondary">
                                  <Loader2
                                    size={14}
                                    className="animate-spin text-orange-500"
                                  />
                                  {searchStatus ?? "Running..."}
                                </span>
                              )
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

                  <div ref={messagesEndRef} />
                </div>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="px-4 py-2 bg-red-500/10 border-t border-red-500/20">
                <div className="max-w-4xl mx-auto flex items-center gap-2 text-red-500 text-sm">
                  <AlertCircle size={20} className="shrink-0" />
                  {error}
                </div>
              </div>
            )}

            {/* Input */}
            <div className="shrink-0 border-t border-slate-300 neu-bg px-4 pt-2 md:pt-3 pb-2 md:pb-3">
              <form onSubmit={handleSubmit} className="max-w-4xl mx-auto">
                <div className="flex items-end gap-1.5 md:gap-2">
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={handleInputChange}
                    onKeyDown={handleKeyDown}
                    placeholder={
                      relayOnline === false
                        ? "Mac relay is offline..."
                        : "Message Claude Code..."
                    }
                    className="flex-1 rounded-xl neu-input px-3 py-2 md:py-2.5 text-sm neu-text-primary resize-none min-h-[40px] max-h-[200px]"
                    rows={1}
                    disabled={isLoading || !relayUrl}
                  />
                  <button
                    type="submit"
                    disabled={!input.trim() || isLoading || !relayUrl}
                    className="shrink-0 rounded-xl px-3 py-2 md:py-2.5 bg-orange-600 hover:bg-orange-500 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  >
                    <Send size={18} />
                  </button>
                </div>
                <p className="text-[10px] neu-text-muted mt-1 text-center">
                  Cmd+Enter to send
                </p>
              </form>
            </div>
          </div>
        </div>
      </div>

      <ConfirmDialog
        isOpen={deleteSessionId !== null}
        onConfirm={confirmDeleteSession}
        onCancel={() => setDeleteSessionId(null)}
        title="Delete Session"
        message="Delete this Claude Code session?"
      />
    </Layout>
  );
};
