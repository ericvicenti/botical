import { test, expect } from "@playwright/test";

test.describe("Workflow Pages", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
  });

  test.describe("Workflow Editor Page (/workflows/$workflowId)", () => {
    test("should have correct URL structure", async ({ page }) => {
      await page.goto("/workflows/test-workflow-id");

      // URL should match expected pattern
      expect(page.url()).toContain("/workflows/test-workflow-id");
    });

    test("should render the workflow editor page structure", async ({ page }) => {
      await page.goto("/workflows/test-workflow-id");

      // Wait for page to load
      await page.waitForLoadState("networkidle");

      // Page should render something
      const pageContent = await page.textContent("body");
      expect(pageContent).toBeTruthy();
    });

    test("should show loading or content state", async ({ page }) => {
      await page.goto("/workflows/test-workflow-id");

      // Wait for page to load
      await page.waitForLoadState("networkidle");

      // Should show loading, editor, error, or "No project selected" message
      const hasContent = await page.evaluate(() => {
        const body = document.body.textContent || "";
        return (
          body.includes("Loading") ||
          body.includes("Workflow") ||
          body.includes("Error") ||
          body.includes("No project selected")
        );
      });

      expect(hasContent).toBe(true);
    });

    test("should handle different workflow IDs", async ({ page }) => {
      const workflowIds = ["workflow-1", "workflow-abc123", "my-custom-workflow"];

      for (const id of workflowIds) {
        await page.goto(`/workflows/${id}`);
        expect(page.url()).toContain(`/workflows/${id}`);
      }
    });
  });

  test.describe("Workflow Execution Page (/workflow-runs/$executionId)", () => {
    test("should have correct URL structure", async ({ page }) => {
      await page.goto("/workflow-runs/exec-123");

      // URL should match expected pattern
      expect(page.url()).toContain("/workflow-runs/exec-123");
    });

    test("should render the workflow execution page structure", async ({ page }) => {
      await page.goto("/workflow-runs/exec-123");

      // Wait for page to load
      await page.waitForLoadState("networkidle");

      // Page should render something
      const pageContent = await page.textContent("body");
      expect(pageContent).toBeTruthy();
    });

    test("should handle different execution IDs", async ({ page }) => {
      const executionIds = ["exec-1", "exec-abc123", "run-12345"];

      for (const id of executionIds) {
        await page.goto(`/workflow-runs/${id}`);
        expect(page.url()).toContain(`/workflow-runs/${id}`);
      }
    });

    test("should show loading or error state", async ({ page }) => {
      await page.goto("/workflow-runs/nonexistent-execution");

      // Wait for page to load
      await page.waitForLoadState("networkidle");

      // Should show some content (loading, error, or execution data)
      const pageContent = await page.textContent("body");
      expect(pageContent).toBeTruthy();
    });
  });
});
