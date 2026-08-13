import React from "react";
import { createRoot } from "react-dom/client";
import { CommandPaletteApp } from "./App";

const root = document.getElementById("root")!;
createRoot(root).render(<CommandPaletteApp />);
