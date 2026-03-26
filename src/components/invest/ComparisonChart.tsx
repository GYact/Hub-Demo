import { useEffect, useRef, useState, useCallback } from "react";
import {
  createChart,
  LineSeries,
  type IChartApi,
  type LineSeriesPartialOptions,
  ColorType,
} from "lightweight-charts";
import { SymbolSearch } from "./SymbolSearch";
import { Plus, X, Loader2 } from "lucide-react";
import type { StockCandle } from "../../types";

const COLORS = [
  "#3b82f6",
  "#ef4444",
  "#22c55e",
  "#f59e0b",
  "#8b5cf6",
  "#ec4899",
];

interface ComparisonEntry {
  symbol: string;
  name: string;
  color: string;
  candles: StockCandle[];
}

interface ComparisonChartProps {
  fetchChart: (
    symbol: string,
    range?: string,
    interval?: string,
  ) => Promise<StockCandle[]>;
  searchFn: (q: string) => Promise<
    {
      symbol: string;
      name: string;
      type: string;
      exchange: string;
      market: "JP" | "US";
    }[]
  >;
}

// Normalize candles to % change from first candle
const normalizeCandles = (candles: StockCandle[]) => {
  if (candles.length === 0) return [];
  const base = candles[0].close;
  if (base === 0) return [];
  return candles.map((c) => ({
    time: c.time as unknown as string,
    value: ((c.close - base) / base) * 100,
  }));
};

export const ComparisonChart = ({
  fetchChart,
  searchFn,
}: ComparisonChartProps) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const [entries, setEntries] = useState<ComparisonEntry[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleAdd = useCallback(
    async (symbol: string, name: string) => {
      if (entries.find((e) => e.symbol === symbol)) return;
      setIsAdding(false);
      setIsLoading(true);
      try {
        const candles = await fetchChart(symbol, "6mo", "1d");
        const color = COLORS[entries.length % COLORS.length];
        setEntries((prev) => [...prev, { symbol, name, color, candles }]);
      } finally {
        setIsLoading(false);
      }
    },
    [entries, fetchChart],
  );

  const handleRemove = useCallback((symbol: string) => {
    setEntries((prev) => prev.filter((e) => e.symbol !== symbol));
  }, []);

  // Render chart
  useEffect(() => {
    if (!chartContainerRef.current) return;
    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }

    if (entries.length === 0) return;

    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: 300,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#64748b",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: "#e2e8f0" },
        horzLines: { color: "#e2e8f0" },
      },
      rightPriceScale: {
        borderVisible: false,
      },
      timeScale: {
        borderVisible: false,
        timeVisible: false,
      },
    });
    chartRef.current = chart;

    for (const entry of entries) {
      const options: LineSeriesPartialOptions = {
        color: entry.color,
        lineWidth: 2,
        priceFormat: {
          type: "custom",
          formatter: (v: number) => `${v.toFixed(1)}%`,
        },
      };
      const series = chart.addSeries(LineSeries, options);
      series.setData(normalizeCandles(entry.candles));
    }

    chart.timeScale().fitContent();

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
      chartRef.current = null;
    };
  }, [entries]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        {entries.map((e) => (
          <div
            key={e.symbol}
            className="flex items-center gap-1.5 px-2 py-1 rounded-lg neu-pressed text-xs"
          >
            <div
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: e.color }}
            />
            <span className="font-mono font-medium">{e.symbol}</span>
            <button
              onClick={() => handleRemove(e.symbol)}
              className="p-0.5 hover:text-red-500 neu-text-muted"
            >
              <X size={12} />
            </button>
          </div>
        ))}
        {entries.length < 6 && (
          <button
            onClick={() => setIsAdding(true)}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs neu-btn neu-text-secondary"
          >
            <Plus size={12} /> 追加
          </button>
        )}
        {isLoading && (
          <Loader2 size={14} className="animate-spin neu-text-muted" />
        )}
      </div>

      {isAdding && (
        <div className="neu-card p-3">
          <SymbolSearch
            onSelect={(sym, name) => void handleAdd(sym, name)}
            searchFn={searchFn}
            placeholder="比較する銘柄を検索..."
          />
          <button
            onClick={() => setIsAdding(false)}
            className="mt-2 text-xs neu-text-muted"
          >
            キャンセル
          </button>
        </div>
      )}

      {entries.length > 0 ? (
        <div
          ref={chartContainerRef}
          className="w-full rounded-xl overflow-hidden"
        />
      ) : (
        <div className="text-center text-sm neu-text-muted py-12">
          銘柄を追加して値動きを比較しましょう
        </div>
      )}
    </div>
  );
};
