/**
 * Command Palette injection strategy:
 *
 * - Backdrop: host-page translucent div (Chrome won't make extension iframes transparent)
 * - Iframe: starts at input-only height, grows as React reports its content height via postMessage
 */

const BACKDROP_ID = "__vertabs-cp-backdrop__";
const IFRAME_ID   = "__vertabs-cp-iframe__";

const PANEL_WIDTH    = 680;
const INITIAL_HEIGHT = 102; // input row (62px) + top+bottom padding (40px)
const TOP_OFFSET     = 0.08; // 8vh

export function createCommandPaletteIframe(): { toggle: () => void } {
  if (!document.getElementById("__vertabs-cp-styles__")) {
    const style = document.createElement("style");
    style.id = "__vertabs-cp-styles__";
    style.textContent = `
      #${BACKDROP_ID} {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.25);
        z-index: 2147483646;
        animation: __vcp-fade__ 0.1s ease;
      }
      @keyframes __vcp-fade__ { from{opacity:0} to{opacity:1} }
      #${IFRAME_ID} {
        position: fixed;
        left: 50%;
        transform: translateX(-50%);
        top: ${Math.round(window.innerHeight * TOP_OFFSET)}px;
        width: ${Math.min(PANEL_WIDTH, window.innerWidth - 48)}px;
        height: ${INITIAL_HEIGHT}px;
        border: none;
        z-index: 2147483647;
        overflow: visible;
        transition: height 0.15s cubic-bezier(0.4,0,0.2,1);
        background: transparent;
      }
    `;
    document.head.appendChild(style);
  }

  window.addEventListener("message", (e) => {
    if (e.data?.type === "commandPalette-close") {
      removeAll();
    } else if (e.data?.type === "open-settings") {
      const sidebarIframe = document.getElementById("__sidebar-tabs-root__")
        ?.querySelector("iframe") as HTMLIFrameElement | null;
      sidebarIframe?.contentWindow?.postMessage({ type: "open-settings" }, "*");
    }
  });

  // Resize iframe when React app reports its content height via background script
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "commandPalette-resize" && typeof msg.height === "number") {
      const iframe = document.getElementById(IFRAME_ID) as HTMLIFrameElement | null;
      if (iframe) {
        const maxH = Math.round(window.innerHeight * 0.80);
        iframe.style.height = `${Math.min(msg.height, maxH)}px`;
      }
    }
  });

  function injectAll() {
    if (document.getElementById(BACKDROP_ID)) return;

    document.body.style.overflow = "hidden";

    const backdrop = document.createElement("div");
    backdrop.id = BACKDROP_ID;
    backdrop.addEventListener("click", (e) => {
      // Only close if clicking outside the iframe area
      const iframeEl = document.getElementById(IFRAME_ID);
      if (!iframeEl) { removeAll(); return; }
      const r = iframeEl.getBoundingClientRect();
      const { clientX: x, clientY: y } = e;
      if (x < r.left || x > r.right || y < r.top || y > r.bottom) {
        removeAll();
      }
    });
    document.body.appendChild(backdrop);

    const iframe = document.createElement("iframe");
    iframe.id  = IFRAME_ID;
    iframe.src = chrome.runtime.getURL("src/commandPalette/index.html");
    document.body.appendChild(iframe);

    iframe.addEventListener("load", () => iframe.focus());

    function onKeyDown(ev: KeyboardEvent) {
      if (ev.key === "Escape" || ((ev.metaKey || ev.ctrlKey) && ev.shiftKey && ev.key === "K")) {
        ev.preventDefault();
        ev.stopImmediatePropagation();
        removeAll();
        document.removeEventListener("keydown", onKeyDown, true);
      }
    }
    document.addEventListener("keydown", onKeyDown, true);
  }

  function removeAll() {
    document.getElementById(BACKDROP_ID)?.remove();
    document.getElementById(IFRAME_ID)?.remove();
    document.body.style.overflow = "";
  }

  function toggle() {
    if (document.getElementById(BACKDROP_ID)) removeAll();
    else injectAll();
  }

  return { toggle };
}
