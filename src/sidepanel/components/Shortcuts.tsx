import React, { useRef, useState } from "react";
import styles from "./Shortcuts.module.css";
import { faviconUrl } from "../utils/favicon";
import { Shortcut } from "../utils/shortcuts";

const TAB_DRAG_TYPE      = "application/x-vertabs-tab";
const SHORTCUT_DRAG_TYPE = "application/x-vertabs-shortcut";

interface Props {
  shortcuts: Shortcut[];
  onAdd: (url: string) => void;
  onRemove: (id: string) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
}

export function Shortcuts({ shortcuts, onAdd, onRemove, onReorder }: Props) {
  const [modal, setModal] = useState(false);
  const [url, setUrl] = useState("");

  const dragIndex   = useRef<number | null>(null);
  const dropSlotRef = useRef<number | null>(null);
  const [dropSlot, setDropSlotState] = useState<number | null>(null);
  function setDropSlot(v: number | null) { dropSlotRef.current = v; setDropSlotState(v); }

  const [tabDragOver, setTabDragOver] = useState(false);

  function handleSave() {
    if (!url.trim()) return;
    const normalized = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    onAdd(normalized);
    setModal(false);
    setUrl("");
  }

  // ── Shortcut reorder ──────────────────────────────────────────────────────

  function handleShortcutDragStart(index: number) {
    dragIndex.current = index;
  }

  // Called from ShortcutItem's onDragOver — fires continuously with position
  function handleItemDragOver(index: number, e: React.DragEvent) {
    if (!e.dataTransfer.types.includes(SHORTCUT_DRAG_TYPE)) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const slot = e.clientX < rect.left + rect.width / 2 ? index : index + 1;
    setDropSlot(slot);
  }

  function handleGridDrop(e: React.DragEvent) {
    // Handle shortcut reorder
    if (e.dataTransfer.types.includes(SHORTCUT_DRAG_TYPE)) {
      e.preventDefault();
      const from = dragIndex.current;
      const to   = dropSlotRef.current;
      dragIndex.current = null;
      setDropSlot(null);
      if (from === null || to === null) return;
      if (from === to || to === from + 1) return; // no-op positions
      const dest = to > from ? to - 1 : to;
      onReorder(from, dest);
      return;
    }

    // Handle tab drop → add shortcut
    if (e.dataTransfer.types.includes(TAB_DRAG_TYPE)) {
      e.preventDefault();
      setTabDragOver(false);
      try {
        const data = JSON.parse(e.dataTransfer.getData(TAB_DRAG_TYPE)) as {
          url: string; title: string; favIconUrl: string;
        };
        if (data.url) onAdd(data.url);
      } catch { /* ignore */ }
    }
  }

  function handleGridDragEnd() {
    dragIndex.current = null;
    setDropSlot(null);
    setTabDragOver(false);
  }

  function handleGridDragOver(e: React.DragEvent) {
    if (e.dataTransfer.types.includes(TAB_DRAG_TYPE)) {
      e.preventDefault();
      setTabDragOver(true);
    }
    // Shortcut dragOver handled per-item; allow drop on the grid container too
    if (e.dataTransfer.types.includes(SHORTCUT_DRAG_TYPE)) {
      e.preventDefault();
    }
  }

  // Build grid items with placeholder injected at dropSlot
  const gridItems: React.ReactNode[] = [];
  shortcuts.forEach((sc, i) => {
    if (dropSlot === i && dragIndex.current !== null) {
      gridItems.push(<div key="ph" className={styles.gridPlaceholder} />);
    }
    gridItems.push(
      <ShortcutItem
        key={sc.id}
        shortcut={sc}
        index={i}
        isDragging={dragIndex.current === i}
        onRemove={onRemove}
        onDragStart={handleShortcutDragStart}
        onDragOver={handleItemDragOver}
        onDragEnd={handleGridDragEnd}
      />
    );
  });
  if (dropSlot === shortcuts.length && dragIndex.current !== null) {
    gridItems.push(<div key="ph-end" className={styles.gridPlaceholder} />);
  }
  if (tabDragOver) {
    gridItems.push(<div key="ph-tab" className={styles.gridPlaceholder} />);
  }

  return (
    <section
      className={`${styles.section} ${tabDragOver ? styles.dropZone : ""}`}
      onDragOver={handleGridDragOver}
      onDrop={handleGridDrop}
    >
      <div className={styles.header}>
        <span className={styles.title}>Shortcuts</span>
        <button className={styles.addBtn} onClick={() => setModal(true)} title="Add shortcut">
          +
        </button>
      </div>

      <div className={styles.grid}>
        {gridItems}
      </div>

      {modal && (
        <div className={styles.overlay} onClick={() => setModal(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.modalTitle}>Add Shortcut</h3>
            <label className={styles.field}>
              <span>URL</span>
              <input
                autoFocus
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://google.com"
                onKeyDown={(e) => e.key === "Enter" && handleSave()}
              />
            </label>
            <div className={styles.modalActions}>
              <button onClick={() => setModal(false)}>Cancel</button>
              <button className={styles.primary} onClick={handleSave}>
                Add
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function ShortcutItem({
  shortcut,
  index,
  isDragging,
  onRemove,
  onDragStart,
  onDragOver,
  onDragEnd,
}: {
  shortcut: Shortcut;
  index: number;
  isDragging: boolean;
  onRemove: (id: string) => void;
  onDragStart: (index: number) => void;
  onDragOver: (index: number, e: React.DragEvent) => void;
  onDragEnd: () => void;
}) {
  const didDrag = useRef(false);
  const icon = shortcut.favIconUrl || faviconUrl(shortcut.url);

  return (
    <div
      className={[styles.item, isDragging ? styles.dragging : ""].filter(Boolean).join(" ")}
      title={shortcut.name || shortcut.url}
      draggable
      onDragStart={(e) => {
        didDrag.current = true;
        e.dataTransfer.setData(SHORTCUT_DRAG_TYPE, String(index));
        e.dataTransfer.effectAllowed = "move";
        // Suppress ghost image
        const ghost = document.createElement("div");
        ghost.style.cssText = "position:fixed;top:-9999px;opacity:0;width:1px;height:1px;";
        document.body.appendChild(ghost);
        e.dataTransfer.setDragImage(ghost, 0, 0);
        setTimeout(() => document.body.removeChild(ghost), 0);
        onDragStart(index);
      }}
      onDragOver={(e) => onDragOver(index, e)}
      onDragEnd={onDragEnd}
      onClick={() => {
        if (!didDrag.current) {
          // Always navigate to the stored original URL, not the tab's current URL.
          // Read from storage directly so we never use a stale React state value.
          chrome.storage.local.get("sidebar-shortcut-urls", (result) => {
            const originalUrls = (result["sidebar-shortcut-urls"] as Record<string, string>) ?? {};
            const originalUrl  = originalUrls[shortcut.id] || shortcut.url;
            chrome.tabs.update(Number(shortcut.id), { active: true, url: originalUrl });
          });
        }
        didDrag.current = false;
      }}
    >
      <button
        className={styles.removeBtn}
        onClick={(e) => {
          e.stopPropagation();
          onRemove(shortcut.id);
        }}
      >
        ✕
      </button>
      <div className={styles.iconWrap}>
        <img
          src={icon}
          alt=""
          onError={(e) => ((e.target as HTMLImageElement).style.display = "none")}
        />
      </div>
    </div>
  );
}
