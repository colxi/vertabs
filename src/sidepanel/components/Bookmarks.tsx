import React, { createContext, useContext, useRef, useState } from "react";
import styles from "./Bookmarks.module.css";
import { faviconUrl } from "../utils/favicon";

const TAB_DRAG_TYPE = "application/x-vertabs-tab";
const BM_DRAG_TYPE  = "application/x-vertabs-bookmark";

// ── Drag context ──────────────────────────────────────────────────────────────
// dragId:      id of the node being dragged (ref — always current)
// dropInfoRef: latest drop target (ref — always current, avoids stale closures)
// dropInfo:    same value as ref but as state so React re-renders the placeholder

type DropPosition = "before" | "after" | "inside";
interface DropInfo { targetId: string; position: DropPosition }
interface DragCtx {
  dragId:      React.MutableRefObject<string | null>;
  dropInfoRef: React.MutableRefObject<DropInfo | null>;
  dropInfo:    DropInfo | null;
  setDropInfo: (info: DropInfo | null) => void;
}
const DragContext = createContext<DragCtx | null>(null);
function useDragCtx() { return useContext(DragContext)!; }

// ── Favicon with letter-avatar fallback ──────────────────────────────────────

const AVATAR_COLORS = [
  "#7c3aed","#2563eb","#059669","#d97706","#dc2626",
  "#7c3aed","#0891b2","#65a30d","#9333ea","#c2410c",
];
function letterColor(text: string) {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function Favicon({ url, className }: { url: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  const hostname = (() => { try { return new URL(url).hostname; } catch { return ""; } })();
  const letter   = hostname ? hostname[0].toUpperCase() : "?";
  const bg       = letterColor(letter);
  if (failed || !hostname) {
    return (
      <span className={className} style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        background: bg, color: "#fff", borderRadius: "4px",
        fontSize: "0.77rem", fontWeight: 700, flexShrink: 0,
      }}>{letter}</span>
    );
  }
  return <img className={className} src={faviconUrl(url)} alt="" onError={() => setFailed(true)} />;
}

// ── Highlight ─────────────────────────────────────────────────────────────────

function Highlight({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark className={styles.highlight}>{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  );
}

// ── Search helpers ────────────────────────────────────────────────────────────

function collectMatches(
  nodes: chrome.bookmarks.BookmarkTreeNode[],
  query: string,
): chrome.bookmarks.BookmarkTreeNode[] {
  const results: chrome.bookmarks.BookmarkTreeNode[] = [];
  for (const node of nodes) {
    if (node.url) {
      if (node.title.toLowerCase().includes(query) || node.url.toLowerCase().includes(query))
        results.push(node);
    } else if (node.children) {
      results.push(...collectMatches(node.children, query));
    }
  }
  return results;
}

// ── Hit-test helper ───────────────────────────────────────────────────────────
// Given a dragover event on a target element, return "before" (top half)
// or "after" (bottom half).

function getHalf(e: React.DragEvent): "before" | "after" {
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
  return e.clientY < rect.top + rect.height / 2 ? "before" : "after";
}

// ── Move bookmark via Chrome API ──────────────────────────────────────────────
// Always fetches the target node fresh from Chrome so the index is never stale.

async function moveBookmark(draggedId: string, info: DropInfo) {
  if (info.position === "inside") {
    // Drop onto a folder — move to its end
    const children = await chrome.bookmarks.getChildren(info.targetId);
    chrome.bookmarks.move(draggedId, {
      parentId: info.targetId,
      index: children.length,
    });
    return;
  }

  // "before" or "after" — fetch the target node to get its live parentId + index
  const [target] = await chrome.bookmarks.get(info.targetId);
  if (!target) return;
  const targetIndex = target.index ?? 0;
  const index = info.position === "before" ? targetIndex : targetIndex + 1;
  chrome.bookmarks.move(draggedId, { parentId: target.parentId, index });
}

// ── Main Bookmarks component ──────────────────────────────────────────────────

interface Props {
  tree: chrome.bookmarks.BookmarkTreeNode[];
  isOpen: (id: string) => boolean;
  onToggle: (id: string) => void;
  openLinksInNewTab: boolean;
  showBookmarksBar: boolean;
  showOtherBookmarks: boolean;
  collapsed: boolean;
  onCollapsedChange: (v: boolean) => void;
  query: string;
  onQueryChange: (v: string) => void;
  sourcesCollapsed: Record<string, boolean>;
  onSourceCollapsedChange: (id: string, v: boolean) => void;
}

const BAR_ID   = "1";
const OTHER_ID = "2";

export function Bookmarks({
  tree, isOpen, onToggle, openLinksInNewTab,
  showBookmarksBar, showOtherBookmarks,
  collapsed, onCollapsedChange,
  query, onQueryChange,
  sourcesCollapsed, onSourceCollapsedChange,
}: Props) {
  const q = query.trim().toLowerCase();
  const dragId      = useRef<string | null>(null);
  const dropInfoRef = useRef<DropInfo | null>(null);
  const [dropInfo, setDropInfoState] = useState<DropInfo | null>(null);

  function setDropInfo(info: DropInfo | null) {
    dropInfoRef.current = info;
    setDropInfoState(info);
  }

  const allRoots = tree[0]?.children ?? [];
  const roots = allRoots.filter((n) => {
    if (n.id === BAR_ID)   return showBookmarksBar;
    if (n.id === OTHER_ID) return showOtherBookmarks;
    return false;
  });
  const showGroupTitles = showBookmarksBar && showOtherBookmarks;
  const flatResults = q ? collectMatches(roots, q) : null;

  function openLink(url: string) {
    chrome.tabs.query({ currentWindow: true }, (tabs) => {
      const existing = tabs.find((t) => t.url === url);
      if (existing?.id != null) { chrome.tabs.update(existing.id, { active: true }); return; }
      if (openLinksInNewTab) { chrome.tabs.create({ url }); }
      else { const a = tabs.find((t) => t.active); if (a?.id != null) chrome.tabs.update(a.id, { url }); }
    });
  }

  function handleDropTabOnFolder(folderId: string, e: React.DragEvent) {
    e.preventDefault();
    const raw = e.dataTransfer.getData(TAB_DRAG_TYPE);
    if (!raw) return;
    try {
      const data = JSON.parse(raw) as { url: string; title: string };
      if (data.url) chrome.bookmarks.create({ parentId: folderId, title: data.title || data.url, url: data.url });
    } catch { /* ignore */ }
  }

  return (
    <DragContext.Provider value={{ dragId, dropInfoRef, dropInfo, setDropInfo }}>
      <section className={styles.section}>
        <div
          className={`${styles.header} ${collapsed ? styles.collapsed : ""}`}
          onClick={() => onCollapsedChange(!collapsed)}
        >
          <span className={styles.title}>Bookmarks</span>
          <span className={styles.chevron}>▾</span>
        </div>

        {!collapsed && (
          <div className={styles.content}>
            <div className={styles.searchBar}>
              <input
                value={query}
                onChange={(e) => onQueryChange(e.target.value)}
                placeholder="Search bookmarks…"
                onClick={(e) => e.stopPropagation()}
              />
            </div>

            <div className={styles.tree}>
              {flatResults ? (
                flatResults.length === 0
                  ? <p className={styles.empty}>No bookmarks match "{query}"</p>
                  : flatResults.map((node) => (
                    <div key={node.id} role="button" className={styles.bookmarkItem}
                      onClick={() => openLink(node.url!)}>
                      <Favicon url={node.url!} className={styles.favicon} />
                      <span className={styles.bookmarkTitle}>
                        <Highlight text={node.title || node.url!} query={query} />
                      </span>
                    </div>
                  ))
              ) : (
                roots.map((root) => (
                  <BookmarkSource
                    key={root.id}
                    root={root}
                    showTitle={showGroupTitles}
                    collapsed={!!sourcesCollapsed[root.id]}
                    onCollapsedChange={(v) => onSourceCollapsedChange(root.id, v)}
                    isOpen={isOpen}
                    onToggle={onToggle}
                    openLinksInNewTab={openLinksInNewTab}
                    onDropTabOnFolder={handleDropTabOnFolder}
                  />
                ))
              )}
            </div>
          </div>
        )}
      </section>
    </DragContext.Provider>
  );
}

// ── SiblingList — renders a flat list of nodes, injecting a placeholder ───────

function SiblingList({
  nodes, depth, isOpen, onToggle, openLinksInNewTab, onDropTabOnFolder,
}: {
  nodes: chrome.bookmarks.BookmarkTreeNode[];
  depth: number;
  isOpen: (id: string) => boolean;
  onToggle: (id: string) => void;
  openLinksInNewTab: boolean;
  onDropTabOnFolder: (folderId: string, e: React.DragEvent) => void;
}) {
  const { dropInfo } = useDragCtx();
  const items: React.ReactNode[] = [];

  nodes.forEach((node) => {
    // Placeholder BEFORE this node
    if (dropInfo?.targetId === node.id && dropInfo.position === "before") {
      items.push(<div key={`ph-before-${node.id}`} className={styles.bmPlaceholder} />);
    }
    items.push(
      <BookmarkNode
        key={node.id}
        node={node}
        depth={depth}
        isOpen={isOpen}
        onToggle={onToggle}
        openLinksInNewTab={openLinksInNewTab}
        onDropTabOnFolder={onDropTabOnFolder}
      />
    );
    // Placeholder AFTER this node (only for last item, to allow appending)
    if (dropInfo?.targetId === node.id && dropInfo.position === "after") {
      items.push(<div key={`ph-after-${node.id}`} className={styles.bmPlaceholder} />);
    }
  });

  return <>{items}</>;
}

// ── Source group ──────────────────────────────────────────────────────────────

function BookmarkSource({
  root, showTitle, collapsed, onCollapsedChange,
  isOpen, onToggle, openLinksInNewTab, onDropTabOnFolder,
}: {
  root: chrome.bookmarks.BookmarkTreeNode;
  showTitle: boolean;
  collapsed: boolean;
  onCollapsedChange: (v: boolean) => void;
  isOpen: (id: string) => boolean;
  onToggle: (id: string) => void;
  openLinksInNewTab: boolean;
  onDropTabOnFolder: (folderId: string, e: React.DragEvent) => void;
}) {
  return (
    <div>
      {showTitle && (
        <div
          className={`${styles.sourceTitle} ${collapsed ? styles.sourceTitleCollapsed : ""}`}
          onClick={() => onCollapsedChange(!collapsed)}
        >
          <span>{root.title}</span>
          <span className={styles.sourceChevron}>▾</span>
        </div>
      )}
      {!collapsed && (
        <SiblingList
          nodes={root.children ?? []}
          depth={0}
          isOpen={isOpen}
          onToggle={onToggle}
          openLinksInNewTab={openLinksInNewTab}
          onDropTabOnFolder={onDropTabOnFolder}
        />
      )}
    </div>
  );
}

// ── BookmarkNode ──────────────────────────────────────────────────────────────

function BookmarkNode({
  node, depth,
  isOpen, onToggle, openLinksInNewTab, onDropTabOnFolder,
}: {
  node: chrome.bookmarks.BookmarkTreeNode;
  depth: number;
  isOpen: (id: string) => boolean;
  onToggle: (id: string) => void;
  openLinksInNewTab: boolean;
  onDropTabOnFolder: (folderId: string, e: React.DragEvent) => void;
}) {
  const { dragId, dropInfoRef, dropInfo, setDropInfo } = useDragCtx();
  const isFolder = node.children != null;
  const open = isFolder && isOpen(node.id);

  const isDropInside = dropInfo?.targetId === node.id && dropInfo.position === "inside";

  // ── Shared drag handlers ──────────────────────────────────────────────────

  function handleDragStart(e: React.DragEvent) {
    dragId.current = node.id;
    e.dataTransfer.setData(BM_DRAG_TYPE, node.id);
    e.dataTransfer.effectAllowed = "move";
    e.stopPropagation();
  }

  function handleDragEnd() {
    dragId.current = null;
    setDropInfo(null);
  }

  function handleDragOver(e: React.DragEvent) {
    const hasBm  = e.dataTransfer.types.includes(BM_DRAG_TYPE);
    const hasTab = e.dataTransfer.types.includes(TAB_DRAG_TYPE);
    if (!hasBm && !hasTab) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";

    if (hasBm) {
      if (isFolder) {
        // Top 25% → before, bottom 25% → after, middle 50% → inside
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const rel = (e.clientY - rect.top) / rect.height;
        if (rel < 0.25)      setDropInfo({ targetId: node.id, position: "before" });
        else if (rel > 0.75) setDropInfo({ targetId: node.id, position: "after" });
        else                 setDropInfo({ targetId: node.id, position: "inside" });
      } else {
        // Leaf: top half = before, bottom half = after
        setDropInfo({ targetId: node.id, position: getHalf(e) });
      }
    } else {
      // Tab drag over folder → inside only
      if (isFolder) setDropInfo({ targetId: node.id, position: "inside" });
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    // Read from ref — always the latest value, never stale from closure
    const info = dropInfoRef.current;
    setDropInfo(null);

    // Tab dropped → bookmark creation (folder "inside" only)
    if (e.dataTransfer.types.includes(TAB_DRAG_TYPE) && isFolder && info?.position === "inside") {
      onDropTabOnFolder(node.id, e);
      return;
    }

    const id = dragId.current;
    dragId.current = null;
    if (!id || !info) return;
    // Don't move onto self
    if (id === info.targetId) return;

    moveBookmark(id, info);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const children = isFolder ? (node.children ?? []) : [];

  const headerClasses = [
    isFolder ? styles.folderHeader : styles.bookmarkItem,
    open && isFolder ? styles.open : "",
    isDropInside  ? styles.folderDropTarget : "",
    dragId.current === node.id ? (isFolder ? "" : styles.bookmarkDragging) : "",
  ].filter(Boolean).join(" ");

  const element = isFolder ? (
    <div
      className={headerClasses}
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onClick={() => onToggle(node.id)}
    >
      <span className={styles.folderIcon}>{open ? "📂" : "📁"}</span>
      <span className={styles.folderName}>{node.title || "Bookmarks"}</span>
      <span className={styles.folderChevron}>▶</span>
    </div>
  ) : node.url ? (
    <div
      role="button"
      className={headerClasses}
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onClick={() => {
        const url = node.url!;
        chrome.tabs.query({ currentWindow: true }, (tabs) => {
          const existing = tabs.find((t) => t.url === url);
          if (existing?.id != null) { chrome.tabs.update(existing.id, { active: true }); return; }
          if (openLinksInNewTab) { chrome.tabs.create({ url }); }
          else { const a = tabs.find((t) => t.active); if (a?.id != null) chrome.tabs.update(a.id, { url }); }
        });
      }}
    >
      <Favicon url={node.url} className={styles.favicon} />
      <span className={styles.bookmarkTitle}>{node.title || node.url}</span>
    </div>
  ) : null;

  if (!element) return null;

  return (
    <div className={styles.nodeWrap}>
      {element}
      {open && (
        <div className={styles.children}>
          <SiblingList
            nodes={children}
            depth={depth + 1}
            isOpen={isOpen}
            onToggle={onToggle}
            openLinksInNewTab={openLinksInNewTab}
            onDropTabOnFolder={onDropTabOnFolder}
          />
        </div>
      )}
    </div>
  );
}

function nodeMatches(node: chrome.bookmarks.BookmarkTreeNode, query: string): boolean {
  if (!query) return true;
  if (node.url) return node.title.toLowerCase().includes(query) || node.url.toLowerCase().includes(query);
  return (node.children ?? []).some((c) => nodeMatches(c, query));
}
