import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Shortcuts } from "./Shortcuts";
import { Shortcut } from "../utils/shortcuts";

const sc = (id: string, url: string): Shortcut => ({
  id,
  name: `Site ${id}`,
  url,
  favIconUrl: undefined,
});

const defaultProps = {
  shortcuts: [sc("1", "https://a.com"), sc("2", "https://b.com")],
  onAdd: vi.fn(),
  onRemove: vi.fn(),
  onReorder: vi.fn(),
};

describe("Shortcuts", () => {
  it("renders a shortcut item for each shortcut", () => {
    render(<Shortcuts {...defaultProps} />);
    // Each shortcut renders an icon; items are identifiable by their title attribute.
    const items = screen.getAllByTitle(/Site/);
    expect(items).toHaveLength(2);
  });

  it("opens the add-shortcut modal when + is clicked", () => {
    render(<Shortcuts {...defaultProps} />);
    fireEvent.click(screen.getByTitle("Add shortcut"));
    expect(screen.getByText("Add Shortcut")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("https://google.com")).toBeInTheDocument();
  });

  it("closes the modal when Cancel is clicked", () => {
    render(<Shortcuts {...defaultProps} />);
    fireEvent.click(screen.getByTitle("Add shortcut"));
    fireEvent.click(screen.getByText("Cancel"));
    expect(screen.queryByText("Add Shortcut")).not.toBeInTheDocument();
  });

  it("calls onAdd with normalized URL when Add is clicked", () => {
    const onAdd = vi.fn();
    render(<Shortcuts {...defaultProps} onAdd={onAdd} />);
    fireEvent.click(screen.getByTitle("Add shortcut"));
    fireEvent.change(screen.getByPlaceholderText("https://google.com"), {
      target: { value: "github.com" },
    });
    fireEvent.click(screen.getByText("Add"));
    expect(onAdd).toHaveBeenCalledWith("https://github.com");
  });

  it("calls onAdd with URL as-is when it already has http(s)://", () => {
    const onAdd = vi.fn();
    render(<Shortcuts {...defaultProps} onAdd={onAdd} />);
    fireEvent.click(screen.getByTitle("Add shortcut"));
    fireEvent.change(screen.getByPlaceholderText("https://google.com"), {
      target: { value: "https://already.com" },
    });
    fireEvent.click(screen.getByText("Add"));
    expect(onAdd).toHaveBeenCalledWith("https://already.com");
  });

  it("does not call onAdd when URL is empty", () => {
    const onAdd = vi.fn();
    render(<Shortcuts {...defaultProps} onAdd={onAdd} />);
    fireEvent.click(screen.getByTitle("Add shortcut"));
    fireEvent.click(screen.getByText("Add"));
    expect(onAdd).not.toHaveBeenCalled();
  });

  it("submits the modal via Enter key", () => {
    const onAdd = vi.fn();
    render(<Shortcuts {...defaultProps} onAdd={onAdd} />);
    fireEvent.click(screen.getByTitle("Add shortcut"));
    const input = screen.getByPlaceholderText("https://google.com");
    fireEvent.change(input, { target: { value: "https://enter.com" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onAdd).toHaveBeenCalledWith("https://enter.com");
  });

  it("first remove click enters confirm state (shows ?)", () => {
    const onRemove = vi.fn();
    render(<Shortcuts {...defaultProps} onRemove={onRemove} />);
    const removeBtn = screen.getAllByText("✕")[0];
    fireEvent.click(removeBtn);
    expect(onRemove).not.toHaveBeenCalled();
    expect(screen.getAllByText("?")[0]).toBeInTheDocument();
  });

  it("second remove click calls onRemove", () => {
    const onRemove = vi.fn();
    render(<Shortcuts {...defaultProps} onRemove={onRemove} />);
    const removeBtn = screen.getAllByText("✕")[0];
    fireEvent.click(removeBtn); // first — confirm
    fireEvent.click(screen.getAllByText("?")[0]); // second — confirmed
    expect(onRemove).toHaveBeenCalledWith("1");
  });

  it("navigates to the stored original URL on click, not the live tab URL", () => {
    // Storage has a different URL than shortcut.url (simulating a tab that navigated away)
    (chrome.storage.local.get as ReturnType<typeof vi.fn>).mockImplementation(
      (_key: string, cb: (r: Record<string, unknown>) => void) => {
        cb({ "sidebar-shortcut-urls": { "1": "https://original.com" } });
      }
    );

    render(<Shortcuts {...defaultProps} />);
    // Click the first shortcut item (title = "Site 1")
    const item = screen.getByTitle("Site 1");
    fireEvent.click(item);

    expect(chrome.tabs.update).toHaveBeenCalledWith(1, {
      active: true,
      url: "https://original.com",
    });
  });

  it("backfills storage and navigates when no storage entry exists for a shortcut", () => {
    // Storage is empty — simulates a pre-existing pinned tab with no stored URL
    (chrome.storage.local.get as ReturnType<typeof vi.fn>).mockImplementation(
      (_key: string, cb: (r: Record<string, unknown>) => void) => {
        cb({ "sidebar-shortcut-urls": {} });
      }
    );

    render(<Shortcuts {...defaultProps} />);
    const item = screen.getByTitle("Site 1");
    fireEvent.click(item);

    // Should backfill storage with the current shortcut.url
    expect(chrome.storage.local.set).toHaveBeenCalledWith({
      "sidebar-shortcut-urls": { "1": "https://a.com" },
    });
    // And navigate to it
    expect(chrome.tabs.update).toHaveBeenCalledWith(1, {
      active: true,
      url: "https://a.com",
    });
  });
});
