import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import {
  ZoomIn,
  ZoomOut,
  Plus,
  Link as LinkIcon,
  X,
  Loader2,
  Square,
  RefreshCw,
  Crosshair,
  Undo2,
  Redo2,
  LayoutGrid,
  List,
  ChevronDown,
  ChevronUp,
  Trash2,
  Bot,
  User,
  Package,
  Building2,
} from "lucide-react";
import { useAuth } from "./contexts/AuthContext";
import type { OrgNode, Position, Frame } from "./types";
import { generateEdges } from "./utils/edges";
import {
  Canvas,
  EditPanel,
  Layout,
  AlertDialog,
  ConfirmDialog,
} from "./components";
import { useNodes } from "./hooks/useNodes";
import { useFrames } from "./hooks/useFrames";
import { useAiAutomations } from "./hooks/useAiAutomations";
import { useLocationTracker } from "./hooks/useLocationTracker";
import { useUserSetting } from "./hooks/useUserSetting";
import { supabase } from "./lib/supabase";
import {
  generateAiCompanyLayout,
  isAiCompanyNode,
  isAiCompanyFrame,
} from "./lib/ai-company/syncToCanvas";

// Detect if mobile
const isMobile = () => window.innerWidth < 768;

export const App = () => {
  useAuth(); // For auth state check

  const {
    nodes,
    isLoading,
    isSyncing,
    updateNode,
    updateNodePosition,
    addNode,
    removeNode,
    refreshNodes,
  } = useNodes();

  const {
    frames,
    isSyncing: isFramesSyncing,
    updateFrame,
    updateFramePosition,
    updateFrameSize,
    addFrame,
    removeFrame,
    refreshFrames,
  } = useFrames();

  const { automations, updateAutomation } = useAiAutomations();
  useLocationTracker();

  const isAnySyncing = isSyncing || isFramesSyncing;

  const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(
    new Set(),
  );
  const [isMultiSelectMode, setIsMultiSelectMode] = useState(false);

  // ドラッグ開始時のノード位置を保存
  const dragStartPositionsRef = useRef<Map<string, Position>>(new Map());
  const [scale, setScale] = useState(() => (isMobile() ? 0.4 : 0.85));
  const [isGenerating, setIsGenerating] = useState(false);
  const [isLinkingMode, setIsLinkingMode] = useState(false);
  const [linkSourceId, setLinkSourceId] = useState<string | null>(null);
  const [showMobileActions, setShowMobileActions] = useState(false);
  const [isCenterPointMode, setIsCenterPointMode] = useState(false);
  const { value: centerPoint, setValue: setCenterPoint } =
    useUserSetting<Position | null>("workspace_center_point", null);
  const { value: viewMode, setValue: setViewMode } = useUserSetting<
    "canvas" | "list"
  >("org_view_mode", "canvas");
  const safeViewMode = viewMode === "list" ? "list" : "canvas";
  const [listSearchQuery, setListSearchQuery] = useState("");
  const [expandedNodeIds, setExpandedNodeIds] = useState<Set<string>>(
    new Set(),
  );
  const [alertMessage, setAlertMessage] = useState<string | null>(null);
  const [deleteNodeId, setDeleteNodeId] = useState<string | null>(null);

  // Undo/Redo History Management
  interface HistoryEntry {
    nodes: OrgNode[];
    frames: Frame[];
    timestamp: number;
  }

  const historyRef = useRef<HistoryEntry[]>([]);
  const futureRef = useRef<HistoryEntry[]>([]);
  const lastSavedStateRef = useRef<string>("");
  const isUndoRedoActionRef = useRef(false);

  // Save current state to history (debounced)
  const saveToHistory = useCallback(() => {
    if (isUndoRedoActionRef.current) {
      isUndoRedoActionRef.current = false;
      return;
    }

    const currentState = JSON.stringify({ nodes, frames });

    // Don't save if state hasn't changed
    if (currentState === lastSavedStateRef.current) return;

    // Save to history
    historyRef.current = [
      ...historyRef.current,
      {
        nodes: JSON.parse(JSON.stringify(nodes)),
        frames: JSON.parse(JSON.stringify(frames)),
        timestamp: Date.now(),
      },
    ].slice(-50); // Keep last 50 states

    // Clear future on new action
    futureRef.current = [];
    lastSavedStateRef.current = currentState;
  }, [nodes, frames]);

  // Save to history when nodes or frames change
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    if (isLoading) return;

    // Debounce history saves
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(() => {
      saveToHistory();
    }, 500);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [nodes, frames, isLoading, saveToHistory]);

  // Undo function
  const handleUndo = useCallback(async () => {
    if (historyRef.current.length === 0) return;

    // Save current state to future
    futureRef.current = [
      {
        nodes: JSON.parse(JSON.stringify(nodes)),
        frames: JSON.parse(JSON.stringify(frames)),
        timestamp: Date.now(),
      },
      ...futureRef.current,
    ];

    // Get previous state
    const previousState = historyRef.current[historyRef.current.length - 1];
    historyRef.current = historyRef.current.slice(0, -1);

    // Mark as undo action to prevent saving to history
    isUndoRedoActionRef.current = true;

    // Restore nodes
    for (const node of previousState.nodes) {
      await updateNode(node.id, node);
    }
    // Remove nodes that were added
    const previousNodeIds = new Set(previousState.nodes.map((n) => n.id));
    for (const node of nodes) {
      if (!previousNodeIds.has(node.id)) {
        await removeNode(node.id);
      }
    }

    // Restore frames
    for (const frame of previousState.frames) {
      await updateFrame(frame.id, frame);
    }
    // Remove frames that were added
    const previousFrameIds = new Set(previousState.frames.map((f) => f.id));
    for (const frame of frames) {
      if (!previousFrameIds.has(frame.id)) {
        await removeFrame(frame.id);
      }
    }

    lastSavedStateRef.current = JSON.stringify(previousState);
  }, [nodes, frames, updateNode, removeNode, updateFrame, removeFrame]);

  // Redo function
  const handleRedo = useCallback(async () => {
    if (futureRef.current.length === 0) return;

    // Save current state to history
    historyRef.current = [
      ...historyRef.current,
      {
        nodes: JSON.parse(JSON.stringify(nodes)),
        frames: JSON.parse(JSON.stringify(frames)),
        timestamp: Date.now(),
      },
    ];

    // Get next state
    const nextState = futureRef.current[0];
    futureRef.current = futureRef.current.slice(1);

    // Mark as redo action to prevent saving to history
    isUndoRedoActionRef.current = true;

    // Restore nodes
    for (const node of nextState.nodes) {
      await updateNode(node.id, node);
    }
    // Remove nodes that shouldn't exist
    const nextNodeIds = new Set(nextState.nodes.map((n) => n.id));
    for (const node of nodes) {
      if (!nextNodeIds.has(node.id)) {
        await removeNode(node.id);
      }
    }

    // Restore frames
    for (const frame of nextState.frames) {
      await updateFrame(frame.id, frame);
    }
    // Remove frames that shouldn't exist
    const nextFrameIds = new Set(nextState.frames.map((f) => f.id));
    for (const frame of frames) {
      if (!nextFrameIds.has(frame.id)) {
        await removeFrame(frame.id);
      }
    }

    lastSavedStateRef.current = JSON.stringify(nextState);
  }, [nodes, frames, updateNode, removeNode, updateFrame, removeFrame]);

  // Keyboard shortcuts for undo/redo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger when typing in input fields
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key === "z") {
        e.preventDefault();
        if (e.shiftKey) {
          // Cmd+Shift+Z = Redo
          handleRedo();
        } else {
          // Cmd+Z = Undo
          handleUndo();
        }
      }

      // Cmd+Y for Redo (Windows style)
      if ((e.metaKey || e.ctrlKey) && e.key === "y") {
        e.preventDefault();
        handleRedo();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleUndo, handleRedo]);

  const canUndo = historyRef.current.length > 0;
  const canRedo = futureRef.current.length > 0;

  // Generate edges from nodes and frames
  const edges = useMemo(() => generateEdges(nodes, frames), [nodes, frames]);

  // Add frame handler
  const handleAddFrame = async () => {
    await addFrame("blue");
    setShowMobileActions(false);
  };

  // Refresh handler
  const handleRefresh = async () => {
    await Promise.all([refreshNodes(), refreshFrames()]);
  };

  // AI Company sync handler
  const [isSyncingCompany, setIsSyncingCompany] = useState(false);
  const handleSyncAiCompany = async () => {
    setIsSyncingCompany(true);
    try {
      // Remove existing AI Company nodes and frames
      for (const n of nodes.filter((n) => isAiCompanyNode(n.id))) {
        await removeNode(n.id);
      }
      for (const f of frames.filter((f) => isAiCompanyFrame(f.id))) {
        await removeFrame(f.id);
      }

      // Place to the right of existing content
      const nonAicNodes = nodes.filter((n) => !isAiCompanyNode(n.id));
      const startX =
        nonAicNodes.length > 0
          ? Math.max(...nonAicNodes.map((n) => n.position.x)) + 400
          : 100;

      const { nodes: newNodes, frames: newFrames } = generateAiCompanyLayout(
        startX,
        100,
      );

      // Add nodes via hook (handles state + DB sync)
      for (const node of newNodes) {
        await addNode(node);
      }
      // Frames need custom IDs, so upsert directly then refresh
      const { upsertFrame: directUpsertFrame } =
        await import("./lib/offlineData");
      for (const frame of newFrames) {
        await directUpsertFrame(frame);
      }
      await refreshFrames();
    } catch (err) {
      console.error("[AI Company sync]", err);
    }
    setIsSyncingCompany(false);
  };

  // --- Actions ---

  const generateAgentDetails = async (title: string, currentDesc: string) => {
    if (!supabase) {
      setAlertMessage("Supabase is not configured.");
      return null;
    }
    setIsGenerating(true);
    try {
      const prompt = `Role Title: "${title}". Context: "${currentDesc}". Generate description and systemInstructions in JSON: { "description": "...", "systemInstruction": "..." }`;
      const { data, error } = await supabase.functions.invoke("ai_hub_chat", {
        body: {
          content: prompt,
          provider: "gemini",
          model: "gemini-2.5-flash",
          responseMimeType: "application/json",
        },
      });
      if (error) throw error;
      return JSON.parse(data?.assistantMessage?.content || "{}");
    } catch (e) {
      console.error(e);
    } finally {
      setIsGenerating(false);
    }
    return null;
  };

  const handleUpdateNode = (id: string, updates: Partial<OrgNode>) => {
    updateNode(id, updates);
  };

  // ノードまたはフレームのクリック処理（リンクモード対応）
  const handleElementClick = (
    elementId: string,
    isMultiSelect: boolean = false,
  ) => {
    if (isLinkingMode) {
      if (!linkSourceId) {
        setLinkSourceId(elementId);
      } else if (linkSourceId !== elementId) {
        // ソースがフレームかノードかを判定
        if (linkSourceId.startsWith("frame-")) {
          const frameId = linkSourceId.replace("frame-", "");
          const sourceFrame = frames.find((f) => f.id === frameId);
          if (
            sourceFrame &&
            !(sourceFrame.linkedTo || []).includes(elementId)
          ) {
            updateFrame(frameId, {
              linkedTo: [...(sourceFrame.linkedTo || []), elementId],
            });
          }
        } else {
          const sourceNode = nodes.find((n) => n.id === linkSourceId);
          if (sourceNode && !sourceNode.linkedTo.includes(elementId)) {
            handleUpdateNode(linkSourceId, {
              linkedTo: [...sourceNode.linkedTo, elementId],
            });
          }
        }
        setIsLinkingMode(false);
        setLinkSourceId(null);
      }
    } else {
      // ノードのみ選択可能（フレームは選択対象外）
      if (!elementId.startsWith("frame-")) {
        if (isMultiSelect) {
          setIsMultiSelectMode(true);
          setSelectedNodeIds((prev) => {
            const newSet = new Set(prev);
            if (newSet.has(elementId)) {
              newSet.delete(elementId);
            } else {
              newSet.add(elementId);
            }
            return newSet;
          });
        } else {
          setIsMultiSelectMode(false);
          setSelectedNodeIds(new Set([elementId]));
        }
      }
    }
  };

  const handleNodeClick = (id: string, isMultiSelect: boolean = false) => {
    handleElementClick(id, isMultiSelect);
  };

  const handleFrameClick = (frameId: string) => {
    if (isLinkingMode) {
      handleElementClick(`frame-${frameId}`);
    }
  };

  const handleAddNode = async () => {
    const newId = Math.random().toString(36).substr(2, 9);
    const avgX =
      nodes.length > 0
        ? nodes.reduce((sum, n) => sum + n.position.x, 0) / nodes.length
        : 400;
    const avgY =
      nodes.length > 0
        ? nodes.reduce((sum, n) => sum + n.position.y, 0) / nodes.length
        : 300;

    const newNode: OrgNode = {
      id: newId,
      title: "New Node",
      subtitle: "",
      type: "ai",
      shape: "card",
      description: "",
      linkedTo: [],
      position: {
        x: avgX + (Math.random() - 0.5) * 200,
        y: avgY + (Math.random() - 0.5) * 200,
      },
    };
    await addNode(newNode);
    setSelectedNodeIds(new Set([newId]));
    setShowMobileActions(false);
  };

  const handleStartLinking = () => {
    setSelectedNodeIds(new Set());
    setLinkSourceId(null);
    setIsLinkingMode(true);
    setShowMobileActions(false);
  };

  const handleLinkAutomation = async (nodeId: string, automationId: string) => {
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return;
    const newIds = [...(node.linkedAutomationIds ?? []), automationId];
    await updateNode(nodeId, { linkedAutomationIds: newIds });
    await updateAutomation(automationId, { linkedNodeId: nodeId });
  };

  const handleUnlinkAutomation = async (
    nodeId: string,
    automationId: string,
  ) => {
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return;
    const newIds = (node.linkedAutomationIds ?? []).filter(
      (id) => id !== automationId,
    );
    await updateNode(nodeId, {
      linkedAutomationIds: newIds.length > 0 ? newIds : undefined,
    });
    await updateAutomation(automationId, { linkedNodeId: undefined });
  };

  const handleDeleteNode = (id: string) => {
    setDeleteNodeId(id);
  };

  const confirmDeleteNode = async () => {
    if (deleteNodeId) {
      const node = nodes.find((n) => n.id === deleteNodeId);
      if (node?.linkedAutomationIds?.length) {
        for (const autoId of node.linkedAutomationIds) {
          await updateAutomation(autoId, { linkedNodeId: undefined });
        }
      }
      await removeNode(deleteNodeId);
      setSelectedNodeIds((prev) => {
        const newSet = new Set(prev);
        newSet.delete(deleteNodeId);
        return newSet;
      });
      setDeleteNodeId(null);
    }
  };

  const handleDeleteEdge = (edgeId: string) => {
    // Edge ID format: "edge:sourceId:targetId" or "edge:frame-frameId:targetId"
    const parts = edgeId.split(":");
    if (parts.length >= 3) {
      const sourceId = parts[1];
      const targetId = parts[2];

      // Check if source is a frame
      if (sourceId.startsWith("frame-")) {
        const frameId = sourceId.replace("frame-", "");
        const sourceFrame = frames.find((f) => f.id === frameId);
        if (sourceFrame) {
          updateFrame(frameId, {
            linkedTo: (sourceFrame.linkedTo || []).filter(
              (id) => id !== targetId,
            ),
          });
        }
      } else {
        const sourceNode = nodes.find((n) => n.id === sourceId);
        if (sourceNode) {
          handleUpdateNode(sourceId, {
            linkedTo: sourceNode.linkedTo.filter((id) => id !== targetId),
          });
        }
      }
    }
  };

  const handleCanvasClick = () => {
    if (!isLinkingMode) {
      setSelectedNodeIds(new Set());
    }
  };

  const cancelLinking = () => {
    setIsLinkingMode(false);
    setLinkSourceId(null);
  };

  // 単一選択かつ通常クリック時のみEditPanel表示（Shift+クリック時は非表示）
  const selectedNode =
    selectedNodeIds.size === 1 && !isMultiSelectMode
      ? nodes.find((n) => n.id === Array.from(selectedNodeIds)[0])
      : undefined;

  // リンク元の情報を取得（ノードまたはフレーム）
  const linkSourceNode = linkSourceId?.startsWith("frame-")
    ? null
    : nodes.find((n) => n.id === linkSourceId);
  const linkSourceFrame = linkSourceId?.startsWith("frame-")
    ? frames.find((f) => f.id === linkSourceId.replace("frame-", ""))
    : null;

  // 複数選択時のノード位置変更ハンドラー
  const handleMultiNodePositionChange = (
    id: string,
    position: Position,
    delta: Position,
  ) => {
    // ドラッグ開始時の位置をキャプチャ（ドラッグ中のノードがまだキャプチャされていない場合）
    if (!dragStartPositionsRef.current.has(id) && selectedNodeIds.size > 1) {
      // 新しいドラッグが開始されたのでクリアしてから再キャプチャ
      dragStartPositionsRef.current.clear();
      selectedNodeIds.forEach((nodeId) => {
        const node = nodes.find((n) => n.id === nodeId);
        if (node) {
          dragStartPositionsRef.current.set(nodeId, { ...node.position });
        }
      });
    }

    if (selectedNodeIds.has(id) && selectedNodeIds.size > 1) {
      // 選択されたすべてのノードをドラッグ開始位置 + deltaで移動
      selectedNodeIds.forEach((nodeId) => {
        if (nodeId !== id) {
          const startPos = dragStartPositionsRef.current.get(nodeId);
          if (startPos) {
            updateNodePosition(nodeId, {
              x: startPos.x + delta.x,
              y: startPos.y + delta.y,
            });
          }
        }
      });
    }
    updateNodePosition(id, position);
  };

  const getLinkingMessage = () => {
    if (!linkSourceId) {
      return "Select source (node or frame)";
    }
    if (linkSourceFrame) {
      const label = linkSourceFrame.label || "Frame";
      return `Select destination for "${label.slice(0, 8)}${label.length > 8 ? "..." : ""}"`;
    }
    return `Select destination for "${linkSourceNode?.title?.slice(0, 8)}..."`;
  };

  // Filter nodes for list view (must be before early return to maintain hooks order)
  const filteredNodes = useMemo(() => {
    if (!listSearchQuery.trim()) return nodes;
    const query = listSearchQuery.toLowerCase();
    return nodes.filter(
      (node) =>
        node.title.toLowerCase().includes(query) ||
        node.subtitle?.toLowerCase().includes(query) ||
        node.description.toLowerCase().includes(query),
    );
  }, [nodes, listSearchQuery]);

  // Header elements for Layout
  const headerLeft = (
    <button
      onClick={handleRefresh}
      disabled={isAnySyncing}
      className="p-2 neu-text-secondary hover:neu-text-primary neu-btn rounded-lg transition-colors disabled:opacity-50"
      title="Refresh data"
    >
      <RefreshCw size={18} className={isAnySyncing ? "animate-spin" : ""} />
    </button>
  );

  const headerCenter = (
    <div className="flex items-center gap-3">
      {/* View Mode Toggle */}
      <div className="flex items-center gap-0.5 bg-slate-100 p-0.5 rounded-lg">
        <button
          onClick={() => setViewMode("canvas")}
          className={`p-2 md:p-1.5 rounded-md transition-all ${
            safeViewMode === "canvas"
              ? "bg-white text-slate-800 shadow-sm"
              : "text-slate-400 hover:text-slate-600"
          }`}
          title="Canvas View"
        >
          <LayoutGrid size={16} className="md:w-3.5 md:h-3.5" />
        </button>
        <button
          onClick={() => setViewMode("list")}
          className={`p-2 md:p-1.5 rounded-md transition-all ${
            safeViewMode === "list"
              ? "bg-white text-slate-800 shadow-sm"
              : "text-slate-400 hover:text-slate-600"
          }`}
          title="List View"
        >
          <List size={14} />
        </button>
      </div>

      {/* Divider */}
      <div className="hidden md:block w-px h-6 bg-slate-200" />

      {/* Desktop Action Buttons */}
      <div className="hidden md:flex items-center gap-1.5">
        <button
          onClick={handleAddNode}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-xs font-medium transition-all active:scale-95"
          title="Add Node"
        >
          <Plus size={14} />
          <span className="hidden lg:inline">Node</span>
        </button>
        {safeViewMode === "canvas" && (
          <>
            <button
              onClick={handleStartLinking}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-white text-xs font-medium transition-all active:scale-95 ${
                isLinkingMode ? "bg-sky-500" : "bg-sky-600 hover:bg-sky-500"
              }`}
              title="Add Edge"
            >
              <LinkIcon size={14} />
              <span className="hidden lg:inline">Edge</span>
            </button>
            <button
              onClick={handleAddFrame}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition-all active:scale-95"
              title="Add Frame"
            >
              <Square size={14} />
              <span className="hidden lg:inline">Frame</span>
            </button>
          </>
        )}
      </div>

      {/* AI Company Sync */}
      <button
        onClick={handleSyncAiCompany}
        disabled={isSyncingCompany}
        className="hidden md:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition-all active:scale-95 disabled:opacity-50"
        title="AI Company の組織図を同期"
      >
        {isSyncingCompany ? (
          <Loader2 size={14} className="animate-spin" />
        ) : (
          <Building2 size={14} />
        )}
        <span className="hidden lg:inline">AI Co.</span>
      </button>

      {/* Divider */}
      {safeViewMode === "canvas" && (
        <div className="hidden xl:block w-px h-6 bg-slate-200" />
      )}

      {/* Desktop Legend (Canvas mode only) */}
      {safeViewMode === "canvas" && (
        <div className="hidden xl:flex items-center gap-3 text-[11px] text-slate-500">
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-slate-500 ring-1 ring-slate-400"></span>
            <span>Human</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded bg-sky-500"></span>
            <span>AI</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded bg-emerald-500"></span>
            <span>R&D</span>
          </div>
        </div>
      )}
    </div>
  );

  // Node type icon getter
  const getNodeTypeIcon = (type: OrgNode["type"]) => {
    switch (type) {
      case "human":
        return <User size={16} className="text-slate-600" />;
      case "ai":
        return <Bot size={16} className="text-sky-600" />;
      case "item":
        return <Package size={16} className="text-emerald-600" />;
    }
  };

  return (
    <Layout
      pageTitle="Org Chart"
      headerLeft={headerLeft}
      headerCenter={headerCenter}
    >
      {isLoading ? (
        <div className="flex-1 min-h-0 flex items-center justify-center">
          <Loader2 size={32} className="animate-spin neu-text-secondary" />
        </div>
      ) : (
        <div className="flex-1 min-h-0 relative overflow-hidden bg-slate-50">
          {safeViewMode === "canvas" ? (
            <>
              {/* Mobile Floating Action Button */}
              <div
                className="md:hidden fixed right-4 z-50"
                style={{
                  bottom: "calc(5rem + env(safe-area-inset-bottom, 0px))",
                }}
              >
                <button
                  onClick={() => setShowMobileActions(!showMobileActions)}
                  className={`w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-all ${
                    showMobileActions
                      ? "bg-slate-600 rotate-45"
                      : "bg-slate-800"
                  }`}
                >
                  <Plus size={24} className="text-white" />
                </button>

                {/* Action menu */}
                {showMobileActions && (
                  <div className="absolute bottom-16 right-0 flex flex-col gap-2 items-end">
                    <button
                      onClick={handleAddNode}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-slate-700 text-white shadow-lg whitespace-nowrap"
                    >
                      <Plus size={18} /> Add Node
                    </button>
                    <button
                      onClick={handleStartLinking}
                      className={`flex items-center gap-2 px-4 py-2.5 rounded-full text-white shadow-lg whitespace-nowrap ${
                        isLinkingMode ? "bg-sky-500" : "bg-sky-600"
                      }`}
                    >
                      <LinkIcon size={18} /> Add Edge
                    </button>
                    <button
                      onClick={handleAddFrame}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-sky-600 text-white shadow-lg whitespace-nowrap"
                    >
                      <Square size={18} /> Add Frame
                    </button>
                    <button
                      onClick={() => {
                        handleSyncAiCompany();
                        setShowMobileActions(false);
                      }}
                      disabled={isSyncingCompany}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-indigo-600 text-white shadow-lg whitespace-nowrap disabled:opacity-50"
                    >
                      <Building2 size={18} /> AI Company
                    </button>
                  </div>
                )}
              </div>

              {/* Canvas */}
              <Canvas
                nodes={nodes}
                edges={edges}
                frames={frames}
                selectedNodeIds={
                  isLinkingMode
                    ? new Set(linkSourceId ? [linkSourceId] : [])
                    : selectedNodeIds
                }
                isLinkingMode={isLinkingMode}
                scale={scale}
                centerPoint={centerPoint}
                isCenterPointMode={isCenterPointMode}
                onNodeSelect={handleNodeClick}
                onNodePositionChange={handleMultiNodePositionChange}
                onEdgeDelete={handleDeleteEdge}
                onCanvasClick={handleCanvasClick}
                onScaleChange={setScale}
                onFramePositionChange={updateFramePosition}
                onFrameSizeChange={updateFrameSize}
                onFrameDelete={removeFrame}
                onFrameUpdate={updateFrame}
                onFrameClick={handleFrameClick}
                onSetCenterPoint={(pos) => {
                  setCenterPoint(pos);
                  setIsCenterPointMode(false);
                }}
              />

              {/* Zoom Controls */}
              <div
                className="absolute left-3 md:left-6 flex flex-col gap-1 neu-card p-1 md:p-1.5 z-30"
                style={{
                  bottom: "calc(5rem + env(safe-area-inset-bottom, 0px))",
                  marginBottom: "env(safe-area-inset-bottom, 0px)",
                }}
              >
                {/* Undo/Redo */}
                <button
                  onClick={handleUndo}
                  disabled={!canUndo}
                  className="p-1.5 md:p-2 neu-btn neu-text-secondary hover:neu-text-primary transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  title="Undo (⌘Z)"
                >
                  <Undo2 size={16} className="md:w-[18px] md:h-[18px]" />
                </button>
                <button
                  onClick={handleRedo}
                  disabled={!canRedo}
                  className="p-1.5 md:p-2 neu-btn neu-text-secondary hover:neu-text-primary transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  title="Redo (⌘⇧Z)"
                >
                  <Redo2 size={16} className="md:w-[18px] md:h-[18px]" />
                </button>
                <div className="neu-divider my-1" />
                {/* Zoom */}
                <button
                  onClick={() => setScale((s) => Math.min(s + 0.1, 2))}
                  className="p-1.5 md:p-2 neu-btn neu-text-secondary hover:neu-text-primary transition-colors"
                >
                  <ZoomIn size={16} className="md:w-[18px] md:h-[18px]" />
                </button>
                <button
                  onClick={() => setScale(1)}
                  className="text-[9px] md:text-[10px] text-center neu-text-secondary py-0.5 md:py-1 hover:neu-text-primary neu-btn transition-colors w-full"
                  title="Reset to 100%"
                >
                  {Math.round(scale * 100)}%
                </button>
                <button
                  onClick={() => setScale((s) => Math.max(s - 0.1, 0.2))}
                  className="p-1.5 md:p-2 neu-btn neu-text-secondary hover:neu-text-primary transition-colors"
                >
                  <ZoomOut size={16} className="md:w-[18px] md:h-[18px]" />
                </button>
                <div className="neu-divider my-1" />
                <button
                  onClick={() => setIsCenterPointMode(!isCenterPointMode)}
                  className={`p-1.5 md:p-2 rounded-lg transition-colors ${
                    isCenterPointMode
                      ? "bg-teal-500 text-white"
                      : "neu-btn neu-text-secondary hover:neu-text-primary"
                  }`}
                  title="Set pivot point"
                >
                  <Crosshair size={16} className="md:w-[18px] md:h-[18px]" />
                </button>
              </div>

              {/* Center Point Mode Indicator */}
              {isCenterPointMode && (
                <div
                  className="absolute left-1/2 -translate-x-1/2 bg-teal-600 px-3 md:px-5 py-2 md:py-3 rounded-full shadow-xl flex items-center gap-2 md:gap-3 z-40 text-white"
                  style={{
                    bottom: "calc(5rem + env(safe-area-inset-bottom, 0px))",
                  }}
                >
                  <Crosshair size={14} className="md:w-[18px] md:h-[18px]" />
                  <span className="font-medium text-xs md:text-sm whitespace-nowrap">
                    Click to set pivot point
                  </span>
                  <button
                    onClick={() => setIsCenterPointMode(false)}
                    className="ml-1 md:ml-2 p-1 hover:bg-teal-500 rounded-full transition-colors"
                  >
                    <X size={14} className="md:w-4 md:h-4" />
                  </button>
                </div>
              )}

              {/* Linking Mode Indicator */}
              {isLinkingMode && (
                <div
                  className="absolute left-1/2 -translate-x-1/2 bg-sky-600 px-3 md:px-5 py-2 md:py-3 rounded-full shadow-xl flex items-center gap-2 md:gap-3 z-40 text-white"
                  style={{
                    bottom: "calc(5rem + env(safe-area-inset-bottom, 0px))",
                  }}
                >
                  <LinkIcon size={14} className="md:w-[18px] md:h-[18px]" />
                  <span className="font-medium text-xs md:text-sm whitespace-nowrap">
                    {getLinkingMessage()}
                  </span>
                  <button
                    onClick={cancelLinking}
                    className="ml-1 md:ml-2 p-1 hover:bg-sky-500 rounded-full transition-colors"
                  >
                    <X size={14} className="md:w-4 md:h-4" />
                  </button>
                </div>
              )}

              {/* Multi-select indicator */}
              {selectedNodeIds.size > 1 && !isLinkingMode && (
                <div
                  className="absolute left-1/2 -translate-x-1/2 bg-indigo-600 px-3 md:px-5 py-2 md:py-3 rounded-full shadow-xl flex items-center gap-2 md:gap-3 z-40 text-white"
                  style={{
                    bottom: "calc(5rem + env(safe-area-inset-bottom, 0px))",
                  }}
                >
                  <span className="font-medium text-xs md:text-sm whitespace-nowrap">
                    {selectedNodeIds.size} selected
                  </span>
                  <button
                    onClick={() => setSelectedNodeIds(new Set())}
                    className="ml-1 md:ml-2 p-1 hover:bg-indigo-500 rounded-full transition-colors"
                  >
                    <X size={14} className="md:w-4 md:h-4" />
                  </button>
                </div>
              )}

              {/* Edit Panel */}
              {selectedNode && !isLinkingMode && (
                <EditPanel
                  node={selectedNode}
                  isGenerating={isGenerating}
                  automations={automations}
                  onClose={() => setSelectedNodeIds(new Set())}
                  onUpdate={handleUpdateNode}
                  onDelete={handleDeleteNode}
                  onGenerate={generateAgentDetails}
                  onLinkAutomation={handleLinkAutomation}
                  onUnlinkAutomation={handleUnlinkAutomation}
                  onNavigateToAutomation={() => {
                    window.location.href = "/ai/automation";
                  }}
                />
              )}
            </>
          ) : (
            /* List View */
            <div className="h-full overflow-auto p-4 md:p-6 mobile-scroll-pad">
              <div className="max-w-4xl mx-auto">
                {/* Search */}
                <div className="mb-4">
                  <input
                    type="text"
                    value={listSearchQuery}
                    onChange={(e) => setListSearchQuery(e.target.value)}
                    placeholder="Search nodes..."
                    className="w-full px-4 py-3 neu-input"
                  />
                </div>

                {/* Stats */}
                <div className="flex items-center gap-4 mb-4 text-sm text-slate-500">
                  <span>{filteredNodes.length} nodes</span>
                  <span>•</span>
                  <span>
                    {filteredNodes.filter((n) => n.type === "human").length}{" "}
                    human
                  </span>
                  <span>
                    {filteredNodes.filter((n) => n.type === "ai").length} AI
                  </span>
                  <span>
                    {filteredNodes.filter((n) => n.type === "item").length}{" "}
                    items
                  </span>
                </div>

                {/* Node List */}
                <div className="space-y-3">
                  {filteredNodes.length === 0 ? (
                    <div className="text-center py-12 neu-card">
                      <Package
                        size={40}
                        className="mx-auto neu-text-muted mb-3"
                      />
                      <p className="neu-text-secondary">
                        {listSearchQuery
                          ? "No nodes match your search"
                          : "No nodes yet"}
                      </p>
                    </div>
                  ) : (
                    filteredNodes.map((node) => {
                      const isExpanded = expandedNodeIds.has(node.id);
                      // Outgoing connections (nodes this node links to)
                      const outgoingNodes = nodes.filter((n) =>
                        node.linkedTo.includes(n.id),
                      );
                      // Incoming connections (nodes that link to this node)
                      const incomingNodes = nodes.filter((n) =>
                        n.linkedTo.includes(node.id),
                      );
                      const hasConnections =
                        outgoingNodes.length > 0 || incomingNodes.length > 0;

                      return (
                        <div key={node.id} className="neu-card overflow-hidden">
                          <div className="p-4">
                            <div className="flex items-start gap-3">
                              {/* Icon */}
                              <div
                                className={`p-2 rounded-lg shrink-0 ${
                                  node.type === "human"
                                    ? "bg-slate-100"
                                    : node.type === "ai"
                                      ? "bg-sky-50"
                                      : "bg-emerald-50"
                                }`}
                              >
                                {getNodeTypeIcon(node.type)}
                              </div>

                              {/* Content */}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <input
                                    type="text"
                                    value={node.title}
                                    onChange={(e) =>
                                      handleUpdateNode(node.id, {
                                        title: e.target.value,
                                      })
                                    }
                                    placeholder="Node title..."
                                    className="flex-1 text-lg font-semibold text-slate-800 bg-transparent border-none outline-none placeholder:text-slate-300 focus:ring-0 min-w-0"
                                  />
                                  <span
                                    className={`text-xs px-2 py-1 rounded-full ${
                                      node.type === "human"
                                        ? "bg-slate-100 text-slate-600"
                                        : node.type === "ai"
                                          ? "bg-sky-100 text-sky-700"
                                          : "bg-emerald-100 text-emerald-700"
                                    }`}
                                  >
                                    {node.type}
                                  </span>
                                </div>

                                {/* Subtitle */}
                                {!isExpanded && node.subtitle && (
                                  <p className="text-sm text-slate-500 mt-1 truncate">
                                    {node.subtitle}
                                  </p>
                                )}

                                {/* Connections Preview (collapsed state) */}
                                {!isExpanded && hasConnections && (
                                  <div className="mt-2 flex flex-wrap gap-2">
                                    {/* Outgoing connections */}
                                    {outgoingNodes.slice(0, 3).map((ln) => (
                                      <span
                                        key={`out-${ln.id}`}
                                        className="inline-flex items-center gap-1 px-2 py-1 bg-sky-50 text-sky-700 text-xs rounded-full"
                                        title={`Links to: ${ln.title || "(Untitled)"}`}
                                      >
                                        <LinkIcon size={10} />
                                        <span className="max-w-[100px] truncate">
                                          {ln.title || "(Untitled)"}
                                        </span>
                                      </span>
                                    ))}
                                    {outgoingNodes.length > 3 && (
                                      <span className="inline-flex items-center px-2 py-1 bg-slate-100 text-slate-500 text-xs rounded-full">
                                        +{outgoingNodes.length - 3} more
                                      </span>
                                    )}
                                    {/* Incoming connections */}
                                    {incomingNodes.slice(0, 2).map((ln) => (
                                      <span
                                        key={`in-${ln.id}`}
                                        className="inline-flex items-center gap-1 px-2 py-1 bg-purple-50 text-purple-700 text-xs rounded-full"
                                        title={`Linked from: ${ln.title || "(Untitled)"}`}
                                      >
                                        <span className="max-w-[100px] truncate">
                                          {ln.title || "(Untitled)"}
                                        </span>
                                        <LinkIcon size={10} />
                                      </span>
                                    ))}
                                    {incomingNodes.length > 2 && (
                                      <span className="inline-flex items-center px-2 py-1 bg-slate-100 text-slate-500 text-xs rounded-full">
                                        +{incomingNodes.length - 2} from
                                      </span>
                                    )}
                                  </div>
                                )}

                                {/* Expanded Content */}
                                {isExpanded && (
                                  <div className="mt-4 space-y-4">
                                    <div>
                                      <label className="text-xs text-slate-500 mb-1 block">
                                        Subtitle
                                      </label>
                                      <input
                                        type="text"
                                        value={node.subtitle || ""}
                                        onChange={(e) =>
                                          handleUpdateNode(node.id, {
                                            subtitle: e.target.value,
                                          })
                                        }
                                        placeholder="Subtitle..."
                                        className="w-full text-sm neu-input rounded-lg px-3 py-2"
                                      />
                                    </div>

                                    <div>
                                      <label className="text-xs text-slate-500 mb-1 block">
                                        Description
                                      </label>
                                      <textarea
                                        value={node.description}
                                        onChange={(e) =>
                                          handleUpdateNode(node.id, {
                                            description: e.target.value,
                                          })
                                        }
                                        placeholder="Description..."
                                        rows={3}
                                        className="w-full text-sm neu-input rounded-lg px-3 py-2 resize-y min-h-[80px]"
                                      />
                                    </div>

                                    {node.systemInstruction && (
                                      <div>
                                        <label className="text-xs text-slate-500 mb-1 block">
                                          System Instruction
                                        </label>
                                        <div className="text-sm neu-pressed rounded-lg px-3 py-2 neu-text-secondary max-h-32 overflow-y-auto">
                                          {node.systemInstruction}
                                        </div>
                                      </div>
                                    )}

                                    {/* Outgoing Connections (expanded) */}
                                    {outgoingNodes.length > 0 && (
                                      <div>
                                        <label className="text-xs text-slate-500 mb-2 flex items-center gap-1">
                                          <LinkIcon size={12} />
                                          Links to ({outgoingNodes.length})
                                        </label>
                                        <div className="flex flex-wrap gap-2">
                                          {outgoingNodes.map((ln) => (
                                            <span
                                              key={ln.id}
                                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-sky-50 text-sky-700 text-sm rounded-lg"
                                            >
                                              {getNodeTypeIcon(ln.type)}
                                              {ln.title || "(Untitled)"}
                                            </span>
                                          ))}
                                        </div>
                                      </div>
                                    )}

                                    {/* Incoming Connections (expanded) */}
                                    {incomingNodes.length > 0 && (
                                      <div>
                                        <label className="text-xs text-slate-500 mb-2 flex items-center gap-1">
                                          <LinkIcon
                                            size={12}
                                            className="rotate-180"
                                          />
                                          Linked from ({incomingNodes.length})
                                        </label>
                                        <div className="flex flex-wrap gap-2">
                                          {incomingNodes.map((ln) => (
                                            <span
                                              key={ln.id}
                                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-purple-50 text-purple-700 text-sm rounded-lg"
                                            >
                                              {getNodeTypeIcon(ln.type)}
                                              {ln.title || "(Untitled)"}
                                            </span>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>

                              {/* Actions */}
                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  onClick={() => {
                                    setExpandedNodeIds((prev) => {
                                      const newSet = new Set(prev);
                                      if (newSet.has(node.id)) {
                                        newSet.delete(node.id);
                                      } else {
                                        newSet.add(node.id);
                                      }
                                      return newSet;
                                    });
                                  }}
                                  className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                                  title={isExpanded ? "Collapse" : "Expand"}
                                >
                                  {isExpanded ? (
                                    <ChevronUp size={18} />
                                  ) : (
                                    <ChevronDown size={18} />
                                  )}
                                </button>
                                <button
                                  onClick={() => handleDeleteNode(node.id)}
                                  className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                  title="Delete"
                                >
                                  <Trash2 size={18} />
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Add Node Button (List view) */}
                <button
                  onClick={handleAddNode}
                  className="w-full mt-4 flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 border-dashed border-slate-300 text-slate-500 hover:border-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-all"
                >
                  <Plus size={20} /> Add Node
                </button>
              </div>
            </div>
          )}

          {/* API Key Error Alert */}
          <AlertDialog
            isOpen={alertMessage !== null}
            type="error"
            title="Error"
            message={alertMessage || ""}
            onClose={() => setAlertMessage(null)}
          />

          {/* Delete Node Confirmation */}
          <ConfirmDialog
            isOpen={deleteNodeId !== null}
            title="Delete Node"
            message="Are you sure you want to delete this node? This action cannot be undone."
            confirmLabel="Delete"
            onConfirm={confirmDeleteNode}
            onCancel={() => setDeleteNodeId(null)}
          />
        </div>
      )}
    </Layout>
  );
};
