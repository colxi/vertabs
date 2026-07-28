import React, { useRef, useState } from "react";
import styles from "./Tabs.module.css";
import { faviconUrl } from "../utils/favicon";

const TAB_DRAG_TYPE = "application/x-vertabs-tab";

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

  // dropSlot: index in visibleTabs where the placeholder appears.
  // Inserting before item[i] = slot i. Inserting after last = slot visibleTabs.length.
  const [dropSlot, setDropSlotState] = useState<number | null>(null);
  const dropSlotRef = useRef<number | null>(null);
  function setDropSlot(v: number | null) { dropSlotRef.current = v; setDropSlotState(v); }
  const dragTabId = useRef<number | null>(null);
  const dragIndex = useRef<number | null>(null); // index in visibleTabs

  const visibleTabs = tabs.filter((t) => {
    if (t.pinned) return false;
    if (!q) return true;
    return (
      (t.title ?? "").toLowerCase().includes(q) ||
      (t.url ?? "").toLowerCase().includes(q)
    );
  });

  function handleDragStart(e: React.DragEvent, tab: chrome.tabs.Tab, i: number) {
    dragTabId.current = tab.id!;
    dragIndex.current = i;
    e.dataTransfer.setData(TAB_DRAG_TYPE, JSON.stringify({
      url: tab.url ?? "",
      title: tab.title ?? "",
      favIconUrl: tab.favIconUrl ?? "",
    }));
    e.dataTransfer.effectAllowed = "move";
  }

  function handleDragOver(e: React.DragEvent, i: number) {
    if (!e.dataTransfer.types.includes(TAB_DRAG_TYPE)) return;
    e.preventDefault();
    // Top half → slot before this item; bottom half → slot after
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const slot = e.clientY < rect.top + rect.height / 2 ? i : i + 1;
    setDropSlot(slot);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const slot = dropSlotRef.current;
    setDropSlot(null);
    const fromId = dragTabId.current;
    const fromIdx = dragIndex.current;
    dragTabId.current = null;
    dragIndex.current = null;
    if (fromId == null || slot == null || fromIdx == null) return;
    // Don't move if slot is adjacent to the item (would be a no-op)
    if (slot === fromIdx || slot === fromIdx + 1) return;
    const targetIdx = slot > fromIdx ? slot - 1 : slot;
    const target = visibleTabs[targetIdx];
    if (!target) return;
    onMove(fromId, target.index);
  }

  function handleDragEnd() {
    dragTabId.current = null;
    dragIndex.current = null;
    setDropSlot(null);
  }

  // Build the rendered list interleaving placeholder at dropSlot
  const items: React.ReactNode[] = [];
  visibleTabs.forEach((tab, i) => {
    if (dropSlot === i) {
      items.push(<div key="placeholder" className={styles.placeholder} />);
    }
    items.push(
      <TabItem
        key={tab.id}
        tab={tab}
        isDragging={dragTabId.current === tab.id}
        onFocus={onFocus}
        onClose={onClose}
        onDragStart={(e) => handleDragStart(e, tab, i)}
        onDragOver={(e) => handleDragOver(e, i)}
        onDrop={handleDrop}
        onDragEnd={handleDragEnd}
      />
    );
  });
  if (dropSlot === visibleTabs.length) {
    items.push(<div key="placeholder" className={styles.placeholder} />);
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

          <div
            onDragOver={(e) => {
              // Handle drag-over on the container for the "after last" slot
              if (!e.dataTransfer.types.includes(TAB_DRAG_TYPE)) return;
              e.preventDefault();
            }}
            onDrop={handleDrop}
          >
            {items}
          </div>
        </div>
      )}
    </section>
  );
}

function TabItem({
  tab,
  isDragging,
  onFocus,
  onClose,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: {
  tab: chrome.tabs.Tab;
  isDragging: boolean;
  onFocus: (tabId: number) => void;
  onClose: (tabId: number) => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onDragEnd: () => void;
}) {
  const [imgFailed, setImgFailed] = React.useState(false);
  const favicon = tab.favIconUrl || faviconUrl(tab.url ?? "");
  const showImg = favicon && !imgFailed;

  return (
    <div
      className={[
        styles.tabItem,
        tab.active ? styles.active : "",
        isDragging ? styles.dragging : "",
      ].filter(Boolean).join(" ")}
      draggable
      onClick={() => tab.id != null && onFocus(tab.id)}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      title={tab.url}
    >
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
