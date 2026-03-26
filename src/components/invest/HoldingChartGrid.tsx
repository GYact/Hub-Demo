import { useState, useEffect, useRef, useMemo } from "react";
import {
  createChart,
  type IChartApi,
  LineSeries,
  ColorType,
  type LineSeriesPartialOptions,
} from "lightweight-charts";
import { Loader2 } from "lucide-react";
import type { InvestHolding, StockCandle, StockQuote } from "../../types";

interface HoldingChartGridProps {
  holdings: InvestHolding[];
  quotes: StockQuote[];
  fetchChart: (
    symbol: string,
    range: string,
    interval: string,
  ) => Promise<StockCandle[]>;
  onSelect: (symbol: string, name: string) => void;
}

/** Mini sparkline chart for a single holding */
const MiniChart = ({
  holding,
  quote,
  fetchChart,
  onSelect,
}: {
  holding: InvestHolding;
  quote: StockQuote | undefined;
  fetchChart: HoldingChartGridProps["fetchChart"];
  onSelect: HoldingChartGridProps["onSelect"];
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const [candles, setCandles] = useState<StockCandle[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchChart(holding.symbol, "1mo", "1d")
      .then((data) => {
        if (!cancelled) setCandles(data);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [holding.symbol, fetchChart]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || candles.length === 0) return;

    const chart = createChart(container, {
      width: container.clientWidth,
      height: 80,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "transparent",
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { visible: false },
      },
      rightPriceScale: { visible: false },
      timeScale: { visible: false },
      crosshair: {
        vertLine: { visible: false },
        horzLine: { visible: false },
      },
      handleScroll: false,
      handleScale: false,
    });
    chartRef.current = chart;

    const first = candles[0].close;
    const last = candles[candles.length - 1].close;
    const color = last >= first ? "#22c55e" : "#ef4444";

    const series = chart.addSeries(LineSeries, {
      color,
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
    } as LineSeriesPartialOptions);

    series.setData(
      candles.map((c) => ({
        time: c.time as unknown as string,
        value: c.close,
      })),
    );

    chart.timeScale().fitContent();

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        chart.applyOptions({ width: entry.contentRect.width });
      }
    });
    observer.observe(container);

    return () => {
      observer.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, [candles]);

  const pnl = quote ? (quote.price - holding.avgCost) * holding.quantity : null;
  const pnlPct =
    holding.avgCost > 0 && quote
      ? ((quote.price - holding.avgCost) / holding.avgCost) * 100
      : null;

  return (
    <button
      type="button"
      onClick={() => onSelect(holding.symbol, holding.name)}
      className="neu-card p-3 rounded-xl text-left hover:shadow-md transition-shadow cursor-pointer w-full"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-1">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-xs font-bold neu-text-primary truncate">
              {holding.symbol.replace(".T", "")}
            </span>
            <span
              className={`text-[9px] px-1 rounded ${holding.market === "JP" ? "bg-red-50 text-red-500" : "bg-blue-50 text-blue-500"}`}
            >
              {holding.market}
            </span>
          </div>
          <div className="text-[10px] neu-text-muted truncate">
            {holding.name}
          </div>
        </div>
        {quote && (
          <div className="text-right shrink-0 ml-2">
            <div className="text-xs font-medium neu-text-primary">
              {quote.price.toLocaleString("ja-JP", {
                maximumFractionDigits: 2,
              })}
            </div>
            <div
              className={`text-[10px] ${quote.changePercent >= 0 ? "text-green-600" : "text-red-600"}`}
            >
              {quote.changePercent >= 0 ? "+" : ""}
              {quote.changePercent.toFixed(2)}%
            </div>
          </div>
        )}
      </div>

      {/* Chart */}
      <div ref={containerRef} className="w-full rounded overflow-hidden">
        {loading && candles.length === 0 && (
          <div className="h-[80px] flex items-center justify-center">
            <Loader2 size={14} className="animate-spin neu-text-muted" />
          </div>
        )}
      </div>

      {/* PnL footer */}
      {pnl !== null && holding.quantity > 0 && (
        <div className="flex items-center justify-between mt-1 text-[10px]">
          <span className="neu-text-muted">
            {holding.quantity.toLocaleString()} 株
          </span>
          <span
            className={`font-medium ${pnl >= 0 ? "text-green-600" : "text-red-600"}`}
          >
            {pnl >= 0 ? "+" : ""}
            {pnl.toLocaleString("ja-JP", { maximumFractionDigits: 0 })}
            {pnlPct !== null && (
              <span className="ml-1">
                ({pnlPct >= 0 ? "+" : ""}
                {pnlPct.toFixed(1)}%)
              </span>
            )}
          </span>
        </div>
      )}
    </button>
  );
};

export const HoldingChartGrid = ({
  holdings,
  quotes,
  fetchChart,
  onSelect,
}: HoldingChartGridProps) => {
  const quoteMap = useMemo(() => {
    const map: Record<string, StockQuote> = {};
    for (const q of quotes) map[q.symbol] = q;
    return map;
  }, [quotes]);

  if (holdings.length === 0) {
    return (
      <div className="neu-card p-8 text-center text-sm neu-text-muted">
        ポートフォリオに銘柄を追加するとここにチャートが表示されます
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {holdings.map((h) => (
        <MiniChart
          key={h.id}
          holding={h}
          quote={quoteMap[h.symbol]}
          fetchChart={fetchChart}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
};
