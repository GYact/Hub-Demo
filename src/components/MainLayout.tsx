import { Link, Outlet, useLocation } from "react-router-dom";
import { LogOut, Undo2, Redo2, Menu, X } from "lucide-react";
import { Sidebar } from "./Sidebar";
import { useAuth } from "../contexts/AuthContext";
import { useUndoRedo } from "../contexts/UndoRedoContext";
import { useMobileNavConfig } from "../hooks/useMobileNavConfig";
import { useOnlineStatus } from "../hooks/useOnlineStatus";
import { useLayoutState } from "../contexts/LayoutContext";
import { useAppBadge } from "../hooks/useAppBadge";
import { useNotificationBadge } from "../contexts/NotificationContext";
import { getBadgeCount } from "../lib/notificationConstants";
import { useState } from "react";

export const MainLayout = () => {
  // PWA app badge based on incomplete task count
  useAppBadge();
  const { signOut } = useAuth();
  const { canUndo, canRedo, undo, redo } = useUndoRedo();
  const location = useLocation();
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const { getNavItems, getMoreItems } = useMobileNavConfig();
  const isOnline = useOnlineStatus();
  const { pageTitle, headerLeft, headerCenter, headerRight, showSidebar } =
    useLayoutState();
  const { unreadBySource } = useNotificationBadge();

  const mobileNavItems = getNavItems();
  const moreMenuItems = getMoreItems();

  const isActive = (path: string) => {
    if (path === "/home") {
      return location.pathname === "/home" || location.pathname === "/";
    }
    return (
      location.pathname === path || location.pathname.startsWith(`${path}/`)
    );
  };

  const isMoreActive = moreMenuItems.some((item) => isActive(item.to));

  const statusLabel = isOnline ? "Online" : "Offline";

  const mobileHeaderOffset = "calc(env(safe-area-inset-top, 0px) + 68px)";

  return (
    <div className="h-screen h-[100dvh] w-screen flex flex-col overflow-hidden neu-bg">
      {/* Header - Full width at top with safe area */}
      <header className="fixed inset-x-0 top-0 md:relative shrink-0 neu-bg z-40 safe-area-top safe-area-x neu-header-shadow">
        {/* Mobile Header */}
        <div className="md:hidden">
          <div className="flex items-center justify-between px-4 py-3">
            {/* Left - Logo */}
            <Link to="/home" className="flex items-center gap-2 shrink-0">
              <div className="neu-btn p-1.5 rounded-xl shrink-0">
                <img src="/icon.svg" alt="Hub" className="w-8 h-8 rounded-lg" />
              </div>
              <div className="flex flex-col">
                <span className="text-base font-bold neu-text-primary leading-tight">
                  Hub
                </span>
                {pageTitle && (
                  <span className="text-[11px] neu-text-secondary font-medium">
                    {pageTitle}
                  </span>
                )}
              </div>
            </Link>

            {/* Right - Action buttons */}
            <div className="flex items-center gap-1">
              <span
                className={`neu-btn px-2 py-1 text-[10px] font-semibold shrink-0 ${isOnline ? "text-emerald-600" : "text-amber-600"}`}
              >
                {statusLabel}
              </span>
              {headerLeft}
              {headerCenter}
              {headerRight}
            </div>
          </div>
        </div>

        {/* Desktop Header */}
        <div
          className="hidden md:flex items-center justify-between px-4 py-2 relative"
          style={{ minHeight: "3.5rem" }}
        >
          {/* Left section - Logo and sync status */}
          <div className="flex items-center gap-3 shrink-0 z-10">
            <Link
              to="/home"
              className="flex items-center gap-3 hover:opacity-80 transition-opacity"
            >
              <div className="neu-btn p-1.5 rounded-xl">
                <img src="/icon.svg" alt="Hub" className="w-8 h-8 rounded-lg" />
              </div>
              <div>
                <h1 className="text-lg font-bold neu-text-primary">Hub</h1>
                {pageTitle && (
                  <p className="text-[10px] neu-text-secondary">{pageTitle}</p>
                )}
              </div>
            </Link>
            <span
              className={`neu-btn px-2.5 py-1 rounded-full text-[10px] font-semibold ${isOnline ? "text-emerald-600" : "text-amber-600"}`}
            >
              {statusLabel}
            </span>
            {headerLeft}
          </div>

          {/* Center section - Action buttons */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center gap-2 max-w-[40%]">
            {headerCenter}
          </div>

          {/* Right section - Custom + Undo/Redo and Logout */}
          <div className="flex items-center gap-2 shrink-0 z-10">
            {headerRight}
            <div className="flex items-center gap-1 mr-2">
              <button
                onClick={undo}
                disabled={!canUndo}
                className="neu-btn p-2 rounded-lg neu-text-secondary transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                title="Undo (⌘Z)"
              >
                <Undo2 size={16} />
              </button>
              <button
                onClick={redo}
                disabled={!canRedo}
                className="neu-btn p-2 rounded-lg neu-text-secondary transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                title="Redo (⌘⇧Z)"
              >
                <Redo2 size={16} />
              </button>
            </div>
            <button
              onClick={signOut}
              className="neu-btn flex items-center gap-2 px-3 py-2 rounded-lg text-rose-600 text-sm font-medium transition-all"
              title="Logout"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </header>
      <div
        className="md:hidden shrink-0"
        style={{ height: mobileHeaderOffset }}
      />

      {/* Content area with sidebar */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {showSidebar && <Sidebar />}
        <main className="flex-1 min-h-0 overflow-hidden neu-bg">
          <div className="h-full flex flex-col">
            <Outlet />
          </div>
        </main>
      </div>

      {/* Spacer for fixed mobile bottom nav */}
      <div
        className="md:hidden shrink-0"
        style={{ height: "calc(4rem + env(safe-area-inset-bottom, 0px))" }}
      />

      {/* Mobile Bottom Navigation */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 neu-bg z-40 safe-area-bottom"
        style={{
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
          boxShadow: "0 -4px 6px rgba(163, 177, 198, 0.3)",
        }}
      >
        <div className="flex items-center justify-around px-2 py-1.5">
          {mobileNavItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.to);
            const badgeCount = getBadgeCount(item.to, unreadBySource);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex flex-col items-center gap-0.5 px-3 py-2 rounded-xl transition-all min-w-[60px] ${
                  active ? "neu-pressed text-sky-600" : "neu-text-secondary"
                }`}
              >
                <div className="relative">
                  <Icon size={22} strokeWidth={active ? 2.5 : 2} />
                  {badgeCount > 0 && (
                    <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 flex items-center justify-center bg-red-500 text-white text-[10px] font-bold rounded-full px-1">
                      {badgeCount > 99 ? "99+" : badgeCount}
                    </span>
                  )}
                </div>
                <span className="text-[10px] font-medium">{item.label}</span>
              </Link>
            );
          })}

          {/* More menu button */}
          <button
            onClick={() => setShowMobileMenu(!showMobileMenu)}
            className={`flex flex-col items-center gap-0.5 px-3 py-2 rounded-xl transition-all min-w-[60px] ${
              showMobileMenu || isMoreActive
                ? "neu-pressed text-sky-600"
                : "neu-text-secondary"
            }`}
          >
            {showMobileMenu ? (
              <X size={22} strokeWidth={2.5} />
            ) : (
              <Menu size={22} />
            )}
            <span className="text-[10px] font-medium">More</span>
          </button>
        </div>
      </nav>

      {/* Mobile More Menu Overlay */}
      {showMobileMenu && (
        <>
          <div
            className="md:hidden fixed inset-0 bg-black/40 backdrop-blur-sm z-[45]"
            onClick={() => setShowMobileMenu(false)}
          />
          <div className="md:hidden fixed bottom-[calc(4rem+env(safe-area-inset-bottom,0px))] left-2 right-2 neu-card rounded-2xl z-50 max-h-[70vh] overflow-auto">
            <div className="p-4 space-y-1">
              <h3 className="text-xs font-semibold neu-text-muted uppercase tracking-wider mb-3 px-2">
                More
              </h3>
              {moreMenuItems.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.to);
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    onClick={() => setShowMobileMenu(false)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                      active
                        ? "neu-pressed text-sky-600"
                        : "neu-text-primary hover:neu-pressed"
                    }`}
                  >
                    <Icon size={22} />
                    <span className="font-medium">{item.label}</span>
                  </Link>
                );
              })}

              <div className="mt-4 pt-4">
                <div className="neu-divider mb-4" />
                <button
                  onClick={() => {
                    setShowMobileMenu(false);
                    signOut();
                  }}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl text-rose-500 w-full transition-all hover:neu-pressed"
                >
                  <LogOut size={22} />
                  <span className="font-medium">Logout</span>
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
