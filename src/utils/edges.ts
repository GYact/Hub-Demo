import type { OrgNode, Frame, Edge } from "../types";

// Generate edges from linkedTo (nodes and frames)
export const generateEdges = (nodes: OrgNode[], frames: Frame[] = []): Edge[] => {
  const edges: Edge[] = [];
  
  // Edges from nodes
  nodes.forEach(node => {
    node.linkedTo.forEach(targetId => {
      edges.push({
        id: `edge:${node.id}:${targetId}`,
        source: node.id,
        target: targetId
      });
    });
  });
  
  // Edges from frames
  frames.forEach(frame => {
    (frame.linkedTo || []).forEach(targetId => {
      edges.push({
        id: `edge:frame-${frame.id}:${targetId}`,
        source: `frame-${frame.id}`,
        target: targetId
      });
    });
  });
  
  return edges;
};
