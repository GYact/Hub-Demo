import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Inbox,
  Star,
  Send,
  FileText,
  Trash2,
  Search,
  Plus,
  Loader2,
  Mail,
  AlertCircle,
  Tag,
  Settings,
  Tags,
} from "lucide-react";
import { useGmail } from "../../hooks/useGmail";
import { useNotificationBadge } from "../../contexts/NotificationContext";
import { useUserSetting } from "../../hooks/useUserSetting";
import { buildReplyBody } from "../../lib/gmailUtils";
import type {
  ParsedEmail,
  ComposeMode,
  ComposeState,
  ComposeEmailInput,
  GmailDraft,
} from "../../types/gmail";
import { GmailMessageCard } from "./GmailMessageCard";
import { GmailMessageDetail } from "./GmailMessageDetail";
import { ComposeModal } from "./ComposeModal";
import { ThreadView } from "./ThreadView";
import { DraftCard } from "./DraftCard";
import { BatchActionBar } from "./BatchActionBar";
import { AdvancedSearchPanel } from "./AdvancedSearchPanel";
import { LabelManager } from "./LabelManager";
import { GmailSettingsPanel } from "./GmailSettingsPanel";

interface SystemLabel {
  id: string;
  name: string;
  icon: typeof Inbox;
}

const SYSTEM_LABELS: SystemLabel[] = [
  { id: "INBOX", name: "Inbox", icon: Inbox },
  { id: "STARRED", name: "Starred", icon: Star },
  { id: "SENT", name: "Sent", icon: Send },
  { id: "DRAFT", name: "Drafts", icon: FileText },
  { id: "TRASH", name: "Trash", icon: Trash2 },
];

interface GmailTabContentProps {
  refreshKey?: number;
  onLoadingChange?: (loading: boolean) => void;
}

export const GmailTabContent: React.FC<GmailTabContentProps> = ({
  refreshKey,
  onLoadingChange,
}) => {
  const gmail = useGmail();
  const { markGmailAsRead } = useNotificationBadge();

  // Sync Gmail mark-as-read with google_gmail_messages badge
  const syncGmailReadStatus = useCallback(
    (gmailMessageId: string) => {
      markGmailAsRead(gmailMessageId);
    },
    [markGmailAsRead],
  );

  const [activeLabel, setActiveLabel] = useState("INBOX");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [viewMode, setViewMode] = useState<
    "list" | "detail" | "thread" | "drafts"
  >("list");
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeState, setComposeState] = useState<ComposeState | undefined>();

  // New feature state
  const [showAdvancedSearch, setShowAdvancedSearch] = useState(false);
  const [showLabelManager, setShowLabelManager] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [primarySignature, setPrimarySignature] = useState("");

  // Unread filter (persisted to Supabase)
  const { value: showUnreadOnly, setValue: setShowUnreadOnly } =
    useUserSetting<boolean>("media_filter_gmail_unread", false);

  // Initial load
  useEffect(() => {
    if (gmail.isConnected) {
      gmail.fetchLabels();
      gmail.fetchMessages("INBOX");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gmail.isConnected]);

  // Fetch messages when label or search changes
  const handleLabelChange = useCallback(
    (labelId: string) => {
      setActiveLabel(labelId);
      setSearchQuery("");
      setSearchInput("");
      gmail.setSelectedMessage(null);
      gmail.setSelectedThread(null);
      gmail.setSelectedBatchIds([]);

      if (labelId === "DRAFT") {
        setViewMode("drafts");
        gmail.fetchDrafts();
      } else {
        setViewMode("list");
        gmail.fetchMessages(labelId);
      }
    },
    [gmail],
  );

  const handleSearch = useCallback(() => {
    const query = searchInput.trim();
    setSearchQuery(query);
    setViewMode("list");
    gmail.setSelectedMessage(null);
    gmail.setSelectedThread(null);
    gmail.setSelectedBatchIds([]);
    if (query) {
      gmail.fetchMessages(undefined, query);
    } else {
      gmail.fetchMessages(activeLabel);
    }
  }, [searchInput, activeLabel, gmail]);

  const handleAdvancedSearch = useCallback(
    (query: string) => {
      setSearchQuery(query);
      setSearchInput(query);
      setShowAdvancedSearch(false);
      setViewMode("list");
      gmail.setSelectedMessage(null);
      gmail.setSelectedBatchIds([]);
      gmail.fetchMessages(undefined, query);
    },
    [gmail],
  );

  const handleSearchKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        handleSearch();
      }
    },
    [handleSearch],
  );

  // Message actions
  const handleSelectMessage = useCallback(
    async (email: ParsedEmail) => {
      // Auto-mark as read when opening
      if (email.isUnread) {
        await gmail.markAsRead(email.id);
        syncGmailReadStatus(email.id);
      }

      // Fetch thread detail for thread view
      const thread = await gmail.fetchThreadDetail(email.threadId);
      if (thread && thread.messageCount > 1) {
        setViewMode("thread");
        return;
      }

      // Fallback to single message detail
      const detail = await gmail.fetchMessageDetail(email.id);
      if (detail) {
        gmail.setSelectedMessage(detail);
        setViewMode("detail");
      }
    },
    [gmail, syncGmailReadStatus],
  );

  const handleBack = useCallback(() => {
    if (activeLabel === "DRAFT") {
      setViewMode("drafts");
    } else {
      setViewMode("list");
    }
    gmail.setSelectedMessage(null);
    gmail.setSelectedThread(null);
  }, [gmail, activeLabel]);

  const handleReply = useCallback(
    (mode: ComposeMode) => {
      if (!gmail.selectedMessage) return;
      const state = buildReplyBody(gmail.selectedMessage, mode);
      setComposeState(state);
      setComposeOpen(true);
    },
    [gmail.selectedMessage],
  );

  const handleThreadReply = useCallback(
    (mode: ComposeMode, message: ParsedEmail) => {
      const state = buildReplyBody(message, mode);
      setComposeState(state);
      setComposeOpen(true);
    },
    [],
  );

  const handleCompose = useCallback(() => {
    setComposeState(undefined);
    setComposeOpen(true);
  }, []);

  const handleSend = useCallback(
    async (input: Parameters<typeof gmail.sendMessage>[0]) => {
      const success = await gmail.sendMessage(input);
      if (success) {
        if (searchQuery) {
          gmail.fetchMessages(undefined, searchQuery);
        } else if (activeLabel === "DRAFT") {
          gmail.fetchDrafts();
        } else {
          gmail.fetchMessages(activeLabel);
        }
      }
      return success;
    },
    [gmail, activeLabel, searchQuery],
  );

  const handleToggleStar = useCallback(
    async (id: string, isStarred: boolean) => {
      await gmail.toggleStar(id, isStarred);
    },
    [gmail],
  );

  const handleArchive = useCallback(
    async (id: string) => {
      await gmail.archiveMessage(id);
      if (viewMode === "detail" || viewMode === "thread") {
        handleBack();
      }
    },
    [gmail, viewMode, handleBack],
  );

  const handleTrash = useCallback(
    async (id: string) => {
      await gmail.trashMessage(id);
      if (viewMode === "detail" || viewMode === "thread") {
        handleBack();
      }
    },
    [gmail, viewMode, handleBack],
  );

  const handleToggleRead = useCallback(
    async (id: string, isUnread: boolean) => {
      if (isUnread) {
        await gmail.markAsRead(id);
        syncGmailReadStatus(id);
      } else {
        await gmail.markAsUnread(id);
      }
    },
    [gmail, syncGmailReadStatus],
  );

  const handleRefresh = useCallback(() => {
    if (activeLabel === "DRAFT") {
      gmail.fetchDrafts();
    } else if (searchQuery) {
      gmail.fetchMessages(undefined, searchQuery);
    } else {
      gmail.fetchMessages(activeLabel);
    }
  }, [gmail, activeLabel, searchQuery]);

  // Refetch when showUnreadOnly changes to keep API query in sync
  useEffect(() => {
    if (!gmail.isConnected) return;
    if (activeLabel === "DRAFT") return;
    const baseQuery = searchQuery || undefined;
    if (showUnreadOnly) {
      const q = [baseQuery, "is:unread"].filter(Boolean).join(" ");
      gmail.fetchMessages(searchQuery ? undefined : activeLabel, q);
    } else {
      if (baseQuery) {
        gmail.fetchMessages(undefined, baseQuery);
      } else {
        gmail.fetchMessages(activeLabel);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showUnreadOnly]);

  // Refresh triggered by parent via refreshKey prop
  useEffect(() => {
    if (refreshKey && refreshKey > 0) {
      handleRefresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  // Sync loading state to parent
  useEffect(() => {
    onLoadingChange?.(gmail.isLoading);
  }, [gmail.isLoading, onLoadingChange]);

  const handleLoadMore = useCallback(() => {
    const baseQuery = searchQuery || undefined;
    const unreadQuery = showUnreadOnly
      ? [baseQuery, "is:unread"].filter(Boolean).join(" ")
      : baseQuery;
    gmail.loadMore(searchQuery ? undefined : activeLabel, unreadQuery);
  }, [gmail, activeLabel, searchQuery, showUnreadOnly]);

  // Batch selection
  const handleToggleBatchSelect = useCallback(
    (id: string) => {
      gmail.setSelectedBatchIds((prev) =>
        prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
      );
    },
    [gmail],
  );

  const handleBatchArchive = useCallback(async () => {
    const ids = [...gmail.selectedBatchIds];
    const success = await gmail.batchArchive(ids);
    if (success) {
      gmail.setSelectedBatchIds([]);
      handleRefresh();
    }
  }, [gmail, handleRefresh]);

  const handleBatchTrash = useCallback(async () => {
    const ids = [...gmail.selectedBatchIds];
    const success = await gmail.batchTrash(ids);
    if (success) {
      gmail.setSelectedBatchIds([]);
      handleRefresh();
    }
  }, [gmail, handleRefresh]);

  const handleBatchMarkAsRead = useCallback(async () => {
    const ids = [...gmail.selectedBatchIds];
    const success = await gmail.batchMarkAsRead(ids);
    if (success) {
      // Sync each message's read status to Supabase badge
      for (const id of ids) {
        markGmailAsRead(id);
      }
      gmail.setSelectedBatchIds([]);
      handleRefresh();
    }
  }, [gmail, handleRefresh, markGmailAsRead]);

  const handleBatchMarkAsUnread = useCallback(async () => {
    const ids = [...gmail.selectedBatchIds];
    const success = await gmail.batchMarkAsUnread(ids);
    if (success) {
      gmail.setSelectedBatchIds([]);
      handleRefresh();
    }
  }, [gmail, handleRefresh]);

  // Draft actions
  const handleEditDraft = useCallback((draft: GmailDraft) => {
    const msg = draft.message;
    setComposeState({
      mode: "new",
      to: msg.to.map((a) => a.email).join(", "),
      cc: msg.cc.map((a) => a.email).join(", "),
      bcc: msg.bcc.map((a) => a.email).join(", "),
      subject: msg.subject,
      body: msg.bodyText,
      threadId: msg.threadId,
      draftId: draft.id,
    });
    setComposeOpen(true);
  }, []);

  const handleDeleteDraft = useCallback(
    async (draftId: string) => {
      await gmail.deleteDraft(draftId);
      gmail.fetchDrafts();
    },
    [gmail],
  );

  const handleSendDraft = useCallback(
    async (draftId: string) => {
      await gmail.sendDraft(draftId);
      gmail.fetchDrafts();
    },
    [gmail],
  );

  const handleSaveDraft = useCallback(
    async (
      input: ComposeEmailInput,
      existingDraftId?: string,
    ): Promise<string | null> => {
      if (existingDraftId) {
        const success = await gmail.updateDraft(existingDraftId, input);
        return success ? existingDraftId : null;
      }
      const draft = await gmail.createDraft(input);
      return draft ? draft.id : null;
    },
    [gmail],
  );

  // Settings / Signature
  const handleFetchSendAs = useCallback(async () => {
    const sendAs = await gmail.fetchSendAsSettings();
    const primary = sendAs.find((s) => s.isPrimary);
    if (primary) {
      setPrimarySignature(primary.signature);
    }
    return sendAs;
  }, [gmail]);

  // Filter messages by unread status
  const filteredMessages = useMemo(() => {
    if (showUnreadOnly) {
      return gmail.messages.filter((msg) => msg.isUnread);
    }
    return gmail.messages;
  }, [gmail.messages, showUnreadOnly]);

  // Unread count
  const unreadCount = useMemo(() => {
    return gmail.messages.filter((msg) => msg.isUnread).length;
  }, [gmail.messages]);

  // Custom labels from API (exclude system labels)
  const customLabels = gmail.labels.filter(
    (l) => l.type === "user" && l.labelListVisibility !== "labelHide",
  );

  // Not connected state
  if (!gmail.isConnected) {
    return (
      <div className="text-center py-16 neu-card">
        <Mail size={48} className="mx-auto neu-text-muted mb-4" />
        <p className="neu-text-secondary mb-2">Gmail not connected</p>
        <p className="text-sm neu-text-muted mb-4">
          Connect Google Services in Settings to use Gmail
        </p>
        <a
          href="/settings"
          className="inline-block px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          Go to Settings
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header: Labels + Search + Compose */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        {/* Label tabs */}
        <div className="flex items-center gap-1 overflow-x-auto">
          {SYSTEM_LABELS.map((label) => {
            const Icon = label.icon;
            const isActive = activeLabel === label.id && !searchQuery;
            return (
              <button
                key={label.id}
                onClick={() => handleLabelChange(label.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                  isActive
                    ? "bg-red-500 text-white"
                    : "neu-text-secondary hover:neu-text-primary hover:bg-gray-100"
                }`}
              >
                <Icon size={14} />
                {label.name}
              </button>
            );
          })}
          {customLabels.length > 0 && (
            <>
              <div className="w-px h-6 bg-gray-300 mx-1" />
              {customLabels.map((label) => {
                const isActive = activeLabel === label.id && !searchQuery;
                return (
                  <button
                    key={label.id}
                    onClick={() => handleLabelChange(label.id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                      isActive
                        ? "bg-red-500 text-white"
                        : "neu-text-secondary hover:neu-text-primary hover:bg-gray-100"
                    }`}
                  >
                    <Tag size={14} />
                    {label.name}
                  </button>
                );
              })}
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Search */}
          <div className="relative">
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder="Search emails..."
              className="pl-8 pr-3 py-1.5 text-sm neu-input rounded-lg w-36 md:w-48"
            />
            <Search
              size={14}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 neu-text-muted"
            />
          </div>

          {/* Advanced Search */}
          <AdvancedSearchPanel
            isOpen={showAdvancedSearch}
            onToggle={() => setShowAdvancedSearch(!showAdvancedSearch)}
            onSearch={handleAdvancedSearch}
            labels={gmail.labels}
          />

          {/* Label Manager */}
          <button
            onClick={() => setShowLabelManager(true)}
            className="p-2 neu-btn rounded-lg"
            title="Manage labels"
          >
            <Tags size={16} />
          </button>

          {/* Settings */}
          <button
            onClick={() => setShowSettings(true)}
            className="p-2 neu-btn rounded-lg"
            title="Gmail settings"
          >
            <Settings size={16} />
          </button>

          {/* Compose */}
          <button
            onClick={handleCompose}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors text-sm font-medium"
          >
            <Plus size={16} />
            Compose
          </button>
        </div>
      </div>

      {/* Batch Action Bar */}
      <BatchActionBar
        selectedCount={gmail.selectedBatchIds.length}
        onArchive={handleBatchArchive}
        onTrash={handleBatchTrash}
        onMarkAsRead={handleBatchMarkAsRead}
        onMarkAsUnread={handleBatchMarkAsUnread}
        onClearSelection={() => gmail.setSelectedBatchIds([])}
      />

      {/* Error */}
      {gmail.error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 text-red-700 text-sm">
          <AlertCircle size={16} />
          {gmail.error}
        </div>
      )}

      {/* Search indicator */}
      {searchQuery && (
        <div className="flex items-center gap-2 text-sm neu-text-secondary">
          <Search size={14} />
          <span>Results for &quot;{searchQuery}&quot;</span>
          <button
            onClick={() => {
              setSearchQuery("");
              setSearchInput("");
              gmail.fetchMessages(activeLabel);
            }}
            className="text-red-500 hover:text-red-600 font-medium"
          >
            Clear
          </button>
        </div>
      )}

      {/* Content */}
      {viewMode === "thread" && gmail.selectedThread ? (
        <ThreadView
          thread={gmail.selectedThread}
          onBack={handleBack}
          onReply={handleThreadReply}
          onToggleStar={handleToggleStar}
          onArchive={handleArchive}
          onTrash={handleTrash}
          onDownloadAttachment={gmail.downloadAttachment}
        />
      ) : viewMode === "detail" && gmail.selectedMessage ? (
        <GmailMessageDetail
          email={gmail.selectedMessage}
          onBack={handleBack}
          onReply={handleReply}
          onToggleStar={handleToggleStar}
          onArchive={handleArchive}
          onTrash={handleTrash}
          onToggleRead={handleToggleRead}
          onDownloadAttachment={gmail.downloadAttachment}
          onGetAttachmentBlobUrl={gmail.getAttachmentBlobUrl}
        />
      ) : viewMode === "drafts" ? (
        <>
          {gmail.isLoading && gmail.drafts.length === 0 ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 size={32} className="animate-spin neu-text-muted" />
            </div>
          ) : gmail.drafts.length === 0 ? (
            <div className="text-center py-16 neu-card">
              <FileText size={32} className="mx-auto neu-text-muted mb-2" />
              <p className="neu-text-secondary">No drafts</p>
            </div>
          ) : (
            <>
              <p className="text-sm neu-text-muted">
                {gmail.drafts.length} drafts
              </p>
              <div className="space-y-2">
                {gmail.drafts.map((draft) => (
                  <DraftCard
                    key={draft.id}
                    draft={draft}
                    onEdit={handleEditDraft}
                    onDelete={handleDeleteDraft}
                    onSend={handleSendDraft}
                  />
                ))}
              </div>
            </>
          )}
        </>
      ) : (
        <>
          {/* Loading */}
          {gmail.isLoading && filteredMessages.length === 0 ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 size={32} className="animate-spin neu-text-muted" />
            </div>
          ) : filteredMessages.length === 0 ? (
            <div className="text-center py-16 neu-card">
              <Mail size={32} className="mx-auto neu-text-muted mb-2" />
              <p className="neu-text-secondary">
                {showUnreadOnly ? "No unread messages" : "No messages"}
              </p>
            </div>
          ) : (
            <>
              {/* Filter controls and message count */}
              <div className="flex items-center justify-between mb-4">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={showUnreadOnly}
                    onChange={(e) => setShowUnreadOnly(e.target.checked)}
                    className="rounded border-slate-300"
                  />
                  Show unread only
                </label>
                <p className="text-sm neu-text-muted">
                  {filteredMessages.length} messages
                  {unreadCount > 0 && (
                    <span className="ml-1 text-blue-600">
                      ({unreadCount} unread)
                    </span>
                  )}
                  {gmail.totalEstimate > gmail.messages.length &&
                    ` of ~${gmail.totalEstimate}`}
                </p>
              </div>

              {/* Message list */}
              <div className="space-y-2">
                {filteredMessages.map((email) => (
                  <GmailMessageCard
                    key={email.id}
                    email={email}
                    onSelect={handleSelectMessage}
                    onToggleStar={handleToggleStar}
                    onArchive={handleArchive}
                    onTrash={handleTrash}
                    isSelected={gmail.selectedBatchIds.includes(email.id)}
                    onToggleSelect={handleToggleBatchSelect}
                  />
                ))}
              </div>

              {/* Load more */}
              {gmail.nextPageToken && (
                <div className="flex justify-center pt-4">
                  <button
                    onClick={handleLoadMore}
                    disabled={gmail.isLoading}
                    className="flex items-center gap-2 px-4 py-2 neu-btn rounded-lg text-sm font-medium"
                  >
                    {gmail.isLoading ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : null}
                    {gmail.isLoading ? "Loading" : "Load more"}
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* Compose Modal */}
      <ComposeModal
        isOpen={composeOpen}
        onClose={() => setComposeOpen(false)}
        onSend={handleSend}
        initialState={composeState}
        isSending={gmail.isSending}
        signature={primarySignature}
        onSaveDraft={handleSaveDraft}
      />

      {/* Label Manager Modal */}
      <LabelManager
        isOpen={showLabelManager}
        onClose={() => setShowLabelManager(false)}
        labels={gmail.labels}
        onCreateLabel={gmail.createLabel}
        onUpdateLabel={gmail.updateLabel}
        onDeleteLabel={async (labelId) => {
          const success = await gmail.deleteLabel(labelId);
          if (success) gmail.fetchLabels();
          return success;
        }}
      />

      {/* Settings Panel */}
      <GmailSettingsPanel
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        onFetchSendAs={handleFetchSendAs}
        onUpdateSignature={gmail.updateSignature}
        onFetchVacation={gmail.fetchVacationSettings}
        onUpdateVacation={gmail.updateVacationSettings}
      />
    </div>
  );
};
