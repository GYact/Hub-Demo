import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, CheckCircle, XCircle, AlertTriangle } from "lucide-react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import { storeGoogleAccount } from "../lib/googleTokenRefresh";

type CallbackStatus = "processing" | "success" | "warning" | "error";

export const GoogleOAuthCallbackPage = () => {
  const navigate = useNavigate();
  const { addGoogleAccount } = useAuth();
  const [status, setStatus] = useState<CallbackStatus>("processing");
  const [errorMessage, setErrorMessage] = useState("");
  const [missingScopes, setMissingScopes] = useState<string[]>([]);

  useEffect(() => {
    const handleCallback = async () => {
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");
      const state = params.get("state");
      const error = params.get("error");

      if (error) {
        setStatus("error");
        setErrorMessage(
          params.get("error_description") || "Authentication was cancelled.",
        );
        setTimeout(() => navigate("/settings"), 3000);
        return;
      }

      if (!code) {
        setStatus("error");
        setErrorMessage("No authorization code received.");
        setTimeout(() => navigate("/settings"), 3000);
        return;
      }

      // CSRF verification
      const savedState = sessionStorage.getItem("google_oauth_state");
      sessionStorage.removeItem("google_oauth_state");

      if (!state || state !== savedState) {
        setStatus("error");
        setErrorMessage("Invalid state parameter. Please try again.");
        setTimeout(() => navigate("/settings"), 3000);
        return;
      }

      if (!supabase) {
        setStatus("error");
        setErrorMessage("Supabase not configured.");
        setTimeout(() => navigate("/settings"), 3000);
        return;
      }

      try {
        const redirectUri = `${window.location.origin}/auth/google/callback`;
        const { data, error: invokeError } = await supabase.functions.invoke(
          "exchange_google_code",
          {
            body: { code, redirect_uri: redirectUri },
          },
        );

        if (invokeError) throw invokeError;

        if (data?.access_token && data?.google_email) {
          const account = {
            email: data.google_email,
            accessToken: data.access_token,
            expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
            isPrimary: false,
          };
          storeGoogleAccount(account);
          addGoogleAccount(account);

          if (
            data.missing_scopes &&
            Array.isArray(data.missing_scopes) &&
            data.missing_scopes.length > 0
          ) {
            setMissingScopes(data.missing_scopes);
            setStatus("warning");
            setTimeout(() => navigate("/settings"), 5000);
          } else {
            setStatus("success");
            setTimeout(() => navigate("/settings"), 1500);
          }
        } else {
          throw new Error("Invalid response from server.");
        }
      } catch (err) {
        console.error("OAuth callback error:", err);
        setStatus("error");
        setErrorMessage(
          err instanceof Error ? err.message : "Failed to connect account.",
        );
        setTimeout(() => navigate("/settings"), 3000);
      }
    };

    handleCallback();
  }, [navigate, addGoogleAccount]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--color-bg-primary)]">
      <div className="neu-card p-8 max-w-sm w-full text-center">
        {status === "processing" && (
          <>
            <Loader2
              size={48}
              className="animate-spin mx-auto neu-text-secondary mb-4"
            />
            <h2 className="text-lg font-semibold neu-text-primary">
              Connecting Account...
            </h2>
            <p className="mt-2 text-sm neu-text-secondary">
              Please wait while we connect your Google account.
            </p>
          </>
        )}

        {status === "success" && (
          <>
            <CheckCircle size={48} className="mx-auto text-emerald-500 mb-4" />
            <h2 className="text-lg font-semibold neu-text-primary">
              Account Connected!
            </h2>
            <p className="mt-2 text-sm neu-text-secondary">
              Redirecting to Settings...
            </p>
          </>
        )}

        {status === "warning" && (
          <>
            <AlertTriangle size={48} className="mx-auto text-amber-500 mb-4" />
            <h2 className="text-lg font-semibold neu-text-primary">
              Account Connected (Partial Permissions)
            </h2>
            <p className="mt-2 text-sm text-amber-600">
              Missing permissions: {missingScopes.join(", ")}
            </p>
            <p className="mt-1 text-sm neu-text-secondary">
              Some features may not work. Please reconnect and grant all
              permissions on the Google consent screen.
            </p>
            <p className="mt-2 text-sm neu-text-secondary">
              Redirecting to Settings...
            </p>
          </>
        )}

        {status === "error" && (
          <>
            <XCircle size={48} className="mx-auto text-red-500 mb-4" />
            <h2 className="text-lg font-semibold neu-text-primary">
              Connection Failed
            </h2>
            <p className="mt-2 text-sm text-red-600">{errorMessage}</p>
            <p className="mt-2 text-sm neu-text-secondary">
              Redirecting to Settings...
            </p>
          </>
        )}
      </div>
    </div>
  );
};
