import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useOnlineStatus } from "./useOnlineStatus";
import { offlineDb, type MoneyDocumentRow } from "../lib/offlineDb";
import { deleteLocalRow, upsertLocalRow } from "../lib/offlineStore";
import { supabase } from "../lib/offlineSync";
import { uploadToStorage } from "../lib/storageUpload";
import type { Contract, ContractType } from "../types";

export const contractTypeOptions: {
  value: ContractType;
  label: string;
}[] = [
  { value: "contract", label: "Contract" },
  { value: "receipt", label: "Receipt" },
  { value: "report", label: "Report" },
  { value: "other", label: "Other" },
];

const generateUuid = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto)
    return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
};

const toContract = (row: Record<string, unknown>): Contract => ({
  id: row.id as string,
  title: (row.title as string) ?? "",
  contractType: (row.document_type as ContractType) ?? "other",
  tags: (row.tags as string[]) ?? [],
  storagePath: (row.storage_path as string) ?? undefined,
  fileName: (row.file_name as string) ?? undefined,
  fileSize: (row.file_size as number) ?? undefined,
  mimeType: (row.mime_type as string) ?? undefined,
  ocrExtracted: (row.ocr_extracted as Record<string, unknown>) ?? undefined,
  notes: (row.notes as string) ?? "",
  order: (row.order_index as number | null) ?? undefined,
  createdAt: row.created_at as string | undefined,
  updatedAt: row.updated_at as string | undefined,
});

const toContractRow = (contract: Contract, userId: string) => ({
  id: contract.id,
  user_id: userId,
  title: contract.title,
  document_type: contract.contractType,
  tags: contract.tags,
  storage_path: contract.storagePath ?? null,
  file_name: contract.fileName ?? null,
  file_size: contract.fileSize ?? null,
  mime_type: contract.mimeType ?? null,
  ocr_extracted: contract.ocrExtracted ?? {},
  notes: contract.notes,
  order_index: contract.order ?? null,
  created_at: contract.createdAt,
  updated_at: contract.updatedAt,
});

export const useContracts = () => {
  const { user } = useAuth();
  const isOnline = useOnlineStatus();
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const saveTimeoutRef = useRef<{ [key: string]: NodeJS.Timeout }>({});

  const fetchData = useCallback(async () => {
    if (!user) {
      setContracts([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      let rows: unknown[] = [];
      if (isOnline && supabase) {
        try {
          const { data } = await supabase
            .from("money_documents")
            .select("*")
            .eq("user_id", user.id);
          if (data) {
            rows = data;
            await offlineDb.money_documents.bulkPut(data as MoneyDocumentRow[]);
          }
        } catch (err) {
          console.error("Failed to fetch contracts from Supabase:", err);
        }
      }
      if (rows.length === 0) {
        rows = await offlineDb.money_documents
          .where("user_id")
          .equals(user.id)
          .toArray();
      }
      const normalized = rows
        .map((row) => toContract(row as Record<string, unknown>))
        .sort((a, b) => {
          const aO = a.order ?? Number.POSITIVE_INFINITY;
          const bO = b.order ?? Number.POSITIVE_INFINITY;
          if (aO !== bO) return aO - bO;
          return (b.createdAt || "").localeCompare(a.createdAt || "");
        });
      setContracts(normalized);
    } catch (error) {
      console.error("Error fetching contracts:", error);
    } finally {
      setIsLoading(false);
    }
  }, [user, isOnline]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const addContract = async () => {
    if (!user) return;
    const now = new Date().toISOString();
    const newContract: Contract = {
      id: generateUuid(),
      title: "",
      contractType: "other",
      tags: [],
      notes: "",
      createdAt: now,
      updatedAt: now,
    };
    try {
      setIsSyncing(true);
      await upsertLocalRow(
        "money_documents",
        toContractRow(newContract, user.id),
      );
      setContracts((prev) => [newContract, ...prev]);
    } catch (error) {
      console.error("Error adding contract:", error);
    } finally {
      setIsSyncing(false);
    }
  };

  const updateContract = (id: string, updates: Partial<Contract>) => {
    if (!user) return;
    const updated = contracts.map((c) =>
      c.id === id
        ? { ...c, ...updates, updatedAt: new Date().toISOString() }
        : c,
    );
    setContracts(updated);
    if (saveTimeoutRef.current[`contract-${id}`])
      clearTimeout(saveTimeoutRef.current[`contract-${id}`]);
    saveTimeoutRef.current[`contract-${id}`] = setTimeout(async () => {
      const item = updated.find((c) => c.id === id);
      if (!item) return;
      try {
        setIsSyncing(true);
        await upsertLocalRow("money_documents", toContractRow(item, user.id));
      } catch (error) {
        console.error("Error updating contract:", error);
      } finally {
        setIsSyncing(false);
      }
    }, 500);
  };

  const removeContract = async (id: string) => {
    if (!user) return;
    try {
      setIsSyncing(true);
      const contract = contracts.find((c) => c.id === id);
      if (contract?.storagePath && isOnline && supabase) {
        await supabase.storage
          .from("money-files")
          .remove([contract.storagePath]);
      }
      await deleteLocalRow("money_documents", id);
      setContracts((prev) => prev.filter((c) => c.id !== id));
    } catch (error) {
      console.error("Error removing contract:", error);
    } finally {
      setIsSyncing(false);
    }
  };

  const reorderContracts = useCallback(
    async (reordered: Contract[]) => {
      if (!user) return;
      const withOrder = reordered.map((c, i) => ({ ...c, order: i }));
      setContracts(withOrder);
      try {
        setIsSyncing(true);
        for (const c of withOrder)
          await upsertLocalRow("money_documents", toContractRow(c, user.id));
      } catch (error) {
        console.error("Error reordering contracts:", error);
      } finally {
        setIsSyncing(false);
      }
    },
    [user],
  );

  const uploadFile = async (id: string, file: File) => {
    if (!user) return;
    const ext = file.name.split(".").pop() || "bin";
    const path = `${user.id}/documents/${id}.${ext}`;
    const buffer = await file.arrayBuffer();
    await uploadToStorage("money-files", path, buffer, file.type, {
      tableName: "money_documents",
      recordId: id,
      fieldName: "storage_path",
    });
    updateContract(id, {
      storagePath: path,
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type,
    });
  };

  const deleteFile = async (id: string) => {
    const contract = contracts.find((c) => c.id === id);
    if (!contract?.storagePath || !supabase) return;
    try {
      await supabase.storage.from("money-files").remove([contract.storagePath]);
    } catch (err) {
      console.error("Error deleting file:", err);
    }
    updateContract(id, {
      storagePath: undefined,
      fileName: undefined,
      fileSize: undefined,
      mimeType: undefined,
      ocrExtracted: undefined,
    });
  };

  const getFileSignedUrl = async (
    storagePath: string,
  ): Promise<string | null> => {
    if (!supabase) return null;
    const { data, error } = await supabase.storage
      .from("money-files")
      .createSignedUrl(storagePath, 3600);
    if (error) {
      console.error("Error creating signed URL:", error);
      return null;
    }
    return data.signedUrl;
  };

  const runOcr = async (
    id: string,
    file: File,
  ): Promise<Record<string, unknown> | null> => {
    if (!supabase) return null;
    try {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = "";
      for (let i = 0; i < bytes.length; i++)
        binary += String.fromCharCode(bytes[i]);
      const base64Data = btoa(binary);

      const { data, error } = await supabase.functions.invoke("ocr_document", {
        body: { base64Data, mimeType: file.type, type: "contract" },
      });
      if (error) throw error;
      if (data?.result) {
        const ocrResult = data.result as Record<string, unknown>;
        updateContract(id, { ocrExtracted: ocrResult });
        return ocrResult;
      }
      return null;
    } catch (err) {
      console.error("Contract OCR failed:", err);
      return null;
    }
  };

  const restoreState = async (state: { contracts: Contract[] }) => {
    if (!user) {
      setContracts(state.contracts);
      return;
    }
    setContracts(state.contracts);
    try {
      const current = await offlineDb.money_documents
        .where("user_id")
        .equals(user.id)
        .toArray();
      const nextIds = new Set(state.contracts.map((c) => c.id));
      for (const row of current) {
        if (!nextIds.has(row.id))
          await deleteLocalRow("money_documents", row.id);
      }
      for (const c of state.contracts)
        await upsertLocalRow("money_documents", toContractRow(c, user.id));
    } catch (error) {
      console.error("Error restoring contract state:", error);
    }
  };

  const refresh = useCallback(async () => {
    setIsSyncing(true);
    await fetchData();
    setIsSyncing(false);
  }, [fetchData]);

  return {
    contracts,
    isLoading,
    isSyncing,
    addContract,
    updateContract,
    removeContract,
    reorderContracts,
    uploadFile,
    deleteFile,
    getFileSignedUrl,
    runOcr,
    refresh,
    restoreState,
  };
};
