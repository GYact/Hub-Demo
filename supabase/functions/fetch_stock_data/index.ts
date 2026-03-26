import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, handleCors } from "../_shared/cors.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
  Deno.env.get("SERVICE_ROLE_KEY") ??
  "";

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const YAHOO_BASE = "https://query1.finance.yahoo.com";

const yahooFetch = async (url: string) => {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    },
  });
  if (!res.ok) {
    throw new Error(`Yahoo Finance API error: ${res.status} ${res.statusText}`);
  }
  return res.json();
};

// Quote: 複数銘柄の現在価格取得
const handleQuote = async (symbols: string[]) => {
  if (!symbols?.length) {
    return jsonResponse({ error: "symbols is required" }, 400);
  }
  const url = `${YAHOO_BASE}/v7/finance/quote?symbols=${encodeURIComponent(symbols.join(","))}`;
  const data = await yahooFetch(url);
  const results = data?.quoteResponse?.result ?? [];
  const quotes = results.map((q: Record<string, unknown>) => ({
    symbol: q.symbol,
    name: q.shortName || q.longName || q.symbol,
    price: q.regularMarketPrice ?? 0,
    previousClose: q.regularMarketPreviousClose ?? 0,
    change: q.regularMarketChange ?? 0,
    changePercent: q.regularMarketChangePercent ?? 0,
    currency: q.currency ?? "USD",
    marketState: q.marketState ?? "CLOSED",
  }));
  return jsonResponse({ quotes });
};

// Chart: OHLCV足データ取得
const handleChart = async (symbol: string, range: string, interval: string) => {
  if (!symbol) {
    return jsonResponse({ error: "symbol is required" }, 400);
  }
  const r = range || "3mo";
  const i = interval || "1d";
  const url = `${YAHOO_BASE}/v8/finance/chart/${encodeURIComponent(symbol)}?range=${r}&interval=${i}&includePrePost=false`;
  const data = await yahooFetch(url);
  const result = data?.chart?.result?.[0];
  if (!result) {
    return jsonResponse({ error: "No chart data found" }, 404);
  }

  const timestamps: number[] = result.timestamp ?? [];
  const ohlcv = result.indicators?.quote?.[0] ?? {};
  const candles = timestamps
    .map((t: number, idx: number) => ({
      time: t,
      open: ohlcv.open?.[idx] ?? 0,
      high: ohlcv.high?.[idx] ?? 0,
      low: ohlcv.low?.[idx] ?? 0,
      close: ohlcv.close?.[idx] ?? 0,
      volume: ohlcv.volume?.[idx] ?? 0,
    }))
    .filter(
      (c: { open: number; close: number }) => c.open !== 0 && c.close !== 0,
    );

  const meta = result.meta ?? {};
  return jsonResponse({
    symbol: meta.symbol,
    currency: meta.currency ?? "USD",
    exchangeName: meta.exchangeName ?? "",
    candles,
  });
};

// News: 銘柄関連ニュース取得
const handleNews = async (symbols: string[]) => {
  if (!symbols?.length) {
    return jsonResponse({ error: "symbols is required" }, 400);
  }
  // Use Yahoo Finance v1/finance/search with newsCount to get related news
  const allNews: Record<string, unknown>[] = [];
  for (const sym of symbols.slice(0, 5)) {
    try {
      const url = `${YAHOO_BASE}/v1/finance/search?q=${encodeURIComponent(sym)}&quotesCount=0&newsCount=5&listsCount=0&lang=ja`;
      const data = await yahooFetch(url);
      const news = data?.news ?? [];
      for (const n of news) {
        allNews.push({
          title: n.title ?? "",
          link: n.link ?? "",
          publisher: n.publisher ?? "",
          publishedAt: n.providerPublishTime
            ? new Date(n.providerPublishTime * 1000).toISOString()
            : "",
          thumbnail: n.thumbnail?.resolutions?.[0]?.url ?? null,
          relatedSymbols: (n.relatedTickers ?? [sym]) as string[],
        });
      }
    } catch {
      // Skip failed symbol news
    }
  }
  // Deduplicate by link
  const seen = new Set<string>();
  const unique = allNews.filter((n) => {
    const link = n.link as string;
    if (seen.has(link)) return false;
    seen.add(link);
    return true;
  });
  return jsonResponse({ news: unique.slice(0, 20) });
};

// Exchange rate: 為替レート取得
const handleExchangeRate = async (pairs: string[]) => {
  if (!pairs?.length) {
    return jsonResponse({ error: "pairs is required" }, 400);
  }
  // Convert pairs like "USDJPY" to Yahoo format "USDJPY=X"
  const symbols = pairs.map((p) => `${p}=X`);
  const url = `${YAHOO_BASE}/v7/finance/quote?symbols=${encodeURIComponent(symbols.join(","))}`;
  const data = await yahooFetch(url);
  const results = data?.quoteResponse?.result ?? [];
  const rates = results.map((q: Record<string, unknown>) => ({
    pair: String(q.symbol ?? "").replace("=X", ""),
    rate: q.regularMarketPrice ?? 0,
    timestamp: Date.now(),
  }));
  return jsonResponse({ rates });
};

// Financials: 財務データ取得 (PER, PBR, 配当利回り, 売上, 利益率 etc.)
const handleFinancials = async (symbols: string[]) => {
  if (!symbols?.length) {
    return jsonResponse({ error: "symbols is required" }, 400);
  }
  const financials: Record<string, unknown>[] = [];
  for (const sym of symbols.slice(0, 10)) {
    try {
      const modules = [
        "summaryDetail",
        "defaultKeyStatistics",
        "financialData",
        "earningsTrend",
      ].join(",");
      const url = `${YAHOO_BASE}/v10/finance/quoteSummary/${encodeURIComponent(sym)}?modules=${modules}`;
      const data = await yahooFetch(url);
      const r = data?.quoteSummary?.result?.[0];
      if (!r) continue;

      const sd = r.summaryDetail ?? {};
      const ks = r.defaultKeyStatistics ?? {};
      const fd = r.financialData ?? {};

      const raw = (
        obj: Record<string, unknown> | undefined,
        key: string,
      ): number | null => {
        if (!obj) return null;
        const v = obj[key];
        if (
          v &&
          typeof v === "object" &&
          "raw" in (v as Record<string, unknown>)
        ) {
          return (v as Record<string, unknown>).raw as number;
        }
        return typeof v === "number" ? v : null;
      };

      financials.push({
        symbol: sym,
        // Valuation
        trailingPE: raw(sd, "trailingPE"),
        forwardPE: raw(sd, "forwardPE") ?? raw(ks, "forwardPE"),
        priceToBook: raw(ks, "priceToBook"),
        pegRatio: raw(ks, "pegRatio"),
        enterpriseToEbitda: raw(ks, "enterpriseToEbitda"),
        // Dividend
        dividendYield: raw(sd, "dividendYield"),
        dividendRate: raw(sd, "dividendRate"),
        payoutRatio: raw(sd, "payoutRatio"),
        exDividendDate: sd.exDividendDate
          ? ((sd.exDividendDate as Record<string, unknown>).fmt ?? null)
          : null,
        // Financials
        marketCap: raw(sd, "marketCap"),
        totalRevenue: raw(fd, "totalRevenue"),
        revenueGrowth: raw(fd, "revenueGrowth"),
        grossMargins: raw(fd, "grossMargins"),
        operatingMargins: raw(fd, "operatingMargins"),
        profitMargins: raw(fd, "profitMargins"),
        ebitda: raw(fd, "ebitda"),
        totalDebt: raw(fd, "totalDebt"),
        totalCash: raw(fd, "totalCash"),
        debtToEquity: raw(fd, "debtToEquity"),
        returnOnEquity: raw(fd, "returnOnEquity"),
        returnOnAssets: raw(fd, "returnOnAssets"),
        freeCashflow: raw(fd, "freeCashflow"),
        operatingCashflow: raw(fd, "operatingCashflow"),
        earningsGrowth: raw(fd, "earningsGrowth"),
        currentRatio: raw(fd, "currentRatio"),
        // Key Stats
        beta: raw(ks, "beta"),
        fiftyTwoWeekHigh: raw(sd, "fiftyTwoWeekHigh"),
        fiftyTwoWeekLow: raw(sd, "fiftyTwoWeekLow"),
        fiftyDayAverage: raw(sd, "fiftyDayAverage"),
        twoHundredDayAverage: raw(sd, "twoHundredDayAverage"),
        sharesOutstanding: raw(ks, "sharesOutstanding"),
        floatShares: raw(ks, "floatShares"),
        shortRatio: raw(ks, "shortRatio"),
      });
    } catch {
      // Skip failed symbol
    }
  }
  return jsonResponse({ financials });
};

// Search: 銘柄検索
const handleSearch = async (query: string) => {
  if (!query) {
    return jsonResponse({ error: "query is required" }, 400);
  }
  const url = `${YAHOO_BASE}/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=10&newsCount=0&listsCount=0&lang=ja`;
  const data = await yahooFetch(url);
  const results = (data?.quotes ?? []).map((q: Record<string, unknown>) => ({
    symbol: q.symbol,
    name: q.shortname || q.longname || q.symbol,
    type: q.quoteType,
    exchange: q.exchDisp || q.exchange,
    market:
      String(q.exchange ?? "").includes("TYO") ||
      String(q.exchange ?? "").includes("JPX")
        ? "JP"
        : "US",
  }));
  return jsonResponse({ results });
};

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ error: "Missing authorization" }, 401);
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user },
      error: authError,
    } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const body = await req.json();
    const { action } = body;

    switch (action) {
      case "quote":
        return await handleQuote(body.symbols);
      case "chart":
        return await handleChart(body.symbol, body.range, body.interval);
      case "search":
        return await handleSearch(body.query);
      case "news":
        return await handleNews(body.symbols);
      case "exchange_rate":
        return await handleExchangeRate(body.pairs);
      case "financials":
        return await handleFinancials(body.symbols);
      default:
        return jsonResponse({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (error) {
    console.error("fetch_stock_data error:", error);
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Internal error" },
      500,
    );
  }
});
