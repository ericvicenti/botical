import { test, expect } from "@playwright/test";

test.describe("Settings Pages", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
  });

  test.describe("API Keys Page (/settings/api-keys)", () => {
    test("should have correct URL structure", async ({ page }) => {
      await page.goto("/settings/api-keys");

      // URL should match expected pattern
      expect(page.url()).toContain("/settings/api-keys");
    });

    test("should render the API keys page", async ({ page }) => {
      await page.goto("/settings/api-keys");

      // Wait for page to load
      await page.waitForLoadState("networkidle");

      // Should show API Keys heading
      await expect(page.getByRole("heading", { name: "API Keys" })).toBeVisible();
    });

    test("should have API key input fields", async ({ page }) => {
      await page.goto("/settings/api-keys");

      // Wait for page to load
      await page.waitForLoadState("networkidle");

      // Should have input for Anthropic key
      await expect(page.getByTestId("anthropic-api-key-input")).toBeVisible();
    });

    test("should have provider selection buttons", async ({ page }) => {
      await page.goto("/settings/api-keys");

      // Wait for page to load
      await page.waitForLoadState("networkidle");

      // Should have provider buttons
      await expect(page.getByTestId("provider-anthropic")).toBeVisible();
      await expect(page.getByTestId("provider-openai")).toBeVisible();
      await expect(page.getByTestId("provider-google")).toBeVisible();
    });
  });

  test.describe("Shortcuts Page (/settings/shortcuts)", () => {
    test("should have correct URL structure", async ({ page }) => {
      await page.goto("/settings/shortcuts");

      // URL should match expected pattern
      expect(page.url()).toContain("/settings/shortcuts");
    });

    test("should render the shortcuts page", async ({ page }) => {
      await page.goto("/settings/shortcuts");

      // Wait for page to load
      await page.waitForLoadState("networkidle");

      // Should show Keyboard Shortcuts heading
      await expect(page.getByRole("heading", { name: "Keyboard Shortcuts" })).toBeVisible();
    });

    test("should display command palette hint", async ({ page }) => {
      await page.goto("/settings/shortcuts");

      // Wait for page to load
      await page.waitForLoadState("networkidle");

      // Should mention command palette
      const pageContent = await page.textContent("body");
      expect(pageContent).toContain("command palette");
    });
  });

  test.describe("Theme Page (/settings/theme)", () => {
    test("should have correct URL structure", async ({ page }) => {
      await page.goto("/settings/theme");

      // URL should match expected pattern
      expect(page.url()).toContain("/settings/theme");
    });

    test("should render the theme page", async ({ page }) => {
      await page.goto("/settings/theme");

      // Wait for page to load
      await page.waitForLoadState("networkidle");

      // Should show Theme heading
      await expect(page.getByRole("heading", { name: "Theme" })).toBeVisible();
    });

    test("should display theme options", async ({ page }) => {
      await page.goto("/settings/theme");

      // Wait for page to load
      await page.waitForLoadState("networkidle");

      // Should show theme option buttons
      await expect(page.getByRole("button", { name: /System/ })).toBeVisible();
      await expect(page.getByRole("button", { name: /Dark/ })).toBeVisible();
      await expect(page.getByRole("button", { name: /Light/ })).toBeVisible();
    });
  });

  test.describe("About Page (/settings/about)", () => {
    test("should have correct URL structure", async ({ page }) => {
      await page.goto("/settings/about");

      // URL should match expected pattern
      expect(page.url()).toContain("/settings/about");
    });

    test("should render the about page", async ({ page }) => {
      await page.goto("/settings/about");

      // Wait for page to load
      await page.waitForLoadState("networkidle");

      // Should show About Iris heading
      await expect(page.getByText("About Iris")).toBeVisible();
    });

    test("should display version info", async ({ page }) => {
      await page.goto("/settings/about");

      // Wait for page to load
      await page.waitForLoadState("networkidle");

      // Should show version
      await expect(page.getByText("Version")).toBeVisible();
    });

    test("should display features list", async ({ page }) => {
      await page.goto("/settings/about");

      // Wait for page to load
      await page.waitForLoadState("networkidle");

      // Should show Features section
      await expect(page.getByText("Features")).toBeVisible();
    });
  });

  test.describe("Settings Index Redirect", () => {
    test("should redirect /settings to /settings/api-keys", async ({ page }) => {
      await page.goto("/settings");

      // Wait for redirect
      await page.waitForURL("**/settings/api-keys");

      // Should be on api-keys page
      expect(page.url()).toContain("/settings/api-keys");
    });
  });
});
