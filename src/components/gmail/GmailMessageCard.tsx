import React from "react";
import { Star, Archive, Trash2, Paperclip, MessageSquare } from "lucide-react";
import type { ParsedEmail } from "../../types/gmail";
import { formatEmailDate, formatFileSize } from "../../lib/gmailUtils";

interface GmailMessageCardProps {
  email: ParsedEmail;
  onSelect: (email: ParsedEmail) => void;
  onToggleStar: (id: string, isStarred: boolean) => void;
  onArchive: (id: string) => void;
  onTrash: (id: string) => void;
  isSelected?: boolean;
  onToggleSelect?: (id: string) => void;
  threadMessageCount?: number;
}

export const GmailMessageCard: React.FC<GmailMessageCardProps> = ({
  email,
  onSelect,
  onToggleStar,
  onArchive,
  onTrash,
  isSelected,
  onToggleSelect,
  threadMessageCount,
}) => {
  const initials = email.from.name
    ? email.from.name.charAt(0).toUpperCase()
    : email.from.email.charAt(0).toUpperCase();

  const totalAttachmentSize = email.attachments.reduce(
    (sum, a) => sum + a.size,
    0,
  );

  return (
    <div
      className={`neu-card p-4 cursor-pointer transition-all hover:scale-[1.01] ${
        email.isUnread ? "ring-2 ring-red-200" : ""
      }`}
      onClick={() => onSelect(email)}
    >
      <div className="flex items-start gap-3">
        {/* Batch checkbox */}
        {onToggleSelect && (
          <input
            type="checkbox"
            checked={!!isSelected}
            onChange={(e) => {
              e.stopPropagation();
              onToggleSelect(email.id);
            }}
            onClick={(e) => e.stopPropagation()}
            className="mt-3 rounded border-gray-300 text-red-600 focus:ring-red-500 flex-shrink-0"
          />
        )}

        {/* Avatar */}
        <div className="relative w-10 h-10 rounded-full bg-gradient-to-br from-red-400 to-red-600 flex items-center justify-center text-white font-semibold text-sm flex-shrink-0">
          {initials}
          {threadMessageCount && threadMessageCount > 1 && (
            <span className="absolute -bottom-1 -right-1 flex items-center gap-0.5 px-1 py-0.5 bg-gray-600 text-white text-[9px] font-bold rounded-full leading-none">
              <MessageSquare size={8} />
              {threadMessageCount}
            </span>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span
              className={`text-sm truncate ${
                email.isUnread
                  ? "font-bold neu-text-primary"
                  : "neu-text-secondary"
              }`}
            >
              {email.from.name || email.from.email}
            </span>
            <span className="text-xs neu-text-muted flex-shrink-0">
              {formatEmailDate(email.date)}
            </span>
          </div>

          <p
            className={`text-sm truncate mt-0.5 ${
              email.isUnread
                ? "font-semibold neu-text-primary"
                : "neu-text-secondary"
            }`}
          >
            {email.subject}
          </p>

          <p className="text-xs neu-text-muted truncate mt-0.5">
            {email.snippet}
          </p>

          {/* Attachments indicator */}
          {email.attachments.length > 0 && (
            <div className="flex items-center gap-1 mt-1.5">
              <Paperclip size={12} className="neu-text-muted" />
              <span className="text-xs neu-text-muted">
                {email.attachments.length} attachment
                {email.attachments.length > 1 ? "s" : ""}
                {totalAttachmentSize > 0 &&
                  ` (${formatFileSize(totalAttachmentSize)})`}
              </span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleStar(email.id, email.isStarred);
            }}
            className="p-1.5 rounded-lg hover:bg-yellow-100 transition-colors"
            title={email.isStarred ? "Unstar" : "Star"}
          >
            <Star
              size={16}
              className={
                email.isStarred
                  ? "text-yellow-500 fill-yellow-500"
                  : "neu-text-muted"
              }
            />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onArchive(email.id);
            }}
            className="p-1.5 rounded-lg hover:bg-blue-100 transition-colors"
            title="Archive"
          >
            <Archive size={16} className="neu-text-muted" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onTrash(email.id);
            }}
            className="p-1.5 rounded-lg hover:bg-red-100 transition-colors"
            title="Trash"
          >
            <Trash2 size={16} className="neu-text-muted" />
          </button>
        </div>
      </div>
    </div>
  );
};
