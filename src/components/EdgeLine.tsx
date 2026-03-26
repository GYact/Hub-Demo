import { X } from "lucide-react";
import type { Edge, OrgNode, Frame } from "../types";

interface EdgeLineProps {
  edge: Edge;
  nodes: OrgNode[];
  frames: Frame[];
  onDelete: (edgeId: string) => void;
}

// Get node dimensions based on shape
function getNodeDimensions(node: OrgNode): { width: number; height: number } {
  switch (node.shape) {
    case "circle":
      return { width: 128, height: 128 };
    case "group":
      return { width: 192, height: 110 };
    case "card":
    default:
      return { width: 224, height: 110 };
  }
}

// Calculate border point for rectangular nodes
function getRectBorderPoint(
  centerX: number, 
  centerY: number, 
  targetX: number, 
  targetY: number,
  halfWidth: number,
  halfHeight: number
): { x: number; y: number } {
  const dx = targetX - centerX;
  const dy = targetY - centerY;
  
  if (dx === 0 && dy === 0) {
    return { x: centerX, y: centerY };
  }
  
  // Determine which edge the line intersects
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);
  
  // Scale factor to reach the border
  let scale: number;
  
  if (absDx * halfHeight > absDy * halfWidth) {
    // Intersects left or right edge
    scale = halfWidth / absDx;
  } else {
    // Intersects top or bottom edge
    scale = halfHeight / absDy;
  }
  
  return {
    x: centerX + dx * scale,
    y: centerY + dy * scale
  };
}

// Calculate border point for circular nodes
function getCircleBorderPoint(
  centerX: number, 
  centerY: number, 
  targetX: number, 
  targetY: number,
  radius: number
): { x: number; y: number } {
  const dx = targetX - centerX;
  const dy = targetY - centerY;
  const dist = Math.sqrt(dx * dx + dy * dy);
  
  if (dist === 0) {
    return { x: centerX, y: centerY + radius };
  }
  
  return {
    x: centerX + (dx / dist) * radius,
    y: centerY + (dy / dist) * radius
  };
}

// Get element position and dimensions (node or frame)
interface ElementInfo {
  x: number;
  y: number;
  width: number;
  height: number;
  isCircle: boolean;
}

function getElementInfo(
  elementId: string,
  nodes: OrgNode[],
  frames: Frame[]
): ElementInfo | null {
  // Check if it's a frame
  if (elementId.startsWith('frame-')) {
    const frameId = elementId.replace('frame-', '');
    const frame = frames.find(f => f.id === frameId);
    if (!frame) return null;
    // Frame center
    return {
      x: frame.position.x + frame.width / 2,
      y: frame.position.y + frame.height / 2,
      width: frame.width,
      height: frame.height,
      isCircle: false,
    };
  }
  
  // It's a node
  const node = nodes.find(n => n.id === elementId);
  if (!node) return null;
  
  const dim = getNodeDimensions(node);
  return {
    x: node.position.x,
    y: node.position.y,
    width: dim.width,
    height: dim.height,
    isCircle: node.shape === 'circle',
  };
}

export const EdgeLine: React.FC<EdgeLineProps> = ({ edge, nodes, frames, onDelete }) => {
  const sourceInfo = getElementInfo(edge.source, nodes, frames);
  const targetInfo = getElementInfo(edge.target, nodes, frames);
  
  if (!sourceInfo || !targetInfo) return null;
  
  // Element centers
  const x1 = sourceInfo.x;
  const y1 = sourceInfo.y;
  const x2 = targetInfo.x;
  const y2 = targetInfo.y;
  
  // Get border points based on element shape
  let startPoint: { x: number; y: number };
  let endPoint: { x: number; y: number };
  
  if (sourceInfo.isCircle) {
    startPoint = getCircleBorderPoint(x1, y1, x2, y2, sourceInfo.width / 2);
  } else {
    startPoint = getRectBorderPoint(x1, y1, x2, y2, sourceInfo.width / 2, sourceInfo.height / 2);
  }
  
  if (targetInfo.isCircle) {
    endPoint = getCircleBorderPoint(x2, y2, x1, y1, targetInfo.width / 2);
  } else {
    endPoint = getRectBorderPoint(x2, y2, x1, y1, targetInfo.width / 2, targetInfo.height / 2);
  }
  
  // Calculate direction for arrow offset
  const dx = endPoint.x - startPoint.x;
  const dy = endPoint.y - startPoint.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  
  if (dist < 5) return null;
  
  // Shorten the line by arrow size so arrowhead doesn't overlap
  const nx = dx / dist;
  const ny = dy / dist;
  const arrowSize = 8;
  const adjustedEndX = endPoint.x - nx * arrowSize;
  const adjustedEndY = endPoint.y - ny * arrowSize;
  
  // Simple straight line
  const pathD = `M ${startPoint.x} ${startPoint.y} L ${adjustedEndX} ${adjustedEndY}`;
  
  // Midpoint for delete button
  const midX = (startPoint.x + adjustedEndX) / 2;
  const midY = (startPoint.y + adjustedEndY) / 2;

  return (
    <g id={edge.id} className="group" style={{ pointerEvents: 'auto' }}>
      {/* Invisible wider path for easier hover */}
      <path
        d={pathD}
        fill="none"
        stroke="transparent"
        strokeWidth="16"
        className="cursor-pointer"
        style={{ pointerEvents: 'stroke' }}
      />
      
      {/* Visible edge line */}
      <path
        d={pathD}
        fill="none"
        stroke="#475569"
        strokeWidth={2.5}
        strokeLinecap="round"
        className="transition-all duration-200 group-hover:stroke-slate-400"
        markerEnd="url(#arrowhead)"
        style={{ pointerEvents: 'none' }}
      />
      
      {/* Delete button at midpoint */}
      <foreignObject
        x={midX - 10}
        y={midY - 10}
        width={20}
        height={20}
        className="opacity-0 group-hover:opacity-100 transition-opacity duration-200"
        style={{ pointerEvents: 'auto', overflow: 'visible' }}
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            onDelete(edge.id);
          }}
          onMouseDown={(e) => {
            e.stopPropagation();
          }}
          className="w-5 h-5 bg-red-500 hover:bg-red-400 rounded-full flex items-center justify-center shadow-lg transition-colors cursor-pointer"
        >
          <X size={10} className="text-white" />
        </button>
      </foreignObject>
    </g>
  );
};
