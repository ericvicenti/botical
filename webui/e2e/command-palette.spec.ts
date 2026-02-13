import { test, expect } from "@playwright/test";

test.describe("Command Palette", () => {
  test.beforeEach(async ({ page }) => {
    // Mock auth to skip login
    await page.route("**/api/auth/mode", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ mode: "single-user", user: { userId: "user-1", id: "user-1", email: "test@test.com", displayName: "Test User", isAdmin: true, canExecuteCode: true } }),
      });
    });
    // Mock API responses
    await page.route("**/api/projects", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: [
            { id: "project-1", name: "Test Project", path: "/test/path" },
          ],
        }),
      });
    });

    await page.route("**/api/projects/project-1", async (route) => {
      if (route.request().url().includes("/git/") || route.request().url().includes("/sessions")) {
        return route.continue();
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            id: "project-1",
            name: "Test Project",
            path: "/test/path",
          },
        }),
      });
    });

    await page.route("**/api/projects/project-1/git/status", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            isRepo: true,
            branch: "main",
            files: [],
            ahead: 0,
            behind: 0,
          },
        }),
      });
    });

    await page.route("**/api/projects/project-1/sessions", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: [] }),
      });
    });

    await page.route("**/api/settings", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            userId: "test-user",
            defaultProvider: "anthropic",
            anthropicApiKey: "",
          },
        }),
      });
    });

    // Navigate to home
    await page.goto("/");
    await page.waitForLoadState("networkidle");
  });

  test("should open command palette with Cmd+K", async ({ page }) => {
    // Press Cmd+K to open command palette
    await page.keyboard.press("Meta+k");

    // Command palette should be visible
    await expect(page.getByPlaceholder("Type a command...")).toBeVisible();
  });

  test("should show built-in commands", async ({ page }) => {
    // Open command palette
    await page.keyboard.press("Meta+k");

    // Type to search
    await page.getByPlaceholder("Type a command...").fill("toggle");

    // Should see toggle sidebar command
    await expect(page.getByText("Toggle Sidebar")).toBeVisible();
  });

  test("should list all available commands", async ({ page }) => {
    // Open command palette
    await page.keyboard.press("Meta+k");

    // Wait for command palette to be open
    await expect(page.getByPlaceholder("Type a command...")).toBeVisible();

    // Wait for commands to render
    await expect(page.getByText("Toggle Sidebar")).toBeVisible();

    // Get all command buttons in the dialog (using role selector since Modal uses role="dialog")
    const commandButtons = page.getByRole("dialog").locator("button").filter({ hasText: /.+/ });
    const count = await commandButtons.count();

    // Should have some commands
    expect(count).toBeGreaterThan(0);
  });

  test("should navigate commands with keyboard arrows", async ({ page }) => {
    // Open command palette
    await page.keyboard.press("Meta+k");

    // Wait for commands to render
    await expect(page.getByText("Toggle Sidebar")).toBeVisible();

    // Get command buttons
    const commands = page.getByRole("dialog").locator("button");
    const firstCommand = commands.first();
    const secondCommand = commands.nth(1);

    // First command should be selected by default (has accent border)
    const isSelected = async (locator: typeof firstCommand) => {
      const classes = await locator.getAttribute("class");
      // Selected items have accent-primary border and background
      return classes?.includes("border-l-accent-primary") ?? false;
    };

    expect(await isSelected(firstCommand)).toBe(true);
    expect(await isSelected(secondCommand)).toBe(false);

    // Press down arrow to select second command
    await page.keyboard.press("ArrowDown");

    // Second command should now be selected, first should not
    expect(await isSelected(firstCommand)).toBe(false);
    expect(await isSelected(secondCommand)).toBe(true);

    // Press up arrow to go back to first
    await page.keyboard.press("ArrowUp");
    expect(await isSelected(firstCommand)).toBe(true);
    expect(await isSelected(secondCommand)).toBe(false);
  });

  test("should show git commands when project is selected", async ({ page }) => {
    // Click on the project in the main content
    const projectCard = page.getByRole("button", { name: /Test Project/ }).first();
    await expect(projectCard).toBeVisible();
    await projectCard.click();

    // Wait for navigation
    await page.waitForURL(/\/projects\/project-1/);

    // Open command palette
    await page.keyboard.press("Meta+k");

    // Search for commit
    const input = page.getByPlaceholder("Type a command...");
    await input.fill("commit");

    // Wait a bit for filtering
    await page.waitForTimeout(100);

    // Get filtered commands
    const filteredCommands = await page.locator("button").allTextContents();

    // Should see Create Commit action or Review Commit page
    const hasCommitCommand = filteredCommands.some(cmd =>
      cmd.toLowerCase().includes("commit")
    );
    expect(hasCommitCommand).toBe(true);
  });
});
