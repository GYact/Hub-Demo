import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, handleCors } from "../_shared/cors.ts";

type AutomationSchedule = "hourly" | "daily" | "weekly" | "monthly" | "manual";

type AutomationRow = {
  id: string;
  user_id: string;
  name: string;
  schedule: AutomationSchedule;
  scheduled_time: string | null; // HH:MM format
  enabled: boolean;
  last_run_at: string | null;
};

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
  Deno.env.get("SERVICE_ROLE_KEY") ??
  "";
const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

// Debug info for why automation was skipped
type SkipReason = {
  shouldRun: boolean;
  reason?: string;
  debug: {
    currentTimeUTC: string;
    scheduledTimeJST: string;
    scheduledTimeUTC: string;
    timeMatches: boolean;
    lastRunAt: string | null;
    hoursSinceLastRun: number | null;
    catchUpMode: boolean;
  };
};

// Thresholds for catch-up mode (in hours)
const CATCHUP_THRESHOLDS = {
  daily: 24, // Run if missed for 24+ hours
  weekly: 168, // Run if missed for 7 days
  monthly: 720, // Run if missed for 30 days
};

// Check if automation should run based on schedule
const shouldRunAutomation = (
  automation: AutomationRow,
  now: Date,
): SkipReason => {
  const currentHour = now.getUTCHours();
  const currentMinute = now.getUTCMinutes();

  // Parse scheduled time (HH:MM format) - convert JST to UTC
  let scheduledHour = 0; // Default 00:00 UTC (09:00 JST)
  let scheduledMinute = 0;
  let scheduledTimeJST = "09:00";

  if (automation.scheduled_time) {
    scheduledTimeJST = automation.scheduled_time;
    const [h, m] = automation.scheduled_time.split(":").map(Number);
    // Convert JST (UTC+9) to UTC
    scheduledHour = (h - 9 + 24) % 24;
    scheduledMinute = m || 0;
  }

  // Check if current time matches scheduled time (within 5-minute window)
  const timeMatches =
    currentHour === scheduledHour &&
    Math.abs(currentMinute - scheduledMinute) <= 5;

  const baseDebug = {
    currentTimeUTC: `${String(currentHour).padStart(2, "0")}:${String(currentMinute).padStart(2, "0")}`,
    scheduledTimeJST,
    scheduledTimeUTC: `${String(scheduledHour).padStart(2, "0")}:${String(scheduledMinute).padStart(2, "0")}`,
    timeMatches,
    lastRunAt: automation.last_run_at,
    hoursSinceLastRun: null as number | null,
    catchUpMode: false,
  };

  if (!automation.enabled) {
    return { shouldRun: false, reason: "disabled", debug: baseDebug };
  }
  if (automation.schedule === "manual") {
    return { shouldRun: false, reason: "manual_schedule", debug: baseDebug };
  }

  // Check last run to prevent duplicate runs
  if (automation.last_run_at) {
    const lastRun = new Date(automation.last_run_at);
    const hoursSinceLastRun =
      (now.getTime() - lastRun.getTime()) / (1000 * 60 * 60);
    baseDebug.hoursSinceLastRun = Math.round(hoursSinceLastRun * 10) / 10;

    switch (automation.schedule) {
      case "hourly":
        if (hoursSinceLastRun < 0.9) {
          return {
            shouldRun: false,
            reason: "too_soon_hourly",
            debug: baseDebug,
          };
        }
        break;
      case "daily":
        if (hoursSinceLastRun < 23) {
          return {
            shouldRun: false,
            reason: "too_soon_daily",
            debug: baseDebug,
          };
        }
        if (hoursSinceLastRun >= CATCHUP_THRESHOLDS.daily) {
          baseDebug.catchUpMode = true;
        }
        // Always require time match for scheduled automations
        if (!timeMatches) {
          return {
            shouldRun: false,
            reason: "time_not_matched",
            debug: baseDebug,
          };
        }
        break;
      case "weekly":
        if (hoursSinceLastRun < 167) {
          return {
            shouldRun: false,
            reason: "too_soon_weekly",
            debug: baseDebug,
          };
        }
        if (hoursSinceLastRun >= CATCHUP_THRESHOLDS.weekly) {
          baseDebug.catchUpMode = true;
        }
        if (!timeMatches) {
          return {
            shouldRun: false,
            reason: "time_not_matched",
            debug: baseDebug,
          };
        }
        break;
      case "monthly":
        if (hoursSinceLastRun < 695) {
          return {
            shouldRun: false,
            reason: "too_soon_monthly",
            debug: baseDebug,
          };
        }
        if (hoursSinceLastRun >= CATCHUP_THRESHOLDS.monthly) {
          baseDebug.catchUpMode = true;
        }
        if (!timeMatches) {
          return {
            shouldRun: false,
            reason: "time_not_matched",
            debug: baseDebug,
          };
        }
        break;
    }
  } else {
    // First run - still require time match to avoid running at wrong time
    if (!timeMatches) {
      return {
        shouldRun: false,
        reason: "first_run_time_not_matched",
        debug: baseDebug,
      };
    }
    baseDebug.catchUpMode = true;
  }

  return { shouldRun: true, debug: baseDebug };
};

// Run a single automation by calling the run_automation function
const runAutomation = async (automationId: string): Promise<boolean> => {
  try {
    // Use anon key for authentication (service role key may not work with Edge Functions)
    const authKey = anonKey || serviceRoleKey;
    const response = await fetch(`${supabaseUrl}/functions/v1/run_automation`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authKey}`,
      },
      body: JSON.stringify({ automationId }),
    });

    if (!response.ok) {
      console.error(
        `Failed to run automation ${automationId}:`,
        await response.text(),
      );
      return false;
    }

    return true;
  } catch (err) {
    console.error(`Error running automation ${automationId}:`, err);
    return false;
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

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const now = new Date();

  // Get all enabled automations (excluding manual)
  const { data: automations, error } = await supabaseAdmin
    .from("ai_automations")
    .select("id, user_id, name, schedule, scheduled_time, enabled, last_run_at")
    .eq("enabled", true)
    .neq("schedule", "manual");

  if (error) {
    console.error("Failed to fetch automations:", error);
    return new Response(
      JSON.stringify({ error: "Failed to fetch automations" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  const results: {
    id: string;
    name: string;
    ran: boolean;
    error?: string;
    skipReason?: SkipReason;
  }[] = [];

  for (const automation of (automations ?? []) as AutomationRow[]) {
    const skipReason = shouldRunAutomation(automation, now);

    if (skipReason.shouldRun) {
      console.log(`Running automation: ${automation.name} (${automation.id})`);
      const success = await runAutomation(automation.id);
      results.push({
        id: automation.id,
        name: automation.name,
        ran: success,
        error: success ? undefined : "Execution failed",
        skipReason,
      });
    } else {
      console.log(
        `Skipping automation: ${automation.name} (${automation.id}) - reason: ${skipReason.reason}`,
      );
      results.push({
        id: automation.id,
        name: automation.name,
        ran: false,
        skipReason,
      });
    }
  }

  const ranCount = results.filter((r) => r.ran).length;
  console.log(
    `Scheduler completed. Ran ${ranCount}/${results.length} automations`,
  );

  return new Response(
    JSON.stringify({
      success: true,
      timestamp: now.toISOString(),
      automationsChecked: automations?.length ?? 0,
      automationsRan: ranCount,
      results,
    }),
    {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
});
