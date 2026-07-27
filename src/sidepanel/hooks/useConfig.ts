import { useCallback, useEffect, useState } from "react";

export interface SidebarConfig {
  fontSize: number;
  accentColor: string;
  sidebarWidth: number;
  autoHideDelay: number;
  mode: "floating" | "panel";
  position: "left" | "right";
  startupState: "expanded" | "compact" | "remember";
  showShortcuts: boolean;
  showBookmarks: boolean;
  showBookmarksBar: boolean;
  showOtherBookmarks: boolean;
  showTabs: boolean;
  openLinksInNewTab: boolean;
  newTabUrl: string;
}

export const DEFAULT_CONFIG: SidebarConfig = {
  fontSize: 13,
  accentColor: "#7c3aed",
  sidebarWidth: 340,
  autoHideDelay: 400,
  mode: "floating",
  position: "left",
  startupState: "remember",
  showShortcuts: true,
  showBookmarks: true,
  showBookmarksBar: true,
  showOtherBookmarks: true,
  showTabs: true,
  openLinksInNewTab: true,
  newTabUrl: "https://www.google.com",
};

const STORAGE_KEY = "sidebar-config";

export function useConfig() {
  const [config, setConfigState] = useState<SidebarConfig>(DEFAULT_CONFIG);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    chrome.storage.local.get(STORAGE_KEY, (result) => {
      if (result[STORAGE_KEY]) {
        setConfigState({
          ...DEFAULT_CONFIG,
          ...(result[STORAGE_KEY] as Partial<SidebarConfig>),
        });
      }
      setLoaded(true);
    });
  }, []);

  const update = useCallback((updates: Partial<SidebarConfig>) => {
    setConfigState((prev) => {
      const next = { ...prev, ...updates };
      chrome.storage.local.set({ [STORAGE_KEY]: next });
      // Notify content script so it can apply live changes (position, width, delay).
      window.parent.postMessage({ type: "config-update", config: next }, "*");
      return next;
    });
  }, []);

  return { config, update, loaded };
}
