import { test, expect, BrowserContext, Page } from "@playwright/test";
import { launchWithExtension, getExtId, openSidepanel, clearBookmarksBar, createBookmarkFolder } from "./helpers";

let ctx: BrowserContext;
let sidepanel: Page;

test.beforeAll(async () => {
  ctx = await launchWithExtension();
  const id = await getExtId(ctx);
  sidepanel = await openSidepanel(ctx, id);
});

test.afterAll(async () => { await ctx.close(); });

test.beforeEach(async () => {
  await clearBookmarksBar(sidepanel);
  await sidepanel.reload();
  await sidepanel.waitForSelector("[class*='toolbar']");
  await sidepanel.waitForTimeout(400);
});

test("placeholder box appears when tab is dragged over closed folder", async () => {
  await createBookmarkFolder(sidepanel, "TestFolder");
  await sidepanel.reload();
  await sidepanel.waitForSelector("[class*='toolbar']");
  await sidepanel.waitForTimeout(400);

  await expect(sidepanel.locator("text=TestFolder")).toBeVisible();

  // Simulate dragover on the folder header with TAB type
  const appeared = await sidepanel.evaluate(({ tabType }) => {
    const folder = Array.from(document.querySelectorAll("[class*='folderHeader']"))
      .find(el => el.textContent?.includes("TestFolder")) as HTMLElement;
    if (!folder) return { error: "folder not found" };

    const dt = new DataTransfer();
    dt.setData(tabType, JSON.stringify({ url: "https://example.com", title: "Test" }));

    folder.dispatchEvent(new DragEvent("dragover", {
      bubbles: true, cancelable: true, dataTransfer: dt,
      clientX: folder.getBoundingClientRect().x + 50,
      clientY: folder.getBoundingClientRect().y + folder.getBoundingClientRect().height / 2,
    }));

    // Return immediately — we'll check after React re-renders
    return { dispatched: true };
  }, { tabType: "application/x-vertabs-tab" });

  // Wait for React to process the state update
  await sidepanel.waitForTimeout(300);

  const visual = await sidepanel.evaluate(() => {
    const dropInside = document.querySelector("[class*='dropInside']");
    const placeholder = document.querySelector("[class*='bmPlaceholder']");
    return {
      hasDropInside: !!dropInside,
      hasPlaceholder: !!placeholder,
      dropInsideClass: dropInside?.className ?? null,
    };
  });

  console.log("Visual state after dragover:", visual);
  expect(visual.hasDropInside).toBe(true);
});

test("placeholder box appears when tab is dragged over open folder interior", async () => {
  await createBookmarkFolder(sidepanel, "OpenFolder");

  // Add a child bookmark so we can see the folder interior
  const folderId = await sidepanel.evaluate(async () => {
    const all = await chrome.bookmarks.getChildren("1");
    const f = all.find(b => b.title === "OpenFolder");
    if (f) await chrome.bookmarks.create({ parentId: f.id, title: "Child", url: "https://child.com" });
    return f?.id;
  });

  await sidepanel.reload();
  await sidepanel.waitForSelector("[class*='toolbar']");
  await sidepanel.waitForTimeout(400);

  // Open the folder
  await sidepanel.locator("[class*='folderHeader']", { hasText: "OpenFolder" }).first().click();
  await sidepanel.waitForTimeout(300);

  // Confirm folder is open
  await expect(sidepanel.locator("[class*='bookmarkTitle']", { hasText: "Child" }).first()).toBeVisible();

  // Simulate dragover on the children area
  await sidepanel.evaluate(({ tabType }) => {
    const child = Array.from(document.querySelectorAll("[class*='bookmarkItem']"))
      .find(el => el.textContent?.includes("Child")) as HTMLElement;
    if (!child) { console.error("child not found"); return; }

    const dt = new DataTransfer();
    dt.setData(tabType, JSON.stringify({ url: "https://example.com", title: "Test" }));

    child.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer: dt }));
    child.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer: dt }));
  }, { tabType: "application/x-vertabs-tab" });

  // Wait for React to process state update
  await sidepanel.waitForTimeout(500);

  const interiorState = await sidepanel.evaluate(() => {
    const placeholder = document.querySelector("[class*='bmPlaceholder']");
    const dropInside  = document.querySelector("[class*='dropInside']");
    return { hasPlaceholder: !!placeholder, hasDropInside: !!dropInside };
  });

  console.log("Visual state after dragover interior:", interiorState);
  expect(interiorState.hasDropInside || interiorState.hasPlaceholder).toBe(true);
});
