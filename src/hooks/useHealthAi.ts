import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useOnlineStatus } from "./useOnlineStatus";
import {
  offlineDb,
  type HealthMealRow,
  type HealthSupplementRow,
} from "../lib/offlineDb";
import { deleteLocalRow, upsertLocalRow } from "../lib/offlineStore";
import { supabase } from "../lib/offlineSync";
import { uploadToStorage } from "../lib/storageUpload";
import type {
  HealthMeal,
  HealthSupplement,
  MealType,
  SupplementFrequency,
} from "../types";

const generateUuid = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto)
    return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
};

const toNumber = (v: unknown, fb = 0) => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fb;
};

// --- Transform helpers ---
const toMeal = (row: Record<string, unknown>): HealthMeal => ({
  id: row.id as string,
  user_id: row.user_id as string | undefined,
  meal_type: (row.meal_type as MealType) ?? "other",
  photo_url: (row.photo_url as string) ?? undefined,
  eaten_at: (row.eaten_at as string) ?? new Date().toISOString(),
  calories: row.calories != null ? toNumber(row.calories) : undefined,
  protein_g: row.protein_g != null ? toNumber(row.protein_g) : undefined,
  carbs_g: row.carbs_g != null ? toNumber(row.carbs_g) : undefined,
  fat_g: row.fat_g != null ? toNumber(row.fat_g) : undefined,
  fiber_g: row.fiber_g != null ? toNumber(row.fiber_g) : undefined,
  nutrients: (row.nutrients as Record<string, number | string>) ?? undefined,
  items:
    (row.items as Array<{
      name: string;
      amount_g?: number;
      calories?: number;
    }>) ?? undefined,
  ai_raw: (row.ai_raw as Record<string, unknown>) ?? undefined,
  notes: (row.notes as string) ?? undefined,
  created_at: row.created_at as string | undefined,
  updated_at: row.updated_at as string | undefined,
});

const toMealRow = (meal: HealthMeal, userId: string): HealthMealRow => ({
  id: meal.id,
  user_id: userId,
  meal_type: meal.meal_type,
  photo_url: meal.photo_url ?? null,
  eaten_at: meal.eaten_at,
  calories: meal.calories ?? null,
  protein_g: meal.protein_g ?? null,
  carbs_g: meal.carbs_g ?? null,
  fat_g: meal.fat_g ?? null,
  fiber_g: meal.fiber_g ?? null,
  nutrients: (meal.nutrients as Record<string, unknown>) ?? null,
  items: (meal.items as unknown[]) ?? null,
  ai_raw: meal.ai_raw ?? null,
  notes: meal.notes ?? null,
  created_at: meal.created_at,
  updated_at: meal.updated_at,
});

const toSupplement = (row: Record<string, unknown>): HealthSupplement => ({
  id: row.id as string,
  user_id: row.user_id as string | undefined,
  name: (row.name as string) ?? "",
  brand: (row.brand as string) ?? undefined,
  photo_url: (row.photo_url as string) ?? undefined,
  dosage: (row.dosage as string) ?? undefined,
  frequency: (row.frequency as SupplementFrequency) ?? "daily",
  nutrients: (row.nutrients as Record<string, string>) ?? undefined,
  active: row.active !== false,
  notes: (row.notes as string) ?? undefined,
  created_at: row.created_at as string | undefined,
  updated_at: row.updated_at as string | undefined,
});

const toSupplementRow = (
  s: HealthSupplement,
  userId: string,
): HealthSupplementRow => ({
  id: s.id,
  user_id: userId,
  name: s.name,
  brand: s.brand ?? null,
  photo_url: s.photo_url ?? null,
  dosage: s.dosage ?? null,
  frequency: s.frequency,
  nutrients: (s.nutrients as Record<string, unknown>) ?? null,
  active: s.active,
  notes: s.notes ?? null,
  created_at: s.created_at,
  updated_at: s.updated_at,
});

// --- useHealthMeals ---
export const useHealthMeals = () => {
  const { user } = useAuth();
  const isOnline = useOnlineStatus();
  const [meals, setMeals] = useState<HealthMeal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [analyzing, setAnalyzing] = useState<string | null>(null);
  const saveTimeoutRef = useRef<Record<string, ReturnType<typeof setTimeout>>>(
    {},
  );

  const fetchMeals = useCallback(async () => {
    if (!user) {
      setMeals([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      let rows: unknown[] = [];
      if (isOnline && supabase) {
        try {
          const { data } = await supabase
            .from("health_meals")
            .select("*")
            .eq("user_id", user.id)
            .order("eaten_at", { ascending: false });
          if (data) {
            rows = data;
            await offlineDb.health_meals.bulkPut(data as HealthMealRow[]);
          }
        } catch (err) {
          console.error("Failed to fetch meals from Supabase:", err);
        }
      }
      if (rows.length === 0) {
        rows = await offlineDb.health_meals
          .where("user_id")
          .equals(user.id)
          .toArray();
      }
      const normalized = rows
        .map((r) => toMeal(r as Record<string, unknown>))
        .sort(
          (a, b) =>
            new Date(b.eaten_at).getTime() - new Date(a.eaten_at).getTime(),
        );
      setMeals(normalized);
    } catch (err) {
      console.error("Error fetching meals:", err);
    } finally {
      setIsLoading(false);
    }
  }, [user, isOnline]);

  useEffect(() => {
    fetchMeals();
  }, [fetchMeals]);

  useEffect(() => {
    const handler = () => fetchMeals();
    window.addEventListener("sync-complete", handler);
    return () => window.removeEventListener("sync-complete", handler);
  }, [fetchMeals]);

  const addMeal = async (
    mealType: MealType = "other",
  ): Promise<HealthMeal | null> => {
    if (!user) return null;
    const now = new Date().toISOString();
    const newMeal: HealthMeal = {
      id: generateUuid(),
      user_id: user.id,
      meal_type: mealType,
      eaten_at: now,
      created_at: now,
      updated_at: now,
    };
    try {
      setIsSyncing(true);
      await upsertLocalRow("health_meals", toMealRow(newMeal, user.id));
      setMeals((prev) => [newMeal, ...prev]);
      return newMeal;
    } catch (err) {
      console.error("Error adding meal:", err);
      return null;
    } finally {
      setIsSyncing(false);
    }
  };

  const updateMeal = (id: string, updates: Partial<HealthMeal>) => {
    if (!user) return;
    const updated = meals.map((m) =>
      m.id === id
        ? { ...m, ...updates, updated_at: new Date().toISOString() }
        : m,
    );
    setMeals(updated);

    if (saveTimeoutRef.current[id]) clearTimeout(saveTimeoutRef.current[id]);
    saveTimeoutRef.current[id] = setTimeout(async () => {
      const item = updated.find((m) => m.id === id);
      if (!item) return;
      try {
        setIsSyncing(true);
        await upsertLocalRow("health_meals", toMealRow(item, user.id));
      } catch (err) {
        console.error("Error updating meal:", err);
      } finally {
        setIsSyncing(false);
      }
    }, 500);
  };

  const removeMeal = async (id: string) => {
    if (!user) return;
    try {
      setIsSyncing(true);
      const meal = meals.find((m) => m.id === id);
      if (meal?.photo_url && isOnline && supabase) {
        await supabase.storage.from("health-photos").remove([meal.photo_url]);
      }
      await deleteLocalRow("health_meals", id);
      setMeals((prev) => prev.filter((m) => m.id !== id));
    } catch (err) {
      console.error("Error removing meal:", err);
    } finally {
      setIsSyncing(false);
    }
  };

  const analyzeMealPhoto = async (
    mealId: string,
    file: File,
  ): Promise<boolean> => {
    if (!user || !supabase) return false;
    setAnalyzing(mealId);
    try {
      // Upload photo
      const ext = file.name.split(".").pop() ?? "jpg";
      const storagePath = `${user.id}/meals/${mealId}.${ext}`;
      const buf = await file.arrayBuffer();
      await uploadToStorage("health-photos", storagePath, buf, file.type, {
        tableName: "health_meals",
        recordId: mealId,
        fieldName: "photo_url",
      });

      // Convert to base64 for AI analysis
      const base64 = btoa(
        new Uint8Array(buf).reduce(
          (data, byte) => data + String.fromCharCode(byte),
          "",
        ),
      );

      // Call Edge Function
      const { data, error } = await supabase.functions.invoke("health_ai", {
        body: { base64Data: base64, mimeType: file.type, type: "meal" },
      });

      if (error) {
        console.error("Health AI analysis failed:", error);
        // Still save photo_url even if AI fails
        updateMeal(mealId, { photo_url: storagePath });
        return false;
      }

      const result = data?.result ?? {};
      updateMeal(mealId, {
        photo_url: storagePath,
        calories: result.calories,
        protein_g: result.protein_g,
        carbs_g: result.carbs_g,
        fat_g: result.fat_g,
        fiber_g: result.fiber_g,
        nutrients: result.nutrients,
        items: result.items,
        ai_raw: result,
      });
      return true;
    } catch (err) {
      console.error("Error analyzing meal:", err);
      return false;
    } finally {
      setAnalyzing(null);
    }
  };

  const getPhotoUrl = async (path: string): Promise<string | null> => {
    if (!supabase || !path) return null;
    const { data } = await supabase.storage
      .from("health-photos")
      .createSignedUrl(path, 3600);
    return data?.signedUrl ?? null;
  };

  return {
    meals,
    isLoading,
    isSyncing,
    analyzing,
    addMeal,
    updateMeal,
    removeMeal,
    analyzeMealPhoto,
    getPhotoUrl,
    refresh: fetchMeals,
  };
};

// --- useHealthSupplements ---
export const useHealthSupplements = () => {
  const { user } = useAuth();
  const isOnline = useOnlineStatus();
  const [supplements, setSupplements] = useState<HealthSupplement[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [analyzing, setAnalyzing] = useState<string | null>(null);
  const saveTimeoutRef = useRef<Record<string, ReturnType<typeof setTimeout>>>(
    {},
  );

  const fetchSupplements = useCallback(async () => {
    if (!user) {
      setSupplements([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      let rows: unknown[] = [];
      if (isOnline && supabase) {
        try {
          const { data } = await supabase
            .from("health_supplements")
            .select("*")
            .eq("user_id", user.id)
            .order("created_at", { ascending: false });
          if (data) {
            rows = data;
            await offlineDb.health_supplements.bulkPut(
              data as HealthSupplementRow[],
            );
          }
        } catch (err) {
          console.error("Failed to fetch supplements from Supabase:", err);
        }
      }
      if (rows.length === 0) {
        rows = await offlineDb.health_supplements
          .where("user_id")
          .equals(user.id)
          .toArray();
      }
      setSupplements(
        rows.map((r) => toSupplement(r as Record<string, unknown>)),
      );
    } catch (err) {
      console.error("Error fetching supplements:", err);
    } finally {
      setIsLoading(false);
    }
  }, [user, isOnline]);

  useEffect(() => {
    fetchSupplements();
  }, [fetchSupplements]);

  useEffect(() => {
    const handler = () => fetchSupplements();
    window.addEventListener("sync-complete", handler);
    return () => window.removeEventListener("sync-complete", handler);
  }, [fetchSupplements]);

  const addSupplement = async (): Promise<HealthSupplement | null> => {
    if (!user) return null;
    const now = new Date().toISOString();
    const s: HealthSupplement = {
      id: generateUuid(),
      user_id: user.id,
      name: "",
      frequency: "daily",
      active: true,
      created_at: now,
      updated_at: now,
    };
    try {
      setIsSyncing(true);
      await upsertLocalRow("health_supplements", toSupplementRow(s, user.id));
      setSupplements((prev) => [s, ...prev]);
      return s;
    } catch (err) {
      console.error("Error adding supplement:", err);
      return null;
    } finally {
      setIsSyncing(false);
    }
  };

  const updateSupplement = (id: string, updates: Partial<HealthSupplement>) => {
    if (!user) return;
    const updated = supplements.map((s) =>
      s.id === id
        ? { ...s, ...updates, updated_at: new Date().toISOString() }
        : s,
    );
    setSupplements(updated);

    if (saveTimeoutRef.current[id]) clearTimeout(saveTimeoutRef.current[id]);
    saveTimeoutRef.current[id] = setTimeout(async () => {
      const item = updated.find((s) => s.id === id);
      if (!item) return;
      try {
        setIsSyncing(true);
        await upsertLocalRow(
          "health_supplements",
          toSupplementRow(item, user.id),
        );
      } catch (err) {
        console.error("Error updating supplement:", err);
      } finally {
        setIsSyncing(false);
      }
    }, 500);
  };

  const removeSupplement = async (id: string) => {
    if (!user) return;
    try {
      setIsSyncing(true);
      const s = supplements.find((x) => x.id === id);
      if (s?.photo_url && isOnline && supabase) {
        await supabase.storage.from("health-photos").remove([s.photo_url]);
      }
      await deleteLocalRow("health_supplements", id);
      setSupplements((prev) => prev.filter((x) => x.id !== id));
    } catch (err) {
      console.error("Error removing supplement:", err);
    } finally {
      setIsSyncing(false);
    }
  };

  const analyzeSupplementPhoto = async (
    supplementId: string,
    file: File,
  ): Promise<boolean> => {
    if (!user || !supabase) return false;
    setAnalyzing(supplementId);
    try {
      const ext = file.name.split(".").pop() ?? "jpg";
      const storagePath = `${user.id}/supplements/${supplementId}.${ext}`;
      const buf = await file.arrayBuffer();
      await uploadToStorage("health-photos", storagePath, buf, file.type, {
        tableName: "health_supplements",
        recordId: supplementId,
        fieldName: "photo_url",
      });

      const base64 = btoa(
        new Uint8Array(buf).reduce(
          (data, byte) => data + String.fromCharCode(byte),
          "",
        ),
      );

      const { data, error } = await supabase.functions.invoke("health_ai", {
        body: {
          base64Data: base64,
          mimeType: file.type,
          type: "supplement",
        },
      });

      if (error) {
        console.error("Supplement AI analysis failed:", error);
        updateSupplement(supplementId, { photo_url: storagePath });
        return false;
      }

      const result = data?.result ?? {};
      // Build notes from OCR extracted text
      const noteParts: string[] = [];
      if (result.ingredients)
        noteParts.push(`Ingredients: ${result.ingredients}`);
      if (result.warnings) noteParts.push(`Warnings: ${result.warnings}`);
      updateSupplement(supplementId, {
        photo_url: storagePath,
        name: result.name || undefined,
        brand: result.brand || undefined,
        dosage: result.dosage || undefined,
        nutrients: result.nutrients || undefined,
        notes: noteParts.length > 0 ? noteParts.join("\n") : undefined,
      });
      return true;
    } catch (err) {
      console.error("Error analyzing supplement:", err);
      return false;
    } finally {
      setAnalyzing(null);
    }
  };

  const getPhotoUrl = async (path: string): Promise<string | null> => {
    if (!supabase || !path) return null;
    const { data } = await supabase.storage
      .from("health-photos")
      .createSignedUrl(path, 3600);
    return data?.signedUrl ?? null;
  };

  return {
    supplements,
    isLoading,
    isSyncing,
    analyzing,
    addSupplement,
    updateSupplement,
    removeSupplement,
    analyzeSupplementPhoto,
    getPhotoUrl,
    refresh: fetchSupplements,
  };
};

// --- useNutritionSummary ---
export interface DailyNutrition {
  date: string;
  totalCalories: number;
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
  totalFiber: number;
  mealCount: number;
  nutrients: Record<string, number>;
}

// Japanese dietary reference intakes (adult male, approximate)
const DAILY_TARGETS = {
  calories: 2200,
  protein_g: 65,
  carbs_g: 300,
  fat_g: 60,
  fiber_g: 21,
  vitamin_a_ug: 850,
  vitamin_c_mg: 100,
  vitamin_d_ug: 8.5,
  vitamin_b12_ug: 2.4,
  calcium_mg: 800,
  iron_mg: 7.5,
  zinc_mg: 11,
  magnesium_mg: 340,
  potassium_mg: 2500,
  sodium_mg: 2000,
  omega3_mg: 2000,
  folate_ug: 240,
} as const;

export const NUTRIENT_LABELS: Record<string, string> = {
  vitamin_a_ug: "Vitamin A",
  vitamin_c_mg: "Vitamin C",
  vitamin_d_ug: "Vitamin D",
  vitamin_b12_ug: "Vitamin B12",
  calcium_mg: "Calcium",
  iron_mg: "Iron",
  zinc_mg: "Zinc",
  magnesium_mg: "Magnesium",
  potassium_mg: "Potassium",
  sodium_mg: "Sodium",
  omega3_mg: "Omega-3",
  folate_ug: "Folate",
};

export interface NutrientDeficiency {
  key: string;
  label: string;
  current: number;
  target: number;
  percentage: number;
}

export const useNutritionSummary = (meals: HealthMeal[]) => {
  const getDailySummary = useCallback(
    (date: string): DailyNutrition => {
      const dayMeals = meals.filter(
        (m) => m.eaten_at.substring(0, 10) === date,
      );
      const nutrients: Record<string, number> = {};
      for (const m of dayMeals) {
        if (m.nutrients) {
          for (const [k, v] of Object.entries(m.nutrients)) {
            const num = typeof v === "number" ? v : Number(v);
            if (Number.isFinite(num)) {
              nutrients[k] = (nutrients[k] ?? 0) + num;
            }
          }
        }
      }
      return {
        date,
        totalCalories: dayMeals.reduce((sum, m) => sum + (m.calories ?? 0), 0),
        totalProtein: dayMeals.reduce((sum, m) => sum + (m.protein_g ?? 0), 0),
        totalCarbs: dayMeals.reduce((sum, m) => sum + (m.carbs_g ?? 0), 0),
        totalFat: dayMeals.reduce((sum, m) => sum + (m.fat_g ?? 0), 0),
        totalFiber: dayMeals.reduce((sum, m) => sum + (m.fiber_g ?? 0), 0),
        mealCount: dayMeals.length,
        nutrients,
      };
    },
    [meals],
  );

  const getDeficiencies = useCallback(
    (date: string): NutrientDeficiency[] => {
      const summary = getDailySummary(date);
      const deficiencies: NutrientDeficiency[] = [];

      // Macro check
      const macros = [
        { key: "calories", current: summary.totalCalories },
        { key: "protein_g", current: summary.totalProtein },
        { key: "carbs_g", current: summary.totalCarbs },
        { key: "fat_g", current: summary.totalFat },
        { key: "fiber_g", current: summary.totalFiber },
      ];
      for (const { key, current } of macros) {
        const target = DAILY_TARGETS[key as keyof typeof DAILY_TARGETS];
        const pct = target > 0 ? (current / target) * 100 : 100;
        if (pct < 80) {
          deficiencies.push({
            key,
            label: key.replace("_g", "").replace("_", " "),
            current,
            target,
            percentage: Math.round(pct),
          });
        }
      }

      // Micronutrient check
      for (const [nKey, target] of Object.entries(DAILY_TARGETS)) {
        if (
          ["calories", "protein_g", "carbs_g", "fat_g", "fiber_g"].includes(
            nKey,
          )
        )
          continue;
        const current = summary.nutrients[nKey] ?? 0;
        const pct = target > 0 ? (current / target) * 100 : 100;
        if (pct < 80) {
          deficiencies.push({
            key: nKey,
            label: NUTRIENT_LABELS[nKey] ?? nKey,
            current,
            target,
            percentage: Math.round(pct),
          });
        }
      }

      return deficiencies.sort((a, b) => a.percentage - b.percentage);
    },
    [getDailySummary],
  );

  const getWeekSummary = useCallback(
    (endDate: string): DailyNutrition[] => {
      const days: DailyNutrition[] = [];
      const end = new Date(endDate);
      for (let i = 6; i >= 0; i--) {
        const d = new Date(end);
        d.setDate(d.getDate() - i);
        days.push(getDailySummary(d.toISOString().substring(0, 10)));
      }
      return days;
    },
    [getDailySummary],
  );

  return {
    getDailySummary,
    getDeficiencies,
    getWeekSummary,
    DAILY_TARGETS,
  };
};

// ---------------------------------------------------------------------------
// Health Metrics (HealthKit / Apple Watch data)
// ---------------------------------------------------------------------------

import type { HealthMetric, HealthMetricType } from "../types";

/** メトリクス表示ラベル・単位・色 */
export const METRIC_CONFIG: Record<
  string,
  { label: string; unit: string; color: string; icon: string }
> = {
  steps: { label: "歩数", unit: "歩", color: "#10b981", icon: "👟" },
  heart_rate: { label: "心拍数", unit: "bpm", color: "#ef4444", icon: "❤️" },
  resting_heart_rate: {
    label: "安静時心拍",
    unit: "bpm",
    color: "#f97316",
    icon: "🧡",
  },
  hrv: { label: "心拍変動", unit: "ms", color: "#8b5cf6", icon: "💜" },
  blood_oxygen: { label: "血中酸素", unit: "%", color: "#3b82f6", icon: "🫁" },
  active_energy: {
    label: "アクティブエネルギー",
    unit: "kcal",
    color: "#f59e0b",
    icon: "🔥",
  },
  basal_energy: {
    label: "基礎代謝",
    unit: "kcal",
    color: "#6366f1",
    icon: "⚡",
  },
  sleep_analysis: {
    label: "睡眠",
    unit: "時間",
    color: "#6366f1",
    icon: "😴",
  },
  weight: { label: "体重", unit: "kg", color: "#14b8a6", icon: "⚖️" },
  body_fat: { label: "体脂肪率", unit: "%", color: "#f97316", icon: "📊" },
  body_temperature: {
    label: "体温",
    unit: "℃",
    color: "#ef4444",
    icon: "🌡️",
  },
  respiratory_rate: {
    label: "呼吸数",
    unit: "/min",
    color: "#06b6d4",
    icon: "🌬️",
  },
  vo2_max: {
    label: "VO2 Max",
    unit: "mL/kg/min",
    color: "#ec4899",
    icon: "🏃",
  },
  blood_pressure_systolic: {
    label: "最高血圧",
    unit: "mmHg",
    color: "#dc2626",
    icon: "🩺",
  },
  blood_pressure_diastolic: {
    label: "最低血圧",
    unit: "mmHg",
    color: "#2563eb",
    icon: "🩺",
  },
};

export interface MetricSummary {
  type: HealthMetricType;
  latest: number;
  min: number;
  max: number;
  avg: number;
  count: number;
  unit: string;
  latestAt: string;
}

export const useHealthMetrics = () => {
  const { user } = useAuth();
  const [metrics, setMetrics] = useState<HealthMetric[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const loadedRef = useRef(false);

  const fetchMetrics = useCallback(
    async (days = 7) => {
      if (!user?.id || !supabase) return;
      setIsLoading(true);
      try {
        const since = new Date();
        since.setDate(since.getDate() - days);
        const { data, error } = await supabase
          .from("health_metrics")
          .select("*")
          .eq("user_id", user.id)
          .gte("recorded_at", since.toISOString())
          .order("recorded_at", { ascending: false })
          .limit(2000);
        if (error) throw error;
        setMetrics((data as HealthMetric[]) ?? []);
      } catch (e) {
        console.error("Failed to fetch health metrics:", e);
      } finally {
        setIsLoading(false);
      }
    },
    [user?.id],
  );

  useEffect(() => {
    if (!loadedRef.current && user?.id) {
      loadedRef.current = true;
      fetchMetrics();
    }
  }, [user?.id, fetchMetrics]);

  /** 指定期間の各メトリクスのサマリー (daysBack=0 → 今日のみ) */
  const getSummaries = useCallback(
    (daysBack = 0): MetricSummary[] => {
      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - daysBack);
      const startStr = start.toISOString().substring(0, 10);
      const endStr = end.toISOString().substring(0, 10);

      const filtered = metrics.filter((m) => {
        const d = m.recorded_at.substring(0, 10);
        return d >= startStr && d <= endStr;
      });

      const grouped = new Map<string, HealthMetric[]>();
      for (const m of filtered) {
        const arr = grouped.get(m.metric_type) ?? [];
        arr.push(m);
        grouped.set(m.metric_type, arr);
      }

      const summaries: MetricSummary[] = [];
      for (const [type, items] of grouped) {
        const values = items.map((i) => i.value);
        summaries.push({
          type: type as HealthMetricType,
          latest: values[0],
          min: Math.min(...values),
          max: Math.max(...values),
          avg: values.reduce((a, b) => a + b, 0) / values.length,
          count: values.length,
          unit: items[0].unit,
          latestAt: items[0].recorded_at,
        });
      }

      return summaries;
    },
    [metrics],
  );

  /** 指定メトリクスの日別集計（7日分） */
  const getDailyTrend = useCallback(
    (
      metricType: HealthMetricType,
      days = 7,
    ): {
      date: string;
      avg: number;
      min: number;
      max: number;
      count: number;
    }[] => {
      const result: {
        date: string;
        avg: number;
        min: number;
        max: number;
        count: number;
      }[] = [];
      const end = new Date();
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date(end);
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().substring(0, 10);
        const dayItems = metrics.filter(
          (m) =>
            m.metric_type === metricType &&
            m.recorded_at.substring(0, 10) === dateStr,
        );
        if (dayItems.length > 0) {
          const values = dayItems.map((v) => v.value);
          result.push({
            date: dateStr,
            avg: values.reduce((a, b) => a + b, 0) / values.length,
            min: Math.min(...values),
            max: Math.max(...values),
            count: values.length,
          });
        } else {
          result.push({ date: dateStr, avg: 0, min: 0, max: 0, count: 0 });
        }
      }
      return result;
    },
    [metrics],
  );

  return {
    metrics,
    isLoading,
    fetchMetrics,
    getSummaries,
    getDailyTrend,
  };
};
