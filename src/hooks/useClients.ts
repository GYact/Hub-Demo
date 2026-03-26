import { useState, useEffect, useCallback, useRef } from "react";
import type { Client, ClientStatus, ClientTab, GroupColor } from "../types";
import {
  fetchClients,
  upsertClient,
  deleteClient as deleteClientFromDb,
  fetchClientTabs,
  upsertClientTab,
  deleteClientTab as deleteTabFromDb,
  deleteClientsOfTab,
} from "../lib/offlineData";
import { supabase, getSyncUserId } from "../lib/offlineSync";
import { uploadToStorage } from "../lib/storageUpload";

export const statusOptions: {
  value: ClientStatus;
  label: string;
  color: string;
}[] = [
  { value: "active", label: "Active", color: "emerald" },
  { value: "inactive", label: "Inactive", color: "slate" },
  { value: "prospect", label: "Prospect", color: "amber" },
];

// 削除不可のデフォルトタブID
export const PROTECTED_TAB_IDS = ["corporate", "individual", "affiliations"];
export const CORPORATE_TAB_ID = "corporate";
export const INDIVIDUAL_TAB_ID = "individual";
export const AFFILIATIONS_TAB_ID = "affiliations";

const DEFAULT_TABS: ClientTab[] = [
  { id: CORPORATE_TAB_ID, name: "Corporate", color: "blue", order: 0 },
  { id: INDIVIDUAL_TAB_ID, name: "Individual", color: "green", order: 1 },
  { id: AFFILIATIONS_TAB_ID, name: "Affiliations", color: "purple", order: 2 },
];

export const useClients = () => {
  const [tabs, setTabs] = useState<ClientTab[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);

  const syncTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  // Load data on mount
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);

      const [loadedTabs, loadedClients] = await Promise.all([
        fetchClientTabs(),
        fetchClients(),
      ]);
      setTabs(loadedTabs.length > 0 ? loadedTabs : DEFAULT_TABS);
      setClients(loadedClients);

      setIsLoading(false);
    };

    loadData();
  }, []);

  // Debounced sync
  const debouncedSync = useCallback((syncFn: () => Promise<void>) => {
    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current);
    }
    syncTimeoutRef.current = setTimeout(async () => {
      setIsSyncing(true);
      await syncFn();
      setIsSyncing(false);
    }, 500);
  }, []);

  // Tab operations
  const addTab = useCallback(
    async (name: string, color: GroupColor = "blue") => {
      const newTab: ClientTab = {
        id: Math.random().toString(36).substr(2, 9),
        name,
        color,
        order: tabs.length,
      };

      setTabs((prev) => [...prev, newTab]);
      debouncedSync(async () => {
        await upsertClientTab(newTab);
      });

      return newTab.id;
    },
    [tabs, debouncedSync],
  );

  const updateTab = useCallback(
    (id: string, updates: Partial<ClientTab>) => {
      setTabs((prev) => {
        const updated = prev.map((tab) =>
          tab.id === id ? { ...tab, ...updates } : tab,
        );

        const updatedTab = updated.find((t) => t.id === id);
        if (updatedTab) {
          debouncedSync(async () => {
            await upsertClientTab(updatedTab);
          });
        }

        return updated;
      });
    },
    [debouncedSync],
  );

  const removeTab = useCallback(async (id: string) => {
    // 保護されたタブは削除不可
    if (PROTECTED_TAB_IDS.includes(id)) {
      return;
    }

    setTabs((prev) => prev.filter((tab) => tab.id !== id));
    setClients((prev) => prev.filter((client) => client.tabId !== id));

    setIsSyncing(true);
    await deleteClientsOfTab(id);
    await deleteTabFromDb(id);
    setIsSyncing(false);
  }, []);

  // Client operations
  const updateClient = useCallback(
    (id: string, updates: Partial<Client>) => {
      setClients((prev) => {
        const updated = prev.map((c) => {
          if (c.id === id) {
            const newClient = { ...c, ...updates };
            debouncedSync(async () => {
              await upsertClient(newClient);
            });
            return newClient;
          }
          return c;
        });
        return updated;
      });
    },
    [debouncedSync],
  );

  const addClient = useCallback(async (tabId: string) => {
    const newId = Math.random().toString(36).substr(2, 9);
    const newClient: Client = {
      id: newId,
      tabId,
      name: "",
      status: "prospect",
    };

    setClients((prev) => [...prev, newClient]);

    setIsSyncing(true);
    await upsertClient(newClient);
    setIsSyncing(false);

    return newId;
  }, []);

  const removeClient = useCallback(async (id: string) => {
    setClients((prev) => prev.filter((c) => c.id !== id));

    setIsSyncing(true);
    await deleteClientFromDb(id);
    setIsSyncing(false);
  }, []);

  const getClientsByTab = useCallback(
    (tabId: string) => {
      return clients.filter((client) => client.tabId === tabId);
    },
    [clients],
  );

  // 法人クライアント一覧を取得
  const getCorporateClients = useCallback(() => {
    return clients.filter((client) => client.tabId === CORPORATE_TAB_ID);
  }, [clients]);

  // 個人クライアントが紐づく法人クライアントを取得
  const getCorporateClient = useCallback(
    (corporateClientId: string | undefined) => {
      if (!corporateClientId) return null;
      return (
        clients.find(
          (client) =>
            client.id === corporateClientId &&
            client.tabId === CORPORATE_TAB_ID,
        ) || null
      );
    },
    [clients],
  );

  // 法人クライアントに紐づく個人クライアント一覧を取得
  const getIndividualClientsByCorporate = useCallback(
    (corporateClientId: string) => {
      return clients.filter(
        (client) =>
          client.tabId === INDIVIDUAL_TAB_ID &&
          client.corporateClientId === corporateClientId,
      );
    },
    [clients],
  );

  // タブの並び替え
  const reorderTabs = useCallback(
    (reorderedTabs: ClientTab[]) => {
      // Update order property for each tab
      const tabsWithOrder = reorderedTabs.map((tab, index) => ({
        ...tab,
        order: index,
      }));

      setTabs(tabsWithOrder);

      debouncedSync(async () => {
        for (const tab of tabsWithOrder) {
          await upsertClientTab(tab);
        }
      });
    },
    [debouncedSync],
  );

  // クライアントの並び替え
  const reorderClients = useCallback(
    (reorderedClients: Client[]) => {
      // Update order property for each client
      const clientsWithOrder = reorderedClients.map((client, index) => ({
        ...client,
        order: index,
      }));

      // Update only the clients that were reordered, keep others unchanged
      setClients((prev) => {
        const tabId = clientsWithOrder[0]?.tabId;
        if (!tabId) return prev;

        // Keep clients from other tabs, replace clients from this tab
        const otherClients = prev.filter((c) => c.tabId !== tabId);
        return [...otherClients, ...clientsWithOrder];
      });

      debouncedSync(async () => {
        for (const client of clientsWithOrder) {
          await upsertClient(client);
        }
      });
    },
    [debouncedSync],
  );

  const uploadPhoto = useCallback(
    async (
      id: string,
      file: File,
      side: "front" | "back" = "front",
    ): Promise<string | null> => {
      const userId = getSyncUserId();
      if (!userId) return null;
      const ext = file.name.split(".").pop() || "jpg";
      const suffix = side === "back" ? "_back" : "";
      const path = `${userId}/clients/${id}${suffix}.${ext}`;
      const fieldName =
        side === "back" ? "photo_storage_path_back" : "photo_storage_path";
      const buffer = await file.arrayBuffer();
      const uploaded = await uploadToStorage(
        "money-files",
        path,
        buffer,
        file.type,
        {
          tableName: "clients",
          recordId: id,
          fieldName,
        },
      );
      if (!uploaded) return null;
      if (side === "back") {
        updateClient(id, { photoStoragePathBack: path });
      } else {
        updateClient(id, { photoStoragePath: path });
      }
      return path;
    },
    [updateClient],
  );

  const getPhotoSignedUrl = useCallback(
    async (storagePath: string): Promise<string | null> => {
      if (!supabase) return null;
      const { data, error } = await supabase.storage
        .from("money-files")
        .createSignedUrl(storagePath, 3600);
      if (error) {
        // Fallback: if path lacks user ID prefix, try with it
        const userId = getSyncUserId();
        if (userId && !storagePath.startsWith(userId)) {
          const retry = await supabase.storage
            .from("money-files")
            .createSignedUrl(`${userId}/${storagePath}`, 3600);
          if (!retry.error && retry.data) return retry.data.signedUrl;
        }
        return null;
      }
      return data.signedUrl;
    },
    [],
  );

  const runOcr = useCallback(
    async (id: string, file: File): Promise<Record<string, unknown> | null> => {
      if (!supabase) return null;
      try {
        const buffer = await file.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        let binary = "";
        for (let i = 0; i < bytes.length; i++)
          binary += String.fromCharCode(bytes[i]);
        const base64Data = btoa(binary);

        const { data, error } = await supabase.functions.invoke(
          "ocr_document",
          { body: { base64Data, mimeType: file.type, type: "business_card" } },
        );
        if (error) throw error;
        if (data?.result) {
          const ocrResult = data.result as Record<string, unknown>;
          updateClient(id, { ocrExtracted: ocrResult });
          return ocrResult;
        }
        return null;
      } catch (err) {
        console.error("Business card OCR failed:", err);
        return null;
      }
    },
    [updateClient],
  );

  // Refresh data from Supabase
  const refreshClients = useCallback(async () => {
    setIsSyncing(true);
    const [loadedTabs, loadedClients] = await Promise.all([
      fetchClientTabs(),
      fetchClients(),
    ]);
    setTabs(loadedTabs.length > 0 ? loadedTabs : DEFAULT_TABS);
    setClients(loadedClients);
    setIsSyncing(false);
  }, []);

  // Restore state for undo/redo
  const restoreState = useCallback(
    async (state: { tabs: ClientTab[]; clients: Client[] }) => {
      setTabs(state.tabs);
      setClients(state.clients);
    },
    [],
  );

  return {
    tabs,
    clients,
    isLoading,
    isSyncing,
    addTab,
    updateTab,
    removeTab,
    updateClient,
    addClient,
    removeClient,
    uploadPhoto,
    getPhotoSignedUrl,
    runOcr,
    getClientsByTab,
    getCorporateClients,
    getCorporateClient,
    getIndividualClientsByCorporate,
    reorderTabs,
    reorderClients,
    refreshClients,
    restoreState,
  };
};
