import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useBookmarkFolders } from "./useBookmarkFolders";

const makeFolder = (id: string, children: chrome.bookmarks.BookmarkTreeNode[] = []) =>
  ({ id, title: `Folder ${id}`, children } as chrome.bookmarks.BookmarkTreeNode);

const roots: chrome.bookmarks.BookmarkTreeNode[] = [
  makeFolder("root", [
    makeFolder("1", [makeFolder("1a")]),
    makeFolder("2"),
  ]),
];

describe("useBookmarkFolders", () => {
  it("returns empty open set before roots are available", () => {
    const { result } = renderHook(() => useBookmarkFolders([]));
    expect(result.current.isOpen("1")).toBe(false);
  });

  it("defaults to first-level folders open when no storage entry exists", async () => {
    chrome.storage.local.get = vi.fn((_k, cb) => cb({}));

    const { result } = renderHook(() => useBookmarkFolders(roots));
    await act(async () => {});

    // "1" and "2" are first-level folders under the root.
    expect(result.current.isOpen("1")).toBe(true);
    expect(result.current.isOpen("2")).toBe(true);
    // "1a" is nested — should not be open by default.
    expect(result.current.isOpen("1a")).toBe(false);
  });

  it("restores persisted open IDs from storage", async () => {
    chrome.storage.local.get = vi.fn((_k, cb) =>
      cb({ "sidebar-bookmarks-open": ["1a"] })
    );

    const { result } = renderHook(() => useBookmarkFolders(roots));
    await act(async () => {});

    expect(result.current.isOpen("1a")).toBe(true);
    expect(result.current.isOpen("1")).toBe(false);
  });

  it("toggle() opens a closed folder", async () => {
    chrome.storage.local.get = vi.fn((_k, cb) => cb({}));
    const { result } = renderHook(() => useBookmarkFolders(roots));
    await act(async () => {});

    act(() => { result.current.toggle("1a"); });

    expect(result.current.isOpen("1a")).toBe(true);
  });

  it("toggle() closes an open folder", async () => {
    chrome.storage.local.get = vi.fn((_k, cb) => cb({}));
    const { result } = renderHook(() => useBookmarkFolders(roots));
    await act(async () => {});

    act(() => { result.current.toggle("1"); }); // close it
    expect(result.current.isOpen("1")).toBe(false);
  });

  it("toggle() persists the new set to storage", async () => {
    chrome.storage.local.get = vi.fn((_k, cb) => cb({}));
    const setSpy = vi.spyOn(chrome.storage.local, "set");
    const { result } = renderHook(() => useBookmarkFolders(roots));
    await act(async () => {});

    act(() => { result.current.toggle("1a"); });

    expect(setSpy).toHaveBeenCalledWith(
      expect.objectContaining({ "sidebar-bookmarks-open": expect.arrayContaining(["1a"]) })
    );
  });

  it("sync() replaces open set from storage", async () => {
    chrome.storage.local.get = vi.fn((_k, cb) => cb({}));
    const { result } = renderHook(() => useBookmarkFolders(roots));
    await act(async () => {});

    // Change storage to only have "1a" open.
    chrome.storage.local.get = vi.fn((_k, cb) =>
      cb({ "sidebar-bookmarks-open": ["1a"] })
    );

    act(() => { result.current.sync(); });
    await act(async () => {});

    expect(result.current.isOpen("1a")).toBe(true);
    expect(result.current.isOpen("1")).toBe(false);
  });
});
