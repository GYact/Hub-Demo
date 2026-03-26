import { useMemo } from "react";
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Loader2,
  ExternalLink,
  Banknote,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  calcInvestGrandSummary,
  type InvestGrandSummary,
} from "../../lib/investCalc";
import type {
  InvestHolding,
  InvestTransaction,
  StockQuote,
  ExchangeRate,
} from "../../types";

interface InvestSummaryCardProps {
  holdings: InvestHolding[];
  transactions: InvestTransaction[];
  quotes: StockQuote[];
  exchangeRates: ExchangeRate[];
  isLoading: boolean;
  onSummaryChange?: (summary: InvestGrandSummary) => void;
}

export const InvestSummaryCard = ({
  holdings,
  transactions,
  quotes,
  exchangeRates,
  isLoading,
}: InvestSummaryCardProps) => {
  const navigate = useNavigate();

  const summary = useMemo(
    () => calcInvestGrandSummary(holdings, transactions, quotes, exchangeRates),
    [holdings, transactions, quotes, exchangeRates],
  );

  if (holdings.length === 0) return null;

  const fmt = (n: number) => `¥${Math.round(n).toLocaleString("ja-JP")}`;

  return (
    <div
      className="neu-card p-4 mb-4 cursor-pointer hover:shadow-lg transition-shadow"
      onClick={() => navigate("/invest")}
      role="link"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter") navigate("/invest");
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium neu-text-primary flex items-center gap-2">
          <TrendingUp size={16} className="text-indigo-500" />
          Investment Portfolio
        </h3>
        <ExternalLink size={14} className="neu-text-muted" />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-4">
          <Loader2 size={20} className="animate-spin neu-text-muted" />
          <span className="ml-2 text-xs neu-text-muted">Loading quotes...</span>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <div className="text-[11px] neu-text-muted mb-0.5">
              総資産 (JPY)
            </div>
            <div className="text-base font-bold neu-text-primary">
              {fmt(summary.totalValueJPY)}
            </div>
          </div>
          <div>
            <div className="text-[11px] neu-text-muted mb-0.5 flex items-center gap-1">
              <DollarSign size={10} /> 投資額
            </div>
            <div className="text-base font-bold neu-text-primary">
              {fmt(summary.totalCostJPY)}
            </div>
          </div>
          <div>
            <div className="text-[11px] neu-text-muted mb-0.5 flex items-center gap-1">
              {summary.pnlJPY >= 0 ? (
                <TrendingUp size={10} className="text-green-600" />
              ) : (
                <TrendingDown size={10} className="text-red-600" />
              )}
              含み損益
            </div>
            <div
              className={`text-base font-bold ${summary.pnlJPY >= 0 ? "text-green-600" : "text-red-600"}`}
            >
              {summary.pnlJPY >= 0 ? "+" : ""}
              {fmt(summary.pnlJPY)}
            </div>
            <div
              className={`text-[10px] ${summary.pnlPercent >= 0 ? "text-green-600" : "text-red-600"}`}
            >
              {summary.pnlPercent >= 0 ? "+" : ""}
              {summary.pnlPercent.toFixed(2)}%
            </div>
          </div>
          <div>
            <div className="text-[11px] neu-text-muted mb-0.5 flex items-center gap-1">
              <Banknote size={10} /> 配当合計
            </div>
            <div className="text-base font-bold text-blue-600">
              {fmt(summary.dividendTotal)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
