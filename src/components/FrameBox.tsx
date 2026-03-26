import { useRef, useState } from "react";
import { X, GripHorizontal } from "lucide-react";
import type { Frame, Position, GroupColor } from "../types";

interface FrameBoxProps {
  frame: Frame;
  scale: number;
  isLinkingMode?: boolean;
  isSelected?: boolean;
  onPositionChange: (id: string, position: Position) => void;
  onSizeChange: (id: string, width: number, height: number) => void;
  onDelete: (id: string) => void;
  onUpdate: (id: string, updates: Partial<Frame>) => void;
  onClick?: (frameId: string) => void;
}

const colorStyles: Record<GroupColor, { border: string; bg: string; text: string; solid: string }> = {
  blue: { border: "border-sky-400", bg: "bg-sky-400/10", text: "text-sky-600", solid: "bg-sky-500" },
  green: { border: "border-emerald-400", bg: "bg-emerald-400/10", text: "text-emerald-600", solid: "bg-emerald-500" },
  purple: { border: "border-purple-400", bg: "bg-purple-400/10", text: "text-purple-600", solid: "bg-purple-500" },
  orange: { border: "border-orange-400", bg: "bg-orange-400/10", text: "text-orange-600", solid: "bg-orange-500" },
  red: { border: "border-red-400", bg: "bg-red-400/10", text: "text-red-600", solid: "bg-red-500" },
  pink: { border: "border-pink-400", bg: "bg-pink-400/10", text: "text-pink-600", solid: "bg-pink-500" },
  yellow: { border: "border-yellow-400", bg: "bg-yellow-400/10", text: "text-yellow-600", solid: "bg-yellow-500" },
  cyan: { border: "border-cyan-400", bg: "bg-cyan-400/10", text: "text-cyan-600", solid: "bg-cyan-500" },
};

export const FrameBox: React.FC<FrameBoxProps> = ({
  frame,
  scale,
  isLinkingMode = false,
  isSelected = false,
  onPositionChange,
  onSizeChange,
  onDelete,
  onUpdate,
  onClick,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  
  const dragRef = useRef<{
    type: 'move' | 'resize';
    startX: number;
    startY: number;
    frameX: number;
    frameY: number;
    frameWidth: number;
    frameHeight: number;
  } | null>(null);

  const style = colorStyles[frame.color] || colorStyles.blue;

  const handleMoveStart = (clientX: number, clientY: number) => {
    dragRef.current = {
      type: 'move',
      startX: clientX,
      startY: clientY,
      frameX: frame.position.x,
      frameY: frame.position.y,
      frameWidth: frame.width,
      frameHeight: frame.height,
    };
  };

  const handleResizeStart = (clientX: number, clientY: number) => {
    dragRef.current = {
      type: 'resize',
      startX: clientX,
      startY: clientY,
      frameX: frame.position.x,
      frameY: frame.position.y,
      frameWidth: frame.width,
      frameHeight: frame.height,
    };
  };

  const handleMove = (clientX: number, clientY: number) => {
    if (!dragRef.current) return;

    const dx = (clientX - dragRef.current.startX) / scale;
    const dy = (clientY - dragRef.current.startY) / scale;

    if (dragRef.current.type === 'move') {
      onPositionChange(frame.id, {
        x: dragRef.current.frameX + dx,
        y: dragRef.current.frameY + dy,
      });
    } else if (dragRef.current.type === 'resize') {
      const newWidth = Math.max(150, dragRef.current.frameWidth + dx);
      const newHeight = Math.max(100, dragRef.current.frameHeight + dy);
      onSizeChange(frame.id, newWidth, newHeight);
    }
  };

  const handleEnd = () => {
    dragRef.current = null;
  };

  // Mouse events for move (on header bar)
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();

    handleMoveStart(e.clientX, e.clientY);

    const handleMouseMove = (moveEvent: MouseEvent) => {
      handleMove(moveEvent.clientX, moveEvent.clientY);
    };

    const handleMouseUp = () => {
      handleEnd();
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  // Mouse events for resize
  const handleResizeMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();

    handleResizeStart(e.clientX, e.clientY);

    const handleMouseMove = (moveEvent: MouseEvent) => {
      handleMove(moveEvent.clientX, moveEvent.clientY);
    };

    const handleMouseUp = () => {
      handleEnd();
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const handleLabelChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onUpdate(frame.id, { label: e.target.value });
  };

  const handleColorChange = (color: GroupColor) => {
    onUpdate(frame.id, { color });
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    onDelete(frame.id);
  };

  const handleFrameClick = (e: React.MouseEvent) => {
    if (isLinkingMode && onClick) {
      e.stopPropagation();
      e.preventDefault();
      onClick(frame.id);
    }
  };

  return (
    <div
      id={`frame-${frame.id}`}
      onClick={handleFrameClick}
      style={{
        position: 'absolute',
        left: frame.position.x,
        top: frame.position.y,
        width: frame.width,
        height: frame.height,
        pointerEvents: 'auto',
      }}
      className={`${style.border} ${style.bg} border-2 ${isLinkingMode ? 'border-solid cursor-pointer' : 'border-dashed'} rounded-lg transition-all ${
        isSelected ? 'ring-4 ring-cyan-400 shadow-xl' : ''
      } ${isLinkingMode && !isSelected ? 'hover:ring-2 hover:ring-cyan-300' : ''}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Header bar - draggable */}
      <div
        onMouseDown={handleMouseDown}
        className={`absolute top-0 left-0 right-0 h-6 ${style.solid} rounded-t-md cursor-grab active:cursor-grabbing flex items-center justify-between px-2`}
      >
        <div className="flex items-center gap-1">
          <GripHorizontal size={12} className="text-white/70" />
          {isEditing ? (
            <input
              type="text"
              value={frame.label || ''}
              onChange={handleLabelChange}
              onBlur={() => setIsEditing(false)}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Enter') setIsEditing(false);
              }}
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              autoFocus
              className="text-[10px] font-medium px-1 py-0.5 bg-white/90 rounded text-slate-800 outline-none w-24"
              placeholder="Label..."
            />
          ) : (
            <span
              onClick={(e) => {
                e.stopPropagation();
                setIsEditing(true);
              }}
              onMouseDown={(e) => e.stopPropagation()}
              className="text-[10px] font-medium text-white cursor-text truncate max-w-[100px]"
            >
              {frame.label || 'Edit Label'}
            </span>
          )}
        </div>

        {/* Delete button in header */}
        <button
          onClick={handleDeleteClick}
          onMouseDown={(e) => e.stopPropagation()}
          className="p-0.5 hover:bg-white/20 rounded transition-colors"
        >
          <X size={12} className="text-white" />
        </button>
      </div>

      {/* Color picker - visible on hover */}
      {isHovered && (
        <div className="absolute top-8 left-2 flex gap-1 bg-white/90 p-1 rounded shadow-sm">
          {(Object.keys(colorStyles) as GroupColor[]).map((color) => (
            <button
              key={color}
              onClick={(e) => {
                e.stopPropagation();
                handleColorChange(color);
              }}
              className={`w-4 h-4 rounded-full ${colorStyles[color].solid} ${
                frame.color === color ? 'ring-2 ring-offset-1 ring-slate-400' : 'opacity-70 hover:opacity-100'
              }`}
            />
          ))}
        </div>
      )}

      {/* Resize handle */}
      <div
        onMouseDown={handleResizeMouseDown}
        className={`absolute bottom-0 right-0 w-5 h-5 cursor-se-resize ${style.solid} rounded-tl-md rounded-br-md opacity-80 hover:opacity-100 flex items-center justify-center`}
      >
        <div className="w-2 h-2 border-r-2 border-b-2 border-white/70" />
      </div>
    </div>
  );
};
