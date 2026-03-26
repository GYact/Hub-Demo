import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { Clock, X, ChevronUp, ChevronDown } from "lucide-react";

interface TimePickerProps {
  value: string; // HH:mm format
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  disabled?: boolean;
  className?: string;
  label?: string;
  placeholder?: string;
  required?: boolean;
  compact?: boolean;
}

export const TimePicker: React.FC<TimePickerProps> = ({
  value,
  onChange,
  min,
  max,
  disabled = false,
  className = "",
  label,
  placeholder = "Select time",
  required = false,
  compact = false,
}) => {
  const [showPicker, setShowPicker] = useState(false);
  const [hours, setHours] = useState(() => {
    if (value) {
      const [h] = value.split(":");
      return parseInt(h, 10);
    }
    return 0;
  });
  const [minutes, setMinutes] = useState(() => {
    if (value) {
      const [, m] = value.split(":");
      return parseInt(m, 10);
    }
    return 0;
  });
  const containerRef = useRef<HTMLDivElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [pickerPos, setPickerPos] = useState({ top: 0, left: 0, width: 0 });

  useEffect(() => {
    if (showPicker && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const pickerHeight = 340;
      const width = Math.min(window.innerWidth - 16, 256);
      let top = rect.bottom + 4;
      if (top + pickerHeight > window.innerHeight - 16) {
        top = rect.top - pickerHeight - 4;
      }
      // Clamp left so picker doesn't overflow right edge
      let left = rect.left;
      if (left + width > window.innerWidth - 8) {
        left = window.innerWidth - 8 - width;
      }
      setPickerPos({
        top: Math.max(8, top),
        left: Math.max(8, left),
        width,
      });
    }
  }, [showPicker]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        containerRef.current &&
        !containerRef.current.contains(target) &&
        (!pickerRef.current || !pickerRef.current.contains(target))
      ) {
        setShowPicker(false);
      }
    };

    if (showPicker) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showPicker]);

  useEffect(() => {
    if (value) {
      const [h, m] = value.split(":").map((v) => parseInt(v, 10));
      setHours(h);
      setMinutes(m);
    }
  }, [value]);

  const formatDisplayTime = (timeStr: string) => {
    if (!timeStr) return "";
    const [h, m] = timeStr.split(":");
    return `${h.padStart(2, "0")}:${m.padStart(2, "0")}`;
  };

  const isTimeDisabled = (h: number, m: number) => {
    const timeStr = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    if (min && timeStr < min) return true;
    if (max && timeStr > max) return true;
    return false;
  };

  const handleTimeChange = (newHours: number, newMinutes: number) => {
    const timeStr = `${String(newHours).padStart(2, "0")}:${String(newMinutes).padStart(2, "0")}`;

    if (!isTimeDisabled(newHours, newMinutes)) {
      setHours(newHours);
      setMinutes(newMinutes);
      onChange(timeStr);
    }
  };

  const handleHourIncrement = () => {
    const newHours = (hours + 1) % 24;
    handleTimeChange(newHours, minutes);
  };

  const handleHourDecrement = () => {
    const newHours = hours === 0 ? 23 : hours - 1;
    handleTimeChange(newHours, minutes);
  };

  const handleMinuteIncrement = () => {
    const newMinutes = (minutes + 1) % 60;
    const newHours = minutes === 59 ? (hours + 1) % 24 : hours;
    handleTimeChange(newHours, newMinutes);
  };

  const handleMinuteDecrement = () => {
    const newMinutes = minutes === 0 ? 59 : minutes - 1;
    const newHours = minutes === 0 ? (hours === 0 ? 23 : hours - 1) : hours;
    handleTimeChange(newHours, newMinutes);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange("");
    setHours(0);
    setMinutes(0);
    setShowPicker(false);
  };

  return (
    <div className={`space-y-1 ${className}`} ref={containerRef}>
      {label && (
        <label className="block text-sm font-medium neu-text-secondary">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}
      <div className="relative">
        <button
          ref={buttonRef}
          type="button"
          onClick={() => !disabled && setShowPicker(!showPicker)}
          disabled={disabled}
          className={`w-full flex items-center justify-between neu-input rounded-lg text-left disabled:opacity-50 disabled:cursor-not-allowed ${
            compact ? "gap-1 px-2 py-1.5" : "gap-2 px-3 py-2.5 min-h-[44px]"
          }`}
        >
          <span
            className={`font-medium ${value ? "neu-text-primary" : "neu-text-muted"} ${
              compact ? "text-xs" : "text-sm"
            }`}
          >
            {value ? formatDisplayTime(value) : placeholder}
          </span>
          <div
            className={`flex items-center shrink-0 ${compact ? "gap-1" : "gap-1.5"}`}
          >
            {value && !disabled && !compact && (
              <X
                size={16}
                className="neu-text-muted hover:neu-text-primary cursor-pointer"
                onClick={handleClear}
              />
            )}
            <Clock size={compact ? 12 : 16} className="neu-text-muted" />
          </div>
        </button>

        {showPicker &&
          !disabled &&
          createPortal(
            <div
              ref={pickerRef}
              className="fixed z-[200] p-4 bg-white rounded-lg shadow-lg border border-slate-200"
              style={{
                top: pickerPos.top,
                left: pickerPos.left,
                width: pickerPos.width,
              }}
            >
              <div className="flex items-center justify-center gap-4">
                {/* Hours Column */}
                <div className="flex flex-col items-center gap-2">
                  <button
                    type="button"
                    onClick={handleHourIncrement}
                    className="p-1 hover:bg-slate-100 rounded transition-colors"
                    aria-label="Increase hour"
                  >
                    <ChevronUp size={20} />
                  </button>
                  <div className="flex flex-col items-center">
                    <span className="text-xs neu-text-muted mb-1">Hour</span>
                    <div className="w-16 h-12 flex items-center justify-center text-2xl font-semibold neu-text-primary bg-slate-50 rounded-lg">
                      {String(hours).padStart(2, "0")}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleHourDecrement}
                    className="p-1 hover:bg-slate-100 rounded transition-colors"
                    aria-label="Decrease hour"
                  >
                    <ChevronDown size={20} />
                  </button>
                </div>

                {/* Separator */}
                <div className="text-2xl font-semibold neu-text-primary">:</div>

                {/* Minutes Column */}
                <div className="flex flex-col items-center gap-2">
                  <button
                    type="button"
                    onClick={handleMinuteIncrement}
                    className="p-1 hover:bg-slate-100 rounded transition-colors"
                    aria-label="Increase minute"
                  >
                    <ChevronUp size={20} />
                  </button>
                  <div className="flex flex-col items-center">
                    <span className="text-xs neu-text-muted mb-1">Minute</span>
                    <div className="w-16 h-12 flex items-center justify-center text-2xl font-semibold neu-text-primary bg-slate-50 rounded-lg">
                      {String(minutes).padStart(2, "0")}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleMinuteDecrement}
                    className="p-1 hover:bg-slate-100 rounded transition-colors"
                    aria-label="Decrease minute"
                  >
                    <ChevronDown size={20} />
                  </button>
                </div>
              </div>

              {/* Quick Time Buttons */}
              <div className="mt-4 pt-4 border-t border-slate-200">
                <div className="text-xs neu-text-muted mb-2">Quick select</div>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { label: "00:00", h: 0, m: 0 },
                    { label: "06:00", h: 6, m: 0 },
                    { label: "12:00", h: 12, m: 0 },
                    { label: "18:00", h: 18, m: 0 },
                  ].map((time) => (
                    <button
                      key={time.label}
                      type="button"
                      onClick={() => handleTimeChange(time.h, time.m)}
                      disabled={isTimeDisabled(time.h, time.m)}
                      className="px-2 py-1 text-xs rounded hover:bg-slate-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      {time.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Current Time Button */}
              <button
                type="button"
                onClick={() => {
                  const now = new Date();
                  handleTimeChange(now.getHours(), now.getMinutes());
                }}
                className="w-full mt-3 px-3 py-2 text-sm bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-lg transition-colors"
              >
                Current Time
              </button>
            </div>,
            document.body,
          )}
      </div>
    </div>
  );
};
