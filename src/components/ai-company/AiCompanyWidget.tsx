import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Building2,
  Circle,
  Clock,
  Send,
  Users,
} from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { useAiCompanyUrl } from "../../hooks/useAiCompany";
import { AGENTS, GROUP_LABELS } from "../../lib/ai-company/agents";
import { loadOrchestrationHistory } from "../../lib/ai-company/supabaseHistory";
import type { OrchestrationRecord } from "../../lib/ai-company/supabaseHistory";
import type { AgentGroup } from "../../lib/ai-company/types";

const GROUP_ORDER: AgentGroup[] = [
  "executive",
  "product",
  "tech",
  "design",
  "sales",
  "marketing",
  "hr",
  "legal",
  "operations",
  "support",
];

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "たった今";
  if (mins < 60) return `${mins}分前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}時間前`;
  const days = Math.floor(hours / 24);
  return `${days}日前`;
}

export function AiCompanyWidget() {
  const { user } = useAuth();
  const { authFetch } = useAiCompanyUrl();
  const [history, setHistory] = useState<OrchestrationRecord[]>([]);
  const [relayOnline, setRelayOnline] = useState<boolean | null>(null);
  const [quickTask, setQuickTask] = useState("");
  const [sending, setSending] = useState(false);
  const [expandDepts, setExpandDepts] = useState(false);

  // Load recent orchestrations
  useEffect(() => {
    if (!user?.id) return;
    loadOrchestrationHistory(user.id, 5)
      .then(setHistory)
      .catch(() => {});
  }, [user?.id]);

  // Check relay status
  useEffect(() => {
    authFetch("/health")
      .then((r) => setRelayOnline(r.ok))
      .catch(() => setRelayOnline(false));
  }, [authFetch]);

  // Quick task submit
  const handleQuickTask = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!quickTask.trim() || sending) return;
      setSending(true);
      try {
        const res = await authFetch("/orchestrate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ task: quickTask.trim() }),
        });
        if (res.ok) {
          setQuickTask("");
          // Consume SSE stream in background (don't block)
          const reader = res.body?.getReader();
          if (reader) {
            const drain = async () => {
              // eslint-disable-next-line no-constant-condition
              while (true) {
                const { done } = await reader.read();
                if (done) break;
              }
              // Reload history after completion
              if (user?.id) {
                const updated = await loadOrchestrationHistory(user.id, 5);
                setHistory(updated);
              }
            };
            drain().catch(() => {});
          }
        }
      } catch {
        // ignore
      } finally {
        setSending(false);
      }
    },
    [quickTask, sending, authFetch, user?.id],
  );

  const agentsByGroup = GROUP_ORDER.map((g) => ({
    group: g,
    label: GROUP_LABELS[g] ?? g,
    agents: AGENTS.filter((a) => a.group === g),
  }));

  return (
    <div className="neu-card p-4 md:p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-sm">
            <Building2 size={18} className="text-white" />
          </div>
          <div>
            <h3 className="text-sm md:text-base font-bold neu-text-primary">
              AI Company
            </h3>
            <div className="flex items-center gap-1.5 mt-0.5">
              <Circle
                size={6}
                className={
                  relayOnline === true
                    ? "fill-emerald-500 text-emerald-500"
                    : relayOnline === false
                      ? "fill-red-400 text-red-400"
                      : "fill-slate-300 text-slate-300"
                }
              />
              <span className="text-[10px] neu-text-muted">
                {relayOnline === true
                  ? "Online"
                  : relayOnline === false
                    ? "Offline"
                    : "Checking..."}
              </span>
              <span className="text-[10px] neu-text-muted ml-1">
                <Users size={10} className="inline mr-0.5" />
                {AGENTS.length}名
              </span>
            </div>
          </div>
        </div>
        <Link
          to="/ai/company"
          className="text-xs md:text-sm text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1"
        >
          Open
          <ArrowRight size={14} />
        </Link>
      </div>

      {/* Department Overview (compact) */}
      <div className="mb-4">
        <button
          onClick={() => setExpandDepts((p) => !p)}
          className="text-[10px] font-semibold neu-text-muted uppercase tracking-wider mb-2 flex items-center gap-1 hover:neu-text-secondary transition-colors"
        >
          {expandDepts ? "▼" : "▶"} 部門一覧（{GROUP_ORDER.length}部門）
        </button>
        {expandDepts ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
            {agentsByGroup.map(({ group, label, agents }) => (
              <div
                key={group}
                className="bg-slate-100 border border-slate-200/60 rounded-lg p-2"
              >
                <p className="text-[10px] font-bold neu-text-secondary mb-1.5">
                  {label}
                </p>
                <div className="flex flex-wrap gap-1">
                  {agents.map((a) => (
                    <div
                      key={a.id}
                      className="w-6 h-6 rounded-full overflow-hidden border border-white shadow-sm"
                      style={{
                        background: `linear-gradient(135deg, ${a.appearance.bgGradient[0]}, ${a.appearance.bgGradient[1]})`,
                      }}
                      title={`${a.name}（${a.role}）`}
                    >
                      <img
                        src={`/ai-company/avatars/${a.nameEn.split(" ")[0].toLowerCase()}.jpg`}
                        alt={a.name}
                        className="w-full h-full object-cover"
                        loading="lazy"
                        onError={(e) => {
                          // Fallback: hide broken image, show gradient bg
                          (e.target as HTMLImageElement).style.display = "none";
                        }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
            {agentsByGroup.map(({ group, label, agents }) => (
              <span
                key={group}
                className="flex-shrink-0 text-[10px] px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200/60 neu-text-muted"
              >
                {label} <span className="font-bold">{agents.length}</span>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Quick Task Input */}
      {relayOnline && (
        <form onSubmit={handleQuickTask} className="mb-4">
          <div className="flex gap-2">
            <input
              type="text"
              value={quickTask}
              onChange={(e) => setQuickTask(e.target.value)}
              placeholder="クイックタスクを入力..."
              className="flex-1 px-3 py-2 neu-input rounded-lg text-xs"
              disabled={sending}
            />
            <button
              type="submit"
              disabled={!quickTask.trim() || sending}
              className="px-3 py-2 bg-indigo-600 text-white rounded-lg text-xs hover:bg-indigo-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all active:scale-95 shadow-sm"
            >
              {sending ? (
                <svg
                  className="animate-spin h-3.5 w-3.5"
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
              ) : (
                <Send size={14} />
              )}
            </button>
          </div>
        </form>
      )}

      {/* Recent Tasks */}
      {history.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold neu-text-muted uppercase tracking-wider mb-2">
            <Clock size={10} className="inline mr-1" />
            Recent Tasks
          </p>
          <div className="space-y-1.5">
            {history.slice(0, 3).map((record) => {
              const agentCount = record.result.length;
              return (
                <Link
                  key={record.id}
                  to="/ai/company"
                  className="flex items-center gap-2 p-2 rounded-lg bg-slate-100 border border-slate-200/60 hover:bg-slate-50 transition-all group"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium neu-text-primary truncate group-hover:text-indigo-700 transition-colors">
                      {record.task}
                    </p>
                    <p className="text-[10px] neu-text-muted">
                      {agentCount}名が参加 · {timeAgo(record.createdAt)}
                      {record.targetGroup &&
                        ` · ${GROUP_LABELS[record.targetGroup] ?? record.targetGroup}`}
                    </p>
                  </div>
                  <ArrowRight
                    size={12}
                    className="opacity-0 group-hover:opacity-100 transition-opacity neu-text-muted flex-shrink-0"
                  />
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
