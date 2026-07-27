import React, { useRef, useState } from "react";
import styles from "./Tabs.module.css";
import { faviconUrl } from "../utils/favicon";

interface Props {
  tabs: chrome.tabs.Tab[];
  onFocus: (tabId: number) => void;
  onClose: (tabId: number) => void;
  onMove: (tabId: number, toIndex: number) => void;
  collapsed: boolean;
  onCollapsedChange: (v: boolean) => void;
  query: string;
  onQueryChange: (v: string) => void;
}

function domain(url: string | undefined): string {
  if (!url) return "";
  try { return new URL(url).hostname.replace(/^www\./, ""); }
  catch { return ""; }
}

export function Tabs({ tabs, onFocus, onClose, onMove, collapsed, onCollapsedChange, query, onQueryChange }: Props) {
  const q = query.trim().toLowerCase();

  // dragOverIndex: the slot index where the drop indicator is shown.
  // -1 = none. Index refers to position in visibleTabs.
  const [dragOverIndex, setDragOverIndex] = useState<number>(-1);
  const dragTabId = useRef<number | null>(null);

  const visibleTabs = tabs.filter((t) => {
    if (t.pinned) return false;
    if (!q) return true;
    return (
      (t.title ?? "").toLowerCase().includes(q) ||
      (t.url ?? "").toLowerCase().includes(q)
    );
  });

  function handleDragStart(tabId: number) {
    dragTabId.current = tabId;
  }

  function handleDragOver(e: React.DragEvent, index: number) {
    e.preventDefault();
    setDragOverIndex(index);
  }

  function handleDrop(e: React.DragEvent, toVisibleIndex: number) {
    e.preventDefault();
    setDragOverIndex(-1);
    const fromId = dragTabId.current;
    if (fromId == null) return;
    const target = visibleTabs[toVisibleIndex];
    if (!target || target.id === fromId) return;
    // Map back to the real tab index in the window.
    onMove(fromId, target.index);
  }

  function handleDragEnd() {
    dragTabId.current = null;
    setDragOverIndex(-1);
  }

  return (
    <section className={styles.section}>
      <div
        className={`${styles.header} ${collapsed ? styles.collapsed : ""}`}
        onClick={() => onCollapsedChange(!collapsed)}
      >
        <span className={styles.title}>Open Tabs</span>
        <span className={styles.badge}>{tabs.filter((t) => !t.pinned).length}</span>
        <span className={styles.chevron}>▾</span>
      </div>

      {!collapsed && (
        <div className={styles.content}>
          <div className={styles.searchBar}>
            <input
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              placeholder="Search tabs…"
              onClick={(e) => e.stopPropagation()}
            />
          </div>

          {visibleTabs.map((tab, i) => (
            <React.Fragment key={tab.id}>
              {dragOverIndex === i && <div className={styles.dropIndicator} />}
              <TabItem
                tab={tab}
                onFocus={onFocus}
                onClose={onClose}
                onDragStart={() => handleDragStart(tab.id!)}
                onDragOver={(e) => handleDragOver(e, i)}
                onDrop={(e) => handleDrop(e, i)}
                onDragEnd={handleDragEnd}
              />
            </React.Fragment>
          ))}
          {/* Drop indicator at the very end */}
          {dragOverIndex === visibleTabs.length && <div className={styles.dropIndicator} />}
          {/* Drop zone for the tail slot */}
          {visibleTabs.length > 0 && (
            <div
              className={styles.dropTail}
              onDragOver={(e) => { e.preventDefault(); setDragOverIndex(visibleTabs.length); }}
              onDrop={(e) => {
                e.preventDefault();
                setDragOverIndex(-1);
                const fromId = dragTabId.current;
                if (fromId == null) return;
                const last = visibleTabs[visibleTabs.length - 1];
                if (last && last.id !== fromId) onMove(fromId, last.index + 1);
              }}
              onDragLeave={() => setDragOverIndex(-1)}
            />
          )}
        </div>
      )}
    </section>
  );
}

function TabItem({
  tab,
  onFocus,
  onClose,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: {
  tab: chrome.tabs.Tab;
  onFocus: (tabId: number) => void;
  onClose: (tabId: number) => void;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onDragEnd: () => void;
}) {
  const [imgFailed, setImgFailed] = React.useState(false);
  const favicon = tab.favIconUrl || faviconUrl(tab.url ?? "");
  const showImg = favicon && !imgFailed;

  return (
    <div
      className={`${styles.tabItem} ${tab.active ? styles.active : ""}`}
      draggable
      onClick={() => tab.id != null && onFocus(tab.id)}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      title={tab.url}
    >
      <div className={styles.dragHandle} title="Drag to reorder">⠿</div>
      {showImg ? (
        <img
          className={styles.favicon}
          src={favicon}
          alt=""
          onError={() => setImgFailed(true)}
        />
      ) : (
        <div className={styles.faviconPlaceholder} />
      )}
      <div className={styles.tabInfo}>
        <span className={styles.tabTitle}>
          {tab.title || tab.url || "New Tab"}
        </span>
        <span className={styles.tabDomain}>
          {domain(tab.url)}
        </span>
      </div>
      <button
        className={styles.closeBtn}
        title="Close tab"
        onClick={(e) => {
          e.stopPropagation();
          if (tab.id != null) onClose(tab.id);
        }}
      >
        ✕
      </button>
    </div>
  );
}
