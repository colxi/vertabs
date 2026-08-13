import React, { useCallback, useEffect, useRef, useState } from "react";
import styles from "./App.module.css";
import FuseLib from "fuse.js";

// ── Types ─────────────────────────────────────────────────────────────────────

type ResultKind = "tab" | "bookmark" | "shortcut" | "url" | "command";

interface PaletteResult {
  id:       string;
  kind:     ResultKind;
  title:    string;
  subtitle: string;
  favicon:  string;
  action:   PaletteAction;
}

interface PaletteAction {
  type:    string;
  tabId?:  number;
  url?:    string;
  value?:  string;
  action?: string;
}

interface PaletteData {
  tabs:         chrome.tabs.Tab[];
  pinned:       chrome.tabs.Tab[];
  bookmarks:    chrome.bookmarks.BookmarkTreeNode[];
  shortcutUrls: Record<string, string>;
  currentTab:   chrome.tabs.Tab | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function domain(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
}

function faviconSrc(url: string): string {
  try { return `https://${new URL(url).hostname}/favicon.ico`; } catch { return ""; }
}

function isUrl(q: string): boolean {
  return /^https?:\/\//i.test(q) || /^[\w-]+\.[\w-]+(\/|$)/.test(q);
}

function fuseSearch<T>(
  items: T[],
  keys: { name: string; weight: number }[],
  query: string,
  limit: number,
): T[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fuse = new FuseLib(items, { keys, threshold: 0.4, distance: 200, includeScore: true } as any);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (fuse.search(query) as any[]).slice(0, limit).map((r: any) => r.item as T);
}

function collectBookmarks(
  nodes: chrome.bookmarks.BookmarkTreeNode[],
): chrome.bookmarks.BookmarkTreeNode[] {
  const out: chrome.bookmarks.BookmarkTreeNode[] = [];
  for (const n of nodes) {
    if (n.url) out.push(n);
    else if (n.children) out.push(...collectBookmarks(n.children));
  }
  return out;
}

// ── Highlight component ───────────────────────────────────────────────────────

function Highlight({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark className={styles.mark}>{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  );
}

// ── Favicon component ─────────────────────────────────────────────────────────

function Fav({ src, kind }: { src: string; kind: ResultKind }) {
  const [failed, setFailed] = useState(false);

  if (kind === "command") {
    return <span className={styles.cmdIcon}>{src}</span>;
  }
  if (kind === "url") {
    return <span className={styles.urlArrow}>↗</span>;
  }
  if (!src || failed) {
    const letter = domain(src)[0]?.toUpperCase() ?? "?";
    return <span className={styles.favLetter}>{letter}</span>;
  }
  return (
    <img
      src={src}
      width={16}
      height={16}
      className={styles.favImg}
      alt=""
      onError={() => setFailed(true)}
    />
  );
}

// ── Build results ─────────────────────────────────────────────────────────────

function buildResults(q: string, data: PaletteData): PaletteResult[] {
  if (!q.trim()) return [];
  const out: PaletteResult[] = [];

  const act = (action: string, extra: Partial<PaletteAction> = {}): PaletteAction =>
    ({ type: "commandPalette-activate", action, ...extra });

  // Tabs
  fuseSearch(
    data.tabs.filter((t) => !t.pinned),
    [{ name: "title", weight: 0.6 }, { name: "url", weight: 0.4 }],
    q, 5,
  ).forEach((t) => out.push({
    id:       `tab-${t.id}`,
    kind:     "tab",
    title:    t.title || t.url || "New Tab",
    subtitle: domain(t.url ?? ""),
    favicon:  t.favIconUrl || faviconSrc(t.url ?? ""),
    action:   act("focus-tab", { tabId: t.id }),
  }));

  // Shortcuts
  fuseSearch(
    data.pinned,
    [{ name: "title", weight: 0.6 }, { name: "url", weight: 0.4 }],
    q, 4,
  ).forEach((t) => {
    const url = data.shortcutUrls[String(t.id)] || t.url || "";
    out.push({
      id:       `sc-${t.id}`,
      kind:     "shortcut",
      title:    t.title || domain(url),
      subtitle: domain(url),
      favicon:  t.favIconUrl || faviconSrc(url),
      action:   act("focus-tab", { tabId: t.id, url }),
    });
  });

  // Bookmarks
  fuseSearch(
    collectBookmarks(data.bookmarks),
    [{ name: "title", weight: 0.7 }, { name: "url", weight: 0.3 }],
    q, 6,
  ).forEach((b) => out.push({
    id:       `bm-${b.id}`,
    kind:     "bookmark",
    title:    b.title || b.url || "",
    subtitle: domain(b.url ?? ""),
    favicon:  faviconSrc(b.url ?? ""),
    action:   act("open-url", { url: b.url }),
  }));

  // Commands
  const ct = data.currentTab;
  if (ct) {
    const tabAct = (action: string, extra: Partial<PaletteAction> = {}): PaletteAction =>
      ({ type: "commandPalette-activate", action, tabId: ct.id, url: ct.url, ...extra });

    const COMMANDS = [
      { label: "New tab",            icon: "✚", kw: "new tab open",               action: tabAct("new-tab") },
      { label: "Close tab",          icon: "✕", kw: "close tab remove",            action: tabAct("close-tab") },
      { label: "Duplicate tab",      icon: "⧉", kw: "duplicate copy tab clone",    action: tabAct("duplicate-tab") },
      { label: ct.pinned ? "Unpin tab" : "Add to Shortcuts", icon: "📌", kw: "pin unpin shortcut add",
        action: tabAct(ct.pinned ? "pin-tab" : "add-shortcut") },
      { label: "Add to Bookmarks",   icon: "🔖", kw: "bookmark save add",          action: tabAct("add-bookmark", { value: ct.title || "" }) },
      { label: ct.mutedInfo?.muted ? "Unmute tab" : "Mute tab",
        icon: ct.mutedInfo?.muted ? "🔊" : "🔇", kw: "mute unmute audio sound",   action: tabAct("mute-tab") },
      { label: "Zoom in",            icon: "🔍", kw: "zoom in bigger larger",       action: tabAct("zoom-in") },
      { label: "Zoom out",           icon: "🔎", kw: "zoom out smaller",            action: tabAct("zoom-out") },
      { label: "Reset zoom",         icon: "⊙",  kw: "zoom reset default 100",     action: tabAct("zoom-reset") },
      { label: "Go back",            icon: "←",  kw: "back previous history",      action: tabAct("go-back") },
      { label: "Go forward",         icon: "→",  kw: "forward next history",       action: tabAct("go-forward") },
      { label: "Next tab",           icon: "▶",  kw: "next tab switch",            action: tabAct("next-tab") },
      { label: "Previous tab",       icon: "◀",  kw: "previous prev tab switch",   action: tabAct("prev-tab") },
      { label: "Reopen closed tab",  icon: "↺",  kw: "reopen restore closed tab",  action: tabAct("reopen-tab") },
      { label: "Copy page URL",      icon: "⎘",  kw: "copy url link clipboard",    action: { type: "copy-url", url: ct.url } },
      { label: "Open Settings",      icon: "⚙",  kw: "settings config preferences", action: { type: "open-settings" } },
    ];

    COMMANDS
      .filter((c) => c.kw.includes(q.toLowerCase()) || c.label.toLowerCase().includes(q.toLowerCase()))
      .slice(0, 6)
      .forEach((c, i) => out.push({
        id:       `cmd-${i}`,
        kind:     "command",
        title:    c.label,
        subtitle: "Command",
        favicon:  c.icon,
        action:   c.action as PaletteAction,
      }));
  }

  // URL go-to
  if (isUrl(q)) {
    const url = /^https?:\/\//i.test(q) ? q : `https://${q}`;
    out.push({
      id:       "url",
      kind:     "url",
      title:    `Go to ${url}`,
      subtitle: url,
      favicon:  "",
      action:   act("open-url", { url }),
    });
  }

  return out;
}

// ── Group labels ──────────────────────────────────────────────────────────────

const LABELS: Record<ResultKind, string> = {
  tab:      "Open Tabs",
  shortcut: "Shortcuts",
  bookmark: "Bookmarks",
  command:  "Commands",
  url:      "Navigate",
};

// ── Main App ──────────────────────────────────────────────────────────────────

export function CommandPaletteApp() {
  const [query,    setQuery]    = useState("");
  const [data,     setData]     = useState<PaletteData | null>(null);
  const [activeIdx, setActiveIdx] = useState(-1);
  const inputRef    = useRef<HTMLInputElement>(null);
  const listRef     = useRef<HTMLDivElement>(null);
  const panelRef    = useRef<HTMLDivElement>(null);
  const rootRef     = useRef<HTMLDivElement>(null);

  // ── Report height via background → content script ──────────────────────────
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const report = () => {
      const h = panel.scrollHeight + 40;
      chrome.runtime.sendMessage({ type: "commandPalette-resize", height: h });
    };
    const ro = new ResizeObserver(report);
    ro.observe(panel);
    report();
    return () => ro.disconnect();
  // Re-run when data loads so hints bar is included in initial height
  }, [data]);

  // ── Request data from background on mount ──────────────────────────────────
  useEffect(() => {
    chrome.runtime.sendMessage({ type: "commandPalette-data" }, (d) => {
      if (d) setData(d);
    });
    inputRef.current?.focus();
  }, []);

  // ── Close the palette ──────────────────────────────────────────────────────
  const close = useCallback(() => {
    window.parent.postMessage({ type: "commandPalette-close" }, "*");
  }, []);

  // ── Listen for Escape from parent or self ──────────────────────────────────
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.data?.type === "commandPalette-close") close();
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [close]);

  // ── Activate a result ──────────────────────────────────────────────────────
  const activate = useCallback((r: PaletteResult) => {
    const a = r.action;
    if (a.type === "copy-url" && a.url) {
      const ta = document.createElement("textarea");
      ta.value = a.url;
      ta.style.cssText = "position:fixed;top:-9999px;opacity:0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    } else if (a.type === "open-settings") {
      window.parent.postMessage({ type: "open-settings" }, "*");
    } else {
      chrome.runtime.sendMessage(a);
    }
    close();
  }, [close]);

  // ── Build results ──────────────────────────────────────────────────────────
  const results = data ? buildResults(query, data) : [];

  // Reset selection on query change
  const prevQuery = useRef(query);
  useEffect(() => {
    if (query !== prevQuery.current) {
      setActiveIdx(-1);
      prevQuery.current = query;
    }
  }, [query]);

  // Scroll active into view
  useEffect(() => {
    if (activeIdx < 0) return;
    const el = listRef.current?.querySelector(`[data-idx="${activeIdx}"]`) as HTMLElement | null;
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIdx]);

  // ── Keyboard handler ───────────────────────────────────────────────────────
  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape")     { e.preventDefault(); close(); return; }
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "K") { e.preventDefault(); close(); return; }
    if (e.key === "ArrowDown")  {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i < 0 ? 0 : i + 1, results.length - 1));
      return;
    }
    if (e.key === "ArrowUp")    {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i <= 0 ? 0 : i - 1, 0));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (activeIdx >= 0 && results[activeIdx]) {
        activate(results[activeIdx]);
      } else if (query.trim()) {
        chrome.runtime.sendMessage({
          type: "commandPalette-activate",
          action: "open-url",
          url: `https://www.google.com/search?q=${encodeURIComponent(query.trim())}`,
        });
        close();
      }
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  let lastKind: ResultKind | null = null;

  return (
    <div className={styles.backdrop} ref={rootRef}>
      <div className={styles.panel} ref={panelRef}>

        {/* Input */}
        <div className={styles.inputWrap}>
          <span className={styles.searchIcon}>🔍</span>
          <input
            ref={inputRef}
            className={styles.input}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search tabs, bookmarks, shortcuts, commands…"
            autoComplete="off"
            spellCheck={false}
          />
          {query && (
            <button className={styles.clearBtn} onClick={() => { setQuery(""); setActiveIdx(-1); inputRef.current?.focus(); }}>✕</button>
          )}
        </div>

        {/* Results */}
        {results.length > 0 && (
          <div className={styles.results} ref={listRef}>
            {results.map((r, i) => {
              const showLabel = r.kind !== lastKind;
              lastKind = r.kind;
              return (
                <React.Fragment key={r.id}>
                  {showLabel && (
                    <div className={styles.groupLabel}>{LABELS[r.kind]}</div>
                  )}
                  <div
                    className={`${styles.result} ${i === activeIdx ? styles.resultActive : ""}`}
                    data-idx={i}
                    onClick={() => activate(r)}
                    onMouseMove={() => { if (activeIdx !== i) setActiveIdx(i); }}
                  >
                    <div className={styles.resultIcon}>
                      <Fav src={r.favicon} kind={r.kind} />
                    </div>
                    <div className={styles.resultText}>
                      <span className={styles.resultTitle}>
                        <Highlight text={r.title} query={query} />
                      </span>
                      <span className={styles.resultSub}>
                        <Highlight text={r.subtitle} query={query} />
                      </span>
                    </div>
                    <span className={styles.kindBadge}>{r.kind}</span>
                  </div>
                </React.Fragment>
              );
            })}
          </div>
        )}

        {query && results.length === 0 && (
          <div className={styles.empty}>No results — press Enter to search Google</div>
        )}

        {/* Hints */}
        <div className={styles.hints}>
          <span><kbd>↑↓</kbd> navigate</span>
          <span><kbd>↵</kbd> open</span>
          <span><kbd>Esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}
