// Never let Chrome auto-open the panel on action click — we handle it ourselves.
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: false })
  .catch(() => {});

// Shared toggle logic used by both toolbar click and keyboard shortcut.
function toggleSidebar(tab: chrome.tabs.Tab) {
  chrome.storage.local.get("sidebar-config", (result) => {
    const config = (result["sidebar-config"] as Record<string, unknown>) ?? {};
    const mode = (config.mode as string) ?? "floating";
    if (mode === "panel") {
      if (tab.id != null) chrome.sidePanel.open({ tabId: tab.id }).catch(() => {});
    } else {
      if (tab.id != null) chrome.tabs.sendMessage(tab.id, { type: "toggle-sidebar" });
    }
  });
}

// Toggle sidebar on toolbar click.
chrome.action.onClicked.addListener(toggleSidebar);

// Toggle sidebar on Cmd+Shift+S / Ctrl+Shift+S keyboard shortcut.
chrome.commands.onCommand.addListener((command) => {
  if (command === "toggle-sidebar") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) toggleSidebar(tabs[0]);
    });
  }
});

// Show floating sidebar in every new window automatically (floating mode only).
chrome.windows.onCreated.addListener((win) => {
  if (win.id == null) return;
  chrome.storage.local.get("sidebar-config", (result) => {
    const config = (result["sidebar-config"] as Record<string, unknown>) ?? {};
    const mode = (config.mode as string) ?? "floating";
    if (mode !== "floating") return;

    chrome.tabs.query({ windowId: win.id!, active: true }, (tabs) => {
      const tab = tabs[0];
      if (tab?.id != null) {
        setTimeout(() => {
          chrome.tabs.sendMessage(tab.id!, { type: "show-sidebar" });
        }, 500);
      }
    });
  });
});

// Forward zoom changes to the content script of the affected tab.
chrome.tabs.onZoomChange.addListener((changeInfo) => {
  chrome.tabs.sendMessage(changeInfo.tabId, {
    type: "zoom-change",
    zoomFactor: changeInfo.newZoomFactor,
  }).catch(() => {});
});

// Respond to content script requests.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "get-zoom" && sender.tab?.id != null) {
    chrome.tabs.getZoom(sender.tab.id, (factor) => {
      sendResponse({ zoomFactor: factor });
    });
    return true;
  }

  if (msg.type === "commandPalette-data") {
    const windowId = sender.tab?.windowId;
    const currentTabId = sender.tab?.id;
    Promise.all([
      chrome.tabs.query({ currentWindow: true, windowId }),
      chrome.tabs.query({ pinned: true, currentWindow: true, windowId }),
      chrome.bookmarks.getTree(),
      new Promise<Record<string, string>>((resolve) =>
        chrome.storage.local.get("sidebar-shortcut-urls", (r) =>
          resolve((r["sidebar-shortcut-urls"] as Record<string, string>) ?? {})
        )
      ),
      currentTabId != null ? chrome.tabs.get(currentTabId) : Promise.resolve(null),
    ]).then(([tabs, pinned, bookmarkTree, shortcutUrls, currentTab]) => {
      sendResponse({
        tabs,
        pinned,
        bookmarks: bookmarkTree[0]?.children ?? [],
        shortcutUrls,
        currentTab,
      });
    });
    return true;
  }

  if (msg.type === "commandPalette-activate") {
    const { action, tabId, url, value } = msg;

    if (action === "focus-tab" && tabId != null) {
      chrome.tabs.update(tabId, { active: true });
      if (url) chrome.tabs.update(tabId, { url });
    } else if (action === "open-url" && url) {
      chrome.tabs.create({ url, index: 0 });
    } else if (action === "new-tab") {
      chrome.tabs.create({ index: 0 });
    } else if (action === "close-tab" && tabId != null) {
      chrome.tabs.remove(tabId);
    } else if (action === "duplicate-tab" && tabId != null) {
      chrome.tabs.duplicate(tabId);
    } else if (action === "pin-tab" && tabId != null) {
      chrome.tabs.get(tabId, (t) => chrome.tabs.update(tabId, { pinned: !t.pinned }));
    } else if (action === "add-shortcut" && tabId != null && url) {
      chrome.tabs.create({ url, pinned: true, active: false });
    } else if (action === "add-bookmark" && url) {
      chrome.bookmarks.create({ parentId: "1", title: value || url, url });
    } else if (action === "mute-tab" && tabId != null) {
      chrome.tabs.get(tabId, (t) => chrome.tabs.update(tabId, { muted: !t.mutedInfo?.muted }));
    } else if (action === "zoom-in" && tabId != null) {
      chrome.tabs.getZoom(tabId, (z) => chrome.tabs.setZoom(tabId, Math.min(z + 0.1, 3)));
    } else if (action === "zoom-out" && tabId != null) {
      chrome.tabs.getZoom(tabId, (z) => chrome.tabs.setZoom(tabId, Math.max(z - 0.1, 0.25)));
    } else if (action === "zoom-reset" && tabId != null) {
      chrome.tabs.setZoom(tabId, 0);
    } else if (action === "go-back" && tabId != null) {
      chrome.tabs.goBack(tabId);
    } else if (action === "go-forward" && tabId != null) {
      chrome.tabs.goForward(tabId);
    } else if (action === "reopen-tab") {
      chrome.sessions.restore();
    } else if (action === "next-tab") {
      chrome.tabs.query({ currentWindow: true }, (tabs) => {
        const sorted = tabs.sort((a, b) => a.index - b.index);
        const cur = sorted.findIndex((t) => t.id === tabId);
        const next = sorted[(cur + 1) % sorted.length];
        if (next?.id != null) chrome.tabs.update(next.id, { active: true });
      });
    } else if (action === "prev-tab") {
      chrome.tabs.query({ currentWindow: true }, (tabs) => {
        const sorted = tabs.sort((a, b) => a.index - b.index);
        const cur = sorted.findIndex((t) => t.id === tabId);
        const prev = sorted[(cur - 1 + sorted.length) % sorted.length];
        if (prev?.id != null) chrome.tabs.update(prev.id, { active: true });
      });
    } else if (action === "open-settings") {
      // Handled via postMessage from content to sidepanel iframe
    }
    return false;
  }

  return false;
});

chrome.tabs.onCreated.addListener((tab) => {
  if (tab.id == null) return;
  const isNewTab =
    tab.pendingUrl === "chrome://newtab/" ||
    tab.url === "chrome://newtab/";

  if (!isNewTab) return;

  chrome.storage.local.get("sidebar-config", (result) => {
    const config = (result["sidebar-config"] as Record<string, unknown>) ?? {};
    const newTabUrl = (config.newTabUrl as string) ?? "https://www.google.com";
    chrome.tabs.update(tab.id!, { url: newTabUrl });
  });
});
