/**
 * E2E tests for bookmark drag-and-drop reordering.
 *
 * Uses manual mouse events (mousedown → mousemove → mouseup) with
 * intermediate hover steps to properly fire dragover events on each item.
 */
import { test, expect, Page, BrowserContext } from "@playwright/test";
import path from "path";
import { chromium } from "@playwright/test";

const DIST = path.resolve(__dirname, "../../dist");

// ── Fixture ───────────────────────────────────────────────────────────────────

async function launchWithExtension() {
  return chromium.launchPersistentContext("", {
    headless: false,
    args: [
      `--disable-extensions-except=${DIST}`,
      `--load-extension=${DIST}`,
      "--no-sandbox",
    ],
  });
}

async function getExtId(ctx: BrowserContext): Promise<string> {
  let sw = ctx.serviceWorkers()[0];
  if (!sw) sw = await ctx.waitForEvent("serviceworker");
  return new URL(sw.url()).hostname;
}

// ── Bookmark helpers ──────────────────────────────────────────────────────────

async function seedBookmarks(bg: Page, titles: string[]): Promise<void> {
  await bg.evaluate(async (titles) => {
    const bar = await chrome.bookmarks.getChildren("1");
    for (const b of bar) await chrome.bookmarks.remove(b.id).catch(() => {});
    for (const title of titles) {
      await chrome.bookmarks.create({
        parentId: "1",
        title,
        url: `https://${title.toLowerCase()}.com`,
      });
    }
  }, titles);
}

async function getOrder(bg: Page): Promise<string[]> {
  return bg.evaluate(async () => {
    const children = await chrome.bookmarks.getChildren("1");
    return children.map((c) => c.title);
  });
}

// ── Drag helper ───────────────────────────────────────────────────────────────
// Performs a real HTML5 drag sequence:
//   1. Dispatch dragstart on the source element
//   2. Move through intermediate points firing dragover
//   3. Dispatch drop on the final target
//   4. Dispatch dragend on the source
//
// This matches how browsers actually fire these events.

async function dragBookmark(
  page: Page,
  sourceTitle: string,
  targetTitle: string,
  position: "before" | "after",
): Promise<void> {
  // Get bounding boxes
  const src = page.locator(`text=${sourceTitle}`).first();
  const tgt = page.locator(`text=${targetTitle}`).first();

  const srcBox = await src.boundingBox();
  const tgtBox = await tgt.boundingBox();

  if (!srcBox || !tgtBox) throw new Error(`Could not find ${sourceTitle} or ${targetTitle}`);

  const srcX = srcBox.x + srcBox.width / 2;
  const srcY = srcBox.y + srcBox.height / 2;

  // Drop in top 25% for "before", bottom 75% for "after"
  const tgtX = tgtBox.x + tgtBox.width / 2;
  const tgtY = position === "before"
    ? tgtBox.y + tgtBox.height * 0.2
    : tgtBox.y + tgtBox.height * 0.8;

  // Use the HTML5 drag-and-drop simulation via CDP / dispatchEvent
  await page.evaluate(
    ({ srcX, srcY, tgtX, tgtY }) => {
      // Find element at source position
      const srcEl = document.elementFromPoint(srcX, srcY) as HTMLElement;
      const tgtEl = document.elementFromPoint(tgtX, tgtY) as HTMLElement;
      if (!srcEl || !tgtEl) return;

      const dt = new DataTransfer();

      // dragstart
      srcEl.dispatchEvent(new DragEvent("dragstart", {
        bubbles: true, cancelable: true, dataTransfer: dt,
        clientX: srcX, clientY: srcY,
      }));

      // dragover on target — this is what sets dropInfo
      tgtEl.dispatchEvent(new DragEvent("dragover", {
        bubbles: true, cancelable: true, dataTransfer: dt,
        clientX: tgtX, clientY: tgtY,
      }));
      // Fire it twice to ensure it registers (some handlers debounce)
      tgtEl.dispatchEvent(new DragEvent("dragover", {
        bubbles: true, cancelable: true, dataTransfer: dt,
        clientX: tgtX, clientY: tgtY,
      }));

      // drop on target
      tgtEl.dispatchEvent(new DragEvent("drop", {
        bubbles: true, cancelable: true, dataTransfer: dt,
        clientX: tgtX, clientY: tgtY,
      }));

      // dragend on source
      srcEl.dispatchEvent(new DragEvent("dragend", {
        bubbles: true, cancelable: true, dataTransfer: dt,
        clientX: tgtX, clientY: tgtY,
      }));
    },
    { srcX, srcY, tgtX, tgtY },
  );

  // Wait for Chrome bookmarks API to process the move
  await page.waitForTimeout(800);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe("Bookmark drag-and-drop — exact failure scenarios", () => {
  let ctx: BrowserContext;
  let sidepanel: Page;
  let bg: Page;

  test.beforeAll(async () => {
    ctx       = await launchWithExtension();
    const id  = await getExtId(ctx);
    sidepanel = await ctx.newPage();
    await sidepanel.goto(`chrome-extension://${id}/src/sidepanel/index.html`);
    await sidepanel.waitForSelector("[class*='toolbar']", { timeout: 10_000 });
    // Use the sidepanel page for chrome API calls — it has full extension access
    bg = sidepanel;
  });

  test.afterAll(async () => {
    await ctx.close();
  });

  test.beforeEach(async () => {
    // Ensure bookmarks section is visible and expanded
    await sidepanel.reload();
    await sidepanel.waitForSelector("[class*='toolbar']");
  });

  // ── Scenario A (reported bug): drag item1 to between item2 and item3 ────────
  // Expected: [item2, item1, item3, item4]
  // Actual (broken): nothing happens

  test("Scenario A: drag item1 after item2 — [1,2,3,4] → [2,1,3,4]", async () => {
    await seedBookmarks(bg, ["Item1", "Item2", "Item3", "Item4"]);
    await sidepanel.reload();
    await sidepanel.waitForSelector("text=Item1");

    // Log positions before drag for debugging
    const beforeOrder = await getOrder(bg);
    console.log("Before:", beforeOrder);

    await dragBookmark(sidepanel, "Item1", "Item2", "after");

    const afterOrder = await getOrder(bg);
    console.log("After:", afterOrder);

    expect(afterOrder).toEqual(["Item2", "Item1", "Item3", "Item4"]);
  });

  // ── Scenario B (reported bug): drag item1 to between item3 and item4 ────────
  // Expected: [item2, item3, item1, item4]
  // Actual (broken): lands between item2 and item3 (off by 1)

  test("Scenario B: drag item1 after item3 — [1,2,3,4] → [2,3,1,4]", async () => {
    await seedBookmarks(bg, ["Item1", "Item2", "Item3", "Item4"]);
    await sidepanel.reload();
    await sidepanel.waitForSelector("text=Item1");

    const beforeOrder = await getOrder(bg);
    console.log("Before:", beforeOrder);

    await dragBookmark(sidepanel, "Item1", "Item3", "after");

    const afterOrder = await getOrder(bg);
    console.log("After:", afterOrder);

    expect(afterOrder).toEqual(["Item2", "Item3", "Item1", "Item4"]);
  });

  // ── Additional forward moves ───────────────────────────────────────────────

  test("drag item1 after item4 (last) — [1,2,3,4] → [2,3,4,1]", async () => {
    await seedBookmarks(bg, ["Item1", "Item2", "Item3", "Item4"]);
    await sidepanel.reload();
    await sidepanel.waitForSelector("text=Item1");

    await dragBookmark(sidepanel, "Item1", "Item4", "after");

    const order = await getOrder(bg);
    console.log("drag1-after-4:", order);
    expect(order).toEqual(["Item2", "Item3", "Item4", "Item1"]);
  });

  test("drag item2 after item3 — [1,2,3,4] → [1,3,2,4]", async () => {
    await seedBookmarks(bg, ["Item1", "Item2", "Item3", "Item4"]);
    await sidepanel.reload();
    await sidepanel.waitForSelector("text=Item1");

    await dragBookmark(sidepanel, "Item2", "Item3", "after");

    const order = await getOrder(bg);
    console.log("drag2-after-3:", order);
    expect(order).toEqual(["Item1", "Item3", "Item2", "Item4"]);
  });

  // ── Backward moves ─────────────────────────────────────────────────────────

  test("drag item4 before item1 — [1,2,3,4] → [4,1,2,3]", async () => {
    await seedBookmarks(bg, ["Item1", "Item2", "Item3", "Item4"]);
    await sidepanel.reload();
    await sidepanel.waitForSelector("text=Item1");

    await dragBookmark(sidepanel, "Item4", "Item1", "before");

    const order = await getOrder(bg);
    console.log("drag4-before-1:", order);
    expect(order).toEqual(["Item4", "Item1", "Item2", "Item3"]);
  });

  test("drag item4 before item2 — [1,2,3,4] → [1,4,2,3]", async () => {
    await seedBookmarks(bg, ["Item1", "Item2", "Item3", "Item4"]);
    await sidepanel.reload();
    await sidepanel.waitForSelector("text=Item1");

    await dragBookmark(sidepanel, "Item4", "Item2", "before");

    const order = await getOrder(bg);
    console.log("drag4-before-2:", order);
    expect(order).toEqual(["Item1", "Item4", "Item2", "Item3"]);
  });
});
