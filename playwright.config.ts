import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./src/e2e",
  timeout: 30_000,
  retries: 0,
  workers: 1, // extensions require single worker — context not shareable in parallel
  reporter: "list",

  // globalSetup runs pnpm build before the suite
  globalSetup: "./src/e2e/global-setup.ts",
});
