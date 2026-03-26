import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useOnlineStatus } from "./useOnlineStatus";
import { offlineDb, type InvoiceRow } from "../lib/offlineDb";
import { deleteLocalRow, upsertLocalRow } from "../lib/offlineStore";
import { supabase } from "../lib/offlineSync";
import { uploadToStorage } from "../lib/storageUpload";
import type {
  Invoice,
  InvoiceItem,
  InvoiceStatus,
  InvoiceCategory,
  InvoiceRepeatType,
} from "../types";

export const invoiceStatusOptions: {
  value: InvoiceStatus;
  label: string;
  color: string;
}[] = [
  { value: "draft", label: "Draft", color: "slate" },
  { value: "issued", label: "Issued", color: "blue" },
  { value: "paid", label: "Paid", color: "emerald" },
  { value: "overdue", label: "Overdue", color: "red" },
  { value: "cancelled", label: "Cancelled", color: "amber" },
];

export const invoiceCategoryOptions: {
  value: InvoiceCategory;
  label: string;
}[] = [
  { value: "freelance", label: "Freelance" },
  { value: "salary", label: "Salary" },
  { value: "dividend", label: "Dividend" },
  { value: "other", label: "Other" },
];

export const invoiceRepeatOptions: {
  value: InvoiceRepeatType;
  label: string;
}[] = [
  { value: "none", label: "No repeat" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "yearly", label: "Yearly" },
];

export const calcNextRepeatDate = (
  baseDate: string,
  repeatType: InvoiceRepeatType,
): string | undefined => {
  if (repeatType === "none") return undefined;
  const d = new Date(baseDate + "T00:00:00+09:00");
  switch (repeatType) {
    case "monthly":
      d.setMonth(d.getMonth() + 1);
      break;
    case "quarterly":
      d.setMonth(d.getMonth() + 3);
      break;
    case "yearly":
      d.setFullYear(d.getFullYear() + 1);
      break;
  }
  return d.toISOString().split("T")[0];
};

const EXCHANGE_RATES: Record<string, number> = { JPY: 1, USD: 155, EUR: 165 };
const convertToJPY = (amount: number, currency: string): number =>
  amount * (EXCHANGE_RATES[currency] || 1);

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

const toInvoice = (row: Record<string, unknown>): Invoice => ({
  id: row.id as string,
  invoiceNumber: (row.invoice_number as string) ?? "",
  clientId: (row.client_id as string) ?? undefined,
  projectId: (row.project_id as string) ?? undefined,
  issueDate: (row.issue_date as string) ?? undefined,
  dueDate: (row.due_date as string) ?? undefined,
  paidDate: (row.paid_date as string) ?? undefined,
  amount: toNumber(row.amount, 0),
  currency: (row.currency as string) ?? "JPY",
  status: (row.status as InvoiceStatus) ?? "issued",
  category: (row.category as InvoiceCategory) ?? undefined,
  items: Array.isArray(row.items) ? (row.items as InvoiceItem[]) : undefined,
  taxRate: row.tax_rate != null ? toNumber(row.tax_rate, 10) : 10,
  taxIncluded: row.tax_included === true,
  pdfStoragePath: (row.pdf_storage_path as string) ?? undefined,
  ocrExtracted: (row.ocr_extracted as Record<string, unknown>) ?? undefined,
  notes: (row.notes as string) ?? "",
  order: (row.order_index as number | null) ?? undefined,
  repeatType: (row.repeat_type as InvoiceRepeatType) ?? "none",
  repeatNextDate: (row.repeat_next_date as string) ?? undefined,
  repeatSourceId: (row.repeat_source_id as string) ?? undefined,
  createdAt: row.created_at as string | undefined,
  updatedAt: row.updated_at as string | undefined,
});

const toInvoiceRow = (invoice: Invoice, userId: string) => ({
  id: invoice.id,
  user_id: userId,
  invoice_number: invoice.invoiceNumber,
  client_id: invoice.clientId ?? null,
  project_id: invoice.projectId ?? null,
  issue_date: invoice.issueDate ?? null,
  due_date: invoice.dueDate ?? null,
  paid_date: invoice.paidDate ?? null,
  amount: invoice.amount,
  currency: invoice.currency,
  status: invoice.status,
  category: invoice.category ?? null,
  items: invoice.items ?? [],
  tax_rate: invoice.taxRate ?? 10,
  tax_included: invoice.taxIncluded ?? false,
  document_type: "invoice",
  pdf_storage_path: invoice.pdfStoragePath ?? null,
  ocr_extracted: invoice.ocrExtracted ?? {},
  notes: invoice.notes,
  order_index: invoice.order ?? null,
  repeat_type: invoice.repeatType ?? "none",
  repeat_next_date: invoice.repeatNextDate ?? null,
  repeat_source_id: invoice.repeatSourceId ?? null,
  created_at: invoice.createdAt,
  updated_at: invoice.updatedAt,
});

export const useInvoices = () => {
  const { user } = useAuth();
  const isOnline = useOnlineStatus();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const saveTimeoutRef = useRef<{ [key: string]: NodeJS.Timeout }>({});

  const fetchData = useCallback(async () => {
    if (!user) {
      setInvoices([]);
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
            .eq("document_type", "invoice");
          if (data) {
            rows = data;
            await offlineDb.invoices.bulkPut(data as InvoiceRow[]);
          }
        } catch (err) {
          console.error("Failed to fetch invoices from Supabase:", err);
        }
      }
      if (rows.length === 0) {
        rows = (
          await offlineDb.invoices.where("user_id").equals(user.id).toArray()
        ).filter((r) => (r.document_type ?? "invoice") === "invoice");
      }
      const normalized = rows
        .map((row) => toInvoice(row as Record<string, unknown>))
        .sort((a, b) => {
          const aO = a.order ?? Number.POSITIVE_INFINITY;
          const bO = b.order ?? Number.POSITIVE_INFINITY;
          if (aO !== bO) return aO - bO;
          return (b.createdAt || "").localeCompare(a.createdAt || "");
        });
      setInvoices(normalized);
    } catch (error) {
      console.error("Error fetching invoices:", error);
    } finally {
      setIsLoading(false);
    }
  }, [user, isOnline]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const nextInvoiceNumber = useCallback(() => {
    const now = new Date();
    const ym = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
    const prefix = `INV-${ym}-`;
    const existing = invoices
      .map((i) => i.invoiceNumber)
      .filter((n) => n.startsWith(prefix))
      .map((n) => parseInt(n.slice(prefix.length), 10))
      .filter((n) => !isNaN(n));
    const seq = existing.length > 0 ? Math.max(...existing) + 1 : 1;
    return `${prefix}${String(seq).padStart(3, "0")}`;
  }, [invoices]);

  const addInvoice = async () => {
    if (!user) return;
    const now = new Date().toISOString();
    const newInvoice: Invoice = {
      id: generateUuid(),
      invoiceNumber: nextInvoiceNumber(),
      amount: 0,
      currency: "JPY",
      status: "issued",
      notes: "",
      createdAt: now,
      updatedAt: now,
    };
    try {
      setIsSyncing(true);
      await upsertLocalRow("invoices", toInvoiceRow(newInvoice, user.id));
      setInvoices((prev) => [newInvoice, ...prev]);
    } catch (error) {
      console.error("Error adding invoice:", error);
    } finally {
      setIsSyncing(false);
    }
  };

  const updateInvoice = (id: string, updates: Partial<Invoice>) => {
    if (!user) return;
    const updated = invoices.map((inv) =>
      inv.id === id
        ? { ...inv, ...updates, updatedAt: new Date().toISOString() }
        : inv,
    );
    setInvoices(updated);
    if (saveTimeoutRef.current[`inv-${id}`])
      clearTimeout(saveTimeoutRef.current[`inv-${id}`]);
    saveTimeoutRef.current[`inv-${id}`] = setTimeout(async () => {
      const item = updated.find((inv) => inv.id === id);
      if (!item) return;
      try {
        setIsSyncing(true);
        await upsertLocalRow("invoices", toInvoiceRow(item, user.id));
      } catch (error) {
        console.error("Error updating invoice:", error);
      } finally {
        setIsSyncing(false);
      }
    }, 500);
  };

  const removeInvoice = async (id: string) => {
    if (!user) return;
    try {
      setIsSyncing(true);
      const inv = invoices.find((i) => i.id === id);
      if (inv?.pdfStoragePath && isOnline && supabase) {
        await supabase.storage.from("money-files").remove([inv.pdfStoragePath]);
      }
      await deleteLocalRow("invoices", id);
      setInvoices((prev) => prev.filter((i) => i.id !== id));
    } catch (error) {
      console.error("Error removing invoice:", error);
    } finally {
      setIsSyncing(false);
    }
  };

  const reorderInvoices = useCallback(
    async (reordered: Invoice[]) => {
      if (!user) return;
      const withOrder = reordered.map((inv, i) => ({ ...inv, order: i }));
      setInvoices(withOrder);
      try {
        setIsSyncing(true);
        for (const inv of withOrder)
          await upsertLocalRow("invoices", toInvoiceRow(inv, user.id));
      } catch (error) {
        console.error("Error reordering invoices:", error);
      } finally {
        setIsSyncing(false);
      }
    },
    [user],
  );

  const uploadPdf = async (id: string, file: File) => {
    if (!user) return;
    const path = `${user.id}/invoices/${id}.pdf`;
    const buffer = await file.arrayBuffer();
    await uploadToStorage("money-files", path, buffer, file.type, {
      tableName: "invoices",
      recordId: id,
      fieldName: "pdf_storage_path",
    });
    updateInvoice(id, { pdfStoragePath: path });
  };

  const deletePdf = async (id: string) => {
    const inv = invoices.find((i) => i.id === id);
    if (!inv?.pdfStoragePath || !supabase) return;
    try {
      await supabase.storage.from("money-files").remove([inv.pdfStoragePath]);
    } catch (err) {
      console.error("Error deleting PDF:", err);
    }
    updateInvoice(id, { pdfStoragePath: undefined, ocrExtracted: undefined });
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
        body: { base64Data, mimeType: file.type, type: "invoice" },
      });
      if (error) throw error;
      if (data?.result) {
        const ocrResult = data.result as Record<string, unknown>;
        updateInvoice(id, { ocrExtracted: ocrResult });
        return ocrResult;
      }
      return null;
    } catch (err) {
      console.error("Invoice OCR failed:", err);
      return null;
    }
  };

  const generateInvoicePdf = async (id: string): Promise<boolean> => {
    if (!supabase) return false;
    try {
      const { data, error } = await supabase.functions.invoke(
        "generate_invoice_pdf",
        { body: { invoiceId: id } },
      );
      if (error) {
        // Extract actual error message from FunctionsHttpError context
        let msg = error.message;
        try {
          const ctx = (error as { context?: Response }).context;
          if (ctx instanceof Response) {
            const body = await ctx.json();
            msg = body?.error || msg;
          }
        } catch {
          // context already consumed or not available
        }
        throw new Error(msg);
      }
      if (data?.success) {
        updateInvoice(id, {
          pdfStoragePath: data.pdfStoragePath,
          status: "issued" as InvoiceStatus,
        });
        return true;
      }
      if (data?.error) {
        throw new Error(data.error);
      }
      return false;
    } catch (err) {
      console.error("Invoice PDF generation failed:", err);
      throw err;
    }
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

  const getTotalUnpaid = () =>
    invoices
      .filter((i) => i.status === "issued" || i.status === "overdue")
      .reduce((sum, i) => sum + convertToJPY(i.amount, i.currency), 0);

  const getTotalPaid = () =>
    invoices
      .filter((i) => i.status === "paid")
      .reduce((sum, i) => sum + convertToJPY(i.amount, i.currency), 0);

  const getOverdueCount = () =>
    invoices.filter((i) => i.status === "overdue").length;

  const restoreState = async (state: { invoices: Invoice[] }) => {
    if (!user) {
      setInvoices(state.invoices);
      return;
    }
    setInvoices(state.invoices);
    try {
      const current = await offlineDb.invoices
        .where("user_id")
        .equals(user.id)
        .toArray();
      const nextIds = new Set(state.invoices.map((i) => i.id));
      for (const row of current) {
        if (!nextIds.has(row.id)) await deleteLocalRow("invoices", row.id);
      }
      for (const inv of state.invoices)
        await upsertLocalRow("invoices", toInvoiceRow(inv, user.id));
    } catch (error) {
      console.error("Error restoring invoice state:", error);
    }
  };

  const refresh = useCallback(async () => {
    setIsSyncing(true);
    await fetchData();
    setIsSyncing(false);
  }, [fetchData]);

  return {
    invoices,
    isLoading,
    isSyncing,
    addInvoice,
    updateInvoice,
    removeInvoice,
    reorderInvoices,
    uploadPdf,
    deletePdf,
    getPdfSignedUrl,
    generateInvoicePdf,
    runOcr,
    getTotalUnpaid,
    getTotalPaid,
    getOverdueCount,
    refresh,
    restoreState,
  };
};
