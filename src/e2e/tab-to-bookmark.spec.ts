/**
 * E2E test: drag an open tab entry onto a bookmark folder.
 * This test reproduces the reported bug and verifies the fix.
 */
import { test, expect, BrowserContext, Page } from "@playwright/test";
import { launchWithExtension, getExtId, openSidepanel, clearBookmarksBar, createBookmarkFolder, getBookmarkBarTitles } from "./helpers";

let ctx:       BrowserContext;
let sidepanel: Page;
let extId:     string;

test.beforeAll(async () => {
  ctx      = await launchWithExtension();
  extId    = await getExtId(ctx);
  sidepanel = await openSidepanel(ctx, extId);
});

test.afterAll(async () => { await ctx.close(); });

test.beforeEach(async () => {
  await clearBookmarksBar(sidepanel);
});

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Open a real page so it appears in the Open Tabs list. */
async function openTabWithUrl(url: string): Promise<Page> {
  const page = await ctx.newPage();
  await page.goto(url);
  return page;
}

/** Dispatch a full HTML5 drag sequence from srcEl to tgtEl. */
async function dragElement(
  page: Page,
  srcSelector: string,
  tgtSelector: string,
): Promise<void> {
  const src = page.locator(srcSelector).first();
  const tgt = page.locator(tgtSelector).first();

  const srcBox = await src.boundingBox();
  const tgtBox = await tgt.boundingBox();
  if (!srcBox || !tgtBox) throw new Error(`Could not find elements: ${srcSelector} -> ${tgtSelector}`);

  const srcX = srcBox.x + srcBox.width / 2;
  const srcY = srcBox.y + srcBox.height / 2;
  const tgtX = tgtBox.x + tgtBox.width / 2;
  const tgtY = tgtBox.y + tgtBox.height / 2;

  await page.evaluate(({ srcX, srcY, tgtX, tgtY, tabType }) => {
    const srcEl = document.elementFromPoint(srcX, srcY) as HTMLElement;
    const tgtEl = document.elementFromPoint(tgtX, tgtY) as HTMLElement;
    if (!srcEl || !tgtEl) {
      console.error("Could not find elements at coordinates");
      return;
    }

    console.log("[test] src element:", srcEl.className, srcEl.tagName);
    console.log("[test] tgt element:", tgtEl.className, tgtEl.tagName);

    const dt = new DataTransfer();
    // Set the tab data that Tabs.tsx sets on dragStart
    dt.setData(tabType, JSON.stringify({
      url: "https://example.com",
      title: "Example Domain",
      favIconUrl: "",
    }));
    dt.effectAllowed = "all";

    srcEl.dispatchEvent(new DragEvent("dragstart", {
      bubbles: true, cancelable: true, dataTransfer: dt,
      clientX: srcX, clientY: srcY,
    }));

    // Move to target with dragover
    tgtEl.dispatchEvent(new DragEvent("dragenter", {
      bubbles: true, cancelable: true, dataTransfer: dt,
      clientX: tgtX, clientY: tgtY,
    }));
    tgtEl.dispatchEvent(new DragEvent("dragover", {
      bubbles: true, cancelable: true, dataTransfer: dt,
      clientX: tgtX, clientY: tgtY,
    }));
    tgtEl.dispatchEvent(new DragEvent("dragover", {
      bubbles: true, cancelable: true, dataTransfer: dt,
      clientX: tgtX, clientY: tgtY,
    }));

    // Drop
    tgtEl.dispatchEvent(new DragEvent("drop", {
      bubbles: true, cancelable: true, dataTransfer: dt,
      clientX: tgtX, clientY: tgtY,
    }));

    srcEl.dispatchEvent(new DragEvent("dragend", {
      bubbles: true, cancelable: true, dataTransfer: dt,
    }));
  }, { srcX, srcY, tgtX, tgtY, tabType: "application/x-vertabs-tab" });

  await page.waitForTimeout(800);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test("drag tab entry onto bookmark folder creates bookmark", async () => {
  // 1. Create a bookmark folder
  await createBookmarkFolder(sidepanel, "DropTarget");

  // 2. Open a real tab
  const tab = await openTabWithUrl("https://example.com");
  await sidepanel.waitForTimeout(600);
  await sidepanel.reload();
  await sidepanel.waitForSelector("[class*='toolbar']");
  await sidepanel.waitForTimeout(500);

  await expect(sidepanel.locator("text=example.com")).toBeVisible({ timeout: 5000 });
  await expect(sidepanel.locator("text=DropTarget")).toBeVisible({ timeout: 5000 });

  // 3. Simulate the drop directly on the folder header with proper DataTransfer data
  const folderId = await sidepanel.evaluate(async () => {
    const all = await chrome.bookmarks.getChildren("1");
    return all.find((b) => b.title === "DropTarget")?.id;
  });

  // Fire the drop event directly on the folder header with the correct data
  await sidepanel.evaluate(({ tabType, folderId: _folderId }) => {
    const folderHeaders = document.querySelectorAll("[class*='folderHeader']");
    const folder = Array.from(folderHeaders).find(
      (el) => el.textContent?.includes("DropTarget")
    ) as HTMLElement | undefined;
    if (!folder) { console.error("Folder header not found"); return; }

    // Create a DataTransfer with the tab data
    const dt = new DataTransfer();
    dt.setData(tabType, JSON.stringify({
      url: "https://example.com",
      title: "Example Domain",
      favIconUrl: "",
    }));

    // Fire dragover first so the folder accepts the drop
    folder.dispatchEvent(new DragEvent("dragover", {
      bubbles: true, cancelable: true, dataTransfer: dt,
      clientX: folder.getBoundingClientRect().x + 10,
      clientY: folder.getBoundingClientRect().y + folder.getBoundingClientRect().height / 2,
    }));

    // Fire drop
    folder.dispatchEvent(new DragEvent("drop", {
      bubbles: true, cancelable: true, dataTransfer: dt,
      clientX: folder.getBoundingClientRect().x + 10,
      clientY: folder.getBoundingClientRect().y + folder.getBoundingClientRect().height / 2,
    }));
  }, { tabType: "application/x-vertabs-tab", folderId });

  await sidepanel.waitForTimeout(800);

  const children = await sidepanel.evaluate(async (id) => {
    return chrome.bookmarks.getChildren(id as string);
  }, folderId);

  console.log("Children after drop:", children);
  expect(children.length).toBeGreaterThan(0);
  expect(children[0].url).toContain("example.com");

  await tab.close();
});

test("drag tab entry onto open folder interior creates bookmark", async () => {
  // Test dropping onto the open folder's children area (not the header)
  await createBookmarkFolder(sidepanel, "OpenFolder");

  // Add a bookmark inside so the folder is visible when open
  const folderId = await sidepanel.evaluate(async () => {
    const all = await chrome.bookmarks.getChildren("1");
    const f = all.find((b) => b.title === "OpenFolder");
    if (f) {
      await chrome.bookmarks.create({ parentId: f.id, title: "Existing", url: "https://existing.com" });
    }
    return f?.id;
  });

  const tab = await openTabWithUrl("https://example.com");
  await sidepanel.waitForTimeout(600);
  await sidepanel.reload();
  await sidepanel.waitForSelector("[class*='toolbar']");
  await sidepanel.waitForTimeout(500);

  // Open the folder by clicking its header (not the text which might be in a child)
  const folderHeader = sidepanel.locator("[class*='folderHeader']").filter({ hasText: "OpenFolder" }).first();
  await folderHeader.click();
  await sidepanel.waitForTimeout(400);

  // Verify "Existing" bookmark is visible (folder is open)
  await expect(sidepanel.locator("[class*='bookmarkTitle']", { hasText: "Existing" }).first()).toBeVisible({ timeout: 3000 });

  // Drop onto the children area (on the existing bookmark leaf)
  await sidepanel.evaluate(({ tabType }) => {
    const bookmarkItems = document.querySelectorAll("[class*='bookmarkItem']");
    const existing = Array.from(bookmarkItems).find(
      (el) => el.textContent?.includes("Existing")
    ) as HTMLElement | undefined;
    if (!existing) { console.error("Existing bookmark not found"); return; }

    const dt = new DataTransfer();
    dt.setData(tabType, JSON.stringify({
      url: "https://example.com",
      title: "Example Domain",
      favIconUrl: "",
    }));

    existing.dispatchEvent(new DragEvent("dragover", {
      bubbles: true, cancelable: true, dataTransfer: dt,
    }));
    existing.dispatchEvent(new DragEvent("drop", {
      bubbles: true, cancelable: true, dataTransfer: dt,
    }));
  }, { tabType: "application/x-vertabs-tab" });

  await sidepanel.waitForTimeout(800);

  const children = await sidepanel.evaluate(async (id) => {
    return chrome.bookmarks.getChildren(id as string);
  }, folderId);

  console.log("Open folder children after interior drop:", children);
  expect(children.length).toBeGreaterThan(1); // Existing + new one
  const newBookmark = children.find((c) => c.url?.includes("example.com"));
  expect(newBookmark).toBeTruthy();

  await tab.close();
});

test("debug: log dataTransfer types on folder dragover", async () => {
  await createBookmarkFolder(sidepanel, "DebugFolder");
  const tab = await openTabWithUrl("https://example.com");
  await sidepanel.waitForTimeout(600);
  await sidepanel.reload();
  await sidepanel.waitForSelector("[class*='toolbar']");
  await sidepanel.waitForTimeout(500);

  // Inject a listener on the folder header to log what types arrive
  await sidepanel.evaluate(() => {
    const folders = document.querySelectorAll("[class*='folderHeader']");
    folders.forEach((f) => {
      f.addEventListener("dragover", (e: Event) => {
        const de = e as DragEvent;
        console.log("[debug dragover] types:", JSON.stringify([...de.dataTransfer!.types]));
        console.log("[debug dragover] effectAllowed:", de.dataTransfer!.effectAllowed);
      });
      f.addEventListener("drop", (e: Event) => {
        const de = e as DragEvent;
        console.log("[debug drop] types:", JSON.stringify([...de.dataTransfer!.types]));
        console.log("[debug drop] getData tab:", de.dataTransfer!.getData("application/x-vertabs-tab"));
      });
    });
  });

  await dragElement(sidepanel, "[class*='tabItem']", "[class*='folderHeader']");

  await tab.close();
});
