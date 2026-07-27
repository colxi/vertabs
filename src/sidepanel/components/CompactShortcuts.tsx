import React from "react";
import { Shortcut } from "../utils/shortcuts";
import { faviconUrl } from "../utils/favicon";
import styles from "./CompactShortcuts.module.css";

interface Props {
  shortcuts: Shortcut[];
}

export function CompactShortcuts({ shortcuts }: Props) {
  return (
    <div className={styles.list}>
      {shortcuts.map((sc) => {
        const icon = sc.favIconUrl || faviconUrl(sc.url);
        return (
          <button
            key={sc.id}
            className={styles.item}
            title={sc.name || sc.url}
            onClick={() => {
              chrome.tabs.get(Number(sc.id), (tab) => {
                if (tab.active) return;
                chrome.tabs.update(Number(sc.id), { active: true, url: sc.url });
              });
            }}
          >
            <div className={styles.iconWrap}>
              <img
                src={icon}
                alt={sc.name}
                onError={(e) => ((e.target as HTMLImageElement).style.display = "none")}
              />
            </div>
          </button>
        );
      })}
    </div>
  );
}
