import { type ReactNode } from "react";
import { type LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon?: LucideIcon;
  message: string;
  action?: ReactNode;
  className?: string;
}

export const EmptyState = ({
  icon: Icon,
  message,
  action,
  className = "py-12",
}: EmptyStateProps) => (
  <div className={`text-center ${className} neu-card`}>
    {Icon && <Icon size={48} className="mx-auto neu-text-muted mb-4" />}
    <p className="neu-text-secondary mb-4">{message}</p>
    {action}
  </div>
);
