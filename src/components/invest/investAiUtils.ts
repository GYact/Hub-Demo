import type { InvestAiContext } from "../../types";

export const buildInvestSystemInstruction = (ctx: InvestAiContext): string => {
  const parts: string[] = [
    "あなたは投資・株式分析の専門AIアシスタントです。",
    "ユーザーの投資判断をサポートし、Markdown形式で簡潔かつ正確に回答してください。",
    "投資アドバイスは参考情報であり、最終判断はユーザー自身が行うべきです。",
  ];

  if (ctx.chartSymbol) {
    parts.push(`\n## 現在閲覧中の銘柄`);
    parts.push(`- シンボル: ${ctx.chartSymbol}`);
    if (ctx.chartSymbolName) parts.push(`- 名称: ${ctx.chartSymbolName}`);
    parts.push(`- チャート期間: ${ctx.chartRange}`);
    const activeInds = Object.entries(ctx.chartIndicators)
      .filter(([, v]) => v)
      .map(([k]) => k.toUpperCase());
    if (activeInds.length > 0) {
      parts.push(`- 表示中の指標: ${activeInds.join(", ")}`);
    }
    if (ctx.latestCandle) {
      const c = ctx.latestCandle;
      parts.push(
        `- 直近データ: 始値${c.open} 高値${c.high} 安値${c.low} 終値${c.close} 出来高${c.volume}`,
      );
    }
  }

  if (ctx.financials?.length) {
    const fin = ctx.financials.find((f) => f.symbol === ctx.chartSymbol);
    if (fin) {
      parts.push(`\n## ${ctx.chartSymbol} 財務データ`);
      if (fin.trailingPE !== null)
        parts.push(`- PER: ${fin.trailingPE.toFixed(1)}`);
      if (fin.priceToBook !== null)
        parts.push(`- PBR: ${fin.priceToBook.toFixed(2)}`);
      if (fin.dividendYield !== null)
        parts.push(`- 配当利回り: ${(fin.dividendYield * 100).toFixed(2)}%`);
      if (fin.profitMargins !== null)
        parts.push(`- 利益率: ${(fin.profitMargins * 100).toFixed(1)}%`);
      if (fin.returnOnEquity !== null)
        parts.push(`- ROE: ${(fin.returnOnEquity * 100).toFixed(1)}%`);
      if (fin.revenueGrowth !== null)
        parts.push(`- 売上成長率: ${(fin.revenueGrowth * 100).toFixed(1)}%`);
      if (fin.debtToEquity !== null)
        parts.push(`- D/Eレシオ: ${fin.debtToEquity.toFixed(1)}`);
      if (fin.marketCap !== null)
        parts.push(`- 時価総額: ${(fin.marketCap / 1e9).toFixed(1)}B`);
    }
  }

  if (ctx.holdings.length > 0) {
    parts.push(`\n## ポートフォリオ保有銘柄`);
    for (const h of ctx.holdings) {
      const quote = ctx.quotes.find((q) => q.symbol === h.symbol);
      const priceStr = quote ? ` 現在値${quote.price}` : "";
      parts.push(
        `- ${h.symbol} (${h.name}): ${h.quantity}株 取得単価${h.avgCost}${priceStr}`,
      );
    }
  }

  if (ctx.watchlist.length > 0) {
    parts.push(`\n## ウォッチリスト`);
    for (const w of ctx.watchlist) {
      const quote = ctx.quotes.find((q) => q.symbol === w.symbol);
      const priceStr = quote
        ? ` 現在値${quote.price} (${quote.change >= 0 ? "+" : ""}${quote.changePercent.toFixed(2)}%)`
        : "";
      parts.push(`- ${w.symbol} (${w.name})${priceStr}`);
    }
  }

  return parts.join("\n");
};

export const buildInvestDataContext = (ctx: InvestAiContext): string => {
  const data: Record<string, unknown> = { activeTab: ctx.activeTab };

  if (ctx.latestCandle) {
    data.latestCandle = ctx.latestCandle;
  }

  if (ctx.holdings.length > 0) {
    data.holdings = ctx.holdings.map((h) => {
      const quote = ctx.quotes.find((q) => q.symbol === h.symbol);
      return {
        symbol: h.symbol,
        name: h.name,
        market: h.market,
        quantity: h.quantity,
        avgCost: h.avgCost,
        currentPrice: quote?.price ?? null,
        change: quote?.change ?? null,
        changePercent: quote?.changePercent ?? null,
      };
    });
  }

  return JSON.stringify(data);
};
