import {
  MapPin,
  TrendingUp,
  Minus,
  GitBranch,
  Square,
  Type,
  Ruler,
  Trash2,
} from "lucide-react";
import { DRAWING_COLORS, type DrawingTool } from "./types";

interface DrawingToolbarProps {
  activeTool: DrawingTool | null;
  activeColor: string;
  drawingCount: number;
  onToolSelect: (tool: DrawingTool | null) => void;
  onColorSelect: (color: string) => void;
  onClearAll: () => void;
}

const TOOLS: { tool: DrawingTool; icon: typeof MapPin; label: string }[] = [
  { tool: "pin", icon: MapPin, label: "ピン" },
  { tool: "trendline", icon: TrendingUp, label: "トレンド" },
  { tool: "horizontal", icon: Minus, label: "水平線" },
  { tool: "fibonacci", icon: GitBranch, label: "フィボナッチ" },
  { tool: "range", icon: Square, label: "レンジ" },
  { tool: "text", icon: Type, label: "テキスト" },
  { tool: "measure", icon: Ruler, label: "測定" },
];

export const DrawingToolbar = ({
  activeTool,
  activeColor,
  drawingCount,
  onToolSelect,
  onColorSelect,
  onClearAll,
}: DrawingToolbarProps) => (
  <div className="flex items-center gap-2 flex-wrap">
    {/* Tool buttons */}
    <div className="flex gap-1 flex-wrap">
      {TOOLS.map(({ tool, icon: Icon, label }) => (
        <button
          key={tool}
          onClick={() => onToolSelect(activeTool === tool ? null : tool)}
          className={`flex items-center gap-1 px-2 py-1 text-xs rounded-lg transition-colors ${
            activeTool === tool
              ? "neu-chip-active text-blue-600 font-medium"
              : "neu-chip neu-text-secondary"
          }`}
          title={label}
        >
          <Icon size={13} />
          <span className="hidden sm:inline">{label}</span>
        </button>
      ))}
    </div>

    {/* Color picker */}
    {activeTool && (
      <div className="flex gap-1 items-center ml-1">
        {DRAWING_COLORS.map((c) => (
          <button
            key={c}
            onClick={() => onColorSelect(c)}
            className={`w-5 h-5 rounded-full border-2 transition-all ${
              activeColor === c
                ? "border-gray-600 scale-110"
                : "border-transparent"
            }`}
            style={{ backgroundColor: c }}
          />
        ))}
      </div>
    )}

    {/* Clear all */}
    {drawingCount > 0 && (
      <button
        onClick={onClearAll}
        className="flex items-center gap-1 px-2 py-1 text-xs rounded-lg neu-chip neu-text-muted hover:text-red-500 ml-auto"
        title="全描画を削除"
      >
        <Trash2 size={12} />
        <span className="hidden sm:inline">クリア ({drawingCount})</span>
      </button>
    )}
  </div>
);
