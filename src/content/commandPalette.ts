/**
 * CommandPalette search — rendered directly in the host page DOM.
 * Triggered by Cmd+K / Ctrl+K from content/index.ts.
 * Fetches tabs, shortcuts and bookmarks via Chrome APIs.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

type ResultKind = "tab" | "bookmark" | "shortcut" | "url" | "command";

interface Result {
  kind:     ResultKind;
  title:    string;
  subtitle: string;
  favicon:  string;
  activate: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function domain(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
}

function faviconSrc(url: string): string {
  try { return `https://${new URL(url).hostname}/favicon.ico`; } catch { return ""; }
}

function isUrl(q: string): boolean {
  return /^https?:\/\//i.test(q) || /^[\w-]+\.[\w-]+(\/|$)/.test(q);
}

function score(title: string, url: string, q: string): number {
  const t = title.toLowerCase();
  const u = url.toLowerCase();
  if (t.startsWith(q))  return 3;
  if (t.includes(q))    return 2;
  if (u.includes(q))    return 1;
  return 0;
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

// ── Build results via background script ──────────────────────────────────────
// chrome.bookmarks is not available in content scripts — we ask the background.

async function buildResults(q: string): Promise<Result[]> {
  if (!q.trim()) return [];
  const ql = q.trim().toLowerCase();

  // Fetch all data from the background script in one round-trip
  const data = await new Promise<{
    tabs:         chrome.tabs.Tab[];
    pinned:       chrome.tabs.Tab[];
    bookmarks:    chrome.bookmarks.BookmarkTreeNode[];
    shortcutUrls: Record<string, string>;
    currentTab:   chrome.tabs.Tab | null;
  }>((resolve) => {
    chrome.runtime.sendMessage({ type: "commandPalette-data" }, resolve);
  });

  if (!data) return [];

  const out: Result[] = [];

  // Tabs
  data.tabs
    .filter((t) => !t.pinned && score(t.title ?? "", t.url ?? "", ql) > 0)
    .sort((a, b) => score(b.title ?? "", b.url ?? "", ql) - score(a.title ?? "", a.url ?? "", ql))
    .slice(0, 5)
    .forEach((t) => out.push({
      kind:     "tab",
      title:    t.title || t.url || "New Tab",
      subtitle: domain(t.url ?? ""),
      favicon:  t.favIconUrl || faviconSrc(t.url ?? ""),
      activate: () => chrome.runtime.sendMessage({ type: "commandPalette-activate", action: "focus-tab", tabId: t.id }),
    }));

  // Shortcuts (pinned tabs)
  data.pinned
    .filter((t) => score(t.title ?? "", t.url ?? "", ql) > 0)
    .sort((a, b) => score(b.title ?? "", b.url ?? "", ql) - score(a.title ?? "", a.url ?? "", ql))
    .slice(0, 4)
    .forEach((t) => {
      const url = data.shortcutUrls[String(t.id)] || t.url || "";
      out.push({
        kind:     "shortcut",
        title:    t.title || domain(url),
        subtitle: domain(url),
        favicon:  t.favIconUrl || faviconSrc(url),
        activate: () => chrome.runtime.sendMessage({ type: "commandPalette-activate", action: "focus-tab", tabId: t.id, url }),
      });
    });

  // Bookmarks
  collectBookmarks(data.bookmarks)
    .filter((b) => score(b.title, b.url ?? "", ql) > 0)
    .sort((a, b) => score(b.title, b.url ?? "", ql) - score(a.title, a.url ?? "", ql))
    .slice(0, 6)
    .forEach((b) => out.push({
      kind:     "bookmark",
      title:    b.title || b.url || "",
      subtitle: domain(b.url ?? ""),
      favicon:  faviconSrc(b.url ?? ""),
      activate: () => chrome.runtime.sendMessage({ type: "commandPalette-activate", action: "open-url", url: b.url }),
    }));

  // Commands — actions on the current tab
  const ct = data.currentTab;
  if (ct) {
    const send = (action: string, extra: Record<string, unknown> = {}) =>
      chrome.runtime.sendMessage({ type: "commandPalette-activate", action, tabId: ct.id, url: ct.url, ...extra });

    const COMMANDS: { label: string; icon: string; keywords: string; activate: () => void }[] = [
      { label: "New tab",               icon: "✚", keywords: "new tab open",                     activate: () => send("new-tab") },
      { label: "Close tab",             icon: "✕", keywords: "close tab remove",                 activate: () => send("close-tab") },
      { label: "Duplicate tab",         icon: "⧉", keywords: "duplicate copy tab clone",         activate: () => send("duplicate-tab") },
      { label: ct.pinned ? "Unpin tab" : "Add to Shortcuts", icon: "📌", keywords: "pin unpin shortcut add",
        activate: () => send(ct.pinned ? "pin-tab" : "add-shortcut", { url: ct.url }) },
      { label: "Add to Bookmarks",      icon: "🔖", keywords: "bookmark save add",               activate: () => send("add-bookmark", { value: ct.title || "" }) },
      { label: ct.mutedInfo?.muted ? "Unmute tab" : "Mute tab", icon: ct.mutedInfo?.muted ? "🔊" : "🔇", keywords: "mute unmute audio sound",
        activate: () => send("mute-tab") },
      { label: "Zoom in",               icon: "🔍", keywords: "zoom in bigger larger",           activate: () => send("zoom-in") },
      { label: "Zoom out",              icon: "🔎", keywords: "zoom out smaller",                activate: () => send("zoom-out") },
      { label: "Reset zoom",            icon: "⊙", keywords: "zoom reset default 100",           activate: () => send("zoom-reset") },
      { label: "Go back",               icon: "←", keywords: "back previous history",            activate: () => send("go-back") },
      { label: "Go forward",            icon: "→", keywords: "forward next history",             activate: () => send("go-forward") },
      { label: "Next tab",              icon: "▶", keywords: "next tab switch",                  activate: () => send("next-tab") },
      { label: "Previous tab",          icon: "◀", keywords: "previous prev tab switch",         activate: () => send("prev-tab") },
      { label: "Reopen closed tab",     icon: "↺", keywords: "reopen restore closed tab",        activate: () => send("reopen-tab") },
      { label: "Copy page URL", icon: "⎘", keywords: "copy url link clipboard",
        activate: () => {
          const ta = document.createElement("textarea");
          ta.value = ct.url ?? "";
          ta.style.cssText = "position:fixed;top:-9999px;opacity:0";
          document.body.appendChild(ta);
          ta.select();
          document.execCommand("copy");
          document.body.removeChild(ta);
        }
      },
      { label: "Open Settings",         icon: "⚙", keywords: "settings config preferences",     activate: () => window.parent.postMessage({ type: "open-settings" }, "*") },
    ];

    COMMANDS
      .filter((c) => c.keywords.includes(ql) || c.label.toLowerCase().includes(ql))
      .slice(0, 6)
      .forEach((c) => out.push({
        kind:     "command",
        title:    c.label,
        subtitle: "Command",
        favicon:  c.icon,
        activate: c.activate,
      }));
  }

  // URL go-to
  if (isUrl(ql)) {
    const url = /^https?:\/\//i.test(ql) ? ql : `https://${ql}`;
    out.push({
      kind:     "url",
      title:    `Go to ${url}`,
      subtitle: url,
      favicon:  "",
      activate: () => chrome.runtime.sendMessage({ type: "commandPalette-activate", action: "open-url", url }),
    });
  }

  return out;
}

// ── CSS injected into the page ────────────────────────────────────────────────

const STYLES = `
#__vertabs-commandPalette-backdrop__ {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.55);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 12vh;
  z-index: 2147483647;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  animation: __vcp-fade__ 0.12s ease;
}
@keyframes __vcp-fade__ { from{opacity:0} to{opacity:1} }
#__vertabs-commandPalette-panel__ {
  width: 560px;
  max-width: calc(100vw - 32px);
  background: #1c1d21;
  border: 1px solid #32343d;
  border-radius: 12px;
  box-shadow: 0 24px 64px rgba(0,0,0,0.6);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  max-height: 70vh;
  animation: __vcp-slide__ 0.14s cubic-bezier(0.4,0,0.2,1);
}
@keyframes __vcp-slide__ { from{opacity:0;transform:translateY(-10px)} to{opacity:1;transform:translateY(0)} }
#__vertabs-commandPalette-input-wrap__ {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px;
  border-bottom: 1px solid #282930;
}
#__vertabs-commandPalette-icon__ {
  font-size: 16px;
  color: #5c6270;
  flex-shrink: 0;
}
#__vertabs-commandPalette-input__ {
  flex: 1;
  background: none;
  border: none;
  outline: none;
  color: #eaebed;
  font-size: 17px;
  font-family: inherit;
  caret-color: #7c3aed;
}
#__vertabs-commandPalette-input__::placeholder { color: #5c6270; }
.__vcp-highlight__ {
  background: rgba(124, 58, 237, 0.25);
  color: #c4b5fd;
  border-radius: 2px;
  padding: 0 1px;
  font-style: normal;
}
#__vertabs-commandPalette-results__ {
  overflow-y: auto;
  max-height: 380px;
  padding: 6px 0;
  scrollbar-width: none;
  overscroll-behavior: contain;
}
#__vertabs-commandPalette-results__::-webkit-scrollbar { display: none; }
.__vcp-group-label__ {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: #5c6270;
  padding: 8px 16px 3px;
}
.__vcp-result__ {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 16px;
  cursor: pointer;
  transition: background 0.1s;
}
.__vcp-result__:hover, .__vcp-result-active__ {
  background: #2a2b33;
}
.__vcp-result-icon__ {
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.__vcp-result-icon__ img {
  width: 16px;
  height: 16px;
  border-radius: 3px;
  object-fit: contain;
}
.__vcp-fav-letter__ {
  width: 16px;
  height: 16px;
  border-radius: 3px;
  background: rgba(124,58,237,0.2);
  color: #7c3aed;
  font-size: 9px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
}
.__vcp-url-arrow__ {
  font-size: 16px;
  color: #7c3aed;
}
.__vcp-cmd-icon__ {
  font-size: 14px;
  line-height: 1;
}
.__vcp-result-text__ {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.__vcp-result-title__ {
  font-size: 14px;
  color: #eaebed;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.__vcp-result-sub__ {
  font-size: 11.5px;
  color: #5c6270;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.__vcp-badge__ {
  font-size: 10px;
  color: #5c6270;
  background: #363742;
  border-radius: 4px;
  padding: 1px 6px;
  flex-shrink: 0;
}
#__vertabs-commandPalette-empty__ {
  padding: 24px 16px;
  text-align: center;
  font-size: 14px;
  color: #5c6270;
}
#__vertabs-commandPalette-hints__ {
  display: flex;
  gap: 16px;
  justify-content: center;
  padding: 8px 16px;
  border-top: 1px solid #282930;
  font-size: 11px;
  color: #5c6270;
}
#__vertabs-commandPalette-hints__ kbd {
  background: #2a2b33;
  border: 1px solid #373a40;
  border-radius: 3px;
  padding: 1px 5px;
  font-size: 10px;
  font-family: inherit;
  color: #9ca3af;
  margin-right: 2px;
}
`;

// ── DOM helpers ───────────────────────────────────────────────────────────────

function highlight(text: string, query: string): string {
  if (!query) return esc(text);
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return esc(text);
  return (
    esc(text.slice(0, idx)) +
    `<mark class="__vcp-highlight__">${esc(text.slice(idx, idx + query.length))}</mark>` +
    esc(text.slice(idx + query.length))
  );
}

function faviconEl(favicon: string, kind: ResultKind): string {
  if (kind === "url")     return `<span class="__vcp-url-arrow__">↗</span>`;
  if (kind === "command") return `<span class="__vcp-cmd-icon__">${esc(favicon)}</span>`;
  if (!favicon) {
    const letter = "?";
    return `<span class="__vcp-fav-letter__">${letter}</span>`;
  }
  const letter = domain(favicon)[0]?.toUpperCase() ?? "?";
  return `<img src="${esc(favicon)}" width="16" height="16" class="__vcp-fav-img__" data-letter="${esc(letter)}" alt="" />`;
}

function renderResults(results: Result[], activeIdx: number, query: string): string {
  if (results.length === 0) return "";

  const LABELS: Record<ResultKind, string> = {
    tab: "Open Tabs", shortcut: "Shortcuts", bookmark: "Bookmarks", url: "Navigate", command: "Commands",
  };

  let html = "";
  let lastKind: ResultKind | null = null;

  results.forEach((r, i) => {
    if (r.kind !== lastKind) {
      lastKind = r.kind;
      html += `<div class="__vcp-group-label__">${esc(LABELS[r.kind])}</div>`;
    }
    const active = i === activeIdx ? "__vcp-result-active__" : "";
    html += `
      <div class="__vcp-result__ ${active}" data-idx="${i}">
        <div class="__vcp-result-icon__">${faviconEl(r.favicon, r.kind)}</div>
        <div class="__vcp-result-text__">
          <span class="__vcp-result-title__">${highlight(r.title, query)}</span>
          <span class="__vcp-result-sub__">${highlight(r.subtitle, query)}</span>
        </div>
        <span class="__vcp-badge__">${r.kind}</span>
      </div>`;
  });

  return html;
}

// ── CommandPalette controller ──────────────────────────────────────────────────────

export function createCommandPalette(): { toggle: () => void; destroy: () => void } {
  let backdrop: HTMLDivElement | null = null;
  let results: Result[] = [];
  let activeIdx = -1; // -1 = nothing selected
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  // Inject styles once
  if (!document.getElementById("__vertabs-commandPalette-styles__")) {
    const style = document.createElement("style");
    style.id = "__vertabs-commandPalette-styles__";
    style.textContent = STYLES;
    document.head.appendChild(style);
  }

  function getInput() { return document.getElementById("__vertabs-commandPalette-input__") as HTMLInputElement | null; }
  function getResultsEl() { return document.getElementById("__vertabs-commandPalette-results__"); }

  // Track pointer position to distinguish real mouse moves from keyboard nav
  let pointerX = -999;
  let pointerY = -999;
  let keyboardNavActive = false;

  // Track global mouse position at all times
  function onGlobalMouseMove(e: MouseEvent) {
    pointerX = e.clientX;
    pointerY = e.clientY;
  }

  function setActive(idx: number, fromKeyboard = false) {
    if (fromKeyboard) keyboardNavActive = true;
    activeIdx = idx;
    const resultsEl = getResultsEl();
    if (!resultsEl) return;
    resultsEl.querySelectorAll(".__vcp-result__").forEach((el, i) => {
      el.classList.toggle("__vcp-result-active__", idx >= 0 && i === activeIdx);
    });
    if (fromKeyboard && idx >= 0) {
      const active = resultsEl.querySelector(`[data-idx="${activeIdx}"]`);
      active?.scrollIntoView({ block: "nearest" });
    }
  }

  function activate(r: Result) {
    r.activate();
    close();
  }

  function updateResults(query: string) {
    if (debounceTimer) clearTimeout(debounceTimer);
    activeIdx = -1; // reset to no selection when query changes
    debounceTimer = setTimeout(async () => {
      results = await buildResults(query);
      const resultsEl = getResultsEl();
      if (!resultsEl) return;

      if (results.length === 0) {
        resultsEl.innerHTML = query
          ? `<div id="__vertabs-commandPalette-empty__">No results for "${esc(query)}"</div>`
          : "";
        return;
      }

      resultsEl.innerHTML = renderResults(results, activeIdx, query);

      // Favicon error fallback via event delegation
      resultsEl.querySelectorAll("img.__vcp-fav-img__").forEach((img) => {
        img.addEventListener("error", () => {
          const letter = (img as HTMLImageElement).dataset.letter ?? "?";
          const span = document.createElement("span");
          span.className = "__vcp-fav-letter__";
          span.textContent = letter;
          img.replaceWith(span);
        }, { once: true });
      });

      // Attach click + hover listeners
      resultsEl.querySelectorAll(".__vcp-result__").forEach((el, i) => {
        el.addEventListener("click", () => activate(results[i]));
        el.addEventListener("mousemove", (e: Event) => {
          const me = e as MouseEvent;
          if (keyboardNavActive) {
            // Only hand control back to mouse if it moved significantly
            const dx = me.clientX - pointerX;
            const dy = me.clientY - pointerY;
            if (Math.abs(dx) < 5 && Math.abs(dy) < 5) return;
            keyboardNavActive = false;
          }
          setActive(i);
        });
      });
    }, 80);
  }

  function onKeyDown(e: KeyboardEvent) {
    if (!backdrop) return;

    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); return; }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      keyboardNavActive = true;
      setActive(Math.min(activeIdx < 0 ? 0 : activeIdx + 1, results.length - 1), true);
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      keyboardNavActive = true;
      setActive(Math.max(activeIdx <= 0 ? 0 : activeIdx - 1, 0), true);
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (activeIdx >= 0 && results[activeIdx]) {
        activate(results[activeIdx]);
      } else {
        // No selection — search Google with the typed query
        const q = getInput()?.value.trim();
        if (q) {
          chrome.runtime.sendMessage({
            type: "commandPalette-activate",
            action: "open-url",
            url: `https://www.google.com/search?q=${encodeURIComponent(q)}`,
          });
          close();
        }
      }
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key === "k") {
      e.preventDefault();
      e.stopImmediatePropagation();
      close();
      return;
    }
  }

  function open() {
    if (backdrop) return;

    backdrop = document.createElement("div");
    backdrop.id = "__vertabs-commandPalette-backdrop__";
    backdrop.innerHTML = `
      <div id="__vertabs-commandPalette-panel__">
        <div id="__vertabs-commandPalette-input-wrap__">
          <span id="__vertabs-commandPalette-icon__">🔍</span>
          <input id="__vertabs-commandPalette-input__" placeholder="Search tabs, bookmarks, shortcuts…" autocomplete="off" spellcheck="false" />
        </div>
        <div id="__vertabs-commandPalette-results__"></div>
        <div id="__vertabs-commandPalette-hints__">
          <span><kbd>↑↓</kbd> navigate</span>
          <span><kbd>↵</kbd> open</span>
          <span><kbd>Esc</kbd> close</span>
        </div>
      </div>`;

    document.body.appendChild(backdrop);
    document.body.style.overflow = "hidden";

    // Close on backdrop click (not panel click)
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) close();
    });

    // Input listener
    const input = getInput();
    input?.focus();
    input?.addEventListener("input", (e) => {
      updateResults((e.target as HTMLInputElement).value);
    });
    // Prevent host page keydown handlers from stealing keypresses
    input?.addEventListener("keydown", (e) => {
      e.stopPropagation();
    });

    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("mousemove", onGlobalMouseMove, true);
  }

  function close() {
    backdrop?.remove();
    document.body.style.overflow = "";
    backdrop = null;
    results = [];
    activeIdx = 0;
    document.removeEventListener("keydown", onKeyDown, true);
    document.removeEventListener("mousemove", onGlobalMouseMove, true);
  }

  function toggle() {
    if (backdrop) close(); else open();
  }

  function destroy() {
    close();
    document.getElementById("__vertabs-commandPalette-styles__")?.remove();
  }

  return { toggle, destroy };
}
