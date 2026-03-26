import { useState, useRef, useCallback } from "react";
import { supabase } from "../lib/offlineSync";
import type {
  StockQuote,
  StockCandle,
  StockNews,
  ExchangeRate,
  StockFinancials,
} from "../types";

interface SearchResult {
  symbol: string;
  name: string;
  type: string;
  exchange: string;
  market: "JP" | "US";
}

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const CACHE_TTL_CHART = 5 * 60 * 1000; // 5分
const CACHE_TTL_QUOTE = 30 * 1000; // 30秒

export const useStockData = () => {
  const [isLoadingQuote, setIsLoadingQuote] = useState(false);
  const [isLoadingChart, setIsLoadingChart] = useState(false);
  const [isLoadingSearch, setIsLoadingSearch] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chartCache = useRef<Record<string, CacheEntry<StockCandle[]>>>({});
  const quoteCache = useRef<CacheEntry<StockQuote[]> | null>(null);

  const invoke = async (body: Record<string, unknown>) => {
    if (!supabase) throw new Error("Supabase not available");
    const { data, error: fnError } = await supabase.functions.invoke(
      "fetch_stock_data",
      { body },
    );
    if (fnError) throw fnError;
    return data as Record<string, unknown>;
  };

  const fetchQuotes = useCallback(
    async (symbols: string[]): Promise<StockQuote[]> => {
      if (!symbols.length) return [];

      // Cache check
      if (quoteCache.current) {
        const age = Date.now() - quoteCache.current.timestamp;
        const cached = quoteCache.current.data;
        const cachedSymbols = new Set(cached.map((q) => q.symbol));
        if (
          age < CACHE_TTL_QUOTE &&
          symbols.every((s) => cachedSymbols.has(s))
        ) {
          return cached.filter((q) => symbols.includes(q.symbol));
        }
      }

      setIsLoadingQuote(true);
      setError(null);
      try {
        const data = await invoke({ action: "quote", symbols });
        const quotes = (data.quotes as StockQuote[]) ?? [];
        quoteCache.current = { data: quotes, timestamp: Date.now() };
        return quotes;
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Failed to fetch quotes";
        setError(msg);
        return [];
      } finally {
        setIsLoadingQuote(false);
      }
    },
    [],
  );

  const fetchChart = useCallback(
    async (
      symbol: string,
      range = "3mo",
      interval = "1d",
    ): Promise<StockCandle[]> => {
      const cacheKey = `${symbol}-${range}-${interval}`;

      // Cache check
      const cached = chartCache.current[cacheKey];
      if (cached && Date.now() - cached.timestamp < CACHE_TTL_CHART) {
        return cached.data;
      }

      setIsLoadingChart(true);
      setError(null);
      try {
        const data = await invoke({ action: "chart", symbol, range, interval });
        const candles = (data.candles as StockCandle[]) ?? [];
        chartCache.current[cacheKey] = { data: candles, timestamp: Date.now() };
        return candles;
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Failed to fetch chart";
        setError(msg);
        return [];
      } finally {
        setIsLoadingChart(false);
      }
    },
    [],
  );

  const searchStocks = useCallback(
    async (query: string): Promise<SearchResult[]> => {
      if (!query.trim()) return [];
      setIsLoadingSearch(true);
      setError(null);
      try {
        const data = await invoke({ action: "search", query });
        return (data.results as SearchResult[]) ?? [];
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to search";
        setError(msg);
        return [];
      } finally {
        setIsLoadingSearch(false);
      }
    },
    [],
  );

  const fetchNews = useCallback(
    async (symbols: string[]): Promise<StockNews[]> => {
      if (!symbols.length) return [];
      try {
        const data = await invoke({ action: "news", symbols });
        return (data.news as StockNews[]) ?? [];
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to fetch news";
        setError(msg);
        return [];
      }
    },
    [],
  );

  const fetchExchangeRate = useCallback(
    async (pairs: string[] = ["USDJPY"]): Promise<ExchangeRate[]> => {
      try {
        const data = await invoke({ action: "exchange_rate", pairs });
        return (data.rates as ExchangeRate[]) ?? [];
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Failed to fetch exchange rate";
        setError(msg);
        return [];
      }
    },
    [],
  );

  const financialsCache = useRef<Record<string, CacheEntry<StockFinancials>>>(
    {},
  );

  const fetchFinancials = useCallback(
    async (symbols: string[]): Promise<StockFinancials[]> => {
      if (!symbols.length) return [];
      const now = Date.now();
      const ttl = 10 * 60 * 1000; // 10分
      const uncached: string[] = [];
      const cached: StockFinancials[] = [];

      for (const s of symbols) {
        const entry = financialsCache.current[s];
        if (entry && now - entry.timestamp < ttl) {
          cached.push(entry.data);
        } else {
          uncached.push(s);
        }
      }

      if (uncached.length === 0) return cached;

      try {
        const data = await invoke({ action: "financials", symbols: uncached });
        const results = (data.financials as StockFinancials[]) ?? [];
        for (const f of results) {
          financialsCache.current[f.symbol] = { data: f, timestamp: now };
        }
        return [...cached, ...results];
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Failed to fetch financials";
        setError(msg);
        return cached;
      }
    },
    [],
  );

  return {
    fetchQuotes,
    fetchChart,
    searchStocks,
    fetchNews,
    fetchExchangeRate,
    fetchFinancials,
    isLoadingQuote,
    isLoadingChart,
    isLoadingSearch,
    error,
  };
};
