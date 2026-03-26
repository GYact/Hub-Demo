import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, MoreHorizontal } from "lucide-react";

interface SortableTabProps {
  id: string;
  name: string;
  isActive: boolean;
  onSelect: () => void;
  onMenuOpen?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  colorDot?: string;
  activeTextClass?: string;
  deadlineIndicator?: "overdue" | "approaching" | null;
}

export const SortableTab = ({
  id,
  name,
  isActive,
  onSelect,
  onMenuOpen,
  colorDot,
  activeTextClass = "text-sky-600",
  deadlineIndicator,
}: SortableTabProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 px-4 py-2 rounded-xl cursor-pointer transition-all ${
        isActive
          ? `neu-pressed ${activeTextClass}`
          : "neu-tab neu-text-secondary hover:neu-text-primary"
      }`}
      onClick={onSelect}
    >
      <div
        {...attributes}
        {...listeners}
        className="touch-none cursor-grab active:cursor-grabbing text-current opacity-50 hover:opacity-100 transition-opacity -ml-1"
        onClick={(e) => e.stopPropagation()}
      >
        <GripVertical size={14} />
      </div>
      {colorDot && <div className={`w-2.5 h-2.5 rounded-full ${colorDot}`} />}
      <span className="text-sm font-medium whitespace-nowrap">{name}</span>
      {deadlineIndicator && (
        <span
          className={`w-2 h-2 rounded-full shrink-0 ${
            deadlineIndicator === "overdue"
              ? "bg-red-500 animate-pulse"
              : "bg-amber-400"
          }`}
          title={
            deadlineIndicator === "overdue" ? "Overdue" : "Deadline approaching"
          }
        />
      )}
      {isActive && onMenuOpen && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onMenuOpen(e);
          }}
          className="p-0.5 hover:bg-white/60 rounded"
        >
          <MoreHorizontal size={14} />
        </button>
      )}
    </div>
  );
};
