import {
  MapPin,
  TrendingUp,
  Minus,
  GitBranch,
  Square,
  Type,
  Ruler,
  Trash2,
  Eye,
  EyeOff,
} from "lucide-react";
import type { InvestChartDrawing, DrawingTool } from "./types";

interface DrawingListProps {
  drawings: InvestChartDrawing[];
  onUpdate: (id: string, updates: Partial<InvestChartDrawing>) => void;
  onRemove: (id: string) => void;
}

const TOOL_ICON: Record<DrawingTool, typeof MapPin> = {
  pin: MapPin,
  trendline: TrendingUp,
  horizontal: Minus,
  fibonacci: GitBranch,
  range: Square,
  text: Type,
  measure: Ruler,
};

const TOOL_LABEL: Record<DrawingTool, string> = {
  pin: "ピン",
  trendline: "トレンドライン",
  horizontal: "水平線",
  fibonacci: "フィボナッチ",
  range: "レンジ",
  text: "テキスト",
  measure: "測定",
};

export const DrawingList = ({
  drawings,
  onUpdate,
  onRemove,
}: DrawingListProps) => {
  if (drawings.length === 0) return null;

  return (
    <div className="space-y-2 mt-3">
      <h4 className="text-xs font-medium neu-text-secondary flex items-center gap-1">
        <MapPin size={12} /> 描画メモ ({drawings.length})
      </h4>
      {drawings.map((d) => {
        const Icon = TOOL_ICON[d.tool];
        return (
          <div
            key={d.id}
            className={`neu-card p-3 flex items-start gap-2 ${!d.visible ? "opacity-40" : ""}`}
          >
            <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
              <div
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: d.color }}
              />
              <Icon size={13} className="neu-text-muted" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 text-xs">
                <span className="neu-text-muted">{TOOL_LABEL[d.tool]}</span>
                {d.points[0] && (
                  <span className="font-mono neu-text-primary">
                    {d.points[0].price.toLocaleString("ja-JP", {
                      maximumFractionDigits: 2,
                    })}
                  </span>
                )}
                {d.createdAt && (
                  <span className="neu-text-muted">
                    {new Date(d.createdAt).toLocaleDateString("ja-JP")}
                  </span>
                )}
              </div>
              <input
                type="text"
                value={d.label}
                onChange={(e) => onUpdate(d.id, { label: e.target.value })}
                className="w-full text-sm bg-transparent border-none outline-none neu-text-primary mt-0.5"
                placeholder="ラベル..."
              />
              <textarea
                value={d.note}
                onChange={(e) => onUpdate(d.id, { note: e.target.value })}
                className="w-full text-xs bg-transparent border-none outline-none neu-text-muted mt-0.5 resize-none"
                placeholder="分析メモ..."
                rows={1}
              />
            </div>
            <div className="flex items-center gap-0.5 shrink-0">
              <button
                onClick={() => onUpdate(d.id, { visible: !d.visible })}
                className="p-1 neu-text-muted hover:neu-text-primary"
                title={d.visible ? "非表示" : "表示"}
              >
                {d.visible ? <Eye size={13} /> : <EyeOff size={13} />}
              </button>
              <button
                onClick={() => onRemove(d.id)}
                className="p-1 neu-text-muted hover:text-red-500"
                title="削除"
              >
                <Trash2 size={13} />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
};
