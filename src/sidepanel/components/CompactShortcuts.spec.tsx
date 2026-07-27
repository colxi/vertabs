import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CompactShortcuts } from "./CompactShortcuts";
import { Shortcut } from "../utils/shortcuts";

const sc = (id: string, url: string, name = `Site ${id}`): Shortcut => ({
  id,
  name,
  url,
  favIconUrl: undefined,
});

describe("CompactShortcuts", () => {
  it("renders a button for each shortcut", () => {
    const shortcuts = [sc("1", "https://a.com"), sc("2", "https://b.com")];
    render(<CompactShortcuts shortcuts={shortcuts} />);
    expect(screen.getAllByRole("button")).toHaveLength(2);
  });

  it("uses the shortcut name as the button title", () => {
    render(<CompactShortcuts shortcuts={[sc("1", "https://a.com", "My Site")]} />);
    expect(screen.getByTitle("My Site")).toBeInTheDocument();
  });

  it("falls back to URL as title when name is empty", () => {
    render(<CompactShortcuts shortcuts={[sc("1", "https://a.com", "")]} />);
    expect(screen.getByTitle("https://a.com")).toBeInTheDocument();
  });

  it("calls chrome.tabs.get and then update when a shortcut is clicked (not already active)", () => {
    chrome.tabs.get = vi.fn((_id, cb) => cb({ id: 1, active: false } as chrome.tabs.Tab));
    render(<CompactShortcuts shortcuts={[sc("1", "https://a.com")]} />);
    fireEvent.click(screen.getByRole("button"));
    expect(chrome.tabs.get).toHaveBeenCalledWith(1, expect.any(Function));
    expect(chrome.tabs.update).toHaveBeenCalledWith(1, { active: true, url: "https://a.com" });
  });

  it("does NOT call chrome.tabs.update when the tab is already active", () => {
    chrome.tabs.get = vi.fn((_id, cb) => cb({ id: 1, active: true } as chrome.tabs.Tab));
    render(<CompactShortcuts shortcuts={[sc("1", "https://a.com")]} />);
    fireEvent.click(screen.getByRole("button"));
    expect(chrome.tabs.update).not.toHaveBeenCalled();
  });

  it("renders nothing when shortcuts list is empty", () => {
    const { container } = render(<CompactShortcuts shortcuts={[]} />);
    expect(container.querySelectorAll("button")).toHaveLength(0);
  });
});
