import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Bell, type LucideIcon } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useProfile } from "../hooks/useProfile";
import { useUserPreferences } from "../hooks/useUserPreferences";
import { useNotificationBadge } from "../contexts/NotificationContext";
import { Layout } from "../components";
import {
  fetchMenuItemsLocal,
  initializeDefaultMenuItemsLocal,
} from "../lib/offlineData";
import { ICON_MAP, MENU_ITEM_DISPLAY_INFO } from "../lib/menuConstants";
import { SOURCE_DISPLAY_CONFIG } from "../lib/notificationConstants";
import { AiCompanyWidget } from "../components/ai-company/AiCompanyWidget";
import type { MenuItemRow } from "../lib/offlineDb";

interface MenuItem {
  to: string;
  icon: LucideIcon;
  title: string;
  description: string;
  color: string;
  bgHover: string;
}

// Convert MenuItemRow to MenuItem
const menuItemRowToMenuItem = (row: MenuItemRow): MenuItem | null => {
  const IconComponent = ICON_MAP[row.icon];
  const displayInfo = MENU_ITEM_DISPLAY_INFO[row.path];
  if (!IconComponent || !row.is_visible || !displayInfo) return null;
  return {
    to: row.path,
    icon: IconComponent,
    title: row.label,
    description: displayInfo.description,
    color: displayInfo.color,
    bgHover: displayInfo.bgHover,
  };
};

export const HubPage = () => {
  const { user } = useAuth();
  const { profile } = useProfile();
  const { preferences, isSynced: preferencesReady } = useUserPreferences();
  const { unreadCount, unreadBySource, gmailUnreadCount } =
    useNotificationBadge();
  // Exclude Gmail from home notification display (Gmail is not shown in Media page)
  const displayUnreadCount = unreadCount - gmailUnreadCount;
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [syncCompleted, setSyncCompleted] = useState(false);

  const displayName = profile?.display_name || user?.email || "";

  // Load menu items from local store
  const loadMenuItems = async (afterSync = false) => {
    if (!user) {
      setMenuItems([]);
      setIsLoading(false);
      return;
    }

    // If online and menu sync hasn't completed yet, wait for menu-ready event
    // Also wait for preferences to be synced so we have sidebar_order
    if (
      navigator.onLine &&
      !afterSync &&
      (!syncCompleted || !preferencesReady)
    ) {
      // Still load local items while waiting for sync to avoid empty UI.
    }

    try {
      let rows = await fetchMenuItemsLocal();
      if (rows.length === 0) {
        await initializeDefaultMenuItemsLocal(user?.id);
        rows = await fetchMenuItemsLocal();
      }
      const items = rows
        .filter((row) => row.path !== "/home") // Skip /home as it's not shown on Home page
        .map(menuItemRowToMenuItem)
        .filter((item): item is MenuItem => item !== null);

      // Sort based on sidebar_order preference if available (same as Sidebar)
      let sortedItems: MenuItem[];
      if (preferences.sidebar_order && preferences.sidebar_order.length > 0) {
        const orderMap = new Map(
          preferences.sidebar_order.map((path, index) => [path, index]),
        );
        sortedItems = items.sort((a, b) => {
          const indexA = orderMap.get(a.to) ?? Number.POSITIVE_INFINITY;
          const indexB = orderMap.get(b.to) ?? Number.POSITIVE_INFINITY;

          if (indexA !== indexB) {
            return indexA - indexB;
          }
          // Fallback to order_index
          const rowA = rows.find((r) => r.path === a.to);
          const rowB = rows.find((r) => r.path === b.to);
          return (rowA?.order_index ?? 0) - (rowB?.order_index ?? 0);
        });
      } else {
        // Fallback to order_index if no preference
        sortedItems = items.sort((a, b) => {
          const rowA = rows.find((r) => r.path === a.to);
          const rowB = rows.find((r) => r.path === b.to);
          return (rowA?.order_index ?? 0) - (rowB?.order_index ?? 0);
        });
      }

      setMenuItems(sortedItems);
    } catch (error) {
      console.error("Failed to load menu items:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Initial load - only if offline, otherwise wait for menu-ready
  // Also add a fallback timer in case menu-ready was fired before listener was registered
  useEffect(() => {
    if (!navigator.onLine) {
      loadMenuItems(true);
      return;
    }

    // Fallback: if menu-ready was already fired or event was missed, load after a short delay
    const fallbackTimer = setTimeout(() => {
      if (!syncCompleted && menuItems.length === 0 && preferencesReady) {
        loadMenuItems(true);
      }
    }, 1000);

    return () => clearTimeout(fallbackTimer);
  }, [user, syncCompleted, menuItems.length, preferencesReady]);

  // Reload menu items when menu sync completes and preferences are ready
  useEffect(() => {
    const handleMenuReady = async () => {
      setSyncCompleted(true);
      // Wait a tick for preferences to potentially update from the sync
      if (preferencesReady) {
        await loadMenuItems(true);
      }
    };

    window.addEventListener("menu-ready", handleMenuReady);
    return () => window.removeEventListener("menu-ready", handleMenuReady);
  }, [user, preferencesReady]);

  // Also reload when preferences become ready after sync
  useEffect(() => {
    if (syncCompleted && preferencesReady && menuItems.length === 0) {
      loadMenuItems(true);
    }
  }, [syncCompleted, preferencesReady, menuItems.length]);

  // Re-sort menu items when sidebar_order preference changes
  useEffect(() => {
    if (menuItems.length === 0) return;

    if (preferences.sidebar_order && preferences.sidebar_order.length > 0) {
      const orderMap = new Map(
        preferences.sidebar_order.map((path, index) => [path, index]),
      );
      const sortedItems = [...menuItems].sort((a, b) => {
        const indexA = orderMap.get(a.to) ?? Number.POSITIVE_INFINITY;
        const indexB = orderMap.get(b.to) ?? Number.POSITIVE_INFINITY;
        return indexA - indexB;
      });

      // Only update if order actually changed
      const currentOrder = menuItems.map((item) => item.to).join(",");
      const newOrder = sortedItems.map((item) => item.to).join(",");
      if (currentOrder !== newOrder) {
        setMenuItems(sortedItems);
      }
    }
  }, [preferences.sidebar_order]);

  const headerCenter = user ? (
    <span className="text-sm text-slate-500">{displayName}</span>
  ) : null;

  return (
    <Layout pageTitle="Home" headerCenter={headerCenter}>
      <div className="h-full overflow-auto neu-bg mobile-scroll-pad">
        {/* Main Content */}
        <main className="max-w-5xl mx-auto px-3 md:px-4 py-6 md:py-12">
          {/* Welcome Section */}
          <div className="text-center mb-6 md:mb-12">
            <h2 className="text-2xl md:text-4xl font-bold neu-text-primary mb-2 md:mb-3">
              Welcome to Hub
            </h2>
            <p className="neu-text-secondary text-sm md:text-lg">
              Your central hub connecting work and personal life
            </p>
          </div>

          {/* Notification Summary */}
          {displayUnreadCount > 0 && (
            <div className="neu-card p-4 md:p-5 mb-6 md:mb-10">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Bell size={18} className="neu-text-muted" />
                  <span className="text-sm md:text-base font-semibold neu-text-primary">
                    Notifications
                  </span>
                  <span className="min-w-[20px] h-5 flex items-center justify-center bg-red-500 text-white text-xs font-bold rounded-full px-1.5">
                    {displayUnreadCount > 99 ? "99+" : displayUnreadCount}
                  </span>
                </div>
                <Link
                  to="/ai/notify-box"
                  className="text-xs md:text-sm text-purple-600 hover:text-purple-800 font-medium flex items-center gap-1"
                >
                  View
                  <ArrowRight size={14} />
                </Link>
              </div>
              <div className="flex flex-wrap gap-2">
                {Object.entries(unreadBySource).map(([source, count]) => {
                  const display = SOURCE_DISPLAY_CONFIG[source];
                  if (!display || count === 0) return null;
                  return (
                    <Link
                      key={source}
                      to={display.link}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs md:text-sm font-medium transition-opacity hover:opacity-80 ${display.color}`}
                    >
                      {display.label}
                      <span className="font-bold">{count}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}

          {/* AI Company Widget */}
          <div className="mb-6 md:mb-10">
            <AiCompanyWidget />
          </div>

          {/* Menu Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6">
            {isLoading
              ? // Skeleton Loader - Neumorphism style
                Array.from({ length: 12 }).map((_, i) => (
                  <div key={i} className="neu-card p-4 md:p-6 animate-pulse">
                    <div className="w-10 h-10 md:w-12 md:h-12 neu-pressed rounded-xl mb-3 md:mb-4" />
                    <div className="h-5 md:h-6 neu-pressed rounded-lg w-3/4 mb-2 md:mb-3" />
                    <div className="h-3 md:h-4 neu-pressed rounded-lg w-full mb-2" />
                    <div className="h-3 md:h-4 neu-pressed rounded-lg w-2/3" />
                  </div>
                ))
              : menuItems.map((item) => (
                  <Link
                    key={item.to}
                    to={item.to}
                    className="group relative neu-card neu-card-hover p-4 md:p-6 transition-all duration-300 hover:-translate-y-1 active:shadow-[inset_5px_5px_10px_rgba(163,177,198,0.6),inset_-5px_-5px_10px_rgba(255,255,255,0.8)]"
                  >
                    {/* Icon with neumorphic style */}
                    <div
                      className={`inline-flex p-2.5 md:p-3 neu-icon-gradient bg-gradient-to-br ${item.color} mb-3 md:mb-4`}
                    >
                      <item.icon className="w-5 h-5 md:w-6 md:h-6 text-white" />
                    </div>

                    <h3 className="text-base md:text-xl font-bold neu-text-primary mb-1 md:mb-2 flex items-center gap-2">
                      {item.title}
                      <ArrowRight
                        size={16}
                        className="hidden md:block opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all neu-text-muted"
                      />
                    </h3>

                    <p className="neu-text-secondary text-xs md:text-sm line-clamp-2">
                      {item.description}
                    </p>
                  </Link>
                ))}
          </div>

          {/* Quick Stats or Info */}
          <div className="mt-8 md:mt-16 text-center">
            <p className="neu-text-muted text-xs md:text-sm">
              Access all features anytime from the navigation
            </p>
          </div>
        </main>
      </div>
    </Layout>
  );
};
