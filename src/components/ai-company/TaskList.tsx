import {
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import {
  ChevronDown,
  ChevronRight,
  Trash2,
  RotateCcw,
  X,
  FileText,
  Loader2,
  MessageCircle,
  Send,
} from "lucide-react";
import { AGENT_MAP, GROUP_LABELS } from "../../lib/ai-company/agents";
import type { OrchestrationRecord } from "../../lib/ai-company/supabaseHistory";
import {
  loadOrchestrationHistory,
  deleteOrchestration,
  loadArtifactsByOrchestration,
  saveFollowUpMessage,
  loadFollowUpMessages,
} from "../../lib/ai-company/supabaseHistory";
import { useAiCompanyUrl } from "../../hooks/useAiCompany";

interface TaskListProps {
  userId: string | null;
  onRestore: (record: OrchestrationRecord) => void;
}

const SKIP_LINES = new Set([
  "[DEV MODE] 開発ツール使用可能",
  "[TASK MODE] ツール使用可能",
  "[完了]",
  "─── タスク完了 ───",
]);

/** システム行・入力行・エラー行を除去して出力のみ返す */
function extractOutput(lines: string[]): string {
  return lines
    .flatMap((l) => l.split("\n"))
    .filter(
      (l) =>
        !l.startsWith("$") && !l.startsWith("ERROR:") && !SKIP_LINES.has(l),
    )
    .join("\n")
    .trim();
}

/** タスクが接続エラーで失敗したかどうか判定 */
function isFailedTask(record: OrchestrationRecord): boolean {
  return record.result.every((r) =>
    r.lines.every(
      (l) =>
        l.startsWith("ERROR:") ||
        l.startsWith("$") ||
        SKIP_LINES.has(l) ||
        !l.trim(),
    ),
  );
}

/**
 * 改行なしの生テキストを正しいMarkdown行に分解する。
 * Relay→Claude Code の出力は改行が省略された1行テキストになるため、
 * ブロック要素（見出し・表・HR・コードフェンス）の前後に改行を挿入する。
 */
function normalizeToMarkdown(raw: string): string {
  return (
    raw
      // コードフェンス除去（他のmarkdownと混在すると描画が壊れる）
      .replace(/```[\w]*/g, "")
      // テーブル行の境界を分割（|| → |\n|）
      .replace(/\|\|/g, "|\n|")
      // テーブル末尾 |--- を分離（直後がテキストの場合のみ）
      .replace(/\|(---+)(?=[^|\-\n\s])/g, "|\n$1")
      // 独立した --- を分離（テーブル区切り |---| 内は除外）
      .replace(/([^\n|\-])(---+)/g, "$1\n$2")
      .replace(/(---+)([^|\-\n])/g, "$1\n$2")
      // 見出しの前に改行（テーブルセル内 | # | は除外）
      .replace(/(?<!\| )(#{1,6} )/g, "\n\n$1")
      // 見出し直後のテーブル開始を分離
      .replace(/(#{1,6}\s+[^|\n]+)\|/g, "$1\n|")
      // テキスト（太字末尾など）直後のテーブル開始を分離
      .replace(/(\*{1,2})\|(\s)/g, "$1\n|$2")
      // ✅ 行の前に改行（テーブルセル内は除外: | 直後のスペースを除外）
      .replace(/([^\n| ])(✅)/g, "$1\n$2")
      // 箇条書きの前に改行（テーブルセル内は除外）
      .replace(/([^\n\-|])(- )/g, "$1\n$2")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}

/** エージェントヘッダー（「Name > ...」「PM Name > ...」）を除去 */
function stripAgentHeader(text: string): string {
  return text.replace(/^[^\n]*?\s*>\s*/, "").trim();
}

/** Agent出力を整形済みMarkdownに変換 */
function formatAgentOutput(raw: string): string {
  return stripAgentHeader(normalizeToMarkdown(raw));
}

const NOISE_HEADING = /^#{1,4}\s*(ファイル生成確認|ビルド確認|ビルドチェック)/;

/** PMの出力から要点を抽出（技術検証セクションを除去） */
function cleanSummary(raw: string): string {
  const text = formatAgentOutput(raw);

  const allLines = text.split("\n");
  const result: string[] = [];
  let skipping = false;

  for (const line of allLines) {
    const t = line.trim();

    if (/^#{1,4}\s/.test(t)) {
      skipping = NOISE_HEADING.test(t);
      if (skipping) continue;
    }

    if (/^-{3,}$/.test(t) && skipping) {
      skipping = false;
      continue;
    }

    if (skipping) continue;

    // ファイルパス確認行
    if (/^✅\s*(src\/|\.\/)/.test(t)) continue;
    // シェルコマンド行
    if (/^\$\s/.test(t)) continue;
    if (/^→\s*エラーなし/.test(t)) continue;

    result.push(line);
  }

  return result
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** 折りたたみ時プレビュー：結論行を抽出 */
function extractPreview(cleanedMd: string): string {
  const lines = cleanedMd
    .split("\n")
    .map((l) => l.trim())
    .filter(
      (l) =>
        l &&
        !l.startsWith("#") &&
        !l.startsWith("|") &&
        !/^-{3,}$/.test(l) &&
        !l.startsWith("**トリガー"),
    );
  return lines[lines.length - 1] ?? cleanedMd.slice(0, 120);
}

/** ファイルパスパターン（press-releases/ or notices/） */
const ARTIFACT_PATH_RE = /^(press-releases|notices)\/[\w._-]+\.[\w]+$/;

/** テキスト中のファイルパスを全件抽出 */
const ARTIFACT_PATH_GLOBAL_RE = /(press-releases|notices)\/[\w._-]+\.[\w]+/g;

function extractArtifactPaths(record: OrchestrationRecord): string[] {
  const paths = new Set<string>();
  for (const r of record.result) {
    const text = r.lines.join("\n") + (r.content ?? "");
    for (const m of text.matchAll(ARTIFACT_PATH_GLOBAL_RE)) {
      paths.add(m[0]);
    }
  }
  return [...paths];
}

/** 成果物テキストを要約用に先頭部分を抽出（最大30行 or 1500文字） */
function summarizeArtifact(content: string): string {
  const lines = content.split("\n");
  // ヘッダー部分（===や---で区切られたタイトル等）をスキップして本文を抽出
  let bodyStart = 0;
  for (let i = 0; i < Math.min(lines.length, 5); i++) {
    if (/^[=─━-]{3,}$/.test(lines[i].trim())) {
      bodyStart = i + 1;
    }
  }
  const body = lines.slice(bodyStart);
  const trimmed = body.slice(0, 30).join("\n");
  return trimmed.length > 1500 ? trimmed.slice(0, 1500) + "..." : trimmed;
}

/** Markdownコンテンツのレンダリング */
function Md({
  children,
  className,
  components,
}: {
  children: string;
  className?: string;
  components?: Components;
}) {
  return (
    <div
      className={`prose prose-sm max-w-none prose-slate
        prose-headings:text-slate-800 prose-headings:font-semibold prose-headings:mt-3 prose-headings:mb-1.5
        prose-h1:text-base prose-h2:text-[13px] prose-h3:text-xs
        prose-p:text-xs prose-p:leading-relaxed prose-p:my-1
        prose-li:text-xs prose-li:my-0
        prose-ul:my-1 prose-ol:my-1
        prose-strong:text-slate-800
        prose-code:text-[11px] prose-code:bg-slate-100 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-slate-700
        prose-pre:bg-slate-900 prose-pre:text-slate-300 prose-pre:text-[11px] prose-pre:rounded-lg prose-pre:my-2
        prose-table:text-[11px] prose-th:px-2 prose-th:py-1 prose-td:px-2 prose-td:py-1
        prose-a:text-emerald-600 prose-a:no-underline hover:prose-a:underline
        prose-hr:my-2
        [overflow-wrap:anywhere]
        ${className ?? ""}`}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        components={components}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

/** 成果物ファイルビューアモーダル */
function ArtifactViewer({
  path,
  onClose,
  authFetch,
}: {
  path: string;
  onClose: () => void;
  authFetch: (path: string, init?: RequestInit) => Promise<Response>;
}) {
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await authFetch(`/artifacts/${path}`);
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          throw new Error(
            (data as { error?: string } | null)?.error ?? `HTTP ${res.status}`,
          );
        }
        const data = (await res.json()) as { content: string };
        if (!cancelled) setContent(data.content);
      } catch (e) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [path, authFetch]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center px-4"
      style={{
        paddingTop: "calc(env(safe-area-inset-top, 0px) + 88px)",
        paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 84px)",
      }}
    >
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative w-full sm:max-w-2xl max-h-full sm:max-h-[80vh] flex flex-col rounded-2xl overflow-hidden neu-modal">
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-200/80">
          <FileText size={14} className="text-emerald-600 shrink-0" />
          <span className="text-xs font-mono font-medium neu-text-primary truncate flex-1">
            {path}
          </span>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center neu-text-muted hover:neu-text-primary rounded-full hover:bg-slate-100 transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4 neu-bg">
          {loading && (
            <div className="flex items-center justify-center gap-2 py-8 neu-text-secondary">
              <Loader2 size={16} className="animate-spin" />
              <span className="text-sm">読み込み中...</span>
            </div>
          )}
          {error && (
            <div className="text-center py-8 text-red-500 text-sm">{error}</div>
          )}
          {content !== null && (
            <pre className="text-xs leading-relaxed whitespace-pre-wrap break-words neu-text-primary font-mono">
              {content}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}

/** 展開時に成果物をSupabaseから取得して要約表示（fallback: relay） */
function ArtifactSummaries({
  orchestrationId,
  paths,
  userId,
  authFetch,
  onViewFull,
}: {
  orchestrationId: string;
  paths: string[];
  userId: string;
  authFetch: (path: string, init?: RequestInit) => Promise<Response>;
  onViewFull: (path: string) => void;
}) {
  const [artifacts, setArtifacts] = useState<
    { path: string; content: string }[]
  >([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      // Try Supabase first
      const dbArtifacts = await loadArtifactsByOrchestration(
        userId,
        orchestrationId,
      );
      if (!cancelled && dbArtifacts.length > 0) {
        setArtifacts(
          dbArtifacts.map((a) => ({ path: a.path, content: a.content })),
        );
        setLoaded(true);
        return;
      }

      // Fallback: relay filesystem
      if (paths.length === 0) {
        setLoaded(true);
        return;
      }
      const results = await Promise.all(
        paths.map(async (p) => {
          try {
            const res = await authFetch(`/artifacts/${p}`);
            if (!res.ok) return null;
            const data = (await res.json()) as { content: string };
            return { path: p, content: data.content };
          } catch {
            return null;
          }
        }),
      );
      if (!cancelled) {
        setArtifacts(
          results.filter((r): r is { path: string; content: string } => !!r),
        );
        setLoaded(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [orchestrationId, paths, userId, authFetch]);

  if (!loaded || artifacts.length === 0) return null;

  return (
    <div className="px-4 py-3 bg-blue-50/30 border-b border-blue-100/50">
      <p className="text-[10px] font-semibold text-blue-700 uppercase tracking-wider mb-2">
        Artifacts Summary
      </p>
      <div className="space-y-3">
        {artifacts.map(({ path, content }) => {
          const summary = content ? summarizeArtifact(content) : "";
          const filename = path.split("/").pop() ?? path;
          return (
            <div
              key={path}
              className="rounded-lg border border-blue-200/60 bg-white/80 overflow-hidden"
            >
              <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50/60 border-b border-blue-100/40">
                <FileText size={12} className="text-blue-500 shrink-0" />
                <button
                  onClick={() => onViewFull(path)}
                  className="text-[11px] font-mono font-medium text-blue-700 hover:underline truncate"
                  title="クリックして全文表示"
                >
                  {filename}
                </button>
              </div>
              {summary && (
                <pre className="px-3 py-2 text-[11px] leading-relaxed whitespace-pre-wrap break-words neu-text-secondary font-mono max-h-40 overflow-y-auto">
                  {summary}
                </pre>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface RunningTask {
  id: string;
  task: string;
  status: "queued" | "running" | "completed";
  createdAt: number;
}

interface FollowUpMessage {
  id: string;
  role: "user" | "agent";
  content: string;
  timestamp: number;
}

/** チャット形式のフォローアップUI */
function FollowUpChat({
  record,
  messages,
  input,
  isLoading,
  onInputChange,
  onSend,
}: {
  record: OrchestrationRecord;
  messages: FollowUpMessage[];
  input: string;
  isLoading: boolean;
  onInputChange: (v: string) => void;
  onSend: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const pmAgent = AGENT_MAP.get("pm");
  const pmColor = pmAgent?.appearance.accentColor ?? "#10b981";
  const pmName = pmAgent?.name ?? "PM";

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  // Focus input after response
  useEffect(() => {
    if (!isLoading) inputRef.current?.focus();
  }, [isLoading]);

  const hasMessages = messages.length > 0;

  return (
    <div className="border-t border-slate-200/80">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5 bg-sky-50/40 border-b border-sky-100/60">
        <MessageCircle size={13} className="text-sky-500" />
        <p className="text-[11px] font-semibold text-sky-700">フォローアップ</p>
        <span className="text-[10px] neu-text-muted">
          — {pmName}に追加で質問できます
        </span>
      </div>

      {/* Chat area */}
      {hasMessages && (
        <div
          ref={scrollRef}
          className="px-4 py-3 space-y-3 max-h-72 overflow-y-auto neu-bg"
        >
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              {msg.role === "agent" && (
                <span
                  className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0 mt-0.5"
                  style={{ backgroundColor: pmColor }}
                >
                  {pmName.charAt(0)}
                </span>
              )}
              <div
                className={`max-w-[80%] px-3 py-2 rounded-2xl text-xs leading-relaxed ${
                  msg.role === "user"
                    ? "bg-sky-600 text-white rounded-br-sm"
                    : "bg-white border border-slate-200 neu-text-primary rounded-bl-sm shadow-sm"
                }`}
              >
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
            <div className="flex gap-2 justify-start">
              <span
                className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0 mt-0.5"
                style={{ backgroundColor: pmColor }}
              >
                {pmName.charAt(0)}
              </span>
              <div className="px-3 py-2 rounded-2xl bg-white border border-slate-200 rounded-bl-sm shadow-sm">
                <div className="flex gap-1.5 items-center neu-text-muted text-sm py-0.5">
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
      )}

      {/* Input */}
      <div className="flex gap-2 px-4 py-3 border-t border-slate-100">
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) onSend();
          }}
          placeholder={
            hasMessages
              ? "続けて質問..."
              : `「${record.task.slice(0, 20)}」について質問...`
          }
          disabled={isLoading}
          className="flex-1 px-3 py-2 neu-input rounded-xl text-xs disabled:opacity-50"
        />
        <button
          onClick={onSend}
          disabled={isLoading || !input.trim()}
          className="px-3 py-2 rounded-xl text-xs bg-sky-600 text-white hover:bg-sky-500 active:scale-95 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
        >
          {isLoading ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Send size={14} />
          )}
        </button>
      </div>
    </div>
  );
}

export function TaskList({ userId, onRestore }: TaskListProps) {
  const [records, setRecords] = useState<OrchestrationRecord[]>([]);
  const [runningTasks, setRunningTasks] = useState<RunningTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedAgents, setExpandedAgents] = useState<Set<string>>(new Set());
  const [viewingArtifact, setViewingArtifact] = useState<string | null>(null);
  const [followUpInput, setFollowUpInput] = useState<Record<string, string>>(
    {},
  );
  const [followUpMessages, setFollowUpMessages] = useState<
    Record<string, FollowUpMessage[]>
  >({});
  const [followUpLoading, setFollowUpLoading] = useState<
    Record<string, boolean>
  >({});
  const { authFetch } = useAiCompanyUrl();

  // Poll relay queue for running tasks
  useEffect(() => {
    let cancelled = false;
    let prevRunning = 0;

    const poll = async () => {
      try {
        const res = await authFetch("/queue");
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as {
          queue: RunningTask[];
          isProcessing: boolean;
        };
        const active = data.queue.filter(
          (t) => t.status === "queued" || t.status === "running",
        );
        setRunningTasks(active);

        // If tasks just finished, refresh history from DB
        if (prevRunning > 0 && active.length === 0) {
          fetchRecords();
        }
        prevRunning = active.length;
      } catch {
        // Relay unreachable
      }
    };

    poll();
    const interval = setInterval(poll, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [authFetch]); // eslint-disable-line react-hooks/exhaustive-deps

  /** インラインcodeにファイルパスがあればクリック可能にするカスタムレンダラ */
  const mdComponents: Components = {
    code: ({
      children,
      className,
    }: {
      children?: ReactNode;
      className?: string;
    }) => {
      if (className) {
        return <code className={className}>{children}</code>;
      }
      const text = String(children).trim();
      if (ARTIFACT_PATH_RE.test(text)) {
        return (
          <code
            className="cursor-pointer !text-emerald-700 !bg-emerald-50 border border-emerald-200 hover:!bg-emerald-100 transition-colors"
            onClick={() => setViewingArtifact(text)}
            title="クリックして中身を表示"
          >
            {children}
          </code>
        );
      }
      return <code>{children}</code>;
    },
  };

  const fetchRecords = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const data = await loadOrchestrationHistory(userId, 50);
      setRecords(data);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  const handleDelete = async (id: string) => {
    if (!userId) return;
    await deleteOrchestration(userId, id);
    setRecords((prev) => prev.filter((r) => r.id !== id));
  };

  // Load follow-up messages from Supabase when expanding a record
  const handleExpand = useCallback(
    async (id: string) => {
      const next = expandedId === id ? null : id;
      setExpandedId(next);
      if (next && userId && !followUpMessages[next]?.length) {
        const msgs = await loadFollowUpMessages(userId, next);
        if (msgs.length > 0) {
          setFollowUpMessages((prev) => ({
            ...prev,
            [next]: msgs.map((m) => ({
              id: m.id,
              role:
                m.fromAgentId === "user"
                  ? ("user" as const)
                  : ("agent" as const),
              content: m.content,
              timestamp: m.createdAt,
            })),
          }));
        }
      }
    },
    [expandedId, userId, followUpMessages],
  );

  const toggleAgent = (key: string) => {
    setExpandedAgents((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  /** タスク結果にフォローアップ質問を送信 */
  const sendFollowUp = useCallback(
    async (record: OrchestrationRecord) => {
      const text = (followUpInput[record.id] ?? "").trim();
      if (!text) return;

      // Build task context: original result + conversation so far
      const resultContext = [
        `タスク: ${record.task}`,
        ...record.result.map((r) => {
          const name = AGENT_MAP.get(r.agentId)?.name ?? r.agentId;
          const output = extractOutput(r.lines);
          return output ? `【${name}】${output.slice(0, 500)}` : "";
        }),
      ]
        .filter(Boolean)
        .join("\n\n")
        .slice(0, 2000);

      const prevMessages = followUpMessages[record.id] ?? [];
      const conversationContext = prevMessages
        .map((m) => `[${m.role === "user" ? "ユーザー" : "PM"}] ${m.content}`)
        .join("\n");

      const taskContext = conversationContext
        ? `${resultContext}\n\n## フォローアップ会話履歴\n${conversationContext}`
        : resultContext;

      const userMsg: FollowUpMessage = {
        id: `user-${Date.now()}`,
        role: "user",
        content: text,
        timestamp: Date.now(),
      };
      setFollowUpMessages((prev) => ({
        ...prev,
        [record.id]: [...(prev[record.id] ?? []), userMsg],
      }));
      setFollowUpInput((prev) => ({ ...prev, [record.id]: "" }));
      setFollowUpLoading((prev) => ({ ...prev, [record.id]: true }));

      // Save user message to Supabase
      if (userId) {
        saveFollowUpMessage(userId, record.id, "user", text).catch(() => {});
      }

      try {
        const res = await authFetch("/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            agentId: "pm",
            message: text,
            taskContext,
          }),
        });
        const data = (await res.json()) as {
          content?: string;
          error?: string;
          timestamp?: number;
        };
        const replyContent = data.error
          ? `[ERROR] ${data.error}`
          : (data.content ?? "");
        const agentMsg: FollowUpMessage = {
          id: `agent-${Date.now()}`,
          role: "agent",
          content: replyContent,
          timestamp: data.timestamp ?? Date.now(),
        };
        setFollowUpMessages((prev) => ({
          ...prev,
          [record.id]: [...(prev[record.id] ?? []), agentMsg],
        }));

        // Save agent response to Supabase
        if (userId && !data.error) {
          saveFollowUpMessage(userId, record.id, "agent", replyContent).catch(
            () => {},
          );
        }
      } catch {
        setFollowUpMessages((prev) => ({
          ...prev,
          [record.id]: [
            ...(prev[record.id] ?? []),
            {
              id: `err-${Date.now()}`,
              role: "agent" as const,
              content: "[ERROR] 通信に失敗しました",
              timestamp: Date.now(),
            },
          ],
        }));
      } finally {
        setFollowUpLoading((prev) => ({ ...prev, [record.id]: false }));
      }
    },
    [followUpInput, followUpMessages, authFetch],
  );

  /** PMの最終まとめを要点抽出 */
  const getSummary = (record: OrchestrationRecord): string | null => {
    const pmResults = record.result.filter((r) => r.agentId === "pm");
    if (pmResults.length === 0) return null;
    const lastPm = pmResults[pmResults.length - 1];
    const raw = extractOutput(lastPm.lines);
    if (!raw) return null;
    return cleanSummary(raw) || null;
  };

  if (!userId) {
    return (
      <div className="text-center py-16 neu-text-muted text-sm">
        ログインするとタスク履歴を確認できます
      </div>
    );
  }

  if (loading) {
    return (
      <div className="text-center py-16 neu-text-muted text-sm">
        読み込み中...
      </div>
    );
  }

  if (records.length === 0 && runningTasks.length === 0) {
    return (
      <div className="text-center py-16 neu-text-muted text-sm">
        タスク履歴がありません
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Running / Queued tasks */}
      {runningTasks.map((rt) => (
        <div
          key={rt.id}
          className="neu-card overflow-hidden border-l-4 border-l-emerald-400"
        >
          <div className="flex items-center gap-3 p-4">
            <Loader2
              size={16}
              className="text-emerald-500 animate-spin flex-shrink-0"
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold neu-text-primary leading-snug break-all">
                {rt.task}
              </p>
              <div className="flex items-center gap-2 mt-1.5">
                <span className="text-[10px] neu-text-muted tabular-nums">
                  {new Date(rt.createdAt).toLocaleString("ja-JP")}
                </span>
                <span
                  className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${
                    rt.status === "running"
                      ? "bg-emerald-50 text-emerald-600 border border-emerald-200"
                      : "bg-amber-50 text-amber-600 border border-amber-200"
                  }`}
                >
                  {rt.status === "running" ? "実行中" : "待機中"}
                </span>
              </div>
            </div>
          </div>
        </div>
      ))}

      {records.map((record) => {
        const isExpanded = expandedId === record.id;
        const failed = isFailedTask(record);
        const summary = failed ? null : getSummary(record);
        const participants = record.result
          .map((r) => ({
            agentId: r.agentId,
            agent: AGENT_MAP.get(r.agentId),
          }))
          .filter(
            (v, i, a) => a.findIndex((x) => x.agentId === v.agentId) === i,
          );

        return (
          <div key={record.id} className="neu-card overflow-hidden">
            {/* ── Header ── */}
            <div
              className="flex items-start gap-3 p-4 cursor-pointer select-none hover:bg-slate-50/60 transition-colors"
              onClick={() => handleExpand(record.id)}
            >
              <div className="flex-shrink-0 mt-1 neu-text-muted">
                {isExpanded ? (
                  <ChevronDown size={14} />
                ) : (
                  <ChevronRight size={14} />
                )}
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold neu-text-primary leading-snug break-all">
                  {record.task}
                </p>

                <div className="flex items-center gap-2 flex-wrap mt-1.5">
                  <span className="text-[10px] neu-text-muted tabular-nums">
                    {new Date(record.createdAt).toLocaleString("ja-JP")}
                  </span>
                  {record.targetGroup && (
                    <span className="text-[9px] px-1.5 py-0.5 bg-emerald-50 text-emerald-600 border border-emerald-200 rounded font-medium">
                      {GROUP_LABELS[record.targetGroup] ?? record.targetGroup}
                    </span>
                  )}
                  {failed && (
                    <span className="text-[9px] px-1.5 py-0.5 bg-red-50 text-red-500 border border-red-200 rounded font-medium">
                      接続エラー
                    </span>
                  )}
                </div>

                {/* 折りたたみ時プレビュー */}
                {!isExpanded && summary && (
                  <p className="text-[11px] neu-text-secondary line-clamp-2 leading-relaxed mt-2 break-words">
                    {extractPreview(summary)}
                  </p>
                )}

                {/* 参加者アイコン */}
                {!isExpanded && (
                  <div className="flex items-center gap-1 mt-2">
                    {participants.slice(0, 6).map(({ agentId, agent }) => (
                      <span
                        key={agentId}
                        className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold text-white"
                        style={{
                          backgroundColor:
                            agent?.appearance.accentColor ?? "#94a3b8",
                        }}
                        title={agent?.name ?? agentId}
                      >
                        {(agent?.name ?? agentId).charAt(0)}
                      </span>
                    ))}
                    {participants.length > 6 && (
                      <span className="text-[9px] neu-text-muted ml-0.5">
                        +{participants.length - 6}
                      </span>
                    )}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRestore(record);
                  }}
                  className="p-1.5 neu-text-muted hover:text-emerald-600 rounded-md hover:bg-emerald-50 transition-colors"
                  title="Dashboardに復元"
                >
                  <RotateCcw size={13} />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(record.id);
                  }}
                  className="p-1.5 neu-text-muted hover:text-red-500 rounded-md hover:bg-red-50 transition-colors"
                  title="削除"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>

            {/* ── Expanded ── */}
            {isExpanded && (
              <div className="border-t border-slate-200/80">
                {/* PM まとめ */}
                {summary && (
                  <div className="px-4 py-3 bg-emerald-50/40 border-b border-emerald-100/60">
                    <p className="text-[10px] font-semibold text-emerald-700 uppercase tracking-wider mb-2">
                      Result
                    </p>
                    <div className="max-h-80 overflow-y-auto">
                      <Md components={mdComponents}>{summary}</Md>
                    </div>
                  </div>
                )}

                {/* 成果物サマリー */}
                <ArtifactSummaries
                  orchestrationId={record.id}
                  paths={extractArtifactPaths(record)}
                  userId={userId!}
                  authFetch={authFetch}
                  onViewFull={setViewingArtifact}
                />

                {/* エージェント別結果 */}
                <div>
                  <div className="px-4 py-2 bg-slate-50/60 border-b border-slate-100">
                    <p className="text-[10px] font-semibold neu-text-muted uppercase tracking-wider">
                      Agent Details
                    </p>
                  </div>

                  <div className="divide-y divide-slate-100/80">
                    {record.result.map((r, idx) => {
                      const agent = AGENT_MAP.get(r.agentId);
                      const agentKey = `${record.id}-${r.agentId}-${idx}`;
                      const isAgentOpen = expandedAgents.has(agentKey);
                      const raw = extractOutput(r.lines);
                      if (!raw) return null;
                      const formatted = formatAgentOutput(raw);
                      if (!formatted) return null;

                      const isPmSummary =
                        r.agentId === "pm" && idx === record.result.length - 1;

                      return (
                        <div key={agentKey}>
                          <div
                            className="flex items-center gap-2.5 px-4 py-2.5 cursor-pointer hover:bg-slate-50/60 transition-colors"
                            onClick={() => toggleAgent(agentKey)}
                          >
                            <span className="neu-text-muted flex-shrink-0">
                              {isAgentOpen ? (
                                <ChevronDown size={11} />
                              ) : (
                                <ChevronRight size={11} />
                              )}
                            </span>
                            <span
                              className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0"
                              style={{
                                backgroundColor:
                                  agent?.appearance.accentColor ?? "#94a3b8",
                              }}
                            >
                              {(agent?.name ?? r.agentId).charAt(0)}
                            </span>
                            <span className="text-[11px] font-medium neu-text-primary">
                              {agent?.name ?? r.agentId}
                            </span>
                            <span className="text-[10px] neu-text-muted hidden sm:inline">
                              {agent?.role ?? ""}
                            </span>
                            {isPmSummary && (
                              <span className="text-[8px] px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded-full font-medium ml-auto">
                                まとめ
                              </span>
                            )}
                          </div>

                          {isAgentOpen && (
                            <div className="px-4 pb-3 pl-12">
                              <div className="max-h-96 overflow-y-auto rounded-lg border border-slate-200 p-3 bg-white">
                                <Md components={mdComponents}>{formatted}</Md>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Follow-up chat */}
                <FollowUpChat
                  record={record}
                  messages={followUpMessages[record.id] ?? []}
                  input={followUpInput[record.id] ?? ""}
                  isLoading={followUpLoading[record.id] ?? false}
                  onInputChange={(v) =>
                    setFollowUpInput((prev) => ({
                      ...prev,
                      [record.id]: v,
                    }))
                  }
                  onSend={() => sendFollowUp(record)}
                />
              </div>
            )}
          </div>
        );
      })}

      {/* Artifact file viewer modal */}
      {viewingArtifact && (
        <ArtifactViewer
          path={viewingArtifact}
          onClose={() => setViewingArtifact(null)}
          authFetch={authFetch}
        />
      )}
    </div>
  );
}
