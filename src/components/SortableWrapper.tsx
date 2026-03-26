import { type ReactNode } from "react";
import { type DraggableAttributes } from "@dnd-kit/core";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { SyntheticListenerMap } from "@dnd-kit/core/dist/hooks/utilities";

export type DragHandleProps = DraggableAttributes & SyntheticListenerMap;

interface SortableWrapperProps {
  id: string | number;
  children: (dragHandleProps: Record<string, unknown>) => ReactNode;
  className?: string;
}

export const SortableWrapper = ({
  id,
  children,
  className,
}: SortableWrapperProps) => {
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
    <div ref={setNodeRef} style={style} className={className}>
      {children({ ...attributes, ...listeners })}
    </div>
  );
};
