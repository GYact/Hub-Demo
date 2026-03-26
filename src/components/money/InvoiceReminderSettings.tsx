import { Bell, BellOff } from "lucide-react";
import type { InvoiceReminderSettings as Settings } from "../../types";

export const InvoiceReminderSettings = ({
  settings,
  onChange,
}: {
  settings: Settings;
  onChange: (updates: Settings) => void;
}) => {
  return (
    <div className="neu-card p-4 md:p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {settings.enabled ? (
            <Bell size={16} className="text-blue-600" />
          ) : (
            <BellOff size={16} className="neu-text-muted" />
          )}
          <span className="text-sm font-medium neu-text-primary">
            Monthly Reminder
          </span>
        </div>
        <button
          onClick={() => onChange({ ...settings, enabled: !settings.enabled })}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            settings.enabled ? "bg-blue-600" : "bg-slate-300"
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              settings.enabled ? "translate-x-6" : "translate-x-1"
            }`}
          />
        </button>
      </div>
      {settings.enabled && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs neu-text-secondary mb-1 block">
              Day of Month
            </label>
            <select
              value={settings.dayOfMonth}
              onChange={(e) =>
                onChange({ ...settings, dayOfMonth: Number(e.target.value) })
              }
              className="w-full px-3 py-2 text-sm neu-input"
            >
              {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs neu-text-secondary mb-1 block">
              Time
            </label>
            <select
              value={settings.hour}
              onChange={(e) =>
                onChange({ ...settings, hour: Number(e.target.value) })
              }
              className="w-full px-3 py-2 text-sm neu-input"
            >
              {Array.from({ length: 24 }, (_, i) => i).map((h) => (
                <option key={h} value={h}>
                  {String(h).padStart(2, "0")}:00
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
    </div>
  );
};
