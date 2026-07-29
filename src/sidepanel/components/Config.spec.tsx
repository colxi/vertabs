import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Config } from "./Config";
import { DEFAULT_CONFIG } from "../hooks/useConfig";
import type { Shortcut } from "../utils/shortcuts";

const sc = (id: string, url: string): Shortcut => ({
  id, url, name: `Site ${id}`, favIconUrl: undefined,
});

const defaultProps = {
  config: { ...DEFAULT_CONFIG },
  onUpdate: vi.fn(),
  onClose: vi.fn(),
  shortcuts: [sc("1", "https://a.com"), sc("2", "https://b.com")],
};

// Helper: get a section header button by its label text
function getSectionBtn(name: string) {
  return screen.getByRole("button", { name: new RegExp(name) });
}

describe("Config", () => {
  // ── Section headers render ────────────────────────────────────────────────

  it("renders Mode & Position section header", () => {
    render(<Config {...defaultProps} />);
    expect(getSectionBtn("Mode & Position")).toBeInTheDocument();
  });

  it("renders Appearance section header", () => {
    render(<Config {...defaultProps} />);
    expect(getSectionBtn("Appearance")).toBeInTheDocument();
  });

  it("renders Content section header", () => {
    render(<Config {...defaultProps} />);
    expect(getSectionBtn("Content")).toBeInTheDocument();
  });

  it("renders Shortcuts section header", () => {
    render(<Config {...defaultProps} />);
    // Shortcuts section was removed — should NOT exist
    expect(screen.queryByRole("button", { name: /^Shortcuts$/ })).toBeNull();
  });

  it("renders Export / Import section header", () => {
    render(<Config {...defaultProps} />);
    expect(getSectionBtn("Export / Import")).toBeInTheDocument();
  });

  it("does NOT render a Bookmarks management section header", () => {
    render(<Config {...defaultProps} />);
    // There should be no section button labelled "Bookmarks"
    const bookmarksBtn = screen.queryByRole("button", { name: /^Bookmarks$/ });
    expect(bookmarksBtn).toBeNull();
  });

  // ── Sections start folded (body in DOM but sectionWrap has 0fr) ───────────
  // Because the animation renders content in DOM always, we check that the
  // sectionWrap element does NOT have the open class on mount.

  it("Mode & Position sectionWrap starts without open class", () => {
    render(<Config {...defaultProps} />);
    // The wrapper div directly after the header button is the sectionWrap
    const header = getSectionBtn("Mode & Position");
    const wrap = header.nextElementSibling as HTMLElement;
    expect(wrap.className).not.toMatch(/sectionWrapOpen/);
  });

  it("Appearance sectionWrap starts without open class", () => {
    render(<Config {...defaultProps} />);
    const wrap = getSectionBtn("Appearance").nextElementSibling as HTMLElement;
    expect(wrap.className).not.toMatch(/sectionWrapOpen/);
  });

  it("Content sectionWrap starts without open class", () => {
    render(<Config {...defaultProps} />);
    const wrap = getSectionBtn("Content").nextElementSibling as HTMLElement;
    expect(wrap.className).not.toMatch(/sectionWrapOpen/);
  });

  // ── Sections open on click ────────────────────────────────────────────────

  it("clicking Mode & Position header adds open class to wrapper", () => {
    render(<Config {...defaultProps} />);
    const header = getSectionBtn("Mode & Position");
    fireEvent.click(header);
    const wrap = header.nextElementSibling as HTMLElement;
    expect(wrap.className).toMatch(/sectionWrapOpen/);
  });

  it("clicking Appearance header reveals its content", () => {
    render(<Config {...defaultProps} />);
    fireEvent.click(getSectionBtn("Appearance"));
    expect(screen.getByText(/Font size/)).toBeInTheDocument();
    expect(screen.getByText(/Row spacing/)).toBeInTheDocument();
  });

  it("clicking Content header reveals Show Shortcuts row", () => {
    render(<Config {...defaultProps} />);
    fireEvent.click(getSectionBtn("Content"));
    expect(screen.getByText("Show Shortcuts")).toBeInTheDocument();
  });

  it("clicking a section twice toggles the open class off", () => {
    render(<Config {...defaultProps} />);
    const header = getSectionBtn("Appearance");
    fireEvent.click(header);
    const wrap = header.nextElementSibling as HTMLElement;
    expect(wrap.className).toMatch(/sectionWrapOpen/);
    fireEvent.click(header);
    expect(wrap.className).not.toMatch(/sectionWrapOpen/);
  });

  // ── Removed controls ──────────────────────────────────────────────────────

  it("Content section has no Show Bookmarks toggle", () => {
    render(<Config {...defaultProps} />);
    fireEvent.click(getSectionBtn("Content"));
    expect(screen.queryByText("Show Bookmarks")).not.toBeInTheDocument();
  });

  it("Content section has no Show Tabs toggle", () => {
    render(<Config {...defaultProps} />);
    fireEvent.click(getSectionBtn("Content"));
    expect(screen.queryByText("Show Tabs")).not.toBeInTheDocument();
  });

  it("Content section retains Open links in control", () => {
    render(<Config {...defaultProps} />);
    fireEvent.click(getSectionBtn("Content"));
    expect(screen.getByText("Open links in")).toBeInTheDocument();
  });

  // ── Back button ───────────────────────────────────────────────────────────

  it("clicking ← calls onClose", () => {
    const onClose = vi.fn();
    render(<Config {...defaultProps} onClose={onClose} />);
    fireEvent.click(screen.getByTitle("Back"));
    expect(onClose).toHaveBeenCalled();
  });
});
