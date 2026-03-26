import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export type PushCategory =
  | "pushTaskDue"
  | "pushTaskOverdue"
  | "pushCalendarEvent"
  | "pushInvoiceReminder"
  | "pushAiChat"
  | "pushAiCompany"
  | "pushProactiveAgent"
  | "pushAutomation"
  | "pushSlack"
  | "pushRss"
  | "pushWebhook"
  | "pushGmail";

/**
 * Check if a push notification category is enabled for a user.
 * Returns true by default (opt-out model).
 */
export const isPushCategoryEnabled = async (
  supabase: SupabaseClient,
  userId: string,
  category: PushCategory,
): Promise<boolean> => {
  try {
    const { data } = await supabase
      .from("user_settings")
      .select("value")
      .eq("user_id", userId)
      .eq("key", "notification_settings")
      .single();

    if (!data?.value) return true;

    const settings = data.value as Record<string, unknown>;
    // Explicit false check — undefined or true means enabled
    return settings[category] !== false;
  } catch {
    return true;
  }
};
