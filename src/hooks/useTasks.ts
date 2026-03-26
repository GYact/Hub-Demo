import { useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "../contexts/AuthContext";
import { offlineDb, TaskListRow, TaskRow } from "../lib/offlineDb";
import { upsertLocalRow, deleteLocalRow } from "../lib/offlineStore";
import {
  scheduleTaskNotification,
  cancelTaskNotification,
} from "../lib/taskNotifications";
import { supabase } from "../lib/offlineSync";
import { useOnlineStatus } from "./useOnlineStatus";

export interface TaskList {
  id: string;
  user_id: string;
  title: string;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface Task {
  id: string;
  user_id: string;
  list_id: string;
  parent_id?: string;
  title: string;
  notes?: string;
  status: "needsAction" | "completed";
  due_date?: string;
  due_time?: string;
  completed_at?: string;
  position: number;
  is_starred: boolean;
  repeat_type?: "none" | "daily" | "weekly" | "monthly" | "yearly";
  created_at: string;
  updated_at: string;
}

export type RepeatType = "none" | "daily" | "weekly" | "monthly" | "yearly";

export const useTasks = () => {
  const { user } = useAuth();
  const isOnline = useOnlineStatus();
  const [taskLists, setTaskLists] = useState<TaskList[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isLoadingLists, setIsLoadingLists] = useState(true);
  const [isLoadingTasks, setIsLoadingTasks] = useState(true);

  const syncNow = useCallback((syncFn: () => Promise<void>) => {
    syncFn().catch((err) => {
      console.error("Task sync failed:", err);
    });
  }, []);

  const loadTaskLists = useCallback(
    async (userId: string) => {
      // If online, fetch from Supabase first
      if (isOnline && supabase) {
        try {
          const { ensureOutboxProcessed } = await import("../lib/offlineSync");
          const [, { data }] = await Promise.all([
            ensureOutboxProcessed("task_lists"),
            supabase
              .from("task_lists")
              .select("*")
              .eq("user_id", userId)
              .order("position"),
          ]);

          if (data) {
            const { mergeRemoteRows } = await import("../lib/offlineStore");
            await mergeRemoteRows(
              "task_lists",
              data as Record<string, unknown>[],
            );
            return data as TaskList[];
          }
        } catch (err) {
          console.error(
            "Failed to fetch task lists from Supabase, using local data:",
            err,
          );
          // Fall through to local DB
        }
      }

      // If offline or Supabase failed, use local DB
      const lists = await offlineDb.task_lists
        .where("user_id")
        .equals(userId)
        .sortBy("position");
      return lists as TaskList[];
    },
    [isOnline],
  );

  const loadTasks = useCallback(
    async (listId: string) => {
      // If online, fetch from Supabase first
      if (isOnline && supabase) {
        try {
          const { ensureOutboxProcessed } = await import("../lib/offlineSync");
          const [, { data }] = await Promise.all([
            ensureOutboxProcessed("tasks"),
            supabase
              .from("tasks")
              .select("*")
              .eq("list_id", listId)
              .order("position"),
          ]);

          if (data) {
            const { mergeRemoteRows } = await import("../lib/offlineStore");
            await mergeRemoteRows("tasks", data as Record<string, unknown>[]);
            return data as Task[];
          }
        } catch (err) {
          console.error(
            "Failed to fetch tasks from Supabase, using local data:",
            err,
          );
          // Fall through to local DB
        }
      }

      // If offline or Supabase failed, use local DB
      const listTasks = await offlineDb.tasks
        .where("list_id")
        .equals(listId)
        .sortBy("position");
      return listTasks as Task[];
    },
    [isOnline],
  );

  // Load task lists from IndexedDB (initial snapshot)
  useEffect(() => {
    let active = true;

    const load = async () => {
      if (!user) {
        setTaskLists([]);
        setSelectedListId(null);
        setTasks([]);
        setIsLoadingLists(false);
        setIsLoadingTasks(false);
        return;
      }

      try {
        setIsLoadingLists(true);
        const lists = await loadTaskLists(user.id);
        if (!active) return;
        setTaskLists(lists);
        setSelectedListId((prev) => {
          if (prev && lists.some((list) => list.id === prev)) {
            return prev;
          }
          return lists[0]?.id ?? null;
        });
      } catch (err) {
        console.error("Failed to load task lists:", err);
        setError("Failed to load task lists");
      } finally {
        if (active) {
          setIsLoadingLists(false);
        }
      }
    };

    load();
    return () => {
      active = false;
    };
  }, [user, loadTaskLists]);

  // Load tasks from IndexedDB for the active list
  useEffect(() => {
    let active = true;

    const load = async () => {
      if (!user || !selectedListId) {
        setTasks([]);
        setIsLoadingTasks(false);
        return;
      }

      try {
        setIsLoadingTasks(true);
        const listTasks = await loadTasks(selectedListId);
        if (!active) return;
        setTasks(listTasks);
      } catch (err) {
        console.error("Failed to load tasks:", err);
        setError("Failed to load tasks");
      } finally {
        if (active) {
          setIsLoadingTasks(false);
        }
      }
    };

    load();
    return () => {
      active = false;
    };
  }, [user, selectedListId, loadTasks]);

  // Create a new task list
  const createTaskList = useCallback(
    async (title: string) => {
      if (!user) return null;

      try {
        const newList: Partial<TaskListRow> = {
          id: crypto.randomUUID(),
          user_id: user.id,
          title,
          position: taskLists.length,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        setTaskLists((prev) => [...prev, newList as TaskList]);
        syncNow(async () => {
          await upsertLocalRow("task_lists", newList);
        });
        setSelectedListId(newList.id!);
        return newList as TaskList;
      } catch (err) {
        console.error("Failed to create task list:", err);
        setError("Failed to create task list");
        return null;
      }
    },
    [user, taskLists.length, syncNow],
  );

  // Update a task list
  const updateTaskList = useCallback(
    async (id: string, updates: Partial<TaskList>) => {
      if (!user) return null;

      try {
        let updatedList: TaskList | null = null;
        setTaskLists((prev) => {
          const next = prev.map((item) => {
            if (item.id !== id) return item;
            updatedList = {
              ...item,
              ...updates,
              updated_at: new Date().toISOString(),
            } as TaskList;
            return updatedList;
          });

          if (updatedList) {
            syncNow(async () => {
              await upsertLocalRow("task_lists", updatedList as TaskList);
            });
          }

          return next;
        });
        return updatedList;
      } catch (err) {
        console.error("Failed to update task list:", err);
        setError("Failed to update task list");
        return null;
      }
    },
    [user, syncNow],
  );

  // Delete a task list
  const deleteTaskList = useCallback(
    async (id: string) => {
      if (!user) return false;

      try {
        // Delete all tasks in this list first
        const tasksInList = await offlineDb.tasks
          .where("list_id")
          .equals(id)
          .toArray();
        for (const task of tasksInList) {
          await cancelTaskNotification(task.id);
          await deleteLocalRow("tasks", task.id);
        }

        await deleteLocalRow("task_lists", id);
        setTaskLists((prev) => prev.filter((item) => item.id !== id));
        setTasks((prev) => prev.filter((task) => task.list_id !== id));

        // Select another list if this was selected
        if (selectedListId === id) {
          const remaining = taskLists.filter((l) => l.id !== id);
          setSelectedListId(remaining.length > 0 ? remaining[0].id : null);
        }

        return true;
      } catch (err) {
        console.error("Failed to delete task list:", err);
        setError("Failed to delete task list");
        return false;
      }
    },
    [user, selectedListId, taskLists],
  );

  // Reorder task lists
  const reorderTaskLists = useCallback(
    async (reorderedLists: TaskList[]) => {
      if (!user) return;

      try {
        const listsWithPosition = reorderedLists.map((list, index) => ({
          ...list,
          position: index,
          updated_at: new Date().toISOString(),
        }));
        setTaskLists(listsWithPosition);
        syncNow(async () => {
          for (const list of listsWithPosition) {
            await upsertLocalRow("task_lists", list);
          }
        });
      } catch (err) {
        console.error("Failed to reorder task lists:", err);
        setError("Failed to reorder task lists");
      }
    },
    [user, syncNow],
  );

  // Create a new task
  const createTask = useCallback(
    async (
      listId: string,
      title: string,
      notes?: string,
      dueDate?: string,
      parentId?: string,
    ) => {
      if (!user) return null;

      try {
        const tasksInList =
          listId === selectedListId
            ? tasks
            : await offlineDb.tasks.where("list_id").equals(listId).toArray();
        const maxPosition = tasksInList.reduce(
          (max, t) => Math.max(max, t.position),
          -1,
        );

        const newTask: Partial<TaskRow> = {
          id: crypto.randomUUID(),
          user_id: user.id,
          list_id: listId,
          parent_id: parentId,
          title,
          notes,
          status: "needsAction",
          due_date: dueDate,
          position: maxPosition + 1,
          is_starred: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        if (listId === selectedListId) {
          setTasks((prev) =>
            [...prev, newTask as Task].sort((a, b) => a.position - b.position),
          );
        }
        syncNow(async () => {
          await upsertLocalRow("tasks", newTask);
        });
        await scheduleTaskNotification(newTask as Task);
        return newTask as Task;
      } catch (err) {
        console.error("Failed to create task:", err);
        setError("Failed to create task");
        return null;
      }
    },
    [user, selectedListId, tasks, syncNow],
  );

  // Update a task
  const updateTask = useCallback(
    async (_listId: string, id: string, updates: Partial<Task>) => {
      if (!user) return null;

      try {
        let updatedTask: Task | null = null;
        setTasks((prev) => {
          const next = prev
            .map((item) => {
              if (item.id !== id) return item;
              updatedTask = {
                ...item,
                ...updates,
                updated_at: new Date().toISOString(),
              } as Task;
              return updatedTask;
            })
            .sort((a, b) => a.position - b.position);

          if (updatedTask) {
            syncNow(async () => {
              await upsertLocalRow("tasks", updatedTask as Task);
            });
          }

          return next;
        });
        if (updatedTask) {
          await scheduleTaskNotification(updatedTask as Task);
        }
        return updatedTask;
      } catch (err) {
        console.error("Failed to update task:", err);
        setError("Failed to update task");
        return null;
      }
    },
    [user, syncNow],
  );

  // Complete a task
  const completeTask = useCallback(
    async (listId: string, id: string) => {
      return updateTask(listId, id, {
        status: "completed",
        completed_at: new Date().toISOString(),
      });
    },
    [updateTask],
  );

  // Uncomplete a task
  const uncompleteTask = useCallback(
    async (listId: string, id: string) => {
      return updateTask(listId, id, {
        status: "needsAction",
        completed_at: undefined,
      });
    },
    [updateTask],
  );

  // Delete a task
  const deleteTask = useCallback(
    async (_listId: string, id: string) => {
      if (!user) return false;

      try {
        // Delete subtasks first
        const subtasks = await offlineDb.tasks
          .where("parent_id")
          .equals(id)
          .toArray();
        for (const subtask of subtasks) {
          await cancelTaskNotification(subtask.id);
          await deleteLocalRow("tasks", subtask.id);
        }

        await cancelTaskNotification(id);
        await deleteLocalRow("tasks", id);
        setTasks((prev) =>
          prev.filter((task) => task.id !== id && task.parent_id !== id),
        );
        return true;
      } catch (err) {
        console.error("Failed to delete task:", err);
        setError("Failed to delete task");
        return false;
      }
    },
    [user],
  );

  // Toggle star
  const toggleStar = useCallback(
    async (id: string) => {
      const task = tasks.find((t) => t.id === id);
      if (!task) return;

      // Note: listId is ignored, maintained for API compatibility
      await updateTask("", id, { is_starred: !task.is_starred });
    },
    [tasks, updateTask],
  );

  // Check if task is starred
  const isStarred = useCallback(
    (id: string) => {
      const task = tasks.find((t) => t.id === id);
      return task?.is_starred || false;
    },
    [tasks],
  );

  // Get subtasks for a parent task
  const getSubtasks = useCallback(
    (parentId: string) => {
      return tasks.filter((t) => t.parent_id === parentId);
    },
    [tasks],
  );

  // Reorder tasks
  const reorderTasks = useCallback(
    async (_listId: string, reorderedTasks: Task[]) => {
      if (!user) return;

      try {
        const tasksWithPosition = reorderedTasks.map((task, index) => ({
          ...task,
          position: index,
          updated_at: new Date().toISOString(),
        }));
        setTasks((prev) => {
          const updatedById = new Map(
            tasksWithPosition.map((task) => [task.id, task]),
          );
          return prev
            .map((task) => updatedById.get(task.id) ?? task)
            .sort((a, b) => a.position - b.position);
        });
        syncNow(async () => {
          for (const task of tasksWithPosition) {
            await upsertLocalRow("tasks", task);
          }
        });
      } catch (err) {
        console.error("Failed to reorder tasks:", err);
        setError("Failed to reorder tasks");
      }
    },
    [user, syncNow],
  );

  // Update task extras (time, repeat)
  const updateTaskExtras = useCallback(
    async (
      listId: string,
      id: string,
      extras: { time?: string; repeat?: RepeatType },
    ) => {
      const updates: Partial<Task> = {};

      if (extras.time !== undefined) {
        updates.due_time = extras.time || undefined;
      }

      if (extras.repeat !== undefined) {
        updates.repeat_type =
          extras.repeat === "none" ? undefined : extras.repeat;
      }

      return updateTask(listId, id, updates);
    },
    [updateTask],
  );

  // Get task extras
  const getTaskExtras = useCallback(
    (taskId: string) => {
      const task = tasks.find((t) => t.id === taskId);
      return {
        time: task?.due_time,
        repeat: task?.repeat_type || "none",
      };
    },
    [tasks],
  );

  // Refresh (reload from Supabase)
  const refresh = useCallback(async () => {
    setIsSyncing(true);
    try {
      if (user) {
        setIsLoadingLists(true);
        const lists = await loadTaskLists(user.id);
        setTaskLists(lists);
        setIsLoadingLists(false);
        const nextListId =
          lists.find((list) => list.id === selectedListId)?.id ??
          lists[0]?.id ??
          null;
        setSelectedListId(nextListId);
        if (nextListId) {
          setIsLoadingTasks(true);
          const listTasks = await loadTasks(nextListId);
          setTasks(listTasks);
          setIsLoadingTasks(false);
        } else {
          setTasks([]);
          setIsLoadingTasks(false);
        }
      }
    } finally {
      setIsSyncing(false);
    }
  }, [user, selectedListId, loadTaskLists, loadTasks]);

  // Filter tasks (active vs completed vs overdue)
  const activeTasks = useMemo(
    () => tasks.filter((t) => t.status === "needsAction" && !t.parent_id),
    [tasks],
  );

  const completedTasks = useMemo(() => {
    return tasks
      .filter((t) => t.status === "completed" && !t.parent_id)
      .sort((a, b) => {
        const aTime = a.completed_at ? Date.parse(a.completed_at) : 0;
        const bTime = b.completed_at ? Date.parse(b.completed_at) : 0;
        if (aTime !== bTime) {
          return bTime - aTime;
        }
        return b.position - a.position;
      });
  }, [tasks]);

  // Count overdue tasks (due_date < today JST and not completed)
  const overdueCount = useMemo(() => {
    const jstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
    const todayStr = jstNow.toISOString().split("T")[0];
    return tasks.filter(
      (t) =>
        t.status === "needsAction" &&
        t.due_date &&
        t.due_date.split("T")[0] < todayStr,
    ).length;
  }, [tasks]);

  return {
    // State
    taskLists,
    tasks,
    selectedListId,
    error,
    activeTasks,
    completedTasks,
    overdueCount,
    isSyncing,
    isLoadingLists,
    isLoadingTasks,

    // Task list operations
    setSelectedListId,
    createTaskList,
    updateTaskList,
    deleteTaskList,
    reorderTaskLists,

    // Task operations
    createTask,
    updateTask,
    completeTask,
    uncompleteTask,
    deleteTask,
    toggleStar,
    isStarred,
    getSubtasks,
    reorderTasks,

    // Task extras
    updateTaskExtras,
    getTaskExtras,

    // Utility
    refresh,
  };
};
