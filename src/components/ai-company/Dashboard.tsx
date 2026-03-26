import { useState, useCallback, useRef, useEffect } from "react";
import { AGENTS, GROUP_LABELS, AGENT_MAP } from "../../lib/ai-company/agents";
import type {
  AgentGroup,
  AgentStatus,
  OrchestrateEvent,
  TerminalLine,
} from "../../lib/ai-company/types";
import {
  saveOrchestration,
  loadLatestOrchestration,
} from "../../lib/ai-company/supabaseHistory";
import { upsertAiNotification } from "../../lib/offlineData";
import type { OrchestrationRecord } from "../../lib/ai-company/supabaseHistory";
import { Terminal } from "./Terminal";
import { TaskInput } from "./TaskInput";
import type { QueuedTaskItem } from "./TaskInput";
import { MessageLog } from "./MessageLog";
import { AgentChat } from "./AgentChat";

type AuthFetch = (path: string, init?: RequestInit) => Promise<Response>;

interface AgentTerminalState {
  lines: string[];
  status: AgentStatus;
}

interface DashboardProps {
  baseUrl: string;
  authFetch: AuthFetch;
  userId: string | null;
  restoringRecord: OrchestrationRecord | null;
}

export function Dashboard({
  authFetch,
  userId,
  restoringRecord,
}: DashboardProps) {
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);
  const [chatAgent, setChatAgent] = useState<string | null>(null);
  const [events, setEvents] = useState<OrchestrateEvent[]>([]);
  const [showLog, setShowLog] = useState(false);
  const [activeGroup, setActiveGroup] = useState<AgentGroup | "all">("all");
  const [queuedTasks, setQueuedTasks] = useState<QueuedTaskItem[]>([]);
  const [pendingApproval, setPendingApproval] = useState<{
    taskId: string;
    plan: string;
  } | null>(null);
  const [pendingQuestion, setPendingQuestion] = useState<{
    taskId: string;
    question: string;
  } | null>(null);
  const [questionAnswer, setQuestionAnswer] = useState("");
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());

  const [terminalStates, setTerminalStates] = useState<
    Record<string, AgentTerminalState>
  >(() => {
    const initial: Record<string, AgentTerminalState> = {};
    for (const agent of AGENTS) {
      initial[agent.id] = { lines: [], status: "idle" };
    }
    return initial;
  });
  const terminalStatesRef = useRef(terminalStates);
  terminalStatesRef.current = terminalStates;

  useEffect(() => {
    let relayHadData = false;

    authFetch("/messages")
      .then((res) => res.json())
      .then(
        (data: {
          events?: OrchestrateEvent[];
          agents?: Array<{
            id: string;
            state?: { terminalLines?: TerminalLine[]; status?: string };
          }>;
        }) => {
          const hasData = data.agents?.some(
            (a) => a.state?.terminalLines && a.state.terminalLines.length > 0,
          );
          if (!hasData) return;
          relayHadData = true;

          if (data.events && data.events.length > 0) {
            setEvents(data.events);
          }

          setTerminalStates((prev) => {
            const next = { ...prev };
            for (const agent of data.agents ?? []) {
              if (
                agent.state?.terminalLines &&
                agent.state.terminalLines.length > 0
              ) {
                next[agent.id] = {
                  lines: agent.state.terminalLines.map((tl) => tl.text),
                  status: (agent.state.status as AgentStatus) ?? "idle",
                };
              }
            }
            return next;
          });
        },
      )
      .catch(() => {})
      .finally(() => {
        if (relayHadData || !userId) return;
        loadLatestOrchestration(userId).then((record) => {
          if (!record) return;
          setTerminalStates((prev) => {
            const next = { ...prev };
            for (const r of record.result) {
              if (r.lines.length > 0) {
                next[r.agentId] = { lines: r.lines, status: "idle" };
              }
            }
            return next;
          });
        });
      });
  }, [authFetch, userId]);

  const updateTerminal = useCallback(
    (
      agentId: string,
      updater: (prev: AgentTerminalState) => AgentTerminalState,
    ) => {
      setTerminalStates((prev) => ({
        ...prev,
        [agentId]: updater(prev[agentId] ?? { lines: [], status: "idle" }),
      }));
    },
    [],
  );

  const handleSubmit = useCallback(
    async (task: string, group?: AgentGroup) => {
      const taskId = `t-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

      // Add task to queue display
      setQueuedTasks((prev) => {
        const active = prev.filter(
          (t) => t.status === "queued" || t.status === "running",
        );
        // If no active tasks, this is the first — reset terminals
        if (active.length === 0) {
          setTerminalStates((ts) => {
            const next = { ...ts };
            for (const key of Object.keys(next)) {
              next[key] = { lines: [], status: "idle" };
            }
            return next;
          });
          setEvents([]);
        }
        return [...prev, { id: taskId, task, status: "queued" }];
      });

      const controller = new AbortController();
      abortControllersRef.current.set(taskId, controller);

      const partialText: Record<string, string> = {};
      // Local line tracking (independent of React state batching)
      const localLines: Record<string, string[]> = {};
      // Full agent output content (from agent-done events)
      const agentContents: Record<string, string> = {};
      // All orchestration events (for Supabase persistence)
      const localEvents: OrchestrateEvent[] = [];
      let taskResult = "";
      let hasError = false;

      try {
        const res = await authFetch("/orchestrate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ task, targetGroup: group }),
          signal: controller.signal,
        });

        if (!res.ok || !res.body)
          throw new Error("Failed to start orchestration");

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6);
            if (data === "[DONE]") continue;

            try {
              const event: OrchestrateEvent = JSON.parse(data);
              setEvents((prev) => [...prev, event]);
              localEvents.push(event);

              switch (event.type) {
                case "agent-start":
                  // When first agent-start comes, task is running
                  setQueuedTasks((prev) =>
                    prev.map((t) =>
                      t.id === taskId ? { ...t, status: "running" } : t,
                    ),
                  );
                  updateTerminal(event.agentId, (prev) => ({
                    ...prev,
                    status: "thinking",
                    lines: [...prev.lines, `$ ${event.content}`],
                  }));
                  if (!localLines[event.agentId])
                    localLines[event.agentId] = [];
                  localLines[event.agentId].push(`$ ${event.content}`);
                  partialText[event.agentId] = "";
                  break;

                case "agent-output":
                  partialText[event.agentId] =
                    (partialText[event.agentId] ?? "") + event.content;
                  updateTerminal(event.agentId, (prev) => {
                    const full = partialText[event.agentId] ?? "";
                    const outputLines = full.split("\n");
                    const inputLineCount = prev.lines.filter((l) =>
                      l.startsWith("$"),
                    ).length;
                    return {
                      status: "working",
                      lines: [
                        ...prev.lines.slice(0, inputLineCount),
                        ...outputLines,
                      ],
                    };
                  });
                  {
                    const ll = localLines[event.agentId] ?? [];
                    const inputLines = ll.filter((l) => l.startsWith("$"));
                    const outputLines = (
                      partialText[event.agentId] ?? ""
                    ).split("\n");
                    localLines[event.agentId] = [...inputLines, ...outputLines];
                  }
                  break;

                case "agent-done":
                  updateTerminal(event.agentId, (prev) => ({
                    ...prev,
                    status: "idle",
                    lines: [...prev.lines, "[完了]"],
                  }));
                  if (!localLines[event.agentId])
                    localLines[event.agentId] = [];
                  localLines[event.agentId].push("[完了]");
                  if (event.content) {
                    agentContents[event.agentId] = event.content;
                  }
                  break;

                case "task-complete":
                  taskResult = event.content;
                  updateTerminal(event.agentId, (prev) => ({
                    ...prev,
                    lines: [...prev.lines, "─── タスク完了 ───"],
                  }));
                  if (!localLines[event.agentId])
                    localLines[event.agentId] = [];
                  localLines[event.agentId].push("─── タスク完了 ───");
                  break;

                case "approval-required":
                  setPendingApproval({
                    taskId: (event.metadata?.taskId as string) ?? "",
                    plan: event.content,
                  });
                  break;

                case "question":
                  setPendingQuestion({
                    taskId: (event.metadata?.taskId as string) ?? "",
                    question: event.content,
                  });
                  setQuestionAnswer("");
                  break;

                case "error":
                  updateTerminal(event.agentId, (prev) => ({
                    ...prev,
                    status: "idle",
                    lines: [...prev.lines, `ERROR: ${event.content}`],
                  }));
                  if (!localLines[event.agentId])
                    localLines[event.agentId] = [];
                  localLines[event.agentId].push(`ERROR: ${event.content}`);
                  break;
              }
            } catch {
              // Skip malformed events
            }
          }
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          // User cancelled
        } else {
          hasError = true;
          const msg =
            err instanceof Error ? err.message : "通信エラーが発生しました";
          console.error("Orchestration error:", err);
          updateTerminal("pm", (prev) => ({
            ...prev,
            status: "idle",
            lines: [...prev.lines, `ERROR: ${msg}`],
          }));
          if (!localLines["pm"]) localLines["pm"] = [];
          localLines["pm"].push(`ERROR: ${msg}`);
        }
      } finally {
        abortControllersRef.current.delete(taskId);

        // Mark task as done
        setQueuedTasks((prev) =>
          prev.map((t) => (t.id === taskId ? { ...t, status: "done" } : t)),
        );

        // Clean up old done tasks (keep last 5)
        setQueuedTasks((prev) => {
          const active = prev.filter((t) => t.status !== "done");
          const done = prev.filter((t) => t.status === "done").slice(-5);
          return [...active, ...done];
        });

        if (userId && !hasError) {
          // Build save data from local tracking (not React state ref)
          const saveData: Record<
            string,
            { lines: string[]; content?: string }
          > = {};
          for (const [agentId, lines] of Object.entries(localLines)) {
            if (lines.length > 0) {
              saveData[agentId] = {
                lines,
                ...(agentContents[agentId]
                  ? { content: agentContents[agentId] }
                  : {}),
              };
            }
          }
          saveOrchestration(userId, task, group, saveData, localEvents).catch(
            (e) => console.error("[ai-company] saveOrchestration failed:", e),
          );

          const now = new Date().toISOString();
          const summary = taskResult
            ? `**${task}**\n\n${taskResult.slice(0, 2000)}`
            : task;
          upsertAiNotification({
            id: `ai-company-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            userId,
            source: "automation",
            priority: "medium",
            title: "AI Company タスク完了",
            body: summary,
            metadata: { origin: "ai-company", task },
            isRead: false,
            createdAt: now,
            updatedAt: now,
          }).catch((e) =>
            console.error("[ai-company] notification failed:", e),
          );
        }
      }
    },
    [updateTerminal, authFetch, userId],
  );

  useEffect(() => {
    if (!restoringRecord) return;
    setEvents([]);
    setTerminalStates((prev) => {
      const next = { ...prev };
      for (const key of Object.keys(next)) {
        next[key] = { lines: [], status: "idle" };
      }
      for (const r of restoringRecord.result) {
        if (r.lines.length > 0) {
          next[r.agentId] = { lines: r.lines, status: "idle" };
        }
      }
      return next;
    });
  }, [restoringRecord]);

  const handleReset = useCallback(() => {
    // Abort all active connections
    for (const controller of abortControllersRef.current.values()) {
      controller.abort();
    }
    abortControllersRef.current.clear();

    setQueuedTasks([]);
    setEvents([]);
    setTerminalStates((prev) => {
      const next = { ...prev };
      for (const key of Object.keys(next)) {
        next[key] = { lines: [], status: "idle" };
      }
      return next;
    });
    authFetch("/messages", { method: "DELETE" }).catch(() => {});
  }, [authFetch]);

  const filteredAgents =
    activeGroup === "all"
      ? AGENTS
      : AGENTS.filter((a) => a.group === activeGroup);

  return (
    <>
      <div className="space-y-4">
        <TaskInput
          onSubmit={handleSubmit}
          queuedTasks={queuedTasks}
          onReset={handleReset}
        />

        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {(
            [
              "all",
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
            ] as const
          ).map((g) => (
            <button
              key={g}
              onClick={() => setActiveGroup(g)}
              className={`
                flex-shrink-0 px-3 py-1 rounded-lg text-xs transition-all
                ${
                  activeGroup === g
                    ? "neu-pressed neu-text-primary font-medium"
                    : "neu-text-muted hover:neu-text-secondary"
                }
              `}
            >
              {g === "all"
                ? `全員 (${AGENTS.length})`
                : `${GROUP_LABELS[g]} (${AGENTS.filter((a) => a.group === g).length})`}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-2 md:gap-3">
          {filteredAgents.map((agent) => {
            const state = terminalStates[agent.id] ?? {
              lines: [],
              status: "idle" as const,
            };
            return (
              <Terminal
                key={agent.id}
                agent={agent}
                lines={state.lines}
                status={state.status}
                isExpanded={expandedAgent === agent.id}
                onToggle={() =>
                  setExpandedAgent((prev) =>
                    prev === agent.id ? null : agent.id,
                  )
                }
                onChat={() => setChatAgent(agent.id)}
              />
            );
          })}
        </div>

        <MessageLog
          events={events}
          isOpen={showLog}
          onToggle={() => setShowLog((prev) => !prev)}
        />
      </div>

      {chatAgent && AGENT_MAP.get(chatAgent) && (
        <AgentChat
          agent={AGENT_MAP.get(chatAgent)!}
          authFetch={authFetch}
          userId={userId}
          onClose={() => setChatAgent(null)}
        />
      )}
      {/* Approval Dialog */}
      {pendingApproval && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
          <div className="relative w-full sm:max-w-lg sm:mx-4 flex flex-col rounded-t-2xl sm:rounded-2xl overflow-hidden neu-card p-5">
            <h3 className="text-sm font-bold neu-text-primary mb-1">
              承認が必要です
            </h3>
            <p className="text-[10px] neu-text-muted mb-3">
              高リスク操作が含まれています。実行計画を確認してください。
            </p>
            <div className="max-h-60 overflow-y-auto rounded-lg border border-slate-200 p-3 bg-white mb-4">
              <pre className="text-[11px] leading-relaxed whitespace-pre-wrap break-words neu-text-secondary font-mono">
                {pendingApproval.plan}
              </pre>
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => {
                  authFetch("/approve", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      taskId: pendingApproval.taskId,
                      approved: false,
                    }),
                  }).catch(() => {});
                  setPendingApproval(null);
                }}
                className="px-4 py-2 rounded-lg text-xs font-medium bg-slate-100 neu-text-secondary hover:bg-slate-200 transition-colors"
              >
                キャンセル
              </button>
              <button
                onClick={() => {
                  authFetch("/approve", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      taskId: pendingApproval.taskId,
                      approved: true,
                    }),
                  }).catch(() => {});
                  setPendingApproval(null);
                }}
                className="px-4 py-2 rounded-lg text-xs font-medium bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
              >
                承認して実行
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Question Dialog */}
      {pendingQuestion && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
          <div className="relative w-full sm:max-w-lg sm:mx-4 flex flex-col rounded-t-2xl sm:rounded-2xl overflow-hidden neu-card p-5">
            <h3 className="text-sm font-bold neu-text-primary mb-1">
              追加質問
            </h3>
            <p className="text-[10px] neu-text-muted mb-3">
              タスクを進めるために、PMから確認事項があります。
            </p>
            <div className="max-h-40 overflow-y-auto rounded-lg border border-slate-200 p-3 bg-white mb-3">
              <pre className="text-[11px] leading-relaxed whitespace-pre-wrap break-words neu-text-secondary font-mono">
                {pendingQuestion.question}
              </pre>
            </div>
            <textarea
              value={questionAnswer}
              onChange={(e) => setQuestionAnswer(e.target.value)}
              placeholder="回答を入力..."
              rows={3}
              className="w-full px-3 py-2 rounded-lg text-sm neu-input mb-4 resize-none"
              autoFocus
              onKeyDown={(e) => {
                if (
                  e.key === "Enter" &&
                  (e.metaKey || e.ctrlKey) &&
                  questionAnswer.trim()
                ) {
                  authFetch("/answer", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      taskId: pendingQuestion.taskId,
                      answer: questionAnswer.trim(),
                    }),
                  }).catch(() => {});
                  setPendingQuestion(null);
                  setQuestionAnswer("");
                }
              }}
            />
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => {
                  authFetch("/answer", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      taskId: pendingQuestion.taskId,
                      answer: "スキップ",
                    }),
                  }).catch(() => {});
                  setPendingQuestion(null);
                  setQuestionAnswer("");
                }}
                className="px-4 py-2 rounded-lg text-xs font-medium bg-slate-100 neu-text-secondary hover:bg-slate-200 transition-colors"
              >
                スキップ
              </button>
              <button
                onClick={() => {
                  if (!questionAnswer.trim()) return;
                  authFetch("/answer", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      taskId: pendingQuestion.taskId,
                      answer: questionAnswer.trim(),
                    }),
                  }).catch(() => {});
                  setPendingQuestion(null);
                  setQuestionAnswer("");
                }}
                disabled={!questionAnswer.trim()}
                className="px-4 py-2 rounded-lg text-xs font-medium bg-sky-600 text-white hover:bg-sky-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                回答して続行
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
