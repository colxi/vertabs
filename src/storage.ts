/**
 * Centralised storage routing.
 *
 * Keys in SYNC_KEYS are stored in chrome.storage.sync so they roam across
 * devices. Everything else stays in chrome.storage.local (device-only).
 *
 * chrome.storage.sync limits:
 *   - 100 KB total
 *   - 8 KB per item
 *   - 1,800 writes/hour
 *
 * Keys intentionally kept LOCAL (never synced):
 *   - sidebar-scroll  — scroll position is per-session
 */

export const SYNC_KEYS = new Set([
  "sidebar-config",
  "sidebar-shortcut-urls",
  "sidebar-ui",
  "sidebar-state",
  "sidebar-pinned",
]);

/** Get one or more keys, routing each to the correct store. */
export function storageGet(
  keys: string | string[],
  callback: (result: Record<string, unknown>) => void,
): void {
  const keyList = Array.isArray(keys) ? keys : [keys];
  const syncKeys = keyList.filter((k) => SYNC_KEYS.has(k));
  const localKeys = keyList.filter((k) => !SYNC_KEYS.has(k));

  let syncResult: Record<string, unknown> = {};
  let localResult: Record<string, unknown> = {};
  let pending = (syncKeys.length > 0 ? 1 : 0) + (localKeys.length > 0 ? 1 : 0);

  if (pending === 0) { callback({}); return; }

  function done() {
    if (--pending === 0) callback({ ...syncResult, ...localResult });
  }

  if (syncKeys.length > 0) {
    chrome.storage.sync.get(syncKeys, (r) => { syncResult = r; done(); });
  }
  if (localKeys.length > 0) {
    chrome.storage.local.get(localKeys, (r) => { localResult = r; done(); });
  }
}

/** Set key/value pairs, routing each to the correct store. */
export function storageSet(items: Record<string, unknown>): void {
  const syncItems: Record<string, unknown> = {};
  const localItems: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(items)) {
    if (SYNC_KEYS.has(key)) syncItems[key] = value;
    else localItems[key] = value;
  }

  if (Object.keys(syncItems).length > 0) chrome.storage.sync.set(syncItems);
  if (Object.keys(localItems).length > 0) chrome.storage.local.set(localItems);
}
