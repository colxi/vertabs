import React, { useCallback, useEffect, useRef, useState } from "react";
import { faviconUrl } from "../utils/favicon";
import styles from "./BookmarksManager.module.css";

type BNode = chrome.bookmarks.BookmarkTreeNode;

type AddTarget = { parentId: string; type: "bookmark" | "folder" } | null;
type EditTarget = { node: BNode } | null;

export function BookmarksManager() {
  const [tree, setTree] = useState<BNode[]>([]);
  const [addTarget, setAddTarget] = useState<AddTarget>(null);
  const [editTarget, setEditTarget] = useState<EditTarget>(null);

  const refresh = useCallback(() => {
    chrome.bookmarks.getTree((t) => setTree(t));
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const roots = tree[0]?.children ?? [];

  return (
    <div className={styles.manager}>
      {roots.map((root) => (
        <FolderNode
          key={root.id}
          node={root}
          depth={0}
          addTarget={addTarget}
          editTarget={editTarget}
          onSetAdd={setAddTarget}
          onSetEdit={setEditTarget}
          onRefresh={refresh}
        />
      ))}

      {/* Root-level add buttons */}
      <div className={styles.rootActions}>
        <button
          className={styles.addBtn}
          onClick={() => setAddTarget({ parentId: "1", type: "bookmark" })}
        >
          + Bookmark
        </button>
        <button
          className={styles.addBtn}
          onClick={() => setAddTarget({ parentId: "1", type: "folder" })}
        >
          + Folder
        </button>
      </div>

      {addTarget?.parentId === "1" && (
        <AddForm
          target={addTarget}
          onSave={(title, url) => {
            const opts: chrome.bookmarks.CreateDetails = {
              parentId: "1",
              title,
              ...(addTarget.type === "bookmark" ? { url } : {}),
            };
            chrome.bookmarks.create(opts, () => {
              setAddTarget(null);
              refresh();
            });
          }}
          onCancel={() => setAddTarget(null)}
        />
      )}
    </div>
  );
}

// ── Recursive node ────────────────────────────────────────────────────────────

function FolderNode({
  node,
  depth,
  addTarget,
  editTarget,
  onSetAdd,
  onSetEdit,
  onRefresh,
}: {
  node: BNode;
  depth: number;
  addTarget: AddTarget;
  editTarget: EditTarget;
  onSetAdd: (t: AddTarget) => void;
  onSetEdit: (t: EditTarget) => void;
  onRefresh: () => void;
}) {
  const [open, setOpen] = useState(depth < 2);
  const dragIndex = useRef<number | null>(null);

  const children = node.children ?? [];

  function deleteNode(n: BNode) {
    if (!confirm(`Delete "${n.title}"${n.children ? " and all its contents" : ""}?`)) return;
    const action = n.children
      ? chrome.bookmarks.removeTree
      : chrome.bookmarks.remove;
    action(n.id, onRefresh);
  }

  function moveNode(id: string, parentId: string, index: number) {
    chrome.bookmarks.move(id, { parentId, index }, onRefresh);
  }

  const isEditing = editTarget?.node.id === node.id;
  const isAddingHere =
    addTarget?.parentId === node.id;

  return (
    <div className={styles.folderWrap} style={{ paddingLeft: depth > 0 ? 12 : 0 }}>
      {/* ── Folder / Bookmark row ───────────────────────────────────── */}
      {isEditing ? (
        <EditForm
          node={node}
          onSave={(title, url) => {
            chrome.bookmarks.update(node.id, { title, url }, () => {
              onSetEdit(null);
              onRefresh();
            });
          }}
          onCancel={() => onSetEdit(null)}
        />
      ) : node.children !== undefined ? (
        <div className={styles.folderRow}>
          <button
            className={styles.folderToggle}
            onClick={() => setOpen((o) => !o)}
          >
            <span className={styles.folderIcon}>{open ? "📂" : "📁"}</span>
            <span className={styles.folderName}>{node.title || "Bookmarks"}</span>
            <span className={`${styles.chevron} ${open ? styles.chevronOpen : ""}`}>▶</span>
          </button>
          <div className={styles.rowActions}>
            <button className={styles.iconBtn} onClick={() => onSetAdd({ parentId: node.id, type: "bookmark" })} title="Add bookmark">+🔖</button>
            <button className={styles.iconBtn} onClick={() => onSetAdd({ parentId: node.id, type: "folder" })} title="Add folder">+📁</button>
            {depth > 0 && (
              <>
                <button className={styles.iconBtn} onClick={() => onSetEdit({ node })} title="Rename">✏</button>
                <button className={styles.iconBtnDanger} onClick={() => deleteNode(node)} title="Delete">🗑</button>
              </>
            )}
          </div>
        </div>
      ) : (
        <BookmarkRow
          node={node}
          onEdit={() => onSetEdit({ node })}
          onDelete={() => deleteNode(node)}
        />
      )}

      {/* ── Add form ────────────────────────────────────────────────── */}
      {isAddingHere && (
        <div className={styles.addFormWrap}>
          <AddForm
            target={addTarget!}
            onSave={(title, url) => {
              const opts: chrome.bookmarks.CreateDetails = {
                parentId: node.id,
                title,
                ...(addTarget!.type === "bookmark" ? { url } : {}),
              };
              chrome.bookmarks.create(opts, () => {
                onSetAdd(null);
                onRefresh();
              });
            }}
            onCancel={() => onSetAdd(null)}
          />
        </div>
      )}

      {/* ── Children ────────────────────────────────────────────────── */}
      {open && node.children && (
        <div className={styles.children}>
          {children.map((child, i) => (
            <div
              key={child.id}
              draggable={!!child.url}
              onDragStart={() => { dragIndex.current = i; }}
              onDragEnter={() => {
                if (dragIndex.current !== null && dragIndex.current !== i) {
                  moveNode(children[dragIndex.current].id, node.id, i);
                  dragIndex.current = i;
                }
              }}
              onDragOver={(e) => e.preventDefault()}
              onDragEnd={() => { dragIndex.current = null; }}
            >
              <FolderNode
                key={child.id}
                node={child}
                depth={depth + 1}
                addTarget={addTarget}
                editTarget={editTarget}
                onSetAdd={onSetAdd}
                onSetEdit={onSetEdit}
                onRefresh={onRefresh}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Bookmark leaf row ─────────────────────────────────────────────────────────

function BookmarkRow({
  node,
  onEdit,
  onDelete,
}: {
  node: BNode;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className={styles.bookmarkRow}>
      <img
        className={styles.favicon}
        src={faviconUrl(node.url ?? "")}
        alt=""
        onError={(e) => ((e.target as HTMLImageElement).style.display = "none")}
      />
      <div className={styles.bookmarkInfo}>
        <span className={styles.bookmarkTitle}>{node.title || node.url}</span>
        <span className={styles.bookmarkUrl}>{node.url}</span>
      </div>
      <div className={styles.rowActions}>
        <button className={styles.iconBtn} onClick={onEdit} title="Edit">✏</button>
        <button className={styles.iconBtnDanger} onClick={onDelete} title="Delete">🗑</button>
      </div>
    </div>
  );
}

// ── Add form ──────────────────────────────────────────────────────────────────

function AddForm({
  target,
  onSave,
  onCancel,
}: {
  target: AddTarget;
  onSave: (title: string, url: string) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");

  function save() {
    if (!title.trim()) return;
    const normalized =
      target?.type === "bookmark" && url.trim()
        ? /^https?:\/\//i.test(url)
          ? url
          : `https://${url}`
        : "";
    onSave(title.trim(), normalized);
  }

  return (
    <div className={styles.form}>
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={target?.type === "folder" ? "Folder name" : "Title"}
        onKeyDown={(e) => e.key === "Enter" && save()}
      />
      {target?.type === "bookmark" && (
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://…"
          onKeyDown={(e) => e.key === "Enter" && save()}
        />
      )}
      <div className={styles.formActions}>
        <button className={styles.btnPrimary} onClick={save}>Add</button>
        <button onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

// ── Edit form ─────────────────────────────────────────────────────────────────

function EditForm({
  node,
  onSave,
  onCancel,
}: {
  node: BNode;
  onSave: (title: string, url: string) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(node.title);
  const [url, setUrl] = useState(node.url ?? "");

  function save() {
    if (!title.trim()) return;
    onSave(title.trim(), url.trim());
  }

  return (
    <div className={styles.form}>
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title"
        onKeyDown={(e) => e.key === "Enter" && save()}
      />
      {node.url !== undefined && (
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://…"
          onKeyDown={(e) => e.key === "Enter" && save()}
        />
      )}
      <div className={styles.formActions}>
        <button className={styles.btnPrimary} onClick={save}>Save</button>
        <button onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
