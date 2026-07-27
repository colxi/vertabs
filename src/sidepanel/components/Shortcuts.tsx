import React, { useRef, useState } from "react";
import styles from "./Shortcuts.module.css";
import { faviconUrl } from "../utils/favicon";
import { Shortcut } from "../utils/shortcuts";

interface Props {
  shortcuts: Shortcut[];
  onAdd: (url: string) => void;
  onRemove: (id: string) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
}

export function Shortcuts({ shortcuts, onAdd, onRemove, onReorder }: Props) {
  const [modal, setModal] = useState(false);
  const [url, setUrl] = useState("");

  const dragIndex = useRef<number | null>(null);
  const [dropTarget, setDropTarget] = useState<number | null>(null);

  function handleSave() {
    if (!url.trim()) return;
    const normalized = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    onAdd(normalized);
    setModal(false);
    setUrl("");
  }

  function handleDragStart(index: number) {
    dragIndex.current = index;
  }

  function handleDragEnter(index: number) {
    if (dragIndex.current !== null && dragIndex.current !== index) {
      setDropTarget(index);
    }
  }

  function handleDragEnd() {
    if (dragIndex.current !== null && dropTarget !== null) {
      onReorder(dragIndex.current, dropTarget);
    }
    dragIndex.current = null;
    setDropTarget(null);
  }

  return (
    <section className={styles.section}>
      <div className={styles.header}>
        <span className={styles.title}>Shortcuts</span>
        <button className={styles.addBtn} onClick={() => setModal(true)} title="Add shortcut">
          +
        </button>
      </div>

      <div className={styles.grid}>
        {shortcuts.map((sc, i) => (
          <ShortcutItem
            key={sc.id}
            shortcut={sc}
            index={i}
            isDragging={dragIndex.current === i}
            isDropTarget={dropTarget === i}
            onRemove={onRemove}
            onDragStart={handleDragStart}
            onDragEnter={handleDragEnter}
            onDragEnd={handleDragEnd}
          />
        ))}
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
  isDropTarget,
  onRemove,
  onDragStart,
  onDragEnter,
  onDragEnd,
}: {
  shortcut: Shortcut;
  index: number;
  isDragging: boolean;
  isDropTarget: boolean;
  onRemove: (id: string) => void;
  onDragStart: (index: number) => void;
  onDragEnter: (index: number) => void;
  onDragEnd: () => void;
}) {
  const didDrag = useRef(false);

  const classNames = [
    styles.item,
    isDragging ? styles.dragging : "",
    isDropTarget ? styles.dropTarget : "",
  ]
    .filter(Boolean)
    .join(" ");

  // Prefer Chrome-provided favicon; fall back to /favicon.ico heuristic.
  const icon = shortcut.favIconUrl || faviconUrl(shortcut.url);

  return (
    <div
      className={classNames}
      title={shortcut.name || shortcut.url}
      draggable
      onDragStart={(e) => {
        didDrag.current = false;
        const ghost = document.createElement("div");
        ghost.style.cssText = "position:fixed;top:-9999px;opacity:0;width:1px;height:1px;";
        document.body.appendChild(ghost);
        e.dataTransfer.setDragImage(ghost, 0, 0);
        setTimeout(() => document.body.removeChild(ghost), 0);
        onDragStart(index);
      }}
      onDragEnter={() => {
        didDrag.current = true;
        onDragEnter(index);
      }}
      onDragOver={(e) => e.preventDefault()}
      onDragEnd={onDragEnd}
      onClick={() => {
        if (!didDrag.current) {
          chrome.tabs.get(Number(shortcut.id), (tab) => {
            if (tab.active) return;
            chrome.tabs.update(Number(shortcut.id), { active: true, url: shortcut.url });
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
