import React, { useState, useEffect } from "react";
import { Minus, Plus } from "lucide-react";

interface NumberInputProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
  label?: string;
  required?: boolean;
}

export const NumberInput: React.FC<NumberInputProps> = ({
  value,
  onChange,
  min,
  max,
  step = 1,
  disabled = false,
  className = "",
  placeholder,
  label,
  required = false,
}) => {
  // Internal string state allows free-form typing; clamp on blur
  const [draft, setDraft] = useState(String(value));
  const [isFocused, setIsFocused] = useState(false);

  // Sync draft from external value changes while not focused
  useEffect(() => {
    if (!isFocused) {
      setDraft(String(value));
    }
  }, [value, isFocused]);

  const clamp = (v: number) => {
    if (min !== undefined && v < min) return min;
    if (max !== undefined && v > max) return max;
    return v;
  };

  const commitValue = (raw: string) => {
    const parsed = parseFloat(raw);
    if (!isNaN(parsed)) {
      const clamped = clamp(parsed);
      onChange(clamped);
      setDraft(String(clamped));
    } else {
      // Invalid or empty → revert to current value
      setDraft(String(value));
    }
  };

  const handleIncrement = () => {
    const newValue = clamp(value + step);
    onChange(newValue);
  };

  const handleDecrement = () => {
    const newValue = clamp(value - step);
    onChange(newValue);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setDraft(e.target.value);
  };

  const handleBlur = () => {
    setIsFocused(false);
    commitValue(draft);
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    setIsFocused(true);
    e.target.select();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      commitValue(draft);
      (e.target as HTMLInputElement).blur();
    }
  };

  const canDecrement = min === undefined || value > min;
  const canIncrement = max === undefined || value < max;

  return (
    <div className={`space-y-1 ${className}`}>
      {label && (
        <label className="block text-sm font-medium neu-text-secondary">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleDecrement}
          disabled={disabled || !canDecrement}
          className="p-2 neu-btn rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label="Decrease"
        >
          <Minus size={16} />
        </button>
        <input
          type="text"
          inputMode="decimal"
          value={draft}
          onChange={handleInputChange}
          onBlur={handleBlur}
          onFocus={handleFocus}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={placeholder}
          className="flex-1 px-3 py-2 neu-input rounded-lg text-center font-medium"
        />
        <button
          type="button"
          onClick={handleIncrement}
          disabled={disabled || !canIncrement}
          className="p-2 neu-btn rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label="Increase"
        >
          <Plus size={16} />
        </button>
      </div>
      {(min !== undefined || max !== undefined) && (
        <p className="text-xs neu-text-muted">
          {min !== undefined && max !== undefined
            ? `Range: ${min} - ${max}`
            : min !== undefined
              ? `Min: ${min}`
              : `Max: ${max}`}
        </p>
      )}
    </div>
  );
};
