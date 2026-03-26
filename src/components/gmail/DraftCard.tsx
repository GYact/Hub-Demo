import React from "react";
import { FileText, Trash2, Send } from "lucide-react";
import type { GmailDraft } from "../../types/gmail";
import { formatEmailDate } from "../../lib/gmailUtils";

interface DraftCardProps {
  draft: GmailDraft;
  onEdit: (draft: GmailDraft) => void;
  onDelete: (draftId: string) => void;
  onSend: (draftId: string) => void;
}

export const DraftCard: React.FC<DraftCardProps> = ({
  draft,
  onEdit,
  onDelete,
  onSend,
}) => {
  const msg = draft.message;
  const recipients = msg.to.map((a) => a.name || a.email).join(", ");

  return (
    <div
      className="neu-card p-4 cursor-pointer transition-all hover:scale-[1.01]"
      onClick={() => onEdit(draft)}
    >
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-gray-300 to-gray-500 flex items-center justify-center text-white flex-shrink-0">
          <FileText size={18} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm neu-text-secondary truncate">
              {recipients || "(No recipients)"}
            </span>
            <span className="text-xs neu-text-muted flex-shrink-0">
              {formatEmailDate(msg.date)}
            </span>
          </div>
          <p className="text-sm neu-text-primary truncate mt-0.5">
            {msg.subject || "(No subject)"}
          </p>
          <p className="text-xs neu-text-muted truncate mt-0.5">
            {msg.snippet}
          </p>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onSend(draft.id);
            }}
            className="p-1.5 rounded-lg hover:bg-green-100 transition-colors"
            title="Send"
          >
            <Send size={16} className="text-green-600" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(draft.id);
            }}
            className="p-1.5 rounded-lg hover:bg-red-100 transition-colors"
            title="Delete draft"
          >
            <Trash2 size={16} className="neu-text-muted" />
          </button>
        </div>
      </div>
    </div>
  );
};
