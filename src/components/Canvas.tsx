import { useRef, useState, useEffect, useCallback } from "react";
import type { OrgNode, Edge, Position, Frame } from "../types";
import { NodeCard } from "./NodeCard";
import { EdgeLine } from "./EdgeLine";
import { FrameBox } from "./FrameBox";

// Momentum scroll configuration
const MOMENTUM_FRICTION = 0.92; // Friction for momentum scrolling
const MIN_VELOCITY = 0.5; // Minimum velocity threshold

interface CanvasProps {
  nodes: OrgNode[];
  edges: Edge[];
  frames: Frame[];
  selectedNodeIds: Set<string>;
  isLinkingMode: boolean;
  scale: number;
  centerPoint?: Position | null;
  isCenterPointMode?: boolean;
  onNodeSelect: (id: string, isMultiSelect?: boolean) => void;
  onNodePositionChange: (
    id: string,
    position: Position,
    delta: Position,
  ) => void;
  onEdgeDelete: (edgeId: string) => void;
  onCanvasClick: () => void;
  onScaleChange?: (newScale: number, adjustOffset?: boolean) => void;
  onFramePositionChange: (id: string, position: Position) => void;
  onFrameSizeChange: (id: string, width: number, height: number) => void;
  onFrameDelete: (id: string) => void;
  onFrameUpdate: (id: string, updates: Partial<Frame>) => void;
  onFrameClick?: (frameId: string) => void;
  onSetCenterPoint?: (position: Position) => void;
}

export const Canvas: React.FC<CanvasProps> = ({
  nodes,
  edges,
  frames,
  selectedNodeIds,
  isLinkingMode,
  scale,
  centerPoint,
  isCenterPointMode,
  onNodeSelect,
  onNodePositionChange,
  onEdgeDelete,
  onCanvasClick,
  onScaleChange,
  onFramePositionChange,
  onFrameSizeChange,
  onFrameDelete,
  onFrameUpdate,
  onFrameClick,
  onSetCenterPoint,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [hasCentered, setHasCentered] = useState(false);
  const [edgeState, setEdgeState] = useState({
    top: false,
    right: false,
    bottom: false,
    left: false,
  });
  const prevScaleRef = useRef(scale);
  const skipOffsetAdjustRef = useRef(false);
  const velocityRef = useRef({ x: 0, y: 0 });
  const lastMoveTimeRef = useRef(0);
  const lastPositionRef = useRef({ x: 0, y: 0 });
  const momentumFrameRef = useRef<number | null>(null);
  const pinchRef = useRef<{
    startDistance: number;
    startScale: number;
    worldX: number;
    worldY: number;
  } | null>(null);

  // Adjust offset when scale changes (from zoom buttons) to keep center point stable
  useEffect(() => {
    if (skipOffsetAdjustRef.current) {
      skipOffsetAdjustRef.current = false;
      prevScaleRef.current = scale;
      return;
    }
    if (prevScaleRef.current !== scale && hasCentered) {
      // When resetting to 100% and we have a center point, re-center on it
      if (scale === 1 && centerPoint) {
        setOffset({
          x: -centerPoint.x * scale,
          y: -centerPoint.y * scale,
        });
      } else {
        // Scale ratio
        const ratio = scale / prevScaleRef.current;
        // Adjust offset to keep the center point stable
        setOffset((prev) => ({
          x: prev.x * ratio,
          y: prev.y * ratio,
        }));
      }
    }
    prevScaleRef.current = scale;
  }, [scale, hasCentered, centerPoint]);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    offsetX: number;
    offsetY: number;
    hasMoved: boolean;
  } | null>(null);

  // Calculate content bounds for overscroll limits
  const getContentBounds = useCallback(() => {
    if (!containerRef.current)
      return {
        minOffsetX: -Infinity,
        maxOffsetX: Infinity,
        minOffsetY: -Infinity,
        maxOffsetY: Infinity,
      };

    const container = containerRef.current;
    const rect = container.getBoundingClientRect();
    const nodeWidth = 250;
    const nodeHeight = 150;
    const padding = 200;

    const nodesMinX =
      nodes.length > 0
        ? Math.min(...nodes.map((n) => n.position.x)) - nodeWidth / 2 - padding
        : -500;
    const nodesMaxX =
      nodes.length > 0
        ? Math.max(...nodes.map((n) => n.position.x)) + nodeWidth / 2 + padding
        : 500;
    const nodesMinY =
      nodes.length > 0
        ? Math.min(...nodes.map((n) => n.position.y)) - nodeHeight / 2 - padding
        : -400;
    const nodesMaxY =
      nodes.length > 0
        ? Math.max(...nodes.map((n) => n.position.y)) + nodeHeight / 2 + padding
        : 400;

    // Allow some padding beyond content for a more natural feel
    const extraPadding = 100;
    const viewportWidth = rect.width / 2;
    const viewportHeight = rect.height / 2;

    return {
      minOffsetX: -nodesMaxX * scale - extraPadding + viewportWidth,
      maxOffsetX: -nodesMinX * scale + extraPadding + viewportWidth,
      minOffsetY: -nodesMaxY * scale - extraPadding + viewportHeight,
      maxOffsetY: -nodesMinY * scale + extraPadding + viewportHeight,
    };
  }, [nodes, scale]);

  // Clamp value to bounds (no overscroll)
  const clampToBounds = useCallback(
    (value: number, min: number, max: number): number => {
      return Math.max(min, Math.min(max, value));
    },
    [],
  );

  // Update edge state when offset changes
  useEffect(() => {
    const bounds = getContentBounds();
    const threshold = 2; // Small threshold for floating point comparison
    setEdgeState({
      top: offset.y >= bounds.maxOffsetY - threshold,
      bottom: offset.y <= bounds.minOffsetY + threshold,
      left: offset.x >= bounds.maxOffsetX - threshold,
      right: offset.x <= bounds.minOffsetX + threshold,
    });
  }, [offset, getContentBounds]);

  // Momentum scroll animation
  const startMomentumScroll = useCallback(() => {
    if (momentumFrameRef.current) {
      cancelAnimationFrame(momentumFrameRef.current);
    }

    const animate = () => {
      const bounds = getContentBounds();

      setOffset((prev) => {
        const newX = prev.x + velocityRef.current.x;
        const newY = prev.y + velocityRef.current.y;

        // Clamp to bounds - stop at edges
        const clampedX = clampToBounds(
          newX,
          bounds.minOffsetX,
          bounds.maxOffsetX,
        );
        const clampedY = clampToBounds(
          newY,
          bounds.minOffsetY,
          bounds.maxOffsetY,
        );

        // Stop velocity if hitting bounds
        if (clampedX !== newX) velocityRef.current.x = 0;
        if (clampedY !== newY) velocityRef.current.y = 0;

        return { x: clampedX, y: clampedY };
      });

      // Apply friction
      velocityRef.current.x *= MOMENTUM_FRICTION;
      velocityRef.current.y *= MOMENTUM_FRICTION;

      // Continue animation if velocity is significant
      if (
        Math.abs(velocityRef.current.x) > MIN_VELOCITY ||
        Math.abs(velocityRef.current.y) > MIN_VELOCITY
      ) {
        momentumFrameRef.current = requestAnimationFrame(animate);
      } else {
        velocityRef.current = { x: 0, y: 0 };
      }
    };

    momentumFrameRef.current = requestAnimationFrame(animate);
  }, [getContentBounds, clampToBounds]);

  // Common drag start logic
  const handleDragStart = (clientX: number, clientY: number) => {
    // Cancel any ongoing momentum animation
    if (momentumFrameRef.current) {
      cancelAnimationFrame(momentumFrameRef.current);
      momentumFrameRef.current = null;
    }
    velocityRef.current = { x: 0, y: 0 };
    lastMoveTimeRef.current = performance.now();
    lastPositionRef.current = { x: clientX, y: clientY };

    dragRef.current = {
      startX: clientX,
      startY: clientY,
      offsetX: offset.x,
      offsetY: offset.y,
      hasMoved: false,
    };
  };

  // Common drag move logic
  const handleDragMove = (clientX: number, clientY: number) => {
    if (!dragRef.current) return;

    const now = performance.now();
    const timeDelta = now - lastMoveTimeRef.current;

    if (timeDelta > 0) {
      // Calculate velocity for momentum
      velocityRef.current = {
        x: (clientX - lastPositionRef.current.x) * 0.6,
        y: (clientY - lastPositionRef.current.y) * 0.6,
      };
    }

    lastMoveTimeRef.current = now;
    lastPositionRef.current = { x: clientX, y: clientY };

    const dx = clientX - dragRef.current.startX;
    const dy = clientY - dragRef.current.startY;

    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      dragRef.current.hasMoved = true;
    }

    const rawX = dragRef.current.offsetX + dx;
    const rawY = dragRef.current.offsetY + dy;

    // Clamp to bounds - no overscroll allowed
    const bounds = getContentBounds();
    setOffset({
      x: clampToBounds(rawX, bounds.minOffsetX, bounds.maxOffsetX),
      y: clampToBounds(rawY, bounds.minOffsetY, bounds.maxOffsetY),
    });
  };

  // Common drag end logic
  const handleDragEnd = (clientX?: number, clientY?: number) => {
    if (dragRef.current && !dragRef.current.hasMoved) {
      // If in center point mode and we have click coordinates, set the center point
      if (
        isCenterPointMode &&
        onSetCenterPoint &&
        clientX !== undefined &&
        clientY !== undefined &&
        containerRef.current
      ) {
        const rect = containerRef.current.getBoundingClientRect();
        // Convert screen coordinates to world coordinates
        // Screen center is at (rect.width/2, rect.height/2)
        // Current offset moves the world by offset.x, offset.y
        const screenCenterX = rect.width / 2;
        const screenCenterY = rect.height / 2;

        // Click position relative to container
        const clickX = clientX - rect.left;
        const clickY = clientY - rect.top;

        // Convert to world coordinates
        // world = (screen - screenCenter - offset) / scale
        const worldX = (clickX - screenCenterX - offset.x) / scale;
        const worldY = (clickY - screenCenterY - offset.y) / scale;

        onSetCenterPoint({ x: worldX, y: worldY });
      } else {
        onCanvasClick();
      }
      velocityRef.current = { x: 0, y: 0 };
    } else if (dragRef.current?.hasMoved) {
      // Start momentum scrolling if we have velocity
      const speed = Math.sqrt(
        velocityRef.current.x ** 2 + velocityRef.current.y ** 2,
      );
      if (speed > MIN_VELOCITY) {
        startMomentumScroll();
      }
    }
    dragRef.current = null;
  };

  // Center on saved center point on initial load
  useEffect(() => {
    if (hasCentered || !centerPoint || !containerRef.current) return;

    // With transform-origin: center and left/top: 50%,
    // offset (0, 0) places world origin (0, 0) at screen center.
    // To center a point at position (x, y), we set offset = -position * scale
    const newOffset = {
      x: -centerPoint.x * scale,
      y: -centerPoint.y * scale,
    };

    setOffset(newOffset);
    setHasCentered(true);
  }, [centerPoint, scale, hasCentered]);

  // Cleanup momentum animation on unmount
  useEffect(() => {
    return () => {
      if (momentumFrameRef.current) {
        cancelAnimationFrame(momentumFrameRef.current);
      }
    };
  }, []);

  // Wheel event for pinch-to-zoom (trackpad two-finger gesture)
  // Use native event listener with { passive: false } to allow preventDefault
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !onScaleChange) return;

    const handleWheel = (e: WheelEvent) => {
      // ctrlKey is true for trackpad pinch gestures on macOS
      if (e.ctrlKey) {
        e.preventDefault();
        const delta = -e.deltaY * 0.01;
        const newScale = Math.min(Math.max(scale + delta, 0.2), 2);

        if (newScale !== scale) {
          const rect = container.getBoundingClientRect();

          // Mouse position in container coordinates
          const mouseX = e.clientX - rect.left;
          const mouseY = e.clientY - rect.top;

          // Container center (where content origin is placed due to left: 50%, top: 50%)
          const centerX = rect.width / 2;
          const centerY = rect.height / 2;

          // With transformOrigin: 0 0, the transform is:
          // screenPos = containerCenter + offset + worldPos * scale
          // Therefore: worldPos = (screenPos - containerCenter - offset) / scale
          const worldX = (mouseX - centerX - offset.x) / scale;
          const worldY = (mouseY - centerY - offset.y) / scale;

          // After zoom, we want the same world point under cursor:
          // mouseX = centerX + newOffset.x + worldX * newScale
          // newOffset.x = mouseX - centerX - worldX * newScale
          const newOffsetX = mouseX - centerX - worldX * newScale;
          const newOffsetY = mouseY - centerY - worldY * newScale;

          setOffset({ x: newOffsetX, y: newOffsetY });
          skipOffsetAdjustRef.current = true;
          onScaleChange(newScale);
        }
      }
    };

    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => container.removeEventListener("wheel", handleWheel);
  }, [scale, offset, onScaleChange]);

  // Mouse events
  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('[id^="node-"]')) return;
    if ((e.target as HTMLElement).closest('[id^="frame-"]')) return;
    if ((e.target as HTMLElement).closest('[id^="edge:"]')) return;
    if (e.button !== 0) return;
    handleDragStart(e.clientX, e.clientY);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    handleDragMove(e.clientX, e.clientY);
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    handleDragEnd(e.clientX, e.clientY);
  };

  const getTouchDistance = (touches: React.TouchList) => {
    if (touches.length < 2) return 0;
    const [t1, t2] = [touches[0], touches[1]];
    const dx = t2.clientX - t1.clientX;
    const dy = t2.clientY - t1.clientY;
    return Math.hypot(dx, dy);
  };

  const getTouchCenter = (touches: React.TouchList) => {
    const [t1, t2] = [touches[0], touches[1]];
    return {
      x: (t1.clientX + t2.clientX) / 2,
      y: (t1.clientY + t2.clientY) / 2,
    };
  };

  // Touch events for mobile swipe/pinch
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && onScaleChange && containerRef.current) {
      const container = containerRef.current;
      const rect = container.getBoundingClientRect();
      const center = getTouchCenter(e.touches);
      const localX = center.x - rect.left;
      const localY = center.y - rect.top;
      const screenCenterX = rect.width / 2;
      const screenCenterY = rect.height / 2;
      const worldX = (localX - screenCenterX - offset.x) / scale;
      const worldY = (localY - screenCenterY - offset.y) / scale;

      pinchRef.current = {
        startDistance: getTouchDistance(e.touches),
        startScale: scale,
        worldX,
        worldY,
      };

      if (momentumFrameRef.current) {
        cancelAnimationFrame(momentumFrameRef.current);
        momentumFrameRef.current = null;
      }
      velocityRef.current = { x: 0, y: 0 };
      dragRef.current = null;
      return;
    }

    if ((e.target as HTMLElement).closest('[id^="node-"]')) return;
    if ((e.target as HTMLElement).closest('[id^="frame-"]')) return;
    if ((e.target as HTMLElement).closest('[id^="edge:"]')) return;
    const touch = e.touches[0];
    handleDragStart(touch.clientX, touch.clientY);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (
      pinchRef.current &&
      e.touches.length === 2 &&
      onScaleChange &&
      containerRef.current
    ) {
      e.preventDefault();
      const { startDistance, startScale, worldX, worldY } = pinchRef.current;
      const distance = getTouchDistance(e.touches);
      if (!distance || !startDistance) return;
      const nextScale = Math.min(
        Math.max(startScale * (distance / startDistance), 0.2),
        2,
      );

      const rect = containerRef.current.getBoundingClientRect();
      const center = getTouchCenter(e.touches);
      const localX = center.x - rect.left;
      const localY = center.y - rect.top;
      const screenCenterX = rect.width / 2;
      const screenCenterY = rect.height / 2;

      const newOffsetX = localX - screenCenterX - worldX * nextScale;
      const newOffsetY = localY - screenCenterY - worldY * nextScale;

      setOffset({ x: newOffsetX, y: newOffsetY });
      skipOffsetAdjustRef.current = true;
      onScaleChange(nextScale);
      return;
    }
    if (!dragRef.current) return;
    const touch = e.touches[0];
    handleDragMove(touch.clientX, touch.clientY);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (pinchRef.current) {
      if (e.touches.length < 2) {
        pinchRef.current = null;
      }
      return;
    }
    const touch = e.changedTouches[0];
    handleDragEnd(touch?.clientX, touch?.clientY);
  };

  // Calculate content bounds
  const nodeWidth = 250;
  const nodeHeight = 150;
  const padding = 400;

  const minX =
    nodes.length > 0
      ? Math.min(...nodes.map((n) => n.position.x)) - nodeWidth / 2 - padding
      : -500;
  const maxX =
    nodes.length > 0
      ? Math.max(...nodes.map((n) => n.position.x)) + nodeWidth / 2 + padding
      : 500;
  const minY =
    nodes.length > 0
      ? Math.min(...nodes.map((n) => n.position.y)) - nodeHeight / 2 - padding
      : -400;
  const maxY =
    nodes.length > 0
      ? Math.max(...nodes.map((n) => n.position.y)) + nodeHeight / 2 + padding
      : 400;

  const contentWidth = maxX - minX;
  const contentHeight = maxY - minY;

  return (
    <div
      ref={containerRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className={`absolute inset-0 overflow-hidden touch-none no-select ${dragRef.current?.hasMoved ? "cursor-grabbing" : "cursor-grab"}`}
    >
      <div
        className="absolute pointer-events-none"
        style={{
          transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
          transformOrigin: "0 0",
          left: "50%",
          top: "50%",
          width: contentWidth,
          height: contentHeight,
          willChange: "transform",
        }}
      >
        {/* Grid Background - inside the same transform container */}
        <div
          className="absolute pointer-events-none"
          style={{
            left: "-5000px",
            top: "-5000px",
            width: "10000px",
            height: "10000px",
            backgroundImage: `
              linear-gradient(rgba(148, 163, 184, 0.3) 1px, transparent 1px),
              linear-gradient(90deg, rgba(148, 163, 184, 0.3) 1px, transparent 1px)
            `,
            backgroundSize: "40px 40px",
            zIndex: -1,
          }}
        />
        {/* Frames layer (below everything) */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ zIndex: 0 }}
        >
          {frames.map((frame) => (
            <FrameBox
              key={frame.id}
              frame={frame}
              scale={scale}
              isLinkingMode={isLinkingMode}
              isSelected={selectedNodeIds.has(`frame-${frame.id}`)}
              onPositionChange={onFramePositionChange}
              onSizeChange={onFrameSizeChange}
              onDelete={onFrameDelete}
              onUpdate={onFrameUpdate}
              onClick={onFrameClick}
            />
          ))}
        </div>

        {/* SVG for edges (below nodes) */}
        <svg
          className="absolute overflow-visible pointer-events-none"
          style={{
            left: 0,
            top: 0,
            width: "100%",
            height: "100%",
            zIndex: 1,
          }}
        >
          <defs>
            <marker
              id="arrowhead"
              markerWidth="8"
              markerHeight="8"
              refX="0"
              refY="4"
              orient="auto"
              markerUnits="strokeWidth"
            >
              <path d="M 0 0 L 8 4 L 0 8 z" fill="#475569" />
            </marker>
          </defs>

          {edges.map((edge) => (
            <EdgeLine
              key={edge.id}
              edge={edge}
              nodes={nodes}
              frames={frames}
              onDelete={onEdgeDelete}
            />
          ))}
        </svg>

        {/* Nodes layer (above edges) */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ zIndex: isCenterPointMode ? -1 : 2 }}
        >
          {nodes.map((node) => (
            <NodeCard
              key={node.id}
              node={node}
              isSelected={selectedNodeIds.has(node.id)}
              isMultiSelected={
                selectedNodeIds.size > 1 && selectedNodeIds.has(node.id)
              }
              isLinkingMode={isLinkingMode && !selectedNodeIds.has(node.id)}
              scale={scale}
              automationCount={
                node.type === "ai" ? (node.linkedAutomationIds?.length ?? 0) : 0
              }
              onSelect={isCenterPointMode ? () => {} : onNodeSelect}
              onPositionChange={onNodePositionChange}
            />
          ))}
        </div>
      </div>

      {/* Edge boundary indicators - styled like top bar */}
      <div
        className={`absolute top-0 left-0 right-0 h-3 pointer-events-none transition-opacity duration-200 ${
          edgeState.top ? "opacity-100" : "opacity-0"
        }`}
        style={{
          background:
            "linear-gradient(to bottom, white 0%, rgba(255,255,255,0.8) 40%, transparent 100%)",
          borderBottom: edgeState.top ? "1px solid rgb(203 213 225)" : "none",
        }}
      />
      <div
        className={`absolute bottom-0 left-0 right-0 h-3 pointer-events-none transition-opacity duration-200 ${
          edgeState.bottom ? "opacity-100" : "opacity-0"
        }`}
        style={{
          background:
            "linear-gradient(to top, white 0%, rgba(255,255,255,0.8) 40%, transparent 100%)",
          borderTop: edgeState.bottom ? "1px solid rgb(203 213 225)" : "none",
        }}
      />
      <div
        className={`absolute top-0 bottom-0 left-0 w-3 pointer-events-none transition-opacity duration-200 ${
          edgeState.left ? "opacity-100" : "opacity-0"
        }`}
        style={{
          background:
            "linear-gradient(to right, white 0%, rgba(255,255,255,0.8) 40%, transparent 100%)",
          borderRight: edgeState.left ? "1px solid rgb(203 213 225)" : "none",
        }}
      />
      <div
        className={`absolute top-0 bottom-0 right-0 w-3 pointer-events-none transition-opacity duration-200 ${
          edgeState.right ? "opacity-100" : "opacity-0"
        }`}
        style={{
          background:
            "linear-gradient(to left, white 0%, rgba(255,255,255,0.8) 40%, transparent 100%)",
          borderLeft: edgeState.right ? "1px solid rgb(203 213 225)" : "none",
        }}
      />
    </div>
  );
};
