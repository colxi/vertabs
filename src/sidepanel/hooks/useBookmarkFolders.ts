import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "sidebar-bookmarks-open";

/**
 * Persists which bookmark folder IDs are open.
 * On first load defaults to all first-level folders being open.
 */
export function useBookmarkFolders(
  roots: chrome.bookmarks.BookmarkTreeNode[]
) {
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);

  // Load from storage once roots are available.
  useEffect(() => {
    if (loaded || roots.length === 0) return;
    chrome.storage.local.get(STORAGE_KEY, (result) => {
      if (result[STORAGE_KEY]) {
        setOpenIds(new Set(result[STORAGE_KEY] as string[]));
      } else {
        // Default: open all first-level folders.
        const firstLevel = roots
          .flatMap((r) => r.children ?? [])
          .filter((n) => n.children)
          .map((n) => n.id);
        setOpenIds(new Set(firstLevel));
      }
      setLoaded(true);
    });
  }, [roots, loaded]);

  // Persist whenever openIds changes (after initial load).
  useEffect(() => {
    if (!loaded) return;
    chrome.storage.local.set({ [STORAGE_KEY]: [...openIds] });
  }, [openIds, loaded]);

  const isOpen = useCallback(
    (id: string) => openIds.has(id),
    [openIds]
  );

  const toggle = useCallback((id: string) => {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  /** Called on sidebar-sync: replace open set from storage. */
  const sync = useCallback(() => {
    chrome.storage.local.get(STORAGE_KEY, (result) => {
      if (result[STORAGE_KEY]) {
        setOpenIds(new Set(result[STORAGE_KEY] as string[]));
      }
    });
  }, []);

  return { isOpen, toggle, sync };
}
