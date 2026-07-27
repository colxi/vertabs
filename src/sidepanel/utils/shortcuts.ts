export interface Shortcut {
  /** String representation of the Chrome tab id */
  id: string;
  /** Page title — populated from tab.title once loaded */
  name: string;
  url: string;
  /** Chrome-provided favicon URL (tab.favIconUrl) */
  favIconUrl?: string;
}
