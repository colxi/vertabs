import React, { useRef, useState } from "react";
import { SidebarConfig } from "../hooks/useConfig";
import { Shortcut } from "../utils/shortcuts";
import styles from "./Config.module.css";

interface Props {
  config: SidebarConfig;
  onUpdate: (updates: Partial<SidebarConfig>) => void;
  onClose: () => void;
  shortcuts: Shortcut[];
}

export function Config({ config, onUpdate, onClose, shortcuts }: Props) {
  return (
    <div className={styles.overlay}>
      <div className={styles.header}>
        <button className={styles.backBtn} onClick={onClose} title="Back">
          ←
        </button>
        <span className={styles.title}>Settings</span>
      </div>

      <div className={styles.body}>
        <ModeSection config={config} onUpdate={onUpdate} />
        <AppearanceSection config={config} onUpdate={onUpdate} />
        <ContentSection config={config} onUpdate={onUpdate} />
        <ExportImportSection shortcuts={shortcuts} />
      </div>
    </div>
  );
}

// ── Accordion wrapper ─────────────────────────────────────────────────────────

function Section({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={styles.section}>
      <button className={styles.sectionHeader} onClick={() => setOpen((o) => !o)}>
        <span>{title}</span>
        <span className={`${styles.chevron} ${open ? styles.chevronOpen : ""}`}>▶</span>
      </button>
      <div className={`${styles.sectionWrap} ${open ? styles.sectionWrapOpen : ""}`}>
        <div className={styles.sectionBody}>{children}</div>
      </div>
    </div>
  );
}

// ── Row helpers ───────────────────────────────────────────────────────────────

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className={styles.row}>
      <span className={styles.label}>{label}</span>
      <div className={styles.control}>{children}</div>
    </div>
  );
}

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      className={`${styles.toggle} ${checked ? styles.toggleOn : ""}`}
      onClick={() => onChange(!checked)}
      role="switch"
      aria-checked={checked}
    >
      <span className={styles.toggleThumb} />
    </button>
  );
}

// ── Mode & Position ───────────────────────────────────────────────────────────

function ModeSection({
  config,
  onUpdate,
}: {
  config: SidebarConfig;
  onUpdate: (u: Partial<SidebarConfig>) => void;
}) {
  return (
    <Section title="Mode & Position">
      <div className={styles.modeCards}>
        <ModeCard
          icon="📌"
          label="Floating Sidebar"
          description="Injected into every page"
          selected={config.mode === "floating"}
          onClick={() => onUpdate({ mode: "floating" })}
        />
        <ModeCard
          icon="☰"
          label="Chrome Panel"
          description="Native browser side panel"
          selected={config.mode === "panel"}
          onClick={() => onUpdate({ mode: "panel" })}
        />
      </div>

      {config.mode === "panel" && (
        <p className={styles.notice}>
          Reload the page to switch to Chrome Panel mode.
        </p>
      )}

      {config.mode === "floating" && (
        <>
          <Row label="Position">
            <div className={styles.segmented}>
              <button
                className={config.position === "left" ? styles.segActive : ""}
                onClick={() => onUpdate({ position: "left" })}
              >
                Left
              </button>
              <button
                className={config.position === "right" ? styles.segActive : ""}
                onClick={() => onUpdate({ position: "right" })}
              >
                Right
              </button>
            </div>
          </Row>

          <Row label="On startup">
            <select
              value={config.startupState}
              onChange={(e) =>
                onUpdate({ startupState: e.target.value as SidebarConfig["startupState"] })
              }
            >
              <option value="remember">Remember last state</option>
              <option value="expanded">Always expanded</option>
              <option value="compact">Always compact</option>
            </select>
          </Row>
        </>
      )}
    </Section>
  );
}

function ModeCard({
  icon,
  label,
  description,
  selected,
  onClick,
}: {
  icon: string;
  label: string;
  description: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={`${styles.modeCard} ${selected ? styles.modeCardSelected : ""}`}
      onClick={onClick}
    >
      <span className={styles.modeIcon}>{icon}</span>
      <span className={styles.modeLabel}>{label}</span>
      <span className={styles.modeDesc}>{description}</span>
    </button>
  );
}

// ── Appearance ────────────────────────────────────────────────────────────────

function AppearanceSection({
  config,
  onUpdate,
}: {
  config: SidebarConfig;
  onUpdate: (u: Partial<SidebarConfig>) => void;
}) {
  return (
    <Section title="Appearance">
      <Row label={`Font size — ${config.fontSize}px`}>
        <input
          type="range"
          min={11}
          max={18}
          value={config.fontSize}
          onChange={(e) => onUpdate({ fontSize: Number(e.target.value) })}
          className={styles.slider}
        />
      </Row>

      <Row label={`Row spacing — ${config.itemSpacing}px`}>
        <input
          type="range"
          min={2}
          max={10}
          value={config.itemSpacing}
          onChange={(e) => onUpdate({ itemSpacing: Number(e.target.value) })}
          className={styles.slider}
        />
      </Row>

      <Row label="Accent color">
        <div className={styles.colorRow}>
          <input
            type="color"
            value={config.accentColor}
            onChange={(e) => onUpdate({ accentColor: e.target.value })}
            className={styles.colorPicker}
          />
          <span className={styles.colorHex}>{config.accentColor}</span>
        </div>
      </Row>

      {config.mode === "floating" && (
        <>
          <Row label={`Sidebar width — ${config.sidebarWidth}px`}>
            <input
              type="range"
              min={260}
              max={520}
              step={10}
              value={config.sidebarWidth}
              onChange={(e) => onUpdate({ sidebarWidth: Number(e.target.value) })}
              className={styles.slider}
            />
          </Row>

          <Row label={`Auto-hide delay — ${config.autoHideDelay}ms`}>
            <input
              type="range"
              min={0}
              max={2000}
              step={50}
              value={config.autoHideDelay}
              onChange={(e) => onUpdate({ autoHideDelay: Number(e.target.value) })}
              className={styles.slider}
            />
          </Row>
        </>
      )}
    </Section>
  );
}

// ── Content / Sections ────────────────────────────────────────────────────────

function ContentSection({
  config,
  onUpdate,
}: {
  config: SidebarConfig;
  onUpdate: (u: Partial<SidebarConfig>) => void;
}) {
  const [newTabInput, setNewTabInput] = useState(config.newTabUrl);

  return (
    <Section title="Content">
      <Row label="Show Shortcuts">
        <Toggle
          checked={config.showShortcuts}
          onChange={(v) => onUpdate({ showShortcuts: v })}
        />
      </Row>
      <Row label="Show Bookmarks">
        <Toggle
          checked={config.showBookmarks}
          onChange={(v) => onUpdate({ showBookmarks: v })}
        />
      </Row>
      {config.showBookmarks && (
        <div className={styles.subRows}>
          <label className={styles.checkRow}>
            <input
              type="checkbox"
              checked={config.showBookmarksBar}
              onChange={(e) => onUpdate({ showBookmarksBar: e.target.checked })}
            />
            Bookmarks bar
          </label>
          <label className={styles.checkRow}>
            <input
              type="checkbox"
              checked={config.showOtherBookmarks}
              onChange={(e) => onUpdate({ showOtherBookmarks: e.target.checked })}
            />
            Other bookmarks
          </label>
        </div>
      )}
      <Row label="Show Tabs">
        <Toggle
          checked={config.showTabs}
          onChange={(v) => onUpdate({ showTabs: v })}
        />
      </Row>

      <Row label="Open links in">
        <div className={styles.segmented}>
          <button
            className={config.openLinksInNewTab ? styles.segActive : ""}
            onClick={() => onUpdate({ openLinksInNewTab: true })}
          >
            New tab
          </button>
          <button
            className={!config.openLinksInNewTab ? styles.segActive : ""}
            onClick={() => onUpdate({ openLinksInNewTab: false })}
          >
            Current tab
          </button>
        </div>
      </Row>

      <Row label="New tab URL">
        <input
          type="text"
          value={newTabInput}
          onChange={(e) => setNewTabInput(e.target.value)}
          onBlur={() => {
            const url = /^https?:\/\//i.test(newTabInput)
              ? newTabInput
              : `https://${newTabInput}`;
            setNewTabInput(url);
            onUpdate({ newTabUrl: url });
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
          placeholder="https://www.google.com"
          className={styles.textInput}
        />
      </Row>
    </Section>
  );
}

// ── Export / Import ───────────────────────────────────────────────────────────

interface ExportData {
  version: 1;
  exportedAt: string;
  shortcuts?: Array<{ name: string; url: string; favIconUrl?: string }>;
  bookmarks?: chrome.bookmarks.BookmarkTreeNode[];
  tabs?: Array<{ title: string; url: string; windowId: number }>;
}

function ExportImportSection({ shortcuts }: { shortcuts: Shortcut[] }) {
  const [inclShortcuts,  setInclShortcuts]  = useState(true);
  const [inclBookmarks,  setInclBookmarks]  = useState(true);
  const [inclTabs,       setInclTabs]       = useState(true);
  const [status,         setStatus]         = useState<string | null>(null);
  const importRef = useRef<HTMLInputElement>(null);

  function showStatus(msg: string) {
    setStatus(msg);
    setTimeout(() => setStatus(null), 3000);
  }

  async function handleExport() {
    const data: ExportData = { version: 1, exportedAt: new Date().toISOString() };

    if (inclShortcuts) {
      // Read original URLs from storage so exported URL is always the defined one
      const stored = await new Promise<Record<string, string>>((resolve) =>
        chrome.storage.local.get("sidebar-shortcut-urls", (r) =>
          resolve((r["sidebar-shortcut-urls"] as Record<string, string>) ?? {})
        )
      );
      data.shortcuts = shortcuts.map((sc) => ({
        name:       sc.name,
        url:        stored[sc.id] || sc.url,
        favIconUrl: sc.favIconUrl,
      }));
    }

    if (inclBookmarks) {
      const tree = await chrome.bookmarks.getTree();
      data.bookmarks = tree;
    }

    if (inclTabs) {
      const tabs = await chrome.tabs.query({ currentWindow: true });
      data.tabs = tabs
        .filter((t) => t.url && !t.pinned)
        .map((t) => ({ title: t.title ?? "", url: t.url ?? "", windowId: t.windowId }));
    }

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `vertabs-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showStatus("Exported successfully");
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reset input so the same file can be re-imported
    e.target.value = "";

    let data: ExportData;
    try {
      data = JSON.parse(await file.text()) as ExportData;
    } catch {
      showStatus("Invalid file — could not parse JSON");
      return;
    }

    if (data.version !== 1) {
      showStatus("Unsupported file version");
      return;
    }

    let imported = 0;

    if (data.shortcuts?.length) {
      for (const sc of data.shortcuts) {
        if (!sc.url) continue;
        await chrome.tabs.create({ url: sc.url, pinned: true });
        imported++;
      }
    }

    if (data.bookmarks?.length) {
      // Re-create the full bookmark tree under the existing roots
      async function importNode(
        node: chrome.bookmarks.BookmarkTreeNode,
        parentId: string
      ) {
        if (node.url) {
          await chrome.bookmarks.create({ parentId, title: node.title, url: node.url });
          imported++;
        } else if (node.children) {
          // Skip the virtual root nodes (id "0", "1", "2") — write into them directly
          const isRoot = node.id === "0" || node.id === "1" || node.id === "2";
          const folderId = isRoot
            ? node.id
            : (await chrome.bookmarks.create({ parentId, title: node.title })).id;
          for (const child of node.children) {
            await importNode(child, folderId);
          }
        }
      }
      for (const root of data.bookmarks) {
        await importNode(root, root.id === "0" ? "1" : root.id);
      }
    }

    if (data.tabs?.length) {
      for (const tab of data.tabs) {
        if (!tab.url) continue;
        await chrome.tabs.create({ url: tab.url, active: false });
        imported++;
      }
    }

    showStatus(`Imported ${imported} item${imported !== 1 ? "s" : ""}`);
  }

  const noneSelected = !inclShortcuts && !inclBookmarks && !inclTabs;

  return (
    <Section title="Export / Import" defaultOpen={false}>
      <div className={styles.exportCheckboxes}>
        <label className={styles.checkRow}>
          <input type="checkbox" checked={inclShortcuts} onChange={(e) => setInclShortcuts(e.target.checked)} />
          Shortcuts
        </label>
        <label className={styles.checkRow}>
          <input type="checkbox" checked={inclBookmarks} onChange={(e) => setInclBookmarks(e.target.checked)} />
          Bookmarks
        </label>
        <label className={styles.checkRow}>
          <input type="checkbox" checked={inclTabs} onChange={(e) => setInclTabs(e.target.checked)} />
          Open tabs
        </label>
      </div>

      <div className={styles.exportActions}>
        <button
          className={styles.exportBtn}
          onClick={handleExport}
          disabled={noneSelected}
        >
          ↓ Export to JSON
        </button>
        <button
          className={styles.importBtn}
          onClick={() => importRef.current?.click()}
        >
          ↑ Import from JSON
        </button>
      </div>

      <input
        ref={importRef}
        type="file"
        accept=".json,application/json"
        style={{ display: "none" }}
        onChange={handleImport}
      />

      {status && <p className={styles.exportStatus}>{status}</p>}
    </Section>
  );
}
