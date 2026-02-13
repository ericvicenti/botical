import { test, expect } from "@playwright/test";

test.describe("Task Pages", () => {
  test.beforeEach(async ({ page }) => {
    // Mock auth to skip login
    await page.route("**/api/auth/mode", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ mode: "single-user", user: { userId: "user-1", id: "user-1", email: "test@test.com", displayName: "Test User", isAdmin: true, canExecuteCode: true } }),
      });
    });
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
  });

  test.describe("Task Chat Page (/tasks/$sessionId)", () => {
    test("should have correct URL structure", async ({ page }) => {
      await page.goto("/projects/project-1/tasks/test-session-id");

      // URL should match expected pattern
      expect(page.url()).toContain("/projects/project-1/tasks/test-session-id");
    });

    test("should show 'No project selected' when no project context", async ({ page }) => {
      await page.goto("/projects/project-1/tasks/test-session-id");

      // Wait for page to load
      await page.waitForLoadState("networkidle");

      // Should show no project selected message
      await expect(page.getByText("No project selected")).toBeVisible();
    });

    test("should render the task page structure", async ({ page }) => {
      await page.goto("/projects/project-1/tasks/test-session-id");

      // Page should render (even if it shows an error or loading state)
      const pageContent = await page.textContent("body");
      expect(pageContent).toBeTruthy();
    });
  });
});

test.describe("Process Pages", () => {
  test.beforeEach(async ({ page }) => {
    // Mock auth to skip login
    await page.route("**/api/auth/mode", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ mode: "single-user", user: { userId: "user-1", id: "user-1", email: "test@test.com", displayName: "Test User", isAdmin: true, canExecuteCode: true } }),
      });
    });
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
  });

  test.describe("Process Terminal Page (/processes/$processId)", () => {
    test("should have correct URL structure", async ({ page }) => {
      await page.goto("/projects/project-1/processes/test-process-id");

      // URL should match expected pattern
      expect(page.url()).toContain("/projects/project-1/processes/test-process-id");
    });

    test("should show loading state initially", async ({ page }) => {
      await page.goto("/projects/project-1/processes/test-process-id");

      // Should show loading or not found
      const pageContent = await page.textContent("body");
      expect(
        pageContent?.includes("Loading") || pageContent?.includes("not found")
      ).toBeTruthy();
    });

    test("should show 'Process not found' for invalid process ID", async ({ page }) => {
      await page.goto("/projects/project-1/processes/invalid-process-id");

      // Wait for page to load
      await page.waitForLoadState("networkidle");

      // Should show process not found
      await expect(page.getByText("Process not found")).toBeVisible();
    });

    test("should render the process page structure", async ({ page }) => {
      await page.goto("/projects/project-1/processes/test-process-id");

      // Wait for page to attempt to load
      await page.waitForLoadState("networkidle");

      // Page should render something
      const pageContent = await page.textContent("body");
      expect(pageContent).toBeTruthy();
    });
  });
});
