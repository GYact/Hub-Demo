import React, { useState, useRef, useCallback } from "react";
import {
  Upload,
  X,
  File as FileIcon,
  Image as ImageIcon,
  FileText,
  Film,
  Music,
  AlertCircle,
} from "lucide-react";
import {
  validateFiles,
  formatFileSize,
  type FileValidationOptions,
} from "../lib/validation";

interface FileUploadProps {
  value: File[];
  onChange: (files: File[]) => void;
  disabled?: boolean;
  className?: string;
  label?: string;
  accept?: string; // e.g., "image/*,.pdf"
  multiple?: boolean;
  maxSize?: number; // in bytes
  maxFiles?: number;
  required?: boolean;
  showPreview?: boolean;
}

export const FileUpload: React.FC<FileUploadProps> = ({
  value,
  onChange,
  disabled = false,
  className = "",
  label,
  accept,
  multiple = false,
  maxSize,
  maxFiles = multiple ? 10 : 1,
  required = false,
  showPreview = true,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const inputRef = useRef<HTMLInputElement>(null);

  const validationOptions: FileValidationOptions = {
    maxSize,
    maxFiles,
    allowedTypes: accept?.split(",").map((type) => type.trim()),
  };

  const validateAndSetFiles = useCallback(
    (files: File[]) => {
      setError(undefined);

      const validation = validateFiles(files, validationOptions);
      if (!validation.isValid) {
        setError(validation.error);
        return;
      }

      onChange(files);
    },
    [onChange, validationOptions],
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      validateAndSetFiles(files);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    if (disabled) return;

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      validateAndSetFiles(files);
    }
  };

  const handleRemove = (index: number) => {
    const newFiles = value.filter((_, i) => i !== index);
    onChange(newFiles);
    setError(undefined);
  };

  const handleClick = () => {
    if (!disabled) {
      inputRef.current?.click();
    }
  };

  const getFileIcon = (file: File) => {
    const type = file.type;
    if (type.startsWith("image/")) return <ImageIcon size={20} />;
    if (type.startsWith("video/")) return <Film size={20} />;
    if (type.startsWith("audio/")) return <Music size={20} />;
    if (type.includes("pdf") || type.includes("text"))
      return <FileText size={20} />;
    return <FileIcon size={20} />;
  };

  const getImagePreview = (file: File) => {
    if (file.type.startsWith("image/")) {
      return URL.createObjectURL(file);
    }
    return null;
  };

  return (
    <div className={`space-y-2 ${className}`}>
      {label && (
        <label className="block text-sm font-medium neu-text-secondary">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}

      <div
        onClick={handleClick}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`
          relative border-2 border-dashed rounded-lg p-4 md:p-6 transition-all cursor-pointer
          ${isDragging ? "border-blue-500 bg-blue-50" : "border-slate-300 hover:border-slate-400"}
          ${disabled ? "opacity-50 cursor-not-allowed" : ""}
          ${error ? "border-red-300 bg-red-50" : ""}
        `}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          onChange={handleFileChange}
          disabled={disabled}
          required={required}
          className="hidden"
        />

        <div className="flex flex-col items-center gap-2 text-center">
          <div
            className={`p-3 rounded-full ${isDragging ? "bg-blue-100" : "bg-slate-100"}`}
          >
            <Upload
              size={24}
              className={isDragging ? "text-blue-600" : "neu-text-muted"}
            />
          </div>
          <div>
            <p className="text-sm font-medium neu-text-primary">
              {isDragging
                ? "Drop files here"
                : "Click to upload or drag and drop"}
            </p>
            <p className="text-xs neu-text-muted mt-1">
              {accept && `Accepted: ${accept}`}
              {maxSize && ` • Max size: ${formatFileSize(maxSize)}`}
              {multiple && maxFiles && ` • Max ${maxFiles} file(s)`}
            </p>
          </div>
        </div>
      </div>

      {error && (
        <p className="text-xs text-red-600 flex items-center gap-1">
          <AlertCircle size={12} />
          {error}
        </p>
      )}

      {value.length > 0 && showPreview && (
        <div className="space-y-2">
          {value.map((file, index) => {
            const preview = getImagePreview(file);
            return (
              <div
                key={index}
                className="flex items-center gap-3 p-3 neu-card rounded-lg"
              >
                {preview ? (
                  <img
                    src={preview}
                    alt={file.name}
                    className="w-12 h-12 object-cover rounded"
                  />
                ) : (
                  <div className="w-12 h-12 flex items-center justify-center neu-flat rounded">
                    {getFileIcon(file)}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium neu-text-primary truncate">
                    {file.name}
                  </p>
                  <p className="text-xs neu-text-muted">
                    {formatFileSize(file.size)}
                  </p>
                </div>
                {!disabled && (
                  <button
                    type="button"
                    onClick={() => handleRemove(index)}
                    className="p-1.5 hover:bg-slate-100 rounded transition-colors"
                    aria-label="Remove file"
                  >
                    <X size={16} className="neu-text-muted" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
