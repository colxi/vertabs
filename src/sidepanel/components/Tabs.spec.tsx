import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Tabs } from "./Tabs";

const makeTab = (id: number, overrides: Partial<chrome.tabs.Tab> = {}): chrome.tabs.Tab => ({
  id,
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
  title: `Tab ${id}`,
  url: `https://tab${id}.com`,
  ...overrides,
});

const defaultProps = {
  tabs: [makeTab(1), makeTab(2)],
  onFocus: vi.fn(),
  onClose: vi.fn(),
  collapsed: false,
  onCollapsedChange: vi.fn(),
  query: "",
  onQueryChange: vi.fn(),
};

describe("Tabs", () => {
  it("renders the section heading", () => {
    render(<Tabs {...defaultProps} />);
    expect(screen.getByText("Open Tabs")).toBeInTheDocument();
  });

  it("shows unpinned tab count in badge", () => {
    const tabs = [
      makeTab(1, { pinned: false }),
      makeTab(2, { pinned: true }),  // should be excluded from count
      makeTab(3, { pinned: false }),
    ];
    render(<Tabs {...defaultProps} tabs={tabs} />);
    // badge text = 2 (only non-pinned)
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("hides content when collapsed=true", () => {
    render(<Tabs {...defaultProps} collapsed={true} />);
    expect(screen.queryByPlaceholderText("Search tabs…")).not.toBeInTheDocument();
  });

  it("shows content when collapsed=false", () => {
    render(<Tabs {...defaultProps} />);
    expect(screen.getByPlaceholderText("Search tabs…")).toBeInTheDocument();
  });

  it("calls onCollapsedChange when header is clicked", () => {
    const onCollapsedChange = vi.fn();
    render(<Tabs {...defaultProps} collapsed={false} onCollapsedChange={onCollapsedChange} />);
    fireEvent.click(screen.getByText("Open Tabs"));
    expect(onCollapsedChange).toHaveBeenCalledWith(true);
  });

  it("calls onQueryChange when search input changes", () => {
    const onQueryChange = vi.fn();
    render(<Tabs {...defaultProps} onQueryChange={onQueryChange} />);
    fireEvent.change(screen.getByPlaceholderText("Search tabs…"), {
      target: { value: "github" },
    });
    expect(onQueryChange).toHaveBeenCalledWith("github");
  });

  it("filters tabs by title matching the query", () => {
    const tabs = [
      makeTab(1, { title: "GitHub - Home" }),
      makeTab(2, { title: "Google Search" }),
    ];
    render(<Tabs {...defaultProps} tabs={tabs} query="github" />);
    expect(screen.getByText("GitHub - Home")).toBeInTheDocument();
    expect(screen.queryByText("Google Search")).not.toBeInTheDocument();
  });

  it("filters tabs by URL matching the query", () => {
    const tabs = [
      makeTab(1, { title: "Page A", url: "https://github.com/foo" }),
      makeTab(2, { title: "Page B", url: "https://google.com/bar" }),
    ];
    render(<Tabs {...defaultProps} tabs={tabs} query="github" />);
    expect(screen.getByText("Page A")).toBeInTheDocument();
    expect(screen.queryByText("Page B")).not.toBeInTheDocument();
  });

  it("excludes pinned tabs from the visible list", () => {
    const tabs = [
      makeTab(1, { title: "Pinned Tab", pinned: true }),
      makeTab(2, { title: "Normal Tab", pinned: false }),
    ];
    render(<Tabs {...defaultProps} tabs={tabs} />);
    expect(screen.queryByText("Pinned Tab")).not.toBeInTheDocument();
    expect(screen.getByText("Normal Tab")).toBeInTheDocument();
  });

  it("calls onFocus with tab id when a tab row is clicked", () => {
    const onFocus = vi.fn();
    render(<Tabs {...defaultProps} onFocus={onFocus} />);
    fireEvent.click(screen.getByText("Tab 1"));
    expect(onFocus).toHaveBeenCalledWith(1);
  });

  it("calls onClose with tab id when close button is clicked", () => {
    const onClose = vi.fn();
    render(<Tabs {...defaultProps} onClose={onClose} />);
    const closeBtns = screen.getAllByTitle("Close tab");
    fireEvent.click(closeBtns[0]);
    expect(onClose).toHaveBeenCalledWith(1);
  });
});
