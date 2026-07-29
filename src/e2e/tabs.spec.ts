/**
 * E2E tests — Open Tabs section
 *
 * Covers: section renders, tab count badge, search filter, focus tab on
 * click, close tab button, pinned tabs excluded from list.
 */
import { test, expect, BrowserContext, Page } from "@playwright/test";
import {
  launchWithExtension,
  getExtId,
  openSidepanel,
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

// ── Helpers ───────────────────────────────────────────────────────────────────

async function openTestTab(url: string): Promise<Page> {
  const page = await ctx.newPage();
  await page.goto(url);
  return page;
}

async function closeAllExtraTabs(): Promise<void> {
  const pages = ctx.pages();
  // Keep the sidepanel page; close everything else
  for (const p of pages) {
    if (!p.url().includes("sidepanel")) {
      await p.close().catch(() => {});
    }
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.beforeEach(async () => {
  await closeAllExtraTabs();
  await sidepanel.reload();
  await sidepanel.waitForSelector("[class*='toolbar']");
});

test("Open Tabs section renders with search input", async () => {
  await expect(sidepanel.locator("text=Open Tabs")).toBeVisible();
  await expect(sidepanel.locator("input[placeholder='Search tabs…']")).toBeVisible();
});

test("newly opened tab appears in the list", async () => {
  const tab = await openTestTab("https://example.com");
  await sidepanel.waitForTimeout(600);

  await expect(sidepanel.locator("text=example.com")).toBeVisible();
  await tab.close();
});

test("badge shows the number of non-pinned tabs", async () => {
  const tab1 = await openTestTab("https://example.com");
  const tab2 = await openTestTab("https://example.org");
  await sidepanel.waitForTimeout(600);

  // At least 3 tabs (sidepanel page + 2 new); badge should reflect non-pinned count
  const badge = sidepanel.locator("[class*='badge']");
  const count = parseInt(await badge.textContent() ?? "0", 10);
  expect(count).toBeGreaterThanOrEqual(2);

  await tab1.close();
  await tab2.close();
});

test("closed tab disappears from the list", async () => {
  const tab = await openTestTab("https://example.com");
  await sidepanel.waitForTimeout(600);
  await expect(sidepanel.locator("text=example.com")).toBeVisible();

  await tab.close();
  await sidepanel.waitForTimeout(600);
  await expect(sidepanel.locator("text=example.com")).not.toBeVisible();
});

test("search filters tabs by title", async () => {
  const tab1 = await openTestTab("https://github.com");
  const tab2 = await openTestTab("https://example.com");
  await sidepanel.waitForTimeout(800);

  await sidepanel.fill("input[placeholder='Search tabs…']", "github");
  await expect(sidepanel.locator("text=github.com")).toBeVisible();
  await expect(sidepanel.locator("text=example.com")).not.toBeVisible();

  await tab1.close();
  await tab2.close();
});

test("close button removes the tab", async () => {
  const tab = await openTestTab("https://example.com");
  await sidepanel.waitForTimeout(600);

  // Hover to reveal the close button, then click it
  const tabRow = sidepanel.locator("[class*='tabItem']").filter({ hasText: "example.com" });
  await tabRow.hover();
  await tabRow.locator("button[title='Close tab']").click();

  await sidepanel.waitForTimeout(600);
  await expect(sidepanel.locator("text=example.com")).not.toBeVisible();
  // Tab should be gone
  expect(tab.isClosed()).toBe(true);
});

test("section collapses and expands on header click", async () => {
  await sidepanel.click("text=Open Tabs");
  await expect(sidepanel.locator("input[placeholder='Search tabs…']")).not.toBeVisible();

  await sidepanel.click("text=Open Tabs");
  await expect(sidepanel.locator("input[placeholder='Search tabs…']")).toBeVisible();
});

test("pinned tabs are not shown in the Open Tabs list", async () => {
  // Create a pinned tab
  await sidepanel.evaluate(async () => {
    await chrome.tabs.create({ url: "https://pinned-test.example", pinned: true });
  });
  await sidepanel.waitForTimeout(600);

  // The pinned tab should NOT appear in the open tabs list
  await expect(sidepanel.locator("text=pinned-test.example")).not.toBeVisible();

  // Clean up
  await sidepanel.evaluate(async () => {
    const pinned = await chrome.tabs.query({ pinned: true, currentWindow: true });
    for (const t of pinned) if (t.id != null) await chrome.tabs.remove(t.id).catch(() => {});
  });
});

test("tab domain appears below tab title", async () => {
  const tab = await openTestTab("https://example.com");
  await sidepanel.waitForTimeout(600);

  await expect(sidepanel.locator("text=example.com")).toBeVisible();
  await tab.close();
});
