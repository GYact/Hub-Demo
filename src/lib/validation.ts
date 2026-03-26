/**
 * Validation utility functions for input components
 */

export interface ValidationResult {
  isValid: boolean;
  error?: string;
}

/**
 * Email validation
 */
export const validateEmail = (email: string): ValidationResult => {
  if (!email) {
    return { isValid: true }; // Empty is valid (use required prop for mandatory fields)
  }

  // RFC 5322 compliant email regex (simplified)
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!emailRegex.test(email)) {
    return {
      isValid: false,
      error: "Invalid email address",
    };
  }

  return { isValid: true };
};

/**
 * Phone number validation (international format)
 */
export const validatePhoneNumber = (phone: string): ValidationResult => {
  if (!phone) {
    return { isValid: true };
  }

  // Remove common formatting characters
  const cleaned = phone.replace(/[\s\-\(\)\+]/g, "");

  // Check if it contains only digits
  if (!/^\d+$/.test(cleaned)) {
    return {
      isValid: false,
      error: "Phone number should contain only digits",
    };
  }

  // Check length (international phone numbers are typically 7-15 digits)
  if (cleaned.length < 7 || cleaned.length > 15) {
    return {
      isValid: false,
      error: "Phone number should be 7-15 digits",
    };
  }

  return { isValid: true };
};

/**
 * URL validation
 */
export const validateUrl = (url: string): ValidationResult => {
  if (!url) {
    return { isValid: true };
  }

  try {
    const urlObj = new URL(url);

    // Check if protocol is http or https
    if (!["http:", "https:"].includes(urlObj.protocol)) {
      return {
        isValid: false,
        error: "URL must start with http:// or https://",
      };
    }

    return { isValid: true };
  } catch {
    return {
      isValid: false,
      error: "Invalid URL format",
    };
  }
};

/**
 * File validation
 */
export interface FileValidationOptions {
  maxSize?: number; // in bytes
  allowedTypes?: string[]; // MIME types or extensions
  maxFiles?: number;
}

export const validateFile = (
  file: File,
  options: FileValidationOptions = {},
): ValidationResult => {
  const { maxSize, allowedTypes } = options;

  // Check file size
  if (maxSize && file.size > maxSize) {
    const sizeMB = (maxSize / (1024 * 1024)).toFixed(1);
    return {
      isValid: false,
      error: `File size exceeds ${sizeMB}MB limit`,
    };
  }

  // Check file type
  if (allowedTypes && allowedTypes.length > 0) {
    const fileType = file.type;
    const fileExtension = `.${file.name.split(".").pop()?.toLowerCase()}`;

    const isTypeAllowed =
      allowedTypes.includes(fileType) || allowedTypes.includes(fileExtension);

    if (!isTypeAllowed) {
      return {
        isValid: false,
        error: `File type not allowed. Accepted: ${allowedTypes.join(", ")}`,
      };
    }
  }

  return { isValid: true };
};

export const validateFiles = (
  files: File[],
  options: FileValidationOptions = {},
): ValidationResult => {
  const { maxFiles } = options;

  // Check number of files
  if (maxFiles && files.length > maxFiles) {
    return {
      isValid: false,
      error: `Maximum ${maxFiles} file(s) allowed`,
    };
  }

  // Validate each file
  for (const file of files) {
    const result = validateFile(file, options);
    if (!result.isValid) {
      return result;
    }
  }

  return { isValid: true };
};

/**
 * Generic text validation
 */
export interface TextValidationOptions {
  minLength?: number;
  maxLength?: number;
  pattern?: RegExp;
  patternError?: string;
}

export const validateText = (
  text: string,
  options: TextValidationOptions = {},
): ValidationResult => {
  const { minLength, maxLength, pattern, patternError } = options;

  if (minLength && text.length < minLength) {
    return {
      isValid: false,
      error: `Minimum ${minLength} characters required`,
    };
  }

  if (maxLength && text.length > maxLength) {
    return {
      isValid: false,
      error: `Maximum ${maxLength} characters allowed`,
    };
  }

  if (pattern && !pattern.test(text)) {
    return {
      isValid: false,
      error: patternError || "Invalid format",
    };
  }

  return { isValid: true };
};

/**
 * Format file size for display
 */
export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return "0 Bytes";

  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
};
