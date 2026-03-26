import { useState, useRef } from "react";
import {
  FileText,
  Trash2,
  ChevronDown,
  ChevronUp,
  GripVertical,
  Upload,
  ExternalLink,
  X,
  Loader2,
} from "lucide-react";
import { formatCurrency } from "../../lib/formatters";
import { estimateStatusOptions } from "../../hooks/useEstimates";
import { invoiceCategoryOptions } from "../../hooks/useInvoices";
import { NumberInput, DatePicker } from "../../components";
import type {
  Estimate,
  EstimateStatus,
  InvoiceCategory,
  Project,
} from "../../types";

const statusColorMap: Record<string, string> = {
  slate: "bg-slate-200 text-slate-700",
  blue: "bg-blue-200 text-blue-700",
  emerald: "bg-emerald-200 text-emerald-700",
  red: "bg-red-200 text-red-700",
  amber: "bg-amber-200 text-amber-700",
};

export const EstimateCard = ({
  estimate,
  projects,
  onUpdate,
  onDelete,
  onUploadPdf,
  onDeletePdf,
  onGetPdfUrl,
  dragHandleProps,
}: {
  estimate: Estimate;
  projects: Project[];
  onUpdate: (id: string, updates: Partial<Estimate>) => void;
  onDelete: (id: string) => void;
  onUploadPdf: (id: string, file: File) => Promise<void>;
  onDeletePdf: (id: string) => Promise<void>;
  onGetPdfUrl: (path: string) => Promise<string | null>;
  dragHandleProps?: React.HTMLAttributes<HTMLDivElement>;
}) => {
  const [isExpanded, setIsExpanded] = useState(!estimate.estimateNumber);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const statusOption =
    estimateStatusOptions.find((s) => s.value === estimate.status) ||
    estimateStatusOptions[0];

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    try {
      await onUploadPdf(estimate.id, file);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleOpenPdf = async () => {
    if (!estimate.pdfStoragePath) return;
    const url = await onGetPdfUrl(estimate.pdfStoragePath);
    if (url) window.open(url, "_blank");
  };

  const projectName = projects.find((p) => p.id === estimate.projectId)?.name;
  const categoryLabel = invoiceCategoryOptions.find(
    (o) => o.value === estimate.category,
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
          <div className="bg-orange-100 p-1.5 md:p-2 rounded-lg shrink-0">
            <FileText size={18} className="md:w-5 md:h-5 text-orange-600" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={estimate.estimateNumber}
                onChange={(e) =>
                  onUpdate(estimate.id, { estimateNumber: e.target.value })
                }
                placeholder="見積番号..."
                className="flex-1 min-w-[100px] text-lg font-semibold neu-text-primary bg-transparent border-none outline-none placeholder:neu-text-muted focus:ring-0"
              />
              <select
                value={estimate.status}
                onChange={(e) =>
                  onUpdate(estimate.id, {
                    status: e.target.value as EstimateStatus,
                  })
                }
                className={`text-xs px-2 py-1 rounded-full border-none outline-none cursor-pointer ${statusColorMap[statusOption.color] || "bg-slate-200 text-slate-700"}`}
              >
                {estimateStatusOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {!isExpanded && (
              <div className="grid grid-cols-2 md:flex md:flex-wrap md:items-center gap-x-3 gap-y-1 mt-2 text-sm">
                <span className="flex items-center gap-1 font-semibold text-orange-600">
                  {formatCurrency(estimate.amount, estimate.currency)}
                </span>
                {categoryLabel && (
                  <span className="text-xs px-1.5 py-0.5 rounded bg-orange-100 text-orange-600">
                    {categoryLabel}
                  </span>
                )}
                {projectName && (
                  <span className="text-xs neu-text-secondary truncate">
                    {projectName}
                  </span>
                )}
                {estimate.expiryDate && (
                  <span className="text-xs neu-text-secondary col-span-2 md:col-span-1">
                    有効期限: {estimate.expiryDate}
                  </span>
                )}
                {estimate.pdfStoragePath && (
                  <span className="text-xs text-orange-500">PDF</span>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="p-2 neu-text-muted hover:neu-text-secondary hover:bg-slate-100 rounded-lg transition-colors"
              title={isExpanded ? "折りたたむ" : "展開"}
            >
              {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </button>
            <button
              onClick={() => onDelete(estimate.id)}
              className="p-2 neu-text-muted hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
              title="削除"
            >
              <Trash2 size={18} />
            </button>
          </div>
        </div>

        {isExpanded && (
          <div className="mt-4 space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <NumberInput
                  label="金額"
                  value={estimate.amount}
                  onChange={(value) => onUpdate(estimate.id, { amount: value })}
                  min={0}
                  step={0.01}
                  placeholder="0"
                  className="w-full"
                />
              </div>
              <div>
                <label className="text-xs neu-text-secondary mb-1 block">
                  通貨
                </label>
                <select
                  value={estimate.currency}
                  onChange={(e) =>
                    onUpdate(estimate.id, { currency: e.target.value })
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
                  カテゴリ
                </label>
                <select
                  value={estimate.category || ""}
                  onChange={(e) =>
                    onUpdate(estimate.id, {
                      category:
                        (e.target.value as InvoiceCategory) || undefined,
                    })
                  }
                  className="w-full px-3 py-2 text-sm neu-input"
                >
                  <option value="">--</option>
                  {invoiceCategoryOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs neu-text-secondary mb-1 block">
                  プロジェクト
                </label>
                <select
                  value={estimate.projectId || ""}
                  onChange={(e) =>
                    onUpdate(estimate.id, {
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <DatePicker
                label="発行日"
                value={estimate.issueDate || ""}
                onChange={(value) =>
                  onUpdate(estimate.id, {
                    issueDate: value || undefined,
                  })
                }
              />
              <DatePicker
                label="有効期限"
                value={estimate.expiryDate || ""}
                onChange={(value) =>
                  onUpdate(estimate.id, {
                    expiryDate: value || undefined,
                  })
                }
              />
            </div>
            {/* PDF Upload */}
            <div>
              <label className="text-xs neu-text-secondary mb-1 block">
                PDF
              </label>
              {estimate.pdfStoragePath ? (
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleOpenPdf}
                    className="flex items-center gap-1.5 text-sm text-orange-600 hover:text-orange-700"
                  >
                    <ExternalLink size={14} />
                    PDFを開く
                  </button>
                  <button
                    onClick={() => onDeletePdf(estimate.id)}
                    className="p-1 text-red-400 hover:text-red-600"
                    title="PDF削除"
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf"
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
                    PDFをアップロード
                  </button>
                </div>
              )}
            </div>
            <div>
              <label className="text-xs neu-text-secondary mb-1 block">
                備考
              </label>
              <textarea
                value={estimate.notes}
                onChange={(e) =>
                  onUpdate(estimate.id, { notes: e.target.value })
                }
                placeholder="備考..."
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
