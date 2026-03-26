import { AGENT_MAP } from "../../lib/ai-company/agents";
import type { OrchestrateEvent } from "../../lib/ai-company/types";

interface MessageLogProps {
  events: OrchestrateEvent[];
  isOpen: boolean;
  onToggle: () => void;
}

export function MessageLog({ events, isOpen, onToggle }: MessageLogProps) {
  return (
    <div className="neu-card overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full px-4 py-2 flex items-center justify-between text-sm neu-text-secondary hover:neu-text-primary transition-colors"
      >
        <span>通信ログ ({events.length})</span>
        <span className="text-xs">{isOpen ? "▲" : "▼"}</span>
      </button>

      {isOpen && (
        <div className="max-h-[300px] overflow-y-auto border-t border-slate-200">
          {events.length === 0 ? (
            <p className="neu-text-muted text-xs p-4 text-center">
              タスクを実行すると通信ログが表示されます
            </p>
          ) : (
            <div className="divide-y divide-slate-100">
              {events.map((event, i) => {
                const agent = AGENT_MAP.get(event.agentId);
                const typeColors: Record<string, string> = {
                  "agent-start": "text-blue-500",
                  "agent-output": "neu-text-secondary",
                  "agent-done": "text-green-600",
                  message: "text-sky-500",
                  "task-complete": "text-amber-600",
                  error: "text-red-500",
                };

                if (event.type === "agent-output") return null;

                return (
                  <div
                    key={i}
                    className="px-4 py-2 flex gap-2 text-[11px] font-mono"
                  >
                    <span className="neu-text-muted flex-shrink-0">
                      {new Date(event.timestamp).toLocaleTimeString("ja-JP")}
                    </span>
                    <span
                      className="flex-shrink-0 font-medium"
                      style={{
                        color: agent?.appearance.accentColor ?? "#888",
                      }}
                    >
                      [{agent?.name ?? event.agentId}]
                    </span>
                    <span
                      className={typeColors[event.type] ?? "neu-text-secondary"}
                    >
                      {event.content.slice(0, 120)}
                      {event.content.length > 120 ? "..." : ""}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
