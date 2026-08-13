import { useCallback, useEffect, useState } from "react";
import { storageGet, storageSet } from "../../storage";

export interface SidebarConfig {
  fontSize: number;
  accentColor: string;
  bgColor: string;
  surfaceColor: string;
  textColor: string;
  theme: string; // preset name or "custom"
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
  itemSpacing: number;
  enableCommandPalette: boolean;
}

export const DEFAULT_CONFIG: SidebarConfig = {
  fontSize: 13,
  accentColor: "#7c3aed",
  bgColor: "#16171a",
  surfaceColor: "#22232a",
  textColor: "#eaebed",
  theme: "dark",
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
  itemSpacing: 4,
  enableCommandPalette: true,
};

const STORAGE_KEY = "sidebar-config";

export function useConfig() {
  const [config, setConfigState] = useState<SidebarConfig>(DEFAULT_CONFIG);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    storageGet(STORAGE_KEY, (result) => {
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
      storageSet({ [STORAGE_KEY]: next });
      // Notify content script so it can apply live changes (position, width, delay).
      window.parent.postMessage({ type: "config-update", config: next }, "*");
      return next;
    });
  }, []);

  return { config, update, loaded };
}
