import { useState, useEffect, useCallback, useRef } from "react";
import { getUserSetting, setUserSetting } from "../lib/offlineData";
import { useAuth } from "../contexts/AuthContext";

export interface DaySchedule {
  enabled: boolean;
  startTime: string; // "HH:mm" format
  endTime: string; // "HH:mm" format
}

export interface AvailabilitySettings {
  weekSchedule: Record<number, DaySchedule>; // 0=Sun...6=Sat
  slotDurationMinutes: number; // minimum slot duration to show
}

const DEFAULT_SETTINGS: AvailabilitySettings = {
  weekSchedule: {
    0: { enabled: false, startTime: "09:00", endTime: "18:00" },
    1: { enabled: true, startTime: "09:00", endTime: "18:00" },
    2: { enabled: true, startTime: "09:00", endTime: "18:00" },
    3: { enabled: true, startTime: "09:00", endTime: "18:00" },
    4: { enabled: true, startTime: "09:00", endTime: "18:00" },
    5: { enabled: true, startTime: "09:00", endTime: "18:00" },
    6: { enabled: false, startTime: "09:00", endTime: "18:00" },
  },
  slotDurationMinutes: 60,
};

const SETTINGS_KEY = "availability_settings";

export const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const SLOT_DURATION_OPTIONS = [
  { value: 30, label: "30 min" },
  { value: 60, label: "1 hour" },
  { value: 90, label: "1.5 hours" },
  { value: 120, label: "2 hours" },
];

export const useAvailabilitySettings = () => {
  const { user } = useAuth();
  const [settings, setSettingsState] =
    useState<AvailabilitySettings>(DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);

  const settingsRef = useRef<AvailabilitySettings>(settings);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    const load = async () => {
      if (!user) {
        setIsLoading(false);
        return;
      }

      try {
        const stored = await getUserSetting<Partial<AvailabilitySettings>>(
          SETTINGS_KEY,
          {},
        );
        const loadedSettings = {
          ...DEFAULT_SETTINGS,
          ...stored,
          weekSchedule: {
            ...DEFAULT_SETTINGS.weekSchedule,
            ...(stored.weekSchedule ?? {}),
          },
        };
        setSettingsState(loadedSettings);
        settingsRef.current = loadedSettings;
      } catch (err) {
        console.error("Failed to load availability settings:", err);
      }
      setIsLoading(false);
    };

    load();
  }, [user]);

  const updateSettings = useCallback(
    async (updates: Partial<AvailabilitySettings>) => {
      const newSettings = { ...settingsRef.current, ...updates };
      setSettingsState(newSettings);
      settingsRef.current = newSettings;

      try {
        await setUserSetting(SETTINGS_KEY, newSettings);
      } catch (err) {
        console.error("Failed to save availability settings:", err);
      }
    },
    [],
  );

  const updateDaySchedule = useCallback(
    async (day: number, updates: Partial<DaySchedule>) => {
      const currentDay = settingsRef.current.weekSchedule[day];
      const newWeekSchedule = {
        ...settingsRef.current.weekSchedule,
        [day]: { ...currentDay, ...updates },
      };
      const newSettings = {
        ...settingsRef.current,
        weekSchedule: newWeekSchedule,
      };
      setSettingsState(newSettings);
      settingsRef.current = newSettings;

      try {
        await setUserSetting(SETTINGS_KEY, newSettings);
      } catch (err) {
        console.error("Failed to save availability settings:", err);
      }
    },
    [],
  );

  return {
    settings,
    isLoading,
    updateSettings,
    updateDaySchedule,
  };
};
