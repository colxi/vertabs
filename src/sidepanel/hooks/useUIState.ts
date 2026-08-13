import { useCallback, useEffect, useRef, useState } from "react";
import { storageGet, storageSet } from "../../storage";

const STORAGE_KEY = "sidebar-ui";
const SAVE_THROTTLE = 300;

export interface SidebarUIState {
  scroll: number;
  bookmarksCollapsed: boolean;
  tabsCollapsed: boolean;
  shortcutsCollapsed: boolean;
  bookmarksQuery: string;
  tabsQuery: string;
  bookmarkSourcesCollapsed: Record<string, boolean>;
}

const DEFAULT_UI_STATE: SidebarUIState = {
  scroll: 0,
  bookmarksCollapsed: false,
  tabsCollapsed: false,
  shortcutsCollapsed: false,
  bookmarksQuery: "",
  tabsQuery: "",
  bookmarkSourcesCollapsed: {},
};

export function useUIState() {
  const [ui, setUIRaw] = useState<SidebarUIState>(DEFAULT_UI_STATE);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestUI  = useRef<SidebarUIState>(DEFAULT_UI_STATE);

  // Load from storage on mount.
  useEffect(() => {
    storageGet(STORAGE_KEY, (result) => {
      const saved = result[STORAGE_KEY] as Partial<SidebarUIState> | undefined;
      if (saved) {
        const merged = { ...DEFAULT_UI_STATE, ...saved };
        setUIRaw(merged);
        latestUI.current = merged;
      }
    });
  }, []);

  // Immediately flush to storage (used on visibilitychange hidden).
  const flushSave = useCallback(() => {
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
    storageSet({ [STORAGE_KEY]: latestUI.current });
  }, []);

  // Save scroll immediately on tab hide.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flushSave();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [flushSave]);

  // Throttled update — keeps latestUI in sync and schedules storage write.
  const update = useCallback((patch: Partial<SidebarUIState>) => {
    setUIRaw((prev) => {
      const next = { ...prev, ...patch };
      latestUI.current = next;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        storageSet({ [STORAGE_KEY]: latestUI.current });
        saveTimer.current = null;
      }, SAVE_THROTTLE);
      return next;
    });
  }, []);

  // Restore from a snapshot (called on sidebar-sync / sidebar-init).
  const restore = useCallback((snapshot: Partial<SidebarUIState>) => {
    setUIRaw((prev) => {
      const next = { ...prev, ...snapshot };
      latestUI.current = next;
      return next;
    });
  }, []);

  return { ui, update, restore, flushSave };
}
