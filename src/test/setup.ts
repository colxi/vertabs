import "@testing-library/jest-dom";
import { beforeEach, afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => cleanup());

// ── Chrome API mock factory ───────────────────────────────────────────────────
// Recreated fresh before every test so implementations never bleed between tests.

function makeEventTarget() {
  const listeners: ((...args: unknown[]) => void)[] = [];
  return {
    addListener: vi.fn((fn: (...args: unknown[]) => void) => listeners.push(fn)),
    removeListener: vi.fn((fn: (...args: unknown[]) => void) => {
      const i = listeners.indexOf(fn);
      if (i !== -1) listeners.splice(i, 1);
    }),
    /** Fire the event in tests */
    _fire: (...args: unknown[]) => listeners.slice().forEach((fn) => fn(...args)),
  };
}

function makeChromeApi() {
  const storageData: Record<string, unknown> = {};

  const storage = {
    local: {
      /** Supports both callback and (implicitly) the storage state map. */
      get: vi.fn((keys: string | string[], cb: (r: Record<string, unknown>) => void) => {
        const keyArr = Array.isArray(keys) ? keys : [keys];
        const result: Record<string, unknown> = {};
        for (const k of keyArr) {
          if (k in storageData) result[k] = storageData[k];
        }
        cb(result);
      }),
      set: vi.fn((items: Record<string, unknown>, cb?: () => void) => {
        Object.assign(storageData, items);
        cb?.();
      }),
      /** Helper used by tests to pre-seed storage. */
      _data: storageData,
    },
  };

  /**
   * chrome.tabs.query supports BOTH callback (MV2/useTabs) and
   * Promise (MV3/useShortcuts) styles. Return an empty-array promise
   * and also invoke cb if provided.
   */
  const tabs = {
    query: vi.fn((_q: unknown, cb?: (tabs: chrome.tabs.Tab[]) => void) => {
      const result: chrome.tabs.Tab[] = [];
      cb?.(result);
      return Promise.resolve(result);
    }),
    create: vi.fn(() => Promise.resolve({ id: 99 } as chrome.tabs.Tab)),
    update: vi.fn(() => Promise.resolve({} as chrome.tabs.Tab)),
    remove: vi.fn((_id: number, cb?: () => void) => { cb?.(); return Promise.resolve(); }),
    move: vi.fn(() => Promise.resolve({} as chrome.tabs.Tab)),
    get: vi.fn((_id: number, cb: (tab: chrome.tabs.Tab) => void) =>
      cb({ id: _id, active: false } as chrome.tabs.Tab)
    ),
    onCreated: makeEventTarget(),
    onRemoved: makeEventTarget(),
    onUpdated: makeEventTarget(),
    onActivated: makeEventTarget(),
    onMoved: makeEventTarget(),
    onDetached: makeEventTarget(),
    onAttached: makeEventTarget(),
  };

  const bookmarks = {
    getTree: vi.fn((cb: (tree: chrome.bookmarks.BookmarkTreeNode[]) => void) => cb([])),
    onCreated: makeEventTarget(),
    onRemoved: makeEventTarget(),
    onChanged: makeEventTarget(),
    onMoved: makeEventTarget(),
  };

  const runtime = {
    id: "test-extension-id",
    getURL: vi.fn((path: string) => `chrome-extension://test-id/${path}`),
    sendMessage: vi.fn(),
    onMessage: makeEventTarget(),
  };

  return { storage, tabs, bookmarks, runtime };
}

// Install a fresh chrome object before every test.
beforeEach(() => {
  (globalThis as unknown as { chrome: unknown }).chrome = makeChromeApi();
});
