import React, { useState } from "react";
import DOMPurify from "dompurify";
import {
  ArrowLeft,
  Reply,
  ReplyAll,
  Forward,
  Star,
  Archive,
  Trash2,
  Paperclip,
  Download,
  Mail,
  MailOpen,
  Eye,
} from "lucide-react";
import type {
  ParsedEmail,
  ComposeMode,
  EmailAttachment,
} from "../../types/gmail";
import { formatFileSize, isPreviewableMimeType } from "../../lib/gmailUtils";
import { AttachmentPreview } from "./AttachmentPreview";

interface GmailMessageDetailProps {
  email: ParsedEmail;
  onBack: () => void;
  onReply: (mode: ComposeMode) => void;
  onToggleStar: (id: string, isStarred: boolean) => void;
  onArchive: (id: string) => void;
  onTrash: (id: string) => void;
  onToggleRead: (id: string, isUnread: boolean) => void;
  onDownloadAttachment: (
    messageId: string,
    attachmentId: string,
    filename: string,
  ) => void;
  onGetAttachmentBlobUrl?: (
    messageId: string,
    attachmentId: string,
    mimeType: string,
  ) => Promise<string | null>;
}

// NOTE: HTML email content is sanitized with DOMPurify.sanitize() before rendering.
// This is safe because DOMPurify strips all dangerous tags, attributes, and scripts.

export const GmailMessageDetail: React.FC<GmailMessageDetailProps> = ({
  email,
  onBack,
  onReply,
  onToggleStar,
  onArchive,
  onTrash,
  onToggleRead,
  onDownloadAttachment,
  onGetAttachmentBlobUrl,
}) => {
  const [previewAttachment, setPreviewAttachment] =
    useState<EmailAttachment | null>(null);
  const formattedDate = new Date(email.date).toLocaleString();

  // Sanitize HTML content using DOMPurify to prevent XSS
  const sanitizedHtml = email.bodyHtml
    ? DOMPurify.sanitize(email.bodyHtml, {
        ALLOWED_TAGS: [
          "a",
          "b",
          "i",
          "u",
          "em",
          "strong",
          "p",
          "br",
          "div",
          "span",
          "ul",
          "ol",
          "li",
          "h1",
          "h2",
          "h3",
          "h4",
          "h5",
          "h6",
          "table",
          "thead",
          "tbody",
          "tr",
          "td",
          "th",
          "img",
          "blockquote",
          "pre",
          "code",
          "hr",
          "font",
          "center",
          "small",
          "sub",
          "sup",
        ],
        ALLOWED_ATTR: [
          "href",
          "src",
          "alt",
          "title",
          "style",
          "class",
          "width",
          "height",
          "target",
          "color",
          "size",
          "face",
          "align",
          "valign",
          "bgcolor",
          "border",
          "cellpadding",
          "cellspacing",
          "colspan",
          "rowspan",
        ],
        ALLOW_DATA_ATTR: false,
      })
    : null;

  return (
    <div className="space-y-4">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <button
          onClick={onBack}
          className="flex items-center gap-2 px-3 py-2 neu-btn rounded-lg text-sm font-medium"
        >
          <ArrowLeft size={16} />
          Back
        </button>

        <div className="flex items-center gap-1">
          <button
            onClick={() => onReply("reply")}
            className="p-2 neu-btn rounded-lg"
            title="Reply"
          >
            <Reply size={16} />
          </button>
          <button
            onClick={() => onReply("replyAll")}
            className="p-2 neu-btn rounded-lg"
            title="Reply All"
          >
            <ReplyAll size={16} />
          </button>
          <button
            onClick={() => onReply("forward")}
            className="p-2 neu-btn rounded-lg"
            title="Forward"
          >
            <Forward size={16} />
          </button>
          <div className="w-px h-6 bg-gray-300 mx-1" />
          <button
            onClick={() => onToggleStar(email.id, email.isStarred)}
            className="p-2 neu-btn rounded-lg"
            title={email.isStarred ? "Unstar" : "Star"}
          >
            <Star
              size={16}
              className={
                email.isStarred ? "text-yellow-500 fill-yellow-500" : undefined
              }
            />
          </button>
          <button
            onClick={() => onToggleRead(email.id, email.isUnread)}
            className="p-2 neu-btn rounded-lg"
            title={email.isUnread ? "Mark as read" : "Mark as unread"}
          >
            {email.isUnread ? <MailOpen size={16} /> : <Mail size={16} />}
          </button>
          <button
            onClick={() => onArchive(email.id)}
            className="p-2 neu-btn rounded-lg"
            title="Archive"
          >
            <Archive size={16} />
          </button>
          <button
            onClick={() => onTrash(email.id)}
            className="p-2 neu-btn rounded-lg"
            title="Trash"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      {/* Email content */}
      <div className="neu-card p-6">
        {/* Subject */}
        <h2 className="text-lg font-bold neu-text-primary mb-4">
          {email.subject}
        </h2>

        {/* Sender/Recipients */}
        <div className="space-y-1 mb-4 pb-4 border-b border-gray-200">
          <div className="flex items-start gap-2">
            <span className="text-sm font-medium neu-text-muted w-12 flex-shrink-0">
              From:
            </span>
            <span className="text-sm neu-text-primary">
              {email.from.name}{" "}
              <span className="neu-text-muted">&lt;{email.from.email}&gt;</span>
            </span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-sm font-medium neu-text-muted w-12 flex-shrink-0">
              To:
            </span>
            <span className="text-sm neu-text-secondary">
              {email.to.map((a) => a.name || a.email).join(", ")}
            </span>
          </div>
          {email.cc.length > 0 && (
            <div className="flex items-start gap-2">
              <span className="text-sm font-medium neu-text-muted w-12 flex-shrink-0">
                Cc:
              </span>
              <span className="text-sm neu-text-secondary">
                {email.cc.map((a) => a.name || a.email).join(", ")}
              </span>
            </div>
          )}
          <div className="flex items-start gap-2">
            <span className="text-sm font-medium neu-text-muted w-12 flex-shrink-0">
              Date:
            </span>
            <span className="text-sm neu-text-secondary">{formattedDate}</span>
          </div>
        </div>

        {/* Body - HTML content is sanitized with DOMPurify above */}
        <div className="email-body">
          {sanitizedHtml ? (
            <div
              className="prose prose-sm max-w-none break-words overflow-x-auto [&_*]:max-w-full [&_img]:max-w-full [&_img]:h-auto"
              dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
            />
          ) : (
            <pre className="text-sm neu-text-primary whitespace-pre-wrap font-sans leading-relaxed">
              {email.bodyText || "(No content)"}
            </pre>
          )}
        </div>

        {/* Attachments */}
        {email.attachments.length > 0 && (
          <div className="mt-6 pt-4 border-t border-gray-200">
            <div className="flex items-center gap-2 mb-3">
              <Paperclip size={16} className="neu-text-muted" />
              <span className="text-sm font-medium neu-text-secondary">
                {email.attachments.length} Attachment
                {email.attachments.length > 1 ? "s" : ""}
              </span>
            </div>
            <div className="grid gap-2">
              {email.attachments.map((att) => (
                <div
                  key={att.id}
                  className="flex items-center justify-between gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Paperclip
                      size={14}
                      className="neu-text-muted flex-shrink-0"
                    />
                    <span className="text-sm neu-text-primary truncate">
                      {att.filename}
                    </span>
                    <span className="text-xs neu-text-muted flex-shrink-0">
                      ({formatFileSize(att.size)})
                    </span>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {onGetAttachmentBlobUrl &&
                      isPreviewableMimeType(att.mimeType) && (
                        <button
                          onClick={() => setPreviewAttachment(att)}
                          className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 rounded transition-colors"
                        >
                          <Eye size={14} />
                          Preview
                        </button>
                      )}
                    <button
                      onClick={() =>
                        onDownloadAttachment(
                          att.messageId,
                          att.id,
                          att.filename,
                        )
                      }
                      className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 rounded transition-colors"
                    >
                      <Download size={14} />
                      Download
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Attachment Preview Modal */}
      {previewAttachment && onGetAttachmentBlobUrl && (
        <AttachmentPreview
          attachment={previewAttachment}
          onGetBlobUrl={onGetAttachmentBlobUrl}
          onDownload={onDownloadAttachment}
          onClose={() => setPreviewAttachment(null)}
        />
      )}
    </div>
  );
};
