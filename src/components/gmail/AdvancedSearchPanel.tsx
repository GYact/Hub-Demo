import React, { useState } from "react";
import { Search, X, SlidersHorizontal } from "lucide-react";
import type { GmailSearchFilters, GmailLabel } from "../../types/gmail";
import { buildSearchQuery } from "../../lib/gmailUtils";
import { DatePicker } from "../DatePicker";

interface AdvancedSearchPanelProps {
  isOpen: boolean;
  onToggle: () => void;
  onSearch: (query: string) => void;
  labels: GmailLabel[];
}

export const AdvancedSearchPanel: React.FC<AdvancedSearchPanelProps> = ({
  isOpen,
  onToggle,
  onSearch,
  labels,
}) => {
  const [filters, setFilters] = useState<GmailSearchFilters>({});

  const customLabels = labels.filter(
    (l) => l.type === "user" && l.labelListVisibility !== "labelHide",
  );

  const updateFilter = (key: keyof GmailSearchFilters, value: unknown) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const handleSearch = () => {
    const query = buildSearchQuery(filters);
    if (query) {
      onSearch(query);
    }
  };

  const handleClear = () => {
    setFilters({});
  };

  const activeFilterCount = Object.values(filters).filter(
    (v) => v !== undefined && v !== "" && v !== false,
  ).length;

  return (
    <div className="relative">
      {/* Toggle button */}
      <button
        onClick={onToggle}
        className={`p-2 rounded-lg transition-colors relative ${
          isOpen || activeFilterCount > 0
            ? "bg-red-100 text-red-600"
            : "neu-btn"
        }`}
        title="Advanced search"
      >
        <SlidersHorizontal size={16} />
        {activeFilterCount > 0 && !isOpen && (
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
            {activeFilterCount}
          </span>
        )}
      </button>

      {/* Panel */}
      {isOpen && (
        <div className="absolute top-full mt-2 right-0 w-80 max-w-[calc(100vw-1rem)] neu-card rounded-xl shadow-xl border border-gray-200 z-20 p-4 space-y-3">
          {/* From */}
          <div>
            <label className="text-xs font-medium neu-text-muted">From</label>
            <input
              type="text"
              value={filters.from || ""}
              onChange={(e) =>
                updateFilter("from", e.target.value || undefined)
              }
              placeholder="sender@example.com"
              className="w-full mt-1 px-3 py-1.5 text-sm neu-input rounded-lg"
            />
          </div>

          {/* To */}
          <div>
            <label className="text-xs font-medium neu-text-muted">To</label>
            <input
              type="text"
              value={filters.to || ""}
              onChange={(e) => updateFilter("to", e.target.value || undefined)}
              placeholder="recipient@example.com"
              className="w-full mt-1 px-3 py-1.5 text-sm neu-input rounded-lg"
            />
          </div>

          {/* Subject */}
          <div>
            <label className="text-xs font-medium neu-text-muted">
              Subject
            </label>
            <input
              type="text"
              value={filters.subject || ""}
              onChange={(e) =>
                updateFilter("subject", e.target.value || undefined)
              }
              placeholder="Subject contains..."
              className="w-full mt-1 px-3 py-1.5 text-sm neu-input rounded-lg"
            />
          </div>

          {/* Date range */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <DatePicker
                label="After"
                value={filters.dateAfter || ""}
                onChange={(value) =>
                  updateFilter("dateAfter", value || undefined)
                }
              />
            </div>
            <div>
              <DatePicker
                label="Before"
                value={filters.dateBefore || ""}
                onChange={(value) =>
                  updateFilter("dateBefore", value || undefined)
                }
              />
            </div>
          </div>

          {/* Checkboxes */}
          <div className="flex flex-wrap gap-3">
            <label className="flex items-center gap-1.5 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={!!filters.hasAttachment}
                onChange={(e) =>
                  updateFilter("hasAttachment", e.target.checked || undefined)
                }
                className="rounded border-gray-300"
              />
              Attachments
            </label>
            <label className="flex items-center gap-1.5 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={!!filters.isUnread}
                onChange={(e) =>
                  updateFilter("isUnread", e.target.checked || undefined)
                }
                className="rounded border-gray-300"
              />
              Unread
            </label>
            <label className="flex items-center gap-1.5 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={!!filters.isStarred}
                onChange={(e) =>
                  updateFilter("isStarred", e.target.checked || undefined)
                }
                className="rounded border-gray-300"
              />
              Starred
            </label>
          </div>

          {/* Label select */}
          {customLabels.length > 0 && (
            <div>
              <label className="text-xs font-medium neu-text-muted">
                Label
              </label>
              <select
                value={filters.labelId || ""}
                onChange={(e) =>
                  updateFilter("labelId", e.target.value || undefined)
                }
                className="w-full mt-1 px-3 py-1.5 text-sm neu-input rounded-lg"
              >
                <option value="">Any label</option>
                {customLabels.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Free text */}
          <div>
            <label className="text-xs font-medium neu-text-muted">
              Keywords
            </label>
            <input
              type="text"
              value={filters.freeText || ""}
              onChange={(e) =>
                updateFilter("freeText", e.target.value || undefined)
              }
              placeholder="Additional keywords..."
              className="w-full mt-1 px-3 py-1.5 text-sm neu-input rounded-lg"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between pt-2 border-t border-gray-200">
            <button
              onClick={handleClear}
              className="flex items-center gap-1 px-3 py-1.5 text-sm neu-text-muted hover:neu-text-primary transition-colors"
            >
              <X size={14} />
              Clear
            </button>
            <button
              onClick={handleSearch}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors text-sm font-medium"
            >
              <Search size={14} />
              Search
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
