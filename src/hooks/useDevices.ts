import { useCallback, useEffect, useRef, useState } from "react";
import type { Device } from "../types";
import { fetchDevices, upsertDevice, deleteDevice } from "../lib/offlineData";

export const useDevices = () => {
  const [devices, setDevices] = useState<Device[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pendingUpsertsRef = useRef<Map<string, Device>>(new Map());
  const pendingDeletesRef = useRef<Set<string>>(new Set());

  const flushPendingOps = useCallback(async () => {
    const upserts = Array.from(pendingUpsertsRef.current.values());
    const deletes = Array.from(pendingDeletesRef.current);
    pendingUpsertsRef.current.clear();
    pendingDeletesRef.current.clear();

    if (upserts.length === 0 && deletes.length === 0) return;

    for (const device of upserts) {
      await upsertDevice(device);
    }
    for (const id of deletes) {
      await deleteDevice(id);
    }
  }, []);

  // Cleanup timeout on unmount and flush pending operations
  useEffect(() => {
    return () => {
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }
      void flushPendingOps();
    };
  }, [flushPendingOps]);

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      const loaded = await fetchDevices();
      // Sort by order field if present
      loaded.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      setDevices(loaded);
      setIsLoading(false);
    };
    load();
  }, []);

  const refresh = useCallback(async () => {
    setIsSyncing(true);
    const loaded = await fetchDevices();
    // Sort by order field if present
    loaded.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    setDevices(loaded);
    setIsSyncing(false);
  }, []);

  const scheduleSyncFlush = useCallback(() => {
    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current);
    }
    syncTimeoutRef.current = setTimeout(async () => {
      setIsSyncing(true);
      await flushPendingOps();
      setIsSyncing(false);
    }, 400);
  }, [flushPendingOps]);

  const reorderDevices = useCallback(async (reorderedDevices: Device[]) => {
    // Update with new order values
    const devicesWithOrder = reorderedDevices.map((device, index) => ({
      ...device,
      order: index,
    }));
    setDevices(devicesWithOrder);

    // Sync all reordered devices to DB
    setIsSyncing(true);
    for (const device of devicesWithOrder) {
      await upsertDevice(device);
    }
    setIsSyncing(false);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleMigration = () => {
      refresh().catch(() => undefined);
    };
    window.addEventListener("split-settings-migrated", handleMigration);
    return () => {
      window.removeEventListener("split-settings-migrated", handleMigration);
    };
  }, [refresh]);

  const addDevice = useCallback(
    (device: Device) => {
      setDevices((prev) => {
        const next = [...prev, device];
        // Only save to DB if device has a name (prevents empty devices from being persisted)
        if (device.name.trim()) {
          pendingUpsertsRef.current.set(device.id, device);
          pendingDeletesRef.current.delete(device.id);
          scheduleSyncFlush();
        }
        return next;
      });
    },
    [scheduleSyncFlush],
  );

  const updateDevice = useCallback(
    (id: string, updates: Partial<Device>) => {
      setDevices((prev) => {
        const next = prev.map((device) =>
          device.id === id ? { ...device, ...updates } : device,
        );
        const updatedDevice = next.find((device) => device.id === id);
        if (updatedDevice) {
          pendingUpsertsRef.current.set(id, updatedDevice);
          pendingDeletesRef.current.delete(id);
          scheduleSyncFlush();
        }
        return next;
      });
    },
    [scheduleSyncFlush],
  );

  const removeDevice = useCallback(async (id: string) => {
    setDevices((prev) => prev.filter((device) => device.id !== id));
    setIsSyncing(true);
    await deleteDevice(id);
    setIsSyncing(false);
  }, []);

  return {
    devices,
    isLoading,
    isSyncing,
    addDevice,
    updateDevice,
    removeDevice,
    reorderDevices,
    refresh,
    setDevices,
  };
};
