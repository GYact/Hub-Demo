import type { AgentGroup, OrchestrateEvent } from "./types.js";
import { orchestrate } from "./orchestrator.js";
import { persistOrchestration } from "./supabasePersist.js";
import { sendAiCompanyPush } from "./pushNotify.js";

interface QueueEntry {
  id: string;
  task: string;
  targetGroup?: AgentGroup;
  status:
    | "queued"
    | "running"
    | "awaiting-approval"
    | "awaiting-answer"
    | "completed"
    | "error";
  createdAt: number;
  sendEvent: (event: OrchestrateEvent) => void;
  resolve: () => void;
  reject: (error: Error) => void;
}

interface QueueTaskInfo {
  id: string;
  task: string;
  status: string;
  createdAt: number;
}

// Pending approval state
interface PendingApproval {
  taskId: string;
  plan: string;
  resolve: (approved: boolean) => void;
}

// Pending question state
interface PendingQuestion {
  taskId: string;
  question: string;
  agentId: string;
  resolve: (answer: string) => void;
}

class TaskQueue {
  private entries: QueueEntry[] = [];
  private runningCount = 0;
  private maxConcurrency = Infinity;
  private history: QueueTaskInfo[] = [];
  private pendingApprovals = new Map<string, PendingApproval>();
  private pendingQuestions = new Map<string, PendingQuestion>();

  getStatus(): {
    queue: QueueTaskInfo[];
    history: QueueTaskInfo[];
    isProcessing: boolean;
    runningCount: number;
    maxConcurrency: number;
    pendingApprovals: { taskId: string; plan: string }[];
    pendingQuestions: { taskId: string; question: string; agentId: string }[];
  } {
    return {
      queue: this.entries.map((e) => ({
        id: e.id,
        task: e.task,
        status: e.status,
        createdAt: e.createdAt,
      })),
      history: this.history.slice(-10),
      isProcessing: this.runningCount > 0,
      runningCount: this.runningCount,
      maxConcurrency: this.maxConcurrency,
      pendingApprovals: [...this.pendingApprovals.values()].map((p) => ({
        taskId: p.taskId,
        plan: p.plan,
      })),
      pendingQuestions: [...this.pendingQuestions.values()].map((q) => ({
        taskId: q.taskId,
        question: q.question,
        agentId: q.agentId,
      })),
    };
  }

  /** Approve or reject a pending approval */
  respondToApproval(taskId: string, approved: boolean): boolean {
    const pending = this.pendingApprovals.get(taskId);
    if (!pending) return false;
    this.pendingApprovals.delete(taskId);
    pending.resolve(approved);
    return true;
  }

  /** Respond to a pending question with an answer */
  respondToQuestion(taskId: string, answer: string): boolean {
    const pending = this.pendingQuestions.get(taskId);
    if (!pending) return false;
    this.pendingQuestions.delete(taskId);
    pending.resolve(answer);
    return true;
  }

  enqueue(
    task: string,
    targetGroup: AgentGroup | undefined,
    sendEvent: (event: OrchestrateEvent) => void,
  ): Promise<void> {
    const id = `task-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    return new Promise<void>((resolve, reject) => {
      const entry: QueueEntry = {
        id,
        task,
        targetGroup,
        status: "queued",
        createdAt: Date.now(),
        sendEvent,
        resolve,
        reject,
      };

      this.entries.push(entry);

      // Notify queue position to SSE stream
      const queued = this.entries.filter((e) => e.status === "queued").length;
      sendEvent({
        type: "message",
        agentId: "system",
        content:
          this.runningCount >= this.maxConcurrency
            ? `キューに追加（待機${queued}件）同時実行上限に達しているため待機中...`
            : `タスクを受付しました`,
        timestamp: Date.now(),
        metadata: {
          taskId: id,
          queuePosition: queued,
          runningCount: this.runningCount,
        },
      });

      this.processNext();
    });
  }

  private processNext(): void {
    while (this.runningCount < this.maxConcurrency) {
      const entry = this.entries.find((e) => e.status === "queued");
      if (!entry) break;

      entry.status = "running";
      this.runningCount++;
      this.runOne(entry);
    }
  }

  private async runOne(entry: QueueEntry): Promise<void> {
    const collectedEvents: OrchestrateEvent[] = [];
    const wrappedSendEvent = (event: OrchestrateEvent) => {
      collectedEvents.push(event);
      entry.sendEvent(event);
    };

    // Approval callback for orchestrator
    const requestApproval = (plan: string): Promise<boolean> => {
      return new Promise<boolean>((resolve) => {
        entry.status = "awaiting-approval";
        this.pendingApprovals.set(entry.id, {
          taskId: entry.id,
          plan,
          resolve,
        });

        wrappedSendEvent({
          type: "approval-required",
          agentId: "pm",
          content: plan,
          timestamp: Date.now(),
          metadata: { taskId: entry.id },
        });
      });
    };

    // Question callback for orchestrator — pauses and sends push notification
    const requestAnswer = (
      question: string,
      agentId: string,
    ): Promise<string> => {
      return new Promise<string>((resolve) => {
        entry.status = "awaiting-answer";
        this.pendingQuestions.set(entry.id, {
          taskId: entry.id,
          question,
          agentId,
          resolve,
        });

        wrappedSendEvent({
          type: "question",
          agentId,
          content: question,
          timestamp: Date.now(),
          metadata: { taskId: entry.id },
        });

        // Send push notification in background
        sendAiCompanyPush(
          "AI Company: 追加質問",
          question.slice(0, 200),
          "/ai-company",
        ).catch((e) =>
          console.error("[taskQueue] push notification failed:", e),
        );
      });
    };

    try {
      await orchestrate(
        entry.task,
        entry.targetGroup,
        wrappedSendEvent,
        requestApproval,
        requestAnswer,
      );
      entry.status = "completed";
      this.history.push({
        id: entry.id,
        task: entry.task,
        status: "completed",
        createdAt: entry.createdAt,
      });

      // Persist to Supabase
      const agentResults = collectedEvents
        .filter((e) => e.type === "agent-done")
        .map((e) => ({ agentId: e.agentId, content: e.content }));
      persistOrchestration(
        entry.task,
        entry.targetGroup,
        agentResults,
        collectedEvents,
      ).catch((e) => console.error("[taskQueue] persist error:", e));

      entry.resolve();
    } catch (error) {
      entry.status = "error";
      const errMsg = error instanceof Error ? error.message : "Unknown error";
      entry.sendEvent({
        type: "error",
        agentId: "system",
        content: errMsg,
        timestamp: Date.now(),
      });
      this.history.push({
        id: entry.id,
        task: entry.task,
        status: "error",
        createdAt: entry.createdAt,
      });
      entry.reject(error instanceof Error ? error : new Error(String(error)));
    } finally {
      this.entries = this.entries.filter((e) => e.id !== entry.id);
      this.pendingApprovals.delete(entry.id);
      this.pendingQuestions.delete(entry.id);
      this.runningCount--;

      if (this.history.length > 20) {
        this.history = this.history.slice(-20);
      }

      this.processNext();
    }
  }

  reset(): void {
    this.entries = [];
    this.history = [];
    this.runningCount = 0;
    this.pendingApprovals.clear();
    this.pendingQuestions.clear();
  }

  /** Graceful shutdown: reject all pending approvals/questions and mark active entries as error */
  gracefulShutdown(): void {
    // Reject all pending approvals (resolve with false = denied)
    for (const [taskId, pending] of this.pendingApprovals) {
      console.log(
        `[taskQueue] shutdown: rejecting pending approval for ${taskId}`,
      );
      pending.resolve(false);
    }
    this.pendingApprovals.clear();

    // Resolve all pending questions with empty answer
    for (const [taskId, pending] of this.pendingQuestions) {
      console.log(
        `[taskQueue] shutdown: resolving pending question for ${taskId}`,
      );
      pending.resolve("");
    }
    this.pendingQuestions.clear();

    // Mark running entries as error and reject their promises
    for (const entry of this.entries) {
      if (entry.status === "running" || entry.status === "awaiting-approval") {
        console.log(
          `[taskQueue] shutdown: marking ${entry.id} (${entry.status}) as error`,
        );
        entry.status = "error";
        entry.sendEvent({
          type: "error",
          agentId: "system",
          content: "Server shutting down",
          timestamp: Date.now(),
        });
        entry.reject(new Error("Server shutting down"));
      } else if (entry.status === "queued") {
        console.log(`[taskQueue] shutdown: rejecting queued task ${entry.id}`);
        entry.status = "error";
        entry.sendEvent({
          type: "error",
          agentId: "system",
          content: "Server shutting down — task was queued but never started",
          timestamp: Date.now(),
        });
        entry.reject(
          new Error("Server shutting down — task was queued but never started"),
        );
      }
    }

    const cleaned = this.entries.length;
    this.entries = [];
    this.runningCount = 0;
    console.log(`[taskQueue] shutdown complete: cleaned ${cleaned} entries`);
  }
}

export const taskQueue = new TaskQueue();
