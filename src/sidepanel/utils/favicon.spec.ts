import { describe, it, expect } from "vitest";
import { faviconUrl } from "./favicon";

describe("faviconUrl", () => {
  it("returns /favicon.ico for a valid URL", () => {
    expect(faviconUrl("https://google.com/search?q=test")).toBe(
      "https://google.com/favicon.ico"
    );
  });

  it("preserves subdomain in the hostname", () => {
    expect(faviconUrl("https://mail.google.com/mail/u/0/")).toBe(
      "https://mail.google.com/favicon.ico"
    );
  });

  it("returns empty string for an invalid URL", () => {
    expect(faviconUrl("not-a-url")).toBe("");
  });

  it("returns empty string for an empty string", () => {
    expect(faviconUrl("")).toBe("");
  });

  it("handles URLs with ports", () => {
    expect(faviconUrl("http://localhost:3000/app")).toBe(
      "https://localhost:3000/favicon.ico"
    );
  });
});
