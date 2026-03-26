import React from "react";

interface RangeInputProps {
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  disabled?: boolean;
  className?: string;
  label?: string;
  showValue?: boolean;
  valueFormatter?: (value: number) => string;
  required?: boolean;
}

export const RangeInput: React.FC<RangeInputProps> = ({
  value,
  onChange,
  min,
  max,
  step = 1,
  disabled = false,
  className = "",
  label,
  showValue = true,
  valueFormatter = (val) => val.toString(),
  required = false,
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = parseFloat(e.target.value);
    onChange(newValue);
  };

  const percentage = ((value - min) / (max - min)) * 100;

  return (
    <div className={`space-y-2 ${className}`}>
      {(label || showValue) && (
        <div className="flex items-center justify-between">
          {label && (
            <label className="text-sm font-medium neu-text-secondary">
              {label}
              {required && <span className="text-red-500 ml-1">*</span>}
            </label>
          )}
          {showValue && (
            <span className="text-sm font-semibold neu-text-primary">
              {valueFormatter(value)}
            </span>
          )}
        </div>
      )}
      <div className="relative">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={handleChange}
          disabled={disabled}
          className="w-full h-2 rounded-lg appearance-none cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
          style={{
            background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${percentage}%, #e2e8f0 ${percentage}%, #e2e8f0 100%)`,
          }}
        />
        <style>{`
          input[type="range"]::-webkit-slider-thumb {
            appearance: none;
            width: 20px;
            height: 20px;
            border-radius: 50%;
            background: white;
            border: 2px solid #3b82f6;
            cursor: pointer;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
            transition: all 0.2s;
          }

          input[type="range"]::-webkit-slider-thumb:hover {
            transform: scale(1.1);
            box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
          }

          input[type="range"]::-webkit-slider-thumb:active {
            transform: scale(0.95);
          }

          input[type="range"]::-moz-range-thumb {
            width: 20px;
            height: 20px;
            border-radius: 50%;
            background: white;
            border: 2px solid #3b82f6;
            cursor: pointer;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
            transition: all 0.2s;
          }

          input[type="range"]::-moz-range-thumb:hover {
            transform: scale(1.1);
            box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
          }

          input[type="range"]::-moz-range-thumb:active {
            transform: scale(0.95);
          }

          input[type="range"]:disabled::-webkit-slider-thumb,
          input[type="range"]:disabled::-moz-range-thumb {
            opacity: 0.5;
            cursor: not-allowed;
          }
        `}</style>
      </div>
      <div className="flex justify-between text-xs neu-text-muted">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  );
};
