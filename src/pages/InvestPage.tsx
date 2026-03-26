import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  createChart,
  type IChartApi,
  LineSeries,
  ColorType,
} from "lightweight-charts";
import {
  CandlestickChart,
  Briefcase,
  Eye,
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Loader2,
  Bot,
  History,
  BarChart3,
  Newspaper,
  GitCompareArrows,
  Upload,
  LayoutDashboard,
  TrendingUp,
  TrendingDown,
  Grid2x2,
} from "lucide-react";
import { Layout } from "../components/Layout";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { useInvestments } from "../hooks/useInvestments";
import { useStockData } from "../hooks/useStockData";
import { StockChart } from "../components/invest/StockChart";
import { SymbolSearch } from "../components/invest/SymbolSearch";
import { InvestAiPanel } from "../components/invest/InvestAiPanel";
import { ComparisonChart } from "../components/invest/ComparisonChart";
import { AlertManager } from "../components/invest/AlertManager";
import { HistoryTab } from "../components/invest/HistoryTab";
import { ReportTab } from "../components/invest/ReportTab";
import { NewsTab } from "../components/invest/NewsTab";
import { HoldingChartGrid } from "../components/invest/HoldingChartGrid";
import { HeatmapTab } from "../components/invest/HeatmapTab";
import { DrawingToolbar } from "../components/invest/chartDrawings/DrawingToolbar";
import { DrawingList } from "../components/invest/chartDrawings/DrawingList";
import {
  CsvImportDialog,
  type CsvHolding,
} from "../components/invest/CsvImportDialog";
import {
  DRAWING_TOOL_META,
  DRAWING_COLORS,
  type DrawingTool,
  type DrawingPoint,
  type InvestChartDrawing,
} from "../components/invest/chartDrawings/types";
import type {
  InvestPortfolio,
  InvestHolding,
  InvestMarket,
  InvestAiContext,
  InvestTransaction,
  InvestWatchlistItem,
  StockQuote,
  StockCandle,
  StockFinancials,
  ExchangeRate,
} from "../types";
import { PortfolioPieChart } from "../components/invest/PortfolioPieChart";

type InvestTab =
  | "dashboard"
  | "chart"
  | "portfolio"
  | "watchlist"
  | "history"
  | "report"
  | "news"
  | "heatmap";

const RANGE_OPTIONS = [
  { value: "1d", label: "1D" },
  { value: "5d", label: "5D" },
  { value: "1mo", label: "1M" },
  { value: "3mo", label: "3M" },
  { value: "6mo", label: "6M" },
  { value: "1y", label: "1Y" },
  { value: "5y", label: "5Y" },
] as const;

const INTERVAL_MAP: Record<string, string> = {
  "1d": "5m",
  "5d": "15m",
  "1mo": "1d",
  "3mo": "1d",
  "6mo": "1d",
  "1y": "1wk",
  "5y": "1wk",
};

// --- Chart Tab ---
const ChartTab = ({
  symbol,
  symbolName,
  range,
  candles,
  quotes,
  indicators,
  isLoadingChart,
  drawings,
  onAddDrawing,
  onUpdateDrawing,
  onRemoveDrawing,
  onClearAllDrawings,
  searchFn,
  onSymbolSelect,
  onRangeChange,
  onToggleIndicator,
}: {
  symbol: string;
  symbolName: string;
  range: string;
  candles: StockCandle[];
  quotes: StockQuote[];
  indicators: {
    sma20: boolean;
    sma50: boolean;
    rsi: boolean;
    macd: boolean;
    bb: boolean;
  };
  isLoadingChart: boolean;
  drawings: InvestChartDrawing[];
  onAddDrawing: (
    d: Omit<InvestChartDrawing, "id" | "createdAt" | "updatedAt">,
  ) => void;
  onUpdateDrawing: (id: string, updates: Partial<InvestChartDrawing>) => void;
  onRemoveDrawing: (id: string) => void;
  onClearAllDrawings: () => void;
  searchFn: (q: string) => Promise<
    {
      symbol: string;
      name: string;
      type: string;
      exchange: string;
      market: "JP" | "US";
    }[]
  >;
  onSymbolSelect: (sym: string, name: string) => void;
  onRangeChange: (r: string) => void;
  onToggleIndicator: (key: "sma20" | "sma50" | "rsi" | "macd" | "bb") => void;
}) => {
  const [activeTool, setActiveTool] = useState<DrawingTool | null>(null);
  const [activeColor, setActiveColor] = useState<string>(DRAWING_COLORS[0]);
  const [pendingPoint, setPendingPoint] = useState<DrawingPoint | null>(null);

  // Esc key to cancel drawing mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setActiveTool(null);
        setPendingPoint(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleChartClick = useCallback(
    (time: number, price: number) => {
      if (!activeTool || !symbol) return;

      const meta = DRAWING_TOOL_META[activeTool];
      const point: DrawingPoint = { time, price };

      if (meta.pointsNeeded === 1) {
        // 1点ツール: pin, horizontal, text
        let label = "";
        if (activeTool === "text") {
          label = window.prompt("テキストを入力:") || "";
          if (!label) return;
        }
        onAddDrawing({
          symbol,
          tool: activeTool,
          points: [point],
          color: activeColor,
          label,
          note: "",
          lineWidth: 1,
          lineStyle: "solid",
          visible: true,
        });
      } else {
        // 2点ツール: trendline, fibonacci, range, measure
        if (!pendingPoint) {
          setPendingPoint(point);
        } else {
          onAddDrawing({
            symbol,
            tool: activeTool,
            points: [pendingPoint, point],
            color: activeColor,
            label: "",
            note: "",
            lineWidth: 1,
            lineStyle: "solid",
            visible: true,
          });
          setPendingPoint(null);
        }
      }
    },
    [activeTool, symbol, activeColor, pendingPoint, onAddDrawing],
  );

  const handleToolSelect = useCallback((tool: DrawingTool | null) => {
    setActiveTool(tool);
    setPendingPoint(null);
  }, []);

  return (
    <div className="space-y-4">
      <SymbolSearch
        onSelect={onSymbolSelect}
        searchFn={searchFn}
        placeholder=""
      />

      {!symbol && (
        <div className="neu-card p-8 text-center text-sm neu-text-muted">
          銘柄を検索してチャートデータを表示してください
        </div>
      )}

      {symbol && (
        <>
          <div className="flex items-center justify-between">
            <div>
              <span className="font-mono font-bold text-lg neu-text-primary">
                {symbol}
              </span>
              {symbolName && (
                <span className="ml-2 text-sm neu-text-secondary">
                  {symbolName}
                </span>
              )}
            </div>
            {isLoadingChart && (
              <Loader2 size={16} className="animate-spin neu-text-muted" />
            )}
          </div>

          {/* Quote info */}
          {(() => {
            const q = quotes.find((qt) => qt.symbol === symbol);
            const lastCandle =
              candles.length > 0 ? candles[candles.length - 1] : null;
            if (!q && !lastCandle) return null;
            return (
              <div className="flex items-center gap-3 flex-wrap text-xs">
                {q && (
                  <>
                    <span className="text-lg font-bold neu-text-primary">
                      {q.price.toLocaleString("ja-JP", {
                        maximumFractionDigits: 2,
                      })}
                    </span>
                    <span
                      className={`font-medium ${q.change >= 0 ? "text-green-600" : "text-red-600"}`}
                    >
                      {q.change >= 0 ? "+" : ""}
                      {q.change.toFixed(2)} ({q.changePercent >= 0 ? "+" : ""}
                      {q.changePercent.toFixed(2)}%)
                    </span>
                  </>
                )}
                {lastCandle && (
                  <span className="neu-text-muted">
                    O:{lastCandle.open.toLocaleString()} H:
                    {lastCandle.high.toLocaleString()} L:
                    {lastCandle.low.toLocaleString()} V:
                    {lastCandle.volume.toLocaleString()}
                  </span>
                )}
              </div>
            );
          })()}

          {/* Range selector */}
          <div className="flex gap-1 flex-wrap">
            {RANGE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => onRangeChange(opt.value)}
                className={`px-3 py-1 text-xs rounded-lg transition-colors ${
                  range === opt.value
                    ? "neu-chip-active text-blue-600 font-medium"
                    : "neu-chip neu-text-secondary"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Indicator toggles */}
          <div className="flex gap-1 flex-wrap">
            {(
              [
                { key: "sma20" as const, label: "SMA20" },
                { key: "sma50" as const, label: "SMA50" },
                { key: "bb" as const, label: "BB" },
                { key: "rsi" as const, label: "RSI" },
                { key: "macd" as const, label: "MACD" },
              ] as const
            ).map((ind) => (
              <button
                key={ind.key}
                onClick={() => onToggleIndicator(ind.key)}
                className={`px-3 py-1 text-xs rounded-lg transition-colors ${
                  indicators[ind.key]
                    ? "neu-chip-active text-indigo-600 font-medium"
                    : "neu-chip neu-text-secondary"
                }`}
              >
                {ind.label}
              </button>
            ))}
          </div>

          {/* Drawing toolbar */}
          <DrawingToolbar
            activeTool={activeTool}
            activeColor={activeColor}
            drawingCount={drawings.length}
            onToolSelect={handleToolSelect}
            onColorSelect={setActiveColor}
            onClearAll={onClearAllDrawings}
          />

          {/* Pending point hint */}
          {pendingPoint && activeTool && (
            <div className="text-xs neu-text-muted text-center">
              2点目をクリックしてください（Escでキャンセル）
            </div>
          )}

          <StockChart
            candles={candles}
            indicators={indicators}
            drawings={drawings}
            activeTool={activeTool}
            onChartClick={handleChartClick}
          />

          {/* Drawing list */}
          <DrawingList
            drawings={drawings}
            onUpdate={onUpdateDrawing}
            onRemove={onRemoveDrawing}
          />
        </>
      )}
    </div>
  );
};

// --- Portfolio Tab ---
const PortfolioTab = ({
  portfolios,
  holdings,
  quotes,
  isLoading,
  onAddPortfolio,
  onUpdatePortfolio,
  onRemovePortfolio,
  onAddHolding,
  onUpdateHolding,
  onRemoveHolding,
  onImportCsv,
  searchFn,
  onRefreshQuotes,
}: {
  portfolios: InvestPortfolio[];
  holdings: InvestHolding[];
  quotes: StockQuote[];
  isLoading: boolean;
  onAddPortfolio: (name?: string) => Promise<string | undefined>;
  onUpdatePortfolio: (id: string, updates: Partial<InvestPortfolio>) => void;
  onRemovePortfolio: (id: string) => Promise<void>;
  onAddHolding: (
    portfolioId: string,
    symbol: string,
    name: string,
    market: InvestMarket,
  ) => Promise<void>;
  onUpdateHolding: (id: string, updates: Partial<InvestHolding>) => void;
  onRemoveHolding: (id: string) => Promise<void>;
  onImportCsv: (holdings: CsvHolding[], portfolioName: string) => Promise<void>;
  searchFn: (q: string) => Promise<
    {
      symbol: string;
      name: string;
      type: string;
      exchange: string;
      market: "JP" | "US";
    }[]
  >;
  onRefreshQuotes: () => void;
}) => {
  const [expandedPf, setExpandedPf] = useState<string | null>(null);
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [showCsvImport, setShowCsvImport] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{
    type: "portfolio" | "holding";
    id: string;
    name: string;
  } | null>(null);

  const quoteMap = useMemo(() => {
    const map: Record<string, StockQuote> = {};
    for (const q of quotes) map[q.symbol] = q;
    return map;
  }, [quotes]);

  // Total metrics across all portfolios
  const totalMetrics = useMemo(() => {
    let totalValue = 0;
    let totalCost = 0;
    let dailyChange = 0;
    for (const h of holdings) {
      const q = quoteMap[h.symbol];
      const price = q?.price ?? h.avgCost;
      totalValue += h.quantity * price;
      totalCost += h.quantity * h.avgCost;
      if (q) dailyChange += h.quantity * q.change;
    }
    const pnl = totalValue - totalCost;
    const pnlPct = totalCost > 0 ? (pnl / totalCost) * 100 : 0;
    const prevTotal = totalValue - dailyChange;
    const dailyPct = prevTotal > 0 ? (dailyChange / prevTotal) * 100 : 0;
    return { totalValue, totalCost, pnl, pnlPct, dailyChange, dailyPct };
  }, [holdings, quoteMap]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 size={24} className="animate-spin neu-text-muted" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Total summary card */}
      {holdings.length > 0 && (
        <div className="neu-card p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs neu-text-muted">運用総額</div>
              <div className="text-xl font-bold neu-text-primary">
                ¥
                {totalMetrics.totalValue.toLocaleString("ja-JP", {
                  maximumFractionDigits: 0,
                })}
              </div>
            </div>
            <div className="text-right">
              <div
                className={`text-sm font-medium flex items-center gap-1 justify-end ${totalMetrics.dailyChange >= 0 ? "text-green-600" : "text-red-600"}`}
              >
                {totalMetrics.dailyChange >= 0 ? (
                  <TrendingUp size={14} />
                ) : (
                  <TrendingDown size={14} />
                )}
                {totalMetrics.dailyChange >= 0 ? "+" : ""}
                {totalMetrics.dailyChange.toLocaleString("ja-JP", {
                  maximumFractionDigits: 0,
                })}
                円 ({totalMetrics.dailyPct >= 0 ? "+" : ""}
                {totalMetrics.dailyPct.toFixed(2)}%)
              </div>
              <div
                className={`text-xs ${totalMetrics.pnl >= 0 ? "text-green-600" : "text-red-600"}`}
              >
                評価損益 {totalMetrics.pnl >= 0 ? "+" : ""}
                {totalMetrics.pnl.toLocaleString("ja-JP", {
                  maximumFractionDigits: 0,
                })}
                円 ({totalMetrics.pnlPct >= 0 ? "+" : ""}
                {totalMetrics.pnlPct.toFixed(1)}%)
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => onAddPortfolio()}
            className="neu-btn px-4 py-2 rounded-xl text-sm flex items-center gap-2 neu-text-primary"
          >
            <Plus size={16} /> ポートフォリオ追加
          </button>
          <button
            onClick={() => setShowCsvImport(true)}
            className="neu-btn px-4 py-2 rounded-xl text-sm flex items-center gap-2 neu-text-secondary"
            title="SBI証券CSVインポート"
          >
            <Upload size={16} /> CSVインポート
          </button>
        </div>
        <button
          onClick={onRefreshQuotes}
          className="p-2 neu-btn rounded-lg neu-text-muted hover:neu-text-secondary"
          title="価格更新"
        >
          <RefreshCw size={16} />
        </button>
      </div>

      {/* CSV Import Dialog */}
      <CsvImportDialog
        isOpen={showCsvImport}
        onClose={() => setShowCsvImport(false)}
        onImport={onImportCsv}
      />

      {portfolios.length === 0 && (
        <div className="neu-card p-8 text-center text-sm neu-text-muted">
          ポートフォリオを作成して保有銘柄を管理しましょう
        </div>
      )}

      {portfolios.map((pf) => {
        const pfHoldings = holdings.filter((h) => h.portfolioId === pf.id);
        const isExpanded = expandedPf === pf.id;

        // Calculate total value
        let totalCost = 0;
        let totalValue = 0;
        for (const h of pfHoldings) {
          totalCost += h.quantity * h.avgCost;
          const quote = quoteMap[h.symbol];
          totalValue += h.quantity * (quote?.price ?? h.avgCost);
        }
        const pnl = totalValue - totalCost;
        const pnlPercent = totalCost > 0 ? (pnl / totalCost) * 100 : 0;

        return (
          <div key={pf.id} className="neu-card overflow-hidden">
            {/* Portfolio header */}
            <div className="p-4 flex items-center gap-3">
              <button
                onClick={() => setExpandedPf(isExpanded ? null : pf.id)}
                className="p-1 neu-text-muted hover:neu-text-secondary"
              >
                {isExpanded ? (
                  <ChevronUp size={18} />
                ) : (
                  <ChevronDown size={18} />
                )}
              </button>
              <div className="flex-1 min-w-0">
                <input
                  type="text"
                  value={pf.name}
                  onChange={(e) =>
                    onUpdatePortfolio(pf.id, { name: e.target.value })
                  }
                  className="font-medium neu-text-primary bg-transparent border-none outline-none w-full"
                  placeholder="ポートフォリオ名"
                />
              </div>
              <div className="text-right shrink-0">
                {pfHoldings.length > 0 && (
                  <>
                    <div className="text-sm font-medium neu-text-primary">
                      {totalValue.toLocaleString("ja-JP", {
                        maximumFractionDigits: 0,
                      })}
                    </div>
                    <div
                      className={`text-xs ${pnl >= 0 ? "text-green-600" : "text-red-600"}`}
                    >
                      {pnl >= 0 ? "+" : ""}
                      {pnl.toLocaleString("ja-JP", {
                        maximumFractionDigits: 0,
                      })}{" "}
                      ({pnlPercent >= 0 ? "+" : ""}
                      {pnlPercent.toFixed(1)}%)
                    </div>
                  </>
                )}
              </div>
              <button
                onClick={() =>
                  setDeleteTarget({
                    type: "portfolio",
                    id: pf.id,
                    name: pf.name || "このポートフォリオ",
                  })
                }
                className="p-2 neu-text-muted hover:text-red-500"
              >
                <Trash2 size={16} />
              </button>
            </div>

            {/* Expanded: Holdings list */}
            {isExpanded && (
              <div className="px-4 pb-4 space-y-2">
                {pfHoldings.map((h) => {
                  const quote = quoteMap[h.symbol];
                  const currentPrice = quote?.price ?? 0;
                  const marketValue =
                    currentPrice > 0 ? currentPrice * h.quantity : 0;
                  const hPnl =
                    currentPrice > 0
                      ? (currentPrice - h.avgCost) * h.quantity
                      : 0;
                  const hPnlPct =
                    h.avgCost > 0 && currentPrice > 0
                      ? ((currentPrice - h.avgCost) / h.avgCost) * 100
                      : 0;

                  return (
                    <div
                      key={h.id}
                      className="flex items-center gap-3 p-3 rounded-xl bg-white/50"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm font-medium neu-text-primary">
                            {h.symbol}
                          </span>
                          <span
                            className={`text-[10px] px-1 rounded ${h.market === "JP" ? "bg-red-50 text-red-500" : "bg-blue-50 text-blue-500"}`}
                          >
                            {h.market}
                          </span>
                        </div>
                        <div className="text-xs neu-text-muted truncate">
                          {h.name}
                        </div>
                        {/* Current price + daily change */}
                        {quote && (
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-sm font-medium neu-text-primary">
                              {quote.price.toLocaleString("ja-JP", {
                                maximumFractionDigits: 2,
                              })}
                            </span>
                            <span
                              className={`text-[10px] font-medium ${quote.changePercent >= 0 ? "text-green-600" : "text-red-600"}`}
                            >
                              {quote.change >= 0 ? "+" : ""}
                              {quote.change.toFixed(0)}円 (
                              {quote.changePercent >= 0 ? "+" : ""}
                              {quote.changePercent.toFixed(2)}%)
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-right text-xs shrink-0">
                        <div>
                          <div className="neu-text-muted">数量</div>
                          <input
                            type="number"
                            value={h.quantity || ""}
                            onChange={(e) =>
                              onUpdateHolding(h.id, {
                                quantity:
                                  e.target.value === ""
                                    ? 0
                                    : Number(e.target.value),
                              })
                            }
                            className="w-16 text-right text-xs bg-transparent border-b border-slate-200 outline-none neu-text-primary"
                          />
                        </div>
                        <div>
                          <div className="neu-text-muted">取得単価</div>
                          <input
                            type="number"
                            value={h.avgCost || ""}
                            onChange={(e) =>
                              onUpdateHolding(h.id, {
                                avgCost:
                                  e.target.value === ""
                                    ? 0
                                    : Number(e.target.value),
                              })
                            }
                            className="w-20 text-right text-xs bg-transparent border-b border-slate-200 outline-none neu-text-primary"
                          />
                        </div>
                        <div>
                          <div className="neu-text-muted">時価評価額</div>
                          <div className="font-medium neu-text-primary">
                            {marketValue > 0
                              ? marketValue.toLocaleString("ja-JP", {
                                  maximumFractionDigits: 0,
                                })
                              : "—"}
                          </div>
                        </div>
                        <div>
                          <div className="neu-text-muted">損益</div>
                          <div
                            className={`font-medium ${hPnl >= 0 ? "text-green-600" : "text-red-600"}`}
                          >
                            {currentPrice > 0
                              ? `${hPnl >= 0 ? "+" : ""}${hPnl.toLocaleString("ja-JP", { maximumFractionDigits: 0 })}`
                              : "—"}
                          </div>
                          {currentPrice > 0 && (
                            <div
                              className={`text-[10px] ${hPnlPct >= 0 ? "text-green-600" : "text-red-600"}`}
                            >
                              {hPnlPct >= 0 ? "+" : ""}
                              {hPnlPct.toFixed(1)}%
                            </div>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() =>
                          setDeleteTarget({
                            type: "holding",
                            id: h.id,
                            name: `${h.symbol} (${h.name})`,
                          })
                        }
                        className="p-1 neu-text-muted hover:text-red-500 shrink-0"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  );
                })}

                {/* Add holding */}
                {addingTo === pf.id ? (
                  <div className="p-3 rounded-xl bg-white/50">
                    <SymbolSearch
                      onSelect={async (sym, name, market) => {
                        await onAddHolding(pf.id, sym, name, market);
                        setAddingTo(null);
                      }}
                      searchFn={searchFn}
                      placeholder="追加する銘柄を検索..."
                    />
                    <button
                      onClick={() => setAddingTo(null)}
                      className="mt-2 text-xs neu-text-muted hover:neu-text-secondary"
                    >
                      キャンセル
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setAddingTo(pf.id)}
                    className="w-full py-2 text-sm neu-text-muted hover:neu-text-secondary flex items-center justify-center gap-1"
                  >
                    <Plus size={14} /> 銘柄を追加
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Delete confirm dialog */}
      {deleteTarget && (
        <ConfirmDialog
          isOpen
          title={`${deleteTarget.type === "portfolio" ? "ポートフォリオ" : "銘柄"}を削除`}
          message={`「${deleteTarget.name}」を削除しますか？${deleteTarget.type === "portfolio" ? "含まれる全ての銘柄も削除されます。" : ""}`}
          onConfirm={async () => {
            if (deleteTarget.type === "portfolio") {
              await onRemovePortfolio(deleteTarget.id);
            } else {
              await onRemoveHolding(deleteTarget.id);
            }
            setDeleteTarget(null);
          }}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
};

// --- Watchlist Tab ---
const WatchlistTab = ({
  watchlist,
  quotes,
  holdings,
  exchangeRates,
  isLoading,
  onAdd,
  onRemove,
  searchFn,
  onRefreshQuotes,
}: {
  watchlist: {
    id: string;
    symbol: string;
    name: string;
    market: InvestMarket;
  }[];
  quotes: StockQuote[];
  holdings: InvestHolding[];
  exchangeRates: ExchangeRate[];
  isLoading: boolean;
  onAdd: (symbol: string, name: string, market: InvestMarket) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
  searchFn: (q: string) => Promise<
    {
      symbol: string;
      name: string;
      type: string;
      exchange: string;
      market: "JP" | "US";
    }[]
  >;
  onRefreshQuotes: () => void;
}) => {
  const [isAdding, setIsAdding] = useState(false);

  const quoteMap = useMemo(() => {
    const map: Record<string, StockQuote> = {};
    for (const q of quotes) map[q.symbol] = q;
    return map;
  }, [quotes]);

  const holdingMap = useMemo(() => {
    const map: Record<
      string,
      { totalQty: number; avgCost: number; market: InvestMarket }
    > = {};
    for (const h of holdings) {
      const prev = map[h.symbol];
      if (prev) {
        const newQty = prev.totalQty + h.quantity;
        prev.avgCost =
          newQty > 0
            ? (prev.totalQty * prev.avgCost + h.quantity * h.avgCost) / newQty
            : 0;
        prev.totalQty = newQty;
      } else {
        map[h.symbol] = {
          totalQty: h.quantity,
          avgCost: h.avgCost,
          market: h.market,
        };
      }
    }
    return map;
  }, [holdings]);

  const usdJpy = useMemo(() => {
    const rate = exchangeRates.find((r) => r.pair === "USDJPY");
    return rate?.rate ?? 150;
  }, [exchangeRates]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 size={24} className="animate-spin neu-text-muted" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button
          onClick={() => setIsAdding(true)}
          className="neu-btn px-4 py-2 rounded-xl text-sm flex items-center gap-2 neu-text-primary"
        >
          <Plus size={16} /> 銘柄を追加
        </button>
        <button
          onClick={onRefreshQuotes}
          className="p-2 neu-btn rounded-lg neu-text-muted hover:neu-text-secondary"
          title="価格更新"
        >
          <RefreshCw size={16} />
        </button>
      </div>

      {isAdding && (
        <div className="neu-card p-4 rounded-xl">
          <SymbolSearch
            onSelect={async (sym, name, market) => {
              await onAdd(sym, name, market);
              setIsAdding(false);
            }}
            searchFn={searchFn}
          />
          <button
            onClick={() => setIsAdding(false)}
            className="mt-2 text-xs neu-text-muted"
          >
            キャンセル
          </button>
        </div>
      )}

      {watchlist.length === 0 && !isAdding && (
        <div className="neu-card p-8 text-center text-sm neu-text-muted">
          ウォッチリストに銘柄を追加して価格を監視しましょう
        </div>
      )}

      <div className="space-y-2">
        {watchlist.map((item) => {
          const quote = quoteMap[item.symbol];
          const holding = holdingMap[item.symbol];
          const hasHolding = holding != null && holding.totalQty > 0;

          let marketValue: number | null = null;
          let pnl: number | null = null;
          let pnlPct: number | null = null;
          if (hasHolding && quote) {
            const fx = item.market === "US" ? usdJpy : 1;
            marketValue = quote.price * holding.totalQty * fx;
            const costTotal = holding.avgCost * holding.totalQty * fx;
            pnl = marketValue - costTotal;
            pnlPct = costTotal > 0 ? (pnl / costTotal) * 100 : 0;
          }

          return (
            <div
              key={item.id}
              className={`neu-card p-4 ${hasHolding ? "border-l-2 border-blue-400" : ""}`}
            >
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    {hasHolding && (
                      <Briefcase size={12} className="text-blue-500 shrink-0" />
                    )}
                    <span className="font-mono font-medium text-sm neu-text-primary">
                      {item.symbol}
                    </span>
                    <span
                      className={`text-[10px] px-1 rounded ${item.market === "JP" ? "bg-red-50 text-red-500" : "bg-blue-50 text-blue-500"}`}
                    >
                      {item.market}
                    </span>
                  </div>
                  <div className="text-xs neu-text-muted truncate">
                    {item.name}
                  </div>
                  {hasHolding && marketValue !== null && (
                    <div className="text-[10px] neu-text-muted mt-0.5">
                      {holding.totalQty.toLocaleString()} 株 ·{" "}
                      {item.market === "US" ? "$" : "¥"}
                      {(quote!.price * holding.totalQty).toLocaleString(
                        "ja-JP",
                        { maximumFractionDigits: 0 },
                      )}
                      {item.market === "US" && (
                        <span className="ml-1">
                          (¥
                          {marketValue.toLocaleString("ja-JP", {
                            maximumFractionDigits: 0,
                          })}
                          )
                        </span>
                      )}
                    </div>
                  )}
                </div>
                {quote ? (
                  <div className="text-right shrink-0">
                    <div className="text-sm font-medium neu-text-primary">
                      {quote.price.toLocaleString("ja-JP", {
                        maximumFractionDigits: 2,
                      })}
                    </div>
                    <div
                      className={`text-xs ${quote.change >= 0 ? "text-green-600" : "text-red-600"}`}
                    >
                      {quote.change >= 0 ? "+" : ""}
                      {quote.change.toFixed(2)} (
                      {quote.changePercent >= 0 ? "+" : ""}
                      {quote.changePercent.toFixed(2)}%)
                    </div>
                    {hasHolding && pnl !== null && (
                      <div
                        className={`text-[10px] mt-0.5 ${pnl >= 0 ? "text-green-600" : "text-red-600"}`}
                      >
                        損益 {pnl >= 0 ? "+" : ""}
                        {pnl.toLocaleString("ja-JP", {
                          maximumFractionDigits: 0,
                        })}
                        円
                        {pnlPct !== null && (
                          <span className="ml-1">
                            ({pnlPct >= 0 ? "+" : ""}
                            {pnlPct.toFixed(1)}%)
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <span className="text-xs neu-text-muted">—</span>
                )}
                <button
                  onClick={() => onRemove(item.id)}
                  className="p-2 neu-text-muted hover:text-red-500 shrink-0"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// --- Dashboard Tab ---
const DashboardTab = ({
  holdings,
  quotes,
  transactions,
  watchlist,
  exchangeRates,
  financials,
  fetchChart,
  onSymbolSelect,
}: {
  holdings: InvestHolding[];
  quotes: StockQuote[];
  transactions: InvestTransaction[];
  watchlist: InvestWatchlistItem[];
  exchangeRates: ExchangeRate[];
  financials: StockFinancials[];
  fetchChart: (
    symbol: string,
    range: string,
    interval: string,
  ) => Promise<StockCandle[]>;
  onSymbolSelect: (sym: string, name: string) => void;
}) => {
  const quoteMap = useMemo(() => {
    const m: Record<string, StockQuote> = {};
    for (const q of quotes) m[q.symbol] = q;
    return m;
  }, [quotes]);

  const metrics = useMemo(() => {
    let totalValue = 0;
    let totalCost = 0;
    let dailyChange = 0;
    let upCount = 0;
    let downCount = 0;
    const holdingPerf: {
      symbol: string;
      name: string;
      changePercent: number;
    }[] = [];

    for (const h of holdings) {
      const q = quoteMap[h.symbol];
      const price = q?.price ?? h.avgCost;
      totalValue += h.quantity * price;
      totalCost += h.quantity * h.avgCost;
      if (q) {
        dailyChange += h.quantity * q.change;
        holdingPerf.push({
          symbol: h.symbol,
          name: h.name,
          changePercent: q.changePercent,
        });
        if (q.changePercent >= 0) upCount++;
        else downCount++;
      }
    }

    const totalPnl = totalValue - totalCost;
    const totalPnlPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;
    const prevTotal = totalValue - dailyChange;
    const dailyChangePct = prevTotal > 0 ? (dailyChange / prevTotal) * 100 : 0;

    const sorted = [...holdingPerf].sort(
      (a, b) => b.changePercent - a.changePercent,
    );
    const best = sorted[0] ?? null;
    const worst = sorted.length > 1 ? sorted[sorted.length - 1] : null;

    return {
      totalValue,
      totalCost,
      totalPnl,
      totalPnlPct,
      dailyChange,
      dailyChangePct,
      upCount,
      downCount,
      holdingCount: holdings.length,
      best,
      worst,
    };
  }, [holdings, quoteMap]);

  const recentTx = useMemo(() => transactions.slice(0, 3), [transactions]);

  // Recent dividends
  const recentDividends = useMemo(
    () => transactions.filter((t) => t.type === "dividend").slice(0, 3),
    [transactions],
  );

  // --- Asset history chart ---
  const assetChartRef = useRef<HTMLDivElement>(null);
  const chartApiRef = useRef<IChartApi | null>(null);
  const [assetHistory, setAssetHistory] = useState<
    { time: string; value: number }[]
  >([]);
  const [historyRange, setHistoryRange] = useState<"1mo" | "3mo" | "1y">("1mo");
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  const usdJpy = useMemo(() => {
    const rate = exchangeRates.find((r) => r.pair === "USDJPY");
    return rate?.rate ?? 150;
  }, [exchangeRates]);

  useEffect(() => {
    if (holdings.length === 0) return;
    let cancelled = false;
    setIsLoadingHistory(true);

    const intervalMap: Record<string, string> = {
      "1mo": "1d",
      "3mo": "1d",
      "1y": "1wk",
    };

    Promise.all(
      holdings.map((h) =>
        fetchChart(h.symbol, historyRange, intervalMap[historyRange]),
      ),
    )
      .then((chartDataArray) => {
        if (cancelled) return;
        const dateMap = new Map<number, number>();
        chartDataArray.forEach((candles, idx) => {
          const h = holdings[idx];
          const fx = h.market === "US" ? usdJpy : 1;
          for (const c of candles) {
            dateMap.set(
              c.time,
              (dateMap.get(c.time) ?? 0) + c.close * h.quantity * fx,
            );
          }
        });
        const sorted = [...dateMap.entries()]
          .sort((a, b) => a[0] - b[0])
          .map(([time, value]) => ({
            time: new Date(time * 1000).toISOString().slice(0, 10),
            value,
          }));
        setAssetHistory(sorted);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setIsLoadingHistory(false);
      });

    return () => {
      cancelled = true;
    };
  }, [holdings, historyRange, fetchChart, usdJpy]);

  useEffect(() => {
    const container = assetChartRef.current;
    if (!container || assetHistory.length === 0) return;

    const chart = createChart(container, {
      width: container.clientWidth,
      height: 200,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#a0aec0",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: "rgba(160,174,192,0.1)" },
        horzLines: { color: "rgba(160,174,192,0.1)" },
      },
      rightPriceScale: {
        borderVisible: false,
      },
      timeScale: {
        borderVisible: false,
      },
      crosshair: {
        vertLine: { labelVisible: false },
      },
    });
    chartApiRef.current = chart;

    const first = assetHistory[0].value;
    const last = assetHistory[assetHistory.length - 1].value;
    const lineColor = last >= first ? "#22c55e" : "#ef4444";
    const topColor =
      last >= first ? "rgba(34,197,94,0.2)" : "rgba(239,68,68,0.2)";

    const series = chart.addSeries(LineSeries, {
      color: lineColor,
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
      crosshairMarkerVisible: true,
    });

    series.setData(
      assetHistory.map((d) => ({
        time: d.time as unknown as string,
        value: d.value,
      })),
    );

    // Area fill via priceScale
    series.applyOptions({
      topColor,
      bottomColor: "transparent",
    } as Record<string, unknown>);

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
      chartApiRef.current = null;
    };
  }, [assetHistory]);

  const assetChange = useMemo(() => {
    if (assetHistory.length < 2) return null;
    const first = assetHistory[0].value;
    const last = assetHistory[assetHistory.length - 1].value;
    const change = last - first;
    const changePct = first > 0 ? (change / first) * 100 : 0;
    return { change, changePct };
  }, [assetHistory]);

  return (
    <div className="space-y-4">
      {/* Asset history chart */}
      {holdings.length > 0 && (
        <div className="neu-card p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-xs font-medium neu-text-muted">資産推移</div>
              {assetChange && (
                <div
                  className={`text-xs mt-0.5 ${assetChange.change >= 0 ? "text-green-600" : "text-red-600"}`}
                >
                  {assetChange.change >= 0 ? "+" : ""}
                  {assetChange.change.toLocaleString("ja-JP", {
                    maximumFractionDigits: 0,
                  })}
                  円 ({assetChange.changePct >= 0 ? "+" : ""}
                  {assetChange.changePct.toFixed(1)}%)
                </div>
              )}
            </div>
            <div className="flex gap-1">
              {(
                [
                  { value: "1mo" as const, label: "1M" },
                  { value: "3mo" as const, label: "3M" },
                  { value: "1y" as const, label: "1Y" },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setHistoryRange(opt.value)}
                  className={`px-2 py-0.5 text-xs rounded-lg transition-colors ${
                    historyRange === opt.value
                      ? "neu-chip-active text-blue-600 font-medium"
                      : "neu-chip neu-text-secondary"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <div ref={assetChartRef} className="w-full rounded overflow-hidden">
            {isLoadingHistory && assetHistory.length === 0 && (
              <div className="h-[200px] flex items-center justify-center">
                <Loader2 size={18} className="animate-spin neu-text-muted" />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Row 1: 資産総額 + Best/Worst */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Total assets */}
        <div className="neu-card p-5">
          <div className="text-xs font-medium neu-text-muted mb-1">
            資産総額
          </div>
          <div className="text-2xl font-bold neu-text-primary">
            ¥
            {metrics.totalValue.toLocaleString("ja-JP", {
              maximumFractionDigits: 0,
            })}
          </div>
          <div
            className={`flex items-center gap-1 text-sm mt-1 ${metrics.dailyChange >= 0 ? "text-green-600" : "text-red-600"}`}
          >
            {metrics.dailyChange >= 0 ? (
              <TrendingUp size={14} />
            ) : (
              <TrendingDown size={14} />
            )}
            <span>
              {metrics.dailyChange >= 0 ? "+" : ""}
              {metrics.dailyChange.toLocaleString("ja-JP", {
                maximumFractionDigits: 0,
              })}
              円
            </span>
            <span className="text-xs">
              ({metrics.dailyChangePct >= 0 ? "+" : ""}
              {metrics.dailyChangePct.toFixed(2)}%)
            </span>
          </div>
          <div className="text-xs neu-text-muted mt-2">
            評価損益{" "}
            <span
              className={
                metrics.totalPnl >= 0 ? "text-green-600" : "text-red-600"
              }
            >
              {metrics.totalPnl >= 0 ? "+" : ""}
              {metrics.totalPnl.toLocaleString("ja-JP", {
                maximumFractionDigits: 0,
              })}
              円 ({metrics.totalPnlPct >= 0 ? "+" : ""}
              {metrics.totalPnlPct.toFixed(1)}%)
            </span>
          </div>
        </div>

        {/* Best / Worst */}
        <div className="neu-card p-5">
          <div className="text-xs font-medium neu-text-muted mb-3">
            値上がり / 値下がり
          </div>
          <div className="space-y-3">
            {metrics.best && (
              <button
                type="button"
                onClick={() =>
                  onSymbolSelect(metrics.best!.symbol, metrics.best!.name)
                }
                className="w-full flex items-center justify-between hover:bg-white/40 rounded-lg px-2 py-1.5 -mx-2 transition-colors"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <TrendingUp size={14} className="text-green-600 shrink-0" />
                  <span className="font-mono text-sm neu-text-primary">
                    {metrics.best.symbol.replace(".T", "")}
                  </span>
                  <span className="text-xs neu-text-muted truncate">
                    {metrics.best.name}
                  </span>
                </div>
                <span
                  className={`text-sm font-medium shrink-0 ml-2 ${metrics.best.changePercent >= 0 ? "text-green-600" : "text-red-600"}`}
                >
                  {metrics.best.changePercent >= 0 ? "+" : ""}
                  {metrics.best.changePercent.toFixed(2)}%
                </span>
              </button>
            )}
            {metrics.worst && (
              <button
                type="button"
                onClick={() =>
                  onSymbolSelect(metrics.worst!.symbol, metrics.worst!.name)
                }
                className="w-full flex items-center justify-between hover:bg-white/40 rounded-lg px-2 py-1.5 -mx-2 transition-colors"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <TrendingDown size={14} className="text-red-600 shrink-0" />
                  <span className="font-mono text-sm neu-text-primary">
                    {metrics.worst.symbol.replace(".T", "")}
                  </span>
                  <span className="text-xs neu-text-muted truncate">
                    {metrics.worst.name}
                  </span>
                </div>
                <span
                  className={`text-sm font-medium shrink-0 ml-2 ${metrics.worst.changePercent >= 0 ? "text-green-600" : "text-red-600"}`}
                >
                  {metrics.worst.changePercent >= 0 ? "+" : ""}
                  {metrics.worst.changePercent.toFixed(2)}%
                </span>
              </button>
            )}
            {!metrics.best && (
              <div className="text-xs neu-text-muted text-center py-2">
                データなし
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Row 2: Portfolio summary + 評価損益 + 取引履歴 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Portfolio summary */}
        <div className="neu-card p-4">
          <div className="text-xs font-medium neu-text-muted mb-2">
            ポートフォリオ
          </div>
          <div className="text-xl font-bold neu-text-primary">
            {metrics.holdingCount}銘柄
          </div>
          {metrics.holdingCount > 0 && (
            <>
              <div className="flex items-center gap-3 text-xs mt-2">
                <span className="text-green-600">▲ {metrics.upCount}</span>
                <span className="text-red-600">▼ {metrics.downCount}</span>
                {metrics.holdingCount - metrics.upCount - metrics.downCount >
                  0 && (
                  <span className="neu-text-muted">
                    —{" "}
                    {metrics.holdingCount - metrics.upCount - metrics.downCount}
                  </span>
                )}
              </div>
              <div className="mt-2 h-2 rounded-full bg-slate-100 overflow-hidden flex">
                {metrics.upCount > 0 && (
                  <div
                    className="bg-green-500 h-full"
                    style={{
                      width: `${(metrics.upCount / metrics.holdingCount) * 100}%`,
                    }}
                  />
                )}
                {metrics.downCount > 0 && (
                  <div
                    className="bg-red-500 h-full"
                    style={{
                      width: `${(metrics.downCount / metrics.holdingCount) * 100}%`,
                    }}
                  />
                )}
              </div>
            </>
          )}
        </div>

        {/* 評価損益 */}
        <div className="neu-card p-4">
          <div className="text-xs font-medium neu-text-muted mb-2">
            評価損益
          </div>
          <div
            className={`text-xl font-bold ${metrics.totalPnl >= 0 ? "text-green-600" : "text-red-600"}`}
          >
            {metrics.totalPnl >= 0 ? "+" : ""}
            {metrics.totalPnl.toLocaleString("ja-JP", {
              maximumFractionDigits: 0,
            })}
            円
          </div>
          <div className="text-xs neu-text-muted mt-1">
            取得原価 ¥
            {metrics.totalCost.toLocaleString("ja-JP", {
              maximumFractionDigits: 0,
            })}
          </div>
        </div>

        {/* Recent transactions */}
        <div className="neu-card p-4">
          <div className="text-xs font-medium neu-text-muted mb-2">
            取引履歴
          </div>
          {recentTx.length === 0 ? (
            <div className="text-xs neu-text-muted py-2">取引なし</div>
          ) : (
            <div className="space-y-1.5">
              {recentTx.map((tx) => (
                <div
                  key={tx.id}
                  className="flex items-center justify-between text-xs"
                >
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`px-1 rounded text-[10px] font-medium ${
                        tx.type === "buy"
                          ? "bg-blue-50 text-blue-600"
                          : tx.type === "sell"
                            ? "bg-red-50 text-red-600"
                            : "bg-green-50 text-green-600"
                      }`}
                    >
                      {tx.type === "buy"
                        ? "買"
                        : tx.type === "sell"
                          ? "売"
                          : "配当"}
                    </span>
                    <span className="font-mono neu-text-primary">
                      {tx.symbol.replace(".T", "")}
                    </span>
                  </div>
                  <span className="neu-text-muted">
                    {new Date(tx.transactedAt).toLocaleDateString("ja-JP", {
                      month: "numeric",
                      day: "numeric",
                    })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Row 3: 配当管理 */}
      {recentDividends.length > 0 && (
        <div className="neu-card p-4">
          <div className="text-xs font-medium neu-text-muted mb-2">
            配当管理
          </div>
          <div className="space-y-1.5">
            {recentDividends.map((tx) => (
              <div
                key={tx.id}
                className="flex items-center justify-between text-xs"
              >
                <span className="font-mono neu-text-primary">
                  {tx.symbol.replace(".T", "")}{" "}
                  <span className="neu-text-muted">{tx.name}</span>
                </span>
                <span className="text-green-600 font-medium">
                  {(tx.quantity * tx.price).toLocaleString("ja-JP", {
                    maximumFractionDigits: 0,
                  })}
                  円
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Watchlist strip */}
      {watchlist.length > 0 && (
        <div className="neu-card p-4">
          <div className="text-xs font-medium neu-text-muted mb-3">
            ウォッチ銘柄
          </div>
          <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-1">
            {watchlist.map((item) => {
              const q = quoteMap[item.symbol];
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSymbolSelect(item.symbol, item.name)}
                  className="shrink-0 px-3 py-2 rounded-xl bg-white/60 hover:bg-white/80 transition-colors text-left min-w-[120px]"
                >
                  <div className="font-mono text-xs font-medium neu-text-primary">
                    {item.symbol.replace(".T", "")}
                  </div>
                  {q ? (
                    <div
                      className={`text-[10px] ${q.changePercent >= 0 ? "text-green-600" : "text-red-600"}`}
                    >
                      {q.price.toLocaleString("ja-JP", {
                        maximumFractionDigits: 2,
                      })}
                      <span className="ml-1">
                        {q.changePercent >= 0 ? "+" : ""}
                        {q.changePercent.toFixed(2)}%
                      </span>
                    </div>
                  ) : (
                    <div className="text-[10px] neu-text-muted">—</div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Financials summary */}
      {financials.length > 0 && holdings.length > 0 && (
        <div className="neu-card p-4">
          <div className="text-xs font-medium neu-text-muted mb-3">
            ファンダメンタル指標
          </div>
          <div className="overflow-x-auto scrollbar-hide">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left neu-text-muted border-b border-slate-200/60">
                  <th className="pb-2 pr-3 font-medium whitespace-nowrap">
                    銘柄
                  </th>
                  <th className="pb-2 px-2 font-medium text-right">PER</th>
                  <th className="pb-2 px-2 font-medium text-right">PBR</th>
                  <th className="pb-2 px-2 font-medium text-right">
                    配当利回り
                  </th>
                  <th className="pb-2 px-2 font-medium text-right">ROE</th>
                  <th className="pb-2 px-2 font-medium text-right">利益率</th>
                  <th className="pb-2 px-2 font-medium text-right">売上成長</th>
                </tr>
              </thead>
              <tbody>
                {holdings.map((h) => {
                  const fin = financials.find((f) => f.symbol === h.symbol);
                  if (!fin) return null;
                  return (
                    <tr
                      key={h.symbol}
                      className="border-b border-slate-100/60 hover:bg-white/40 cursor-pointer transition-colors"
                      onClick={() => onSymbolSelect(h.symbol, h.name)}
                    >
                      <td className="py-1.5 pr-3 font-mono font-medium neu-text-primary whitespace-nowrap">
                        {h.symbol.replace(".T", "")}
                      </td>
                      <td className="py-1.5 px-2 text-right neu-text-secondary">
                        {fin.trailingPE !== null
                          ? fin.trailingPE.toFixed(1)
                          : "—"}
                      </td>
                      <td className="py-1.5 px-2 text-right neu-text-secondary">
                        {fin.priceToBook !== null
                          ? fin.priceToBook.toFixed(2)
                          : "—"}
                      </td>
                      <td className="py-1.5 px-2 text-right">
                        {fin.dividendYield !== null ? (
                          <span
                            className={
                              fin.dividendYield > 0.03
                                ? "text-green-600 font-medium"
                                : "neu-text-secondary"
                            }
                          >
                            {(fin.dividendYield * 100).toFixed(2)}%
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="py-1.5 px-2 text-right">
                        {fin.returnOnEquity !== null ? (
                          <span
                            className={
                              fin.returnOnEquity > 0.15
                                ? "text-green-600 font-medium"
                                : "neu-text-secondary"
                            }
                          >
                            {(fin.returnOnEquity * 100).toFixed(1)}%
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="py-1.5 px-2 text-right neu-text-secondary">
                        {fin.profitMargins !== null
                          ? `${(fin.profitMargins * 100).toFixed(1)}%`
                          : "—"}
                      </td>
                      <td className="py-1.5 px-2 text-right">
                        {fin.revenueGrowth !== null ? (
                          <span
                            className={
                              fin.revenueGrowth > 0
                                ? "text-green-600"
                                : "text-red-600"
                            }
                          >
                            {fin.revenueGrowth >= 0 ? "+" : ""}
                            {(fin.revenueGrowth * 100).toFixed(1)}%
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Portfolio pie chart */}
      {holdings.length > 0 && (
        <div className="neu-card p-4">
          <div className="text-xs font-medium neu-text-muted mb-3">
            資産構成
          </div>
          <PortfolioPieChart holdings={holdings} quotes={quotes} />
        </div>
      )}

      {/* Holding chart grid */}
      {holdings.length > 0 && (
        <div>
          <div className="text-xs font-medium neu-text-muted mb-3">
            保有銘柄チャート
          </div>
          <HoldingChartGrid
            holdings={holdings}
            quotes={quotes}
            fetchChart={fetchChart}
            onSelect={onSymbolSelect}
          />
        </div>
      )}
    </div>
  );
};

// --- Main Page ---
export const InvestPage = () => {
  const [activeTab, setActiveTab] = useState<InvestTab>("dashboard");
  const [quotes, setQuotes] = useState<StockQuote[]>([]);
  const [exchangeRates, setExchangeRates] = useState<ExchangeRate[]>([]);
  const [financials, setFinancials] = useState<StockFinancials[]>([]);
  const [showAiPanel, setShowAiPanel] = useState(false);

  // Chart state (lifted from ChartTab for AI context)
  const [chartSymbol, setChartSymbol] = useState("");
  const [chartSymbolName, setChartSymbolName] = useState("");
  const [chartRange, setChartRange] = useState("3mo");
  const [chartCandles, setChartCandles] = useState<StockCandle[]>([]);
  const [chartIndicators, setChartIndicators] = useState({
    sma20: true,
    sma50: false,
    rsi: false,
    bb: false,
    macd: false,
  });

  const {
    portfolios,
    holdings,
    watchlist,
    transactions,
    alerts,
    chartDrawings,
    isLoading,
    addPortfolio,
    updatePortfolio,
    removePortfolio,
    addHolding,
    updateHolding,
    removeHolding,
    addWatchlistItem,
    removeWatchlistItem,
    addTransaction,
    removeTransaction,
    addAlert,
    updateAlert,
    removeAlert,
    addChartDrawing,
    updateChartDrawing,
    removeChartDrawing,
    removeAllChartDrawings,
  } = useInvestments();

  const {
    fetchQuotes,
    fetchChart,
    searchStocks,
    fetchNews,
    fetchExchangeRate,
    fetchFinancials,
    isLoadingChart,
  } = useStockData();

  // Chart actions
  const loadChart = useCallback(
    async (sym: string, r: string) => {
      if (!sym) return;
      const interval = INTERVAL_MAP[r] || "1d";
      const data = await fetchChart(sym, r, interval);
      setChartCandles(data);
    },
    [fetchChart],
  );

  const handleSymbolSelect = useCallback(
    (sym: string, name: string) => {
      setChartSymbol(sym);
      setChartSymbolName(name);
      loadChart(sym, chartRange);
    },
    [loadChart, chartRange],
  );

  const handleRangeChange = useCallback(
    (r: string) => {
      setChartRange(r);
      if (chartSymbol) loadChart(chartSymbol, r);
    },
    [chartSymbol, loadChart],
  );

  const handleToggleIndicator = useCallback(
    (key: "sma20" | "sma50" | "rsi" | "macd" | "bb") => {
      setChartIndicators((prev) => ({ ...prev, [key]: !prev[key] }));
    },
    [],
  );

  // Filter drawings for current chart symbol
  const currentDrawings = useMemo(
    () => chartDrawings.filter((d) => d.symbol === chartSymbol),
    [chartDrawings, chartSymbol],
  );

  const handleClearAllDrawings = useCallback(() => {
    if (chartSymbol) removeAllChartDrawings(chartSymbol);
  }, [chartSymbol, removeAllChartDrawings]);

  // CSV import handler
  const handleImportCsv = useCallback(
    async (csvHoldings: CsvHolding[], portfolioName: string) => {
      const pfId = await addPortfolio(portfolioName);
      if (!pfId) return;
      for (const h of csvHoldings) {
        await addHolding(
          pfId,
          h.symbol,
          h.name,
          h.market,
          h.quantity,
          h.avgCost,
        );
      }
    },
    [addPortfolio, addHolding],
  );

  // Collect all symbols to fetch quotes for
  const allSymbols = useMemo(() => {
    const set = new Set<string>();
    for (const h of holdings) set.add(h.symbol);
    for (const w of watchlist) set.add(w.symbol);
    return Array.from(set);
  }, [holdings, watchlist]);

  const refreshQuotes = useCallback(async () => {
    if (allSymbols.length === 0) return;
    const [q, rates, fin] = await Promise.all([
      fetchQuotes(allSymbols),
      fetchExchangeRate(["USDJPY"]),
      fetchFinancials(allSymbols),
    ]);
    setQuotes(q);
    setExchangeRates(rates);
    setFinancials(fin);
  }, [allSymbols, fetchQuotes, fetchExchangeRate, fetchFinancials]);

  // Deduplicate watchlist + auto-sync holdings
  const syncingRef = useRef(false);
  useEffect(() => {
    if (isLoading || syncingRef.current) return;

    // Remove duplicate watchlist entries (keep first occurrence per symbol)
    const seenSymbols = new Set<string>();
    const duplicateIds: string[] = [];
    for (const w of watchlist) {
      if (seenSymbols.has(w.symbol)) {
        duplicateIds.push(w.id);
      } else {
        seenSymbols.add(w.symbol);
      }
    }
    if (duplicateIds.length > 0) {
      syncingRef.current = true;
      (async () => {
        for (const id of duplicateIds) {
          await removeWatchlistItem(id);
        }
        syncingRef.current = false;
      })();
      return;
    }

    // Add missing holdings to watchlist
    if (holdings.length === 0) return;
    const watchlistSymbols = new Set(watchlist.map((w) => w.symbol));
    const seen = new Set<string>();
    const missing = holdings.filter((h) => {
      if (watchlistSymbols.has(h.symbol) || seen.has(h.symbol)) return false;
      seen.add(h.symbol);
      return true;
    });
    if (missing.length === 0) return;
    syncingRef.current = true;
    (async () => {
      for (const h of missing) {
        await addWatchlistItem(h.symbol, h.name, h.market);
      }
      syncingRef.current = false;
    })();
  }, [holdings, watchlist, isLoading, addWatchlistItem, removeWatchlistItem]);

  // Auto-fetch quotes when tab changes or symbols change
  useEffect(() => {
    const needsQuotes = [
      "dashboard",
      "chart",
      "portfolio",
      "watchlist",
      "report",
      "heatmap",
    ].includes(activeTab);
    if (needsQuotes && allSymbols.length > 0) {
      refreshQuotes();
    }
  }, [activeTab, allSymbols.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // AI context
  const investAiContext = useMemo<InvestAiContext>(
    () => ({
      chartSymbol,
      chartSymbolName,
      chartRange,
      chartIndicators,
      latestCandle:
        chartCandles.length > 0 ? chartCandles[chartCandles.length - 1] : null,
      activeTab,
      portfolios,
      holdings,
      watchlist,
      quotes,
      financials,
    }),
    [
      chartSymbol,
      chartSymbolName,
      chartRange,
      chartIndicators,
      chartCandles,
      activeTab,
      portfolios,
      holdings,
      watchlist,
      quotes,
      financials,
    ],
  );

  const tabs = [
    {
      id: "dashboard" as const,
      label: "ダッシュボード",
      icon: LayoutDashboard,
    },
    { id: "chart" as const, label: "チャート", icon: CandlestickChart },
    { id: "portfolio" as const, label: "ポートフォリオ", icon: Briefcase },
    { id: "watchlist" as const, label: "ウォッチ", icon: Eye },
    { id: "history" as const, label: "取引", icon: History },
    { id: "report" as const, label: "レポート", icon: BarChart3 },
    { id: "heatmap" as const, label: "ヒートマップ", icon: Grid2x2 },
    { id: "news" as const, label: "ニュース", icon: Newspaper },
  ];

  const aiToggleButton = (
    <button
      onClick={() => setShowAiPanel((p) => !p)}
      className={`p-2 rounded-xl transition-all ${
        showAiPanel
          ? "neu-pressed text-indigo-600"
          : "neu-btn neu-text-secondary"
      }`}
      title="AI分析パネル"
    >
      <Bot size={18} />
    </button>
  );

  return (
    <Layout pageTitle="Invest" headerRight={aiToggleButton}>
      <div className="h-full flex flex-col neu-bg">
        {/* Tab bar */}
        <div className="shrink-0 px-4 pt-4">
          <div
            className={`mx-auto ${showAiPanel ? "max-w-none" : "max-w-5xl"}`}
          >
            <div className="flex gap-2 items-center overflow-x-auto scrollbar-hide py-1">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors shrink-0 ${
                      activeTab === tab.id
                        ? "neu-chip-active text-blue-600"
                        : "neu-chip neu-text-secondary"
                    }`}
                  >
                    <Icon size={15} />
                    <span className="text-xs sm:text-sm">{tab.label}</span>
                  </button>
                );
              })}
              <div className="flex-1" />
              {/* Mobile AI toggle */}
              <div className="md:hidden shrink-0">{aiToggleButton}</div>
            </div>
          </div>
        </div>

        {/* Content + AI Panel */}
        <div className="flex-1 min-h-0 flex">
          {/* Main content */}
          <main className="flex-1 min-h-0 overflow-auto px-4 pb-4 pt-2 md:px-6 md:pb-6 md:pt-3 mobile-scroll-pad">
            <div
              className={`mx-auto ${showAiPanel ? "max-w-4xl" : "max-w-5xl"}`}
            >
              {activeTab === "dashboard" && (
                <DashboardTab
                  holdings={holdings}
                  quotes={quotes}
                  transactions={transactions}
                  watchlist={watchlist}
                  exchangeRates={exchangeRates}
                  financials={financials}
                  fetchChart={fetchChart}
                  onSymbolSelect={(sym, name) => {
                    handleSymbolSelect(sym, name);
                    setActiveTab("chart");
                  }}
                />
              )}
              {activeTab === "chart" && (
                <ChartTab
                  symbol={chartSymbol}
                  symbolName={chartSymbolName}
                  range={chartRange}
                  candles={chartCandles}
                  quotes={quotes}
                  indicators={chartIndicators}
                  isLoadingChart={isLoadingChart}
                  drawings={currentDrawings}
                  onAddDrawing={addChartDrawing}
                  onUpdateDrawing={updateChartDrawing}
                  onRemoveDrawing={removeChartDrawing}
                  onClearAllDrawings={handleClearAllDrawings}
                  searchFn={searchStocks}
                  onSymbolSelect={handleSymbolSelect}
                  onRangeChange={handleRangeChange}
                  onToggleIndicator={handleToggleIndicator}
                />
              )}
              {activeTab === "portfolio" && (
                <PortfolioTab
                  portfolios={portfolios}
                  holdings={holdings}
                  quotes={quotes}
                  isLoading={isLoading}
                  onAddPortfolio={addPortfolio}
                  onUpdatePortfolio={updatePortfolio}
                  onRemovePortfolio={removePortfolio}
                  onAddHolding={addHolding}
                  onUpdateHolding={updateHolding}
                  onRemoveHolding={removeHolding}
                  onImportCsv={handleImportCsv}
                  searchFn={searchStocks}
                  onRefreshQuotes={refreshQuotes}
                />
              )}
              {activeTab === "watchlist" && (
                <WatchlistTab
                  watchlist={watchlist}
                  quotes={quotes}
                  holdings={holdings}
                  exchangeRates={exchangeRates}
                  isLoading={isLoading}
                  onAdd={addWatchlistItem}
                  onRemove={removeWatchlistItem}
                  searchFn={searchStocks}
                  onRefreshQuotes={refreshQuotes}
                />
              )}
              {activeTab === "history" && (
                <HistoryTab
                  transactions={transactions}
                  portfolios={portfolios}
                  onAdd={addTransaction}
                  onRemove={removeTransaction}
                  searchFn={searchStocks}
                />
              )}
              {activeTab === "report" && (
                <ReportTab
                  portfolios={portfolios}
                  holdings={holdings}
                  transactions={transactions}
                  quotes={quotes}
                  exchangeRates={exchangeRates}
                />
              )}
              {activeTab === "heatmap" && (
                <HeatmapTab
                  holdings={holdings}
                  quotes={quotes}
                  exchangeRates={exchangeRates}
                  onSymbolSelect={(sym, name) => {
                    handleSymbolSelect(sym, name);
                    setActiveTab("chart");
                  }}
                />
              )}
              {activeTab === "news" && (
                <NewsTab symbols={allSymbols} fetchNews={fetchNews} />
              )}

              {/* Comparison Chart (shown on chart tab below main chart) */}
              {activeTab === "chart" && chartSymbol && (
                <div className="mt-6 neu-card p-4">
                  <h3 className="text-sm font-medium neu-text-primary mb-3 flex items-center gap-2">
                    <GitCompareArrows size={16} /> 銘柄比較
                  </h3>
                  <ComparisonChart
                    fetchChart={fetchChart}
                    searchFn={searchStocks}
                  />
                </div>
              )}

              {/* Alert Manager (shown on watchlist tab) */}
              {activeTab === "watchlist" && (
                <div className="mt-6">
                  <AlertManager
                    alerts={alerts}
                    onAdd={addAlert}
                    onUpdate={updateAlert}
                    onRemove={removeAlert}
                    searchFn={searchStocks}
                  />
                </div>
              )}
            </div>
          </main>

          {/* AI Panel */}
          <InvestAiPanel
            isOpen={showAiPanel}
            onClose={() => setShowAiPanel(false)}
            context={investAiContext}
          />
        </div>
      </div>
    </Layout>
  );
};
