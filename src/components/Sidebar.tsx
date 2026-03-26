import { useState, useRef, useEffect, useCallback } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  ChevronLeft,
  ChevronRight,
  GripVertical,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useProfile } from "../hooks/useProfile";
import { useUserPreferences } from "../hooks/useUserPreferences";
import { useNotificationBadge } from "../contexts/NotificationContext";
import {
  fetchMenuItemsLocal,
  upsertMenuItem,
  initializeDefaultMenuItemsLocal,
  ensureMissingMenuItems,
} from "../lib/offlineData";
import { ICON_MAP } from "../lib/menuConstants";
import { getBadgeCount } from "../lib/notificationConstants";
import type { MenuItemRow } from "../lib/offlineDb";

interface MenuItem {
  id: string;
  to: string;
  icon: LucideIcon;
  label: string;
  colorClass: string;
  hoverClass: string;
  orderIndex: number;
}

const menuItemRowToMenuItem = (row: MenuItemRow): MenuItem | null => {
  const IconComponent = ICON_MAP[row.icon];
  if (!IconComponent || !row.is_visible) return null;
  return {
    id: row.id,
    to: row.path,
    icon: IconComponent,
    label: row.label,
    colorClass: row.color_class,
    hoverClass: row.hover_class,
    orderIndex: row.order_index,
  };
};

export const Sidebar = () => {
  const { user } = useAuth();
  const { profile } = useProfile();
  const { preferences, saveSidebarOrder } = useUserPreferences();
  const { unreadBySource } = useNotificationBadge();
  const location = useLocation();
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  // Start with empty menu items, wait for Supabase to load
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);

  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const draggedIndexRef = useRef<number | null>(null);
  const dragNodeRef = useRef<HTMLDivElement | null>(null);
  const menuItemRowsRef = useRef<MenuItemRow[]>([]);

  const displayName = profile?.display_name || user?.email || "";

  const [isLoading, setIsLoading] = useState(true);
  const [dataFetched, setDataFetched] = useState(false);
  const [syncCompleted, setSyncCompleted] = useState(false);

  // Load menu items from local store
  const loadMenuItems = useCallback(
    async (afterSync = false) => {
      if (!user) {
        setMenuItems([]);
        menuItemRowsRef.current = [];
        setIsLoading(false);
        setDataFetched(true);
        return;
      }

      try {
        // If online and menu sync hasn't completed yet, wait for menu-ready event
        // to ensure we get the latest data from Supabase
        if (navigator.onLine && !afterSync && !syncCompleted) {
          // Still load local items while waiting for sync to avoid empty UI.
        }

        // Fetch menu items from local DB (menu-ready ensures Supabase sync already ran)
        let rows = await fetchMenuItemsLocal();
        if (rows.length === 0) {
          await initializeDefaultMenuItemsLocal(user?.id);
          rows = await fetchMenuItemsLocal();
        } else {
          await ensureMissingMenuItems(user?.id);
          rows = await fetchMenuItemsLocal();
        }

        if (rows.length > 0) {
          // Skip update if data hasn't changed (prevents unnecessary re-renders)
          if (dataFetched) {
            const currentIds = menuItemRowsRef.current
              .map((r) => `${r.id}:${r.order_index}:${r.is_visible}`)
              .join(",");
            const newIds = rows
              .map((r) => `${r.id}:${r.order_index}:${r.is_visible}`)
              .join(",");
            if (currentIds === newIds) {
              setIsLoading(false);
              return;
            }
          }

          menuItemRowsRef.current = rows;

          // Convert to MenuItem format
          let items = rows
            .map(menuItemRowToMenuItem)
            .filter((item): item is MenuItem => item !== null);

          // Sort based on sidebar_order preference if available
          if (
            preferences.sidebar_order &&
            preferences.sidebar_order.length > 0
          ) {
            const orderMap = new Map(
              preferences.sidebar_order.map((path, index) => [path, index]),
            );
            items = items.sort((a, b) => {
              const indexA = orderMap.get(a.to) ?? Number.POSITIVE_INFINITY;
              const indexB = orderMap.get(b.to) ?? Number.POSITIVE_INFINITY;

              if (indexA !== indexB) {
                return indexA - indexB;
              }
              return a.orderIndex - b.orderIndex;
            });
          } else {
            // Fallback to orderIndex if no preference
            items = items.sort((a, b) => a.orderIndex - b.orderIndex);
          }

          setMenuItems(items);
          setDataFetched(true);
        }
      } catch (error) {
        console.error("Failed to load menu items:", error);
      } finally {
        setIsLoading(false);
      }
    },
    [user, dataFetched, preferences.sidebar_order, syncCompleted],
  );

  // Initial load - only if offline, otherwise wait for menu-ready
  // Also add a fallback timer in case menu-ready was fired before listener was registered
  useEffect(() => {
    if (!navigator.onLine) {
      // Offline: load from local DB immediately
      loadMenuItems(true);
      return;
    }

    // Fallback: if menu-ready was already fired or event was missed, load after a short delay
    const fallbackTimer = setTimeout(() => {
      if (!syncCompleted && menuItems.length === 0) {
        loadMenuItems(true);
      }
    }, 1000);

    return () => clearTimeout(fallbackTimer);
  }, [loadMenuItems, syncCompleted, menuItems.length]);

  // Reload menu items when menu sync completes (to get data from Supabase)
  useEffect(() => {
    const handleMenuReady = () => {
      setSyncCompleted(true);
      loadMenuItems(true); // Load with afterSync=true to bypass the wait
    };

    window.addEventListener("menu-ready", handleMenuReady);
    return () => window.removeEventListener("menu-ready", handleMenuReady);
  }, [loadMenuItems]);

  const isActive = (path: string) => {
    if (path === "/home") {
      return location.pathname === "/home" || location.pathname === "/";
    }
    return (
      location.pathname === path || location.pathname.startsWith(`${path}/`)
    );
  };

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    draggedIndexRef.current = index;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", index.toString());

    // Make drag image slightly transparent
    if (dragNodeRef.current) {
      e.dataTransfer.setDragImage(dragNodeRef.current, 0, 0);
    }
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverIndex(index);
  };

  const handleDragLeave = () => {
    setDragOverIndex(null);
  };

  const handleDrop = async (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();

    const dataIndex = e.dataTransfer.getData("text/plain");
    const fromIndexRaw =
      draggedIndexRef.current ?? (dataIndex ? Number(dataIndex) : Number.NaN);
    const fromIndex = Number.isFinite(fromIndexRaw) ? fromIndexRaw : null;

    if (
      fromIndex === null ||
      fromIndex === dropIndex ||
      fromIndex < 0 ||
      fromIndex >= menuItems.length
    ) {
      setDraggedIndex(null);
      setDragOverIndex(null);
      draggedIndexRef.current = null;
      return;
    }

    const newItems = [...menuItems];
    const [draggedItem] = newItems.splice(fromIndex, 1);
    newItems.splice(dropIndex, 0, draggedItem);

    // Update local state immediately for smooth UX
    setMenuItems(newItems);

    // Save new order to user preferences (sidebar_order)
    // This is now the primary source of truth for order
    const newOrderPaths = newItems.map((item) => item.to);
    await saveSidebarOrder(newOrderPaths);

    // Also update order_index in Supabase for backward compatibility / fallback
    const updatedItems = newItems.map((item, index) => ({
      ...item,
      orderIndex: index,
    }));

    for (let i = 0; i < updatedItems.length; i++) {
      const item = updatedItems[i];
      const row = menuItemRowsRef.current.find((r) => r.id === item.id);
      if (row && row.order_index !== i) {
        await upsertMenuItem({
          ...row,
          order_index: i,
          updated_at: new Date().toISOString(),
        });
      }
    }

    // Reload to sync state
    loadMenuItems();

    setDraggedIndex(null);
    setDragOverIndex(null);
    draggedIndexRef.current = null;
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
    draggedIndexRef.current = null;
  };

  return (
    <aside
      className={`hidden md:flex flex-col neu-bg transition-[width] duration-300 safe-area-left border-r border-slate-300 ${
        isSidebarOpen ? "w-48" : "w-14"
      }`}
      style={{
        paddingLeft: "env(safe-area-inset-left, 0px)",
        boxShadow: "4px 0 6px rgba(163, 177, 198, 0.3)",
      }}
    >
      {/* Sidebar Toggle */}
      <div
        className="flex items-center justify-center border-b border-slate-300"
        style={{ minHeight: "3.5rem" }}
      >
        <button
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          className="flex items-center justify-center w-full h-full p-3 neu-text-secondary hover:neu-text-primary transition-colors"
        >
          {isSidebarOpen ? (
            <ChevronLeft size={18} />
          ) : (
            <ChevronRight size={18} />
          )}
        </button>
      </div>

      {/* Sidebar Menu */}
      <nav className="flex-1 p-2 space-y-2 overflow-y-auto no-select">
        {isLoading
          ? // Skeleton Loader
            Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center gap-2 px-3 py-2.5 neu-flat rounded-xl animate-pulse"
              >
                <div className="w-5 h-5 neu-pressed rounded shrink-0" />
                {isSidebarOpen && (
                  <div className="h-4 neu-pressed rounded w-20" />
                )}
              </div>
            ))
          : menuItems.map((item, index) => {
              const Icon = item.icon;
              const active = isActive(item.to);
              const isDragging = draggedIndex === index;
              const isDragOver = dragOverIndex === index;

              return (
                <div
                  key={item.to}
                  draggable
                  onDragStart={(e) => handleDragStart(e, index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, index)}
                  onDragEnd={handleDragEnd}
                  className={`relative group ${isDragging ? "opacity-50" : ""}`}
                >
                  {/* Drop indicator */}
                  {isDragOver && draggedIndex !== index && (
                    <div className="absolute -top-1 left-0 right-0 h-0.5 bg-sky-500 rounded-full" />
                  )}

                  <Link
                    to={item.to}
                    className={`flex items-center py-2.5 rounded-xl transition-all ${
                      isSidebarOpen ? "gap-2 px-3" : "justify-center px-2"
                    } ${
                      active
                        ? "neu-pressed neu-text-primary font-semibold"
                        : "neu-text-secondary hover:neu-text-primary"
                    }`}
                    onClick={(e) => {
                      // Prevent navigation during drag
                      if (draggedIndex !== null) {
                        e.preventDefault();
                      }
                    }}
                  >
                    {/* Drag Handle */}
                    {isSidebarOpen && (
                      <GripVertical
                        size={14}
                        className="shrink-0 neu-text-muted group-hover:neu-text-secondary cursor-grab active:cursor-grabbing"
                      />
                    )}
                    <div className="relative shrink-0">
                      <Icon
                        size={20}
                        className={active ? "text-sky-600" : item.colorClass}
                      />
                      {(() => {
                        const badgeCount = getBadgeCount(
                          item.to,
                          unreadBySource,
                        );
                        return badgeCount > 0 ? (
                          <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 flex items-center justify-center bg-red-500 text-white text-[10px] font-bold rounded-full px-1">
                            {badgeCount > 99 ? "99+" : badgeCount}
                          </span>
                        ) : null;
                      })()}
                    </div>
                    {isSidebarOpen && (
                      <span className="text-sm font-medium">{item.label}</span>
                    )}
                  </Link>
                </div>
              );
            })}
      </nav>

      {/* User Info */}
      {isSidebarOpen && user && (
        <div
          className="p-3"
          style={{ boxShadow: "0 -2px 4px rgba(163, 177, 198, 0.2)" }}
        >
          <div
            className="text-xs neu-text-muted truncate"
            title={user.email || ""}
          >
            {displayName}
          </div>
        </div>
      )}
    </aside>
  );
};
