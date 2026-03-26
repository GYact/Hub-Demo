import { useState, useCallback, useRef } from "react";
import { useAuth } from "../contexts/AuthContext";
import type {
  GmailMessage,
  GmailMessagesListResponse,
  GmailLabel,
  ParsedEmail,
  ComposeEmailInput,
  GmailThread,
  GmailDraft,
  GmailSendAs,
  GmailVacationSettings,
} from "../types/gmail";
import { parseGmailMessage, buildRfc2822Message } from "../lib/gmailUtils";

const GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

export const useGmail = () => {
  const { googleAccessToken, hasGoogleCalendarAccess } = useAuth();
  const [messages, setMessages] = useState<ParsedEmail[]>([]);
  const [labels, setLabels] = useState<GmailLabel[]>([]);
  const [selectedMessage, setSelectedMessage] = useState<ParsedEmail | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextPageToken, setNextPageToken] = useState<string | undefined>();
  const [totalEstimate, setTotalEstimate] = useState(0);
  const [threads, setThreads] = useState<GmailThread[]>([]);
  const [selectedThread, setSelectedThread] = useState<GmailThread | null>(
    null,
  );
  const [threadNextPageToken, setThreadNextPageToken] = useState<
    string | undefined
  >();
  const [drafts, setDrafts] = useState<GmailDraft[]>([]);
  const [selectedBatchIds, setSelectedBatchIds] = useState<string[]>([]);

  // AbortController for cancellable fetches
  const fetchMessagesAbortRef = useRef<AbortController | null>(null);
  const fetchThreadsAbortRef = useRef<AbortController | null>(null);
  // Guard against duplicate loadMore calls
  const isLoadingMoreRef = useRef(false);

  const handleApiError = useCallback((response: Response): string => {
    if (response.status === 401 || response.status === 403) {
      localStorage.removeItem("hub_google_access_token");
      window.dispatchEvent(new CustomEvent("google-token-expired"));
      return "Gmail permission not granted. Please reconnect from Settings.";
    }
    return `Gmail API error: ${response.status} ${response.statusText}`;
  }, []);

  const authHeaders = useCallback((): HeadersInit => {
    return {
      Authorization: `Bearer ${googleAccessToken}`,
      "Content-Type": "application/json",
    };
  }, [googleAccessToken]);

  // Fetch labels
  const fetchLabels = useCallback(async () => {
    if (!googleAccessToken) return;

    try {
      const response = await fetch(`${GMAIL_API_BASE}/labels`, {
        headers: authHeaders(),
      });
      if (!response.ok) {
        setError(handleApiError(response));
        return;
      }
      const data = await response.json();
      setLabels(data.labels || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch labels");
    }
  }, [googleAccessToken, authHeaders, handleApiError]);

  // Fetch a single message detail
  const fetchMessageDetail = useCallback(
    async (messageId: string): Promise<ParsedEmail | null> => {
      if (!googleAccessToken) return null;

      try {
        const response = await fetch(
          `${GMAIL_API_BASE}/messages/${messageId}?format=full`,
          { headers: authHeaders() },
        );
        if (!response.ok) {
          setError(handleApiError(response));
          return null;
        }
        const data: GmailMessage = await response.json();
        return parseGmailMessage(data);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to fetch message detail",
        );
        return null;
      }
    },
    [googleAccessToken, authHeaders, handleApiError],
  );

  // Fetch messages list with optional label and search query
  const fetchMessages = useCallback(
    async (
      labelId?: string,
      query?: string,
      pageToken?: string,
      append?: boolean,
    ) => {
      if (!googleAccessToken) {
        setError(
          "Google access token not available. Please connect Google Services.",
        );
        return;
      }

      // Abort previous fetchMessages request (prevents stale results on rapid label switching)
      fetchMessagesAbortRef.current?.abort();
      const controller = new AbortController();
      fetchMessagesAbortRef.current = controller;

      setIsLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams({ maxResults: "20" });
        if (labelId) params.set("labelIds", labelId);
        if (query) params.set("q", query);
        if (pageToken) params.set("pageToken", pageToken);

        const response = await fetch(`${GMAIL_API_BASE}/messages?${params}`, {
          headers: authHeaders(),
          signal: controller.signal,
        });

        if (!response.ok) {
          setError(handleApiError(response));
          return;
        }

        const data: GmailMessagesListResponse = await response.json();
        setNextPageToken(data.nextPageToken);
        setTotalEstimate(data.resultSizeEstimate);

        if (!data.messages || data.messages.length === 0) {
          if (!append) setMessages([]);
          return;
        }

        // Fetch details for each message in parallel
        const details = await Promise.all(
          data.messages.map(async (msg) => {
            const res = await fetch(
              `${GMAIL_API_BASE}/messages/${msg.id}?format=full`,
              { headers: authHeaders(), signal: controller.signal },
            );
            if (!res.ok) return null;
            const msgData: GmailMessage = await res.json();
            return parseGmailMessage(msgData);
          }),
        );

        const parsed = details.filter((d): d is ParsedEmail => d !== null);

        if (append) {
          setMessages((prev) => [...prev, ...parsed]);
        } else {
          setMessages(parsed);
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(
          err instanceof Error ? err.message : "Failed to fetch messages",
        );
      } finally {
        setIsLoading(false);
      }
    },
    [googleAccessToken, authHeaders, handleApiError],
  );

  // Load more messages using pageToken (guarded against rapid clicks)
  const loadMore = useCallback(
    async (labelId?: string, query?: string) => {
      if (!nextPageToken || isLoadingMoreRef.current) return;
      isLoadingMoreRef.current = true;
      try {
        await fetchMessages(labelId, query, nextPageToken, true);
      } finally {
        isLoadingMoreRef.current = false;
      }
    },
    [nextPageToken, fetchMessages],
  );

  // Send a message
  const sendMessage = useCallback(
    async (input: ComposeEmailInput): Promise<boolean> => {
      if (!googleAccessToken) return false;

      setIsSending(true);
      try {
        const raw = buildRfc2822Message(input);
        const body: Record<string, string> = { raw };
        if (input.threadId) body.threadId = input.threadId;

        const response = await fetch(`${GMAIL_API_BASE}/messages/send`, {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          setError(handleApiError(response));
          return false;
        }
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to send message");
        return false;
      } finally {
        setIsSending(false);
      }
    },
    [googleAccessToken, authHeaders, handleApiError],
  );

  // Modify message labels
  const modifyMessage = useCallback(
    async (
      messageId: string,
      addLabelIds?: string[],
      removeLabelIds?: string[],
    ): Promise<boolean> => {
      if (!googleAccessToken) return false;

      try {
        const response = await fetch(
          `${GMAIL_API_BASE}/messages/${messageId}/modify`,
          {
            method: "POST",
            headers: authHeaders(),
            body: JSON.stringify({
              addLabelIds: addLabelIds || [],
              removeLabelIds: removeLabelIds || [],
            }),
          },
        );

        if (!response.ok) {
          setError(handleApiError(response));
          return false;
        }

        // Update local state
        setMessages((prev) =>
          prev.map((msg) => {
            if (msg.id !== messageId) return msg;
            let newLabels = [...msg.labelIds];
            if (removeLabelIds) {
              newLabels = newLabels.filter((l) => !removeLabelIds.includes(l));
            }
            if (addLabelIds) {
              newLabels.push(
                ...addLabelIds.filter((l) => !newLabels.includes(l)),
              );
            }
            return {
              ...msg,
              labelIds: newLabels,
              isUnread: newLabels.includes("UNREAD"),
              isStarred: newLabels.includes("STARRED"),
            };
          }),
        );

        // Update selected message if it's the one being modified
        setSelectedMessage((prev) => {
          if (!prev || prev.id !== messageId) return prev;
          let newLabels = [...prev.labelIds];
          if (removeLabelIds) {
            newLabels = newLabels.filter((l) => !removeLabelIds.includes(l));
          }
          if (addLabelIds) {
            newLabels.push(
              ...addLabelIds.filter((l) => !newLabels.includes(l)),
            );
          }
          return {
            ...prev,
            labelIds: newLabels,
            isUnread: newLabels.includes("UNREAD"),
            isStarred: newLabels.includes("STARRED"),
          };
        });

        return true;
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to modify message",
        );
        return false;
      }
    },
    [googleAccessToken, authHeaders, handleApiError],
  );

  // Trash a message
  const trashMessage = useCallback(
    async (messageId: string): Promise<boolean> => {
      if (!googleAccessToken) return false;

      try {
        const response = await fetch(
          `${GMAIL_API_BASE}/messages/${messageId}/trash`,
          { method: "POST", headers: authHeaders() },
        );

        if (!response.ok) {
          setError(handleApiError(response));
          return false;
        }

        setMessages((prev) => prev.filter((msg) => msg.id !== messageId));
        setSelectedMessage((prev) => (prev?.id === messageId ? null : prev));
        return true;
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to trash message",
        );
        return false;
      }
    },
    [googleAccessToken, authHeaders, handleApiError],
  );

  // Untrash a message
  const untrashMessage = useCallback(
    async (messageId: string): Promise<boolean> => {
      if (!googleAccessToken) return false;

      try {
        const response = await fetch(
          `${GMAIL_API_BASE}/messages/${messageId}/untrash`,
          { method: "POST", headers: authHeaders() },
        );

        if (!response.ok) {
          setError(handleApiError(response));
          return false;
        }

        setMessages((prev) => prev.filter((msg) => msg.id !== messageId));
        return true;
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to untrash message",
        );
        return false;
      }
    },
    [googleAccessToken, authHeaders, handleApiError],
  );

  // Permanently delete a message
  const deleteMessage = useCallback(
    async (messageId: string): Promise<boolean> => {
      if (!googleAccessToken) return false;

      try {
        const response = await fetch(
          `${GMAIL_API_BASE}/messages/${messageId}`,
          { method: "DELETE", headers: authHeaders() },
        );

        if (!response.ok) {
          setError(handleApiError(response));
          return false;
        }

        setMessages((prev) => prev.filter((msg) => msg.id !== messageId));
        setSelectedMessage((prev) => (prev?.id === messageId ? null : prev));
        return true;
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to delete message",
        );
        return false;
      }
    },
    [googleAccessToken, authHeaders, handleApiError],
  );

  // Download attachment
  const downloadAttachment = useCallback(
    async (
      messageId: string,
      attachmentId: string,
      filename: string,
    ): Promise<void> => {
      if (!googleAccessToken) return;

      try {
        const response = await fetch(
          `${GMAIL_API_BASE}/messages/${messageId}/attachments/${attachmentId}`,
          { headers: authHeaders() },
        );

        if (!response.ok) {
          setError(handleApiError(response));
          return;
        }

        const data = await response.json();
        if (!data.data) return;

        // Decode base64url to binary
        const base64 = data.data.replace(/-/g, "+").replace(/_/g, "/");
        const binaryString = atob(base64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        const blob = new Blob([bytes]);

        // Trigger download
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to download attachment",
        );
      }
    },
    [googleAccessToken, authHeaders, handleApiError],
  );

  // Shortcut methods
  const markAsRead = useCallback(
    (messageId: string) => modifyMessage(messageId, [], ["UNREAD"]),
    [modifyMessage],
  );

  const markAsUnread = useCallback(
    (messageId: string) => modifyMessage(messageId, ["UNREAD"], []),
    [modifyMessage],
  );

  const toggleStar = useCallback(
    (messageId: string, isCurrentlyStarred: boolean) =>
      modifyMessage(
        messageId,
        isCurrentlyStarred ? [] : ["STARRED"],
        isCurrentlyStarred ? ["STARRED"] : [],
      ),
    [modifyMessage],
  );

  const archiveMessage = useCallback(
    (messageId: string) => modifyMessage(messageId, [], ["INBOX"]),
    [modifyMessage],
  );

  // ===== Thread Functions =====

  const fetchThreads = useCallback(
    async (
      labelId?: string,
      query?: string,
      pageToken?: string,
      append?: boolean,
    ) => {
      if (!googleAccessToken) return;

      // Abort previous fetchThreads request
      fetchThreadsAbortRef.current?.abort();
      const controller = new AbortController();
      fetchThreadsAbortRef.current = controller;

      setIsLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ maxResults: "20" });
        if (labelId) params.set("labelIds", labelId);
        if (query) params.set("q", query);
        if (pageToken) params.set("pageToken", pageToken);

        const response = await fetch(`${GMAIL_API_BASE}/threads?${params}`, {
          headers: authHeaders(),
          signal: controller.signal,
        });
        if (!response.ok) {
          setError(handleApiError(response));
          return;
        }
        const data = await response.json();
        setThreadNextPageToken(data.nextPageToken);
        if (!data.threads || data.threads.length === 0) {
          if (!append) setThreads([]);
          return;
        }
        // Use format=metadata for list view (avoids fetching full body for each message)
        const threadDetails = await Promise.all(
          data.threads.map(async (t: { id: string }) => {
            const res = await fetch(
              `${GMAIL_API_BASE}/threads/${t.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
              { headers: authHeaders(), signal: controller.signal },
            );
            if (!res.ok) return null;
            const td = await res.json();
            const msgs: ParsedEmail[] = (td.messages || []).map(
              (m: GmailMessage) => parseGmailMessage(m),
            );
            if (msgs.length === 0) return null;
            const last = msgs[msgs.length - 1];
            const allLabels = [...new Set(msgs.flatMap((m) => m.labelIds))];
            const pMap = new Map<string, { name: string; email: string }>();
            for (const m of msgs) {
              if (m.from?.email) pMap.set(m.from.email, m.from);
            }
            return {
              id: td.id,
              messages: msgs,
              subject: msgs[0].subject,
              snippet: last.snippet,
              lastDate: last.date,
              participants: Array.from(pMap.values()),
              messageCount: msgs.length,
              isUnread: msgs.some((m) => m.isUnread),
              isStarred: msgs.some((m) => m.isStarred),
              labelIds: allLabels,
            } as GmailThread;
          }),
        );
        const parsed = threadDetails.filter(
          (t): t is GmailThread => t !== null,
        );
        if (append) {
          setThreads((prev) => [...prev, ...parsed]);
        } else {
          setThreads(parsed);
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(
          err instanceof Error ? err.message : "Failed to fetch threads",
        );
      } finally {
        setIsLoading(false);
      }
    },
    [googleAccessToken, authHeaders, handleApiError],
  );

  const fetchThreadDetail = useCallback(
    async (threadId: string): Promise<GmailThread | null> => {
      if (!googleAccessToken) return null;
      try {
        const response = await fetch(
          `${GMAIL_API_BASE}/threads/${threadId}?format=full`,
          { headers: authHeaders() },
        );
        if (!response.ok) {
          setError(handleApiError(response));
          return null;
        }
        const td = await response.json();
        const msgs: ParsedEmail[] = (td.messages || []).map((m: GmailMessage) =>
          parseGmailMessage(m),
        );
        if (msgs.length === 0) return null;
        const last = msgs[msgs.length - 1];
        const allLabels = [...new Set(msgs.flatMap((m) => m.labelIds))];
        const pMap = new Map<string, { name: string; email: string }>();
        for (const m of msgs) pMap.set(m.from.email, m.from);
        return {
          id: td.id,
          messages: msgs,
          subject: msgs[0].subject,
          snippet: last.snippet,
          lastDate: last.date,
          participants: Array.from(pMap.values()),
          messageCount: msgs.length,
          isUnread: msgs.some((m) => m.isUnread),
          isStarred: msgs.some((m) => m.isStarred),
          labelIds: allLabels,
        };
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to fetch thread detail",
        );
        return null;
      }
    },
    [googleAccessToken, authHeaders, handleApiError],
  );

  const loadMoreThreads = useCallback(
    async (labelId?: string, query?: string) => {
      if (!threadNextPageToken) return;
      await fetchThreads(labelId, query, threadNextPageToken, true);
    },
    [threadNextPageToken, fetchThreads],
  );

  // ===== Draft Functions =====

  const fetchDrafts = useCallback(
    async (pageToken?: string) => {
      if (!googleAccessToken) return;
      setIsLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ maxResults: "20" });
        if (pageToken) params.set("pageToken", pageToken);
        const response = await fetch(`${GMAIL_API_BASE}/drafts?${params}`, {
          headers: authHeaders(),
        });
        if (!response.ok) {
          setError(handleApiError(response));
          return;
        }
        const data = await response.json();
        if (!data.drafts || data.drafts.length === 0) {
          setDrafts([]);
          return;
        }
        const details = await Promise.all(
          data.drafts.map(
            async (d: { id: string; message: { id: string } }) => {
              const res = await fetch(`${GMAIL_API_BASE}/drafts/${d.id}`, {
                headers: authHeaders(),
              });
              if (!res.ok) return null;
              const dd = await res.json();
              return {
                id: dd.id,
                message: parseGmailMessage(dd.message),
              } as GmailDraft;
            },
          ),
        );
        setDrafts(details.filter((d): d is GmailDraft => d !== null));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch drafts");
      } finally {
        setIsLoading(false);
      }
    },
    [googleAccessToken, authHeaders, handleApiError],
  );

  const createDraft = useCallback(
    async (input: ComposeEmailInput): Promise<GmailDraft | null> => {
      if (!googleAccessToken) return null;
      try {
        const raw = buildRfc2822Message(input);
        const body: Record<string, unknown> = { message: { raw } };
        if (input.threadId)
          (body.message as Record<string, unknown>).threadId = input.threadId;
        const response = await fetch(`${GMAIL_API_BASE}/drafts`, {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify(body),
        });
        if (!response.ok) {
          setError(handleApiError(response));
          return null;
        }
        const data = await response.json();
        const draft: GmailDraft = {
          id: data.id,
          message: parseGmailMessage(data.message),
        };
        setDrafts((prev) => [draft, ...prev]);
        return draft;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to create draft");
        return null;
      }
    },
    [googleAccessToken, authHeaders, handleApiError],
  );

  const updateDraft = useCallback(
    async (
      draftId: string,
      input: ComposeEmailInput,
    ): Promise<GmailDraft | null> => {
      if (!googleAccessToken) return null;
      try {
        const raw = buildRfc2822Message(input);
        const body: Record<string, unknown> = { message: { raw } };
        if (input.threadId)
          (body.message as Record<string, unknown>).threadId = input.threadId;
        const response = await fetch(`${GMAIL_API_BASE}/drafts/${draftId}`, {
          method: "PUT",
          headers: authHeaders(),
          body: JSON.stringify(body),
        });
        if (!response.ok) {
          setError(handleApiError(response));
          return null;
        }
        const data = await response.json();
        const updated: GmailDraft = {
          id: data.id,
          message: parseGmailMessage(data.message),
        };
        setDrafts((prev) => prev.map((d) => (d.id === draftId ? updated : d)));
        return updated;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to update draft");
        return null;
      }
    },
    [googleAccessToken, authHeaders, handleApiError],
  );

  const deleteDraft = useCallback(
    async (draftId: string): Promise<boolean> => {
      if (!googleAccessToken) return false;
      try {
        const response = await fetch(`${GMAIL_API_BASE}/drafts/${draftId}`, {
          method: "DELETE",
          headers: authHeaders(),
        });
        if (!response.ok) {
          setError(handleApiError(response));
          return false;
        }
        setDrafts((prev) => prev.filter((d) => d.id !== draftId));
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to delete draft");
        return false;
      }
    },
    [googleAccessToken, authHeaders, handleApiError],
  );

  const sendDraft = useCallback(
    async (draftId: string): Promise<boolean> => {
      if (!googleAccessToken) return false;
      setIsSending(true);
      try {
        const response = await fetch(`${GMAIL_API_BASE}/drafts/send`, {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ id: draftId }),
        });
        if (!response.ok) {
          setError(handleApiError(response));
          return false;
        }
        setDrafts((prev) => prev.filter((d) => d.id !== draftId));
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to send draft");
        return false;
      } finally {
        setIsSending(false);
      }
    },
    [googleAccessToken, authHeaders, handleApiError],
  );

  // ===== Label CRUD =====

  const createLabel = useCallback(
    async (
      name: string,
      color?: { textColor: string; backgroundColor: string },
    ): Promise<GmailLabel | null> => {
      if (!googleAccessToken) return null;
      try {
        const body: Record<string, unknown> = {
          name,
          labelListVisibility: "labelShow",
          messageListVisibility: "show",
        };
        if (color) body.color = color;
        const response = await fetch(`${GMAIL_API_BASE}/labels`, {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify(body),
        });
        if (!response.ok) {
          setError(handleApiError(response));
          return null;
        }
        const data: GmailLabel = await response.json();
        setLabels((prev) => [...prev, data]);
        return data;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to create label");
        return null;
      }
    },
    [googleAccessToken, authHeaders, handleApiError],
  );

  const updateLabel = useCallback(
    async (
      labelId: string,
      updates: {
        name?: string;
        color?: { textColor: string; backgroundColor: string };
      },
    ): Promise<boolean> => {
      if (!googleAccessToken) return false;
      try {
        const response = await fetch(`${GMAIL_API_BASE}/labels/${labelId}`, {
          method: "PATCH",
          headers: authHeaders(),
          body: JSON.stringify(updates),
        });
        if (!response.ok) {
          setError(handleApiError(response));
          return false;
        }
        const data: GmailLabel = await response.json();
        setLabels((prev) => prev.map((l) => (l.id === labelId ? data : l)));
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to update label");
        return false;
      }
    },
    [googleAccessToken, authHeaders, handleApiError],
  );

  const deleteLabel = useCallback(
    async (labelId: string): Promise<boolean> => {
      if (!googleAccessToken) return false;
      try {
        const response = await fetch(`${GMAIL_API_BASE}/labels/${labelId}`, {
          method: "DELETE",
          headers: authHeaders(),
        });
        if (!response.ok) {
          setError(handleApiError(response));
          return false;
        }
        setLabels((prev) => prev.filter((l) => l.id !== labelId));
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to delete label");
        return false;
      }
    },
    [googleAccessToken, authHeaders, handleApiError],
  );

  // ===== Batch Operations =====

  const batchModifyMessages = useCallback(
    async (
      ids: string[],
      addLabelIds?: string[],
      removeLabelIds?: string[],
    ): Promise<boolean> => {
      if (!googleAccessToken || ids.length === 0) return false;
      try {
        // Gmail API has a 1000-item limit per batch request
        const chunks: string[][] = [];
        for (let i = 0; i < ids.length; i += 1000) {
          chunks.push(ids.slice(i, i + 1000));
        }
        for (const chunk of chunks) {
          const response = await fetch(
            `${GMAIL_API_BASE}/messages/batchModify`,
            {
              method: "POST",
              headers: authHeaders(),
              body: JSON.stringify({
                ids: chunk,
                addLabelIds: addLabelIds || [],
                removeLabelIds: removeLabelIds || [],
              }),
            },
          );
          if (!response.ok) {
            setError(handleApiError(response));
            return false;
          }
        }
        setMessages((prev) =>
          prev.map((msg) => {
            if (!ids.includes(msg.id)) return msg;
            let newLabels = [...msg.labelIds];
            if (removeLabelIds) {
              newLabels = newLabels.filter((l) => !removeLabelIds.includes(l));
            }
            if (addLabelIds) {
              newLabels.push(
                ...addLabelIds.filter((l) => !newLabels.includes(l)),
              );
            }
            return {
              ...msg,
              labelIds: newLabels,
              isUnread: newLabels.includes("UNREAD"),
              isStarred: newLabels.includes("STARRED"),
            };
          }),
        );
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to batch modify");
        return false;
      }
    },
    [googleAccessToken, authHeaders, handleApiError],
  );

  const batchDeleteMessages = useCallback(
    async (ids: string[]): Promise<boolean> => {
      if (!googleAccessToken || ids.length === 0) return false;
      try {
        // Gmail API has a 1000-item limit per batch request
        const chunks: string[][] = [];
        for (let i = 0; i < ids.length; i += 1000) {
          chunks.push(ids.slice(i, i + 1000));
        }
        for (const chunk of chunks) {
          const response = await fetch(
            `${GMAIL_API_BASE}/messages/batchDelete`,
            {
              method: "POST",
              headers: authHeaders(),
              body: JSON.stringify({ ids: chunk }),
            },
          );
          if (!response.ok) {
            setError(handleApiError(response));
            return false;
          }
        }
        setMessages((prev) => prev.filter((msg) => !ids.includes(msg.id)));
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to batch delete");
        return false;
      }
    },
    [googleAccessToken, authHeaders, handleApiError],
  );

  const batchArchive = useCallback(
    (ids: string[]) => batchModifyMessages(ids, [], ["INBOX"]),
    [batchModifyMessages],
  );

  const batchMarkAsRead = useCallback(
    (ids: string[]) => batchModifyMessages(ids, [], ["UNREAD"]),
    [batchModifyMessages],
  );

  const batchMarkAsUnread = useCallback(
    (ids: string[]) => batchModifyMessages(ids, ["UNREAD"], []),
    [batchModifyMessages],
  );

  const batchTrash = useCallback(
    async (ids: string[]): Promise<boolean> => {
      if (!googleAccessToken || ids.length === 0) return false;
      try {
        // Gmail API has a 1000-item limit per batch request
        const chunks: string[][] = [];
        for (let i = 0; i < ids.length; i += 1000) {
          chunks.push(ids.slice(i, i + 1000));
        }
        for (const chunk of chunks) {
          const response = await fetch(
            `${GMAIL_API_BASE}/messages/batchModify`,
            {
              method: "POST",
              headers: authHeaders(),
              body: JSON.stringify({
                ids: chunk,
                addLabelIds: ["TRASH"],
                removeLabelIds: ["INBOX"],
              }),
            },
          );
          if (!response.ok) {
            setError(handleApiError(response));
            return false;
          }
        }
        setMessages((prev) => prev.filter((msg) => !ids.includes(msg.id)));
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to batch trash");
        return false;
      }
    },
    [googleAccessToken, authHeaders, handleApiError],
  );

  // ===== Attachment Preview =====

  const getAttachmentBlobUrl = useCallback(
    async (
      messageId: string,
      attachmentId: string,
      mimeType: string,
    ): Promise<string | null> => {
      if (!googleAccessToken) return null;
      try {
        const response = await fetch(
          `${GMAIL_API_BASE}/messages/${messageId}/attachments/${attachmentId}`,
          { headers: authHeaders() },
        );
        if (!response.ok) {
          setError(handleApiError(response));
          return null;
        }
        const data = await response.json();
        if (!data.data) return null;
        const base64 = data.data.replace(/-/g, "+").replace(/_/g, "/");
        const binaryString = atob(base64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: mimeType });
        return URL.createObjectURL(blob);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to load attachment",
        );
        return null;
      }
    },
    [googleAccessToken, authHeaders, handleApiError],
  );

  // ===== Signature Settings =====

  const fetchSendAsSettings = useCallback(async (): Promise<GmailSendAs[]> => {
    if (!googleAccessToken) return [];
    try {
      const response = await fetch(`${GMAIL_API_BASE}/settings/sendAs`, {
        headers: authHeaders(),
      });
      if (!response.ok) {
        setError(handleApiError(response));
        return [];
      }
      const data = await response.json();
      return (data.sendAs || []).map(
        (s: {
          sendAsEmail: string;
          displayName: string;
          signature: string;
          isPrimary: boolean;
        }) => ({
          sendAsEmail: s.sendAsEmail,
          displayName: s.displayName || "",
          signature: s.signature || "",
          isPrimary: !!s.isPrimary,
        }),
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to fetch send-as settings",
      );
      return [];
    }
  }, [googleAccessToken, authHeaders, handleApiError]);

  const updateSignature = useCallback(
    async (sendAsEmail: string, signature: string): Promise<boolean> => {
      if (!googleAccessToken) return false;
      try {
        const response = await fetch(
          `${GMAIL_API_BASE}/settings/sendAs/${encodeURIComponent(sendAsEmail)}`,
          {
            method: "PATCH",
            headers: authHeaders(),
            body: JSON.stringify({ signature }),
          },
        );
        if (!response.ok) {
          setError(handleApiError(response));
          return false;
        }
        return true;
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to update signature",
        );
        return false;
      }
    },
    [googleAccessToken, authHeaders, handleApiError],
  );

  // ===== Vacation Responder =====

  const fetchVacationSettings =
    useCallback(async (): Promise<GmailVacationSettings | null> => {
      if (!googleAccessToken) return null;
      try {
        const response = await fetch(`${GMAIL_API_BASE}/settings/vacation`, {
          headers: authHeaders(),
        });
        if (!response.ok) {
          setError(handleApiError(response));
          return null;
        }
        const data = await response.json();
        return {
          enableAutoReply: !!data.enableAutoReply,
          responseSubject: data.responseSubject || "",
          responseBodyPlainText: data.responseBodyPlainText || "",
          restrictToContacts: !!data.restrictToContacts,
          restrictToDomain: !!data.restrictToDomain,
          startTime: data.startTime ? String(data.startTime) : undefined,
          endTime: data.endTime ? String(data.endTime) : undefined,
        };
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Failed to fetch vacation settings",
        );
        return null;
      }
    }, [googleAccessToken, authHeaders, handleApiError]);

  const updateVacationSettings = useCallback(
    async (settings: GmailVacationSettings): Promise<boolean> => {
      if (!googleAccessToken) return false;
      try {
        const response = await fetch(`${GMAIL_API_BASE}/settings/vacation`, {
          method: "PUT",
          headers: authHeaders(),
          body: JSON.stringify(settings),
        });
        if (!response.ok) {
          setError(handleApiError(response));
          return false;
        }
        return true;
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Failed to update vacation settings",
        );
        return false;
      }
    },
    [googleAccessToken, authHeaders, handleApiError],
  );

  return {
    messages,
    labels,
    selectedMessage,
    setSelectedMessage,
    isLoading,
    isSending,
    error,
    nextPageToken,
    totalEstimate,
    isConnected: hasGoogleCalendarAccess && !!googleAccessToken,
    fetchLabels,
    fetchMessages,
    fetchMessageDetail,
    sendMessage,
    modifyMessage,
    trashMessage,
    untrashMessage,
    deleteMessage,
    downloadAttachment,
    markAsRead,
    markAsUnread,
    toggleStar,
    archiveMessage,
    loadMore,
    // Thread functions
    threads,
    selectedThread,
    setSelectedThread,
    threadNextPageToken,
    fetchThreads,
    fetchThreadDetail,
    loadMoreThreads,
    // Draft functions
    drafts,
    fetchDrafts,
    createDraft,
    updateDraft,
    deleteDraft,
    sendDraft,
    // Label CRUD
    createLabel,
    updateLabel,
    deleteLabel,
    // Batch operations
    selectedBatchIds,
    setSelectedBatchIds,
    batchModifyMessages,
    batchDeleteMessages,
    batchArchive,
    batchMarkAsRead,
    batchMarkAsUnread,
    batchTrash,
    // Attachment preview
    getAttachmentBlobUrl,
    // Settings
    fetchSendAsSettings,
    updateSignature,
    fetchVacationSettings,
    updateVacationSettings,
  };
};
