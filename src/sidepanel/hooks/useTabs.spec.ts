import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useTabs } from "./useTabs";

const makeTab = (overrides: Partial<chrome.tabs.Tab> = {}): chrome.tabs.Tab => ({
  id: 1,
  index: 0,
  pinned: false,
  highlighted: false,
  windowId: 1,
  active: false,
  incognito: false,
  selected: false,
  discarded: false,
  autoDiscardable: true,
  groupId: -1,
  url: "https://example.com",
  title: "Example",
  ...overrides,
});

describe("useTabs", () => {
  it("initialises with empty tab list", () => {
    const { result } = renderHook(() => useTabs());
    expect(result.current.tabs).toEqual([]);
  });

  it("loads current window tabs on mount", async () => {
    const tab = makeTab({ id: 42, title: "My Tab" });
    chrome.tabs.query = vi.fn((_q, cb) => cb([tab]));

    const { result } = renderHook(() => useTabs());
    await act(async () => {});

    expect(result.current.tabs).toEqual([tab]);
  });

  it("refreshes tabs when onCreated fires", async () => {
    const tab1 = makeTab({ id: 1 });
    const tab2 = makeTab({ id: 2, title: "New Tab" });
    chrome.tabs.query = vi.fn((_q, cb) => cb([tab1]));

    const { result } = renderHook(() => useTabs());
    await act(async () => {});

    chrome.tabs.query = vi.fn((_q, cb) => cb([tab1, tab2]));
    act(() => {
      (chrome.tabs.onCreated as any)._fire(tab2);
    });
    await act(async () => {});

    expect(result.current.tabs).toHaveLength(2);
  });

  it("focusTab() calls chrome.tabs.update with active:true", () => {
    const { result } = renderHook(() => useTabs());
    result.current.focusTab(7);
    expect(chrome.tabs.update).toHaveBeenCalledWith(7, { active: true });
  });

  it("closeTab() calls chrome.tabs.remove and then refreshes", async () => {
    const tab = makeTab({ id: 5 });
    chrome.tabs.query = vi.fn((_q, cb) => cb([tab]));
    chrome.tabs.remove = vi.fn(() => Promise.resolve());

    const { result } = renderHook(() => useTabs());
    await act(async () => {});

    act(() => { result.current.closeTab(5); });

    expect(chrome.tabs.remove).toHaveBeenCalledWith(5);
  });

  it("removes event listeners on unmount", async () => {
    const removeSpy = vi.spyOn(chrome.tabs.onCreated, "removeListener");
    const { unmount } = renderHook(() => useTabs());
    await act(async () => {});

    unmount();

    expect(removeSpy).toHaveBeenCalled();
  });

  // ── Tab groups ──────────────────────────────────────────────────────────────

  it("initialises with empty groups list", () => {
    const { result } = renderHook(() => useTabs());
    expect(result.current.groups).toEqual([]);
  });

  it("loads tab groups on mount via chrome.tabGroups.query", async () => {
    const group = { id: 1, title: "Work", color: "blue", collapsed: false, windowId: 1 } as chrome.tabGroups.TabGroup;
    chrome.tabGroups.query = vi.fn(() => Promise.resolve([group]));

    const { result } = renderHook(() => useTabs());
    await act(async () => {});

    expect(result.current.groups).toHaveLength(1);
    expect(result.current.groups[0].title).toBe("Work");
  });

  it("refreshes groups when tabGroups.onUpdated fires", async () => {
    const group1 = { id: 1, title: "Work",    color: "blue", collapsed: false, windowId: 1 } as chrome.tabGroups.TabGroup;
    const group2 = { id: 1, title: "Updated", color: "blue", collapsed: false, windowId: 1 } as chrome.tabGroups.TabGroup;
    chrome.tabGroups.query = vi.fn(() => Promise.resolve([group1]));

    const { result } = renderHook(() => useTabs());
    await act(async () => {});

    chrome.tabGroups.query = vi.fn(() => Promise.resolve([group2]));
    act(() => { (chrome.tabGroups.onUpdated as any)._fire(group2); });
    await act(async () => {});

    expect(result.current.groups[0].title).toBe("Updated");
  });

  it("removes tabGroups event listeners on unmount", async () => {
    const removeSpy = vi.spyOn(chrome.tabGroups.onCreated, "removeListener");
    const { unmount } = renderHook(() => useTabs());
    await act(async () => {});

    unmount();

    expect(removeSpy).toHaveBeenCalled();
  });
});
