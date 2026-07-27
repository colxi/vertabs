import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Bookmarks } from "./Bookmarks";

const makeNode = (
  id: string,
  title: string,
  url?: string,
  children?: chrome.bookmarks.BookmarkTreeNode[]
): chrome.bookmarks.BookmarkTreeNode => ({ id, title, url, children } as chrome.bookmarks.BookmarkTreeNode);

// Simulate Chrome's bookmark tree: root → children[bar, other]
const BAR_ROOT   = makeNode("1", "Bookmarks bar", undefined, [
  makeNode("10", "Google", "https://google.com"),
  makeNode("11", "GitHub", "https://github.com"),
]);
const OTHER_ROOT = makeNode("2", "Other bookmarks", undefined, [
  makeNode("20", "Example", "https://example.com"),
]);
const tree: chrome.bookmarks.BookmarkTreeNode[] = [
  makeNode("0", "root", undefined, [BAR_ROOT, OTHER_ROOT]),
];

const defaultProps = {
  tree,
  isOpen: vi.fn(() => false),
  onToggle: vi.fn(),
  openLinksInNewTab: true,
  showBookmarksBar: true,
  showOtherBookmarks: true,
  collapsed: false,
  onCollapsedChange: vi.fn(),
  query: "",
  onQueryChange: vi.fn(),
  sourcesCollapsed: {},
  onSourceCollapsedChange: vi.fn(),
};

describe("Bookmarks", () => {
  it("renders the section heading", () => {
    render(<Bookmarks {...defaultProps} />);
    expect(screen.getByText("Bookmarks")).toBeInTheDocument();
  });

  it("hides content when collapsed=true", () => {
    render(<Bookmarks {...defaultProps} collapsed={true} />);
    expect(screen.queryByPlaceholderText("Search bookmarks…")).not.toBeInTheDocument();
  });

  it("shows content when collapsed=false", () => {
    render(<Bookmarks {...defaultProps} />);
    expect(screen.getByPlaceholderText("Search bookmarks…")).toBeInTheDocument();
  });

  it("calls onCollapsedChange when header is clicked", () => {
    const onCollapsedChange = vi.fn();
    render(<Bookmarks {...defaultProps} onCollapsedChange={onCollapsedChange} />);
    fireEvent.click(screen.getByText("Bookmarks"));
    expect(onCollapsedChange).toHaveBeenCalledWith(true);
  });

  it("calls onQueryChange when search input changes", () => {
    const onQueryChange = vi.fn();
    render(<Bookmarks {...defaultProps} onQueryChange={onQueryChange} />);
    fireEvent.change(screen.getByPlaceholderText("Search bookmarks…"), {
      target: { value: "goo" },
    });
    expect(onQueryChange).toHaveBeenCalledWith("goo");
  });

  it("shows flat search results matching the query", () => {
    render(<Bookmarks {...defaultProps} query="google" />);
    expect(screen.getByText(/Google/)).toBeInTheDocument();
    expect(screen.queryByText(/GitHub/)).not.toBeInTheDocument();
  });

  it("shows empty message when no bookmarks match", () => {
    render(<Bookmarks {...defaultProps} query="zzznomatch" />);
    expect(screen.getByText(/No bookmarks match/)).toBeInTheDocument();
  });

  it("shows group titles when both sources are selected", () => {
    render(<Bookmarks {...defaultProps} showBookmarksBar={true} showOtherBookmarks={true} />);
    expect(screen.getByText("Bookmarks bar")).toBeInTheDocument();
    expect(screen.getByText("Other bookmarks")).toBeInTheDocument();
  });

  it("hides group titles when only one source is selected", () => {
    render(<Bookmarks {...defaultProps} showOtherBookmarks={false} />);
    expect(screen.queryByText("Bookmarks bar")).not.toBeInTheDocument();
  });

  it("hides Other bookmarks when showOtherBookmarks=false", () => {
    // With query to get flat results: Example is under "Other bookmarks"
    render(<Bookmarks {...defaultProps} showOtherBookmarks={false} query="example" />);
    expect(screen.queryByText(/Example/)).not.toBeInTheDocument();
  });

  it("hides Bookmarks bar when showBookmarksBar=false", () => {
    render(<Bookmarks {...defaultProps} showBookmarksBar={false} query="google" />);
    expect(screen.queryByText(/Google/)).not.toBeInTheDocument();
  });

  it("opens link in new tab when openLinksInNewTab=true", () => {
    render(<Bookmarks {...defaultProps} query="google" />);
    fireEvent.click(screen.getByText(/Google/));
    expect(chrome.tabs.create).toHaveBeenCalledWith({ url: "https://google.com" });
  });

  it("updates current tab when openLinksInNewTab=false", () => {
    chrome.tabs.query = vi.fn((_q, cb) =>
      cb([{ id: 99, active: true } as chrome.tabs.Tab])
    );
    render(<Bookmarks {...defaultProps} openLinksInNewTab={false} query="google" />);
    fireEvent.click(screen.getByText(/Google/));
    expect(chrome.tabs.update).toHaveBeenCalledWith(99, { url: "https://google.com" });
  });

  it("focuses existing tab instead of opening new one when URL already open", () => {
    chrome.tabs.query = vi.fn((_q, cb) =>
      cb([{ id: 42, url: "https://google.com", active: false } as chrome.tabs.Tab])
    );
    render(<Bookmarks {...defaultProps} query="google" />);
    fireEvent.click(screen.getByText(/Google/));
    expect(chrome.tabs.update).toHaveBeenCalledWith(42, { active: true });
    expect(chrome.tabs.create).not.toHaveBeenCalled();
  });

  it("source collapsed state hides children of that source group", () => {
    render(
      <Bookmarks
        {...defaultProps}
        sourcesCollapsed={{ "1": true }}
      />
    );
    // Bookmarks bar source is collapsed — its children should not be visible.
    expect(screen.queryByText("Google")).not.toBeInTheDocument();
    // Other bookmarks source is open — its direct leaf "Example" should be visible.
    expect(screen.queryByText("Example")).toBeInTheDocument();
  });

  it("calls onSourceCollapsedChange when a source group title is clicked", () => {
    const onSourceCollapsedChange = vi.fn();
    render(
      <Bookmarks
        {...defaultProps}
        onSourceCollapsedChange={onSourceCollapsedChange}
      />
    );
    fireEvent.click(screen.getByText("Bookmarks bar"));
    expect(onSourceCollapsedChange).toHaveBeenCalledWith("1", true);
  });
});
