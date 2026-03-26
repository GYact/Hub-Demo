import { useState, useRef, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import {
  Plus,
  Trash2,
  CheckCircle2,
  Circle,
  ChevronDown,
  RefreshCw,
  Calendar,
  FileText,
  ListTodo,
  Pencil,
  X,
  MoreHorizontal,
  ChevronUp,
  Star,
  Clock,
  Repeat,
  ListTree,
  GripVertical,
  Minus,
  Filter,
  FolderKanban,
  Loader2,
} from "lucide-react";
import { DndContext, closestCenter, DragEndEvent } from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  horizontalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useTasks, Task, RepeatType } from "../hooks/useTasks";
import { Layout, ConfirmDialog, DatePicker, TimePicker } from "../components";
import { useAuth } from "../contexts/AuthContext";
import {
  requestNotificationPermission,
  rescheduleAllNotifications,
} from "../lib/taskNotifications";
import { registerPushSubscription } from "../lib/pushNotifications";
import { useUserSetting } from "../hooks/useUserSetting";
import { useTaskDividers } from "../hooks/useTaskDividers";
import type { TaskDivider as BaseTaskDivider } from "../types";
import { offlineDb } from "../lib/offlineDb";
import { fetchAllNestedMemos } from "../lib/offlineData";
import type { Project } from "../types";
import { useDndSensors } from "../hooks/useDndSensors";
import { SortableTab } from "../components/SortableTab";
import { SortableWrapper } from "../components/SortableWrapper";
import { ErrorBanner } from "../components/ErrorBanner";

import { useSwipeableTabs } from "../hooks/useSwipeableTabs";

// Repeat options
const REPEAT_OPTIONS: { value: RepeatType; label: string }[] = [
  { value: "none", label: "No repeat" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
];

// Format date for input
const formatDateForInput = (dateStr?: string) => {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  return date.toISOString().split("T")[0];
};

const formatDate = (dateStr?: string) => {
  if (!dateStr) return null;
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
};

// Check if a task is overdue (due_date < today and not completed)
const isOverdue = (task: Task) => {
  if (!task.due_date || task.status === "completed") return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueDate = new Date(task.due_date);
  dueDate.setHours(0, 0, 0, 0);
  return dueDate < today;
};

type DividerColor = "rose" | "amber" | "emerald" | "sky" | "violet";

type TaskDivider = BaseTaskDivider;

const DIVIDER_COLORS: Record<DividerColor, { line: string; dot: string }> = {
  rose: { line: "bg-rose-400", dot: "bg-rose-500" },
  amber: { line: "bg-amber-400", dot: "bg-amber-500" },
  emerald: { line: "bg-emerald-400", dot: "bg-emerald-500" },
  sky: { line: "bg-sky-400", dot: "bg-sky-500" },
  violet: { line: "bg-violet-400", dot: "bg-violet-500" },
};

const toDividerId = (id: string) => `divider-${id}`;
const isDividerId = (id: string) => id.startsWith("divider-");

// Task Item Component
const TaskItem = ({
  task,
  listId,
  isStarred,
  subtasks,
  isSubtask = false,
  onComplete,
  onUncomplete,
  onDelete,
  onUpdate,
  onToggleStar,
  onAddSubtask,
  dragHandleProps,
}: {
  task: Task;
  listId: string;
  isStarred: boolean;
  subtasks: Task[];
  isSubtask?: boolean;
  onComplete: (listId: string, taskId: string) => void;
  onUncomplete: (listId: string, taskId: string) => void;
  onDelete: (listId: string, taskId: string) => void;
  onUpdate: (listId: string, taskId: string, updates: Partial<Task>) => void;
  onToggleStar: (taskId: string) => void;
  onAddSubtask: (parentId: string, title: string) => void;
  dragHandleProps?: React.HTMLAttributes<HTMLDivElement>;
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [editTitle, setEditTitle] = useState(task.title);
  const [editNotes, setEditNotes] = useState(task.notes || "");
  const [editDue, setEditDue] = useState(formatDateForInput(task.due_date));
  const [editTime, setEditTime] = useState(task.due_time || "");
  const [editRepeat, setEditRepeat] = useState<RepeatType>(
    task.repeat_type || "none",
  );
  const [newSubtaskTitle, setNewSubtaskTitle] = useState("");
  const [showSubtaskInput, setShowSubtaskInput] = useState(false);
  const isCompleted = task.status === "completed";

  const handleTitleSave = () => {
    if (editTitle.trim() !== task.title) {
      onUpdate(listId, task.id, { title: editTitle.trim() });
    }
  };

  const handleNotesSave = () => {
    if (editNotes !== (task.notes || "")) {
      onUpdate(listId, task.id, { notes: editNotes });
    }
  };

  const handleDueSave = (newValue: string) => {
    const currentDue = formatDateForInput(task.due_date);
    if (newValue !== currentDue) {
      if (newValue) {
        onUpdate(listId, task.id, { due_date: newValue });
      } else {
        onUpdate(listId, task.id, { due_date: undefined });
      }
    }
  };

  const handleTimeSave = (newValue: string) => {
    if (newValue !== (task.due_time || "")) {
      onUpdate(listId, task.id, { due_time: newValue || undefined });
    }
  };

  const handleRepeatChange = (value: RepeatType) => {
    setEditRepeat(value);
    onUpdate(listId, task.id, {
      repeat_type: value === "none" ? undefined : value,
    });
  };

  const handleAddSubtask = () => {
    if (!newSubtaskTitle.trim()) return;
    onAddSubtask(task.id, newSubtaskTitle.trim());
    setNewSubtaskTitle("");
    setShowSubtaskInput(false);
  };

  return (
    <div
      className={`neu-card overflow-hidden transition-all ${
        isCompleted
          ? "opacity-60"
          : isOverdue(task)
            ? "ring-2 ring-red-300 bg-red-50/30"
            : isStarred
              ? "ring-2 ring-amber-300"
              : ""
      }`}
    >
      <div className="p-4">
        <div className="flex items-start gap-3">
          {dragHandleProps && (
            <div
              {...dragHandleProps}
              className="touch-none cursor-grab active:cursor-grabbing p-2 md:p-1 text-slate-300 hover:text-slate-500 transition-colors shrink-0 mt-0.5"
            >
              <GripVertical size={18} />
            </div>
          )}
          <button
            onClick={() =>
              isCompleted
                ? onUncomplete(listId, task.id)
                : onComplete(listId, task.id)
            }
            className={`mt-0.5 shrink-0 transition-colors ${
              isCompleted
                ? "text-emerald-500 hover:text-emerald-600"
                : "text-slate-300 hover:text-emerald-500"
            }`}
          >
            {isCompleted ? <CheckCircle2 size={22} /> : <Circle size={22} />}
          </button>

          <div className="flex-1 min-w-0">
            <div className="flex items-start gap-2 flex-wrap sm:flex-nowrap">
              {isExpanded ? (
                <textarea
                  ref={(el) => {
                    if (el) {
                      el.style.height = "auto";
                      el.style.height = el.scrollHeight + "px";
                    }
                  }}
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  onBlur={handleTitleSave}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      e.currentTarget.blur();
                    }
                  }}
                  className={`flex-1 min-w-0 text-base neu-text-primary font-medium bg-transparent border-none outline-none focus:ring-0 resize-none overflow-hidden ${
                    isCompleted ? "line-through" : ""
                  }`}
                  placeholder="Task title..."
                  rows={1}
                />
              ) : (
                <span
                  onClick={() => setIsExpanded(true)}
                  className={`flex-1 min-w-0 text-base neu-text-primary font-medium cursor-text truncate ${
                    isCompleted ? "line-through" : ""
                  }`}
                  title={editTitle}
                >
                  {editTitle || (
                    <span className="text-slate-400">Task title...</span>
                  )}
                </span>
              )}
              <button
                onClick={() => onToggleStar(task.id)}
                className={`p-1 shrink-0 transition-colors ${
                  isStarred
                    ? "text-amber-500 hover:text-amber-600"
                    : "text-slate-300 hover:text-amber-500"
                }`}
                title={isStarred ? "Remove star" : "Add star"}
              >
                <Star size={16} fill={isStarred ? "currentColor" : "none"} />
              </button>
            </div>

            {task.notes && (
              <p className="text-sm text-slate-500 mt-1 whitespace-pre-wrap">
                {task.notes}
              </p>
            )}

            {/* Summary - mobile: 2col grid, PC: single row */}
            {!isExpanded && (
              <div className="grid grid-cols-2 md:flex md:items-center md:flex-wrap gap-x-3 gap-y-1 mt-2 text-xs text-slate-400">
                {task.due_date && (
                  <span
                    className={`flex items-center gap-1 whitespace-nowrap ${
                      isOverdue(task) ? "text-red-500 font-medium" : ""
                    }`}
                  >
                    <Calendar size={12} />
                    {formatDate(task.due_date)}
                    {isOverdue(task) && (
                      <span className="text-[10px]">Overdue</span>
                    )}
                  </span>
                )}
                {task.due_time && (
                  <span className="flex items-center gap-1 whitespace-nowrap">
                    <Clock size={12} />
                    {task.due_time}
                  </span>
                )}
                {task.repeat_type && task.repeat_type !== "none" && (
                  <span className="flex items-center gap-1 text-sky-500 whitespace-nowrap">
                    <Repeat size={12} />
                    {
                      REPEAT_OPTIONS.find((r) => r.value === task.repeat_type)
                        ?.label
                    }
                  </span>
                )}
                {subtasks.length > 0 && (
                  <span className="flex items-center gap-1 text-purple-500 whitespace-nowrap">
                    <ListTree size={12} />
                    {subtasks.filter((s) => s.status === "completed").length}/
                    {subtasks.length}
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            >
              {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
            <button
              onClick={() => onDelete(listId, task.id)}
              className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Expanded Details */}
      {isExpanded && (
        <div className="px-4 pb-4 pt-0 border-t border-slate-100">
          {/* Date & Time Row */}
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <DatePicker
                label="Due Date"
                value={editDue}
                onChange={(value) => {
                  setEditDue(value);
                  handleDueSave(value);
                }}
              />
            </div>
            <div>
              <TimePicker
                label="Time"
                value={editTime}
                onChange={(value) => {
                  setEditTime(value);
                  handleTimeSave(value);
                }}
              />
            </div>
          </div>

          {/* Repeat */}
          <div className="mt-3">
            <label className="text-xs font-medium text-slate-500 mb-1 block">
              Repeat
            </label>
            <select
              value={editRepeat}
              onChange={(e) => handleRepeatChange(e.target.value as RepeatType)}
              className="w-full text-sm neu-text-secondary neu-input rounded-lg px-3 py-2"
            >
              {REPEAT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Notes */}
          <div className="mt-3">
            <label className="text-xs font-medium text-slate-500 mb-1 block">
              Notes
            </label>
            <textarea
              value={editNotes}
              onChange={(e) => setEditNotes(e.target.value)}
              onBlur={handleNotesSave}
              placeholder="Add notes..."
              rows={2}
              className="w-full text-sm neu-text-secondary neu-input rounded-lg px-3 py-2 resize-y"
            />
          </div>

          {/* Subtasks */}
          {!isSubtask && (
            <div className="mt-3">
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-medium text-slate-500">
                  Subtasks
                </label>
                {!showSubtaskInput && (
                  <button
                    onClick={() => setShowSubtaskInput(true)}
                    className="text-xs text-sky-600 hover:text-sky-700 flex items-center gap-1"
                  >
                    <Plus size={12} /> Add
                  </button>
                )}
              </div>

              {/* Add Subtask Input */}
              {showSubtaskInput && (
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={newSubtaskTitle}
                    onChange={(e) => setNewSubtaskTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                        e.preventDefault();
                        handleAddSubtask();
                      }
                    }}
                    placeholder="Subtask title..."
                    className="flex-1 text-sm neu-input rounded-lg px-3 py-1.5"
                    autoFocus
                  />
                  <button
                    onClick={handleAddSubtask}
                    disabled={!newSubtaskTitle.trim()}
                    className="px-3 py-1.5 bg-sky-600 hover:bg-sky-500 disabled:bg-slate-300 text-white text-sm rounded-lg"
                  >
                    Add
                  </button>
                  <button
                    onClick={() => {
                      setShowSubtaskInput(false);
                      setNewSubtaskTitle("");
                    }}
                    className="px-2 py-1.5 text-slate-500 hover:text-slate-700"
                  >
                    <X size={16} />
                  </button>
                </div>
              )}

              {/* Subtask List */}
              {subtasks.length > 0 && (
                <div className="space-y-1 pl-2 border-l-2 border-slate-200">
                  {subtasks.map((subtask) => (
                    <div
                      key={subtask.id}
                      className="flex items-center gap-2 py-1"
                    >
                      <button
                        onClick={() =>
                          subtask.status === "completed"
                            ? onUncomplete(listId, subtask.id)
                            : onComplete(listId, subtask.id)
                        }
                        className={`shrink-0 transition-colors ${
                          subtask.status === "completed"
                            ? "text-emerald-500"
                            : "text-slate-300 hover:text-emerald-500"
                        }`}
                      >
                        {subtask.status === "completed" ? (
                          <CheckCircle2 size={16} />
                        ) : (
                          <Circle size={16} />
                        )}
                      </button>
                      <span
                        className={`flex-1 text-sm ${
                          subtask.status === "completed"
                            ? "line-through text-slate-400"
                            : "text-slate-700"
                        }`}
                      >
                        {subtask.title}
                      </span>
                      <button
                        onClick={() => onDelete(listId, subtask.id)}
                        className="text-slate-300 hover:text-red-500 transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const SortableTaskDivider = ({
  divider,
  onRemove,
  onColorChange,
}: {
  divider: TaskDivider;
  onRemove: (id: string) => void;
  onColorChange: (id: string, color: DividerColor) => void;
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: toDividerId(divider.id) });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  const color =
    DIVIDER_COLORS[divider.color as DividerColor] ?? DIVIDER_COLORS.rose;

  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (event: MouseEvent) => {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  return (
    <div ref={setNodeRef} style={style} className="px-2">
      <div className="relative py-3">
        <div
          className={`absolute left-0 right-0 top-1/2 -translate-y-1/2 h-0.5 ${color.line} rounded-full shadow-[0_0_0_1px_rgba(15,23,42,0.06)] pointer-events-none`}
        />
        <div
          {...attributes}
          {...listeners}
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 cursor-grab active:cursor-grabbing touch-none px-2 z-10"
          title="Drag to move divider"
          aria-label="Drag to move divider"
        >
          <div className={`h-2 w-12 rounded-full ${color.line} opacity-80`} />
        </div>
        <div
          ref={menuRef}
          className="absolute right-0 top-1/2 -translate-y-1/2 z-10"
        >
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setMenuOpen((prev) => !prev);
            }}
            onPointerDown={(event) => event.stopPropagation()}
            className="p-1.5 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100"
            title="Divider menu"
            aria-label="Divider menu"
          >
            <MoreHorizontal size={14} />
          </button>
          {menuOpen && (
            <div
              className="absolute right-0 mt-2 w-40 neu-card p-2 z-20"
              onPointerDown={(event) => event.stopPropagation()}
            >
              <div className="text-xs text-slate-500 px-2 py-1">Color</div>
              <div className="flex items-center gap-2 px-2 pb-2">
                {Object.entries(DIVIDER_COLORS).map(([key, value]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      onColorChange(divider.id, key as DividerColor);
                      setMenuOpen(false);
                    }}
                    className={`h-3 w-3 rounded-full ${value.dot} ${divider.color === key ? "ring-2 ring-slate-400" : ""}`}
                    title={`Set ${key} divider`}
                  />
                ))}
              </div>
              <button
                type="button"
                onClick={() => {
                  onRemove(divider.id);
                  setMenuOpen(false);
                }}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-red-600 hover:bg-red-50"
              >
                <Minus size={12} />
                Remove divider
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Task Form Modal
const TaskFormModal = ({
  isOpen,
  onClose,
  onSubmit,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (title: string, notes?: string, due?: string) => void;
}) => {
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [dueTime, setDueTime] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    let dueDateTime = undefined;
    if (dueDate) {
      if (dueTime) {
        dueDateTime = new Date(`${dueDate}T${dueTime}:00`).toISOString();
      } else {
        dueDateTime = new Date(dueDate).toISOString();
      }
    }

    onSubmit(title.trim(), notes.trim() || undefined, dueDateTime);
    setTitle("");
    setNotes("");
    setDueDate("");
    setDueTime("");
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[60] bg-black/50 px-4 overflow-y-auto overscroll-contain flex justify-center"
      style={{
        paddingTop: "calc(4rem + env(safe-area-inset-top, 0px))",
        paddingBottom: "calc(5rem + env(safe-area-inset-bottom, 0px))",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="neu-modal w-full max-w-md max-h-[70svh] md:max-h-[calc(100dvh-4rem)] overflow-y-auto overscroll-contain my-auto">
        <div className="flex items-center justify-between p-4 border-b border-slate-200 shrink-0">
          <h3 className="text-lg font-semibold neu-text-primary">Add Task</h3>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-lg text-slate-500"
          >
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-4 min-w-0">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Task title..."
              className="w-full px-4 py-2.5 neu-input rounded-xl"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-full min-w-0">
            <div className="min-w-0">
              <DatePicker
                label="Due Date"
                value={dueDate}
                onChange={setDueDate}
              />
            </div>
            <div className="min-w-0">
              <TimePicker label="Time" value={dueTime} onChange={setDueTime} />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add notes..."
              rows={3}
              className="w-full px-4 py-2.5 neu-input rounded-xl resize-y"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!title.trim()}
              className="px-4 py-2 bg-sky-600 hover:bg-sky-500 disabled:bg-slate-300 text-white rounded-lg transition-colors disabled:cursor-not-allowed flex items-center gap-2"
            >
              Create Task
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
};

export const TasksPage = () => {
  const { user } = useAuth();
  const {
    taskLists,
    selectedListId,
    setSelectedListId,
    error,
    activeTasks,
    completedTasks,
    overdueCount,
    isSyncing,
    isLoadingTasks,
    createTask,
    completeTask,
    uncompleteTask,
    deleteTask,
    updateTask,
    createTaskList,
    updateTaskList,
    deleteTaskList,
    toggleStar,
    isStarred,
    getSubtasks,
    reorderTasks,
    reorderTaskLists,
    refresh,
  } = useTasks();
  const { value: dividerPositions } = useUserSetting<Record<string, number>>(
    "tasks_divider_positions",
    {},
  );
  const { value: dividerVisibility } = useUserSetting<Record<string, boolean>>(
    "tasks_divider_visibility",
    {},
  );
  const { value: taskFilter, setValue: setTaskFilter } = useUserSetting<string>(
    "tasks_filter",
    "all",
  );
  const {
    dividersByList,
    dividerListIds,
    updateDividers,
    removeDividersForList,
    isLoading: dividersLoading,
    refresh: refreshDividers,
  } = useTaskDividers();

  const sensors = useDndSensors();

  const [showTaskModal, setShowTaskModal] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);
  const [showListModal, setShowListModal] = useState(false);
  const [showProjectMemosModal, setShowProjectMemosModal] = useState(false);
  const [projectMemoGroups, setProjectMemoGroups] = useState<
    {
      parentProjectId: string;
      parentProjectName: string;
      memos: (Project & { projectName?: string })[];
    }[]
  >([]);
  const [isLoadingMemos, setIsLoadingMemos] = useState(false);
  const [editingList, setEditingList] = useState<{
    id: string;
    title: string;
  } | null>(null);
  const [newListTitle, setNewListTitle] = useState("");
  const [activeListMenu, setActiveListMenu] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState<{
    top: number;
    left: number;
  }>({ top: 0, left: 0 });
  const [deleteListId, setDeleteListId] = useState<string | null>(null);
  const [deleteTaskInfo, setDeleteTaskInfo] = useState<{
    listId: string;
    taskId: string;
  } | null>(null);
  const [notificationPermission, setNotificationPermission] = useState<
    NotificationPermission | "unsupported"
  >(() => {
    if (typeof window === "undefined") {
      return "default";
    }
    if (!("Notification" in window)) {
      return "unsupported";
    }
    return Notification.permission;
  });
  const [isRequestingNotifications, setIsRequestingNotifications] =
    useState(false);

  // Ref for scrolling to newly added task
  const taskListEndRef = useRef<HTMLDivElement>(null);
  const rawListDividers = selectedListId
    ? (dividersByList[selectedListId] ?? [])
    : [];
  // Clamp divider positions synchronously to avoid race conditions.
  // The previous useEffect-based clamping could persist wrong positions
  // when activeTasks was stale during list transitions.
  const listDividers = useMemo(() => {
    if (rawListDividers.length === 0 || activeTasks.length === 0)
      return rawListDividers;
    const max = activeTasks.length;
    if (rawListDividers.every((d) => d.position >= 0 && d.position <= max))
      return rawListDividers;
    return rawListDividers.map((d) => ({
      ...d,
      position: Math.min(Math.max(d.position, 0), max),
    }));
  }, [rawListDividers, activeTasks]);
  const hasDividerEntry = selectedListId
    ? dividerListIds.has(selectedListId)
    : false;

  useEffect(() => {
    let active = true;
    const ensureDivider = async () => {
      if (dividersLoading) return;
      if (isLoadingTasks) return;
      if (!selectedListId) return;
      if (hasDividerEntry) return;

      // If local DB already has dividers for this list, refresh instead of creating a new default.
      const existing = await offlineDb.task_dividers
        .where("list_id")
        .equals(selectedListId)
        .toArray();
      if (!active) return;
      if (existing.length > 0) {
        refreshDividers();
        return;
      }

      const legacyVisible = dividerVisibility[selectedListId] ?? true;
      if (!legacyVisible) return;
      const storedIndex = dividerPositions[selectedListId];
      const fallbackIndex = Math.min(2, activeTasks.length);
      const normalized =
        typeof storedIndex === "number" ? storedIndex : fallbackIndex;
      const position = Math.min(Math.max(normalized, 0), activeTasks.length);
      const divider: TaskDivider = {
        id: Math.random().toString(36).slice(2, 10),
        listId: selectedListId,
        position,
        color: "rose",
        createdAt: new Date().toISOString(),
      };
      updateDividers(selectedListId, [divider]);
    };
    ensureDivider();
    return () => {
      active = false;
    };
  }, [
    activeTasks.length,
    dividerPositions,
    dividerVisibility,
    dividersLoading,
    hasDividerEntry,
    isLoadingTasks,
    selectedListId,
    updateDividers,
    refreshDividers,
  ]);

  const handleCompleteTask = async (listId: string, taskId: string) => {
    if (listId === selectedListId && listDividers.length > 0) {
      const taskIndex = activeTasks.findIndex((task) => task.id === taskId);
      if (taskIndex !== -1) {
        const nextDividers = listDividers.map((divider) =>
          taskIndex < divider.position
            ? { ...divider, position: divider.position - 1 }
            : divider,
        );
        updateDividers(listId, nextDividers);
      }
    }
    return completeTask(listId, taskId);
  };

  const handleUncompleteTask = async (listId: string, taskId: string) => {
    if (listId === selectedListId && listDividers.length > 0) {
      const task = completedTasks.find((item) => item.id === taskId);
      if (task) {
        const insertionIndex = activeTasks.findIndex(
          (item) => item.position > task.position,
        );
        const insertAt =
          insertionIndex === -1 ? activeTasks.length : insertionIndex;
        const nextDividers = listDividers.map((divider) =>
          insertAt <= divider.position
            ? { ...divider, position: divider.position + 1 }
            : divider,
        );
        updateDividers(listId, nextDividers);
      }
    }
    return uncompleteTask(listId, taskId);
  };

  const handleDeleteTask = (listId: string, taskId: string) => {
    setDeleteTaskInfo({ listId, taskId });
  };

  const confirmDeleteTask = async () => {
    if (!deleteTaskInfo) return;
    const { listId, taskId } = deleteTaskInfo;
    if (listId === selectedListId && listDividers.length > 0) {
      const taskIndex = activeTasks.findIndex((task) => task.id === taskId);
      if (taskIndex !== -1) {
        const nextDividers = listDividers.map((divider) =>
          taskIndex < divider.position
            ? { ...divider, position: divider.position - 1 }
            : divider,
        );
        updateDividers(listId, nextDividers);
      }
    }
    await deleteTask(listId, taskId);
    setDeleteTaskInfo(null);
  };

  const addDivider = () => {
    if (!selectedListId) return;
    const nextDivider: TaskDivider = {
      id: Math.random().toString(36).slice(2, 10),
      listId: selectedListId,
      position: activeTasks.length,
      color: "rose",
      createdAt: new Date().toISOString(),
    };
    updateDividers(selectedListId, [...listDividers, nextDivider]);
  };

  const removeDivider = (dividerId: string) => {
    if (!selectedListId) return;
    updateDividers(
      selectedListId,
      listDividers.filter((divider) => divider.id !== dividerId),
    );
  };

  const updateDividerColor = (dividerId: string, color: DividerColor) => {
    if (!selectedListId) return;
    updateDividers(
      selectedListId,
      listDividers.map((divider) =>
        divider.id === dividerId ? { ...divider, color } : divider,
      ),
    );
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("Notification" in window)) {
      setNotificationPermission("unsupported");
      return;
    }
    setNotificationPermission(Notification.permission);
  }, []);

  const handleEnableNotifications = async () => {
    if (!user || isRequestingNotifications) return;
    setIsRequestingNotifications(true);
    const granted = await requestNotificationPermission();
    if (!("Notification" in window)) {
      setNotificationPermission("unsupported");
      setIsRequestingNotifications(false);
      return;
    }
    setNotificationPermission(Notification.permission);
    if (granted) {
      await registerPushSubscription(user.id);
      await rescheduleAllNotifications(user.id);
    }
    setIsRequestingNotifications(false);
  };

  const handleCreateTask = async (
    title: string,
    notes?: string,
    due?: string,
  ) => {
    if (!selectedListId) return;
    await createTask(selectedListId, title, notes, due);
    setShowTaskModal(false);
    // Scroll to the newly added task
    setTimeout(() => {
      taskListEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 100);
  };

  const handleCreateList = async () => {
    if (!newListTitle.trim()) return;
    await createTaskList(newListTitle.trim());
    setNewListTitle("");
    setShowListModal(false);
  };

  const handleUpdateList = async () => {
    if (!editingList || !editingList.title.trim()) return;
    await updateTaskList(editingList.id, { title: editingList.title.trim() });
    setEditingList(null);
  };

  const handleDeleteList = (listId: string) => {
    setDeleteListId(listId);
    setActiveListMenu(null);
  };

  const confirmDeleteList = async () => {
    if (deleteListId) {
      await deleteTaskList(deleteListId);
      await removeDividersForList(deleteListId);
      setDeleteListId(null);
    }
  };

  const handleAddSubtask = async (parentId: string, title: string) => {
    if (!selectedListId) return;
    await createTask(selectedListId, title, undefined, undefined, parentId);
  };

  // Swipe handlers
  const handleNextList = () => {
    if (!selectedListId || taskLists.length <= 1) return;
    const currentIndex = taskLists.findIndex((l) => l.id === selectedListId);
    if (currentIndex < taskLists.length - 1) {
      setSelectedListId(taskLists[currentIndex + 1].id);
    }
  };

  const handlePrevList = () => {
    if (!selectedListId || taskLists.length <= 1) return;
    const currentIndex = taskLists.findIndex((l) => l.id === selectedListId);
    if (currentIndex > 0) {
      setSelectedListId(taskLists[currentIndex - 1].id);
    }
  };

  const { onTouchStart, onTouchEnd } = useSwipeableTabs({
    onNext: handleNextList,
    onPrev: handlePrevList,
  });

  // Handle task drag end
  const handleTaskDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    const activeId = String(active.id);
    const overId = over ? String(over.id) : "";

    // Guard: Ensure drag actually happened and target is different
    if (!over || activeId === overId || !selectedListId) {
      return;
    }

    const oldIndex = sortableTaskIds.indexOf(activeId);
    const newIndex = sortableTaskIds.indexOf(overId);

    // Guard: Only reorder if positions actually changed
    if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
      const newOrder = arrayMove(sortableTaskIds, oldIndex, newIndex);

      // Update divider positions based on new order
      if (selectedListId && listDividers.length > 0) {
        let taskCount = 0;
        const nextDividers: TaskDivider[] = [];
        for (const id of newOrder) {
          if (isDividerId(id)) {
            const divider = dividerById.get(id);
            if (divider) {
              nextDividers.push({ ...divider, position: taskCount });
            }
          } else {
            taskCount += 1;
          }
        }
        if (nextDividers.length > 0) {
          updateDividers(selectedListId, nextDividers);
        }
      }

      const nextTaskIds = newOrder.filter((id) => !isDividerId(id));
      const currentTaskIds = activeTasks.map((task) => task.id);
      const tasksReordered = nextTaskIds.some(
        (id, index) => id !== currentTaskIds[index],
      );

      if (tasksReordered) {
        const taskById = new Map(activeTasks.map((task) => [task.id, task]));
        const reorderedTasks = nextTaskIds
          .map((id) => taskById.get(id))
          .filter((task): task is Task => Boolean(task));
        reorderTasks(selectedListId, reorderedTasks);
      }
    }
  };

  // Handle tab drag end
  const handleTabDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = taskLists.findIndex((l) => l.id === active.id);
    const newIndex = taskLists.findIndex((l) => l.id === over.id);

    if (oldIndex !== -1 && newIndex !== -1) {
      const newOrder = arrayMove(taskLists, oldIndex, newIndex);
      reorderTaskLists(newOrder);
    }
  };

  const filteredActiveTasks = useMemo(() => {
    if (taskFilter === "all") return activeTasks;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return activeTasks.filter((task) => {
      switch (taskFilter) {
        case "starred":
          return isStarred(task.id);
        case "overdue":
          return isOverdue(task);
        case "due_today": {
          if (!task.due_date) return false;
          const due = new Date(task.due_date);
          due.setHours(0, 0, 0, 0);
          return due.getTime() === today.getTime();
        }
        case "due_week": {
          if (!task.due_date) return false;
          const due = new Date(task.due_date);
          due.setHours(0, 0, 0, 0);
          const weekEnd = new Date(today);
          weekEnd.setDate(weekEnd.getDate() + 7);
          return due >= today && due < weekEnd;
        }
        default:
          return true;
      }
    });
  }, [activeTasks, taskFilter, isStarred]);

  const isFilterActive = taskFilter !== "all";

  const sortableTaskIds = useMemo(() => {
    const ids = filteredActiveTasks.map((task) => task.id);
    if (ids.length === 0) return [];
    // When filter is active, skip dividers since task positions may not be contiguous
    if (isFilterActive || !selectedListId || listDividers.length === 0)
      return ids;

    const max = ids.length;
    const buckets = new Map<number, TaskDivider[]>();
    listDividers.forEach((divider) => {
      const position = Math.min(Math.max(divider.position, 0), max);
      const group = buckets.get(position) ?? [];
      group.push(divider);
      buckets.set(position, group);
    });

    for (const [key, value] of buckets.entries()) {
      value.sort((a, b) =>
        (a.createdAt || "").localeCompare(b.createdAt || ""),
      );
      buckets.set(key, value);
    }

    const next: string[] = [];
    for (let i = 0; i <= ids.length; i += 1) {
      const group = buckets.get(i);
      if (group) {
        group.forEach((divider) => next.push(toDividerId(divider.id)));
      }
      if (i < ids.length) {
        next.push(ids[i]);
      }
    }
    return next;
  }, [filteredActiveTasks, listDividers, selectedListId, isFilterActive]);

  const activeTaskById = useMemo(() => {
    return new Map(filteredActiveTasks.map((task) => [task.id, task]));
  }, [filteredActiveTasks]);

  const dividerById = useMemo(() => {
    return new Map(
      listDividers.map((divider) => [toDividerId(divider.id), divider]),
    );
  }, [listDividers]);

  const handleOpenProjectMemos = async () => {
    setShowProjectMemosModal(true);
    setIsLoadingMemos(true);
    try {
      const groups = await fetchAllNestedMemos();
      setProjectMemoGroups(groups);
    } catch (err) {
      console.error("Failed to fetch project memos:", err);
    } finally {
      setIsLoadingMemos(false);
    }
  };

  const headerLeft = (
    <div className="flex items-center gap-2">
      <button
        onClick={refresh}
        disabled={isSyncing}
        className="p-1.5 md:p-2 neu-text-secondary hover:neu-text-primary neu-btn rounded-lg transition-colors disabled:opacity-50"
        title="Refresh"
      >
        <RefreshCw
          size={16}
          className={`md:w-[18px] md:h-[18px]${isSyncing ? " animate-spin" : ""}`}
        />
      </button>
    </div>
  );

  const headerCenter = (
    <>
      <button
        onClick={() => setShowListModal(true)}
        className="flex items-center gap-1.5 md:gap-2 px-2.5 md:px-3 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs md:text-sm font-medium transition-all active:scale-95 shadow"
      >
        <ListTodo size={16} />
        <span className="hidden sm:inline">Add List</span>
      </button>
      <button
        onClick={handleOpenProjectMemos}
        className="flex items-center gap-1.5 md:gap-2 px-2.5 md:px-3 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs md:text-sm font-medium transition-all active:scale-95 shadow"
        title="Project Memos"
      >
        <FolderKanban size={16} />
        <span className="hidden sm:inline">Memos</span>
      </button>
    </>
  );

  return (
    <Layout
      pageTitle="Tasks"
      headerLeft={headerLeft}
      headerCenter={headerCenter}
    >
      <div className="flex-1 flex flex-col min-h-0 neu-bg">
        {error && (
          <ErrorBanner
            message={error}
            action={
              <button
                onClick={() => refresh()}
                className="text-xs text-red-600 hover:text-red-800 underline font-medium mt-1"
              >
                Retry →
              </button>
            }
          />
        )}

        {notificationPermission === "default" && (
          <div className="shrink-0 bg-amber-50 border-b border-amber-200 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <div className="text-sm font-medium text-amber-900">
                Enable task notifications
              </div>
              <div className="text-xs text-amber-700">
                Get alerts 10 minutes before and at the due time.
              </div>
            </div>
            <button
              onClick={handleEnableNotifications}
              disabled={isRequestingNotifications || !user}
              className="px-3 py-2 text-xs font-medium rounded-lg bg-amber-600 hover:bg-amber-500 disabled:bg-amber-300 text-white transition-colors"
            >
              {isRequestingNotifications ? "Enabling..." : "Enable"}
            </button>
          </div>
        )}

        {notificationPermission === "denied" && (
          <div className="shrink-0 bg-slate-100 border-b border-slate-200 px-4 py-3">
            <div className="text-sm text-slate-700">
              Notifications are blocked in your browser settings. Allow
              notifications to get task reminders.
            </div>
          </div>
        )}

        {notificationPermission === "unsupported" && (
          <div className="shrink-0 bg-slate-100 border-b border-slate-200 px-4 py-3">
            <div className="text-sm text-slate-700">
              This browser does not support notifications.
            </div>
          </div>
        )}

        {/* Task List Tabs */}
        {taskLists.length > 0 && (
          <>
            <div className="shrink-0 neu-bg sticky top-0 z-30 no-select border-b border-slate-300 min-h-14">
              <div className="flex overflow-x-auto scrollbar-hide items-center py-2 h-full">
                <div className="flex min-w-max px-4 gap-2">
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleTabDragEnd}
                  >
                    <SortableContext
                      items={taskLists.map((l) => l.id)}
                      strategy={horizontalListSortingStrategy}
                    >
                      {taskLists.map((list) => (
                        <SortableTab
                          key={list.id}
                          id={list.id}
                          name={list.title}
                          isActive={selectedListId === list.id}
                          onSelect={() => setSelectedListId(list.id)}
                          onMenuOpen={(e) => {
                            const rect =
                              e.currentTarget.getBoundingClientRect();
                            setMenuPosition({
                              top: rect.bottom + 4,
                              left: rect.left,
                            });
                            setActiveListMenu(
                              activeListMenu === list.id ? null : list.id,
                            );
                          }}
                        />
                      ))}
                    </SortableContext>
                  </DndContext>
                </div>
              </div>
            </div>
          </>
        )}

        {/* List Menu - Rendered as fixed overlay to appear on top of everything */}
        {activeListMenu && (
          <>
            <div
              className="fixed inset-0 z-[100]"
              onClick={() => setActiveListMenu(null)}
            />
            {(() => {
              const list = taskLists.find((l) => l.id === activeListMenu);
              if (!list) return null;
              return (
                <div
                  className="fixed z-[101] neu-card py-1 min-w-[140px]"
                  style={{
                    top: menuPosition.top,
                    left: menuPosition.left,
                  }}
                >
                  <button
                    onClick={() => {
                      setEditingList({ id: list.id, title: list.title });
                      setActiveListMenu(null);
                    }}
                    className="w-full px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-100 flex items-center gap-2"
                  >
                    <Pencil size={14} /> Rename
                  </button>
                  <button
                    onClick={() => handleDeleteList(list.id)}
                    className="w-full px-4 py-2.5 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                  >
                    <Trash2 size={14} /> Delete
                  </button>
                </div>
              );
            })()}
          </>
        )}

        {/* Task List */}
        <main
          className="flex-1 min-h-0 overflow-auto p-4 mobile-scroll-pad"
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          <div className="max-w-2xl mx-auto space-y-4">
            {/* List Header & Add Task Button */}
            {selectedListId && (
              <>
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  <div className="flex items-center gap-2 mr-auto">
                    <h2 className="text-xl font-bold neu-text-primary">
                      {taskLists.find((l) => l.id === selectedListId)?.title ||
                        "Tasks"}
                    </h2>
                    <span className="text-sm text-slate-500">
                      {isFilterActive
                        ? `(${filteredActiveTasks.length}/${activeTasks.length})`
                        : `(${activeTasks.length})`}
                    </span>
                    {overdueCount > 0 && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 text-red-600 text-xs font-medium">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                        {overdueCount}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={addDivider}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 text-xs font-medium hover:bg-slate-50"
                    >
                      <Plus size={14} />
                      {listDividers.length > 0 && (
                        <span className="inline-flex items-center justify-center rounded-full bg-slate-200 text-slate-600 text-[10px] font-semibold px-1.5 py-0.5">
                          {listDividers.length}
                        </span>
                      )}
                    </button>
                    <button
                      onClick={() => setShowTaskModal(true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-medium transition-all active:scale-95 shadow"
                    >
                      <Plus size={14} /> Add Task
                    </button>
                  </div>
                </div>
                {/* Filter Chips */}
                <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-1">
                  <Filter size={14} className="neu-text-muted shrink-0" />
                  {[
                    { key: "all", label: "All" },
                    { key: "starred", label: "Starred", icon: Star },
                    { key: "overdue", label: "Overdue" },
                    { key: "due_today", label: "Due Today" },
                    { key: "due_week", label: "This Week" },
                  ].map((f) => (
                    <button
                      key={f.key}
                      onClick={() => setTaskFilter(f.key)}
                      className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                        taskFilter === f.key
                          ? "neu-chip-active text-sky-600"
                          : "neu-chip neu-text-secondary"
                      }`}
                    >
                      {f.icon && <f.icon size={12} />}
                      {f.label}
                    </button>
                  ))}
                </div>
              </>
            )}

            {activeTasks.length === 0 && completedTasks.length === 0 ? (
              <div className="text-center py-12 neu-card">
                <FileText size={48} className="mx-auto neu-text-muted mb-4" />
                <p className="neu-text-secondary mb-4">
                  No tasks in this list yet
                </p>
                <button
                  onClick={() => setShowTaskModal(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-sm font-medium transition-all"
                >
                  <Plus size={16} /> Add first task
                </button>
              </div>
            ) : (
              <>
                {/* Active Tasks */}
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleTaskDragEnd}
                >
                  <SortableContext
                    items={sortableTaskIds}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="space-y-2 no-select">
                      {sortableTaskIds.map((id) => {
                        if (isDividerId(id)) {
                          const divider = dividerById.get(id);
                          if (!divider) return null;
                          return (
                            <SortableTaskDivider
                              key={id}
                              divider={divider}
                              onRemove={removeDivider}
                              onColorChange={updateDividerColor}
                            />
                          );
                        }
                        const task = activeTaskById.get(id);
                        if (!task) return null;
                        return (
                          <SortableWrapper key={task.id} id={task.id}>
                            {(dragHandleProps) => (
                              <TaskItem
                                task={task}
                                listId={selectedListId!}
                                isStarred={isStarred(task.id)}
                                subtasks={getSubtasks(task.id)}
                                onComplete={handleCompleteTask}
                                onUncomplete={handleUncompleteTask}
                                onDelete={handleDeleteTask}
                                onUpdate={updateTask}
                                onToggleStar={toggleStar}
                                onAddSubtask={handleAddSubtask}
                                dragHandleProps={dragHandleProps}
                              />
                            )}
                          </SortableWrapper>
                        );
                      })}
                      <div ref={taskListEndRef} />
                    </div>
                  </SortableContext>
                </DndContext>

                {/* Completed Tasks */}
                {completedTasks.length > 0 && (
                  <div className="mt-6">
                    <button
                      onClick={() => setShowCompleted(!showCompleted)}
                      className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 mb-3"
                    >
                      <ChevronDown
                        size={16}
                        className={`transition-transform ${showCompleted ? "" : "-rotate-90"}`}
                      />
                      Completed ({completedTasks.length})
                    </button>

                    {showCompleted && (
                      <div className="space-y-2">
                        {completedTasks.map((task) => (
                          <TaskItem
                            key={task.id}
                            task={task}
                            listId={selectedListId!}
                            isStarred={isStarred(task.id)}
                            subtasks={getSubtasks(task.id)}
                            onComplete={handleCompleteTask}
                            onUncomplete={handleUncompleteTask}
                            onDelete={handleDeleteTask}
                            onUpdate={updateTask}
                            onToggleStar={toggleStar}
                            onAddSubtask={handleAddSubtask}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </main>
      </div>

      {/* Create List Modal */}
      {showListModal &&
        createPortal(
          <div
            className="fixed inset-0 z-[60] bg-black/50 px-4 overflow-y-auto overscroll-contain flex justify-center"
            style={{
              paddingTop: "calc(4rem + env(safe-area-inset-top, 0px))",
              paddingBottom: "calc(5rem + env(safe-area-inset-bottom, 0px))",
            }}
            onClick={(e) => {
              if (e.target === e.currentTarget) setShowListModal(false);
            }}
          >
            <div className="neu-modal max-w-md w-full max-h-[70svh] md:max-h-[calc(100dvh-4rem)] overflow-y-auto overscroll-contain my-auto">
              <div className="flex items-center justify-between p-4 border-b border-slate-200 shrink-0">
                <h3 className="text-lg font-bold neu-text-primary">
                  Create New List
                </h3>
                <button
                  onClick={() => setShowListModal(false)}
                  className="p-2 hover:bg-slate-100 rounded-lg"
                >
                  <X size={20} className="text-slate-500" />
                </button>
              </div>
              <div className="p-4">
                <input
                  type="text"
                  value={newListTitle}
                  onChange={(e) => setNewListTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      handleCreateList();
                    }
                  }}
                  placeholder="List name..."
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent mb-4"
                  autoFocus
                />
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setShowListModal(false)}
                    className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCreateList}
                    disabled={!newListTitle.trim()}
                    className="px-4 py-2 bg-sky-600 hover:bg-sky-500 disabled:bg-slate-300 text-white rounded-lg font-medium"
                  >
                    Create
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {/* Task Form Modal */}
      <TaskFormModal
        isOpen={showTaskModal}
        onClose={() => setShowTaskModal(false)}
        onSubmit={handleCreateTask}
      />

      {/* Edit List Modal */}
      {editingList &&
        createPortal(
          <div
            className="fixed inset-0 z-[60] bg-black/50 px-4 overflow-y-auto overscroll-contain flex justify-center"
            style={{
              paddingTop: "calc(4rem + env(safe-area-inset-top, 0px))",
              paddingBottom: "calc(5rem + env(safe-area-inset-bottom, 0px))",
            }}
            onClick={(e) => {
              if (e.target === e.currentTarget) setEditingList(null);
            }}
          >
            <div className="neu-modal max-w-md w-full max-h-[70svh] md:max-h-[calc(100dvh-4rem)] overflow-y-auto overscroll-contain my-auto">
              <div className="flex items-center justify-between p-4 border-b border-slate-200 shrink-0">
                <h3 className="text-lg font-bold neu-text-primary">
                  Rename List
                </h3>
                <button
                  onClick={() => setEditingList(null)}
                  className="p-2 hover:bg-slate-100 rounded-lg"
                >
                  <X size={20} className="text-slate-500" />
                </button>
              </div>
              <div className="p-4">
                <input
                  type="text"
                  value={editingList.title}
                  onChange={(e) =>
                    setEditingList({ ...editingList, title: e.target.value })
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      handleUpdateList();
                    }
                  }}
                  placeholder="List name..."
                  className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent mb-4"
                  autoFocus
                />
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setEditingList(null)}
                    className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleUpdateList}
                    disabled={!editingList.title.trim()}
                    className="px-4 py-2 bg-sky-600 hover:bg-sky-500 disabled:bg-slate-300 text-white rounded-lg font-medium"
                  >
                    Save
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {/* Project Memos Modal */}
      {showProjectMemosModal &&
        createPortal(
          <div
            className="fixed inset-0 z-[60] bg-black/50 px-4 overflow-y-auto overscroll-contain flex justify-center"
            style={{
              paddingTop: "calc(4rem + env(safe-area-inset-top, 0px))",
              paddingBottom: "calc(5rem + env(safe-area-inset-bottom, 0px))",
            }}
            onClick={(e) => {
              if (e.target === e.currentTarget) setShowProjectMemosModal(false);
            }}
          >
            <div className="neu-modal max-w-2xl w-full max-h-[80svh] md:max-h-[calc(100dvh-4rem)] overflow-y-auto overscroll-contain my-auto">
              <div className="flex items-center justify-between p-4 border-b border-slate-200 shrink-0">
                <h3 className="text-lg font-bold neu-text-primary flex items-center gap-2">
                  <FolderKanban size={20} />
                  Project Memos
                </h3>
                <button
                  onClick={() => setShowProjectMemosModal(false)}
                  className="p-2 hover:bg-slate-100 rounded-lg"
                >
                  <X size={20} className="text-slate-500" />
                </button>
              </div>
              <div className="p-4">
                {isLoadingMemos ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2
                      size={24}
                      className="animate-spin text-violet-500"
                    />
                  </div>
                ) : projectMemoGroups.length === 0 ? (
                  <div className="text-center py-12">
                    <FolderKanban
                      size={48}
                      className="mx-auto text-slate-300 mb-4"
                    />
                    <p className="text-sm text-slate-500">
                      No project memos yet
                    </p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {projectMemoGroups.map((group) => (
                      <div key={group.parentProjectId}>
                        <h4 className="text-sm font-semibold text-violet-700 mb-3 flex items-center gap-2">
                          <FolderKanban size={14} />
                          {group.parentProjectName}
                          <span className="text-xs font-normal text-slate-400">
                            ({group.memos.length})
                          </span>
                        </h4>
                        <div className="space-y-2 pl-1">
                          {group.memos.map((memo) => (
                            <div
                              key={memo.id}
                              className="p-3 rounded-lg border border-slate-200 bg-white hover:border-violet-200 transition-colors"
                            >
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium neu-text-primary">
                                  {memo.name || "Untitled"}
                                </span>
                                {memo.projectName && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-100 text-violet-600 shrink-0">
                                    {memo.projectName}
                                  </span>
                                )}
                              </div>
                              {memo.description && (
                                <p className="text-xs text-slate-500 mt-1 whitespace-pre-wrap line-clamp-3">
                                  {memo.description}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>,
          document.body,
        )}

      {/* Delete List Confirmation */}
      <ConfirmDialog
        isOpen={deleteListId !== null}
        title="Delete List"
        message="Are you sure you want to delete this list and all its tasks? This action cannot be undone."
        confirmLabel="Delete"
        onConfirm={confirmDeleteList}
        onCancel={() => setDeleteListId(null)}
      />
      <ConfirmDialog
        isOpen={deleteTaskInfo !== null}
        title="Delete Task"
        message={`Are you sure you want to delete "${[...activeTasks, ...completedTasks].find((t) => t.id === deleteTaskInfo?.taskId)?.title || ""}"?`}
        confirmLabel="Delete"
        onConfirm={confirmDeleteTask}
        onCancel={() => setDeleteTaskInfo(null)}
      />
    </Layout>
  );
};
