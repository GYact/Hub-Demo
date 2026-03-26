import { useState, useRef, useEffect } from "react";
import {
  FileText,
  Search,
  Trash2,
  ChevronDown,
  ChevronUp,
  GripVertical,
  Upload,
  ExternalLink,
  X,
  Loader2,
  ScanLine,
  Repeat,
  FileDown,
  Plus,
  RefreshCw,
} from "lucide-react";
import { formatCurrency } from "../../lib/formatters";
import {
  invoiceStatusOptions,
  invoiceCategoryOptions,
  invoiceRepeatOptions,
  calcNextRepeatDate,
} from "../../hooks/useInvoices";
import { DatePicker } from "../../components";
import type {
  Invoice,
  InvoiceStatus,
  InvoiceCategory,
  InvoiceRepeatType,
  Project,
  Client,
} from "../../types";

const statusColorMap: Record<string, string> = {
  slate: "bg-slate-200 text-slate-700",
  blue: "bg-blue-200 text-blue-700",
  emerald: "bg-emerald-200 text-emerald-700",
  red: "bg-red-200 text-red-700",
  amber: "bg-amber-200 text-amber-700",
};

export const InvoiceCard = ({
  invoice,
  projects,
  clients,
  onUpdate,
  onUpdateClient,
  onDelete,
  onUploadPdf,
  onDeletePdf,
  onGetPdfUrl,
  onRunOcr,
  onGeneratePdf,
  dragHandleProps,
}: {
  invoice: Invoice;
  projects: Project[];
  clients: Client[];
  onUpdate: (id: string, updates: Partial<Invoice>) => void;
  onUpdateClient: (id: string, updates: Partial<Client>) => void;
  onDelete: (id: string) => void;
  onUploadPdf: (id: string, file: File) => Promise<void>;
  onDeletePdf: (id: string) => Promise<void>;
  onGetPdfUrl: (path: string) => Promise<string | null>;
  onRunOcr: (id: string, file: File) => Promise<Record<string, unknown> | null>;
  onGeneratePdf?: (id: string) => Promise<boolean>;
  dragHandleProps?: React.HTMLAttributes<HTMLDivElement>;
}) => {
  const [isExpanded, setIsExpanded] = useState(!invoice.invoiceNumber);
  const [isUploading, setIsUploading] = useState(false);
  const [isOcrRunning, setIsOcrRunning] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [ocrResult, setOcrResult] = useState<Record<string, unknown> | null>(
    null,
  );
  const [clientQuery, setClientQuery] = useState("");
  const [clientDropdownOpen, setClientDropdownOpen] = useState(false);
  const clientDropdownRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const ocrFileRef = useRef<File | null>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        clientDropdownRef.current &&
        !clientDropdownRef.current.contains(e.target as Node)
      ) {
        setClientDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredClients = clients.filter((c) =>
    c.name.toLowerCase().includes(clientQuery.toLowerCase()),
  );

  const statusOption =
    invoiceStatusOptions.find((s) => s.value === invoice.status) ||
    invoiceStatusOptions[0];

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    ocrFileRef.current = file;
    setIsUploading(true);
    try {
      await onUploadPdf(invoice.id, file);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleOcr = async () => {
    const file = ocrFileRef.current;
    if (!file) return;
    setIsOcrRunning(true);
    try {
      const result = await onRunOcr(invoice.id, file);
      if (result) setOcrResult(result);
    } finally {
      setIsOcrRunning(false);
    }
  };

  const applyOcrResult = () => {
    if (!ocrResult) return;
    const updates: Partial<Invoice> = {};
    if (ocrResult.invoiceNumber && typeof ocrResult.invoiceNumber === "string")
      updates.invoiceNumber = ocrResult.invoiceNumber;
    if (ocrResult.amount && typeof ocrResult.amount === "number")
      updates.amount = ocrResult.amount;
    if (ocrResult.currency && typeof ocrResult.currency === "string")
      updates.currency = ocrResult.currency;
    if (ocrResult.issueDate && typeof ocrResult.issueDate === "string")
      updates.issueDate = ocrResult.issueDate;
    if (ocrResult.dueDate && typeof ocrResult.dueDate === "string")
      updates.dueDate = ocrResult.dueDate;
    if (ocrResult.category && typeof ocrResult.category === "string")
      updates.category = ocrResult.category as InvoiceCategory;
    onUpdate(invoice.id, updates);
    setOcrResult(null);
  };

  const handleOpenPdf = async () => {
    if (!invoice.pdfStoragePath) return;
    const url = await onGetPdfUrl(invoice.pdfStoragePath);
    if (url) window.open(url, "_blank");
  };

  const projectName = projects.find((p) => p.id === invoice.projectId)?.name;
  const selectedClient = clients.find((c) => c.id === invoice.clientId);
  const clientName = selectedClient?.name;
  const categoryLabel = invoiceCategoryOptions.find(
    (o) => o.value === invoice.category,
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
          <div className="bg-blue-100 p-1.5 md:p-2 rounded-lg shrink-0">
            <FileText size={18} className="md:w-5 md:h-5 text-blue-600" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex-1 min-w-[100px]">
                <div className="text-base font-semibold neu-text-primary truncate">
                  {clientName || "未設定"}
                </div>
                {invoice.invoiceNumber && (
                  <div className="text-[11px] neu-text-muted">
                    {invoice.invoiceNumber}
                  </div>
                )}
              </div>
              <select
                value={invoice.status}
                onChange={(e) =>
                  onUpdate(invoice.id, {
                    status: e.target.value as InvoiceStatus,
                  })
                }
                className={`text-xs px-2 py-1 rounded-full border-none outline-none cursor-pointer ${statusColorMap[statusOption.color] || "bg-slate-200 text-slate-700"}`}
              >
                {invoiceStatusOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {!isExpanded && (
              <div className="grid grid-cols-2 md:flex md:flex-wrap md:items-center gap-x-3 gap-y-1 mt-2 text-sm">
                <span className="flex items-center gap-1 font-semibold text-blue-600">
                  {formatCurrency(invoice.amount, invoice.currency)}
                </span>
                {categoryLabel && (
                  <span className="text-xs px-1.5 py-0.5 rounded bg-blue-100 text-blue-600">
                    {categoryLabel}
                  </span>
                )}
                {projectName && (
                  <span className="text-xs neu-text-secondary truncate">
                    {projectName}
                  </span>
                )}
                {invoice.dueDate && (
                  <span className="text-xs neu-text-secondary col-span-2 md:col-span-1">
                    期限: {invoice.dueDate}
                  </span>
                )}
                {invoice.pdfStoragePath && (
                  <span className="text-xs text-blue-500">PDF</span>
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
              onClick={() => onDelete(invoice.id)}
              className="p-2 neu-text-muted hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
              title="削除"
            >
              <Trash2 size={18} />
            </button>
          </div>
        </div>

        {isExpanded && (
          <div className="mt-4 space-y-3">
            {/* Line Items */}
            <div>
              <label className="text-xs neu-text-secondary mb-1 block">
                明細
              </label>
              <div className="border rounded-lg overflow-hidden">
                <div className="grid grid-cols-[1fr_60px_90px_90px_32px] gap-0 bg-slate-100 text-xs font-medium neu-text-secondary px-2 py-1.5">
                  <span>品名</span>
                  <span className="text-right">数量</span>
                  <span className="text-right">単価</span>
                  <span className="text-right">金額</span>
                  <span />
                </div>
                {(invoice.items ?? []).map((item, idx) => (
                  <div
                    key={idx}
                    className="grid grid-cols-[1fr_60px_90px_90px_32px] gap-0 border-t items-center"
                  >
                    <input
                      type="text"
                      value={item.name}
                      onChange={(e) => {
                        const next = [...(invoice.items ?? [])];
                        next[idx] = { ...next[idx], name: e.target.value };
                        onUpdate(invoice.id, { items: next });
                      }}
                      placeholder="品名"
                      className="px-2 py-1.5 text-sm bg-transparent border-none outline-none"
                    />
                    <input
                      type="number"
                      value={item.quantity || ""}
                      onChange={(e) => {
                        const next = [...(invoice.items ?? [])];
                        const q =
                          e.target.value === ""
                            ? 0
                            : parseFloat(e.target.value);
                        if (isNaN(q)) return;
                        next[idx] = { ...next[idx], quantity: q };
                        const sum = next.reduce(
                          (s, i) => s + i.quantity * i.unitPrice,
                          0,
                        );
                        const total = invoice.taxIncluded
                          ? sum
                          : Math.round(
                              sum * (1 + (invoice.taxRate ?? 10) / 100),
                            );
                        onUpdate(invoice.id, { items: next, amount: total });
                      }}
                      className="px-2 py-1.5 text-sm text-right bg-transparent border-none outline-none border-l"
                    />
                    <input
                      type="number"
                      value={item.unitPrice || ""}
                      onChange={(e) => {
                        const next = [...(invoice.items ?? [])];
                        const p =
                          e.target.value === ""
                            ? 0
                            : parseFloat(e.target.value);
                        if (isNaN(p)) return;
                        next[idx] = { ...next[idx], unitPrice: p };
                        const sum = next.reduce(
                          (s, i) => s + i.quantity * i.unitPrice,
                          0,
                        );
                        const total = invoice.taxIncluded
                          ? sum
                          : Math.round(
                              sum * (1 + (invoice.taxRate ?? 10) / 100),
                            );
                        onUpdate(invoice.id, { items: next, amount: total });
                      }}
                      className="px-2 py-1.5 text-sm text-right bg-transparent border-none outline-none"
                    />
                    <span className="px-2 py-1.5 text-sm text-right neu-text-primary">
                      {(item.quantity * item.unitPrice).toLocaleString()}
                    </span>
                    <button
                      onClick={() => {
                        const next = (invoice.items ?? []).filter(
                          (_, i) => i !== idx,
                        );
                        const sum = next.reduce(
                          (s, i) => s + i.quantity * i.unitPrice,
                          0,
                        );
                        const total = invoice.taxIncluded
                          ? sum
                          : Math.round(
                              sum * (1 + (invoice.taxRate ?? 10) / 100),
                            );
                        onUpdate(invoice.id, { items: next, amount: total });
                      }}
                      className="p-1 text-red-400 hover:text-red-600 mx-auto"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => {
                    const next = [
                      ...(invoice.items ?? []),
                      { name: "", quantity: 1, unitPrice: 0 },
                    ];
                    onUpdate(invoice.id, { items: next });
                  }}
                  className="w-full flex items-center justify-center gap-1 py-1.5 text-xs text-blue-600 hover:bg-blue-50 border-t transition-colors"
                >
                  <Plus size={12} /> 行を追加
                </button>
              </div>
              {/* Subtotal / Tax / Total */}
              {(invoice.items ?? []).length > 0 &&
                (() => {
                  const rate = invoice.taxRate ?? 10;
                  const sum = (invoice.items ?? []).reduce(
                    (s, i) => s + i.quantity * i.unitPrice,
                    0,
                  );
                  const taxIncl = invoice.taxIncluded ?? false;
                  const subtotal = taxIncl
                    ? sum - Math.round((sum * rate) / (100 + rate))
                    : sum;
                  const taxAmt = taxIncl
                    ? Math.round((sum * rate) / (100 + rate))
                    : Math.round((sum * rate) / 100);
                  const total = taxIncl ? sum : sum + taxAmt;

                  const recalcAmount = (newRate: number, newIncl: boolean) => {
                    return newIncl
                      ? sum
                      : Math.round(sum * (1 + newRate / 100));
                  };

                  return (
                    <div className="mt-2 flex flex-col items-end gap-1 text-sm">
                      <div className="flex gap-4">
                        <span className="neu-text-secondary">
                          {taxIncl ? "税抜金額" : "小計"}
                        </span>
                        <span className="w-28 text-right">
                          {subtotal.toLocaleString()}
                        </span>
                      </div>
                      <div className="flex gap-4 items-center">
                        <span className="neu-text-secondary">
                          {taxIncl ? "うち消費税" : "消費税"}
                        </span>
                        <select
                          value={rate}
                          onChange={(e) => {
                            const newRate = parseFloat(e.target.value);
                            onUpdate(invoice.id, {
                              taxRate: newRate,
                              amount: recalcAmount(newRate, taxIncl),
                            });
                          }}
                          className="text-xs px-1 py-0.5 neu-input"
                        >
                          <option value={0}>0%</option>
                          <option value={8}>8%</option>
                          <option value={10}>10%</option>
                        </select>
                        <select
                          value={taxIncl ? "included" : "excluded"}
                          onChange={(e) => {
                            const newIncl = e.target.value === "included";
                            onUpdate(invoice.id, {
                              taxIncluded: newIncl,
                              amount: recalcAmount(rate, newIncl),
                            });
                          }}
                          className="text-xs px-1 py-0.5 neu-input"
                        >
                          <option value="excluded">外税</option>
                          <option value="included">内税</option>
                        </select>
                        <span className="w-28 text-right">
                          {taxAmt.toLocaleString()}
                        </span>
                      </div>
                      <div className="flex gap-4 font-bold border-t pt-1">
                        <span>{taxIncl ? "合計金額(税込)" : "合計金額"}</span>
                        <span className="w-28 text-right">
                          {total.toLocaleString()}
                        </span>
                      </div>
                    </div>
                  );
                })()}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className="text-xs neu-text-secondary mb-1 block">
                  通貨
                </label>
                <select
                  value={invoice.currency}
                  onChange={(e) =>
                    onUpdate(invoice.id, { currency: e.target.value })
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
                  value={invoice.category || ""}
                  onChange={(e) =>
                    onUpdate(invoice.id, {
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
              <div ref={clientDropdownRef} className="relative">
                <label className="text-xs neu-text-secondary mb-1 block">
                  クライアント
                </label>
                <div
                  className="w-full flex items-center gap-1 px-3 py-2 text-sm neu-input cursor-pointer"
                  onClick={() => {
                    setClientDropdownOpen((v) => !v);
                    setClientQuery("");
                  }}
                >
                  <Search size={12} className="neu-text-muted shrink-0" />
                  {clientDropdownOpen ? (
                    <input
                      autoFocus
                      type="text"
                      value={clientQuery}
                      onChange={(e) => setClientQuery(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      placeholder="検索..."
                      className="flex-1 bg-transparent border-none outline-none text-sm p-0"
                    />
                  ) : (
                    <span
                      className={`flex-1 truncate ${!clientName ? "neu-text-muted" : ""}`}
                    >
                      {clientName || "--"}
                    </span>
                  )}
                </div>
                {clientDropdownOpen && (
                  <div className="absolute z-20 left-0 right-0 mt-1 max-h-48 overflow-y-auto rounded-lg bg-white shadow-lg border border-slate-200">
                    <button
                      type="button"
                      onClick={() => {
                        onUpdate(invoice.id, { clientId: undefined });
                        setClientDropdownOpen(false);
                      }}
                      className="w-full text-left px-3 py-2 text-sm neu-text-muted hover:bg-slate-50"
                    >
                      --
                    </button>
                    {filteredClients.map((c) => (
                      <button
                        type="button"
                        key={c.id}
                        onClick={() => {
                          onUpdate(invoice.id, { clientId: c.id });
                          setClientDropdownOpen(false);
                        }}
                        className={`w-full text-left px-3 py-2 text-sm hover:bg-slate-50 ${
                          c.id === invoice.clientId
                            ? "bg-blue-50 text-blue-700 font-medium"
                            : "neu-text-primary"
                        }`}
                      >
                        {c.name}
                      </button>
                    ))}
                    {filteredClients.length === 0 && (
                      <div className="px-3 py-2 text-sm neu-text-muted">
                        該当なし
                      </div>
                    )}
                  </div>
                )}
              </div>
              {selectedClient && (
                <div>
                  <label className="text-xs neu-text-secondary mb-1 block">
                    住所
                  </label>
                  <input
                    type="text"
                    value={selectedClient.address || ""}
                    onChange={(e) =>
                      onUpdateClient(selectedClient.id, {
                        address: e.target.value,
                      })
                    }
                    placeholder="〒000-0000 東京都..."
                    className="w-full px-3 py-2 text-sm neu-input"
                  />
                </div>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-xs neu-text-secondary mb-1 block">
                  請求番号
                </label>
                <input
                  type="text"
                  value={invoice.invoiceNumber}
                  onChange={(e) =>
                    onUpdate(invoice.id, { invoiceNumber: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm neu-input"
                />
              </div>
              <div>
                <label className="text-xs neu-text-secondary mb-1 block">
                  プロジェクト
                </label>
                <select
                  value={invoice.projectId || ""}
                  onChange={(e) =>
                    onUpdate(invoice.id, {
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
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <DatePicker
                label="発行日"
                value={invoice.issueDate || ""}
                onChange={(value) =>
                  onUpdate(invoice.id, {
                    issueDate: value || undefined,
                  })
                }
              />
              <DatePicker
                label="支払期限"
                value={invoice.dueDate || ""}
                onChange={(value) =>
                  onUpdate(invoice.id, {
                    dueDate: value || undefined,
                  })
                }
              />
              <DatePicker
                label="入金日"
                value={invoice.paidDate || ""}
                onChange={(value) =>
                  onUpdate(invoice.id, {
                    paidDate: value || undefined,
                  })
                }
              />
            </div>
            {/* Repeat */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs neu-text-secondary mb-1 flex items-center gap-1">
                  <Repeat size={12} />
                  繰り返し
                </label>
                <select
                  value={invoice.repeatType || "none"}
                  onChange={(e) => {
                    const rt = e.target.value as InvoiceRepeatType;
                    const baseDate =
                      invoice.issueDate ||
                      new Date().toISOString().split("T")[0];
                    onUpdate(invoice.id, {
                      repeatType: rt,
                      repeatNextDate: calcNextRepeatDate(baseDate, rt),
                    });
                  }}
                  className="w-full px-3 py-2 text-sm neu-input"
                >
                  {invoiceRepeatOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              {invoice.repeatType && invoice.repeatType !== "none" && (
                <div>
                  <label className="text-xs neu-text-secondary mb-1 block">
                    次回繰り返し日
                  </label>
                  <input
                    type="date"
                    value={invoice.repeatNextDate || ""}
                    onChange={(e) =>
                      onUpdate(invoice.id, {
                        repeatNextDate: e.target.value || undefined,
                      })
                    }
                    className="w-full px-3 py-2 text-sm neu-input"
                  />
                </div>
              )}
            </div>

            {/* PDF Upload */}
            <div>
              <label className="text-xs neu-text-secondary mb-1 block">
                PDF
              </label>
              {invoice.pdfStoragePath ? (
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="relative group/pdf">
                    <button
                      onClick={handleOpenPdf}
                      className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
                    >
                      <ExternalLink size={14} />
                      PDFを開く
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeletePdf(invoice.id);
                      }}
                      className="absolute -top-2 -right-2 p-0.5 rounded-full bg-red-500 text-white opacity-0 group-hover/pdf:opacity-100 transition-opacity shadow-sm hover:bg-red-600"
                      title="PDF削除"
                    >
                      <X size={12} />
                    </button>
                  </div>
                  {onGeneratePdf && (
                    <button
                      onClick={async () => {
                        setIsGenerating(true);
                        try {
                          await onGeneratePdf(invoice.id);
                        } catch (err) {
                          alert(
                            err instanceof Error
                              ? err.message
                              : "PDF生成に失敗しました",
                          );
                        } finally {
                          setIsGenerating(false);
                        }
                      }}
                      disabled={isGenerating}
                      className="flex items-center gap-1.5 text-sm text-emerald-600 hover:text-emerald-700 disabled:opacity-50"
                    >
                      {isGenerating ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <RefreshCw size={14} />
                      )}
                      再生成
                    </button>
                  )}
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
                      OCR実行
                    </button>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-3 flex-wrap">
                  {onGeneratePdf && (
                    <button
                      onClick={async () => {
                        setIsGenerating(true);
                        try {
                          await onGeneratePdf(invoice.id);
                        } catch (err) {
                          alert(
                            err instanceof Error
                              ? err.message
                              : "PDF生成に失敗しました",
                          );
                        } finally {
                          setIsGenerating(false);
                        }
                      }}
                      disabled={
                        isGenerating ||
                        !invoice.invoiceNumber ||
                        !invoice.amount
                      }
                      className="flex items-center gap-1.5 text-sm text-emerald-600 hover:text-emerald-700 disabled:opacity-50 transition-colors"
                    >
                      {isGenerating ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <FileDown size={14} />
                      )}
                      請求書PDFを生成
                    </button>
                  )}
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
                </div>
              )}
              {/* OCR Result Preview */}
              {ocrResult && (
                <div className="mt-2 p-3 bg-violet-50 rounded-lg text-sm space-y-1">
                  <div className="font-medium text-violet-700">OCR結果:</div>
                  {ocrResult.invoiceNumber != null && (
                    <div>
                      請求番号:{" "}
                      <span className="font-medium">
                        {String(ocrResult.invoiceNumber)}
                      </span>
                    </div>
                  )}
                  {ocrResult.amount != null && (
                    <div>
                      金額:{" "}
                      <span className="font-medium">
                        {formatCurrency(
                          Number(ocrResult.amount),
                          String(ocrResult.currency || "JPY"),
                        )}
                      </span>
                    </div>
                  )}
                  {ocrResult.issueDate != null && (
                    <div>
                      発行日:{" "}
                      <span className="font-medium">
                        {String(ocrResult.issueDate)}
                      </span>
                    </div>
                  )}
                  {ocrResult.dueDate != null && (
                    <div>
                      支払期限:{" "}
                      <span className="font-medium">
                        {String(ocrResult.dueDate)}
                      </span>
                    </div>
                  )}
                  {ocrResult.category != null && (
                    <div>
                      カテゴリ:{" "}
                      <span className="font-medium">
                        {String(ocrResult.category)}
                      </span>
                    </div>
                  )}
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={applyOcrResult}
                      className="px-3 py-1 text-xs bg-violet-600 text-white rounded-lg hover:bg-violet-500"
                    >
                      適用
                    </button>
                    <button
                      onClick={() => setOcrResult(null)}
                      className="px-3 py-1 text-xs neu-text-secondary hover:neu-text-primary"
                    >
                      閉じる
                    </button>
                  </div>
                </div>
              )}
            </div>
            <div>
              <label className="text-xs neu-text-secondary mb-1 block">
                備考
              </label>
              <textarea
                value={invoice.notes}
                onChange={(e) =>
                  onUpdate(invoice.id, { notes: e.target.value })
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
