import { test, expect } from "@playwright/test";

test.describe("Settings", () => {
  test.beforeEach(async ({ page }) => {
    // Clear localStorage before each test
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
  });

  test("should open settings panel when clicking settings button", async ({ page }) => {
    await page.goto("/");

    // Find and click the settings button in sidebar
    const settingsButton = page.getByTestId("settings-button");
    await expect(settingsButton).toBeVisible();
    await settingsButton.click();

    // Settings panel should show in sidebar with navigation items
    await expect(page.getByText("API Keys")).toBeVisible();
    await expect(page.getByText("Theme")).toBeVisible();
    await expect(page.getByText("Keyboard Shortcuts")).toBeVisible();
    await expect(page.getByText("About")).toBeVisible();
  });

  test("should navigate to API Keys page from settings panel", async ({ page }) => {
    await page.goto("/");

    // Open settings panel
    const settingsButton = page.getByTestId("settings-button");
    await settingsButton.click();

    // Click on API Keys
    await page.getByText("API Keys").click();

    // Should navigate to API Keys page
    await expect(page).toHaveURL("/settings/api-keys");

    // Page heading should be visible
    await expect(page.getByRole("heading", { name: "API Keys" })).toBeVisible();
  });

  test("should save Anthropic API key", async ({ page }) => {
    await page.goto("/settings/api-keys");

    // Find the API key input
    const apiKeyInput = page.getByTestId("anthropic-api-key-input");
    await expect(apiKeyInput).toBeVisible();

    // Enter an API key
    const testKey = "sk-ant-test-key-12345";
    await apiKeyInput.fill(testKey);

    // Click save button
    const saveButton = page.getByTestId("save-settings-button");
    await saveButton.click();

    // Should show saved confirmation
    await expect(saveButton).toContainText("Saved!");

    // Reload and verify the key is persisted
    await page.reload();
    const inputValue = await page.getByTestId("anthropic-api-key-input").inputValue();
    expect(inputValue).toBe(testKey);
  });

  test("should save OpenAI API key", async ({ page }) => {
    await page.goto("/settings/api-keys");

    const apiKeyInput = page.getByTestId("openai-api-key-input");
    await expect(apiKeyInput).toBeVisible();

    const testKey = "sk-test-openai-key-12345";
    await apiKeyInput.fill(testKey);

    const saveButton = page.getByTestId("save-settings-button");
    await saveButton.click();

    await expect(saveButton).toContainText("Saved!");

    // Verify persistence
    await page.reload();
    const inputValue = await page.getByTestId("openai-api-key-input").inputValue();
    expect(inputValue).toBe(testKey);
  });

  test("should change default provider", async ({ page }) => {
    await page.goto("/settings/api-keys");

    // Click OpenAI provider button
    const openaiButton = page.getByTestId("provider-openai");
    await openaiButton.click();

    // Save
    await page.getByTestId("save-settings-button").click();

    // Reload and verify
    await page.reload();

    // OpenAI should be selected (has accent styling)
    await expect(openaiButton).toHaveClass(/border-accent-primary/);
  });

  test("should show warning when no API key for selected provider", async ({ page }) => {
    await page.goto("/settings/api-keys");

    // Select anthropic (default) but no key set
    // Should show a warning
    await expect(page.getByText(/no API key is configured/i)).toBeVisible();
  });

  test("should toggle password visibility", async ({ page }) => {
    await page.goto("/settings/api-keys");

    const apiKeyInput = page.getByTestId("anthropic-api-key-input");
    await apiKeyInput.fill("test-secret-key");

    // Should be password type by default
    await expect(apiKeyInput).toHaveAttribute("type", "password");

    // Click the eye icon to show (the button is adjacent to the input)
    const toggleButton = apiKeyInput.locator("..").getByRole("button");
    await toggleButton.click();

    // Should now be text type
    await expect(apiKeyInput).toHaveAttribute("type", "text");
  });
});
