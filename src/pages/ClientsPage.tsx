import {
  Plus,
  Trash2,
  Users,
  Loader2,
  RefreshCw,
  Mail,
  Phone,
  MapPin,
  User,
  ChevronDown,
  ChevronUp,
  X,
  FolderPlus,
  Pencil,
  Building2,
  GripVertical,
  Search,
  ScanLine,
  Camera,
} from "lucide-react";
import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { DndContext, closestCenter, DragEndEvent } from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  horizontalListSortingStrategy,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useDndSensors } from "../hooks/useDndSensors";
import { SortableTab } from "../components/SortableTab";
import { SortableWrapper } from "../components/SortableWrapper";
import {
  useClients,
  statusOptions,
  PROTECTED_TAB_IDS,
  INDIVIDUAL_TAB_ID,
} from "../hooks/useClients";
import { useAuth } from "../contexts/AuthContext";
import { useUndoRedo } from "../contexts/UndoRedoContext";
import type { Client, GroupColor, ClientTab } from "../types";
import { Layout, ConfirmDialog, EmailInput, TelInput } from "../components";
import { useUserSetting } from "../hooks/useUserSetting";
import { TAB_COLORS, getTabColorClasses } from "../utils/colors";
import { useSwipeableTabs } from "../hooks/useSwipeableTabs";

const ClientCard = ({
  client,
  tabColor,
  isIndividual,
  corporateClients,
  linkedCorporate,
  linkedIndividuals,
  onUpdate,
  onDeleteClick,
  dragHandleProps,
  ocrResult,
  photoUrl,
  photoUrlBack,
  onUploadPhoto,
  onRunOcr,
  onApplyOcr,
  onDismissOcr,
  isUploadingFront,
  isUploadingBack,
  isRunningOcr,
}: {
  client: Client;
  tabColor: GroupColor;
  isIndividual: boolean;
  corporateClients: Client[];
  linkedCorporate: Client | null;
  linkedIndividuals: Client[];
  onUpdate: (id: string, updates: Partial<Client>) => void;
  onDeleteClick: (id: string) => void;
  dragHandleProps?: React.HTMLAttributes<HTMLDivElement>;
  ocrResult: Record<string, unknown> | null;
  photoUrl: string | null;
  photoUrlBack: string | null;
  onUploadPhoto: (
    id: string,
    file: File,
    side: "front" | "back",
  ) => Promise<void>;
  onRunOcr: (id: string, file: File) => Promise<void>;
  onApplyOcr: (id: string, ocr: Record<string, unknown>) => void;
  onDismissOcr: (id: string) => void;
  isUploadingFront: boolean;
  isUploadingBack: boolean;
  isRunningOcr: boolean;
}) => {
  const [isExpanded, setIsExpanded] = useState(!client.name);
  const [showCardImages, setShowCardImages] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileInputBackRef = useRef<HTMLInputElement>(null);
  const statusOption =
    statusOptions.find((s) => s.value === client.status) || statusOptions[2];
  const colors = getTabColorClasses(tabColor);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    await onUploadPhoto(client.id, file, "front");
  };

  const handleFileChangeBack = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await onUploadPhoto(client.id, file, "back");
  };

  const handleRunOcr = async () => {
    if (!selectedFile && !client.photoStoragePath) return;
    // If we have a selectedFile use it; otherwise the hook will use the stored photo
    if (selectedFile) {
      await onRunOcr(client.id, selectedFile);
    }
  };

  return (
    <div className="neu-card overflow-hidden">
      <div className="p-4 md:p-5">
        <div className="flex items-start gap-3">
          {dragHandleProps && (
            <div
              {...dragHandleProps}
              className="touch-none cursor-grab active:cursor-grabbing p-1 neu-text-muted hover:text-slate-500 transition-colors shrink-0 mt-1"
            >
              <GripVertical size={18} />
            </div>
          )}
          <div className={`p-2 rounded-lg shrink-0 ${colors.bgLight}`}>
            {isIndividual ? (
              <User size={20} className={colors.text} />
            ) : (
              <Building2 size={20} className={colors.text} />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
              {isExpanded ? (
                <textarea
                  ref={(el) => {
                    if (el) {
                      el.style.height = "auto";
                      el.style.height = el.scrollHeight + "px";
                    }
                  }}
                  value={client.name}
                  onChange={(e) =>
                    onUpdate(client.id, { name: e.target.value })
                  }
                  placeholder={
                    isIndividual ? "Contact name..." : "Company name..."
                  }
                  className="flex-1 min-w-0 text-base md:text-lg font-semibold neu-text-primary bg-transparent border-none outline-none placeholder:neu-text-muted focus:ring-0 resize-none overflow-hidden"
                  rows={1}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      e.currentTarget.blur();
                    }
                  }}
                />
              ) : (
                <span
                  onClick={() => setIsExpanded(true)}
                  className="flex-1 min-w-0 text-base md:text-lg font-semibold neu-text-primary cursor-text truncate"
                  title={client.name}
                >
                  {client.name || (
                    <span className="neu-text-muted">
                      {isIndividual ? "Contact name..." : "Company name..."}
                    </span>
                  )}
                </span>
              )}
              <select
                value={client.status}
                onChange={(e) =>
                  onUpdate(client.id, {
                    status: e.target.value as Client["status"],
                  })
                }
                className={`w-full sm:w-auto text-xs px-2 py-1 rounded-full border-none outline-none cursor-pointer ${
                  statusOption.color === "emerald"
                    ? "bg-emerald-100 text-emerald-700"
                    : statusOption.color === "slate"
                      ? "bg-slate-100 neu-text-primary"
                      : "bg-amber-100 text-amber-700"
                }`}
              >
                {statusOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Summary info - mobile: 2col grid, PC: single row */}
            {!isExpanded && (
              <div className="grid grid-cols-2 md:flex md:flex-wrap md:items-center gap-x-3 gap-y-1 mt-2 text-sm neu-text-secondary">
                {/* Individual: show linked corporate */}
                {isIndividual && linkedCorporate && (
                  <span className="flex items-center gap-1 text-blue-600 whitespace-nowrap">
                    <Building2 size={14} className="shrink-0" />{" "}
                    <span className="truncate max-w-[150px]">
                      {linkedCorporate.name}
                    </span>
                  </span>
                )}
                {/* Corporate: show contact count */}
                {!isIndividual && linkedIndividuals.length > 0 && (
                  <span className="flex items-center gap-1 text-green-600 whitespace-nowrap">
                    <Users size={14} className="shrink-0" />{" "}
                    {linkedIndividuals.length} contacts
                  </span>
                )}
                {client.contactName && (
                  <span className="flex items-center gap-1 whitespace-nowrap">
                    <User size={14} className="shrink-0" />{" "}
                    <span className="truncate max-w-[120px]">
                      {client.contactName}
                    </span>
                  </span>
                )}
                {client.email && (
                  <span className="flex items-center gap-1 whitespace-nowrap">
                    <Mail size={14} className="shrink-0" />{" "}
                    <span className="truncate max-w-[150px]">
                      {client.email}
                    </span>
                  </span>
                )}
                {client.phone && (
                  <span className="flex items-center gap-1 whitespace-nowrap overflow-hidden">
                    <Phone size={14} className="shrink-0" />
                    <span className="truncate">{client.phone}</span>
                  </span>
                )}
                {(photoUrl || photoUrlBack) && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowCardImages((v) => !v);
                    }}
                    className="flex items-center gap-1 text-violet-500 hover:text-violet-700 whitespace-nowrap"
                  >
                    <Camera size={14} className="shrink-0" /> 名刺
                    {showCardImages ? (
                      <ChevronUp size={12} />
                    ) : (
                      <ChevronDown size={12} />
                    )}
                  </button>
                )}
              </div>
            )}

            {/* Card images toggle (collapsed mode) */}
            {!isExpanded && showCardImages && (photoUrl || photoUrlBack) && (
              <div className="flex gap-2 mt-2 overflow-x-auto">
                {photoUrl && (
                  <img
                    src={photoUrl}
                    alt="名刺 表面"
                    className="max-h-36 rounded-lg border border-slate-200 object-contain"
                  />
                )}
                {photoUrlBack && (
                  <img
                    src={photoUrlBack}
                    alt="名刺 裏面"
                    className="max-h-36 rounded-lg border border-slate-200 object-contain"
                  />
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="p-2 neu-text-muted hover:neu-text-secondary hover:bg-slate-100 rounded-lg transition-colors"
              title={isExpanded ? "Collapse" : "Expand"}
            >
              {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </button>
            <button
              onClick={() => onDeleteClick(client.id)}
              className="p-2 neu-text-muted hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
              title="Delete"
            >
              <Trash2 size={18} />
            </button>
          </div>
        </div>

        {/* Expanded details - full width */}
        {isExpanded && (
          <div className="mt-4 space-y-3">
            {/* Individual: select corporate client */}
            {isIndividual && (
              <div>
                <label className="text-xs neu-text-secondary mb-1 block">
                  Linked Corporate Client
                </label>
                <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
                  <Building2 size={16} className="text-blue-500" />
                  <select
                    value={client.corporateClientId || ""}
                    onChange={(e) =>
                      onUpdate(client.id, {
                        corporateClientId: e.target.value || undefined,
                      })
                    }
                    className="flex-1 text-sm bg-transparent border-none outline-none cursor-pointer"
                  >
                    <option value="">(None)</option>
                    {corporateClients.map((corp) => (
                      <option key={corp.id} value={corp.id}>
                        {corp.name || "(Unnamed)"}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {/* Corporate: show linked contacts */}
            {!isIndividual && linkedIndividuals.length > 0 && (
              <div>
                <label className="text-xs neu-text-secondary mb-1 block">
                  Linked Contacts ({linkedIndividuals.length})
                </label>
                <div className="flex flex-wrap gap-2">
                  {linkedIndividuals.map((ind) => (
                    <span
                      key={ind.id}
                      className="inline-flex items-center gap-1 px-2 py-1 bg-green-50 text-green-700 text-xs rounded-full"
                    >
                      <User size={12} /> {ind.name || "(Unnamed)"}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs neu-text-secondary mb-1 block">
                  {isIndividual ? "肩書" : "担当者"}
                </label>
                <div className="flex items-center gap-2 neu-pressed rounded-xl px-3 py-2">
                  <User size={16} className="neu-text-muted" />
                  <input
                    type="text"
                    value={client.contactName || ""}
                    onChange={(e) =>
                      onUpdate(client.id, { contactName: e.target.value })
                    }
                    placeholder={isIndividual ? "肩書" : "担当者名"}
                    className="flex-1 text-sm bg-transparent border-none outline-none"
                  />
                </div>
              </div>
              <div>
                <EmailInput
                  label="メールアドレス"
                  value={client.email || ""}
                  onChange={(value) => onUpdate(client.id, { email: value })}
                  placeholder="email@example.com"
                  showValidation={false}
                />
              </div>
              <div>
                <TelInput
                  label="電話番号"
                  value={client.phone || ""}
                  onChange={(value) => onUpdate(client.id, { phone: value })}
                  placeholder="+1 234 567 8900"
                  showValidation={false}
                />
              </div>
              <div>
                <label className="text-xs neu-text-secondary mb-1 block">
                  住所
                </label>
                <div className="flex items-center gap-2 neu-pressed rounded-xl px-3 py-2">
                  <MapPin size={16} className="neu-text-muted" />
                  <input
                    type="text"
                    value={client.address || ""}
                    onChange={(e) =>
                      onUpdate(client.id, { address: e.target.value })
                    }
                    placeholder="東京都..."
                    className="flex-1 text-sm bg-transparent border-none outline-none"
                  />
                </div>
              </div>
            </div>
            <div>
              <label className="text-xs neu-text-secondary mb-1 block">
                備考
              </label>
              <textarea
                value={client.notes || ""}
                onChange={(e) => onUpdate(client.id, { notes: e.target.value })}
                placeholder="備考を追加..."
                rows={3}
                className="w-full text-sm neu-text-secondary neu-pressed rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent resize-y min-h-[80px]"
              />
            </div>

            {/* Business Card OCR */}
            <div className="border border-slate-200 rounded-xl p-3 space-y-3">
              <label className="text-xs font-medium neu-text-secondary flex items-center gap-1.5">
                <Camera size={14} /> 名刺
              </label>

              {/* Front / Back upload buttons */}
              <div className="flex items-center gap-2 flex-wrap">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploadingFront}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg neu-btn neu-text-secondary hover:neu-text-primary transition-colors disabled:opacity-50"
                >
                  {isUploadingFront ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Camera size={14} />
                  )}
                  {client.photoStoragePath ? "表面を変更" : "表面"}
                </button>

                <input
                  ref={fileInputBackRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileChangeBack}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputBackRef.current?.click()}
                  disabled={isUploadingBack}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg neu-btn neu-text-secondary hover:neu-text-primary transition-colors disabled:opacity-50"
                >
                  {isUploadingBack ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Camera size={14} />
                  )}
                  {client.photoStoragePathBack ? "裏面を変更" : "裏面"}
                </button>

                {(client.photoStoragePath || selectedFile) && (
                  <button
                    onClick={handleRunOcr}
                    disabled={isRunningOcr}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-violet-600 hover:bg-violet-500 text-white transition-colors disabled:opacity-50"
                  >
                    {isRunningOcr ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <ScanLine size={14} />
                    )}
                    OCR
                  </button>
                )}
              </div>

              {/* Photo thumbnails - front & back */}
              {(photoUrl || photoUrlBack) && (
                <div className="flex gap-2 overflow-x-auto">
                  {photoUrl && (
                    <div className="shrink-0">
                      <p className="text-[10px] neu-text-muted mb-1">表面</p>
                      <img
                        src={photoUrl}
                        alt="名刺 表面"
                        className="max-h-36 rounded-lg border border-slate-200 object-contain"
                      />
                    </div>
                  )}
                  {photoUrlBack && (
                    <div className="shrink-0">
                      <p className="text-[10px] neu-text-muted mb-1">裏面</p>
                      <img
                        src={photoUrlBack}
                        alt="名刺 裏面"
                        className="max-h-36 rounded-lg border border-slate-200 object-contain"
                      />
                    </div>
                  )}
                </div>
              )}

              {/* OCR Result Preview */}
              {ocrResult && (
                <div className="bg-violet-50 border border-violet-200 rounded-lg p-3 space-y-2">
                  <p className="text-xs font-medium text-violet-700 mb-2">
                    OCR結果
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-xs">
                    {!!ocrResult.company && (
                      <div>
                        <span className="text-violet-500">会社名:</span>{" "}
                        <span className="neu-text-primary">
                          {String(ocrResult.company)}
                        </span>
                      </div>
                    )}
                    {!!ocrResult.name && (
                      <div>
                        <span className="text-violet-500">名前:</span>{" "}
                        <span className="neu-text-primary">
                          {String(ocrResult.name)}
                        </span>
                      </div>
                    )}
                    {!!ocrResult.title && (
                      <div>
                        <span className="text-violet-500">肩書:</span>{" "}
                        <span className="neu-text-primary">
                          {String(ocrResult.title)}
                        </span>
                      </div>
                    )}
                    {!!ocrResult.email && (
                      <div>
                        <span className="text-violet-500">メール:</span>{" "}
                        <span className="neu-text-primary">
                          {String(ocrResult.email)}
                        </span>
                      </div>
                    )}
                    {!!ocrResult.phone && (
                      <div>
                        <span className="text-violet-500">電話:</span>{" "}
                        <span className="neu-text-primary">
                          {String(ocrResult.phone)}
                        </span>
                      </div>
                    )}
                    {!!ocrResult.address && (
                      <div className="sm:col-span-2">
                        <span className="text-violet-500">住所:</span>{" "}
                        <span className="neu-text-primary">
                          {String(ocrResult.address)}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 pt-2">
                    <button
                      onClick={() => onApplyOcr(client.id, ocrResult)}
                      className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
                    >
                      適用
                    </button>
                    <button
                      onClick={() => onDismissOcr(client.id)}
                      className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg neu-btn neu-text-secondary hover:neu-text-primary transition-colors"
                    >
                      閉じる
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export const ClientsPage = () => {
  useAuth(); // For authentication context

  const {
    tabs,
    clients,
    isLoading,
    isSyncing,
    addTab,
    updateTab,
    removeTab,
    updateClient,
    addClient,
    removeClient,
    getClientsByTab,
    getCorporateClients,
    getCorporateClient,
    getIndividualClientsByCorporate,
    reorderTabs,
    reorderClients,
    refreshClients,
    restoreState,
    uploadPhoto,
    getPhotoSignedUrl,
    runOcr,
  } = useClients();

  const { registerPage, unregisterPage, setCurrentPage, saveState } =
    useUndoRedo();
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // DnD sensors
  const sensors = useDndSensors();

  // Handle tab drag end
  const handleTabDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = tabs.findIndex((t) => t.id === active.id);
    const newIndex = tabs.findIndex((t) => t.id === over.id);

    if (oldIndex !== -1 && newIndex !== -1) {
      const newOrder = arrayMove(tabs, oldIndex, newIndex);
      reorderTabs(newOrder);
    }
  };

  // Handle client drag end
  const handleClientDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !activeTabId) return;

    const sortedClients = [...activeClients].sort(
      (a, b) => (a.order ?? 0) - (b.order ?? 0),
    );
    const oldIndex = sortedClients.findIndex((c) => c.id === active.id);
    const newIndex = sortedClients.findIndex((c) => c.id === over.id);

    if (oldIndex !== -1 && newIndex !== -1) {
      const newOrder = arrayMove(sortedClients, oldIndex, newIndex);
      reorderClients(newOrder);
      saveToHistory();
    }
  };

  // Set current page and register with undo/redo system
  useEffect(() => {
    setCurrentPage("clients");

    const getCurrentState = () => ({ tabs, clients });
    const handleRestore = async (state: unknown) => {
      const s = state as { tabs: ClientTab[]; clients: Client[] };
      if (restoreState) {
        await restoreState(s);
      }
    };

    registerPage("clients", getCurrentState, handleRestore);
    return () => unregisterPage("clients");
  }, [
    tabs,
    clients,
    registerPage,
    unregisterPage,
    restoreState,
    setCurrentPage,
  ]);

  // Save state to history on changes (debounced)
  const saveToHistory = useCallback(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(() => {
      saveState("clients");
    }, 500);
  }, [saveState]);

  // Wrapped handlers that save to history
  const addTabWithHistory = useCallback(
    async (name: string, color: GroupColor) => {
      const id = await addTab(name, color);
      saveToHistory();
      return id;
    },
    [addTab, saveToHistory],
  );

  const updateTabWithHistory = useCallback(
    (id: string, updates: Partial<ClientTab>) => {
      updateTab(id, updates);
      saveToHistory();
    },
    [updateTab, saveToHistory],
  );

  const removeTabWithHistory = useCallback(
    async (id: string) => {
      await removeTab(id);
      saveToHistory();
    },
    [removeTab, saveToHistory],
  );

  const addClientWithHistory = useCallback(
    async (tabId: string) => {
      await addClient(tabId);
      saveToHistory();
    },
    [addClient, saveToHistory],
  );

  const updateClientWithHistory = useCallback(
    (id: string, updates: Partial<Client>) => {
      updateClient(id, updates);
      saveToHistory();
    },
    [updateClient, saveToHistory],
  );

  const removeClientWithHistory = useCallback(
    async (id: string) => {
      await removeClient(id);
      saveToHistory();
    },
    [removeClient, saveToHistory],
  );

  const corporateClients = getCorporateClients();

  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [showNewTabModal, setShowNewTabModal] = useState(false);
  const [newTabName, setNewTabName] = useState("");
  const [newTabColor, setNewTabColor] = useState<GroupColor>("blue");
  const [editingTab, setEditingTab] = useState<{
    id: string;
    name: string;
    color: GroupColor;
  } | null>(null);
  const [deleteTabId, setDeleteTabId] = useState<string | null>(null);
  const [deleteClientId, setDeleteClientId] = useState<string | null>(null);
  const [activeTabMenu, setActiveTabMenu] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState<{
    top: number;
    left: number;
  }>({ top: 0, left: 0 });
  const [searchQuery, setSearchQuery] = useState("");
  const { value: statusFilter, setValue: setStatusFilter } =
    useUserSetting<string>("clients_filter_status", "all");

  // OCR state keyed by client id
  const [ocrResults, setOcrResults] = useState<
    Record<string, Record<string, unknown>>
  >({});
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [photoUrlsBack, setPhotoUrlsBack] = useState<Record<string, string>>(
    {},
  );
  // Processing state lifted to parent so it survives card collapse
  const [processingClients, setProcessingClients] = useState<
    Record<
      string,
      { uploadFront?: boolean; uploadBack?: boolean; ocr?: boolean }
    >
  >({});

  const handleUploadPhoto = useCallback(
    async (id: string, file: File, side: "front" | "back") => {
      const key = side === "back" ? "uploadBack" : "uploadFront";
      setProcessingClients((prev) => ({
        ...prev,
        [id]: { ...prev[id], [key]: true },
      }));
      try {
        const path = await uploadPhoto(id, file, side);
        if (!path) return;
        const url = await getPhotoSignedUrl(path);
        if (url) {
          if (side === "back") {
            setPhotoUrlsBack((prev) => ({ ...prev, [id]: url }));
          } else {
            setPhotoUrls((prev) => ({ ...prev, [id]: url }));
          }
        }
      } finally {
        setProcessingClients((prev) => ({
          ...prev,
          [id]: { ...prev[id], [key]: false },
        }));
      }
    },
    [uploadPhoto, getPhotoSignedUrl],
  );

  const handleRunOcr = useCallback(
    async (id: string, file: File) => {
      setProcessingClients((prev) => ({
        ...prev,
        [id]: { ...prev[id], ocr: true },
      }));
      try {
        const result = await runOcr(id, file);
        if (result) {
          setOcrResults((prev) => ({ ...prev, [id]: result }));
        }
      } finally {
        setProcessingClients((prev) => ({
          ...prev,
          [id]: { ...prev[id], ocr: false },
        }));
      }
    },
    [runOcr],
  );

  const handleApplyOcr = useCallback(
    (id: string, ocr: Record<string, unknown>) => {
      const client = clients.find((c) => c.id === id);
      const isIndividual = client?.tabId === INDIVIDUAL_TAB_ID;
      const updates: Partial<Client> = {};

      if (isIndividual) {
        // 個人: name=人名, contactName=肩書き, 会社名はnotesへ
        if (ocr.name) updates.name = String(ocr.name);
        if (ocr.title) updates.contactName = String(ocr.title);
        if (ocr.email) updates.email = String(ocr.email);
        if (ocr.phone) updates.phone = String(ocr.phone);
        if (ocr.address) updates.address = String(ocr.address);
        const extras: string[] = [];
        if (ocr.company) extras.push(String(ocr.company));
        if (ocr.department) extras.push(String(ocr.department));
        if (ocr.website) extras.push(String(ocr.website));
        if (extras.length > 0) {
          const existingNotes = client?.notes || "";
          updates.notes = existingNotes
            ? `${existingNotes}\n${extras.join("\n")}`
            : extras.join("\n");
        }
      } else {
        // 法人: name=会社名, contactName=担当者名
        if (ocr.company) updates.name = String(ocr.company);
        if (ocr.name) updates.contactName = String(ocr.name);
        if (ocr.email) updates.email = String(ocr.email);
        if (ocr.phone) updates.phone = String(ocr.phone);
        if (ocr.address) updates.address = String(ocr.address);
        const extras: string[] = [];
        if (ocr.title) extras.push(`Title: ${String(ocr.title)}`);
        if (ocr.department) extras.push(`Dept: ${String(ocr.department)}`);
        if (ocr.website) extras.push(String(ocr.website));
        if (extras.length > 0) {
          const existingNotes = client?.notes || "";
          updates.notes = existingNotes
            ? `${existingNotes}\n${extras.join("\n")}`
            : extras.join("\n");
        }
      }

      updateClientWithHistory(id, updates);
      setOcrResults((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    },
    [updateClientWithHistory, clients],
  );

  const handleDismissOcr = useCallback((id: string) => {
    setOcrResults((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  // Load photo URLs for clients that have photoStoragePath (front & back)
  const loadedPhotoIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    let cancelled = false;
    const toLoad: { id: string; path: string; side: "front" | "back" }[] = [];
    for (const client of clients) {
      if (
        client.photoStoragePath &&
        !loadedPhotoIdsRef.current.has(client.id + ":front")
      ) {
        toLoad.push({
          id: client.id,
          path: client.photoStoragePath,
          side: "front",
        });
      }
      if (
        client.photoStoragePathBack &&
        !loadedPhotoIdsRef.current.has(client.id + ":back")
      ) {
        toLoad.push({
          id: client.id,
          path: client.photoStoragePathBack,
          side: "back",
        });
      }
    }
    if (toLoad.length === 0) return;

    Promise.all(
      toLoad.map(async ({ id, path, side }) => {
        try {
          const url = await getPhotoSignedUrl(path);
          if (cancelled || !url) return;
          loadedPhotoIdsRef.current.add(id + ":" + side);
          if (side === "back") {
            setPhotoUrlsBack((prev) => ({ ...prev, [id]: url }));
          } else {
            setPhotoUrls((prev) => ({ ...prev, [id]: url }));
          }
        } catch {
          // Skip failed signed URL - file may not exist in storage
        }
      }),
    );

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clients, getPhotoSignedUrl]);

  // Ref for scrolling to newly added client
  const clientListEndRef = useRef<HTMLDivElement>(null);

  // ---- Batch card scan state ----
  interface ScannedCard {
    front: File;
    back: File | null;
    frontPreview: string;
    backPreview: string | null;
  }
  const [showBatchScan, setShowBatchScan] = useState(false);
  const [batchCards, setBatchCards] = useState<ScannedCard[]>([]);
  const [batchStep, setBatchStep] = useState<"front" | "back">("front");
  const [batchProcessing, setBatchProcessing] = useState(false);
  const batchFrontRef = useRef<HTMLInputElement>(null);
  const batchBackRef = useRef<HTMLInputElement>(null);
  const pendingFrontRef = useRef<{ file: File; preview: string } | null>(null);

  const handleBatchFront = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    pendingFrontRef.current = {
      file,
      preview: URL.createObjectURL(file),
    };
    setBatchStep("back");
    // Auto-open back camera
    setTimeout(() => batchBackRef.current?.click(), 300);
    e.target.value = "";
  };

  const handleBatchBack = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const front = pendingFrontRef.current;
    if (!front) return;
    const card: ScannedCard = {
      front: front.file,
      frontPreview: front.preview,
      back: file || null,
      backPreview: file ? URL.createObjectURL(file) : null,
    };
    setBatchCards((prev) => [...prev, card]);
    pendingFrontRef.current = null;
    setBatchStep("front");
    e.target.value = "";
  };

  const handleBatchSkipBack = () => {
    const front = pendingFrontRef.current;
    if (!front) return;
    setBatchCards((prev) => [
      ...prev,
      {
        front: front.file,
        frontPreview: front.preview,
        back: null,
        backPreview: null,
      },
    ]);
    pendingFrontRef.current = null;
    setBatchStep("front");
  };

  const handleBatchRemove = (index: number) => {
    setBatchCards((prev) => {
      const card = prev[index];
      URL.revokeObjectURL(card.frontPreview);
      if (card.backPreview) URL.revokeObjectURL(card.backPreview);
      return prev.filter((_, i) => i !== index);
    });
  };

  const handleBatchRegister = async () => {
    if (!activeTabId || batchCards.length === 0) return;
    setBatchProcessing(true);
    try {
      for (const card of batchCards) {
        const clientId = await addClient(activeTabId);
        // Upload front
        await uploadPhoto(clientId, card.front, "front");
        // Upload back if exists
        if (card.back) {
          await uploadPhoto(clientId, card.back, "back");
        }
        // Run OCR on front
        const ocrResult = await runOcr(clientId, card.front);
        if (ocrResult) {
          // Auto-apply OCR
          const isIndividual = activeTabId === INDIVIDUAL_TAB_ID;
          const updates: Partial<Client> = {};
          if (isIndividual) {
            if (ocrResult.name) updates.name = String(ocrResult.name);
            if (ocrResult.title) updates.contactName = String(ocrResult.title);
          } else {
            if (ocrResult.company) updates.name = String(ocrResult.company);
            if (ocrResult.name) updates.contactName = String(ocrResult.name);
          }
          if (ocrResult.email) updates.email = String(ocrResult.email);
          if (ocrResult.phone) updates.phone = String(ocrResult.phone);
          if (ocrResult.address) updates.address = String(ocrResult.address);
          const extras: string[] = [];
          if (isIndividual) {
            if (ocrResult.company) extras.push(String(ocrResult.company));
            if (ocrResult.department) extras.push(String(ocrResult.department));
          } else {
            if (ocrResult.title)
              extras.push(`Title: ${String(ocrResult.title)}`);
            if (ocrResult.department)
              extras.push(`Dept: ${String(ocrResult.department)}`);
          }
          if (ocrResult.website) extras.push(String(ocrResult.website));
          if (extras.length > 0) updates.notes = extras.join("\n");
          updates.ocrExtracted = ocrResult;
          updateClient(clientId, updates);
        }
        // Cleanup preview URLs
        URL.revokeObjectURL(card.frontPreview);
        if (card.backPreview) URL.revokeObjectURL(card.backPreview);
      }
      saveToHistory();
      setBatchCards([]);
      setShowBatchScan(false);
    } finally {
      setBatchProcessing(false);
    }
  };

  const handleCloseBatchScan = () => {
    // Cleanup all preview URLs
    for (const card of batchCards) {
      URL.revokeObjectURL(card.frontPreview);
      if (card.backPreview) URL.revokeObjectURL(card.backPreview);
    }
    if (pendingFrontRef.current) {
      URL.revokeObjectURL(pendingFrontRef.current.preview);
      pendingFrontRef.current = null;
    }
    setBatchCards([]);
    setBatchStep("front");
    setShowBatchScan(false);
  };

  // Set initial active tab
  if (activeTabId === null && tabs.length > 0) {
    setActiveTabId(tabs[0].id);
  }

  const activeTab = tabs.find((t) => t.id === activeTabId);
  const allActiveClients = activeTabId ? getClientsByTab(activeTabId) : [];

  // Filter clients by status and search query
  const activeClients = useMemo(() => {
    let result = allActiveClients;
    if (statusFilter !== "all") {
      result = result.filter((client) => client.status === statusFilter);
    }
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (client) =>
          client.name?.toLowerCase().includes(query) ||
          client.contactName?.toLowerCase().includes(query) ||
          client.email?.toLowerCase().includes(query) ||
          client.phone?.toLowerCase().includes(query) ||
          client.address?.toLowerCase().includes(query) ||
          client.notes?.toLowerCase().includes(query),
      );
    }
    return result;
  }, [allActiveClients, statusFilter, searchQuery]);

  const handleAddTab = async () => {
    if (!newTabName.trim()) return;
    const id = await addTabWithHistory(newTabName.trim(), newTabColor);
    setActiveTabId(id);
    setShowNewTabModal(false);
    setNewTabName("");
    setNewTabColor("blue");
  };

  const handleDeleteTab = (tabId: string) => {
    setDeleteTabId(tabId);
  };

  const confirmDeleteTab = async () => {
    if (!deleteTabId) return;
    await removeTabWithHistory(deleteTabId);
    if (activeTabId === deleteTabId) {
      setActiveTabId(tabs.find((t) => t.id !== deleteTabId)?.id || null);
    }
    setDeleteTabId(null);
  };

  const handleAddClient = async () => {
    if (!activeTabId) return;
    await addClientWithHistory(activeTabId);
    // Scroll to the newly added client
    setTimeout(() => {
      clientListEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 100);
  };

  // Swipe handlers
  const handleNextTab = () => {
    if (!activeTabId || tabs.length <= 1) return;
    const currentIndex = tabs.findIndex((t) => t.id === activeTabId);
    if (currentIndex < tabs.length - 1) {
      setActiveTabId(tabs[currentIndex + 1].id);
    }
  };

  const handlePrevTab = () => {
    if (!activeTabId || tabs.length <= 1) return;
    const currentIndex = tabs.findIndex((t) => t.id === activeTabId);
    if (currentIndex > 0) {
      setActiveTabId(tabs[currentIndex - 1].id);
    }
  };

  const { onTouchStart, onTouchEnd } = useSwipeableTabs({
    onNext: handleNextTab,
    onPrev: handlePrevTab,
  });

  const headerLeft = (
    <button
      onClick={refreshClients}
      disabled={isSyncing}
      className="p-1.5 md:p-2 neu-text-secondary hover:neu-text-primary neu-btn rounded-lg transition-colors disabled:opacity-50"
      title="Refresh data"
    >
      <RefreshCw
        size={16}
        className={`md:w-[18px] md:h-[18px]${isSyncing ? " animate-spin" : ""}`}
      />
    </button>
  );

  const headerCenter = (
    <div className="flex items-center gap-1.5 md:gap-2">
      <div className="relative">
        <Search
          size={14}
          className="md:w-4 md:h-4 absolute left-2 md:left-2.5 top-1/2 -translate-y-1/2 neu-text-muted"
        />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search..."
          className="w-28 sm:w-32 md:w-48 pl-7 md:pl-8 pr-2 md:pr-3 py-2 text-xs md:text-sm neu-input rounded-lg"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery("")}
            className="absolute right-1.5 md:right-2 top-1/2 -translate-y-1/2 neu-text-muted hover:neu-text-secondary"
            title="Clear search"
          >
            <X size={12} className="md:w-3.5 md:h-3.5" />
          </button>
        )}
      </div>
      <button
        onClick={() => setShowNewTabModal(true)}
        className="flex items-center justify-center p-1.5 md:px-3 md:py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs md:text-sm font-medium transition-all active:scale-95 shadow"
        title="Add Tab"
      >
        <FolderPlus size={16} />
        <span className="hidden md:inline md:ml-1.5">Add Tab</span>
      </button>
    </div>
  );

  return (
    <Layout
      pageTitle="Community"
      headerLeft={headerLeft}
      headerCenter={headerCenter}
    >
      {isLoading ? (
        <div className="h-full flex items-center justify-center">
          <Loader2 size={32} className="animate-spin neu-text-secondary" />
        </div>
      ) : (
        <div className="flex-1 flex flex-col min-h-0 neu-bg">
          {/* Tabs */}
          <div className="shrink-0 neu-bg border-b border-slate-300 sticky top-0 z-30 no-select min-h-14">
            <div className="overflow-x-auto px-4 py-2 flex items-center h-full">
              <div className="flex items-center gap-2 min-w-max">
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleTabDragEnd}
                >
                  <SortableContext
                    items={tabs.map((t) => t.id)}
                    strategy={horizontalListSortingStrategy}
                  >
                    {tabs.map((tab) => {
                      const colors = getTabColorClasses(tab.color);
                      const isActive = tab.id === activeTabId;

                      return (
                        <SortableTab
                          key={tab.id}
                          id={tab.id}
                          name={tab.name}
                          isActive={isActive}
                          onSelect={() => setActiveTabId(tab.id)}
                          onMenuOpen={(e) => {
                            const rect =
                              e.currentTarget.getBoundingClientRect();
                            const menuW = 140;
                            let left = rect.left;
                            if (left + menuW > window.innerWidth - 8) {
                              left = window.innerWidth - menuW - 8;
                            }
                            setMenuPosition({
                              top: rect.bottom + 4,
                              left: Math.max(8, left),
                            });
                            setActiveTabMenu(
                              activeTabMenu === tab.id ? null : tab.id,
                            );
                          }}
                          colorDot={colors.bg}
                          activeTextClass={colors.text}
                        />
                      );
                    })}
                  </SortableContext>
                </DndContext>
              </div>
            </div>
          </div>

          {activeTabMenu && (
            <>
              <div
                className="fixed inset-0 z-[100]"
                onClick={() => setActiveTabMenu(null)}
              />
              {(() => {
                const tab = tabs.find((t) => t.id === activeTabMenu);
                if (!tab) return null;
                return (
                  <div
                    className="fixed z-[101] neu-card py-1 min-w-[140px]"
                    style={{ top: menuPosition.top, left: menuPosition.left }}
                  >
                    <button
                      onClick={() => {
                        setEditingTab({
                          id: tab.id,
                          name: tab.name,
                          color: tab.color,
                        });
                        setActiveTabMenu(null);
                      }}
                      className="w-full px-4 py-2.5 text-left text-sm neu-text-primary hover:bg-slate-100 flex items-center gap-2"
                    >
                      <Pencil size={14} /> Rename
                    </button>
                    {!PROTECTED_TAB_IDS.includes(tab.id) && (
                      <button
                        onClick={() => {
                          handleDeleteTab(tab.id);
                          setActiveTabMenu(null);
                        }}
                        className="w-full px-4 py-2.5 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                      >
                        <Trash2 size={14} /> Delete
                      </button>
                    )}
                  </div>
                );
              })()}
            </>
          )}

          {/* Content */}
          <main
            className="flex-1 min-h-0 overflow-auto p-4 md:p-6 mobile-scroll-pad"
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
          >
            {!activeTab ? (
              <div className="text-center py-16 neu-bg">
                <Users size={48} className="mx-auto neu-text-muted mb-4" />
                <p className="text-slate-500 mb-4">
                  Create a tab to manage clients
                </p>
                <button
                  onClick={() => setShowNewTabModal(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-sm font-medium transition-all"
                >
                  <FolderPlus size={16} /> Create first tab
                </button>
              </div>
            ) : (
              <div className="max-w-4xl mx-auto">
                {/* Tab Header */}
                <div className="flex flex-wrap items-center gap-2 mb-6">
                  <div className="flex items-center gap-3 mr-auto">
                    <div
                      className={`w-4 h-4 rounded-full ${getTabColorClasses(activeTab.color).bg}`}
                    />
                    <h2 className="text-xl font-bold neu-text-primary">
                      {activeTab.name}
                    </h2>
                    <span className="text-sm neu-text-secondary">
                      {searchQuery.trim() || statusFilter !== "all"
                        ? `(${activeClients.length}/${allActiveClients.length})`
                        : `(${activeClients.length})`}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {activeTabId === INDIVIDUAL_TAB_ID && (
                      <button
                        onClick={() => setShowBatchScan(true)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-medium transition-all active:scale-95 shadow"
                      >
                        <ScanLine size={14} /> 名刺スキャン
                      </button>
                    )}
                    <button
                      onClick={handleAddClient}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-medium transition-all active:scale-95 shadow"
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                </div>
                {/* Status Filter */}
                <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-1">
                  {[{ value: "all", label: "All" }, ...statusOptions].map(
                    (s) => (
                      <button
                        key={s.value}
                        onClick={() => setStatusFilter(s.value)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                          statusFilter === s.value
                            ? "neu-chip-active text-sky-600"
                            : "neu-chip neu-text-secondary"
                        }`}
                      >
                        {s.label}
                      </button>
                    ),
                  )}
                </div>

                {/* Clients */}
                {activeClients.length === 0 ? (
                  <div className="text-center py-12 neu-card">
                    {searchQuery.trim() ? (
                      <>
                        <Search
                          size={40}
                          className="mx-auto neu-text-muted mb-3"
                        />
                        <p className="text-slate-500 mb-2">
                          No results matching &quot;{searchQuery}&quot;
                        </p>
                        <button
                          onClick={() => setSearchQuery("")}
                          className="text-teal-600 hover:text-teal-700 text-sm font-medium"
                        >
                          Clear search
                        </button>
                      </>
                    ) : (
                      <>
                        <Users
                          size={40}
                          className="mx-auto neu-text-muted mb-3"
                        />
                        <p className="text-slate-500 mb-4">
                          No clients in this tab yet
                        </p>
                        <button
                          onClick={handleAddClient}
                          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-sm font-medium transition-all"
                        >
                          <Plus size={16} /> Add first client
                        </button>
                      </>
                    )}
                  </div>
                ) : (
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleClientDragEnd}
                  >
                    <SortableContext
                      items={activeClients.map((c) => c.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      <div className="space-y-4 no-select">
                        {[...activeClients]
                          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
                          .map((client) => (
                            <SortableWrapper key={client.id} id={client.id}>
                              {(dragHandleProps) => (
                                <ClientCard
                                  client={client}
                                  tabColor={activeTab.color}
                                  isIndividual={
                                    activeTabId === INDIVIDUAL_TAB_ID
                                  }
                                  corporateClients={corporateClients}
                                  linkedCorporate={getCorporateClient(
                                    client.corporateClientId,
                                  )}
                                  linkedIndividuals={getIndividualClientsByCorporate(
                                    client.id,
                                  )}
                                  onUpdate={updateClientWithHistory}
                                  onDeleteClick={(id) => setDeleteClientId(id)}
                                  dragHandleProps={dragHandleProps}
                                  ocrResult={ocrResults[client.id] ?? null}
                                  photoUrl={photoUrls[client.id] ?? null}
                                  photoUrlBack={
                                    photoUrlsBack[client.id] ?? null
                                  }
                                  onUploadPhoto={handleUploadPhoto}
                                  onRunOcr={handleRunOcr}
                                  onApplyOcr={handleApplyOcr}
                                  onDismissOcr={handleDismissOcr}
                                  isUploadingFront={
                                    processingClients[client.id]?.uploadFront ??
                                    false
                                  }
                                  isUploadingBack={
                                    processingClients[client.id]?.uploadBack ??
                                    false
                                  }
                                  isRunningOcr={
                                    processingClients[client.id]?.ocr ?? false
                                  }
                                />
                              )}
                            </SortableWrapper>
                          ))}
                        <div ref={clientListEndRef} />
                      </div>
                    </SortableContext>
                  </DndContext>
                )}
              </div>
            )}
          </main>

          {/* New Tab Modal */}
          {showNewTabModal &&
            createPortal(
              <div
                className="fixed inset-0 z-[60] bg-black/50 px-4 overflow-y-auto overscroll-contain flex justify-center"
                style={{
                  paddingTop: "calc(4rem + env(safe-area-inset-top, 0px))",
                  paddingBottom:
                    "calc(5rem + env(safe-area-inset-bottom, 0px))",
                }}
                onClick={(e) => {
                  if (e.target === e.currentTarget) setShowNewTabModal(false);
                }}
              >
                <div className="neu-modal w-full max-w-md max-h-[70svh] md:max-h-[calc(100dvh-4rem)] overflow-y-auto overscroll-contain my-auto">
                  <div className="flex items-center justify-between p-4 border-b border-slate-200 shrink-0">
                    <h3 className="text-lg font-semibold neu-text-primary">
                      Create New Tab
                    </h3>
                    <button
                      onClick={() => setShowNewTabModal(false)}
                      className="neu-btn p-1.5 neu-text-secondary"
                    >
                      <X size={20} />
                    </button>
                  </div>
                  <div className="p-4 space-y-4">
                    <div>
                      <label className="block text-sm font-medium neu-text-primary mb-1.5">
                        Tab Name
                      </label>
                      <input
                        type="text"
                        value={newTabName}
                        onChange={(e) => setNewTabName(e.target.value)}
                        placeholder="e.g., Partners, Leads..."
                        className="w-full px-4 py-2.5 neu-input"
                        autoFocus
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium neu-text-primary mb-1.5">
                        Color
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {TAB_COLORS.map((color) => (
                          <button
                            key={color.value}
                            onClick={() => setNewTabColor(color.value)}
                            className={`w-8 h-8 rounded-full ${color.bg} transition-all ${
                              newTabColor === color.value
                                ? "ring-2 ring-offset-2 ring-slate-400 scale-110"
                                : "hover:scale-105"
                            }`}
                            title={color.label}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-end gap-2 p-4 border-t border-slate-200 shrink-0">
                    <button
                      onClick={() => setShowNewTabModal(false)}
                      className="px-4 py-2 neu-text-secondary hover:bg-slate-100 rounded-lg transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleAddTab}
                      disabled={!newTabName.trim()}
                      className="px-4 py-2 bg-sky-600 hover:bg-sky-500 disabled:bg-slate-300 text-white rounded-lg transition-colors disabled:cursor-not-allowed"
                    >
                      Create
                    </button>
                  </div>
                </div>
              </div>,
              document.body,
            )}

          {/* Edit Tab Modal */}
          {editingTab &&
            createPortal(
              <div
                className="fixed inset-0 z-[60] bg-black/50 px-4 overflow-y-auto overscroll-contain flex justify-center"
                style={{
                  paddingTop: "calc(4rem + env(safe-area-inset-top, 0px))",
                  paddingBottom:
                    "calc(5rem + env(safe-area-inset-bottom, 0px))",
                }}
                onClick={(e) => {
                  if (e.target === e.currentTarget) setEditingTab(null);
                }}
              >
                <div className="neu-modal w-full max-w-md max-h-[70svh] md:max-h-[calc(100dvh-4rem)] overflow-y-auto overscroll-contain my-auto">
                  <div className="flex items-center justify-between p-4 border-b border-slate-200 shrink-0">
                    <h3 className="text-lg font-semibold neu-text-primary">
                      Edit Tab
                    </h3>
                    <button
                      onClick={() => setEditingTab(null)}
                      className="neu-btn p-1.5 neu-text-secondary"
                    >
                      <X size={20} />
                    </button>
                  </div>
                  <div className="p-4 space-y-4">
                    <div>
                      <label className="block text-sm font-medium neu-text-primary mb-1.5">
                        Tab Name
                      </label>
                      <input
                        type="text"
                        value={editingTab.name}
                        onChange={(e) =>
                          setEditingTab({ ...editingTab, name: e.target.value })
                        }
                        placeholder="Tab name..."
                        className="w-full px-4 py-2.5 neu-input"
                        autoFocus
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium neu-text-primary mb-1.5">
                        Color
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {TAB_COLORS.map((color) => (
                          <button
                            key={color.value}
                            onClick={() =>
                              setEditingTab({
                                ...editingTab,
                                color: color.value,
                              })
                            }
                            className={`w-8 h-8 rounded-full ${color.bg} transition-all ${
                              editingTab.color === color.value
                                ? "ring-2 ring-offset-2 ring-slate-400 scale-110"
                                : "hover:scale-105"
                            }`}
                            title={color.label}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-end gap-2 p-4 border-t border-slate-200 shrink-0">
                    <button
                      onClick={() => setEditingTab(null)}
                      className="px-4 py-2 neu-text-secondary hover:bg-slate-100 rounded-lg transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => {
                        if (editingTab.name.trim()) {
                          updateTabWithHistory(editingTab.id, {
                            name: editingTab.name,
                            color: editingTab.color,
                          });
                          setEditingTab(null);
                        }
                      }}
                      disabled={!editingTab.name.trim()}
                      className="px-4 py-2 bg-sky-600 hover:bg-sky-500 disabled:bg-slate-300 text-white rounded-lg transition-colors disabled:cursor-not-allowed"
                    >
                      Save
                    </button>
                  </div>
                </div>
              </div>,
              document.body,
            )}

          {/* Delete Tab Confirmation */}
          <ConfirmDialog
            isOpen={deleteTabId !== null}
            title="Delete Tab"
            message="Are you sure you want to delete this tab and all its clients? This action cannot be undone."
            confirmLabel="Delete"
            onConfirm={confirmDeleteTab}
            onCancel={() => setDeleteTabId(null)}
          />

          {/* Delete Client Confirmation */}
          <ConfirmDialog
            isOpen={deleteClientId !== null}
            title="Delete Client"
            message="Are you sure you want to delete this client? This action cannot be undone."
            confirmLabel="Delete"
            onConfirm={async () => {
              if (deleteClientId) {
                await removeClientWithHistory(deleteClientId);
                setDeleteClientId(null);
              }
            }}
            onCancel={() => setDeleteClientId(null)}
          />

          {/* Batch Card Scan Modal */}
          {showBatchScan && (
            <>
              <div
                className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40"
                onClick={handleCloseBatchScan}
              />
              <div className="fixed inset-x-0 bottom-0 md:inset-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 z-50 neu-bg rounded-t-2xl md:rounded-2xl md:w-[480px] md:max-h-[85vh] max-h-[90dvh] flex flex-col shadow-2xl">
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 shrink-0">
                  <h3 className="font-semibold text-sm neu-text-primary flex items-center gap-2">
                    <ScanLine size={16} className="text-violet-600" />
                    名刺スキャン
                  </h3>
                  <button
                    onClick={handleCloseBatchScan}
                    className="p-1.5 rounded-lg neu-text-muted hover:neu-text-secondary"
                  >
                    <X size={16} />
                  </button>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
                  {/* Hidden file inputs */}
                  <input
                    ref={batchFrontRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handleBatchFront}
                    className="hidden"
                  />
                  <input
                    ref={batchBackRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handleBatchBack}
                    className="hidden"
                  />

                  {/* Capture buttons */}
                  {batchStep === "front" && (
                    <button
                      onClick={() => batchFrontRef.current?.click()}
                      className="w-full flex flex-col items-center gap-3 py-8 border-2 border-dashed border-violet-300 rounded-xl hover:bg-violet-50 transition-colors"
                    >
                      <Camera size={32} className="text-violet-500" />
                      <span className="text-sm font-medium text-violet-600">
                        表面を撮影
                      </span>
                      <span className="text-xs neu-text-muted">
                        タップしてカメラを起動
                      </span>
                    </button>
                  )}

                  {batchStep === "back" && (
                    <div className="space-y-2">
                      <button
                        onClick={() => batchBackRef.current?.click()}
                        className="w-full flex flex-col items-center gap-3 py-8 border-2 border-dashed border-amber-300 rounded-xl hover:bg-amber-50 transition-colors"
                      >
                        <Camera size={32} className="text-amber-500" />
                        <span className="text-sm font-medium text-amber-600">
                          裏面を撮影
                        </span>
                      </button>
                      <button
                        onClick={handleBatchSkipBack}
                        className="w-full text-center text-xs neu-text-muted hover:neu-text-secondary py-2"
                      >
                        裏面をスキップ →
                      </button>
                    </div>
                  )}

                  {/* Scanned cards preview */}
                  {batchCards.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-medium neu-text-secondary">
                        スキャン済み ({batchCards.length}枚)
                      </p>
                      <div className="space-y-2">
                        {batchCards.map((card, i) => (
                          <div
                            key={i}
                            className="flex items-center gap-2 p-2 neu-card rounded-lg"
                          >
                            <img
                              src={card.frontPreview}
                              alt={`名刺${i + 1} 表`}
                              className="h-12 w-20 object-cover rounded border border-slate-200"
                            />
                            {card.backPreview && (
                              <img
                                src={card.backPreview}
                                alt={`名刺${i + 1} 裏`}
                                className="h-12 w-20 object-cover rounded border border-slate-200"
                              />
                            )}
                            <span className="flex-1 text-xs neu-text-secondary">
                              #{i + 1}
                              {card.back ? " (両面)" : " (表面のみ)"}
                            </span>
                            <button
                              onClick={() => handleBatchRemove(i)}
                              className="p-1 text-red-400 hover:text-red-600"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div className="shrink-0 border-t border-slate-200 px-4 py-3 flex items-center justify-between gap-2">
                  <span className="text-xs neu-text-muted">
                    {batchCards.length}枚
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleCloseBatchScan}
                      className="px-4 py-2 text-xs font-medium rounded-lg neu-btn neu-text-secondary"
                    >
                      キャンセル
                    </button>
                    <button
                      onClick={handleBatchRegister}
                      disabled={batchCards.length === 0 || batchProcessing}
                      className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg bg-violet-600 hover:bg-violet-500 text-white transition-colors disabled:opacity-50"
                    >
                      {batchProcessing ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <ScanLine size={14} />
                      )}
                      {batchProcessing
                        ? "登録中..."
                        : `${batchCards.length}枚を登録`}
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </Layout>
  );
};
