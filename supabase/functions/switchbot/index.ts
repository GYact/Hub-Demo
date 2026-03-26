import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encode as hexEncode } from "https://deno.land/std@0.208.0/encoding/hex.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

const SWITCHBOT_API_BASE = "https://api.switch-bot.com/v1.1";

type SwitchBotAction =
  | { action: "getDevices" }
  | { action: "getDeviceStatus"; deviceId: string }
  | {
      action: "sendCommand";
      deviceId: string;
      command: string;
      parameter?: string | number;
      commandType?: string;
    }
  | { action: "getScenes" }
  | { action: "executeScene"; sceneId: string };

type SwitchBotCredentials = {
  token: string;
  secret: string;
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
  credentials: SwitchBotCredentials,
  endpoint: string,
  method: "GET" | "POST" = "GET",
  body?: Record<string, unknown>,
) => {
  const t = Date.now().toString();
  const nonce = crypto.randomUUID();
  const sign = await generateSignature(
    credentials.token,
    credentials.secret,
    t,
    nonce,
  );

  const headers: Record<string, string> = {
    Authorization: credentials.token,
    sign: sign,
    t: t,
    nonce: nonce,
    "Content-Type": "application/json",
  };

  const response = await fetch(`${SWITCHBOT_API_BASE}${endpoint}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`SwitchBot API error: ${response.status} - ${errorText}`);
  }

  return response.json();
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-switchbot-token, x-switchbot-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", {
      status: 405,
      headers: corsHeaders,
    });
  }

  // Authenticate user via Supabase
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader) {
    return new Response("Unauthorized", { status: 401, headers: corsHeaders });
  }

  const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: authHeader } },
  });
  const { data: authData, error: authError } =
    await supabaseAuth.auth.getUser();
  if (authError || !authData?.user) {
    return new Response("Unauthorized", { status: 401, headers: corsHeaders });
  }

  // Get SwitchBot credentials from headers
  const token = req.headers.get("x-switchbot-token");
  const secret = req.headers.get("x-switchbot-secret");

  if (!token || !secret) {
    return new Response(
      JSON.stringify({ error: "Missing SwitchBot credentials" }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  const credentials: SwitchBotCredentials = { token, secret };

  try {
    const payload = (await req.json()) as SwitchBotAction;

    let result;

    switch (payload.action) {
      case "getDevices": {
        result = await makeSwitchBotRequest(credentials, "/devices");
        break;
      }
      case "getDeviceStatus": {
        if (!payload.deviceId) {
          throw new Error("Missing deviceId");
        }
        result = await makeSwitchBotRequest(
          credentials,
          `/devices/${payload.deviceId}/status`,
        );
        break;
      }
      case "sendCommand": {
        if (!payload.deviceId || !payload.command) {
          throw new Error("Missing deviceId or command");
        }
        const commandBody: Record<string, unknown> = {
          command: payload.command,
          parameter: payload.parameter ?? "default",
          commandType: payload.commandType ?? "command",
        };
        result = await makeSwitchBotRequest(
          credentials,
          `/devices/${payload.deviceId}/commands`,
          "POST",
          commandBody,
        );
        break;
      }
      case "getScenes": {
        result = await makeSwitchBotRequest(credentials, "/scenes");
        break;
      }
      case "executeScene": {
        if (!payload.sceneId) {
          throw new Error("Missing sceneId");
        }
        result = await makeSwitchBotRequest(
          credentials,
          `/scenes/${payload.sceneId}/execute`,
          "POST",
        );
        break;
      }
      default:
        throw new Error("Unknown action");
    }

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
