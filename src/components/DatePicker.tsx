import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { Calendar, X, ChevronLeft, ChevronRight } from "lucide-react";

interface DatePickerProps {
  value: string; // YYYY-MM-DD format
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  disabled?: boolean;
  className?: string;
  label?: string;
  placeholder?: string;
  required?: boolean;
}

export const DatePicker: React.FC<DatePickerProps> = ({
  value,
  onChange,
  min,
  max,
  disabled = false,
  className = "",
  label,
  placeholder = "Select date",
  required = false,
}) => {
  const [showCalendar, setShowCalendar] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(() => {
    if (value) {
      const date = new Date(value + "T00:00:00");
      return new Date(date.getFullYear(), date.getMonth(), 1);
    }
    return new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  });
  const containerRef = useRef<HTMLDivElement>(null);
  const calendarRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [calendarPos, setCalendarPos] = useState({ top: 0, left: 0, width: 0 });

  useEffect(() => {
    if (showCalendar && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const calendarHeight = 320;
      const width = Math.min(window.innerWidth - 16, 288);
      let top = rect.bottom + 4;
      if (top + calendarHeight > window.innerHeight - 16) {
        top = rect.top - calendarHeight - 4;
      }
      // Clamp left so calendar doesn't overflow right edge
      let left = rect.left;
      if (left + width > window.innerWidth - 8) {
        left = window.innerWidth - 8 - width;
      }
      setCalendarPos({
        top: Math.max(8, top),
        left: Math.max(8, left),
        width,
      });
    }
  }, [showCalendar]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        containerRef.current &&
        !containerRef.current.contains(target) &&
        (!calendarRef.current || !calendarRef.current.contains(target))
      ) {
        setShowCalendar(false);
      }
    };

    if (showCalendar) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showCalendar]);

  const formatDisplayDate = (dateStr: string) => {
    if (!dateStr) return "";
    const date = new Date(dateStr + "T00:00:00");
    const now = new Date();
    const month = date.toLocaleDateString("en-US", { month: "short" });
    const day = date.getDate();
    if (date.getFullYear() === now.getFullYear()) {
      return `${month} ${day}`;
    }
    return `${month} ${day}, '${String(date.getFullYear()).slice(-2)}`;
  };

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    const days: (number | null)[] = [];

    // Add empty cells for days before the first day
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(null);
    }

    // Add days of the month
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(i);
    }

    return days;
  };

  const handleDayClick = (day: number) => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

    // Check min/max constraints
    if (min && dateStr < min) return;
    if (max && dateStr > max) return;

    onChange(dateStr);
    setShowCalendar(false);
  };

  const handlePrevMonth = () => {
    setCurrentMonth(
      new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1),
    );
  };

  const handleNextMonth = () => {
    setCurrentMonth(
      new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1),
    );
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange("");
    setShowCalendar(false);
  };

  const isDateDisabled = (day: number) => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

    if (min && dateStr < min) return true;
    if (max && dateStr > max) return true;
    return false;
  };

  const isToday = (day: number) => {
    const today = new Date();
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    return (
      day === today.getDate() &&
      month === today.getMonth() &&
      year === today.getFullYear()
    );
  };

  const isSelected = (day: number) => {
    if (!value) return false;
    const selectedDate = new Date(value + "T00:00:00");
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    return (
      day === selectedDate.getDate() &&
      month === selectedDate.getMonth() &&
      year === selectedDate.getFullYear()
    );
  };

  const days = getDaysInMonth(currentMonth);
  const weekDays = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

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
          onClick={() => !disabled && setShowCalendar(!showCalendar)}
          disabled={disabled}
          className="w-full flex items-center justify-between gap-2 px-3 py-2.5 neu-input rounded-lg text-left disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
        >
          <span
            className={`text-sm font-medium ${value ? "neu-text-primary" : "neu-text-muted"}`}
          >
            {value ? formatDisplayDate(value) : placeholder}
          </span>
          <div className="flex items-center gap-1.5 shrink-0">
            {value && !disabled && (
              <X
                size={16}
                className="neu-text-muted hover:neu-text-primary cursor-pointer"
                onClick={handleClear}
              />
            )}
            <Calendar size={16} className="neu-text-muted" />
          </div>
        </button>

        {showCalendar &&
          !disabled &&
          createPortal(
            <div
              ref={calendarRef}
              className="fixed z-[200] p-3 bg-white rounded-lg shadow-lg border border-slate-200"
              style={{
                top: calendarPos.top,
                left: calendarPos.left,
                width: calendarPos.width,
              }}
            >
              <div className="flex items-center justify-between mb-3">
                <button
                  type="button"
                  onClick={handlePrevMonth}
                  className="neu-btn p-1.5 rounded-lg neu-text-secondary transition-colors"
                >
                  <ChevronLeft size={16} />
                </button>
                <span className="text-sm font-semibold neu-text-primary">
                  {currentMonth.toLocaleDateString("en-US", {
                    month: "long",
                    year: "numeric",
                  })}
                </span>
                <button
                  type="button"
                  onClick={handleNextMonth}
                  className="neu-btn p-1.5 rounded-lg neu-text-secondary transition-colors"
                >
                  <ChevronRight size={16} />
                </button>
              </div>

              <div className="grid grid-cols-7 gap-1 mb-2">
                {weekDays.map((day) => (
                  <div
                    key={day}
                    className="text-center text-xs font-medium neu-text-muted py-1"
                  >
                    {day}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-1">
                {days.map((day, index) => (
                  <button
                    key={index}
                    type="button"
                    onClick={() => day && handleDayClick(day)}
                    disabled={day === null || isDateDisabled(day)}
                    className={`
                    p-2 text-sm rounded transition-colors
                    ${day === null ? "invisible" : ""}
                    ${day !== null && isSelected(day) ? "bg-blue-600 text-white font-semibold" : ""}
                    ${day !== null && !isSelected(day) && isToday(day) ? "bg-blue-50 text-blue-600 font-semibold" : ""}
                    ${day !== null && !isSelected(day) && !isToday(day) ? "hover:bg-slate-100" : ""}
                    ${day !== null && isDateDisabled(day) ? "opacity-30 cursor-not-allowed" : ""}
                  `}
                  >
                    {day}
                  </button>
                ))}
              </div>
            </div>,
            document.body,
          )}
      </div>
    </div>
  );
};
