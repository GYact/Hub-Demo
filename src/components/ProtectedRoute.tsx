import { useEffect, useRef } from "react";
import { Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { registerPushSubscription } from "../lib/pushNotifications";

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export const ProtectedRoute = ({ children }: ProtectedRouteProps) => {
  const { user, isLoading } = useAuth();
  const pushRegistered = useRef(false);

  // Re-register push subscription on login to keep it fresh
  useEffect(() => {
    if (!user || pushRegistered.current) return;
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission !== "granted") return;
    pushRegistered.current = true;
    registerPushSubscription(user.id).catch(() => {});
  }, [user]);

  if (isLoading) {
    return (
      <div className="h-screen w-screen bg-slate-100 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 size={32} className="animate-spin text-slate-600" />
          <p className="text-slate-600">Authenticating...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};
