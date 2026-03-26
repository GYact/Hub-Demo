import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";

export interface ProviderUsage {
  provider: string;
  todayCost: number;
  monthCost: number;
  todayCount: number;
  monthCount: number;
}

export interface CostLimit {
  id: string;
  provider: string;
  daily_limit_usd: number | null;
  monthly_limit_usd: number | null;
  enabled: boolean;
}

export interface CostSummary {
  providers: ProviderUsage[];
  limits: CostLimit[];
  totalTodayCost: number;
  totalMonthCost: number;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  updateLimit: (
    provider: string,
    updates: Partial<
      Pick<CostLimit, "daily_limit_usd" | "monthly_limit_usd" | "enabled">
    >,
  ) => Promise<void>;
}

const PROVIDERS = ["gemini", "openai", "anthropic", "perplexity"];

export const useCostManagement = (): CostSummary => {
  const [providers, setProviders] = useState<ProviderUsage[]>([]);
  const [limits, setLimits] = useState<CostLimit[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!supabase) return;
    setIsLoading(true);
    setError(null);

    try {
      const now = new Date();
      const startOfDay = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
      ).toISOString();
      const startOfMonth = new Date(
        now.getFullYear(),
        now.getMonth(),
        1,
      ).toISOString();

      // Fetch all usage logs for this month
      const { data: logs, error: logsErr } = await supabase
        .from("api_usage_logs")
        .select("provider, estimated_cost_usd, created_at")
        .gte("created_at", startOfMonth)
        .order("created_at", { ascending: false });

      if (logsErr) throw logsErr;

      // Aggregate by provider
      const usageMap = new Map<
        string,
        {
          todayCost: number;
          monthCost: number;
          todayCount: number;
          monthCount: number;
        }
      >();
      for (const p of PROVIDERS) {
        usageMap.set(p, {
          todayCost: 0,
          monthCost: 0,
          todayCount: 0,
          monthCount: 0,
        });
      }

      for (const log of logs ?? []) {
        const entry = usageMap.get(log.provider);
        if (!entry) {
          usageMap.set(log.provider, {
            todayCost: 0,
            monthCost: 0,
            todayCount: 0,
            monthCount: 0,
          });
        }
        const e = usageMap.get(log.provider)!;
        const cost = Number(log.estimated_cost_usd);
        e.monthCost += cost;
        e.monthCount += 1;
        if (log.created_at >= startOfDay) {
          e.todayCost += cost;
          e.todayCount += 1;
        }
      }

      const providerUsages: ProviderUsage[] = PROVIDERS.map((p) => ({
        provider: p,
        ...(usageMap.get(p) ?? {
          todayCost: 0,
          monthCost: 0,
          todayCount: 0,
          monthCount: 0,
        }),
      }));

      setProviders(providerUsages);

      // Fetch limits
      const { data: limitsData, error: limitsErr } = await supabase
        .from("api_cost_limits")
        .select("*")
        .order("provider");

      if (limitsErr) throw limitsErr;
      setLimits(limitsData ?? []);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to fetch cost data",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  const updateLimit = useCallback(
    async (
      provider: string,
      updates: Partial<
        Pick<CostLimit, "daily_limit_usd" | "monthly_limit_usd" | "enabled">
      >,
    ) => {
      if (!supabase) return;

      const { error: err } = await supabase
        .from("api_cost_limits")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("provider", provider);

      if (err) {
        setError(err.message);
        return;
      }

      // Optimistic update
      setLimits((prev) =>
        prev.map((l) => (l.provider === provider ? { ...l, ...updates } : l)),
      );
    },
    [],
  );

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const totalTodayCost = providers.reduce((s, p) => s + p.todayCost, 0);
  const totalMonthCost = providers.reduce((s, p) => s + p.monthCost, 0);

  return {
    providers,
    limits,
    totalTodayCost,
    totalMonthCost,
    isLoading,
    error,
    refresh: fetchData,
    updateLimit,
  };
};
