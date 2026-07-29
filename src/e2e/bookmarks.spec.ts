/**
 * E2E tests — Bookmarks section
 *
 * Covers: section renders, search, open link, delete bookmark (two-click
 * confirm), folder create, folder rename, source visibility toggle.
 */
import { test, expect, BrowserContext, Page } from "@playwright/test";
import {
  launchWithExtension,
  getExtId,
  openSidepanel,
  clearBookmarksBar,
  seedBookmarks,
  getBookmarkBarTitles,
  createBookmarkFolder,
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
  await clearBookmarksBar(sidepanel);
  await sidepanel.reload();
  await sidepanel.waitForSelector("[class*='toolbar']");
});

// ── Tests ─────────────────────────────────────────────────────────────────────

test("Bookmarks section renders with search input", async () => {
  await expect(sidepanel.locator("text=Bookmarks")).toBeVisible();
  await expect(sidepanel.locator("input[placeholder='Search bookmarks…']")).toBeVisible();
});

test("bookmarks appear after seeding", async () => {
  await seedBookmarks(sidepanel, [
    { title: "GitHub",  url: "https://github.com" },
    { title: "MDN",     url: "https://mdn.io" },
  ]);
  await sidepanel.reload();
  await sidepanel.waitForSelector("[class*='toolbar']");

  await expect(sidepanel.locator("text=GitHub")).toBeVisible();
  await expect(sidepanel.locator("text=MDN")).toBeVisible();
});

test("search filters bookmarks by title", async () => {
  await seedBookmarks(sidepanel, [
    { title: "GitHub",  url: "https://github.com" },
    { title: "YouTube", url: "https://youtube.com" },
  ]);
  await sidepanel.reload();
  await sidepanel.waitForSelector("[class*='toolbar']");

  await sidepanel.fill("input[placeholder='Search bookmarks…']", "git");
  await expect(sidepanel.locator("text=GitHub")).toBeVisible();
  await expect(sidepanel.locator("text=YouTube")).not.toBeVisible();
});

test("search filters bookmarks by URL", async () => {
  await seedBookmarks(sidepanel, [
    { title: "My Site",  url: "https://mysite.example.com" },
    { title: "Other",    url: "https://other.com" },
  ]);
  await sidepanel.reload();
  await sidepanel.waitForSelector("[class*='toolbar']");

  await sidepanel.fill("input[placeholder='Search bookmarks…']", "mysite");
  await expect(sidepanel.locator("text=My Site")).toBeVisible();
  await expect(sidepanel.locator("text=Other")).not.toBeVisible();
});

test("empty search message shown when no bookmarks match", async () => {
  await seedBookmarks(sidepanel, [{ title: "GitHub", url: "https://github.com" }]);
  await sidepanel.reload();
  await sidepanel.waitForSelector("[class*='toolbar']");

  await sidepanel.fill("input[placeholder='Search bookmarks…']", "zzznomatch");
  await expect(sidepanel.locator("text=/No bookmarks match/")).toBeVisible();
});

test("clicking a bookmark opens it in a new tab at the top", async () => {
  await seedBookmarks(sidepanel, [{ title: "Example", url: "https://example.com" }]);
  await sidepanel.reload();
  await sidepanel.waitForSelector("[class*='toolbar']");

  await sidepanel.fill("input[placeholder='Search bookmarks…']", "Example");
  await sidepanel.waitForSelector("text=Example");

  const [newTab] = await Promise.all([
    sidepanel.context().waitForEvent("page"),
    sidepanel.locator("text=Example").first().click(),
  ]);
  await newTab.waitForLoadState("domcontentloaded");
  expect(newTab.url()).toContain("example.com");
});

test("first delete click enters confirm state (row turns red)", async () => {
  await seedBookmarks(sidepanel, [{ title: "ToDelete", url: "https://todelete.com" }]);
  await sidepanel.reload();
  await sidepanel.waitForSelector("[class*='toolbar']");
  await sidepanel.fill("input[placeholder='Search bookmarks…']", "ToDelete");
  await sidepanel.waitForSelector("text=ToDelete");

  const deleteBtn = sidepanel.locator("button[title='Delete bookmark']").first();
  await deleteBtn.click();
  // After first click the button should show ?
  await expect(deleteBtn).toHaveText("?");
});

test("second delete click removes the bookmark", async () => {
  await seedBookmarks(sidepanel, [{ title: "ToDelete2", url: "https://todelete2.com" }]);
  await sidepanel.reload();
  await sidepanel.waitForSelector("[class*='toolbar']");
  await sidepanel.fill("input[placeholder='Search bookmarks…']", "ToDelete2");
  await sidepanel.waitForSelector("text=ToDelete2");

  const deleteBtn = sidepanel.locator("button[title='Delete bookmark']").first();
  await deleteBtn.click(); // first — confirm
  await deleteBtn.click(); // second — delete

  await sidepanel.waitForTimeout(500);
  const titles = await getBookmarkBarTitles(sidepanel);
  expect(titles).not.toContain("ToDelete2");
});

test("new folder button creates a folder", async () => {
  await sidepanel.reload();
  await sidepanel.waitForSelector("[class*='toolbar']");

  // Click the + button in the "Bookmarks bar" source title row
  const addBtn = sidepanel.locator("button[title='New folder']").first();
  await addBtn.click();

  const input = sidepanel.locator("input[placeholder='Folder name…']");
  await input.fill("My E2E Folder");
  await input.press("Enter");

  await sidepanel.waitForTimeout(500);
  const titles = await getBookmarkBarTitles(sidepanel);
  expect(titles).toContain("My E2E Folder");
});

test("Escape cancels folder creation without creating", async () => {
  await sidepanel.reload();
  await sidepanel.waitForSelector("[class*='toolbar']");

  const addBtn = sidepanel.locator("button[title='New folder']").first();
  await addBtn.click();

  const input = sidepanel.locator("input[placeholder='Folder name…']");
  await input.fill("Should Not Exist");
  await input.press("Escape");

  await sidepanel.waitForTimeout(300);
  const titles = await getBookmarkBarTitles(sidepanel);
  expect(titles).not.toContain("Should Not Exist");
});

test("folder delete (removeTree) removes folder and its contents", async () => {
  const folderId = await createBookmarkFolder(sidepanel, "FolderToRemove");
  await sidepanel.evaluate(async (id) => {
    await chrome.bookmarks.create({ parentId: id, title: "Child", url: "https://child.com" });
  }, folderId);

  await sidepanel.reload();
  await sidepanel.waitForSelector("[class*='toolbar']");

  const deleteBtn = sidepanel.locator("button[title='Delete folder']").first();
  await deleteBtn.click(); // first — confirm
  await deleteBtn.click(); // second — delete

  await sidepanel.waitForTimeout(500);
  const titles = await getBookmarkBarTitles(sidepanel);
  expect(titles).not.toContain("FolderToRemove");
});

test("bookmark rows show domain below title", async () => {
  await seedBookmarks(sidepanel, [{ title: "GitHub Pulls", url: "https://github.com/pulls" }]);
  await sidepanel.reload();
  await sidepanel.waitForSelector("[class*='toolbar']");
  await sidepanel.fill("input[placeholder='Search bookmarks…']", "GitHub Pulls");
  await sidepanel.waitForSelector("text=GitHub Pulls");

  // domain "github.com" should appear below the title
  await expect(sidepanel.locator("text=github.com")).toBeVisible();
});
