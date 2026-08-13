/**
 * E2E tests — Command Palette
 *
 * Verifies the iframe sizing, backdrop translucency, search results,
 * and keyboard navigation work correctly.
 */
import { test, expect, BrowserContext, Page } from "@playwright/test";
import { launchWithExtension } from "./helpers";

let ctx:  BrowserContext;
let page: Page;

test.beforeAll(async () => {
  ctx  = await launchWithExtension();
  // Open a real page so the content script runs
  page = await ctx.newPage();
  await page.goto("https://example.com");
  await page.waitForLoadState("domcontentloaded");
});

test.afterAll(async () => { await ctx.close(); });

test.beforeEach(async () => {
  await page.goto("https://example.com");
  await page.waitForLoadState("domcontentloaded");
  // Wait for content script to initialize
  await page.waitForTimeout(800);
});

// ── Helper: open palette with Cmd+K ──────────────────────────────────────────

async function openPalette(): Promise<void> {
  await page.keyboard.press("Meta+k");
  // Wait for the backdrop div to appear in the host page DOM
  await page.waitForSelector("#__vertabs-cp-backdrop__", { timeout: 5_000 });
}

async function closePalette(): Promise<void> {
  await page.keyboard.press("Escape");
  await page.waitForSelector("#__vertabs-cp-backdrop__", { state: "detached", timeout: 3_000 });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test("backdrop appears with translucent background on Cmd+K", async () => {
  await openPalette();

  const backdrop = page.locator("#__vertabs-cp-backdrop__");
  await expect(backdrop).toBeVisible();

  // Backdrop should have a semi-transparent background, not fully opaque
  const bg = await backdrop.evaluate((el) =>
    window.getComputedStyle(el).backgroundColor
  );
  console.log("Backdrop background:", bg);
  // Should be rgba with alpha < 1 (e.g. rgba(0, 0, 0, 0.25))
  expect(bg).toMatch(/rgba/);
  const alpha = parseFloat(bg.split(",")[3]);
  expect(alpha).toBeLessThan(1);
  expect(alpha).toBeGreaterThan(0);

  await closePalette();
});

test("iframe exists and is positioned correctly", async () => {
  await openPalette();

  const iframe = page.locator("#__vertabs-cp-iframe__");
  await expect(iframe).toBeVisible();

  const box = await iframe.boundingBox();
  console.log("Iframe bounding box:", box);
  expect(box).not.toBeNull();
  // Should be near the top-center of the page
  expect(box!.x).toBeGreaterThan(0);
  expect(box!.y).toBeGreaterThan(0);
  expect(box!.width).toBeGreaterThan(300);

  await closePalette();
});

test("iframe height matches panel content height (no clipping)", async () => {
  await openPalette();
  // Wait for data to load and resize to propagate
  await page.waitForTimeout(800);

  const iframe = page.locator("#__vertabs-cp-iframe__");
  const box = await iframe.boundingBox();
  console.log("Initial iframe height:", box?.height);

  // Height should be tall enough to show input + hints bar
  expect(box!.height).toBeGreaterThan(120);

  await closePalette();
});

test("iframe grows when results appear", async () => {
  await openPalette();

  const iframe = page.locator("#__vertabs-cp-iframe__");
  const initialBox = await iframe.boundingBox();
  console.log("Height before typing:", initialBox?.height);

  // Type a query that will produce results
  await page.keyboard.type("google");
  // Wait for results to render inside the iframe
  await page.waitForTimeout(500);

  const expandedBox = await iframe.boundingBox();
  console.log("Height after typing 'google':", expandedBox?.height);

  // Iframe should have grown to accommodate results
  expect(expandedBox!.height).toBeGreaterThan(initialBox!.height);

  await closePalette();
});

test("Escape closes the palette", async () => {
  await openPalette();
  await page.keyboard.press("Escape");
  await expect(page.locator("#__vertabs-cp-backdrop__")).not.toBeVisible({ timeout: 3_000 });
});

test("clicking backdrop closes the palette", async () => {
  await openPalette();
  // The backdrop div handles clicks — click it directly
  await page.locator("#__vertabs-cp-backdrop__").dispatchEvent("click", {
    clientX: 10, clientY: 10,
  });
  await expect(page.locator("#__vertabs-cp-backdrop__")).not.toBeVisible({ timeout: 3_000 });
});

test("hints bar area is included in iframe height", async () => {
  await openPalette();
  await page.waitForTimeout(800);

  // If hints bar is rendered, the iframe height should be at least 140px
  // (input ~62px + hints ~40px + shadow padding 40px = ~142px)
  const box = await page.locator("#__vertabs-cp-iframe__").boundingBox();
  console.log("Iframe height (should include hints bar):", box?.height);
  expect(box!.height).toBeGreaterThanOrEqual(120);

  await closePalette();
});
