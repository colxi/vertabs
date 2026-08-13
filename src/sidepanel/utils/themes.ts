export interface Theme {
  id: string;
  label: string;
  accent: string;
  bg: string;
  surface: string;
  text: string;
}

export const THEMES: Theme[] = [
  {
    id: "dark",
    label: "Dark",
    accent: "#7c3aed",
    bg: "#16171a",
    surface: "#22232a",
    text: "#eaebed",
  },
  {
    id: "midnight",
    label: "Midnight",
    accent: "#3b82f6",
    bg: "#0d1117",
    surface: "#161b22",
    text: "#e6edf3",
  },
  {
    id: "forest",
    label: "Forest",
    accent: "#22c55e",
    bg: "#0d1a12",
    surface: "#122018",
    text: "#dcfce7",
  },
  {
    id: "rose",
    label: "Rose",
    accent: "#f43f5e",
    bg: "#1a0d11",
    surface: "#21121a",
    text: "#ffe4e6",
  },
  {
    id: "slate",
    label: "Slate",
    accent: "#94a3b8",
    bg: "#0f172a",
    surface: "#1e293b",
    text: "#e2e8f0",
  },
  {
    id: "custom",
    label: "Custom",
    accent: "#7c3aed",
    bg: "#16171a",
    surface: "#22232a",
    text: "#eaebed",
  },
];

export function themeById(id: string): Theme | undefined {
  return THEMES.find((t) => t.id === id);
}
