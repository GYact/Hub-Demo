import {
  Home,
  Network,
  Settings,
  StickyNote,
  ListTodo,
  Calendar,
  Users,
  Wallet,
  BookOpen,
  FolderKanban,
  User,
  Bot,
  TrendingUp,
  Database,
  CandlestickChart,
  type LucideIcon,
} from "lucide-react";

// Shared icon name to component mapping (used by HubPage, Sidebar, useMobileNavConfig)
export const ICON_MAP: Record<string, LucideIcon> = {
  Home,
  Network,
  Settings,
  StickyNote,
  ListTodo,
  Calendar,
  Users,
  Wallet,
  BookOpen,
  FolderKanban,
  User,
  Bot,
  TrendingUp,
  Database,
  CandlestickChart,
};

// Menu item display info (description, color gradient, hover background)
export const MENU_ITEM_DISPLAY_INFO: Record<
  string,
  { description: string; color: string; bgHover: string }
> = {
  "/home": {
    description: "Your central hub",
    color: "from-sky-500 to-blue-600",
    bgHover: "hover:bg-sky-50",
  },
  "/hub": {
    description: "Visualize ideas with nodes & edges",
    color: "from-purple-500 to-purple-700",
    bgHover: "hover:bg-purple-50",
  },
  "/settings": {
    description: "Manage tools & integrations",
    color: "from-slate-500 to-slate-700",
    bgHover: "hover:bg-slate-100",
  },
  "/memos": {
    description: "Capture ideas & tasks",
    color: "from-indigo-500 to-purple-600",
    bgHover: "hover:bg-indigo-50",
  },
  "/tasks": {
    description: "Organize personal tasks",
    color: "from-sky-500 to-cyan-600",
    bgHover: "hover:bg-sky-50",
  },
  "/calendar": {
    description: "Sync with Google Calendar",
    color: "from-amber-500 to-orange-600",
    bgHover: "hover:bg-amber-50",
  },
  "/community": {
    description: "Manage clients & contacts",
    color: "from-teal-500 to-cyan-600",
    bgHover: "hover:bg-teal-50",
  },
  "/finance": {
    description: "Track subscriptions & assets",
    color: "from-emerald-500 to-green-600",
    bgHover: "hover:bg-emerald-50",
  },
  "/journal": {
    description: "Keep your daily diary",
    color: "from-cyan-500 to-blue-600",
    bgHover: "hover:bg-cyan-50",
  },
  "/profile": {
    description: "Manage your account",
    color: "from-rose-500 to-pink-600",
    bgHover: "hover:bg-rose-50",
  },
  "/projects": {
    description: "Manage your projects",
    color: "from-orange-500 to-amber-600",
    bgHover: "hover:bg-orange-50",
  },
  "/ai": {
    description: "Explore Hub AI apps and experiments",
    color: "from-purple-500 to-indigo-600",
    bgHover: "hover:bg-purple-50",
  },
  "/media": {
    description: "X, Instagram, RSS feeds",
    color: "from-blue-500 to-sky-600",
    bgHover: "hover:bg-blue-50",
  },
  "/drive": {
    description: "Manage drive catalog & RAG",
    color: "from-violet-500 to-purple-600",
    bgHover: "hover:bg-violet-50",
  },
  "/invest": {
    description: "Stock portfolio & charts",
    color: "from-blue-500 to-indigo-600",
    bgHover: "hover:bg-blue-50",
  },
};
