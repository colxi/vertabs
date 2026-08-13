import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useConfig, DEFAULT_CONFIG } from "./useConfig";

describe("useConfig", () => {
  it("starts with DEFAULT_CONFIG", () => {
    const { result } = renderHook(() => useConfig());
    expect(result.current.config).toEqual(DEFAULT_CONFIG);
  });

  it("merges persisted config from storage on mount", async () => {
    chrome.storage.sync.get = vi.fn((_keys, cb) =>
      cb({ "sidebar-config": { fontSize: 16, accentColor: "#ff0000" } })
    );

    const { result } = renderHook(() => useConfig());

    await act(async () => {});

    expect(result.current.config.fontSize).toBe(16);
    expect(result.current.config.accentColor).toBe("#ff0000");
    // Fields not in storage keep defaults.
    expect(result.current.config.sidebarWidth).toBe(DEFAULT_CONFIG.sidebarWidth);
    expect(result.current.loaded).toBe(true);
  });

  it("sets loaded=true even when storage has no saved config", async () => {
    chrome.storage.sync.get = vi.fn((_keys, cb) => cb({}));

    const { result } = renderHook(() => useConfig());
    await act(async () => {});

    expect(result.current.loaded).toBe(true);
    expect(result.current.config).toEqual(DEFAULT_CONFIG);
  });

  it("update() merges partial changes into config", async () => {
    const { result } = renderHook(() => useConfig());
    await act(async () => {});

    act(() => {
      result.current.update({ fontSize: 18 });
    });

    expect(result.current.config.fontSize).toBe(18);
    // Other fields unchanged.
    expect(result.current.config.accentColor).toBe(DEFAULT_CONFIG.accentColor);
  });

  it("update() persists to chrome.storage.local", async () => {
    const setSpy = vi.spyOn(chrome.storage.sync, "set");
    const { result } = renderHook(() => useConfig());
    await act(async () => {});

    act(() => {
      result.current.update({ sidebarWidth: 400 });
    });

    expect(setSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        "sidebar-config": expect.objectContaining({ sidebarWidth: 400 }),
      })
    );
  });

  it("update() posts config-update to parent window", async () => {
    const postSpy = vi.spyOn(window.parent, "postMessage");
    const { result } = renderHook(() => useConfig());
    await act(async () => {});

    act(() => {
      result.current.update({ accentColor: "#abc" });
    });

    expect(postSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: "config-update" }),
      "*"
    );
  });
});
