import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, handleCors } from "../_shared/cors.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
  Deno.env.get("SERVICE_ROLE_KEY") ??
  "";

const ALLOWED_JOBS = [
  "fetch-x-posts",
  "fetch-calendar-events",
  "fetch-gmail-messages",
  "send-task-notifications",
  "automation-scheduler",
  "slack-fetch-history",
  "fetch-rss",
  "fetch-switchbot-status",
  "proactive-agent",
];

// Basic cron expression validation: 5 fields separated by spaces
const isValidCron = (expr: string): boolean => {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return false;
  const pattern = /^(\*|(\d+|\*)([\/\-,]\d+)*)$/;
  return parts.every((p) => pattern.test(p));
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

  // Verify auth
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const token = authHeader.slice(7);
  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const {
    data: { user },
    error: authError,
  } = await supabaseAdmin.auth.getUser(token);
  if (authError || !user) {
    return new Response(JSON.stringify({ error: "Invalid token" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // GET: return current schedules
  if (req.method === "GET") {
    const { data, error } = await supabaseAdmin.rpc("get_cron_job_schedules");

    if (error) {
      return new Response(
        JSON.stringify({ error: `Failed to get schedules: ${error.message}` }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    return new Response(JSON.stringify({ schedules: data }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // POST: update a schedule
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: { job_name?: string; schedule?: string; active?: boolean };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { job_name, schedule, active } = body;

  if (!job_name) {
    return new Response(JSON.stringify({ error: "job_name is required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (schedule === undefined && active === undefined) {
    return new Response(
      JSON.stringify({ error: "schedule or active is required" }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  if (!ALLOWED_JOBS.includes(job_name)) {
    return new Response(
      JSON.stringify({
        error: `Invalid job_name. Allowed: ${ALLOWED_JOBS.join(", ")}`,
      }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  // Toggle active status
  if (active !== undefined) {
    const { error: toggleError } = await supabaseAdmin.rpc("toggle_cron_job", {
      p_job_name: job_name,
      p_active: active,
    });

    if (toggleError) {
      return new Response(
        JSON.stringify({
          error: `Failed to toggle job: ${toggleError.message}`,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // If only toggling (no schedule change), return early
    if (!schedule) {
      return new Response(JSON.stringify({ success: true, job_name, active }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  // Update schedule
  if (schedule) {
    if (!isValidCron(schedule)) {
      return new Response(
        JSON.stringify({
          error:
            "Invalid cron expression. Expected 5 fields (e.g. '*/15 * * * *')",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const { error } = await supabaseAdmin.rpc("update_cron_job_schedule", {
      p_job_name: job_name,
      p_schedule: schedule,
    });

    if (error) {
      return new Response(
        JSON.stringify({
          error: `Failed to update schedule: ${error.message}`,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
  }

  return new Response(
    JSON.stringify({
      success: true,
      job_name,
      ...(schedule && { schedule }),
      ...(active !== undefined && { active }),
    }),
    {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
});
