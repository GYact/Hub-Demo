import { createClient } from "@supabase/supabase-js";
import type {
  OrgNode,
  GroupColor,
  Frame,
  NodeType,
  NodeShape,
  Tool,
  MemoTab,
  Memo,
  Client,
  ClientStatus,
  ClientTab,
  Project,
  ProjectStatus,
  ProjectTab,
  ProjectBudget,
  BudgetUnit,
} from "../types";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Create Supabase client only if credentials are available
export const supabase =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          persistSession: true, // Persist session in localStorage
          autoRefreshToken: true, // Automatically refresh expired tokens
          detectSessionInUrl: true, // Detect session from URL hash
          storage:
            typeof window !== "undefined" ? window.localStorage : undefined,
          storageKey: "sb-auth-token", // Storage key for session
        },
      })
    : null;

export const isSupabaseConfigured = (): boolean => {
  return supabase !== null;
};

// Database types
export interface DbNode {
  id: string;
  title: string;
  subtitle: string | null;
  type: NodeType;
  shape: NodeShape;
  description: string;
  system_instruction: string | null;
  linked_to: string[];
  linked_automation_ids: string[] | null;
  position_x: number;
  position_y: number;
  group_color: string | null;
  created_at?: string;
  updated_at?: string;
}

// Convert DB node to app node
export const dbNodeToAppNode = (dbNode: DbNode): OrgNode => ({
  id: dbNode.id,
  title: dbNode.title,
  subtitle: dbNode.subtitle || undefined,
  type: dbNode.type,
  shape: dbNode.shape,
  description: dbNode.description,
  systemInstruction: dbNode.system_instruction || undefined,
  linkedTo: dbNode.linked_to || [],
  linkedAutomationIds: dbNode.linked_automation_ids?.length
    ? dbNode.linked_automation_ids
    : undefined,
  position: { x: dbNode.position_x, y: dbNode.position_y },
  groupColor: (dbNode.group_color as GroupColor) || undefined,
});

// Convert app node to DB node
export const appNodeToDbNode = (
  node: OrgNode,
): Omit<DbNode, "created_at" | "updated_at"> => ({
  id: node.id,
  title: node.title,
  subtitle: node.subtitle || null,
  type: node.type,
  shape: node.shape,
  description: node.description,
  system_instruction: node.systemInstruction || null,
  linked_to: node.linkedTo,
  linked_automation_ids: node.linkedAutomationIds?.length
    ? node.linkedAutomationIds
    : null,
  position_x: node.position.x,
  position_y: node.position.y,
  group_color: node.groupColor || null,
});

// Fetch all nodes
export const fetchNodes = async (): Promise<OrgNode[]> => {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("nodes")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Error fetching nodes:", error);
    return [];
  }

  return (data || []).map(dbNodeToAppNode);
};

// Upsert a single node
export const upsertNode = async (node: OrgNode): Promise<boolean> => {
  if (!supabase) return false;

  const dbNode = appNodeToDbNode(node);

  const { error } = await supabase
    .from("nodes")
    .upsert(dbNode, { onConflict: "id" });

  if (error) {
    console.error("Error upserting node:", error);
    return false;
  }

  return true;
};

// Delete a node
export const deleteNode = async (nodeId: string): Promise<boolean> => {
  if (!supabase) return false;

  const { error } = await supabase.from("nodes").delete().eq("id", nodeId);

  if (error) {
    console.error("Error deleting node:", error);
    return false;
  }

  return true;
};

// Sync all nodes (bulk upsert)
export const syncNodes = async (nodes: OrgNode[]): Promise<boolean> => {
  if (!supabase) return false;

  const dbNodes = nodes.map(appNodeToDbNode);

  const { error } = await supabase
    .from("nodes")
    .upsert(dbNodes, { onConflict: "id" });

  if (error) {
    console.error("Error syncing nodes:", error);
    return false;
  }

  return true;
};

// ===== Frames =====

export interface DbFrame {
  id: string;
  label: string | null;
  color: string;
  position_x: number;
  position_y: number;
  width: number;
  height: number;
  linked_to: string[];
  created_at?: string;
  updated_at?: string;
}

export const dbFrameToAppFrame = (dbFrame: DbFrame): Frame => ({
  id: dbFrame.id,
  label: dbFrame.label || undefined,
  color: (dbFrame.color as GroupColor) || "blue",
  position: { x: dbFrame.position_x, y: dbFrame.position_y },
  width: dbFrame.width,
  height: dbFrame.height,
  linkedTo: dbFrame.linked_to || [],
});

export const appFrameToDbFrame = (
  frame: Frame,
): Omit<DbFrame, "created_at" | "updated_at"> => ({
  id: frame.id,
  label: frame.label || null,
  color: frame.color,
  position_x: frame.position.x,
  position_y: frame.position.y,
  width: frame.width,
  height: frame.height,
  linked_to: frame.linkedTo || [],
});

export const fetchFrames = async (): Promise<Frame[]> => {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("frames")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Error fetching frames:", error);
    return [];
  }

  return (data || []).map(dbFrameToAppFrame);
};

export const upsertFrame = async (frame: Frame): Promise<boolean> => {
  if (!supabase) return false;

  const dbFrame = appFrameToDbFrame(frame);

  const { error } = await supabase
    .from("frames")
    .upsert(dbFrame, { onConflict: "id" });

  if (error) {
    console.error("Error upserting frame:", error);
    return false;
  }

  return true;
};

export const deleteFrame = async (frameId: string): Promise<boolean> => {
  if (!supabase) return false;

  const { error } = await supabase.from("frames").delete().eq("id", frameId);

  if (error) {
    console.error("Error deleting frame:", error);
    return false;
  }

  return true;
};

// ===== Tools =====

export interface DbTool {
  id: string;
  name: string;
  description: string;
  url?: string;
  category?: string;
  created_at?: string;
  updated_at?: string;
}

export const dbToolToAppTool = (dbTool: DbTool): Tool => ({
  id: dbTool.id,
  name: dbTool.name,
  description: dbTool.description,
  url: dbTool.url,
  category: dbTool.category,
  createdAt: dbTool.created_at,
  updatedAt: dbTool.updated_at,
});

export const appToolToDbTool = (
  tool: Tool,
): Omit<DbTool, "created_at" | "updated_at"> => ({
  id: tool.id,
  name: tool.name,
  description: tool.description,
  url: tool.url,
  category: tool.category,
});

export const fetchTools = async (): Promise<Tool[]> => {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("tools")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Error fetching tools:", error);
    return [];
  }

  return (data || []).map(dbToolToAppTool);
};

export const upsertTool = async (tool: Tool): Promise<boolean> => {
  if (!supabase) return false;

  const dbTool = appToolToDbTool(tool);

  const { error } = await supabase
    .from("tools")
    .upsert(dbTool, { onConflict: "id" });

  if (error) {
    console.error("Error upserting tool:", error);
    return false;
  }

  return true;
};

export const deleteTool = async (toolId: string): Promise<boolean> => {
  if (!supabase) return false;

  const { error } = await supabase.from("tools").delete().eq("id", toolId);

  if (error) {
    console.error("Error deleting tool:", error);
    return false;
  }

  return true;
};

// ===== Memo Tabs =====

export interface DbMemoTab {
  id: string;
  name: string;
  color: string;
  order_index: number;
  created_at?: string;
  updated_at?: string;
}

export const dbMemoTabToAppMemoTab = (dbTab: DbMemoTab): MemoTab => ({
  id: dbTab.id,
  name: dbTab.name,
  color: (dbTab.color as GroupColor) || "blue",
  order: dbTab.order_index,
  createdAt: dbTab.created_at,
  updatedAt: dbTab.updated_at,
});

export const appMemoTabToDbMemoTab = (
  tab: MemoTab,
): Omit<DbMemoTab, "created_at" | "updated_at"> => ({
  id: tab.id,
  name: tab.name,
  color: tab.color,
  order_index: tab.order,
});

export const fetchMemoTabs = async (): Promise<MemoTab[]> => {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("memo_tabs")
    .select("*")
    .order("order_index", { ascending: true });

  if (error) {
    console.error("Error fetching memo tabs:", error);
    return [];
  }

  return (data || []).map(dbMemoTabToAppMemoTab);
};

export const upsertMemoTab = async (tab: MemoTab): Promise<boolean> => {
  if (!supabase) return false;

  const dbTab = appMemoTabToDbMemoTab(tab);

  const { error } = await supabase
    .from("memo_tabs")
    .upsert(dbTab, { onConflict: "id" });

  if (error) {
    console.error("Error upserting memo tab:", error);
    return false;
  }

  return true;
};

export const deleteMemoTab = async (tabId: string): Promise<boolean> => {
  if (!supabase) return false;

  const { error } = await supabase.from("memo_tabs").delete().eq("id", tabId);

  if (error) {
    console.error("Error deleting memo tab:", error);
    return false;
  }

  return true;
};

// ===== Memos =====

export interface DbMemo {
  id: string;
  tab_id: string;
  title: string;
  content: string;
  order_index: number;
  created_at?: string;
  updated_at?: string;
}

export const dbMemoToAppMemo = (dbMemo: DbMemo): Memo => ({
  id: dbMemo.id,
  tabId: dbMemo.tab_id,
  title: dbMemo.title,
  content: dbMemo.content,
  order: dbMemo.order_index,
  createdAt: dbMemo.created_at,
  updatedAt: dbMemo.updated_at,
});

export const appMemoToDbMemo = (
  memo: Memo,
): Omit<DbMemo, "created_at" | "updated_at"> => ({
  id: memo.id,
  tab_id: memo.tabId,
  title: memo.title,
  content: memo.content,
  order_index: memo.order,
});

export const fetchMemos = async (): Promise<Memo[]> => {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("memos")
    .select("*")
    .order("order_index", { ascending: true });

  if (error) {
    console.error("Error fetching memos:", error);
    return [];
  }

  return (data || []).map(dbMemoToAppMemo);
};

export const fetchMemosByTab = async (tabId: string): Promise<Memo[]> => {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("memos")
    .select("*")
    .eq("tab_id", tabId)
    .order("order_index", { ascending: true });

  if (error) {
    console.error("Error fetching memos by tab:", error);
    return [];
  }

  return (data || []).map(dbMemoToAppMemo);
};

export const upsertMemo = async (memo: Memo): Promise<boolean> => {
  if (!supabase) return false;

  const dbMemo = appMemoToDbMemo(memo);

  const { error } = await supabase
    .from("memos")
    .upsert(dbMemo, { onConflict: "id" });

  if (error) {
    console.error("Error upserting memo:", error);
    return false;
  }

  return true;
};

export const deleteMemo = async (memoId: string): Promise<boolean> => {
  if (!supabase) return false;

  const { error } = await supabase.from("memos").delete().eq("id", memoId);

  if (error) {
    console.error("Error deleting memo:", error);
    return false;
  }

  return true;
};

export const deleteMemosOfTab = async (tabId: string): Promise<boolean> => {
  if (!supabase) return false;

  const { error } = await supabase.from("memos").delete().eq("tab_id", tabId);

  if (error) {
    console.error("Error deleting memos of tab:", error);
    return false;
  }

  return true;
};

// ===== Clients =====

// ===== Client Tabs =====

export interface DbClientTab {
  id: string;
  name: string;
  color: string;
  order_index: number;
  created_at?: string;
  updated_at?: string;
}

export const dbClientTabToAppClientTab = (dbTab: DbClientTab): ClientTab => ({
  id: dbTab.id,
  name: dbTab.name,
  color: (dbTab.color as GroupColor) || "blue",
  order: dbTab.order_index,
  createdAt: dbTab.created_at,
  updatedAt: dbTab.updated_at,
});

export const appClientTabToDbClientTab = (
  tab: ClientTab,
): Omit<DbClientTab, "created_at" | "updated_at"> => ({
  id: tab.id,
  name: tab.name,
  color: tab.color,
  order_index: tab.order,
});

export const fetchClientTabs = async (): Promise<ClientTab[]> => {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("client_tabs")
    .select("*")
    .order("order_index", { ascending: true });

  if (error) {
    console.error("Error fetching client tabs:", error);
    return [];
  }

  return (data || []).map(dbClientTabToAppClientTab);
};

export const upsertClientTab = async (tab: ClientTab): Promise<boolean> => {
  if (!supabase) return false;

  const dbTab = appClientTabToDbClientTab(tab);

  const { error } = await supabase
    .from("client_tabs")
    .upsert(dbTab, { onConflict: "id" });

  if (error) {
    console.error("Error upserting client tab:", error);
    return false;
  }

  return true;
};

export const deleteClientTab = async (tabId: string): Promise<boolean> => {
  if (!supabase) return false;

  const { error } = await supabase.from("client_tabs").delete().eq("id", tabId);

  if (error) {
    console.error("Error deleting client tab:", error);
    return false;
  }

  return true;
};

export const deleteClientsOfTab = async (tabId: string): Promise<boolean> => {
  if (!supabase) return false;

  const { error } = await supabase.from("clients").delete().eq("tab_id", tabId);

  if (error) {
    console.error("Error deleting clients of tab:", error);
    return false;
  }

  return true;
};

// ===== Clients =====

export interface DbClient {
  id: string;
  tab_id: string;
  name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  status: string;
  corporate_client_id: string | null;
  photo_storage_path: string | null;
  photo_storage_path_back: string | null;
  ocr_extracted: Record<string, unknown> | null;
  created_at?: string;
  updated_at?: string;
}

export const dbClientToAppClient = (dbClient: DbClient): Client => ({
  id: dbClient.id,
  tabId: dbClient.tab_id,
  name: dbClient.name,
  contactName: dbClient.contact_name || undefined,
  email: dbClient.email || undefined,
  phone: dbClient.phone || undefined,
  address: dbClient.address || undefined,
  notes: dbClient.notes || undefined,
  status: (dbClient.status as ClientStatus) || "prospect",
  corporateClientId: dbClient.corporate_client_id || undefined,
  photoStoragePath: dbClient.photo_storage_path || undefined,
  photoStoragePathBack: dbClient.photo_storage_path_back || undefined,
  ocrExtracted: dbClient.ocr_extracted || undefined,
  createdAt: dbClient.created_at,
  updatedAt: dbClient.updated_at,
});

export const appClientToDbClient = (
  client: Client,
): Omit<DbClient, "created_at" | "updated_at"> => ({
  id: client.id,
  tab_id: client.tabId,
  name: client.name,
  contact_name: client.contactName || null,
  email: client.email || null,
  phone: client.phone || null,
  address: client.address || null,
  notes: client.notes || null,
  status: client.status,
  corporate_client_id: client.corporateClientId || null,
  photo_storage_path: client.photoStoragePath || null,
  photo_storage_path_back: client.photoStoragePathBack || null,
  ocr_extracted: client.ocrExtracted || null,
});

export const fetchClients = async (): Promise<Client[]> => {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("clients")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching clients:", error);
    return [];
  }

  return (data || []).map(dbClientToAppClient);
};

export const upsertClient = async (client: Client): Promise<boolean> => {
  if (!supabase) return false;

  const dbClient = appClientToDbClient(client);

  const { error } = await supabase
    .from("clients")
    .upsert(dbClient, { onConflict: "id" });

  if (error) {
    console.error("Error upserting client:", error);
    return false;
  }

  return true;
};

export const deleteClient = async (clientId: string): Promise<boolean> => {
  if (!supabase) return false;

  const { error } = await supabase.from("clients").delete().eq("id", clientId);

  if (error) {
    console.error("Error deleting client:", error);
    return false;
  }

  return true;
};

// ===== Project Tabs =====

export interface DbProjectTab {
  id: string;
  name: string;
  color: string;
  parent_project_id?: string | null;
  order_index: number;
  created_at?: string;
  updated_at?: string;
}

export const dbProjectTabToAppProjectTab = (
  dbTab: DbProjectTab,
): ProjectTab => ({
  id: dbTab.id,
  name: dbTab.name,
  color: (dbTab.color as GroupColor) || "blue",
  parentProjectId: dbTab.parent_project_id ?? undefined,
  order: dbTab.order_index,
  createdAt: dbTab.created_at,
  updatedAt: dbTab.updated_at,
});

export const appProjectTabToDbProjectTab = (
  tab: ProjectTab,
): Omit<DbProjectTab, "created_at" | "updated_at"> => {
  const parentId = (tab.parentProjectId ?? "").trim();
  return {
    id: tab.id,
    name: tab.name,
    color: tab.color,
    parent_project_id: parentId ? parentId : null,
    order_index: tab.order,
  };
};

export const fetchProjectTabs = async (): Promise<ProjectTab[]> => {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("project_tabs")
    .select("*")
    .order("order_index", { ascending: true });

  if (error) {
    console.error("Error fetching project tabs:", error);
    return [];
  }

  return (data || []).map(dbProjectTabToAppProjectTab);
};

export const upsertProjectTab = async (tab: ProjectTab): Promise<boolean> => {
  if (!supabase) return false;

  const dbTab = appProjectTabToDbProjectTab(tab);

  const { error } = await supabase
    .from("project_tabs")
    .upsert(dbTab, { onConflict: "id" });

  if (error) {
    console.error("Error upserting project tab:", error);
    return false;
  }

  return true;
};

export const deleteProjectTab = async (tabId: string): Promise<boolean> => {
  if (!supabase) return false;

  const { error } = await supabase
    .from("project_tabs")
    .delete()
    .eq("id", tabId);

  if (error) {
    console.error("Error deleting project tab:", error);
    return false;
  }

  return true;
};

export const deleteProjectsOfTab = async (tabId: string): Promise<boolean> => {
  if (!supabase) return false;

  const { error } = await supabase
    .from("projects")
    .delete()
    .eq("tab_id", tabId);

  if (error) {
    console.error("Error deleting projects of tab:", error);
    return false;
  }

  return true;
};

// ===== Projects =====

export interface DbProject {
  id: string;
  tab_id: string;
  name: string;
  description: string | null;
  status: string;
  client_id: string | null;
  start_date: string | null;
  end_date: string | null;
  budget: number | null;
  budgets: unknown[] | null;
  currency: string | null;
  order_index: number | null;
  is_pinned: boolean | null;
  progress: number | null;
  is_archived: boolean | null;
  created_at?: string;
  updated_at?: string;
}

export const dbProjectToAppProject = (dbProject: DbProject): Project => {
  const budgetUnits: BudgetUnit[] = ["once", "hourly", "monthly", "yearly"];
  const normalizedBudgets = Array.isArray(dbProject.budgets)
    ? dbProject.budgets
        .map((entry): ProjectBudget | null => {
          if (typeof entry === "number" && Number.isFinite(entry)) {
            return { amount: entry, unit: "once" };
          }
          if (entry && typeof entry === "object") {
            const raw = entry as { amount?: unknown; unit?: unknown };
            const amount =
              typeof raw.amount === "number" && Number.isFinite(raw.amount)
                ? raw.amount
                : null;
            if (amount === null) return null;
            const unit =
              typeof raw.unit === "string" &&
              budgetUnits.includes(raw.unit as BudgetUnit)
                ? (raw.unit as BudgetUnit)
                : "once";
            return { amount, unit };
          }
          return null;
        })
        .filter((entry): entry is ProjectBudget => entry !== null)
    : undefined;
  const totalBudget =
    normalizedBudgets && normalizedBudgets.length > 0
      ? normalizedBudgets.reduce((sum, entry) => sum + entry.amount, 0)
      : (dbProject.budget ?? undefined);

  return {
    id: dbProject.id,
    tabId: dbProject.tab_id,
    name: dbProject.name,
    description: dbProject.description || undefined,
    status: (dbProject.status as ProjectStatus) || "planning",
    clientId: dbProject.client_id || undefined,
    startDate: dbProject.start_date || undefined,
    endDate: dbProject.end_date || undefined,
    budget: totalBudget,
    budgets: normalizedBudgets,
    currency: dbProject.currency || undefined,
    isPinned: dbProject.is_pinned ?? false,
    progress: dbProject.progress ?? 0,
    isArchived: dbProject.is_archived ?? false,
    order: dbProject.order_index ?? undefined,
    createdAt: dbProject.created_at,
    updatedAt: dbProject.updated_at,
  };
};

export const appProjectToDbProject = (
  project: Project,
): Omit<DbProject, "created_at" | "updated_at"> => {
  const budgetUnits: BudgetUnit[] = ["once", "hourly", "monthly", "yearly"];
  const normalizedBudgets = Array.isArray(project.budgets)
    ? (project.budgets as unknown[])
        .map((entry): ProjectBudget | null => {
          if (typeof entry === "number" && Number.isFinite(entry)) {
            return { amount: entry, unit: "once" };
          }
          if (entry && typeof entry === "object") {
            const raw = entry as { amount?: unknown; unit?: unknown };
            const amount =
              typeof raw.amount === "number" && Number.isFinite(raw.amount)
                ? raw.amount
                : null;
            if (amount === null) return null;
            const unit =
              typeof raw.unit === "string" &&
              budgetUnits.includes(raw.unit as BudgetUnit)
                ? (raw.unit as BudgetUnit)
                : "once";
            return { amount, unit };
          }
          return null;
        })
        .filter((entry): entry is ProjectBudget => entry !== null)
    : undefined;
  const totalBudget =
    normalizedBudgets && normalizedBudgets.length > 0
      ? normalizedBudgets.reduce((sum, entry) => sum + entry.amount, 0)
      : project.budget;

  return {
    id: project.id,
    tab_id: project.tabId,
    name: project.name,
    description: project.description || null,
    status: project.status,
    client_id: project.clientId || null,
    start_date: project.startDate || null,
    end_date: project.endDate || null,
    budget: totalBudget ?? null,
    budgets:
      normalizedBudgets && normalizedBudgets.length > 0
        ? normalizedBudgets
        : null,
    currency: project.currency || null,
    order_index: project.order ?? null,
    is_pinned: project.isPinned ?? false,
    progress: project.progress ?? 0,
    is_archived: project.isArchived ?? false,
  };
};

export const fetchProjects = async (): Promise<Project[]> => {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .order("order_index", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching projects:", error);
    return [];
  }

  return (data || []).map(dbProjectToAppProject);
};

export const upsertProject = async (project: Project): Promise<boolean> => {
  if (!supabase) return false;

  const dbProject = appProjectToDbProject(project);

  const { error } = await supabase
    .from("projects")
    .upsert(dbProject, { onConflict: "id" });

  if (error) {
    console.error("Error upserting project:", error);
    return false;
  }

  return true;
};

export const deleteProject = async (projectId: string): Promise<boolean> => {
  if (!supabase) return false;

  const { error } = await supabase
    .from("projects")
    .delete()
    .eq("id", projectId);

  if (error) {
    console.error("Error deleting project:", error);
    return false;
  }

  return true;
};
