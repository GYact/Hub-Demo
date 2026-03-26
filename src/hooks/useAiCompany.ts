import { useCallback } from "react";
import { useUserSetting } from "./useUserSetting";

/**
 * Hook to get the AI Company backend URL and authenticated fetch helper.
 * Derives the company API URL from the shared relay URL setting.
 */
export function useAiCompanyUrl() {
  const { value: relayUrl } = useUserSetting<string>(
    "claude_code_relay_url",
    "",
  );
  const { value: token } = useUserSetting<string>(
    "claude_code_relay_token",
    "",
  );
  const url = `${relayUrl.replace(/\/+$/, "")}/api/company`;

  const authFetch = useCallback(
    (path: string, init?: RequestInit) => {
      const headers: Record<string, string> = {
        ...(init?.headers as Record<string, string>),
      };
      if (token) headers["Authorization"] = `Bearer ${token}`;
      return fetch(`${url}${path}`, { ...init, headers });
    },
    [url, token],
  );

  return { baseUrl: url, authFetch };
}
