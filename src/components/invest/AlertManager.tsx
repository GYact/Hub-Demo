import { useState } from "react";
import { Bell, BellOff, Plus, Trash2, X } from "lucide-react";
import { SymbolSearch } from "./SymbolSearch";
import type { InvestAlert, InvestMarket } from "../../types";

interface AlertManagerProps {
  alerts: InvestAlert[];
  onAdd: (
    alert: Omit<InvestAlert, "id" | "createdAt" | "updatedAt">,
  ) => Promise<void>;
  onUpdate: (id: string, updates: Partial<InvestAlert>) => void;
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

export const AlertManager = ({
  alerts,
  onAdd,
  onUpdate,
  onRemove,
  searchFn,
}: AlertManagerProps) => {
  const [isAdding, setIsAdding] = useState(false);
  const [newSymbol, setNewSymbol] = useState("");
  const [newName, setNewName] = useState("");
  const [newMarket, setNewMarket] = useState<InvestMarket>("JP");
  const [newPrice, setNewPrice] = useState("");
  const [newCondition, setNewCondition] = useState<"above" | "below">("above");

  const handleSubmit = async () => {
    if (!newSymbol || !newPrice) return;
    await onAdd({
      symbol: newSymbol,
      name: newName,
      market: newMarket,
      targetPrice: Number(newPrice),
      condition: newCondition,
      enabled: true,
    });
    setNewSymbol("");
    setNewName("");
    setNewPrice("");
    setIsAdding(false);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium neu-text-primary flex items-center gap-2">
          <Bell size={16} /> 価格アラート
        </h3>
        <button
          onClick={() => setIsAdding(true)}
          className="neu-btn px-3 py-1.5 rounded-lg text-xs flex items-center gap-1 neu-text-secondary"
        >
          <Plus size={14} /> 追加
        </button>
      </div>

      {isAdding && (
        <div className="neu-card p-4 space-y-3">
          {!newSymbol ? (
            <SymbolSearch
              onSelect={(sym, name, market) => {
                setNewSymbol(sym);
                setNewName(name);
                setNewMarket(market);
              }}
              searchFn={searchFn}
              placeholder="銘柄を検索..."
            />
          ) : (
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-medium">{newSymbol}</span>
              <span className="text-xs neu-text-muted">{newName}</span>
              <button
                onClick={() => setNewSymbol("")}
                className="p-0.5 neu-text-muted hover:neu-text-secondary"
              >
                <X size={12} />
              </button>
            </div>
          )}
          {newSymbol && (
            <>
              <div className="flex gap-2 items-center">
                <select
                  value={newCondition}
                  onChange={(e) =>
                    setNewCondition(e.target.value as "above" | "below")
                  }
                  className="neu-input px-2 py-1.5 rounded-lg text-xs"
                >
                  <option value="above">以上</option>
                  <option value="below">以下</option>
                </select>
                <input
                  type="number"
                  value={newPrice}
                  onChange={(e) => setNewPrice(e.target.value)}
                  placeholder="目標価格"
                  className="neu-input px-3 py-1.5 rounded-lg text-xs flex-1"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => void handleSubmit()}
                  disabled={!newPrice}
                  className="neu-btn px-4 py-1.5 rounded-lg text-xs text-blue-600 disabled:opacity-40"
                >
                  設定
                </button>
                <button
                  onClick={() => {
                    setIsAdding(false);
                    setNewSymbol("");
                    setNewPrice("");
                  }}
                  className="text-xs neu-text-muted"
                >
                  キャンセル
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {alerts.length === 0 && !isAdding && (
        <div className="text-center text-sm neu-text-muted py-6">
          価格アラートを設定して重要な値動きを見逃さないようにしましょう
        </div>
      )}

      <div className="space-y-2">
        {alerts.map((alert) => (
          <div key={alert.id} className="neu-card p-3 flex items-center gap-3">
            <button
              onClick={() => onUpdate(alert.id, { enabled: !alert.enabled })}
              className={`p-1.5 rounded-lg transition-colors ${
                alert.enabled
                  ? "text-blue-600 bg-blue-50"
                  : "neu-text-muted bg-slate-50"
              }`}
            >
              {alert.enabled ? <Bell size={14} /> : <BellOff size={14} />}
            </button>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-medium neu-text-primary">
                  {alert.symbol}
                </span>
                <span
                  className={`text-[10px] px-1 rounded ${
                    alert.market === "JP"
                      ? "bg-red-50 text-red-500"
                      : "bg-blue-50 text-blue-500"
                  }`}
                >
                  {alert.market}
                </span>
              </div>
              <div className="text-xs neu-text-muted">
                {alert.condition === "above" ? "≥" : "≤"}{" "}
                {alert.targetPrice.toLocaleString("ja-JP")}
                {alert.triggeredAt && (
                  <span className="ml-2 text-green-600">発動済</span>
                )}
              </div>
            </div>
            <button
              onClick={() => void onRemove(alert.id)}
              className="p-1 neu-text-muted hover:text-red-500"
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};
