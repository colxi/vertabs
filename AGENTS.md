# Vertabs

A Chrome MV3 extension that adds a persistent sidebar to every page. The sidebar shows pinned-tab shortcuts, bookmarks, and open tabs. It supports two display modes (floating iframe overlay and Chrome native Side Panel) and is fully configurable via an in-sidebar settings overlay. A full-viewport Command Palette (`Cmd+K`) provides quick search and actions across tabs, bookmarks, shortcuts, and built-in browser commands.

# Coding instructions

- After every iteration run the tests to validate everything works as expected
- After every iteration perform a build
- when opening a new PR, add to the changelog with a short description of the changes made, with multiple bullet points if necessary. For each entry use : feat, fix, refactor, chore, or docs to indicate the type of change. For example:

---

## Tech stack

| Concern        | Choice                                                                     |
| -------------- | -------------------------------------------------------------------------- |
| Build          | Vite 5, `pnpm`                                                             |
| UI             | React 18, TypeScript, CSS Modules                                          |
| Extension APIs | MV3 — `tabs`, `bookmarks`, `storage`, `sidePanel`, `tabGroups`, `sessions` |
| Design         | Dark theme, accent `#7c3aed` (purple)                                      |

Build command: `pnpm build` → runs `vite build && cp -r public/. dist/`
Dev (watch): `pnpm dev`
Load unpacked from `dist/` in `chrome://extensions`.

---

## Architecture

Four compiled entry points, all output to `dist/`:

```
src/
  background/index.ts      → dist/background.js         (service worker)
  content/index.ts         → dist/content.js            (injected into every page)
  sidepanel/               → dist/sidepanel.js/.css     (React app — sidebar)
  commandPalette/          → dist/commandPalette.js/.css (React app — command palette)
public/
  manifest.json
  icons/
```

### Why two React apps?

The extension has two display modes for the sidebar: **floating** (an iframe injected by the content script) and **panel** (Chrome's native Side Panel API). In both modes, the sidebar React app runs inside an iframe that is constrained to the sidebar's width and positioned at the screen edge.

The Command Palette needs to render as a **full-viewport overlay** centered on the page — not inside the narrow sidebar iframe. There are two options:

1. **Resize the sidebar iframe** to fill the viewport when the palette opens — rejected because it causes visual glitching, breaks the panel mode entirely (Chrome controls the panel iframe, not us), and requires complex CSS hacks.
2. **Inject a second independent iframe** that covers the full viewport — this is what we do. The content script injects a `position:fixed; inset:0; width:100vw; height:100vh` iframe pointing to a separate React app (`commandPalette/index.html`) when `Cmd+K` is pressed, and removes it on close.

The command palette iframe is an extension page so it has full access to all Chrome APIs (`chrome.runtime.sendMessage`, `chrome.tabs`, etc.) just like the sidebar. It communicates with the content script via `window.parent.postMessage` only for close/settings signals.

### background.js

Service worker. Handles toolbar clicks, keyboard shortcuts, and messages from content scripts:

- **toolbar click / `Cmd+E`** → sends `{ type: "toggle-sidebar" }` to the active tab's content script (floating mode) or calls `chrome.sidePanel.open` (panel mode)
- **`commandPalette-data`** message → fetches tabs, bookmarks, shortcuts, current tab and returns them to the palette
- **`commandPalette-activate`** message → executes actions (focus tab, open URL, zoom, mute, duplicate, etc.) that require elevated Chrome API access

Also listens to `chrome.windows.onCreated` and, in floating mode, sends `{ type: "show-sidebar" }` to the first tab after a 500 ms delay.

`openPanelOnActionClick` is always `false`; the service worker handles opening manually.

### content.js

Injected into every page (`run_at: document_end`). In **panel mode** it does nothing (exits early after reading config). In **floating mode** it:

1. Creates a `div#__sidebar-tabs-root__` fixed to the left or right edge, containing an `<iframe>` that loads `src/sidepanel/index.html`.
2. Manages reveal/hide transitions via CSS `transform: translateX(±100%)`.
3. Listens to `mousemove` — reveals the sidebar when the cursor comes within 8 px of the edge; schedules hide when the cursor moves more than 20 px past the sidebar.
4. Handles `postMessage` events from the React iframe (`sidebar-state`, `sidebar-pin`, `sidebar-mouseenter`, `sidebar-mouseleave`, `config-update`).
5. Handles `chrome.runtime.onMessage` for `toggle-sidebar` / `show-sidebar` from the service worker.
6. Listens to `document.visibilitychange` — when the tab becomes visible (user switches back to it), reads state/pinned/scroll from storage and sends `sidebar-sync` to the iframe.
7. Injects/removes the Command Palette iframe (`src/content/commandPaletteIframe.ts`) on `Cmd+K`.

**Grace period:** after a `reveal()` call, `inGrace = true` for 800 ms. During this window, `applyPin(false)` will not call `scheduleHide()`. This prevents a feedback loop where tab-switching triggers `visibilitychange → reveal → sidebar-sync → React sets pinned=false → scheduleHide()` which would immediately re-hide the sidebar on tab focus.

**Storage keys used by content.js:**

| Key              | Type                     | Description                  |
| ---------------- | ------------------------ | ---------------------------- |
| `sidebar-state`  | `"expanded" , "compact"` | Current sidebar state        |
| `sidebar-pinned` | `boolean`                | Whether sidebar is pinned    |
| `sidebar-config` | `SidebarConfig`          | Full config object           |
| `sidebar-scroll` | `number`                 | Scroll position of main page |

### sidepanel (React app)

Runs inside the `<iframe>` (floating mode) or the Chrome native side panel (panel mode). Communicates with the content script via `window.parent.postMessage`.

**postMessage protocol (iframe → parent):**

| Message                             | Trigger                       |
| ----------------------------------- | ----------------------------- |
| `{ type: "sidebar-state", state }`  | State toggle (expand/compact) |
| `{ type: "sidebar-pin", pinned }`   | Pin button clicked            |
| `{ type: "sidebar-mouseenter" }`    | Mouse enters iframe           |
| `{ type: "sidebar-mouseleave" }`    | Mouse leaves iframe           |
| `{ type: "config-update", config }` | Any config change             |

**postMessage protocol (parent → iframe):**

| Message                                           | When                                     |
| ------------------------------------------------- | ---------------------------------------- |
| `{ type: "sidebar-init", state, pinned, scroll }` | iframe `load` event                      |
| `{ type: "sidebar-sync", state, pinned, scroll }` | Tab becomes visible                      |
| `{ type: "sidebar-reveal" }`                      | Edge hover triggers reveal               |
| `{ type: "mode-changed", mode }`                  | Mode changed in config (requires reload) |
| `{ type: "open-settings" }`                       | Command Palette "Open Settings" command  |

### commandPalette (React app)

Runs inside a **full-viewport iframe** injected by `content/commandPaletteIframe.ts` when `Cmd+K` is pressed. Removed from the DOM on close.

- Calls `chrome.runtime.sendMessage({ type: "commandPalette-data" })` on mount to fetch tabs, bookmarks, shortcuts, and current tab info from the background
- Calls `chrome.runtime.sendMessage({ type: "commandPalette-activate", action, ... })` to execute actions
- Sends `{ type: "commandPalette-close" }` to `window.parent` to remove itself
- Sends `{ type: "open-settings" }` to `window.parent` which the content script forwards to the sidebar iframe

---

## Sidebar modes

### Floating mode (default)

The sidebar is a fixed-position iframe injected by the content script. It slides in/out via CSS `transform`. The toolbar shows a **fold «/»** button and a **pin 📌** button.

- **Pinned:** sidebar stays visible permanently; no auto-hide.
- **Unpinned:** sidebar auto-hides after `autoHideDelay` ms when the mouse leaves. Hovering within 8 px of the screen edge reveals it again.

### Panel mode

Uses the Chrome native Side Panel API (`chrome.sidePanel`). The toolbar fold/pin buttons are hidden. The content script does not inject the iframe. Opening/closing is handled by Chrome's panel UI. Switching modes requires a page reload (notice shown in Config).

---

## Sidebar states

- **Expanded:** full-width sidebar showing all sections.
- **Compact:** narrow (56 px) icon-only strip showing `CompactShortcuts`.

State persists in `chrome.storage.local` under `sidebar-state`.

---

## Sections

### Shortcuts (pinned tabs)

Shortcuts are backed by Chrome's **pinned tabs** — there is no separate shortcuts storage.

- `useShortcuts` calls `chrome.tabs.query({ pinned: true, currentWindow: true })` to get the list.
- It listens to `onCreated`, `onRemoved`, `onUpdated`, `onMoved`, `onDetached`, `onAttached` to keep the list live.
- **Add** → `chrome.tabs.create({ url, pinned: true })`. The original URL is immediately written to `sidebar-shortcut-urls` in `chrome.storage.local` keyed by tab ID.
- **Remove** → `chrome.tabs.remove(tabId)` — closes the pinned tab. The storage entry is also deleted via `onRemoved`.
- **Click** → reads the original URL from `sidebar-shortcut-urls` storage, then calls `chrome.tabs.update(tabId, { active: true, url: originalUrl })` — **always navigates back to the defined URL**, regardless of where the tab currently is. If no storage entry exists (e.g. pre-existing pinned tab), the current `shortcut.url` is backfilled into storage on first click and used from then on.
- **Reorder** → `chrome.tabs.move(tabId, { index: toIndex })`.
- **Name** is derived from `tab.title` (auto-updates as the page loads). Fallback: URL hostname derived from the original URL.
- **Favicon** uses `tab.favIconUrl` from the Chrome tab object (more reliable than `/favicon.ico`). Falls back to `https://${hostname}/favicon.ico`.
- In **compact mode**, shortcuts are shown as icon-only buttons (`CompactShortcuts`).
- Drag-and-drop reordering is supported in both the main grid and the Config shortcuts list.

**Original URL storage contract (`sidebar-shortcut-urls`):**

| Situation                         | Behaviour                                                                                                                 |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Shortcut added via `add(url)`     | `url` written to storage under the new tab ID immediately after `chrome.tabs.create` resolves                             |
| Tab navigates away after creation | Storage entry unchanged — original URL is preserved                                                                       |
| Shortcut clicked                  | Original URL read from storage; tab navigated back to it                                                                  |
| No storage entry found on click   | Current `shortcut.url` (React state) written to storage as the original, then used for navigation — self-healing backfill |
| Shortcut URL edited via Config    | Storage entry updated to the new URL; tab navigated to new URL                                                            |
| Shortcut removed                  | Storage entry deleted                                                                                                     |

> **Never** use `tab.url` (the live tab URL) as the shortcut URL after creation — it reflects the user's current navigation and will diverge from the defined shortcut URL.

### Bookmarks

Read from the Chrome bookmarks API (`useBookmarks`, `useBookmarkFolders`).

- Displays a collapsible folder tree. Folder open/closed state is tracked in React state and synced across tabs via `sidebar-sync`.
- When a search query is entered, switches to a **flat results view** (`collectMatches` recurses the tree). Matched substrings are highlighted with the `Highlight` component.
- Links open in a new tab or current tab based on `openLinksInNewTab` config.
- Favicon: `https://${hostname}/favicon.ico` with a letter-avatar fallback (`Favicon` component — coloured by the first letter of the hostname; renders on `onError`).
- Full bookmark CRUD (create/rename/delete folders and bookmarks, drag reorder) is available in the Config → Bookmarks section (`BookmarksManager`).

### Open tabs

`useTabs` calls `chrome.windows.getAll({ populate: true })` and refreshes on `onCreated`, `onRemoved`, `onUpdated`, `onActivated`, `onMoved`.

- Tabs are grouped by window with a window label.
- The active tab is highlighted.
- Clicking a tab calls `chrome.tabs.update(tabId, { active: true })` + `chrome.windows.update(windowId, { focused: true })`.
- Each tab has a close button (`chrome.tabs.remove`).
- Search filters by title/URL.

---

## Config (Settings overlay)

The Settings page is a slide-in panel (not a new page). Gear icon `⚙` in the toolbar pushes the main page off-screen to the left (`translateX(-100%)`) and slides the config page in from the right.

Config is stored in `chrome.storage.local` under `sidebar-config`. Defaults:

```ts
{
  fontSize: 13,          // 12–18 px; all CSS uses rem so this scales everything
  accentColor: "#7c3aed",
  sidebarWidth: 340,     // 260–520 px; floating mode only
  autoHideDelay: 400,    // 0–2000 ms; 0 = hide instantly
  mode: "floating",      // "floating" | "panel"
  position: "left",      // "left" | "right"
  startupState: "remember", // "expanded" | "compact" | "remember"
  showShortcuts: true,
  showBookmarks: true,
  showTabs: true,
  openLinksInNewTab: true,
}
```

Config changes are applied live without reload, except **mode changes** which require a page reload. When mode changes, the content script receives `mode-changed` and the React app shows a reload notice.

**Font size** is applied as `--font-size-base` on `:root`. All component CSS uses `rem` units so the entire UI scales proportionally.

**Accent color** is applied as `--accent` on `:root`.

**Position / width / autoHideDelay** are forwarded to the content script via `config-update` postMessage and take effect immediately.

---

## Scroll persistence

The scroll position of the main sidebar page is:

- Saved to `chrome.storage.local` under `sidebar-scroll` (throttled, every 500 ms) by reading `mainPageRef.current.scrollTop`.
- Restored on `sidebar-init` and `sidebar-sync` via `mainPageRef.current.scrollTop = scroll` inside a `requestAnimationFrame`.

The scroll container is the `.page` div (`position: absolute; height: 100vh; overflow-y: auto`), **not** `window`. The `.root` div has `overflow: hidden` to clip the sliding pages.

---

## CSS layout rules (critical — do not break)

- `.root { height: 100vh; overflow: hidden }` — clips the two absolutely-positioned pages.
- `.page { position: absolute; height: 100vh; overflow-y: auto }` — each page scrolls independently.
- `html, body, #root { height: 100% }` — needed for the root div to fill the iframe.
- **Never** set `overflow: hidden` on `body` or `#root` — causes a black clipping rectangle.
- **Never** use `zoom` on `.root` or any ancestor of a scroll container — breaks scroll.
- **Never** use `height: 100%` on absolutely positioned children (resolves to 0); use `100vh`.
- All `font-size` values in CSS modules use `rem`, not `px`, so they scale with `--font-size-base`.

---

## File reference

```
src/
  background/
    index.ts                    Service worker: toolbar click routing, new window handling
  content/
    index.ts                    Floating sidebar injection, show/hide, postMessage bridge
    commandPaletteIframe.ts     Injects/removes the Command Palette full-viewport iframe
  sidepanel/
    main.tsx                    React entry point
    App.tsx                     Root component: state, scroll, postMessage wiring
    App.module.css              Root layout: .root, .page, .toolbar, .toolBtn
    index.html                  Sidepanel HTML shell
    styles/
      globals.css               CSS variables, reset, body/html height
    components/
      Shortcuts.tsx             Shortcut grid + add modal (URL only)
      CompactShortcuts.tsx      Icon-only shortcuts for compact mode
      Bookmarks.tsx             Bookmark tree + flat search results
      BookmarksManager.tsx      Full CRUD bookmark editor (used in Config)
      Tabs.tsx                  Open-tabs list grouped by window
      Config.tsx                Settings overlay with all sections
      Spotlight.tsx             (removed — replaced by commandPalette React app)
    hooks/
      useShortcuts.ts           Pinned tabs → Shortcut[], CRUD via chrome.tabs
      useBookmarks.ts           chrome.bookmarks tree
      useBookmarkFolders.ts     Folder open/closed state
      useTabs.ts                All windows + tabs, live via tab events
      useConfig.ts              SidebarConfig read/write, postMessage on change
    utils/
      shortcuts.ts              Shortcut type definition
      favicon.ts                faviconUrl() helper
  commandPalette/
    main.tsx                    React entry point
    App.tsx                     Root component: search, results, keyboard nav, commands
    App.module.css              Full-viewport overlay styles
    index.html                  Command Palette HTML shell
public/
  manifest.json
  icons/
```

---

## Known constraints and pitfalls

- **Mode switch requires page reload.** The content script reads mode once at `document_end` and exits early for panel mode. There is no hot-switch.
- **Tab-switch hide bug (fixed).** `visibilitychange` → reveal → `sidebar-sync` → React `pinned=false` useEffect → `sidebar-pin: false` postMessage → `applyPin(false)` → `scheduleHide()`. Fixed with `inGrace` flag: 800 ms grace window after `reveal()` suppresses `scheduleHide()` in `applyPin(false)`.
- **Shortcuts = pinned tabs.** Adding a shortcut opens a real pinned tab in the current window. Removing it closes that tab. The order in the sidebar reflects pinned tab order in the window.
- **Favicon reliability.** `tab.favIconUrl` is used for shortcuts (reliable, provided by Chrome). For bookmarks/tabs, `https://${hostname}/favicon.ico` is used with a letter-avatar fallback. Google's `s2/favicons` API was abandoned — it returns a 200 generic placeholder for unknown domains, making `onError` detection unreliable.
- **TypeScript strict mode is not enabled.** `tsc --noEmit` reports pre-existing errors (CSS module types, unused React imports, `chrome.bookmarks.CreateDetails`). Vite builds cleanly regardless.
