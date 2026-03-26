import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, Download, Loader2 } from "lucide-react";
import type { EmailAttachment } from "../../types/gmail";
import {
  isImageMimeType,
  isPdfMimeType,
  formatFileSize,
} from "../../lib/gmailUtils";

interface AttachmentPreviewProps {
  attachment: EmailAttachment;
  onGetBlobUrl: (
    messageId: string,
    attachmentId: string,
    mimeType: string,
  ) => Promise<string | null>;
  onDownload: (
    messageId: string,
    attachmentId: string,
    filename: string,
  ) => void;
  onClose: () => void;
}

export const AttachmentPreview: React.FC<AttachmentPreviewProps> = ({
  attachment,
  onGetBlobUrl,
  onDownload,
  onClose,
}) => {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setIsLoading(true);
      const url = await onGetBlobUrl(
        attachment.messageId,
        attachment.id,
        attachment.mimeType,
      );
      if (!cancelled) {
        setBlobUrl(url);
        setIsLoading(false);
      }
    };

    load();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attachment.id, attachment.messageId, attachment.mimeType]);

  // Cleanup blob URL on unmount
  useEffect(() => {
    return () => {
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
      }
    };
  }, [blobUrl]);

  const isImage = isImageMimeType(attachment.mimeType);
  const isPdf = isPdfMimeType(attachment.mimeType);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative w-full max-w-4xl max-h-[90vh] neu-card rounded-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-gray-200">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-sm font-medium neu-text-primary truncate">
              {attachment.filename}
            </span>
            <span className="text-xs neu-text-muted flex-shrink-0">
              ({formatFileSize(attachment.size)})
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() =>
                onDownload(
                  attachment.messageId,
                  attachment.id,
                  attachment.filename,
                )
              }
              className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            >
              <Download size={14} />
              Download
            </button>
            <button onClick={onClose} className="p-2 neu-btn rounded-lg">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto flex items-center justify-center p-4 bg-gray-50">
          {isLoading ? (
            <div className="flex items-center gap-2 text-sm neu-text-muted">
              <Loader2 size={20} className="animate-spin" />
              Loading preview...
            </div>
          ) : !blobUrl ? (
            <p className="text-sm neu-text-muted">Preview not available</p>
          ) : isImage ? (
            <img
              src={blobUrl}
              alt={attachment.filename}
              className="max-w-full max-h-[70vh] object-contain rounded-lg shadow-lg"
            />
          ) : isPdf ? (
            <iframe
              src={blobUrl}
              title={attachment.filename}
              className="w-full h-[70vh] rounded-lg border border-gray-200"
            />
          ) : (
            <p className="text-sm neu-text-muted">
              Preview not available for this file type
            </p>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
};
