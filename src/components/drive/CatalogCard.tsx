import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ExternalLink,
  Trash2,
  ChevronDown,
  ChevronUp,
  GripVertical,
  FolderOpen,
  FileText,
} from "lucide-react";
import { UrlInput } from "../../components";
import type { DataCatalogItem } from "../../types";

const normalizeUrl = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
};

const isGoogleDriveLink = (url: string): boolean => {
  const normalized = normalizeUrl(url);
  return (
    normalized.includes("drive.google.com") ||
    normalized.includes("docs.google.com")
  );
};

export const CatalogCard = ({
  item,
  onUpdate,
  onDelete,
  dragHandleProps,
}: {
  item: DataCatalogItem;
  onUpdate: (id: string, updates: Partial<DataCatalogItem>) => void;
  onDelete: (id: string) => void;
  dragHandleProps?: React.HTMLAttributes<HTMLDivElement>;
}) => {
  const [isExpanded, setIsExpanded] = useState(!item.label);

  return (
    <div className="neu-card overflow-hidden">
      <div className="p-3 md:p-5">
        {/* Header row */}
        <div className="flex items-center gap-2 md:gap-3">
          {dragHandleProps && (
            <div
              {...dragHandleProps}
              className="touch-none cursor-grab active:cursor-grabbing p-0.5 md:p-1 neu-text-muted hover:neu-text-secondary transition-colors shrink-0"
            >
              <GripVertical size={16} className="md:w-[18px] md:h-[18px]" />
            </div>
          )}
          <div className="neu-flat p-1.5 md:p-2 rounded-lg shrink-0">
            <FileText size={16} className="md:w-5 md:h-5 neu-text-secondary" />
          </div>
          <div className="flex-1 min-w-0">
            <input
              type="text"
              value={item.label}
              onChange={(e) => onUpdate(item.id, { label: e.target.value })}
              placeholder="Item name..."
              className="w-full text-base md:text-lg font-semibold neu-text-primary bg-transparent border-none outline-none placeholder:neu-text-muted focus:ring-0"
            />

            {!isExpanded && (
              <div className="mt-1 flex flex-wrap items-center gap-1.5 md:gap-2">
                {item.description && (
                  <p className="text-xs md:text-sm neu-text-secondary line-clamp-1">
                    {item.description}
                  </p>
                )}
                {item.link?.trim() &&
                  (isGoogleDriveLink(item.link) ? (
                    <Link
                      to="/drive/google"
                      className="inline-flex items-center gap-1 text-sky-600 hover:text-sky-700 text-xs md:text-sm"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <FolderOpen size={12} className="md:w-3.5 md:h-3.5" />
                      <span className="hidden md:inline">Drive</span>
                    </Link>
                  ) : (
                    <a
                      href={normalizeUrl(item.link)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-emerald-600 hover:text-emerald-700 text-xs md:text-sm"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <ExternalLink size={12} className="md:w-3.5 md:h-3.5" />
                    </a>
                  ))}
              </div>
            )}
          </div>
          <div className="flex items-center gap-0.5 md:gap-1 shrink-0">
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="p-1.5 md:p-2 neu-text-muted hover:neu-text-secondary neu-btn"
              title={isExpanded ? "Collapse" : "Expand"}
            >
              {isExpanded ? (
                <ChevronUp size={16} className="md:w-[18px] md:h-[18px]" />
              ) : (
                <ChevronDown size={16} className="md:w-[18px] md:h-[18px]" />
              )}
            </button>
            <button
              onClick={() => onDelete(item.id)}
              className="p-1.5 md:p-2 neu-text-muted hover:text-red-500 neu-btn"
              title="Delete"
            >
              <Trash2 size={16} className="md:w-[18px] md:h-[18px]" />
            </button>
          </div>
        </div>

        {/* Expanded content */}
        {isExpanded && (
          <div className="mt-3 space-y-2 md:space-y-3">
            <div>
              <label className="text-[10px] md:text-xs neu-text-secondary mb-1 block">
                Description
              </label>
              <input
                type="text"
                value={item.description ?? ""}
                onChange={(e) =>
                  onUpdate(item.id, { description: e.target.value })
                }
                placeholder="Description"
                className="w-full text-base md:text-sm neu-text-secondary neu-input px-2.5 md:px-3 py-2"
              />
            </div>
            <div>
              <label className="text-[10px] md:text-xs neu-text-secondary mb-1 block">
                Link
              </label>
              <div className="flex items-center gap-2">
                <UrlInput
                  value={item.link ?? ""}
                  onChange={(value) => onUpdate(item.id, { link: value })}
                  placeholder="https://drive.google.com/..."
                  className="flex-1"
                  showValidation={false}
                  showPreview={false}
                />
                {item.link?.trim() ? (
                  isGoogleDriveLink(item.link) ? (
                    <Link
                      to="/drive/google"
                      className="shrink-0 inline-flex items-center gap-1 rounded-lg bg-sky-600 px-2.5 py-2 text-xs font-semibold text-white hover:bg-sky-500"
                      title="View in app"
                    >
                      <FolderOpen size={14} />
                      Drive
                    </Link>
                  ) : (
                    <a
                      href={normalizeUrl(item.link)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-2 text-xs font-semibold text-white hover:bg-emerald-500"
                      title="Open link"
                    >
                      <ExternalLink size={14} />
                      Open
                    </a>
                  )
                ) : (
                  <button
                    type="button"
                    disabled
                    className="shrink-0 inline-flex items-center gap-1 neu-flat px-2.5 py-2 text-xs font-semibold neu-text-muted"
                  >
                    <ExternalLink size={14} />
                    Open
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
