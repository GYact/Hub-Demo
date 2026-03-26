export type DrawingTool =
  | "pin"
  | "trendline"
  | "horizontal"
  | "fibonacci"
  | "range"
  | "text"
  | "measure";

export interface DrawingPoint {
  time: number;
  price: number;
}

export interface InvestChartDrawing {
  id: string;
  symbol: string;
  tool: DrawingTool;
  points: DrawingPoint[];
  color: string;
  label: string;
  note: string;
  lineWidth: number;
  lineStyle: "solid" | "dashed" | "dotted";
  visible: boolean;
  createdAt?: string;
  updatedAt?: string;
}

/** Hex color palette for drawing tools */
export const DRAWING_COLORS = [
  "#3b82f6", // blue
  "#ef4444", // red
  "#22c55e", // green
  "#f59e0b", // orange
  "#8b5cf6", // purple
] as const;

export const DRAWING_TOOL_META: Record<
  DrawingTool,
  { label: string; pointsNeeded: number; persist: boolean }
> = {
  pin: { label: "ピン", pointsNeeded: 1, persist: true },
  trendline: { label: "トレンドライン", pointsNeeded: 2, persist: true },
  horizontal: { label: "水平線", pointsNeeded: 1, persist: true },
  fibonacci: { label: "フィボナッチ", pointsNeeded: 2, persist: true },
  range: { label: "レンジ", pointsNeeded: 2, persist: true },
  text: { label: "テキスト", pointsNeeded: 1, persist: true },
  measure: { label: "測定", pointsNeeded: 2, persist: false },
};
