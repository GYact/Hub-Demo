import { useState } from "react";
import {
  Trash2,
  ChevronDown,
  ChevronUp,
  GripVertical,
  Laptop,
} from "lucide-react";
import type { Device } from "../../types";

export const DeviceCard = ({
  device,
  onUpdate,
  onDelete,
  dragHandleProps,
}: {
  device: Device;
  onUpdate: (id: string, updates: Partial<Device>) => void;
  onDelete: (id: string) => void;
  dragHandleProps?: React.HTMLAttributes<HTMLDivElement>;
}) => {
  const [isExpanded, setIsExpanded] = useState(!device.name);

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
            <Laptop size={16} className="md:w-5 md:h-5 neu-text-secondary" />
          </div>
          <div className="flex-1 min-w-0">
            <input
              type="text"
              value={device.name}
              onChange={(e) => onUpdate(device.id, { name: e.target.value })}
              placeholder="Device name..."
              className="w-full text-base md:text-lg font-semibold neu-text-primary bg-transparent border-none outline-none placeholder:neu-text-muted focus:ring-0"
            />

            {!isExpanded && device.description && (
              <p className="mt-1 text-xs md:text-sm neu-text-secondary line-clamp-1">
                {device.description}
              </p>
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
              onClick={() => onDelete(device.id)}
              className="p-1.5 md:p-2 neu-text-muted hover:text-red-500 neu-btn"
              title="Delete"
            >
              <Trash2 size={16} className="md:w-[18px] md:h-[18px]" />
            </button>
          </div>
        </div>

        {/* Expanded content */}
        {isExpanded && (
          <textarea
            value={device.description}
            onChange={(e) =>
              onUpdate(device.id, { description: e.target.value })
            }
            placeholder="Description..."
            rows={3}
            className="w-full mt-3 text-base md:text-sm neu-text-secondary neu-input px-2.5 md:px-3 py-2 resize-y min-h-[60px] md:min-h-[80px]"
          />
        )}
      </div>
    </div>
  );
};
