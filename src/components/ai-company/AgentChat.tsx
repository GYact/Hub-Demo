import { useState, useRef, useEffect, useCallback } from "react";
import { X } from "lucide-react";
import type { AgentDef } from "../../lib/ai-company/types";
import {
  saveChatMessage,
  loadChatMessages,
} from "../../lib/ai-company/supabaseHistory";
import { CharacterAvatar } from "./CharacterAvatar";

interface ChatMessage {
  id: string;
  role: "user" | "agent";
  content: string;
  timestamp: number;
}

type AuthFetch = (path: string, init?: RequestInit) => Promise<Response>;

interface AgentChatProps {
  agent: AgentDef;
  authFetch: AuthFetch;
  userId: string | null;
  onClose: () => void;
}

export function AgentChat({
  agent,
  authFetch,
  userId,
  onClose,
}: AgentChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    let cancelled = false;

    // Load from Supabase first (persistent history)
    if (userId) {
      loadChatMessages(userId, agent.id).then((records) => {
        if (cancelled || records.length === 0) return;
        setMessages(
          records.map((r) => ({
            id: r.id,
            role:
              r.fromAgentId === "user" ? ("user" as const) : ("agent" as const),
            content: r.content,
            timestamp: r.createdAt,
          })),
        );
      });
    }

    // Also load from relay (current session messages not yet in Supabase)
    authFetch("/messages")
      .then((res) => res.json())
      .then(
        (data: {
          messages?: Array<{
            fromAgentId: string;
            toAgentId: string;
            content: string;
            timestamp: number;
            id: string;
          }>;
        }) => {
          if (cancelled) return;
          const chatMsgs = (data.messages ?? [])
            .filter(
              (m) =>
                (m.fromAgentId === agent.id && m.toAgentId === "user") ||
                (m.fromAgentId === "user" && m.toAgentId === agent.id),
            )
            .map((m) => ({
              id: m.id,
              role: (m.fromAgentId === "user" ? "user" : "agent") as
                | "user"
                | "agent",
              content: m.content,
              timestamp: m.timestamp,
            }));
          if (chatMsgs.length > 0) {
            setMessages((prev) => {
              const existingIds = new Set(prev.map((p) => p.id));
              const newMsgs = chatMsgs.filter((m) => !existingIds.has(m.id));
              if (newMsgs.length === 0) return prev;
              return [...prev, ...newMsgs].sort(
                (a, b) => a.timestamp - b.timestamp,
              );
            });
          }
        },
      )
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [agent.id, authFetch, userId]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || isLoading) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: text,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);

    if (userId) {
      saveChatMessage(userId, "user", agent.id, text).catch(() => {});
    }

    try {
      const res = await authFetch("/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId: agent.id, message: text }),
      });
      const data = await res.json();

      if (data.error) {
        setMessages((prev) => [
          ...prev,
          {
            id: `err-${Date.now()}`,
            role: "agent",
            content: `[ERROR] ${data.error}`,
            timestamp: Date.now(),
          },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            id: `agent-${Date.now()}`,
            role: "agent",
            content: data.content,
            timestamp: data.timestamp,
          },
        ]);
        if (userId) {
          saveChatMessage(userId, agent.id, "user", data.content).catch(
            () => {},
          );
        }
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: "agent",
          content: "[ERROR] 通信に失敗しました",
          timestamp: Date.now(),
        },
      ]);
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  }, [input, isLoading, agent.id, authFetch, userId]);

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center">
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative w-full sm:max-w-lg sm:mx-4 max-h-[85vh] sm:max-h-[600px] flex flex-col rounded-t-2xl sm:rounded-2xl overflow-hidden neu-modal">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200">
          <div
            className="w-10 h-10 rounded-full overflow-hidden border-2 flex-shrink-0"
            style={{ borderColor: agent.appearance.accentColor }}
          >
            <CharacterAvatar name={agent.id} asBackground={false} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold neu-text-primary truncate">
              {agent.name}
            </p>
            <p
              className="text-[10px] font-medium"
              style={{ color: agent.appearance.accentColor }}
            >
              {agent.role}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center neu-text-muted hover:neu-text-primary rounded-full hover:bg-slate-100 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Messages */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[300px] neu-bg"
        >
          {messages.length === 0 && (
            <div className="text-center py-8 space-y-2">
              <p className="neu-text-muted text-xs">
                {agent.name}とチャットを始めましょう
              </p>
              <div className="flex flex-wrap gap-2 justify-center">
                {getQuickMessages(agent).map((q) => (
                  <button
                    key={q}
                    onClick={() => {
                      setInput(q);
                      inputRef.current?.focus();
                    }}
                    className="text-[10px] px-2 py-1 neu-flat neu-text-muted rounded-md hover:neu-text-secondary transition-all"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`
                  max-w-[80%] px-3 py-2 rounded-xl text-sm leading-relaxed
                  ${
                    msg.role === "user"
                      ? "bg-sky-600 text-white rounded-br-sm"
                      : "neu-card text-slate-700 rounded-bl-sm"
                  }
                `}
              >
                {msg.role === "agent" && (
                  <p
                    className="text-[10px] font-medium mb-1"
                    style={{ color: agent.appearance.accentColor }}
                  >
                    {agent.name}
                  </p>
                )}
                <p className="whitespace-pre-wrap">{msg.content}</p>
                <p
                  className={`text-[9px] mt-1 text-right ${msg.role === "user" ? "text-sky-200" : "neu-text-muted"}`}
                >
                  {new Date(msg.timestamp).toLocaleTimeString("ja-JP")}
                </p>
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex justify-start">
              <div className="px-3 py-2 rounded-xl neu-card rounded-bl-sm">
                <p
                  className="text-[10px] font-medium mb-1"
                  style={{ color: agent.appearance.accentColor }}
                >
                  {agent.name}
                </p>
                <div className="flex gap-1 items-center neu-text-muted">
                  <span
                    className="animate-bounce"
                    style={{ animationDelay: "0ms" }}
                  >
                    .
                  </span>
                  <span
                    className="animate-bounce"
                    style={{ animationDelay: "150ms" }}
                  >
                    .
                  </span>
                  <span
                    className="animate-bounce"
                    style={{ animationDelay: "300ms" }}
                  >
                    .
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Input */}
        <div className="px-4 py-3 border-t border-slate-200">
          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendMessage()}
              placeholder={`${agent.name}にメッセージ...`}
              disabled={isLoading}
              className="flex-1 px-3 py-2 neu-input rounded-lg text-sm disabled:opacity-50"
            />
            <button
              onClick={sendMessage}
              disabled={isLoading || !input.trim()}
              className="
                px-3 py-2 rounded-lg text-sm
                transition-all active:scale-95
                disabled:opacity-30 disabled:cursor-not-allowed shadow-sm
              "
              style={{
                backgroundColor: agent.appearance.accentColor,
                color: "white",
              }}
            >
              {isLoading ? "⟳" : "送信"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function getQuickMessages(agent: AgentDef): string[] {
  const map: Record<string, string[]> = {
    pm: ["今の進捗は？", "次の優先タスクは？", "チームの状態は？"],
    "lead-eng": [
      "技術的な相談がある",
      "コードレビューして",
      "アーキテクチャについて",
    ],
    frontend: [
      "UIを改善したい",
      "コンポーネントの相談",
      "デザインの提案ある？",
    ],
    backend: [
      "APIの設計について",
      "パフォーマンスが気になる",
      "データ構造の相談",
    ],
    infra: ["デプロイの状況は？", "インフラコストどう？", "監視の設定について"],
    "pr-manager": [
      "広報戦略を教えて",
      "プレスリリースの相談",
      "ブランディングについて",
    ],
    writer: ["記事を書いてほしい", "SEOのアドバイス", "文章をレビューして"],
    sns: ["SNS戦略を相談したい", "バズるネタない？", "投稿スケジュールは？"],
    accountant: ["今月の経費は？", "予算の相談", "コスト削減のアイデア"],
    general: ["社内環境の改善", "手続きについて", "福利厚生の相談"],
  };
  return map[agent.id] ?? ["こんにちは", "相談があります", "何ができる？"];
}
