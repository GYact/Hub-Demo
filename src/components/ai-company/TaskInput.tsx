import { useState } from "react";
import type { AgentGroup } from "../../lib/ai-company/types";

export interface QueuedTaskItem {
  id: string;
  task: string;
  status: "queued" | "running" | "done" | "error";
}

interface TaskInputProps {
  onSubmit: (task: string, group?: AgentGroup) => void;
  queuedTasks: QueuedTaskItem[];
  onReset: () => void;
}

const GROUP_OPTIONS: {
  value: AgentGroup | "auto";
  label: string;
  icon: string;
}[] = [
  { value: "auto", label: "自動判定", icon: "🤖" },
  { value: "executive", label: "経営", icon: "👔" },
  { value: "product", label: "プロダクト", icon: "📱" },
  { value: "tech", label: "開発", icon: "⚡" },
  { value: "design", label: "デザイン", icon: "🎨" },
  { value: "sales", label: "営業", icon: "💼" },
  { value: "marketing", label: "マーケ", icon: "📢" },
  { value: "hr", label: "人事", icon: "👥" },
  { value: "legal", label: "法務", icon: "⚖️" },
  { value: "operations", label: "管理", icon: "📋" },
  { value: "support", label: "サポート", icon: "🎧" },
];

export function TaskInput({ onSubmit, queuedTasks, onReset }: TaskInputProps) {
  const [task, setTask] = useState("");
  const [group, setGroup] = useState<AgentGroup | "auto">("auto");

  const activeTasks = queuedTasks.filter(
    (t) => t.status === "queued" || t.status === "running",
  );
  const hasActive = activeTasks.length > 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!task.trim()) return;
    onSubmit(task.trim(), group === "auto" ? undefined : group);
    setTask("");
  };

  return (
    <div className="neu-card p-4">
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {GROUP_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setGroup(opt.value)}
              className={`
                flex-shrink-0 px-3 py-1.5 rounded-lg text-xs transition-all
                ${
                  group === opt.value
                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                    : "bg-slate-100 border border-slate-200/60 neu-text-secondary hover:neu-text-primary"
                }
              `}
            >
              {opt.icon} {opt.label}
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          <div className="flex-1">
            <input
              type="text"
              value={task}
              onChange={(e) => setTask(e.target.value)}
              placeholder={
                hasActive
                  ? "追加タスクを入力（キューに追加されます）..."
                  : "タスクを入力..."
              }
              className="w-full px-3 py-2.5 neu-input rounded-lg text-sm"
            />
          </div>
          <button
            type="submit"
            disabled={!task.trim()}
            className="
              px-4 py-2.5 bg-emerald-600 text-white
              rounded-lg text-sm hover:bg-emerald-700
              disabled:opacity-30 disabled:cursor-not-allowed
              transition-all active:scale-95 shadow-sm
            "
          >
            {hasActive ? (
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
                追加
              </span>
            ) : (
              "実行"
            )}
          </button>
        </div>

        {/* Queue display */}
        {activeTasks.length > 0 && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-medium neu-text-muted uppercase tracking-wider">
                Task Queue ({activeTasks.length})
              </span>
              <button
                type="button"
                onClick={onReset}
                className="
                  text-[10px] px-2 py-0.5 bg-red-50 text-red-600
                  border border-red-200 rounded-md
                  hover:bg-red-100 transition-all
                "
              >
                全リセット
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {activeTasks.map((t) => (
                <span
                  key={t.id}
                  className={`
                    text-[10px] px-2 py-1 rounded-md border max-w-[200px] truncate
                    ${
                      t.status === "running"
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                        : "bg-amber-50 text-amber-700 border-amber-200"
                    }
                  `}
                >
                  {t.status === "running" ? "▶ " : "◻ "}
                  {t.task}
                </span>
              ))}
            </div>
          </div>
        )}
      </form>
    </div>
  );
}
