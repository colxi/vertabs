/**
 * Shared Playwright fixture that launches a persistent Chromium context
 * with the Vertabs extension loaded from dist/.
 *
 * Each test gets:
 *   - `context`  — BrowserContext with the extension
 *   - `sidepanel` — Page pointing at the sidepanel HTML directly
 *                   (avoids needing a real tab; works for most UI tests)
 *   - `extId`    — The extension ID assigned by Chrome at runtime
 */
import { test as base, chromium, BrowserContext, Page } from "@playwright/test";
import path from "path";

const DIST = path.resolve(__dirname, "../../dist");

export const test = base.extend<{
  context:   BrowserContext;
  sidepanel: Page;
  extId:     string;
}>({
  // eslint-disable-next-line no-empty-pattern
  context: async ({}, use) => {
    const ctx = await chromium.launchPersistentContext("", {
      headless: false,
      args: [
        `--disable-extensions-except=${DIST}`,
        `--load-extension=${DIST}`,
        // Allow the service worker to run in tests
        "--no-sandbox",
      ],
    });
    await use(ctx);
    await ctx.close();
  },

  extId: async ({ context }, use) => {
    // The service worker page URL reveals the extension ID
    let sw = context.serviceWorkers()[0];
    if (!sw) sw = await context.waitForEvent("serviceworker");
    const id = new URL(sw.url()).hostname;
    await use(id);
  },

  sidepanel: async ({ context, extId }, use) => {
    const url  = `chrome-extension://${extId}/src/sidepanel/index.html`;
    const page = await context.newPage();
    await page.goto(url);
    // Wait for React to mount
    await page.waitForSelector("[class*='toolbar']", { timeout: 10_000 });
    await use(page);
  },
});

export { expect } from "@playwright/test";
