import { useState, useRef } from "react";
import {
  FolderOpen,
  Trash2,
  ChevronDown,
  ChevronUp,
  GripVertical,
  Upload,
  ExternalLink,
  X,
  Loader2,
  ScanLine,
} from "lucide-react";
import { contractTypeOptions } from "../../hooks/useContracts";
import type { Contract, ContractType } from "../../types";

const formatFileSize = (bytes?: number) => {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
};

export const ContractCard = ({
  contract,
  onUpdate,
  onDelete,
  onUploadFile,
  onDeleteFile,
  onGetFileUrl,
  onRunOcr,
  dragHandleProps,
}: {
  contract: Contract;
  onUpdate: (id: string, updates: Partial<Contract>) => void;
  onDelete: (id: string) => void;
  onUploadFile: (id: string, file: File) => Promise<void>;
  onDeleteFile: (id: string) => Promise<void>;
  onGetFileUrl: (path: string) => Promise<string | null>;
  onRunOcr: (id: string, file: File) => Promise<Record<string, unknown> | null>;
  dragHandleProps?: React.HTMLAttributes<HTMLDivElement>;
}) => {
  const [isExpanded, setIsExpanded] = useState(!contract.title);
  const [isUploading, setIsUploading] = useState(false);
  const [isOcrRunning, setIsOcrRunning] = useState(false);
  const [ocrResult, setOcrResult] = useState<Record<string, unknown> | null>(
    null,
  );
  const [tagInput, setTagInput] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const ocrFileRef = useRef<File | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    ocrFileRef.current = file;
    setIsUploading(true);
    try {
      await onUploadFile(contract.id, file);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleOpenFile = async () => {
    if (!contract.storagePath) return;
    const url = await onGetFileUrl(contract.storagePath);
    if (url) window.open(url, "_blank");
  };

  const addTag = () => {
    const tag = tagInput.trim();
    if (!tag || contract.tags.includes(tag)) return;
    onUpdate(contract.id, { tags: [...contract.tags, tag] });
    setTagInput("");
  };

  const removeTag = (tag: string) => {
    onUpdate(contract.id, {
      tags: contract.tags.filter((t) => t !== tag),
    });
  };

  const handleTagKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addTag();
    }
  };

  const handleOcr = async () => {
    const file = ocrFileRef.current;
    if (!file) return;
    setIsOcrRunning(true);
    try {
      const result = await onRunOcr(contract.id, file);
      if (result) setOcrResult(result);
    } finally {
      setIsOcrRunning(false);
    }
  };

  const applyOcrResult = () => {
    if (!ocrResult) return;
    const updates: Partial<Contract> = {};
    if (ocrResult.title && typeof ocrResult.title === "string")
      updates.title = ocrResult.title;
    if (ocrResult.contractType && typeof ocrResult.contractType === "string")
      updates.contractType = ocrResult.contractType as ContractType;
    if (ocrResult.tags && Array.isArray(ocrResult.tags))
      updates.tags = ocrResult.tags as string[];
    if (ocrResult.summary && typeof ocrResult.summary === "string") {
      const existing = contract.notes ? contract.notes.trim() : "";
      updates.notes = existing
        ? `${existing}\n\n--- OCR Summary ---\n${ocrResult.summary}`
        : `--- OCR Summary ---\n${ocrResult.summary}`;
    }
    onUpdate(contract.id, updates);
    setOcrResult(null);
  };

  const typeLabel = contractTypeOptions.find(
    (o) => o.value === contract.contractType,
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
          <div className="bg-teal-100 p-1.5 md:p-2 rounded-lg shrink-0">
            <FolderOpen size={18} className="md:w-5 md:h-5 text-teal-600" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={contract.title}
                onChange={(e) =>
                  onUpdate(contract.id, { title: e.target.value })
                }
                placeholder="Contract title..."
                className="flex-1 min-w-[100px] text-lg font-semibold neu-text-primary bg-transparent border-none outline-none placeholder:neu-text-muted focus:ring-0"
              />
              <span className="text-xs px-2 py-1 rounded-full bg-teal-100 text-teal-700">
                {typeLabel}
              </span>
            </div>

            {!isExpanded && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-sm">
                {contract.fileName && (
                  <span className="text-xs neu-text-secondary truncate max-w-[200px]">
                    {contract.fileName}
                    {contract.fileSize
                      ? ` (${formatFileSize(contract.fileSize)})`
                      : ""}
                  </span>
                )}
                {contract.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {contract.tags.slice(0, 3).map((tag) => (
                      <span
                        key={tag}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-slate-200 neu-text-secondary"
                      >
                        {tag}
                      </span>
                    ))}
                    {contract.tags.length > 3 && (
                      <span className="text-[10px] neu-text-muted">
                        +{contract.tags.length - 3}
                      </span>
                    )}
                  </div>
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
              onClick={() => onDelete(contract.id)}
              className="p-2 neu-text-muted hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
              title="Delete"
            >
              <Trash2 size={18} />
            </button>
          </div>
        </div>

        {isExpanded && (
          <div className="mt-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs neu-text-secondary mb-1 block">
                  Type
                </label>
                <select
                  value={contract.contractType}
                  onChange={(e) =>
                    onUpdate(contract.id, {
                      contractType: e.target.value as ContractType,
                    })
                  }
                  className="w-full px-3 py-2 text-sm neu-input"
                >
                  {contractTypeOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs neu-text-secondary mb-1 block">
                  Tags
                </label>
                <div className="flex items-center gap-1">
                  <input
                    type="text"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={handleTagKeyDown}
                    placeholder="Press Enter to add"
                    className="flex-1 px-3 py-2 text-sm neu-input"
                  />
                </div>
                {contract.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {contract.tags.map((tag) => (
                      <span
                        key={tag}
                        className="flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-teal-100 text-teal-700"
                      >
                        {tag}
                        <button
                          onClick={() => removeTag(tag)}
                          className="hover:text-red-500"
                        >
                          <X size={10} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
            {/* File Upload */}
            <div>
              <label className="text-xs neu-text-secondary mb-1 block">
                File
              </label>
              {contract.storagePath ? (
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={handleOpenFile}
                    className="flex items-center gap-1.5 text-sm text-teal-600 hover:text-teal-700"
                  >
                    <ExternalLink size={14} />
                    {contract.fileName || "Open File"}
                  </button>
                  {contract.fileSize && (
                    <span className="text-xs neu-text-muted">
                      ({formatFileSize(contract.fileSize)})
                    </span>
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
                      Run OCR
                    </button>
                  )}
                  <button
                    onClick={() => onDeleteFile(contract.id)}
                    className="p-1 text-red-400 hover:text-red-600"
                    title="Delete File"
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <div>
                  <input
                    ref={fileInputRef}
                    type="file"
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
                    Upload File
                  </button>
                </div>
              )}
              {/* OCR Result Preview */}
              {ocrResult && (
                <div className="mt-2 p-3 bg-violet-50 rounded-lg text-sm space-y-1">
                  <div className="font-medium text-violet-700">OCR Result:</div>
                  {ocrResult.title != null && (
                    <div>
                      Title:{" "}
                      <span className="font-medium">
                        {String(ocrResult.title)}
                      </span>
                    </div>
                  )}
                  {ocrResult.contractType != null && (
                    <div>
                      Contract Type:{" "}
                      <span className="font-medium">
                        {String(ocrResult.contractType)}
                      </span>
                    </div>
                  )}
                  {ocrResult.parties != null && (
                    <div>
                      Parties:{" "}
                      <span className="font-medium">
                        {Array.isArray(ocrResult.parties)
                          ? (ocrResult.parties as string[]).join(", ")
                          : String(ocrResult.parties)}
                      </span>
                    </div>
                  )}
                  {ocrResult.effectiveDate != null && (
                    <div>
                      Effective Date:{" "}
                      <span className="font-medium">
                        {String(ocrResult.effectiveDate)}
                      </span>
                    </div>
                  )}
                  {ocrResult.summary != null && (
                    <div>
                      Summary:{" "}
                      <span className="font-medium">
                        {String(ocrResult.summary)}
                      </span>
                    </div>
                  )}
                  {ocrResult.tags != null && Array.isArray(ocrResult.tags) && (
                    <div>
                      Tags:{" "}
                      <span className="font-medium">
                        {(ocrResult.tags as string[]).join(", ")}
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
                value={contract.notes}
                onChange={(e) =>
                  onUpdate(contract.id, { notes: e.target.value })
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
