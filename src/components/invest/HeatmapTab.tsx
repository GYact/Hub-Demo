import { useMemo, useRef, useState, useEffect } from "react";
import type { InvestHolding, StockQuote, ExchangeRate } from "../../types";

interface HeatmapTabProps {
  holdings: InvestHolding[];
  quotes: StockQuote[];
  exchangeRates: ExchangeRate[];
  onSymbolSelect: (symbol: string, name: string) => void;
}

interface TreemapItem {
  symbol: string;
  name: string;
  value: number;
  changePercent: number;
}

interface TreemapRect extends TreemapItem {
  x: number;
  y: number;
  width: number;
  height: number;
}

// --- Color interpolation ---
function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

function interpolateColor(from: string, to: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(from);
  const [r2, g2, b2] = hexToRgb(to);
  return rgbToHex(
    Math.round(r1 + (r2 - r1) * t),
    Math.round(g1 + (g2 - g1) * t),
    Math.round(b1 + (b2 - b1) * t),
  );
}

function getHeatmapColor(changePercent: number): string {
  const clamped = Math.max(-3, Math.min(3, changePercent));
  if (clamped < 0) {
    const t = Math.abs(clamped) / 3;
    return interpolateColor("#94a3b8", "#ef4444", t);
  }
  const t = clamped / 3;
  return interpolateColor("#94a3b8", "#22c55e", t);
}

function getTextColor(changePercent: number): string {
  const abs = Math.abs(changePercent);
  return abs > 1.5 ? "#ffffff" : "#1e293b";
}

// --- Squarified Treemap Layout ---
function worstRatio(row: number[], sideLength: number): number {
  const rowSum = row.reduce((a, b) => a + b, 0);
  if (rowSum === 0 || sideLength === 0) return Infinity;
  const s2 = sideLength * sideLength;
  let worst = 0;
  for (const area of row) {
    const r1 = (s2 * area) / (rowSum * rowSum);
    const r2 = (rowSum * rowSum) / (s2 * area);
    worst = Math.max(worst, r1, r2);
  }
  return worst;
}

function layoutRow(
  row: { item: TreemapItem; area: number }[],
  x: number,
  y: number,
  width: number,
  height: number,
  horizontal: boolean,
): {
  rects: TreemapRect[];
  remainX: number;
  remainY: number;
  remainW: number;
  remainH: number;
} {
  const totalArea = row.reduce((sum, r) => sum + r.area, 0);
  const rects: TreemapRect[] = [];

  if (horizontal) {
    const rowWidth = totalArea / height;
    let cy = y;
    for (const r of row) {
      const h = r.area / rowWidth;
      rects.push({ ...r.item, x, y: cy, width: rowWidth, height: h });
      cy += h;
    }
    return {
      rects,
      remainX: x + rowWidth,
      remainY: y,
      remainW: width - rowWidth,
      remainH: height,
    };
  }
  const rowHeight = totalArea / width;
  let cx = x;
  for (const r of row) {
    const w = r.area / rowHeight;
    rects.push({ ...r.item, x: cx, y, width: w, height: rowHeight });
    cx += w;
  }
  return {
    rects,
    remainX: x,
    remainY: y + rowHeight,
    remainW: width,
    remainH: height - rowHeight,
  };
}

function squarify(
  items: TreemapItem[],
  containerW: number,
  containerH: number,
): TreemapRect[] {
  if (items.length === 0 || containerW <= 0 || containerH <= 0) return [];

  const totalValue = items.reduce((sum, i) => sum + i.value, 0);
  if (totalValue <= 0) return [];

  const totalArea = containerW * containerH;
  const sorted = [...items].sort((a, b) => b.value - a.value);
  const areas = sorted.map((item) => ({
    item,
    area: (item.value / totalValue) * totalArea,
  }));

  const allRects: TreemapRect[] = [];
  let x = 0;
  let y = 0;
  let w = containerW;
  let h = containerH;
  let remaining = [...areas];

  while (remaining.length > 0) {
    const horizontal = w < h;
    const side = horizontal ? h : w;
    const currentRow: typeof areas = [];
    let i = 0;

    // Add items to row while aspect ratio improves
    while (i < remaining.length) {
      const candidate = [...currentRow, remaining[i]];
      const candidateAreas = candidate.map((r) => r.area);
      const currentAreas = currentRow.map((r) => r.area);

      if (currentRow.length === 0) {
        currentRow.push(remaining[i]);
        i++;
        continue;
      }

      const currentWorst = worstRatio(currentAreas, side);
      const candidateWorst = worstRatio(candidateAreas, side);

      if (candidateWorst <= currentWorst) {
        currentRow.push(remaining[i]);
        i++;
      } else {
        break;
      }
    }

    remaining = remaining.slice(i);
    const result = layoutRow(currentRow, x, y, w, h, horizontal);
    allRects.push(...result.rects);
    x = result.remainX;
    y = result.remainY;
    w = result.remainW;
    h = result.remainH;
  }

  return allRects;
}

// --- Component ---
export const HeatmapTab = ({
  holdings,
  quotes,
  exchangeRates,
  onSymbolSelect,
}: HeatmapTabProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(600);
  const [hoveredSymbol, setHoveredSymbol] = useState<string | null>(null);

  const usdJpy = useMemo(() => {
    const rate = exchangeRates.find((r) => r.pair === "USDJPY");
    return rate?.rate ?? 150;
  }, [exchangeRates]);

  const quoteMap = useMemo(() => {
    const m: Record<string, StockQuote> = {};
    for (const q of quotes) m[q.symbol] = q;
    return m;
  }, [quotes]);

  // Build treemap items
  const treemapItems = useMemo<TreemapItem[]>(() => {
    return holdings
      .map((h) => {
        const q = quoteMap[h.symbol];
        const price = q?.price ?? h.avgCost;
        const value = h.quantity * price * (h.market === "US" ? usdJpy : 1);
        return {
          symbol: h.symbol,
          name: h.name,
          value,
          changePercent: q?.changePercent ?? 0,
        };
      })
      .filter((item) => item.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [holdings, quoteMap, usdJpy]);

  // Responsive resize
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    observer.observe(el);
    setContainerWidth(el.clientWidth);
    return () => observer.disconnect();
  }, []);

  const svgHeight = Math.max(300, containerWidth * 0.6);

  const rects = useMemo(
    () => squarify(treemapItems, containerWidth, svgHeight),
    [treemapItems, containerWidth, svgHeight],
  );

  if (holdings.length === 0) {
    return (
      <div className="neu-card p-8 text-center text-sm neu-text-muted">
        ポートフォリオに銘柄を追加するとヒートマップが表示されます
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Color scale legend */}
      <div className="neu-card p-3">
        <div className="flex items-center justify-center gap-2 text-xs">
          <span className="neu-text-muted">-3%</span>
          <div
            className="flex h-3 rounded-sm overflow-hidden"
            style={{ width: 200 }}
          >
            {Array.from({ length: 20 }, (_, i) => {
              const pct = -3 + (6 * i) / 19;
              return (
                <div
                  key={i}
                  className="flex-1"
                  style={{ backgroundColor: getHeatmapColor(pct) }}
                />
              );
            })}
          </div>
          <span className="neu-text-muted">+3%</span>
        </div>
      </div>

      {/* Treemap */}
      <div ref={containerRef} className="neu-card p-2 overflow-hidden">
        <svg
          width={containerWidth}
          height={svgHeight}
          viewBox={`0 0 ${containerWidth} ${svgHeight}`}
          className="block"
        >
          {rects.map((r) => {
            const isHovered = hoveredSymbol === r.symbol;
            const displaySymbol = r.symbol.replace(".T", "");
            const minDim = Math.min(r.width, r.height);
            const showLabel = minDim > 40;
            const showPercent = minDim > 55;
            const showName = r.width > 80 && r.height > 60;
            const fontSize = Math.max(10, Math.min(16, minDim * 0.18));
            const color = getHeatmapColor(r.changePercent);
            const textColor = getTextColor(r.changePercent);

            return (
              <g
                key={r.symbol}
                onClick={() => onSymbolSelect(r.symbol, r.name)}
                onMouseEnter={() => setHoveredSymbol(r.symbol)}
                onMouseLeave={() => setHoveredSymbol(null)}
                className="cursor-pointer"
              >
                <rect
                  x={r.x + 1}
                  y={r.y + 1}
                  width={Math.max(0, r.width - 2)}
                  height={Math.max(0, r.height - 2)}
                  rx={4}
                  fill={color}
                  opacity={isHovered ? 0.85 : 1}
                  stroke={isHovered ? "#3b82f6" : "rgba(255,255,255,0.3)"}
                  strokeWidth={isHovered ? 2 : 1}
                />
                {showLabel && (
                  <>
                    <text
                      x={r.x + r.width / 2}
                      y={
                        r.y +
                        r.height / 2 -
                        (showPercent ? fontSize * 0.5 : 0) -
                        (showName ? fontSize * 0.4 : 0)
                      }
                      textAnchor="middle"
                      dominantBaseline="central"
                      fill={textColor}
                      fontSize={fontSize}
                      fontWeight="bold"
                      fontFamily="monospace"
                    >
                      {displaySymbol}
                    </text>
                    {showPercent && (
                      <text
                        x={r.x + r.width / 2}
                        y={
                          r.y +
                          r.height / 2 +
                          fontSize * 0.5 -
                          (showName ? fontSize * 0.2 : 0)
                        }
                        textAnchor="middle"
                        dominantBaseline="central"
                        fill={textColor}
                        fontSize={fontSize * 0.85}
                        fontWeight="600"
                      >
                        {r.changePercent >= 0 ? "+" : ""}
                        {r.changePercent.toFixed(2)}%
                      </text>
                    )}
                    {showName && (
                      <text
                        x={r.x + r.width / 2}
                        y={r.y + r.height / 2 + fontSize * 1.3}
                        textAnchor="middle"
                        dominantBaseline="central"
                        fill={textColor}
                        fontSize={Math.max(8, fontSize * 0.6)}
                        opacity={0.8}
                      >
                        {r.name.length > 12
                          ? r.name.slice(0, 12) + "…"
                          : r.name}
                      </text>
                    )}
                  </>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Hover detail card */}
      {hoveredSymbol &&
        (() => {
          const item = treemapItems.find((i) => i.symbol === hoveredSymbol);
          if (!item) return null;
          return (
            <div className="neu-card p-3 flex items-center justify-between text-sm">
              <div>
                <span className="font-mono font-bold neu-text-primary">
                  {item.symbol.replace(".T", "")}
                </span>
                <span className="ml-2 neu-text-muted text-xs">{item.name}</span>
              </div>
              <div className="flex items-center gap-4">
                <span className="neu-text-secondary text-xs">
                  ¥
                  {item.value.toLocaleString("ja-JP", {
                    maximumFractionDigits: 0,
                  })}
                </span>
                <span
                  className={`font-medium ${item.changePercent >= 0 ? "text-green-600" : "text-red-600"}`}
                >
                  {item.changePercent >= 0 ? "+" : ""}
                  {item.changePercent.toFixed(2)}%
                </span>
              </div>
            </div>
          );
        })()}
    </div>
  );
};
