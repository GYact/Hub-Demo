import { supabase } from "./supabase";

interface GoogleTokens {
  access_token: string;
  refresh_token?: string;
  expires_at: number; // Unix timestamp in milliseconds
}

export interface GoogleAccountInfo {
  email: string;
  accessToken: string;
  expiresAt: number;
  isPrimary: boolean;
}

const GOOGLE_TOKEN_KEY = "hub_google_tokens";
const GOOGLE_ACCOUNTS_KEY = "hub_google_accounts";
const ACTIVE_GOOGLE_EMAIL_KEY = "hub_active_google_email";
const TOKEN_REFRESH_MARGIN = 10 * 60 * 1000; // Refresh 10 minutes before expiry
const REFRESH_CHECK_INTERVAL = 60 * 1000; // Check every 1 minute
const MAX_REFRESH_RETRIES = 3;
const RETRY_BASE_DELAY = 2000; // 2s, 4s, 8s exponential backoff

// === Primary account token management (backward compat) ===

export const storeGoogleTokens = (
  accessToken: string,
  refreshToken?: string,
  expiresIn: number = 3600,
): void => {
  const tokens: GoogleTokens = {
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_at: Date.now() + expiresIn * 1000,
  };

  localStorage.setItem(GOOGLE_TOKEN_KEY, JSON.stringify(tokens));
  localStorage.setItem("hub_google_access_token", accessToken);
};

export const getGoogleTokens = (): GoogleTokens | null => {
  try {
    const stored = localStorage.getItem(GOOGLE_TOKEN_KEY);
    if (!stored) return null;
    return JSON.parse(stored) as GoogleTokens;
  } catch (error) {
    console.error("Failed to parse Google tokens:", error);
    return null;
  }
};

export const isTokenExpired = (tokens: GoogleTokens | null): boolean => {
  if (!tokens) return true;
  return Date.now() >= tokens.expires_at - TOKEN_REFRESH_MARGIN;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const refreshGoogleToken = async (): Promise<string | null> => {
  const tokens = getGoogleTokens();

  if (!tokens?.refresh_token) {
    console.warn("No refresh token available");
    return null;
  }

  for (let attempt = 0; attempt < MAX_REFRESH_RETRIES; attempt++) {
    try {
      if (!supabase) {
        throw new Error("Supabase not configured");
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        throw new Error("No active session");
      }

      // Force Supabase to refresh the session which should include provider tokens
      const {
        data: { session: refreshedSession },
        error,
      } = await supabase.auth.refreshSession();

      if (error) throw error;

      if (refreshedSession?.provider_token) {
        storeGoogleTokens(
          refreshedSession.provider_token,
          refreshedSession.provider_refresh_token || tokens.refresh_token,
          3600,
        );
        return refreshedSession.provider_token;
      }

      // If Supabase doesn't give us a new provider token, use Edge Function
      const { data: refreshData, error: refreshError } =
        await supabase.functions.invoke("refresh_google_account_token", {
          body: { refresh_token: tokens.refresh_token },
        });

      if (refreshError) {
        throw new Error(
          `Token refresh failed: ${refreshError.message || refreshError}`,
        );
      }

      if (!refreshData?.access_token) {
        throw new Error("Token refresh returned no access token");
      }

      storeGoogleTokens(
        refreshData.access_token,
        tokens.refresh_token,
        refreshData.expires_in || 3600,
      );

      return refreshData.access_token;
    } catch (error) {
      console.error(
        `Google token refresh attempt ${attempt + 1}/${MAX_REFRESH_RETRIES} failed:`,
        error,
      );

      if (attempt < MAX_REFRESH_RETRIES - 1) {
        const delay = RETRY_BASE_DELAY * Math.pow(2, attempt);
        await sleep(delay);
        continue;
      }

      // All retries exhausted
      console.error(
        "All Google token refresh attempts failed, clearing tokens",
      );
      clearGoogleTokens();
      window.dispatchEvent(new Event("google-token-expired"));
      return null;
    }
  }

  return null;
};

export const getValidAccessToken = async (): Promise<string | null> => {
  const tokens = getGoogleTokens();
  if (!tokens) return null;
  if (!isTokenExpired(tokens)) return tokens.access_token;
  return await refreshGoogleToken();
};

export const clearGoogleTokens = (): void => {
  localStorage.removeItem(GOOGLE_TOKEN_KEY);
  localStorage.removeItem("hub_google_access_token");
};

// === Multi-account management ===

export const getGoogleAccounts = (): GoogleAccountInfo[] => {
  try {
    const stored = localStorage.getItem(GOOGLE_ACCOUNTS_KEY);
    if (!stored) return [];
    return JSON.parse(stored) as GoogleAccountInfo[];
  } catch {
    return [];
  }
};

export const storeGoogleAccount = (account: GoogleAccountInfo): void => {
  const accounts = getGoogleAccounts();
  const idx = accounts.findIndex((a) => a.email === account.email);
  if (idx >= 0) {
    accounts[idx] = account;
  } else {
    accounts.push(account);
  }
  localStorage.setItem(GOOGLE_ACCOUNTS_KEY, JSON.stringify(accounts));
};

export const removeGoogleAccountStorage = (email: string): void => {
  const accounts = getGoogleAccounts().filter((a) => a.email !== email);
  localStorage.setItem(GOOGLE_ACCOUNTS_KEY, JSON.stringify(accounts));
  if (getActiveGoogleEmail() === email) {
    const primary = accounts.find((a) => a.isPrimary);
    setActiveGoogleEmailStorage(primary?.email ?? null);
  }
};

export const getActiveGoogleEmail = (): string | null => {
  return localStorage.getItem(ACTIVE_GOOGLE_EMAIL_KEY);
};

export const setActiveGoogleEmailStorage = (email: string | null): void => {
  if (email) {
    localStorage.setItem(ACTIVE_GOOGLE_EMAIL_KEY, email);
  } else {
    localStorage.removeItem(ACTIVE_GOOGLE_EMAIL_KEY);
  }
};

export const refreshGoogleAccountToken = async (
  email: string,
): Promise<string | null> => {
  if (!supabase) return null;

  for (let attempt = 0; attempt < MAX_REFRESH_RETRIES; attempt++) {
    try {
      const { data, error } = await supabase.functions.invoke(
        "refresh_google_account_token",
        { body: { google_email: email } },
      );
      if (error) throw error;
      if (data?.access_token) {
        const accounts = getGoogleAccounts();
        const account = accounts.find((a) => a.email === email);
        if (account) {
          account.accessToken = data.access_token;
          account.expiresAt = Date.now() + (data.expires_in || 3600) * 1000;
          localStorage.setItem(GOOGLE_ACCOUNTS_KEY, JSON.stringify(accounts));
        }
        return data.access_token;
      }
      return null;
    } catch (error) {
      console.error(
        `Account token refresh attempt ${attempt + 1}/${MAX_REFRESH_RETRIES} failed for ${email}:`,
        error,
      );
      if (attempt < MAX_REFRESH_RETRIES - 1) {
        await sleep(RETRY_BASE_DELAY * Math.pow(2, attempt));
        continue;
      }
      return null;
    }
  }
  return null;
};

export const getValidAccountAccessToken = async (
  email: string,
): Promise<string | null> => {
  const accounts = getGoogleAccounts();
  const account = accounts.find((a) => a.email === email);
  if (!account) return null;

  if (Date.now() < account.expiresAt - TOKEN_REFRESH_MARGIN) {
    return account.accessToken;
  }

  if (account.isPrimary) {
    const token = await refreshGoogleToken();
    if (token) {
      const tokens = getGoogleTokens();
      storeGoogleAccount({
        ...account,
        accessToken: token,
        expiresAt: tokens?.expires_at ?? Date.now() + 3600 * 1000,
      });
    }
    return token;
  }

  return await refreshGoogleAccountToken(email);
};

export const clearAllGoogleAccounts = (): void => {
  localStorage.removeItem(GOOGLE_ACCOUNTS_KEY);
  localStorage.removeItem(ACTIVE_GOOGLE_EMAIL_KEY);
};

// === Restore accounts from Supabase (cross-device recovery) ===

export const restoreGoogleAccountsFromSupabase = async (): Promise<boolean> => {
  if (!supabase) return false;

  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.user) return false;

    // Fetch valid accounts from user_google_tokens table
    const { data: rows, error } = await supabase
      .from("user_google_tokens")
      .select("google_email, is_primary")
      .eq("is_valid", true);

    if (error || !rows || rows.length === 0) {
      console.warn(
        "restoreGoogleAccountsFromSupabase: no valid accounts found",
        error,
      );
      return false;
    }

    let restored = false;

    for (const row of rows) {
      try {
        // Refresh access_token via Edge Function
        const { data, error: invokeError } = await supabase.functions.invoke(
          "refresh_google_account_token",
          { body: { google_email: row.google_email } },
        );

        if (invokeError || !data?.access_token) {
          console.warn(
            `restoreGoogleAccountsFromSupabase: failed to refresh token for ${row.google_email}`,
            invokeError,
          );
          continue;
        }

        const expiresIn = data.expires_in || 3600;
        const account: GoogleAccountInfo = {
          email: row.google_email,
          accessToken: data.access_token,
          expiresAt: Date.now() + expiresIn * 1000,
          isPrimary: row.is_primary ?? false,
        };

        // Store in localStorage via existing helpers
        storeGoogleAccount(account);

        // Also update primary token storage for backward compat
        if (account.isPrimary) {
          storeGoogleTokens(data.access_token, undefined, expiresIn);
        }

        restored = true;
      } catch (err) {
        console.error(
          `restoreGoogleAccountsFromSupabase: error restoring ${row.google_email}`,
          err,
        );
      }
    }

    return restored;
  } catch (err) {
    console.error("restoreGoogleAccountsFromSupabase: unexpected error", err);
    return false;
  }
};

// === Token refresh timer (handles all accounts) ===

export const startTokenRefreshTimer = (): (() => void) => {
  let intervalId: number | null = null;

  const checkAndRefresh = async () => {
    // Refresh primary account
    const tokens = getGoogleTokens();
    if (tokens && isTokenExpired(tokens)) {
      await refreshGoogleToken();
    }

    // Refresh additional accounts
    const accounts = getGoogleAccounts();
    for (const account of accounts) {
      if (
        !account.isPrimary &&
        Date.now() >= account.expiresAt - TOKEN_REFRESH_MARGIN
      ) {
        await refreshGoogleAccountToken(account.email);
      }
    }
  };

  checkAndRefresh();
  intervalId = window.setInterval(checkAndRefresh, REFRESH_CHECK_INTERVAL);

  return () => {
    if (intervalId) clearInterval(intervalId);
  };
};
