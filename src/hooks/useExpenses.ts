import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useOnlineStatus } from "./useOnlineStatus";
import { offlineDb, type ExpenseRow } from "../lib/offlineDb";
import { deleteLocalRow, upsertLocalRow } from "../lib/offlineStore";
import { supabase } from "../lib/offlineSync";
import { uploadToStorage } from "../lib/storageUpload";
import type { Expense, ExpenseCategory } from "../types";

export const expenseCategoryOptions: {
  value: ExpenseCategory;
  label: string;
  icon: string;
}[] = [
  { value: "transport", label: "Transport", icon: "Car" },
  { value: "food", label: "Food & Drink", icon: "Coffee" },
  { value: "supplies", label: "Supplies", icon: "Package" },
  { value: "software", label: "Software", icon: "Monitor" },
  { value: "hardware", label: "Hardware", icon: "Cpu" },
  { value: "communication", label: "Communication", icon: "Phone" },
  { value: "entertainment", label: "Entertainment", icon: "Users" },
  { value: "education", label: "Education", icon: "BookOpen" },
  { value: "other", label: "Other", icon: "MoreHorizontal" },
];

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

const toExpense = (row: Record<string, unknown>): Expense => ({
  id: row.id as string,
  title: (row.title as string) ?? "",
  amount: toNumber(row.amount, 0),
  currency: (row.currency as string) ?? "JPY",
  expenseDate: (row.expense_date as string) ?? undefined,
  category: (row.category as ExpenseCategory) ?? "other",
  clientId: (row.client_id as string) ?? undefined,
  projectId: (row.project_id as string) ?? undefined,
  receiptStoragePath: (row.receipt_storage_path as string) ?? undefined,
  ocrExtracted: (row.ocr_extracted as Record<string, unknown>) ?? undefined,
  notes: (row.notes as string) ?? "",
  order: (row.order_index as number | null) ?? undefined,
  createdAt: row.created_at as string | undefined,
  updatedAt: row.updated_at as string | undefined,
});

const toExpenseRow = (expense: Expense, userId: string) => ({
  id: expense.id,
  user_id: userId,
  title: expense.title,
  amount: expense.amount,
  currency: expense.currency,
  expense_date: expense.expenseDate ?? null,
  category: expense.category,
  client_id: expense.clientId ?? null,
  project_id: expense.projectId ?? null,
  receipt_storage_path: expense.receiptStoragePath ?? null,
  ocr_extracted: expense.ocrExtracted ?? {},
  notes: expense.notes,
  order_index: expense.order ?? null,
  created_at: expense.createdAt,
  updated_at: expense.updatedAt,
});

export const useExpenses = () => {
  const { user } = useAuth();
  const isOnline = useOnlineStatus();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const saveTimeoutRef = useRef<{ [key: string]: NodeJS.Timeout }>({});

  const fetchData = useCallback(async () => {
    if (!user) {
      setExpenses([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      let rows: unknown[] = [];
      if (isOnline && supabase) {
        try {
          const { data } = await supabase
            .from("expenses")
            .select("*")
            .eq("user_id", user.id);
          if (data) {
            rows = data;
            await offlineDb.expenses.bulkPut(data as ExpenseRow[]);
          }
        } catch (err) {
          console.error("Failed to fetch expenses from Supabase:", err);
        }
      }
      if (rows.length === 0) {
        rows = await offlineDb.expenses
          .where("user_id")
          .equals(user.id)
          .toArray();
      }
      const normalized = rows
        .map((row) => toExpense(row as Record<string, unknown>))
        .sort((a, b) => {
          const aO = a.order ?? Number.POSITIVE_INFINITY;
          const bO = b.order ?? Number.POSITIVE_INFINITY;
          if (aO !== bO) return aO - bO;
          return (b.createdAt || "").localeCompare(a.createdAt || "");
        });
      setExpenses(normalized);
    } catch (error) {
      console.error("Error fetching expenses:", error);
    } finally {
      setIsLoading(false);
    }
  }, [user, isOnline]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const addExpense = async () => {
    if (!user) return;
    const now = new Date().toISOString();
    const jstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
    const today = jstNow.toISOString().split("T")[0];
    const newExpense: Expense = {
      id: generateUuid(),
      title: "",
      amount: 0,
      currency: "JPY",
      expenseDate: today,
      category: "other",
      notes: "",
      createdAt: now,
      updatedAt: now,
    };
    try {
      setIsSyncing(true);
      await upsertLocalRow("expenses", toExpenseRow(newExpense, user.id));
      setExpenses((prev) => [newExpense, ...prev]);
    } catch (error) {
      console.error("Error adding expense:", error);
    } finally {
      setIsSyncing(false);
    }
  };

  const updateExpense = (id: string, updates: Partial<Expense>) => {
    if (!user) return;
    const updated = expenses.map((exp) =>
      exp.id === id
        ? { ...exp, ...updates, updatedAt: new Date().toISOString() }
        : exp,
    );
    setExpenses(updated);
    if (saveTimeoutRef.current[`exp-${id}`])
      clearTimeout(saveTimeoutRef.current[`exp-${id}`]);
    saveTimeoutRef.current[`exp-${id}`] = setTimeout(async () => {
      const item = updated.find((exp) => exp.id === id);
      if (!item) return;
      try {
        setIsSyncing(true);
        await upsertLocalRow("expenses", toExpenseRow(item, user.id));
      } catch (error) {
        console.error("Error updating expense:", error);
      } finally {
        setIsSyncing(false);
      }
    }, 500);
  };

  const removeExpense = async (id: string) => {
    if (!user) return;
    try {
      setIsSyncing(true);
      const exp = expenses.find((e) => e.id === id);
      if (exp?.receiptStoragePath && isOnline && supabase) {
        await supabase.storage
          .from("money-files")
          .remove([exp.receiptStoragePath]);
      }
      await deleteLocalRow("expenses", id);
      setExpenses((prev) => prev.filter((e) => e.id !== id));
    } catch (error) {
      console.error("Error removing expense:", error);
    } finally {
      setIsSyncing(false);
    }
  };

  const reorderExpenses = useCallback(
    async (reordered: Expense[]) => {
      if (!user) return;
      const withOrder = reordered.map((exp, i) => ({ ...exp, order: i }));
      setExpenses(withOrder);
      try {
        setIsSyncing(true);
        for (const exp of withOrder)
          await upsertLocalRow("expenses", toExpenseRow(exp, user.id));
      } catch (error) {
        console.error("Error reordering expenses:", error);
      } finally {
        setIsSyncing(false);
      }
    },
    [user],
  );

  const uploadReceipt = async (id: string, file: File) => {
    if (!user) return;
    const ext = file.name.split(".").pop() || "jpg";
    const path = `${user.id}/receipts/${id}.${ext}`;
    const buffer = await file.arrayBuffer();
    await uploadToStorage("money-files", path, buffer, file.type, {
      tableName: "expenses",
      recordId: id,
      fieldName: "receipt_storage_path",
    });
    updateExpense(id, { receiptStoragePath: path });
  };

  const deleteReceipt = async (id: string) => {
    const exp = expenses.find((e) => e.id === id);
    if (!exp?.receiptStoragePath || !supabase) return;
    try {
      await supabase.storage
        .from("money-files")
        .remove([exp.receiptStoragePath]);
    } catch (err) {
      console.error("Error deleting receipt:", err);
    }
    updateExpense(id, {
      receiptStoragePath: undefined,
      ocrExtracted: undefined,
    });
  };

  const getReceiptSignedUrl = async (
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

      const { data, error } = await supabase.functions.invoke("ocr_receipt", {
        body: { base64Data, mimeType: file.type },
      });
      if (error) throw error;
      if (data) {
        const ocrResult = data as Record<string, unknown>;
        updateExpense(id, { ocrExtracted: ocrResult });
        return ocrResult;
      }
      return null;
    } catch (err) {
      console.error("OCR failed:", err);
      return null;
    }
  };

  const getTotalByCategory = (): Record<ExpenseCategory, number> => {
    const result = {} as Record<ExpenseCategory, number>;
    for (const opt of expenseCategoryOptions) result[opt.value] = 0;
    for (const exp of expenses) {
      result[exp.category] =
        (result[exp.category] || 0) + convertToJPY(exp.amount, exp.currency);
    }
    return result;
  };

  const getMonthlyTotal = (year: number, month: number): number => {
    const prefix = `${year}-${String(month).padStart(2, "0")}`;
    return expenses
      .filter((e) => e.expenseDate?.startsWith(prefix))
      .reduce((sum, e) => sum + convertToJPY(e.amount, e.currency), 0);
  };

  const restoreState = async (state: { expenses: Expense[] }) => {
    if (!user) {
      setExpenses(state.expenses);
      return;
    }
    setExpenses(state.expenses);
    try {
      const current = await offlineDb.expenses
        .where("user_id")
        .equals(user.id)
        .toArray();
      const nextIds = new Set(state.expenses.map((e) => e.id));
      for (const row of current) {
        if (!nextIds.has(row.id)) await deleteLocalRow("expenses", row.id);
      }
      for (const exp of state.expenses)
        await upsertLocalRow("expenses", toExpenseRow(exp, user.id));
    } catch (error) {
      console.error("Error restoring expense state:", error);
    }
  };

  const refresh = useCallback(async () => {
    setIsSyncing(true);
    await fetchData();
    setIsSyncing(false);
  }, [fetchData]);

  return {
    expenses,
    isLoading,
    isSyncing,
    addExpense,
    updateExpense,
    removeExpense,
    reorderExpenses,
    uploadReceipt,
    deleteReceipt,
    getReceiptSignedUrl,
    runOcr,
    getTotalByCategory,
    getMonthlyTotal,
    refresh,
    restoreState,
  };
};
