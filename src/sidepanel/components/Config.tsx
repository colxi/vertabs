import React, { useRef, useState } from "react";
import { SidebarConfig } from "../hooks/useConfig";
import { Shortcut } from "../utils/shortcuts";
import { faviconUrl } from "../utils/favicon";
import { BookmarksManager } from "./BookmarksManager";
import styles from "./Config.module.css";

interface Props {
  config: SidebarConfig;
  onUpdate: (updates: Partial<SidebarConfig>) => void;
  onClose: () => void;
  shortcuts: Shortcut[];
  onAddShortcut: (url: string) => void;
  onEditShortcut: (id: string, name: string, url: string) => void;
  onRemoveShortcut: (id: string) => void;
  onReorderShortcut: (from: number, to: number) => void;
}

export function Config({
  config,
  onUpdate,
  onClose,
  shortcuts,
  onAddShortcut,
  onEditShortcut,
  onRemoveShortcut,
  onReorderShortcut,
}: Props) {
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
        <ShortcutsSection
          shortcuts={shortcuts}
          onAdd={onAddShortcut}
          onEdit={onEditShortcut}
          onRemove={onRemoveShortcut}
          onReorder={onReorderShortcut}
        />
        <BookmarksSection />
      </div>
    </div>
  );
}

// ── Accordion wrapper ─────────────────────────────────────────────────────────

function Section({
  title,
  children,
  defaultOpen = true,
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
      {open && <div className={styles.sectionBody}>{children}</div>}
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

// ── Shortcuts management ──────────────────────────────────────────────────────

function ShortcutsSection({
  shortcuts,
  onAdd,
  onEdit,
  onRemove,
  onReorder,
}: {
  shortcuts: Shortcut[];
  onAdd: (url: string) => void;
  onEdit: (id: string, name: string, url: string) => void;
  onRemove: (id: string) => void;
  onReorder: (from: number, to: number) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editUrl, setEditUrl] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [newUrl, setNewUrl] = useState("");
  const dragIndex = useRef<number | null>(null);

  function startEdit(sc: Shortcut) {
    setEditingId(sc.id);
    setEditUrl(sc.url);
  }

  function saveEdit() {
    if (!editingId || !editUrl.trim()) return;
    const normalized = /^https?:\/\//i.test(editUrl) ? editUrl : `https://${editUrl}`;
    // name will be updated automatically once the tab navigates
    const sc = shortcuts.find((s) => s.id === editingId);
    onEdit(editingId, sc?.name ?? "", normalized);
    setEditingId(null);
  }

  function saveAdd() {
    if (!newUrl.trim()) return;
    const normalized = /^https?:\/\//i.test(newUrl) ? newUrl : `https://${newUrl}`;
    onAdd(normalized);
    setAddOpen(false);
    setNewUrl("");
  }

  return (
    <Section title="Shortcuts">
      <div className={styles.scList}>
        {shortcuts.map((sc, i) =>
          editingId === sc.id ? (
            <div key={sc.id} className={styles.scEditRow}>
              <input
                autoFocus
                value={editUrl}
                onChange={(e) => setEditUrl(e.target.value)}
                placeholder="https://…"
                onKeyDown={(e) => e.key === "Enter" && saveEdit()}
              />
              <div className={styles.scEditActions}>
                <button className={styles.btnPrimary} onClick={saveEdit}>Save</button>
                <button onClick={() => setEditingId(null)}>Cancel</button>
              </div>
            </div>
          ) : (
            <div
              key={sc.id}
              className={styles.scRow}
              draggable
              onDragStart={() => { dragIndex.current = i; }}
              onDragEnter={() => {
                if (dragIndex.current !== null && dragIndex.current !== i) {
                  onReorder(dragIndex.current, i);
                  dragIndex.current = i;
                }
              }}
              onDragOver={(e) => e.preventDefault()}
              onDragEnd={() => { dragIndex.current = null; }}
            >
              <span className={styles.dragHandle}>⠿</span>
              <img
                className={styles.scFavicon}
                src={sc.favIconUrl || faviconUrl(sc.url)}
                alt=""
                onError={(e) => ((e.target as HTMLImageElement).style.display = "none")}
              />
              <div className={styles.scInfo}>
                <span className={styles.scName}>{sc.name}</span>
                <span className={styles.scUrl}>{sc.url}</span>
              </div>
              <button className={styles.iconBtn} onClick={() => startEdit(sc)} title="Edit URL">✏</button>
              <button className={styles.iconBtnDanger} onClick={() => onRemove(sc.id)} title="Delete">🗑</button>
            </div>
          )
        )}
      </div>

      {addOpen ? (
        <div className={styles.scEditRow}>
          <input
            autoFocus
            value={newUrl}
            onChange={(e) => setNewUrl(e.target.value)}
            placeholder="https://…"
            onKeyDown={(e) => e.key === "Enter" && saveAdd()}
          />
          <div className={styles.scEditActions}>
            <button className={styles.btnPrimary} onClick={saveAdd}>Add</button>
            <button onClick={() => setAddOpen(false)}>Cancel</button>
          </div>
        </div>
      ) : (
        <button className={styles.addRowBtn} onClick={() => setAddOpen(true)}>
          + Add shortcut
        </button>
      )}
    </Section>
  );
}

// ── Bookmarks management ──────────────────────────────────────────────────────

function BookmarksSection() {
  return (
    <Section title="Bookmarks">
      <BookmarksManager />
    </Section>
  );
}
