import { ChevronDown } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";

export const GoogleAccountSelector = () => {
  const { googleAccounts, activeGoogleEmail, setActiveGoogleAccount } =
    useAuth();

  // Only show when there are 2+ accounts
  if (googleAccounts.length < 2) return null;

  return (
    <div className="relative inline-flex items-center">
      <select
        value={activeGoogleEmail ?? ""}
        onChange={(e) => setActiveGoogleAccount(e.target.value)}
        className="appearance-none bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg px-3 py-1.5 pr-8 text-sm neu-text-primary cursor-pointer hover:border-sky-400 transition-colors focus:outline-none focus:ring-2 focus:ring-sky-500/30"
      >
        {googleAccounts.map((account) => (
          <option key={account.email} value={account.email}>
            {account.email}
            {account.isPrimary ? " (Primary)" : ""}
          </option>
        ))}
      </select>
      <ChevronDown
        size={14}
        className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none neu-text-secondary"
      />
    </div>
  );
};
