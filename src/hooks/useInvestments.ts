import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useOnlineStatus } from "./useOnlineStatus";
import {
  offlineDb,
  type InvestPortfolioRow,
  type InvestHoldingRow,
  type InvestWatchlistRow,
  type InvestTransactionRow,
  type InvestAlertRow,
  type InvestChartDrawingRow,
} from "../lib/offlineDb";
import { deleteLocalRow, upsertLocalRow } from "../lib/offlineStore";
import { supabase } from "../lib/offlineSync";
import type {
  InvestPortfolio,
  InvestHolding,
  InvestWatchlistItem,
  InvestTransaction,
  InvestAlert,
  InvestMarket,
  InvestTransactionType,
} from "../types";
import type {
  InvestChartDrawing,
  DrawingTool,
  DrawingPoint,
} from "../components/invest/chartDrawings/types";

const generateUuid = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto)
    return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
};

const toNumber = (value: unknown, fallback = 0) => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

// --- Portfolio converters ---
const toPortfolio = (row: Record<string, unknown>): InvestPortfolio => ({
  id: row.id as string,
  name: (row.name as string) ?? "",
  description: (row.description as string) ?? "",
  currency: (row.currency as string) ?? "JPY",
  order: (row.order_index as number | null) ?? undefined,
  createdAt: row.created_at as string | undefined,
  updatedAt: row.updated_at as string | undefined,
});

const toPortfolioRow = (
  p: InvestPortfolio,
  userId: string,
): InvestPortfolioRow => ({
  id: p.id,
  user_id: userId,
  name: p.name,
  description: p.description,
  currency: p.currency,
  order_index: p.order ?? null,
  created_at: p.createdAt,
  updated_at: p.updatedAt,
});

// --- Holding converters ---
const toHolding = (row: Record<string, unknown>): InvestHolding => ({
  id: row.id as string,
  portfolioId: (row.portfolio_id as string) ?? "",
  symbol: (row.symbol as string) ?? "",
  name: (row.name as string) ?? "",
  market: ((row.market as string) ?? "JP") as InvestMarket,
  quantity: toNumber(row.quantity, 0),
  avgCost: toNumber(row.avg_cost, 0),
  currency: (row.currency as string) ?? "JPY",
  notes: (row.notes as string) ?? "",
  order: (row.order_index as number | null) ?? undefined,
  createdAt: row.created_at as string | undefined,
  updatedAt: row.updated_at as string | undefined,
});

const toHoldingRow = (h: InvestHolding, userId: string): InvestHoldingRow => ({
  id: h.id,
  user_id: userId,
  portfolio_id: h.portfolioId,
  symbol: h.symbol,
  name: h.name,
  market: h.market,
  quantity: h.quantity,
  avg_cost: h.avgCost,
  currency: h.currency,
  notes: h.notes,
  order_index: h.order ?? null,
  created_at: h.createdAt,
  updated_at: h.updatedAt,
});

// --- Watchlist converters ---
const toWatchlistItem = (
  row: Record<string, unknown>,
): InvestWatchlistItem => ({
  id: row.id as string,
  symbol: (row.symbol as string) ?? "",
  name: (row.name as string) ?? "",
  market: ((row.market as string) ?? "JP") as InvestMarket,
  notes: (row.notes as string) ?? "",
  order: (row.order_index as number | null) ?? undefined,
  createdAt: row.created_at as string | undefined,
  updatedAt: row.updated_at as string | undefined,
});

const toWatchlistRow = (
  w: InvestWatchlistItem,
  userId: string,
): InvestWatchlistRow => ({
  id: w.id,
  user_id: userId,
  symbol: w.symbol,
  name: w.name,
  market: w.market,
  notes: w.notes,
  order_index: w.order ?? null,
  created_at: w.createdAt,
  updated_at: w.updatedAt,
});

// --- Transaction converters ---
const toTransaction = (row: Record<string, unknown>): InvestTransaction => ({
  id: row.id as string,
  portfolioId: (row.portfolio_id as string) ?? "",
  symbol: (row.symbol as string) ?? "",
  name: (row.name as string) ?? "",
  market: ((row.market as string) ?? "JP") as InvestMarket,
  type: ((row.type as string) ?? "buy") as InvestTransactionType,
  quantity: toNumber(row.quantity, 0),
  price: toNumber(row.price, 0),
  fee: toNumber(row.fee, 0),
  currency: (row.currency as string) ?? "JPY",
  notes: (row.notes as string) ?? "",
  transactedAt: (row.transacted_at as string) ?? new Date().toISOString(),
  createdAt: row.created_at as string | undefined,
  updatedAt: row.updated_at as string | undefined,
});

const toTransactionRow = (
  t: InvestTransaction,
  userId: string,
): InvestTransactionRow => ({
  id: t.id,
  user_id: userId,
  portfolio_id: t.portfolioId,
  symbol: t.symbol,
  name: t.name,
  market: t.market,
  type: t.type,
  quantity: t.quantity,
  price: t.price,
  fee: t.fee,
  currency: t.currency,
  notes: t.notes,
  transacted_at: t.transactedAt,
  created_at: t.createdAt,
  updated_at: t.updatedAt,
});

// --- Alert converters ---
const toAlert = (row: Record<string, unknown>): InvestAlert => ({
  id: row.id as string,
  symbol: (row.symbol as string) ?? "",
  name: (row.name as string) ?? "",
  market: ((row.market as string) ?? "JP") as InvestMarket,
  targetPrice: toNumber(row.target_price, 0),
  condition: ((row.condition as string) ?? "above") as "above" | "below",
  enabled: row.enabled !== false,
  triggeredAt: (row.triggered_at as string) ?? undefined,
  createdAt: row.created_at as string | undefined,
  updatedAt: row.updated_at as string | undefined,
});

const toAlertRow = (a: InvestAlert, userId: string): InvestAlertRow => ({
  id: a.id,
  user_id: userId,
  symbol: a.symbol,
  name: a.name,
  market: a.market,
  target_price: a.targetPrice,
  condition: a.condition,
  enabled: a.enabled,
  triggered_at: a.triggeredAt ?? null,
  created_at: a.createdAt,
  updated_at: a.updatedAt,
});

// --- ChartDrawing converters ---
const toChartDrawing = (row: Record<string, unknown>): InvestChartDrawing => ({
  id: row.id as string,
  symbol: (row.symbol as string) ?? "",
  tool: ((row.tool as string) ?? "pin") as DrawingTool,
  points: (typeof row.points === "string"
    ? JSON.parse(row.points)
    : (row.points ?? [])) as DrawingPoint[],
  color: (row.color as string) ?? "#3b82f6",
  label: (row.label as string) ?? "",
  note: (row.note as string) ?? "",
  lineWidth: toNumber(row.line_width, 1),
  lineStyle: ((row.line_style as string) ?? "solid") as
    | "solid"
    | "dashed"
    | "dotted",
  visible: row.visible !== false,
  createdAt: row.created_at as string | undefined,
  updatedAt: row.updated_at as string | undefined,
});

const toChartDrawingRow = (
  d: InvestChartDrawing,
  userId: string,
): InvestChartDrawingRow => ({
  id: d.id,
  user_id: userId,
  symbol: d.symbol,
  tool: d.tool,
  points: JSON.stringify(d.points),
  color: d.color,
  label: d.label,
  note: d.note,
  line_width: d.lineWidth,
  line_style: d.lineStyle,
  visible: d.visible,
  created_at: d.createdAt,
  updated_at: d.updatedAt,
});

// Sort helper
const sortByOrder = <T extends { order?: number; createdAt?: string }>(
  items: T[],
): T[] =>
  [...items].sort((a, b) => {
    const aO = a.order ?? Number.POSITIVE_INFINITY;
    const bO = b.order ?? Number.POSITIVE_INFINITY;
    if (aO !== bO) return aO - bO;
    return (b.createdAt || "").localeCompare(a.createdAt || "");
  });

// Generic fetch helper
const fetchTable = async <TRow, TApp>(
  table:
    | "invest_portfolios"
    | "invest_holdings"
    | "invest_watchlist"
    | "invest_transactions"
    | "invest_alerts"
    | "invest_chart_drawings",
  userId: string,
  isOnline: boolean,
  converter: (row: Record<string, unknown>) => TApp,
): Promise<TApp[]> => {
  let rows: unknown[] = [];
  if (isOnline && supabase) {
    try {
      const { data } = await supabase
        .from(table)
        .select("*")
        .eq("user_id", userId);
      if (data) {
        rows = data;
        await (offlineDb[table] as import("dexie").Table<TRow, string>).bulkPut(
          data as TRow[],
        );
      }
    } catch (err) {
      console.error(`Failed to fetch ${table} from Supabase:`, err);
    }
  }
  if (rows.length === 0) {
    rows = await (offlineDb[table] as import("dexie").Table<TRow, string>)
      .where("user_id")
      .equals(userId)
      .toArray();
  }
  return rows.map((r) => converter(r as Record<string, unknown>));
};

export const useInvestments = () => {
  const { user } = useAuth();
  const isOnline = useOnlineStatus();
  const [portfolios, setPortfolios] = useState<InvestPortfolio[]>([]);
  const [holdings, setHoldings] = useState<InvestHolding[]>([]);
  const [watchlist, setWatchlist] = useState<InvestWatchlistItem[]>([]);
  const [transactions, setTransactions] = useState<InvestTransaction[]>([]);
  const [alerts, setAlerts] = useState<InvestAlert[]>([]);
  const [chartDrawings, setChartDrawings] = useState<InvestChartDrawing[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const saveTimeoutRef = useRef<Record<string, NodeJS.Timeout>>({});

  const fetchData = useCallback(async () => {
    if (!user) {
      setPortfolios([]);
      setHoldings([]);
      setWatchlist([]);
      setTransactions([]);
      setAlerts([]);
      setChartDrawings([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const [pf, hd, wl, tx, al, cd] = await Promise.all([
        fetchTable<InvestPortfolioRow, InvestPortfolio>(
          "invest_portfolios",
          user.id,
          isOnline,
          toPortfolio,
        ),
        fetchTable<InvestHoldingRow, InvestHolding>(
          "invest_holdings",
          user.id,
          isOnline,
          toHolding,
        ),
        fetchTable<InvestWatchlistRow, InvestWatchlistItem>(
          "invest_watchlist",
          user.id,
          isOnline,
          toWatchlistItem,
        ),
        fetchTable<InvestTransactionRow, InvestTransaction>(
          "invest_transactions",
          user.id,
          isOnline,
          toTransaction,
        ),
        fetchTable<InvestAlertRow, InvestAlert>(
          "invest_alerts",
          user.id,
          isOnline,
          toAlert,
        ),
        fetchTable<InvestChartDrawingRow, InvestChartDrawing>(
          "invest_chart_drawings",
          user.id,
          isOnline,
          toChartDrawing,
        ),
      ]);
      setPortfolios(sortByOrder(pf));
      setHoldings(sortByOrder(hd));
      setWatchlist(sortByOrder(wl));
      setTransactions(
        [...tx].sort((a, b) =>
          (b.transactedAt || "").localeCompare(a.transactedAt || ""),
        ),
      );
      setAlerts(al);
      setChartDrawings(cd);
    } catch (error) {
      console.error("Error fetching investments:", error);
    } finally {
      setIsLoading(false);
    }
  }, [user, isOnline]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // --- Portfolio CRUD ---
  const addPortfolio = async (name = "") => {
    if (!user) return;
    const now = new Date().toISOString();
    const pf: InvestPortfolio = {
      id: generateUuid(),
      name: name || "新しいポートフォリオ",
      description: "",
      currency: "JPY",
      createdAt: now,
      updatedAt: now,
    };
    try {
      setIsSyncing(true);
      await upsertLocalRow(
        "invest_portfolios",
        toPortfolioRow(pf, user.id) as unknown as Record<string, unknown>,
      );
      setPortfolios((prev) => [pf, ...prev]);
    } catch (error) {
      console.error("Error adding portfolio:", error);
    } finally {
      setIsSyncing(false);
    }
    return pf.id;
  };

  const updatePortfolio = (id: string, updates: Partial<InvestPortfolio>) => {
    if (!user) return;
    const updated = portfolios.map((p) =>
      p.id === id
        ? { ...p, ...updates, updatedAt: new Date().toISOString() }
        : p,
    );
    setPortfolios(updated);
    const key = `pf-${id}`;
    if (saveTimeoutRef.current[key]) clearTimeout(saveTimeoutRef.current[key]);
    saveTimeoutRef.current[key] = setTimeout(async () => {
      const item = updated.find((p) => p.id === id);
      if (!item) return;
      try {
        setIsSyncing(true);
        await upsertLocalRow(
          "invest_portfolios",
          toPortfolioRow(item, user.id) as unknown as Record<string, unknown>,
        );
      } catch (error) {
        console.error("Error updating portfolio:", error);
      } finally {
        setIsSyncing(false);
      }
    }, 500);
  };

  const removePortfolio = async (id: string) => {
    if (!user) return;
    try {
      setIsSyncing(true);
      // Remove associated holdings first
      const relatedHoldings = holdings.filter((h) => h.portfolioId === id);
      for (const h of relatedHoldings) {
        await deleteLocalRow("invest_holdings", h.id);
      }
      await deleteLocalRow("invest_portfolios", id);
      setPortfolios((prev) => prev.filter((p) => p.id !== id));
      setHoldings((prev) => prev.filter((h) => h.portfolioId !== id));
    } catch (error) {
      console.error("Error removing portfolio:", error);
    } finally {
      setIsSyncing(false);
    }
  };

  // --- Holding CRUD ---
  const addHolding = async (
    portfolioId: string,
    symbol: string,
    name: string,
    market: InvestMarket,
    quantity = 0,
    avgCost = 0,
  ) => {
    if (!user) return;
    const now = new Date().toISOString();
    const holding: InvestHolding = {
      id: generateUuid(),
      portfolioId,
      symbol,
      name,
      market,
      quantity,
      avgCost,
      currency: market === "US" ? "USD" : "JPY",
      notes: "",
      createdAt: now,
      updatedAt: now,
    };
    try {
      setIsSyncing(true);
      await upsertLocalRow(
        "invest_holdings",
        toHoldingRow(holding, user.id) as unknown as Record<string, unknown>,
      );
      setHoldings((prev) => [holding, ...prev]);
    } catch (error) {
      console.error("Error adding holding:", error);
    } finally {
      setIsSyncing(false);
    }
  };

  const updateHolding = (id: string, updates: Partial<InvestHolding>) => {
    if (!user) return;
    const updated = holdings.map((h) =>
      h.id === id
        ? { ...h, ...updates, updatedAt: new Date().toISOString() }
        : h,
    );
    setHoldings(updated);
    const key = `hd-${id}`;
    if (saveTimeoutRef.current[key]) clearTimeout(saveTimeoutRef.current[key]);
    saveTimeoutRef.current[key] = setTimeout(async () => {
      const item = updated.find((h) => h.id === id);
      if (!item) return;
      try {
        setIsSyncing(true);
        await upsertLocalRow(
          "invest_holdings",
          toHoldingRow(item, user.id) as unknown as Record<string, unknown>,
        );
      } catch (error) {
        console.error("Error updating holding:", error);
      } finally {
        setIsSyncing(false);
      }
    }, 500);
  };

  const removeHolding = async (id: string) => {
    if (!user) return;
    try {
      setIsSyncing(true);
      await deleteLocalRow("invest_holdings", id);
      setHoldings((prev) => prev.filter((h) => h.id !== id));
    } catch (error) {
      console.error("Error removing holding:", error);
    } finally {
      setIsSyncing(false);
    }
  };

  // --- Watchlist CRUD ---
  const addWatchlistItem = async (
    symbol: string,
    name: string,
    market: InvestMarket,
  ) => {
    if (!user) return;
    const now = new Date().toISOString();
    const item: InvestWatchlistItem = {
      id: generateUuid(),
      symbol,
      name,
      market,
      notes: "",
      createdAt: now,
      updatedAt: now,
    };
    try {
      setIsSyncing(true);
      await upsertLocalRow(
        "invest_watchlist",
        toWatchlistRow(item, user.id) as unknown as Record<string, unknown>,
      );
      setWatchlist((prev) => [item, ...prev]);
    } catch (error) {
      console.error("Error adding watchlist item:", error);
    } finally {
      setIsSyncing(false);
    }
  };

  const updateWatchlistItem = (
    id: string,
    updates: Partial<InvestWatchlistItem>,
  ) => {
    if (!user) return;
    const updated = watchlist.map((w) =>
      w.id === id
        ? { ...w, ...updates, updatedAt: new Date().toISOString() }
        : w,
    );
    setWatchlist(updated);
    const key = `wl-${id}`;
    if (saveTimeoutRef.current[key]) clearTimeout(saveTimeoutRef.current[key]);
    saveTimeoutRef.current[key] = setTimeout(async () => {
      const item = updated.find((w) => w.id === id);
      if (!item) return;
      try {
        setIsSyncing(true);
        await upsertLocalRow(
          "invest_watchlist",
          toWatchlistRow(item, user.id) as unknown as Record<string, unknown>,
        );
      } catch (error) {
        console.error("Error updating watchlist item:", error);
      } finally {
        setIsSyncing(false);
      }
    }, 500);
  };

  const removeWatchlistItem = async (id: string) => {
    if (!user) return;
    try {
      setIsSyncing(true);
      await deleteLocalRow("invest_watchlist", id);
      setWatchlist((prev) => prev.filter((w) => w.id !== id));
    } catch (error) {
      console.error("Error removing watchlist item:", error);
    } finally {
      setIsSyncing(false);
    }
  };

  // --- Transaction CRUD ---
  const addTransaction = async (
    tx: Omit<InvestTransaction, "id" | "createdAt" | "updatedAt">,
  ) => {
    if (!user) return;
    const now = new Date().toISOString();
    const item: InvestTransaction = {
      ...tx,
      id: generateUuid(),
      createdAt: now,
      updatedAt: now,
    };
    try {
      setIsSyncing(true);
      await upsertLocalRow(
        "invest_transactions",
        toTransactionRow(item, user.id) as unknown as Record<string, unknown>,
      );
      setTransactions((prev) =>
        [item, ...prev].sort((a, b) =>
          (b.transactedAt || "").localeCompare(a.transactedAt || ""),
        ),
      );
    } catch (error) {
      console.error("Error adding transaction:", error);
    } finally {
      setIsSyncing(false);
    }
  };

  const removeTransaction = async (id: string) => {
    if (!user) return;
    try {
      setIsSyncing(true);
      await deleteLocalRow("invest_transactions", id);
      setTransactions((prev) => prev.filter((t) => t.id !== id));
    } catch (error) {
      console.error("Error removing transaction:", error);
    } finally {
      setIsSyncing(false);
    }
  };

  // --- Alert CRUD ---
  const addAlert = async (
    alert: Omit<InvestAlert, "id" | "createdAt" | "updatedAt">,
  ) => {
    if (!user) return;
    const now = new Date().toISOString();
    const item: InvestAlert = {
      ...alert,
      id: generateUuid(),
      createdAt: now,
      updatedAt: now,
    };
    try {
      setIsSyncing(true);
      await upsertLocalRow(
        "invest_alerts",
        toAlertRow(item, user.id) as unknown as Record<string, unknown>,
      );
      setAlerts((prev) => [item, ...prev]);
    } catch (error) {
      console.error("Error adding alert:", error);
    } finally {
      setIsSyncing(false);
    }
  };

  const updateAlert = (id: string, updates: Partial<InvestAlert>) => {
    if (!user) return;
    const updated = alerts.map((a) =>
      a.id === id
        ? { ...a, ...updates, updatedAt: new Date().toISOString() }
        : a,
    );
    setAlerts(updated);
    const key = `al-${id}`;
    if (saveTimeoutRef.current[key]) clearTimeout(saveTimeoutRef.current[key]);
    saveTimeoutRef.current[key] = setTimeout(async () => {
      const item = updated.find((a) => a.id === id);
      if (!item) return;
      try {
        setIsSyncing(true);
        await upsertLocalRow(
          "invest_alerts",
          toAlertRow(item, user.id) as unknown as Record<string, unknown>,
        );
      } catch (error) {
        console.error("Error updating alert:", error);
      } finally {
        setIsSyncing(false);
      }
    }, 500);
  };

  const removeAlert = async (id: string) => {
    if (!user) return;
    try {
      setIsSyncing(true);
      await deleteLocalRow("invest_alerts", id);
      setAlerts((prev) => prev.filter((a) => a.id !== id));
    } catch (error) {
      console.error("Error removing alert:", error);
    } finally {
      setIsSyncing(false);
    }
  };

  // --- ChartDrawing CRUD ---
  const addChartDrawing = async (
    drawing: Omit<InvestChartDrawing, "id" | "createdAt" | "updatedAt">,
  ) => {
    if (!user) return;
    const now = new Date().toISOString();
    const item: InvestChartDrawing = {
      ...drawing,
      id: generateUuid(),
      createdAt: now,
      updatedAt: now,
    };
    try {
      setIsSyncing(true);
      await upsertLocalRow(
        "invest_chart_drawings",
        toChartDrawingRow(item, user.id) as unknown as Record<string, unknown>,
      );
      setChartDrawings((prev) => [item, ...prev]);
    } catch (error) {
      console.error("Error adding chart drawing:", error);
    } finally {
      setIsSyncing(false);
    }
  };

  const updateChartDrawing = (
    id: string,
    updates: Partial<InvestChartDrawing>,
  ) => {
    if (!user) return;
    const updated = chartDrawings.map((d) =>
      d.id === id
        ? { ...d, ...updates, updatedAt: new Date().toISOString() }
        : d,
    );
    setChartDrawings(updated);
    const key = `cd-${id}`;
    if (saveTimeoutRef.current[key]) clearTimeout(saveTimeoutRef.current[key]);
    saveTimeoutRef.current[key] = setTimeout(async () => {
      const item = updated.find((d) => d.id === id);
      if (!item) return;
      try {
        setIsSyncing(true);
        await upsertLocalRow(
          "invest_chart_drawings",
          toChartDrawingRow(item, user.id) as unknown as Record<
            string,
            unknown
          >,
        );
      } catch (error) {
        console.error("Error updating chart drawing:", error);
      } finally {
        setIsSyncing(false);
      }
    }, 500);
  };

  const removeChartDrawing = async (id: string) => {
    if (!user) return;
    try {
      setIsSyncing(true);
      await deleteLocalRow("invest_chart_drawings", id);
      setChartDrawings((prev) => prev.filter((d) => d.id !== id));
    } catch (error) {
      console.error("Error removing chart drawing:", error);
    } finally {
      setIsSyncing(false);
    }
  };

  const removeAllChartDrawings = async (symbol: string) => {
    if (!user) return;
    const toRemove = chartDrawings.filter((d) => d.symbol === symbol);
    try {
      setIsSyncing(true);
      for (const d of toRemove) {
        await deleteLocalRow("invest_chart_drawings", d.id);
      }
      setChartDrawings((prev) => prev.filter((d) => d.symbol !== symbol));
    } catch (error) {
      console.error("Error removing all chart drawings:", error);
    } finally {
      setIsSyncing(false);
    }
  };

  const refresh = useCallback(async () => {
    setIsSyncing(true);
    await fetchData();
    setIsSyncing(false);
  }, [fetchData]);

  return {
    portfolios,
    holdings,
    watchlist,
    transactions,
    alerts,
    chartDrawings,
    isLoading,
    isSyncing,
    addPortfolio,
    updatePortfolio,
    removePortfolio,
    addHolding,
    updateHolding,
    removeHolding,
    addWatchlistItem,
    updateWatchlistItem,
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
    refresh,
  };
};
