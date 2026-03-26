import { useState, useCallback, useEffect, useRef } from "react";
import { supabase } from "../lib/supabase";
import type {
  SwitchBotDevice,
  SwitchBotDeviceStatus,
  SwitchBotScene,
  SwitchBotInfraredRemote,
  SwitchBotApiResponse,
  SwitchBotDevicesResponse,
} from "../types/switchbot";

const STORAGE_KEY_TOKEN = "hub_switchbot_token";
const STORAGE_KEY_SECRET = "hub_switchbot_secret";

export interface SwitchBotStatusHistoryRow {
  id: string;
  device_id: string;
  device_name: string | null;
  device_type: string | null;
  status: Record<string, unknown>;
  recorded_at: string;
}

interface UseSwitchBotReturn {
  isConfigured: boolean;
  isLoading: boolean;
  error: string | null;
  devices: SwitchBotDevice[];
  infraredRemotes: SwitchBotInfraredRemote[];
  scenes: SwitchBotScene[];
  deviceStatuses: Map<string, SwitchBotDeviceStatus>;
  statusHistory: SwitchBotStatusHistoryRow[];
  configure: (token: string, secret: string) => Promise<void>;
  disconnect: () => Promise<void>;
  fetchDevices: () => Promise<void>;
  fetchScenes: () => Promise<void>;
  getDeviceStatus: (deviceId: string) => Promise<SwitchBotDeviceStatus | null>;
  sendCommand: (
    deviceId: string,
    command: string,
    parameter?: string | number,
  ) => Promise<boolean>;
  executeScene: (sceneId: string) => Promise<boolean>;
  refresh: () => Promise<void>;
  fetchStatusHistory: (deviceId?: string, limit?: number) => Promise<void>;
}

export const useSwitchBot = (): UseSwitchBotReturn => {
  const [token, setToken] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const credentialsLoaded = useRef(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [devices, setDevices] = useState<SwitchBotDevice[]>([]);
  const [infraredRemotes, setInfraredRemotes] = useState<
    SwitchBotInfraredRemote[]
  >([]);
  const [scenes, setScenes] = useState<SwitchBotScene[]>([]);
  const [deviceStatuses, setDeviceStatuses] = useState<
    Map<string, SwitchBotDeviceStatus>
  >(new Map());
  const [statusHistory, setStatusHistory] = useState<
    SwitchBotStatusHistoryRow[]
  >([]);

  const isConfigured = !!(token && secret);

  // Load credentials from DB on mount
  useEffect(() => {
    if (credentialsLoaded.current) return;
    credentialsLoaded.current = true;

    const loadCredentials = async () => {
      if (!supabase) return;
      const session = await supabase.auth.getSession();
      if (!session.data.session?.user) {
        // Fallback to localStorage for unauthenticated state
        const lsToken = localStorage.getItem(STORAGE_KEY_TOKEN);
        const lsSecret = localStorage.getItem(STORAGE_KEY_SECRET);
        if (lsToken && lsSecret) {
          setToken(lsToken);
          setSecret(lsSecret);
        }
        return;
      }

      const { data } = await supabase
        .from("switchbot_credentials")
        .select("token, secret")
        .single();

      if (data?.token && data?.secret) {
        setToken(data.token);
        setSecret(data.secret);
        // Sync to localStorage for API calls
        localStorage.setItem(STORAGE_KEY_TOKEN, data.token);
        localStorage.setItem(STORAGE_KEY_SECRET, data.secret);
      } else {
        // Fallback: migrate from localStorage to DB
        const lsToken = localStorage.getItem(STORAGE_KEY_TOKEN);
        const lsSecret = localStorage.getItem(STORAGE_KEY_SECRET);
        if (lsToken && lsSecret) {
          setToken(lsToken);
          setSecret(lsSecret);
          await supabase.from("switchbot_credentials").upsert({
            user_id: session.data.session.user.id,
            token: lsToken,
            secret: lsSecret,
            is_valid: true,
          });
        }
      }
    };

    loadCredentials();
  }, []);

  const callSwitchBotApi = useCallback(
    async <T>(action: Record<string, unknown>): Promise<T | null> => {
      if (!token || !secret || !supabase) {
        setError("SwitchBot is not configured");
        return null;
      }

      const session = await supabase.auth.getSession();
      const accessToken = session.data.session?.access_token;
      if (!accessToken) {
        setError("Not authenticated");
        return null;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/switchbot`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
            "x-switchbot-token": token,
            "x-switchbot-secret": secret,
          },
          body: JSON.stringify(action),
        },
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `API error: ${response.status}`);
      }

      const data = (await response.json()) as SwitchBotApiResponse<T>;
      if (data.statusCode !== 100) {
        throw new Error(data.message || "SwitchBot API error");
      }

      return data.body;
    },
    [token, secret],
  );

  const configure = useCallback(async (newToken: string, newSecret: string) => {
    localStorage.setItem(STORAGE_KEY_TOKEN, newToken);
    localStorage.setItem(STORAGE_KEY_SECRET, newSecret);
    setToken(newToken);
    setSecret(newSecret);
    setError(null);

    // Save to DB
    if (supabase) {
      const session = await supabase.auth.getSession();
      const userId = session.data.session?.user?.id;
      if (userId) {
        await supabase.from("switchbot_credentials").upsert({
          user_id: userId,
          token: newToken,
          secret: newSecret,
          is_valid: true,
        });
      }
    }
  }, []);

  const disconnect = useCallback(async () => {
    localStorage.removeItem(STORAGE_KEY_TOKEN);
    localStorage.removeItem(STORAGE_KEY_SECRET);
    setToken(null);
    setSecret(null);
    setDevices([]);
    setInfraredRemotes([]);
    setScenes([]);
    setDeviceStatuses(new Map());
    setStatusHistory([]);
    setError(null);

    // Delete from DB
    if (supabase) {
      const session = await supabase.auth.getSession();
      const userId = session.data.session?.user?.id;
      if (userId) {
        await supabase
          .from("switchbot_credentials")
          .delete()
          .eq("user_id", userId);
      }
    }
  }, []);

  const fetchDevices = useCallback(async () => {
    if (!isConfigured) return;

    setIsLoading(true);
    setError(null);

    try {
      const data = await callSwitchBotApi<SwitchBotDevicesResponse>({
        action: "getDevices",
      });

      if (data) {
        const deviceList = data.deviceList || [];
        setDevices(deviceList);
        setInfraredRemotes(data.infraredRemoteList || []);

        // Auto-fetch status for all devices (in parallel, max 5 at a time)
        const statusPromises: Promise<void>[] = [];
        const newStatuses = new Map<string, SwitchBotDeviceStatus>();

        for (const device of deviceList) {
          const promise = (async () => {
            try {
              const status = await callSwitchBotApi<SwitchBotDeviceStatus>({
                action: "getDeviceStatus",
                deviceId: device.deviceId,
              });
              if (status) {
                newStatuses.set(device.deviceId, status);
              }
            } catch (err) {
              console.error(
                `Failed to get status for ${device.deviceName}:`,
                err,
              );
            }
          })();
          statusPromises.push(promise);
        }

        await Promise.all(statusPromises);
        setDeviceStatuses(newStatuses);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch devices");
    } finally {
      setIsLoading(false);
    }
  }, [isConfigured, callSwitchBotApi]);

  const fetchScenes = useCallback(async () => {
    if (!isConfigured) return;

    setIsLoading(true);
    setError(null);

    try {
      const data = await callSwitchBotApi<SwitchBotScene[]>({
        action: "getScenes",
      });

      if (data) {
        setScenes(data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch scenes");
    } finally {
      setIsLoading(false);
    }
  }, [isConfigured, callSwitchBotApi]);

  const getDeviceStatus = useCallback(
    async (deviceId: string): Promise<SwitchBotDeviceStatus | null> => {
      if (!isConfigured) return null;

      try {
        const status = await callSwitchBotApi<SwitchBotDeviceStatus>({
          action: "getDeviceStatus",
          deviceId,
        });

        if (status) {
          setDeviceStatuses((prev) => new Map(prev).set(deviceId, status));
        }

        return status;
      } catch (err) {
        console.error("Failed to get device status:", err);
        return null;
      }
    },
    [isConfigured, callSwitchBotApi],
  );

  const sendCommand = useCallback(
    async (
      deviceId: string,
      command: string,
      parameter?: string | number,
    ): Promise<boolean> => {
      if (!isConfigured) return false;

      setIsLoading(true);
      setError(null);

      try {
        await callSwitchBotApi({
          action: "sendCommand",
          deviceId,
          command,
          parameter,
        });

        // Refresh device status after command
        await getDeviceStatus(deviceId);

        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to send command");
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [isConfigured, callSwitchBotApi, getDeviceStatus],
  );

  const executeScene = useCallback(
    async (sceneId: string): Promise<boolean> => {
      if (!isConfigured) return false;

      setIsLoading(true);
      setError(null);

      try {
        await callSwitchBotApi({
          action: "executeScene",
          sceneId,
        });

        return true;
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to execute scene",
        );
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [isConfigured, callSwitchBotApi],
  );

  const fetchStatusHistory = useCallback(
    async (deviceId?: string, limit = 168) => {
      if (!supabase) return;

      let query = supabase
        .from("switchbot_status_history")
        .select("id, device_id, device_name, device_type, status, recorded_at")
        .order("recorded_at", { ascending: false })
        .limit(limit);

      if (deviceId) {
        query = query.eq("device_id", deviceId);
      }

      const { data, error: fetchError } = await query;
      if (fetchError) {
        console.error("Failed to fetch status history:", fetchError);
        return;
      }
      setStatusHistory((data ?? []) as SwitchBotStatusHistoryRow[]);
    },
    [],
  );

  const refresh = useCallback(async () => {
    await Promise.all([fetchDevices(), fetchScenes()]);
  }, [fetchDevices, fetchScenes]);

  // Auto-fetch devices and scenes when configured
  useEffect(() => {
    if (isConfigured) {
      refresh();
    }
  }, [isConfigured]);

  return {
    isConfigured,
    isLoading,
    error,
    devices,
    infraredRemotes,
    scenes,
    deviceStatuses,
    statusHistory,
    configure,
    disconnect,
    fetchDevices,
    fetchScenes,
    getDeviceStatus,
    sendCommand,
    executeScene,
    refresh,
    fetchStatusHistory,
  };
};
