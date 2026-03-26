import React, { useState, useEffect } from "react";
import { Phone, AlertCircle, Check } from "lucide-react";
import { validatePhoneNumber } from "../lib/validation";

interface TelInputProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  label?: string;
  placeholder?: string;
  required?: boolean;
  autoComplete?: string;
  onBlur?: () => void;
  showValidation?: boolean;
}

export const TelInput: React.FC<TelInputProps> = ({
  value,
  onChange,
  disabled = false,
  className = "",
  label,
  placeholder = "+1 (555) 123-4567",
  required = false,
  autoComplete = "tel",
  onBlur,
  showValidation = true,
}) => {
  const [touched, setTouched] = useState(false);
  const [validationError, setValidationError] = useState<string | undefined>();

  useEffect(() => {
    if (touched && value) {
      const result = validatePhoneNumber(value);
      setValidationError(result.error);
    } else {
      setValidationError(undefined);
    }
  }, [value, touched]);

  const handleBlur = () => {
    setTouched(true);
    onBlur?.();
  };

  const isValid = !validationError && value.length > 0;
  const showError = touched && validationError;
  const showSuccess = touched && isValid && showValidation;

  return (
    <div className={`space-y-1 ${className}`}>
      {label && (
        <label className="block text-sm font-medium neu-text-secondary">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}
      <div className="relative">
        <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
          <Phone
            size={16}
            className={
              showError
                ? "text-red-500"
                : showSuccess
                  ? "text-green-500"
                  : "neu-text-muted"
            }
          />
        </div>
        <input
          type="tel"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={handleBlur}
          disabled={disabled}
          placeholder={placeholder}
          autoComplete={autoComplete}
          required={required}
          className={`w-full pl-10 pr-10 py-2 neu-input rounded-lg transition-colors ${
            showError
              ? "border-red-300 focus:border-red-500"
              : showSuccess
                ? "border-green-300 focus:border-green-500"
                : ""
          } disabled:opacity-50 disabled:cursor-not-allowed`}
        />
        {showValidation && touched && value && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
            {showError ? (
              <AlertCircle size={16} className="text-red-500" />
            ) : (
              isValid && <Check size={16} className="text-green-500" />
            )}
          </div>
        )}
      </div>
      {showError && (
        <p className="text-xs text-red-600 flex items-center gap-1">
          <AlertCircle size={12} />
          {validationError}
        </p>
      )}
    </div>
  );
};
