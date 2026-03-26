import { useState } from "react";
import {
  ExternalLink,
  Trash2,
  Settings,
  ChevronDown,
  ChevronUp,
  GripVertical,
  Tag,
} from "lucide-react";
import { UrlInput } from "../../components";
import type { Tool } from "../../types";

export const TOOL_CATEGORIES = [
  { value: "", label: "Uncategorized" },
  { value: "ai", label: "AI & Machine Learning" },
  { value: "design", label: "Design" },
  { value: "dev", label: "Development & Infra" },
  { value: "business", label: "Business & CRM" },
  { value: "finance", label: "Finance & Accounting" },
  { value: "marketing", label: "Marketing" },
  { value: "productivity", label: "Productivity & Collab" },
  { value: "social", label: "Social & Media" },
  { value: "subsidy", label: "Grants & Support" },
  { value: "other", label: "Other" },
];

export const ToolCard = ({
  tool,
  onUpdate,
  onDelete,
  dragHandleProps,
}: {
  tool: Tool;
  onUpdate: (id: string, updates: Partial<Tool>) => void;
  onDelete: (id: string) => void;
  dragHandleProps?: React.HTMLAttributes<HTMLDivElement>;
}) => {
  const [isExpanded, setIsExpanded] = useState(!tool.name);

  const categoryLabel =
    TOOL_CATEGORIES.find((c) => c.value === (tool.category || ""))?.label ||
    "Uncategorized";

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
            <Settings size={16} className="md:w-5 md:h-5 neu-text-secondary" />
          </div>
          <div className="flex-1 min-w-0">
            <input
              type="text"
              value={tool.name}
              onChange={(e) => onUpdate(tool.id, { name: e.target.value })}
              placeholder="Tool name..."
              className="w-full text-base md:text-lg font-semibold neu-text-primary bg-transparent border-none outline-none placeholder:neu-text-muted focus:ring-0"
            />

            {!isExpanded && (tool.description || tool.url) && (
              <div className="mt-1 flex flex-wrap items-center gap-1.5 md:gap-2">
                {tool.url && (
                  <a
                    href={tool.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-amber-600 hover:text-amber-700 flex items-center gap-1 text-xs md:text-sm"
                    onClick={(e) => e.stopPropagation()}
                    title="Open URL"
                  >
                    <ExternalLink size={12} className="md:w-3.5 md:h-3.5" />
                  </a>
                )}
                <span className="inline-flex items-center gap-1 px-1.5 md:px-2 py-0.5 rounded-full neu-flat text-[10px] md:text-xs neu-text-secondary">
                  <Tag size={8} className="md:w-2.5 md:h-2.5" />
                  {categoryLabel}
                </span>
                {tool.description && (
                  <p className="text-xs md:text-sm neu-text-secondary line-clamp-1">
                    {tool.description}
                  </p>
                )}
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
              onClick={() => onDelete(tool.id)}
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
                Category
              </label>
              <select
                value={tool.category || ""}
                onChange={(e) =>
                  onUpdate(tool.id, { category: e.target.value || undefined })
                }
                title="Select category"
                className="w-full text-base md:text-sm neu-text-secondary neu-input px-2.5 md:px-3 py-2"
              >
                {TOOL_CATEGORIES.map((cat) => (
                  <option key={cat.value} value={cat.value}>
                    {cat.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] md:text-xs neu-text-secondary mb-1 block">
                URL
              </label>
              <div className="flex items-center gap-2">
                <UrlInput
                  value={tool.url || ""}
                  onChange={(value) => onUpdate(tool.id, { url: value })}
                  placeholder="https://example.com"
                  className="flex-1"
                  showValidation={false}
                  showPreview={false}
                />
                {tool.url && (
                  <a
                    href={tool.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1.5 md:p-2 text-amber-600 hover:text-amber-700 neu-btn"
                    title="Open URL"
                  >
                    <ExternalLink
                      size={16}
                      className="md:w-[18px] md:h-[18px]"
                    />
                  </a>
                )}
              </div>
            </div>
            <div>
              <label className="text-[10px] md:text-xs neu-text-secondary mb-1 block">
                Description
              </label>
              <textarea
                value={tool.description}
                onChange={(e) =>
                  onUpdate(tool.id, { description: e.target.value })
                }
                placeholder="Description..."
                rows={3}
                className="w-full text-base md:text-sm neu-text-secondary neu-input px-2.5 md:px-3 py-2 resize-y min-h-[60px] md:min-h-[80px]"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
