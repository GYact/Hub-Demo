import { type ReactNode } from "react";
import { AlertCircle } from "lucide-react";

interface ErrorBannerProps {
  message: string;
  action?: ReactNode;
  className?: string;
}

export const ErrorBanner = ({
  message,
  action,
  className = "",
}: ErrorBannerProps) => (
  <div
    className={`shrink-0 bg-red-500/10 border-b border-red-500/20 px-4 py-3 flex items-center gap-3 ${className}`}
  >
    <AlertCircle className="text-red-500 shrink-0" size={20} />
    <div>
      <p className="text-red-500 text-sm">{message}</p>
      {action}
    </div>
  </div>
);
