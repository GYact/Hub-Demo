import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useParams } from "react-router-dom";
import {
  Plus,
  Trash2,
  FolderKanban,
  Loader2,
  RefreshCw,
  X,
  FolderPlus,
  Pencil,
  ChevronDown,
  ChevronUp,
  GripVertical,
  Calendar,
  ArrowLeft,
  ArrowUpRight,
  Pin,
  Archive,
  Search,
} from "lucide-react";
import { DndContext, closestCenter, DragEndEvent } from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  horizontalListSortingStrategy,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import type {
  GroupColor,
  Project,
  ProjectTab,
  ProjectStatus,
  ProjectBudget,
  BudgetUnit,
} from "../types";
import { useProjects, projectStatusOptions } from "../hooks/useProjects";
import { useClients } from "../hooks/useClients";
import { useAuth } from "../contexts/AuthContext";
import { useUndoRedo } from "../contexts/UndoRedoContext";
import { Layout, ConfirmDialog, NumberInput, DatePicker } from "../components";
import { useUserSetting } from "../hooks/useUserSetting";
import { TAB_COLORS, getTabColorClasses } from "../utils/colors";
import { useSwipeableTabs } from "../hooks/useSwipeableTabs";
import { fetchProjects } from "../lib/offlineData";
import { useDndSensors } from "../hooks/useDndSensors";
import { SortableTab } from "../components/SortableTab";
import { SortableWrapper } from "../components/SortableWrapper";
import { formatCurrency } from "../lib/formatters";

const getStatusColor = (status: ProjectStatus) => {
  const option = projectStatusOptions.find((o) => o.value === status);
  if (!option) return "bg-slate-100 text-slate-700";

  switch (option.color) {
    case "blue":
      return "bg-blue-100 text-blue-700";
    case "emerald":
      return "bg-emerald-100 text-emerald-700";
    case "amber":
      return "bg-amber-100 text-amber-700";
    case "red":
      return "bg-red-100 text-red-700";
    default:
      return "bg-slate-100 text-slate-700";
  }
};

const budgetUnitOrder: BudgetUnit[] = ["once", "hourly", "monthly", "yearly"];
const budgetUnitLabels: Record<BudgetUnit, string> = {
  once: "One-time",
  hourly: "Hourly",
  monthly: "Monthly",
  yearly: "Yearly",
};
const budgetUnitSuffix: Record<BudgetUnit, string> = {
  once: "",
  hourly: "/hr",
  monthly: "/mo",
  yearly: "/yr",
};

const ProjectCard = ({
  project,
  tabColor,
  onUpdate,
  onDeleteClick,
  dragHandleProps,
  onOpen,
  hideBudget = false,
  isMemo = false,
}: {
  project: Project;
  tabColor: GroupColor;
  onUpdate: (id: string, updates: Partial<Project>) => void;
  onDeleteClick: (id: string) => void;
  dragHandleProps?: React.HTMLAttributes<HTMLDivElement>;
  onOpen?: () => void;
  hideBudget?: boolean;
  isMemo?: boolean;
}) => {
  const [isExpanded, setIsExpanded] = useState(!project.name);
  const colors = getTabColorClasses(tabColor);
  const budgets: ProjectBudget[] =
    Array.isArray(project.budgets) && project.budgets.length > 0
      ? (project.budgets as unknown[])
          .map((entry): ProjectBudget | null => {
            if (typeof entry === "number" && Number.isFinite(entry)) {
              return { amount: entry, unit: "once" };
            }
            if (entry && typeof entry === "object") {
              const raw = entry as { amount?: unknown; unit?: unknown };
              const amount =
                typeof raw.amount === "number" && Number.isFinite(raw.amount)
                  ? raw.amount
                  : 0;
              const unit =
                typeof raw.unit === "string" &&
                budgetUnitOrder.includes(raw.unit as BudgetUnit)
                  ? (raw.unit as BudgetUnit)
                  : "once";
              return { amount, unit };
            }
            return null;
          })
          .filter((entry): entry is ProjectBudget => entry !== null)
      : project.budget != null
        ? [{ amount: project.budget, unit: "once" }]
        : [];
  const currency = project.currency || "JPY";
  const budgetSummaryParts = budgetUnitOrder
    .map((unit) => {
      const unitBudgets = budgets.filter((budget) => budget.unit === unit);
      if (unitBudgets.length === 0) return null;
      const total = unitBudgets.reduce((sum, budget) => sum + budget.amount, 0);
      return `${formatCurrency(total, currency)}${budgetUnitSuffix[unit]}`;
    })
    .filter((value): value is string => value !== null);
  const budgetSummary = budgetSummaryParts.join(" / ");

  const updateBudgets = (nextBudgets: ProjectBudget[]) => {
    const normalized = nextBudgets.map((budget) => ({
      amount: Number.isFinite(budget.amount) ? budget.amount : 0,
      unit: budgetUnitOrder.includes(budget.unit) ? budget.unit : "once",
    }));
    const total =
      normalized.length > 0
        ? normalized.reduce((sum, budget) => sum + budget.amount, 0)
        : undefined;
    onUpdate(project.id, { budgets: normalized, budget: total });
  };

  const handleCardClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!onOpen || isExpanded) return;
    const target = event.target as HTMLElement;
    if (
      target.closest(
        "button, input, textarea, select, option, a, [data-no-open]",
      )
    ) {
      return;
    }
    onOpen();
  };

  return (
    <div
      className={`neu-card overflow-hidden ${
        onOpen && !isExpanded
          ? "cursor-pointer neu-card-hover transition-shadow"
          : ""
      } ${project.isArchived ? "opacity-60" : ""}`}
      onClick={handleCardClick}
    >
      <div className="p-4 md:p-5">
        <div className="flex items-start gap-3">
          {dragHandleProps && (
            <div
              {...dragHandleProps}
              data-no-open
              className="touch-none cursor-grab active:cursor-grabbing p-1 neu-text-muted hover:neu-text-secondary shrink-0 mt-1"
            >
              <GripVertical size={18} />
            </div>
          )}
          <div className={`${colors.bgLight} p-2 rounded-lg shrink-0`}>
            <FolderKanban size={20} className={colors.text} />
          </div>
          <div className="flex-1 min-w-0">
            {/* Title - full width on mobile */}
            {isExpanded ? (
              <textarea
                ref={(el) => {
                  if (el) {
                    el.style.height = "auto";
                    el.style.height = el.scrollHeight + "px";
                  }
                }}
                value={project.name}
                onChange={(e) => onUpdate(project.id, { name: e.target.value })}
                placeholder={isMemo ? "Memo name..." : "Project name..."}
                className="w-full text-base md:text-lg font-semibold neu-text-primary bg-transparent border-none outline-none placeholder:neu-text-muted focus:ring-0 resize-none overflow-hidden"
                rows={1}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    e.currentTarget.blur();
                  }
                }}
              />
            ) : (
              <p
                onClick={() => setIsExpanded(true)}
                className="text-base md:text-lg font-semibold neu-text-primary cursor-text line-clamp-2"
                title={project.name}
              >
                {project.name || (
                  <span className="neu-text-muted">
                    {isMemo ? "Memo name..." : "Project name..."}
                  </span>
                )}
              </p>
            )}
            {/* Status badge */}
            <div className="flex items-center gap-2 mt-1">
              <select
                value={project.status}
                onChange={(e) =>
                  onUpdate(project.id, {
                    status: e.target.value as ProjectStatus,
                  })
                }
                className={`text-xs px-2 py-1 rounded-full border-none outline-none cursor-pointer ${getStatusColor(project.status)}`}
              >
                {projectStatusOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Summary when collapsed - mobile: 2col grid, PC: single row */}
            {!isExpanded && (
              <div className="mt-2 text-sm neu-text-secondary space-y-1">
                <div className="grid grid-cols-2 md:flex md:flex-wrap md:items-center gap-x-3 gap-y-1">
                  {project.startDate && (
                    <span className="flex items-center gap-1 whitespace-nowrap">
                      <Calendar size={12} />
                      {project.startDate}
                    </span>
                  )}
                  {!hideBudget && budgetSummaryParts.length > 0 && (
                    <span className="whitespace-nowrap">
                      {budgetSummary}
                      {budgets.length > 1 ? ` (${budgets.length}x)` : ""}
                    </span>
                  )}
                </div>
                {project.description && (
                  <p className="neu-text-secondary whitespace-pre-wrap">
                    {project.description}
                  </p>
                )}
                {(project.progress ?? 0) > 0 && (
                  <div className="flex items-center gap-2 mt-1">
                    <div className="flex-1 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-sky-500 rounded-full transition-all"
                        style={{ width: `${project.progress}%` }}
                      />
                    </div>
                    <span className="text-xs neu-text-muted whitespace-nowrap">
                      {project.progress}%
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onUpdate(project.id, { isPinned: !project.isPinned });
              }}
              className={`p-2 neu-btn ${
                project.isPinned
                  ? "text-amber-500"
                  : "neu-text-muted hover:neu-text-secondary"
              }`}
              title={project.isPinned ? "Unpin" : "Pin"}
            >
              <Pin size={18} />
            </button>
            {onOpen && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onOpen();
                }}
                className="p-2 neu-text-muted hover:neu-text-secondary neu-btn"
                title="Open"
              >
                <ArrowUpRight size={18} />
              </button>
            )}
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="p-2 neu-text-muted hover:neu-text-secondary neu-btn"
              title={isExpanded ? "Collapse" : "Expand"}
            >
              {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (!isMemo && project.isArchived) {
                  onUpdate(project.id, { isArchived: false });
                } else {
                  onDeleteClick(project.id);
                }
              }}
              className={`p-2 neu-btn ${
                !isMemo && project.isArchived
                  ? "text-amber-500"
                  : "neu-text-muted hover:text-red-500"
              }`}
              title={
                isMemo ? "Delete" : project.isArchived ? "Restore" : "Archive"
              }
            >
              {!isMemo && project.isArchived ? (
                <Archive size={18} />
              ) : (
                <Trash2 size={18} />
              )}
            </button>
          </div>
        </div>

        {/* Expanded details - full width */}
        {isExpanded && (
          <div className="mt-4 space-y-3">
            {/* Progress slider */}
            <div>
              <label className="text-xs neu-text-secondary mb-1 block">
                Progress ({project.progress ?? 0}%)
              </label>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={project.progress ?? 0}
                onChange={(e) =>
                  onUpdate(project.id, {
                    progress: parseInt(e.target.value, 10),
                  })
                }
                className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-sky-500"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              <div className="min-w-0">
                <DatePicker
                  label="Start Date"
                  value={project.startDate || ""}
                  onChange={(value) =>
                    onUpdate(project.id, {
                      startDate: value || undefined,
                    })
                  }
                />
              </div>
              <div className="min-w-0">
                <DatePicker
                  label="End Date"
                  value={project.endDate || ""}
                  onChange={(value) =>
                    onUpdate(project.id, {
                      endDate: value || undefined,
                    })
                  }
                />
              </div>
              {!hideBudget && (
                <div className="min-w-0">
                  <label className="text-xs neu-text-secondary mb-1 block">
                    Currency
                  </label>
                  <select
                    value={project.currency || "JPY"}
                    onChange={(e) =>
                      onUpdate(project.id, { currency: e.target.value })
                    }
                    className="w-full min-w-0 px-3 py-2 text-sm neu-input"
                  >
                    <option value="JPY">JPY</option>
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                  </select>
                </div>
              )}
            </div>
            {!hideBudget && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs neu-text-secondary block">
                    Budgets
                  </label>
                  {budgetSummaryParts.length > 0 && (
                    <span className="text-xs neu-text-muted">
                      Total: {budgetSummary}
                    </span>
                  )}
                </div>
                <div className="space-y-2">
                  {budgets.length === 0 && (
                    <p className="text-xs neu-text-muted">No budgets yet.</p>
                  )}
                  {budgets.map((value, index) => (
                    <div
                      key={`${project.id}-budget-${index}`}
                      className="flex flex-col gap-1 md:flex-row md:items-center md:gap-2"
                    >
                      <div className="flex-1">
                        <NumberInput
                          value={
                            Number.isFinite(value.amount) ? value.amount : 0
                          }
                          onChange={(newValue) => {
                            const next = [...budgets];
                            next[index] = {
                              ...next[index],
                              amount: Number.isFinite(newValue) ? newValue : 0,
                            };
                            updateBudgets(next);
                          }}
                          min={0}
                          step={0.01}
                          placeholder="0"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <select
                          value={value.unit}
                          onChange={(e) => {
                            const next = [...budgets];
                            next[index] = {
                              ...next[index],
                              unit: e.target.value as BudgetUnit,
                            };
                            updateBudgets(next);
                          }}
                          className="flex-1 md:w-28 md:flex-none px-2 py-2 text-sm neu-input"
                          data-no-open
                        >
                          {budgetUnitOrder.map((unit) => (
                            <option key={unit} value={unit}>
                              {budgetUnitLabels[unit]}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => {
                            const next = budgets.filter(
                              (_, budgetIndex) => budgetIndex !== index,
                            );
                            updateBudgets(next);
                          }}
                          className="p-2 neu-text-muted hover:text-rose-500"
                          aria-label="Remove budget"
                          data-no-open
                        >
                          <X size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() =>
                    updateBudgets([...budgets, { amount: 0, unit: "once" }])
                  }
                  className="mt-2 inline-flex items-center gap-1 text-xs neu-text-secondary hover:neu-text-primary"
                  data-no-open
                >
                  <Plus size={14} />
                  Add budget
                </button>
              </div>
            )}
            <div>
              <label className="text-sm font-medium neu-text-primary mb-2 block">
                Memo
              </label>
              <textarea
                value={project.description || ""}
                onChange={(e) =>
                  onUpdate(project.id, { description: e.target.value })
                }
                placeholder={
                  isMemo
                    ? "Write memo..."
                    : "Write project memo, notes, progress..."
                }
                rows={6}
                className="w-full text-sm neu-text-secondary neu-input px-3 py-2 resize-y min-h-[120px]"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export const ProjectsPage = () => {
  useAuth();

  const navigate = useNavigate();
  const { projectId, clientId } = useParams();
  const isNested = Boolean(projectId);
  const isClientView = Boolean(clientId);
  const pageKey = projectId
    ? `projects:${projectId}`
    : clientId
      ? `projects:client:${clientId}`
      : "projects";

  const {
    tabs,
    projects,
    isLoading,
    isSyncing,
    addTab,
    updateTab,
    removeTab,
    addProject,
    updateProject,
    removeProject,
    getProjectsByTab,
    reorderTabs,
    reorderProjects,
    refresh,
    restoreState,
  } = useProjects(projectId ?? null);

  const { clients } = useClients();

  const [parentProject, setParentProject] = useState<Project | null>(null);
  const [isParentLoading, setIsParentLoading] = useState(false);

  useEffect(() => {
    if (!projectId) {
      setParentProject(null);
      setIsParentLoading(false);
      return;
    }

    let isMounted = true;
    setIsParentLoading(true);
    fetchProjects()
      .then((allProjects) => {
        if (!isMounted) return;
        const match =
          allProjects.find((project) => project.id === projectId) ?? null;
        setParentProject(match);
      })
      .finally(() => {
        if (!isMounted) return;
        setIsParentLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [projectId]);

  const { registerPage, unregisterPage, setCurrentPage, saveState } =
    useUndoRedo();
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setCurrentPage(pageKey);

    const getCurrentState = () => ({ tabs, projects });
    const handleRestore = async (state: unknown) => {
      const s = state as { tabs: ProjectTab[]; projects: Project[] };
      if (restoreState) {
        await restoreState(s);
      }
    };

    registerPage(pageKey, getCurrentState, handleRestore);
    return () => unregisterPage(pageKey);
  }, [
    tabs,
    projects,
    registerPage,
    unregisterPage,
    restoreState,
    setCurrentPage,
    pageKey,
  ]);

  const saveToHistory = useCallback(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(() => {
      saveState(pageKey);
    }, 500);
  }, [saveState, pageKey]);

  const addTabWithHistory = useCallback(
    async (name: string, color: GroupColor) => {
      const result = await addTab(name, color);
      saveToHistory();
      return result;
    },
    [addTab, saveToHistory],
  );

  const updateTabWithHistory = useCallback(
    (id: string, updates: Partial<ProjectTab>) => {
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

  const addProjectWithHistory = useCallback(
    async (tabId: string) => {
      const result = await addProject(tabId);
      saveToHistory();
      return result;
    },
    [addProject, saveToHistory],
  );

  const updateProjectWithHistory = useCallback(
    (id: string, updates: Partial<Project>) => {
      updateProject(id, updates);
      saveToHistory();
    },
    [updateProject, saveToHistory],
  );

  const [activeTabId, setActiveTabId] = useState<string | null>(null);

  const sensors = useDndSensors();

  const handleTabDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (over && active.id !== over.id) {
        const oldIndex = tabs.findIndex((t) => t.id === active.id);
        const newIndex = tabs.findIndex((t) => t.id === over.id);
        const newTabs = arrayMove(tabs, oldIndex, newIndex);
        reorderTabs(newTabs);
        saveToHistory();
      }
    },
    [tabs, reorderTabs, saveToHistory],
  );

  const handleProjectDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (over && active.id !== over.id && activeTabId) {
        const currentProjects = getProjectsByTab(activeTabId);
        const oldIndex = currentProjects.findIndex((p) => p.id === active.id);
        const newIndex = currentProjects.findIndex((p) => p.id === over.id);
        const newProjects = arrayMove(currentProjects, oldIndex, newIndex);
        reorderProjects(newProjects);
        saveToHistory();
      }
    },
    [activeTabId, getProjectsByTab, reorderProjects, saveToHistory],
  );

  const tabDeadlineStatus = useMemo(() => {
    const jstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
    const jstWeek = new Date(jstNow.getTime() + 7 * 24 * 60 * 60 * 1000);
    const todayStr = jstNow.toISOString().split("T")[0];
    const weekStr = jstWeek.toISOString().split("T")[0];

    const statusMap: Record<string, "overdue" | "approaching" | null> = {};
    for (const tab of tabs) {
      const tabProjects = getProjectsByTab(tab.id).filter(
        (p) =>
          !p.isArchived && p.status !== "completed" && p.status !== "cancelled",
      );
      let worst: "overdue" | "approaching" | null = null;
      for (const p of tabProjects) {
        if (!p.endDate) continue;
        if (p.endDate < todayStr) {
          worst = "overdue";
          break;
        }
        if (p.endDate <= weekStr) {
          worst = "approaching";
        }
      }
      statusMap[tab.id] = worst;
    }
    return statusMap;
  }, [tabs, getProjectsByTab]);

  const [showNewTabModal, setShowNewTabModal] = useState(false);
  const [newTabName, setNewTabName] = useState("");
  const [newTabColor, setNewTabColor] = useState<GroupColor>("blue");
  const [editingTab, setEditingTab] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [deleteTabId, setDeleteTabId] = useState<string | null>(null);
  const [activeTabMenu, setActiveTabMenu] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState<{
    top: number;
    left: number;
  }>({ top: 0, left: 0 });
  const [deleteProjectId, setDeleteProjectId] = useState<string | null>(null);

  // Ref for scrolling to newly added project
  const projectListEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (tabs.length === 0) {
      setActiveTabId(null);
      return;
    }
    if (!activeTabId || !tabs.some((tab) => tab.id === activeTabId)) {
      setActiveTabId(tabs[0].id);
    }
  }, [tabs, activeTabId]);

  const { value: projectStatusFilter, setValue: setProjectStatusFilter } =
    useUserSetting<string>("projects_filter_status", "all");
  const { value: showArchived, setValue: setShowArchived } =
    useUserSetting<boolean>("projects_show_archived", false);
  const { value: projectSearch, setValue: setProjectSearch } =
    useUserSetting<string>("projects_filter_search", "");

  const activeTab = tabs.find((t) => t.id === activeTabId);
  const allActiveProjects = useMemo(() => {
    if (!activeTabId) return [];
    let tabProjects = getProjectsByTab(activeTabId);
    if (clientId) {
      tabProjects = tabProjects.filter((p) => p.clientId === clientId);
    }
    if (!showArchived) {
      tabProjects = tabProjects.filter((p) => !p.isArchived);
    }
    // Sort: pinned first, then by order
    tabProjects.sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      return (a.order ?? 0) - (b.order ?? 0);
    });
    return tabProjects;
  }, [activeTabId, getProjectsByTab, clientId, showArchived]);

  const activeProjects = useMemo(() => {
    let filtered = allActiveProjects;
    if (projectStatusFilter !== "all") {
      filtered = filtered.filter((p) => p.status === projectStatusFilter);
    }
    if (projectSearch.trim()) {
      const q = projectSearch.toLowerCase();
      filtered = filtered.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.description?.toLowerCase().includes(q),
      );
    }
    return filtered;
  }, [allActiveProjects, projectStatusFilter, projectSearch]);

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

  const handleUpdateTab = () => {
    if (!editingTab || !editingTab.name.trim()) return;
    updateTabWithHistory(editingTab.id, { name: editingTab.name.trim() });
    setEditingTab(null);
  };

  const confirmDeleteTab = async () => {
    if (!deleteTabId) return;
    await removeTabWithHistory(deleteTabId);
    if (activeTabId === deleteTabId) {
      setActiveTabId(tabs.find((t) => t.id !== deleteTabId)?.id || null);
    }
    setDeleteTabId(null);
  };

  const handleAddProject = async () => {
    if (!activeTabId) return;
    await addProjectWithHistory(activeTabId);
    // Scroll to the newly added project
    setTimeout(() => {
      projectListEndRef.current?.scrollIntoView({ behavior: "smooth" });
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

  // Get current client if clientId is present
  const currentClient = useMemo(
    () => clients.find((c) => c.id === clientId),
    [clients, clientId],
  );

  const pageTitle = isNested
    ? parentProject?.name || "Project"
    : isClientView
      ? currentClient?.name || "Projects"
      : "Projects";

  const headerLeft = (
    <div className="flex items-center gap-0.5 md:gap-1">
      {(isNested || isClientView) && (
        <button
          onClick={() => navigate("/projects")}
          className="p-1.5 neu-btn neu-text-secondary hover:neu-text-primary transition-colors"
          title={isClientView ? "Back to Clients" : "Back to Projects"}
        >
          <ArrowLeft size={14} />
        </button>
      )}
      <button
        onClick={refresh}
        disabled={isSyncing}
        className="p-1.5 md:p-2 neu-text-secondary hover:neu-text-primary neu-btn rounded-lg transition-colors disabled:opacity-50"
        title="Refresh"
      >
        <RefreshCw
          size={16}
          className={`md:w-[18px] md:h-[18px] ${isSyncing ? "animate-spin" : ""}`}
        />
      </button>
    </div>
  );

  const headerCenter = (
    <button
      onClick={() => setShowNewTabModal(true)}
      className="flex items-center gap-1.5 md:gap-2 px-2.5 md:px-3 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs md:text-sm font-medium transition-all active:scale-95 shadow"
    >
      <FolderPlus size={16} />
      <span className="hidden sm:inline">
        {isNested ? "Add Memo" : "Add Tab"}
      </span>
    </button>
  );

  const showLoading = isLoading || (isNested && isParentLoading);

  if (!showLoading && isNested && !parentProject) {
    return (
      <Layout pageTitle="Project">
        <div className="h-full flex items-center justify-center">
          <div className="text-center space-y-4">
            <p className="neu-text-secondary">Project not found.</p>
            <button
              onClick={() => navigate("/projects")}
              className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-sm font-medium transition-all"
            >
              Back to Projects
            </button>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout
      pageTitle={pageTitle}
      headerLeft={headerLeft}
      headerCenter={headerCenter}
    >
      {showLoading ? (
        <div className="h-full flex items-center justify-center">
          <Loader2 size={32} className="animate-spin neu-text-secondary" />
        </div>
      ) : (
        <div className="flex-1 flex flex-col min-h-0">
          {/* Tabs */}
          <div className="shrink-0 neu-bg border-b border-slate-300 sticky top-0 z-30 no-select min-h-14">
            <div className="overflow-x-auto px-4 py-2 flex items-center h-full">
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleTabDragEnd}
              >
                <SortableContext
                  items={tabs.map((t) => t.id)}
                  strategy={horizontalListSortingStrategy}
                >
                  <div className="flex items-center gap-2 min-w-max">
                    {tabs.map((tab) => {
                      const colors = getTabColorClasses(tab.color);
                      return (
                        <SortableTab
                          key={tab.id}
                          id={tab.id}
                          name={tab.name}
                          isActive={tab.id === activeTabId}
                          colorDot={colors.bg}
                          activeTextClass={colors.text}
                          deadlineIndicator={tabDeadlineStatus[tab.id]}
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
                        />
                      );
                    })}
                  </div>
                </SortableContext>
              </DndContext>
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
                        setEditingTab({ id: tab.id, name: tab.name });
                        setActiveTabMenu(null);
                      }}
                      className="w-full px-4 py-2.5 text-left text-sm neu-text-primary hover:neu-pressed flex items-center gap-2"
                    >
                      <Pencil size={14} /> Rename
                    </button>
                    <button
                      onClick={() => {
                        handleDeleteTab(tab.id);
                        setActiveTabMenu(null);
                      }}
                      className="w-full px-4 py-2.5 text-left text-sm text-red-600 hover:neu-pressed flex items-center gap-2"
                    >
                      <Trash2 size={14} /> Delete
                    </button>
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
              <div className="text-center py-16">
                <FolderKanban
                  size={48}
                  className="mx-auto neu-text-muted mb-4"
                />
                <p className="neu-text-secondary mb-4">
                  {isNested
                    ? "Create a tab to start managing memos"
                    : "Create a tab to start managing projects"}
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
                      {projectStatusFilter !== "all" || projectSearch.trim()
                        ? `(${activeProjects.length}/${allActiveProjects.length})`
                        : `(${activeProjects.length})`}
                    </span>
                  </div>
                  <button
                    onClick={handleAddProject}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-medium transition-all active:scale-95 shadow"
                  >
                    <Plus size={14} />{" "}
                    {isNested
                      ? "Add Memo"
                      : isClientView
                        ? "Add Project"
                        : "Add Client"}
                  </button>
                </div>

                {/* Status Filter + Archive Toggle */}
                <div className="flex items-center gap-2 mb-3 overflow-x-auto pb-1">
                  {[
                    { value: "all", label: "All" },
                    ...projectStatusOptions,
                  ].map((s) => (
                    <button
                      key={s.value}
                      onClick={() => setProjectStatusFilter(s.value)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                        projectStatusFilter === s.value
                          ? "neu-chip-active text-sky-600"
                          : "neu-chip neu-text-secondary"
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                  <button
                    onClick={() => setShowArchived(!showArchived)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all flex items-center gap-1 ${
                      showArchived
                        ? "neu-chip-active text-sky-600"
                        : "neu-chip neu-text-secondary"
                    }`}
                  >
                    <Archive size={12} />
                    Archived
                  </button>
                </div>

                {/* Search */}
                <div className="relative mb-4">
                  <Search
                    size={14}
                    className="absolute left-3 top-1/2 -translate-y-1/2 neu-text-muted"
                  />
                  <input
                    type="text"
                    value={projectSearch}
                    onChange={(e) => setProjectSearch(e.target.value)}
                    placeholder={
                      isNested ? "Search memos..." : "Search projects..."
                    }
                    className="w-full sm:w-64 pl-9 pr-8 py-2 text-sm neu-input rounded-lg"
                  />
                  {projectSearch && (
                    <button
                      onClick={() => setProjectSearch("")}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 neu-text-muted hover:neu-text-secondary"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>

                {/* Projects */}
                {activeProjects.length === 0 ? (
                  <div className="text-center py-12 neu-card">
                    <FolderKanban
                      size={40}
                      className="mx-auto neu-text-muted mb-3"
                    />
                    <p className="neu-text-secondary mb-4">
                      {projectSearch.trim()
                        ? isNested
                          ? "No memos matching search"
                          : "No projects matching search"
                        : isNested
                          ? "No memos yet"
                          : "No projects in this tab yet"}
                    </p>
                    {!projectSearch.trim() && (
                      <button
                        onClick={handleAddProject}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-sm font-medium transition-all"
                      >
                        <Plus size={16} />{" "}
                        {isNested
                          ? "Add first memo"
                          : isClientView
                            ? "Add first project"
                            : "Add first client"}
                      </button>
                    )}
                  </div>
                ) : (
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleProjectDragEnd}
                  >
                    <SortableContext
                      items={activeProjects.map((p) => p.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      <div className="space-y-4 no-select">
                        {activeProjects.map((project) => (
                          <SortableWrapper key={project.id} id={project.id}>
                            {(dragHandleProps) => (
                              <ProjectCard
                                project={project}
                                tabColor={activeTab.color}
                                onUpdate={updateProjectWithHistory}
                                onDeleteClick={(id) => setDeleteProjectId(id)}
                                dragHandleProps={dragHandleProps}
                                onOpen={
                                  isNested
                                    ? undefined
                                    : () => navigate(`/projects/${project.id}`)
                                }
                                hideBudget={isNested}
                                isMemo={isNested}
                              />
                            )}
                          </SortableWrapper>
                        ))}
                        <div ref={projectListEndRef} />
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
                <div className="neu-modal w-full max-w-md max-h-[70svh] md:max-h-[calc(100dvh-8rem)] overflow-y-auto overscroll-contain my-auto">
                  <div className="flex items-center justify-between p-4 border-b border-slate-200 shrink-0">
                    <h3 className="text-lg font-semibold neu-text-primary">
                      Create New Tab
                    </h3>
                    <button
                      onClick={() => setShowNewTabModal(false)}
                      className="p-1.5 neu-btn neu-text-secondary"
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
                        placeholder="e.g., Client Work, Product..."
                        className="w-full px-4 py-2.5 neu-input rounded-xl"
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
                      className="px-4 py-2 neu-text-secondary neu-btn"
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

          {/* Rename Tab Modal */}
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
                <div className="neu-modal max-w-md w-full p-6 max-h-[70svh] md:max-h-[calc(100dvh-8rem)] overflow-y-auto overscroll-contain my-auto">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold neu-text-primary">
                      Rename Tab
                    </h3>
                    <button
                      onClick={() => setEditingTab(null)}
                      className="p-1 neu-btn"
                    >
                      <X size={20} className="neu-text-secondary" />
                    </button>
                  </div>
                  <input
                    type="text"
                    value={editingTab.name}
                    onChange={(e) =>
                      setEditingTab({ ...editingTab, name: e.target.value })
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                        e.preventDefault();
                        handleUpdateTab();
                      }
                    }}
                    placeholder="Tab name..."
                    className="w-full px-4 py-3 neu-input rounded-xl mb-4"
                    autoFocus
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => setEditingTab(null)}
                      className="px-4 py-2 neu-text-secondary neu-btn font-medium"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleUpdateTab}
                      disabled={!editingTab.name.trim()}
                      className="px-4 py-2 bg-sky-600 hover:bg-sky-500 disabled:bg-slate-300 text-white rounded-lg font-medium"
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
            message="Are you sure you want to delete this tab and all its projects? This action cannot be undone."
            confirmLabel="Delete"
            onConfirm={confirmDeleteTab}
            onCancel={() => setDeleteTabId(null)}
          />

          {/* Archive/Delete Confirmation */}
          <ConfirmDialog
            isOpen={deleteProjectId !== null}
            title={isNested ? "Delete Memo" : "Archive Project"}
            message={
              isNested
                ? "Are you sure you want to delete this memo? This action cannot be undone."
                : "Are you sure you want to archive this project? You can restore it later from the Archived filter."
            }
            confirmLabel={isNested ? "Delete" : "Archive"}
            onConfirm={async () => {
              if (deleteProjectId) {
                if (isNested) {
                  removeProject(deleteProjectId);
                } else {
                  updateProjectWithHistory(deleteProjectId, {
                    isArchived: true,
                  });
                }
                setDeleteProjectId(null);
              }
            }}
            onCancel={() => setDeleteProjectId(null)}
          />
        </div>
      )}
    </Layout>
  );
};
