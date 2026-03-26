import Dexie, { Table } from "dexie";

export interface OutboxEntry {
  id?: number;
  table: string;
  operation: "upsert" | "delete";
  record_id: string;
  payload?: Record<string, unknown>;
  created_at: string;
}

export interface MetaEntry {
  key: string;
  value: string;
}

export interface UserSettingRow {
  id: string;
  user_id?: string;
  key: string;
  value: unknown;
  created_at?: string;
  updated_at?: string;
}

export interface DataCatalogItemRow {
  id: string;
  user_id?: string;
  label: string;
  description?: string | null;
  link?: string | null;
  order_index: number;
  created_at?: string;
  updated_at?: string;
}

export interface DeviceRow {
  id: string;
  user_id?: string;
  name: string;
  description?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface AiShortcutRow {
  id: string;
  user_id?: string;
  label: string;
  order_index: number;
  created_at?: string;
  updated_at?: string;
}

export interface TaskDividerRow {
  id: string;
  user_id?: string;
  list_id: string;
  position: number;
  color: string;
  created_at?: string;
  updated_at?: string;
}

export interface MemoTrashRow {
  id: string;
  user_id?: string;
  tab_id: string;
  title: string;
  content: string;
  order_index: number;
  deleted_at: string;
  original_tab_id: string;
  original_tab_name?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface AiSessionRow {
  id: string;
  user_id?: string;
  title: string;
  created_at?: string;
  updated_at?: string;
}

export interface AiMessageRow {
  id: string;
  session_id: string;
  user_id?: string;
  role: "user" | "assistant";
  content: string;
  created_at?: string;
  updated_at?: string;
}

export interface TaskListRow {
  id: string;
  user_id?: string;
  title: string;
  position: number;
  created_at?: string;
  updated_at?: string;
}

export interface TaskRow {
  id: string;
  user_id?: string;
  list_id: string;
  parent_id?: string;
  title: string;
  notes?: string;
  status: "needsAction" | "completed";
  due_date?: string;
  due_time?: string;
  completed_at?: string;
  position: number;
  is_starred: boolean;
  repeat_type?: "none" | "daily" | "weekly" | "monthly" | "yearly";
  created_at?: string;
  updated_at?: string;
}

export interface MenuItemRow {
  id: string;
  user_id?: string;
  path: string;
  icon: string;
  label: string;
  color_class: string;
  hover_class: string;
  order_index: number;
  is_visible: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface AiAutomationRow {
  id: string;
  user_id?: string;
  name: string;
  description?: string | null;
  automation_type:
    | "paper_search"
    | "news_collection"
    | "custom"
    | "hp_post"
    | "event_discovery"
    | "stock_analysis"
    | "event_collect"
    | "ai_news_digest";
  config: Record<string, unknown>;
  schedule: "hourly" | "daily" | "weekly" | "monthly" | "manual";
  scheduled_time?: string | null; // HH:MM format
  ai_model: "gemini" | "openai" | "anthropic" | "perplexity";
  enabled: boolean;
  last_run_at?: string | null;
  last_run_status?: "success" | "error" | "running" | "pending" | null;
  last_run_result?: Record<string, unknown> | null;
  linked_node_id?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface AiAutomationRunRow {
  id: string;
  automation_id: string;
  user_id?: string;
  status: "success" | "error" | "running" | "pending";
  result?: Record<string, unknown> | null;
  error_message?: string | null;
  started_at: string;
  completed_at?: string | null;
}

export interface AiNotificationRow {
  id: string;
  user_id?: string;
  category_id?: string | null;
  source: "automation" | "webhook" | "system";
  priority: "low" | "medium" | "high" | "urgent";
  title: string;
  body: string;
  metadata?: Record<string, unknown> | null;
  is_read: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface MediaFeedItemRow {
  id: string;
  user_id?: string;
  category_id?: string | null;
  source: "slack" | "rss" | "x";
  priority: "low" | "medium" | "high" | "urgent";
  title: string;
  body: string;
  metadata?: Record<string, unknown> | null;
  is_read: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface GoogleGmailMessageRow {
  user_id: string;
  message_id: string;
  thread_id?: string | null;
  subject?: string | null;
  snippet?: string | null;
  sender?: string | null;
  recipient?: string | null;
  cc?: string | null;
  date?: string | null;
  labels?: string[];
  is_unread: boolean;
  is_starred: boolean;
  is_read: boolean;
  history_id?: string | null;
  size_estimate?: number | null;
  created_at?: string;
  updated_at?: string;
}

export interface AiNotificationCategoryRow {
  id: string;
  user_id?: string;
  name: string;
  color: string;
  icon?: string | null;
  order_index: number;
  created_at?: string;
  updated_at?: string;
}

export interface AiNotificationApiKeyRow {
  id: string;
  user_id?: string;
  name: string;
  key_hash: string;
  key_prefix: string;
  is_active: boolean;
  last_used_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface SlackIntegrationRow {
  id: string;
  user_id?: string;
  team_id: string;
  team_name: string;
  bot_token: string;
  channel_filters: Record<string, unknown>;
  default_category_id?: string | null;
  sync_state?: Record<string, unknown>;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface RssFeedRow {
  id: string;
  user_id?: string;
  name: string;
  url: string;
  category?: string | null;
  is_active: boolean;
  last_fetched_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface XSourceRow {
  id: string;
  user_id?: string;
  name: string;
  source_type: "account" | "keyword";
  query: string;
  category?: string | null;
  is_active: boolean;
  last_fetched_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface UserGoogleTokenRow {
  id: string;
  user_id?: string;
  refresh_token: string;
  access_token?: string | null;
  token_expires_at?: string | null;
  scopes?: string | null;
  sync_state?: Record<string, unknown> | null;
  is_valid: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface GoogleCalendarEventRow {
  user_id: string;
  event_id: string;
  calendar_id?: string | null;
  calendar_name?: string | null;
  summary?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  location?: string | null;
  description?: string | null;
  html_link?: string | null;
  hangout_link?: string | null;
  status?: string | null;
  attendees?: unknown[];
  created_at?: string;
  updated_at?: string;
}

export interface SwitchBotStatusHistoryRow {
  id: string;
  user_id?: string;
  device_id: string;
  device_name?: string | null;
  device_type?: string | null;
  status: Record<string, unknown>;
  recorded_at: string;
}

export interface InvoiceRow {
  id: string;
  user_id?: string;
  invoice_number: string;
  client_id?: string | null;
  project_id?: string | null;
  issue_date?: string | null;
  due_date?: string | null;
  paid_date?: string | null;
  amount: number;
  currency: string;
  status: string;
  category?: string | null;
  items?: unknown;
  tax_rate?: number | null;
  tax_included?: boolean | null;
  document_type?: string;
  pdf_storage_path?: string | null;
  ocr_extracted?: Record<string, unknown>;
  notes: string;
  order_index?: number | null;
  repeat_type?: string;
  repeat_next_date?: string | null;
  repeat_source_id?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface ExpenseRow {
  id: string;
  user_id?: string;
  title: string;
  amount: number;
  currency: string;
  expense_date?: string | null;
  category: string;
  client_id?: string | null;
  project_id?: string | null;
  receipt_storage_path?: string | null;
  ocr_extracted?: Record<string, unknown>;
  notes: string;
  order_index?: number | null;
  created_at?: string;
  updated_at?: string;
}

export interface MoneyDocumentRow {
  id: string;
  user_id?: string;
  title: string;
  document_type: string;
  tags: string[];
  storage_path?: string | null;
  file_name?: string | null;
  file_size?: number | null;
  mime_type?: string | null;
  ocr_extracted?: Record<string, unknown>;
  notes: string;
  order_index?: number | null;
  created_at?: string;
  updated_at?: string;
}

export interface HealthMealRow {
  id: string;
  user_id?: string;
  meal_type: string;
  photo_url?: string | null;
  eaten_at: string;
  calories?: number | null;
  protein_g?: number | null;
  carbs_g?: number | null;
  fat_g?: number | null;
  fiber_g?: number | null;
  nutrients?: Record<string, unknown> | null;
  items?: unknown[] | null;
  ai_raw?: Record<string, unknown> | null;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface HealthSupplementRow {
  id: string;
  user_id?: string;
  name: string;
  brand?: string | null;
  photo_url?: string | null;
  dosage?: string | null;
  frequency: string;
  nutrients?: Record<string, unknown> | null;
  active: boolean;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface PendingUploadRow {
  id?: number;
  user_id: string;
  bucket: string;
  storage_path: string;
  table_name: string;
  record_id: string;
  field_name: string;
  file_data: ArrayBuffer;
  mime_type: string;
  created_at: string;
}

export interface InvestPortfolioRow {
  id: string;
  user_id?: string;
  name: string;
  description: string;
  currency: string;
  order_index?: number | null;
  created_at?: string;
  updated_at?: string;
}

export interface InvestHoldingRow {
  id: string;
  user_id?: string;
  portfolio_id: string;
  symbol: string;
  name: string;
  market: string;
  quantity: number;
  avg_cost: number;
  currency: string;
  notes: string;
  order_index?: number | null;
  created_at?: string;
  updated_at?: string;
}

export interface InvestWatchlistRow {
  id: string;
  user_id?: string;
  symbol: string;
  name: string;
  market: string;
  notes: string;
  order_index?: number | null;
  created_at?: string;
  updated_at?: string;
}

export interface InvestTransactionRow {
  id: string;
  user_id?: string;
  portfolio_id: string;
  symbol: string;
  name: string;
  market: string;
  type: string;
  quantity: number;
  price: number;
  fee: number;
  currency: string;
  notes: string;
  transacted_at: string;
  created_at?: string;
  updated_at?: string;
}

export interface InvestAlertRow {
  id: string;
  user_id?: string;
  symbol: string;
  name: string;
  market: string;
  target_price: number;
  condition: string;
  enabled: boolean;
  triggered_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface InvestChartDrawingRow {
  id: string;
  user_id?: string;
  symbol: string;
  tool: string;
  points: string; // JSON stringified DrawingPoint[]
  color: string;
  label: string;
  note: string;
  line_width: number;
  line_style: string;
  visible: boolean;
  created_at?: string;
  updated_at?: string;
}

class HubOfflineDB extends Dexie {
  nodes!: Table<Record<string, unknown>, string>;
  frames!: Table<Record<string, unknown>, string>;
  tools!: Table<Record<string, unknown>, string>;
  memo_tabs!: Table<Record<string, unknown>, string>;
  memos!: Table<Record<string, unknown>, string>;
  client_tabs!: Table<Record<string, unknown>, string>;
  clients!: Table<Record<string, unknown>, string>;
  project_tabs!: Table<Record<string, unknown>, string>;
  projects!: Table<Record<string, unknown>, string>;
  affiliations!: Table<Record<string, unknown>, string>;
  work_experiences!: Table<Record<string, unknown>, string>;
  educations!: Table<Record<string, unknown>, string>;
  skills!: Table<Record<string, unknown>, string>;
  certifications!: Table<Record<string, unknown>, string>;
  languages!: Table<Record<string, unknown>, string>;
  subscriptions!: Table<Record<string, unknown>, string>;
  assets!: Table<Record<string, unknown>, string>;
  journal_entries!: Table<Record<string, unknown>, string>;
  profiles!: Table<Record<string, unknown>, string>;
  user_preferences!: Table<Record<string, unknown>, string>;
  user_settings!: Table<UserSettingRow, string>;
  data_catalog_items!: Table<DataCatalogItemRow, string>;
  devices!: Table<DeviceRow, string>;
  ai_shortcuts!: Table<AiShortcutRow, string>;
  task_dividers!: Table<TaskDividerRow, string>;
  memo_trash!: Table<MemoTrashRow, string>;
  ai_sessions!: Table<AiSessionRow, string>;
  ai_messages!: Table<AiMessageRow, string>;
  ai_automations!: Table<AiAutomationRow, string>;
  ai_automation_runs!: Table<AiAutomationRunRow, string>;
  ai_notifications!: Table<AiNotificationRow, string>;
  ai_notification_categories!: Table<AiNotificationCategoryRow, string>;
  ai_notification_api_keys!: Table<AiNotificationApiKeyRow, string>;
  slack_integrations!: Table<SlackIntegrationRow, string>;
  rss_feeds!: Table<RssFeedRow, string>;
  x_sources!: Table<XSourceRow, string>;
  media_feed_items!: Table<MediaFeedItemRow, string>;
  google_gmail_messages!: Table<GoogleGmailMessageRow, string>;
  user_google_tokens!: Table<UserGoogleTokenRow, string>;
  google_calendar_events!: Table<GoogleCalendarEventRow, string>;
  switchbot_status_history!: Table<SwitchBotStatusHistoryRow, string>;
  task_lists!: Table<TaskListRow, string>;
  tasks!: Table<TaskRow, string>;
  menu_items!: Table<MenuItemRow, string>;
  invoices!: Table<InvoiceRow, string>;
  expenses!: Table<ExpenseRow, string>;
  money_documents!: Table<MoneyDocumentRow, string>;
  health_meals!: Table<HealthMealRow, string>;
  health_supplements!: Table<HealthSupplementRow, string>;
  invest_portfolios!: Table<InvestPortfolioRow, string>;
  invest_holdings!: Table<InvestHoldingRow, string>;
  invest_watchlist!: Table<InvestWatchlistRow, string>;
  invest_transactions!: Table<InvestTransactionRow, string>;
  invest_alerts!: Table<InvestAlertRow, string>;
  invest_chart_drawings!: Table<InvestChartDrawingRow, string>;
  location_logs!: Table<Record<string, unknown>, string>;
  pending_uploads!: Table<PendingUploadRow, number>;
  outbox!: Table<OutboxEntry, number>;
  meta!: Table<MetaEntry, string>;

  constructor() {
    super("hub_offline");
    this.version(1).stores({
      nodes: "id, user_id, updated_at",
      frames: "id, user_id, updated_at",
      tools: "id, user_id, updated_at",
      memo_tabs: "id, user_id, order_index, updated_at",
      memos: "id, user_id, tab_id, order_index, updated_at",
      client_tabs: "id, user_id, order_index, updated_at",
      clients: "id, user_id, tab_id, updated_at",
      project_tabs: "id, user_id, order_index, updated_at",
      projects: "id, user_id, tab_id, updated_at",
      affiliations: "id, user_id, order_index, updated_at",
      work_experiences: "id, user_id, order_index, updated_at",
      educations: "id, user_id, order_index, updated_at",
      skills: "id, user_id, order_index, updated_at",
      certifications: "id, user_id, order_index, updated_at",
      languages: "id, user_id, order_index, updated_at",
      subscriptions: "id, user_id, order_index, updated_at",
      assets: "id, user_id, order_index, updated_at",
      journal_entries: "id, user_id, entry_date, updated_at",
      profiles: "id, updated_at",
      user_preferences: "id, user_id, updated_at",
      user_settings: "id, user_id, key, updated_at",
      ai_sessions: "id, user_id, updated_at",
      ai_messages: "id, user_id, session_id, updated_at",
      task_lists: "id, user_id, position, updated_at",
      tasks:
        "id, user_id, list_id, parent_id, status, due_date, position, is_starred, updated_at",
      menu_items: "id, user_id, order_index, updated_at",
      outbox: "++id, table, record_id, created_at",
      meta: "key",
    });
    this.version(2).stores({
      nodes: "id, user_id, updated_at",
      frames: "id, user_id, updated_at",
      tools: "id, user_id, updated_at",
      memo_tabs: "id, user_id, order_index, updated_at",
      memos: "id, user_id, tab_id, order_index, updated_at",
      client_tabs: "id, user_id, order_index, updated_at",
      clients: "id, user_id, tab_id, updated_at",
      project_tabs: "id, user_id, order_index, updated_at",
      projects: "id, user_id, tab_id, updated_at",
      affiliations: "id, user_id, order_index, updated_at",
      work_experiences: "id, user_id, order_index, updated_at",
      educations: "id, user_id, order_index, updated_at",
      skills: "id, user_id, order_index, updated_at",
      certifications: "id, user_id, order_index, updated_at",
      languages: "id, user_id, order_index, updated_at",
      subscriptions: "id, user_id, order_index, updated_at",
      assets: "id, user_id, order_index, updated_at",
      journal_entries: "id, user_id, entry_date, updated_at",
      profiles: "id, updated_at",
      user_preferences: "id, user_id, updated_at",
      user_settings: "id, user_id, key, updated_at",
      data_catalog_items: "id, user_id, order_index, updated_at",
      devices: "id, user_id, updated_at",
      ai_shortcuts: "id, user_id, order_index, updated_at",
      task_dividers: "id, user_id, list_id, position, updated_at",
      memo_trash: "id, user_id, deleted_at, updated_at",
      ai_sessions: "id, user_id, updated_at",
      ai_messages: "id, user_id, session_id, updated_at",
      task_lists: "id, user_id, position, updated_at",
      tasks:
        "id, user_id, list_id, parent_id, status, due_date, position, is_starred, updated_at",
      menu_items: "id, user_id, order_index, updated_at",
      outbox: "++id, table, record_id, created_at",
      meta: "key",
    });
    this.version(3).stores({
      nodes: "id, user_id, updated_at",
      frames: "id, user_id, updated_at",
      tools: "id, user_id, updated_at",
      memo_tabs: "id, user_id, order_index, updated_at",
      memos: "id, user_id, tab_id, order_index, updated_at",
      client_tabs: "id, user_id, order_index, updated_at",
      clients: "id, user_id, tab_id, updated_at",
      project_tabs: "id, user_id, order_index, updated_at",
      projects: "id, user_id, tab_id, updated_at",
      affiliations: "id, user_id, order_index, updated_at",
      work_experiences: "id, user_id, order_index, updated_at",
      educations: "id, user_id, order_index, updated_at",
      skills: "id, user_id, order_index, updated_at",
      certifications: "id, user_id, order_index, updated_at",
      languages: "id, user_id, order_index, updated_at",
      subscriptions: "id, user_id, order_index, updated_at",
      assets: "id, user_id, order_index, updated_at",
      journal_entries: "id, user_id, entry_date, updated_at",
      profiles: "id, updated_at",
      user_preferences: "id, user_id, updated_at",
      user_settings: "id, user_id, key, updated_at",
      data_catalog_items: "id, user_id, order_index, updated_at",
      devices: "id, user_id, updated_at",
      ai_shortcuts: "id, user_id, order_index, updated_at",
      task_dividers: "id, user_id, list_id, position, updated_at",
      memo_trash: "id, user_id, deleted_at, updated_at",
      ai_sessions: "id, user_id, updated_at",
      ai_messages: "id, user_id, session_id, updated_at",
      ai_automations: "id, user_id, automation_type, enabled, updated_at",
      ai_automation_runs: "id, user_id, automation_id, status, started_at",
      task_lists: "id, user_id, position, updated_at",
      tasks:
        "id, user_id, list_id, parent_id, status, due_date, position, is_starred, updated_at",
      menu_items: "id, user_id, order_index, updated_at",
      outbox: "++id, table, record_id, created_at",
      meta: "key",
    });
    this.version(4).stores({
      nodes: "id, user_id, updated_at",
      frames: "id, user_id, updated_at",
      tools: "id, user_id, updated_at",
      memo_tabs: "id, user_id, order_index, updated_at",
      memos: "id, user_id, tab_id, order_index, updated_at",
      client_tabs: "id, user_id, order_index, updated_at",
      clients: "id, user_id, tab_id, updated_at",
      project_tabs: "id, user_id, order_index, updated_at",
      projects: "id, user_id, tab_id, updated_at",
      affiliations: "id, user_id, order_index, updated_at",
      work_experiences: "id, user_id, order_index, updated_at",
      educations: "id, user_id, order_index, updated_at",
      skills: "id, user_id, order_index, updated_at",
      certifications: "id, user_id, order_index, updated_at",
      languages: "id, user_id, order_index, updated_at",
      subscriptions: "id, user_id, order_index, updated_at",
      assets: "id, user_id, order_index, updated_at",
      journal_entries: "id, user_id, entry_date, updated_at",
      profiles: "id, updated_at",
      user_preferences: "id, user_id, updated_at",
      user_settings: "id, user_id, key, updated_at",
      data_catalog_items: "id, user_id, order_index, updated_at",
      devices: "id, user_id, updated_at",
      ai_shortcuts: "id, user_id, order_index, updated_at",
      task_dividers: "id, user_id, list_id, position, updated_at",
      memo_trash: "id, user_id, deleted_at, updated_at",
      ai_sessions: "id, user_id, updated_at",
      ai_messages: "id, user_id, session_id, updated_at",
      ai_automations: "id, user_id, automation_type, enabled, updated_at",
      ai_automation_runs: "id, user_id, automation_id, status, started_at",
      ai_notifications:
        "id, user_id, category_id, source, priority, is_read, created_at, updated_at",
      ai_notification_categories: "id, user_id, order_index, updated_at",
      ai_notification_api_keys: "id, user_id, key_hash, is_active, updated_at",
      slack_integrations: "id, user_id, team_id, is_active, updated_at",
      task_lists: "id, user_id, position, updated_at",
      tasks:
        "id, user_id, list_id, parent_id, status, due_date, position, is_starred, updated_at",
      menu_items: "id, user_id, order_index, updated_at",
      outbox: "++id, table, record_id, created_at",
      meta: "key",
    });
    this.version(5).stores({
      nodes: "id, user_id, updated_at",
      frames: "id, user_id, updated_at",
      tools: "id, user_id, updated_at",
      memo_tabs: "id, user_id, order_index, updated_at",
      memos: "id, user_id, tab_id, order_index, updated_at",
      client_tabs: "id, user_id, order_index, updated_at",
      clients: "id, user_id, tab_id, updated_at",
      project_tabs: "id, user_id, order_index, updated_at",
      projects: "id, user_id, tab_id, updated_at",
      affiliations: "id, user_id, order_index, updated_at",
      work_experiences: "id, user_id, order_index, updated_at",
      educations: "id, user_id, order_index, updated_at",
      skills: "id, user_id, order_index, updated_at",
      certifications: "id, user_id, order_index, updated_at",
      languages: "id, user_id, order_index, updated_at",
      subscriptions: "id, user_id, order_index, updated_at",
      assets: "id, user_id, order_index, updated_at",
      journal_entries: "id, user_id, entry_date, updated_at",
      profiles: "id, updated_at",
      user_preferences: "id, user_id, updated_at",
      user_settings: "id, user_id, key, updated_at",
      data_catalog_items: "id, user_id, order_index, updated_at",
      devices: "id, user_id, updated_at",
      ai_shortcuts: "id, user_id, order_index, updated_at",
      task_dividers: "id, user_id, list_id, position, updated_at",
      memo_trash: "id, user_id, deleted_at, updated_at",
      ai_sessions: "id, user_id, updated_at",
      ai_messages: "id, user_id, session_id, updated_at",
      ai_automations: "id, user_id, automation_type, enabled, updated_at",
      ai_automation_runs: "id, user_id, automation_id, status, started_at",
      ai_notifications:
        "id, user_id, category_id, source, priority, is_read, created_at, updated_at",
      ai_notification_categories: "id, user_id, order_index, updated_at",
      ai_notification_api_keys: "id, user_id, key_hash, is_active, updated_at",
      slack_integrations: "id, user_id, team_id, is_active, updated_at",
      rss_feeds: "id, user_id, is_active, updated_at",
      task_lists: "id, user_id, position, updated_at",
      tasks:
        "id, user_id, list_id, parent_id, status, due_date, position, is_starred, updated_at",
      menu_items: "id, user_id, order_index, updated_at",
      outbox: "++id, table, record_id, created_at",
      meta: "key",
    });
    this.version(6).stores({
      nodes: "id, user_id, updated_at",
      frames: "id, user_id, updated_at",
      tools: "id, user_id, updated_at",
      memo_tabs: "id, user_id, order_index, updated_at",
      memos: "id, user_id, tab_id, order_index, updated_at",
      client_tabs: "id, user_id, order_index, updated_at",
      clients: "id, user_id, tab_id, updated_at",
      project_tabs: "id, user_id, order_index, updated_at",
      projects: "id, user_id, tab_id, updated_at",
      affiliations: "id, user_id, order_index, updated_at",
      work_experiences: "id, user_id, order_index, updated_at",
      educations: "id, user_id, order_index, updated_at",
      skills: "id, user_id, order_index, updated_at",
      certifications: "id, user_id, order_index, updated_at",
      languages: "id, user_id, order_index, updated_at",
      subscriptions: "id, user_id, order_index, updated_at",
      assets: "id, user_id, order_index, updated_at",
      journal_entries: "id, user_id, entry_date, updated_at",
      profiles: "id, updated_at",
      user_preferences: "id, user_id, updated_at",
      user_settings: "id, user_id, key, updated_at",
      data_catalog_items: "id, user_id, order_index, updated_at",
      devices: "id, user_id, updated_at",
      ai_shortcuts: "id, user_id, order_index, updated_at",
      task_dividers: "id, user_id, list_id, position, updated_at",
      memo_trash: "id, user_id, deleted_at, updated_at",
      ai_sessions: "id, user_id, updated_at",
      ai_messages: "id, user_id, session_id, updated_at",
      ai_automations: "id, user_id, automation_type, enabled, updated_at",
      ai_automation_runs: "id, user_id, automation_id, status, started_at",
      ai_notifications:
        "id, user_id, category_id, source, priority, is_read, created_at, updated_at",
      ai_notification_categories: "id, user_id, order_index, updated_at",
      ai_notification_api_keys: "id, user_id, key_hash, is_active, updated_at",
      slack_integrations: "id, user_id, team_id, is_active, updated_at",
      rss_feeds: "id, user_id, is_active, updated_at",
      x_sources: "id, user_id, source_type, is_active, updated_at",
      task_lists: "id, user_id, position, updated_at",
      tasks:
        "id, user_id, list_id, parent_id, status, due_date, position, is_starred, updated_at",
      menu_items: "id, user_id, order_index, updated_at",
      outbox: "++id, table, record_id, created_at",
      meta: "key",
    });
    this.version(7).stores({
      media_feed_items: "id, user_id, source, is_read, created_at, updated_at",
      google_gmail_messages: "[user_id+message_id], user_id, is_read",
    });
    this.version(8).stores({
      nodes: "id, user_id, updated_at",
      frames: "id, user_id, updated_at",
      tools: "id, user_id, updated_at",
      memo_tabs: "id, user_id, order_index, updated_at",
      memos: "id, user_id, tab_id, order_index, updated_at",
      client_tabs: "id, user_id, order_index, updated_at",
      clients: "id, user_id, tab_id, updated_at",
      project_tabs: "id, user_id, order_index, updated_at",
      projects: "id, user_id, tab_id, updated_at",
      affiliations: "id, user_id, order_index, updated_at",
      work_experiences: "id, user_id, order_index, updated_at",
      educations: "id, user_id, order_index, updated_at",
      skills: "id, user_id, order_index, updated_at",
      certifications: "id, user_id, order_index, updated_at",
      languages: "id, user_id, order_index, updated_at",
      subscriptions: "id, user_id, order_index, updated_at",
      assets: "id, user_id, order_index, updated_at",
      journal_entries: "id, user_id, entry_date, updated_at",
      profiles: "id, updated_at",
      user_preferences: "id, user_id, updated_at",
      user_settings: "id, user_id, key, updated_at",
      data_catalog_items: "id, user_id, order_index, updated_at",
      devices: "id, user_id, updated_at",
      ai_shortcuts: "id, user_id, order_index, updated_at",
      task_dividers: "id, user_id, list_id, position, updated_at",
      memo_trash: "id, user_id, deleted_at, updated_at",
      ai_sessions: "id, user_id, updated_at",
      ai_messages: "id, user_id, session_id, updated_at",
      ai_automations: "id, user_id, automation_type, enabled, updated_at",
      ai_automation_runs: "id, user_id, automation_id, status, started_at",
      ai_notifications:
        "id, user_id, category_id, source, priority, is_read, created_at, updated_at",
      ai_notification_categories: "id, user_id, order_index, updated_at",
      ai_notification_api_keys: "id, user_id, key_hash, is_active, updated_at",
      slack_integrations: "id, user_id, team_id, is_active, updated_at",
      rss_feeds: "id, user_id, is_active, updated_at",
      x_sources: "id, user_id, source_type, is_active, updated_at",
      media_feed_items: "id, user_id, source, is_read, created_at, updated_at",
      google_gmail_messages: "[user_id+message_id], user_id, is_read",
      user_google_tokens: "id, user_id, is_valid, updated_at",
      google_calendar_events:
        "[user_id+event_id], user_id, start_time, updated_at",
      task_lists: "id, user_id, position, updated_at",
      tasks:
        "id, user_id, list_id, parent_id, status, due_date, position, is_starred, updated_at",
      menu_items: "id, user_id, order_index, updated_at",
      outbox: "++id, table, record_id, created_at",
      meta: "key",
    });
    this.version(9).stores({
      switchbot_status_history: "id, user_id, device_id, recorded_at",
    });
    this.version(10).stores({
      invoices: "id, user_id, status, order_index, updated_at",
      expenses: "id, user_id, category, expense_date, order_index, updated_at",
      money_documents: "id, user_id, document_type, order_index, updated_at",
      pending_uploads: "++id, user_id, created_at",
    });
    this.version(11).stores({
      invoices:
        "id, user_id, status, order_index, repeat_type, repeat_next_date, updated_at",
    });
    this.version(12).stores({
      invoices:
        "id, user_id, status, document_type, order_index, repeat_type, repeat_next_date, updated_at",
    });
    this.version(13).stores({
      health_meals: "id, user_id, eaten_at, updated_at",
      health_supplements: "id, user_id, active, updated_at",
    });
    this.version(14).stores({
      invest_portfolios: "id, user_id, order_index, updated_at",
      invest_holdings:
        "id, user_id, portfolio_id, symbol, order_index, updated_at",
      invest_watchlist: "id, user_id, symbol, order_index, updated_at",
    });
    this.version(15).stores({
      invest_transactions:
        "id, user_id, portfolio_id, symbol, type, transacted_at, updated_at",
      invest_alerts: "id, user_id, symbol, condition, enabled, updated_at",
    });
    this.version(16).stores({
      invest_chart_drawings: "id, user_id, symbol, tool, updated_at",
    });
    this.version(17).stores({
      location_logs: "id, user_id, logged_at, updated_at",
    });
  }
}

export const offlineDb = new HubOfflineDB();
