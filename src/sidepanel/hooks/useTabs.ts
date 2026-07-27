import { useState, useEffect, useCallback } from "react";

export function useTabs() {
  const [tabs, setTabs] = useState<chrome.tabs.Tab[]>([]);

  const refresh = useCallback(() => {
    chrome.tabs.query({ currentWindow: true }, setTabs);
  }, []);

  useEffect(() => {
    refresh();
    chrome.tabs.onCreated.addListener(refresh);
    chrome.tabs.onRemoved.addListener(refresh);
    chrome.tabs.onUpdated.addListener(refresh);
    chrome.tabs.onActivated.addListener(refresh);
    chrome.tabs.onMoved.addListener(refresh);
    return () => {
      chrome.tabs.onCreated.removeListener(refresh);
      chrome.tabs.onRemoved.removeListener(refresh);
      chrome.tabs.onUpdated.removeListener(refresh);
      chrome.tabs.onActivated.removeListener(refresh);
      chrome.tabs.onMoved.removeListener(refresh);
    };
  }, [refresh]);

  const focusTab = useCallback((tabId: number) => {
    chrome.tabs.update(tabId, { active: true });
  }, []);

  const closeTab = useCallback((tabId: number) => {
    chrome.tabs.remove(tabId, refresh);
  }, [refresh]);

  const moveTab = useCallback((tabId: number, toIndex: number) => {
    chrome.tabs.move(tabId, { index: toIndex });
    // onMoved fires → refresh runs automatically
  }, []);

  return { tabs, focusTab, closeTab, moveTab };
}
