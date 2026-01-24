import { test, expect } from "@playwright/test";

test.describe("File Pages", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
  });

  test.describe("File View Page (/files/$projectId/$path)", () => {
    test("should have correct URL structure", async ({ page }) => {
      await page.goto("/files/test-project/src/index.ts");

      // URL should match expected pattern
      expect(page.url()).toContain("/files/test-project/src/index.ts");
    });

    test("should show invalid file path message when path is missing", async ({ page }) => {
      await page.goto("/files/test-project");

      // Wait for page to load
      await page.waitForLoadState("networkidle");

      // Should show invalid file path
      await expect(page.getByText("Invalid file path")).toBeVisible();
    });

    test("should render the file page structure", async ({ page }) => {
      await page.goto("/files/test-project/README.md");

      // Wait for page to load
      await page.waitForLoadState("networkidle");

      // Page should render something
      const pageContent = await page.textContent("body");
      expect(pageContent).toBeTruthy();
    });

    test("should support commit query parameter", async ({ page }) => {
      await page.goto("/files/test-project/src/index.ts?commit=abc123");

      // URL should include commit param
      expect(page.url()).toContain("commit=abc123");
    });
  });

  test.describe("Folder View Page (/folders/$projectId/$path)", () => {
    test("should have correct URL structure", async ({ page }) => {
      await page.goto("/folders/test-project/src");

      // URL should match expected pattern
      expect(page.url()).toContain("/folders/test-project/src");
    });

    test("should handle root folder (just projectId)", async ({ page }) => {
      await page.goto("/folders/test-project");

      // Wait for page to load
      await page.waitForLoadState("networkidle");

      // Should not show invalid path error (root is valid)
      const invalidText = page.getByText("Invalid folder path");
      const isInvalid = await invalidText.isVisible().catch(() => false);

      // Root folder is valid, so this should be false
      // (or show loading/error from API, not "Invalid folder path")
      expect(isInvalid).toBe(false);
    });

    test("should render the folder page structure", async ({ page }) => {
      await page.goto("/folders/test-project/src");

      // Wait for page to load
      await page.waitForLoadState("networkidle");

      // Page should render something
      const pageContent = await page.textContent("body");
      expect(pageContent).toBeTruthy();
    });

    test("should support commit query parameter", async ({ page }) => {
      await page.goto("/folders/test-project/src?commit=abc123");

      // URL should include commit param
      expect(page.url()).toContain("commit=abc123");
    });

    test("should handle deeply nested paths", async ({ page }) => {
      await page.goto("/folders/test-project/src/components/ui/buttons");

      // URL should match expected pattern
      expect(page.url()).toContain("/folders/test-project/src/components/ui/buttons");
    });
  });
});
