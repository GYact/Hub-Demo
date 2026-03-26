import { useUserSetting } from "./useUserSetting";
import type { InvoiceReminderSettings } from "../types";

const DEFAULT_SETTINGS: InvoiceReminderSettings = {
  enabled: false,
  dayOfMonth: 1,
  hour: 9,
};

export const useInvoiceReminders = () => {
  const {
    value: settings,
    setValue: setSettings,
    isLoading,
  } = useUserSetting<InvoiceReminderSettings>(
    "invoice_reminder_settings",
    DEFAULT_SETTINGS,
  );

  return { settings, setSettings, isLoading };
};
