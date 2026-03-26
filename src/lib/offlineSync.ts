import { offlineDb } from "./offlineDb";
import { supabase } from "./supabase";
import { rescheduleAllNotifications } from "./taskNotifications";
import { processPendingUploads } from "./storageUpload";

// Single source of truth for all synced table names.
// TableName type and USER_SCOPED_TABLES are derived from this array.
const TABLES = [
  "nodes",
  "frames",
  "tools",
  "memo_tabs",
  "memos",
  "client_tabs",
  "clients",
  "project_tabs",
  "projects",
  "affiliations",
  "work_experiences",
  "educations",
  "skills",
  "certifications",
  "languages",
  "subscriptions",
  "assets",
  "journal_entries",
  "profiles",
  "user_preferences",
  "user_settings",
  "data_catalog_items",
  "devices",
  "ai_shortcuts",
  "task_dividers",
  "memo_trash",
  "ai_sessions",
  "ai_messages",
  "ai_automations",
  "ai_automation_runs",
  "ai_notifications",
  "ai_notification_categories",
  "ai_notification_api_keys",
  "slack_integrations",
  "rss_feeds",
  "x_sources",
  "media_feed_items",
  "google_gmail_messages",
  "user_google_tokens",
  "google_calendar_events",
  "task_lists",
  "tasks",
  "menu_items",
  "invoices",
  "expenses",
  "money_documents",
  "health_meals",
  "health_supplements",
  "invest_portfolios",
  "invest_holdings",
  "invest_watchlist",
  "invest_transactions",
  "invest_alerts",
  "invest_chart_drawings",
] as const;

type TableName = (typeof TABLES)[number];

const PROFILE_TABLES: TableName[] = [
  "profiles",
  "work_experiences",
  "educations",
  "skills",
  "certifications",
  "languages",
  "affiliations",
];

const AI_TABLES: TableName[] = [
  "tools",
  "memo_tabs",
  "memos",
  "client_tabs",
  "clients",
  "project_tabs",
  "projects",
  "nodes",
  "frames",
  "task_lists",
  "tasks",
  "journal_entries",
  "subscriptions",
  "assets",
  "profiles",
];

// All tables are user-scoped (filtered by user_id during sync)
const USER_SCOPED_TABLES = new Set<TableName>(TABLES);

const TABLE_ON_CONFLICT: Partial<Record<TableName, string>> = {
  user_preferences: "user_id",
  user_settings: "user_id,key",
  google_gmail_messages: "user_id,message_id",
  google_calendar_events: "user_id,event_id",
  user_google_tokens: "user_id",
};

let currentUserId: string | null = null;
let syncInFlight = false;
let scheduledSync: number | null = null;

const nowIso = () => new Date().toISOString();

export const isOnlineNow = () =>
  typeof navigator === "undefined" ? true : navigator.onLine;

export { supabase };

const isOnline = () =>
  typeof navigator === "undefined" ? true : navigator.onLine;

const parseUpdatedAt = (value: unknown) => {
  if (typeof value !== "string") return 0;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
};

const getRemoteUpdatedAt = async (
  table: TableName,
  recordId: string,
  payload: Record<string, unknown> | undefined,
  userId: string,
) => {
  if (!supabase) return 0;
  try {
    let query = supabase.from(table).select("updated_at");
    if (table === "user_settings") {
      const key = payload?.key;
      if (typeof key !== "string") return 0;
      query = query.eq("user_id", userId).eq("key", key);
    } else if (table === "user_preferences") {
      query = query.eq("user_id", userId);
    } else if (table === "profiles") {
      query = query.eq("id", userId);
    } else {
      query = query.eq("id", recordId);
    }
    const { data, error } = await query.maybeSingle();
    if (error) return 0;
    return parseUpdatedAt((data as Record<string, unknown> | null)?.updated_at);
  } catch {
    return 0;
  }
};

const isStaleEntry = async (
  table: TableName,
  recordId: string,
  payload: Record<string, unknown> | undefined,
  userId: string,
) => {
  const localUpdatedAt = parseUpdatedAt(payload?.updated_at);
  if (!localUpdatedAt) return false;
  const remoteUpdatedAt = await getRemoteUpdatedAt(
    table,
    recordId,
    payload,
    userId,
  );
  if (!remoteUpdatedAt) return false;
  return remoteUpdatedAt > localUpdatedAt;
};

export const setSyncUserId = (userId: string | null) => {
  currentUserId = userId;
};

export const getSyncUserId = () => currentUserId;

export const scheduleSync = () => {
  if (scheduledSync || typeof window === "undefined") return;
  scheduledSync = window.setTimeout(() => {
    scheduledSync = null;
    syncAll().catch((err) => {
      console.error("Offline sync failed:", err);
    });
  }, 1200);
};

export const getPendingOutboxCount = async () => {
  return offlineDb.outbox.count();
};

// Ensure outbox is processed before fetching data from Supabase
// This prevents race conditions where local changes haven't been synced yet
export const ensureOutboxProcessed = async (table?: string): Promise<void> => {
  if (!isOnlineNow() || !supabase || !currentUserId) return;

  // Check if there are pending items in outbox for this table
  let entries;
  if (table) {
    entries = await offlineDb.outbox.where("table").equals(table).toArray();
  } else {
    entries = await offlineDb.outbox.orderBy("id").toArray();
  }

  if (entries.length === 0) return;

  // Process outbox items before returning
  for (const entry of entries) {
    const ok = await applyOutboxEntry(
      entry as {
        table: TableName;
        operation: string;
        record_id: string;
        payload?: Record<string, unknown>;
      },
    );
    if (ok && entry.id !== undefined) {
      await offlineDb.outbox.delete(entry.id);
    }
  }
};

const normalizeUndefinedToNull = (payload: Record<string, unknown>) => {
  const next = { ...payload };
  for (const key of Object.keys(next)) {
    if (next[key] === undefined) {
      next[key] = null;
    }
  }
  return next;
};

const sanitizePayload = (
  table: TableName,
  payload: Record<string, unknown>,
) => {
  let sanitized = { ...payload };
  if (table === "user_settings" || table === "user_preferences") {
    delete sanitized.id;
  }
  if (
    table === "user_settings" &&
    (sanitized.value === null || sanitized.value === undefined)
  ) {
    sanitized.value = "";
  }
  if (table === "tasks") {
    sanitized = normalizeUndefinedToNull(sanitized);
  }
  return sanitized;
};

const applyOutboxEntry = async (entry: {
  table: TableName;
  operation: string;
  record_id: string;
  payload?: Record<string, unknown>;
}) => {
  if (!supabase || !currentUserId) return false;
  const table = entry.table;
  const payload = entry.payload
    ? sanitizePayload(table, entry.payload)
    : undefined;
  if (await isStaleEntry(table, entry.record_id, payload, currentUserId)) {
    return true;
  }

  if (entry.operation === "delete") {
    if (table === "user_settings" && payload?.key) {
      const { error } = await supabase
        .from(table)
        .delete()
        .eq("user_id", currentUserId)
        .eq("key", payload.key as string);
      return !error;
    }
    if (table === "user_preferences") {
      const { error } = await supabase
        .from(table)
        .delete()
        .eq("user_id", currentUserId);
      return !error;
    }
    if (table === "profiles") {
      const { error } = await supabase
        .from(table)
        .delete()
        .eq("id", currentUserId);
      return !error;
    }
    const { error } = await supabase
      .from(table)
      .delete()
      .eq("id", entry.record_id);
    return !error;
  }

  if (!payload) return true;
  if (USER_SCOPED_TABLES.has(table) && !payload.user_id) {
    payload.user_id = currentUserId;
  }

  // PROTECTION: Prevent empty profiles from overwriting existing Supabase data
  if (table === "profiles") {
    const localDisplayName = String(payload.display_name ?? "").trim();
    const localBio = String(payload.bio ?? "").trim();
    const localCompany = String(payload.company ?? "").trim();
    const localJobTitle = String(payload.job_title ?? "").trim();
    const localSocialLinks = payload.social_links as unknown[] | undefined;

    const isLocalEmpty =
      !localDisplayName &&
      !localBio &&
      !localCompany &&
      !localJobTitle &&
      (!localSocialLinks || localSocialLinks.length === 0);

    if (isLocalEmpty) {
      // Check if remote has content - if so, don't overwrite
      const { data: remoteProfile } = await supabase
        .from("profiles")
        .select("display_name, bio, company, job_title, social_links")
        .eq("id", currentUserId)
        .single();

      if (remoteProfile) {
        const remoteDisplayName = String(
          remoteProfile.display_name ?? "",
        ).trim();
        const remoteBio = String(remoteProfile.bio ?? "").trim();
        const remoteCompany = String(remoteProfile.company ?? "").trim();
        const remoteJobTitle = String(remoteProfile.job_title ?? "").trim();
        const remoteSocialLinks = remoteProfile.social_links as
          | unknown[]
          | undefined;

        const isRemoteNotEmpty =
          !!remoteDisplayName ||
          !!remoteBio ||
          !!remoteCompany ||
          !!remoteJobTitle ||
          (remoteSocialLinks && remoteSocialLinks.length > 0);

        if (isRemoteNotEmpty) {
          return true; // Skip this upsert - remote has content we don't want to overwrite
        }
      }
    }
  }

  const { error } = await supabase
    .from(table)
    .upsert(payload, { onConflict: TABLE_ON_CONFLICT[table] ?? "id" });
  if (error) {
    console.error(`Sync error for ${table}:`, error.message, error.details);
  }
  return !error;
};

const normalizeRemoteRow = (
  table: TableName,
  row: Record<string, unknown>,
  userId: string,
) => {
  if (table === "user_settings") {
    const key = row.key as string;
    return { ...row, id: `${userId}:${key}` };
  }
  if (table === "user_preferences") {
    return { ...row, id: userId };
  }
  return row;
};

const replaceLocalRows = async (
  table: TableName,
  rows: Record<string, unknown>[],
  userId: string,
) => {
  const tableRef = offlineDb.table(table);
  if (table === "profiles") {
    await tableRef.delete(userId);
  } else if (USER_SCOPED_TABLES.has(table)) {
    await tableRef.where("user_id").equals(userId).delete();
  } else {
    await tableRef.clear();
  }
  if (rows.length > 0) {
    await tableRef.bulkPut(rows);
  }
};

const pullTable = async (table: TableName, userId: string) => {
  if (!supabase) return;
  let query = supabase.from(table).select("*");
  if (table === "profiles") {
    query = query.eq("id", userId);
  } else if (USER_SCOPED_TABLES.has(table)) {
    query = query.eq("user_id", userId);
  }
  const { data, error } = await query;
  if (error) {
    throw error;
  }
  if (table === "profiles") {
    const local = await offlineDb.profiles.get(userId);
    const remoteRow = (data || [])[0] as Record<string, unknown> | undefined;
    if (local) {
      if (!remoteRow) {
        return;
      }
      // If local profile has empty display_name but remote has content, prefer remote
      // This ensures cross-device sync works correctly
      const localDisplayName = String(
        (local as Record<string, unknown>).display_name ?? "",
      );
      const remoteDisplayName = String(remoteRow.display_name ?? "");
      const localIsEmpty = !localDisplayName.trim();
      const remoteHasContent = !!remoteDisplayName.trim();

      if (localIsEmpty && remoteHasContent) {
        // Remote has content that local is missing, use remote
        await offlineDb.profiles.put(remoteRow);
        return;
      }

      const localUpdated = parseUpdatedAt(
        (local as Record<string, unknown>).updated_at,
      );
      const remoteUpdated = parseUpdatedAt(remoteRow.updated_at);
      if (localUpdated > remoteUpdated) {
        return;
      }
    }
    if (remoteRow) {
      await offlineDb.profiles.put(remoteRow);
    }
    return;
  }
  if (table === "user_preferences") {
    const local = await offlineDb.user_preferences
      .where("user_id")
      .equals(userId)
      .first();
    const remoteRow = (data || [])[0] as Record<string, unknown> | undefined;
    const normalizedRemote = remoteRow
      ? normalizeRemoteRow(table, remoteRow, userId)
      : undefined;
    if (local) {
      if (!normalizedRemote) {
        return;
      }
      const localUpdated = parseUpdatedAt(
        (local as Record<string, unknown>).updated_at,
      );
      const remoteUpdated = parseUpdatedAt(normalizedRemote.updated_at);
      if (localUpdated > remoteUpdated) {
        return;
      }
    }
    if (normalizedRemote) {
      await offlineDb.user_preferences.put(normalizedRemote);
    }
    return;
  }
  const normalized = (data || []).map((row) =>
    normalizeRemoteRow(table, row as Record<string, unknown>, userId),
  );
  await replaceLocalRows(table, normalized, userId);
};

export const syncAll = async () => {
  if (!supabase || !currentUserId || !isOnline()) return;
  if (syncInFlight) return;
  syncInFlight = true;
  try {
    const outbox = await offlineDb.outbox.orderBy("id").toArray();
    for (const entry of outbox) {
      const ok = await applyOutboxEntry(
        entry as {
          table: TableName;
          operation: string;
          record_id: string;
          payload?: Record<string, unknown>;
        },
      );
      if (!ok) {
        syncInFlight = false;
        return;
      }
      if (entry.id !== undefined) {
        await offlineDb.outbox.delete(entry.id);
      }
    }

    for (const table of TABLES) {
      await pullTable(table, currentUserId);
    }

    await processPendingUploads();
    await offlineDb.meta.put({ key: "last_sync_at", value: nowIso() });
    if (typeof window !== "undefined" && currentUserId) {
      rescheduleAllNotifications(currentUserId).catch((err) => {
        console.error("Notification reschedule failed:", err);
      });
    }

    // Dispatch sync-complete event to notify components that data is now available
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("sync-complete"));
    }
  } finally {
    syncInFlight = false;
  }
};

export const syncTables = async (tables: TableName[]) => {
  if (!supabase || !currentUserId || !isOnline()) return;
  if (syncInFlight) return;
  const uniqueTables = Array.from(new Set(tables));
  if (uniqueTables.length === 0) return;

  syncInFlight = true;
  try {
    const outbox = await offlineDb.outbox
      .where("table")
      .anyOf(uniqueTables)
      .toArray();
    for (const entry of outbox) {
      const ok = await applyOutboxEntry(
        entry as {
          table: TableName;
          operation: string;
          record_id: string;
          payload?: Record<string, unknown>;
        },
      );
      if (!ok) {
        syncInFlight = false;
        return;
      }
      if (entry.id !== undefined) {
        await offlineDb.outbox.delete(entry.id);
      }
    }

    for (const table of uniqueTables) {
      await pullTable(table, currentUserId);
    }
  } finally {
    syncInFlight = false;
  }
};

export const syncProfileTables = async () => {
  await syncTables(PROFILE_TABLES);
};

export const syncAiTables = async () => {
  await syncTables(AI_TABLES);
};

// Lightweight sync for menu items only - used on initial load for faster display
let menuSyncInFlight = false;
export const syncMenuItems = async () => {
  if (!supabase || !currentUserId || !isOnline()) {
    // If offline or no user, still fire menu-ready so components can load from local DB
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("menu-ready"));
    }
    return;
  }
  if (menuSyncInFlight) return;
  menuSyncInFlight = true;
  try {
    // 1. Push any pending outbox changes first
    const outbox = await offlineDb.outbox.orderBy("id").toArray();
    for (const entry of outbox) {
      const ok = await applyOutboxEntry(
        entry as {
          table: TableName;
          operation: string;
          record_id: string;
          payload?: Record<string, unknown>;
        },
      );
      if (!ok) {
        // Don't block menu display on outbox failure
        console.error("Outbox entry failed, continuing with menu sync");
        break;
      }
      if (entry.id !== undefined) {
        await offlineDb.outbox.delete(entry.id);
      }
    }

    // 2. Pull only menu-related tables
    await pullTable("menu_items", currentUserId);
    await pullTable("user_settings", currentUserId); // Contains sidebar_order
    await pullTable("user_preferences", currentUserId);
  } catch (err) {
    console.error("Menu sync failed:", err);
  } finally {
    // Fire menu-ready even on failure so UI can fall back to local data
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("menu-ready"));
    }
    menuSyncInFlight = false;
  }
};
