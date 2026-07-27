import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useBookmarks } from "./useBookmarks";

const mockTree: chrome.bookmarks.BookmarkTreeNode[] = [
  {
    id: "0",
    title: "Bookmarks bar",
    children: [
      { id: "1", title: "Google", url: "https://google.com" },
    ],
  },
];

describe("useBookmarks", () => {
  it("initialises with an empty tree", () => {
    const { result } = renderHook(() => useBookmarks());
    expect(result.current.tree).toEqual([]);
  });

  it("loads the bookmark tree on mount", async () => {
    chrome.bookmarks.getTree = vi.fn((cb) => cb(mockTree));

    const { result } = renderHook(() => useBookmarks());
    await act(async () => {});

    expect(result.current.tree).toEqual(mockTree);
  });

  it("refreshes tree when onCreated fires", async () => {
    const updatedTree = [...mockTree, { id: "2", title: "New", url: "https://new.com" }];
    chrome.bookmarks.getTree = vi.fn((cb) => cb(mockTree));

    const { result } = renderHook(() => useBookmarks());
    await act(async () => {});

    // Simulate a bookmark being created.
    chrome.bookmarks.getTree = vi.fn((cb) => cb(updatedTree as chrome.bookmarks.BookmarkTreeNode[]));
    act(() => {
      (chrome.bookmarks.onCreated as ReturnType<typeof makeEventTarget>)._fire("2", {});
    });
    await act(async () => {});

    expect(result.current.tree).toEqual(updatedTree);
  });

  it("removes event listeners on unmount", async () => {
    const removeSpy = vi.spyOn(chrome.bookmarks.onCreated, "removeListener");
    const { unmount } = renderHook(() => useBookmarks());
    await act(async () => {});

    unmount();

    expect(removeSpy).toHaveBeenCalled();
  });
});

// Helper type for the mock — mirrors setup.ts
type makeEventTarget = { _fire: (...args: unknown[]) => void };
