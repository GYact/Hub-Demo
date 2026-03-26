import { useState, useMemo } from "react";
import {
  Plus,
  Trash2,
  X,
  ArrowUpRight,
  ArrowDownRight,
  Coins,
} from "lucide-react";
import { SymbolSearch } from "./SymbolSearch";
import type {
  InvestTransaction,
  InvestTransactionType,
  InvestPortfolio,
  InvestMarket,
} from "../../types";

interface HistoryTabProps {
  transactions: InvestTransaction[];
  portfolios: InvestPortfolio[];
  onAdd: (
    tx: Omit<InvestTransaction, "id" | "createdAt" | "updatedAt">,
  ) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
  searchFn: (q: string) => Promise<
    {
      symbol: string;
      name: string;
      type: string;
      exchange: string;
      market: "JP" | "US";
    }[]
  >;
}

const TYPE_CONFIG: Record<
  InvestTransactionType,
  { label: string; color: string; icon: typeof ArrowUpRight }
> = {
  buy: {
    label: "購入",
    color: "text-green-600 bg-green-50",
    icon: ArrowUpRight,
  },
  sell: {
    label: "売却",
    color: "text-red-600 bg-red-50",
    icon: ArrowDownRight,
  },
  dividend: { label: "配当", color: "text-blue-600 bg-blue-50", icon: Coins },
};

export const HistoryTab = ({
  transactions,
  portfolios,
  onAdd,
  onRemove,
  searchFn,
}: HistoryTabProps) => {
  const [isAdding, setIsAdding] = useState(false);
  const [form, setForm] = useState({
    symbol: "",
    name: "",
    market: "JP" as InvestMarket,
    portfolioId: portfolios[0]?.id ?? "",
    type: "buy" as InvestTransactionType,
    quantity: "",
    price: "",
    fee: "0",
    notes: "",
    transactedAt: new Date().toISOString().slice(0, 10),
  });

  // Group by month
  const grouped = useMemo(() => {
    const groups: Record<string, InvestTransaction[]> = {};
    for (const tx of transactions) {
      const key = tx.transactedAt.slice(0, 7); // YYYY-MM
      (groups[key] ??= []).push(tx);
    }
    return Object.entries(groups).sort(([a], [b]) => b.localeCompare(a));
  }, [transactions]);

  const handleSubmit = async () => {
    if (!form.symbol || !form.quantity || !form.price) return;
    await onAdd({
      portfolioId: form.portfolioId,
      symbol: form.symbol,
      name: form.name,
      market: form.market,
      type: form.type,
      quantity: Number(form.quantity),
      price: Number(form.price),
      fee: Number(form.fee) || 0,
      currency: form.market === "US" ? "USD" : "JPY",
      notes: form.notes,
      transactedAt: new Date(form.transactedAt).toISOString(),
    });
    setForm((prev) => ({
      ...prev,
      symbol: "",
      name: "",
      quantity: "",
      price: "",
      fee: "0",
      notes: "",
    }));
    setIsAdding(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button
          onClick={() => setIsAdding(true)}
          className="neu-btn px-4 py-2 rounded-xl text-sm flex items-center gap-2 neu-text-primary"
        >
          <Plus size={16} /> 取引を記録
        </button>
      </div>

      {isAdding && (
        <div className="neu-card p-4 space-y-3">
          {!form.symbol ? (
            <SymbolSearch
              onSelect={(sym, name, market) =>
                setForm((p) => ({ ...p, symbol: sym, name, market }))
              }
              searchFn={searchFn}
              placeholder="銘柄を検索..."
            />
          ) : (
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-medium">
                {form.symbol}
              </span>
              <span className="text-xs neu-text-muted">{form.name}</span>
              <button
                onClick={() => setForm((p) => ({ ...p, symbol: "", name: "" }))}
                className="p-0.5 neu-text-muted"
              >
                <X size={12} />
              </button>
            </div>
          )}
          {form.symbol && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={form.portfolioId}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, portfolioId: e.target.value }))
                  }
                  className="neu-input px-2 py-1.5 rounded-lg text-xs"
                >
                  {portfolios.map((pf) => (
                    <option key={pf.id} value={pf.id}>
                      {pf.name}
                    </option>
                  ))}
                </select>
                <select
                  value={form.type}
                  onChange={(e) =>
                    setForm((p) => ({
                      ...p,
                      type: e.target.value as InvestTransactionType,
                    }))
                  }
                  className="neu-input px-2 py-1.5 rounded-lg text-xs"
                >
                  <option value="buy">購入</option>
                  <option value="sell">売却</option>
                  <option value="dividend">配当</option>
                </select>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <input
                  type="number"
                  value={form.quantity}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, quantity: e.target.value }))
                  }
                  placeholder="数量"
                  className="neu-input px-2 py-1.5 rounded-lg text-xs"
                />
                <input
                  type="number"
                  value={form.price}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, price: e.target.value }))
                  }
                  placeholder="単価"
                  className="neu-input px-2 py-1.5 rounded-lg text-xs"
                />
                <input
                  type="number"
                  value={form.fee}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, fee: e.target.value }))
                  }
                  placeholder="手数料"
                  className="neu-input px-2 py-1.5 rounded-lg text-xs"
                />
              </div>
              <input
                type="date"
                value={form.transactedAt}
                onChange={(e) =>
                  setForm((p) => ({ ...p, transactedAt: e.target.value }))
                }
                className="neu-input px-2 py-1.5 rounded-lg text-xs w-full"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => void handleSubmit()}
                  disabled={!form.quantity || !form.price}
                  className="neu-btn px-4 py-1.5 rounded-lg text-xs text-blue-600 disabled:opacity-40"
                >
                  記録
                </button>
                <button
                  onClick={() => setIsAdding(false)}
                  className="text-xs neu-text-muted"
                >
                  キャンセル
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {transactions.length === 0 && !isAdding && (
        <div className="neu-card p-8 text-center text-sm neu-text-muted">
          取引を記録して投資履歴を管理しましょう
        </div>
      )}

      {grouped.map(([month, txs]) => (
        <div key={month}>
          <div className="text-xs font-medium neu-text-muted mb-2">{month}</div>
          <div className="space-y-2">
            {txs.map((tx) => {
              const cfg = TYPE_CONFIG[tx.type];
              const Icon = cfg.icon;
              const total = tx.quantity * tx.price + tx.fee;

              return (
                <div
                  key={tx.id}
                  className="neu-card p-3 flex items-center gap-3"
                >
                  <div className={`p-1.5 rounded-lg ${cfg.color}`}>
                    <Icon size={14} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-medium neu-text-primary">
                        {tx.symbol}
                      </span>
                      <span className={`text-[10px] px-1 rounded ${cfg.color}`}>
                        {cfg.label}
                      </span>
                    </div>
                    <div className="text-xs neu-text-muted">
                      {tx.quantity.toLocaleString()} × ¥
                      {tx.price.toLocaleString()}
                      {tx.fee > 0 && ` (手数料 ¥${tx.fee.toLocaleString()})`}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-medium neu-text-primary">
                      ¥
                      {total.toLocaleString("ja-JP", {
                        maximumFractionDigits: 0,
                      })}
                    </div>
                    <div className="text-[10px] neu-text-muted">
                      {tx.transactedAt.slice(0, 10)}
                    </div>
                  </div>
                  <button
                    onClick={() => void onRemove(tx.id)}
                    className="p-1 neu-text-muted hover:text-red-500 shrink-0"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};
