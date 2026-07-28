import { useState, useEffect, useCallback } from "react";
import { Shortcut } from "../utils/shortcuts";

const STORAGE_KEY = "sidebar-shortcut-urls";

// Read the pinned-tab-id → original-url map from storage.
async function loadOriginalUrls(): Promise<Record<string, string>> {
  return new Promise((resolve) => {
    chrome.storage.local.get(STORAGE_KEY, (result) => {
      resolve((result[STORAGE_KEY] as Record<string, string>) ?? {});
    });
  });
}

async function saveOriginalUrls(map: Record<string, string>) {
  await chrome.storage.local.set({ [STORAGE_KEY]: map });
}

function tabToShortcut(tab: chrome.tabs.Tab, originalUrl?: string): Shortcut {
  // url: always the stored original URL — never the live navigated URL.
  // If originalUrl isn't stored yet (race on create), fall back to tab.url
  // which equals the original URL at creation time.
  const url = originalUrl || tab.url || tab.pendingUrl || "";
  let name = tab.title || "";
  if (!name) {
    try { name = new URL(url).hostname; } catch { name = url; }
  }
  return {
    id: String(tab.id),
    name,
    url,
    favIconUrl: tab.favIconUrl || undefined,
  };
}

async function loadPinnedTabs(): Promise<Shortcut[]> {
  const [tabs, originalUrls] = await Promise.all([
    chrome.tabs.query({ pinned: true, currentWindow: true }),
    loadOriginalUrls(),
  ]);
  return tabs.map((tab) => tabToShortcut(tab, originalUrls[String(tab.id)]));
}

export function useShortcuts() {
  const [shortcuts, setShortcuts] = useState<Shortcut[]>([]);

  // ── Initial load ────────────────────────────────────────────────────────────
  useEffect(() => {
    loadPinnedTabs().then(setShortcuts);
  }, []);

  // ── Live sync via tab events ────────────────────────────────────────────────
  useEffect(() => {
    function refresh() {
      loadPinnedTabs().then(setShortcuts);
    }

    // When a tab is removed, clean up its stored original URL.
    async function onRemoved(tabId: number) {
      const originalUrls = await loadOriginalUrls();
      delete originalUrls[String(tabId)];
      await saveOriginalUrls(originalUrls);
      refresh();
    }

    chrome.tabs.onCreated.addListener(refresh);
    chrome.tabs.onRemoved.addListener(onRemoved);
    chrome.tabs.onMoved.addListener(refresh);
    chrome.tabs.onDetached.addListener(refresh);
    chrome.tabs.onAttached.addListener(refresh);
    // onUpdated: only refresh title/favicon, never overwrite original URL.
    chrome.tabs.onUpdated.addListener((_id, _info, tab) => {
      if (tab.pinned) refresh();
    });

    return () => {
      chrome.tabs.onCreated.removeListener(refresh);
      chrome.tabs.onRemoved.removeListener(onRemoved);
      chrome.tabs.onMoved.removeListener(refresh);
      chrome.tabs.onDetached.removeListener(refresh);
      chrome.tabs.onAttached.removeListener(refresh);
    };
  }, []);

  // ── add: create a new pinned tab and store its original URL ─────────────────
  const add = useCallback(async (url: string) => {
    const tab = await chrome.tabs.create({ url, pinned: true });
    if (tab.id != null) {
      // Save the original URL BEFORE refresh() can run so tabToShortcut always
      // finds it, even if onUpdated fires before this completes.
      const originalUrls = await loadOriginalUrls();
      originalUrls[String(tab.id)] = url;
      await saveOriginalUrls(originalUrls);
    }
    // onCreated fires → refresh runs automatically
  }, []);

  // ── remove: close the pinned tab ────────────────────────────────────────────
  const remove = useCallback(async (id: string) => {
    await chrome.tabs.remove(Number(id));
    // onRemoved fires → cleanup + refresh runs automatically
  }, []);

  // ── edit: update the original URL for a shortcut ────────────────────────────
  const edit = useCallback(async (id: string, _name: string, url: string) => {
    const originalUrls = await loadOriginalUrls();
    originalUrls[id] = url;
    await saveOriginalUrls(originalUrls);
    await chrome.tabs.update(Number(id), { url });
    // onUpdated fires → refresh runs automatically
  }, []);

  // ── reorder: move pinned tab to new position ────────────────────────────────
  const reorder = useCallback(async (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;
    const tab = shortcuts[fromIndex];
    if (!tab) return;
    await chrome.tabs.move(Number(tab.id), { index: toIndex });
    // onMoved fires → refresh runs automatically
  }, [shortcuts]);

  return { shortcuts, add, remove, edit, reorder };
}
