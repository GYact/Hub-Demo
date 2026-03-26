import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, handleCors } from "../_shared/cors.ts";

const SWITCHBOT_API_BASE = "https://api.switch-bot.com/v1.1";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
  Deno.env.get("SERVICE_ROLE_KEY") ??
  "";

type SwitchBotCredentials = {
  user_id: string;
  token: string;
  secret: string;
};

type SwitchBotDevice = {
  deviceId: string;
  deviceName: string;
  deviceType: string;
  hubDeviceId?: string;
};

const generateSignature = async (
  token: string,
  secret: string,
  t: string,
  nonce: string,
): Promise<string> => {
  const data = token + t + nonce;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
};

const makeSwitchBotRequest = async (
  token: string,
  secret: string,
  endpoint: string,
): Promise<unknown> => {
  const t = Date.now().toString();
  const nonce = crypto.randomUUID();
  const sign = await generateSignature(token, secret, t, nonce);

  const response = await fetch(`${SWITCHBOT_API_BASE}${endpoint}`, {
    method: "GET",
    headers: {
      Authorization: token,
      sign,
      t,
      nonce,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`SwitchBot API error: ${response.status} - ${errorText}`);
  }

  return response.json();
};

const processUser = async (
  supabaseAdmin: ReturnType<typeof createClient>,
  cred: SwitchBotCredentials,
): Promise<{ devices_recorded: number; error?: string }> => {
  try {
    // 1. Get device list
    const devicesRes = (await makeSwitchBotRequest(
      cred.token,
      cred.secret,
      "/devices",
    )) as {
      statusCode: number;
      body: { deviceList?: SwitchBotDevice[]; infraredRemoteList?: unknown[] };
    };

    if (devicesRes.statusCode !== 100) {
      // Mark credentials as invalid
      await supabaseAdmin
        .from("switchbot_credentials")
        .update({ is_valid: false })
        .eq("user_id", cred.user_id);
      return { devices_recorded: 0, error: "Invalid credentials or API error" };
    }

    const deviceList = devicesRes.body?.deviceList ?? [];
    if (deviceList.length === 0) {
      return { devices_recorded: 0 };
    }

    // 2. Fetch status for each device
    const now = new Date().toISOString();
    const rows: {
      user_id: string;
      device_id: string;
      device_name: string;
      device_type: string;
      status: Record<string, unknown>;
      recorded_at: string;
    }[] = [];

    for (const device of deviceList) {
      try {
        const statusRes = (await makeSwitchBotRequest(
          cred.token,
          cred.secret,
          `/devices/${device.deviceId}/status`,
        )) as { statusCode: number; body: Record<string, unknown> };

        if (statusRes.statusCode === 100 && statusRes.body) {
          rows.push({
            user_id: cred.user_id,
            device_id: device.deviceId,
            device_name: device.deviceName,
            device_type: device.deviceType,
            status: statusRes.body,
            recorded_at: now,
          });
        }
      } catch (err) {
        console.error(
          `Failed to get status for device ${device.deviceId}:`,
          err,
        );
      }
    }

    // 3. Bulk insert
    if (rows.length > 0) {
      const { error: insertError } = await supabaseAdmin
        .from("switchbot_status_history")
        .insert(rows);

      if (insertError) {
        console.error("Failed to insert switchbot status:", insertError);
        return { devices_recorded: 0, error: insertError.message };
      }
    }

    return { devices_recorded: rows.length };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error(`Error processing user ${cred.user_id}:`, msg);
    return { devices_recorded: 0, error: msg };
  }
};

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(
      JSON.stringify({ error: "Missing Supabase configuration" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  // Get all users with valid SwitchBot credentials
  const { data: credentials, error: credError } = await supabaseAdmin
    .from("switchbot_credentials")
    .select("user_id, token, secret")
    .eq("is_valid", true);

  if (credError) {
    return new Response(
      JSON.stringify({
        error: `Failed to fetch credentials: ${credError.message}`,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  if (!credentials || credentials.length === 0) {
    return new Response(
      JSON.stringify({
        success: true,
        message: "No users with valid SwitchBot credentials",
        users_processed: 0,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  let totalDevices = 0;
  const results: Record<string, unknown>[] = [];

  for (const cred of credentials as SwitchBotCredentials[]) {
    const result = await processUser(supabaseAdmin, cred);
    totalDevices += result.devices_recorded;
    results.push({ user_id: cred.user_id, ...result });
  }

  return new Response(
    JSON.stringify({
      success: true,
      users_processed: credentials.length,
      total_devices_recorded: totalDevices,
      results,
    }),
    {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
});
