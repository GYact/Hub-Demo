import { useState, useRef, useEffect } from "react";
import {
  Camera,
  Plus,
  Trash2,
  Loader2,
  UtensilsCrossed,
  Pill,
  BarChart3,
  ChevronDown,
  AlertTriangle,
  Dumbbell,
  Apple,
  Sun,
  Moon,
  Coffee,
  Cookie,
  Activity,
  RefreshCw,
} from "lucide-react";
import { Layout } from "../components";
import {
  useHealthMeals,
  useHealthSupplements,
  useNutritionSummary,
  useHealthMetrics,
  NUTRIENT_LABELS,
  METRIC_CONFIG,
} from "../hooks/useHealthAi";
import type {
  MealType,
  HealthMeal,
  HealthSupplement,
  HealthMetricType,
} from "../types";

type Tab = "meals" | "supplements" | "dashboard" | "metrics";

const MEAL_TYPE_OPTIONS: {
  value: MealType;
  label: string;
  icon: typeof Sun;
}[] = [
  { value: "breakfast", label: "Breakfast", icon: Sun },
  { value: "lunch", label: "Lunch", icon: Coffee },
  { value: "dinner", label: "Dinner", icon: Moon },
  { value: "snack", label: "Snack", icon: Cookie },
];

const formatDate = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleDateString("ja-JP", {
    month: "short",
    day: "numeric",
    weekday: "short",
  });
};

const formatTime = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
};

// --- Nutrient Bar ---
const NutrientBar = ({
  label,
  current,
  target,
  unit,
  color,
}: {
  label: string;
  current: number;
  target: number;
  unit: string;
  color: string;
}) => {
  const pct = target > 0 ? Math.min((current / target) * 100, 150) : 0;
  const displayPct = Math.min(pct, 100);
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="neu-text-secondary">{label}</span>
        <span className="neu-text-muted">
          {Math.round(current)}/{target}
          {unit} ({Math.round(pct)}%)
        </span>
      </div>
      <div className="h-2 neu-flat rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${color} ${pct > 100 ? "opacity-80" : ""}`}
          style={{ width: `${displayPct}%` }}
        />
      </div>
    </div>
  );
};

// --- MealCard ---
const MealCard = ({
  meal,
  analyzing,
  onAnalyze,
  onUpdate,
  onRemove,
  photoUrlCache,
}: {
  meal: HealthMeal;
  analyzing: boolean;
  onAnalyze: (id: string, file: File) => void;
  onUpdate: (id: string, updates: Partial<HealthMeal>) => void;
  onRemove: (id: string) => void;
  photoUrlCache: Record<string, string>;
}) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="neu-card p-4 space-y-3">
      <div className="flex items-start gap-3">
        {/* Photo / Upload */}
        <button
          onClick={() => fileRef.current?.click()}
          className="relative w-20 h-20 rounded-xl neu-flat flex items-center justify-center shrink-0 overflow-hidden group"
          disabled={analyzing}
        >
          {analyzing ? (
            <Loader2 size={24} className="animate-spin neu-text-muted" />
          ) : photoUrlCache[meal.id] ? (
            <img
              src={photoUrlCache[meal.id]}
              alt="meal"
              className="w-full h-full object-cover"
            />
          ) : (
            <Camera
              size={24}
              className="neu-text-muted group-hover:text-rose-400 transition-colors"
            />
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onAnalyze(meal.id, f);
              e.target.value = "";
            }}
          />
        </button>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={meal.meal_type}
              onChange={(e) =>
                onUpdate(meal.id, {
                  meal_type: e.target.value as MealType,
                })
              }
              className="text-sm font-medium neu-text-primary bg-transparent border-none p-0 cursor-pointer"
            >
              {MEAL_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
              <option value="other">Other</option>
            </select>
            <span className="text-xs neu-text-muted">
              {formatDate(meal.eaten_at)} {formatTime(meal.eaten_at)}
            </span>
          </div>

          {meal.calories != null && (
            <div className="flex gap-3 mt-1.5 text-xs">
              <span className="font-semibold text-rose-500">
                {Math.round(meal.calories)} kcal
              </span>
              {meal.protein_g != null && (
                <span className="neu-text-secondary">
                  P:{Math.round(meal.protein_g)}g
                </span>
              )}
              {meal.carbs_g != null && (
                <span className="neu-text-secondary">
                  C:{Math.round(meal.carbs_g)}g
                </span>
              )}
              {meal.fat_g != null && (
                <span className="neu-text-secondary">
                  F:{Math.round(meal.fat_g)}g
                </span>
              )}
            </div>
          )}

          {meal.items && meal.items.length > 0 && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="flex items-center gap-1 mt-1 text-xs neu-text-muted hover:neu-text-secondary transition-colors"
            >
              <span>
                {meal.items.length} item{meal.items.length > 1 ? "s" : ""}
              </span>
              <ChevronDown
                size={12}
                className={`transition-transform ${expanded ? "rotate-180" : ""}`}
              />
            </button>
          )}
        </div>

        {/* Delete */}
        <button
          onClick={() => onRemove(meal.id)}
          className="p-1.5 neu-text-muted hover:text-red-500 transition-colors"
        >
          <Trash2 size={16} />
        </button>
      </div>

      {/* Expanded items */}
      {expanded && meal.items && (
        <div className="neu-flat rounded-lg p-2 space-y-1">
          {meal.items.map((item, i) => (
            <div key={i} className="flex justify-between text-xs">
              <span className="neu-text-primary">{item.name}</span>
              <span className="neu-text-muted">
                {item.amount_g ? `${item.amount_g}g` : ""}
                {item.calories ? ` / ${item.calories}kcal` : ""}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Notes */}
      <input
        type="text"
        placeholder="Add notes..."
        value={meal.notes ?? ""}
        onChange={(e) => onUpdate(meal.id, { notes: e.target.value })}
        className="w-full text-xs px-2 py-1.5 neu-flat rounded-lg bg-transparent neu-text-primary placeholder:neu-text-muted focus:outline-none"
      />
    </div>
  );
};

// --- SupplementCard ---
const SupplementCard = ({
  supplement,
  analyzing,
  onAnalyze,
  onUpdate,
  onRemove,
  photoUrlCache,
}: {
  supplement: HealthSupplement;
  analyzing: boolean;
  onAnalyze: (id: string, file: File) => void;
  onUpdate: (id: string, updates: Partial<HealthSupplement>) => void;
  onRemove: (id: string) => void;
  photoUrlCache: Record<string, string>;
}) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const [expanded, setExpanded] = useState(false);
  const nutrientEntries = Object.entries(supplement.nutrients ?? {});
  const hasDetails = nutrientEntries.length > 0 || !!supplement.notes;

  return (
    <div
      className={`neu-card p-4 space-y-3 ${!supplement.active ? "opacity-50" : ""}`}
    >
      <div className="flex items-start gap-3">
        <button
          onClick={() => fileRef.current?.click()}
          className="relative w-16 h-16 rounded-xl neu-flat flex items-center justify-center shrink-0 overflow-hidden group"
          disabled={analyzing}
        >
          {analyzing ? (
            <Loader2 size={20} className="animate-spin neu-text-muted" />
          ) : photoUrlCache[supplement.id] ? (
            <img
              src={photoUrlCache[supplement.id]}
              alt="supplement"
              className="w-full h-full object-cover"
            />
          ) : (
            <Pill
              size={20}
              className="neu-text-muted group-hover:text-emerald-400 transition-colors"
            />
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onAnalyze(supplement.id, f);
              e.target.value = "";
            }}
          />
        </button>

        <div className="flex-1 min-w-0">
          <input
            type="text"
            placeholder="Supplement name"
            value={supplement.name}
            onChange={(e) => onUpdate(supplement.id, { name: e.target.value })}
            className="w-full text-sm font-medium bg-transparent border-none p-0 neu-text-primary placeholder:neu-text-muted focus:outline-none"
          />
          <div className="flex items-center gap-2 mt-1 text-xs">
            {supplement.brand && (
              <span className="neu-text-secondary">{supplement.brand}</span>
            )}
            {supplement.dosage && (
              <span className="neu-text-muted">{supplement.dosage}</span>
            )}
          </div>
          {nutrientEntries.length > 0 && !expanded && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {nutrientEntries.slice(0, 4).map(([k, v]) => (
                <span
                  key={k}
                  className="text-[10px] px-1.5 py-0.5 bg-emerald-50 text-emerald-700 rounded-full"
                >
                  {NUTRIENT_LABELS[k] ?? k}: {v}
                </span>
              ))}
              {nutrientEntries.length > 4 && (
                <span className="text-[10px] px-1.5 py-0.5 neu-text-muted">
                  +{nutrientEntries.length - 4}
                </span>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-col items-center gap-2">
          <button
            onClick={() =>
              onUpdate(supplement.id, { active: !supplement.active })
            }
            className={`relative w-10 h-5 rounded-full transition-colors ${
              supplement.active ? "bg-emerald-500" : "bg-slate-300"
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                supplement.active ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
          <button
            onClick={() => onRemove(supplement.id)}
            className="p-1 neu-text-muted hover:text-red-500 transition-colors"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {hasDetails && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 text-xs neu-text-muted hover:neu-text-secondary transition-colors w-full"
        >
          <ChevronDown
            size={14}
            className={`transition-transform ${expanded ? "rotate-180" : ""}`}
          />
          {expanded ? "Close" : `Nutrients (${nutrientEntries.length})`}
        </button>
      )}

      {expanded && (
        <div className="space-y-2 pt-1">
          {nutrientEntries.length > 0 && (
            <div className="rounded-lg neu-flat p-3">
              <div className="text-[11px] font-medium neu-text-secondary mb-2">
                Nutrition Facts (OCR)
              </div>
              <div className="space-y-1">
                {nutrientEntries.map(([k, v]) => (
                  <div
                    key={k}
                    className="flex justify-between text-xs py-0.5 border-b border-slate-100 last:border-0"
                  >
                    <span className="neu-text-primary">
                      {NUTRIENT_LABELS[k] ?? k}
                    </span>
                    <span className="neu-text-secondary font-medium">{v}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {supplement.notes && (
            <div className="rounded-lg neu-flat p-3">
              <div className="text-[11px] font-medium neu-text-secondary mb-1">
                Details
              </div>
              <p className="text-xs neu-text-muted whitespace-pre-wrap leading-relaxed">
                {supplement.notes}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// Simple food recommendation lookup
function getFoodRecommendation(nutrientKey: string): string {
  const recommendations: Record<string, string> = {
    calories: "Rice, pasta, bread, nuts, avocado, olive oil",
    protein_g: "Chicken, fish, tofu, eggs, Greek yogurt, lentils",
    carbs_g: "Rice, sweet potatoes, oats, bananas, whole grain bread",
    fat_g: "Avocado, nuts, olive oil, salmon, cheese",
    fiber_g: "Vegetables, fruits, whole grains, beans, chia seeds",
    vitamin_a_ug: "Carrots, sweet potatoes, spinach, liver, eggs",
    vitamin_c_mg: "Oranges, strawberries, bell peppers, broccoli, kiwi",
    vitamin_d_ug: "Salmon, sardines, egg yolks, mushrooms, fortified milk",
    vitamin_b12_ug: "Meat, fish, eggs, dairy, nutritional yeast",
    calcium_mg: "Milk, yogurt, cheese, tofu, sardines, leafy greens",
    iron_mg: "Red meat, spinach, lentils, tofu, dark chocolate",
    zinc_mg: "Oysters, beef, pumpkin seeds, chickpeas, cashews",
    magnesium_mg: "Dark chocolate, avocado, almonds, spinach, bananas",
    potassium_mg: "Bananas, potatoes, spinach, avocado, beans",
    sodium_mg: "Miso soup, soy sauce, seaweed",
    omega3_mg: "Salmon, mackerel, walnuts, flaxseed, chia seeds",
    folate_ug: "Leafy greens, legumes, asparagus, broccoli, citrus fruits",
  };
  return recommendations[nutrientKey] ?? "Varied whole foods";
}

// --- Main Page ---
export const HealthAiPage = () => {
  const [tab, setTab] = useState<Tab>("meals");
  const {
    meals,
    isLoading: mealsLoading,
    analyzing: mealAnalyzing,
    addMeal,
    updateMeal,
    removeMeal,
    analyzeMealPhoto,
    getPhotoUrl: getMealPhotoUrl,
  } = useHealthMeals();

  const {
    supplements,
    isLoading: supplementsLoading,
    analyzing: supplementAnalyzing,
    addSupplement,
    updateSupplement,
    removeSupplement,
    analyzeSupplementPhoto,
    getPhotoUrl: getSupplementPhotoUrl,
  } = useHealthSupplements();

  const { getDailySummary, getDeficiencies, getWeekSummary, DAILY_TARGETS } =
    useNutritionSummary(meals);
  const {
    isLoading: metricsLoading,
    fetchMetrics,
    getSummaries,
    getDailyTrend,
  } = useHealthMetrics();

  // Photo URL cache
  const [photoCache, setPhotoCache] = useState<Record<string, string>>({});
  useEffect(() => {
    const loadPhotos = async () => {
      const cache: Record<string, string> = {};
      for (const m of meals) {
        if (m.photo_url && !photoCache[m.id]) {
          const url = await getMealPhotoUrl(m.photo_url);
          if (url) cache[m.id] = url;
        }
      }
      for (const s of supplements) {
        if (s.photo_url && !photoCache[s.id]) {
          const url = await getSupplementPhotoUrl(s.photo_url);
          if (url) cache[s.id] = url;
        }
      }
      if (Object.keys(cache).length > 0) {
        setPhotoCache((prev) => ({ ...prev, ...cache }));
      }
    };
    loadPhotos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meals.length, supplements.length]);

  const today = new Date().toISOString().substring(0, 10);
  const todaySummary = getDailySummary(today);
  const deficiencies = getDeficiencies(today);
  const weekData = getWeekSummary(today);

  const tabs: { id: Tab; label: string; icon: typeof UtensilsCrossed }[] = [
    { id: "meals", label: "Meals", icon: UtensilsCrossed },
    { id: "supplements", label: "Suppl", icon: Pill },
    { id: "dashboard", label: "Dash", icon: BarChart3 },
    { id: "metrics", label: "Metrics", icon: Activity },
  ];

  return (
    <Layout pageTitle="Health AI">
      <div className="h-full overflow-auto neu-bg mobile-scroll-pad">
        <main className="max-w-3xl mx-auto px-4 py-4 md:py-8">
          {/* Tab Bar */}
          <div className="flex gap-1 p-1 neu-flat rounded-xl mb-4">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
                  tab === t.id
                    ? "neu-card shadow-sm neu-text-primary"
                    : "neu-text-muted hover:neu-text-secondary"
                }`}
              >
                <t.icon size={16} />
                <span className="hidden sm:inline">{t.label}</span>
              </button>
            ))}
          </div>

          {/* Today's Quick Summary */}
          {tab !== "dashboard" && todaySummary.mealCount > 0 && (
            <div className="neu-flat rounded-xl p-3 mb-4">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium neu-text-secondary">Today</span>
                <div className="flex gap-3">
                  <span className="text-rose-500 font-semibold">
                    {Math.round(todaySummary.totalCalories)} kcal
                  </span>
                  <span className="neu-text-muted">
                    P:{Math.round(todaySummary.totalProtein)}g C:
                    {Math.round(todaySummary.totalCarbs)}g F:
                    {Math.round(todaySummary.totalFat)}g
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* === Meals Tab === */}
          {tab === "meals" && (
            <div className="space-y-3">
              {/* Add Meal Buttons */}
              <div className="grid grid-cols-4 gap-2">
                {MEAL_TYPE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => addMeal(opt.value)}
                    className="neu-card neu-card-hover p-3 flex flex-col items-center gap-1.5 text-xs font-medium neu-text-secondary hover:text-rose-500 transition-colors"
                  >
                    <opt.icon size={18} />
                    {opt.label}
                  </button>
                ))}
              </div>

              {mealsLoading ? (
                <div className="flex justify-center py-12">
                  <Loader2 size={28} className="animate-spin neu-text-muted" />
                </div>
              ) : meals.length === 0 ? (
                <div className="text-center py-12 neu-text-muted">
                  <UtensilsCrossed
                    size={40}
                    className="mx-auto mb-3 opacity-30"
                  />
                  <p className="text-sm">No meals recorded yet</p>
                  <p className="text-xs mt-1">
                    Add a meal and upload a photo to get started
                  </p>
                </div>
              ) : (
                meals.map((meal) => (
                  <MealCard
                    key={meal.id}
                    meal={meal}
                    analyzing={mealAnalyzing === meal.id}
                    onAnalyze={analyzeMealPhoto}
                    onUpdate={updateMeal}
                    onRemove={removeMeal}
                    photoUrlCache={photoCache}
                  />
                ))
              )}
            </div>
          )}

          {/* === Supplements Tab === */}
          {tab === "supplements" && (
            <div className="space-y-3">
              <button
                onClick={addSupplement}
                className="w-full neu-card neu-card-hover p-3 flex items-center justify-center gap-2 text-sm font-medium neu-text-secondary hover:text-emerald-500 transition-colors"
              >
                <Plus size={18} />
                Add Supplement
              </button>

              {supplementsLoading ? (
                <div className="flex justify-center py-12">
                  <Loader2 size={28} className="animate-spin neu-text-muted" />
                </div>
              ) : supplements.length === 0 ? (
                <div className="text-center py-12 neu-text-muted">
                  <Pill size={40} className="mx-auto mb-3 opacity-30" />
                  <p className="text-sm">No supplements registered</p>
                  <p className="text-xs mt-1">
                    Upload a photo of your supplement to auto-detect nutrients
                  </p>
                </div>
              ) : (
                supplements.map((s) => (
                  <SupplementCard
                    key={s.id}
                    supplement={s}
                    analyzing={supplementAnalyzing === s.id}
                    onAnalyze={analyzeSupplementPhoto}
                    onUpdate={updateSupplement}
                    onRemove={removeSupplement}
                    photoUrlCache={photoCache}
                  />
                ))
              )}
            </div>
          )}

          {/* === Dashboard Tab === */}
          {tab === "dashboard" && (
            <div className="space-y-4">
              {/* Today's Macros */}
              <div className="neu-card p-4 space-y-3">
                <h3 className="text-sm font-semibold neu-text-primary flex items-center gap-2">
                  <BarChart3 size={16} className="text-rose-500" />
                  Today&apos;s Nutrition
                </h3>
                <NutrientBar
                  label="Calories"
                  current={todaySummary.totalCalories}
                  target={DAILY_TARGETS.calories}
                  unit="kcal"
                  color="bg-rose-400"
                />
                <NutrientBar
                  label="Protein"
                  current={todaySummary.totalProtein}
                  target={DAILY_TARGETS.protein_g}
                  unit="g"
                  color="bg-blue-400"
                />
                <NutrientBar
                  label="Carbs"
                  current={todaySummary.totalCarbs}
                  target={DAILY_TARGETS.carbs_g}
                  unit="g"
                  color="bg-amber-400"
                />
                <NutrientBar
                  label="Fat"
                  current={todaySummary.totalFat}
                  target={DAILY_TARGETS.fat_g}
                  unit="g"
                  color="bg-purple-400"
                />
                <NutrientBar
                  label="Fiber"
                  current={todaySummary.totalFiber}
                  target={DAILY_TARGETS.fiber_g}
                  unit="g"
                  color="bg-green-400"
                />
              </div>

              {/* Deficiencies */}
              {deficiencies.length > 0 && (
                <div className="neu-card p-4 space-y-3">
                  <h3 className="text-sm font-semibold neu-text-primary flex items-center gap-2">
                    <AlertTriangle size={16} className="text-amber-500" />
                    Nutrient Deficiencies
                  </h3>
                  <div className="space-y-2">
                    {deficiencies.slice(0, 8).map((d) => (
                      <div
                        key={d.key}
                        className="flex items-center justify-between text-xs"
                      >
                        <span className="neu-text-primary font-medium">
                          {d.label}
                        </span>
                        <span
                          className={`font-semibold ${
                            d.percentage < 30
                              ? "text-red-500"
                              : d.percentage < 60
                                ? "text-amber-500"
                                : "text-yellow-600"
                          }`}
                        >
                          {d.percentage}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Weekly Overview */}
              <div className="neu-card p-4 space-y-3">
                <h3 className="text-sm font-semibold neu-text-primary">
                  Weekly Calories
                </h3>
                <div className="flex items-end gap-1 h-24">
                  {weekData.map((day) => {
                    const pct =
                      DAILY_TARGETS.calories > 0
                        ? Math.min(
                            (day.totalCalories / DAILY_TARGETS.calories) * 100,
                            100,
                          )
                        : 0;
                    return (
                      <div
                        key={day.date}
                        className="flex-1 flex flex-col items-center gap-1"
                      >
                        <div className="w-full neu-flat rounded-t-md overflow-hidden h-20 flex items-end">
                          <div
                            className={`w-full rounded-t-md transition-all ${
                              day.totalCalories > 0
                                ? "bg-gradient-to-t from-rose-400 to-rose-300"
                                : ""
                            }`}
                            style={{ height: `${pct}%` }}
                          />
                        </div>
                        <span className="text-[10px] neu-text-muted">
                          {new Date(day.date).toLocaleDateString("ja-JP", {
                            weekday: "narrow",
                          })}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Exercise Recommendation */}
              <div className="neu-card p-4 space-y-2">
                <h3 className="text-sm font-semibold neu-text-primary flex items-center gap-2">
                  <Dumbbell size={16} className="text-blue-500" />
                  Exercise Recommendation
                </h3>
                {todaySummary.totalCalories > 0 ? (
                  <div className="text-xs neu-text-secondary space-y-1.5">
                    <p>
                      Based on today&apos;s intake of{" "}
                      <span className="font-semibold text-rose-500">
                        {Math.round(todaySummary.totalCalories)} kcal
                      </span>
                      :
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="neu-flat rounded-lg p-2.5">
                        <p className="font-medium neu-text-primary">Walking</p>
                        <p className="neu-text-muted">
                          ~{Math.round(todaySummary.totalCalories / 4)} min
                        </p>
                      </div>
                      <div className="neu-flat rounded-lg p-2.5">
                        <p className="font-medium neu-text-primary">Running</p>
                        <p className="neu-text-muted">
                          ~{Math.round(todaySummary.totalCalories / 10)} min
                        </p>
                      </div>
                      <div className="neu-flat rounded-lg p-2.5">
                        <p className="font-medium neu-text-primary">Cycling</p>
                        <p className="neu-text-muted">
                          ~{Math.round(todaySummary.totalCalories / 7)} min
                        </p>
                      </div>
                      <div className="neu-flat rounded-lg p-2.5">
                        <p className="font-medium neu-text-primary">Swimming</p>
                        <p className="neu-text-muted">
                          ~{Math.round(todaySummary.totalCalories / 8)} min
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs neu-text-muted">
                    Record meals to see exercise recommendations
                  </p>
                )}
              </div>

              {/* Food Recommendations */}
              {deficiencies.length > 0 && (
                <div className="neu-card p-4 space-y-2">
                  <h3 className="text-sm font-semibold neu-text-primary flex items-center gap-2">
                    <Apple size={16} className="text-green-500" />
                    Recommended Foods
                  </h3>
                  <div className="space-y-2 text-xs">
                    {deficiencies.slice(0, 5).map((d) => (
                      <div key={d.key} className="neu-flat rounded-lg p-2.5">
                        <p className="font-medium neu-text-primary">
                          {d.label}{" "}
                          <span className="text-amber-500">
                            ({d.percentage}%)
                          </span>
                        </p>
                        <p className="neu-text-muted mt-0.5">
                          {getFoodRecommendation(d.key)}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* === Metrics Tab === */}
          {tab === "metrics" && (
            <MetricsTab
              isLoading={metricsLoading}
              onRefresh={fetchMetrics}
              getSummaries={getSummaries}
              getDailyTrend={getDailyTrend}
            />
          )}
        </main>
      </div>
    </Layout>
  );
};

// ---------------------------------------------------------------------------
// Metrics Tab Component
// ---------------------------------------------------------------------------

const TREND_ORDER: HealthMetricType[] = [
  "steps",
  "heart_rate",
  "resting_heart_rate",
  "blood_oxygen",
  "active_energy",
  "sleep_analysis",
  "weight",
  "hrv",
  "body_temperature",
  "respiratory_rate",
  "vo2_max",
  "body_fat",
  "blood_pressure_systolic",
  "blood_pressure_diastolic",
  "basal_energy",
];

const RANGE_OPTIONS = [
  { label: "今日", days: 0, fetch: 7, trend: 7 },
  { label: "昨日", days: 1, fetch: 7, trend: 7 },
  { label: "7日間", days: 6, fetch: 7, trend: 7 },
  { label: "30日間", days: 29, fetch: 30, trend: 30 },
] as const;

function MetricsTab({
  isLoading,
  onRefresh,
  getSummaries,
  getDailyTrend,
}: {
  isLoading: boolean;
  onRefresh: (days?: number) => void;
  getSummaries: (
    daysBack?: number,
  ) => import("../hooks/useHealthAi").MetricSummary[];
  getDailyTrend: (
    type: HealthMetricType,
    days?: number,
  ) => { date: string; avg: number; min: number; max: number; count: number }[];
}) {
  const [rangeIdx, setRangeIdx] = useState(0);
  const [selectedMetric, setSelectedMetric] = useState<HealthMetricType | null>(
    null,
  );

  const range = RANGE_OPTIONS[rangeIdx];
  const summaries = getSummaries(range.days);

  // Sort summaries by TREND_ORDER
  const sortedSummaries = [...summaries].sort((a, b) => {
    const ai = TREND_ORDER.indexOf(a.type as HealthMetricType);
    const bi = TREND_ORDER.indexOf(b.type as HealthMetricType);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  const trendData = selectedMetric
    ? getDailyTrend(selectedMetric, range.trend)
    : null;
  const selectedConfig = selectedMetric ? METRIC_CONFIG[selectedMetric] : null;

  const handleRangeChange = (idx: number) => {
    setRangeIdx(idx);
    const r = RANGE_OPTIONS[idx];
    onRefresh(r.fetch);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold neu-text-primary flex items-center gap-2">
          <Activity size={16} className="text-emerald-500" />
          Health Metrics
        </h2>
        <button
          onClick={() => onRefresh(range.fetch)}
          disabled={isLoading}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium neu-btn rounded-lg neu-text-secondary hover:neu-text-primary transition-colors disabled:opacity-50"
        >
          <RefreshCw size={12} className={isLoading ? "animate-spin" : ""} />
          更新
        </button>
      </div>

      {/* Range Selector */}
      <div className="flex gap-1 p-1 neu-flat rounded-lg">
        {RANGE_OPTIONS.map((opt, idx) => (
          <button
            key={opt.label}
            onClick={() => handleRangeChange(idx)}
            className={`flex-1 px-2 py-1.5 text-xs font-medium rounded-md transition-all ${
              rangeIdx === idx
                ? "neu-card shadow-sm neu-text-primary"
                : "neu-text-muted hover:neu-text-secondary"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {isLoading && summaries.length === 0 ? (
        <div className="flex justify-center py-16">
          <Loader2 size={28} className="animate-spin neu-text-muted" />
        </div>
      ) : summaries.length === 0 ? (
        <div className="text-center py-16 space-y-3">
          <Activity size={40} className="mx-auto opacity-20 neu-text-muted" />
          <p className="text-sm neu-text-muted">
            {range.days === 0
              ? "今日のヘルスデータがありません"
              : `${range.label}のヘルスデータがありません`}
          </p>
          <p className="text-xs neu-text-muted">
            期間を変更するか、iOSアプリから同期してください
          </p>
        </div>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {sortedSummaries.map((s) => {
              const cfg = METRIC_CONFIG[s.type] ?? {
                label: s.type,
                unit: s.unit,
                color: "#94a3b8",
                icon: "📊",
              };
              const isSelected = selectedMetric === s.type;
              return (
                <button
                  key={s.type}
                  onClick={() =>
                    setSelectedMetric(
                      isSelected ? null : (s.type as HealthMetricType),
                    )
                  }
                  className={`neu-card p-3 text-left transition-all ${
                    isSelected ? "ring-2 shadow-md" : "hover:shadow-sm"
                  }`}
                  style={
                    isSelected
                      ? ({
                          "--tw-ring-color": cfg.color,
                        } as React.CSSProperties)
                      : undefined
                  }
                >
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className="text-sm">{cfg.icon}</span>
                    <span className="text-[10px] font-medium neu-text-muted truncate">
                      {cfg.label}
                    </span>
                  </div>
                  <p
                    className="text-lg font-bold tabular-nums"
                    style={{ color: cfg.color }}
                  >
                    {s.type === "steps"
                      ? Math.round(s.latest).toLocaleString()
                      : s.type === "sleep_analysis"
                        ? (s.latest / 60).toFixed(1)
                        : Number.isInteger(s.latest)
                          ? s.latest.toLocaleString()
                          : s.latest.toFixed(1)}
                  </p>
                  <p className="text-[10px] neu-text-muted">
                    {cfg.unit}
                    {s.count > 1 && (
                      <span className="ml-1.5">
                        (avg{" "}
                        {s.type === "steps"
                          ? Math.round(s.avg).toLocaleString()
                          : s.avg.toFixed(1)}
                        )
                      </span>
                    )}
                  </p>
                </button>
              );
            })}
          </div>

          {/* Trend Chart */}
          {selectedMetric && trendData && selectedConfig && (
            <div className="neu-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold neu-text-primary flex items-center gap-2">
                  <span>{selectedConfig.icon}</span>
                  {selectedConfig.label} — {range.trend}日間
                </h3>
                <button
                  onClick={() => setSelectedMetric(null)}
                  className="text-[10px] neu-text-muted hover:neu-text-secondary"
                >
                  閉じる
                </button>
              </div>

              {/* Bar chart */}
              <div className="flex items-end gap-1 h-28">
                {trendData.map((day) => {
                  const maxVal = Math.max(...trendData.map((d) => d.avg), 1);
                  const pct =
                    day.count > 0 ? Math.max((day.avg / maxVal) * 100, 4) : 0;
                  return (
                    <div
                      key={day.date}
                      className="flex-1 flex flex-col items-center gap-1"
                    >
                      {day.count > 0 && range.trend <= 7 && (
                        <span className="text-[9px] font-medium tabular-nums neu-text-secondary">
                          {selectedMetric === "steps"
                            ? Math.round(day.avg).toLocaleString()
                            : selectedMetric === "sleep_analysis"
                              ? (day.avg / 60).toFixed(1)
                              : day.avg.toFixed(day.avg >= 100 ? 0 : 1)}
                        </span>
                      )}
                      <div className="w-full neu-flat rounded-t-md overflow-hidden h-20 flex items-end">
                        <div
                          className="w-full rounded-t-md transition-all"
                          style={{
                            height: `${pct}%`,
                            backgroundColor:
                              day.count > 0
                                ? selectedConfig.color
                                : "transparent",
                            opacity: day.count > 0 ? 0.7 : 0,
                          }}
                        />
                      </div>
                      {range.trend <= 7 && (
                        <span className="text-[10px] neu-text-muted">
                          {new Date(day.date).toLocaleDateString("ja-JP", {
                            weekday: "narrow",
                          })}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* 30日間の場合は日付範囲を表示 */}
              {range.trend > 7 && (
                <div className="flex justify-between text-[10px] neu-text-muted">
                  <span>
                    {new Date(trendData[0].date).toLocaleDateString("ja-JP", {
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                  <span>
                    {new Date(
                      trendData[trendData.length - 1].date,
                    ).toLocaleDateString("ja-JP", {
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                </div>
              )}

              {/* Min/Max row */}
              {(() => {
                const withData = trendData.filter((d) => d.count > 0);
                if (withData.length === 0) return null;
                const allMin = Math.min(...withData.map((d) => d.min));
                const allMax = Math.max(...withData.map((d) => d.max));
                const allAvg =
                  withData.reduce((s, d) => s + d.avg, 0) / withData.length;
                const fmt = (v: number) =>
                  selectedMetric === "steps"
                    ? Math.round(v).toLocaleString()
                    : selectedMetric === "sleep_analysis"
                      ? `${(v / 60).toFixed(1)}h`
                      : v.toFixed(v >= 100 ? 0 : 1);
                return (
                  <div className="flex gap-3 text-[10px] neu-text-muted pt-1">
                    <span>
                      Min:{" "}
                      <span className="font-medium neu-text-secondary">
                        {fmt(allMin)}
                      </span>
                    </span>
                    <span>
                      Avg:{" "}
                      <span className="font-medium neu-text-secondary">
                        {fmt(allAvg)}
                      </span>
                    </span>
                    <span>
                      Max:{" "}
                      <span className="font-medium neu-text-secondary">
                        {fmt(allMax)}
                      </span>
                    </span>
                  </div>
                );
              })()}
            </div>
          )}
        </>
      )}
    </div>
  );
}
