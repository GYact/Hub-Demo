/**
 * Push notification helper for AI Company.
 * Calls the send_push Supabase Edge Function to deliver web push notifications.
 */

const env = () => ({
  url: process.env.SUPABASE_URL || "",
  key: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
});

let cachedUserId: string | null = null;

async function getUserId(): Promise<string | null> {
  if (cachedUserId) return cachedUserId;
  const { url, key } = env();
  if (!url || !key) return null;

  try {
    const res = await fetch(
      `${url}/rest/v1/ai_company_orchestrations?select=user_id&limit=1`,
      {
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
        },
      },
    );
    if (res.ok) {
      const rows = (await res.json()) as { user_id: string }[];
      if (rows.length > 0) {
        cachedUserId = rows[0].user_id;
        return cachedUserId;
      }
    }
    // Fallback: first auth user
    const authRes = await fetch(
      `${url}/auth/v1/admin/users?page=1&per_page=1`,
      {
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
        },
      },
    );
    if (authRes.ok) {
      const data = (await authRes.json()) as { users: { id: string }[] };
      if (data.users?.length > 0) {
        cachedUserId = data.users[0].id;
        return cachedUserId;
      }
    }
  } catch (e) {
    console.error("[pushNotify] Failed to resolve userId:", e);
  }
  return null;
}

export async function sendAiCompanyPush(
  title: string,
  body: string,
  url = "/ai-company",
  tag = "ai-company-question",
): Promise<void> {
  const { url: supabaseUrl, key } = env();
  if (!supabaseUrl || !key) {
    console.warn("[pushNotify] Supabase env not configured, skipping push");
    return;
  }

  const userId = await getUserId();
  if (!userId) {
    console.warn("[pushNotify] No userId found, skipping push");
    return;
  }

  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/send_push`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        userId,
        title,
        body,
        url,
        tag,
        category: "pushAiCompany",
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error("[pushNotify] send_push failed:", res.status, errText);
    } else {
      const data = await res.json();
      console.log("[pushNotify] push sent:", data);
    }
  } catch (e) {
    console.error("[pushNotify] push error:", e);
  }
}
