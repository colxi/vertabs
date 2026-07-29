# E2E Tests — Vertabs

Playwright tests that run against the real built extension in a Chromium browser.

## Run

```bash
# Run all e2e tests (headful, builds first)
pnpm test:e2e

# Open Playwright UI for interactive debugging
pnpm test:e2e:ui
```

## How it works

1. `global-setup.ts` runs `pnpm build` before the suite starts.
2. `fixtures.ts` launches Chromium with `--load-extension=dist/` and exposes:
   - `context` — the BrowserContext with the extension loaded
   - `sidepanel` — a Page opened at the extension's sidepanel HTML
   - `extId` — the runtime extension ID
3. Tests seed Chrome's bookmarks/tabs via the background page (`chrome.bookmarks.*`, `chrome.tabs.*`) and then interact with the sidepanel UI via Playwright's drag API.

## Why E2E for drag-and-drop

- jsdom (used by vitest) has no real layout — `getBoundingClientRect()` always returns zero, `dragOver`/`drop` events don't fire in the right order, and `chrome.bookmarks.move` index semantics can't be observed.
- Playwright runs real Chromium with real layout, real drag sequences, and real Chrome extension APIs.
- This lets us verify the exact final bookmark order after a drag, catching off-by-one index bugs that unit tests can't detect.

## Files

| File | Purpose |
|------|---------|
| `fixtures.ts` | Shared test fixture: launches extension, exposes `context`, `sidepanel`, `extId` |
| `global-setup.ts` | Runs `pnpm build` once before all tests |
| `bookmarks-dnd.spec.ts` | Drag-and-drop reorder tests for the Bookmarks section |
