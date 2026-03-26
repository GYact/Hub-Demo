import { useEffect } from "react";
import { createPortal } from "react-dom";
import { AlertCircle, CheckCircle, Info, X } from "lucide-react";

type AlertType = "error" | "success" | "info";

interface AlertDialogProps {
  isOpen: boolean;
  type?: AlertType;
  title: string;
  message: string;
  buttonLabel?: string;
  onClose: () => void;
}

const alertStyles: Record<
  AlertType,
  {
    icon: typeof AlertCircle;
    iconBg: string;
    iconColor: string;
    buttonBg: string;
  }
> = {
  error: {
    icon: AlertCircle,
    iconBg: "bg-red-100",
    iconColor: "text-red-600",
    buttonBg: "bg-red-600 hover:bg-red-500",
  },
  success: {
    icon: CheckCircle,
    iconBg: "bg-green-100",
    iconColor: "text-green-600",
    buttonBg: "bg-green-600 hover:bg-green-500",
  },
  info: {
    icon: Info,
    iconBg: "bg-blue-100",
    iconColor: "text-blue-600",
    buttonBg: "bg-blue-600 hover:bg-blue-500",
  },
};

export const AlertDialog = ({
  isOpen,
  type = "info",
  title,
  message,
  buttonLabel = "OK",
  onClose,
}: AlertDialogProps) => {
  useEffect(() => {
    if (!isOpen) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const style = alertStyles[type];
  const Icon = style.icon;

  return createPortal(
    <div
      className="fixed inset-0 z-[60] bg-black/50 px-4 overflow-y-auto overscroll-contain flex justify-center"
      style={{
        paddingTop: "calc(4rem + env(safe-area-inset-top, 0px))",
        paddingBottom: "calc(5rem + env(safe-area-inset-bottom, 0px))",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-auto my-auto">
        <div className="flex items-center justify-between p-4 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <div className={`p-1.5 ${style.iconBg} rounded-lg`}>
              <Icon size={18} className={style.iconColor} />
            </div>
            <h3 className="text-lg font-semibold text-slate-800">{title}</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500 transition-colors"
          >
            <X size={20} />
          </button>
        </div>
        <div className="p-4">
          <p className="text-slate-600 text-sm leading-relaxed">{message}</p>
        </div>
        <div className="flex justify-end p-4 pt-0">
          <button
            type="button"
            onClick={onClose}
            className={`px-4 py-2 ${style.buttonBg} text-white rounded-lg transition-colors`}
          >
            {buttonLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};
