import { useRef, useEffect, useMemo } from "react";
import {
  createChart,
  type IChartApi,
  CandlestickSeries,
  LineSeries,
  HistogramSeries,
  type CandlestickSeriesPartialOptions,
  type LineSeriesPartialOptions,
  type HistogramSeriesPartialOptions,
  ColorType,
  createSeriesMarkers,
  type SeriesMarker,
  type ISeriesApi,
  type SeriesType,
  type Time,
} from "lightweight-charts";
import type { StockCandle } from "../../types";
import {
  calcSMA,
  calcRSI,
  calcMACD,
  calcBollingerBands,
} from "../../lib/technicalIndicators";
import type { InvestChartDrawing, DrawingTool } from "./chartDrawings/types";
import { createDrawingPrimitive } from "./chartDrawings/primitives";

interface Indicators {
  sma20?: boolean;
  sma50?: boolean;
  rsi?: boolean;
  macd?: boolean;
  bb?: boolean;
}

interface StockChartProps {
  candles: StockCandle[];
  indicators?: Indicators;
  height?: number;
  drawings?: InvestChartDrawing[];
  activeTool?: DrawingTool | null;
  onChartClick?: (time: number, price: number) => void;
}

// Neumorphism-inspired chart theme
const CHART_COLORS = {
  background: "#f0f4f8",
  textColor: "#718096",
  gridColor: "rgba(163, 177, 198, 0.2)",
  upColor: "#22c55e",
  downColor: "#ef4444",
  sma20Color: "#3b82f6",
  sma50Color: "#f59e0b",
  rsiColor: "#8b5cf6",
  macdColor: "#3b82f6",
  signalColor: "#f97316",
  histUpColor: "rgba(34, 197, 94, 0.5)",
  histDownColor: "rgba(239, 68, 68, 0.5)",
  bbUpperColor: "rgba(124, 58, 237, 0.5)",
  bbLowerColor: "rgba(124, 58, 237, 0.5)",
  bbMiddleColor: "rgba(124, 58, 237, 0.8)",
};

export const StockChart = ({
  candles,
  indicators = {},
  height = 400,
  drawings = [],
  activeTool = null,
  onChartClick,
}: StockChartProps) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<SeriesType, Time> | null>(null);
  const rsiContainerRef = useRef<HTMLDivElement>(null);
  const rsiChartRef = useRef<IChartApi | null>(null);
  const macdContainerRef = useRef<HTMLDivElement>(null);
  const macdChartRef = useRef<IChartApi | null>(null);

  const closes = useMemo(() => candles.map((c) => c.close), [candles]);

  // Pin drawings (handled by markers)
  const pinDrawings = useMemo(
    () => drawings.filter((d) => d.tool === "pin" && d.visible),
    [drawings],
  );

  // Non-pin drawings (handled by primitives)
  const primDrawings = useMemo(
    () => drawings.filter((d) => d.tool !== "pin" && d.visible),
    [drawings],
  );

  // Main chart
  useEffect(() => {
    const container = chartContainerRef.current;
    if (!container || candles.length === 0) return;

    const chart = createChart(container, {
      width: container.clientWidth,
      height,
      layout: {
        background: { type: ColorType.Solid, color: CHART_COLORS.background },
        textColor: CHART_COLORS.textColor,
      },
      grid: {
        vertLines: { color: CHART_COLORS.gridColor },
        horzLines: { color: CHART_COLORS.gridColor },
      },
      crosshair: { mode: 0 },
      timeScale: { timeVisible: true, secondsVisible: false },
    });
    chartRef.current = chart;

    // Candlestick series
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: CHART_COLORS.upColor,
      downColor: CHART_COLORS.downColor,
      borderUpColor: CHART_COLORS.upColor,
      borderDownColor: CHART_COLORS.downColor,
      wickUpColor: CHART_COLORS.upColor,
      wickDownColor: CHART_COLORS.downColor,
    } as CandlestickSeriesPartialOptions);
    candleSeriesRef.current = candleSeries;

    candleSeries.setData(
      candles.map((c) => ({
        time: c.time as unknown as string,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      })),
    );

    // Pin markers
    if (pinDrawings.length > 0) {
      const markers: SeriesMarker<string>[] = pinDrawings
        .sort((a, b) => a.points[0].time - b.points[0].time)
        .map((d) => ({
          time: d.points[0].time as unknown as string,
          position: "aboveBar" as const,
          shape: "circle" as const,
          color: d.color,
          text: d.label || "📌",
          id: d.id,
        }));
      createSeriesMarkers(candleSeries, markers);
    }

    // Primitive-based drawings (trendline, horizontal, fibonacci, etc.)
    for (const d of primDrawings) {
      const prim = createDrawingPrimitive(d);
      if (prim) {
        candleSeries.attachPrimitive(prim);
      }
    }

    // Volume
    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "volume",
    } as HistogramSeriesPartialOptions);
    volumeSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    });
    volumeSeries.setData(
      candles.map((c) => ({
        time: c.time as unknown as string,
        value: c.volume,
        color:
          c.close >= c.open
            ? "rgba(34, 197, 94, 0.3)"
            : "rgba(239, 68, 68, 0.3)",
      })),
    );

    // SMA overlays
    if (indicators.sma20) {
      const sma20Data = calcSMA(closes, 20);
      const sma20Series = chart.addSeries(LineSeries, {
        color: CHART_COLORS.sma20Color,
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
      } as LineSeriesPartialOptions);
      sma20Series.setData(
        sma20Data
          .map((v, i) =>
            v !== null
              ? { time: candles[i].time as unknown as string, value: v }
              : null,
          )
          .filter(Boolean) as { time: string; value: number }[],
      );
    }

    if (indicators.sma50) {
      const sma50Data = calcSMA(closes, 50);
      const sma50Series = chart.addSeries(LineSeries, {
        color: CHART_COLORS.sma50Color,
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
      } as LineSeriesPartialOptions);
      sma50Series.setData(
        sma50Data
          .map((v, i) =>
            v !== null
              ? { time: candles[i].time as unknown as string, value: v }
              : null,
          )
          .filter(Boolean) as { time: string; value: number }[],
      );
    }

    // Bollinger Bands overlay
    if (indicators.bb) {
      const bbData = calcBollingerBands(closes, 20, 2);
      const bbLineOpts = {
        lineWidth: 1 as const,
        priceLineVisible: false,
        lastValueVisible: false,
      };
      const upperSeries = chart.addSeries(LineSeries, {
        ...bbLineOpts,
        color: CHART_COLORS.bbUpperColor,
        lineStyle: 2, // dashed
      } as LineSeriesPartialOptions);
      upperSeries.setData(
        bbData.upper
          .map((v, i) =>
            v !== null
              ? { time: candles[i].time as unknown as string, value: v }
              : null,
          )
          .filter(Boolean) as { time: string; value: number }[],
      );

      const middleSeries = chart.addSeries(LineSeries, {
        ...bbLineOpts,
        color: CHART_COLORS.bbMiddleColor,
      } as LineSeriesPartialOptions);
      middleSeries.setData(
        bbData.middle
          .map((v, i) =>
            v !== null
              ? { time: candles[i].time as unknown as string, value: v }
              : null,
          )
          .filter(Boolean) as { time: string; value: number }[],
      );

      const lowerSeries = chart.addSeries(LineSeries, {
        ...bbLineOpts,
        color: CHART_COLORS.bbLowerColor,
        lineStyle: 2, // dashed
      } as LineSeriesPartialOptions);
      lowerSeries.setData(
        bbData.lower
          .map((v, i) =>
            v !== null
              ? { time: candles[i].time as unknown as string, value: v }
              : null,
          )
          .filter(Boolean) as { time: string; value: number }[],
      );
    }

    chart.timeScale().fitContent();

    // Click handler for drawing tools
    if (activeTool && onChartClick) {
      chart.subscribeClick((param) => {
        if (!param.time || !param.point) return;
        const price = candleSeries.coordinateToPrice(param.point.y);
        if (price == null) return;
        onChartClick(param.time as unknown as number, price as number);
      });
    }

    // Resize observer
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
      candleSeriesRef.current = null;
    };
  }, [
    candles,
    closes,
    height,
    indicators.sma20,
    indicators.sma50,
    indicators.bb,
    pinDrawings,
    primDrawings,
    activeTool,
    onChartClick,
  ]);

  // RSI chart
  useEffect(() => {
    const container = rsiContainerRef.current;
    if (!container || !indicators.rsi || candles.length === 0) return;

    const chart = createChart(container, {
      width: container.clientWidth,
      height: 100,
      layout: {
        background: { type: ColorType.Solid, color: CHART_COLORS.background },
        textColor: CHART_COLORS.textColor,
      },
      grid: {
        vertLines: { color: CHART_COLORS.gridColor },
        horzLines: { color: CHART_COLORS.gridColor },
      },
      timeScale: { visible: false },
    });
    rsiChartRef.current = chart;

    const rsiData = calcRSI(closes);
    const rsiSeries = chart.addSeries(LineSeries, {
      color: CHART_COLORS.rsiColor,
      lineWidth: 1,
      priceLineVisible: false,
    } as LineSeriesPartialOptions);
    rsiSeries.setData(
      rsiData
        .map((v, i) =>
          v !== null
            ? { time: candles[i].time as unknown as string, value: v }
            : null,
        )
        .filter(Boolean) as { time: string; value: number }[],
    );

    // RSI overbought/oversold lines
    rsiSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.05, bottom: 0.05 },
    });

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        chart.applyOptions({ width: entry.contentRect.width });
      }
    });
    observer.observe(container);

    return () => {
      observer.disconnect();
      chart.remove();
      rsiChartRef.current = null;
    };
  }, [candles, closes, indicators.rsi]);

  // MACD chart
  useEffect(() => {
    const container = macdContainerRef.current;
    if (!container || !indicators.macd || candles.length === 0) return;

    const chart = createChart(container, {
      width: container.clientWidth,
      height: 120,
      layout: {
        background: { type: ColorType.Solid, color: CHART_COLORS.background },
        textColor: CHART_COLORS.textColor,
      },
      grid: {
        vertLines: { color: CHART_COLORS.gridColor },
        horzLines: { color: CHART_COLORS.gridColor },
      },
      timeScale: { visible: false },
    });
    macdChartRef.current = chart;

    const macdResult = calcMACD(closes);

    // MACD line
    const macdSeries = chart.addSeries(LineSeries, {
      color: CHART_COLORS.macdColor,
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
    } as LineSeriesPartialOptions);
    macdSeries.setData(
      macdResult.macd
        .map((v, i) =>
          v !== null
            ? { time: candles[i].time as unknown as string, value: v }
            : null,
        )
        .filter(Boolean) as { time: string; value: number }[],
    );

    // Signal line
    const signalSeries = chart.addSeries(LineSeries, {
      color: CHART_COLORS.signalColor,
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
    } as LineSeriesPartialOptions);
    signalSeries.setData(
      macdResult.signal
        .map((v, i) =>
          v !== null
            ? { time: candles[i].time as unknown as string, value: v }
            : null,
        )
        .filter(Boolean) as { time: string; value: number }[],
    );

    // Histogram
    const histSeries = chart.addSeries(HistogramSeries, {
      priceLineVisible: false,
      lastValueVisible: false,
    } as HistogramSeriesPartialOptions);
    histSeries.setData(
      macdResult.histogram
        .map((v, i) =>
          v !== null
            ? {
                time: candles[i].time as unknown as string,
                value: v,
                color:
                  v >= 0
                    ? CHART_COLORS.histUpColor
                    : CHART_COLORS.histDownColor,
              }
            : null,
        )
        .filter(Boolean) as {
        time: string;
        value: number;
        color: string;
      }[],
    );

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        chart.applyOptions({ width: entry.contentRect.width });
      }
    });
    observer.observe(container);

    return () => {
      observer.disconnect();
      chart.remove();
      macdChartRef.current = null;
    };
  }, [candles, closes, indicators.macd]);

  if (candles.length === 0) {
    return (
      <div className="neu-card p-8 flex items-center justify-center neu-text-muted text-sm">
        銘柄を検索してチャートを表示
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <div
        ref={chartContainerRef}
        className={`neu-card rounded-xl overflow-hidden ${activeTool ? "cursor-crosshair" : ""}`}
      />
      {indicators.rsi && (
        <div className="relative">
          <span className="absolute top-1 left-2 text-[10px] font-medium neu-text-muted z-10">
            RSI(14)
          </span>
          <div
            ref={rsiContainerRef}
            className="neu-card rounded-xl overflow-hidden"
          />
        </div>
      )}
      {indicators.macd && (
        <div className="relative">
          <span className="absolute top-1 left-2 text-[10px] font-medium neu-text-muted z-10">
            MACD(12,26,9)
          </span>
          <div
            ref={macdContainerRef}
            className="neu-card rounded-xl overflow-hidden"
          />
        </div>
      )}
    </div>
  );
};
