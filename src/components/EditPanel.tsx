import {
  Bot,
  User,
  Settings,
  Sparkles,
  X,
  Trash2,
  Circle,
  Square,
  LayoutGrid,
  Package,
  Zap,
  Unlink,
  ExternalLink,
} from "lucide-react";
import type { OrgNode, NodeShape, GroupColor, AiAutomation } from "../types";

interface EditPanelProps {
  node: OrgNode;
  isGenerating: boolean;
  automations?: AiAutomation[];
  onClose: () => void;
  onUpdate: (id: string, updates: Partial<OrgNode>) => void;
  onDelete: (id: string) => void;
  onGenerate: (
    title: string,
    description: string,
  ) => Promise<{ description: string; systemInstruction: string } | null>;
  onLinkAutomation?: (nodeId: string, automationId: string) => void;
  onUnlinkAutomation?: (nodeId: string, automationId: string) => void;
  onNavigateToAutomation?: () => void;
}

export const EditPanel: React.FC<EditPanelProps> = ({
  node,
  isGenerating,
  automations = [],
  onClose,
  onUpdate,
  onDelete,
  onGenerate,
  onLinkAutomation,
  onUnlinkAutomation,
  onNavigateToAutomation,
}) => {
  const handleGenerate = async () => {
    const result = await onGenerate(node.title, node.description);
    if (result) {
      onUpdate(node.id, result);
    }
  };

  const shapeOptions: {
    value: NodeShape;
    label: string;
    icon: React.ReactNode;
  }[] = [
    { value: "circle", label: "Circle", icon: <Circle size={12} /> },
    { value: "card", label: "Card", icon: <Square size={12} /> },
    { value: "group", label: "Group", icon: <LayoutGrid size={12} /> },
  ];

  return (
    <>
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm z-40 transition-opacity"
        onClick={onClose}
      />
      <div
        className="absolute inset-x-0 bottom-0 md:inset-y-0 md:left-auto md:right-0 h-[80vh] md:h-full w-full md:max-w-sm bg-slate-900 border-t md:border-t-0 md:border-l border-slate-800 shadow-2xl z-50 overflow-y-auto rounded-t-2xl md:rounded-none animate-in slide-in-from-bottom md:slide-in-from-right duration-300 safe-area-bottom safe-area-right"
        style={{
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
          paddingRight: "env(safe-area-inset-right, 0px)",
        }}
      >
        <div
          className="p-4 md:p-5 flex flex-col h-full gap-4 md:gap-5"
          style={{
            paddingBottom: "max(env(safe-area-inset-bottom, 0px), 1rem)",
          }}
        >
          {/* Drag Handle for Mobile */}
          <div className="flex items-center justify-center md:hidden">
            <div className="w-12 h-1 bg-slate-700 rounded-full" />
          </div>

          <div className="flex items-center justify-between">
            <h2 className="text-base md:text-lg font-semibold text-white">
              Edit Node
            </h2>
            <button
              onClick={onClose}
              className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 transition-colors"
            >
              <X size={18} className="md:w-5 md:h-5" />
            </button>
          </div>

          <div className="space-y-4 md:space-y-5 flex-1 overflow-y-auto">
            {/* Title */}
            <div className="space-y-1.5 md:space-y-2">
              <label className="text-[10px] md:text-xs font-medium text-slate-500 uppercase tracking-widest">
                Title
              </label>
              <input
                type="text"
                value={node.title}
                onChange={(e) => onUpdate(node.id, { title: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 md:px-4 py-2.5 md:py-3 text-sm md:text-base text-white focus:ring-2 focus:ring-sky-500 outline-none transition-all"
              />
            </div>

            {/* Subtitle */}
            <div className="space-y-1.5 md:space-y-2">
              <label className="text-[10px] md:text-xs font-medium text-slate-500 uppercase tracking-widest">
                Subtitle
              </label>
              <input
                type="text"
                value={node.subtitle || ""}
                onChange={(e) =>
                  onUpdate(node.id, { subtitle: e.target.value })
                }
                placeholder="e.g., Product Manager"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 md:px-4 py-2.5 md:py-3 text-sm md:text-base text-white focus:ring-2 focus:ring-sky-500 outline-none transition-all"
              />
            </div>

            {/* Shape & Type in a row on mobile */}
            <div className="grid grid-cols-2 gap-3 md:block md:space-y-5">
              {/* Shape */}
              <div className="space-y-1.5 md:space-y-2">
                <label className="text-[10px] md:text-xs font-medium text-slate-500 uppercase tracking-widest">
                  Shape
                </label>
                <div className="flex gap-1 p-1 bg-slate-950 rounded-xl border border-slate-800">
                  {shapeOptions.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => onUpdate(node.id, { shape: option.value })}
                      className={`flex-1 py-1.5 md:py-2 rounded-lg text-[10px] md:text-xs font-medium flex items-center justify-center gap-1 transition-all ${
                        node.shape === option.value
                          ? "bg-sky-600 text-white shadow-lg"
                          : "text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      {option.icon}
                    </button>
                  ))}
                </div>
              </div>

              {/* Type */}
              <div className="space-y-1.5 md:space-y-2">
                <label className="text-[10px] md:text-xs font-medium text-slate-500 uppercase tracking-widest">
                  Type
                </label>
                <div className="flex gap-1 p-1 bg-slate-950 rounded-xl border border-slate-800">
                  <button
                    onClick={() => onUpdate(node.id, { type: "ai" })}
                    className={`flex-1 py-1.5 md:py-2 rounded-lg text-xs md:text-sm font-medium flex items-center justify-center gap-1 md:gap-2 transition-all ${
                      node.type === "ai"
                        ? "bg-sky-600 text-white shadow-lg"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                    title="AI"
                  >
                    <Bot size={12} className="md:w-4 md:h-4" />
                  </button>
                  <button
                    onClick={() => onUpdate(node.id, { type: "human" })}
                    className={`flex-1 py-1.5 md:py-2 rounded-lg text-xs md:text-sm font-medium flex items-center justify-center gap-1 md:gap-2 transition-all ${
                      node.type === "human"
                        ? "bg-emerald-600 text-white shadow-lg"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                    title="Human"
                  >
                    <User size={12} className="md:w-4 md:h-4" />
                  </button>
                  <button
                    onClick={() => onUpdate(node.id, { type: "item" })}
                    className={`flex-1 py-1.5 md:py-2 rounded-lg text-xs md:text-sm font-medium flex items-center justify-center gap-1 md:gap-2 transition-all ${
                      node.type === "item"
                        ? "bg-amber-600 text-white shadow-lg"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                    title="Item"
                  >
                    <Package size={12} className="md:w-4 md:h-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Group Color (only for group shape) */}
            {node.shape === "group" && (
              <div className="space-y-1.5 md:space-y-2">
                <label className="text-[10px] md:text-xs font-medium text-slate-500 uppercase tracking-widest">
                  Color
                </label>
                <div className="grid grid-cols-3 md:grid-cols-4 gap-2 p-2 bg-slate-950 rounded-xl border border-slate-800">
                  {(
                    [
                      { value: "blue", bg: "bg-sky-600", ring: "ring-sky-400" },
                      {
                        value: "green",
                        bg: "bg-emerald-600",
                        ring: "ring-emerald-400",
                      },
                      {
                        value: "purple",
                        bg: "bg-purple-600",
                        ring: "ring-purple-400",
                      },
                      {
                        value: "orange",
                        bg: "bg-orange-600",
                        ring: "ring-orange-400",
                      },
                      { value: "red", bg: "bg-red-600", ring: "ring-red-400" },
                      {
                        value: "pink",
                        bg: "bg-pink-600",
                        ring: "ring-pink-400",
                      },
                      {
                        value: "yellow",
                        bg: "bg-yellow-500",
                        ring: "ring-yellow-400",
                      },
                      {
                        value: "cyan",
                        bg: "bg-cyan-600",
                        ring: "ring-cyan-400",
                      },
                    ] as { value: GroupColor; bg: string; ring: string }[]
                  ).map((color) => (
                    <button
                      key={color.value}
                      onClick={() =>
                        onUpdate(node.id, { groupColor: color.value })
                      }
                      className={`w-full aspect-square rounded-lg ${color.bg} transition-all ${
                        node.groupColor === color.value ||
                        (!node.groupColor && color.value === "blue")
                          ? `ring-2 ${color.ring} ring-offset-2 ring-offset-slate-950 scale-110`
                          : "opacity-60 hover:opacity-100"
                      }`}
                      title={color.value}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Description */}
            <div className="space-y-1.5 md:space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[10px] md:text-xs font-medium text-slate-500 uppercase tracking-widest">
                  Description
                </label>
                <button
                  onClick={handleGenerate}
                  disabled={isGenerating}
                  className="text-[10px] md:text-xs flex items-center gap-1 text-indigo-400 hover:text-indigo-300 transition-colors disabled:opacity-50"
                >
                  <Sparkles size={12} />{" "}
                  {isGenerating ? "Generating..." : "Auto-generate"}
                </button>
              </div>
              <textarea
                value={node.description}
                onChange={(e) =>
                  onUpdate(node.id, { description: e.target.value })
                }
                rows={4}
                placeholder="Enter description..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 md:px-4 py-2.5 md:py-3 text-xs md:text-sm text-slate-300 focus:ring-2 focus:ring-sky-500 outline-none resize-y min-h-[100px] transition-all"
              />
            </div>

            {/* System Instructions (AI only) */}
            {node.type === "ai" && (
              <div className="space-y-1.5 md:space-y-2">
                <label className="text-[10px] md:text-xs font-medium text-slate-500 uppercase tracking-widest flex items-center gap-1.5 md:gap-2">
                  <Settings size={12} /> System Instructions
                </label>
                <textarea
                  value={node.systemInstruction || ""}
                  onChange={(e) =>
                    onUpdate(node.id, { systemInstruction: e.target.value })
                  }
                  rows={4}
                  placeholder="Define AI agent behavior..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 md:px-4 py-2.5 md:py-3 text-xs md:text-sm font-mono text-indigo-300 focus:ring-2 focus:ring-sky-500 outline-none resize-y min-h-[120px] transition-all"
                />
              </div>
            )}

            {/* Linked Automations (AI only) */}
            {node.type === "ai" && (
              <div className="space-y-1.5 md:space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] md:text-xs font-medium text-slate-500 uppercase tracking-widest flex items-center gap-1.5 md:gap-2">
                    <Zap size={12} /> Linked Automations
                  </label>
                  {onNavigateToAutomation && (
                    <button
                      onClick={onNavigateToAutomation}
                      className="text-[10px] md:text-xs flex items-center gap-1 text-indigo-400 hover:text-indigo-300 transition-colors"
                    >
                      <ExternalLink size={10} /> Manage
                    </button>
                  )}
                </div>

                {/* Linked items */}
                {(node.linkedAutomationIds ?? []).length > 0 ? (
                  <div className="space-y-1.5">
                    {(node.linkedAutomationIds ?? []).map((autoId) => {
                      const auto = automations.find((a) => a.id === autoId);
                      if (!auto) return null;
                      return (
                        <div
                          key={autoId}
                          className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2"
                        >
                          <Zap
                            size={12}
                            className={
                              auto.enabled
                                ? "text-emerald-400"
                                : "text-slate-600"
                            }
                          />
                          <span className="text-xs text-slate-300 truncate flex-1">
                            {auto.name}
                          </span>
                          <span
                            className={`text-[9px] px-1.5 py-0.5 rounded-full ${
                              auto.enabled
                                ? "bg-emerald-900/40 text-emerald-400"
                                : "bg-slate-800 text-slate-500"
                            }`}
                          >
                            {auto.enabled ? "ON" : "OFF"}
                          </span>
                          {onUnlinkAutomation && (
                            <button
                              onClick={() =>
                                onUnlinkAutomation(node.id, autoId)
                              }
                              className="p-1 hover:bg-slate-800 rounded text-slate-500 hover:text-red-400 transition-colors"
                              title="Unlink"
                            >
                              <Unlink size={12} />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-[10px] md:text-xs text-slate-600 italic">
                    No automations linked
                  </p>
                )}

                {/* Add automation select */}
                {onLinkAutomation &&
                  (() => {
                    const linkedIds = new Set(node.linkedAutomationIds ?? []);
                    const available = automations.filter(
                      (a) => !linkedIds.has(a.id) && !a.linkedNodeId,
                    );
                    if (available.length === 0) return null;
                    return (
                      <select
                        value=""
                        onChange={(e) => {
                          if (e.target.value) {
                            onLinkAutomation(node.id, e.target.value);
                          }
                        }}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-400 focus:ring-2 focus:ring-sky-500 outline-none"
                      >
                        <option value="">+ Add automation...</option>
                        {available.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name}
                          </option>
                        ))}
                      </select>
                    );
                  })()}
              </div>
            )}
          </div>

          {/* Delete Action */}
          <div className="pt-3 md:pt-4 border-t border-slate-800">
            <button
              onClick={() => onDelete(node.id)}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 md:py-3 bg-red-900/20 hover:bg-red-900/40 text-red-400 rounded-xl transition-all font-medium border border-red-900/50 active:scale-95 text-sm"
            >
              <Trash2 size={16} /> Delete Node
            </button>
          </div>
        </div>
      </div>
    </>
  );
};
