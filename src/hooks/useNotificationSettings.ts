import { useState, useEffect, useCallback, useRef } from "react";
import { getUserSetting, setUserSetting } from "../lib/offlineData";
import { useAuth } from "../contexts/AuthContext";

export interface NotificationSettings {
  // Task notifications
  taskNotificationsEnabled: boolean;
  reminderMinutes: number; // Minutes before due time (5, 10, 15, 30, 60)
  exactTimeNotification: boolean; // Notify at exact due time

  // Push notifications
  pushNotificationsEnabled: boolean;

  // Push notification categories (per-source toggles)
  pushTaskDue: boolean;
  pushTaskOverdue: boolean;
  pushCalendarEvent: boolean;
  pushInvoiceReminder: boolean;
  pushAiChat: boolean;
  pushAiCompany: boolean;
  pushProactiveAgent: boolean;
  pushAutomation: boolean;
  pushSlack: boolean;
  pushRss: boolean;
  pushWebhook: boolean;
  pushGmail: boolean;

  // Sound
  soundEnabled: boolean;

  // Daily summary
  dailySummaryEnabled: boolean;
  dailySummaryTime: string; // HH:mm format (e.g., "09:00")
}

const DEFAULT_SETTINGS: NotificationSettings = {
  taskNotificationsEnabled: true,
  reminderMinutes: 10,
  exactTimeNotification: true,
  pushNotificationsEnabled: false,
  pushTaskDue: true,
  pushTaskOverdue: true,
  pushCalendarEvent: true,
  pushInvoiceReminder: true,
  pushAiChat: true,
  pushAiCompany: true,
  pushProactiveAgent: true,
  pushAutomation: true,
  pushSlack: true,
  pushRss: true,
  pushWebhook: true,
  pushGmail: true,
  soundEnabled: true,
  dailySummaryEnabled: false,
  dailySummaryTime: "09:00",
};

const SETTINGS_KEY = "notification_settings";

export const useNotificationSettings = () => {
  const { user } = useAuth();
  const [settings, setSettingsState] =
    useState<NotificationSettings>(DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);
  const [permissionStatus, setPermissionStatus] =
    useState<NotificationPermission>("default");

  // Keep a ref to the latest settings to avoid stale closure issues
  const settingsRef = useRef<NotificationSettings>(settings);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  // Load settings
  useEffect(() => {
    const load = async () => {
      if (!user) {
        setIsLoading(false);
        return;
      }

      try {
        const stored = await getUserSetting<Partial<NotificationSettings>>(
          SETTINGS_KEY,
          {},
        );
        const loadedSettings = { ...DEFAULT_SETTINGS, ...stored };
        setSettingsState(loadedSettings);
        settingsRef.current = loadedSettings;
      } catch (err) {
        console.error("Failed to load notification settings:", err);
      }
      setIsLoading(false);
    };

    load();
  }, [user]);

  // Check notification permission
  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      setPermissionStatus(Notification.permission);
    }
  }, []);

  // Update a single setting - uses ref to always have latest settings
  const updateSetting = useCallback(
    async <K extends keyof NotificationSettings>(
      key: K,
      value: NotificationSettings[K],
    ) => {
      const newSettings = { ...settingsRef.current, [key]: value };
      setSettingsState(newSettings);
      settingsRef.current = newSettings;

      try {
        await setUserSetting(SETTINGS_KEY, newSettings);
      } catch (err) {
        console.error("Failed to save notification setting:", err);
      }
    },
    [],
  );

  // Update multiple settings at once - uses ref to always have latest settings
  const updateSettings = useCallback(
    async (updates: Partial<NotificationSettings>) => {
      const newSettings = { ...settingsRef.current, ...updates };
      setSettingsState(newSettings);
      settingsRef.current = newSettings;

      try {
        await setUserSetting(SETTINGS_KEY, newSettings);
      } catch (err) {
        console.error("Failed to save notification settings:", err);
      }
    },
    [],
  );

  // Request notification permission
  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      return false;
    }

    if (Notification.permission === "granted") {
      setPermissionStatus("granted");
      return true;
    }

    if (Notification.permission !== "denied") {
      const permission = await Notification.requestPermission();
      setPermissionStatus(permission);
      return permission === "granted";
    }

    return false;
  }, []);

  // Reset to defaults
  const resetToDefaults = useCallback(async () => {
    setSettingsState(DEFAULT_SETTINGS);
    settingsRef.current = DEFAULT_SETTINGS;
    try {
      await setUserSetting(SETTINGS_KEY, DEFAULT_SETTINGS);
    } catch (err) {
      console.error("Failed to reset notification settings:", err);
    }
  }, []);

  return {
    settings,
    isLoading,
    permissionStatus,
    updateSetting,
    updateSettings,
    requestPermission,
    resetToDefaults,
  };
};

// Export reminder options for UI
export const REMINDER_OPTIONS = [
  { value: 5, label: "5 min before" },
  { value: 10, label: "10 min before" },
  { value: 15, label: "15 min before" },
  { value: 30, label: "30 min before" },
  { value: 60, label: "1 hour before" },
];
