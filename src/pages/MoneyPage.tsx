import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import {
  Plus,
  Trash2,
  Loader2,
  RefreshCw,
  CreditCard,
  Wallet,
  TrendingUp,
  ChevronDown,
  ChevronUp,
  DollarSign,
  Building,
  Coins,
  Home,
  PiggyBank,
  GripVertical,
  FileText,
  Receipt,
  BarChart3,
  Landmark,
  Shield,
  Clock,
  Building2,
  ArrowUpDown,
} from "lucide-react";
import { DndContext, closestCenter, DragEndEvent } from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  verticalListSortingStrategy,
  horizontalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useDndSensors } from "../hooks/useDndSensors";
import { SortableWrapper } from "../components/SortableWrapper";
import { formatCurrency } from "../lib/formatters";
import {
  useMoney,
  billingCycleOptions,
  categoryOptions,
  subscriptionStatusOptions,
  assetTypeOptions,
} from "../hooks/useMoney";
import { useInvoices, invoiceStatusOptions } from "../hooks/useInvoices";
import { useEstimates, estimateStatusOptions } from "../hooks/useEstimates";
import { useExpenses, expenseCategoryOptions } from "../hooks/useExpenses";
import { useClients } from "../hooks/useClients";
import { useProjects } from "../hooks/useProjects";
import { useAuth } from "../contexts/AuthContext";
import { useUndoRedo } from "../contexts/UndoRedoContext";
import { Layout, ConfirmDialog, NumberInput, DatePicker } from "../components";
import { useUserSetting } from "../hooks/useUserSetting";
import { InvoiceCard } from "../components/money/InvoiceCard";
import { ExpenseCard } from "../components/money/ExpenseCard";
import { EstimateCard } from "../components/money/EstimateCard";
import { InvestSummaryCard } from "../components/money/InvestSummaryCard";
import { DriveFileList } from "../components/drive/DriveFileList";
import { useInvestments } from "../hooks/useInvestments";
import { useStockData } from "../hooks/useStockData";
import { calcInvestGrandSummary } from "../lib/investCalc";
import type {
  Subscription,
  Asset,
  Invoice,
  Estimate,
  Expense,
  BillingCycle,
  SubscriptionCategory,
  SubscriptionStatus,
  AssetType,
  StockQuote,
  ExchangeRate,
} from "../types";

type MoneyTab =
  | "subscriptions"
  | "assets"
  | "invoices"
  | "estimates"
  | "expenses";

type SortOption =
  | "default"
  | "amount-asc"
  | "amount-desc"
  | "date-new"
  | "date-old"
  | "name-asc"
  | "name-desc";

const sortOptions: { value: SortOption; label: string }[] = [
  { value: "default", label: "Default" },
  { value: "amount-desc", label: "Amount ↓" },
  { value: "amount-asc", label: "Amount ↑" },
  { value: "date-new", label: "Date ↓" },
  { value: "date-old", label: "Date ↑" },
  { value: "name-asc", label: "Name A-Z" },
  { value: "name-desc", label: "Name Z-A" },
];

const getAssetIcon = (type: AssetType) => {
  switch (type) {
    case "bank":
      return Building;
    case "investment":
      return TrendingUp;
    case "stock":
      return BarChart3;
    case "fund":
      return Landmark;
    case "bond":
      return FileText;
    case "crypto":
      return Coins;
    case "insurance":
      return Shield;
    case "pension":
      return Clock;
    case "cash":
      return Wallet;
    case "real_estate":
      return Home;
    default:
      return PiggyBank;
  }
};

// Subscription Card Component
const SubscriptionCard = ({
  subscription,
  onUpdate,
  onDelete,
  dragHandleProps,
}: {
  subscription: Subscription;
  onUpdate: (id: string, updates: Partial<Subscription>) => void;
  onDelete: (id: string) => void;
  dragHandleProps?: React.HTMLAttributes<HTMLDivElement>;
}) => {
  const [isExpanded, setIsExpanded] = useState(!subscription.name);
  const statusOption =
    subscriptionStatusOptions.find((s) => s.value === subscription.status) ||
    subscriptionStatusOptions[0];

  return (
    <div className="neu-card overflow-hidden">
      <div className="p-4 md:p-5">
        <div className="flex items-start gap-2 md:gap-3">
          {dragHandleProps && (
            <div
              {...dragHandleProps}
              className="touch-none cursor-grab active:cursor-grabbing p-0.5 md:p-1 neu-text-muted hover:neu-text-secondary transition-colors shrink-0 mt-1"
            >
              <GripVertical size={16} className="md:w-[18px] md:h-[18px]" />
            </div>
          )}
          <div className="bg-violet-100 p-1.5 md:p-2 rounded-lg shrink-0">
            <CreditCard size={18} className="md:w-5 md:h-5 text-violet-600" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={subscription.name}
                onChange={(e) =>
                  onUpdate(subscription.id, { name: e.target.value })
                }
                placeholder="Service name..."
                className="flex-1 min-w-[100px] text-lg font-semibold neu-text-primary bg-transparent border-none outline-none placeholder:neu-text-muted focus:ring-0"
              />
              <select
                value={subscription.status}
                onChange={(e) =>
                  onUpdate(subscription.id, {
                    status: e.target.value as SubscriptionStatus,
                  })
                }
                className={`text-xs px-2 py-1 rounded-full border-none outline-none cursor-pointer ${
                  statusOption.color === "emerald"
                    ? "bg-emerald-200 text-emerald-700"
                    : statusOption.color === "amber"
                      ? "bg-amber-200 text-amber-700"
                      : "bg-slate-200 text-slate-700"
                }`}
              >
                {subscriptionStatusOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {!isExpanded && (
              <div className="grid grid-cols-2 md:flex md:flex-wrap md:items-center gap-x-3 gap-y-1 mt-2 text-sm">
                <span className="flex items-center gap-1 font-semibold text-violet-600">
                  <Wallet size={14} className="shrink-0" />
                  {formatCurrency(subscription.amount, subscription.currency)}
                  <span className="neu-text-muted font-normal text-xs">
                    /
                    {subscription.billingCycle === "yearly"
                      ? "yr"
                      : subscription.billingCycle === "weekly"
                        ? "wk"
                        : "mo"}
                  </span>
                </span>
                <span className="flex items-center gap-1 text-xs neu-text-secondary">
                  <CreditCard size={14} className="shrink-0" />
                  {
                    categoryOptions.find(
                      (c) => c.value === subscription.category,
                    )?.label
                  }
                </span>
                {subscription.nextBillingDate && (
                  <span className="flex items-center gap-1 text-xs neu-text-secondary col-span-2 md:col-span-1">
                    <TrendingUp size={14} className="shrink-0" />
                    Next: {subscription.nextBillingDate}
                  </span>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="p-2 neu-text-muted hover:neu-text-secondary hover:bg-slate-100 rounded-lg transition-colors"
              title={isExpanded ? "Collapse" : "Expand"}
            >
              {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </button>
            <button
              onClick={() => onDelete(subscription.id)}
              className="p-2 neu-text-muted hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
              title="Delete"
            >
              <Trash2 size={18} />
            </button>
          </div>
        </div>

        {isExpanded && (
          <div className="mt-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <NumberInput
                  label="Amount"
                  value={subscription.amount}
                  onChange={(value) =>
                    onUpdate(subscription.id, {
                      amount: value,
                    })
                  }
                  min={0}
                  step={0.01}
                  placeholder="0"
                  className="w-full"
                />
              </div>
              <div>
                <label className="text-xs neu-text-secondary mb-1 block">
                  Currency
                </label>
                <select
                  value={subscription.currency}
                  onChange={(e) =>
                    onUpdate(subscription.id, { currency: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm neu-input"
                >
                  <option value="JPY">JPY</option>
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                </select>
              </div>
              <div>
                <label className="text-xs neu-text-secondary mb-1 block">
                  Billing Cycle
                </label>
                <select
                  value={subscription.billingCycle}
                  onChange={(e) =>
                    onUpdate(subscription.id, {
                      billingCycle: e.target.value as BillingCycle,
                    })
                  }
                  className="w-full px-3 py-2 text-sm neu-input"
                >
                  {billingCycleOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs neu-text-secondary mb-1 block">
                  Category
                </label>
                <select
                  value={subscription.category}
                  onChange={(e) =>
                    onUpdate(subscription.id, {
                      category: e.target.value as SubscriptionCategory,
                    })
                  }
                  className="w-full px-3 py-2 text-sm neu-input"
                >
                  {categoryOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <DatePicker
                label="Next Billing Date"
                value={subscription.nextBillingDate || ""}
                onChange={(value) =>
                  onUpdate(subscription.id, {
                    nextBillingDate: value || undefined,
                  })
                }
              />
            </div>
            <div>
              <label className="text-xs neu-text-secondary mb-1 block">
                Notes
              </label>
              <textarea
                value={subscription.notes}
                onChange={(e) =>
                  onUpdate(subscription.id, { notes: e.target.value })
                }
                placeholder="Notes..."
                rows={2}
                className="w-full text-sm neu-text-secondary neu-input rounded-lg px-3 py-2 resize-y"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// Asset Card Component
const AssetCard = ({
  asset,
  onUpdate,
  onDelete,
  dragHandleProps,
}: {
  asset: Asset;
  onUpdate: (id: string, updates: Partial<Asset>) => void;
  onDelete: (id: string) => void;
  dragHandleProps?: React.HTMLAttributes<HTMLDivElement>;
}) => {
  const [isExpanded, setIsExpanded] = useState(!asset.name);
  const IconComponent = getAssetIcon(asset.assetType);

  return (
    <div className="neu-card overflow-hidden">
      <div className="p-4 md:p-5">
        <div className="flex items-start gap-2 md:gap-3">
          {dragHandleProps && (
            <div
              {...dragHandleProps}
              className="touch-none cursor-grab active:cursor-grabbing p-0.5 md:p-1 neu-text-muted hover:neu-text-secondary transition-colors shrink-0 mt-1"
            >
              <GripVertical size={16} className="md:w-[18px] md:h-[18px]" />
            </div>
          )}
          <div className="bg-emerald-100 p-1.5 md:p-2 rounded-lg shrink-0">
            <IconComponent
              size={18}
              className="md:w-5 md:h-5 text-emerald-600"
            />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={asset.name}
                onChange={(e) => onUpdate(asset.id, { name: e.target.value })}
                placeholder="Asset name..."
                className="flex-1 min-w-[100px] text-lg font-semibold neu-text-primary bg-transparent border-none outline-none placeholder:neu-text-muted focus:ring-0"
              />
              <span className="text-xs px-2 py-1 rounded-full bg-slate-200 neu-text-secondary whitespace-nowrap">
                {
                  assetTypeOptions.find((t) => t.value === asset.assetType)
                    ?.label
                }
              </span>
            </div>

            {!isExpanded && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-sm neu-text-secondary">
                <span className="flex items-center gap-1 font-semibold text-emerald-600 whitespace-nowrap">
                  <DollarSign size={14} className="shrink-0" />
                  {formatCurrency(asset.amount, asset.currency)}
                </span>
                {asset.institution && (
                  <span className="flex items-center gap-1 whitespace-nowrap">
                    <Building2 size={14} className="shrink-0" />
                    {asset.institution}
                  </span>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="p-2 neu-text-muted hover:neu-text-secondary hover:bg-slate-100 rounded-lg transition-colors"
              title={isExpanded ? "Collapse" : "Expand"}
            >
              {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </button>
            <button
              onClick={() => onDelete(asset.id)}
              className="p-2 neu-text-muted hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
              title="Delete"
            >
              <Trash2 size={18} />
            </button>
          </div>
        </div>

        {isExpanded && (
          <div className="mt-4 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <NumberInput
                  label="Amount"
                  value={asset.amount}
                  onChange={(value) =>
                    onUpdate(asset.id, {
                      amount: value,
                    })
                  }
                  min={0}
                  step={0.01}
                  placeholder="0"
                  className="w-full"
                />
              </div>
              <div>
                <label className="text-xs neu-text-secondary mb-1 block">
                  Currency
                </label>
                <select
                  value={asset.currency}
                  onChange={(e) =>
                    onUpdate(asset.id, { currency: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm neu-input"
                >
                  <option value="JPY">JPY</option>
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                </select>
              </div>
              <div>
                <label className="text-xs neu-text-secondary mb-1 block">
                  Type
                </label>
                <select
                  value={asset.assetType}
                  onChange={(e) =>
                    onUpdate(asset.id, {
                      assetType: e.target.value as AssetType,
                    })
                  }
                  className="w-full px-3 py-2 text-sm neu-input"
                >
                  {assetTypeOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs neu-text-secondary mb-1 block">
                  Institution
                </label>
                <input
                  type="text"
                  value={asset.institution}
                  onChange={(e) =>
                    onUpdate(asset.id, { institution: e.target.value })
                  }
                  placeholder="Bank, broker, exchange..."
                  className="w-full px-3 py-2 text-sm neu-input"
                />
              </div>
            </div>
            <div>
              <label className="text-xs neu-text-secondary mb-1 block">
                Notes
              </label>
              <textarea
                value={asset.notes}
                onChange={(e) => onUpdate(asset.id, { notes: e.target.value })}
                placeholder="Notes..."
                rows={2}
                className="w-full text-sm neu-text-secondary neu-input rounded-lg px-3 py-2 resize-y"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export const MoneyPage = () => {
  useAuth();

  const {
    subscriptions,
    assets,
    isLoading,
    isSyncing,
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
  } = useMoney();

  const {
    invoices,
    isLoading: invoicesLoading,
    isSyncing: invoicesSyncing,
    addInvoice,
    updateInvoice,
    removeInvoice,
    reorderInvoices,
    uploadPdf,
    deletePdf,
    getPdfSignedUrl,
    getTotalUnpaid,
    getTotalPaid,
    getOverdueCount,
    generateInvoicePdf,
    runOcr: runOcrInvoice,
    refresh: refreshInvoices,
    restoreState: restoreInvoices,
  } = useInvoices();

  const {
    estimates,
    isLoading: estimatesLoading,
    isSyncing: estimatesSyncing,
    addEstimate,
    updateEstimate,
    removeEstimate,
    reorderEstimates,
    uploadPdf: uploadEstimatePdf,
    deletePdf: deleteEstimatePdf,
    getPdfSignedUrl: getEstimatePdfSignedUrl,
    refresh: refreshEstimates,
    restoreState: restoreEstimates,
  } = useEstimates();

  const {
    expenses,
    isLoading: expensesLoading,
    isSyncing: expensesSyncing,
    addExpense,
    updateExpense,
    removeExpense,
    reorderExpenses,
    uploadReceipt,
    deleteReceipt,
    getReceiptSignedUrl,
    runOcr,
    getMonthlyTotal,
    refresh: refreshExpenses,
    restoreState: restoreExpenses,
  } = useExpenses();

  const { clients, updateClient } = useClients();
  const { projects } = useProjects();

  const { registerPage, unregisterPage, setCurrentPage, saveState } =
    useUndoRedo();
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const sensors = useDndSensors();

  const allLoading =
    isLoading || invoicesLoading || estimatesLoading || expensesLoading;
  const allSyncing =
    isSyncing || invoicesSyncing || estimatesSyncing || expensesSyncing;

  // DnD handlers
  const handleSubscriptionDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = subscriptions.findIndex((s) => s.id === active.id);
    const newIndex = subscriptions.findIndex((s) => s.id === over.id);
    if (oldIndex !== -1 && newIndex !== -1) {
      reorderSubscriptions(arrayMove(subscriptions, oldIndex, newIndex));
      saveToHistory();
    }
  };

  const handleAssetDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = assets.findIndex((a) => a.id === active.id);
    const newIndex = assets.findIndex((a) => a.id === over.id);
    if (oldIndex !== -1 && newIndex !== -1) {
      reorderAssets(arrayMove(assets, oldIndex, newIndex));
      saveToHistory();
    }
  };

  const handleInvoiceDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = invoices.findIndex((i) => i.id === active.id);
    const newIndex = invoices.findIndex((i) => i.id === over.id);
    if (oldIndex !== -1 && newIndex !== -1) {
      reorderInvoices(arrayMove(invoices, oldIndex, newIndex));
      saveToHistory();
    }
  };

  const handleExpenseDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = expenses.findIndex((e) => e.id === active.id);
    const newIndex = expenses.findIndex((e) => e.id === over.id);
    if (oldIndex !== -1 && newIndex !== -1) {
      reorderExpenses(arrayMove(expenses, oldIndex, newIndex));
      saveToHistory();
    }
  };

  const handleEstimateDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = estimates.findIndex((e) => e.id === active.id);
    const newIndex = estimates.findIndex((e) => e.id === over.id);
    if (oldIndex !== -1 && newIndex !== -1) {
      reorderEstimates(arrayMove(estimates, oldIndex, newIndex));
      saveToHistory();
    }
  };

  // Undo/Redo
  useEffect(() => {
    setCurrentPage("finance");

    const getCurrentState = () => ({
      subscriptions,
      assets,
      invoices,
      estimates,
      expenses,
    });
    const handleRestore = async (state: unknown) => {
      const s = state as {
        subscriptions: Subscription[];
        assets: Asset[];
        invoices: Invoice[];
        estimates: Estimate[];
        expenses: Expense[];
      };
      if (restoreState) await restoreState(s);
      if (restoreInvoices) await restoreInvoices({ invoices: s.invoices });
      if (restoreEstimates) await restoreEstimates({ estimates: s.estimates });
      if (restoreExpenses) await restoreExpenses({ expenses: s.expenses });
    };

    registerPage("finance", getCurrentState, handleRestore);
    return () => unregisterPage("finance");
  }, [
    subscriptions,
    assets,
    invoices,
    estimates,
    expenses,
    registerPage,
    unregisterPage,
    restoreState,
    restoreInvoices,
    restoreEstimates,
    restoreExpenses,
    setCurrentPage,
  ]);

  const saveToHistory = useCallback(() => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      saveState("finance");
    }, 500);
  }, [saveState]);

  const [activeTab, setActiveTab] = useState<MoneyTab>("subscriptions");

  // Investment portfolio data for Assets tab summary
  const {
    holdings: investHoldings,
    transactions: investTransactions,
    isLoading: investDataLoading,
  } = useInvestments();
  const { fetchQuotes, fetchExchangeRate } = useStockData();
  const [investQuotes, setInvestQuotes] = useState<StockQuote[]>([]);
  const [investRates, setInvestRates] = useState<ExchangeRate[]>([]);
  const [investQuotesLoading, setInvestQuotesLoading] = useState(false);

  useEffect(() => {
    if (activeTab !== "assets") return;
    if (investHoldings.length === 0) return;
    if (investQuotes.length > 0) return;

    let cancelled = false;
    const load = async () => {
      setInvestQuotesLoading(true);
      try {
        const symbols = investHoldings.map((h) => h.symbol);
        const [q, r] = await Promise.all([
          fetchQuotes(symbols),
          fetchExchangeRate(["USDJPY"]),
        ]);
        if (!cancelled) {
          setInvestQuotes(q);
          setInvestRates(r);
        }
      } catch (err) {
        console.error("Failed to fetch invest quotes:", err);
      } finally {
        if (!cancelled) setInvestQuotesLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, investHoldings.length]);

  const investSummary = useMemo(
    () =>
      calcInvestGrandSummary(
        investHoldings,
        investTransactions,
        investQuotes,
        investRates,
      ),
    [investHoldings, investTransactions, investQuotes, investRates],
  );

  const DEFAULT_TAB_ORDER: MoneyTab[] = [
    "subscriptions",
    "assets",
    "invoices",
    "estimates",
    "expenses",
  ];
  const { value: tabOrder, setValue: setTabOrder } = useUserSetting<MoneyTab[]>(
    "finance_tab_order",
    DEFAULT_TAB_ORDER,
  );

  const handleTabDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = tabOrder.indexOf(active.id as MoneyTab);
    const newIndex = tabOrder.indexOf(over.id as MoneyTab);
    if (oldIndex === -1 || newIndex === -1) return;
    setTabOrder(arrayMove(tabOrder, oldIndex, newIndex));
  };

  // Fiscal year filter (shared across asset/invoice/expense tabs)
  const { value: fiscalYearFilter, setValue: setFiscalYearFilter } =
    useUserSetting<string>("money_filter_fiscal_year", "all");

  const getYear = (dateStr?: string): number | null => {
    if (!dateStr) return null;
    const y = new Date(dateStr).getFullYear();
    return Number.isFinite(y) ? y : null;
  };

  const availableYears = useMemo(() => {
    const years = new Set<number>();
    for (const a of assets) {
      const y = getYear(a.createdAt);
      if (y) years.add(y);
    }
    for (const i of invoices) {
      const y = getYear(i.issueDate ?? i.createdAt);
      if (y) years.add(y);
    }
    for (const e of expenses) {
      const y = getYear(e.expenseDate ?? e.createdAt);
      if (y) years.add(y);
    }
    for (const est of estimates) {
      const y = getYear(est.issueDate ?? est.createdAt);
      if (y) years.add(y);
    }
    return Array.from(years).sort((a, b) => b - a);
  }, [assets, invoices, estimates, expenses]);

  // Filters
  const { value: subStatusFilter, setValue: setSubStatusFilter } =
    useUserSetting<string>("money_filter_sub_status", "all");
  const { value: assetTypeFilter, setValue: setAssetTypeFilter } =
    useUserSetting<string>("money_filter_asset_type", "all");
  const { value: invStatusFilter, setValue: setInvStatusFilter } =
    useUserSetting<string>("money_filter_inv_status", "all");
  const { value: expCategoryFilter, setValue: setExpCategoryFilter } =
    useUserSetting<string>("money_filter_exp_category", "all");
  const { value: estStatusFilter, setValue: setEstStatusFilter } =
    useUserSetting<string>("money_filter_est_status", "all");

  // Sort states
  const { value: subSort, setValue: setSubSort } = useUserSetting<SortOption>(
    "money_sort_sub",
    "default",
  );
  const { value: assetSort, setValue: setAssetSort } =
    useUserSetting<SortOption>("money_sort_asset", "default");
  const { value: invSort, setValue: setInvSort } = useUserSetting<SortOption>(
    "money_sort_inv",
    "default",
  );
  const { value: estSort, setValue: setEstSort } = useUserSetting<SortOption>(
    "money_sort_est",
    "default",
  );
  const { value: expSort, setValue: setExpSort } = useUserSetting<SortOption>(
    "money_sort_exp",
    "default",
  );
  const currentSort: Record<MoneyTab, SortOption> = {
    subscriptions: subSort,
    assets: assetSort,
    invoices: invSort,
    estimates: estSort,
    expenses: expSort,
  };

  const setSortForTab = (tab: MoneyTab, val: SortOption) => {
    switch (tab) {
      case "subscriptions":
        return setSubSort(val);
      case "assets":
        return setAssetSort(val);
      case "invoices":
        return setInvSort(val);
      case "estimates":
        return setEstSort(val);
      case "expenses":
        return setExpSort(val);
    }
  };

  // Delete confirmations
  const [deleteSubscriptionId, setDeleteSubscriptionId] = useState<
    string | null
  >(null);
  const [deleteAssetId, setDeleteAssetId] = useState<string | null>(null);
  const [deleteInvoiceId, setDeleteInvoiceId] = useState<string | null>(null);
  const [deleteEstimateId, setDeleteEstimateId] = useState<string | null>(null);
  const [deleteExpenseId, setDeleteExpenseId] = useState<string | null>(null);

  // Sort helper
  const applySortGeneric = <T,>(
    list: T[],
    sort: SortOption,
    getName: (item: T) => string,
    getAmount: (item: T) => number,
    getDate: (item: T) => string | undefined,
  ): T[] => {
    if (sort === "default") return list;
    return [...list].sort((a, b) => {
      switch (sort) {
        case "amount-asc":
          return getAmount(a) - getAmount(b);
        case "amount-desc":
          return getAmount(b) - getAmount(a);
        case "date-new":
          return (getDate(b) || "").localeCompare(getDate(a) || "");
        case "date-old":
          return (getDate(a) || "").localeCompare(getDate(b) || "");
        case "name-asc":
          return getName(a).localeCompare(getName(b));
        case "name-desc":
          return getName(b).localeCompare(getName(a));
        default:
          return 0;
      }
    });
  };

  // Filtered + sorted lists
  const filteredSubscriptions = useMemo(() => {
    let list = subscriptions;
    if (subStatusFilter !== "all")
      list = list.filter((s) => s.status === subStatusFilter);
    return applySortGeneric(
      list,
      subSort,
      (s) => s.name,
      (s) => s.amount,
      (s) => s.nextBillingDate,
    );
  }, [subscriptions, subStatusFilter, subSort]);

  const matchesYear = (dateStr?: string, fallback?: string): boolean => {
    if (fiscalYearFilter === "all") return true;
    const y = getYear(dateStr ?? fallback);
    return y !== null && String(y) === fiscalYearFilter;
  };

  const filteredAssets = useMemo(() => {
    let list = assets;
    if (fiscalYearFilter !== "all")
      list = list.filter((a) => matchesYear(a.createdAt));
    if (assetTypeFilter !== "all")
      list = list.filter((a) => a.assetType === assetTypeFilter);
    return applySortGeneric(
      list,
      assetSort,
      (a) => a.name,
      (a) => a.amount,
      (a) => a.createdAt,
    );
  }, [assets, assetTypeFilter, fiscalYearFilter, assetSort]);

  const filteredInvoices = useMemo(() => {
    let list = invoices;
    if (fiscalYearFilter !== "all")
      list = list.filter((i) => matchesYear(i.issueDate, i.createdAt));
    if (invStatusFilter !== "all")
      list = list.filter((i) => i.status === invStatusFilter);
    return applySortGeneric(
      list,
      invSort,
      (i) => i.invoiceNumber,
      (i) => i.amount,
      (i) => i.issueDate ?? i.createdAt,
    );
  }, [invoices, invStatusFilter, fiscalYearFilter, invSort]);

  const filteredEstimates = useMemo(() => {
    let list = estimates;
    if (fiscalYearFilter !== "all")
      list = list.filter((e) => matchesYear(e.issueDate, e.createdAt));
    if (estStatusFilter !== "all")
      list = list.filter((e) => e.status === estStatusFilter);
    return applySortGeneric(
      list,
      estSort,
      (e) => e.estimateNumber,
      (e) => e.amount,
      (e) => e.issueDate ?? e.createdAt,
    );
  }, [estimates, estStatusFilter, fiscalYearFilter, estSort]);

  const filteredExpenses = useMemo(() => {
    let list = expenses;
    if (fiscalYearFilter !== "all")
      list = list.filter((e) => matchesYear(e.expenseDate, e.createdAt));
    if (expCategoryFilter !== "all")
      list = list.filter((e) => e.category === expCategoryFilter);
    return applySortGeneric(
      list,
      expSort,
      (e) => e.title,
      (e) => e.amount,
      (e) => e.expenseDate ?? e.createdAt,
    );
  }, [expenses, expCategoryFilter, fiscalYearFilter, expSort]);

  // Wrapped handlers with history
  const addSubscriptionWithHistory = useCallback(async () => {
    await addSubscription();
    saveToHistory();
  }, [addSubscription, saveToHistory]);

  const updateSubscriptionWithHistory = useCallback(
    (id: string, updates: Partial<Subscription>) => {
      updateSubscription(id, updates);
      saveToHistory();
    },
    [updateSubscription, saveToHistory],
  );

  const handleRemoveSubscription = useCallback((id: string) => {
    setDeleteSubscriptionId(id);
  }, []);

  const confirmRemoveSubscription = useCallback(async () => {
    if (deleteSubscriptionId) {
      await removeSubscription(deleteSubscriptionId);
      saveToHistory();
      setDeleteSubscriptionId(null);
    }
  }, [deleteSubscriptionId, removeSubscription, saveToHistory]);

  const addAssetWithHistory = useCallback(async () => {
    await addAsset();
    saveToHistory();
  }, [addAsset, saveToHistory]);

  const updateAssetWithHistory = useCallback(
    (id: string, updates: Partial<Asset>) => {
      updateAsset(id, updates);
      saveToHistory();
    },
    [updateAsset, saveToHistory],
  );

  const handleRemoveAsset = useCallback((id: string) => {
    setDeleteAssetId(id);
  }, []);

  const confirmRemoveAsset = useCallback(async () => {
    if (deleteAssetId) {
      await removeAsset(deleteAssetId);
      saveToHistory();
      setDeleteAssetId(null);
    }
  }, [deleteAssetId, removeAsset, saveToHistory]);

  // Invoice handlers
  const addInvoiceWithHistory = useCallback(async () => {
    await addInvoice();
    saveToHistory();
  }, [addInvoice, saveToHistory]);

  const updateInvoiceWithHistory = useCallback(
    (id: string, updates: Partial<Invoice>) => {
      updateInvoice(id, updates);
      saveToHistory();
    },
    [updateInvoice, saveToHistory],
  );

  const handleRemoveInvoice = useCallback((id: string) => {
    setDeleteInvoiceId(id);
  }, []);

  const confirmRemoveInvoice = useCallback(async () => {
    if (deleteInvoiceId) {
      await removeInvoice(deleteInvoiceId);
      saveToHistory();
      setDeleteInvoiceId(null);
    }
  }, [deleteInvoiceId, removeInvoice, saveToHistory]);

  // Expense handlers
  const addExpenseWithHistory = useCallback(async () => {
    await addExpense();
    saveToHistory();
  }, [addExpense, saveToHistory]);

  const updateExpenseWithHistory = useCallback(
    (id: string, updates: Partial<Expense>) => {
      updateExpense(id, updates);
      saveToHistory();
    },
    [updateExpense, saveToHistory],
  );

  const handleRemoveExpense = useCallback((id: string) => {
    setDeleteExpenseId(id);
  }, []);

  const confirmRemoveExpense = useCallback(async () => {
    if (deleteExpenseId) {
      await removeExpense(deleteExpenseId);
      saveToHistory();
      setDeleteExpenseId(null);
    }
  }, [deleteExpenseId, removeExpense, saveToHistory]);

  // Estimate handlers
  const addEstimateWithHistory = useCallback(async () => {
    await addEstimate();
    saveToHistory();
  }, [addEstimate, saveToHistory]);

  const updateEstimateWithHistory = useCallback(
    (id: string, updates: Partial<Estimate>) => {
      updateEstimate(id, updates);
      saveToHistory();
    },
    [updateEstimate, saveToHistory],
  );

  const handleRemoveEstimate = useCallback((id: string) => {
    setDeleteEstimateId(id);
  }, []);

  const confirmRemoveEstimate = useCallback(async () => {
    if (deleteEstimateId) {
      await removeEstimate(deleteEstimateId);
      saveToHistory();
      setDeleteEstimateId(null);
    }
  }, [deleteEstimateId, removeEstimate, saveToHistory]);

  const handleRefresh = useCallback(() => {
    refresh();
    refreshInvoices();
    refreshEstimates();
    refreshExpenses();
  }, [refresh, refreshInvoices, refreshEstimates, refreshExpenses]);

  // Add button labels
  const addActions: Record<MoneyTab, { fn: () => void; label: string }> = {
    subscriptions: {
      fn: addSubscriptionWithHistory,
      label: "Add Subscription",
    },
    assets: { fn: addAssetWithHistory, label: "Add Asset" },
    invoices: { fn: addInvoiceWithHistory, label: "Add Invoice" },
    estimates: { fn: addEstimateWithHistory, label: "Add Estimate" },
    expenses: { fn: addExpenseWithHistory, label: "Add Expense" },
  };

  const currentMonth = new Date();
  const currentYear = currentMonth.getFullYear();
  const monthlyExpenseTotal = getMonthlyTotal(
    currentYear,
    currentMonth.getMonth() + 1,
  );
  const yearlyExpenseTotal = Array.from({ length: 12 }, (_, i) =>
    getMonthlyTotal(currentYear, i + 1),
  ).reduce((sum, m) => sum + m, 0);

  const headerLeft = (
    <button
      onClick={handleRefresh}
      disabled={allSyncing}
      className="p-1.5 md:p-2 neu-text-secondary hover:neu-text-primary neu-btn rounded-lg transition-colors disabled:opacity-50"
      title="Refresh"
    >
      <RefreshCw
        size={16}
        className={`md:w-[18px] md:h-[18px] ${allSyncing ? "animate-spin" : ""}`}
      />
    </button>
  );

  const headerCenter = (
    <button
      onClick={addActions[activeTab].fn}
      className="flex items-center gap-1.5 md:gap-2 px-2.5 md:px-3 py-2 rounded-lg text-white text-xs md:text-sm font-medium transition-all active:scale-95 shadow bg-sky-600 hover:bg-sky-500"
    >
      <Plus size={16} />
      <span className="hidden sm:inline">{addActions[activeTab].label}</span>
    </button>
  );

  // Summary cards based on active tab
  const renderSummary = () => {
    switch (activeTab) {
      case "subscriptions":
        return (
          <div className="max-w-5xl mx-auto grid grid-cols-2 gap-3 md:gap-4">
            <div className="bg-white/20 backdrop-blur-sm rounded-xl p-3 md:p-4">
              <div className="flex items-center gap-1.5 text-white/80 text-xs md:text-sm mb-1">
                <CreditCard size={14} className="shrink-0 md:w-4 md:h-4" />
                <span className="truncate">Monthly</span>
              </div>
              <div className="text-xl md:text-3xl font-bold text-white">
                {formatCurrency(getMonthlySubscriptionTotal())}
              </div>
              <div className="text-white/60 text-[10px] md:text-xs mt-1">
                {subscriptions.filter((s) => s.status === "active").length}{" "}
                active (JPY)
              </div>
            </div>
            <div className="bg-white/20 backdrop-blur-sm rounded-xl p-3 md:p-4">
              <div className="flex items-center gap-1.5 text-white/80 text-xs md:text-sm mb-1">
                <DollarSign size={14} className="shrink-0 md:w-4 md:h-4" />
                <span className="truncate">Annual</span>
              </div>
              <div className="text-xl md:text-3xl font-bold text-white">
                {formatCurrency(getMonthlySubscriptionTotal() * 12)}
              </div>
              <div className="text-white/60 text-[10px] md:text-xs mt-1">
                yearly estimate (JPY)
              </div>
            </div>
          </div>
        );
      case "assets":
        return (
          <div className="max-w-5xl mx-auto grid grid-cols-2 gap-3 md:gap-4">
            <div className="bg-white/20 backdrop-blur-sm rounded-xl p-3 md:p-4">
              <div className="flex items-center gap-1.5 text-white/80 text-xs md:text-sm mb-1">
                <DollarSign size={14} className="shrink-0 md:w-4 md:h-4" />
                <span className="truncate">Total Assets</span>
              </div>
              <div className="text-xl md:text-3xl font-bold text-white">
                {formatCurrency(getTotalAssets() + investSummary.totalValueJPY)}
              </div>
              <div className="text-white/60 text-[10px] md:text-xs mt-1">
                {assets.length} accounts
                {investHoldings.length > 0 &&
                  ` + ${investHoldings.length} holdings`}{" "}
                (JPY)
              </div>
            </div>
            <div className="bg-white/20 backdrop-blur-sm rounded-xl p-3 md:p-4">
              <div className="flex items-center gap-1.5 text-white/80 text-xs md:text-sm mb-1">
                <TrendingUp size={14} className="shrink-0 md:w-4 md:h-4" />
                <span className="truncate">Invest P&L</span>
              </div>
              <div className="text-xl md:text-3xl font-bold text-white">
                {investSummary.pnlJPY >= 0 ? "+" : ""}
                {formatCurrency(investSummary.pnlJPY)}
              </div>
              <div className="text-white/60 text-[10px] md:text-xs mt-1">
                {investSummary.pnlPercent >= 0 ? "+" : ""}
                {investSummary.pnlPercent.toFixed(2)}%
              </div>
            </div>
          </div>
        );
      case "invoices":
        return (
          <div className="max-w-5xl mx-auto grid grid-cols-2 gap-3 md:gap-4">
            <div className="bg-white/20 backdrop-blur-sm rounded-xl p-3 md:p-4">
              <div className="flex items-center gap-1.5 text-white/80 text-xs md:text-sm mb-1">
                <FileText size={14} className="shrink-0 md:w-4 md:h-4" />
                <span className="truncate">Unpaid</span>
              </div>
              <div className="text-xl md:text-3xl font-bold text-white">
                {formatCurrency(getTotalUnpaid())}
              </div>
              <div className="text-white/60 text-[10px] md:text-xs mt-1">
                {getOverdueCount() > 0 && (
                  <span className="text-red-200">
                    {getOverdueCount()} overdue
                  </span>
                )}
              </div>
            </div>
            <div className="bg-white/20 backdrop-blur-sm rounded-xl p-3 md:p-4">
              <div className="flex items-center gap-1.5 text-white/80 text-xs md:text-sm mb-1">
                <DollarSign size={14} className="shrink-0 md:w-4 md:h-4" />
                <span className="truncate">Paid</span>
              </div>
              <div className="text-xl md:text-3xl font-bold text-white">
                {formatCurrency(getTotalPaid())}
              </div>
              <div className="text-white/60 text-[10px] md:text-xs mt-1">
                {invoices.filter((i) => i.status === "paid").length} invoices
              </div>
            </div>
          </div>
        );
      case "estimates":
        return (
          <div className="max-w-5xl mx-auto grid grid-cols-2 gap-3 md:gap-4">
            <div className="bg-white/20 backdrop-blur-sm rounded-xl p-3 md:p-4">
              <div className="flex items-center gap-1.5 text-white/80 text-xs md:text-sm mb-1">
                <FileText size={14} className="shrink-0 md:w-4 md:h-4" />
                <span className="truncate">Estimates</span>
              </div>
              <div className="text-xl md:text-3xl font-bold text-white">
                {estimates.length}
              </div>
              <div className="text-white/60 text-[10px] md:text-xs mt-1">
                {estimates.filter((e) => e.status === "issued").length} issued
              </div>
            </div>
            <div className="bg-white/20 backdrop-blur-sm rounded-xl p-3 md:p-4">
              <div className="flex items-center gap-1.5 text-white/80 text-xs md:text-sm mb-1">
                <DollarSign size={14} className="shrink-0 md:w-4 md:h-4" />
                <span className="truncate">Accepted</span>
              </div>
              <div className="text-xl md:text-3xl font-bold text-white">
                {estimates.filter((e) => e.status === "accepted").length}
              </div>
              <div className="text-white/60 text-[10px] md:text-xs mt-1">
                of {estimates.length} total
              </div>
            </div>
          </div>
        );
      case "expenses":
        return (
          <div className="max-w-5xl mx-auto grid grid-cols-2 gap-3 md:gap-4">
            <div className="bg-white/20 backdrop-blur-sm rounded-xl p-3 md:p-4">
              <div className="flex items-center gap-1.5 text-white/80 text-xs md:text-sm mb-1">
                <Receipt size={14} className="shrink-0 md:w-4 md:h-4" />
                <span className="truncate">This Month</span>
              </div>
              <div className="text-xl md:text-3xl font-bold text-white">
                {formatCurrency(monthlyExpenseTotal)}
              </div>
              <div className="text-white/60 text-[10px] md:text-xs mt-1">
                {expenses.length} total expenses
              </div>
            </div>
            <div className="bg-white/20 backdrop-blur-sm rounded-xl p-3 md:p-4">
              <div className="flex items-center gap-1.5 text-white/80 text-xs md:text-sm mb-1">
                <TrendingUp size={14} className="shrink-0 md:w-4 md:h-4" />
                <span className="truncate">This Year</span>
              </div>
              <div className="text-xl md:text-3xl font-bold text-white">
                {formatCurrency(yearlyExpenseTotal)}
              </div>
              <div className="text-white/60 text-[10px] md:text-xs mt-1">
                {currentYear} total
              </div>
            </div>
          </div>
        );
    }
  };

  // Filter chips based on active tab
  const renderFilterChips = () => {
    switch (activeTab) {
      case "subscriptions":
        return [
          { value: "all", label: "All" },
          ...subscriptionStatusOptions,
        ].map((s) => (
          <button
            key={s.value}
            onClick={() => setSubStatusFilter(s.value)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
              subStatusFilter === s.value
                ? "neu-chip-active text-sky-600"
                : "neu-chip neu-text-secondary"
            }`}
          >
            {s.label}
            {s.value !== "all" && (
              <span className="ml-1 text-[10px] opacity-60">
                ({subscriptions.filter((sub) => sub.status === s.value).length})
              </span>
            )}
          </button>
        ));
      case "assets":
        return [{ value: "all", label: "All" }, ...assetTypeOptions].map(
          (t) => (
            <button
              key={t.value}
              onClick={() => setAssetTypeFilter(t.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                assetTypeFilter === t.value
                  ? "neu-chip-active text-sky-600"
                  : "neu-chip neu-text-secondary"
              }`}
            >
              {t.label}
            </button>
          ),
        );
      case "invoices":
        return [{ value: "all", label: "All" }, ...invoiceStatusOptions].map(
          (s) => (
            <button
              key={s.value}
              onClick={() => setInvStatusFilter(s.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                invStatusFilter === s.value
                  ? "neu-chip-active text-sky-600"
                  : "neu-chip neu-text-secondary"
              }`}
            >
              {s.label}
              {s.value !== "all" && (
                <span className="ml-1 text-[10px] opacity-60">
                  ({invoices.filter((i) => i.status === s.value).length})
                </span>
              )}
            </button>
          ),
        );
      case "estimates":
        return [{ value: "all", label: "All" }, ...estimateStatusOptions].map(
          (s) => (
            <button
              key={s.value}
              onClick={() => setEstStatusFilter(s.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                estStatusFilter === s.value
                  ? "neu-chip-active text-sky-600"
                  : "neu-chip neu-text-secondary"
              }`}
            >
              {s.label}
              {s.value !== "all" && (
                <span className="ml-1 text-[10px] opacity-60">
                  ({estimates.filter((e) => e.status === s.value).length})
                </span>
              )}
            </button>
          ),
        );
      case "expenses":
        return [{ value: "all", label: "All" }, ...expenseCategoryOptions].map(
          (c) => (
            <button
              key={c.value}
              onClick={() => setExpCategoryFilter(c.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                expCategoryFilter === c.value
                  ? "neu-chip-active text-sky-600"
                  : "neu-chip neu-text-secondary"
              }`}
            >
              {c.label}
            </button>
          ),
        );
    }
  };

  // Card list for active tab
  const renderCardList = () => {
    switch (activeTab) {
      case "subscriptions":
        return filteredSubscriptions.length === 0 ? (
          <div className="text-center py-16 neu-bg">
            <CreditCard size={48} className="mx-auto neu-text-muted mb-4" />
            <p className="neu-text-secondary mb-4">
              {subStatusFilter !== "all"
                ? "No subscriptions matching filter"
                : "No subscriptions yet"}
            </p>
            {subStatusFilter !== "all" ? (
              <button
                onClick={() => setSubStatusFilter("all")}
                className="text-sky-600 hover:text-sky-700 text-sm font-medium"
              >
                Clear filter
              </button>
            ) : (
              <button
                onClick={addSubscription}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-sm font-medium transition-all"
              >
                <Plus size={16} /> Add first subscription
              </button>
            )}
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleSubscriptionDragEnd}
          >
            <SortableContext
              items={filteredSubscriptions.map((s) => s.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-4 no-select">
                {filteredSubscriptions.map((sub) => (
                  <SortableWrapper key={sub.id} id={sub.id}>
                    {(dragHandleProps) => (
                      <SubscriptionCard
                        subscription={sub}
                        onUpdate={updateSubscriptionWithHistory}
                        onDelete={handleRemoveSubscription}
                        dragHandleProps={
                          currentSort[activeTab] === "default"
                            ? dragHandleProps
                            : undefined
                        }
                      />
                    )}
                  </SortableWrapper>
                ))}
              </div>
            </SortableContext>
          </DndContext>
        );

      case "assets":
        return (
          <>
            <InvestSummaryCard
              holdings={investHoldings}
              transactions={investTransactions}
              quotes={investQuotes}
              exchangeRates={investRates}
              isLoading={investQuotesLoading || investDataLoading}
            />
            {filteredAssets.length === 0 ? (
              <div className="text-center py-16 neu-bg">
                <Wallet size={48} className="mx-auto neu-text-muted mb-4" />
                <p className="neu-text-secondary mb-4">
                  {assetTypeFilter !== "all"
                    ? "No assets matching filter"
                    : "No assets yet"}
                </p>
                {assetTypeFilter !== "all" ? (
                  <button
                    onClick={() => setAssetTypeFilter("all")}
                    className="text-sky-600 hover:text-sky-700 text-sm font-medium"
                  >
                    Clear filter
                  </button>
                ) : (
                  <button
                    onClick={addAssetWithHistory}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-sm font-medium transition-all"
                  >
                    <Plus size={16} /> Add first asset
                  </button>
                )}
              </div>
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleAssetDragEnd}
              >
                <SortableContext
                  items={filteredAssets.map((a) => a.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-4 no-select">
                    {filteredAssets.map((asset) => (
                      <SortableWrapper key={asset.id} id={asset.id}>
                        {(dragHandleProps) => (
                          <AssetCard
                            asset={asset}
                            onUpdate={updateAssetWithHistory}
                            onDelete={handleRemoveAsset}
                            dragHandleProps={
                              currentSort[activeTab] === "default"
                                ? dragHandleProps
                                : undefined
                            }
                          />
                        )}
                      </SortableWrapper>
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}
          </>
        );

      case "invoices":
        return (
          <div className="space-y-6">
            <DriveFileList folderName="97_Finance/Invoice" defaultCollapsed />
            {filteredInvoices.length === 0 ? (
              <div className="text-center py-16 neu-bg">
                <FileText size={48} className="mx-auto neu-text-muted mb-4" />
                <p className="neu-text-secondary mb-4">
                  {invStatusFilter !== "all"
                    ? "No invoices match the filter"
                    : "No invoices yet"}
                </p>
                {invStatusFilter !== "all" ? (
                  <button
                    onClick={() => setInvStatusFilter("all")}
                    className="text-sky-600 hover:text-sky-700 text-sm font-medium"
                  >
                    Clear filter
                  </button>
                ) : (
                  <button
                    onClick={addInvoiceWithHistory}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-sm font-medium transition-all"
                  >
                    <Plus size={16} /> Add first invoice
                  </button>
                )}
              </div>
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleInvoiceDragEnd}
              >
                <SortableContext
                  items={filteredInvoices.map((i) => i.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-4 no-select">
                    {filteredInvoices.map((inv) => (
                      <SortableWrapper key={inv.id} id={inv.id}>
                        {(dragHandleProps) => (
                          <InvoiceCard
                            invoice={inv}
                            projects={projects}
                            clients={clients}
                            onUpdate={updateInvoiceWithHistory}
                            onUpdateClient={updateClient}
                            onDelete={handleRemoveInvoice}
                            onUploadPdf={uploadPdf}
                            onDeletePdf={deletePdf}
                            onGetPdfUrl={getPdfSignedUrl}
                            onRunOcr={runOcrInvoice}
                            onGeneratePdf={generateInvoicePdf}
                            dragHandleProps={dragHandleProps}
                          />
                        )}
                      </SortableWrapper>
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}
          </div>
        );

      case "expenses":
        return (
          <div className="space-y-6">
            <DriveFileList
              folderName="97_Finance/Expenditures"
              defaultCollapsed
            />
            {filteredExpenses.length === 0 ? (
              <div className="text-center py-16 neu-bg">
                <Receipt size={48} className="mx-auto neu-text-muted mb-4" />
                <p className="neu-text-secondary mb-4">
                  {expCategoryFilter !== "all"
                    ? "No expenses match the filter"
                    : "No expenses yet"}
                </p>
                {expCategoryFilter !== "all" ? (
                  <button
                    onClick={() => setExpCategoryFilter("all")}
                    className="text-sky-600 hover:text-sky-700 text-sm font-medium"
                  >
                    Clear filter
                  </button>
                ) : (
                  <button
                    onClick={addExpenseWithHistory}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-sm font-medium transition-all"
                  >
                    <Plus size={16} /> Add first expense
                  </button>
                )}
              </div>
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleExpenseDragEnd}
              >
                <SortableContext
                  items={filteredExpenses.map((e) => e.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-4 no-select">
                    {filteredExpenses.map((exp) => (
                      <SortableWrapper key={exp.id} id={exp.id}>
                        {(dragHandleProps) => (
                          <ExpenseCard
                            expense={exp}
                            clients={clients}
                            projects={projects}
                            onUpdate={updateExpenseWithHistory}
                            onDelete={handleRemoveExpense}
                            onUploadReceipt={uploadReceipt}
                            onDeleteReceipt={deleteReceipt}
                            onGetReceiptUrl={getReceiptSignedUrl}
                            onRunOcr={runOcr}
                            dragHandleProps={
                              currentSort[activeTab] === "default"
                                ? dragHandleProps
                                : undefined
                            }
                          />
                        )}
                      </SortableWrapper>
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}
          </div>
        );

      case "estimates":
        return filteredEstimates.length === 0 ? (
          <div className="text-center py-16 neu-bg">
            <FileText size={48} className="mx-auto neu-text-muted mb-4" />
            <p className="neu-text-secondary mb-4">
              {estStatusFilter !== "all"
                ? "No estimates match the filter"
                : "No estimates yet"}
            </p>
            {estStatusFilter !== "all" ? (
              <button
                onClick={() => setEstStatusFilter("all")}
                className="text-sky-600 hover:text-sky-700 text-sm font-medium"
              >
                Clear filter
              </button>
            ) : (
              <button
                onClick={addEstimateWithHistory}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-sm font-medium transition-all"
              >
                <Plus size={16} /> Add first estimate
              </button>
            )}
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleEstimateDragEnd}
          >
            <SortableContext
              items={filteredEstimates.map((e) => e.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-4 no-select">
                {filteredEstimates.map((est) => (
                  <SortableWrapper key={est.id} id={est.id}>
                    {(dragHandleProps) => (
                      <EstimateCard
                        estimate={est}
                        projects={projects}
                        onUpdate={updateEstimateWithHistory}
                        onDelete={handleRemoveEstimate}
                        onUploadPdf={uploadEstimatePdf}
                        onDeletePdf={deleteEstimatePdf}
                        onGetPdfUrl={getEstimatePdfSignedUrl}
                        dragHandleProps={
                          currentSort[activeTab] === "default"
                            ? dragHandleProps
                            : undefined
                        }
                      />
                    )}
                  </SortableWrapper>
                ))}
              </div>
            </SortableContext>
          </DndContext>
        );
    }
  };

  const tabConfigMap: Record<
    MoneyTab,
    { icon: React.ElementType; label: string; color: string; count: number }
  > = {
    subscriptions: {
      icon: CreditCard,
      label: "Subscriptions",
      color: "text-violet-600",
      count: subscriptions.length,
    },
    assets: {
      icon: Wallet,
      label: "Assets",
      color: "text-emerald-600",
      count: assets.length,
    },
    invoices: {
      icon: FileText,
      label: "Invoices",
      color: "text-blue-600",
      count: invoices.length,
    },
    estimates: {
      icon: FileText,
      label: "Estimates",
      color: "text-orange-600",
      count: estimates.length,
    },
    expenses: {
      icon: Receipt,
      label: "Expenses",
      color: "text-amber-600",
      count: expenses.length,
    },
  };

  const sortedTabs = tabOrder
    .filter((key) => key in tabConfigMap)
    .map((key) => ({ key, ...tabConfigMap[key] }));

  const gradientMap: Record<MoneyTab, string> = {
    subscriptions: "from-violet-500 to-emerald-500",
    assets: "from-violet-500 to-emerald-500",
    invoices: "from-blue-500 to-indigo-500",
    estimates: "from-orange-500 to-amber-500",
    expenses: "from-amber-500 to-orange-500",
  };

  return (
    <Layout
      pageTitle="Finance"
      headerLeft={headerLeft}
      headerCenter={headerCenter}
    >
      {allLoading ? (
        <div className="h-full flex items-center justify-center">
          <Loader2 size={32} className="animate-spin neu-text-secondary" />
        </div>
      ) : (
        <>
          <div className="h-full flex flex-col neu-bg">
            {/* Summary Cards */}
            <div
              className={`shrink-0 bg-gradient-to-r ${gradientMap[activeTab]} p-4 md:p-6`}
            >
              {renderSummary()}
            </div>

            {/* Tabs (drag to reorder) */}
            <div
              className="shrink-0 neu-bg px-4"
              style={{ boxShadow: "0 4px 6px rgba(163, 177, 198, 0.4)" }}
            >
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleTabDragEnd}
              >
                <SortableContext
                  items={sortedTabs.map((t) => t.key)}
                  strategy={horizontalListSortingStrategy}
                >
                  <div className="max-w-5xl mx-auto flex gap-2 py-2 overflow-x-auto">
                    {sortedTabs.map((tab) => {
                      const TabIcon = tab.icon;
                      return (
                        <SortableWrapper key={tab.key} id={tab.key}>
                          {(dragHandleProps) => (
                            <button
                              onClick={() => setActiveTab(tab.key)}
                              className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all shrink-0 cursor-grab active:cursor-grabbing ${
                                activeTab === tab.key
                                  ? `neu-pressed ${tab.color}`
                                  : "neu-btn neu-text-secondary"
                              }`}
                              {...dragHandleProps}
                            >
                              <TabIcon size={18} />
                              <span className="hidden sm:inline">
                                {tab.label}
                              </span>
                              <span className="text-xs neu-badge">
                                {tab.count}
                              </span>
                            </button>
                          )}
                        </SortableWrapper>
                      );
                    })}
                  </div>
                </SortableContext>
              </DndContext>
            </div>

            {/* Content */}
            <main className="flex-1 min-h-0 overflow-auto p-4 md:p-6 mobile-scroll-pad">
              <div className="max-w-5xl mx-auto">
                {/* Filter Chips + Year Selector */}
                <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-1">
                  {renderFilterChips()}
                  {activeTab !== "subscriptions" &&
                    availableYears.length > 0 && (
                      <>
                        <div className="w-px h-5 bg-slate-200 shrink-0" />
                        <select
                          value={fiscalYearFilter}
                          onChange={(e) => setFiscalYearFilter(e.target.value)}
                          className="px-2 py-1.5 rounded-lg text-xs font-medium neu-input shrink-0"
                        >
                          <option value="all">All Years</option>
                          {availableYears.map((y) => (
                            <option key={y} value={String(y)}>
                              {y}
                            </option>
                          ))}
                        </select>
                      </>
                    )}
                  <div className="ml-auto flex items-center gap-1 shrink-0">
                    <ArrowUpDown size={14} className="neu-text-muted" />
                    <select
                      value={currentSort[activeTab]}
                      onChange={(e) =>
                        setSortForTab(activeTab, e.target.value as SortOption)
                      }
                      className="px-2 py-1.5 rounded-lg text-xs font-medium neu-input"
                    >
                      {sortOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                {renderCardList()}
              </div>
            </main>
          </div>

          {/* Confirm Dialogs */}
          <ConfirmDialog
            isOpen={deleteSubscriptionId !== null}
            title="Delete Subscription"
            message={`Are you sure you want to delete "${subscriptions.find((s) => s.id === deleteSubscriptionId)?.name || ""}"?`}
            onConfirm={confirmRemoveSubscription}
            onCancel={() => setDeleteSubscriptionId(null)}
          />
          <ConfirmDialog
            isOpen={deleteAssetId !== null}
            title="Delete Asset"
            message={`Are you sure you want to delete "${assets.find((a) => a.id === deleteAssetId)?.name || ""}"?`}
            onConfirm={confirmRemoveAsset}
            onCancel={() => setDeleteAssetId(null)}
          />
          <ConfirmDialog
            isOpen={deleteInvoiceId !== null}
            title="Delete Invoice"
            message={`Are you sure you want to delete "${invoices.find((i) => i.id === deleteInvoiceId)?.invoiceNumber || ""}"?`}
            onConfirm={confirmRemoveInvoice}
            onCancel={() => setDeleteInvoiceId(null)}
          />
          <ConfirmDialog
            isOpen={deleteExpenseId !== null}
            title="Delete Expense"
            message={`Are you sure you want to delete "${expenses.find((e) => e.id === deleteExpenseId)?.title || ""}"?`}
            onConfirm={confirmRemoveExpense}
            onCancel={() => setDeleteExpenseId(null)}
          />
          <ConfirmDialog
            isOpen={deleteEstimateId !== null}
            title="Delete Estimate"
            message={`Are you sure you want to delete "${estimates.find((e) => e.id === deleteEstimateId)?.estimateNumber || ""}"?`}
            onConfirm={confirmRemoveEstimate}
            onCancel={() => setDeleteEstimateId(null)}
          />
        </>
      )}
    </Layout>
  );
};
