import { useState, useEffect, useCallback, useRef } from "react";
import type { Platform, PostData } from "../../lib/ai-company/types";
import {
  savePosts,
  loadPosts,
  deletePost as deletePostFromDb,
  savePressReleases,
} from "../../lib/ai-company/supabaseHistory";
import type { PressReleaseData } from "../../lib/ai-company/supabaseHistory";

type AuthFetch = (path: string, init?: RequestInit) => Promise<Response>;

interface PostBoardProps {
  authFetch: AuthFetch;
  userId: string | null;
}

const PLATFORM_CONFIG: Record<
  Platform,
  { label: string; color: string; icon: string; bgClass: string }
> = {
  x: {
    label: "X (Twitter)",
    color: "#1d9bf0",
    icon: "𝕏",
    bgClass: "bg-blue-50 border-blue-200",
  },
  note: {
    label: "Note",
    color: "#41c9b4",
    icon: "N",
    bgClass: "bg-teal-50 border-teal-200",
  },
  general: {
    label: "汎用",
    color: "#a78bfa",
    icon: "G",
    bgClass: "bg-purple-50 border-purple-200",
  },
};

export function PostBoard({ authFetch, userId }: PostBoardProps) {
  const [posts, setPosts] = useState<PostData[]>([]);
  const [topic, setTopic] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const savedIdsRef = useRef<Set<string>>(new Set());
  const savedPrIdsRef = useRef<Set<string>>(new Set());

  // Persist ready posts to Supabase (deduped by savedIdsRef)
  const persistReady = useCallback(
    (list: PostData[]) => {
      if (!userId) return;
      const unsaved = list.filter(
        (p) => p.status === "ready" && !savedIdsRef.current.has(p.id),
      );
      if (unsaved.length === 0) return;
      for (const p of unsaved) savedIdsRef.current.add(p.id);
      savePosts(userId, unsaved).catch((e) =>
        console.error("[ai-company] savePosts failed:", e),
      );
    },
    [userId],
  );

  // Sync press releases from relay to Supabase (background, no UI)
  const syncPressReleases = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await authFetch("/press-releases");
      const data = await res.json();
      const prs: PressReleaseData[] = (
        (data.pressReleases ?? []) as Array<{
          id: string;
          topic: string;
          company: string;
          keyPoints?: string[];
          content: string;
          agentId: string;
          agentName: string;
          status: "generating" | "ready";
          timestamp: number;
        }>
      ).map((pr) => ({
        id: pr.id,
        topic: pr.topic,
        company: pr.company,
        keyPoints: pr.keyPoints ?? [],
        content: pr.content,
        agentId: pr.agentId,
        agentName: pr.agentName,
        status: pr.status,
        timestamp: pr.timestamp,
      }));
      const unsaved = prs.filter(
        (pr) => pr.status === "ready" && !savedPrIdsRef.current.has(pr.id),
      );
      if (unsaved.length === 0) return;
      for (const pr of unsaved) savedPrIdsRef.current.add(pr.id);
      savePressReleases(userId, unsaved).catch(console.error);
    } catch {
      // ignore
    }
  }, [authFetch, userId]);

  const fetchPosts = useCallback(async () => {
    try {
      const res = await authFetch("/posts");
      const data = await res.json();
      const relayPosts: PostData[] = data.posts ?? [];
      if (relayPosts.length === 0) return;
      setPosts((prev) => {
        const relayMap = new Map(relayPosts.map((p) => [p.id, p]));
        const supabaseOnly = prev.filter((p) => !relayMap.has(p.id));
        const merged = [...relayPosts, ...supabaseOnly];
        return merged.sort((a, b) => b.timestamp - a.timestamp);
      });
      // Save any ready relay posts to Supabase
      persistReady(relayPosts);
    } catch {
      // ignore
    }
    // Also sync press releases in background
    void syncPressReleases();
  }, [authFetch, persistReady, syncPressReleases]);

  useEffect(() => {
    const load = async () => {
      // Load persisted history from Supabase
      if (userId) {
        const dbPosts = await loadPosts(userId).catch(() => [] as PostData[]);
        if (dbPosts.length > 0) {
          // Mark already-saved IDs
          for (const p of dbPosts) savedIdsRef.current.add(p.id);
          setPosts(dbPosts);
        }
      }
      // Merge relay data on top
      await fetchPosts();
    };
    load();
  }, [fetchPosts, userId]);

  useEffect(() => {
    if (!isGenerating) return;
    const interval = setInterval(fetchPosts, 2000);
    return () => clearInterval(interval);
  }, [isGenerating, fetchPosts]);

  useEffect(() => {
    if (!isGenerating) return;
    const allReady =
      posts.length > 0 && posts.every((p) => p.status === "ready");
    if (allReady) setIsGenerating(false);
  }, [posts, isGenerating]);

  // 安全タイムアウト: 60秒後に強制解除
  useEffect(() => {
    if (!isGenerating) return;
    const timeout = setTimeout(() => setIsGenerating(false), 60_000);
    return () => clearTimeout(timeout);
  }, [isGenerating]);

  const handleGenerate = async () => {
    if (!topic.trim() || isGenerating) return;
    setIsGenerating(true);
    try {
      const res = await authFetch("/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: topic.trim() }),
      });
      const data = await res.json();
      const newPosts = data.posts ?? [];
      if (newPosts.length === 0) {
        setIsGenerating(false);
        return;
      }
      setPosts((prev) => [...newPosts, ...prev]);
      setTopic("");
    } catch {
      setIsGenerating(false);
    }
  };

  const handleCopy = async (post: PostData) => {
    await navigator.clipboard.writeText(post.content);
    setCopied(post.id);
    setTimeout(() => setCopied(null), 2000);
  };

  const handleOpenPlatform = (post: PostData) => {
    if (post.platform === "x") {
      const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(post.content)}`;
      window.open(url, "_blank");
    } else if (post.platform === "note") {
      navigator.clipboard.writeText(post.content);
      window.open("https://note.com/new", "_blank");
      setCopied(post.id);
      setTimeout(() => setCopied(null), 2000);
    }
  };

  const handleDelete = async (id: string) => {
    await authFetch("/posts", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setPosts((prev) => prev.filter((p) => p.id !== id));
    if (userId) {
      deletePostFromDb(userId, id).catch(() => {});
    }
  };

  const grouped = posts.reduce<Record<string, PostData[]>>((acc, post) => {
    const key = `${post.topic}_${Math.floor(post.timestamp / 60000)}`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(post);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div className="neu-card p-4">
        <div className="flex gap-2">
          <div className="flex-1">
            <input
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleGenerate()}
              placeholder="投稿トピックを入力..."
              disabled={isGenerating}
              className="w-full px-3 py-2.5 neu-input rounded-lg text-sm disabled:opacity-50"
            />
          </div>
          <button
            onClick={handleGenerate}
            disabled={isGenerating || !topic.trim()}
            className="
              px-4 py-2.5 bg-sky-600 text-white
              rounded-lg text-sm hover:bg-sky-700
              disabled:opacity-30 disabled:cursor-not-allowed
              transition-all active:scale-95 flex-shrink-0 shadow-sm
            "
          >
            {isGenerating ? (
              <span className="flex items-center gap-1.5">
                <svg
                  className="animate-spin h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
                生成中
              </span>
            ) : (
              "生成"
            )}
          </button>
        </div>
      </div>

      {posts.length === 0 ? (
        <div className="text-center py-16 neu-text-muted text-sm">
          トピックを入力して投稿コンテンツを生成してください
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([key, groupPosts]) => (
            <div key={key} className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium neu-text-secondary">
                  {groupPosts[0].topic}
                </span>
                <span className="text-[10px] neu-text-muted">
                  {new Date(groupPosts[0].timestamp).toLocaleString("ja-JP")}
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {groupPosts.map((post) => {
                  const config = PLATFORM_CONFIG[post.platform];
                  return (
                    <div
                      key={post.id}
                      className={`border rounded-xl p-4 space-y-3 transition-all ${config.bgClass}`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span
                            className="w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold"
                            style={{
                              backgroundColor: config.color + "20",
                              color: config.color,
                            }}
                          >
                            {config.icon}
                          </span>
                          <span
                            className="text-xs font-bold"
                            style={{ color: config.color }}
                          >
                            {config.label}
                          </span>
                        </div>
                        <button
                          onClick={() => handleDelete(post.id)}
                          className="neu-text-muted hover:text-red-500 text-xs transition-colors"
                        >
                          ×
                        </button>
                      </div>

                      <div className="min-h-[80px]">
                        {post.status === "generating" ? (
                          <div className="flex items-center gap-2 neu-text-muted text-xs">
                            <span className="animate-pulse">...</span>
                            {post.agentName}が考え中
                          </div>
                        ) : (
                          <p className="text-sm neu-text-primary whitespace-pre-wrap leading-relaxed">
                            {post.content}
                          </p>
                        )}
                      </div>

                      {post.status === "ready" && (
                        <div className="flex gap-2 pt-1">
                          <button
                            onClick={() => handleCopy(post)}
                            className="
                              flex-1 px-3 py-1.5 text-[11px]
                              neu-btn rounded-lg neu-text-secondary
                              hover:neu-text-primary transition-all
                            "
                          >
                            {copied === post.id ? "Copied!" : "コピー"}
                          </button>
                          {post.platform !== "general" && (
                            <button
                              onClick={() => handleOpenPlatform(post)}
                              className="
                                flex-1 px-3 py-1.5 text-[11px] rounded-lg
                                transition-all hover:brightness-95 shadow-sm
                              "
                              style={{
                                backgroundColor: config.color + "15",
                                color: config.color,
                                border: `1px solid ${config.color}40`,
                              }}
                            >
                              {post.platform === "x" ? "Xで投稿" : "Noteを開く"}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
