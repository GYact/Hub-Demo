import { useState, useCallback, useEffect, useRef } from "react";
import { upsertAiMessages } from "../lib/offlineData";
import { supabase } from "../lib/supabase";
import type { ChatMessage } from "../types/ai";
import type { AiProvider } from "../lib/aiDefaults";
import { getModelForProvider } from "../lib/aiDefaults";

export type { ChatMessage, AiProvider };

export type SearchMode = "standard" | "agentic";

export type FileAttachment = {
  name: string;
  mimeType: string;
  base64Data: string;
};

const SYSTEM_INSTRUCTION = `You are an AI assistant for an organization management app. Analyze the user's data and answer their questions.

You may receive relevant data retrieved via semantic search (RAG). The data can include:
- Memos, Journal entries, Gmail messages
- Tasks, Projects, Clients
- Media feed items (Slack, RSS, X/Twitter)
- And other organizational data

When data is provided, reference it accurately with source types and relevance scores.
When no data is provided or data is insufficient, answer based on your general knowledge and the conversation context. Do not refuse to answer just because retrieved data is limited.

Answer in a concise and clear manner.
Use Markdown format for responses.`;

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const useAiChat = (currentSessionId?: string | null) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchStatus, setSearchStatus] = useState<string | null>(null);
  const isMountedRef = useRef(true);
  const abortControllerRef = useRef<AbortController | null>(null);
  const activeSessionRef = useRef<string | null>(currentSessionId ?? null);
  activeSessionRef.current = currentSessionId ?? null;
  const messagesRef = useRef<ChatMessage[]>([]);
  messagesRef.current = messages;

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Reset UI state when active session changes so stale loading/error
  // from a previous session's stream doesn't leak into the new session.
  // Note: isLoading is NOT reset here — clearHistory() handles that for
  // session switches, and resetting here would kill the loading state when
  // handleSubmit creates a new session + sends a message in one go.
  useEffect(() => {
    setSearchStatus(null);
    setError(null);
  }, [currentSessionId]);

  const sendMessage = useCallback(
    async (
      content: string,
      options?: {
        provider?: AiProvider;
        sessionId?: string;
        sessionTitle?: string;
        attachments?: FileAttachment[];
        systemInstruction?: string;
        dataContext?: string;
        searchMode?: SearchMode;
        skipRag?: boolean;
        claudeCodeUrl?: string;
        claudeCodeToken?: string;
        claudeCodeSessionId?: string;
        onClaudeSessionId?: (sessionId: string) => void;
      },
    ) => {
      if (!content.trim()) return;

      const provider = options?.provider ?? "gemini";
      const model = getModelForProvider(provider);
      const sessionId = options?.sessionId;
      const sessionTitle = options?.sessionTitle;

      const userMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content,
        timestamp: new Date(),
      };

      // Check if this stream's session is still the active session
      const isActive = () =>
        isMountedRef.current &&
        activeSessionRef.current === (sessionId ?? null);

      // Always show user message immediately (activeSessionRef may not yet
      // reflect a newly-created session whose state update is still pending).
      setMessages((prev) => [...prev, userMessage]);
      setIsLoading(true);
      setError(null);
      setSearchStatus(null);

      // Persist user message immediately to prevent loss on unmount
      if (sessionId) {
        upsertAiMessages(sessionId, [userMessage]).catch(console.error);
      }

      // Abort previous request if still in-flight
      abortControllerRef.current?.abort();
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      let streamTimeoutId: ReturnType<typeof setTimeout> | null = null;

      try {
        const attachments = options?.attachments ?? [];
        const isClaudeCode = provider === "claude-code";

        let response: Response;

        if (isClaudeCode) {
          // Claude Code Relay (via Tailscale)
          const relayUrl = options?.claudeCodeUrl;
          const relayToken = options?.claudeCodeToken;
          if (!relayUrl) {
            throw new Error(
              "Claude Code Relay URL not configured. Set it in Settings.",
            );
          }

          const headers: Record<string, string> = {
            "Content-Type": "application/json",
          };
          if (relayToken) {
            headers["Authorization"] = `Bearer ${relayToken}`;
          }

          // 5-minute timeout covers the entire operation (fetch + stream)
          streamTimeoutId = setTimeout(
            () => abortController.abort(),
            5 * 60 * 1000,
          );
          response = await fetch(
            `${relayUrl.replace(/\/+$/, "")}/api/claude-code`,
            {
              method: "POST",
              headers,
              body: JSON.stringify({
                content,
                sessionId: options?.claudeCodeSessionId,
              }),
              signal: abortController.signal,
            },
          );
        } else {
          // Standard AI providers (via Supabase Edge Function)
          if (!supabase || !sessionId) {
            throw new Error("AI chat requires an active session.");
          }

          const {
            data: { session },
          } = await supabase.auth.getSession();
          if (!session?.access_token) {
            throw new Error("Not authenticated");
          }

          response = await fetch(`${SUPABASE_URL}/functions/v1/ai_hub_chat`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${session.access_token}`,
              apikey: SUPABASE_ANON_KEY,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              sessionId,
              sessionTitle,
              userMessageId: userMessage.id,
              content,
              provider,
              model,
              systemInstruction:
                options?.systemInstruction || SYSTEM_INSTRUCTION,
              history: messagesRef.current
                .slice(-20)
                .map(({ role, content: c }) => ({ role, content: c })),
              ...(options?.dataContext
                ? { dataContext: options.dataContext }
                : {}),
              ...(attachments.length > 0 ? { attachments } : {}),
              ...(options?.searchMode === "agentic"
                ? { searchMode: "agentic" }
                : {}),
              ...(options?.skipRag ? { skipRag: true } : {}),
            }),
            signal: abortController.signal,
          });
        }

        if (!response.ok) {
          const errBody = await response.json().catch(() => ({}));
          throw new Error(
            (errBody as { error?: string }).error || `HTTP ${response.status}`,
          );
        }

        if (!response.body) {
          throw new Error("Response body is empty");
        }

        // Add placeholder assistant message for incremental updates
        const tempAssistantId = crypto.randomUUID();
        if (isActive()) {
          setMessages((prev) => [
            ...prev,
            {
              id: tempAssistantId,
              role: "assistant",
              content: "",
              timestamp: new Date(),
            },
          ]);
        }

        // Parse SSE stream with requestAnimationFrame batching
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let accumulated = "";
        let rafId: number | null = null;
        let finalMessage: {
          id: string;
          content: string;
          created_at: string;
        } | null = null;

        const scheduleUpdate = () => {
          if (rafId !== null) return;
          rafId = requestAnimationFrame(() => {
            rafId = null;
            const snapshot = accumulated;
            if (isActive()) {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === tempAssistantId ? { ...m, content: snapshot } : m,
                ),
              );
            }
          });
        };

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
                  step?: string;
                  detail?: string;
                  sessionId?: string;
                  assistantMessage?: {
                    id: string;
                    content: string;
                    created_at: string;
                  };
                };

                if (event.type === "search_status" && event.detail) {
                  if (isActive()) {
                    setSearchStatus(event.detail);
                  }
                } else if (event.type === "chunk" && event.content) {
                  if (isActive()) setSearchStatus(null);
                  accumulated += event.content;
                  scheduleUpdate();
                } else if (event.type === "done" && event.assistantMessage) {
                  finalMessage = event.assistantMessage;
                  if (event.sessionId && options?.onClaudeSessionId) {
                    options.onClaudeSessionId(event.sessionId);
                  }
                } else if (event.type === "error") {
                  // Error with partial response - still show what was generated
                  if (event.assistantMessage) {
                    finalMessage = event.assistantMessage;
                  } else {
                    throw new Error(event.error || "Streaming error");
                  }
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

        // Cancel any pending RAF to avoid stale update
        if (rafId !== null) {
          cancelAnimationFrame(rafId);
          rafId = null;
        }

        // Use the server-assigned ID when available so the IndexedDB record
        // matches the Supabase row.  The React state keeps tempAssistantId as
        // the key to avoid DOM remount, but the persisted record uses the
        // canonical server ID.
        const serverId = finalMessage?.id;
        const assistantContent =
          finalMessage?.content ||
          accumulated ||
          "Failed to generate response.";
        const assistantTimestamp =
          finalMessage?.created_at ?? new Date().toISOString();

        const finalAssistantMessage: ChatMessage = {
          id: tempAssistantId,
          role: "assistant",
          content: assistantContent,
          timestamp: new Date(assistantTimestamp),
        };

        if (isActive()) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === tempAssistantId ? finalAssistantMessage : m,
            ),
          );
        }

        // Persist to IndexedDB for offline access.
        // Use the server-assigned ID to avoid creating a duplicate record
        // alongside the one Supabase syncs down via bulkPutLocalRows.
        if (sessionId) {
          const persistMessage: ChatMessage = serverId
            ? { ...finalAssistantMessage, id: serverId }
            : finalAssistantMessage;
          upsertAiMessages(sessionId, [persistMessage]).catch((err) => {
            console.error("Failed to save AI assistant message:", err);
          });
        }
      } catch (err) {
        // Don't report abort errors (expected on unmount/cancel)
        if (err instanceof DOMException && err.name === "AbortError") return;
        console.error("AI Chat Error:", err);
        if (isActive()) {
          setError(err instanceof Error ? err.message : "An error occurred");
        }
      } finally {
        if (streamTimeoutId) clearTimeout(streamTimeoutId);
        if (abortControllerRef.current === abortController) {
          abortControllerRef.current = null;
        }
        if (isActive()) {
          setIsLoading(false);
          setSearchStatus(null);
        }
      }
    },
    [],
  );

  const clearHistory = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setMessages([]);
    setIsLoading(false);
    setError(null);
    setSearchStatus(null);
  }, []);

  return {
    messages,
    isLoading,
    error,
    searchStatus,
    sendMessage,
    clearHistory,
    setMessages,
  };
};
