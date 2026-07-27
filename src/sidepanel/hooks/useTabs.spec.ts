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
    chrome.tabs.remove = vi.fn((_id, cb) => cb?.());

    const { result } = renderHook(() => useTabs());
    await act(async () => {});

    act(() => { result.current.closeTab(5); });

    expect(chrome.tabs.remove).toHaveBeenCalledWith(5, expect.any(Function));
  });

  it("removes event listeners on unmount", async () => {
    const removeSpy = vi.spyOn(chrome.tabs.onCreated, "removeListener");
    const { unmount } = renderHook(() => useTabs());
    await act(async () => {});

    unmount();

    expect(removeSpy).toHaveBeenCalled();
  });
});
