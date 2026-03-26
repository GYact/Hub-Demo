import { randomUUID } from "node:crypto";
import type {
  AgentMessage,
  AgentState,
  OrchestrateEvent,
  TerminalLine,
} from "./types.js";
import { AGENTS } from "./agents.js";
import {
  loadRecentMessages,
  loadLatestOrchestrationEvents,
} from "./supabasePersist.js";

class MessageStore {
  private messages: AgentMessage[] = [];
  private events: OrchestrateEvent[] = [];
  private agentStates: Map<string, AgentState> = new Map();
  private listeners: Set<(event: AgentMessage) => void> = new Set();

  constructor() {
    for (const agent of AGENTS) {
      this.agentStates.set(agent.id, {
        agentId: agent.id,
        status: "idle",
        currentTask: null,
        terminalLines: [],
      });
    }
  }

  addMessage(msg: Omit<AgentMessage, "id" | "timestamp">): AgentMessage {
    const fullMsg: AgentMessage = {
      ...msg,
      id: randomUUID(),
      timestamp: Date.now(),
    };
    this.messages.push(fullMsg);

    if (this.messages.length > 500) {
      this.messages = this.messages.slice(-300);
    }

    for (const listener of this.listeners) {
      listener(fullMsg);
    }
    return fullMsg;
  }

  addTerminalLine(
    agentId: string,
    text: string,
    type: TerminalLine["type"] = "output",
  ): void {
    const state = this.agentStates.get(agentId);
    if (!state) return;

    state.terminalLines.push({
      id: randomUUID(),
      text,
      type,
      timestamp: Date.now(),
    });

    if (state.terminalLines.length > 100) {
      state.terminalLines = state.terminalLines.slice(-80);
    }
  }

  setAgentStatus(
    agentId: string,
    status: AgentState["status"],
    task?: string,
  ): void {
    const state = this.agentStates.get(agentId);
    if (!state) return;
    state.status = status;
    if (task !== undefined) state.currentTask = task;
  }

  getMessages(limit = 50): AgentMessage[] {
    return this.messages.slice(-limit);
  }

  getMessagesPage(
    limit = 50,
    offset = 0,
  ): { messages: AgentMessage[]; total: number; hasMore: boolean } {
    const total = this.messages.length;
    // offset is from the end (newest first semantics: offset=0 → latest)
    const start = Math.max(0, total - offset - limit);
    const end = Math.max(0, total - offset);
    return {
      messages: this.messages.slice(start, end).reverse(),
      total,
      hasMore: start > 0,
    };
  }

  getAgentMessages(agentId: string, limit = 30): AgentMessage[] {
    return this.messages
      .filter(
        (m) =>
          m.fromAgentId === agentId ||
          m.toAgentId === agentId ||
          m.toAgentId === "all",
      )
      .slice(-limit);
  }

  getAgentMessagesPage(
    agentId: string,
    limit = 30,
    offset = 0,
  ): { messages: AgentMessage[]; total: number; hasMore: boolean } {
    const filtered = this.messages.filter(
      (m) =>
        m.fromAgentId === agentId ||
        m.toAgentId === agentId ||
        m.toAgentId === "all",
    );
    const total = filtered.length;
    const start = Math.max(0, total - offset - limit);
    const end = Math.max(0, total - offset);
    return {
      messages: filtered.slice(start, end).reverse(),
      total,
      hasMore: start > 0,
    };
  }

  getAgentState(agentId: string): AgentState | undefined {
    return this.agentStates.get(agentId);
  }

  getAllStates(): AgentState[] {
    return Array.from(this.agentStates.values());
  }

  subscribe(listener: (event: AgentMessage) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  addEvent(event: OrchestrateEvent): void {
    this.events.push(event);
    if (this.events.length > 500) {
      this.events = this.events.slice(-300);
    }
  }

  getEvents(limit = 200): OrchestrateEvent[] {
    return this.events.slice(-limit);
  }

  reset(): void {
    this.messages = [];
    this.events = [];
    for (const [, state] of this.agentStates) {
      state.status = "idle";
      state.currentTask = null;
      state.terminalLines = [];
    }
  }

  /** Restore messages and events from Supabase on startup */
  async restoreFromSupabase(): Promise<void> {
    try {
      const [msgs, events] = await Promise.all([
        loadRecentMessages(),
        loadLatestOrchestrationEvents(),
      ]);

      if (msgs.length > 0) {
        this.messages = msgs.map((m) => ({
          id: m.id,
          fromAgentId: m.fromAgentId,
          toAgentId: m.toAgentId,
          content: m.content,
          type: m.type as AgentMessage["type"],
          timestamp: m.timestamp,
        }));
        console.log(
          `[messageStore] Restored ${msgs.length} messages from Supabase`,
        );
      }

      if (events.length > 0) {
        this.events = events;
        console.log(
          `[messageStore] Restored ${events.length} orchestration events from Supabase`,
        );
      }
    } catch (e) {
      console.warn("[messageStore] Failed to restore from Supabase:", e);
      // Continue with empty state — non-fatal
    }
  }
}

export const messageStore = new MessageStore();
