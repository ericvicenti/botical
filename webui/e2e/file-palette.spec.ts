import { test, expect } from "@playwright/test";

test.describe("File Palette", () => {
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
      if (route.request().url().includes("/git/") || route.request().url().includes("/sessions") || route.request().url().includes("/files")) {
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

    await page.route("**/api/projects/project-1/files/tree", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: [
            "src/index.ts",
            "src/utils/helper.ts",
            "src/components/Button.tsx",
            "package.json",
            "README.md",
            "tsconfig.json",
          ],
        }),
      });
    });

    await page.route("**/api/projects/project-1/files", async (route) => {
      if (route.request().url().includes("/tree")) {
        return route.continue();
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: [
            { name: "src", path: "src", type: "directory" },
            { name: "package.json", path: "package.json", type: "file" },
          ],
        }),
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

  test("should open file palette with Cmd+P when project is selected", async ({ page }) => {
    // First select a project
    const projectCard = page.getByRole("button", { name: /Test Project/ }).first();
    await expect(projectCard).toBeVisible();
    await projectCard.click();

    // Wait for navigation
    await page.waitForURL(/\/projects\/project-1/);

    // Press Cmd+P to open file palette
    await page.keyboard.press("Meta+p");

    // File palette should be visible
    await expect(page.getByPlaceholder("Go to file...")).toBeVisible();
  });

  test("should show file list in palette", async ({ page }) => {
    // First select a project
    const projectCard = page.getByRole("button", { name: /Test Project/ }).first();
    await projectCard.click();
    await page.waitForURL(/\/projects\/project-1/);

    // Open file palette
    await page.keyboard.press("Meta+p");

    // Wait for file palette to open
    await expect(page.getByPlaceholder("Go to file...")).toBeVisible();

    // Should show files from the mocked data
    await expect(page.getByText("index.ts")).toBeVisible();
    await expect(page.getByText("package.json")).toBeVisible();
  });

  test("should filter files based on search query", async ({ page }) => {
    // First select a project
    const projectCard = page.getByRole("button", { name: /Test Project/ }).first();
    await projectCard.click();
    await page.waitForURL(/\/projects\/project-1/);

    // Open file palette
    await page.keyboard.press("Meta+p");

    // Wait for file palette to open
    const input = page.getByPlaceholder("Go to file...");
    await expect(input).toBeVisible();

    // Type a search query
    await input.fill("index");

    // Should filter to show only matching file
    await expect(page.getByText("index.ts")).toBeVisible();
    // package.json should not be visible (doesn't match "index")
    await expect(page.getByText("package.json")).not.toBeVisible();
  });

  test("should navigate with keyboard arrows", async ({ page }) => {
    // First select a project
    const projectCard = page.getByRole("button", { name: /Test Project/ }).first();
    await projectCard.click();
    await page.waitForURL(/\/projects\/project-1/);

    // Open file palette
    await page.keyboard.press("Meta+p");

    // Wait for file palette to open
    await expect(page.getByPlaceholder("Go to file...")).toBeVisible();

    // Get file buttons
    const fileButtons = page.getByRole("dialog").locator("button");

    // Helper to check if a button is selected
    const isSelected = async (index: number) => {
      const button = fileButtons.nth(index);
      const classes = await button.getAttribute("class");
      return classes?.includes("border-l-accent-primary") ?? false;
    };

    // First item should be selected by default
    expect(await isSelected(0)).toBe(true);

    // Press down arrow
    await page.keyboard.press("ArrowDown");

    // Second item should now be selected
    expect(await isSelected(0)).toBe(false);
    expect(await isSelected(1)).toBe(true);
  });

  test("should close on Escape", async ({ page }) => {
    // First select a project
    const projectCard = page.getByRole("button", { name: /Test Project/ }).first();
    await projectCard.click();
    await page.waitForURL(/\/projects\/project-1/);

    // Open file palette
    await page.keyboard.press("Meta+p");

    // Wait for file palette to open
    await expect(page.getByPlaceholder("Go to file...")).toBeVisible();

    // Press Escape
    await page.keyboard.press("Escape");

    // File palette should be closed
    await expect(page.getByPlaceholder("Go to file...")).not.toBeVisible();
  });

  test("Go to File command appears in command palette", async ({ page }) => {
    // First select a project
    const projectCard = page.getByRole("button", { name: /Test Project/ }).first();
    await projectCard.click();
    await page.waitForURL(/\/projects\/project-1/);

    // Open command palette (Cmd+K)
    await page.keyboard.press("Meta+k");

    // Search for file command
    const input = page.getByPlaceholder("Type a command...");
    await input.fill("go to file");

    // Should see the "Go to File" command
    await expect(page.getByText("Go to File")).toBeVisible();
  });
});
