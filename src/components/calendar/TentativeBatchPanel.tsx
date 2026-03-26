import { useState } from "react";
import { createPortal } from "react-dom";
import { X, ChevronUp, ChevronDown, Trash2, CalendarPlus } from "lucide-react";
import type {
  TentativeSlot,
  BatchCreateParams,
} from "../../hooks/useTentativeBatchMode";

interface Props {
  isActive: boolean;
  onClose: () => void;
  selectedSlots: TentativeSlot[];
  onRemoveSlot: (index: number) => void;
  onClearSlots: () => void;
  onUpdateSlotTime: (index: number, start: string, end: string) => void;
  onSubmit: (params: BatchCreateParams) => Promise<boolean>;
  isCreating: boolean;
  defaultDuration: number;
  onSetDuration: (min: number) => void;
  selectedCalendarId: string;
}

const DURATION_OPTIONS = [
  { label: "30分", value: 30 },
  { label: "1時間", value: 60 },
  { label: "1.5時間", value: 90 },
  { label: "2時間", value: 120 },
];

export function TentativeBatchPanel({
  isActive,
  onClose,
  selectedSlots,
  onRemoveSlot,
  onClearSlots,
  onUpdateSlotTime,
  onSubmit,
  isCreating,
  defaultDuration,
  onSetDuration,
  selectedCalendarId,
}: Props) {
  const [expanded, setExpanded] = useState(true);
  const [summary, setSummary] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [showDetails, setShowDetails] = useState(false);

  if (!isActive) return null;

  const canCreate = summary.trim().length > 0 && selectedSlots.length > 0;

  const handleSubmit = async () => {
    if (!canCreate) return;
    const success = await onSubmit({
      summary: summary.trim(),
      description: description.trim() || undefined,
      location: location.trim() || undefined,
      calendarId: selectedCalendarId,
      slots: selectedSlots,
    });
    if (success) {
      setSummary("");
      setDescription("");
      setLocation("");
    }
  };

  const panel = (
    <div
      className="fixed bottom-0 left-0 right-0 z-[45] pointer-events-none"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <div className="pointer-events-auto mx-auto max-w-lg bg-white border-t border-pink-200 shadow-[0_-4px_20px_rgba(0,0,0,0.1)] rounded-t-2xl">
        {/* Header — always visible */}
        <div
          className="flex items-center justify-between px-4 py-3 cursor-pointer select-none"
          onClick={() => setExpanded(!expanded)}
        >
          <div className="flex items-center gap-2">
            <CalendarPlus size={18} className="text-pink-600" />
            <span className="text-sm font-semibold text-pink-700">
              仮押さえ
            </span>
            {selectedSlots.length > 0 && (
              <span className="bg-pink-100 text-pink-700 text-xs font-bold px-2 py-0.5 rounded-full">
                {selectedSlots.length}件
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {selectedSlots.length > 0 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onClearSlots();
                }}
                className="p-1 text-slate-400 hover:text-red-500 rounded"
                title="全てクリア"
              >
                <Trash2 size={14} />
              </button>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              className="p-1 text-slate-400 hover:text-slate-600 rounded"
            >
              <X size={16} />
            </button>
            {expanded ? (
              <ChevronDown size={16} className="text-slate-400" />
            ) : (
              <ChevronUp size={16} className="text-slate-400" />
            )}
          </div>
        </div>

        {/* Expandable body */}
        {expanded && (
          <div className="px-4 pb-4 max-h-[50vh] overflow-y-auto space-y-3">
            {/* Title input */}
            <input
              type="text"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="タイトル（必須）"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-300 focus:border-pink-300"
              autoFocus
            />

            {/* Details toggle */}
            <button
              onClick={() => setShowDetails(!showDetails)}
              className="text-xs text-slate-500 hover:text-slate-700"
            >
              {showDetails ? "▾ 詳細を隠す" : "▸ 説明・場所を追加"}
            </button>

            {showDetails && (
              <div className="space-y-2">
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="場所"
                  className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-300"
                />
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="説明"
                  rows={2}
                  className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-300 resize-none"
                />
              </div>
            )}

            {/* Duration selector */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 shrink-0">時間幅:</span>
              <div className="flex gap-1 flex-wrap">
                {DURATION_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => onSetDuration(opt.value)}
                    className={`px-2 py-1 text-xs rounded-md transition-colors ${
                      defaultDuration === opt.value
                        ? "bg-pink-100 text-pink-700 font-medium"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Selected slots */}
            {selectedSlots.length === 0 ? (
              <div className="text-center py-4 text-sm text-slate-400">
                カレンダーをタップして候補日時を追加
              </div>
            ) : (
              <div className="space-y-1.5">
                {selectedSlots.map((slot, i) => (
                  <div
                    key={slot.id}
                    className="flex items-center gap-2 bg-pink-50 rounded-lg px-3 py-2"
                  >
                    <span className="text-xs text-pink-400 font-mono w-4">
                      {i + 1}
                    </span>
                    <span className="text-sm text-pink-800 flex-1">
                      {slot.label.split(")")[0]})
                    </span>
                    <input
                      type="time"
                      value={slot.startTime}
                      onChange={(e) =>
                        onUpdateSlotTime(i, e.target.value, slot.endTime)
                      }
                      className="text-xs border border-pink-200 rounded px-1 py-0.5 w-[70px] bg-white"
                    />
                    <span className="text-xs text-pink-400">-</span>
                    <input
                      type="time"
                      value={slot.endTime}
                      onChange={(e) =>
                        onUpdateSlotTime(i, slot.startTime, e.target.value)
                      }
                      className="text-xs border border-pink-200 rounded px-1 py-0.5 w-[70px] bg-white"
                    />
                    <button
                      onClick={() => onRemoveSlot(i)}
                      className="p-1 text-pink-300 hover:text-red-500 rounded"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Create button */}
            <button
              onClick={handleSubmit}
              disabled={!canCreate || isCreating}
              className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                canCreate && !isCreating
                  ? "bg-pink-600 text-white hover:bg-pink-700 active:bg-pink-800"
                  : "bg-slate-200 text-slate-400 cursor-not-allowed"
              }`}
            >
              {isCreating
                ? "作成中..."
                : `一括作成${selectedSlots.length > 0 ? ` (${selectedSlots.length}件)` : ""}`}
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(panel, document.body);
}
