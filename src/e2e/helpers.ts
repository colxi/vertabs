/**
 * Shared helpers for Vertabs E2E tests.
 *
 * Every spec file imports from here so the launch/setup logic lives in one place.
 */
import { chromium, BrowserContext, Page } from "@playwright/test";
import path from "path";

export const DIST = path.resolve(__dirname, "../../dist");

// ── Browser launch ────────────────────────────────────────────────────────────

export async function launchWithExtension(): Promise<BrowserContext> {
  return chromium.launchPersistentContext("", {
    headless: false,
    args: [
      `--disable-extensions-except=${DIST}`,
      `--load-extension=${DIST}`,
      "--no-sandbox",
    ],
  });
}

export async function getExtId(ctx: BrowserContext): Promise<string> {
  let sw = ctx.serviceWorkers()[0];
  if (!sw) sw = await ctx.waitForEvent("serviceworker");
  return new URL(sw.url()).hostname;
}

export async function openSidepanel(ctx: BrowserContext, extId: string): Promise<Page> {
  const page = await ctx.newPage();
  await page.goto(`chrome-extension://${extId}/src/sidepanel/index.html`);
  await page.waitForSelector("[class*='toolbar']", { timeout: 10_000 });
  return page;
}

// ── Chrome bookmarks helpers ──────────────────────────────────────────────────

export async function clearBookmarksBar(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const bar = await chrome.bookmarks.getChildren("1");
    for (const b of bar) await chrome.bookmarks.removeTree(b.id).catch(() => {});
  });
}

export async function seedBookmarks(
  page: Page,
  items: { title: string; url: string; parentId?: string }[],
): Promise<string[]> {
  return page.evaluate(async (items) => {
    const ids: string[] = [];
    for (const item of items) {
      const node = await chrome.bookmarks.create({
        parentId: item.parentId ?? "1",
        title: item.title,
        url: item.url,
      });
      ids.push(node.id);
    }
    return ids;
  }, items);
}

export async function getBookmarkBarTitles(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const children = await chrome.bookmarks.getChildren("1");
    return children.map((c) => c.title);
  });
}

export async function createBookmarkFolder(
  page: Page,
  title: string,
  parentId = "1",
): Promise<string> {
  return page.evaluate(
    async ({ title, parentId }) => {
      const node = await chrome.bookmarks.create({ parentId, title });
      return node.id;
    },
    { title, parentId },
  );
}

// ── Chrome tabs helpers ───────────────────────────────────────────────────────

export async function getTabTitles(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const tabs = await chrome.tabs.query({ currentWindow: true });
    return tabs.map((t) => t.title ?? "");
  });
}

export async function closeAllNonPinnedTabs(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const tabs = await chrome.tabs.query({ currentWindow: true, pinned: false });
    // keep the first (current) tab
    for (const t of tabs.slice(1)) {
      if (t.id != null) await chrome.tabs.remove(t.id).catch(() => {});
    }
  });
}

export async function getPinnedTabUrls(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const tabs = await chrome.tabs.query({ pinned: true, currentWindow: true });
    return tabs.map((t) => t.url ?? "");
  });
}

// ── Drag helper ───────────────────────────────────────────────────────────────
// Dispatches HTML5 drag events directly — reliable across all drag targets.

export async function dragTo(
  page: Page,
  sourceSelector: string,
  targetSelector: string,
  position: "before" | "after" | "center" = "after",
): Promise<void> {
  const src = page.locator(sourceSelector).first();
  const tgt = page.locator(targetSelector).first();

  const srcBox = await src.boundingBox();
  const tgtBox = await tgt.boundingBox();
  if (!srcBox || !tgtBox) throw new Error(`dragTo: could not find elements`);

  const srcX = srcBox.x + srcBox.width / 2;
  const srcY = srcBox.y + srcBox.height / 2;
  const tgtX = tgtBox.x + tgtBox.width / 2;
  const tgtY =
    position === "before" ? tgtBox.y + tgtBox.height * 0.2
    : position === "after"  ? tgtBox.y + tgtBox.height * 0.8
    : tgtBox.y + tgtBox.height / 2;

  await page.evaluate(
    ({ srcX, srcY, tgtX, tgtY }) => {
      const dt = new DataTransfer();
      const srcEl = document.elementFromPoint(srcX, srcY) as HTMLElement;
      const tgtEl = document.elementFromPoint(tgtX, tgtY) as HTMLElement;
      if (!srcEl || !tgtEl) return;

      srcEl.dispatchEvent(new DragEvent("dragstart", { bubbles: true, cancelable: true, dataTransfer: dt, clientX: srcX, clientY: srcY }));
      tgtEl.dispatchEvent(new DragEvent("dragover",  { bubbles: true, cancelable: true, dataTransfer: dt, clientX: tgtX, clientY: tgtY }));
      tgtEl.dispatchEvent(new DragEvent("dragover",  { bubbles: true, cancelable: true, dataTransfer: dt, clientX: tgtX, clientY: tgtY }));
      tgtEl.dispatchEvent(new DragEvent("drop",      { bubbles: true, cancelable: true, dataTransfer: dt, clientX: tgtX, clientY: tgtY }));
      srcEl.dispatchEvent(new DragEvent("dragend",   { bubbles: true, cancelable: true, dataTransfer: dt, clientX: tgtX, clientY: tgtY }));
    },
    { srcX, srcY, tgtX, tgtY },
  );

  await page.waitForTimeout(600);
}
