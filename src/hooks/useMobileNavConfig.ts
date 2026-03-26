import { useState, useEffect, useCallback } from "react";
import type { LucideIcon } from "lucide-react";
import { useUserPreferences } from "./useUserPreferences";
import {
  fetchMenuItemsLocal,
  initializeDefaultMenuItemsLocal,
  ensureMissingMenuItems,
} from "../lib/offlineData";
import { ICON_MAP } from "../lib/menuConstants";
import { useAuth } from "../contexts/AuthContext";
import type { MenuItemRow } from "../lib/offlineDb";

export interface NavItem {
  id: string;
  to: string;
  icon: LucideIcon;
  label: string;
}

// Convert MenuItemRow to NavItem
const menuItemRowToNavItem = (row: MenuItemRow): NavItem | null => {
  const IconComponent = ICON_MAP[row.icon];
  if (!IconComponent || !row.is_visible) return null;
  return {
    id: row.path.replace(/^\//, ""),
    to: row.path,
    icon: IconComponent,
    label: row.label,
  };
};

export const useMobileNavConfig = () => {
  const { user } = useAuth();
  const {
    getMobileNavIds,
    getMobileMoreIds,
    saveMobileNavConfig,
    isLoading: prefsLoading,
  } = useUserPreferences();

  // Get values directly for useEffect dependencies
  const prefNavIds = getMobileNavIds();
  const prefMoreIds = getMobileMoreIds();

  const [navIds, setNavIds] = useState<string[]>([]);
  const [moreIds, setMoreIds] = useState<string[]>([]);
  const [allNavItems, setAllNavItems] = useState<NavItem[]>([]);
  const [isLoadingItems, setIsLoadingItems] = useState(true);
  const [syncCompleted, setSyncCompleted] = useState(false);

  // Load menu items from local store
  const loadItems = async (afterSync = false) => {
    if (!user) {
      setAllNavItems([]);
      setIsLoadingItems(false);
      return;
    }

    // If online and menu sync hasn't completed yet, wait for menu-ready event
    if (navigator.onLine && !afterSync && !syncCompleted) {
      // Still load local items while waiting for sync to avoid empty UI.
    }

    setIsLoadingItems(true);
    try {
      let rows = await fetchMenuItemsLocal();
      if (rows.length === 0) {
        await initializeDefaultMenuItemsLocal(user?.id);
        rows = await fetchMenuItemsLocal();
      } else {
        await ensureMissingMenuItems(user?.id);
        rows = await fetchMenuItemsLocal();
      }
      const items = rows
        .map(menuItemRowToNavItem)
        .filter((item): item is NavItem => item !== null)
        .sort((a, b) => {
          const rowA = rows.find((r) => r.path === a.to);
          const rowB = rows.find((r) => r.path === b.to);
          return (rowA?.order_index ?? 0) - (rowB?.order_index ?? 0);
        });
      setAllNavItems(items);
    } catch (error) {
      console.error("Failed to load menu items:", error);
    } finally {
      setIsLoadingItems(false);
    }
  };

  // Initial load - only if offline, otherwise wait for menu-ready
  // Also add a fallback timer in case menu-ready was fired before listener was registered
  useEffect(() => {
    if (!navigator.onLine) {
      loadItems(true);
      return;
    }

    // Fallback: if menu-ready was already fired or event was missed, load after a short delay
    const fallbackTimer = setTimeout(() => {
      if (!syncCompleted && allNavItems.length === 0) {
        loadItems(true);
      }
    }, 1000);

    return () => clearTimeout(fallbackTimer);
  }, [user, syncCompleted, allNavItems.length]);

  // Reload menu items when menu sync completes (to get data from Supabase)
  useEffect(() => {
    const handleMenuReady = async () => {
      setSyncCompleted(true);
      await loadItems(true);
    };

    window.addEventListener("menu-ready", handleMenuReady);
    return () => window.removeEventListener("menu-ready", handleMenuReady);
  }, [user]);

  // Sync with preferences when they change
  useEffect(() => {
    if (prefsLoading || isLoadingItems || allNavItems.length === 0) {
      return;
    }

    // Load saved preferences or initialize defaults
    let currentNavIds: string[] = [];
    let currentMoreIds: string[] = [];

    if (prefNavIds && prefNavIds.length === 4) {
      currentNavIds = prefNavIds;
    } else {
      currentNavIds = allNavItems.slice(0, 4).map((i) => i.id);
    }

    if (prefMoreIds && prefMoreIds.length > 0) {
      currentMoreIds = prefMoreIds;
    } else {
      currentMoreIds = allNavItems
        .filter((i) => !currentNavIds.includes(i.id))
        .map((i) => i.id);
    }

    // Ensure all items are included (handle newly added items)
    const allKnownIds = [...currentNavIds, ...currentMoreIds];
    const missingIds = allNavItems
      .filter((item) => !allKnownIds.includes(item.id))
      .map((item) => item.id);

    if (missingIds.length > 0) {
      currentMoreIds = [...currentMoreIds, ...missingIds];
    }

    setNavIds((prev) => {
      if (JSON.stringify(prev) !== JSON.stringify(currentNavIds))
        return currentNavIds;
      return prev;
    });

    setMoreIds((prev) => {
      if (JSON.stringify(prev) !== JSON.stringify(currentMoreIds))
        return currentMoreIds;
      return prev;
    });
  }, [prefNavIds, prefMoreIds, prefsLoading, isLoadingItems, allNavItems]);

  // Get available items from Supabase
  const getAvailableItems = useCallback((): NavItem[] => {
    return allNavItems;
  }, [allNavItems]);

  // Save nav items
  const saveNavConfig = useCallback(
    (ids: string[]) => {
      if (ids.length === 4) {
        setNavIds(ids);
        const availableItems = getAvailableItems();
        const newMoreIds = availableItems
          .filter((item) => !ids.includes(item.id))
          .map((item) => item.id);
        setMoreIds(newMoreIds);
        saveMobileNavConfig(ids, newMoreIds);
      }
    },
    [saveMobileNavConfig, getAvailableItems],
  );

  // Save more items order
  const saveMoreConfig = useCallback(
    (ids: string[]) => {
      setMoreIds(ids);
      saveMobileNavConfig(navIds, ids);
    },
    [navIds, saveMobileNavConfig],
  );

  // Get nav items for display
  const getNavItems = useCallback((): NavItem[] => {
    const availableItems = getAvailableItems();
    if (navIds && navIds.length === 4) {
      return navIds
        .map((id) => availableItems.find((item) => item.id === id))
        .filter((item): item is NavItem => item !== undefined);
    }
    // Default: first 4 available items
    return availableItems.slice(0, 4);
  }, [navIds, getAvailableItems]);

  // Get items for More menu
  const getMoreItems = useCallback((): NavItem[] => {
    const availableItems = getAvailableItems();
    const currentNavIds =
      navIds && navIds.length === 4
        ? navIds
        : availableItems.slice(0, 4).map((i) => i.id);
    const remainingItems = availableItems.filter(
      (item) => !currentNavIds.includes(item.id),
    );

    if (moreIds && moreIds.length > 0) {
      return moreIds
        .map((id) => remainingItems.find((item) => item.id === id))
        .filter((item): item is NavItem => item !== undefined);
    }
    return remainingItems;
  }, [navIds, moreIds, getAvailableItems]);

  return {
    navIds,
    moreIds,
    saveNavConfig,
    saveMoreConfig,
    getNavItems,
    getMoreItems,
    getAvailableItems,
    selectedIds: navIds,
    saveConfig: saveNavConfig,
  };
};

// Static function removed: prefer hook-based access for offline-first data.
