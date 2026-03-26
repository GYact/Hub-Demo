import { AGENTS, GROUP_LABELS } from "./agents";
import type { AgentGroup } from "./types";
import type { OrgNode, Frame, GroupColor } from "../../types";

/** Stable prefix so we can identify AI Company-generated nodes/frames */
const NODE_PREFIX = "aic-";
const FRAME_PREFIX = "aic-frame-";

/** Map AgentGroup → Frame GroupColor */
const GROUP_COLORS: Record<AgentGroup, GroupColor> = {
  executive: "purple",
  product: "red",
  tech: "blue",
  design: "pink",
  sales: "orange",
  marketing: "yellow",
  hr: "green",
  legal: "cyan",
  operations: "green",
  support: "orange",
};

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

/** Grid layout constants */
const FRAME_GAP = 40;
const NODE_W = 160;
const NODE_H = 100;
const NODE_PAD = 20;
const COLS_PER_ROW = 4;
const FRAME_PAD_TOP = 50;
const FRAME_PAD_SIDE = 20;
const FRAME_PAD_BOTTOM = 20;

export function nodeIdForAgent(agentId: string): string {
  return `${NODE_PREFIX}${agentId}`;
}

export function frameIdForGroup(group: string): string {
  return `${FRAME_PREFIX}${group}`;
}

export function isAiCompanyNode(id: string): boolean {
  return id.startsWith(NODE_PREFIX);
}

export function isAiCompanyFrame(id: string): boolean {
  return id.startsWith(FRAME_PREFIX);
}

interface SyncResult {
  nodes: OrgNode[];
  frames: Frame[];
}

/**
 * Generate OrgNode[] and Frame[] representing the AI Company organization.
 * Uses a grid layout: frames are placed in 2 columns, agents grid inside each frame.
 * @param startX - left origin for the layout
 * @param startY - top origin for the layout
 */
export function generateAiCompanyLayout(
  startX = 100,
  startY = 100,
): SyncResult {
  const nodes: OrgNode[] = [];
  const frames: Frame[] = [];

  // Group agents by group
  const groups = GROUP_ORDER.map((g) => ({
    group: g,
    label: GROUP_LABELS[g] ?? g,
    agents: AGENTS.filter((a) => a.group === g),
    color: GROUP_COLORS[g],
  }));

  let cursorX = startX;
  let cursorY = startY;
  let columnMaxH = 0;
  const LAYOUT_COLS = 2; // 2 frames per row
  let colIndex = 0;

  for (const { group, label, agents, color } of groups) {
    const agentCols = Math.min(agents.length, COLS_PER_ROW);
    const agentRows = Math.ceil(agents.length / COLS_PER_ROW);

    const frameW = agentCols * (NODE_W + NODE_PAD) + FRAME_PAD_SIDE * 2;
    const frameH =
      agentRows * (NODE_H + NODE_PAD) + FRAME_PAD_TOP + FRAME_PAD_BOTTOM;

    const frameId = frameIdForGroup(group);
    const agentNodeIds: string[] = [];

    // Place agent nodes inside the frame
    agents.forEach((agent, i) => {
      const col = i % COLS_PER_ROW;
      const row = Math.floor(i / COLS_PER_ROW);
      const nodeId = nodeIdForAgent(agent.id);
      agentNodeIds.push(nodeId);

      nodes.push({
        id: nodeId,
        title: agent.name,
        subtitle: agent.role,
        type: "ai",
        shape: "card",
        description: agent.systemPrompt.split("\n")[0],
        linkedTo: [],
        position: {
          x: cursorX + FRAME_PAD_SIDE + col * (NODE_W + NODE_PAD) + NODE_W / 2,
          y: cursorY + FRAME_PAD_TOP + row * (NODE_H + NODE_PAD) + NODE_H / 2,
        },
        icon: agent.id,
      });
    });

    frames.push({
      id: frameId,
      label: `${label}（${agents.length}名）`,
      color,
      position: { x: cursorX, y: cursorY },
      width: frameW,
      height: frameH,
      linkedTo: [],
    });

    // Advance cursor
    columnMaxH = Math.max(columnMaxH, frameH);
    colIndex++;
    if (colIndex >= LAYOUT_COLS) {
      colIndex = 0;
      cursorX = startX;
      cursorY += columnMaxH + FRAME_GAP;
      columnMaxH = 0;
    } else {
      cursorX += frameW + FRAME_GAP;
    }
  }

  // Link PM node to all tech group nodes (as the orchestrator)
  const pmNodeId = nodeIdForAgent("pm");
  const pmNode = nodes.find((n) => n.id === pmNodeId);
  if (pmNode) {
    const techAgentIds = AGENTS.filter(
      (a) => a.group === "tech" && a.id !== "pm",
    ).map((a) => nodeIdForAgent(a.id));
    pmNode.linkedTo = techAgentIds;
  }

  // Link CEO to CTO, COO
  const ceoNodeId = nodeIdForAgent("ceo");
  const ceoNode = nodes.find((n) => n.id === ceoNodeId);
  if (ceoNode) {
    ceoNode.linkedTo = [nodeIdForAgent("coo"), nodeIdForAgent("cto")];
  }

  // Link CTO to PM
  const ctoNodeId = nodeIdForAgent("cto");
  const ctoNode = nodes.find((n) => n.id === ctoNodeId);
  if (ctoNode) {
    ctoNode.linkedTo = [pmNodeId];
  }

  return { nodes, frames };
}
