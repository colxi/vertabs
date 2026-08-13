import { createCommandPaletteIframe } from "./commandPaletteIframe";

type SidebarState = "expanded" | "compact";
type Position = "left" | "right";

const STORAGE_KEY_STATE  = "sidebar-state";
const STORAGE_KEY_PINNED = "sidebar-pinned";
const STORAGE_KEY_CONFIG = "sidebar-config";
const STORAGE_KEY_UI = "sidebar-ui";

// Returns false when the extension has been reloaded and the context is gone.
function isContextValid(): boolean {
  try { return !!chrome.runtime?.id; }
  catch { return false; }
}

const EDGE_TRIGGER = 8; // px from edge that triggers reveal

chrome.storage.sync.get(
  [STORAGE_KEY_STATE, STORAGE_KEY_PINNED, STORAGE_KEY_CONFIG, STORAGE_KEY_UI],
  (result) => {
    const cfg = (result[STORAGE_KEY_CONFIG] as Record<string, unknown>) ?? {};
    const mode = (cfg.mode as string) ?? "floating";

    // Panel mode: the iframe is handled natively by Chrome — don't inject.
    if (mode === "panel") return;

    const savedState  = (result[STORAGE_KEY_STATE]  as SidebarState) ?? "expanded";
    const savedPinned = (result[STORAGE_KEY_PINNED] as boolean)      ?? true;
    const savedUI     = (result[STORAGE_KEY_UI]     as object)       ?? {};

    initFloatingSidebar(
      savedState,
      savedPinned,
      savedUI,
      (cfg.position  as Position) ?? "left",
      (cfg.sidebarWidth  as number) ?? 340,
      (cfg.autoHideDelay as number) ?? 400,
      (cfg.enableCommandPalette as boolean) ?? true,
    );
  }
);

// ── Floating sidebar setup ────────────────────────────────────────────────────

function initFloatingSidebar(
  savedState: SidebarState,
  savedPinned: boolean,
  savedUI: object,
  initPosition: Position,
  initWidth: number,
  initDelay: number,
  initPaletteEnabled: boolean,
) {
  // ── Mutable config ──────────────────────────────────────────────────────────
  let position: Position = initPosition;
  let expandedWidth      = initWidth;
  let hideDelay          = initDelay;
  let paletteEnabled     = initPaletteEnabled;

  const COMPACT_WIDTH = 56;

  function currentWidth() {
    return sidebarState === "compact" ? COMPACT_WIDTH : expandedWidth;
  }

  // ── Container + iframe ─────────────────────────────────────────────────────

  const container = document.createElement("div");
  container.id = "__sidebar-tabs-root__";
  Object.assign(container.style, {
    position:   "fixed",
    top:        "0",
    height:     "100vh",
    zIndex:     "2147483647",
    borderRight: "1px solid #373a40",
    background: "#1a1b1e",
    boxShadow:  "4px 0 24px rgba(0,0,0,0.4)",
    transition: "width 0.22s cubic-bezier(0.4,0,0.2,1), transform 0.28s cubic-bezier(0.4,0,0.2,1)",
    transform:  "translateX(0)",
  });

  const iframe = document.createElement("iframe");
  iframe.src = chrome.runtime.getURL("src/sidepanel/index.html");
  Object.assign(iframe.style, { width: "100%", height: "100%", border: "none", display: "block" });
  container.appendChild(iframe);

  // ── Resize handle ───────────────────────────────────────────────────────────
  const resizeHandle = document.createElement("div");
  Object.assign(resizeHandle.style, {
    position:  "absolute",
    top:       "0",
    width:     "6px",
    height:    "100%",
    cursor:    "ew-resize",
    zIndex:    "1",
    // Visual feedback stripe (subtle, matches border colour)
    background: "transparent",
    transition: "background 0.15s",
  });
  resizeHandle.addEventListener("mouseenter", () => {
    resizeHandle.style.background = "rgba(124,58,237,0.25)";
  });
  resizeHandle.addEventListener("mouseleave", () => {
    resizeHandle.style.background = "transparent";
  });
  container.appendChild(resizeHandle);

  document.documentElement.appendChild(container);

  // ── Internal state ──────────────────────────────────────────────────────────

  let sidebarState: SidebarState = savedState;
  let pinned      = savedPinned;
  let revealed    = savedPinned; // start hidden if not pinned — no flash on new tabs
  let hideTimer: ReturnType<typeof setTimeout> | null = null;
  // Grace period after reveal: suppresses scheduleHide triggered by the
  // sidebar-pin echo that React sends right after receiving sidebar-sync.
  let graceTimer: ReturnType<typeof setTimeout> | null = null;
  let inGrace = false;

  // Apply initial position immediately.
  setContainerPosition(position);
  container.style.width = `${currentWidth()}px`;

  // If not pinned, hide instantly (no transition) so there's no visible flash on new tabs.
  if (!savedPinned) {
    container.style.transition = "none";
    container.style.transform  = hideTransform();
    requestAnimationFrame(() => {
      container.style.transition =
        "width 0.22s cubic-bezier(0.4,0,0.2,1), transform 0.28s cubic-bezier(0.4,0,0.2,1)";
    });
  }

  // ── Zoom compensation ───────────────────────────────────────────────────────

  function applyZoom(factor: number) {
    const inverse = factor > 0 ? 1 / factor : 1;
    container.style.zoom = String(inverse);
    container.style.height = `${100 * factor}vh`;
  }

  // chrome.tabs.getZoom() is background-only — ask the background for it.
  chrome.runtime.sendMessage({ type: "get-zoom" }, (res) => {
    if (res?.zoomFactor) applyZoom(res.zoomFactor);
  });

  // ── Position helpers ────────────────────────────────────────────────────────

  function setContainerPosition(pos: Position) {
    if (pos === "left") {
      container.style.left  = "0";
      container.style.right = "";
      container.style.borderRight = "1px solid #373a40";
      container.style.borderLeft  = "";
      container.style.boxShadow   = "4px 0 24px rgba(0,0,0,0.4)";
      // Handle sits on the right edge
      resizeHandle.style.right = "0";
      resizeHandle.style.left  = "";
    } else {
      container.style.right = "0";
      container.style.left  = "";
      container.style.borderLeft  = "1px solid #373a40";
      container.style.borderRight = "";
      container.style.boxShadow   = "-4px 0 24px rgba(0,0,0,0.4)";
      // Handle sits on the left edge
      resizeHandle.style.left  = "0";
      resizeHandle.style.right = "";
    }
  }

  // ── Resize drag ─────────────────────────────────────────────────────────────

  const MIN_WIDTH = 200;
  const MAX_WIDTH = 600;

  resizeHandle.addEventListener("mousedown", (e) => {
    e.preventDefault();
    const startX     = e.clientX;
    const startWidth = expandedWidth;

    // Disable iframe pointer events and transition during drag.
    iframe.style.pointerEvents = "none";
    container.style.transition = "none";

    function onMouseMove(ev: MouseEvent) {
      const delta = position === "left"
        ? ev.clientX - startX
        : startX - ev.clientX;
      const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth + delta));
      expandedWidth = newWidth;
      if (sidebarState === "expanded") container.style.width = `${newWidth}px`;
    }

    function onMouseUp() {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup",   onMouseUp);
      iframe.style.pointerEvents = "";
      container.style.transition =
        "width 0.22s cubic-bezier(0.4,0,0.2,1), transform 0.28s cubic-bezier(0.4,0,0.2,1)";
      // Persist new width.
      if (isContextValid()) {
        chrome.storage.sync.get("sidebar-config", (result) => {
          const cfg = (result["sidebar-config"] as Record<string, unknown>) ?? {};
          chrome.storage.sync.set({ "sidebar-config": { ...cfg, sidebarWidth: expandedWidth } });
        });
      }
    }

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup",   onMouseUp);
  });

  function hideTransform() {
    return position === "left" ? "translateX(-100%)" : "translateX(100%)";
  }

  // ── Slide in / out ──────────────────────────────────────────────────────────

  function reveal() {
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
    if (revealed) return;
    revealed = true;
    container.style.transform = "translateX(0)";
    // Start grace period so the React pin-echo doesn't immediately re-hide.
    inGrace = true;
    if (graceTimer) clearTimeout(graceTimer);
    graceTimer = setTimeout(() => { inGrace = false; graceTimer = null; }, 800);
  }

  function hide() {
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
    revealed = false;
    container.style.transform = hideTransform();
  }

  function toggleVisibility() {
    if (revealed) hide(); else reveal();
  }

  function scheduleHide() {
    if (pinned || !revealed) return;
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      revealed = false;
      container.style.transform = hideTransform();
      hideTimer = null;
    }, hideDelay);
  }

  function cancelHide() {
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
  }

  // ── Apply state / pin ───────────────────────────────────────────────────────

  function applyState(state: SidebarState, shouldReveal = true) {
    sidebarState = state;
    container.style.width = `${currentWidth()}px`;
    if (shouldReveal) reveal();
    if (!isContextValid()) return;
    chrome.storage.sync.set({ [STORAGE_KEY_STATE]: state });
  }

  function applyPin(isPinned: boolean) {
    pinned = isPinned;
    if (pinned) { cancelHide(); reveal(); }
    else if (!inGrace) { scheduleHide(); }
    if (!isContextValid()) return;
    chrome.storage.sync.set({ [STORAGE_KEY_PINNED]: isPinned });
  }

  // ── Mouse / edge detection ──────────────────────────────────────────────────

  document.addEventListener("mousemove", (e) => {
    if (pinned) return;

    const atEdge = position === "left"
      ? e.clientX < EDGE_TRIGGER
      : e.clientX > window.innerWidth - EDGE_TRIGGER;

    const pastSidebar = position === "left"
      ? e.clientX > currentWidth() + 20
      : e.clientX < window.innerWidth - currentWidth() - 20;

    if (atEdge && !revealed) {
      reveal();
      iframe.contentWindow?.postMessage({ type: "sidebar-reveal" }, "*");
      return;
    }
    if (revealed && pastSidebar) scheduleHide();
  });

  // ── Messages from React app ─────────────────────────────────────────────────

  window.addEventListener("message", (e) => {
    if (e.source !== iframe.contentWindow) return;

    switch (e.data?.type) {
      case "sidebar-state":
        applyState(e.data.state as SidebarState);
        break;
      case "sidebar-pin":
        applyPin(e.data.pinned as boolean);
        break;
      case "sidebar-mouseenter":
        cancelHide();
        break;
      case "sidebar-mouseleave":
        scheduleHide();
        break;
      case "config-update": {
        const c = e.data.config as Record<string, unknown>;
        if (c.position && c.position !== position) {
          position = c.position as Position;
          setContainerPosition(position);
          // Re-apply hide transform direction if currently hidden.
          if (!revealed) container.style.transform = hideTransform();
        }
        if (typeof c.sidebarWidth === "number") {
          expandedWidth = c.sidebarWidth;
          if (sidebarState === "expanded") container.style.width = `${expandedWidth}px`;
        }
        if (typeof c.autoHideDelay === "number") {
          hideDelay = c.autoHideDelay;
        }
        if (typeof c.enableCommandPalette === "boolean") {
          paletteEnabled = c.enableCommandPalette;
        }
        // Mode change: requires page reload — show a notice via the iframe.
        if (c.mode && c.mode !== "floating") {
          iframe.contentWindow?.postMessage({ type: "mode-changed", mode: c.mode }, "*");
        }
        break;
      }
    }
  });

  // ── Toolbar button ──────────────────────────────────────────────────────────

  chrome.runtime.onMessage.addListener((msg) => {
    if (!isContextValid()) return;
    if (msg.type === "toggle-sidebar") {
      toggleVisibility();
    } else if (msg.type === "toggle-command-palette") {
      if (paletteEnabled) commandPalette.toggle();
    } else if (msg.type === "zoom-change") {
      applyZoom(msg.zoomFactor as number);
    }
  });

  // ── Cross-tab sync on visibility change ────────────────────────────────────

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    if (!isContextValid()) return;
    chrome.storage.sync.get(
      [STORAGE_KEY_STATE, STORAGE_KEY_PINNED, STORAGE_KEY_UI],
      (result) => {
        const s  = (result[STORAGE_KEY_STATE]  as SidebarState) ?? sidebarState;
        const p  = (result[STORAGE_KEY_PINNED] as boolean)      ?? pinned;
        const ui = (result[STORAGE_KEY_UI]     as object)       ?? {};
        pinned = p;
        applyState(s, p); // only reveal on focus if pinned
        iframe.contentWindow?.postMessage(
          { type: "sidebar-sync", state: s, pinned: p, ui },
          "*"
        );
      }
    );
  });

  // ── Init: send state to React app once iframe loads ─────────────────────────

  applyState(savedState, savedPinned);

  iframe.addEventListener("load", () => {
    iframe.contentWindow?.postMessage(
      {
        type:   "sidebar-init",
        state:  savedState,
        pinned: savedPinned,
        ui:     savedUI,
      },
      "*"
    );
  });

  // ── Shift+Cmd+K / Shift+Ctrl+K → open Command Palette ───────────────────────
  const commandPalette = createCommandPaletteIframe();
  document.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "K") {
      e.preventDefault();
      if (paletteEnabled) commandPalette.toggle();
    }
  });
}
