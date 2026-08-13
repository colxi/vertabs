import React, { useRef, useState } from "react";
import Fuse from "fuse.js";
import styles from "./Tabs.module.css";
import { faviconUrl } from "../utils/favicon";

const TAB_DRAG_TYPE = "application/x-vertabs-tab";
const NO_GROUP = -1;

// Chrome tab group colors → CSS colours
const GROUP_COLORS: Record<string, string> = {
  grey:   "#5f6368",
  blue:   "#1a73e8",
  red:    "#d93025",
  yellow: "#f9ab00",
  green:  "#1e8e3e",
  pink:   "#d01884",
  purple: "#a142f4",
  cyan:   "#007b83",
  orange: "#fa903e",
};

interface Props {
  tabs:    chrome.tabs.Tab[];
  groups:  chrome.tabGroups.TabGroup[];
  onFocus: (tabId: number) => void;
  onClose: (tabId: number) => void;
  onMove:  (tabId: number, toIndex: number) => void;
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

export function Tabs({ tabs, groups, onFocus, onClose, onMove, collapsed, onCollapsedChange, query, onQueryChange }: Props) {
  const q = query.trim().toLowerCase();

  const [dropSlot, setDropSlotState] = useState<number | null>(null);
  const dropSlotRef = useRef<number | null>(null);
  function setDropSlot(v: number | null) { dropSlotRef.current = v; setDropSlotState(v); }
  const dragTabId = useRef<number | null>(null);
  const dragIndex = useRef<number | null>(null);

  // Build a groupId → TabGroup map for quick lookup
  const groupMap = new Map<number, chrome.tabGroups.TabGroup>(
    groups.map((g) => [g.id, g])
  );

  const unpinnedTabs = tabs.filter((t) => !t.pinned);

  const visibleTabs = (() => {
    if (!q) return unpinnedTabs;
    const fuse = new Fuse(unpinnedTabs, {
      keys: [
        { name: "title", weight: 0.6 },
        { name: "url",   weight: 0.4 },
      ],
      threshold: 0.4,
      distance: 200,
      includeScore: true,
    });
    return fuse.search(q).map((r) => r.item);
  })();

  function handleDragStart(e: React.DragEvent, tab: chrome.tabs.Tab, i: number) {
    dragTabId.current = tab.id!;
    dragIndex.current = i;
    e.dataTransfer.setData(TAB_DRAG_TYPE, JSON.stringify({
      url: tab.url ?? "",
      title: tab.title ?? "",
      favIconUrl: tab.favIconUrl ?? "",
    }));
    e.dataTransfer.effectAllowed = "all";
  }

  function handleDragOver(e: React.DragEvent, i: number) {
    if (!e.dataTransfer.types.includes(TAB_DRAG_TYPE)) return;
    e.preventDefault();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const slot = e.clientY < rect.top + rect.height / 2 ? i : i + 1;
    setDropSlot(slot);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const slot = dropSlotRef.current;
    setDropSlot(null);
    const fromId  = dragTabId.current;
    const fromIdx = dragIndex.current;
    dragTabId.current = null;
    dragIndex.current = null;
    if (fromId == null || slot == null || fromIdx == null) return;
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

  // Build rendered items — tabs in the same group share a colored left-border container
  const items: React.ReactNode[] = [];

  // Bucket consecutive tabs by groupId
  type Bucket = { gid: number; group?: chrome.tabGroups.TabGroup; tabs: { tab: chrome.tabs.Tab; i: number }[] };
  const buckets: Bucket[] = [];
  visibleTabs.forEach((tab, i) => {
    const gid   = tab.groupId ?? NO_GROUP;
    const group = gid !== NO_GROUP ? groupMap.get(gid) : undefined;
    const last  = buckets[buckets.length - 1];
    if (last && last.gid === gid) {
      last.tabs.push({ tab, i });
    } else {
      buckets.push({ gid, group, tabs: [{ tab, i }] });
    }
  });

  buckets.forEach((bucket) => {
    const color = bucket.group ? (GROUP_COLORS[bucket.group.color] ?? "#888") : undefined;

    const tabEls: React.ReactNode[] = bucket.tabs.map(({ tab, i }) => {
      const el = (
        <React.Fragment key={tab.id}>
          {dropSlot === i && <div className={styles.placeholder} />}
          <TabItem
            tab={tab}
            isDragging={dragTabId.current === tab.id}
            onFocus={onFocus}
            onClose={onClose}
            onDragStart={(e) => handleDragStart(e, tab, i)}
            onDragOver={(e) => handleDragOver(e, i)}
            onDrop={handleDrop}
            onDragEnd={handleDragEnd}
          />
        </React.Fragment>
      );
      return el;
    });

    if (color) {
      // Grouped: wrap in a container with the colored left border
      items.push(
        <div
          key={`group-${bucket.gid}`}
          className={styles.groupBlock}
          style={{ "--group-color": color } as React.CSSProperties}
        >
          <div className={styles.groupHeader}>
            <span className={styles.groupDot} style={{ background: color }} />
            <span className={styles.groupTitle}>{bucket.group!.title || "Group"}</span>
          </div>
          {tabEls}
        </div>
      );
    } else {
      // Ungrouped: render tabs directly
      items.push(...tabEls);
    }
  });

  if (dropSlot === visibleTabs.length) {
    items.push(<div key="placeholder-end" className={styles.placeholder} />);
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
            <div className={styles.searchBarWrap}>
              <span className={styles.searchIcon}>🔍</span>
              <input
                value={query}
                onChange={(e) => onQueryChange(e.target.value)}
                placeholder="Search tabs…"
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          </div>

          <div
            onDragOver={(e) => {
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
        tab.active ? styles.active   : "",
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
        <img className={styles.favicon} src={favicon} alt="" onError={() => setImgFailed(true)} />
      ) : (
        <div className={styles.faviconPlaceholder} />
      )}
      <div className={styles.tabInfo}>
        <span className={styles.tabTitle}>{tab.title || tab.url || "New Tab"}</span>
        <span className={styles.tabDomain}>{domain(tab.url)}</span>
      </div>
      <button
        className={styles.closeBtn}
        title="Close tab"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); if (tab.id != null) onClose(tab.id); }}
      >
        ✕
      </button>
    </div>
  );
}
