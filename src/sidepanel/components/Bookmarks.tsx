import React, { useState } from "react";
import styles from "./Bookmarks.module.css";
import { faviconUrl } from "../utils/favicon";

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
      <span
        className={className}
        style={{
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          background: bg, color: "#fff", borderRadius: "4px",
          fontSize: "0.77rem", fontWeight: 700, flexShrink: 0,
        }}
      >
        {letter}
      </span>
    );
  }
  return (
    <img
      className={className}
      src={faviconUrl(url)}
      alt=""
      onError={() => setFailed(true)}
    />
  );
}

// ── Highlight matching substring ──────────────────────────────────────────────

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

// ── Collect all matching leaf bookmarks recursively ───────────────────────────

function collectMatches(
  nodes: chrome.bookmarks.BookmarkTreeNode[],
  query: string,
): chrome.bookmarks.BookmarkTreeNode[] {
  const results: chrome.bookmarks.BookmarkTreeNode[] = [];
  for (const node of nodes) {
    if (node.url) {
      if (
        node.title.toLowerCase().includes(query) ||
        node.url.toLowerCase().includes(query)
      ) {
        results.push(node);
      }
    } else if (node.children) {
      results.push(...collectMatches(node.children, query));
    }
  }
  return results;
}

// ── Component ─────────────────────────────────────────────────────────────────

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

// Chrome bookmark root IDs
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

  const allRoots = tree[0]?.children ?? [];

  // Filter to selected sources only.
  const roots = allRoots.filter((n) => {
    if (n.id === BAR_ID)   return showBookmarksBar;
    if (n.id === OTHER_ID) return showOtherBookmarks;
    return false; // ignore mobile bookmarks etc.
  });

  // Show group title (source name) only when both sources are selected.
  const showGroupTitles = showBookmarksBar && showOtherBookmarks;

  const flatResults = q ? collectMatches(roots, q) : null;

  function openLink(url: string) {
    chrome.tabs.query({ currentWindow: true }, (tabs) => {
      const existing = tabs.find((t) => t.url === url);
      if (existing?.id != null) {
        chrome.tabs.update(existing.id, { active: true });
        return;
      }
      if (openLinksInNewTab) {
        chrome.tabs.create({ url });
      } else {
        const active = tabs.find((t) => t.active);
        if (active?.id != null) chrome.tabs.update(active.id, { url });
      }
    });
  }

  return (
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
              // ── Flat search results ──────────────────────────────────────
              flatResults.length === 0 ? (
                <p className={styles.empty}>No bookmarks match "{query}"</p>
              ) : (
                flatResults.map((node) => (
                  <a
                    key={node.id}
                    className={styles.bookmarkItem}
                    href="#"
                    onClick={(e) => { e.preventDefault(); openLink(node.url!); }}
                  >
                    <Favicon url={node.url!} className={styles.favicon} />
                    <span className={styles.bookmarkTitle}>
                      <Highlight text={node.title || node.url!} query={query} />
                    </span>
                  </a>
                ))
              )
            ) : (
              // ── Normal folder tree ───────────────────────────────────────
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
                />
              ))
            )}
          </div>
        </div>
      )}
    </section>
  );
}

// ── Bookmark source group (Bookmarks bar / Other bookmarks) ──────────────────

function BookmarkSource({
  root,
  showTitle,
  collapsed,
  onCollapsedChange,
  isOpen,
  onToggle,
  openLinksInNewTab,
}: {
  root: chrome.bookmarks.BookmarkTreeNode;
  showTitle: boolean;
  collapsed: boolean;
  onCollapsedChange: (v: boolean) => void;
  isOpen: (id: string) => boolean;
  onToggle: (id: string) => void;
  openLinksInNewTab: boolean;
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
      {!collapsed && (root.children ?? []).map((node) => (
        <BookmarkNode
          key={node.id}
          node={node}
          depth={0}
          isOpen={isOpen}
          onToggle={onToggle}
          openLinksInNewTab={openLinksInNewTab}
        />
      ))}
    </div>
  );
}

// ── Folder/bookmark tree node ─────────────────────────────────────────────────

function BookmarkNode({
  node,
  depth,
  isOpen,
  onToggle,
  openLinksInNewTab,
}: {
  node: chrome.bookmarks.BookmarkTreeNode;
  depth: number;
  isOpen: (id: string) => boolean;
  onToggle: (id: string) => void;
  openLinksInNewTab: boolean;
}) {
  if (node.children) {
    const open = isOpen(node.id);
    return (
      <div className={styles.folder}>
        <div
          className={`${styles.folderHeader} ${open ? styles.open : ""}`}
          onClick={() => onToggle(node.id)}
        >
          <span className={styles.folderIcon}>{open ? "📂" : "📁"}</span>
          <span className={styles.folderName}>{node.title || "Bookmarks"}</span>
          <span className={styles.folderChevron}>▶</span>
        </div>
        {open && (
          <div className={styles.children}>
            {node.children.map((child) => (
              <BookmarkNode
                key={child.id}
                node={child}
                depth={depth + 1}
                isOpen={isOpen}
                onToggle={onToggle}
                openLinksInNewTab={openLinksInNewTab}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  if (!node.url) return null;

  function openLink() {
    const url = node.url!;
    chrome.tabs.query({ currentWindow: true }, (tabs) => {
      const existing = tabs.find((t) => t.url === url);
      if (existing?.id != null) {
        chrome.tabs.update(existing.id, { active: true });
        return;
      }
      if (openLinksInNewTab) {
        chrome.tabs.create({ url });
      } else {
        const active = tabs.find((t) => t.active);
        if (active?.id != null) chrome.tabs.update(active.id, { url });
      }
    });
  }

  return (
    <a
      className={styles.bookmarkItem}
      href="#"
      onClick={(e) => { e.preventDefault(); openLink(); }}
    >
      <Favicon url={node.url} className={styles.favicon} />
      <span className={styles.bookmarkTitle}>{node.title || node.url}</span>
    </a>
  );
}

function nodeMatches(
  node: chrome.bookmarks.BookmarkTreeNode,
  query: string
): boolean {
  if (!query) return true;
  if (node.url) {
    return (
      node.title.toLowerCase().includes(query) ||
      node.url.toLowerCase().includes(query)
    );
  }
  return (node.children ?? []).some((c) => nodeMatches(c, query));
}

