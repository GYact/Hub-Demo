import React, { useState } from "react";
import { createPortal } from "react-dom";
import { X, Plus, Pencil, Trash2, Check } from "lucide-react";
import type { GmailLabel } from "../../types/gmail";

const LABEL_COLORS = [
  { text: "#000000", bg: "#16a765" },
  { text: "#000000", bg: "#4986e7" },
  { text: "#000000", bg: "#a479e2" },
  { text: "#000000", bg: "#f691b3" },
  { text: "#000000", bg: "#f6c26b" },
  { text: "#000000", bg: "#b3dc6c" },
  { text: "#000000", bg: "#42d692" },
  { text: "#000000", bg: "#e07798" },
  { text: "#ffffff", bg: "#cc3a21" },
  { text: "#ffffff", bg: "#ac2b16" },
  { text: "#ffffff", bg: "#8a1c0a" },
  { text: "#ffffff", bg: "#1a764d" },
];

interface LabelManagerProps {
  isOpen: boolean;
  onClose: () => void;
  labels: GmailLabel[];
  onCreateLabel: (
    name: string,
    color?: { textColor: string; backgroundColor: string },
  ) => Promise<GmailLabel | null>;
  onUpdateLabel: (
    labelId: string,
    updates: {
      name?: string;
      color?: { textColor: string; backgroundColor: string };
    },
  ) => Promise<boolean>;
  onDeleteLabel: (labelId: string) => Promise<boolean>;
}

export const LabelManager: React.FC<LabelManagerProps> = ({
  isOpen,
  onClose,
  labels,
  onCreateLabel,
  onUpdateLabel,
  onDeleteLabel,
}) => {
  const [newLabelName, setNewLabelName] = useState("");
  const [selectedColor, setSelectedColor] = useState<{
    text: string;
    bg: string;
  } | null>(null);
  const [editingLabelId, setEditingLabelId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  const customLabels = labels.filter((l) => l.type === "user");

  const handleCreate = async () => {
    if (!newLabelName.trim()) return;
    const color = selectedColor
      ? { textColor: selectedColor.text, backgroundColor: selectedColor.bg }
      : undefined;
    const result = await onCreateLabel(newLabelName.trim(), color);
    if (result) {
      setNewLabelName("");
      setSelectedColor(null);
    }
  };

  const handleRename = async (labelId: string) => {
    if (!editingName.trim()) return;
    const success = await onUpdateLabel(labelId, { name: editingName.trim() });
    if (success) {
      setEditingLabelId(null);
      setEditingName("");
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative w-full max-w-[calc(100vw-2rem)] md:max-w-md neu-card rounded-2xl overflow-hidden flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 md:px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold neu-text-primary">
            Manage Labels
          </h3>
          <button onClick={onClose} className="p-2 neu-btn rounded-lg">
            <X size={18} />
          </button>
        </div>

        {/* Create new label */}
        <div className="px-4 md:px-6 py-4 border-b border-gray-200 space-y-3">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={newLabelName}
              onChange={(e) => setNewLabelName(e.target.value)}
              placeholder="New label name..."
              className="flex-1 px-3 py-2 text-sm neu-input rounded-lg"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreate();
              }}
            />
            <button
              onClick={handleCreate}
              disabled={!newLabelName.trim()}
              className="flex items-center gap-1 px-3 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors text-sm font-medium disabled:opacity-50"
            >
              <Plus size={14} />
              Create
            </button>
          </div>
          {/* Color palette */}
          <div className="flex flex-wrap gap-1.5">
            {LABEL_COLORS.map((c, i) => (
              <button
                key={i}
                onClick={() =>
                  setSelectedColor(selectedColor?.bg === c.bg ? null : c)
                }
                className={`w-6 h-6 rounded-full transition-all ${
                  selectedColor?.bg === c.bg
                    ? "ring-2 ring-offset-2 ring-gray-400 scale-110"
                    : "hover:scale-110"
                }`}
                style={{ backgroundColor: c.bg }}
              />
            ))}
          </div>
        </div>

        {/* Existing labels */}
        <div className="flex-1 overflow-y-auto px-4 md:px-6 py-4">
          {customLabels.length === 0 ? (
            <p className="text-sm neu-text-muted text-center py-4">
              No custom labels yet
            </p>
          ) : (
            <div className="space-y-2">
              {customLabels.map((label) => (
                <div
                  key={label.id}
                  className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-50 transition-colors group"
                >
                  {label.color && (
                    <div
                      className="w-4 h-4 rounded-sm flex-shrink-0"
                      style={{
                        backgroundColor: label.color.backgroundColor,
                      }}
                    />
                  )}
                  {editingLabelId === label.id ? (
                    <div className="flex-1 flex items-center gap-1">
                      <input
                        type="text"
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        className="flex-1 px-2 py-1 text-sm neu-input rounded"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleRename(label.id);
                          if (e.key === "Escape") setEditingLabelId(null);
                        }}
                      />
                      <button
                        onClick={() => handleRename(label.id)}
                        className="p-1 text-green-600 hover:bg-green-100 rounded"
                      >
                        <Check size={14} />
                      </button>
                    </div>
                  ) : (
                    <>
                      <span className="flex-1 text-sm neu-text-primary truncate">
                        {label.name}
                      </span>
                      <div className="flex items-center gap-1 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => {
                            setEditingLabelId(label.id);
                            setEditingName(label.name);
                          }}
                          className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
                          title="Rename"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => onDeleteLabel(label.id)}
                          className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded"
                          title="Delete"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
};
