import { useEffect, useRef } from "react";
import type { AgentDef } from "../../lib/ai-company/types";
import { CharacterAvatar } from "./CharacterAvatar";

interface TerminalProps {
  agent: AgentDef;
  lines: string[];
  status: "idle" | "thinking" | "working" | "talking";
  isExpanded: boolean;
  onToggle: () => void;
  onChat: () => void;
}

const STATUS_INDICATOR: Record<string, { color: string; label: string }> = {
  idle: { color: "bg-slate-400", label: "待機中" },
  thinking: { color: "bg-yellow-400", label: "思考中" },
  working: { color: "bg-green-400", label: "作業中" },
  talking: { color: "bg-blue-400", label: "通信中" },
};

export function Terminal({
  agent,
  lines,
  status,
  isExpanded,
  onToggle,
  onChat,
}: TerminalProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lines]);

  const statusInfo = STATUS_INDICATOR[status] ?? STATUS_INDICATOR.idle;

  return (
    <div
      className={`
        relative overflow-hidden rounded-xl transition-all duration-300 cursor-pointer
        ${isExpanded ? "col-span-2 row-span-2" : ""}
        ${
          status === "working" || status === "thinking"
            ? "neu-card ring-2 ring-emerald-300/50"
            : "neu-card"
        }
      `}
      onClick={onToggle}
    >
      <CharacterAvatar name={agent.id} />

      <div className="relative z-10 flex items-center gap-2 px-3 py-1.5 border-b border-slate-200/60">
        <div className="flex gap-1">
          <div className="w-2 5 h-2.5 rounded-full bg-red-400/60" />
          <div className="w-2.5 h-2.5 rounded-full bg-yellow-400/60" />
          <div className="w-2.5 h-2.5 rounded-full bg-green-400/60" />
        </div>
        <span className="text-[10px] neu-text-secondary font-medium truncate flex-1">
          {agent.name} — {agent.role}
        </span>
        <div className="flex items-center gap-1">
          <div
            className={`w-1.5 h-1.5 rounded-full ${statusInfo.color} ${
              status !== "idle" ? "animate-pulse" : ""
            }`}
          />
          <span className="text-[9px] neu-text-muted">{statusInfo.label}</span>
        </div>
      </div>

      <div
        ref={scrollRef}
        className={`
          relative z-10 p-2 overflow-y-auto font-mono text-[10px] leading-relaxed bg-slate-50/50
          ${isExpanded ? "h-[300px] md:h-[400px]" : "h-[120px] md:h-[180px]"}
        `}
      >
        {lines.length === 0 ? (
          <div className="neu-text-muted flex items-center gap-1">
            <span style={{ color: agent.appearance.accentColor }}>$</span>
            <span className="animate-blink">_</span>
          </div>
        ) : (
          lines.map((line, i) => (
            <div
              key={i}
              className={`${
                line.startsWith("$")
                  ? "text-emerald-600"
                  : line.startsWith("ERROR")
                    ? "text-red-500"
                    : line.startsWith("[")
                      ? "text-amber-600"
                      : "neu-text-primary"
              }`}
            >
              {line}
            </div>
          ))
        )}
        {status !== "idle" && (
          <div className="flex items-center gap-1 mt-1">
            <span style={{ color: agent.appearance.accentColor }}>{">"}</span>
            <span className="animate-blink neu-text-muted">_</span>
          </div>
        )}
      </div>

      <div className="relative z-10 px-3 py-1 border-t border-slate-200/60 flex justify-between items-center bg-white/80">
        <span
          className="text-[9px] font-bold"
          style={{ color: agent.appearance.accentColor }}
        >
          {agent.group.toUpperCase()}
        </span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onChat();
          }}
          className="text-[9px] text-slate-600 font-medium hover:text-slate-900 px-1.5 py-0.5 rounded border border-slate-300 hover:border-slate-500 transition-all"
        >
          Chat
        </button>
        <span className="text-[9px] text-slate-500 font-medium">
          Claude Code
        </span>
      </div>
    </div>
  );
}
