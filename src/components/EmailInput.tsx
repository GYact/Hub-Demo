import React, { useState, useEffect } from "react";
import { Mail, AlertCircle, Check } from "lucide-react";
import { validateEmail } from "../lib/validation";

interface EmailInputProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  label?: string;
  placeholder?: string;
  required?: boolean;
  autoComplete?: string;
  onBlur?: () => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  showValidation?: boolean; // Show validation feedback
}

export const EmailInput: React.FC<EmailInputProps> = ({
  value,
  onChange,
  disabled = false,
  className = "",
  label,
  placeholder = "email@example.com",
  required = false,
  autoComplete = "email",
  onBlur,
  onKeyDown,
  showValidation = true,
}) => {
  const [touched, setTouched] = useState(false);
  const [validationError, setValidationError] = useState<string | undefined>();

  useEffect(() => {
    if (touched && value) {
      const result = validateEmail(value);
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
          <Mail
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
          type="email"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={onKeyDown}
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
