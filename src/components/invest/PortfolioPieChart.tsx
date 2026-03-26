import { useMemo } from "react";
import type { InvestHolding, StockQuote } from "../../types";

const COLORS = [
  "#3b82f6",
  "#ef4444",
  "#22c55e",
  "#f59e0b",
  "#8b5cf6",
  "#ec4899",
  "#06b6d4",
  "#f97316",
  "#14b8a6",
  "#6366f1",
];

interface PortfolioPieChartProps {
  holdings: InvestHolding[];
  quotes: StockQuote[];
}

interface Slice {
  symbol: string;
  name: string;
  value: number;
  percent: number;
  color: string;
}

export const PortfolioPieChart = ({
  holdings,
  quotes,
}: PortfolioPieChartProps) => {
  const quoteMap = useMemo(() => {
    const m: Record<string, StockQuote> = {};
    for (const q of quotes) m[q.symbol] = q;
    return m;
  }, [quotes]);

  const slices = useMemo<Slice[]>(() => {
    const items = holdings
      .map((h) => {
        const price = quoteMap[h.symbol]?.price ?? h.avgCost;
        return {
          symbol: h.symbol,
          name: h.name,
          value: h.quantity * price,
        };
      })
      .filter((s) => s.value > 0)
      .sort((a, b) => b.value - a.value);

    const total = items.reduce((sum, s) => sum + s.value, 0);
    if (total === 0) return [];

    return items.map((s, i) => ({
      ...s,
      percent: (s.value / total) * 100,
      color: COLORS[i % COLORS.length],
    }));
  }, [holdings, quoteMap]);

  if (slices.length === 0) {
    return (
      <div className="text-center text-sm neu-text-muted py-8">
        保有銘柄がありません
      </div>
    );
  }

  // Build SVG pie chart paths
  const paths = useMemo(() => {
    const result: { d: string; color: string }[] = [];
    let startAngle = -Math.PI / 2;
    const cx = 80;
    const cy = 80;
    const r = 70;

    for (const slice of slices) {
      const angle = (slice.percent / 100) * 2 * Math.PI;
      const endAngle = startAngle + angle;
      const largeArc = angle > Math.PI ? 1 : 0;

      const x1 = cx + r * Math.cos(startAngle);
      const y1 = cy + r * Math.sin(startAngle);
      const x2 = cx + r * Math.cos(endAngle);
      const y2 = cy + r * Math.sin(endAngle);

      if (slices.length === 1) {
        result.push({
          d: `M ${cx},${cy - r} A ${r},${r} 0 1,1 ${cx - 0.01},${cy - r} Z`,
          color: slice.color,
        });
      } else {
        result.push({
          d: `M ${cx},${cy} L ${x1},${y1} A ${r},${r} 0 ${largeArc},1 ${x2},${y2} Z`,
          color: slice.color,
        });
      }
      startAngle = endAngle;
    }
    return result;
  }, [slices]);

  return (
    <div className="flex flex-col sm:flex-row items-center gap-4">
      <svg viewBox="0 0 160 160" className="w-36 h-36 shrink-0">
        {paths.map((p, i) => (
          <path key={i} d={p.d} fill={p.color} stroke="white" strokeWidth={1} />
        ))}
        {/* Center hole for donut */}
        <circle cx={80} cy={80} r={40} fill="white" className="opacity-90" />
      </svg>
      <div className="flex-1 space-y-1 text-xs w-full">
        {slices.map((s) => (
          <div key={s.symbol} className="flex items-center gap-2">
            <div
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: s.color }}
            />
            <span className="font-mono neu-text-primary">{s.symbol}</span>
            <span className="flex-1 truncate neu-text-muted">{s.name}</span>
            <span className="shrink-0 neu-text-secondary font-medium">
              {s.percent.toFixed(1)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};
