import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useUIState, SidebarUIState } from "./useUIState";

const DEFAULT: SidebarUIState = {
  scroll: 0,
  bookmarksCollapsed: false,
  tabsCollapsed: false,
  shortcutsCollapsed: false,
  bookmarksQuery: "",
  tabsQuery: "",
  bookmarkSourcesCollapsed: {},
};

describe("useUIState", () => {
  it("initialises with default state", () => {
    const { result } = renderHook(() => useUIState());
    expect(result.current.ui).toEqual(DEFAULT);
  });

  it("merges persisted state from storage on mount", async () => {
    chrome.storage.local.get = vi.fn((_keys, cb) =>
      cb({ "sidebar-ui": { scroll: 200, bookmarksCollapsed: true } })
    );

    const { result } = renderHook(() => useUIState());
    await act(async () => {});

    expect(result.current.ui.scroll).toBe(200);
    expect(result.current.ui.bookmarksCollapsed).toBe(true);
    // Unset fields keep defaults.
    expect(result.current.ui.tabsCollapsed).toBe(false);
  });

  it("update() applies a partial patch", async () => {
    const { result } = renderHook(() => useUIState());

    act(() => {
      result.current.update({ tabsCollapsed: true, tabsQuery: "github" });
    });

    expect(result.current.ui.tabsCollapsed).toBe(true);
    expect(result.current.ui.tabsQuery).toBe("github");
    expect(result.current.ui.bookmarksCollapsed).toBe(false); // untouched
  });

  it("update() schedules a storage write", async () => {
    vi.useFakeTimers();
    const setSpy = vi.spyOn(chrome.storage.local, "set");
    const { result } = renderHook(() => useUIState());

    act(() => {
      result.current.update({ scroll: 99 });
    });

    // Before throttle timeout – not yet written.
    expect(setSpy).not.toHaveBeenCalledWith(
      expect.objectContaining({ "sidebar-ui": expect.objectContaining({ scroll: 99 }) })
    );

    act(() => { vi.runAllTimers(); });

    expect(setSpy).toHaveBeenCalledWith(
      expect.objectContaining({ "sidebar-ui": expect.objectContaining({ scroll: 99 }) })
    );

    vi.useRealTimers();
  });

  it("flushSave() writes to storage immediately without waiting for throttle", async () => {
    vi.useFakeTimers();
    const setSpy = vi.spyOn(chrome.storage.local, "set");
    const { result } = renderHook(() => useUIState());

    act(() => {
      result.current.update({ scroll: 42 });
    });

    act(() => {
      result.current.flushSave();
    });

    expect(setSpy).toHaveBeenCalledWith(
      expect.objectContaining({ "sidebar-ui": expect.objectContaining({ scroll: 42 }) })
    );

    vi.useRealTimers();
  });

  it("restore() replaces state with a snapshot without persisting", () => {
    const setSpy = vi.spyOn(chrome.storage.local, "set");
    const { result } = renderHook(() => useUIState());

    act(() => {
      result.current.restore({ bookmarksCollapsed: true, tabsQuery: "foo" });
    });

    expect(result.current.ui.bookmarksCollapsed).toBe(true);
    expect(result.current.ui.tabsQuery).toBe("foo");
    // restore() should NOT write to storage.
    expect(setSpy).not.toHaveBeenCalled();
  });

  it("flushSave() is called on visibilitychange to hidden", () => {
    const setSpy = vi.spyOn(chrome.storage.local, "set");
    const { result } = renderHook(() => useUIState());

    act(() => {
      result.current.update({ scroll: 55 });
    });

    // Simulate tab becoming hidden.
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "hidden",
    });
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(setSpy).toHaveBeenCalledWith(
      expect.objectContaining({ "sidebar-ui": expect.anything() })
    );
  });
});
