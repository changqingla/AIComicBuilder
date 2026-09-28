import { defineConfig, devices } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// Workers and the production server share a fresh directory for this test run.
const directory =
  process.env.AICOMIC_E2E_DIR ??
  mkdtempSync(path.join(tmpdir(), "aicomic-e2e-"));
process.env.AICOMIC_E2E_DIR = directory;
process.env.DATABASE_URL = `file:${path.join(directory, "test.db")}`;
process.env.UPLOAD_DIR = path.join(directory, "uploads");

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/setup.ts",
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:3137",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 1000 },
      },
    },
  ],
  webServer: {
    command: "node e2e/start-server.mjs",
    url: "http://127.0.0.1:3137/zh",
    reuseExistingServer: false,
    env: {
      NODE_ENV: "production",
      PORT: "3137",
      HOSTNAME: "127.0.0.1",
      NEXT_TELEMETRY_DISABLED: "1",
    },
  },
});
