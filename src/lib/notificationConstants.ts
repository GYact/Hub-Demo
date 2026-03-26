import type { MediaFeedSource } from "../types";

// Category color palette (used in AiNotifyBoxPage and SettingsPage)
export const CATEGORY_COLORS: Record<string, string> = {
  blue: "#3b82f6",
  green: "#22c55e",
  purple: "#a855f7",
  orange: "#f97316",
  red: "#ef4444",
  pink: "#ec4899",
};

// All media feed source values (for type-safe iteration)
export const MEDIA_FEED_SOURCES: MediaFeedSource[] = ["slack", "rss", "x"];

// Notification source display config (used in HubPage, AiNotifyBoxPage)
export const SOURCE_DISPLAY_CONFIG: Record<
  string,
  { label: string; color: string; link: string }
> = {
  slack: { label: "Slack", color: "bg-sky-100 text-sky-700", link: "/media" },
  rss: { label: "RSS", color: "bg-orange-100 text-orange-700", link: "/media" },
  x: { label: "X", color: "bg-slate-800 text-white", link: "/media" },
  automation: {
    label: "Automation",
    color: "bg-emerald-100 text-emerald-700",
    link: "/ai/notify-box",
  },
  webhook: {
    label: "Webhook",
    color: "bg-purple-100 text-purple-700",
    link: "/ai/notify-box",
  },
  system: {
    label: "AI Agent",
    color: "bg-indigo-100 text-indigo-700",
    link: "/ai/notify-box",
  },
};

// Route-to-source mapping for notification badges
export const ROUTE_BADGE_SOURCES: Record<string, string[]> = {
  "/ai": ["automation", "webhook", "system"],
  "/media": ["rss", "slack", "x"],
};

// Compute badge count for a given route
export const getBadgeCount = (
  route: string,
  unreadBySource: Record<string, number>,
): number => {
  const sources = ROUTE_BADGE_SOURCES[route];
  if (!sources) return 0;
  return sources.reduce((sum, src) => sum + (unreadBySource[src] || 0), 0);
};
