import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { AuthProvider } from "./contexts/AuthContext";
import { UndoRedoProvider } from "./contexts/UndoRedoContext";
import { NotificationProvider } from "./contexts/NotificationContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { LoginPage } from "./pages/LoginPage";
import { AuthCallbackPage } from "./pages/AuthCallbackPage";
import { GoogleOAuthCallbackPage } from "./pages/GoogleOAuthCallbackPage";
import {
  PWAUpdatePrompt,
  triggerPWAUpdate,
  MainLayout,
  ErrorBoundary,
} from "./components";
import { LayoutProvider } from "./contexts/LayoutContext";
import "./index.css";
import { registerSW } from "virtual:pwa-register";

// Lazy-loaded pages (route-level code splitting)
const App = lazy(() => import("./App").then((m) => ({ default: m.App })));
const HubPage = lazy(() =>
  import("./pages/HubPage").then((m) => ({ default: m.HubPage })),
);
const SettingsPage = lazy(() =>
  import("./pages/SettingsPage").then((m) => ({ default: m.SettingsPage })),
);
const MemosPage = lazy(() =>
  import("./pages/MemosPage").then((m) => ({ default: m.MemosPage })),
);
const ProfilePage = lazy(() =>
  import("./pages/ProfilePage").then((m) => ({ default: m.ProfilePage })),
);
const ClientsPage = lazy(() =>
  import("./pages/ClientsPage").then((m) => ({ default: m.ClientsPage })),
);
const MoneyPage = lazy(() =>
  import("./pages/MoneyPage").then((m) => ({ default: m.MoneyPage })),
);
const JournalPage = lazy(() =>
  import("./pages/JournalPage").then((m) => ({ default: m.JournalPage })),
);
const TasksPage = lazy(() =>
  import("./pages/TasksPage").then((m) => ({ default: m.TasksPage })),
);
const CalendarPage = lazy(() =>
  import("./pages/CalendarPage").then((m) => ({ default: m.CalendarPage })),
);
const ProjectsPage = lazy(() =>
  import("./pages/ProjectsPage").then((m) => ({ default: m.ProjectsPage })),
);
const AiAssistantPage = lazy(() =>
  import("./pages/AiAssistantPage").then((m) => ({
    default: m.AiAssistantPage,
  })),
);
const AiHubPage = lazy(() =>
  import("./pages/AiHubPage").then((m) => ({ default: m.AiHubPage })),
);
const AiAutomationPage = lazy(() =>
  import("./pages/AiAutomationPage").then((m) => ({
    default: m.AiAutomationPage,
  })),
);
const AiNotifyBoxPage = lazy(() =>
  import("./pages/AiNotifyBoxPage").then((m) => ({
    default: m.AiNotifyBoxPage,
  })),
);
const SmartHomePage = lazy(() =>
  import("./pages/SmartHomePage").then((m) => ({ default: m.SmartHomePage })),
);
const AiChannelPage = lazy(() =>
  import("./pages/AiChannelPage").then((m) => ({
    default: m.AiChannelPage,
  })),
);
const MediaPage = lazy(() =>
  import("./pages/MediaPage").then((m) => ({ default: m.MediaPage })),
);
const DataPage = lazy(() =>
  import("./pages/DataPage").then((m) => ({ default: m.DataPage })),
);
const GoogleDrivePage = lazy(() =>
  import("./pages/GoogleDrivePage").then((m) => ({
    default: m.GoogleDrivePage,
  })),
);
const HealthAiPage = lazy(() =>
  import("./pages/HealthAiPage").then((m) => ({
    default: m.HealthAiPage,
  })),
);
const InvestPage = lazy(() =>
  import("./pages/InvestPage").then((m) => ({
    default: m.InvestPage,
  })),
);
const ClaudeCodePage = lazy(() =>
  import("./pages/ClaudeCodePage").then((m) => ({
    default: m.ClaudeCodePage,
  })),
);
const AiCompanyPage = lazy(() =>
  import("./pages/AiCompanyPage").then((m) => ({
    default: m.AiCompanyPage,
  })),
);

const PageFallback = () => (
  <div className="h-full flex items-center justify-center">
    <Loader2 size={32} className="animate-spin neu-text-secondary" />
  </div>
);

// Register Service Worker for PWA
registerSW({
  onNeedRefresh() {
    // Trigger the React-based update prompt
    triggerPWAUpdate();
  },
  onOfflineReady() {
    // App is ready to work offline
  },
});

// Component to handle root route - check for OAuth callback
const RootRedirect = () => {
  // Check if this is an OAuth callback (has hash with access_token)
  const hash = window.location.hash;
  if (hash.includes("access_token") || hash.includes("error")) {
    // This is an OAuth callback, render the callback handler
    return <AuthCallbackPage />;
  }
  // Normal navigation, redirect to home
  return <Navigate to="/home" replace />;
};

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Root element not found");

createRoot(rootElement).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <NotificationProvider>
            <UndoRedoProvider>
              <PWAUpdatePrompt />
              <LayoutProvider>
                <Suspense fallback={<PageFallback />}>
                  <Routes>
                    <Route path="/login" element={<LoginPage />} />
                    <Route
                      path="/auth/callback"
                      element={<AuthCallbackPage />}
                    />
                    <Route
                      path="/auth/google/callback"
                      element={<GoogleOAuthCallbackPage />}
                    />
                    <Route path="/" element={<RootRedirect />} />

                    {/* Authenticated Routes with Persistent Layout */}
                    <Route
                      element={
                        <ProtectedRoute>
                          <MainLayout />
                        </ProtectedRoute>
                      }
                    >
                      <Route path="/home" element={<HubPage />} />
                      <Route path="/hub" element={<App />} />
                      <Route path="/settings" element={<SettingsPage />} />
                      <Route path="/memos" element={<MemosPage />} />
                      <Route path="/profile" element={<ProfilePage />} />
                      <Route path="/community" element={<ClientsPage />} />
                      <Route path="/finance" element={<MoneyPage />} />
                      <Route path="/journal" element={<JournalPage />} />
                      <Route path="/tasks" element={<TasksPage />} />
                      <Route path="/calendar" element={<CalendarPage />} />
                      <Route path="/projects" element={<ProjectsPage />} />
                      <Route
                        path="/projects/client/:clientId"
                        element={<ProjectsPage />}
                      />
                      <Route
                        path="/projects/:projectId"
                        element={<ProjectsPage />}
                      />
                      <Route path="/ai" element={<AiHubPage />} />
                      <Route path="/ai/hub-ai" element={<AiAssistantPage />} />
                      <Route
                        path="/ai/automation"
                        element={<AiAutomationPage />}
                      />
                      <Route
                        path="/ai/notify-box"
                        element={<AiNotifyBoxPage />}
                      />
                      <Route
                        path="/ai/smart-home"
                        element={<SmartHomePage />}
                      />
                      <Route path="/ai/channel" element={<AiChannelPage />} />
                      <Route path="/ai/health" element={<HealthAiPage />} />
                      <Route
                        path="/ai/claude-code"
                        element={<ClaudeCodePage />}
                      />
                      <Route path="/ai/company" element={<AiCompanyPage />} />
                      <Route path="/invest" element={<InvestPage />} />
                      <Route path="/media" element={<MediaPage />} />
                      <Route path="/drive" element={<DataPage />} />
                      <Route
                        path="/drive/google"
                        element={<GoogleDrivePage />}
                      />
                    </Route>
                  </Routes>
                </Suspense>
              </LayoutProvider>
            </UndoRedoProvider>
          </NotificationProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
);
