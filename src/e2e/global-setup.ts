/**
 * Runs `pnpm build` once before the entire Playwright test suite so
 * the dist/ directory is always fresh.
 */
import { execSync } from "child_process";
import path from "path";

export default async function globalSetup() {
  const root = path.resolve(__dirname, "../..");
  console.log("[e2e] building extension…");
  execSync("pnpm build", { cwd: root, stdio: "inherit" });
  console.log("[e2e] build done");
}
