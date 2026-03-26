import type {
  Client,
  ClientTab,
  Frame,
  Memo,
  MemoTab,
  OrgNode,
  Project,
  ProjectTab,
  Tool,
  DataCatalogItem,
  Device,
  AiShortcut,
  TaskDivider,
  MemoTrash,
  AiAutomation,
  AutomationConfig,
  AiNotification,
  AiNotificationCategory,
  AiNotificationApiKey,
  SlackIntegration,
  SlackChannelFilter,
  SlackSyncState,
  RssFeed,
  XSource,
  NotificationSource,
  MediaFeedItem,
  MediaFeedSource,
  GoogleCalendarSyncEvent,
  GoogleGmailSyncMessage,
} from "../types";
import type { ChatMessage } from "../types/ai";
import {
  appClientTabToDbClientTab,
  appClientToDbClient,
  appFrameToDbFrame,
  appMemoTabToDbMemoTab,
  appMemoToDbMemo,
  appNodeToDbNode,
  appProjectTabToDbProjectTab,
  appProjectToDbProject,
  appToolToDbTool,
  dbClientTabToAppClientTab,
  dbClientToAppClient,
  dbFrameToAppFrame,
  dbMemoTabToAppMemoTab,
  dbMemoToAppMemo,
  dbNodeToAppNode,
  dbProjectTabToAppProjectTab,
  dbProjectToAppProject,
  dbToolToAppTool,
  type DbClient,
  type DbClientTab,
  type DbFrame,
  type DbMemo,
  type DbMemoTab,
  type DbNode,
  type DbProject,
  type DbProjectTab,
  type DbTool,
} from "./supabase";
import {
  offlineDb,
  type AiMessageRow,
  type AiSessionRow,
  type UserSettingRow,
  type MenuItemRow,
  type DataCatalogItemRow,
  type DeviceRow,
  type AiShortcutRow,
  type TaskDividerRow,
  type MemoTrashRow,
  type AiAutomationRow,
  type AiAutomationRunRow,
  type AiNotificationRow,
  type AiNotificationCategoryRow,
  type AiNotificationApiKeyRow,
  type SlackIntegrationRow,
  type RssFeedRow,
  type XSourceRow,
  type MediaFeedItemRow,
  type GoogleGmailMessageRow,
} from "./offlineDb";
import {
  deleteLocalRow,
  getLocalRows,
  upsertLocalRow,
  upsertLocalRowWithoutSync,
  bulkPutLocalRows,
  clearLocalRowsForUser,
} from "./offlineStore";
import {
  ensureOutboxProcessed,
  getSyncUserId,
  isOnlineNow,
  supabase,
} from "./offlineSync";

const nowIso = () => new Date().toISOString();
type OrderableRow = {
  order_index?: number | null;
  created_at?: string | null;
  id?: string | null;
};

const getOrderValue = (value: number | null | undefined) =>
  typeof value === "number" && Number.isFinite(value)
    ? value
    : Number.POSITIVE_INFINITY;
const sortByOrderIndex = <T extends OrderableRow>(rows: T[]): T[] =>
  rows.slice().sort((a, b) => {
    const aOrder = getOrderValue(a.order_index);
    const bOrder = getOrderValue(b.order_index);
    if (aOrder !== bOrder) return aOrder - bOrder;
    const aCreated = String(a.created_at ?? "");
    const bCreated = String(b.created_at ?? "");
    if (aCreated !== bCreated) return aCreated.localeCompare(bCreated);
    return String(a.id ?? "").localeCompare(String(b.id ?? ""));
  });

// ===== Nodes =====
export const fetchNodes = async (): Promise<OrgNode[]> => {
  const userId = getSyncUserId();

  // If online, fetch from Supabase and update local cache
  if (isOnlineNow() && supabase && userId) {
    try {
      const { data, error } = await supabase
        .from("nodes")
        .select("*")
        .eq("user_id", userId);

      if (!error && data) {
        const dbNodes = data as DbNode[];
        // Update local cache
        await bulkPutLocalRows("nodes", dbNodes);
        return dbNodes.map(dbNodeToAppNode);
      }
    } catch (err) {
      console.error("Failed to fetch nodes from Supabase:", err);
      // Fall through to local DB
    }
  }

  // Offline or fetch failed - use local DB
  const rows = await getLocalRows<DbNode>("nodes");
  return rows.map(dbNodeToAppNode);
};

export const upsertNode = async (node: OrgNode): Promise<boolean> => {
  await upsertLocalRow("nodes", appNodeToDbNode(node));
  return true;
};

export const deleteNode = async (nodeId: string): Promise<boolean> => {
  await deleteLocalRow("nodes", nodeId);
  return true;
};

// ===== Frames =====
export const fetchFrames = async (): Promise<Frame[]> => {
  const userId = getSyncUserId();

  if (isOnlineNow() && supabase && userId) {
    try {
      const { data, error } = await supabase
        .from("frames")
        .select("*")
        .eq("user_id", userId);

      if (!error && data) {
        const dbFrames = data as DbFrame[];
        await bulkPutLocalRows("frames", dbFrames);
        return dbFrames.map(dbFrameToAppFrame);
      }
    } catch (err) {
      console.error("Failed to fetch frames from Supabase:", err);
    }
  }

  const rows = await getLocalRows<DbFrame>("frames");
  return rows.map(dbFrameToAppFrame);
};

export const upsertFrame = async (frame: Frame): Promise<boolean> => {
  await upsertLocalRow("frames", appFrameToDbFrame(frame));
  return true;
};

export const deleteFrame = async (frameId: string): Promise<boolean> => {
  await deleteLocalRow("frames", frameId);
  return true;
};

// ===== Tools =====
export const fetchTools = async (): Promise<Tool[]> => {
  const userId = getSyncUserId();

  if (isOnlineNow() && supabase && userId) {
    try {
      const { data, error } = await supabase
        .from("tools")
        .select("*")
        .eq("user_id", userId);

      if (!error && data) {
        const dbTools = data as DbTool[];
        await bulkPutLocalRows("tools", dbTools);
        return dbTools.map(dbToolToAppTool);
      }
    } catch (err) {
      console.error("Failed to fetch tools from Supabase:", err);
    }
  }

  const rows = await getLocalRows<DbTool>("tools");
  return rows.map(dbToolToAppTool);
};

export const upsertTool = async (tool: Tool): Promise<boolean> => {
  await upsertLocalRow("tools", appToolToDbTool(tool));
  return true;
};

export const deleteTool = async (toolId: string): Promise<boolean> => {
  await deleteLocalRow("tools", toolId);
  return true;
};

// ===== Data Catalog Items =====
const dbDataCatalogToApp = (row: DataCatalogItemRow): DataCatalogItem => ({
  id: row.id,
  label: row.label,
  description: row.description ?? "",
  link: row.link ?? "",
  order: row.order_index,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const appDataCatalogToDb = (
  item: DataCatalogItem,
  userId: string,
): Omit<DataCatalogItemRow, "created_at" | "updated_at"> => ({
  id: item.id,
  user_id: userId,
  label: item.label,
  description: item.description ?? "",
  link: item.link ?? "",
  order_index: item.order,
});

export const fetchDataCatalogItems = async (): Promise<DataCatalogItem[]> => {
  const userId = getSyncUserId();

  if (isOnlineNow() && supabase && userId) {
    try {
      const { data, error } = await supabase
        .from("data_catalog_items")
        .select("*")
        .eq("user_id", userId);

      if (!error && data) {
        const rows = data as DataCatalogItemRow[];
        await bulkPutLocalRows("data_catalog_items", rows);
        return sortByOrderIndex(rows).map(dbDataCatalogToApp);
      }
    } catch (err) {
      console.error("Failed to fetch data catalog items from Supabase:", err);
    }
  }

  const rows = await getLocalRows<DataCatalogItemRow>("data_catalog_items");
  return sortByOrderIndex(rows).map(dbDataCatalogToApp);
};

export const upsertDataCatalogItem = async (
  item: DataCatalogItem,
): Promise<boolean> => {
  const userId = getSyncUserId();
  if (!userId) return false;
  await upsertLocalRow("data_catalog_items", appDataCatalogToDb(item, userId));
  return true;
};

export const deleteDataCatalogItem = async (
  itemId: string,
): Promise<boolean> => {
  await deleteLocalRow("data_catalog_items", itemId);
  return true;
};

export const bulkUpsertDataCatalogItems = async (
  items: DataCatalogItem[],
): Promise<void> => {
  const userId = getSyncUserId();
  if (!userId) return;
  for (const item of items) {
    await upsertDataCatalogItem(item);
  }
};

// ===== Devices =====
const dbDeviceToApp = (row: DeviceRow): Device => ({
  id: row.id,
  name: row.name,
  description: row.description ?? "",
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const appDeviceToDb = (
  device: Device,
  userId: string,
): Omit<DeviceRow, "created_at" | "updated_at"> => ({
  id: device.id,
  user_id: userId,
  name: device.name,
  description: device.description ?? "",
});

export const fetchDevices = async (): Promise<Device[]> => {
  const userId = getSyncUserId();

  if (isOnlineNow() && supabase && userId) {
    try {
      const { data, error } = await supabase
        .from("devices")
        .select("*")
        .eq("user_id", userId);

      if (!error && data) {
        const rows = data as DeviceRow[];
        await bulkPutLocalRows("devices", rows);
        return rows.map(dbDeviceToApp);
      }
    } catch (err) {
      console.error("Failed to fetch devices from Supabase:", err);
    }
  }

  const rows = await getLocalRows<DeviceRow>("devices");
  return rows.map(dbDeviceToApp);
};

export const upsertDevice = async (device: Device): Promise<boolean> => {
  const userId = getSyncUserId();
  if (!userId) return false;
  await upsertLocalRow("devices", appDeviceToDb(device, userId));
  return true;
};

export const deleteDevice = async (deviceId: string): Promise<boolean> => {
  await deleteLocalRow("devices", deviceId);
  return true;
};

// ===== AI Shortcuts =====
const dbAiShortcutToApp = (row: AiShortcutRow): AiShortcut => ({
  id: row.id,
  label: row.label,
  order: row.order_index,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const appAiShortcutToDb = (
  shortcut: AiShortcut,
  userId: string,
): Omit<AiShortcutRow, "created_at" | "updated_at"> => ({
  id: shortcut.id,
  user_id: userId,
  label: shortcut.label,
  order_index: shortcut.order,
});

export const fetchAiShortcuts = async (): Promise<AiShortcut[]> => {
  const userId = getSyncUserId();

  if (isOnlineNow() && supabase && userId) {
    try {
      const { data, error } = await supabase
        .from("ai_shortcuts")
        .select("*")
        .eq("user_id", userId);

      if (!error && data) {
        const rows = data as AiShortcutRow[];
        // Clear local rows first to prevent orphaned duplicates, then store fresh data
        await clearLocalRowsForUser("ai_shortcuts", userId);
        await bulkPutLocalRows("ai_shortcuts", rows);
        return sortByOrderIndex(rows).map(dbAiShortcutToApp);
      }
    } catch (err) {
      console.error("Failed to fetch AI shortcuts from Supabase:", err);
    }
  }

  const rows = await getLocalRows<AiShortcutRow>("ai_shortcuts");
  return sortByOrderIndex(rows).map(dbAiShortcutToApp);
};

export const upsertAiShortcut = async (
  shortcut: AiShortcut,
): Promise<boolean> => {
  const userId = getSyncUserId();
  if (!userId) return false;
  await upsertLocalRow("ai_shortcuts", appAiShortcutToDb(shortcut, userId));
  return true;
};

export const deleteAiShortcut = async (
  shortcutId: string,
): Promise<boolean> => {
  await deleteLocalRow("ai_shortcuts", shortcutId);
  return true;
};

export const bulkUpsertAiShortcuts = async (
  shortcuts: AiShortcut[],
): Promise<void> => {
  const userId = getSyncUserId();
  if (!userId) return;
  for (const shortcut of shortcuts) {
    await upsertAiShortcut(shortcut);
  }
};

// Remove duplicate shortcuts (keeps the first occurrence of each unique label)
export const deduplicateAiShortcuts = async (): Promise<number> => {
  const userId = getSyncUserId();
  if (!userId) return 0;

  // Fetch all shortcuts
  const all = await fetchAiShortcuts();

  // Find duplicates
  const seen = new Map<string, AiShortcut>();
  const duplicateIds: string[] = [];

  for (const shortcut of all) {
    const normalizedLabel = shortcut.label.trim().toLowerCase();
    if (seen.has(normalizedLabel)) {
      // This is a duplicate - mark for deletion
      duplicateIds.push(shortcut.id);
    } else {
      seen.set(normalizedLabel, shortcut);
    }
  }

  // Delete duplicates
  for (const id of duplicateIds) {
    await deleteAiShortcut(id);
  }

  return duplicateIds.length;
};

// ===== Task Dividers =====
const dbTaskDividerToApp = (row: TaskDividerRow): TaskDivider => ({
  id: row.id,
  listId: row.list_id,
  position: row.position,
  color: row.color,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const appTaskDividerToDb = (
  divider: TaskDivider,
  userId: string,
): Omit<TaskDividerRow, "created_at" | "updated_at"> => ({
  id: divider.id,
  user_id: userId,
  list_id: divider.listId,
  position: divider.position,
  color: divider.color,
});

export const fetchTaskDividers = async (): Promise<TaskDivider[]> => {
  const userId = getSyncUserId();

  if (isOnlineNow() && supabase && userId) {
    try {
      const [, { data, error }] = await Promise.all([
        ensureOutboxProcessed("task_dividers"),
        supabase.from("task_dividers").select("*").eq("user_id", userId),
      ]);

      if (!error && data) {
        const rows = data as TaskDividerRow[];
        await bulkPutLocalRows("task_dividers", rows);
        return rows.map(dbTaskDividerToApp);
      }
    } catch (err) {
      console.error("Failed to fetch task dividers from Supabase:", err);
    }
  }

  const rows = await getLocalRows<TaskDividerRow>("task_dividers");
  return rows.map(dbTaskDividerToApp);
};

export const upsertTaskDivider = async (
  divider: TaskDivider,
): Promise<boolean> => {
  const userId = getSyncUserId();
  if (!userId) return false;
  await upsertLocalRow("task_dividers", appTaskDividerToDb(divider, userId));
  return true;
};

export const deleteTaskDivider = async (
  dividerId: string,
): Promise<boolean> => {
  await deleteLocalRow("task_dividers", dividerId);
  return true;
};

export const deleteTaskDividersByList = async (
  listId: string,
): Promise<void> => {
  const userId = getSyncUserId();
  const rows = userId
    ? await offlineDb.task_dividers
        .where("user_id")
        .equals(userId)
        .and((row) => row.list_id === listId)
        .toArray()
    : await offlineDb.task_dividers.where("list_id").equals(listId).toArray();
  if (rows.length === 0) return;
  await Promise.all(rows.map((row) => deleteTaskDivider(row.id)));
};

export const bulkUpsertTaskDividers = async (
  dividers: TaskDivider[],
): Promise<void> => {
  const userId = getSyncUserId();
  if (!userId) return;
  for (const divider of dividers) {
    await upsertTaskDivider(divider);
  }
};

// ===== Memo Trash =====
const dbMemoTrashToApp = (row: MemoTrashRow): MemoTrash => ({
  id: row.id,
  tabId: row.tab_id,
  title: row.title,
  content: row.content,
  order: row.order_index,
  deletedAt: row.deleted_at,
  originalTabId: row.original_tab_id,
  originalTabName: row.original_tab_name ?? undefined,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const appMemoTrashToDb = (
  item: MemoTrash,
  userId: string,
): Omit<MemoTrashRow, "created_at" | "updated_at"> => ({
  id: item.id,
  user_id: userId,
  tab_id: item.tabId,
  title: item.title,
  content: item.content,
  order_index: item.order,
  deleted_at: item.deletedAt,
  original_tab_id: item.originalTabId,
  original_tab_name: item.originalTabName ?? null,
});

export const fetchMemoTrash = async (): Promise<MemoTrash[]> => {
  const userId = getSyncUserId();
  const sortTrash = (rows: MemoTrashRow[]) =>
    rows
      .slice()
      .sort((a, b) =>
        String(b.deleted_at ?? "").localeCompare(String(a.deleted_at ?? "")),
      );

  if (isOnlineNow() && supabase && userId) {
    try {
      const { data, error } = await supabase
        .from("memo_trash")
        .select("*")
        .eq("user_id", userId);

      if (!error && data) {
        const rows = sortTrash(data as MemoTrashRow[]);
        await bulkPutLocalRows("memo_trash", rows);
        return rows.map(dbMemoTrashToApp);
      }
    } catch (err) {
      console.error("Failed to fetch memo trash from Supabase:", err);
    }
  }

  const rows = sortTrash(await getLocalRows<MemoTrashRow>("memo_trash"));
  return rows.map(dbMemoTrashToApp);
};

export const upsertMemoTrash = async (item: MemoTrash): Promise<boolean> => {
  const userId = getSyncUserId();
  if (!userId) return false;
  await upsertLocalRow("memo_trash", appMemoTrashToDb(item, userId));
  return true;
};

export const deleteMemoTrash = async (itemId: string): Promise<boolean> => {
  await deleteLocalRow("memo_trash", itemId);
  return true;
};

export const bulkUpsertMemoTrash = async (
  items: MemoTrash[],
): Promise<void> => {
  const userId = getSyncUserId();
  if (!userId) return;
  for (const item of items) {
    await upsertMemoTrash(item);
  }
};

// ===== Memo Tabs =====
export const fetchMemoTabs = async (): Promise<MemoTab[]> => {
  const userId = getSyncUserId();

  if (isOnlineNow() && supabase && userId) {
    try {
      const { data, error } = await supabase
        .from("memo_tabs")
        .select("*")
        .eq("user_id", userId);

      if (error) {
        console.warn("Supabase memo_tabs query error, falling back to local:", error.message);
      } else if (data) {
        const dbMemoTabs = data as DbMemoTab[];
        await bulkPutLocalRows("memo_tabs", dbMemoTabs);
        return sortByOrderIndex(dbMemoTabs).map(dbMemoTabToAppMemoTab);
      }
    } catch (err) {
      console.warn("Failed to fetch memo tabs from Supabase, falling back to local:", err);
    }
  }

  const rows = await getLocalRows<DbMemoTab>("memo_tabs");
  return sortByOrderIndex(rows).map(dbMemoTabToAppMemoTab);
};

export const upsertMemoTab = async (tab: MemoTab): Promise<boolean> => {
  await upsertLocalRow("memo_tabs", appMemoTabToDbMemoTab(tab));
  return true;
};

export const deleteMemoTab = async (tabId: string): Promise<boolean> => {
  await deleteLocalRow("memo_tabs", tabId);
  return true;
};

// ===== Memos =====
export const fetchMemos = async (): Promise<Memo[]> => {
  const userId = getSyncUserId();

  if (isOnlineNow() && supabase && userId) {
    try {
      const { data, error } = await supabase
        .from("memos")
        .select("*")
        .eq("user_id", userId);

      if (error) {
        console.warn("Supabase memos query error, falling back to local:", error.message);
      } else if (data) {
        const dbMemos = data as DbMemo[];
        await bulkPutLocalRows("memos", dbMemos);
        return sortByOrderIndex(dbMemos).map(dbMemoToAppMemo);
      }
    } catch (err) {
      console.warn("Failed to fetch memos from Supabase, falling back to local:", err);
    }
  }

  const rows = await getLocalRows<DbMemo>("memos");
  return sortByOrderIndex(rows).map(dbMemoToAppMemo);
};

export const fetchMemosByTab = async (tabId: string): Promise<Memo[]> => {
  const userId = getSyncUserId();
  const tableRef = offlineDb.memos;
  const rows = (userId
    ? await tableRef.where({ tab_id: tabId, user_id: userId }).toArray()
    : await tableRef
        .where("tab_id")
        .equals(tabId)
        .toArray()) as unknown as DbMemo[];
  return sortByOrderIndex(rows).map(dbMemoToAppMemo);
};

export const upsertMemo = async (memo: Memo): Promise<boolean> => {
  await upsertLocalRow("memos", appMemoToDbMemo(memo));
  return true;
};

export const deleteMemo = async (memoId: string): Promise<boolean> => {
  await deleteLocalRow("memos", memoId);
  return true;
};

export const deleteMemosOfTab = async (tabId: string): Promise<boolean> => {
  const rows = await fetchMemosByTab(tabId);
  for (const memo of rows) {
    await deleteLocalRow("memos", memo.id);
  }
  return true;
};

// ===== Client Tabs =====
export const fetchClientTabs = async (): Promise<ClientTab[]> => {
  const userId = getSyncUserId();

  if (isOnlineNow() && supabase && userId) {
    try {
      const { data, error } = await supabase
        .from("client_tabs")
        .select("*")
        .eq("user_id", userId);

      if (!error && data) {
        const dbClientTabs = data as DbClientTab[];
        await bulkPutLocalRows("client_tabs", dbClientTabs);
        return sortByOrderIndex(dbClientTabs).map(dbClientTabToAppClientTab);
      }
    } catch (err) {
      console.error("Failed to fetch client tabs from Supabase:", err);
    }
  }

  const rows = await getLocalRows<DbClientTab>("client_tabs");
  return sortByOrderIndex(rows).map(dbClientTabToAppClientTab);
};

export const upsertClientTab = async (tab: ClientTab): Promise<boolean> => {
  await upsertLocalRow("client_tabs", appClientTabToDbClientTab(tab));
  return true;
};

export const deleteClientTab = async (tabId: string): Promise<boolean> => {
  await deleteLocalRow("client_tabs", tabId);
  return true;
};

// ===== Clients =====
export const fetchClients = async (): Promise<Client[]> => {
  const userId = getSyncUserId();

  if (isOnlineNow() && supabase && userId) {
    try {
      const { data, error } = await supabase
        .from("clients")
        .select("*")
        .eq("user_id", userId);

      if (!error && data) {
        const dbClients = data as DbClient[];
        await bulkPutLocalRows("clients", dbClients);
        return sortByOrderIndex(dbClients).map(dbClientToAppClient);
      }
    } catch (err) {
      console.error("Failed to fetch clients from Supabase:", err);
    }
  }

  const rows = await getLocalRows<DbClient>("clients");
  return sortByOrderIndex(rows).map(dbClientToAppClient);
};

export const upsertClient = async (client: Client): Promise<boolean> => {
  await upsertLocalRow("clients", appClientToDbClient(client));
  return true;
};

export const deleteClient = async (clientId: string): Promise<boolean> => {
  await deleteLocalRow("clients", clientId);
  return true;
};

export const deleteClientsOfTab = async (tabId: string): Promise<boolean> => {
  const userId = getSyncUserId();
  const tableRef = offlineDb.clients;
  const rows = userId
    ? await tableRef.where({ tab_id: tabId, user_id: userId }).toArray()
    : await tableRef.where("tab_id").equals(tabId).toArray();
  for (const row of rows) {
    await deleteLocalRow("clients", row.id as string);
  }
  return true;
};

// ===== Project Tabs =====
export const fetchProjectTabs = async (): Promise<ProjectTab[]> => {
  const userId = getSyncUserId();

  if (isOnlineNow() && supabase && userId) {
    try {
      const { data, error } = await supabase
        .from("project_tabs")
        .select("*")
        .eq("user_id", userId);

      if (!error && data) {
        const dbProjectTabs = data as DbProjectTab[];
        await bulkPutLocalRows("project_tabs", dbProjectTabs);
        return sortByOrderIndex(dbProjectTabs).map(dbProjectTabToAppProjectTab);
      }
    } catch (err) {
      console.error("Failed to fetch project tabs from Supabase:", err);
    }
  }

  const rows = await getLocalRows<DbProjectTab>("project_tabs");
  return sortByOrderIndex(rows).map(dbProjectTabToAppProjectTab);
};

export const fetchProjectTabsByParent = async (
  parentProjectId: string | null,
): Promise<ProjectTab[]> => {
  const userId = getSyncUserId();

  if (isOnlineNow() && supabase && userId) {
    try {
      let query = supabase
        .from("project_tabs")
        .select("*")
        .eq("user_id", userId);

      if (parentProjectId === null) {
        query = query.is("parent_project_id", null);
      } else {
        query = query.eq("parent_project_id", parentProjectId);
      }

      const { data, error } = await query;

      if (!error && data) {
        const dbProjectTabs = data as DbProjectTab[];
        await bulkPutLocalRows("project_tabs", dbProjectTabs);
        return sortByOrderIndex(dbProjectTabs).map(dbProjectTabToAppProjectTab);
      }
    } catch (err) {
      console.error(
        "Failed to fetch project tabs by parent from Supabase:",
        err,
      );
    }
  }

  const rows = await getLocalRows<DbProjectTab>("project_tabs");
  const filtered = rows.filter(
    (row) => (row.parent_project_id ?? null) === parentProjectId,
  );
  return sortByOrderIndex(filtered).map(dbProjectTabToAppProjectTab);
};

export const upsertProjectTab = async (tab: ProjectTab): Promise<boolean> => {
  await upsertLocalRow("project_tabs", appProjectTabToDbProjectTab(tab));
  return true;
};

export const deleteProjectTab = async (tabId: string): Promise<boolean> => {
  await deleteLocalRow("project_tabs", tabId);
  return true;
};

// ===== Projects =====
export const fetchProjects = async (): Promise<Project[]> => {
  const userId = getSyncUserId();

  if (isOnlineNow() && supabase && userId) {
    try {
      const { data, error } = await supabase
        .from("projects")
        .select("*")
        .eq("user_id", userId);

      if (!error && data) {
        const dbProjects = data as DbProject[];
        await bulkPutLocalRows("projects", dbProjects);
        return sortByOrderIndex(dbProjects).map(dbProjectToAppProject);
      }
    } catch (err) {
      console.error("Failed to fetch projects from Supabase:", err);
    }
  }

  const rows = await getLocalRows<DbProject>("projects");
  return sortByOrderIndex(rows).map(dbProjectToAppProject);
};

export const fetchProjectsByTabIds = async (
  tabIds: string[],
): Promise<Project[]> => {
  if (tabIds.length === 0) return [];
  const userId = getSyncUserId();

  if (isOnlineNow() && supabase && userId) {
    try {
      const { data, error } = await supabase
        .from("projects")
        .select("*")
        .eq("user_id", userId)
        .in("tab_id", tabIds);

      if (!error && data) {
        const dbProjects = data as DbProject[];
        await bulkPutLocalRows("projects", dbProjects);
        return sortByOrderIndex(dbProjects).map(dbProjectToAppProject);
      }
    } catch (err) {
      console.error("Failed to fetch projects by tab IDs from Supabase:", err);
    }
  }

  const rows = await getLocalRows<DbProject>("projects");
  const filtered = rows.filter((row) => tabIds.includes(row.tab_id));
  return sortByOrderIndex(filtered).map(dbProjectToAppProject);
};

export const upsertProject = async (project: Project): Promise<boolean> => {
  await upsertLocalRow("projects", appProjectToDbProject(project));
  return true;
};

export const deleteProject = async (projectId: string): Promise<boolean> => {
  await deleteLocalRow("projects", projectId);
  return true;
};

export const deleteProjectsOfTab = async (tabId: string): Promise<boolean> => {
  const userId = getSyncUserId();
  const tableRef = offlineDb.projects;
  const rows = userId
    ? await tableRef.where({ tab_id: tabId, user_id: userId }).toArray()
    : await tableRef.where("tab_id").equals(tabId).toArray();
  for (const row of rows) {
    await deleteLocalRow("projects", row.id as string);
  }
  return true;
};

export const fetchAllNestedMemos = async (): Promise<
  {
    parentProjectId: string;
    parentProjectName: string;
    memos: (Project & { projectName?: string })[];
  }[]
> => {
  const allTabs = await fetchProjectTabs();
  const nestedTabs = allTabs.filter((t) => t.parentProjectId);
  if (nestedTabs.length === 0) return [];

  const nestedTabIds = nestedTabs.map((t) => t.id);
  const allMemos = await fetchProjectsByTabIds(nestedTabIds);
  const allProjects = await fetchProjects();

  const tabNameMap = new Map(nestedTabs.map((t) => [t.id, t.name]));

  const parentIds = [...new Set(nestedTabs.map((t) => t.parentProjectId!))];
  return parentIds
    .map((parentId) => {
      const parentProject = allProjects.find((p) => p.id === parentId);
      const tabsForParent = nestedTabs.filter(
        (t) => t.parentProjectId === parentId,
      );
      const tabIdsForParent = tabsForParent.map((t) => t.id);
      const memos = allMemos
        .filter((m) => tabIdsForParent.includes(m.tabId) && !m.isArchived)
        .map((m) => ({ ...m, projectName: tabNameMap.get(m.tabId) }));
      return {
        parentProjectId: parentId,
        parentProjectName: parentProject?.name || "Unknown Project",
        memos,
      };
    })
    .filter((group) => group.memos.length > 0);
};

// ===== AI Sessions =====
export const fetchAiSessions = async (): Promise<AiSessionRow[]> => {
  const userId = getSyncUserId();

  if (isOnlineNow() && supabase && userId) {
    try {
      const { data, error } = await supabase
        .from("ai_sessions")
        .select("*")
        .eq("user_id", userId);

      if (!error && data) {
        const sessions = data as AiSessionRow[];
        await bulkPutLocalRows("ai_sessions", sessions);
        return sessions;
      }
    } catch (err) {
      console.error("Failed to fetch AI sessions from Supabase:", err);
    }
  }

  return getLocalRows<AiSessionRow>("ai_sessions");
};

export const fetchAiSessionsWithMessageCount = async (): Promise<
  (AiSessionRow & { messageCount: number })[]
> => {
  const userId = getSyncUserId();

  // Fetch from Supabase when online and sync to local
  if (isOnlineNow() && supabase && userId) {
    try {
      // Fetch sessions
      const { data: sessionsData, error: sessionsError } = await supabase
        .from("ai_sessions")
        .select("*")
        .eq("user_id", userId)
        .order("updated_at", { ascending: false });

      if (!sessionsError && sessionsData) {
        await bulkPutLocalRows("ai_sessions", sessionsData as AiSessionRow[]);
      }

      // Fetch messages for counting
      const { data: messagesData, error: messagesError } = await supabase
        .from("ai_messages")
        .select("session_id")
        .eq("user_id", userId);

      if (!messagesError && messagesData) {
        const counts = new Map<string, number>();
        for (const row of messagesData) {
          const sessionId = row.session_id as string;
          if (!sessionId) continue;
          counts.set(sessionId, (counts.get(sessionId) ?? 0) + 1);
        }

        return (sessionsData as AiSessionRow[]).map((session) => ({
          ...session,
          messageCount: counts.get(session.id) ?? 0,
        }));
      }
    } catch (err) {
      console.error("Failed to fetch AI sessions from Supabase:", err);
    }
  }

  // Fallback to local storage
  const sessions = await getLocalRows<AiSessionRow>("ai_sessions");
  if (sessions.length === 0) return [];

  const tableRef = offlineDb.ai_messages;
  const rows = userId
    ? await tableRef.where("user_id").equals(userId).toArray()
    : await tableRef.toArray();

  const counts = new Map<string, number>();
  for (const row of rows) {
    const sessionId = row.session_id as string;
    if (!sessionId) continue;
    counts.set(sessionId, (counts.get(sessionId) ?? 0) + 1);
  }

  return sessions.map((session) => ({
    ...session,
    messageCount: counts.get(session.id) ?? 0,
  }));
};

export const upsertAiSession = async (session: AiSessionRow): Promise<void> => {
  await upsertLocalRow("ai_sessions", {
    ...session,
    updated_at: session.updated_at ?? nowIso(),
    created_at: session.created_at ?? nowIso(),
  });
};

export const deleteAiSession = async (sessionId: string): Promise<void> => {
  const userId = getSyncUserId();

  if (isOnlineNow() && supabase && userId) {
    try {
      const { error: messagesError } = await supabase
        .from("ai_messages")
        .delete()
        .eq("session_id", sessionId)
        .eq("user_id", userId);

      if (messagesError) {
        throw messagesError;
      }

      const { error: sessionError } = await supabase
        .from("ai_sessions")
        .delete()
        .eq("id", sessionId)
        .eq("user_id", userId);

      if (sessionError) {
        throw sessionError;
      }

      await offlineDb.ai_messages
        .where("session_id")
        .equals(sessionId)
        .and((row) => !userId || row.user_id === userId)
        .delete();
      await offlineDb.ai_sessions.delete(sessionId);
      return;
    } catch (err) {
      console.error(
        "Failed to delete AI session remotely, falling back to local deletes:",
        err,
      );
    }
  }

  const messages = await fetchAiMessagesBySession(sessionId);
  for (const message of messages) {
    await deleteLocalRow("ai_messages", message.id);
  }
  await deleteLocalRow("ai_sessions", sessionId);
};

export const fetchAiMessagesBySession = async (
  sessionId: string,
): Promise<AiMessageRow[]> => {
  const userId = getSyncUserId();

  if (isOnlineNow() && supabase && userId) {
    try {
      const { data, error } = await supabase
        .from("ai_messages")
        .select("*")
        .eq("session_id", sessionId)
        .eq("user_id", userId);

      if (!error && data) {
        const messages = data as AiMessageRow[];
        await bulkPutLocalRows("ai_messages", messages);
        return messages;
      }
    } catch (err) {
      console.error("Failed to fetch AI messages from Supabase:", err);
    }
  }

  const tableRef = offlineDb.ai_messages;
  if (userId) {
    return tableRef.where({ session_id: sessionId, user_id: userId }).toArray();
  }
  return tableRef.where("session_id").equals(sessionId).toArray();
};

export const upsertAiMessages = async (
  sessionId: string,
  messages: ChatMessage[],
) => {
  const userId = getSyncUserId() ?? undefined;
  const rows: AiMessageRow[] = messages.map((message) => ({
    id: message.id,
    session_id: sessionId,
    user_id: userId,
    role: message.role,
    content: message.content,
    created_at: message.timestamp.toISOString(),
    updated_at: message.timestamp.toISOString(),
  }));
  for (const row of rows) {
    await upsertLocalRow("ai_messages", row);
  }
};

export const toChatMessages = (rows: AiMessageRow[]): ChatMessage[] => {
  const sorted = rows
    .filter((row) => row.content) // strip orphaned empty placeholders
    .sort((a, b) => (a.created_at || "").localeCompare(b.created_at || ""));

  // Deduplicate: when two consecutive assistant messages have identical
  // content (caused by client-ID / server-ID mismatch in IndexedDB), keep
  // only the first occurrence.
  const deduped: AiMessageRow[] = [];
  for (const row of sorted) {
    const prev = deduped[deduped.length - 1];
    if (
      prev &&
      prev.role === "assistant" &&
      row.role === "assistant" &&
      prev.content === row.content
    ) {
      continue; // skip duplicate
    }
    deduped.push(row);
  }

  return deduped.map((row) => ({
    id: row.id,
    role: row.role,
    content: row.content,
    timestamp: new Date(row.created_at || nowIso()),
  }));
};

// Search ai_messages content and return matching session IDs with snippet
export const searchAiMessages = async (
  query: string,
): Promise<Map<string, string>> => {
  const results = new Map<string, string>();
  if (!query.trim()) return results;
  const lower = query.toLowerCase();
  const allMessages = await offlineDb.ai_messages.toArray();
  for (const msg of allMessages) {
    if (results.has(msg.session_id)) continue;
    const idx = msg.content.toLowerCase().indexOf(lower);
    if (idx !== -1) {
      const start = Math.max(0, idx - 20);
      const end = Math.min(msg.content.length, idx + query.length + 40);
      const snippet =
        (start > 0 ? "..." : "") +
        msg.content.slice(start, end).trim() +
        (end < msg.content.length ? "..." : "");
      results.set(msg.session_id, snippet);
    }
  }
  return results;
};

// ===== User Settings (key-value) =====
const settingId = (userId: string | null, key: string) =>
  `${userId ?? "local"}:${key}`;

export const getUserSetting = async <T>(
  key: string,
  fallback: T,
): Promise<T> => {
  const userId = getSyncUserId();
  const row = await offlineDb.user_settings.get(settingId(userId, key));
  if (!row) return fallback;
  return row.value as T;
};

export const setUserSetting = async (
  key: string,
  value: unknown,
  userIdOverride?: string | null,
) => {
  const userId = userIdOverride ?? getSyncUserId();
  const row: UserSettingRow = {
    id: settingId(userId, key),
    user_id: userId ?? undefined,
    key,
    value: value ?? "",
    updated_at: nowIso(),
  };
  await upsertLocalRow("user_settings", row);
};

export const migrateSplitUserSettings = async (
  userIdOverride?: string | null,
) => {
  const userId = userIdOverride ?? getSyncUserId();
  const scopedId = userId ?? "local";

  const readSetting = async <T>(key: string): Promise<T | null> => {
    const row = await offlineDb.user_settings.get(settingId(userId, key));
    if (!row) return null;
    return row.value as T;
  };

  const deleteSetting = async (key: string): Promise<void> => {
    const id = settingId(userId, key);
    await offlineDb.user_settings.delete(id);
  };

  const countForUser = async (table: string) => {
    if (userId) {
      return offlineDb.table(table).where("user_id").equals(userId).count();
    }
    const rows = await offlineDb.table(table).toArray();
    return rows.filter((row) => !(row as Record<string, unknown>).user_id)
      .length;
  };

  const ensureDataCatalogItems = async () => {
    const existingCount = await countForUser("data_catalog_items");
    if (existingCount > 0) return;
    const legacyItems =
      await readSetting<
        Array<Partial<DataCatalogItem> & { id?: string; label?: string }>
      >("data_catalog_items");
    if (!legacyItems || legacyItems.length === 0) return;
    const mapped = legacyItems.map((item, index) => ({
      id:
        item.id ||
        `${scopedId}-data-${index}-${Math.random().toString(36).slice(2, 8)}`,
      label: item.label ?? "",
      description: item.description ?? "",
      link: item.link ?? "",
      order: typeof item.order === "number" ? item.order : index,
    }));
    await bulkUpsertDataCatalogItems(mapped);
  };

  const ensureLegacyDataLinks = async () => {
    const legacyLinks = await readSetting<Record<string, string>>("data_links");
    if (!legacyLinks || Object.keys(legacyLinks).length === 0) return;
    const rows = userId
      ? await offlineDb.data_catalog_items
          .where("user_id")
          .equals(userId)
          .toArray()
      : await offlineDb.data_catalog_items.toArray();
    if (rows.length === 0) return;
    for (const row of rows) {
      const link = legacyLinks[row.id];
      if (link && !row.link) {
        const item = dbDataCatalogToApp(row as DataCatalogItemRow);
        await upsertDataCatalogItem({ ...item, link });
      }
    }
  };

  const ensureDevices = async () => {
    const existingCount = await countForUser("devices");
    if (existingCount > 0) {
      await deleteSetting("devices");
      return;
    }
    const legacyDevices =
      await readSetting<
        Array<Partial<Device> & { id?: string; name?: string }>
      >("devices");
    if (!legacyDevices || legacyDevices.length === 0) return;
    const mapped = legacyDevices.map((device, index) => ({
      id:
        device.id ||
        `${scopedId}-device-${index}-${Math.random().toString(36).slice(2, 8)}`,
      name: device.name ?? "",
      description: device.description ?? "",
    }));
    for (const device of mapped) {
      await upsertDevice(device);
    }
    await deleteSetting("devices");
  };

  const ensureAiShortcuts = async () => {
    const existingCount = await countForUser("ai_shortcuts");
    if (existingCount > 0) {
      // Cleanup legacy setting to prevent re-migration
      await deleteSetting("ai_shortcuts");
      return;
    }
    const legacyShortcuts = await readSetting<string[]>("ai_shortcuts");
    if (!legacyShortcuts || legacyShortcuts.length === 0) return;
    const mapped = legacyShortcuts.map((label, index) => ({
      id: `${scopedId}-shortcut-${index}`,
      label,
      order: index,
    }));
    await bulkUpsertAiShortcuts(mapped);
    // Cleanup legacy setting after successful migration
    await deleteSetting("ai_shortcuts");
  };

  const ensureTaskDividers = async () => {
    const existingCount = await countForUser("task_dividers");
    if (existingCount > 0) return;
    const legacyDividers = await readSetting<
      Record<
        string,
        Array<{
          id: string;
          position: number;
          color: string;
          createdAt?: string;
        }>
      >
    >("tasks_dividers");
    if (!legacyDividers) return;
    const mapped: TaskDivider[] = [];
    Object.entries(legacyDividers).forEach(([listId, dividers]) => {
      if (!Array.isArray(dividers)) return;
      dividers.forEach((divider, index) => {
        mapped.push({
          id:
            divider.id ||
            `${scopedId}-divider-${listId}-${index}-${Math.random().toString(36).slice(2, 8)}`,
          listId,
          position: divider.position ?? index,
          color: divider.color ?? "rose",
          createdAt: divider.createdAt,
        });
      });
    });
    if (mapped.length > 0) {
      await bulkUpsertTaskDividers(mapped);
    }
  };

  const ensureMemoTrash = async () => {
    const existingCount = await countForUser("memo_trash");
    if (existingCount > 0) return;
    const legacyTrash =
      await readSetting<
        Array<Partial<MemoTrash> & { id?: string; tabId?: string }>
      >("memos_trash");
    if (!legacyTrash || legacyTrash.length === 0) return;
    const mapped = legacyTrash.map((item, index) => ({
      id:
        item.id ||
        `${scopedId}-trash-${index}-${Math.random().toString(36).slice(2, 8)}`,
      tabId: item.tabId ?? "",
      title: item.title ?? "",
      content: item.content ?? "",
      order: typeof item.order === "number" ? item.order : index,
      deletedAt: item.deletedAt ?? nowIso(),
      originalTabId: item.originalTabId ?? "",
      originalTabName: item.originalTabName,
    }));
    await bulkUpsertMemoTrash(mapped);
  };

  await ensureDataCatalogItems();
  await ensureLegacyDataLinks();
  await ensureDevices();
  await ensureAiShortcuts();
  await ensureTaskDividers();
  await ensureMemoTrash();

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("split-settings-migrated"));
  }
};

// ===== Menu Items =====
export const fetchMenuItems = async (): Promise<MenuItemRow[]> => {
  const userId = getSyncUserId();

  if (isOnlineNow() && supabase && userId) {
    try {
      const { data, error } = await supabase
        .from("menu_items")
        .select("*")
        .eq("user_id", userId);

      if (!error && data) {
        const items = data as MenuItemRow[];
        // Clear local menu items for this user and replace with Supabase data
        await offlineDb.menu_items.where("user_id").equals(userId).delete();
        await bulkPutLocalRows("menu_items", items);
        return sortByOrderIndex(
          items as unknown as OrderableRow[],
        ) as unknown as MenuItemRow[];
      }
    } catch (err) {
      console.error("Failed to fetch menu items from Supabase:", err);
    }
  }

  const rows = await getLocalRows<MenuItemRow>("menu_items");
  return sortByOrderIndex(
    rows as unknown as OrderableRow[],
  ) as unknown as MenuItemRow[];
};

export const fetchMenuItemsLocal = async (): Promise<MenuItemRow[]> => {
  const rows = await getLocalRows<MenuItemRow>("menu_items");
  return sortByOrderIndex(
    rows as unknown as OrderableRow[],
  ) as unknown as MenuItemRow[];
};

export const upsertMenuItem = async (item: MenuItemRow): Promise<boolean> => {
  await upsertLocalRow("menu_items", item);
  return true;
};

export const deleteMenuItem = async (itemId: string): Promise<boolean> => {
  await deleteLocalRow("menu_items", itemId);
  return true;
};

type DefaultMenuItemDef = Omit<
  MenuItemRow,
  "id" | "user_id" | "created_at" | "updated_at"
>;

const DEFAULT_MENU_ITEM_DEFS: DefaultMenuItemDef[] = [
  {
    path: "/home",
    icon: "Home",
    label: "Home",
    color_class: "text-slate-600",
    hover_class: "hover:bg-slate-100 hover:text-slate-800",
    order_index: 0,
    is_visible: true,
  },
  {
    path: "/hub",
    icon: "Network",
    label: "Hub",
    color_class: "text-purple-600",
    hover_class: "hover:bg-purple-50 hover:text-purple-700",
    order_index: 1,
    is_visible: true,
  },
  {
    path: "/settings",
    icon: "Settings",
    label: "Settings",
    color_class: "text-slate-600",
    hover_class: "hover:bg-slate-100 hover:text-slate-700",
    order_index: 2,
    is_visible: true,
  },
  {
    path: "/memos",
    icon: "StickyNote",
    label: "Memos",
    color_class: "text-indigo-600",
    hover_class: "hover:bg-indigo-50 hover:text-indigo-700",
    order_index: 3,
    is_visible: true,
  },
  {
    path: "/tasks",
    icon: "ListTodo",
    label: "Tasks",
    color_class: "text-sky-600",
    hover_class: "hover:bg-sky-50 hover:text-sky-700",
    order_index: 4,
    is_visible: true,
  },
  {
    path: "/calendar",
    icon: "Calendar",
    label: "Calendar",
    color_class: "text-amber-600",
    hover_class: "hover:bg-amber-50 hover:text-amber-700",
    order_index: 5,
    is_visible: true,
  },
  {
    path: "/community",
    icon: "Users",
    label: "Community",
    color_class: "text-teal-600",
    hover_class: "hover:bg-teal-50 hover:text-teal-700",
    order_index: 6,
    is_visible: true,
  },
  {
    path: "/finance",
    icon: "Wallet",
    label: "Finance",
    color_class: "text-violet-600",
    hover_class: "hover:bg-violet-50 hover:text-violet-700",
    order_index: 7,
    is_visible: true,
  },
  {
    path: "/journal",
    icon: "BookOpen",
    label: "Journal",
    color_class: "text-cyan-600",
    hover_class: "hover:bg-cyan-50 hover:text-cyan-700",
    order_index: 8,
    is_visible: true,
  },
  {
    path: "/projects",
    icon: "FolderKanban",
    label: "Projects",
    color_class: "text-orange-600",
    hover_class: "hover:bg-orange-50 hover:text-orange-700",
    order_index: 9,
    is_visible: true,
  },
  {
    path: "/profile",
    icon: "User",
    label: "Profile",
    color_class: "text-rose-600",
    hover_class: "hover:bg-rose-50 hover:text-rose-700",
    order_index: 10,
    is_visible: true,
  },
  {
    path: "/ai",
    icon: "Bot",
    label: "AI",
    color_class: "text-purple-600",
    hover_class: "hover:bg-purple-50 hover:text-purple-700",
    order_index: 11,
    is_visible: true,
  },
  {
    path: "/media",
    icon: "TrendingUp",
    label: "Media",
    color_class: "text-blue-600",
    hover_class: "hover:bg-blue-50 hover:text-blue-700",
    order_index: 12,
    is_visible: true,
  },
  {
    path: "/drive",
    icon: "Database",
    label: "Drive",
    color_class: "text-emerald-600",
    hover_class: "hover:bg-emerald-50 hover:text-emerald-700",
    order_index: 13,
    is_visible: true,
  },
  {
    path: "/invest",
    icon: "CandlestickChart",
    label: "Invest",
    color_class: "text-blue-600",
    hover_class: "hover:bg-blue-50 hover:text-blue-700",
    order_index: 14,
    is_visible: true,
  },
];

const buildDefaultMenuItems = (
  userId: string,
): Omit<MenuItemRow, "id" | "created_at" | "updated_at">[] =>
  DEFAULT_MENU_ITEM_DEFS.map((def) => ({ ...def, user_id: userId }));

// Ensure all default menu items exist for existing users.
// Also handles migrations (e.g. /money → /finance).
export const ensureMissingMenuItems = async (
  userIdOverride?: string | null,
): Promise<void> => {
  const userId = userIdOverride ?? getSyncUserId();
  if (!userId) return;

  const rows = await offlineDb.menu_items
    .where("user_id")
    .equals(userId)
    .toArray();
  const existingPaths = new Set(rows.map((r) => r.path));

  // Migration helper: delete old path, let default insert handle new
  const migratePath = async (oldPath: string) => {
    if (!existingPaths.has(oldPath)) return;
    const old = rows.find((r) => r.path === oldPath);
    if (old) {
      await offlineDb.menu_items.delete(old.id);
      if (isOnlineNow() && supabase) {
        await supabase.from("menu_items").delete().eq("id", old.id);
      }
      existingPaths.delete(oldPath);
    }
  };

  // Migrations: old path → new default path
  await migratePath("/money"); // /money → /finance
  await migratePath("/data"); // /data  → /drive

  // Add any missing default items
  const defaults = buildDefaultMenuItems(userId);
  const now = nowIso();
  for (const item of defaults) {
    if (existingPaths.has(item.path)) continue;
    const id = `menu-${userId}-${item.path.replace("/", "")}`;
    await upsertMenuItem({ ...item, id, created_at: now, updated_at: now });
  }
};

export const initializeDefaultMenuItems = async (): Promise<void> => {
  const userId = getSyncUserId();
  if (!userId) return;

  const defaultItems = buildDefaultMenuItems(userId);

  // If online, check Supabase first
  if (isOnlineNow() && supabase) {
    try {
      const { data, error } = await supabase
        .from("menu_items")
        .select("*")
        .eq("user_id", userId);

      if (!error && data && data.length > 0) {
        // Supabase has menu items, use them and sync to local
        await offlineDb.menu_items.where("user_id").equals(userId).delete();
        await bulkPutLocalRows("menu_items", data as MenuItemRow[]);
        return;
      }
    } catch (err) {
      console.error("Failed to check Supabase for menu items:", err);
      // Fall through to check local
    }
  }

  // Check local DB
  const existingItems = await offlineDb.menu_items
    .where("user_id")
    .equals(userId)
    .toArray();
  if (existingItems.length > 0) return;

  // Create default menu items and sync to Supabase if online
  for (const item of defaultItems) {
    const id = `menu-${userId}-${item.path.replace("/", "")}`;
    const menuItem: MenuItemRow = {
      ...item,
      id,
      created_at: nowIso(),
      updated_at: nowIso(),
    };

    // If online, save directly to Supabase to ensure consistency
    if (isOnlineNow() && supabase) {
      await upsertLocalRow("menu_items", menuItem);
    } else {
      // Offline: save locally without syncing
      await upsertLocalRowWithoutSync("menu_items", menuItem);
    }
  }
};

export const initializeDefaultMenuItemsLocal = async (
  userIdOverride?: string | null,
): Promise<void> => {
  const userId = userIdOverride ?? getSyncUserId();
  if (!userId) return;

  const existingItems = await offlineDb.menu_items
    .where("user_id")
    .equals(userId)
    .toArray();
  if (existingItems.length > 0) return;

  const defaultItems = buildDefaultMenuItems(userId);

  for (const item of defaultItems) {
    const id = `menu-${userId}-${item.path.replace("/", "")}`;
    const menuItem: MenuItemRow = {
      ...item,
      id,
      created_at: nowIso(),
      updated_at: nowIso(),
    };
    await upsertLocalRowWithoutSync("menu_items", menuItem);
  }
};

// ===== AI Automations =====
const dbAutomationToApp = (row: AiAutomationRow): AiAutomation => ({
  id: row.id,
  name: row.name,
  description: row.description ?? undefined,
  automationType: row.automation_type,
  config: row.config as unknown as AutomationConfig,
  schedule: row.schedule,
  scheduledTime: row.scheduled_time ?? undefined,
  aiModel: row.ai_model ?? "gemini",
  enabled: row.enabled,
  lastRunAt: row.last_run_at ?? undefined,
  lastRunStatus: row.last_run_status ?? undefined,
  lastRunResult: row.last_run_result ?? undefined,
  linkedNodeId: row.linked_node_id ?? undefined,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const appAutomationToDb = (
  automation: AiAutomation,
  userId: string,
): Omit<AiAutomationRow, "created_at" | "updated_at"> => ({
  id: automation.id,
  user_id: userId,
  name: automation.name,
  description: automation.description ?? null,
  automation_type: automation.automationType,
  config: automation.config as unknown as Record<string, unknown>,
  schedule: automation.schedule,
  scheduled_time: automation.scheduledTime ?? null,
  ai_model: automation.aiModel,
  enabled: automation.enabled,
  last_run_at: automation.lastRunAt ?? null,
  last_run_status: automation.lastRunStatus ?? null,
  last_run_result: automation.lastRunResult ?? null,
  linked_node_id: automation.linkedNodeId ?? null,
});

export const fetchAiAutomations = async (): Promise<AiAutomation[]> => {
  const userId = getSyncUserId();

  if (isOnlineNow() && supabase && userId) {
    try {
      const { data, error } = await supabase
        .from("ai_automations")
        .select("*")
        .eq("user_id", userId);

      if (!error && data) {
        const rows = data as AiAutomationRow[];
        await bulkPutLocalRows("ai_automations", rows);
        return rows.map(dbAutomationToApp);
      }
    } catch (err) {
      console.error("Failed to fetch AI automations from Supabase:", err);
    }
  }

  const rows = await getLocalRows<AiAutomationRow>("ai_automations");
  return rows.map(dbAutomationToApp);
};

export const upsertAiAutomation = async (
  automation: AiAutomation,
): Promise<boolean> => {
  const userId = getSyncUserId();
  if (!userId) return false;
  await upsertLocalRow("ai_automations", appAutomationToDb(automation, userId));
  return true;
};

export const deleteAiAutomation = async (
  automationId: string,
): Promise<boolean> => {
  const userId = getSyncUserId();

  // Also delete associated runs
  if (isOnlineNow() && supabase && userId) {
    try {
      await supabase
        .from("ai_automation_runs")
        .delete()
        .eq("automation_id", automationId)
        .eq("user_id", userId);
    } catch (err) {
      console.error("Failed to delete automation runs:", err);
    }
  }

  // Delete local runs
  const runs = await offlineDb.ai_automation_runs
    .where("automation_id")
    .equals(automationId)
    .toArray();
  for (const run of runs) {
    await offlineDb.ai_automation_runs.delete(run.id);
  }

  await deleteLocalRow("ai_automations", automationId);
  return true;
};

export const fetchAiAutomationRuns = async (
  automationId: string,
): Promise<AiAutomationRunRow[]> => {
  const userId = getSyncUserId();

  if (isOnlineNow() && supabase && userId) {
    try {
      const { data, error } = await supabase
        .from("ai_automation_runs")
        .select("*")
        .eq("automation_id", automationId)
        .eq("user_id", userId)
        .order("started_at", { ascending: false })
        .limit(10);

      if (!error && data) {
        const rows = data as AiAutomationRunRow[];
        await bulkPutLocalRows("ai_automation_runs", rows);
        return rows;
      }
    } catch (err) {
      console.error("Failed to fetch automation runs from Supabase:", err);
    }
  }

  return offlineDb.ai_automation_runs
    .where("automation_id")
    .equals(automationId)
    .reverse()
    .limit(10)
    .toArray();
};

// ===== AI Notifications =====
const dbNotificationToApp = (row: AiNotificationRow): AiNotification => ({
  id: row.id,
  userId: row.user_id,
  categoryId: row.category_id ?? undefined,
  source: row.source,
  priority: row.priority,
  title: row.title,
  body: row.body,
  metadata: row.metadata ?? undefined,
  isRead: row.is_read,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const appNotificationToDb = (
  notification: AiNotification,
): Omit<AiNotificationRow, "created_at" | "updated_at"> => ({
  id: notification.id,
  user_id: notification.userId,
  category_id: notification.categoryId ?? null,
  source: notification.source,
  priority: notification.priority,
  title: notification.title,
  body: notification.body,
  metadata: notification.metadata ?? null,
  is_read: notification.isRead,
});

export const fetchAiNotifications = async (
  sources?: NotificationSource[],
): Promise<AiNotification[]> => {
  const userId = getSyncUserId();

  if (isOnlineNow() && supabase && userId) {
    try {
      let query = supabase
        .from("ai_notifications")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (sources && sources.length > 0) {
        query = query.in("source", sources);
      }

      query = query.limit(3000);

      const { data, error } = await query;

      if (!error && data) {
        const rows = data as AiNotificationRow[];
        // Clean up stale/invalid local data before updating (local-only, no Supabase sync)
        const localRows =
          await getLocalRows<AiNotificationRow>("ai_notifications");
        const fetchedSources = sources ? new Set(sources) : null;
        const validIds = new Set(rows.map((r) => r.id));
        const staleIds = localRows
          .filter(
            (r) =>
              // Only clean up rows matching the fetched sources
              (fetchedSources
                ? fetchedSources.has(r.source as NotificationSource)
                : true) &&
              (!r.user_id || r.user_id !== userId || !validIds.has(r.id)),
          )
          .map((r) => r.id);
        if (staleIds.length > 0) {
          await offlineDb.ai_notifications.bulkDelete(staleIds);
        }
        await bulkPutLocalRows("ai_notifications", rows);
        return rows.map(dbNotificationToApp);
      }
    } catch (err) {
      console.error("Failed to fetch AI notifications from Supabase:", err);
    }
  }

  const rows = await getLocalRows<AiNotificationRow>("ai_notifications");
  const filteredRows = (
    userId ? rows.filter((r) => r.user_id === userId) : rows
  ).filter((r) => !sources || sources.includes(r.source as NotificationSource));
  return filteredRows
    .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""))
    .map(dbNotificationToApp);
};

export const upsertAiNotification = async (
  notification: AiNotification,
): Promise<boolean> => {
  await upsertLocalRow("ai_notifications", appNotificationToDb(notification));
  return true;
};

export const deleteAiNotification = async (
  notificationId: string,
): Promise<boolean> => {
  await deleteLocalRow("ai_notifications", notificationId);
  return true;
};

export const markNotificationAsRead = async (
  notificationId: string,
): Promise<boolean> => {
  const userId = getSyncUserId();

  if (isOnlineNow() && supabase && userId) {
    try {
      await supabase
        .from("ai_notifications")
        .update({ is_read: true, updated_at: nowIso() })
        .eq("id", notificationId)
        .eq("user_id", userId);
    } catch (err) {
      console.error("Failed to mark notification as read in Supabase:", err);
    }
  }

  const row = await offlineDb.ai_notifications.get(notificationId);
  if (row) {
    await offlineDb.ai_notifications.put({
      ...row,
      is_read: true,
      updated_at: nowIso(),
    });
  }
  return true;
};

export const markAllNotificationsAsRead = async (): Promise<boolean> => {
  const userId = getSyncUserId();

  if (isOnlineNow() && supabase && userId) {
    try {
      await supabase
        .from("ai_notifications")
        .update({ is_read: true, updated_at: nowIso() })
        .eq("user_id", userId)
        .eq("is_read", false);
    } catch (err) {
      console.error(
        "Failed to mark all notifications as read in Supabase:",
        err,
      );
    }
  }

  const rows = userId
    ? await offlineDb.ai_notifications.where("user_id").equals(userId).toArray()
    : await offlineDb.ai_notifications.toArray();

  for (const row of rows) {
    if (!row.is_read) {
      await offlineDb.ai_notifications.put({
        ...row,
        is_read: true,
        updated_at: nowIso(),
      });
    }
  }
  return true;
};

// Sync notifications by source: delete old entries for the source, insert new ones
export const syncNotificationsBySource = async (
  source: NotificationSource,
  notifications: AiNotification[],
): Promise<boolean> => {
  const userId = getSyncUserId();
  if (!userId) return false;

  // Delete existing entries for this source from Supabase
  if (isOnlineNow() && supabase) {
    try {
      await supabase
        .from("ai_notifications")
        .delete()
        .eq("user_id", userId)
        .eq("source", source);

      if (notifications.length > 0) {
        const rows = notifications.map((n) => ({
          id: n.id,
          user_id: userId,
          category_id: n.categoryId ?? null,
          source: n.source,
          priority: n.priority,
          title: n.title,
          body: n.body,
          metadata: n.metadata ?? null,
          is_read: n.isRead,
          created_at: n.createdAt ?? nowIso(),
          updated_at: n.updatedAt ?? nowIso(),
        }));
        await supabase.from("ai_notifications").insert(rows);
      }
    } catch (err) {
      console.error(`Failed to sync ${source} notifications to Supabase:`, err);
    }
  }

  // Update local IndexedDB
  const localRows = await offlineDb.ai_notifications
    .where("user_id")
    .equals(userId)
    .toArray();
  const toDelete = localRows.filter((r) => r.source === source);
  for (const row of toDelete) {
    await offlineDb.ai_notifications.delete(row.id);
  }
  for (const n of notifications) {
    await offlineDb.ai_notifications.put({
      id: n.id,
      user_id: userId,
      category_id: n.categoryId ?? null,
      source: n.source,
      priority: n.priority,
      title: n.title,
      body: n.body,
      metadata: n.metadata ?? null,
      is_read: n.isRead,
      created_at: n.createdAt ?? nowIso(),
      updated_at: n.updatedAt ?? nowIso(),
    });
  }

  return true;
};

// ===== Media Feed Items (slack, rss, x) =====
const dbMediaFeedToApp = (row: MediaFeedItemRow): MediaFeedItem => ({
  id: row.id,
  userId: row.user_id,
  categoryId: row.category_id ?? undefined,
  source: row.source as MediaFeedSource,
  priority: row.priority,
  title: row.title,
  body: row.body,
  metadata: row.metadata ?? undefined,
  isRead: row.is_read,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const fetchMediaFeedItems = async (
  sources?: MediaFeedSource[],
): Promise<MediaFeedItem[]> => {
  const userId = getSyncUserId();

  if (isOnlineNow() && supabase && userId) {
    try {
      let query = supabase
        .from("media_feed_items")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (sources && sources.length > 0) {
        query = query.in("source", sources);
      }

      query = query.limit(3000);

      const { data, error } = await query;

      if (!error && data) {
        const rows = data as MediaFeedItemRow[];

        // Slack メッセージの重複除去（channel_id + timestamp で一意判定）
        const seen = new Set<string>();
        const dedupedRows = rows.filter((r) => {
          if (r.source !== "slack") return true;
          const meta = r.metadata as {
            channel_id?: string;
            timestamp?: string;
          } | null;
          if (!meta?.channel_id || !meta?.timestamp) return true;
          const key = `${meta.channel_id}:${meta.timestamp}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });

        const localRows =
          await getLocalRows<MediaFeedItemRow>("media_feed_items");
        const fetchedSources = sources ? new Set(sources) : null;
        const validIds = new Set(dedupedRows.map((r) => r.id));
        const staleIds = localRows
          .filter(
            (r) =>
              (fetchedSources
                ? fetchedSources.has(r.source as MediaFeedSource)
                : true) &&
              (!r.user_id || r.user_id !== userId || !validIds.has(r.id)),
          )
          .map((r) => r.id);
        if (staleIds.length > 0) {
          await offlineDb.media_feed_items.bulkDelete(staleIds);
        }
        await bulkPutLocalRows("media_feed_items", dedupedRows);
        return dedupedRows.map(dbMediaFeedToApp);
      }
    } catch (err) {
      console.error("Failed to fetch media feed items from Supabase:", err);
    }
  }

  const rows = await getLocalRows<MediaFeedItemRow>("media_feed_items");
  const filteredRows = (
    userId ? rows.filter((r) => r.user_id === userId) : rows
  ).filter((r) => !sources || sources.includes(r.source as MediaFeedSource));
  return filteredRows
    .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""))
    .map(dbMediaFeedToApp);
};

export const markMediaFeedItemAsRead = async (id: string): Promise<boolean> => {
  const userId = getSyncUserId();

  if (isOnlineNow() && supabase && userId) {
    try {
      const { error } = await supabase
        .from("media_feed_items")
        .update({ is_read: true, updated_at: nowIso() })
        .eq("id", id)
        .eq("user_id", userId);
      if (error) {
        console.error("Supabase mark-as-read error:", error);
      }
    } catch (err) {
      console.error("Failed to mark media feed item as read in Supabase:", err);
    }
  }

  const row = await offlineDb.media_feed_items.get(id);
  if (row) {
    await offlineDb.media_feed_items.put({
      ...row,
      is_read: true,
      updated_at: nowIso(),
    });
  }
  return true;
};

export const markMediaFeedItemsAsReadBulk = async (
  ids: string[],
): Promise<boolean> => {
  if (ids.length === 0) return true;
  const userId = getSyncUserId();
  const now = nowIso();

  if (isOnlineNow() && supabase && userId) {
    try {
      const { error } = await supabase
        .from("media_feed_items")
        .update({ is_read: true, updated_at: now })
        .in("id", ids)
        .eq("user_id", userId);
      if (error) {
        console.error("Supabase bulk mark-as-read error:", error);
      }
    } catch (err) {
      console.error("Failed to bulk mark media feed as read:", err);
    }
  }

  const rows = await offlineDb.media_feed_items.bulkGet(ids);
  const updates = rows
    .filter((r): r is MediaFeedItemRow => !!r)
    .map((r) => ({ ...r, is_read: true, updated_at: now }));
  if (updates.length > 0) {
    await offlineDb.media_feed_items.bulkPut(updates);
  }
  return true;
};

// ===== Google Gmail Messages (dedup + badge) =====
export const fetchGmailUnreadCount = async (): Promise<number> => {
  const userId = getSyncUserId();

  if (isOnlineNow() && supabase && userId) {
    try {
      const { count, error } = await supabase
        .from("google_gmail_messages")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("is_read", false);

      if (!error && count !== null) {
        return count;
      }
    } catch (err) {
      console.error("Failed to fetch Gmail unread count from Supabase:", err);
    }
  }

  const rows = await getLocalRows<GoogleGmailMessageRow>(
    "google_gmail_messages",
  );
  return rows.filter((r) => r.user_id === userId && !r.is_read).length;
};

export const markGmailSyncMessageAsRead = async (
  messageId: string,
): Promise<boolean> => {
  const userId = getSyncUserId();

  if (isOnlineNow() && supabase && userId) {
    try {
      await supabase
        .from("google_gmail_messages")
        .update({ is_read: true, updated_at: nowIso() })
        .eq("user_id", userId)
        .eq("message_id", messageId);
    } catch (err) {
      console.error("Failed to mark Gmail message as read in Supabase:", err);
    }
  }

  const rows = await getLocalRows<GoogleGmailMessageRow>(
    "google_gmail_messages",
  );
  const row = rows.find(
    (r) => r.user_id === userId && r.message_id === messageId,
  );
  if (row) {
    await offlineDb.google_gmail_messages.put({
      ...row,
      is_read: true,
      updated_at: nowIso(),
    });
  }
  return true;
};

// ===== Google Calendar / Gmail Sync Data (for AI context) =====
export const fetchGoogleCalendarSyncEvents = async (): Promise<
  GoogleCalendarSyncEvent[]
> => {
  const userId = getSyncUserId();

  if (isOnlineNow() && supabase && userId) {
    try {
      const { data, error } = await supabase
        .from("google_calendar_events")
        .select("*")
        .eq("user_id", userId)
        .order("start_time", { ascending: true });

      if (!error && data) {
        return (data as Record<string, unknown>[]).map((row) => ({
          userId: row.user_id as string,
          eventId: row.event_id as string,
          calendarId: (row.calendar_id as string) ?? undefined,
          calendarName: (row.calendar_name as string) ?? undefined,
          summary: (row.summary as string) ?? undefined,
          startTime: (row.start_time as string) ?? undefined,
          endTime: (row.end_time as string) ?? undefined,
          location: (row.location as string) ?? undefined,
          description: (row.description as string) ?? undefined,
          htmlLink: (row.html_link as string) ?? undefined,
          hangoutLink: (row.hangout_link as string) ?? undefined,
          status: (row.status as string) ?? undefined,
          attendees:
            (row.attendees as {
              email: string;
              name?: string;
              status?: string;
            }[]) ?? undefined,
          createdAt: (row.created_at as string) ?? undefined,
          updatedAt: (row.updated_at as string) ?? undefined,
        }));
      }
    } catch (err) {
      console.error("Failed to fetch Google Calendar events:", err);
    }
  }

  return [];
};

export const fetchGoogleGmailSyncMessages = async (): Promise<
  GoogleGmailSyncMessage[]
> => {
  const userId = getSyncUserId();

  if (isOnlineNow() && supabase && userId) {
    try {
      const { data, error } = await supabase
        .from("google_gmail_messages")
        .select("*")
        .eq("user_id", userId)
        .order("date", { ascending: false })
        .limit(500);

      if (!error && data) {
        return (data as Record<string, unknown>[]).map((row) => ({
          userId: row.user_id as string,
          messageId: row.message_id as string,
          threadId: (row.thread_id as string) ?? undefined,
          subject: (row.subject as string) ?? undefined,
          snippet: (row.snippet as string) ?? undefined,
          sender: (row.sender as string) ?? undefined,
          recipient: (row.recipient as string) ?? undefined,
          cc: (row.cc as string) ?? undefined,
          date: (row.date as string) ?? undefined,
          labels: (row.labels as string[]) ?? undefined,
          isUnread: (row.is_unread as boolean) ?? undefined,
          isStarred: (row.is_starred as boolean) ?? undefined,
          isRead: row.is_read as boolean,
          historyId: (row.history_id as string) ?? undefined,
          sizeEstimate: (row.size_estimate as number) ?? undefined,
          createdAt: (row.created_at as string) ?? undefined,
          updatedAt: (row.updated_at as string) ?? undefined,
        }));
      }
    } catch (err) {
      console.error("Failed to fetch Google Gmail messages:", err);
    }
  }

  return [];
};

// ===== AI Notification Categories =====
const dbNotificationCategoryToApp = (
  row: AiNotificationCategoryRow,
): AiNotificationCategory => ({
  id: row.id,
  userId: row.user_id,
  name: row.name,
  color: row.color,
  icon: row.icon ?? undefined,
  orderIndex: row.order_index,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const appNotificationCategoryToDb = (
  category: AiNotificationCategory,
  userId: string,
): Omit<AiNotificationCategoryRow, "created_at" | "updated_at"> => ({
  id: category.id,
  user_id: category.userId ?? userId,
  name: category.name,
  color: category.color,
  icon: category.icon ?? null,
  order_index: category.orderIndex,
});

export const fetchAiNotificationCategories = async (): Promise<
  AiNotificationCategory[]
> => {
  const userId = getSyncUserId();

  if (isOnlineNow() && supabase && userId) {
    try {
      const { data, error } = await supabase
        .from("ai_notification_categories")
        .select("*")
        .eq("user_id", userId);

      if (!error && data) {
        const rows = data as AiNotificationCategoryRow[];
        await bulkPutLocalRows("ai_notification_categories", rows);
        return sortByOrderIndex(rows).map(dbNotificationCategoryToApp);
      }
    } catch (err) {
      console.error(
        "Failed to fetch notification categories from Supabase:",
        err,
      );
    }
  }

  const rows = await getLocalRows<AiNotificationCategoryRow>(
    "ai_notification_categories",
  );
  return sortByOrderIndex(rows).map(dbNotificationCategoryToApp);
};

export const upsertAiNotificationCategory = async (
  category: AiNotificationCategory,
): Promise<boolean> => {
  const userId = getSyncUserId();
  if (!userId) return false;
  await upsertLocalRow(
    "ai_notification_categories",
    appNotificationCategoryToDb(category, userId),
  );
  return true;
};

export const deleteAiNotificationCategory = async (
  categoryId: string,
): Promise<boolean> => {
  await deleteLocalRow("ai_notification_categories", categoryId);
  return true;
};

// ===== AI Notification API Keys =====
const dbApiKeyToApp = (row: AiNotificationApiKeyRow): AiNotificationApiKey => ({
  id: row.id,
  userId: row.user_id,
  name: row.name,
  keyPrefix: row.key_prefix,
  isActive: row.is_active,
  lastUsedAt: row.last_used_at ?? undefined,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const fetchAiNotificationApiKeys = async (): Promise<
  AiNotificationApiKey[]
> => {
  const userId = getSyncUserId();

  if (isOnlineNow() && supabase && userId) {
    try {
      const { data, error } = await supabase
        .from("ai_notification_api_keys")
        .select(
          "id, user_id, name, key_prefix, is_active, last_used_at, created_at, updated_at",
        )
        .eq("user_id", userId);

      if (!error && data) {
        const rows = data as Omit<AiNotificationApiKeyRow, "key_hash">[];
        return rows.map((row) => dbApiKeyToApp(row as AiNotificationApiKeyRow));
      }
    } catch (err) {
      console.error("Failed to fetch API keys from Supabase:", err);
    }
  }

  const rows = await getLocalRows<AiNotificationApiKeyRow>(
    "ai_notification_api_keys",
  );
  return rows.map(dbApiKeyToApp);
};

export const createAiNotificationApiKey = async (
  name: string,
): Promise<{ apiKey: AiNotificationApiKey; rawKey: string } | null> => {
  const userId = getSyncUserId();
  if (!userId || !supabase) return null;

  // Generate a secure random API key
  const rawKey = `hub_${Array.from(crypto.getRandomValues(new Uint8Array(24)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")}`;

  // Hash the key using SHA-256
  const encoder = new TextEncoder();
  const data = encoder.encode(rawKey);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const keyHash = Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const keyPrefix = `${rawKey.slice(0, 7)}...${rawKey.slice(-4)}`;
  const id = `apikey-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const now = nowIso();

  const row: AiNotificationApiKeyRow = {
    id,
    user_id: userId,
    name,
    key_hash: keyHash,
    key_prefix: keyPrefix,
    is_active: true,
    last_used_at: null,
    created_at: now,
    updated_at: now,
  };

  try {
    const { error } = await supabase
      .from("ai_notification_api_keys")
      .insert(row);
    if (error) throw error;

    return {
      apiKey: dbApiKeyToApp(row),
      rawKey,
    };
  } catch (err) {
    console.error("Failed to create API key:", err);
    return null;
  }
};

export const deleteAiNotificationApiKey = async (
  keyId: string,
): Promise<boolean> => {
  const userId = getSyncUserId();

  if (isOnlineNow() && supabase && userId) {
    try {
      await supabase
        .from("ai_notification_api_keys")
        .delete()
        .eq("id", keyId)
        .eq("user_id", userId);
    } catch (err) {
      console.error("Failed to delete API key from Supabase:", err);
      return false;
    }
  }

  await offlineDb.ai_notification_api_keys.delete(keyId);
  return true;
};

export const toggleAiNotificationApiKey = async (
  keyId: string,
  isActive: boolean,
): Promise<boolean> => {
  const userId = getSyncUserId();

  if (isOnlineNow() && supabase && userId) {
    try {
      await supabase
        .from("ai_notification_api_keys")
        .update({ is_active: isActive, updated_at: nowIso() })
        .eq("id", keyId)
        .eq("user_id", userId);
    } catch (err) {
      console.error("Failed to toggle API key in Supabase:", err);
      return false;
    }
  }

  const row = await offlineDb.ai_notification_api_keys.get(keyId);
  if (row) {
    await offlineDb.ai_notification_api_keys.put({
      ...row,
      is_active: isActive,
      updated_at: nowIso(),
    });
  }
  return true;
};

// ===== Slack Integrations =====
const dbSlackIntegrationToApp = (
  row: SlackIntegrationRow,
): SlackIntegration => ({
  id: row.id,
  userId: row.user_id,
  teamId: row.team_id,
  teamName: row.team_name,
  channelFilters: row.channel_filters as unknown as SlackChannelFilter,
  defaultCategoryId: row.default_category_id,
  syncState: row.sync_state as SlackSyncState | undefined,
  isActive: row.is_active,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const fetchSlackIntegrations = async (): Promise<SlackIntegration[]> => {
  const userId = getSyncUserId();

  if (isOnlineNow() && supabase && userId) {
    try {
      const { data, error } = await supabase
        .from("slack_integrations")
        .select(
          "id, user_id, team_id, team_name, channel_filters, default_category_id, sync_state, is_active, created_at, updated_at",
        )
        .eq("user_id", userId);

      if (!error && data) {
        return (data as SlackIntegrationRow[]).map(dbSlackIntegrationToApp);
      }
    } catch (err) {
      console.error("Failed to fetch Slack integrations from Supabase:", err);
    }
  }

  const rows = await getLocalRows<SlackIntegrationRow>("slack_integrations");
  return rows.map(dbSlackIntegrationToApp);
};

export const upsertSlackIntegration = async (
  integration: Omit<SlackIntegration, "id" | "createdAt" | "updatedAt"> & {
    id?: string;
    botToken: string;
  },
): Promise<SlackIntegration | null> => {
  const userId = getSyncUserId();
  if (!userId || !supabase) return null;

  const id =
    integration.id ||
    `slack-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const now = nowIso();

  const row: SlackIntegrationRow = {
    id,
    user_id: userId,
    team_id: integration.teamId,
    team_name: integration.teamName,
    bot_token: integration.botToken,
    channel_filters: integration.channelFilters as unknown as Record<
      string,
      unknown
    >,
    default_category_id: integration.defaultCategoryId || null,
    is_active: integration.isActive,
    created_at: now,
    updated_at: now,
  };

  try {
    const { error } = await supabase
      .from("slack_integrations")
      .upsert(row, { onConflict: "id" });
    if (error) throw error;

    return dbSlackIntegrationToApp(row);
  } catch (err) {
    console.error("Failed to upsert Slack integration:", err);
    return null;
  }
};

export const updateSlackIntegrationFields = async (
  integrationId: string,
  updates: {
    teamName?: string;
    botToken?: string;
    channelFilters?: {
      mode: "all" | "include" | "exclude";
      channels: string[];
    };
    defaultCategoryId?: string | null;
    isActive?: boolean;
  },
): Promise<boolean> => {
  const userId = getSyncUserId();
  if (!userId || !supabase) return false;

  const updateData: Record<string, unknown> = {
    updated_at: nowIso(),
  };

  if (updates.teamName !== undefined) {
    updateData.team_name = updates.teamName;
  }
  if (updates.botToken !== undefined && updates.botToken !== "") {
    updateData.bot_token = updates.botToken;
  }
  if (updates.channelFilters !== undefined) {
    updateData.channel_filters = updates.channelFilters;
  }
  if (updates.defaultCategoryId !== undefined) {
    updateData.default_category_id = updates.defaultCategoryId;
  }
  if (updates.isActive !== undefined) {
    updateData.is_active = updates.isActive;
  }

  try {
    const { error } = await supabase
      .from("slack_integrations")
      .update(updateData)
      .eq("id", integrationId)
      .eq("user_id", userId);

    if (error) throw error;
    return true;
  } catch (err) {
    console.error("Failed to update Slack integration:", err);
    return false;
  }
};

export const deleteSlackIntegration = async (
  integrationId: string,
): Promise<boolean> => {
  const userId = getSyncUserId();

  if (isOnlineNow() && supabase && userId) {
    try {
      await supabase
        .from("slack_integrations")
        .delete()
        .eq("id", integrationId)
        .eq("user_id", userId);
    } catch (err) {
      console.error("Failed to delete Slack integration from Supabase:", err);
      return false;
    }
  }

  await offlineDb.slack_integrations.delete(integrationId);
  return true;
};

export const toggleSlackIntegration = async (
  integrationId: string,
  isActive: boolean,
): Promise<boolean> => {
  const userId = getSyncUserId();

  if (isOnlineNow() && supabase && userId) {
    try {
      await supabase
        .from("slack_integrations")
        .update({ is_active: isActive, updated_at: nowIso() })
        .eq("id", integrationId)
        .eq("user_id", userId);
    } catch (err) {
      console.error("Failed to toggle Slack integration in Supabase:", err);
      return false;
    }
  }

  const row = await offlineDb.slack_integrations.get(integrationId);
  if (row) {
    await offlineDb.slack_integrations.put({
      ...row,
      is_active: isActive,
      updated_at: nowIso(),
    });
  }
  return true;
};

// ===== RSS Feeds =====
const dbRssFeedToApp = (row: RssFeedRow): RssFeed => ({
  id: row.id,
  userId: row.user_id,
  name: row.name,
  url: row.url,
  category: row.category || undefined,
  isActive: row.is_active,
  lastFetchedAt: row.last_fetched_at || undefined,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const fetchRssFeeds = async (): Promise<RssFeed[]> => {
  const userId = getSyncUserId();

  if (isOnlineNow() && supabase && userId) {
    try {
      const { data, error } = await supabase
        .from("rss_feeds")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (!error && data) {
        // Sync to local
        await bulkPutLocalRows("rss_feeds", data as RssFeedRow[]);
        return (data as RssFeedRow[]).map(dbRssFeedToApp);
      }
    } catch (err) {
      console.error("Failed to fetch RSS feeds from Supabase:", err);
    }
  }

  const rows = await getLocalRows<RssFeedRow>("rss_feeds");
  return rows.map(dbRssFeedToApp);
};

export const upsertRssFeed = async (
  feed: Omit<RssFeed, "id" | "createdAt" | "updatedAt"> & { id?: string },
): Promise<RssFeed | null> => {
  const userId = getSyncUserId();
  if (!userId || !supabase) return null;

  const id =
    feed.id || `rss-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const now = nowIso();

  const row: RssFeedRow = {
    id,
    user_id: userId,
    name: feed.name,
    url: feed.url,
    category: feed.category || null,
    is_active: feed.isActive,
    last_fetched_at: feed.lastFetchedAt || null,
    created_at: now,
    updated_at: now,
  };

  try {
    const { error } = await supabase
      .from("rss_feeds")
      .upsert(row, { onConflict: "id" });
    if (error) throw error;

    await offlineDb.rss_feeds.put(row);
    return dbRssFeedToApp(row);
  } catch (err) {
    console.error("Failed to upsert RSS feed:", err);
    return null;
  }
};

export const deleteRssFeed = async (feedId: string): Promise<boolean> => {
  const userId = getSyncUserId();

  if (isOnlineNow() && supabase && userId) {
    try {
      await supabase
        .from("rss_feeds")
        .delete()
        .eq("id", feedId)
        .eq("user_id", userId);
    } catch (err) {
      console.error("Failed to delete RSS feed from Supabase:", err);
      return false;
    }
  }

  await offlineDb.rss_feeds.delete(feedId);
  return true;
};

export const toggleRssFeed = async (
  feedId: string,
  isActive: boolean,
): Promise<boolean> => {
  const userId = getSyncUserId();

  if (isOnlineNow() && supabase && userId) {
    try {
      await supabase
        .from("rss_feeds")
        .update({ is_active: isActive, updated_at: nowIso() })
        .eq("id", feedId)
        .eq("user_id", userId);
    } catch (err) {
      console.error("Failed to toggle RSS feed in Supabase:", err);
      return false;
    }
  }

  const row = await offlineDb.rss_feeds.get(feedId);
  if (row) {
    await offlineDb.rss_feeds.put({
      ...row,
      is_active: isActive,
      updated_at: nowIso(),
    });
  }
  return true;
};

export const updateRssFeed = async (
  feedId: string,
  updates: {
    name?: string;
    url?: string;
    category?: string | null;
    isActive?: boolean;
  },
): Promise<boolean> => {
  const userId = getSyncUserId();
  if (!userId || !supabase) return false;

  const updateData: Record<string, unknown> = {
    updated_at: nowIso(),
  };

  if (updates.name !== undefined) updateData.name = updates.name;
  if (updates.url !== undefined) updateData.url = updates.url;
  if (updates.category !== undefined) updateData.category = updates.category;
  if (updates.isActive !== undefined) updateData.is_active = updates.isActive;

  try {
    const { error } = await supabase
      .from("rss_feeds")
      .update(updateData)
      .eq("id", feedId)
      .eq("user_id", userId);

    if (error) throw error;

    // Update local
    const row = await offlineDb.rss_feeds.get(feedId);
    if (row) {
      await offlineDb.rss_feeds.put({
        ...row,
        ...updateData,
        updated_at: nowIso(),
      } as RssFeedRow);
    }
    return true;
  } catch (err) {
    console.error("Failed to update RSS feed:", err);
    return false;
  }
};

// ===== X Sources =====
const dbXSourceToApp = (row: XSourceRow): XSource => ({
  id: row.id,
  userId: row.user_id,
  name: row.name,
  sourceType: row.source_type,
  query: row.query,
  category: row.category || undefined,
  isActive: row.is_active,
  lastFetchedAt: row.last_fetched_at || undefined,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const fetchXSources = async (): Promise<XSource[]> => {
  const userId = getSyncUserId();

  if (isOnlineNow() && supabase && userId) {
    try {
      const { data, error } = await supabase
        .from("x_sources")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (!error && data) {
        await bulkPutLocalRows("x_sources", data as XSourceRow[]);
        return (data as XSourceRow[]).map(dbXSourceToApp);
      }
    } catch (err) {
      console.error("Failed to fetch X sources from Supabase:", err);
    }
  }

  const rows = await getLocalRows<XSourceRow>("x_sources");
  return rows.map(dbXSourceToApp);
};

export const upsertXSource = async (
  source: Omit<XSource, "id" | "createdAt" | "updatedAt"> & { id?: string },
): Promise<XSource | null> => {
  const userId = getSyncUserId();
  if (!userId || !supabase) return null;

  const id =
    source.id || `xsrc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const now = nowIso();

  const row: XSourceRow = {
    id,
    user_id: userId,
    name: source.name,
    source_type: source.sourceType,
    query: source.query,
    category: source.category || null,
    is_active: source.isActive,
    last_fetched_at: source.lastFetchedAt || null,
    created_at: now,
    updated_at: now,
  };

  try {
    const { error } = await supabase
      .from("x_sources")
      .upsert(row, { onConflict: "id" });
    if (error) throw error;

    await offlineDb.x_sources.put(row);
    return dbXSourceToApp(row);
  } catch (err) {
    console.error("Failed to upsert X source:", err);
    return null;
  }
};

export const deleteXSource = async (sourceId: string): Promise<boolean> => {
  const userId = getSyncUserId();

  if (isOnlineNow() && supabase && userId) {
    try {
      await supabase
        .from("x_sources")
        .delete()
        .eq("id", sourceId)
        .eq("user_id", userId);
    } catch (err) {
      console.error("Failed to delete X source from Supabase:", err);
      return false;
    }
  }

  await offlineDb.x_sources.delete(sourceId);
  return true;
};

export const toggleXSource = async (
  sourceId: string,
  isActive: boolean,
): Promise<boolean> => {
  const userId = getSyncUserId();

  if (isOnlineNow() && supabase && userId) {
    try {
      await supabase
        .from("x_sources")
        .update({ is_active: isActive, updated_at: nowIso() })
        .eq("id", sourceId)
        .eq("user_id", userId);
    } catch (err) {
      console.error("Failed to toggle X source in Supabase:", err);
      return false;
    }
  }

  const row = await offlineDb.x_sources.get(sourceId);
  if (row) {
    await offlineDb.x_sources.put({
      ...row,
      is_active: isActive,
      updated_at: nowIso(),
    });
  }
  return true;
};

export const updateXSource = async (
  sourceId: string,
  updates: {
    name?: string;
    sourceType?: "account" | "keyword";
    query?: string;
    category?: string | null;
    isActive?: boolean;
  },
): Promise<boolean> => {
  const userId = getSyncUserId();
  if (!userId || !supabase) return false;

  const updateData: Record<string, unknown> = {
    updated_at: nowIso(),
  };

  if (updates.name !== undefined) updateData.name = updates.name;
  if (updates.sourceType !== undefined)
    updateData.source_type = updates.sourceType;
  if (updates.query !== undefined) updateData.query = updates.query;
  if (updates.category !== undefined) updateData.category = updates.category;
  if (updates.isActive !== undefined) updateData.is_active = updates.isActive;

  try {
    const { error } = await supabase
      .from("x_sources")
      .update(updateData)
      .eq("id", sourceId)
      .eq("user_id", userId);

    if (error) throw error;

    const row = await offlineDb.x_sources.get(sourceId);
    if (row) {
      await offlineDb.x_sources.put({
        ...row,
        ...updateData,
        updated_at: nowIso(),
      } as XSourceRow);
    }
    return true;
  } catch (err) {
    console.error("Failed to update X source:", err);
    return false;
  }
};
