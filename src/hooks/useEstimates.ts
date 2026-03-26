import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useOnlineStatus } from "./useOnlineStatus";
import { offlineDb, type InvoiceRow } from "../lib/offlineDb";
import { deleteLocalRow, upsertLocalRow } from "../lib/offlineStore";
import { supabase } from "../lib/offlineSync";
import { uploadToStorage } from "../lib/storageUpload";
import type { Estimate, EstimateStatus, InvoiceCategory } from "../types";

export const estimateStatusOptions: {
  value: EstimateStatus;
  label: string;
  color: string;
}[] = [
  { value: "draft", label: "Draft", color: "slate" },
  { value: "issued", label: "Issued", color: "blue" },
  { value: "accepted", label: "Accepted", color: "emerald" },
  { value: "rejected", label: "Rejected", color: "red" },
  { value: "expired", label: "Expired", color: "amber" },
];

const generateUuid = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto)
    return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
};

const toNumber = (value: unknown, fallback = 0) => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toEstimate = (row: Record<string, unknown>): Estimate => ({
  id: row.id as string,
  estimateNumber: (row.invoice_number as string) ?? "",
  clientId: (row.client_id as string) ?? undefined,
  projectId: (row.project_id as string) ?? undefined,
  issueDate: (row.issue_date as string) ?? undefined,
  expiryDate: (row.due_date as string) ?? undefined,
  subject: undefined,
  amount: toNumber(row.amount, 0),
  currency: (row.currency as string) ?? "JPY",
  status: (row.status as EstimateStatus) ?? "issued",
  category: (row.category as InvoiceCategory) ?? undefined,
  pdfStoragePath: (row.pdf_storage_path as string) ?? undefined,
  notes: (row.notes as string) ?? "",
  order: (row.order_index as number | null) ?? undefined,
  createdAt: row.created_at as string | undefined,
  updatedAt: row.updated_at as string | undefined,
});

const toEstimateRow = (estimate: Estimate, userId: string) => ({
  id: estimate.id,
  user_id: userId,
  invoice_number: estimate.estimateNumber,
  client_id: estimate.clientId ?? null,
  project_id: estimate.projectId ?? null,
  issue_date: estimate.issueDate ?? null,
  due_date: estimate.expiryDate ?? null,
  paid_date: null,
  amount: estimate.amount,
  currency: estimate.currency,
  status: estimate.status,
  category: estimate.category ?? null,
  document_type: "estimate",
  pdf_storage_path: estimate.pdfStoragePath ?? null,
  notes: estimate.notes,
  order_index: estimate.order ?? null,
  repeat_type: "none",
  repeat_next_date: null,
  repeat_source_id: null,
  created_at: estimate.createdAt,
  updated_at: estimate.updatedAt,
});

export const useEstimates = () => {
  const { user } = useAuth();
  const isOnline = useOnlineStatus();
  const [estimates, setEstimates] = useState<Estimate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const saveTimeoutRef = useRef<{ [key: string]: NodeJS.Timeout }>({});

  const fetchData = useCallback(async () => {
    if (!user) {
      setEstimates([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      let rows: unknown[] = [];
      if (isOnline && supabase) {
        try {
          const { data } = await supabase
            .from("invoices")
            .select("*")
            .eq("user_id", user.id)
            .eq("document_type", "estimate");
          if (data) {
            rows = data;
            await offlineDb.invoices.bulkPut(data as InvoiceRow[]);
          }
        } catch (err) {
          console.error("Failed to fetch estimates from Supabase:", err);
        }
      }
      if (rows.length === 0) {
        rows = (
          await offlineDb.invoices.where("user_id").equals(user.id).toArray()
        ).filter((r) => r.document_type === "estimate");
      }
      const normalized = rows
        .map((row) => toEstimate(row as Record<string, unknown>))
        .sort((a, b) => {
          const aO = a.order ?? Number.POSITIVE_INFINITY;
          const bO = b.order ?? Number.POSITIVE_INFINITY;
          if (aO !== bO) return aO - bO;
          return (b.createdAt || "").localeCompare(a.createdAt || "");
        });
      setEstimates(normalized);
    } catch (error) {
      console.error("Error fetching estimates:", error);
    } finally {
      setIsLoading(false);
    }
  }, [user, isOnline]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const addEstimate = async () => {
    if (!user) return;
    const now = new Date().toISOString();
    const newEstimate: Estimate = {
      id: generateUuid(),
      estimateNumber: "",
      amount: 0,
      currency: "JPY",
      status: "draft",
      notes: "",
      createdAt: now,
      updatedAt: now,
    };
    try {
      setIsSyncing(true);
      await upsertLocalRow("invoices", toEstimateRow(newEstimate, user.id));
      setEstimates((prev) => [newEstimate, ...prev]);
    } catch (error) {
      console.error("Error adding estimate:", error);
    } finally {
      setIsSyncing(false);
    }
  };

  const updateEstimate = (id: string, updates: Partial<Estimate>) => {
    if (!user) return;
    const updated = estimates.map((est) =>
      est.id === id
        ? { ...est, ...updates, updatedAt: new Date().toISOString() }
        : est,
    );
    setEstimates(updated);
    if (saveTimeoutRef.current[`est-${id}`])
      clearTimeout(saveTimeoutRef.current[`est-${id}`]);
    saveTimeoutRef.current[`est-${id}`] = setTimeout(async () => {
      const item = updated.find((est) => est.id === id);
      if (!item) return;
      try {
        setIsSyncing(true);
        await upsertLocalRow("invoices", toEstimateRow(item, user.id));
      } catch (error) {
        console.error("Error updating estimate:", error);
      } finally {
        setIsSyncing(false);
      }
    }, 500);
  };

  const removeEstimate = async (id: string) => {
    if (!user) return;
    try {
      setIsSyncing(true);
      const est = estimates.find((e) => e.id === id);
      if (est?.pdfStoragePath && isOnline && supabase) {
        await supabase.storage.from("money-files").remove([est.pdfStoragePath]);
      }
      await deleteLocalRow("invoices", id);
      setEstimates((prev) => prev.filter((e) => e.id !== id));
    } catch (error) {
      console.error("Error removing estimate:", error);
    } finally {
      setIsSyncing(false);
    }
  };

  const reorderEstimates = useCallback(
    async (reordered: Estimate[]) => {
      if (!user) return;
      const withOrder = reordered.map((est, i) => ({ ...est, order: i }));
      setEstimates(withOrder);
      try {
        setIsSyncing(true);
        for (const est of withOrder)
          await upsertLocalRow("invoices", toEstimateRow(est, user.id));
      } catch (error) {
        console.error("Error reordering estimates:", error);
      } finally {
        setIsSyncing(false);
      }
    },
    [user],
  );

  const uploadPdf = async (id: string, file: File) => {
    if (!user) return;
    const path = `${user.id}/estimates/${id}.pdf`;
    const buffer = await file.arrayBuffer();
    await uploadToStorage("money-files", path, buffer, file.type, {
      tableName: "invoices",
      recordId: id,
      fieldName: "pdf_storage_path",
    });
    updateEstimate(id, { pdfStoragePath: path });
  };

  const deletePdf = async (id: string) => {
    const est = estimates.find((e) => e.id === id);
    if (!est?.pdfStoragePath || !supabase) return;
    try {
      await supabase.storage.from("money-files").remove([est.pdfStoragePath]);
    } catch (err) {
      console.error("Error deleting PDF:", err);
    }
    updateEstimate(id, { pdfStoragePath: undefined });
  };

  const getPdfSignedUrl = async (
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

  const restoreState = async (state: { estimates: Estimate[] }) => {
    if (!user) {
      setEstimates(state.estimates);
      return;
    }
    setEstimates(state.estimates);
    try {
      const current = (
        await offlineDb.invoices.where("user_id").equals(user.id).toArray()
      ).filter((r) => r.document_type === "estimate");
      const nextIds = new Set(state.estimates.map((e) => e.id));
      for (const row of current) {
        if (!nextIds.has(row.id)) await deleteLocalRow("invoices", row.id);
      }
      for (const est of state.estimates)
        await upsertLocalRow("invoices", toEstimateRow(est, user.id));
    } catch (error) {
      console.error("Error restoring estimate state:", error);
    }
  };

  const refresh = useCallback(async () => {
    setIsSyncing(true);
    await fetchData();
    setIsSyncing(false);
  }, [fetchData]);

  return {
    estimates,
    isLoading,
    isSyncing,
    addEstimate,
    updateEstimate,
    removeEstimate,
    reorderEstimates,
    uploadPdf,
    deletePdf,
    getPdfSignedUrl,
    refresh,
    restoreState,
  };
};
