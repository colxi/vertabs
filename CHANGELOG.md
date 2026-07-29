# Changelog

## [Unreleased]

### Visual improvements

- feat: complete visual overhaul — richer dark theme with deeper backgrounds (`#16171a`), layered surfaces, and consistent shadows throughout
- feat: toolbar redesigned as a grouped pill container with cleaner button states
- feat: section cards get subtle borders and shadows for a floating-card feel
- feat: all focus states now show a soft accent glow ring (`box-shadow`)
- feat: active tab indicator adds an accent border in addition to background colour
- feat: drop indicators during drag now use `box-shadow` (zero layout impact)
- feat: uniform design tokens — `--shadow-sm/md/lg`, `--transition-fast/base`, `--accent-dim`, `--accent-glow`, `--danger-dim`
- feat: pin button shows accent colour when active instead of full opacity
- refactor: all font sizes use `rem` so they scale with `--font-size-base`

### Drag and drop

- feat: open tabs can be dragged onto the Shortcuts section to pin them
- feat: open tabs can be dragged onto a bookmark folder to save them as bookmarks
- feat: bookmark items and folders can be reordered by drag-and-drop within a folder
- feat: bookmark items can be moved between folders by drag-and-drop
- feat: shortcuts grid supports drag-to-reorder with a ghost placeholder cell
- feat: tabs list supports drag-to-reorder with a full-height placeholder row
- feat: ghost placeholder row/cell appears during drag to show the insertion point
- fix: bookmark drag-and-drop reorder was off by one — removed incorrect same-parent index adjustment (Chrome `bookmarks.move` takes final destination index directly)
- fix: placeholder `div` had `pointer-events: none` but was block-level, causing drops in the gap to be silently swallowed — added fallback `onDrop` on container divs
- fix: drag handle removed from tab items (was wasting horizontal space)
- fix: drag events no longer flicker — removed `onDragLeave` state-clearing that caused placeholder to appear/disappear at 60fps

### Shortcuts

- fix: clicking a shortcut no longer forcibly navigates back to the original URL — it now reads the stored original URL from `chrome.storage.local` and navigates to it, preserving the defined URL regardless of where the tab has since navigated
- fix: backfills `sidebar-shortcut-urls` storage entry on first click for pre-existing pinned tabs that have no stored original URL
- feat: shortcut URLs visible in Settings → Shortcuts (name + URL shown per row)
- docs: AGENTS.md documents the full `sidebar-shortcut-urls` storage contract

### Bookmarks

- feat: delete button (`✕`) on hover for every bookmark and folder
- feat: two-click delete confirmation — first click turns row red and shows `?`, second click within 2 seconds confirms; auto-resets after timeout
- feat: `+ New folder` button in each folder header row and section title row
- feat: inline folder name input (no modal) — opens below the row, Enter to confirm, Escape to cancel
- fix: bookmarks bar source was stuck collapsed when selected alone (no title row to un-collapse it) — now forced open when only one source is shown
- fix: section hidden entirely when no bookmark sources are selected

### Tabs

- feat: drag open tab to bookmark folder saves it as a bookmark
- feat: drag open tab to shortcuts section pins it as a shortcut

### Config / Settings

- feat: Export / Import section — export shortcuts, bookmarks, and open tabs to a JSON file; import from a previously exported file
- feat: Row spacing slider (2–10 px) controls vertical padding of all list rows live
- fix: bookmarks section hidden when both sources are deselected (was showing empty shell)

### E2E tests (Playwright)

- chore: Playwright installed and configured (`pnpm test:e2e`, `pnpm test:e2e:ui`)
- feat: `src/e2e/` directory with shared fixture that loads the extension into real Chromium
- feat: `bookmarks-dnd.spec.ts` — 6 E2E tests covering all bookmark drag-and-drop reorder scenarios including the exact off-by-one failure cases
- chore: global setup runs `pnpm build` automatically before the test suite

### Unit tests

- feat: `Shortcuts.spec.tsx` — 2 new tests: navigates to stored original URL on click; backfills storage when no entry exists
- feat: `Bookmarks.spec.tsx` — 10 new `calcMoveIndex` unit tests covering all forward/backward/cross-parent combinations
- chore: Chrome bookmarks mock in `setup.ts` extended with `get`, `getChildren`, `move`, `remove`, `removeTree`, `update`, `create`
- refactor: `calcMoveIndex` extracted and exported from `Bookmarks.tsx` for direct unit testing
