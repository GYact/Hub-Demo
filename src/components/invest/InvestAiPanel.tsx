import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  Bot,
  X,
  Send,
  Loader2,
  Trash2,
  User,
  AlertCircle,
  GripHorizontal,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import { useAiChat } from "../../hooks/useAiChat";
import {
  upsertAiSession,
  fetchAiMessagesBySession,
  toChatMessages,
} from "../../lib/offlineData";
import { sanitizeMarkdown } from "../../lib/formatters";
import type { InvestAiContext } from "../../types";
import {
  buildInvestSystemInstruction,
  buildInvestDataContext,
} from "./investAiUtils";

const SESSION_ID = "invest-ai";
const SESSION_TITLE = "ch:invest-ai";

const QUICK_ACTIONS = [
  {
    label: "この銘柄を分析",
    prompt:
      "現在表示中の銘柄をテクニカル・ファンダメンタルの両面から分析してください。",
  },
  {
    label: "ポートフォリオ評価",
    prompt:
      "保有銘柄のポートフォリオ全体を評価して、リスク分散や改善点を教えてください。",
  },
  {
    label: "指標の解説",
    prompt:
      "現在表示中のテクニカル指標（SMA, RSI, MACDなど）の読み方と、この銘柄での示唆を解説してください。",
  },
  {
    label: "リスク分析",
    prompt: "現在の投資状況について、主要なリスク要因を分析してください。",
  },
];

interface InvestAiPanelProps {
  isOpen: boolean;
  onClose: () => void;
  context: InvestAiContext;
}

export const InvestAiPanel = ({
  isOpen,
  onClose,
  context,
}: InvestAiPanelProps) => {
  const {
    messages,
    isLoading,
    error,
    searchStatus,
    sendMessage,
    clearHistory,
    setMessages,
  } = useAiChat(SESSION_ID);

  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const initializedRef = useRef(false);

  const systemInstruction = useMemo(
    () => buildInvestSystemInstruction(context),
    [
      context.chartSymbol,
      context.chartSymbolName,
      context.chartRange,
      context.chartIndicators,
      context.latestCandle,
      context.holdings,
      context.watchlist,
      context.quotes,
      context.activeTab,
    ],
  );

  const dataContext = useMemo(
    () => buildInvestDataContext(context),
    [context.latestCandle, context.holdings, context.quotes, context.activeTab],
  );

  // Restore messages from IndexedDB on mount
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    fetchAiMessagesBySession(SESSION_ID)
      .then((rows) => {
        const restored = toChatMessages(rows);
        if (restored.length > 0) setMessages(restored);
      })
      .catch(() => {});
  }, [setMessages]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [isOpen]);

  const doSend = useCallback(
    async (text: string) => {
      if (!text.trim() || isLoading) return;

      await upsertAiSession({
        id: SESSION_ID,
        title: SESSION_TITLE,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      void sendMessage(text.trim(), {
        provider: "gemini",
        sessionId: SESSION_ID,
        sessionTitle: SESSION_TITLE,
        systemInstruction,
        dataContext,
        skipRag: true,
      });
    },
    [isLoading, sendMessage, systemInstruction, dataContext],
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = input;
    setInput("");
    void doSend(text);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  if (!isOpen) return null;

  const chatContent = (
    <>
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-slate-200">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center">
            <Bot size={14} className="text-white" />
          </div>
          <span className="font-medium text-sm neu-text-primary">
            投資AI分析
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => {
              clearHistory();
            }}
            className="p-1.5 rounded-lg neu-text-muted hover:neu-text-secondary"
            title="会話をクリア"
          >
            <Trash2 size={14} />
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg neu-text-muted hover:neu-text-secondary md:hidden"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-3">
        {messages.length === 0 && !isLoading && (
          <div className="space-y-4 pt-4">
            <p className="text-xs text-center neu-text-muted">
              銘柄やポートフォリオの情報をもとにAIが分析します
            </p>
            <div className="grid grid-cols-2 gap-2">
              {QUICK_ACTIONS.map((action) => (
                <button
                  key={action.label}
                  onClick={() => void doSend(action.prompt)}
                  className="neu-btn px-3 py-2 rounded-xl text-xs text-left neu-text-secondary hover:neu-text-primary transition-colors"
                >
                  {action.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex gap-2 ${message.role === "user" ? "flex-row-reverse" : ""}`}
          >
            <div
              className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center ${
                message.role === "user"
                  ? "bg-slate-700"
                  : "bg-gradient-to-br from-indigo-500 to-blue-600"
              }`}
            >
              {message.role === "user" ? (
                <User size={12} className="text-white" />
              ) : (
                <Bot size={12} className="text-white" />
              )}
            </div>
            <div
              className={`flex-1 min-w-0 ${message.role === "user" ? "text-right" : ""}`}
            >
              <div
                className={`w-fit max-w-full px-3 py-2 rounded-xl text-left text-sm ${
                  message.role === "user"
                    ? "ml-auto bg-slate-700 text-white rounded-tr-sm"
                    : "neu-card neu-text-primary rounded-tl-sm"
                }`}
              >
                <div
                  className={`prose prose-sm max-w-none [overflow-wrap:anywhere] ${
                    message.role === "user" ? "prose-invert" : "prose-slate"
                  }`}
                >
                  {message.role === "assistant" ? (
                    <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>
                      {sanitizeMarkdown(message.content)}
                    </ReactMarkdown>
                  ) : (
                    <span className="whitespace-pre-wrap">
                      {message.content}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex gap-2">
            <div className="shrink-0 w-6 h-6 rounded-full bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center">
              <Bot size={12} className="text-white" />
            </div>
            <div className="px-3 py-2 neu-card rounded-xl rounded-tl-sm flex items-center gap-2">
              <Loader2 size={14} className="animate-spin text-indigo-500" />
              <span className="text-xs neu-text-secondary">
                {searchStatus ?? "分析中..."}
              </span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Error */}
      {error && (
        <div className="shrink-0 px-3 py-2 bg-red-500/10 border-t border-red-500/20">
          <div className="flex items-center gap-2 text-red-500 text-xs">
            <AlertCircle size={14} className="shrink-0" />
            <span className="truncate">{error}</span>
          </div>
        </div>
      )}

      {/* Input */}
      <div className="shrink-0 border-t border-slate-200 p-3">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="質問を入力..."
            rows={1}
            className="neu-input flex-1 px-3 py-2 rounded-xl text-sm resize-none max-h-24"
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="neu-btn p-2 rounded-xl text-blue-600 disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
          >
            <Send size={16} />
          </button>
        </form>
      </div>
    </>
  );

  return (
    <>
      {/* Desktop: inline side panel */}
      <div className="hidden md:flex flex-col w-[380px] shrink-0 border-l border-slate-200 neu-bg h-full">
        {chatContent}
      </div>

      {/* Mobile: overlay panel */}
      <div className="md:hidden">
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40"
          onClick={onClose}
        />
        <div className="fixed inset-x-0 bottom-0 h-[85dvh] z-50 neu-bg rounded-t-2xl flex flex-col animate-in slide-in-from-bottom duration-300">
          <div className="flex justify-center py-2">
            <GripHorizontal size={20} className="neu-text-muted" />
          </div>
          {chatContent}
        </div>
      </div>
    </>
  );
};
