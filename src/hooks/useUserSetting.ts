import { useCallback, useEffect, useRef, useState } from "react";
import { offlineDb, type UserSettingRow } from "../lib/offlineDb";
import { setUserSetting } from "../lib/offlineData";
import { useAuth } from "../contexts/AuthContext";

// Microtask-based batch reader: coalesces individual get() calls within
// the same tick into a single bulkGet() against IndexedDB.
let pendingIds: string[] = [];
let pendingCallbacks: ((row: UserSettingRow | undefined) => void)[] = [];
let flushScheduled = false;

const flushBatch = async () => {
  const ids = pendingIds;
  const cbs = pendingCallbacks;
  pendingIds = [];
  pendingCallbacks = [];
  flushScheduled = false;

  try {
    const rows = await offlineDb.user_settings.bulkGet(ids);
    for (let i = 0; i < cbs.length; i++) {
      cbs[i](rows[i]);
    }
  } catch {
    for (const cb of cbs) {
      cb(undefined);
    }
  }
};

const batchGet = (settingId: string): Promise<UserSettingRow | undefined> => {
  return new Promise((resolve) => {
    pendingIds.push(settingId);
    pendingCallbacks.push(resolve);
    if (!flushScheduled) {
      flushScheduled = true;
      queueMicrotask(flushBatch);
    }
  });
};

export const useUserSetting = <T>(key: string, fallback: T) => {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [value, setValue] = useState<T>(fallback);
  const [isLoading, setIsLoading] = useState(true);
  const fallbackRef = useRef(fallback);

  useEffect(() => {
    fallbackRef.current = fallback;
  }, [fallback]);

  const loadSetting = useCallback(
    async (withLoading: boolean) => {
      if (withLoading) {
        setIsLoading(true);
      }
      const settingId = `${userId ?? "local"}:${key}`;

      try {
        const row = await batchGet(settingId);
        if (!row) {
          setValue(fallbackRef.current);
        } else {
          setValue(row.value as T);
        }
      } catch {
        setValue(fallbackRef.current);
      }

      if (withLoading) {
        setIsLoading(false);
      }
    },
    [key, userId],
  );

  useEffect(() => {
    loadSetting(true);
  }, [loadSetting]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleSync = () => {
      loadSetting(false);
    };
    window.addEventListener("sync-complete", handleSync);
    window.addEventListener("menu-ready", handleSync);
    return () => {
      window.removeEventListener("sync-complete", handleSync);
      window.removeEventListener("menu-ready", handleSync);
    };
  }, [loadSetting]);

  const updateValue = useCallback(
    (next: T) => {
      setValue(next);
      setUserSetting(key, next, userId).catch((err) => {
        console.error("Failed to save setting:", err);
      });
    },
    [key, userId],
  );

  return { value, setValue: updateValue, isLoading };
};
