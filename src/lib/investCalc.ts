import type {
  InvestHolding,
  InvestTransaction,
  StockQuote,
  ExchangeRate,
} from "../types";

export interface InvestGrandSummary {
  totalValueJPY: number;
  totalCostJPY: number;
  pnlJPY: number;
  pnlPercent: number;
  dividendTotal: number;
  holdingCount: number;
}

export function calcInvestGrandSummary(
  holdings: InvestHolding[],
  transactions: InvestTransaction[],
  quotes: StockQuote[],
  exchangeRates: ExchangeRate[],
): InvestGrandSummary {
  const usdJpy = exchangeRates.find((r) => r.pair === "USDJPY")?.rate ?? 150;

  const quoteMap: Record<string, StockQuote> = {};
  for (const q of quotes) quoteMap[q.symbol] = q;

  let totalValueJPY = 0;
  let totalCostJPY = 0;

  for (const h of holdings) {
    const currentPrice = quoteMap[h.symbol]?.price ?? h.avgCost;
    const cost = h.quantity * h.avgCost;
    const value = h.quantity * currentPrice;

    if (h.market === "US") {
      totalValueJPY += value * usdJpy;
      totalCostJPY += cost * usdJpy;
    } else {
      totalValueJPY += value;
      totalCostJPY += cost;
    }
  }

  const dividendTotal = transactions
    .filter((t) => t.type === "dividend")
    .reduce((sum, t) => sum + t.quantity * t.price, 0);

  const pnlJPY = totalValueJPY - totalCostJPY;
  const pnlPercent = totalCostJPY > 0 ? (pnlJPY / totalCostJPY) * 100 : 0;

  return {
    totalValueJPY,
    totalCostJPY,
    pnlJPY,
    pnlPercent,
    dividendTotal,
    holdingCount: holdings.length,
  };
}
