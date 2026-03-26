import { Link } from "react-router-dom";
import {
  Bot,
  Bell,
  ArrowRight,
  Workflow,
  Home,
  Users,
  Heart,
  Terminal,
  Building2,
} from "lucide-react";
import { Layout } from "../components";
import { useNotificationBadge } from "../contexts/NotificationContext";
import { getBadgeCount } from "../lib/notificationConstants";

type AiApp = {
  id: string;
  title: string;
  description: string;
  to?: string;
  icon: typeof Bot;
  color: string;
  bgHover: string;
  status: "available" | "coming_soon";
};

const AI_APPS: AiApp[] = [
  {
    id: "hub-ai",
    title: "Hub-AI",
    description: "Chat using your Hub data",
    to: "/ai/hub-ai",
    icon: Bot,
    color: "from-purple-500 to-indigo-600",
    bgHover: "hover:bg-purple-50",
    status: "available",
  },
  {
    id: "ai-channel",
    title: "AI Channel",
    description: "Chat with Aristotle, Elon Musk, and more",
    to: "/ai/channel",
    icon: Users,
    color: "from-fuchsia-500 to-pink-600",
    bgHover: "hover:bg-fuchsia-50",
    status: "available",
  },
  {
    id: "notify-box",
    title: "AI Notify Box",
    description: "Receive AI notifications and summaries",
    to: "/ai/notify-box",
    icon: Bell,
    color: "from-amber-500 to-orange-600",
    bgHover: "hover:bg-amber-50",
    status: "available",
  },
  {
    id: "automation-manager",
    title: "Automations",
    description: "Manage AI workflows and automations",
    to: "/ai/automation",
    icon: Workflow,
    color: "from-sky-500 to-cyan-600",
    bgHover: "hover:bg-sky-50",
    status: "available",
  },
  {
    id: "health-ai",
    title: "Health AI",
    description: "Track meals, supplements & nutrition with AI",
    to: "/ai/health",
    icon: Heart,
    color: "from-rose-500 to-pink-600",
    bgHover: "hover:bg-rose-50",
    status: "available",
  },
  {
    id: "smart-home",
    title: "Smart Home",
    description: "Control smart home devices with SwitchBot",
    to: "/ai/smart-home",
    icon: Home,
    color: "from-emerald-500 to-teal-600",
    bgHover: "hover:bg-emerald-50",
    status: "available",
  },
  {
    id: "claude-code",
    title: "Claude Code",
    description: "Remote access to Claude Code CLI on your Mac",
    to: "/ai/claude-code",
    icon: Terminal,
    color: "from-orange-500 to-amber-600",
    bgHover: "hover:bg-orange-50",
    status: "available",
  },
  {
    id: "ai-company",
    title: "AI Company",
    description: "10人のAI社員が働く仮想会社",
    to: "/ai/company",
    icon: Building2,
    color: "from-green-500 to-emerald-600",
    bgHover: "hover:bg-green-50",
    status: "available",
  },
];

export const AiHubPage = () => {
  const { unreadBySource } = useNotificationBadge();

  return (
    <Layout pageTitle="AI">
      <div className="h-full overflow-auto neu-bg mobile-scroll-pad">
        <main className="max-w-5xl mx-auto px-4 py-4 md:py-10">
          <div className="mb-4 md:mb-6">
            <h2 className="text-2xl md:text-3xl font-bold neu-text-primary">
              AI Apps
            </h2>
            <p className="neu-text-secondary text-sm md:text-base mt-1">
              All AI features in one place
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6">
            {AI_APPS.map((app) => {
              const badgeCount =
                app.id === "notify-box"
                  ? getBadgeCount("/ai", unreadBySource)
                  : 0;
              const Card = (
                <div
                  className={`group relative neu-card p-5 transition-all ${
                    app.status === "available"
                      ? `neu-card-hover hover:-translate-y-0.5`
                      : "opacity-60 cursor-not-allowed"
                  }`}
                >
                  <div className="relative inline-flex mb-4">
                    <div
                      className={`p-3 rounded-xl bg-gradient-to-br ${app.color} shadow`}
                    >
                      <app.icon className="w-6 h-6 text-white" />
                    </div>
                    {badgeCount > 0 && (
                      <span className="absolute -top-1 -right-1 min-w-[20px] h-5 flex items-center justify-center bg-red-500 text-white text-xs font-bold rounded-full px-1.5 shadow">
                        {badgeCount > 99 ? "99+" : badgeCount}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-semibold neu-text-primary">
                      {app.title}
                    </h3>
                    {app.status === "coming_soon" && (
                      <span className="text-[10px] font-semibold uppercase tracking-wide neu-text-secondary neu-flat px-2 py-0.5 rounded-full">
                        Coming soon
                      </span>
                    )}
                  </div>
                  <p className="neu-text-secondary text-sm mt-2">
                    {app.description}
                  </p>
                  {app.status === "available" && (
                    <div className="mt-4 flex items-center gap-2 text-sm neu-text-muted group-hover:neu-text-secondary">
                      <span>Open</span>
                      <ArrowRight size={16} />
                    </div>
                  )}
                </div>
              );

              if (app.status === "available" && app.to) {
                return (
                  <Link key={app.id} to={app.to} className="block">
                    {Card}
                  </Link>
                );
              }

              return <div key={app.id}>{Card}</div>;
            })}
          </div>
        </main>
      </div>
    </Layout>
  );
};
