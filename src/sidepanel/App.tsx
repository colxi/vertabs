import React, { useEffect, useRef, useState } from "react";
import { Shortcuts } from "./components/Shortcuts";
import { Bookmarks } from "./components/Bookmarks";
import { Tabs } from "./components/Tabs";
import { Config } from "./components/Config";
import { useShortcuts } from "./hooks/useShortcuts";
import { useBookmarks } from "./hooks/useBookmarks";
import { useBookmarkFolders } from "./hooks/useBookmarkFolders";
import { useTabs } from "./hooks/useTabs";
import { useConfig } from "./hooks/useConfig";
import { useUIState } from "./hooks/useUIState";
import { CompactShortcuts } from "./components/CompactShortcuts";
import styles from "./App.module.css";

type SidebarState = "expanded" | "compact";

export function App() {
  const { shortcuts, add, edit, remove, reorder } = useShortcuts();
  const { tree } = useBookmarks();
  const roots = tree[0]?.children ?? [];
  const { isOpen, toggle, sync: syncFolders } = useBookmarkFolders(roots);
  const { tabs, focusTab, closeTab, moveTab } = useTabs();
  const { config, update: updateConfig, loaded: configLoaded } = useConfig();
  const { ui, update: updateUI, restore: restoreUI, flushSave } = useUIState();

  const [state,      setState]      = useState<SidebarState>("expanded");
  const [pinned,     setPinned]     = useState(true);
  const [showConfig, setShowConfig] = useState(false);

  const mainPageRef = useRef<HTMLDivElement>(null);
  const scrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Guard: don't send sidebar-state / sidebar-pin until the content script has
  // sent us sidebar-init. Before that, our local state is just defaults and
  // posting it would cause the content script to reveal the sidebar even when
  // the user had it hidden.
  const initDone = useRef(false);

  // ── Apply CSS variables whenever config changes ──────────────────────────
  useEffect(() => {
    if (!configLoaded) return;
    const root = document.documentElement;
    root.style.setProperty("--font-size-base", `${config.fontSize}px`);
    root.style.setProperty("--accent",       config.accentColor);
    root.style.setProperty("--accent-hover", config.accentColor + "dd");
  }, [config.fontSize, config.accentColor, configLoaded]);

  // ── Notify content script of state / pin changes ─────────────────────────
  useEffect(() => {
    if (!initDone.current) return;
    window.parent.postMessage({ type: "sidebar-state", state }, "*");
  }, [state]);

  useEffect(() => {
    if (!initDone.current) return;
    window.parent.postMessage({ type: "sidebar-pin", pinned }, "*");
  }, [pinned]);

  // ── Receive messages from content script ─────────────────────────────────
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.data?.type === "sidebar-init") {
        initDone.current = true;
        const initState = e.data.state as SidebarState;
        if (configLoaded && config.startupState !== "remember") {
          setState(config.startupState as SidebarState);
        } else {
          setState(initState);
        }
        setPinned(e.data.pinned as boolean);
        if (e.data.ui) {
          restoreUI(e.data.ui);
          const scroll = e.data.ui.scroll as number | undefined;
          if (typeof scroll === "number") {
            requestAnimationFrame(() => { if (mainPageRef.current) mainPageRef.current.scrollTop = scroll; });
          }
        }
      }

      if (e.data?.type === "sidebar-sync") {
        setState(e.data.state as SidebarState);
        setPinned(e.data.pinned as boolean);
        syncFolders();
        if (e.data.ui) {
          restoreUI(e.data.ui);
          const scroll = e.data.ui.scroll as number | undefined;
          if (typeof scroll === "number") {
            requestAnimationFrame(() => { if (mainPageRef.current) mainPageRef.current.scrollTop = scroll; });
          }
        }
      }

      if (e.data?.type === "mode-changed") {
        // Content script detected a mode change — nothing to do in React.
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [syncFolders, configLoaded, config.startupState, restoreUI]);

  // ── Persist scroll position into useUIState ───────────────────────────────
  useEffect(() => {
    const el = mainPageRef.current;
    if (!el) return;

    const onScroll = () => {
      if (scrollTimer.current) return;
      scrollTimer.current = setTimeout(() => {
        updateUI({ scroll: el.scrollTop });
        scrollTimer.current = null;
      }, 500);
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        if (scrollTimer.current) { clearTimeout(scrollTimer.current); scrollTimer.current = null; }
        updateUI({ scroll: el.scrollTop });
        flushSave();
      }
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      el.removeEventListener("scroll", onScroll);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [updateUI, flushSave]);

  // ── Persist scroll position (throttled on scroll, immediate on hide) ────────
  useEffect(() => {
    const el = mainPageRef.current;
    if (!el) return;

    function saveScroll() {
      chrome.storage.local.set({ [SCROLL_KEY]: el!.scrollTop });
    }

    // Throttled save while scrolling.
    const onScroll = () => {
      if (scrollTimer.current) return;
      scrollTimer.current = setTimeout(() => {
        saveScroll();
        scrollTimer.current = null;
      }, SCROLL_SAVE_INTERVAL);
    };

    // Immediate save when the document is hidden (tab switch / new tab click).
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        if (scrollTimer.current) { clearTimeout(scrollTimer.current); scrollTimer.current = null; }
        saveScroll();
      }
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      el.removeEventListener("scroll", onScroll);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  const isCompact  = state === "compact";
  const isFloating = config.mode === "floating";

  return (
    <div className={styles.root}>
      {/* ── Main sidebar ─────────────────────────────────────────── */}
      <div ref={mainPageRef} className={`${styles.page} ${showConfig ? styles.pageSlideOut : ""}`}>
        <div className={`${styles.app} ${isCompact ? styles.compact : ""}`}>
          <div className={styles.toolbar}>
            {/* Fold / unfold — floating mode only */}
            {isFloating && (
              <button
                className={styles.toolBtn}
                onClick={() => setState((s) => (s === "expanded" ? "compact" : "expanded"))}
                title={isCompact ? "Expand sidebar" : "Collapse sidebar"}
              >
                {isCompact ? "»" : "«"}
              </button>
            )}

            {/* Pin — floating mode only */}
            {isFloating && (
              <button
                className={`${styles.toolBtn} ${pinned ? styles.pinned : styles.unpinned}`}
                onClick={() => setPinned((p) => !p)}
                title={pinned ? "Unpin (auto-hide when not hovered)" : "Pin sidebar"}
              >
                📌
              </button>
            )}

            {/* Settings gear */}
            <button
              className={styles.toolBtn}
              onClick={() => setShowConfig(true)}
              title="Settings"
            >
              ⚙
            </button>
          </div>

          {isCompact ? (
            <CompactShortcuts shortcuts={shortcuts} />
          ) : (
            <>
              {config.showShortcuts && (
                <Shortcuts
                  shortcuts={shortcuts}
                  onAdd={add}
                  onRemove={remove}
                  onReorder={reorder}
                />
              )}
              {config.showBookmarks && (
                <Bookmarks
                  tree={tree}
                  isOpen={isOpen}
                  onToggle={toggle}
                  openLinksInNewTab={config.openLinksInNewTab}
                  showBookmarksBar={config.showBookmarksBar}
                  showOtherBookmarks={config.showOtherBookmarks}
                  collapsed={ui.bookmarksCollapsed}
                  onCollapsedChange={(v) => updateUI({ bookmarksCollapsed: v })}
                  query={ui.bookmarksQuery}
                  onQueryChange={(v) => updateUI({ bookmarksQuery: v })}
                  sourcesCollapsed={ui.bookmarkSourcesCollapsed}
                  onSourceCollapsedChange={(id, v) =>
                    updateUI({ bookmarkSourcesCollapsed: { ...ui.bookmarkSourcesCollapsed, [id]: v } })
                  }
                />
              )}
              {config.showTabs && (
                <Tabs
                  tabs={tabs}
                  onFocus={focusTab}
                  onClose={closeTab}
                  onMove={moveTab}
                  collapsed={ui.tabsCollapsed}
                  onCollapsedChange={(v) => updateUI({ tabsCollapsed: v })}
                  query={ui.tabsQuery}
                  onQueryChange={(v) => updateUI({ tabsQuery: v })}
                />
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Config overlay ───────────────────────────────────────── */}
      <div className={`${styles.page} ${styles.configPage} ${showConfig ? "" : styles.pageSlideRight}`}>
        <Config
          config={config}
          onUpdate={updateConfig}
          onClose={() => setShowConfig(false)}
          shortcuts={shortcuts}
          onAddShortcut={add}
          onEditShortcut={edit}
          onRemoveShortcut={remove}
          onReorderShortcut={reorder}
        />
      </div>
    </div>
  );
}
