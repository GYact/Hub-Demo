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
  ChevronDown,
  ChevronUp,
  Paperclip,
  Download,
} from "lucide-react";
import type { GmailThread, ParsedEmail, ComposeMode } from "../../types/gmail";
import { formatEmailDate, formatFileSize } from "../../lib/gmailUtils";

interface ThreadViewProps {
  thread: GmailThread;
  onBack: () => void;
  onReply: (mode: ComposeMode, message: ParsedEmail) => void;
  onToggleStar: (id: string, isStarred: boolean) => void;
  onArchive: (id: string) => void;
  onTrash: (id: string) => void;
  onDownloadAttachment: (
    messageId: string,
    attachmentId: string,
    filename: string,
  ) => void;
}

// NOTE: HTML email content is sanitized with DOMPurify.sanitize() before rendering.
// This is safe because DOMPurify strips all dangerous tags, attributes, and scripts.

const MessageItem: React.FC<{
  message: ParsedEmail;
  isExpanded: boolean;
  onToggle: () => void;
  onReply: (mode: ComposeMode, message: ParsedEmail) => void;
  onDownloadAttachment: (
    messageId: string,
    attachmentId: string,
    filename: string,
  ) => void;
}> = ({ message, isExpanded, onToggle, onReply, onDownloadAttachment }) => {
  const sanitizedHtml = message.bodyHtml
    ? DOMPurify.sanitize(message.bodyHtml, {
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

  const initials = message.from.name
    ? message.from.name.charAt(0).toUpperCase()
    : message.from.email.charAt(0).toUpperCase();

  return (
    <div className="neu-card overflow-hidden">
      {/* Collapsed header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 p-4 text-left hover:bg-gray-50 transition-colors"
      >
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-red-400 to-red-600 flex items-center justify-center text-white font-semibold text-xs flex-shrink-0">
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium neu-text-primary truncate">
              {message.from.name || message.from.email}
            </span>
            <span className="text-xs neu-text-muted flex-shrink-0">
              {formatEmailDate(message.date)}
            </span>
          </div>
          {!isExpanded && (
            <p className="text-xs neu-text-muted truncate mt-0.5">
              {message.snippet}
            </p>
          )}
        </div>
        {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="px-4 pb-4">
          {/* Recipients */}
          <div className="text-xs neu-text-muted mb-3 space-y-0.5">
            <div>To: {message.to.map((a) => a.name || a.email).join(", ")}</div>
            {message.cc.length > 0 && (
              <div>
                Cc: {message.cc.map((a) => a.name || a.email).join(", ")}
              </div>
            )}
          </div>

          {/* Body - HTML content is sanitized with DOMPurify above */}
          <div className="email-body mb-3">
            {sanitizedHtml ? (
              <div
                className="prose prose-sm max-w-none break-words overflow-x-auto [&_*]:max-w-full [&_img]:max-w-full [&_img]:h-auto"
                dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
              />
            ) : (
              <pre className="text-sm neu-text-primary whitespace-pre-wrap font-sans leading-relaxed">
                {message.bodyText || "(No content)"}
              </pre>
            )}
          </div>

          {/* Attachments */}
          {message.attachments.length > 0 && (
            <div className="border-t border-gray-200 pt-3 mb-3">
              <div className="flex items-center gap-1.5 mb-2">
                <Paperclip size={12} className="neu-text-muted" />
                <span className="text-xs font-medium neu-text-secondary">
                  {message.attachments.length} attachment
                  {message.attachments.length > 1 ? "s" : ""}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {message.attachments.map((att) => (
                  <button
                    key={att.id}
                    onClick={() =>
                      onDownloadAttachment(att.messageId, att.id, att.filename)
                    }
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-gray-50 hover:bg-gray-100 text-xs transition-colors"
                  >
                    <Download size={12} className="neu-text-muted" />
                    <span className="truncate max-w-[150px]">
                      {att.filename}
                    </span>
                    <span className="neu-text-muted">
                      ({formatFileSize(att.size)})
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Quick actions */}
          <div className="flex items-center gap-1 pt-2 border-t border-gray-200">
            <button
              onClick={() => onReply("reply", message)}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs neu-btn rounded-lg"
            >
              <Reply size={12} /> Reply
            </button>
            <button
              onClick={() => onReply("replyAll", message)}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs neu-btn rounded-lg"
            >
              <ReplyAll size={12} /> Reply All
            </button>
            <button
              onClick={() => onReply("forward", message)}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs neu-btn rounded-lg"
            >
              <Forward size={12} /> Forward
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export const ThreadView: React.FC<ThreadViewProps> = ({
  thread,
  onBack,
  onReply,
  onToggleStar,
  onArchive,
  onTrash,
  onDownloadAttachment,
}) => {
  // Expand last message by default
  const [expandedIds, setExpandedIds] = useState<Set<string>>(
    new Set(
      thread.messages.length > 0
        ? [thread.messages[thread.messages.length - 1].id]
        : [],
    ),
  );

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <div className="space-y-4">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-2 md:gap-4 flex-wrap">
        <button
          onClick={onBack}
          className="flex items-center gap-2 px-3 py-2 neu-btn rounded-lg text-sm font-medium"
        >
          <ArrowLeft size={16} />
          Back
        </button>

        <div className="flex items-center gap-1">
          <button
            onClick={() => onToggleStar(thread.id, thread.isStarred)}
            className="p-2 neu-btn rounded-lg"
            title={thread.isStarred ? "Unstar" : "Star"}
          >
            <Star
              size={16}
              className={
                thread.isStarred ? "text-yellow-500 fill-yellow-500" : undefined
              }
            />
          </button>
          <button
            onClick={() => onArchive(thread.id)}
            className="p-2 neu-btn rounded-lg"
            title="Archive"
          >
            <Archive size={16} />
          </button>
          <button
            onClick={() => onTrash(thread.id)}
            className="p-2 neu-btn rounded-lg"
            title="Trash"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      {/* Subject */}
      <h2 className="text-base md:text-lg font-bold neu-text-primary">
        {thread.subject}
        <span className="ml-2 text-sm font-normal neu-text-muted">
          ({thread.messageCount} messages)
        </span>
      </h2>

      {/* Messages */}
      <div className="space-y-2">
        {thread.messages.map((msg) => (
          <MessageItem
            key={msg.id}
            message={msg}
            isExpanded={expandedIds.has(msg.id)}
            onToggle={() => toggleExpanded(msg.id)}
            onReply={onReply}
            onDownloadAttachment={onDownloadAttachment}
          />
        ))}
      </div>
    </div>
  );
};
