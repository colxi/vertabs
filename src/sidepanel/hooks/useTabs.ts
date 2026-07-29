import { useState, useEffect, useCallback } from "react";

export function useTabs() {
  const [tabs,   setTabs]   = useState<chrome.tabs.Tab[]>([]);
  const [groups, setGroups] = useState<chrome.tabGroups.TabGroup[]>([]);

  const refresh = useCallback(() => {
    chrome.tabs.query({ currentWindow: true }, setTabs);
    // tabGroups API may not exist in all contexts (e.g. during tests)
    if (chrome.tabGroups) {
      chrome.tabGroups.query({ windowId: chrome.windows.WINDOW_ID_CURRENT })
        .then(setGroups)
        .catch(() => {});
    }
  }, []);

  useEffect(() => {
    refresh();

    chrome.tabs.onCreated.addListener(refresh);
    chrome.tabs.onRemoved.addListener(refresh);
    chrome.tabs.onUpdated.addListener(refresh);
    chrome.tabs.onActivated.addListener(refresh);
    chrome.tabs.onMoved.addListener(refresh);

    if (chrome.tabGroups) {
      chrome.tabGroups.onCreated.addListener(refresh);
      chrome.tabGroups.onUpdated.addListener(refresh);
      chrome.tabGroups.onRemoved.addListener(refresh);
    }

    return () => {
      chrome.tabs.onCreated.removeListener(refresh);
      chrome.tabs.onRemoved.removeListener(refresh);
      chrome.tabs.onUpdated.removeListener(refresh);
      chrome.tabs.onActivated.removeListener(refresh);
      chrome.tabs.onMoved.removeListener(refresh);

      if (chrome.tabGroups) {
        chrome.tabGroups.onCreated.removeListener(refresh);
        chrome.tabGroups.onUpdated.removeListener(refresh);
        chrome.tabGroups.onRemoved.removeListener(refresh);
      }
    };
  }, [refresh]);

  const focusTab = useCallback((tabId: number) => {
    chrome.tabs.update(tabId, { active: true });
  }, []);

  const closeTab = useCallback((tabId: number) => {
    chrome.tabs.remove(tabId).then(refresh);
  }, [refresh]);

  const moveTab = useCallback((tabId: number, toIndex: number) => {
    chrome.tabs.move(tabId, { index: toIndex });
  }, []);

  return { tabs, groups, focusTab, closeTab, moveTab };
}
