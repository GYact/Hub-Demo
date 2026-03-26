import {
  appMemoTabToDbMemoTab,
  appMemoToDbMemo,
  appNodeToDbNode,
  appProjectTabToDbProjectTab,
  appProjectToDbProject,
  appClientTabToDbClientTab,
  appClientToDbClient,
  appToolToDbTool,
} from "./supabase";
import type {
  Memo,
  MemoTab,
  OrgNode,
  Project,
  ProjectTab,
  Client,
  ClientTab,
  Tool,
  Subscription,
  Asset,
} from "../types";
import { offlineDb } from "./offlineDb";
import { upsertLocalRow } from "./offlineStore";

const nowIso = () => new Date().toISOString();

const safeJsonParse = <T>(value: string | null): T | null => {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
};

export const runLocalStorageMigration = async (userId: string | null) => {
  const flagV1 = await offlineDb.meta.get("migration_v1_done");

  if (!flagV1) {
    const withUser = <T extends Record<string, unknown>>(row: T) => ({
      ...row,
      user_id: row.user_id ?? userId ?? row.user_id,
      created_at: row.created_at ?? nowIso(),
      updated_at: row.updated_at ?? nowIso(),
    });

    const migrateList = async <T extends Record<string, unknown>>(
      table: string,
      items: T[],
    ) => {
      for (const item of items) {
        await upsertLocalRow(table, withUser(item));
      }
    };

    // AI shortcuts and provider
    const aiShortcuts = safeJsonParse<string[]>(
      localStorage.getItem("hub-ai-shortcuts"),
    );
    if (aiShortcuts) {
      const validShortcuts = aiShortcuts.filter((l) => l.trim());
      for (const [index, label] of validShortcuts.entries()) {
        await upsertLocalRow(
          "ai_shortcuts",
          withUser({
            id: `${userId ?? "local"}-shortcut-${index}`,
            label,
            order_index: index,
          }),
        );
      }
    }

    const aiProvider = localStorage.getItem("hub-ai-provider");
    if (aiProvider) {
      await upsertLocalRow("user_settings", {
        id: `${userId ?? "local"}:ai_provider`,
        user_id: userId ?? undefined,
        key: "ai_provider",
        value: aiProvider,
      });
    }

    const currentSessionId = localStorage.getItem("ai-chat-current-session");
    if (currentSessionId) {
      await upsertLocalRow("user_settings", {
        id: `${userId ?? "local"}:ai_current_session_id`,
        user_id: userId ?? undefined,
        key: "ai_current_session_id",
        value: currentSessionId,
      });
    }

    const viewMode = localStorage.getItem("hub-org-view-mode");
    if (viewMode) {
      await upsertLocalRow("user_settings", {
        id: `${userId ?? "local"}:org_view_mode`,
        user_id: userId ?? undefined,
        key: "org_view_mode",
        value: viewMode,
      });
    }

    const workspaceCenter = safeJsonParse<{ x: number; y: number }>(
      localStorage.getItem("hub-workspace-center-point"),
    );
    if (workspaceCenter) {
      await upsertLocalRow("user_settings", {
        id: `${userId ?? "local"}:workspace_center_point`,
        user_id: userId ?? undefined,
        key: "workspace_center_point",
        value: workspaceCenter,
      });
    }

    // User preferences (sidebar + mobile nav)
    const sidebarOrder = safeJsonParse<string[]>(
      localStorage.getItem("hub_sidebar_order"),
    );
    const mobileNavIds = safeJsonParse<string[]>(
      localStorage.getItem("hub-mobile-nav-config"),
    );
    const mobileMoreIds = safeJsonParse<string[]>(
      localStorage.getItem("hub-mobile-more-config"),
    );
    if (sidebarOrder || mobileNavIds || mobileMoreIds) {
      await upsertLocalRow(
        "user_preferences",
        withUser({
          id: userId ?? "local",
          user_id: userId ?? undefined,
          sidebar_order: sidebarOrder ?? null,
          mobile_nav_ids: mobileNavIds ?? null,
          mobile_more_ids: mobileMoreIds ?? null,
        }),
      );
    }

    // AI sessions and messages
    const aiSessions = safeJsonParse<
      Array<{
        id: string;
        title: string;
        messages: {
          id: string;
          role: "user" | "assistant";
          content: string;
          timestamp: string;
        }[];
        createdAt: string;
        updatedAt: string;
      }>
    >(localStorage.getItem("ai-chat-sessions"));

    if (aiSessions) {
      for (const session of aiSessions) {
        await upsertLocalRow(
          "ai_sessions",
          withUser({
            id: session.id,
            title: session.title,
            created_at: session.createdAt ?? nowIso(),
            updated_at: session.updatedAt ?? nowIso(),
          }),
        );

        for (const message of session.messages || []) {
          await upsertLocalRow(
            "ai_messages",
            withUser({
              id: message.id,
              session_id: session.id,
              role: message.role,
              content: message.content,
              created_at: message.timestamp ?? nowIso(),
              updated_at: message.timestamp ?? nowIso(),
            }),
          );
        }
      }
    }

    // Memos
    const memoTabs = safeJsonParse<MemoTab[]>(
      localStorage.getItem("hub-memoTabs"),
    );
    if (memoTabs) {
      for (const tab of memoTabs) {
        await upsertLocalRow("memo_tabs", withUser(appMemoTabToDbMemoTab(tab)));
      }
    }

    const memos = safeJsonParse<Memo[]>(localStorage.getItem("hub-memos"));
    if (memos) {
      for (const memo of memos) {
        await upsertLocalRow("memos", withUser(appMemoToDbMemo(memo)));
      }
    }

    // Projects
    const projectTabs = safeJsonParse<ProjectTab[]>(
      localStorage.getItem("hub-projectTabs"),
    );
    if (projectTabs) {
      for (const tab of projectTabs) {
        await upsertLocalRow(
          "project_tabs",
          withUser(appProjectTabToDbProjectTab(tab)),
        );
      }
    }

    const projects = safeJsonParse<Project[]>(
      localStorage.getItem("hub-projects"),
    );
    if (projects) {
      for (const project of projects) {
        await upsertLocalRow(
          "projects",
          withUser(appProjectToDbProject(project)),
        );
      }
    }

    // Nodes
    const nodes = safeJsonParse<OrgNode[]>(
      localStorage.getItem("hub-workspace-nodes-v3"),
    );
    if (nodes) {
      for (const node of nodes) {
        await upsertLocalRow("nodes", withUser(appNodeToDbNode(node)));
      }
    }

    // Clients
    const clientTabs = safeJsonParse<ClientTab[]>(
      localStorage.getItem("hub-clientTabs"),
    );
    if (clientTabs) {
      for (const tab of clientTabs) {
        await upsertLocalRow(
          "client_tabs",
          withUser(appClientTabToDbClientTab(tab)),
        );
      }
    }

    const clients = safeJsonParse<Client[]>(
      localStorage.getItem("hub-clients"),
    );
    if (clients) {
      for (const client of clients) {
        await upsertLocalRow("clients", withUser(appClientToDbClient(client)));
      }
    }

    // Tools
    const tools = safeJsonParse<Tool[]>(localStorage.getItem("hub-tools"));
    if (tools) {
      for (const tool of tools) {
        await upsertLocalRow("tools", withUser(appToolToDbTool(tool)));
      }
    }

    // Money
    const subscriptions = safeJsonParse<Subscription[]>(
      localStorage.getItem("hub-subscriptions"),
    );
    if (subscriptions) {
      for (const sub of subscriptions) {
        await upsertLocalRow(
          "subscriptions",
          withUser({
            id: sub.id,
            name: sub.name,
            amount: sub.amount,
            currency: sub.currency,
            billing_cycle: sub.billingCycle,
            next_billing_date: sub.nextBillingDate ?? null,
            category: sub.category,
            status: sub.status,
            notes: sub.notes,
            order_index: sub.order ?? null,
          }),
        );
      }
    }

    const assets = safeJsonParse<Asset[]>(localStorage.getItem("hub-assets"));
    if (assets) {
      for (const asset of assets) {
        await upsertLocalRow(
          "assets",
          withUser({
            id: asset.id,
            name: asset.name,
            asset_type: asset.assetType,
            amount: asset.amount,
            currency: asset.currency,
            notes: asset.notes,
            order_index: asset.order ?? null,
          }),
        );
      }
    }

    // Profile
    const profile = safeJsonParse<Record<string, unknown>>(
      localStorage.getItem("hub-workspace-profile"),
    );
    if (profile) {
      await upsertLocalRow("profiles", withUser(profile));
    }

    // CRUD-based data (affiliations/educations/work experiences/skills/certs/languages)
    const affiliations = safeJsonParse<Record<string, unknown>[]>(
      localStorage.getItem("hub-affiliations"),
    );
    if (affiliations) await migrateList("affiliations", affiliations);

    const educations = safeJsonParse<Record<string, unknown>[]>(
      localStorage.getItem("hub-workspace-educations"),
    );
    if (educations) await migrateList("educations", educations);

    const workExperiences = safeJsonParse<Record<string, unknown>[]>(
      localStorage.getItem("hub-workspace-work-experiences"),
    );
    if (workExperiences) await migrateList("work_experiences", workExperiences);

    const skills = safeJsonParse<Record<string, unknown>[]>(
      localStorage.getItem("hub-workspace-skills"),
    );
    if (skills) await migrateList("skills", skills);

    const certifications = safeJsonParse<Record<string, unknown>[]>(
      localStorage.getItem("hub-workspace-certifications"),
    );
    if (certifications) await migrateList("certifications", certifications);

    const languages = safeJsonParse<Record<string, unknown>[]>(
      localStorage.getItem("hub-workspace-languages"),
    );
    if (languages) await migrateList("languages", languages);

    // Google task/calendar preferences
    const starredTasks =
      safeJsonParse<string[]>(localStorage.getItem("hub_starred_tasks")) ??
      safeJsonParse<string[]>(localStorage.getItem("hub_google_tasks_starred"));
    if (starredTasks) {
      await upsertLocalRow("user_settings", {
        id: `${userId ?? "local"}:google_tasks_starred`,
        user_id: userId ?? undefined,
        key: "google_tasks_starred",
        value: starredTasks,
      });
    }

    const taskExtras =
      safeJsonParse<Record<string, unknown>>(
        localStorage.getItem("hub_task_extras"),
      ) ??
      safeJsonParse<Record<string, unknown>>(
        localStorage.getItem("hub_google_tasks_extras"),
      );
    if (taskExtras) {
      await upsertLocalRow("user_settings", {
        id: `${userId ?? "local"}:google_tasks_extras`,
        user_id: userId ?? undefined,
        key: "google_tasks_extras",
        value: taskExtras,
      });
    }

    const taskListOrder =
      safeJsonParse<string[]>(localStorage.getItem("hub_task_list_order")) ??
      safeJsonParse<string[]>(
        localStorage.getItem("hub_google_tasks_list_order"),
      );
    if (taskListOrder) {
      await upsertLocalRow("user_settings", {
        id: `${userId ?? "local"}:google_tasks_list_order`,
        user_id: userId ?? undefined,
        key: "google_tasks_list_order",
        value: taskListOrder,
      });
    }

    const selectedCalendars = safeJsonParse<string[]>(
      localStorage.getItem("hub_selected_calendar_ids"),
    );
    if (selectedCalendars) {
      await upsertLocalRow("user_settings", {
        id: `${userId ?? "local"}:google_calendar_selected_ids`,
        user_id: userId ?? undefined,
        key: "google_calendar_selected_ids",
        value: selectedCalendars,
      });
    }

    // Clean up old localStorage keys after successful migration
    const keysToRemove = [
      "hub-ai-shortcuts",
      "hub-ai-provider",
      "ai-chat-current-session",
      "ai-chat-sessions",
      "hub-org-view-mode",
      "hub-workspace-center-point",
      "hub_sidebar_order",
      "hub-mobile-nav-config",
      "hub-mobile-more-config",
      "hub-memoTabs",
      "hub-memos",
      "hub-projectTabs",
      "hub-projects",
      "hub-clientTabs",
      "hub-clients",
      "hub-tools",
      "hub-subscriptions",
      "hub-assets",
      "hub-workspace-nodes-v3",
      "hub-workspace-profile",
      "hub-affiliations",
      "hub-workspace-educations",
      "hub-workspace-work-experiences",
      "hub-workspace-skills",
      "hub-workspace-certifications",
      "hub-workspace-languages",
      "hub_starred_tasks",
      "hub_google_tasks_starred",
      "hub_task_extras",
      "hub_google_tasks_extras",
      "hub_task_list_order",
      "hub_google_tasks_list_order",
      "hub_selected_calendar_ids",
    ];

    keysToRemove.forEach((key) => {
      try {
        localStorage.removeItem(key);
      } catch (err) {
        console.warn(`Failed to remove localStorage key: ${key}`, err);
      }
    });

    await offlineDb.meta.put({ key: "migration_v1_done", value: nowIso() });
  }

  const flagV2 = await offlineDb.meta.get("migration_v2_done");
  if (flagV2) return;

  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const isUuid = (value: string) => uuidRegex.test(value);
  const generateUuid = () => {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return crypto.randomUUID();
    }
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
      const rand = (Math.random() * 16) | 0;
      const value = char === "x" ? rand : (rand & 0x3) | 0x8;
      return value.toString(16);
    });
  };

  const normalizeUuidTable = async (
    table: "subscriptions" | "assets" | "journal_entries",
  ) => {
    const rows = await offlineDb.table(table).toArray();
    for (const row of rows) {
      const id = String((row as Record<string, unknown>).id ?? "");
      if (!id || isUuid(id)) continue;
      await offlineDb.table(table).delete(id);
      const nextRow = {
        ...(row as Record<string, unknown>),
        id: generateUuid(),
      };
      await upsertLocalRow(table, nextRow);
    }

    const outboxEntries = await offlineDb.outbox
      .where("table")
      .equals(table)
      .toArray();
    for (const entry of outboxEntries) {
      if (!entry.record_id || isUuid(entry.record_id)) continue;
      await offlineDb.outbox.delete(entry.id as number);
    }
  };

  await normalizeUuidTable("subscriptions");
  await normalizeUuidTable("assets");
  await normalizeUuidTable("journal_entries");

  await offlineDb.meta.put({ key: "migration_v2_done", value: nowIso() });
};
