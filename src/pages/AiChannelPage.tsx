import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import {
  Send,
  User,
  Loader2,
  ArrowLeft,
  Plus,
  MessageSquare,
  ChevronLeft,
  Search,
  X,
  Trash2,
} from "lucide-react";
import { Layout, ConfirmDialog } from "../components";
import { useAuth } from "../contexts/AuthContext";
import { useAiChat } from "../hooks/useAiChat";
import type { ChatMessage } from "../types/ai";
import { useUserSetting } from "../hooks/useUserSetting";
import {
  deleteAiSession,
  fetchAiMessagesBySession,
  fetchAiSessionsWithMessageCount,
  toChatMessages,
  upsertAiMessages,
  upsertAiSession,
} from "../lib/offlineData";
import type { AiProvider } from "../lib/aiDefaults";
import { AI_PROVIDER_OPTIONS } from "../lib/aiDefaults";
import {
  AI_PERSONAS,
  PERSONA_CATEGORIES,
  getPersonaById,
  type AiPersona,
  type PersonaCategory,
} from "../lib/aiPersonas";
import { sanitizeMarkdown } from "../lib/formatters";

interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  messageCount: number;
  createdAt: Date;
  updatedAt: Date;
}

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

// --- Persona Selection Grid ---
const PersonaCard = ({
  persona,
  onSelect,
}: {
  persona: AiPersona;
  onSelect: (p: AiPersona) => void;
}) => (
  <button
    onClick={() => onSelect(persona)}
    className="group text-left neu-card p-4 neu-card-hover hover:-translate-y-0.5 transition-all"
  >
    <div className="flex items-start gap-3">
      <div
        className={`w-12 h-12 rounded-xl bg-gradient-to-br ${persona.color} flex items-center justify-center text-2xl shadow shrink-0`}
      >
        {persona.avatar}
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="font-semibold neu-text-primary text-sm leading-tight truncate">
          {persona.name}
        </h3>
        <p className="text-xs neu-text-muted mt-0.5 truncate">
          {persona.nameJa}
        </p>
        <p className="text-xs neu-text-secondary mt-1 line-clamp-2">
          {persona.tagline}
        </p>
      </div>
    </div>
  </button>
);

const PersonaGrid = ({ onSelect }: { onSelect: (p: AiPersona) => void }) => {
  const [filter, setFilter] = useState<PersonaCategory | "all">("all");

  const filtered = useMemo(
    () =>
      filter === "all"
        ? AI_PERSONAS
        : AI_PERSONAS.filter((p) => p.category === filter),
    [filter],
  );

  return (
    <div className="h-full overflow-auto neu-bg mobile-scroll-pad">
      <div className="max-w-4xl mx-auto px-4 py-4 md:py-8">
        <div className="mb-4 md:mb-6">
          <h2 className="text-xl md:text-2xl font-bold neu-text-primary">
            AI Channel
          </h2>
          <p className="neu-text-secondary text-sm mt-1">
            Choose an AI personality to chat with
          </p>
        </div>

        {/* Category Filter */}
        <div className="flex gap-2 overflow-x-auto pb-3 mb-4 scrollbar-none">
          <button
            onClick={() => setFilter("all")}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
              filter === "all"
                ? "bg-purple-600 text-white shadow"
                : "neu-flat neu-text-secondary hover:neu-text-primary"
            }`}
          >
            All
          </button>
          {PERSONA_CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setFilter(cat.id)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                filter === cat.id
                  ? "bg-purple-600 text-white shadow"
                  : "neu-flat neu-text-secondary hover:neu-text-primary"
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Persona Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((p) => (
            <PersonaCard key={p.id} persona={p} onSelect={onSelect} />
          ))}
        </div>
      </div>
    </div>
  );
};

// --- Chat View ---
export const AiChannelPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const personaId = searchParams.get("persona");
  const persona = personaId ? getPersonaById(personaId) : null;

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
  const { value: selectedProvider, setValue: setSelectedProvider } =
    useUserSetting<AiProvider>(
      `ai_channel_provider_${persona?.id ?? ""}`,
      persona?.defaultProvider ?? "gemini",
    );
  const { value: claudeCodeRelayUrl } = useUserSetting<string>(
    "claude_code_relay_url",
    "",
  );
  const { value: claudeCodeRelayToken } = useUserSetting<string>(
    "claude_code_relay_token",
    "",
  );
  const [showSidebar, setShowSidebar] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [deleteSessionId, setDeleteSessionId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const persistedMessageIdsRef = useRef<Set<string>>(new Set());
  const lastLoadedSessionIdRef = useRef<string | null>(null);
  const sessionsRef = useRef<ChatSession[]>([]);

  useEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Load sessions list from IndexedDB (filtered by persona prefix)
  const sessionPrefix = persona ? `ch:${persona.id}:` : "";

  const loadSessions = useCallback(async () => {
    if (!user || !persona) return;
    try {
      const allSessions = await fetchAiSessionsWithMessageCount();
      const personaSessions = allSessions.filter((s: { title: string }) =>
        s.title.startsWith(sessionPrefix),
      );
      // Filter out empty sessions and clean them from DB
      const nonEmpty = personaSessions.filter(
        (s: { messageCount?: number }) => (s.messageCount ?? 0) > 0,
      );
      const emptySessions = personaSessions.filter(
        (s: { messageCount?: number }) => (s.messageCount ?? 0) === 0,
      );
      for (const s of emptySessions) {
        deleteAiSession(s.id).catch(() => {});
      }
      setSessions(
        nonEmpty.map(
          (s: {
            id: string;
            title: string;
            created_at?: string;
            updated_at?: string;
            messageCount?: number;
          }) => mapSessionRow(s, []),
        ),
      );
    } catch (err) {
      console.error("Failed to load sessions:", err);
    }
  }, [user, persona, sessionPrefix]);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  // Load messages when session changes (manual switch or new session)
  useEffect(() => {
    if (
      !currentSessionId ||
      lastLoadedSessionIdRef.current === currentSessionId
    )
      return;

    lastLoadedSessionIdRef.current = currentSessionId;

    void (async () => {
      try {
        const rows = await fetchAiMessagesBySession(currentSessionId);
        const msgs = toChatMessages(rows);
        setMessages(msgs);
        persistedMessageIdsRef.current = new Set(msgs.map((m) => m.id));
      } catch (err) {
        console.error("Failed to load session messages:", err);
      }
    })();
  }, [currentSessionId, setMessages]);

  // Persist new messages to IndexedDB (and upsert session on first message)
  useEffect(() => {
    if (!currentSessionId || messages.length === 0) return;
    const currentSession = sessionsRef.current.find(
      (s) => s.id === currentSessionId,
    );
    if (!currentSession) return;

    // Upsert session to DB (lazy: only when messages exist)
    upsertAiSession({
      id: currentSessionId,
      title: currentSession.title,
      created_at: currentSession.createdAt.toISOString(),
      updated_at: new Date().toISOString(),
    }).catch((err) => console.error("Failed to save AI session:", err));

    // Update messageCount in state
    setSessions((prev) =>
      prev.map((s) =>
        s.id === currentSessionId
          ? { ...s, messageCount: messages.length, updatedAt: new Date() }
          : s,
      ),
    );

    // Only persist user messages here; assistant messages are persisted
    // by useAiChat after streaming completes (with the server-assigned ID).
    const newMessages = messages.filter(
      (m) =>
        m.role === "user" &&
        m.content &&
        !persistedMessageIdsRef.current.has(m.id),
    );
    if (newMessages.length === 0) return;
    newMessages.forEach((m) => persistedMessageIdsRef.current.add(m.id));
    void upsertAiMessages(currentSessionId, newMessages).catch((err) => {
      console.error("Failed to persist messages:", err);
    });
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

  const createNewSession = useCallback(() => {
    if (!persona) return { id: "", title: "" };
    const id = crypto.randomUUID();
    const title = `${sessionPrefix}${new Date().toLocaleDateString("ja-JP")} ${new Date().toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}`;
    // Remove any existing empty sessions before adding the new one
    removeEmptySessions(id);
    setCurrentSessionId(id);
    lastLoadedSessionIdRef.current = id;
    persistedMessageIdsRef.current = new Set();
    // Don't persist to DB yet — saved on first message send
    setSessions((prev) => [
      mapSessionRow({ id, title, messageCount: 0 }, []),
      ...prev,
    ]);
    return { id, title };
  }, [persona, sessionPrefix, setCurrentSessionId, removeEmptySessions]);

  const switchSession = useCallback(
    (sessionId: string) => {
      if (sessionId === currentSessionId) {
        setShowSidebar(false);
        return;
      }
      removeEmptySessions(sessionId);
      lastLoadedSessionIdRef.current = null;
      persistedMessageIdsRef.current = new Set();
      setCurrentSessionId(sessionId);
      setShowSidebar(false);
    },
    [currentSessionId, setCurrentSessionId, removeEmptySessions],
  );

  const handleDeleteSession = useCallback(
    async (sessionId: string) => {
      try {
        await deleteAiSession(sessionId);
        setSessions((prev) => prev.filter((s) => s.id !== sessionId));
        if (currentSessionId === sessionId) {
          setCurrentSessionId(null);
          lastLoadedSessionIdRef.current = null;
          persistedMessageIdsRef.current = new Set();
          clearHistory();
        }
      } catch (err) {
        console.error("Failed to delete session:", err);
      }
    },
    [currentSessionId, setCurrentSessionId, clearHistory],
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading || !persona) return;

    const text = input.trim();
    setInput("");

    const session = currentSessionId
      ? {
          id: currentSessionId,
          title:
            sessions.find((s) => s.id === currentSessionId)?.title ??
            `${sessionPrefix}Chat`,
        }
      : createNewSession();

    void sendMessage(text, {
      provider: selectedProvider,
      sessionId: session.id,
      sessionTitle: session.title,
      systemInstruction: persona.systemPrompt,
      skipRag: true,
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

  const handleSelectPersona = (p: AiPersona) => {
    setSearchParams({ persona: p.id });
    setSelectedProvider(p.defaultProvider);
    // Reset session state for new persona
    setCurrentSessionId(null);
    lastLoadedSessionIdRef.current = null;
    persistedMessageIdsRef.current = new Set();
    clearHistory();
  };

  const handleBackToGrid = () => {
    setSearchParams({});
    setCurrentSessionId(null);
    lastLoadedSessionIdRef.current = null;
    persistedMessageIdsRef.current = new Set();
    clearHistory();
  };

  // Display title without prefix
  const displayTitle = (title: string) =>
    title.startsWith(sessionPrefix) ? title.slice(sessionPrefix.length) : title;

  const filteredSessions = useMemo(() => {
    if (!searchQuery.trim()) return sessions;
    const lower = searchQuery.toLowerCase();
    return sessions.filter((s) =>
      displayTitle(s.title).toLowerCase().includes(lower),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessions, searchQuery]);

  // --- Persona not selected: show grid ---
  if (!persona) {
    return (
      <Layout
        pageTitle="AI Channel"
        headerLeft={
          <button
            onClick={() => navigate("/ai")}
            className="p-1.5 md:p-2 neu-btn neu-text-secondary hover:neu-text-primary rounded-lg transition-colors"
            title="Back to AI"
          >
            <ArrowLeft size={16} className="md:w-[18px] md:h-[18px]" />
          </button>
        }
      >
        <PersonaGrid onSelect={handleSelectPersona} />
      </Layout>
    );
  }

  // --- Chat with selected persona ---
  const headerLeft = (
    <button
      onClick={handleBackToGrid}
      className="p-1.5 md:p-2 neu-btn neu-text-secondary hover:neu-text-primary rounded-lg transition-colors"
      title="Back to channels"
    >
      <ArrowLeft size={16} className="md:w-[18px] md:h-[18px]" />
    </button>
  );

  const headerCenter = (
    <div className="flex items-center gap-2">
      <span className="text-xl hidden md:inline">{persona.avatar}</span>
      <span className="font-semibold neu-text-primary text-sm truncate hidden md:inline max-w-[200px] lg:max-w-none">
        {persona.name}
      </span>
      <button
        onClick={() => {
          clearHistory();
          createNewSession();
          inputRef.current?.focus();
        }}
        className="flex items-center gap-1 px-2 py-1 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-medium transition-all active:scale-95 shadow"
      >
        <Plus size={12} />
      </button>
    </div>
  );

  const headerRight = (
    <button
      onClick={() => setShowSidebar(!showSidebar)}
      className="flex items-center gap-1.5 px-2 py-1.5 md:px-3 md:py-2 rounded-lg neu-btn neu-text-secondary text-sm font-medium transition-all"
    >
      <MessageSquare size={14} />
      <span className="hidden md:inline">History ({sessions.length})</span>
    </button>
  );

  return (
    <Layout
      pageTitle={`${persona.avatar} ${persona.name}`}
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
                        {persona.avatar} History
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
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium truncate">
                                {displayTitle(session.title)}
                              </p>
                              <p className="text-xs neu-text-muted">
                                {session.messageCount} messages
                              </p>
                            </div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteSessionId(session.id);
                              }}
                              className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-red-100 text-red-500 transition-all"
                            >
                              <Trash2 size={14} />
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
          <div className="flex-1 flex flex-col min-w-0 min-h-0">
            {/* Provider selector */}
            <div className="flex items-center gap-2 px-4 py-2 border-b border-slate-200">
              <select
                value={selectedProvider}
                onChange={(e) =>
                  setSelectedProvider(e.target.value as AiProvider)
                }
                className="text-xs neu-input rounded-lg px-2 py-1.5"
              >
                {AI_PROVIDER_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <span className="text-xs neu-text-muted">
                Talking to{" "}
                <span className="font-medium neu-text-secondary">
                  {persona.name}
                </span>
              </span>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
              {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-center px-4">
                  <div
                    className={`w-20 h-20 rounded-2xl bg-gradient-to-br ${persona.color} flex items-center justify-center text-4xl shadow-lg mb-4`}
                  >
                    {persona.avatar}
                  </div>
                  <h3 className="text-lg font-bold neu-text-primary">
                    {persona.name}
                  </h3>
                  <p className="text-sm neu-text-muted mt-1 max-w-sm">
                    {persona.tagline}
                  </p>
                  <p className="text-xs neu-text-muted mt-3 max-w-xs">
                    Start a conversation — ask anything!
                  </p>
                </div>
              )}

              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  {msg.role === "assistant" && (
                    <div
                      className={`w-8 h-8 rounded-lg bg-gradient-to-br ${persona.color} flex items-center justify-center text-base shadow shrink-0`}
                    >
                      {persona.avatar}
                    </div>
                  )}
                  <div
                    className={`max-w-[85%] md:max-w-[70%] rounded-2xl px-4 py-3 ${
                      msg.role === "user"
                        ? "bg-purple-600 text-white"
                        : "neu-card"
                    }`}
                  >
                    {msg.role === "assistant" ? (
                      <div className="prose prose-sm max-w-none neu-text-primary prose-headings:neu-text-primary prose-a:text-purple-600 prose-code:text-purple-700 prose-code:bg-purple-50 prose-code:rounded prose-code:px-1 prose-pre:neu-flat prose-pre:rounded-xl">
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm, remarkBreaks]}
                        >
                          {sanitizeMarkdown(msg.content || "...")}
                        </ReactMarkdown>
                      </div>
                    ) : (
                      <p className="text-sm whitespace-pre-wrap">
                        {msg.content}
                      </p>
                    )}
                  </div>
                  {msg.role === "user" && (
                    <div className="w-8 h-8 rounded-lg bg-slate-200 flex items-center justify-center shrink-0">
                      <User size={16} className="text-slate-600" />
                    </div>
                  )}
                </div>
              ))}

              {isLoading && (
                <div className="flex gap-3 justify-start">
                  <div
                    className={`w-8 h-8 rounded-lg bg-gradient-to-br ${persona.color} flex items-center justify-center text-base shadow shrink-0`}
                  >
                    {persona.avatar}
                  </div>
                  <div className="flex items-center gap-2 px-4 py-3 neu-card rounded-2xl">
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

              {error && (
                <div className="text-center">
                  <p className="text-sm text-red-500 bg-red-50 inline-block px-4 py-2 rounded-xl">
                    {error}
                  </p>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="border-t border-slate-200 p-3 md:p-4">
              <form onSubmit={handleSubmit} className="flex gap-2 items-end">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={`Ask ${persona.name} anything...`}
                  rows={1}
                  className="flex-1 resize-none neu-input rounded-xl px-4 py-3 text-sm max-h-32 overflow-y-auto"
                  style={{
                    height: "auto",
                    minHeight: "44px",
                  }}
                  onInput={(e) => {
                    const target = e.target as HTMLTextAreaElement;
                    target.style.height = "auto";
                    target.style.height = `${Math.min(target.scrollHeight, 128)}px`;
                  }}
                />
                <button
                  type="submit"
                  disabled={!input.trim() || isLoading}
                  className="p-3 rounded-xl bg-purple-600 hover:bg-purple-500 text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 shadow"
                >
                  {isLoading ? (
                    <Loader2 size={18} className="animate-spin" />
                  ) : (
                    <Send size={18} />
                  )}
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>

      <ConfirmDialog
        isOpen={!!deleteSessionId}
        title="Delete Chat"
        message="Are you sure you want to delete this conversation? This cannot be undone."
        onConfirm={() => {
          if (deleteSessionId) {
            void handleDeleteSession(deleteSessionId);
            setDeleteSessionId(null);
          }
        }}
        onCancel={() => setDeleteSessionId(null)}
      />
    </Layout>
  );
};
