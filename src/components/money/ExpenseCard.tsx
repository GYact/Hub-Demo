import { useState, useRef } from "react";
import {
  Trash2,
  ChevronDown,
  ChevronUp,
  GripVertical,
  Upload,
  ExternalLink,
  X,
  Loader2,
  ScanLine,
  Car,
  Coffee,
  Package,
  Monitor,
  Cpu,
  Phone,
  Users,
  BookOpen,
  MoreHorizontal,
} from "lucide-react";
import { formatCurrency } from "../../lib/formatters";
import { expenseCategoryOptions } from "../../hooks/useExpenses";
import { NumberInput, DatePicker } from "../../components";
import type { Expense, ExpenseCategory, Client, Project } from "../../types";

const categoryIconMap: Record<string, React.ElementType> = {
  Car,
  Coffee,
  Package,
  Monitor,
  Cpu,
  Phone,
  Users,
  BookOpen,
  MoreHorizontal,
};

const getCategoryIcon = (category: ExpenseCategory) => {
  const opt = expenseCategoryOptions.find((o) => o.value === category);
  return categoryIconMap[opt?.icon || "MoreHorizontal"] || MoreHorizontal;
};

export const ExpenseCard = ({
  expense,
  clients,
  projects,
  onUpdate,
  onDelete,
  onUploadReceipt,
  onDeleteReceipt,
  onGetReceiptUrl,
  onRunOcr,
  dragHandleProps,
}: {
  expense: Expense;
  clients: Client[];
  projects: Project[];
  onUpdate: (id: string, updates: Partial<Expense>) => void;
  onDelete: (id: string) => void;
  onUploadReceipt: (id: string, file: File) => Promise<void>;
  onDeleteReceipt: (id: string) => Promise<void>;
  onGetReceiptUrl: (path: string) => Promise<string | null>;
  onRunOcr: (id: string, file: File) => Promise<Record<string, unknown> | null>;
  dragHandleProps?: React.HTMLAttributes<HTMLDivElement>;
}) => {
  const [isExpanded, setIsExpanded] = useState(!expense.title);
  const [isUploading, setIsUploading] = useState(false);
  const [isOcrRunning, setIsOcrRunning] = useState(false);
  const [ocrResult, setOcrResult] = useState<Record<string, unknown> | null>(
    null,
  );
  const fileInputRef = useRef<HTMLInputElement>(null);
  const ocrFileRef = useRef<File | null>(null);
  const CategoryIcon = getCategoryIcon(expense.category);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    ocrFileRef.current = file;
    setIsUploading(true);
    try {
      await onUploadReceipt(expense.id, file);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleOpenReceipt = async () => {
    if (!expense.receiptStoragePath) return;
    const url = await onGetReceiptUrl(expense.receiptStoragePath);
    if (url) window.open(url, "_blank");
  };

  const handleOcr = async () => {
    const file = ocrFileRef.current;
    if (!file) return;
    setIsOcrRunning(true);
    try {
      const result = await onRunOcr(expense.id, file);
      if (result) setOcrResult(result);
    } finally {
      setIsOcrRunning(false);
    }
  };

  const applyOcrResult = () => {
    if (!ocrResult) return;
    const updates: Partial<Expense> = {};
    if (ocrResult.amount && typeof ocrResult.amount === "number")
      updates.amount = ocrResult.amount;
    if (ocrResult.currency && typeof ocrResult.currency === "string")
      updates.currency = ocrResult.currency;
    if (ocrResult.date && typeof ocrResult.date === "string")
      updates.expenseDate = ocrResult.date;
    if (ocrResult.title && typeof ocrResult.title === "string")
      updates.title = ocrResult.title;
    onUpdate(expense.id, updates);
    setOcrResult(null);
  };

  const clientName = clients.find((c) => c.id === expense.clientId)?.name;
  const categoryLabel = expenseCategoryOptions.find(
    (o) => o.value === expense.category,
  )?.label;

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
          <div className="bg-amber-100 p-1.5 md:p-2 rounded-lg shrink-0">
            <CategoryIcon size={18} className="md:w-5 md:h-5 text-amber-600" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={expense.title}
                onChange={(e) =>
                  onUpdate(expense.id, { title: e.target.value })
                }
                placeholder="Expense title..."
                className="flex-1 min-w-[100px] text-lg font-semibold neu-text-primary bg-transparent border-none outline-none placeholder:neu-text-muted focus:ring-0"
              />
              <span className="text-xs px-2 py-1 rounded-full bg-amber-200 text-amber-700">
                {categoryLabel}
              </span>
            </div>

            {!isExpanded && (
              <div className="grid grid-cols-2 md:flex md:flex-wrap md:items-center gap-x-3 gap-y-1 mt-2 text-sm">
                <span className="flex items-center gap-1 font-semibold text-amber-600">
                  {formatCurrency(expense.amount, expense.currency)}
                </span>
                {expense.expenseDate && (
                  <span className="text-xs neu-text-secondary">
                    {expense.expenseDate}
                  </span>
                )}
                {clientName && (
                  <span className="text-xs neu-text-secondary truncate">
                    {clientName}
                  </span>
                )}
                {expense.receiptStoragePath && (
                  <span className="text-xs text-amber-500">Receipt</span>
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
              onClick={() => onDelete(expense.id)}
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
                  value={expense.amount}
                  onChange={(value) => onUpdate(expense.id, { amount: value })}
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
                  value={expense.currency}
                  onChange={(e) =>
                    onUpdate(expense.id, { currency: e.target.value })
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
                  Category
                </label>
                <select
                  value={expense.category}
                  onChange={(e) =>
                    onUpdate(expense.id, {
                      category: e.target.value as ExpenseCategory,
                    })
                  }
                  className="w-full px-3 py-2 text-sm neu-input"
                >
                  {expenseCategoryOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <DatePicker
                  label="Date"
                  value={expense.expenseDate || ""}
                  onChange={(value) =>
                    onUpdate(expense.id, {
                      expenseDate: value || undefined,
                    })
                  }
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs neu-text-secondary mb-1 block">
                  Client
                </label>
                <select
                  value={expense.clientId || ""}
                  onChange={(e) =>
                    onUpdate(expense.id, {
                      clientId: e.target.value || undefined,
                    })
                  }
                  className="w-full px-3 py-2 text-sm neu-input"
                >
                  <option value="">--</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs neu-text-secondary mb-1 block">
                  Project
                </label>
                <select
                  value={expense.projectId || ""}
                  onChange={(e) =>
                    onUpdate(expense.id, {
                      projectId: e.target.value || undefined,
                    })
                  }
                  className="w-full px-3 py-2 text-sm neu-input"
                >
                  <option value="">--</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {/* Receipt Upload + OCR */}
            <div>
              <label className="text-xs neu-text-secondary mb-1 block">
                Receipt
              </label>
              {expense.receiptStoragePath ? (
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={handleOpenReceipt}
                    className="flex items-center gap-1.5 text-sm text-amber-600 hover:text-amber-700"
                  >
                    <ExternalLink size={14} />
                    Open Receipt
                  </button>
                  {ocrFileRef.current && (
                    <button
                      onClick={handleOcr}
                      disabled={isOcrRunning}
                      className="flex items-center gap-1.5 text-sm text-violet-600 hover:text-violet-700 disabled:opacity-50"
                    >
                      {isOcrRunning ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <ScanLine size={14} />
                      )}
                      Run OCR
                    </button>
                  )}
                  <button
                    onClick={() => onDeleteReceipt(expense.id)}
                    className="p-1 text-red-400 hover:text-red-600"
                    title="Delete Receipt"
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,.pdf"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                    className="flex items-center gap-1.5 text-sm neu-text-secondary hover:neu-text-primary transition-colors"
                  >
                    {isUploading ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Upload size={14} />
                    )}
                    Upload Receipt
                  </button>
                </div>
              )}
              {/* OCR Result Preview */}
              {ocrResult && (
                <div className="mt-2 p-3 bg-violet-50 rounded-lg text-sm space-y-1">
                  <div className="font-medium text-violet-700">OCR Result:</div>
                  {ocrResult.title != null && (
                    <div>
                      Name:{" "}
                      <span className="font-medium">
                        {String(ocrResult.title)}
                      </span>
                    </div>
                  )}
                  {ocrResult.amount != null && (
                    <div>
                      Amount:{" "}
                      <span className="font-medium">
                        {formatCurrency(
                          Number(ocrResult.amount),
                          String(ocrResult.currency || "JPY"),
                        )}
                      </span>
                    </div>
                  )}
                  {ocrResult.date != null && (
                    <div>
                      Date:{" "}
                      <span className="font-medium">
                        {String(ocrResult.date)}
                      </span>
                    </div>
                  )}
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={applyOcrResult}
                      className="px-3 py-1 text-xs bg-violet-600 text-white rounded-lg hover:bg-violet-500"
                    >
                      Apply
                    </button>
                    <button
                      onClick={() => setOcrResult(null)}
                      className="px-3 py-1 text-xs neu-text-secondary hover:neu-text-primary"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              )}
            </div>
            <div>
              <label className="text-xs neu-text-secondary mb-1 block">
                Notes
              </label>
              <textarea
                value={expense.notes}
                onChange={(e) =>
                  onUpdate(expense.id, { notes: e.target.value })
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
