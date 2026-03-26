import { useState, useEffect, useCallback } from "react";
import { X, Trash2, Users, FileText } from "lucide-react";
import { AGENT_MAP } from "../../lib/ai-company/agents";
import type { PostData } from "../../lib/ai-company/types";
import type { OrchestrationRecord } from "../../lib/ai-company/supabaseHistory";
import {
  loadOrchestrationHistory,
  deleteOrchestration,
  loadPosts,
  deletePost,
} from "../../lib/ai-company/supabaseHistory";

export type HistoryMode = "orchestrations" | "posts";

interface HistoryModalProps {
  userId: string;
  isOpen: boolean;
  onClose: () => void;
  onRestoreOrchestration: (record: OrchestrationRecord) => void;
  mode: HistoryMode;
}

const MODE_CONFIG: Record<
  HistoryMode,
  { icon: typeof Users; label: string; emptyLabel: string }
> = {
  orchestrations: {
    icon: Users,
    label: "タスク履歴",
    emptyLabel: "タスク履歴がありません",
  },
  posts: {
    icon: FileText,
    label: "投稿履歴",
    emptyLabel: "投稿履歴がありません",
  },
};

const PLATFORM_LABELS: Record<string, { label: string; color: string }> = {
  x: { label: "X", color: "#1d9bf0" },
  note: { label: "Note", color: "#41c9b4" },
  general: { label: "汎用", color: "#a78bfa" },
};

export function HistoryModal({
  userId,
  isOpen,
  onClose,
  onRestoreOrchestration,
  mode,
}: HistoryModalProps) {
  const [orchestrations, setOrchestrations] = useState<OrchestrationRecord[]>(
    [],
  );
  const [posts, setPosts] = useState<PostData[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      if (mode === "orchestrations") {
        setOrchestrations(await loadOrchestrationHistory(userId));
      } else {
        setPosts(await loadPosts(userId));
      }
    } finally {
      setLoading(false);
    }
  }, [userId, mode]);

  useEffect(() => {
    if (isOpen) fetchData();
  }, [isOpen, fetchData]);

  const handleDeleteOrchestration = async (id: string) => {
    await deleteOrchestration(userId, id);
    setOrchestrations((prev) => prev.filter((r) => r.id !== id));
  };

  const handleDeletePost = async (id: string) => {
    await deletePost(userId, id);
    setPosts((prev) => prev.filter((p) => p.id !== id));
  };

  if (!isOpen) return null;

  const config = MODE_CONFIG[mode];
  const Icon = config.icon;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center px-4 py-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)]">
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative w-full sm:max-w-lg max-h-[min(75vh,calc(100dvh-8rem))] sm:max-h-[600px] flex flex-col rounded-2xl overflow-hidden neu-modal">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200">
          <Icon size={18} className="neu-text-secondary" />
          <p className="flex-1 text-sm font-semibold neu-text-primary">
            {config.label}
          </p>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center neu-text-muted hover:neu-text-primary rounded-full hover:bg-slate-100 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2 min-h-[300px] neu-bg">
          {loading && (
            <div className="text-center py-8 neu-text-muted text-xs">
              読み込み中...
            </div>
          )}

          {!loading && mode === "orchestrations" && (
            <>
              {orchestrations.length === 0 && (
                <div className="text-center py-8 neu-text-muted text-xs">
                  {config.emptyLabel}
                </div>
              )}
              {orchestrations.map((record) => {
                const agentCount = record.result.length;
                const agentNames = record.result
                  .map((r) => AGENT_MAP.get(r.agentId)?.name ?? r.agentId)
                  .slice(0, 3);
                const hasMore = agentCount > 3;

                return (
                  <div
                    key={record.id}
                    className="neu-card p-3 space-y-2 cursor-pointer hover:shadow-md transition-shadow"
                    onClick={() => {
                      onRestoreOrchestration(record);
                      onClose();
                    }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium neu-text-primary truncate">
                          {record.task}
                        </p>
                        <p className="text-[10px] neu-text-muted mt-0.5">
                          {new Date(record.createdAt).toLocaleString("ja-JP")}
                          {record.targetGroup && (
                            <span className="ml-2 px-1.5 py-0.5 bg-emerald-50 text-emerald-600 rounded text-[9px]">
                              {record.targetGroup}
                            </span>
                          )}
                        </p>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteOrchestration(record.id);
                        }}
                        className="flex-shrink-0 p-1.5 neu-text-muted hover:text-red-500 rounded-md hover:bg-red-50 transition-colors"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>

                    <div className="flex flex-wrap gap-1">
                      {agentNames.map((name) => (
                        <span
                          key={name}
                          className="text-[9px] px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded"
                        >
                          {name}
                        </span>
                      ))}
                      {hasMore && (
                        <span className="text-[9px] px-1.5 py-0.5 neu-text-muted">
                          +{agentCount - 3}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </>
          )}

          {!loading && mode === "posts" && (
            <>
              {posts.length === 0 && (
                <div className="text-center py-8 neu-text-muted text-xs">
                  {config.emptyLabel}
                </div>
              )}
              {posts.map((post) => {
                const platform = PLATFORM_LABELS[post.platform] ?? {
                  label: post.platform,
                  color: "#94a3b8",
                };
                return (
                  <div key={post.id} className="neu-card p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span
                            className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                            style={{
                              backgroundColor: platform.color + "15",
                              color: platform.color,
                            }}
                          >
                            {platform.label}
                          </span>
                          <span className="text-[10px] font-medium neu-text-secondary truncate">
                            {post.topic}
                          </span>
                        </div>
                        <p className="text-[10px] neu-text-muted mt-0.5">
                          {new Date(post.timestamp).toLocaleString("ja-JP")}
                        </p>
                      </div>
                      <button
                        onClick={() => handleDeletePost(post.id)}
                        className="flex-shrink-0 p-1.5 neu-text-muted hover:text-red-500 rounded-md hover:bg-red-50 transition-colors"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                    <p className="text-xs neu-text-primary whitespace-pre-wrap leading-relaxed line-clamp-4">
                      {post.content}
                    </p>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(post.content);
                      }}
                      className="text-[10px] px-2 py-1 neu-btn rounded-md neu-text-muted hover:neu-text-secondary transition-all"
                    >
                      コピー
                    </button>
                  </div>
                );
              })}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
