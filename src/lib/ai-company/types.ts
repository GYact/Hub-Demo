export type AgentGroup =
  | "executive"
  | "product"
  | "tech"
  | "design"
  | "sales"
  | "marketing"
  | "hr"
  | "legal"
  | "operations"
  | "support";

export type AgentStatus = "idle" | "thinking" | "working" | "talking";

export type Platform = "x" | "note" | "general";

export interface AgentDef {
  id: string;
  name: string;
  nameEn: string;
  role: string;
  roleEn: string;
  group: AgentGroup;
  gender: "male" | "female";
  systemPrompt: string;
  appearance: CharacterAppearance;
}

export interface CharacterAppearance {
  hairColor: string;
  hairStyle: string;
  eyeColor: string;
  skinTone: string;
  accentColor: string;
  bgGradient: [string, string];
}

export interface AgentMessage {
  id: string;
  fromAgentId: string;
  toAgentId: string | "all" | "group";
  content: string;
  timestamp: number;
  type: "chat" | "task" | "report" | "system";
}

export interface AgentState {
  agentId: string;
  status: AgentStatus;
  currentTask: string | null;
  terminalLines: TerminalLine[];
}

export interface TerminalLine {
  id: string;
  text: string;
  type: "input" | "output" | "system" | "error" | "agent-msg";
  timestamp: number;
}

export interface OrchestrateEvent {
  type:
    | "agent-start"
    | "agent-output"
    | "agent-done"
    | "message"
    | "task-complete"
    | "approval-required"
    | "question"
    | "error";
  agentId: string;
  content: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface PostData {
  id: string;
  platform: Platform;
  content: string;
  agentId: string;
  agentName: string;
  topic: string;
  timestamp: number;
  status: "generating" | "ready";
}
