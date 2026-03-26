import { useRef } from "react";
import {
  Bot,
  User,
  Building2,
  Briefcase,
  Megaphone,
  Lightbulb,
  Package,
  Zap,
} from "lucide-react";
import type { OrgNode, Position } from "../types";

interface NodeCardProps {
  node: OrgNode;
  isSelected: boolean;
  isMultiSelected?: boolean;
  isLinkingMode: boolean;
  scale: number;
  automationCount?: number;
  onSelect: (id: string, isMultiSelect?: boolean) => void;
  onPositionChange: (id: string, position: Position, delta: Position) => void;
}

const DRAG_THRESHOLD = 5;
const LONG_PRESS_DURATION = 350;
const TOUCH_MOVE_THRESHOLD = 10;

// Get icon for group nodes
const getGroupIcon = (title: string) => {
  if (title.includes("Management") || title.includes("Administration"))
    return <Building2 size={14} className="md:w-[18px] md:h-[18px]" />;
  if (title.includes("Product") || title.includes("Development"))
    return <Briefcase size={14} className="md:w-[18px] md:h-[18px]" />;
  if (title.includes("Sales") || title.includes("PR"))
    return <Megaphone size={14} className="md:w-[18px] md:h-[18px]" />;
  if (title.includes("R&D") || title.includes("Knowledge"))
    return <Lightbulb size={14} className="md:w-[18px] md:h-[18px]" />;
  return <Bot size={14} className="md:w-[18px] md:h-[18px]" />;
};

export const NodeCard: React.FC<NodeCardProps> = ({
  node,
  isSelected,
  isMultiSelected = false,
  isLinkingMode,
  scale,
  automationCount = 0,
  onSelect,
  onPositionChange,
}) => {
  const dragRef = useRef<{
    startX: number;
    startY: number;
    nodeX: number;
    nodeY: number;
    hasMoved: boolean;
    shiftKey: boolean;
  } | null>(null);
  const touchStateRef = useRef<{
    startX: number;
    startY: number;
    hasMoved: boolean;
    longPressActive: boolean;
  } | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleStart = (
    clientX: number,
    clientY: number,
    shiftKey: boolean = false,
  ) => {
    dragRef.current = {
      startX: clientX,
      startY: clientY,
      nodeX: node.position.x,
      nodeY: node.position.y,
      hasMoved: false,
      shiftKey,
    };
  };

  const handleMove = (clientX: number, clientY: number) => {
    if (!dragRef.current) return;

    const dx = clientX - dragRef.current.startX;
    const dy = clientY - dragRef.current.startY;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance > DRAG_THRESHOLD) {
      dragRef.current.hasMoved = true;
    }

    if (dragRef.current.hasMoved) {
      const newPosition = {
        x: dragRef.current.nodeX + dx / scale,
        y: dragRef.current.nodeY + dy / scale,
      };
      // ドラッグ開始からの累積delta
      const delta = {
        x: dx / scale,
        y: dy / scale,
      };
      onPositionChange(node.id, newPosition, delta);
      // 開始位置は更新しない（累積deltaを維持）
    }
  };

  const handleEnd = () => {
    if (dragRef.current && !dragRef.current.hasMoved) {
      onSelect(node.id, dragRef.current.shiftKey);
    }
    dragRef.current = null;
  };

  // Mouse events
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();

    handleStart(e.clientX, e.clientY, e.shiftKey);

    const handleMouseMove = (moveEvent: MouseEvent) => {
      handleMove(moveEvent.clientX, moveEvent.clientY);
    };

    const handleMouseUp = () => {
      handleEnd();
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  // Touch events for mobile
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length > 1) {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
      touchStateRef.current = null;
      dragRef.current = null;
      return;
    }
    e.stopPropagation();
    const touch = e.touches[0];
    touchStateRef.current = {
      startX: touch.clientX,
      startY: touch.clientY,
      hasMoved: false,
      longPressActive: false,
    };

    longPressTimerRef.current = setTimeout(() => {
      if (!touchStateRef.current) return;
      touchStateRef.current.longPressActive = true;
      handleStart(
        touchStateRef.current.startX,
        touchStateRef.current.startY,
        false,
      );
      longPressTimerRef.current = null;
      if (navigator.vibrate) {
        navigator.vibrate(30);
      }
    }, LONG_PRESS_DURATION);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStateRef.current) return;
    if (e.touches.length > 1) {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
      touchStateRef.current = null;
      dragRef.current = null;
      return;
    }
    const touch = e.touches[0];
    const dx = touch.clientX - touchStateRef.current.startX;
    const dy = touch.clientY - touchStateRef.current.startY;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (!touchStateRef.current.longPressActive) {
      if (distance > TOUCH_MOVE_THRESHOLD) {
        touchStateRef.current.hasMoved = true;
        if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current);
          longPressTimerRef.current = null;
        }
      }
      return;
    }

    e.preventDefault();
    handleMove(touch.clientX, touch.clientY);
  };

  const handleTouchEnd = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }

    if (!touchStateRef.current) return;

    if (touchStateRef.current.longPressActive) {
      if (dragRef.current) {
        dragRef.current.hasMoved = true;
      }
      handleEnd();
    } else if (!touchStateRef.current.hasMoved) {
      onSelect(node.id, false);
    }
    touchStateRef.current = null;
  };

  const handleTouchCancel = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    if (dragRef.current) {
      dragRef.current.hasMoved = true;
    }
    touchStateRef.current = null;
    handleEnd();
  };

  // Multi-select ring style
  const multiSelectRing = isMultiSelected
    ? "ring-4 ring-sky-400 ring-offset-2 ring-offset-slate-100"
    : "";

  // Circle node (for CEO/Human)
  if (node.shape === "circle") {
    return (
      <div
        id={`node-${node.id}`}
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchCancel}
        style={{
          position: "absolute",
          left: node.position.x,
          top: node.position.y,
          transform: "translate(-50%, -50%)",
          pointerEvents: "auto",
        }}
        className={`
          w-24 h-24 md:w-32 md:h-32 rounded-full border-4 flex flex-col items-center justify-center text-center
          cursor-grab active:cursor-grabbing select-none transition-shadow touch-none
          ${isSelected ? "ring-4 ring-sky-400 shadow-2xl" : "hover:shadow-xl"}
          ${isLinkingMode ? "animate-pulse ring-2 ring-cyan-500/50 cursor-pointer" : ""}
          ${multiSelectRing}
          bg-slate-100 border-slate-400 text-slate-800
        `}
      >
        <User size={16} className="md:w-5 md:h-5 text-slate-600 mb-1" />
        <div className="text-xs md:text-sm font-bold leading-tight px-1">
          {node.title}
        </div>
        {node.subtitle && (
          <div className="text-[7px] md:text-[9px] text-slate-500 mt-0.5 leading-tight px-2 hidden sm:block">
            {node.subtitle}
          </div>
        )}
      </div>
    );
  }

  // Group node (department cards)
  if (node.shape === "group") {
    const colorStyles: Record<string, { bg: string; header: string }> = {
      blue: { bg: "bg-sky-50 border-sky-600", header: "bg-sky-600" },
      green: {
        bg: "bg-emerald-50 border-emerald-600",
        header: "bg-emerald-600",
      },
      purple: { bg: "bg-purple-50 border-purple-600", header: "bg-purple-600" },
      orange: { bg: "bg-orange-50 border-orange-600", header: "bg-orange-600" },
      red: { bg: "bg-red-50 border-red-600", header: "bg-red-600" },
      pink: { bg: "bg-pink-50 border-pink-600", header: "bg-pink-600" },
      yellow: { bg: "bg-yellow-50 border-yellow-600", header: "bg-yellow-600" },
      cyan: { bg: "bg-cyan-50 border-cyan-600", header: "bg-cyan-600" },
    };
    const style = colorStyles[node.groupColor || "blue"] || colorStyles.blue;
    const bgColor = style.bg;
    const headerBg = style.header;

    return (
      <div
        id={`node-${node.id}`}
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchCancel}
        style={{
          position: "absolute",
          left: node.position.x,
          top: node.position.y,
          transform: "translate(-50%, -50%)",
          pointerEvents: "auto",
        }}
        className={`
          w-36 md:w-48 rounded-lg border-2 overflow-hidden
          cursor-grab active:cursor-grabbing select-none transition-shadow touch-none
          ${isSelected ? "ring-4 ring-sky-400 shadow-2xl" : "hover:shadow-xl"}
          ${isLinkingMode ? "animate-pulse ring-2 ring-cyan-500/50 cursor-pointer" : ""}
          ${multiSelectRing}
          ${bgColor}
        `}
      >
        <div className={`${headerBg} text-white px-2 md:px-3 py-2 md:py-3`}>
          <div className="flex items-center gap-1.5 md:gap-2">
            {getGroupIcon(node.title)}
            <span className="font-bold text-xs md:text-sm truncate">
              {node.title}
            </span>
          </div>
          {node.subtitle && (
            <div className="text-[8px] md:text-[10px] opacity-80 mt-0.5 truncate">
              {node.subtitle}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Item card node
  if (node.type === "item") {
    return (
      <div
        id={`node-${node.id}`}
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchCancel}
        style={{
          position: "absolute",
          left: node.position.x,
          top: node.position.y,
          transform: "translate(-50%, -50%)",
          pointerEvents: "auto",
        }}
        className={`
          w-40 md:w-56 rounded-xl border-2 overflow-hidden
          cursor-grab active:cursor-grabbing select-none transition-shadow touch-none
          ${isSelected ? "ring-4 ring-amber-400 shadow-2xl" : "hover:shadow-xl"}
          ${isLinkingMode ? "animate-pulse ring-2 ring-cyan-500/50 cursor-pointer" : ""}
          ${multiSelectRing}
          bg-amber-900/80 border-amber-600
        `}
      >
        <div className="bg-amber-700 text-white px-3 md:px-4 py-3 md:py-4">
          <div className="flex items-center gap-1.5 md:gap-2">
            <Package
              size={14}
              className="md:w-[18px] md:h-[18px] text-amber-200 shrink-0"
            />
            <span className="font-bold text-xs md:text-sm truncate">
              {node.title}
            </span>
          </div>
          {node.subtitle && (
            <div className="text-[8px] md:text-[10px] text-amber-200 mt-0.5 md:mt-1 truncate">
              {node.subtitle}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Standard card node (AI Operations Manager, etc.)
  return (
    <div
      id={`node-${node.id}`}
      onMouseDown={handleMouseDown}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchCancel}
      style={{
        position: "absolute",
        left: node.position.x,
        top: node.position.y,
        transform: "translate(-50%, -50%)",
        pointerEvents: "auto",
      }}
      className={`
        w-40 md:w-56 rounded-xl border-2 overflow-hidden
        cursor-grab active:cursor-grabbing select-none transition-shadow touch-none
        ${isSelected ? "ring-4 ring-sky-400 shadow-2xl" : "hover:shadow-xl"}
        ${isLinkingMode ? "animate-pulse ring-2 ring-cyan-500/50 cursor-pointer" : ""}
        ${multiSelectRing}
        bg-slate-800 border-slate-600
      `}
    >
      <div className="bg-slate-700 text-white px-3 md:px-4 py-3 md:py-4">
        <div className="flex items-center gap-1.5 md:gap-2">
          <Bot
            size={14}
            className="md:w-[18px] md:h-[18px] text-indigo-400 shrink-0"
          />
          <span className="font-bold text-xs md:text-sm truncate">
            {node.title}
          </span>
          {automationCount > 0 && (
            <span className="ml-auto flex items-center gap-0.5 bg-indigo-500/30 text-indigo-300 text-[9px] md:text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0">
              <Zap size={9} className="md:w-[10px] md:h-[10px]" />
              {automationCount}
            </span>
          )}
        </div>
        {node.subtitle && (
          <div className="text-[8px] md:text-[10px] text-slate-300 mt-0.5 md:mt-1 truncate">
            {node.subtitle}
          </div>
        )}
      </div>
    </div>
  );
};
