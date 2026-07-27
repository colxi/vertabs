import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useShortcuts } from "./useShortcuts";

const makeTab = (id: number, overrides: Partial<chrome.tabs.Tab> = {}): chrome.tabs.Tab => ({
  id,
  index: 0,
  pinned: true,
  highlighted: false,
  windowId: 1,
  active: false,
  incognito: false,
  selected: false,
  discarded: false,
  autoDiscardable: true,
  groupId: -1,
  url: `https://site${id}.com`,
  title: `Site ${id}`,
  favIconUrl: `https://site${id}.com/favicon.ico`,
  ...overrides,
});

describe("useShortcuts", () => {
  it("initialises with empty shortcuts", () => {
    const { result } = renderHook(() => useShortcuts());
    expect(result.current.shortcuts).toEqual([]);
  });

  it("loads pinned tabs on mount", async () => {
    const tab = makeTab(10);
    chrome.tabs.query = vi.fn(() => Promise.resolve([tab]));

    const { result } = renderHook(() => useShortcuts());
    await act(async () => {});

    expect(result.current.shortcuts).toHaveLength(1);
    expect(result.current.shortcuts[0].id).toBe("10");
    expect(result.current.shortcuts[0].url).toBe("https://site10.com");
  });

  it("uses stored original URL instead of current tab URL", async () => {
    const tab = makeTab(11, { url: "https://current.com" });
    chrome.tabs.query = vi.fn(() => Promise.resolve([tab]));
    chrome.storage.local.get = vi.fn((_k, cb) =>
      cb({ "sidebar-shortcut-urls": { "11": "https://original.com" } })
    );

    const { result } = renderHook(() => useShortcuts());
    await act(async () => {});

    expect(result.current.shortcuts[0].url).toBe("https://original.com");
  });

  it("add() creates a pinned tab and stores the original URL", async () => {
    chrome.tabs.create = vi.fn(() => Promise.resolve(makeTab(20)));
    chrome.storage.local.get = vi.fn((_k, cb) => cb({}));

    const { result } = renderHook(() => useShortcuts());
    await act(async () => {
      await result.current.add("https://added.com");
    });

    expect(chrome.tabs.create).toHaveBeenCalledWith({
      url: "https://added.com",
      pinned: true,
    });
    expect(chrome.storage.local.set).toHaveBeenCalledWith(
      expect.objectContaining({
        "sidebar-shortcut-urls": expect.objectContaining({ "20": "https://added.com" }),
      })
    );
  });

  it("remove() calls chrome.tabs.remove with numeric id", async () => {
    chrome.tabs.remove = vi.fn(() => Promise.resolve());
    const { result } = renderHook(() => useShortcuts());

    await act(async () => {
      await result.current.remove("15");
    });

    expect(chrome.tabs.remove).toHaveBeenCalledWith(15);
  });

  it("edit() updates the original URL in storage and navigates the tab", async () => {
    chrome.tabs.update = vi.fn(() => Promise.resolve(makeTab(12)));
    chrome.storage.local.get = vi.fn((_k, cb) =>
      cb({ "sidebar-shortcut-urls": { "12": "https://old.com" } })
    );

    const { result } = renderHook(() => useShortcuts());

    await act(async () => {
      await result.current.edit("12", "ignored", "https://new.com");
    });

    expect(chrome.storage.local.set).toHaveBeenCalledWith(
      expect.objectContaining({
        "sidebar-shortcut-urls": expect.objectContaining({ "12": "https://new.com" }),
      })
    );
    expect(chrome.tabs.update).toHaveBeenCalledWith(12, { url: "https://new.com" });
  });

  it("reorder() calls chrome.tabs.move when indices differ", async () => {
    const tab1 = makeTab(1);
    const tab2 = makeTab(2);
    chrome.tabs.query = vi.fn(() => Promise.resolve([tab1, tab2]));
    chrome.tabs.move = vi.fn(() => Promise.resolve(tab1));

    const { result } = renderHook(() => useShortcuts());
    await act(async () => {});

    await act(async () => {
      await result.current.reorder(0, 1);
    });

    expect(chrome.tabs.move).toHaveBeenCalledWith(1, { index: 1 });
  });

  it("reorder() is a no-op when fromIndex === toIndex", async () => {
    chrome.tabs.move = vi.fn();
    const { result } = renderHook(() => useShortcuts());

    await act(async () => {
      await result.current.reorder(2, 2);
    });

    expect(chrome.tabs.move).not.toHaveBeenCalled();
  });

  it("removes stored URL and refreshes when a tab is removed", async () => {
    const tab = makeTab(13);
    chrome.tabs.query = vi.fn(() => Promise.resolve([tab]));
    chrome.storage.local.get = vi.fn((_k, cb) =>
      cb({ "sidebar-shortcut-urls": { "13": "https://site13.com" } })
    );

    const { result } = renderHook(() => useShortcuts());
    await act(async () => {});

    // Simulate tab removal.
    chrome.tabs.query = vi.fn(() => Promise.resolve([]));
    act(() => {
      (chrome.tabs.onRemoved as any)._fire(13, {});
    });
    await act(async () => {});

    // Storage should no longer include key "13".
    expect(chrome.storage.local.set).toHaveBeenCalledWith(
      expect.objectContaining({ "sidebar-shortcut-urls": expect.not.objectContaining({ "13": expect.anything() }) })
    );
  });
});
