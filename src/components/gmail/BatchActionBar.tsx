import React from "react";
import { Archive, Trash2, Mail, MailOpen, X } from "lucide-react";

interface BatchActionBarProps {
  selectedCount: number;
  onArchive: () => void;
  onTrash: () => void;
  onMarkAsRead: () => void;
  onMarkAsUnread: () => void;
  onClearSelection: () => void;
}

export const BatchActionBar: React.FC<BatchActionBarProps> = ({
  selectedCount,
  onArchive,
  onTrash,
  onMarkAsRead,
  onMarkAsUnread,
  onClearSelection,
}) => {
  if (selectedCount === 0) return null;

  return (
    <div className="flex items-center gap-2 p-3 neu-card rounded-xl animate-in slide-in-from-top duration-200">
      <span className="text-sm font-medium neu-text-primary mr-2">
        {selectedCount} selected
      </span>

      <div className="flex items-center gap-1">
        <button
          onClick={onArchive}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm neu-btn rounded-lg"
          title="Archive selected"
        >
          <Archive size={14} />
          Archive
        </button>
        <button
          onClick={onTrash}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm neu-btn rounded-lg hover:bg-red-50 hover:text-red-600"
          title="Trash selected"
        >
          <Trash2 size={14} />
          Trash
        </button>
        <button
          onClick={onMarkAsRead}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm neu-btn rounded-lg"
          title="Mark as read"
        >
          <MailOpen size={14} />
          Read
        </button>
        <button
          onClick={onMarkAsUnread}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm neu-btn rounded-lg"
          title="Mark as unread"
        >
          <Mail size={14} />
          Unread
        </button>
      </div>

      <div className="flex-1" />

      <button
        onClick={onClearSelection}
        className="flex items-center gap-1 px-2 py-1.5 text-sm neu-text-muted hover:neu-text-primary transition-colors"
      >
        <X size={14} />
        Clear
      </button>
    </div>
  );
};
