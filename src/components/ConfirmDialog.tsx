import { useEffect } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, X } from "lucide-react";

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDialog = ({
  isOpen,
  title,
  message,
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) => {
  useEffect(() => {
    if (!isOpen) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[60] bg-black/50 px-4 overflow-y-auto overscroll-contain flex justify-center"
      style={{
        paddingTop: "calc(4rem + env(safe-area-inset-top, 0px))",
        paddingBottom: "calc(5rem + env(safe-area-inset-bottom, 0px))",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-auto my-auto">
        <div className="flex items-center justify-between p-4 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-red-100 rounded-lg">
              <AlertTriangle size={18} className="text-red-600" />
            </div>
            <h3 className="text-lg font-semibold text-slate-800">{title}</h3>
          </div>
          <button
            onClick={onCancel}
            className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500 transition-colors"
          >
            <X size={20} />
          </button>
        </div>
        <div className="p-4">
          <p className="text-slate-600 text-sm leading-relaxed">{message}</p>
        </div>
        <div className="flex justify-end gap-2 p-4 pt-0">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg transition-colors"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};
