import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright E2E Test Configuration
 *
 * The webServer config automatically starts both backend and frontend
 * servers before running tests. This ensures e2e tests are fully
 * self-contained and can run with a single command.
 *
 * Run with: bun test:e2e (from root) or bun run test:e2e (from webui)
 */

// Support running against a different port via environment variable
const port = process.env.PLAYWRIGHT_PORT || "5173";
const baseURL = `http://localhost:${port}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "html",
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    // Start both backend and frontend servers for e2e tests
    command: "bun run ../scripts/e2e-server.ts",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
