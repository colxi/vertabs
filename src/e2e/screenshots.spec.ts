/**
 * Playwright screenshot script — generates marketing assets for docs/index.html.
 *
 * Run with:
 *   npx playwright test src/e2e/screenshots.spec.ts --reporter=list --timeout=90000
 *
 * Outputs to: docs/assets/
 */

import { chromium, test } from "@playwright/test";
import path from "path";
import fs from "fs";
import os from "os";

const DIST    = path.resolve(__dirname, "../../dist");
const OUT_DIR = path.resolve(__dirname, "../../docs/assets");

const SIDEBAR_W = 340;
const SIDEBAR_H = 720;

async function launchFresh() {
  // Use a unique temp dir per launch so no state bleeds from previous runs
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "vertabs-ss-"));
  return chromium.launchPersistentContext(tmpDir, {
    headless: false,
    args: [
      `--disable-extensions-except=${DIST}`,
      `--load-extension=${DIST}`,
      "--no-sandbox",
      "--force-device-scale-factor=1",
    ],
    viewport: { width: SIDEBAR_W, height: SIDEBAR_H },
    deviceScaleFactor: 1,
  });
}

async function getExtId(ctx: Awaited<ReturnType<typeof launchFresh>>) {
  let sw = ctx.serviceWorkers()[0];
  if (!sw) sw = await ctx.waitForEvent("serviceworker");
  return new URL(sw.url()).hostname;
}

async function seedBookmarks(page: import("@playwright/test").Page) {
  await page.evaluate(async () => {
    const bar = await chrome.bookmarks.getChildren("1");
    for (const b of bar) await chrome.bookmarks.removeTree(b.id).catch(() => {});

    const work = await chrome.bookmarks.create({ parentId: "1", title: "Work" });
    await chrome.bookmarks.create({ parentId: work.id, title: "Linear — Project Management", url: "https://linear.app" });
    await chrome.bookmarks.create({ parentId: work.id, title: "Figma — Design Tool",         url: "https://figma.com" });
    await chrome.bookmarks.create({ parentId: work.id, title: "Vercel — Deployments",        url: "https://vercel.com" });
    await chrome.bookmarks.create({ parentId: work.id, title: "Jira — Issue Tracker",        url: "https://atlassian.com/software/jira" });

    const docs = await chrome.bookmarks.create({ parentId: "1", title: "Docs & Reference" });
    await chrome.bookmarks.create({ parentId: docs.id, title: "MDN Web Docs",         url: "https://developer.mozilla.org" });
    await chrome.bookmarks.create({ parentId: docs.id, title: "React Docs",           url: "https://react.dev" });
    await chrome.bookmarks.create({ parentId: docs.id, title: "TypeScript Handbook", url: "https://typescriptlang.org/docs" });
    await chrome.bookmarks.create({ parentId: docs.id, title: "Vite Docs",            url: "https://vitejs.dev" });
    await chrome.bookmarks.create({ parentId: docs.id, title: "Can I Use",            url: "https://caniuse.com" });

    const read = await chrome.bookmarks.create({ parentId: "1", title: "Reading" });
    await chrome.bookmarks.create({ parentId: read.id, title: "Hacker News",  url: "https://news.ycombinator.com" });
    await chrome.bookmarks.create({ parentId: read.id, title: "lobste.rs",    url: "https://lobste.rs" });
    await chrome.bookmarks.create({ parentId: read.id, title: "CSS-Tricks",   url: "https://css-tricks.com" });

    await chrome.bookmarks.create({ parentId: "1", title: "Excalidraw",       url: "https://excalidraw.com" });
  });
}

async function seedTabs(ctx: import("@playwright/test").BrowserContext) {
  // Close any about:blank tabs first
  for (const p of ctx.pages()) {
    if (p.url() === "about:blank") await p.close().catch(() => {});
  }

  // Only 3 real tabs — enough to look populated, not overwhelming
  const urls = [
    "https://github.com",
    "https://linear.app",
    "https://figma.com",
  ];
  for (const url of urls) {
    const p = await ctx.newPage();
    await p.goto(url, { waitUntil: "domcontentloaded", timeout: 15_000 }).catch(() => {});
  }
}

async function seedShortcuts(ctx: import("@playwright/test").BrowserContext, extId: string) {
  const shortcuts = [
    "https://github.com",
    "https://linear.app",
    "https://figma.com",
    "https://notion.so",
  ];

  // Open all pages in parallel and wait for them to fully load
  await Promise.all(shortcuts.map(async (url) => {
    const p = await ctx.newPage();
    await p.goto(url, { waitUntil: "load", timeout: 20_000 }).catch(() =>
      p.goto(url, { waitUntil: "domcontentloaded", timeout: 10_000 }).catch(() => {})
    );
  }));

  // Extra settle for favicons
  await new Promise((r) => setTimeout(r, 1000));

  // Now pin them all via the extension helper
  const helper = await ctx.newPage();
  await helper.goto(`chrome-extension://${extId}/src/sidepanel/index.html`);
  await helper.waitForSelector("[class*='toolbar']", { timeout: 10_000 });

  for (const url of shortcuts) {
    await helper.evaluate(async (tabUrl) => {
      const tabs = await chrome.tabs.query({});
      const tab = tabs.find((t) => t.url?.startsWith(tabUrl));
      if (tab?.id) await chrome.tabs.update(tab.id, { pinned: true });
    }, url);
  }

    await helper.close();
    await new Promise((r) => setTimeout(r, 500));
}



test.describe("Marketing screenshots", () => {
  test.setTimeout(120_000);

  // ── SHOT 1: Expanded sidebar ───────────────────────────────────────────────
  test("sidebar-expanded", async () => {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const ctx = await launchFresh();
    const extId = await getExtId(ctx);
    const base  = `chrome-extension://${extId}/src/sidepanel/index.html`;

    const page = await ctx.newPage();
    await page.setViewportSize({ width: SIDEBAR_W, height: SIDEBAR_H });
    await page.goto(base);
    await page.waitForSelector("[class*='toolbar']", { timeout: 10_000 });
    await seedBookmarks(page);

    // Create pinned tabs in the same window (same as sidepanel)
    // and wait for each to load before moving to the next
    const shortcutUrls = [
      "https://linear.app",
      "https://figma.com",
      "https://vercel.com",
      "https://excalidraw.com",
    ];
    for (const url of shortcutUrls) {
      const newPage = ctx.waitForEvent("page");
      await page.evaluate((u) => chrome.tabs.create({ url: u, active: false }), url);
      const p = await newPage;
      await p.waitForLoadState("load", { timeout: 15_000 }).catch(() => {});
    }

    // Also open 3 regular (non-pinned) tabs
    const tabOnlyUrls = ["https://news.ycombinator.com", "https://developer.mozilla.org", "https://excalidraw.com"];
    for (const url of tabOnlyUrls) {
      const newPage = ctx.waitForEvent("page");
      await page.evaluate((u) => chrome.tabs.create({ url: u, active: false }), url);
      const p = await newPage;
      await p.waitForLoadState("domcontentloaded", { timeout: 10_000 }).catch(() => {});
    }

    // Close about:blank
    for (const p of ctx.pages()) {
      if (p.url() === "about:blank") await p.close().catch(() => {});
    }

    // Pin the shortcut tabs — match by domain since some URLs redirect
    await page.bringToFront();
    await page.evaluate(async (urls) => {
      const allTabs = await chrome.tabs.query({ currentWindow: true });
      for (const tab of allTabs) {
        const tabHost = tab.url ? new URL(tab.url).hostname.replace(/^www\./, "") : "";
        const isShortcut = urls.some((u: string) => {
          const shortcutHost = new URL(u).hostname.replace(/^www\./, "");
          return tabHost === shortcutHost || tabHost.endsWith("." + shortcutHost) || shortcutHost.endsWith("." + tabHost);
        });
        if (isShortcut && tab.id) await chrome.tabs.update(tab.id, { pinned: true });
      }
    }, shortcutUrls);

    // Reload sidebar — now it sees pinned tabs in same window with loaded favicons
    await page.reload();
    await page.waitForSelector("[class*='toolbar']", { timeout: 10_000 });
    await page.waitForTimeout(2000);

    await page.screenshot({ path: path.join(OUT_DIR, "sidebar-expanded.png") });
    console.log("✓ sidebar-expanded.png");
    await ctx.close();
  });

  // ── SHOT 2: Bookmarks search ───────────────────────────────────────────────
  test("bookmarks-search", async () => {
    const ctx = await launchFresh();
    const extId = await getExtId(ctx);
    const base  = `chrome-extension://${extId}/src/sidepanel/index.html`;

    const page = await ctx.newPage();
    await page.setViewportSize({ width: SIDEBAR_W, height: SIDEBAR_H });
    await page.goto(base);
    await page.waitForSelector("[class*='toolbar']", { timeout: 10_000 });
    await seedBookmarks(page);

    // Seed shortcuts in same window
    const shortcutUrls = ["https://linear.app", "https://figma.com", "https://vercel.com", "https://excalidraw.com"];
    for (const url of shortcutUrls) {
      const np = ctx.waitForEvent("page");
      await page.evaluate((u) => chrome.tabs.create({ url: u, active: false }), url);
      const p = await np;
      await p.waitForLoadState("load", { timeout: 15_000 }).catch(() => {});
    }
    for (const p of ctx.pages()) {
      if (p.url() === "about:blank") await p.close().catch(() => {});
    }
    await page.bringToFront();
    await page.evaluate(async (urls) => {
      const allTabs = await chrome.tabs.query({ currentWindow: true });
      for (const tab of allTabs) {
        const tabHost = tab.url ? new URL(tab.url).hostname.replace(/^www\./, "") : "";
        const isShortcut = urls.some((u: string) => {
          const h = new URL(u).hostname.replace(/^www\./, "");
          return tabHost === h || tabHost.endsWith("." + h) || h.endsWith("." + tabHost);
        });
        if (isShortcut && tab.id) await chrome.tabs.update(tab.id, { pinned: true });
      }
    }, shortcutUrls);

    // Reload sidebar with clean state
    await page.reload();
    await page.waitForSelector("[class*='toolbar']", { timeout: 10_000 });
    await page.waitForTimeout(1500);

    // Collapse shortcuts + tabs
    const headers = page.locator("[class*='sectionHeader']");
    const count = await headers.count();
    for (let i = 0; i < count; i++) {
      const text = await headers.nth(i).textContent() ?? "";
      if (text.toLowerCase().includes("shortcuts") || text.toLowerCase().includes("open tabs")) {
        await headers.nth(i).click();
        await page.waitForTimeout(200);
      }
    }
    await page.waitForTimeout(300);

    // Type in bookmarks search — broad term to get more results
    const searchInput = page.locator("input[placeholder*='Search bookmarks']");
    await searchInput.waitFor({ state: "visible", timeout: 5_000 });
    await searchInput.fill("docs");
    await page.waitForTimeout(500);

    // Hide the config page element — it lives in the DOM even when not active
    await page.evaluate(() => {
      const pages = document.querySelectorAll<HTMLElement>("[class*='page']");
      pages.forEach((p) => {
        if (p.querySelector("[class*='sectionHeader']") && p.querySelector("[class*='backBtn']")) {
          p.style.display = "none";
        }
      });
    });

    const tmpPath = path.join(OUT_DIR, "_bookmarks-search-raw.png");
    await page.screenshot({ path: tmpPath });
    const { execSync } = await import("child_process");
    execSync(`magick "${tmpPath}" -crop ${SIDEBAR_W}x${SIDEBAR_H}+0+0 +repage "${path.join(OUT_DIR, "bookmarks-search.png")}"`);
    fs.unlinkSync(tmpPath);

    console.log("✓ bookmarks-search.png");
    await ctx.close();
  });

  // ── SHOT 3: Compact sidebar ────────────────────────────────────────────────
  test("sidebar-compact", async () => {
    const ctx = await chromium.launchPersistentContext("", {
      headless: false,
      args: [
        `--disable-extensions-except=${DIST}`,
        `--load-extension=${DIST}`,
        "--no-sandbox",
      ],
      viewport: { width: 340, height: SIDEBAR_H },
    });
    const extId = await getExtId(ctx);
    const base  = `chrome-extension://${extId}/src/sidepanel/index.html`;

    const page = await ctx.newPage();
    await page.setViewportSize({ width: 340, height: SIDEBAR_H });
    await page.goto(base);
    await page.waitForSelector("[class*='toolbar']", { timeout: 10_000 });
    await seedBookmarks(page);

    // Switch to compact via the fold button
    const foldBtn = page.locator("[class*='toolBtn']").filter({ hasText: "«" }).or(
      page.locator("[class*='toolBtn']").filter({ hasText: "»" })
    ).first();
    if (await foldBtn.isVisible()) {
      await foldBtn.click();
      await page.waitForTimeout(400);
    }

    await page.screenshot({ path: path.join(OUT_DIR, "sidebar-compact.png") });
    console.log("✓ sidebar-compact.png");
    await ctx.close();
  });

  // ── SHOT 4: Settings — Appearance ─────────────────────────────────────────
  test("settings-appearance", async () => {
    const ctx = await launchFresh();
    const extId = await getExtId(ctx);
    const base  = `chrome-extension://${extId}/src/sidepanel/index.html`;

    const page = await ctx.newPage();
    await page.setViewportSize({ width: SIDEBAR_W, height: SIDEBAR_H });
    await page.goto(base);
    await page.waitForSelector("[class*='toolbar']", { timeout: 10_000 });
    await page.waitForTimeout(400);

    // Click gear
    const gearBtn = page.locator("[class*='toolBtn']").filter({ hasText: "⚙" });
    await gearBtn.waitFor({ state: "visible", timeout: 5_000 });
    await gearBtn.click();
    await page.waitForTimeout(500);

    // Open Appearance section
    const headers = page.locator("[class*='sectionHeader']");
    for (let i = 0; i < await headers.count(); i++) {
      const text = await headers.nth(i).textContent() ?? "";
      if (text.toLowerCase().includes("appearance")) {
        await headers.nth(i).click();
        await page.waitForTimeout(400);
        break;
      }
    }

    await page.screenshot({ path: path.join(OUT_DIR, "settings-appearance.png") });
    console.log("✓ settings-appearance.png");
    await ctx.close();
  });

  // ── SHOT 5: Command palette ────────────────────────────────────────────────
  test("command-palette", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "vertabs-ss-"));
    const ctx = await chromium.launchPersistentContext(tmpDir, {
      headless: false,
      args: [
        `--disable-extensions-except=${DIST}`,
        `--load-extension=${DIST}`,
        "--no-sandbox",
        "--force-device-scale-factor=1",
      ],
      viewport: { width: 900, height: 600 },
      deviceScaleFactor: 1,
    });
    const extId = await getExtId(ctx);

    // Seed bookmarks with multiple entries so search shows several results
    const seed = await ctx.newPage();
    await seed.goto(`chrome-extension://${extId}/src/sidepanel/index.html`);
    await seed.waitForSelector("[class*='toolbar']", { timeout: 10_000 });
    await seedBookmarks(seed);
    await seed.close();

    const page = await ctx.newPage();
    await page.goto(`chrome-extension://${extId}/src/commandPalette/index.html`);
    await page.setViewportSize({ width: 900, height: 600 });
    await page.waitForSelector("[class*='input']", { timeout: 10_000 });
    await page.waitForTimeout(400);

    // Type a short query that matches multiple results across categories
    await page.keyboard.type("lin");
    await page.waitForTimeout(600);

    // Force dark page background so no white shows below the panel
    await page.evaluate(() => {
      document.documentElement.style.background = "#0e0f12";
      document.body.style.background = "#0e0f12";
    });

    // Measure panel bounds and crop precisely to it
    const panelBox = await page.evaluate(() => {
      const panel = document.querySelector("[class*='panel']") as HTMLElement | null;
      if (!panel) return null;
      const r = panel.getBoundingClientRect();
      return { top: Math.floor(r.top), height: Math.ceil(r.height), width: Math.ceil(r.width) };
    });

    const tmpPath = path.join(OUT_DIR, "_command-palette-raw.png");
    await page.screenshot({ path: tmpPath });
    const { execSync } = await import("child_process");
    const cropW = panelBox?.width  ?? 900;
    const cropH = panelBox?.height ?? 400;
    const offsetY = panelBox?.top  ?? 0;
    execSync(`magick "${tmpPath}" -crop ${cropW}x${cropH}+0+${offsetY} +repage "${path.join(OUT_DIR, "command-palette.png")}"`);
    fs.unlinkSync(tmpPath);

    console.log("✓ command-palette.png");
    await ctx.close();
  });
});
