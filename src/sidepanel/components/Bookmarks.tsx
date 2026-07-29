import React, { createContext, useContext, useRef, useState, useEffect } from "react";
import styles from "./Bookmarks.module.css";
import { faviconUrl } from "../utils/favicon";

const TAB_DRAG_TYPE = "application/x-vertabs-tab";
const BM_DRAG_TYPE  = "application/x-vertabs-bookmark";

// ── Drag context ──────────────────────────────────────────────────────────────

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

// ── Move bookmark via Chrome API ──────────────────────────────────────────────
// Chrome's bookmarks.move removes the item first, then inserts at the given
// index. When moving forward within the same parent, subtract 1 to compensate.

/** Pure index calculation — exported for testing. */
export function calcMoveIndex(
  _draggedIndex: number,
  _draggedParentId: string,
  targetIndex: number,
  _targetParentId: string,
  position: "before" | "after",
): number {
  // Chrome's bookmarks.move takes the final destination index directly.
  // It handles removal internally — no adjustment needed.
  return position === "before" ? targetIndex : targetIndex + 1;
}

async function moveBookmark(draggedId: string, info: DropInfo) {
  if (info.position === "inside") {
    const children = await chrome.bookmarks.getChildren(info.targetId);
    chrome.bookmarks.move(draggedId, { parentId: info.targetId, index: children.length });
    return;
  }

  const [target] = await chrome.bookmarks.get(info.targetId);
  if (!target) return;

  const index = calcMoveIndex(0, "", target.index ?? 0, "", info.position as "before" | "after");
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
      if (openLinksInNewTab) { chrome.tabs.create({ url, index: 0 }); }
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
              <div className={styles.searchBarWrap}>
                <span className={styles.searchIcon}>🔍</span>
                <input
                  value={query}
                  onChange={(e) => onQueryChange(e.target.value)}
                  placeholder="Search bookmarks…"
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            </div>

            <div
              className={styles.tree}
              onDragOver={(e) => { if (e.dataTransfer.types.includes(BM_DRAG_TYPE)) e.preventDefault(); }}
              onDrop={(e) => {
                if (!e.dataTransfer.types.includes(BM_DRAG_TYPE)) return;
                e.preventDefault();
                const info = dropInfoRef.current;
                setDropInfo(null);
                const id = dragId.current;
                dragId.current = null;
                if (!id || !info || id === info.targetId) return;
                moveBookmark(id, info);
              }}
            >
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
                    // When only one source is shown there's no title to un-collapse it,
                    // so force it open regardless of stored state.
                    collapsed={showGroupTitles ? !!sourcesCollapsed[root.id] : false}
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
  const [addingFolder, setAddingFolder] = useState(false);
  const [folderName, setFolderName]     = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function openAddFolder(e: React.MouseEvent) {
    e.stopPropagation();
    setAddingFolder(true);
    setFolderName("");
    setTimeout(() => inputRef.current?.focus(), 0);
  }
  function confirmAddFolder() {
    const title = folderName.trim();
    if (title) chrome.bookmarks.create({ parentId: root.id, title });
    setAddingFolder(false);
    setFolderName("");
  }
  function keyDownAddFolder(e: React.KeyboardEvent) {
    if (e.key === "Enter")  { e.preventDefault(); confirmAddFolder(); }
    if (e.key === "Escape") { e.stopPropagation(); setAddingFolder(false); }
  }

  return (
    <div>
      {showTitle && (
        <div
          className={`${styles.sourceTitle} ${collapsed ? styles.sourceTitleCollapsed : ""}`}
          onClick={() => onCollapsedChange(!collapsed)}
        >
          <span className={styles.sourceTitleText}>{root.title}</span>
          <button className={styles.addFolderBtn} title="New folder" onClick={openAddFolder}>+</button>
          <span className={styles.sourceChevron}>▾</span>
        </div>
      )}
      {addingFolder && (
        <div className={styles.newFolderInput}>
          <span className={styles.folderIcon}>📁</span>
          <input ref={inputRef} value={folderName}
            onChange={(e) => setFolderName(e.target.value)}
            onKeyDown={keyDownAddFolder} onBlur={confirmAddFolder}
            placeholder="Folder name…" />
        </div>
      )}
      {!collapsed && (
        (root.children ?? []).map((node) => (
          <BookmarkNode
            key={node.id}
            node={node}
            depth={0}
            isOpen={isOpen}
            onToggle={onToggle}
            openLinksInNewTab={openLinksInNewTab}
            onDropTabOnFolder={onDropTabOnFolder}
          />
        ))
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

  const myDrop = dropInfo?.targetId === node.id ? dropInfo.position : null;

  // ── Rename folder on double-click ────────────────────────────────────────
  const [renaming, setRenaming] = useState(false);
  const [renameVal, setRenameVal] = useState("");
  const renameRef = useRef<HTMLInputElement>(null);

  function startRename(e: React.MouseEvent) {
    e.stopPropagation();
    setRenameVal(node.title || "");
    setRenaming(true);
    setTimeout(() => {
      renameRef.current?.focus();
      renameRef.current?.select();
    }, 0);
  }

  function confirmRename() {
    const title = renameVal.trim();
    if (title && title !== node.title) chrome.bookmarks.update(node.id, { title });
    setRenaming(false);
  }

  function keyDownRename(e: React.KeyboardEvent) {
    if (e.key === "Enter")  { e.preventDefault(); confirmRename(); }
    if (e.key === "Escape") { e.stopPropagation(); setRenaming(false); }
  }

  // ── New subfolder state ───────────────────────────────────────────────────
  const [addingFolder, setAddingFolder] = useState(false);
  const [folderName, setFolderName]     = useState("");
  const folderInputRef = useRef<HTMLInputElement>(null);

  function openAddFolder(e: React.MouseEvent) {
    e.stopPropagation();
    setAddingFolder(true);
    setFolderName("");
    setTimeout(() => folderInputRef.current?.focus(), 0);
  }
  function confirmAddFolder() {
    const title = folderName.trim();
    if (title) chrome.bookmarks.create({ parentId: node.id, title });
    setAddingFolder(false);
    setFolderName("");
  }
  function keyDownAddFolder(e: React.KeyboardEvent) {
    if (e.key === "Enter")  { e.preventDefault(); confirmAddFolder(); }
    if (e.key === "Escape") { e.stopPropagation(); setAddingFolder(false); }
  }

  // ── Delete: two-click confirm with 2s timeout ─────────────────────────────
  const [confirmDelete, setConfirmDelete] = useState(false);
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirmDelete) {
      // First click — enter confirm state and start timeout
      setConfirmDelete(true);
      confirmTimer.current = setTimeout(() => setConfirmDelete(false), 2000);
      return;
    }
    // Second click — confirmed, delete
    if (confirmTimer.current) clearTimeout(confirmTimer.current);
    if (isFolder) {
      chrome.bookmarks.removeTree(node.id);
    } else {
      chrome.bookmarks.remove(node.id);
    }
  }

  // Clean up timer if component unmounts while in confirm state
  useEffect(() => () => {
    if (confirmTimer.current) clearTimeout(confirmTimer.current);
  }, []);

  // ── Drag handlers ─────────────────────────────────────────────────────────

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

    if (hasBm) {
      if (isFolder) {
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const rel = (e.clientY - rect.top) / rect.height;
        if (rel < 0.25)      setDropInfo({ targetId: node.id, position: "before" });
        else if (rel > 0.75) setDropInfo({ targetId: node.id, position: "after" });
        else                 setDropInfo({ targetId: node.id, position: "inside" });
      } else {
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const pos  = e.clientY < rect.top + rect.height / 2 ? "before" : "after";
        setDropInfo({ targetId: node.id, position: pos });
      }
    } else {
      if (isFolder) setDropInfo({ targetId: node.id, position: "inside" });
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    const info = dropInfoRef.current;
    setDropInfo(null);

    if (e.dataTransfer.types.includes(TAB_DRAG_TYPE) && isFolder && info?.position === "inside") {
      onDropTabOnFolder(node.id, e);
      return;
    }

    const id = dragId.current;
    dragId.current = null;
    if (!id || !info) return;
    if (id === info.targetId) return;

    moveBookmark(id, info);
  }

  const children = isFolder ? (node.children ?? []) : [];

  const cls = [
    isFolder ? styles.folderHeader : styles.bookmarkItem,
    open && isFolder           ? styles.open           : "",
    myDrop === "inside"        ? styles.dropInside     : "",
    dragId.current === node.id ? styles.dragging       : "",
    confirmDelete              ? styles.deleteConfirm  : "",
  ].filter(Boolean).join(" ");

  // ── Delete button (shared by both folder and leaf) ────────────────────────
  const deleteBtn = (
    <button
      className={`${styles.deleteBtn} ${confirmDelete ? styles.deleteBtnConfirm : ""}`}
      title={confirmDelete ? "Click again to confirm delete" : isFolder ? "Delete folder" : "Delete bookmark"}
      onClick={handleDelete}
    >
      {confirmDelete ? "?" : "✕"}
    </button>
  );

  const element = isFolder ? (
    renaming ? (
      <div className={cls}>
        <span className={styles.folderIcon}>{open ? "📂" : "📁"}</span>
        <input
          ref={renameRef}
          className={styles.renameInput}
          value={renameVal}
          onChange={(e) => setRenameVal(e.target.value)}
          onKeyDown={keyDownRename}
          onBlur={confirmRename}
          onClick={(e) => e.stopPropagation()}
        />
      </div>
    ) : (
      <div
        className={cls}
        draggable
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={() => onToggle(node.id)}
        onDoubleClick={startRename}
      >
        <span className={styles.folderIcon}>{open ? "📂" : "📁"}</span>
        <span className={styles.folderName}>{node.title || "Bookmarks"}</span>
        {deleteBtn}
        <button className={styles.addFolderBtn} title="New folder" onClick={openAddFolder}>+</button>
        <span className={styles.folderChevron}>▶</span>
      </div>
    )
  ) : node.url ? (
    <div
      role="button"
      className={cls}
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
          if (openLinksInNewTab) { chrome.tabs.create({ url, index: 0 }); }
          else { const a = tabs.find((t) => t.active); if (a?.id != null) chrome.tabs.update(a.id, { url }); }
        });
      }}
    >
      <Favicon url={node.url} className={styles.favicon} />
      <div className={styles.bookmarkInfo}>
        <span className={styles.bookmarkTitle}>{node.title || node.url}</span>
        <span className={styles.bookmarkDomain}>{(() => { try { return new URL(node.url).hostname.replace(/^www\./, ""); } catch { return ""; } })()}</span>
      </div>
      {deleteBtn}
    </div>
  ) : null;

  if (!element) return null;

  return (
    <>
      {myDrop === "before" && <div className={styles.bmPlaceholder} />}
      {element}
      {isFolder && addingFolder && (
        <div className={styles.newFolderInput}>
          <span className={styles.folderIcon}>📁</span>
          <input ref={folderInputRef} value={folderName}
            onChange={(e) => setFolderName(e.target.value)}
            onKeyDown={keyDownAddFolder} onBlur={confirmAddFolder}
            placeholder="Folder name…" />
        </div>
      )}
      {myDrop === "after"  && <div className={styles.bmPlaceholder} />}
      {isFolder && (
        <div className={`${styles.childrenWrap} ${open ? styles.childrenOpen : ""}`}>
          <div
            className={styles.children}
            onDragOver={(e) => { if (e.dataTransfer.types.includes(BM_DRAG_TYPE)) e.preventDefault(); }}
            onDrop={(e) => {
              if (!e.dataTransfer.types.includes(BM_DRAG_TYPE)) return;
              e.preventDefault();
              e.stopPropagation();
              const info = dropInfoRef.current;
              setDropInfo(null);
              const id = dragId.current;
              dragId.current = null;
              if (!id || !info || id === info.targetId) return;
              moveBookmark(id, info);
            }}
          >
            {children.map((child) => (
              <BookmarkNode
                key={child.id}
                node={child}
                depth={depth + 1}
                isOpen={isOpen}
                onToggle={onToggle}
                openLinksInNewTab={openLinksInNewTab}
                onDropTabOnFolder={onDropTabOnFolder}
              />
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function nodeMatches(node: chrome.bookmarks.BookmarkTreeNode, query: string): boolean {
  if (!query) return true;
  if (node.url) return node.title.toLowerCase().includes(query) || node.url.toLowerCase().includes(query);
  return (node.children ?? []).some((c) => nodeMatches(c, query));
}
