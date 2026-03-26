import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useOnlineStatus } from "./useOnlineStatus";
import { offlineDb } from "../lib/offlineDb";
import { deleteLocalRow, upsertLocalRow } from "../lib/offlineStore";
import { supabase } from "../lib/offlineSync";
import type {
  Subscription,
  Asset,
  BillingCycle,
  SubscriptionCategory,
  SubscriptionStatus,
  AssetType,
} from "../types";

export const billingCycleOptions: { value: BillingCycle; label: string }[] = [
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
  { value: "weekly", label: "Weekly" },
];

export const categoryOptions: { value: SubscriptionCategory; label: string }[] =
  [
    { value: "entertainment", label: "Entertainment" },
    { value: "productivity", label: "Productivity" },
    { value: "utilities", label: "Utilities" },
    { value: "other", label: "Other" },
  ];

export const subscriptionStatusOptions: {
  value: SubscriptionStatus;
  label: string;
  color: string;
}[] = [
  { value: "active", label: "Active", color: "emerald" },
  { value: "paused", label: "Paused", color: "amber" },
  { value: "cancelled", label: "Cancelled", color: "slate" },
];

export const assetTypeOptions: { value: AssetType; label: string }[] = [
  { value: "bank", label: "Bank Account" },
  { value: "investment", label: "Investment" },
  { value: "stock", label: "Stock" },
  { value: "fund", label: "Fund" },
  { value: "bond", label: "Bond" },
  { value: "crypto", label: "Cryptocurrency" },
  { value: "insurance", label: "Insurance" },
  { value: "pension", label: "Pension" },
  { value: "cash", label: "Cash" },
  { value: "real_estate", label: "Real Estate" },
  { value: "other", label: "Other" },
];

// Exchange rates to JPY (approximate rates, can be updated)
const EXCHANGE_RATES: Record<string, number> = {
  JPY: 1,
  USD: 155, // 1 USD = ~155 JPY
  EUR: 165, // 1 EUR = ~165 JPY
};

const convertToJPY = (amount: number, currency: string): number => {
  const rate = EXCHANGE_RATES[currency] || 1;
  return amount * rate;
};

const generateUuid = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const rand = (Math.random() * 16) | 0;
    const value = char === "x" ? rand : (rand & 0x3) | 0x8;
    return value.toString(16);
  });
};

const toNumber = (value: unknown, fallback = 0) => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toSubscription = (row: Record<string, unknown>): Subscription => ({
  id: row.id as string,
  name: (row.name as string) ?? "",
  amount: toNumber(row.amount, 0),
  currency: (row.currency as string) ?? "JPY",
  billingCycle: (row.billing_cycle as BillingCycle) ?? "monthly",
  nextBillingDate: (row.next_billing_date as string) ?? undefined,
  category: (row.category as SubscriptionCategory) ?? "other",
  status: (row.status as SubscriptionStatus) ?? "active",
  notes: (row.notes as string) ?? "",
  order: (row.order_index as number | null) ?? undefined,
  createdAt: row.created_at as string | undefined,
  updatedAt: row.updated_at as string | undefined,
});

const toAsset = (row: Record<string, unknown>): Asset => ({
  id: row.id as string,
  name: (row.name as string) ?? "",
  assetType: (row.asset_type as AssetType) ?? "bank",
  institution: (row.institution as string) ?? "",
  amount: toNumber(row.amount, 0),
  currency: (row.currency as string) ?? "JPY",
  notes: (row.notes as string) ?? "",
  order: (row.order_index as number | null) ?? undefined,
  createdAt: row.created_at as string | undefined,
  updatedAt: row.updated_at as string | undefined,
});

const toSubscriptionRow = (subscription: Subscription, userId: string) => ({
  id: subscription.id,
  user_id: userId,
  name: subscription.name,
  amount: subscription.amount,
  currency: subscription.currency,
  billing_cycle: subscription.billingCycle,
  next_billing_date: subscription.nextBillingDate ?? null,
  category: subscription.category,
  status: subscription.status,
  notes: subscription.notes,
  order_index: subscription.order ?? null,
  created_at: subscription.createdAt,
  updated_at: subscription.updatedAt,
});

const toAssetRow = (asset: Asset, userId: string) => ({
  id: asset.id,
  user_id: userId,
  name: asset.name,
  asset_type: asset.assetType,
  institution: asset.institution,
  amount: asset.amount,
  currency: asset.currency,
  notes: asset.notes,
  order_index: asset.order ?? null,
  created_at: asset.createdAt,
  updated_at: asset.updatedAt,
});

export const useMoney = () => {
  const { user } = useAuth();
  const isOnline = useOnlineStatus();
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);

  const useSupabase = isOnline && !!user;
  const saveTimeoutRef = useRef<{ [key: string]: NodeJS.Timeout }>({});

  // Fetch all data
  const fetchData = useCallback(async () => {
    if (!user) {
      setSubscriptions([]);
      setAssets([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    try {
      let subRows: unknown[] = [];
      let assetRows: unknown[] = [];

      // If online, fetch from Supabase first
      if (isOnline && supabase) {
        try {
          const { data: subs } = await supabase
            .from("subscriptions")
            .select("*")
            .eq("user_id", user.id);
          const { data: assetData } = await supabase
            .from("assets")
            .select("*")
            .eq("user_id", user.id);

          if (subs) {
            subRows = subs;
            await offlineDb.subscriptions.bulkPut(
              subs as Record<string, unknown>[],
            );
          }
          if (assetData) {
            assetRows = assetData;
            await offlineDb.assets.bulkPut(
              assetData as Record<string, unknown>[],
            );
          }
        } catch (err) {
          console.error(
            "Failed to fetch from Supabase, using local data:",
            err,
          );
          // Fall through to local DB
        }
      }

      // If offline or Supabase failed, use local DB
      if (subRows.length === 0 && assetRows.length === 0) {
        [subRows, assetRows] = await Promise.all([
          offlineDb.subscriptions.where("user_id").equals(user.id).toArray(),
          offlineDb.assets.where("user_id").equals(user.id).toArray(),
        ]);
      }

      const normalizedSubs = subRows
        .map((row) => toSubscription(row as Record<string, unknown>))
        .sort((a, b) => {
          const aOrder = a.order ?? Number.POSITIVE_INFINITY;
          const bOrder = b.order ?? Number.POSITIVE_INFINITY;
          if (aOrder !== bOrder) return aOrder - bOrder;
          return (b.createdAt || "").localeCompare(a.createdAt || "");
        });

      const normalizedAssets = assetRows
        .map((row) => toAsset(row as Record<string, unknown>))
        .sort((a, b) => {
          const aOrder = a.order ?? Number.POSITIVE_INFINITY;
          const bOrder = b.order ?? Number.POSITIVE_INFINITY;
          if (aOrder !== bOrder) return aOrder - bOrder;
          return (b.createdAt || "").localeCompare(a.createdAt || "");
        });

      setSubscriptions(normalizedSubs);
      setAssets(normalizedAssets);
    } catch (error) {
      console.error("Error fetching money data:", error);
    } finally {
      setIsLoading(false);
    }
  }, [user, isOnline]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Subscription CRUD
  const addSubscription = async () => {
    if (!user) return;

    const now = new Date().toISOString();
    const newSubscription: Subscription = {
      id: generateUuid(),
      name: "",
      amount: 0,
      currency: "JPY",
      billingCycle: "monthly",
      category: "other",
      status: "active",
      notes: "",
      createdAt: now,
      updatedAt: now,
    };

    try {
      setIsSyncing(true);
      await upsertLocalRow(
        "subscriptions",
        toSubscriptionRow(newSubscription, user.id),
      );
      setSubscriptions((prev) => [newSubscription, ...prev]);
    } catch (error) {
      console.error("Error adding subscription:", error);
    } finally {
      setIsSyncing(false);
    }
  };

  const updateSubscription = (id: string, updates: Partial<Subscription>) => {
    if (!user) return;

    const updatedSubscriptions = subscriptions.map((s) =>
      s.id === id
        ? { ...s, ...updates, updatedAt: new Date().toISOString() }
        : s,
    );

    setSubscriptions(updatedSubscriptions);

    if (saveTimeoutRef.current[`sub-${id}`]) {
      clearTimeout(saveTimeoutRef.current[`sub-${id}`]);
    }

    saveTimeoutRef.current[`sub-${id}`] = setTimeout(async () => {
      const updatedItem = updatedSubscriptions.find((sub) => sub.id === id);
      if (!updatedItem) return;

      try {
        setIsSyncing(true);
        await upsertLocalRow(
          "subscriptions",
          toSubscriptionRow(updatedItem, user.id),
        );
      } catch (error) {
        console.error("Error updating subscription:", error);
      } finally {
        setIsSyncing(false);
      }
    }, 500);
  };

  const removeSubscription = async (id: string) => {
    if (!user) return;

    try {
      setIsSyncing(true);
      await deleteLocalRow("subscriptions", id);
      setSubscriptions((prev) => prev.filter((s) => s.id !== id));
    } catch (error) {
      console.error("Error removing subscription:", error);
    } finally {
      setIsSyncing(false);
    }
  };

  // Asset CRUD
  const addAsset = async () => {
    if (!user) return;

    const now = new Date().toISOString();
    const newAsset: Asset = {
      id: generateUuid(),
      name: "",
      assetType: "bank",
      institution: "",
      amount: 0,
      currency: "JPY",
      notes: "",
      createdAt: now,
      updatedAt: now,
    };

    try {
      setIsSyncing(true);
      await upsertLocalRow("assets", toAssetRow(newAsset, user.id));
      setAssets((prev) => [newAsset, ...prev]);
    } catch (error) {
      console.error("Error adding asset:", error);
    } finally {
      setIsSyncing(false);
    }
  };

  const updateAsset = (id: string, updates: Partial<Asset>) => {
    if (!user) return;

    const updatedAssets = assets.map((a) =>
      a.id === id
        ? { ...a, ...updates, updatedAt: new Date().toISOString() }
        : a,
    );

    setAssets(updatedAssets);

    if (saveTimeoutRef.current[`asset-${id}`]) {
      clearTimeout(saveTimeoutRef.current[`asset-${id}`]);
    }

    saveTimeoutRef.current[`asset-${id}`] = setTimeout(async () => {
      const updatedItem = updatedAssets.find((asset) => asset.id === id);
      if (!updatedItem) return;

      try {
        setIsSyncing(true);
        await upsertLocalRow("assets", toAssetRow(updatedItem, user.id));
      } catch (error) {
        console.error("Error updating asset:", error);
      } finally {
        setIsSyncing(false);
      }
    }, 500);
  };

  const removeAsset = async (id: string) => {
    if (!user) return;

    try {
      setIsSyncing(true);
      await deleteLocalRow("assets", id);
      setAssets((prev) => prev.filter((a) => a.id !== id));
    } catch (error) {
      console.error("Error removing asset:", error);
    } finally {
      setIsSyncing(false);
    }
  };

  // Calculate totals (converted to JPY)
  const getMonthlySubscriptionTotal = () => {
    return subscriptions
      .filter((s) => s.status === "active")
      .reduce((total, s) => {
        let monthly = s.amount;
        if (s.billingCycle === "yearly") monthly = s.amount / 12;
        if (s.billingCycle === "weekly") monthly = s.amount * 4;
        const monthlyInJPY = convertToJPY(monthly, s.currency);
        return total + monthlyInJPY;
      }, 0);
  };

  const getTotalAssets = () => {
    return assets.reduce((total, a) => {
      const amountInJPY = convertToJPY(a.amount, a.currency);
      return total + amountInJPY;
    }, 0);
  };

  // Reorder subscriptions and save
  const reorderSubscriptions = useCallback(
    async (reorderedSubscriptions: Subscription[]) => {
      if (!user) return;

      const subscriptionsWithOrder = reorderedSubscriptions.map(
        (sub, index) => ({
          ...sub,
          order: index,
        }),
      );

      setSubscriptions(subscriptionsWithOrder);

      try {
        setIsSyncing(true);
        for (const sub of subscriptionsWithOrder) {
          await upsertLocalRow(
            "subscriptions",
            toSubscriptionRow(sub, user.id),
          );
        }
      } catch (error) {
        console.error("Error reordering subscriptions:", error);
      } finally {
        setIsSyncing(false);
      }
    },
    [user],
  );

  // Reorder assets and save
  const reorderAssets = useCallback(
    async (reorderedAssets: Asset[]) => {
      if (!user) return;

      const assetsWithOrder = reorderedAssets.map((asset, index) => ({
        ...asset,
        order: index,
      }));

      setAssets(assetsWithOrder);

      try {
        setIsSyncing(true);
        for (const asset of assetsWithOrder) {
          await upsertLocalRow("assets", toAssetRow(asset, user.id));
        }
      } catch (error) {
        console.error("Error reordering assets:", error);
      } finally {
        setIsSyncing(false);
      }
    },
    [user],
  );

  // Restore state for undo/redo
  const restoreState = async (state: {
    subscriptions: Subscription[];
    assets: Asset[];
  }) => {
    if (!user) {
      setSubscriptions(state.subscriptions);
      setAssets(state.assets);
      return;
    }

    setSubscriptions(state.subscriptions);
    setAssets(state.assets);

    try {
      const [currentSubs, currentAssets] = await Promise.all([
        offlineDb.subscriptions.where("user_id").equals(user.id).toArray(),
        offlineDb.assets.where("user_id").equals(user.id).toArray(),
      ]);

      const nextSubIds = new Set(state.subscriptions.map((sub) => sub.id));
      const nextAssetIds = new Set(state.assets.map((asset) => asset.id));

      for (const row of currentSubs) {
        if (!nextSubIds.has(row.id as string)) {
          await deleteLocalRow("subscriptions", row.id as string);
        }
      }
      for (const row of currentAssets) {
        if (!nextAssetIds.has(row.id as string)) {
          await deleteLocalRow("assets", row.id as string);
        }
      }

      for (const sub of state.subscriptions) {
        await upsertLocalRow("subscriptions", toSubscriptionRow(sub, user.id));
      }
      for (const asset of state.assets) {
        await upsertLocalRow("assets", toAssetRow(asset, user.id));
      }
    } catch (error) {
      console.error("Error restoring money state:", error);
    }
  };

  const refresh = useCallback(async () => {
    setIsSyncing(true);
    await fetchData();
    setIsSyncing(false);
  }, [fetchData]);

  return {
    subscriptions,
    assets,
    isLoading,
    isSyncing,
    useSupabase,
    addSubscription,
    updateSubscription,
    removeSubscription,
    addAsset,
    updateAsset,
    removeAsset,
    getMonthlySubscriptionTotal,
    getTotalAssets,
    reorderSubscriptions,
    reorderAssets,
    refresh,
    restoreState,
  };
};
