import { useMemo, useState } from "react";
import { TrendingUp, TrendingDown, DollarSign, Percent } from "lucide-react";
import { PortfolioPieChart } from "./PortfolioPieChart";
import type {
  InvestHolding,
  InvestTransaction,
  InvestPortfolio,
  StockQuote,
  ExchangeRate,
} from "../../types";

interface ReportTabProps {
  portfolios: InvestPortfolio[];
  holdings: InvestHolding[];
  transactions: InvestTransaction[];
  quotes: StockQuote[];
  exchangeRates: ExchangeRate[];
}

interface PortfolioSummary {
  portfolioId: string;
  portfolioName: string;
  totalCost: number;
  totalValue: number;
  totalValueJPY: number;
  pnl: number;
  pnlPercent: number;
  dividendTotal: number;
  holdings: {
    symbol: string;
    name: string;
    market: string;
    quantity: number;
    avgCost: number;
    currentPrice: number;
    pnl: number;
    pnlPercent: number;
  }[];
}

export const ReportTab = ({
  portfolios,
  holdings,
  transactions,
  quotes,
  exchangeRates,
}: ReportTabProps) => {
  const usdJpy = useMemo(() => {
    const rate = exchangeRates.find((r) => r.pair === "USDJPY");
    return rate?.rate ?? 150;
  }, [exchangeRates]);

  const quoteMap = useMemo(() => {
    const m: Record<string, StockQuote> = {};
    for (const q of quotes) m[q.symbol] = q;
    return m;
  }, [quotes]);

  const summaries = useMemo<PortfolioSummary[]>(() => {
    return portfolios.map((pf) => {
      const pfHoldings = holdings.filter((h) => h.portfolioId === pf.id);
      const pfTransactions = transactions.filter(
        (t) => t.portfolioId === pf.id,
      );

      let totalCost = 0;
      let totalValue = 0;
      let totalValueJPY = 0;

      const holdingDetails = pfHoldings.map((h) => {
        const quote = quoteMap[h.symbol];
        const currentPrice = quote?.price ?? h.avgCost;
        const cost = h.quantity * h.avgCost;
        const value = h.quantity * currentPrice;
        const hPnl = value - cost;
        const hPnlPercent = cost > 0 ? (hPnl / cost) * 100 : 0;

        totalCost += cost;
        totalValue += value;
        // Convert US stocks to JPY for total
        totalValueJPY += h.market === "US" ? value * usdJpy : value;

        return {
          symbol: h.symbol,
          name: h.name,
          market: h.market,
          quantity: h.quantity,
          avgCost: h.avgCost,
          currentPrice,
          pnl: hPnl,
          pnlPercent: hPnlPercent,
        };
      });

      const dividendTotal = pfTransactions
        .filter((t) => t.type === "dividend")
        .reduce((sum, t) => sum + t.quantity * t.price, 0);

      const pnl = totalValue - totalCost;
      const pnlPercent = totalCost > 0 ? (pnl / totalCost) * 100 : 0;

      return {
        portfolioId: pf.id,
        portfolioName: pf.name,
        totalCost,
        totalValue,
        totalValueJPY,
        pnl,
        pnlPercent,
        dividendTotal,
        holdings: holdingDetails.sort(
          (a, b) => Math.abs(b.pnl) - Math.abs(a.pnl),
        ),
      };
    });
  }, [portfolios, holdings, transactions, quoteMap, usdJpy]);

  const grandTotal = useMemo(() => {
    return summaries.reduce(
      (acc, s) => ({
        cost: acc.cost + s.totalCost,
        value: acc.value + s.totalValue,
        valueJPY: acc.valueJPY + s.totalValueJPY,
        dividend: acc.dividend + s.dividendTotal,
      }),
      { cost: 0, value: 0, valueJPY: 0, dividend: 0 },
    );
  }, [summaries]);

  const grandPnl = grandTotal.value - grandTotal.cost;
  const grandPnlPercent =
    grandTotal.cost > 0 ? (grandPnl / grandTotal.cost) * 100 : 0;

  // P&L sub-tab filter
  type PnlFilter = "total" | "unrealized" | "realized";
  const [pnlFilter, setPnlFilter] = useState<PnlFilter>("total");

  // Realized PnL from sell transactions
  const realizedPnl = useMemo(() => {
    const sells = transactions.filter((t) => t.type === "sell");
    return sells.reduce((sum, t) => {
      const holding = holdings.find((h) => h.symbol === t.symbol);
      const avgCost = holding?.avgCost ?? 0;
      return sum + (t.price - avgCost) * t.quantity - t.fee;
    }, 0);
  }, [transactions, holdings]);

  // Per-holding P&L breakdown
  const holdingPnlBreakdown = useMemo(() => {
    const allHoldings = holdings.map((h) => {
      const quote = quoteMap[h.symbol];
      const currentPrice = quote?.price ?? h.avgCost;
      const unrealized = (currentPrice - h.avgCost) * h.quantity;
      const sells = transactions.filter(
        (t) => t.type === "sell" && t.symbol === h.symbol,
      );
      const realized = sells.reduce(
        (sum, t) => sum + (t.price - h.avgCost) * t.quantity - t.fee,
        0,
      );
      const dividends = transactions
        .filter((t) => t.type === "dividend" && t.symbol === h.symbol)
        .reduce((sum, t) => sum + t.quantity * t.price, 0);
      return {
        symbol: h.symbol,
        name: h.name,
        unrealized,
        realized,
        dividends,
        total: unrealized + realized + dividends,
      };
    });
    // Also add dividend-only entries for symbols not in holdings
    const holdingSymbols = new Set(holdings.map((h) => h.symbol));
    const dividendOnlyTx = transactions.filter(
      (t) => t.type === "dividend" && !holdingSymbols.has(t.symbol),
    );
    const dividendMap = new Map<
      string,
      { symbol: string; name: string; amount: number }
    >();
    for (const t of dividendOnlyTx) {
      const existing = dividendMap.get(t.symbol);
      if (existing) {
        existing.amount += t.quantity * t.price;
      } else {
        dividendMap.set(t.symbol, {
          symbol: t.symbol,
          name: t.name,
          amount: t.quantity * t.price,
        });
      }
    }
    for (const d of dividendMap.values()) {
      allHoldings.push({
        symbol: d.symbol,
        name: d.name,
        unrealized: 0,
        realized: 0,
        dividends: d.amount,
        total: d.amount,
      });
    }
    return allHoldings.sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
  }, [holdings, transactions, quoteMap]);

  if (holdings.length === 0) {
    return (
      <div className="neu-card p-8 text-center text-sm neu-text-muted">
        保有銘柄を追加するとレポートが表示されます
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Grand Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="neu-card p-4">
          <div className="text-xs neu-text-muted mb-1">総資産 (JPY)</div>
          <div className="text-lg font-bold neu-text-primary">
            ¥
            {grandTotal.valueJPY.toLocaleString("ja-JP", {
              maximumFractionDigits: 0,
            })}
          </div>
          {usdJpy > 0 && (
            <div className="text-[10px] neu-text-muted mt-0.5">
              USD/JPY: {usdJpy.toFixed(2)}
            </div>
          )}
        </div>
        <div className="neu-card p-4">
          <div className="text-xs neu-text-muted mb-1 flex items-center gap-1">
            {grandPnl >= 0 ? (
              <TrendingUp size={12} className="text-green-600" />
            ) : (
              <TrendingDown size={12} className="text-red-600" />
            )}
            含み損益
          </div>
          <div
            className={`text-lg font-bold ${grandPnl >= 0 ? "text-green-600" : "text-red-600"}`}
          >
            {grandPnl >= 0 ? "+" : ""}
            {grandPnl.toLocaleString("ja-JP", { maximumFractionDigits: 0 })}
          </div>
          <div
            className={`text-xs ${grandPnlPercent >= 0 ? "text-green-600" : "text-red-600"}`}
          >
            {grandPnlPercent >= 0 ? "+" : ""}
            {grandPnlPercent.toFixed(2)}%
          </div>
        </div>
        <div className="neu-card p-4">
          <div className="text-xs neu-text-muted mb-1 flex items-center gap-1">
            <DollarSign size={12} /> 投資額
          </div>
          <div className="text-lg font-bold neu-text-primary">
            ¥
            {grandTotal.cost.toLocaleString("ja-JP", {
              maximumFractionDigits: 0,
            })}
          </div>
        </div>
        <div className="neu-card p-4">
          <div className="text-xs neu-text-muted mb-1 flex items-center gap-1">
            <Percent size={12} /> 配当合計
          </div>
          <div className="text-lg font-bold text-blue-600">
            ¥
            {grandTotal.dividend.toLocaleString("ja-JP", {
              maximumFractionDigits: 0,
            })}
          </div>
        </div>
      </div>

      {/* Pie Chart */}
      <div className="neu-card p-4">
        <h3 className="text-sm font-medium neu-text-primary mb-3">資産配分</h3>
        <PortfolioPieChart holdings={holdings} quotes={quotes} />
      </div>

      {/* P&L Breakdown by Holding */}
      <div className="neu-card p-4 space-y-3">
        {/* Sub-tab filter */}
        <div className="flex items-center gap-2">
          {(
            [
              { key: "total" as const, label: "合計損益" },
              { key: "unrealized" as const, label: "評価損益" },
              { key: "realized" as const, label: "確定損益" },
            ] as const
          ).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setPnlFilter(tab.key)}
              className={`px-3 py-1 text-xs rounded-lg transition-colors ${
                pnlFilter === tab.key
                  ? "neu-chip-active text-blue-600 font-medium"
                  : "neu-chip neu-text-secondary"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Total P&L header */}
        <div className="text-center py-2">
          <div className="text-xs neu-text-muted">
            {pnlFilter === "total"
              ? "合計損益"
              : pnlFilter === "unrealized"
                ? "評価損益"
                : "確定損益"}
          </div>
          <div
            className={`text-2xl font-bold ${
              (pnlFilter === "total"
                ? grandPnl + realizedPnl + grandTotal.dividend
                : pnlFilter === "unrealized"
                  ? grandPnl
                  : realizedPnl) >= 0
                ? "text-green-600"
                : "text-red-600"
            }`}
          >
            {(() => {
              const val =
                pnlFilter === "total"
                  ? grandPnl + realizedPnl + grandTotal.dividend
                  : pnlFilter === "unrealized"
                    ? grandPnl
                    : realizedPnl;
              return `${val >= 0 ? "+" : ""}${val.toLocaleString("ja-JP", { maximumFractionDigits: 0 })}円`;
            })()}
          </div>
        </div>

        {/* Per-holding breakdown */}
        <div className="space-y-1">
          {/* Dividends as separate row (total mode only) */}
          {pnlFilter === "total" && grandTotal.dividend > 0 && (
            <div className="flex items-center gap-3 py-2 text-xs border-b-2 border-slate-200">
              <div className="w-1 h-8 rounded bg-blue-500 shrink-0" />
              <span className="font-medium neu-text-primary flex-1">
                配当金
              </span>
              <span className="text-green-600 font-medium">
                +
                {grandTotal.dividend.toLocaleString("ja-JP", {
                  maximumFractionDigits: 0,
                })}
                円
              </span>
            </div>
          )}
          {holdingPnlBreakdown.map((h) => {
            const displayValue =
              pnlFilter === "total"
                ? h.total
                : pnlFilter === "unrealized"
                  ? h.unrealized
                  : h.realized;
            if (
              pnlFilter === "realized" &&
              h.realized === 0 &&
              h.dividends === 0
            )
              return null;
            return (
              <div
                key={h.symbol}
                className="flex items-center gap-3 py-2 text-xs border-b border-slate-100 last:border-0"
              >
                <div
                  className={`w-1 h-8 rounded shrink-0 ${displayValue >= 0 ? "bg-green-400" : "bg-red-400"}`}
                />
                <div className="flex-1 min-w-0">
                  <div className="font-mono font-medium neu-text-primary">
                    {h.symbol.replace(".T", "")}
                  </div>
                  <div className="neu-text-muted truncate text-[10px]">
                    {h.name}
                  </div>
                </div>
                <span
                  className={`font-medium shrink-0 ${displayValue >= 0 ? "text-green-600" : "text-red-600"}`}
                >
                  {displayValue >= 0 ? "+" : ""}
                  {displayValue.toLocaleString("ja-JP", {
                    maximumFractionDigits: 0,
                  })}
                  円
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Per-Portfolio Details */}
      {summaries.map((s) => (
        <div key={s.portfolioId} className="neu-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium neu-text-primary">
              {s.portfolioName}
            </h3>
            <div className="text-right">
              <span
                className={`text-sm font-medium ${s.pnl >= 0 ? "text-green-600" : "text-red-600"}`}
              >
                {s.pnl >= 0 ? "+" : ""}
                {s.pnl.toLocaleString("ja-JP", { maximumFractionDigits: 0 })} (
                {s.pnlPercent >= 0 ? "+" : ""}
                {s.pnlPercent.toFixed(1)}%)
              </span>
            </div>
          </div>

          <div className="space-y-1">
            {s.holdings.map((h) => (
              <div
                key={h.symbol}
                className="flex items-center gap-3 py-1.5 text-xs border-b border-slate-100 last:border-0"
              >
                <span className="font-mono font-medium w-20 shrink-0">
                  {h.symbol}
                </span>
                <span className="flex-1 truncate neu-text-muted">{h.name}</span>
                <span className="shrink-0 neu-text-secondary">
                  {h.currentPrice.toLocaleString()}
                </span>
                <span
                  className={`shrink-0 w-20 text-right font-medium ${h.pnl >= 0 ? "text-green-600" : "text-red-600"}`}
                >
                  {h.pnl >= 0 ? "+" : ""}
                  {h.pnl.toLocaleString("ja-JP", { maximumFractionDigits: 0 })}
                </span>
                <span
                  className={`shrink-0 w-16 text-right text-[11px] ${h.pnlPercent >= 0 ? "text-green-600" : "text-red-600"}`}
                >
                  {h.pnlPercent >= 0 ? "+" : ""}
                  {h.pnlPercent.toFixed(1)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};
