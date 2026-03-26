export type NodeType = "human" | "ai" | "item";
export type NodeShape = "circle" | "card" | "group";
export type GroupColor =
  | "blue"
  | "green"
  | "purple"
  | "orange"
  | "red"
  | "pink"
  | "yellow"
  | "cyan";

export interface Position {
  x: number;
  y: number;
}

export interface OrgNode {
  id: string;
  title: string;
  subtitle?: string;
  type: NodeType;
  shape: NodeShape;
  description: string;
  systemInstruction?: string;
  linkedTo: string[];
  linkedAutomationIds?: string[];
  position: Position;
  groupColor?: GroupColor; // For group nodes
  icon?: string; // Icon identifier
}

export interface Edge {
  id: string;
  source: string;
  target: string;
}

export interface Frame {
  id: string;
  label?: string;
  color: GroupColor;
  position: Position;
  width: number;
  height: number;
  linkedTo: string[];
}

export interface Tool {
  id: string;
  name: string;
  description: string;
  url?: string;
  category?: string;
  order?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface DataCatalogItem {
  id: string;
  label: string;
  description?: string;
  link?: string;
  order: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface Device {
  id: string;
  name: string;
  description: string;
  order?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface AiShortcut {
  id: string;
  label: string;
  order: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface TaskDivider {
  id: string;
  listId: string;
  position: number;
  color: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface MemoTrash {
  id: string;
  tabId: string;
  title: string;
  content: string;
  order: number;
  deletedAt: string;
  originalTabId: string;
  originalTabName?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface MemoTab {
  id: string;
  name: string;
  color: GroupColor;
  order: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface Memo {
  id: string;
  tabId: string;
  title: string;
  content: string;
  order: number;
  createdAt?: string;
  updatedAt?: string;
}

export type ClientStatus = "active" | "inactive" | "prospect";

export interface ClientTab {
  id: string;
  name: string;
  color: GroupColor;
  order: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface Client {
  id: string;
  tabId: string;
  name: string;
  contactName?: string;
  email?: string;
  phone?: string;
  address?: string;
  notes?: string;
  status: ClientStatus;
  corporateClientId?: string; // 個人クライアントが所属する法人クライアントのID
  photoStoragePath?: string;
  photoStoragePathBack?: string;
  ocrExtracted?: Record<string, unknown>;
  order?: number;
  createdAt?: string;
  updatedAt?: string;
}

// Money management types
export type BillingCycle = "weekly" | "monthly" | "yearly";
export type SubscriptionCategory =
  | "entertainment"
  | "productivity"
  | "utilities"
  | "other";
export type SubscriptionStatus = "active" | "cancelled" | "paused";
export type AssetType =
  | "bank"
  | "investment"
  | "stock"
  | "fund"
  | "bond"
  | "crypto"
  | "insurance"
  | "pension"
  | "cash"
  | "real_estate"
  | "other";

export interface Subscription {
  id: string;
  name: string;
  amount: number;
  currency: string;
  billingCycle: BillingCycle;
  nextBillingDate?: string;
  category: SubscriptionCategory;
  status: SubscriptionStatus;
  notes: string;
  order?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface Asset {
  id: string;
  name: string;
  assetType: AssetType;
  institution: string;
  amount: number;
  currency: string;
  notes: string;
  order?: number;
  createdAt?: string;
  updatedAt?: string;
}

// Business info for invoice generation
export interface BusinessInfo {
  companyName: string;
  name: string;
  address: string;
  phone: string;
  email: string;
  bankName: string;
  bankBranch: string;
  accountType: string;
  accountNumber: string;
  accountHolder: string;
}

// Invoice types
export type InvoiceStatus =
  | "draft"
  | "issued"
  | "paid"
  | "overdue"
  | "cancelled";

export type InvoiceRepeatType = "none" | "monthly" | "quarterly" | "yearly";

export type InvoiceCategory = "freelance" | "salary" | "dividend" | "other";

export interface InvoiceItem {
  name: string;
  quantity: number;
  unitPrice: number;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  clientId?: string;
  projectId?: string;
  issueDate?: string;
  dueDate?: string;
  paidDate?: string;
  amount: number;
  currency: string;
  status: InvoiceStatus;
  category?: InvoiceCategory;
  items?: InvoiceItem[];
  taxRate?: number;
  taxIncluded?: boolean;
  pdfStoragePath?: string;
  ocrExtracted?: Record<string, unknown>;
  notes: string;
  order?: number;
  repeatType?: InvoiceRepeatType;
  repeatNextDate?: string;
  repeatSourceId?: string;
  createdAt?: string;
  updatedAt?: string;
}

// Estimate types
export type EstimateStatus =
  | "draft"
  | "issued"
  | "accepted"
  | "rejected"
  | "expired";

export interface Estimate {
  id: string;
  estimateNumber: string;
  clientId?: string;
  projectId?: string;
  issueDate?: string;
  expiryDate?: string; // 有効期限 (stored in due_date column)
  subject?: string; // 件名 (stored in notes column)
  amount: number;
  currency: string;
  status: EstimateStatus;
  category?: InvoiceCategory;
  pdfStoragePath?: string;
  notes: string;
  order?: number;
  createdAt?: string;
  updatedAt?: string;
}

// Expense types
export type ExpenseCategory =
  | "transport"
  | "food"
  | "supplies"
  | "software"
  | "hardware"
  | "communication"
  | "entertainment"
  | "education"
  | "other";

export interface Expense {
  id: string;
  title: string;
  amount: number;
  currency: string;
  expenseDate?: string;
  category: ExpenseCategory;
  clientId?: string;
  projectId?: string;
  receiptStoragePath?: string;
  ocrExtracted?: Record<string, unknown>;
  notes: string;
  order?: number;
  createdAt?: string;
  updatedAt?: string;
}

// Contract types
export type ContractType = "contract" | "receipt" | "report" | "other";

export interface Contract {
  id: string;
  title: string;
  contractType: ContractType;
  tags: string[];
  storagePath?: string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  ocrExtracted?: Record<string, unknown>;
  notes: string;
  order?: number;
  createdAt?: string;
  updatedAt?: string;
}

// Invoice reminder settings
export interface InvoiceReminderSettings {
  enabled: boolean;
  dayOfMonth: number;
  hour: number;
}

// Project types
export type ProjectStatus =
  | "planning"
  | "in_progress"
  | "on_hold"
  | "completed"
  | "cancelled";

export interface ProjectTab {
  id: string;
  name: string;
  color: GroupColor;
  parentProjectId?: string | null;
  order: number;
  createdAt?: string;
  updatedAt?: string;
}

export type BudgetUnit = "once" | "hourly" | "monthly" | "yearly";

export interface ProjectBudget {
  amount: number;
  unit: BudgetUnit;
}

export interface Project {
  id: string;
  tabId: string;
  name: string;
  description?: string;
  status: ProjectStatus;
  clientId?: string;
  startDate?: string;
  endDate?: string;
  budget?: number;
  budgets?: ProjectBudget[];
  currency?: string;
  isPinned?: boolean;
  progress?: number;
  isArchived?: boolean;
  order?: number;
  createdAt?: string;
  updatedAt?: string;
}

// Journal types
export type Mood = "happy" | "good" | "neutral" | "sad" | "stressed";

export interface JournalPhoto {
  url: string;
  description?: string;
  taken_at?: string;
}

export interface JournalLocation {
  name: string;
  lat?: number;
  lng?: number;
  visited_at?: string;
}

export interface JournalEntry {
  id: string;
  entryDate: string;
  title: string;
  content: string;
  mood: Mood;
  tags: string[];
  photos?: JournalPhoto[];
  locationLog?: JournalLocation[];
  autoGenerated?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

// AI Automation types
export type AutomationType =
  | "paper_search"
  | "news_collection"
  | "custom"
  | "hp_post"
  | "event_discovery"
  | "stock_analysis"
  | "event_collect"
  | "ai_news_digest";
export type AutomationSchedule =
  | "hourly"
  | "daily"
  | "weekly"
  | "monthly"
  | "manual";
export type AutomationRunStatus = "success" | "error" | "running" | "pending";
export type AiProvider = "gemini" | "openai" | "anthropic" | "perplexity";

export interface PaperSearchConfig {
  prompt?: string;
}

export interface NewsCollectionConfig {
  prompt?: string;
}

export interface CustomAutomationConfig {
  prompt: string;
  outputFormat: "summary" | "list" | "report";
}

export interface HpPostConfig {
  prompt?: string;
  category?: string;
}

export interface EventDiscoveryConfig {
  prompt?: string;
  keywords: string[];
  location?: string;
  platforms: ("peatix" | "luma")[];
}

export interface StockAnalysisConfig {
  prompt?: string;
  analysisType?: "portfolio" | "market_overview";
}

export interface EventCollectConfig {
  prompt?: string;
  platforms: ("connpass" | "techplay" | "luma" | "peatix")[];
  keywords: string[];
  location?: string;
  slackChannelId?: string;
}

export interface AiNewsDigestConfig {
  prompt?: string;
  arxivCategories: string[];
  rssFeeds: string[];
  slackChannelId?: string;
  lineEnabled?: boolean;
}

export type AutomationConfig =
  | PaperSearchConfig
  | NewsCollectionConfig
  | CustomAutomationConfig
  | HpPostConfig
  | EventDiscoveryConfig
  | StockAnalysisConfig
  | EventCollectConfig
  | AiNewsDigestConfig;

export interface AiAutomation {
  id: string;
  name: string;
  description?: string;
  automationType: AutomationType;
  config: AutomationConfig;
  schedule: AutomationSchedule;
  scheduledTime?: string; // HH:MM format
  aiModel: AiProvider;
  enabled: boolean;
  lastRunAt?: string;
  lastRunStatus?: AutomationRunStatus;
  lastRunResult?: Record<string, unknown>;
  linkedNodeId?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface AiAutomationRun {
  id: string;
  automationId: string;
  status: AutomationRunStatus;
  result?: Record<string, unknown>;
  errorMessage?: string;
  startedAt: string;
  completedAt?: string;
}

// Proactive Agent settings (stored in user_settings key: proactive_agent_settings)
export type AgentRoleName =
  | "taskmaster"
  | "finance_ops"
  | "wellness_coach"
  | "tech_ops"
  | "info_curator";

export type AgentRoleConfig = {
  enabled: boolean;
};

export interface ProactiveAgentSettings {
  enabled: boolean;
  ai_model: "gemini" | "openai" | "anthropic";
  data_sources: {
    tasks: boolean;
    calendar: boolean;
    gmail: boolean;
    invoices: boolean;
    switchbot: boolean;
    projects: boolean;
    memos: boolean;
    media_feed: boolean;
    automations: boolean;
    journal: boolean;
    subscriptions: boolean;
    clients: boolean;
    certifications: boolean;
    assets: boolean;
  };
  push_high_only: boolean;
  temperature: number;
  max_insights: number;
  max_tokens: number;
  category_cooldown_hours: number;
  min_interval_minutes: number;
  response_language: "ja" | "en";
  custom_instructions: string;
  team_mode?: boolean;
  agent_roles?: Record<AgentRoleName, AgentRoleConfig>;
}

export const DEFAULT_PROACTIVE_SETTINGS: ProactiveAgentSettings = {
  enabled: true,
  ai_model: "gemini",
  data_sources: {
    tasks: true,
    calendar: true,
    gmail: true,
    invoices: true,
    switchbot: true,
    projects: true,
    memos: true,
    media_feed: true,
    automations: true,
    journal: true,
    subscriptions: true,
    clients: true,
    certifications: true,
    assets: true,
  },
  push_high_only: true,
  temperature: 0.3,
  max_insights: 5,
  max_tokens: 2048,
  category_cooldown_hours: 6,
  min_interval_minutes: 30,
  response_language: "ja",
  custom_instructions: "",
  team_mode: true,
  agent_roles: {
    taskmaster: { enabled: true },
    finance_ops: { enabled: true },
    wellness_coach: { enabled: true },
    tech_ops: { enabled: true },
    info_curator: { enabled: true },
  },
};

export const DEFAULT_AGENT_ROLES: Record<AgentRoleName, AgentRoleConfig> = {
  taskmaster: { enabled: true },
  finance_ops: { enabled: true },
  wellness_coach: { enabled: true },
  tech_ops: { enabled: true },
  info_curator: { enabled: true },
};

export const AGENT_ROLE_LABELS: {
  name: AgentRoleName;
  label: string;
  description: string;
}[] = [
  { name: "taskmaster", label: "TaskMaster", description: "Tasks & Calendar" },
  {
    name: "finance_ops",
    label: "FinanceOps",
    description: "Invoices, Subscriptions, Assets, Clients",
  },
  {
    name: "wellness_coach",
    label: "WellnessCoach",
    description: "Journal & Wellbeing",
  },
  {
    name: "tech_ops",
    label: "TechOps",
    description: "Smart Home & Automations",
  },
  {
    name: "info_curator",
    label: "InfoCurator",
    description: "Media, Gmail, Projects, Memos, Certs",
  },
];

export const DATA_SOURCE_LABELS: Record<
  keyof ProactiveAgentSettings["data_sources"],
  string
> = {
  tasks: "Tasks",
  calendar: "Calendar",
  gmail: "Gmail",
  invoices: "Invoices & Expenses",
  switchbot: "Smart Home",
  projects: "Projects",
  memos: "Memos",
  media_feed: "Media Feed",
  automations: "Automations",
  journal: "Journal",
  subscriptions: "Subscriptions",
  clients: "Clients",
  certifications: "Certifications",
  assets: "Assets",
};

// Health AI types
export type MealType = "breakfast" | "lunch" | "dinner" | "snack" | "other";
export type SupplementFrequency = "daily" | "weekly" | "as_needed";

export interface HealthMeal {
  id: string;
  user_id?: string;
  meal_type: MealType;
  photo_url?: string;
  eaten_at: string;
  calories?: number;
  protein_g?: number;
  carbs_g?: number;
  fat_g?: number;
  fiber_g?: number;
  nutrients?: Record<string, number | string>;
  items?: Array<{ name: string; amount_g?: number; calories?: number }>;
  ai_raw?: Record<string, unknown>;
  notes?: string;
  created_at?: string;
  updated_at?: string;
}

export interface HealthSupplement {
  id: string;
  user_id?: string;
  name: string;
  brand?: string;
  photo_url?: string;
  dosage?: string;
  frequency: SupplementFrequency;
  nutrients?: Record<string, string>;
  active: boolean;
  notes?: string;
  created_at?: string;
  updated_at?: string;
}

// HealthKit metrics (from Apple Watch / iOS Shortcuts)
export type HealthMetricType =
  | "heart_rate"
  | "resting_heart_rate"
  | "hrv"
  | "blood_oxygen"
  | "steps"
  | "active_energy"
  | "basal_energy"
  | "sleep_analysis"
  | "weight"
  | "body_fat"
  | "body_temperature"
  | "blood_pressure_systolic"
  | "blood_pressure_diastolic"
  | "respiratory_rate"
  | "vo2_max"
  | (string & {});

export interface HealthMetric {
  id: string;
  user_id?: string;
  metric_type: HealthMetricType;
  value: number;
  unit: string;
  recorded_at: string;
  source?: string;
  metadata?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
}

// AI Notification types (automation, webhook, system only)
export type NotificationSource = "automation" | "webhook" | "system";
export type NotificationPriority = "low" | "medium" | "high" | "urgent";

export interface AiNotification {
  id: string;
  userId?: string;
  categoryId?: string;
  source: NotificationSource;
  priority: NotificationPriority;
  title: string;
  body: string;
  metadata?: Record<string, unknown>;
  isRead: boolean;
  createdAt?: string;
  updatedAt?: string;
}

// Media Feed types (slack, rss, x)
export type MediaFeedSource = "slack" | "rss" | "x";

export interface MediaFeedItem {
  id: string;
  userId?: string;
  categoryId?: string;
  source: MediaFeedSource;
  priority: NotificationPriority;
  title: string;
  body: string;
  metadata?: Record<string, unknown>;
  isRead: boolean;
  createdAt?: string;
  updatedAt?: string;
}

// Google Calendar sync event (dedup table)
export interface GoogleCalendarSyncEvent {
  userId: string;
  eventId: string;
  calendarId?: string;
  calendarName?: string;
  summary?: string;
  startTime?: string;
  endTime?: string;
  location?: string;
  description?: string;
  htmlLink?: string;
  hangoutLink?: string;
  status?: string;
  attendees?: { email: string; name?: string; status?: string }[];
  createdAt?: string;
  updatedAt?: string;
}

// Google Gmail sync message (dedup + badge table)
export interface GoogleGmailSyncMessage {
  userId: string;
  messageId: string;
  threadId?: string;
  subject?: string;
  snippet?: string;
  sender?: string;
  recipient?: string;
  cc?: string;
  date?: string;
  labels?: string[];
  isUnread?: boolean;
  isStarred?: boolean;
  isRead: boolean;
  historyId?: string;
  sizeEstimate?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface AiNotificationCategory {
  id: string;
  userId?: string;
  name: string;
  color: string;
  icon?: string;
  orderIndex: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface AiNotificationApiKey {
  id: string;
  userId?: string;
  name: string;
  keyPrefix: string;
  isActive: boolean;
  lastUsedAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export type SlackChannelFilterMode = "all" | "include" | "exclude";

export interface SlackChannelFilter {
  mode: SlackChannelFilterMode;
  channels: string[];
}

export interface SlackSyncState {
  history_synced_at?: string;
  channels_synced?: Record<string, string>;
}

export interface SlackIntegration {
  id: string;
  userId?: string;
  teamId: string;
  teamName: string;
  botToken?: string;
  channelFilters: SlackChannelFilter;
  defaultCategoryId?: string | null;
  syncState?: SlackSyncState;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

// X Source types
export type XSourceType = "account" | "keyword";

export interface XSource {
  id: string;
  userId?: string;
  name: string;
  sourceType: XSourceType;
  query: string;
  category?: string;
  isActive: boolean;
  lastFetchedAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

// RSS Feed types
export interface RssFeed {
  id: string;
  userId?: string;
  name: string;
  url: string;
  category?: string;
  isActive: boolean;
  lastFetchedAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

// =============================================
// Investment types
// =============================================
export type InvestMarket = "JP" | "US";

export interface InvestPortfolio {
  id: string;
  name: string;
  description: string;
  currency: string;
  order?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface InvestHolding {
  id: string;
  portfolioId: string;
  symbol: string;
  name: string;
  market: InvestMarket;
  quantity: number;
  avgCost: number;
  currency: string;
  notes: string;
  order?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface InvestWatchlistItem {
  id: string;
  symbol: string;
  name: string;
  market: InvestMarket;
  notes: string;
  order?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface StockQuote {
  symbol: string;
  name: string;
  price: number;
  previousClose: number;
  change: number;
  changePercent: number;
  currency: string;
  marketState: string;
}

export interface StockCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type InvestTransactionType = "buy" | "sell" | "dividend";

export interface InvestTransaction {
  id: string;
  portfolioId: string;
  symbol: string;
  name: string;
  market: InvestMarket;
  type: InvestTransactionType;
  quantity: number;
  price: number;
  fee: number;
  currency: string;
  notes: string;
  transactedAt: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface InvestAlert {
  id: string;
  symbol: string;
  name: string;
  market: InvestMarket;
  targetPrice: number;
  condition: "above" | "below";
  enabled: boolean;
  triggeredAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface StockNews {
  title: string;
  link: string;
  publisher: string;
  publishedAt: string;
  thumbnail?: string;
  relatedSymbols: string[];
}

export interface ExchangeRate {
  pair: string;
  rate: number;
  timestamp: number;
}

export interface StockFinancials {
  symbol: string;
  // Valuation
  trailingPE: number | null;
  forwardPE: number | null;
  priceToBook: number | null;
  pegRatio: number | null;
  enterpriseToEbitda: number | null;
  // Dividend
  dividendYield: number | null;
  dividendRate: number | null;
  payoutRatio: number | null;
  exDividendDate: string | null;
  // Financials
  marketCap: number | null;
  totalRevenue: number | null;
  revenueGrowth: number | null;
  grossMargins: number | null;
  operatingMargins: number | null;
  profitMargins: number | null;
  ebitda: number | null;
  totalDebt: number | null;
  totalCash: number | null;
  debtToEquity: number | null;
  returnOnEquity: number | null;
  returnOnAssets: number | null;
  freeCashflow: number | null;
  operatingCashflow: number | null;
  earningsGrowth: number | null;
  currentRatio: number | null;
  // Key Stats
  beta: number | null;
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
  fiftyDayAverage: number | null;
  twoHundredDayAverage: number | null;
  sharesOutstanding: number | null;
  floatShares: number | null;
  shortRatio: number | null;
}

export type {
  DrawingTool,
  DrawingPoint,
  InvestChartDrawing,
} from "../components/invest/chartDrawings/types";

export interface InvestAiContext {
  chartSymbol: string;
  chartSymbolName: string;
  chartRange: string;
  chartIndicators: {
    sma20: boolean;
    sma50: boolean;
    rsi: boolean;
    macd: boolean;
    bb: boolean;
  };
  latestCandle: StockCandle | null;
  activeTab:
    | "dashboard"
    | "chart"
    | "portfolio"
    | "watchlist"
    | "history"
    | "report"
    | "news"
    | "heatmap";
  portfolios: InvestPortfolio[];
  holdings: InvestHolding[];
  watchlist: InvestWatchlistItem[];
  quotes: StockQuote[];
  financials?: StockFinancials[];
}
