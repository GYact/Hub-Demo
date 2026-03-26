import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Users,
  FileText,
  ClipboardList,
  Clock,
  Settings,
} from "lucide-react";
import { Layout } from "../components";
import { useAuth } from "../contexts/AuthContext";
import { useAiCompanyUrl } from "../hooks/useAiCompany";
import { Dashboard } from "../components/ai-company/Dashboard";
import { PostBoard } from "../components/ai-company/PostBoard";
import { TaskList } from "../components/ai-company/TaskList";
import { AgentPrompts } from "../components/ai-company/AgentPrompts";
import { HistoryModal } from "../components/ai-company/HistoryModal";
import type { HistoryMode } from "../components/ai-company/HistoryModal";
import type { OrchestrationRecord } from "../lib/ai-company/supabaseHistory";

type Tab = "dashboard" | "posts" | "tasks" | "settings";

/** タブに対応する履歴モード（nullは履歴ボタン非表示） */
const TAB_HISTORY_MODE: Record<Tab, HistoryMode | null> = {
  dashboard: "orchestrations",
  posts: "posts",
  tasks: null,
  settings: null,
};

export const AiCompanyPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { baseUrl, authFetch } = useAiCompanyUrl();
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");
  const [showHistory, setShowHistory] = useState(false);
  const [restoringRecord, setRestoringRecord] =
    useState<OrchestrationRecord | null>(null);
  const userId = user?.id ?? null;

  const historyMode = TAB_HISTORY_MODE[activeTab];

  const openHistory = useCallback(() => {
    setShowHistory(true);
  }, []);

  const handleRestoreOrchestration = useCallback(
    (record: OrchestrationRecord) => {
      setRestoringRecord(record);
      setActiveTab("dashboard");
    },
    [],
  );

  const headerLeft = (
    <button
      onClick={() => navigate("/ai")}
      className="p-1.5 md:p-2 neu-btn neu-text-secondary hover:neu-text-primary rounded-lg transition-colors"
      title="Back to AI"
    >
      <ArrowLeft size={16} className="md:w-[18px] md:h-[18px]" />
    </button>
  );

  const tabItems: {
    key: Tab;
    icon: typeof Users;
    label: string;
    color: string;
  }[] = [
    {
      key: "dashboard",
      icon: Users,
      label: "Dashboard",
      color: "text-emerald-600",
    },
    { key: "posts", icon: FileText, label: "Posts", color: "text-sky-600" },
    {
      key: "tasks",
      icon: ClipboardList,
      label: "Tasks",
      color: "text-amber-600",
    },
    {
      key: "settings",
      icon: Settings,
      label: "Settings",
      color: "text-slate-600",
    },
  ];

  const headerCenter = (
    <div className="flex items-center gap-1 neu-pressed rounded-lg p-0.5">
      {tabItems.map(({ key, icon: Icon, label, color }) => (
        <button
          key={key}
          onClick={() => setActiveTab(key)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
            activeTab === key
              ? `bg-white/80 ${color} shadow-[2px_2px_4px_rgba(163,177,198,0.3),-2px_-2px_4px_rgba(255,255,255,0.7)]`
              : "neu-text-secondary hover:neu-text-primary"
          }`}
        >
          <Icon size={14} />
          <span className="hidden sm:inline">{label}</span>
        </button>
      ))}
    </div>
  );

  const headerRight = (
    <div className="flex items-center gap-2">
      {userId && historyMode && (
        <button
          onClick={openHistory}
          className="p-1.5 md:p-2 neu-btn neu-text-secondary hover:neu-text-primary rounded-lg transition-colors"
          title="履歴"
        >
          <Clock size={16} className="md:w-[18px] md:h-[18px]" />
        </button>
      )}
      <div className="flex items-center gap-2 text-[10px] neu-text-muted">
        <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
        <span className="hidden sm:inline">AI Company</span>
      </div>
    </div>
  );

  return (
    <Layout
      pageTitle="AI Company"
      headerLeft={headerLeft}
      headerCenter={headerCenter}
      headerRight={headerRight}
    >
      <div className="h-full overflow-auto neu-bg mobile-scroll-pad">
        <div className="max-w-7xl mx-auto px-4 py-4">
          {activeTab === "dashboard" && (
            <Dashboard
              baseUrl={baseUrl}
              authFetch={authFetch}
              userId={userId}
              restoringRecord={restoringRecord}
            />
          )}
          {activeTab === "posts" && (
            <PostBoard authFetch={authFetch} userId={userId} />
          )}
          {activeTab === "tasks" && (
            <TaskList userId={userId} onRestore={handleRestoreOrchestration} />
          )}
          {activeTab === "settings" && <AgentPrompts />}
        </div>
      </div>

      {userId && historyMode && (
        <HistoryModal
          userId={userId}
          isOpen={showHistory}
          onClose={() => setShowHistory(false)}
          onRestoreOrchestration={handleRestoreOrchestration}
          mode={historyMode}
        />
      )}
    </Layout>
  );
};
