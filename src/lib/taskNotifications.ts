import type { Task } from "../hooks/useTasks";
import { offlineDb } from "./offlineDb";
import { getUserSetting, setUserSetting } from "./offlineData";

interface ScheduledNotification {
  id: string;
  taskId: string;
  taskTitle: string;
  scheduledTime: number; // Unix timestamp in milliseconds
  type: "reminder" | "exact"; // 'reminder' = minutes before, 'exact' = exact time
  triggered: boolean;
}

interface NotificationSettings {
  taskNotificationsEnabled: boolean;
  reminderMinutes: number;
  exactTimeNotification: boolean;
  soundEnabled: boolean;
  pushTaskDue: boolean;
  pushTaskOverdue: boolean;
}

const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  taskNotificationsEnabled: true,
  reminderMinutes: 10,
  exactTimeNotification: true,
  soundEnabled: true,
  pushTaskDue: true,
  pushTaskOverdue: true,
};

const SETTINGS_NOTIFICATION_SCHEDULE = "task_notification_schedule";
const SETTINGS_NOTIFICATION_CONFIG = "notification_settings";

// Get notification settings
const getNotificationSettings = async (): Promise<NotificationSettings> => {
  try {
    const stored = await getUserSetting<Partial<NotificationSettings>>(
      SETTINGS_NOTIFICATION_CONFIG,
      {},
    );
    return { ...DEFAULT_NOTIFICATION_SETTINGS, ...stored };
  } catch {
    return DEFAULT_NOTIFICATION_SETTINGS;
  }
};

// Request notification permission
export const requestNotificationPermission = async (): Promise<boolean> => {
  if (!("Notification" in window)) {
    console.warn("This browser does not support notifications");
    return false;
  }

  if (Notification.permission === "granted") {
    return true;
  }

  if (Notification.permission !== "denied") {
    const permission = await Notification.requestPermission();
    return permission === "granted";
  }

  return false;
};

const getScheduledNotifications = async (): Promise<
  ScheduledNotification[]
> => {
  try {
    const stored = await getUserSetting<ScheduledNotification[]>(
      SETTINGS_NOTIFICATION_SCHEDULE,
      [],
    );
    return stored;
  } catch (err) {
    console.error("Failed to load scheduled notifications from settings:", err);
  }
  return [];
};

const saveScheduledNotifications = async (
  notifications: ScheduledNotification[],
): Promise<void> => {
  try {
    await setUserSetting(SETTINGS_NOTIFICATION_SCHEDULE, notifications);
  } catch (err) {
    console.error("Failed to save scheduled notifications to settings:", err);
  }
};

// Schedule notifications for a task
export const scheduleTaskNotification = async (task: Task): Promise<void> => {
  // Get user notification settings
  const settings = await getNotificationSettings();

  // Check if notifications are enabled
  if (!settings.taskNotificationsEnabled || !settings.pushTaskDue) {
    await cancelTaskNotification(task.id);
    return;
  }

  if (!task.due_date || !task.due_time) {
    // No due date/time, clear any existing notifications
    await cancelTaskNotification(task.id);
    return;
  }

  if (task.status === "completed") {
    // Don't schedule for completed tasks
    await cancelTaskNotification(task.id);
    return;
  }

  // Parse due date and time as JST (UTC+9)
  const datePart = task.due_date.split("T")[0];
  const dueDateTime = new Date(`${datePart}T${task.due_time}:00+09:00`);
  const dueTimestamp = dueDateTime.getTime();

  if (Number.isNaN(dueTimestamp) || dueTimestamp <= Date.now()) {
    // Invalid or past due time, clear existing notifications
    await cancelTaskNotification(task.id);
    return;
  }

  // Calculate reminder offset based on settings
  const reminderOffset = settings.reminderMinutes * 60 * 1000;
  const reminderTimestamp = dueTimestamp - reminderOffset;

  const notifications = await getScheduledNotifications();

  // Remove existing notifications for this task
  const filtered = notifications.filter((n) => n.taskId !== task.id);

  // Add new notifications
  const newNotifications: ScheduledNotification[] = [];

  // Schedule reminder (X min before, based on settings)
  if (reminderTimestamp > Date.now()) {
    newNotifications.push({
      id: `${task.id}-reminder`,
      taskId: task.id,
      taskTitle: task.title,
      scheduledTime: reminderTimestamp,
      type: "reminder",
      triggered: false,
    });
  }

  // Schedule exact time notification (if enabled in settings)
  if (settings.exactTimeNotification) {
    newNotifications.push({
      id: `${task.id}-exact`,
      taskId: task.id,
      taskTitle: task.title,
      scheduledTime: dueTimestamp,
      type: "exact",
      triggered: false,
    });
  }

  await saveScheduledNotifications([...filtered, ...newNotifications]);
};

// Cancel all notifications for a task
export const cancelTaskNotification = async (taskId: string): Promise<void> => {
  const notifications = await getScheduledNotifications();
  const filtered = notifications.filter((n) => n.taskId !== taskId);
  await saveScheduledNotifications(filtered);
};

// Reschedule all notifications for all tasks
export const rescheduleAllNotifications = async (
  userId: string,
): Promise<void> => {
  try {
    // Get all incomplete tasks with due_date and due_time
    const tasks = await offlineDb.tasks
      .where("user_id")
      .equals(userId)
      .and(
        (task) =>
          task.status === "needsAction" && !!task.due_date && !!task.due_time,
      )
      .toArray();

    // Clear all existing notifications
    await saveScheduledNotifications([]);

    // Schedule notifications for each task
    for (const task of tasks) {
      await scheduleTaskNotification(task as Task);
    }
  } catch (err) {
    console.error("Failed to reschedule notifications:", err);
  }
};
