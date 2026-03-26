import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Layout, ConfirmDialog } from "../components";
import {
  Plus,
  RefreshCw,
  Loader2,
  Settings,
  Laptop,
  FolderOpen,
  ExternalLink,
  FileText,
  Tag,
  ArrowUpDown,
  BookOpen,
} from "lucide-react";
import { useTools } from "../hooks/useTools";
import { useDataCatalogItems } from "../hooks/useDataCatalogItems";
import { useDevices } from "../hooks/useDevices";
import { useContracts, contractTypeOptions } from "../hooks/useContracts";
import { useUserSetting } from "../hooks/useUserSetting";
import { useUndoRedo } from "../contexts/UndoRedoContext";
import type { Tool, DataCatalogItem, Contract } from "../types";
import { DndContext, closestCenter, DragEndEvent } from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  verticalListSortingStrategy,
  horizontalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useDndSensors } from "../hooks/useDndSensors";
import { SortableWrapper } from "../components/SortableWrapper";
import { ToolCard, TOOL_CATEGORIES } from "../components/drive/ToolCard";
import { DeviceCard } from "../components/drive/DeviceCard";
import { CatalogCard } from "../components/drive/CatalogCard";
import { ContractCard } from "../components/money/ContractCard";
import { DriveFileList } from "../components/drive/DriveFileList";
import { DocumentsPanel } from "../components/drive/DocumentsPanel";

const DEFAULT_ITEMS: DataCatalogItem[] = [
  {
    id: "profile",
    label: "Profile & Career",
    description: "Bio, work history, skills",
    order: 0,
  },
  {
    id: "settings",
    label: "Settings & UI",
    description: "Display settings and menu layout",
    order: 1,
  },
  {
    id: "hub",
    label: "Hub (Org/Framework)",
    description: "Org chart and framework info",
    order: 2,
  },
  { id: "tools", label: "Tools", description: "Tool catalog", order: 3 },
  {
    id: "memos",
    label: "Memos",
    description: "Memos and notes storage",
    order: 4,
  },
  {
    id: "clients",
    label: "Clients",
    description: "Client and partner info",
    order: 5,
  },
  {
    id: "projects",
    label: "Projects",
    description: "Active projects and plans",
    order: 6,
  },
  {
    id: "tasks",
    label: "Tasks",
    description: "To-do and task management",
    order: 7,
  },
  { id: "journal", label: "Journal", description: "Daily records", order: 8 },
  {
    id: "money",
    label: "Finance",
    description: "Subscriptions, assets, expenses",
    order: 9,
  },
  {
    id: "ai",
    label: "AI Chat",
    description: "AI conversation logs",
    order: 10,
  },
  {
    id: "sync",
    label: "Sync Queue/Meta",
    description: "Sync status and queue",
    order: 11,
  },
];

type DriveTab = "catalog" | "tools" | "contracts" | "devices" | "documents";

type DriveSortOption =
  | "default"
  | "name-asc"
  | "name-desc"
  | "date-new"
  | "date-old";

const driveSortOptions: { value: DriveSortOption; label: string }[] = [
  { value: "default", label: "Default" },
  { value: "name-asc", label: "Name A-Z" },
  { value: "name-desc", label: "Name Z-A" },
  { value: "date-new", label: "Date ↓" },
  { value: "date-old", label: "Date ↑" },
];

export const DataPage = () => {
  const {
    items,
    isLoading: isCatalogLoading,
    isSyncing: isCatalogSyncing,
    updateItem,
    addItem: addCatalogItem,
    removeItem,
    reorderItems,
    refresh: refreshCatalog,
  } = useDataCatalogItems(DEFAULT_ITEMS);

  const { value: legacyLinks } = useUserSetting<Record<string, string>>(
    "data_links",
    {},
  );

  const {
    devices,
    isLoading: isDevicesLoading,
    isSyncing: isDevicesSyncing,
    addDevice,
    updateDevice,
    removeDevice,
    reorderDevices,
    refresh: refreshDevices,
  } = useDevices();

  const {
    tools,
    isLoading: isToolsLoading,
    isSyncing: isToolsSyncing,
    updateTool,
    addTool,
    removeTool,
    reorderTools,
    refreshTools,
    setTools,
  } = useTools();

  const {
    contracts,
    isLoading: isContractsLoading,
    isSyncing: isContractsSyncing,
    addContract,
    updateContract,
    removeContract,
    reorderContracts,
    uploadFile: uploadContractFile,
    deleteFile: deleteContractFile,
    getFileSignedUrl: getContractFileUrl,
    runOcr: runOcrContract,
    refresh: refreshContracts,
  } = useContracts();

  // Undo/Redo (tools only — preserve existing history)
  const { registerPage, unregisterPage, setCurrentPage, saveState } =
    useUndoRedo();
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!legacyLinks || Object.keys(legacyLinks).length === 0) return;
    items.forEach((item) => {
      if (!item.link && legacyLinks[item.id]) {
        updateItem(item.id, { link: legacyLinks[item.id] });
      }
    });
  }, [items, legacyLinks, updateItem]);

  useEffect(() => {
    setCurrentPage("tools");
    const getCurrentState = () => tools;
    const restoreState = async (state: unknown) => {
      const restoredTools = state as Tool[];
      if (setTools) setTools(restoredTools);
    };
    registerPage("tools", getCurrentState, restoreState);
    return () => unregisterPage("tools");
  }, [tools, registerPage, unregisterPage, setTools, setCurrentPage]);

  const saveToHistory = useCallback(() => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => saveState("tools"), 500);
  }, [saveState]);

  // ─── Tab state ───
  const [activeTab, setActiveTab] = useState<DriveTab>("catalog");
  const DEFAULT_TAB_ORDER: DriveTab[] = [
    "catalog",
    "tools",
    "contracts",
    "devices",
    "documents",
  ];
  const { value: tabOrder, setValue: setTabOrder } = useUserSetting<DriveTab[]>(
    "drive_tab_order",
    DEFAULT_TAB_ORDER,
  );

  // ─── Filters ───
  const { value: toolCategoryFilter, setValue: setToolCategoryFilter } =
    useUserSetting<string>("drive_filter_tool_category", "all");
  const { value: contractTypeFilter, setValue: setContractTypeFilter } =
    useUserSetting<string>("drive_filter_contract_type", "all");

  // ─── Sort states ───
  const { value: catalogSort, setValue: setCatalogSort } =
    useUserSetting<DriveSortOption>("drive_sort_catalog", "default");
  const { value: toolSort, setValue: setToolSort } =
    useUserSetting<DriveSortOption>("drive_sort_tool", "default");
  const { value: contractSort, setValue: setContractSort } =
    useUserSetting<DriveSortOption>("drive_sort_contract", "default");
  const { value: deviceSort, setValue: setDeviceSort } =
    useUserSetting<DriveSortOption>("drive_sort_device", "default");
  const { value: documentSort, setValue: setDocumentSort } =
    useUserSetting<DriveSortOption>("drive_sort_document", "default");

  const currentSort: Record<DriveTab, DriveSortOption> = {
    catalog: catalogSort,
    tools: toolSort,
    contracts: contractSort,
    devices: deviceSort,
    documents: documentSort,
  };
  const setSortForTab = (tab: DriveTab, val: DriveSortOption) => {
    switch (tab) {
      case "catalog":
        return setCatalogSort(val);
      case "tools":
        return setToolSort(val);
      case "contracts":
        return setContractSort(val);
      case "devices":
        return setDeviceSort(val);
      case "documents":
        return setDocumentSort(val);
    }
  };

  // ─── Delete confirmations ───
  const [deleteCatalogItemId, setDeleteCatalogItemId] = useState<string | null>(
    null,
  );
  const [deleteToolId, setDeleteToolId] = useState<string | null>(null);
  const [deleteContractId, setDeleteContractId] = useState<string | null>(null);
  const [deleteDeviceId, setDeleteDeviceId] = useState<string | null>(null);

  // ─── Sort helper ───
  const applySortGeneric = <T,>(
    list: T[],
    sort: DriveSortOption,
    getName: (item: T) => string,
    getDate: (item: T) => string | undefined,
  ): T[] => {
    if (sort === "default") return list;
    return [...list].sort((a, b) => {
      switch (sort) {
        case "name-asc":
          return getName(a).localeCompare(getName(b));
        case "name-desc":
          return getName(b).localeCompare(getName(a));
        case "date-new":
          return (getDate(b) || "").localeCompare(getDate(a) || "");
        case "date-old":
          return (getDate(a) || "").localeCompare(getDate(b) || "");
        default:
          return 0;
      }
    });
  };

  // ─── Filtered + sorted lists ───
  const filteredCatalogItems = useMemo(
    () =>
      applySortGeneric(
        items,
        catalogSort,
        (i) => i.label,
        (i) => i.createdAt,
      ),
    [items, catalogSort],
  );

  const filteredTools = useMemo(() => {
    let list = tools;
    if (toolCategoryFilter !== "all")
      list = list.filter((t) => {
        const cat = t.category || "";
        return toolCategoryFilter === "uncategorized"
          ? cat === ""
          : cat === toolCategoryFilter;
      });
    return applySortGeneric(
      list,
      toolSort,
      (t) => t.name,
      (t) => t.createdAt,
    );
  }, [tools, toolCategoryFilter, toolSort]);

  const filteredContracts = useMemo(() => {
    let list = contracts;
    if (contractTypeFilter !== "all")
      list = list.filter((c) => c.contractType === contractTypeFilter);
    return applySortGeneric(
      list,
      contractSort,
      (c) => c.title,
      (c) => c.createdAt,
    );
  }, [contracts, contractTypeFilter, contractSort]);

  const filteredDevices = useMemo(
    () =>
      applySortGeneric(
        devices,
        deviceSort,
        (d) => d.name,
        (d) => d.createdAt,
      ),
    [devices, deviceSort],
  );

  // ─── Handlers ───
  const handleUpdateTool = useCallback(
    (id: string, updates: Partial<Tool>) => {
      updateTool(id, updates);
      saveToHistory();
    },
    [updateTool, saveToHistory],
  );

  const handleAddTool = async () => {
    await addTool();
    saveToHistory();
  };

  const handleRemoveTool = useCallback((id: string) => {
    setDeleteToolId(id);
  }, []);

  const confirmRemoveTool = useCallback(() => {
    if (deleteToolId) {
      removeTool(deleteToolId);
      saveToHistory();
      setDeleteToolId(null);
    }
  }, [deleteToolId, removeTool, saveToHistory]);

  const handleAddContract = useCallback(async () => {
    await addContract();
  }, [addContract]);

  const handleUpdateContract = useCallback(
    (id: string, updates: Partial<Contract>) => {
      updateContract(id, updates);
    },
    [updateContract],
  );

  const handleRemoveContract = useCallback((id: string) => {
    setDeleteContractId(id);
  }, []);

  const confirmRemoveContract = useCallback(async () => {
    if (deleteContractId) {
      await removeContract(deleteContractId);
      setDeleteContractId(null);
    }
  }, [deleteContractId, removeContract]);

  const handleAddDevice = () => {
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2, 10);
    addDevice({ id, name: "", description: "" });
  };

  const handleAddItem = () => {
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2, 10);
    addCatalogItem({
      id,
      label: "",
      description: "",
      link: "",
      order: items.length,
    });
  };

  const handleRefresh = useCallback(() => {
    refreshCatalog();
    refreshTools();
    refreshContracts();
    refreshDevices();
  }, [refreshCatalog, refreshTools, refreshContracts, refreshDevices]);

  const sensors = useDndSensors();

  const handleTabDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = tabOrder.indexOf(active.id as DriveTab);
    const newIndex = tabOrder.indexOf(over.id as DriveTab);
    if (oldIndex === -1 || newIndex === -1) return;
    setTabOrder(arrayMove(tabOrder, oldIndex, newIndex));
  };

  const handleDataDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = filteredCatalogItems.findIndex((i) => i.id === active.id);
    const newIndex = filteredCatalogItems.findIndex((i) => i.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    reorderItems(arrayMove(items, oldIndex, newIndex));
  };

  const handleToolsDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = tools.findIndex((t) => t.id === active.id);
    const newIndex = tools.findIndex((t) => t.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    reorderTools(arrayMove(tools, oldIndex, newIndex));
  };

  const handleContractsDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = contracts.findIndex((c) => c.id === active.id);
    const newIndex = contracts.findIndex((c) => c.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    reorderContracts(arrayMove(contracts, oldIndex, newIndex));
  };

  const handleDevicesDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = devices.findIndex((d) => d.id === active.id);
    const newIndex = devices.findIndex((d) => d.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    reorderDevices(arrayMove(devices, oldIndex, newIndex));
  };

  // ─── Add actions ───
  const addActions: Record<DriveTab, { fn: () => void; label: string } | null> =
    {
      catalog: { fn: handleAddItem, label: "Add Item" },
      tools: { fn: handleAddTool, label: "Add Tool" },
      contracts: { fn: handleAddContract, label: "Add Contract" },
      devices: { fn: handleAddDevice, label: "Add Device" },
      documents: null,
    };

  // ─── Loading state ───
  const allLoading =
    isCatalogLoading &&
    isToolsLoading &&
    isContractsLoading &&
    isDevicesLoading;
  const allSyncing =
    isCatalogSyncing ||
    isToolsSyncing ||
    isContractsSyncing ||
    isDevicesSyncing;

  // ─── Tab config ───
  const tabConfigMap: Record<
    DriveTab,
    { icon: React.ElementType; label: string; color: string; count: number }
  > = {
    catalog: {
      icon: FolderOpen,
      label: "Data",
      color: "text-emerald-600",
      count: items.length,
    },
    tools: {
      icon: Settings,
      label: "Tools",
      color: "text-amber-600",
      count: tools.length,
    },
    contracts: {
      icon: FileText,
      label: "Contracts",
      color: "text-teal-600",
      count: contracts.length,
    },
    devices: {
      icon: Laptop,
      label: "Devices",
      color: "text-sky-600",
      count: devices.length,
    },
    documents: {
      icon: BookOpen,
      label: "Docs",
      color: "text-violet-600",
      count: 0,
    },
  };

  const sortedTabs = tabOrder
    .filter((key) => key in tabConfigMap)
    .map((key) => ({ key, ...tabConfigMap[key] }));

  const gradientMap: Record<DriveTab, string> = {
    catalog: "from-emerald-500 to-teal-500",
    tools: "from-amber-500 to-orange-500",
    contracts: "from-teal-500 to-cyan-500",
    devices: "from-sky-500 to-blue-500",
    documents: "from-violet-500 to-purple-500",
  };

  // ─── Header slots ───
  const headerLeft = (
    <button
      onClick={handleRefresh}
      disabled={allSyncing}
      className="p-1.5 md:p-2 neu-text-secondary hover:neu-text-primary neu-btn rounded-lg transition-colors disabled:opacity-50"
      title="Refresh"
    >
      <RefreshCw
        size={16}
        className={`md:w-[18px] md:h-[18px] ${allSyncing ? "animate-spin" : ""}`}
      />
    </button>
  );

  const currentAddAction = addActions[activeTab];
  const headerCenter = currentAddAction ? (
    <button
      onClick={currentAddAction.fn}
      className="flex items-center gap-1.5 md:gap-2 px-2.5 md:px-3 py-2 rounded-lg text-white text-xs md:text-sm font-medium transition-all active:scale-95 shadow bg-sky-600 hover:bg-sky-500"
    >
      <Plus size={16} />
      <span className="hidden sm:inline">{currentAddAction.label}</span>
    </button>
  ) : undefined;

  // ─── Summary ───
  const renderSummary = () => {
    switch (activeTab) {
      case "catalog":
        return (
          <div className="max-w-5xl mx-auto grid grid-cols-2 gap-3 md:gap-4">
            <div className="bg-white/20 backdrop-blur-sm rounded-xl p-3 md:p-4">
              <div className="flex items-center gap-1.5 text-white/80 text-xs md:text-sm mb-1">
                <FileText size={14} className="shrink-0 md:w-4 md:h-4" />
                <span className="truncate">Items</span>
              </div>
              <div className="text-xl md:text-3xl font-bold text-white">
                {items.length}
              </div>
              <div className="text-white/60 text-[10px] md:text-xs mt-1">
                total entries
              </div>
            </div>
            <div className="bg-white/20 backdrop-blur-sm rounded-xl p-3 md:p-4">
              <div className="flex items-center gap-1.5 text-white/80 text-xs md:text-sm mb-1">
                <ExternalLink size={14} className="shrink-0 md:w-4 md:h-4" />
                <span className="truncate">Linked</span>
              </div>
              <div className="text-xl md:text-3xl font-bold text-white">
                {items.filter((i) => i.link?.trim()).length}
              </div>
              <div className="text-white/60 text-[10px] md:text-xs mt-1">
                with links
              </div>
            </div>
          </div>
        );
      case "tools":
        return (
          <div className="max-w-5xl mx-auto grid grid-cols-2 gap-3 md:gap-4">
            <div className="bg-white/20 backdrop-blur-sm rounded-xl p-3 md:p-4">
              <div className="flex items-center gap-1.5 text-white/80 text-xs md:text-sm mb-1">
                <Settings size={14} className="shrink-0 md:w-4 md:h-4" />
                <span className="truncate">Tools</span>
              </div>
              <div className="text-xl md:text-3xl font-bold text-white">
                {tools.length}
              </div>
              <div className="text-white/60 text-[10px] md:text-xs mt-1">
                registered
              </div>
            </div>
            <div className="bg-white/20 backdrop-blur-sm rounded-xl p-3 md:p-4">
              <div className="flex items-center gap-1.5 text-white/80 text-xs md:text-sm mb-1">
                <Tag size={14} className="shrink-0 md:w-4 md:h-4" />
                <span className="truncate">Categories</span>
              </div>
              <div className="text-xl md:text-3xl font-bold text-white">
                {new Set(tools.map((t) => t.category || "")).size}
              </div>
              <div className="text-white/60 text-[10px] md:text-xs mt-1">
                in use
              </div>
            </div>
          </div>
        );
      case "contracts":
        return (
          <div className="max-w-5xl mx-auto grid grid-cols-2 gap-3 md:gap-4">
            <div className="bg-white/20 backdrop-blur-sm rounded-xl p-3 md:p-4">
              <div className="flex items-center gap-1.5 text-white/80 text-xs md:text-sm mb-1">
                <FileText size={14} className="shrink-0 md:w-4 md:h-4" />
                <span className="truncate">Contracts</span>
              </div>
              <div className="text-xl md:text-3xl font-bold text-white">
                {contracts.length}
              </div>
              <div className="text-white/60 text-[10px] md:text-xs mt-1">
                total documents
              </div>
            </div>
            <div className="bg-white/20 backdrop-blur-sm rounded-xl p-3 md:p-4">
              <div className="flex items-center gap-1.5 text-white/80 text-xs md:text-sm mb-1">
                <Tag size={14} className="shrink-0 md:w-4 md:h-4" />
                <span className="truncate">With Files</span>
              </div>
              <div className="text-xl md:text-3xl font-bold text-white">
                {contracts.filter((c) => c.storagePath).length}
              </div>
              <div className="text-white/60 text-[10px] md:text-xs mt-1">
                uploaded
              </div>
            </div>
          </div>
        );
      case "devices":
        return (
          <div className="max-w-5xl mx-auto grid grid-cols-2 gap-3 md:gap-4">
            <div className="bg-white/20 backdrop-blur-sm rounded-xl p-3 md:p-4">
              <div className="flex items-center gap-1.5 text-white/80 text-xs md:text-sm mb-1">
                <Laptop size={14} className="shrink-0 md:w-4 md:h-4" />
                <span className="truncate">Devices</span>
              </div>
              <div className="text-xl md:text-3xl font-bold text-white">
                {devices.length}
              </div>
              <div className="text-white/60 text-[10px] md:text-xs mt-1">
                registered
              </div>
            </div>
            <div className="bg-white/20 backdrop-blur-sm rounded-xl p-3 md:p-4 opacity-0">
              {/* placeholder for grid alignment */}
            </div>
          </div>
        );
      case "documents":
        return (
          <div className="max-w-5xl mx-auto grid grid-cols-2 gap-3 md:gap-4">
            <div className="bg-white/20 backdrop-blur-sm rounded-xl p-3 md:p-4">
              <div className="flex items-center gap-1.5 text-white/80 text-xs md:text-sm mb-1">
                <BookOpen size={14} className="shrink-0 md:w-4 md:h-4" />
                <span className="truncate">Documents</span>
              </div>
              <div className="text-xl md:text-3xl font-bold text-white">
                Auto
              </div>
              <div className="text-white/60 text-[10px] md:text-xs mt-1">
                agenda generation
              </div>
            </div>
            <div className="bg-white/20 backdrop-blur-sm rounded-xl p-3 md:p-4 opacity-0">
              {/* placeholder for grid alignment */}
            </div>
          </div>
        );
    }
  };

  // ─── Filter chips ───
  const renderFilterChips = () => {
    switch (activeTab) {
      case "catalog":
      case "devices":
      case "documents":
        return null;
      case "contracts":
        return [{ value: "all", label: "All" }, ...contractTypeOptions].map(
          (t) => (
            <button
              key={t.value}
              onClick={() => setContractTypeFilter(t.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                contractTypeFilter === t.value
                  ? "neu-chip-active text-sky-600"
                  : "neu-chip neu-text-secondary"
              }`}
            >
              {t.label}
              {t.value !== "all" && (
                <span className="ml-1 text-[10px] opacity-60">
                  ({contracts.filter((c) => c.contractType === t.value).length})
                </span>
              )}
            </button>
          ),
        );
      case "tools": {
        const cats = [
          { value: "all", label: "All" },
          ...TOOL_CATEGORIES.map((c) => ({
            value: c.value === "" ? "uncategorized" : c.value,
            label: c.label,
          })),
        ];
        return cats.map((cat) => (
          <button
            key={cat.value}
            onClick={() => setToolCategoryFilter(cat.value)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
              toolCategoryFilter === cat.value
                ? "neu-chip-active text-sky-600"
                : "neu-chip neu-text-secondary"
            }`}
          >
            {cat.label}
            {cat.value !== "all" && (
              <span className="ml-1 text-[10px] opacity-60">
                (
                {
                  tools.filter((t) =>
                    cat.value === "uncategorized"
                      ? !t.category || t.category === ""
                      : t.category === cat.value,
                  ).length
                }
                )
              </span>
            )}
          </button>
        ));
      }
    }
  };

  // ─── Card lists ───
  const renderCardList = () => {
    switch (activeTab) {
      case "catalog":
        return filteredCatalogItems.length === 0 ? (
          <div className="text-center py-16 neu-card">
            <FolderOpen size={48} className="mx-auto neu-text-muted mb-4" />
            <p className="neu-text-secondary mb-4">No catalog items yet</p>
            <button
              onClick={handleAddItem}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-sm font-medium transition-all"
            >
              <Plus size={16} /> Add first item
            </button>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDataDragEnd}
          >
            <SortableContext
              items={filteredCatalogItems.map((i) => i.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-4 no-select">
                {filteredCatalogItems.map((item) => (
                  <SortableWrapper key={item.id} id={item.id}>
                    {(dragHandleProps) => (
                      <CatalogCard
                        item={item}
                        onUpdate={updateItem}
                        onDelete={setDeleteCatalogItemId}
                        dragHandleProps={
                          currentSort[activeTab] === "default"
                            ? dragHandleProps
                            : undefined
                        }
                      />
                    )}
                  </SortableWrapper>
                ))}
              </div>
            </SortableContext>
          </DndContext>
        );

      case "tools":
        return isToolsLoading ? (
          <div className="neu-card p-6 flex items-center justify-center gap-2 neu-text-secondary">
            <Loader2 size={18} className="animate-spin" />
            Loading tools...
          </div>
        ) : filteredTools.length === 0 ? (
          <div className="text-center py-16 neu-card">
            <Settings size={48} className="mx-auto neu-text-muted mb-4" />
            <p className="neu-text-secondary mb-4">
              {tools.length === 0
                ? "No tools yet"
                : "No tools in this category"}
            </p>
            {tools.length === 0 && (
              <button
                onClick={handleAddTool}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-sm font-medium transition-all"
              >
                <Plus size={16} /> Add first tool
              </button>
            )}
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleToolsDragEnd}
          >
            <SortableContext
              items={filteredTools.map((t) => t.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-4 no-select">
                {filteredTools.map((tool) => (
                  <SortableWrapper key={tool.id} id={tool.id}>
                    {(dragHandleProps) => (
                      <ToolCard
                        tool={tool}
                        onUpdate={handleUpdateTool}
                        onDelete={handleRemoveTool}
                        dragHandleProps={
                          currentSort[activeTab] === "default"
                            ? dragHandleProps
                            : undefined
                        }
                      />
                    )}
                  </SortableWrapper>
                ))}
              </div>
            </SortableContext>
          </DndContext>
        );

      case "contracts":
        return (
          <div className="space-y-6">
            {/* Google Drive 98_Contract folder */}
            <DriveFileList folderName="96_Contracts" />

            {/* Local contracts */}
            {isContractsLoading ? (
              <div className="neu-card p-6 flex items-center justify-center gap-2 neu-text-secondary">
                <Loader2 size={18} className="animate-spin" />
                Loading contracts...
              </div>
            ) : filteredContracts.length === 0 ? (
              <div className="text-center py-16 neu-card">
                <FileText size={48} className="mx-auto neu-text-muted mb-4" />
                <p className="neu-text-secondary mb-4">
                  {contracts.length === 0
                    ? "No contracts yet"
                    : "No contracts of this type"}
                </p>
                {contracts.length === 0 && (
                  <button
                    onClick={handleAddContract}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-sm font-medium transition-all"
                  >
                    <Plus size={16} /> Add first contract
                  </button>
                )}
              </div>
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleContractsDragEnd}
              >
                <SortableContext
                  items={filteredContracts.map((c) => c.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-4 no-select">
                    {filteredContracts.map((contract) => (
                      <SortableWrapper key={contract.id} id={contract.id}>
                        {(dragHandleProps) => (
                          <ContractCard
                            contract={contract}
                            onUpdate={handleUpdateContract}
                            onDelete={handleRemoveContract}
                            onUploadFile={uploadContractFile}
                            onDeleteFile={deleteContractFile}
                            onGetFileUrl={getContractFileUrl}
                            onRunOcr={runOcrContract}
                            dragHandleProps={
                              currentSort[activeTab] === "default"
                                ? dragHandleProps
                                : undefined
                            }
                          />
                        )}
                      </SortableWrapper>
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}
          </div>
        );

      case "devices":
        return isDevicesLoading ? (
          <div className="neu-card p-6 flex items-center justify-center gap-2 neu-text-secondary">
            <Loader2 size={18} className="animate-spin" />
            Loading devices...
          </div>
        ) : filteredDevices.length === 0 ? (
          <div className="text-center py-16 neu-card">
            <Laptop size={48} className="mx-auto neu-text-muted mb-4" />
            <p className="neu-text-secondary mb-4">No devices yet</p>
            <button
              onClick={handleAddDevice}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-sm font-medium transition-all"
            >
              <Plus size={16} /> Add first device
            </button>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDevicesDragEnd}
          >
            <SortableContext
              items={filteredDevices.map((d) => d.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-4 no-select">
                {filteredDevices.map((device) => (
                  <SortableWrapper key={device.id} id={device.id}>
                    {(dragHandleProps) => (
                      <DeviceCard
                        device={device}
                        onUpdate={updateDevice}
                        onDelete={setDeleteDeviceId}
                        dragHandleProps={
                          currentSort[activeTab] === "default"
                            ? dragHandleProps
                            : undefined
                        }
                      />
                    )}
                  </SortableWrapper>
                ))}
              </div>
            </SortableContext>
          </DndContext>
        );

      case "documents":
        return <DocumentsPanel />;
    }
  };

  // ─── Render ───
  return (
    <Layout
      pageTitle="Drive"
      headerLeft={headerLeft}
      headerCenter={headerCenter}
    >
      {allLoading ? (
        <div className="h-full flex items-center justify-center">
          <Loader2 size={32} className="animate-spin neu-text-secondary" />
        </div>
      ) : (
        <>
          <div className="h-full flex flex-col neu-bg">
            {/* Summary Cards */}
            <div
              className={`shrink-0 bg-gradient-to-r ${gradientMap[activeTab]} p-4 md:p-6`}
            >
              {renderSummary()}
            </div>

            {/* Tabs (drag to reorder) */}
            <div
              className="shrink-0 neu-bg px-4"
              style={{ boxShadow: "0 4px 6px rgba(163, 177, 198, 0.4)" }}
            >
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleTabDragEnd}
              >
                <SortableContext
                  items={sortedTabs.map((t) => t.key)}
                  strategy={horizontalListSortingStrategy}
                >
                  <div className="max-w-5xl mx-auto flex gap-2 py-2 overflow-x-auto">
                    {sortedTabs.map((tab) => {
                      const TabIcon = tab.icon;
                      return (
                        <SortableWrapper key={tab.key} id={tab.key}>
                          {(dragHandleProps) => (
                            <button
                              onClick={() => setActiveTab(tab.key)}
                              className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all shrink-0 cursor-grab active:cursor-grabbing ${
                                activeTab === tab.key
                                  ? `neu-pressed ${tab.color}`
                                  : "neu-btn neu-text-secondary"
                              }`}
                              {...dragHandleProps}
                            >
                              <TabIcon size={18} />
                              <span className="hidden sm:inline">
                                {tab.label}
                              </span>
                              <span className="text-xs neu-badge">
                                {tab.count}
                              </span>
                            </button>
                          )}
                        </SortableWrapper>
                      );
                    })}
                  </div>
                </SortableContext>
              </DndContext>
            </div>

            {/* Content */}
            <main className="flex-1 min-h-0 overflow-auto p-4 md:p-6 mobile-scroll-pad">
              <div className="max-w-5xl mx-auto">
                {/* Filter Chips + Sort */}
                <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-1">
                  {renderFilterChips()}
                  <div className="ml-auto flex items-center gap-1 shrink-0">
                    <ArrowUpDown size={14} className="neu-text-muted" />
                    <select
                      value={currentSort[activeTab]}
                      onChange={(e) =>
                        setSortForTab(
                          activeTab,
                          e.target.value as DriveSortOption,
                        )
                      }
                      className="px-2 py-1.5 rounded-lg text-xs font-medium neu-input"
                    >
                      {driveSortOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                {renderCardList()}
              </div>
            </main>
          </div>

          {/* Confirm Dialogs */}
          <ConfirmDialog
            isOpen={deleteCatalogItemId !== null}
            title="Delete Catalog Item"
            message={`Are you sure you want to delete "${items.find((i) => i.id === deleteCatalogItemId)?.label || ""}"?`}
            confirmLabel="Delete"
            onConfirm={() => {
              if (deleteCatalogItemId) {
                removeItem(deleteCatalogItemId);
                setDeleteCatalogItemId(null);
              }
            }}
            onCancel={() => setDeleteCatalogItemId(null)}
          />
          <ConfirmDialog
            isOpen={deleteToolId !== null}
            title="Delete Tool"
            message={`Are you sure you want to delete "${tools.find((t) => t.id === deleteToolId)?.name || ""}"?`}
            confirmLabel="Delete"
            onConfirm={confirmRemoveTool}
            onCancel={() => setDeleteToolId(null)}
          />
          <ConfirmDialog
            isOpen={deleteContractId !== null}
            title="Delete Contract"
            message={`Are you sure you want to delete "${contracts.find((c) => c.id === deleteContractId)?.title || ""}"?`}
            confirmLabel="Delete"
            onConfirm={confirmRemoveContract}
            onCancel={() => setDeleteContractId(null)}
          />
          <ConfirmDialog
            isOpen={deleteDeviceId !== null}
            title="Delete Device"
            message={`Are you sure you want to delete "${devices.find((d) => d.id === deleteDeviceId)?.name || ""}"?`}
            confirmLabel="Delete"
            onConfirm={() => {
              if (deleteDeviceId) {
                removeDevice(deleteDeviceId);
                setDeleteDeviceId(null);
              }
            }}
            onCancel={() => setDeleteDeviceId(null)}
          />
        </>
      )}
    </Layout>
  );
};
