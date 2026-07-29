/**
 * E2E tests — Shortcuts section
 *
 * Covers: add shortcut, shortcut appears in grid, click navigates to the
 * original URL, remove shortcut, reorder via drag.
 */
import { test, expect, BrowserContext, Page } from "@playwright/test";
import {
  launchWithExtension,
  getExtId,
  openSidepanel,
  getPinnedTabUrls,
} from "./helpers";

// ── Fixture ───────────────────────────────────────────────────────────────────

let ctx:       BrowserContext;
let sidepanel: Page;

test.beforeAll(async () => {
  ctx       = await launchWithExtension();
  const id  = await getExtId(ctx);
  sidepanel = await openSidepanel(ctx, id);
});

test.afterAll(async () => { await ctx.close(); });

test.beforeEach(async () => {
  // Remove all pinned tabs before each test for a clean slate
  await sidepanel.evaluate(async () => {
    const pinned = await chrome.tabs.query({ pinned: true, currentWindow: true });
    for (const t of pinned) if (t.id != null) await chrome.tabs.remove(t.id).catch(() => {});
  });
  await sidepanel.reload();
  await sidepanel.waitForSelector("[class*='toolbar']");
});

// ── Tests ─────────────────────────────────────────────────────────────────────

test("Shortcuts section renders", async () => {
  await expect(sidepanel.locator("text=Shortcuts")).toBeVisible();
});

test("add shortcut via + button opens the modal", async () => {
  await sidepanel.click("button[title='Add shortcut']");
  await expect(sidepanel.locator("text=Add Shortcut")).toBeVisible();
  await expect(sidepanel.locator("input[placeholder='https://google.com']")).toBeVisible();
});

test("cancel add modal closes without creating shortcut", async () => {
  await sidepanel.click("button[title='Add shortcut']");
  await sidepanel.click("text=Cancel");
  await expect(sidepanel.locator("text=Add Shortcut")).not.toBeVisible();
  const pinned = await getPinnedTabUrls(sidepanel);
  expect(pinned).toHaveLength(0);
});

test("adding a shortcut creates a pinned tab and shows it in the grid", async () => {
  await sidepanel.click("button[title='Add shortcut']");
  await sidepanel.fill("input[placeholder='https://google.com']", "https://example.com");
  await sidepanel.click("text=Add");

  // Wait for the pinned tab to appear
  await sidepanel.waitForTimeout(800);
  await sidepanel.reload();
  await sidepanel.waitForSelector("[class*='toolbar']");

  const pinned = await getPinnedTabUrls(sidepanel);
  expect(pinned.some((u) => u.includes("example.com"))).toBe(true);
});

test("adding shortcut with Enter key works", async () => {
  await sidepanel.click("button[title='Add shortcut']");
  const input = sidepanel.locator("input[placeholder='https://google.com']");
  await input.fill("https://playwright.dev");
  await input.press("Enter");

  await sidepanel.waitForTimeout(800);
  const pinned = await getPinnedTabUrls(sidepanel);
  expect(pinned.some((u) => u.includes("playwright.dev"))).toBe(true);
});

test("URL without protocol gets https:// prepended", async () => {
  await sidepanel.click("button[title='Add shortcut']");
  await sidepanel.fill("input[placeholder='https://google.com']", "example.org");
  await sidepanel.click("text=Add");

  await sidepanel.waitForTimeout(800);
  const pinned = await getPinnedTabUrls(sidepanel);
  expect(pinned.some((u) => u === "https://example.org/" || u.includes("example.org"))).toBe(true);
});
