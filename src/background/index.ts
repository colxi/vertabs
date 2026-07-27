// Never let Chrome auto-open the panel on action click — we handle it ourselves.
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: false })
  .catch(() => {});

// Toggle sidebar or open Chrome side panel, depending on configured mode.
chrome.action.onClicked.addListener((tab) => {
  chrome.storage.local.get("sidebar-config", (result) => {
    const config = (result["sidebar-config"] as Record<string, unknown>) ?? {};
    const mode = (config.mode as string) ?? "floating";

    if (mode === "panel") {
      if (tab.id != null) {
        chrome.sidePanel.open({ tabId: tab.id }).catch(() => {});
      }
    } else {
      if (tab.id != null) {
        chrome.tabs.sendMessage(tab.id, { type: "toggle-sidebar" });
      }
    }
  });
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

// Respond to content script requests for the current zoom level.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "get-zoom" && sender.tab?.id != null) {
    chrome.tabs.getZoom(sender.tab.id, (factor) => {
      sendResponse({ zoomFactor: factor });
    });
    return true; // keep channel open for async response
  }
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
