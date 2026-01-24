import { test, expect } from "@playwright/test";

test.describe("Task Pages", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
  });

  test.describe("Task Chat Page (/tasks/$sessionId)", () => {
    test("should have correct URL structure", async ({ page }) => {
      await page.goto("/tasks/test-session-id");

      // URL should match expected pattern
      expect(page.url()).toContain("/tasks/test-session-id");
    });

    test("should show 'No project selected' when no project context", async ({ page }) => {
      await page.goto("/tasks/test-session-id");

      // Wait for page to load
      await page.waitForLoadState("networkidle");

      // Should show no project selected message
      await expect(page.getByText("No project selected")).toBeVisible();
    });

    test("should render the task page structure", async ({ page }) => {
      await page.goto("/tasks/test-session-id");

      // Page should render (even if it shows an error or loading state)
      const pageContent = await page.textContent("body");
      expect(pageContent).toBeTruthy();
    });
  });
});

test.describe("Process Pages", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
  });

  test.describe("Process Terminal Page (/processes/$processId)", () => {
    test("should have correct URL structure", async ({ page }) => {
      await page.goto("/processes/test-process-id");

      // URL should match expected pattern
      expect(page.url()).toContain("/processes/test-process-id");
    });

    test("should show loading state initially", async ({ page }) => {
      await page.goto("/processes/test-process-id");

      // Should show loading or not found
      const pageContent = await page.textContent("body");
      expect(
        pageContent?.includes("Loading") || pageContent?.includes("not found")
      ).toBeTruthy();
    });

    test("should show 'Process not found' for invalid process ID", async ({ page }) => {
      await page.goto("/processes/invalid-process-id");

      // Wait for page to load
      await page.waitForLoadState("networkidle");

      // Should show process not found
      await expect(page.getByText("Process not found")).toBeVisible();
    });

    test("should render the process page structure", async ({ page }) => {
      await page.goto("/processes/test-process-id");

      // Wait for page to attempt to load
      await page.waitForLoadState("networkidle");

      // Page should render something
      const pageContent = await page.textContent("body");
      expect(pageContent).toBeTruthy();
    });
  });
});
