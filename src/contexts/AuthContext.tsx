import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
  useRef,
  useCallback,
} from "react";
import { AlertDialog } from "../components";
import type { User, Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import {
  ensureOutboxProcessed,
  setSyncUserId,
  syncAll,
  syncMenuItems,
} from "../lib/offlineSync";
import { runLocalStorageMigration } from "../lib/localStorageMigration";
import { migrateSplitUserSettings } from "../lib/offlineData";
import { rescheduleAllNotifications } from "../lib/taskNotifications";
import {
  storeGoogleTokens,
  getGoogleTokens,
  clearGoogleTokens,
  startTokenRefreshTimer,
  getValidAccessToken,
  type GoogleAccountInfo,
  getGoogleAccounts,
  storeGoogleAccount,
  removeGoogleAccountStorage,
  getActiveGoogleEmail,
  setActiveGoogleEmailStorage,
  getValidAccountAccessToken,
  clearAllGoogleAccounts,
  restoreGoogleAccountsFromSupabase,
} from "../lib/googleTokenRefresh";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  googleAccessToken: string | null;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (
    email: string,
    password: string,
  ) => Promise<{ error: Error | null }>;
  signUpWithEmail: (
    email: string,
    password: string,
  ) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  hasGoogleCalendarAccess: boolean;
  connectGoogleCalendar: () => Promise<void>;
  // Multi-account
  googleAccounts: GoogleAccountInfo[];
  activeGoogleEmail: string | null;
  setActiveGoogleAccount: (email: string) => void;
  connectAdditionalGoogleAccount: () => void;
  removeGoogleAccount: (email: string) => Promise<void>;
  addGoogleAccount: (account: GoogleAccountInfo) => void;
  signInAsDemo: () => Promise<{ error: Error | null }>;
  isDemoMode: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

// Get the appropriate redirect URL based on environment
const getRedirectUrl = () => {
  return window.location.origin;
};

// Demo mode — bypass email whitelist, allow shared demo account login
const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === "true";

// Allowed email addresses for login (comma-separated in env var)
const ALLOWED_EMAILS =
  (import.meta.env.VITE_ALLOWED_EMAILS as string | undefined)
    ?.split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean) ?? [];

const isEmailAllowed = (email: string | undefined): boolean => {
  if (DEMO_MODE) return true;
  if (!email) return false;
  return ALLOWED_EMAILS.includes(email.toLowerCase());
};

// Google API scopes
const GOOGLE_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar";
const GOOGLE_DRIVE_SCOPE = "https://www.googleapis.com/auth/drive";
const GOOGLE_GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.modify";
const ALL_GOOGLE_SCOPES = `openid email profile ${GOOGLE_CALENDAR_SCOPE} ${GOOGLE_DRIVE_SCOPE} ${GOOGLE_GMAIL_SCOPE}`;

export const AuthProvider = ({ children }: AuthProviderProps) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [googleAccessToken, setGoogleAccessToken] = useState<string | null>(
    null,
  );
  const [hasGoogleCalendarAccess, setHasGoogleCalendarAccess] = useState(false);
  const [accessDeniedAlert, setAccessDeniedAlert] = useState(false);
  const refreshTimerCleanup = useRef<(() => void) | null>(null);

  // Multi-account state
  const [googleAccounts, setGoogleAccounts] = useState<GoogleAccountInfo[]>(
    () => getGoogleAccounts(),
  );
  const [activeGoogleEmail, setActiveGoogleEmail] = useState<string | null>(
    () => getActiveGoogleEmail(),
  );

  // Add a Google account to the accounts list
  const addGoogleAccount = useCallback((account: GoogleAccountInfo) => {
    storeGoogleAccount(account);
    setGoogleAccounts(getGoogleAccounts());
    // If no active email set, activate this account
    if (!getActiveGoogleEmail()) {
      setActiveGoogleEmailStorage(account.email);
      setActiveGoogleEmail(account.email);
    }
  }, []);

  // Remove a non-primary Google account
  const removeGoogleAccount = useCallback(
    async (email: string) => {
      const accounts = getGoogleAccounts();
      const account = accounts.find((a) => a.email === email);
      if (!account || account.isPrimary) return;

      // Invalidate token server-side
      if (supabase) {
        await supabase
          .from("user_google_tokens")
          .update({ is_valid: false, updated_at: new Date().toISOString() })
          .eq("user_id", user?.id ?? "")
          .eq("google_email", email);
      }

      removeGoogleAccountStorage(email);
      const updated = getGoogleAccounts();
      setGoogleAccounts(updated);

      // If removed was active, switch to primary
      if (activeGoogleEmail === email) {
        const primary = updated.find((a) => a.isPrimary);
        const newActive = primary?.email ?? updated[0]?.email ?? null;
        setActiveGoogleEmailStorage(newActive);
        setActiveGoogleEmail(newActive);
      }
    },
    [user?.id, activeGoogleEmail],
  );

  // Set the active Google account
  const setActiveGoogleAccount = useCallback((email: string) => {
    setActiveGoogleEmailStorage(email);
    setActiveGoogleEmail(email);

    // Update googleAccessToken for backward compat
    const accounts = getGoogleAccounts();
    const account = accounts.find((a) => a.email === email);
    if (account) {
      setGoogleAccessToken(account.accessToken);
      localStorage.setItem("hub_google_access_token", account.accessToken);
    }
  }, []);

  // Connect an additional Google account via OAuth code flow
  const connectAdditionalGoogleAccount = useCallback(() => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (!clientId) {
      console.error("VITE_GOOGLE_CLIENT_ID not configured");
      return;
    }

    // CSRF state
    const state = crypto.randomUUID();
    sessionStorage.setItem("google_oauth_state", state);

    const redirectUri = `${window.location.origin}/auth/google/callback`;
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: ALL_GOOGLE_SCOPES,
      access_type: "offline",
      prompt: "consent",
      state,
    });

    window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  }, []);

  // Update googleAccessToken when activeGoogleEmail changes
  useEffect(() => {
    if (!activeGoogleEmail || !hasGoogleCalendarAccess) return;

    const accounts = getGoogleAccounts();
    const account = accounts.find((a) => a.email === activeGoogleEmail);
    if (account) {
      // Try to get a valid token (refresh if needed)
      getValidAccountAccessToken(activeGoogleEmail).then((token) => {
        if (token) {
          setGoogleAccessToken(token);
          localStorage.setItem("hub_google_access_token", token);
        }
      });
    }
  }, [activeGoogleEmail, hasGoogleCalendarAccess]);

  useEffect(() => {
    setSyncUserId(user?.id ?? null);
    if (user && typeof navigator !== "undefined" && navigator.onLine) {
      ensureOutboxProcessed().catch((err) => {
        console.error("Outbox sync failed:", err);
      });
      syncMenuItems().catch((err) =>
        console.error("Initial menu sync failed:", err),
      );
    }
    runLocalStorageMigration(user?.id ?? null).catch((err) => {
      console.error("LocalStorage migration failed:", err);
    });
    migrateSplitUserSettings(user?.id ?? null).catch((err) => {
      console.error("Split settings migration failed:", err);
    });
  }, [user]);

  useEffect(() => {
    if (!user) return;
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission !== "granted") return;

    rescheduleAllNotifications(user.id).catch((err) => {
      console.error("Notification reschedule failed:", err);
    });
  }, [user]);

  useEffect(() => {
    const handleOnline = () => {
      if (user) {
        syncAll().catch((err) => console.error("Online sync failed:", err));
      }
    };
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [user]);

  // Multi-tab logout synchronization via Supabase's native storage key
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === "sb-auth-token" && e.newValue === null && user) {
        setSession(null);
        setUser(null);
        setGoogleAccessToken(null);
        setHasGoogleCalendarAccess(false);
      }
    };

    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, [user]);

  // Start Google token auto-refresh timer
  useEffect(() => {
    if (user && hasGoogleCalendarAccess) {
      refreshTimerCleanup.current = startTokenRefreshTimer();

      return () => {
        if (refreshTimerCleanup.current) {
          refreshTimerCleanup.current();
          refreshTimerCleanup.current = null;
        }
      };
    }
  }, [user, hasGoogleCalendarAccess]);

  useEffect(() => {
    if (!supabase) {
      setIsLoading(false);
      return;
    }

    let mounted = true;

    // Clean up legacy cache key (no longer used)
    localStorage.removeItem("hub_cached_session");

    // Initialize auth state
    // Supabase client handles session persistence via sb-auth-token in localStorage.
    // We only need to call getSession() and let onAuthStateChange handle the rest.
    const initAuth = async () => {
      if (!supabase) {
        setIsLoading(false);
        return;
      }

      try {
        const hash = window.location.hash;
        const hasAuthParams =
          hash.includes("access_token") || hash.includes("error");

        // If URL has auth params, let onAuthStateChange handle the callback
        if (hasAuthParams) {
          return;
        }

        const {
          data: { session: existingSession },
          error,
        } = await supabase.auth.getSession();

        if (error) {
          console.error("Error getting session:", error);
          if (mounted) {
            setIsLoading(false);
          }
          return;
        }

        if (mounted) {
          if (
            existingSession?.user &&
            !isEmailAllowed(existingSession.user.email)
          ) {
            await supabase.auth.signOut();
            setSession(null);
            setUser(null);
            setIsLoading(false);
            return;
          }

          setSession(existingSession);
          setUser(existingSession?.user ?? null);
          setIsLoading(false);
        }
      } catch (error) {
        console.error("Error initializing auth:", error);
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      if (event === "TOKEN_REFRESHED" && newSession) {
        // Sync Google tokens when Supabase session refreshes
        if (newSession.provider_token) {
          storeGoogleTokens(
            newSession.provider_token,
            newSession.provider_refresh_token || undefined,
            3600,
          );
          if (mounted) {
            setGoogleAccessToken(newSession.provider_token);
            setHasGoogleCalendarAccess(true);
          }
        } else if (hasGoogleCalendarAccess) {
          // Supabase refreshed but no provider_token - proactively refresh Google token
          getValidAccessToken().then((token) => {
            if (mounted && token) {
              setGoogleAccessToken(token);
            }
          });
        }
      }

      if (event === "SIGNED_OUT") {
        if (mounted) {
          setSession(null);
          setUser(null);
          setGoogleAccessToken(null);
          setHasGoogleCalendarAccess(false);
          setGoogleAccounts([]);
          setActiveGoogleEmail(null);
          localStorage.removeItem("hub_google_access_token");
          setIsLoading(false);
        }
        return;
      }

      if (mounted) {
        if (newSession?.user && !isEmailAllowed(newSession.user.email)) {
          if (supabase) await supabase.auth.signOut();
          setSession(null);
          setUser(null);
          setGoogleAccessToken(null);
          setHasGoogleCalendarAccess(false);
          setIsLoading(false);
          setAccessDeniedAlert(true);
          return;
        }

        setSession(newSession);
        setUser(newSession?.user ?? null);

        if (newSession?.provider_token) {
          storeGoogleTokens(
            newSession.provider_token,
            newSession.provider_refresh_token || undefined,
            3600,
          );

          setGoogleAccessToken(newSession.provider_token);
          setHasGoogleCalendarAccess(true);

          // Register as primary account (sync expiresAt with storeGoogleTokens)
          const primaryEmail =
            newSession.user?.user_metadata?.email ||
            newSession.user?.email ||
            "unknown";
          const storedTokens = getGoogleTokens();
          const primaryAccount: GoogleAccountInfo = {
            email: primaryEmail,
            accessToken: newSession.provider_token,
            expiresAt: storedTokens?.expires_at ?? Date.now() + 3600 * 1000,
            isPrimary: true,
          };
          storeGoogleAccount(primaryAccount);
          setGoogleAccounts(getGoogleAccounts());

          if (!getActiveGoogleEmail()) {
            setActiveGoogleEmailStorage(primaryEmail);
            setActiveGoogleEmail(primaryEmail);
          }

          // Store refresh token server-side
          if (newSession.provider_refresh_token && supabase) {
            supabase.functions
              .invoke("store_google_tokens", {
                body: {
                  refresh_token: newSession.provider_refresh_token,
                  google_email: primaryEmail,
                  scopes: ALL_GOOGLE_SCOPES,
                },
              })
              .catch((err) =>
                console.error("Failed to store Google tokens:", err),
              );
          }
        } else {
          const tokens = getGoogleTokens();
          if (tokens) {
            getValidAccessToken()
              .then((validToken) => {
                if (validToken) {
                  setGoogleAccessToken(validToken);
                  setHasGoogleCalendarAccess(true);
                } else {
                  setHasGoogleCalendarAccess(false);
                }
              })
              .catch(() => {
                setHasGoogleCalendarAccess(false);
              });

            if (tokens.refresh_token && supabase) {
              supabase.functions
                .invoke("store_google_tokens", {
                  body: {
                    refresh_token: tokens.refresh_token,
                    scopes: ALL_GOOGLE_SCOPES,
                  },
                })
                .catch((err) =>
                  console.error("Failed to store Google tokens:", err),
                );
            }
          } else if (getGoogleAccounts().length === 0) {
            // No tokens in localStorage — try restoring from Supabase (cross-device recovery)
            restoreGoogleAccountsFromSupabase()
              .then((restored) => {
                if (mounted && restored) {
                  const restoredAccounts = getGoogleAccounts();
                  setGoogleAccounts(restoredAccounts);
                  const primary = restoredAccounts.find((a) => a.isPrimary);
                  const activeEmail =
                    primary?.email ?? restoredAccounts[0]?.email ?? null;
                  if (activeEmail) {
                    setActiveGoogleEmailStorage(activeEmail);
                    setActiveGoogleEmail(activeEmail);
                  }
                  // Primary token was restored by restoreGoogleAccountsFromSupabase
                  const restoredTokens = getGoogleTokens();
                  if (restoredTokens) {
                    setGoogleAccessToken(restoredTokens.access_token);
                    setHasGoogleCalendarAccess(true);
                  }
                } else if (mounted) {
                  setHasGoogleCalendarAccess(false);
                }
              })
              .catch(() => {
                if (mounted) setHasGoogleCalendarAccess(false);
              });
          } else {
            setHasGoogleCalendarAccess(false);
          }

          // Restore accounts from localStorage
          setGoogleAccounts(getGoogleAccounts());
          setActiveGoogleEmail(getActiveGoogleEmail());
        }

        setIsLoading(false);

        if (
          event === "SIGNED_IN" &&
          window.location.hash.includes("access_token")
        ) {
          const cleanUrl = window.location.origin + window.location.pathname;
          window.history.replaceState(null, "", cleanUrl);
        }
      }
    });

    initAuth();

    const handleTokenExpired = () => {
      if (mounted) {
        setGoogleAccessToken(null);
        setHasGoogleCalendarAccess(false);
        clearGoogleTokens();
      }
    };

    window.addEventListener("google-token-expired", handleTokenExpired);

    return () => {
      mounted = false;
      subscription.unsubscribe();
      window.removeEventListener("google-token-expired", handleTokenExpired);
    };
  }, []);

  const signInWithGoogle = async () => {
    if (!supabase) return;

    const redirectUrl = getRedirectUrl();

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: redirectUrl,
        scopes: ALL_GOOGLE_SCOPES,
        queryParams: {
          access_type: "offline",
          prompt: "consent",
        },
      },
    });

    if (error) {
      console.error("Google sign in error:", error);
    }
  };

  const connectGoogleCalendar = async () => {
    if (!supabase) return;

    localStorage.removeItem("hub_google_access_token");
    setGoogleAccessToken(null);
    setHasGoogleCalendarAccess(false);

    const redirectUrl = getRedirectUrl();

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: redirectUrl,
        scopes: ALL_GOOGLE_SCOPES,
        queryParams: {
          access_type: "offline",
          prompt: "consent",
        },
      },
    });

    if (error) {
      console.error("Google Services connection error:", error);
    }
  };

  const signInWithEmail = async (email: string, password: string) => {
    if (!supabase) return { error: new Error("Supabase not configured") };

    if (!isEmailAllowed(email)) {
      return {
        error: new Error("Access denied. This email is not authorized."),
      };
    }

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    return { error: error ? new Error(error.message) : null };
  };

  const signUpWithEmail = async (email: string, password: string) => {
    if (!supabase) return { error: new Error("Supabase not configured") };

    if (!isEmailAllowed(email)) {
      return {
        error: new Error("Access denied. This email is not authorized."),
      };
    }

    const { error } = await supabase.auth.signUp({
      email,
      password,
    });

    return { error: error ? new Error(error.message) : null };
  };

  const signInAsDemo = async () => {
    if (!supabase) return { error: new Error("Supabase not configured") };
    const demoEmail = import.meta.env.VITE_DEMO_EMAIL as string | undefined;
    const demoPassword = import.meta.env.VITE_DEMO_PASSWORD as
      | string
      | undefined;
    if (!demoEmail || !demoPassword) {
      return { error: new Error("Demo credentials not configured") };
    }
    const { error } = await supabase.auth.signInWithPassword({
      email: demoEmail,
      password: demoPassword,
    });
    return { error: error ? new Error(error.message) : null };
  };

  const signOut = async () => {
    if (!supabase) return;
    setSession(null);
    setUser(null);
    setGoogleAccessToken(null);
    setHasGoogleCalendarAccess(false);
    setGoogleAccounts([]);
    setActiveGoogleEmail(null);

    clearGoogleTokens();
    clearAllGoogleAccounts();

    if (refreshTimerCleanup.current) {
      refreshTimerCleanup.current();
      refreshTimerCleanup.current = null;
    }

    try {
      await supabase.auth.signOut({ scope: "local" });
    } catch (error) {
      console.error("Local sign out failed:", error);
    }
    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.error("Server sign out failed:", error);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        isLoading,
        googleAccessToken,
        signInWithGoogle,
        signInWithEmail,
        signUpWithEmail,
        signOut,
        hasGoogleCalendarAccess,
        connectGoogleCalendar,
        googleAccounts,
        activeGoogleEmail,
        setActiveGoogleAccount,
        connectAdditionalGoogleAccount,
        removeGoogleAccount,
        addGoogleAccount,
        signInAsDemo,
        isDemoMode: DEMO_MODE,
      }}
    >
      {children}
      <AlertDialog
        isOpen={accessDeniedAlert}
        type="error"
        title="Access Denied"
        message="This account is not authorized to use this application."
        onClose={() => setAccessDeniedAlert(false)}
      />
    </AuthContext.Provider>
  );
};
