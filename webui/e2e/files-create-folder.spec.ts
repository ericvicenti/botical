import { test, expect } from "@playwright/test";

test.describe("Files - Create Folder", () => {
  const mockProject = {
    id: "project-1",
    name: "Test Project",
    description: null,
    ownerId: "user-1",
    type: "local",
    path: "/test/project",
    gitRemote: null,
    iconUrl: null,
    color: null,
    settings: {},
    createdAt: Date.now(),
    updatedAt: Date.now(),
    archivedAt: null,
  };

  test.beforeEach(async ({ page }) => {
    // Mock auth to skip login
    await page.route("**/api/auth/mode", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ mode: "single-user", user: { userId: "user-1", id: "user-1", email: "test@test.com", displayName: "Test User", isAdmin: true, canExecuteCode: true } }),
      });
    });
    // Mock projects API
    await page.route("**/api/projects", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: [mockProject], meta: { total: 1 } }),
      });
    });

    // Mock files API - empty directory
    await page.route("**/api/projects/project-1/files?path=", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: [] }),
      });
    });

    // Mock files API - root directory
    await page.route("**/api/projects/project-1/files", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ data: [] }),
        });
      }
    });

    // Mock sessions API
    await page.route("**/api/sessions?projectId=*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: [], meta: { total: 0 } }),
      });
    });

    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
  });

  test("should create a folder from the files panel dropdown", async ({ page }) => {
    // Track the folder creation request
    let folderCreationRequest: { url: string; method: string } | null = null;

    // Mock the folder creation API
    await page.route("**/api/projects/project-1/folders/**", async (route) => {
      folderCreationRequest = {
        url: route.request().url(),
        method: route.request().method(),
      };

      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({ data: { path: "my-new-folder" } }),
        });
      } else {
        await route.continue();
      }
    });

    await page.goto("/");

    // Select the project
    await page.getByRole("button", { name: /Test Project/ }).first().click();

    // Switch to Files panel
    await page.getByRole("button", { name: "Files" }).click();

    // Wait for the files panel to be visible
    await expect(
      page.locator(".text-xs.font-medium").filter({ hasText: "Files" })
    ).toBeVisible();

    // Click the dropdown menu button (the "..." button)
    const menuButton = page.locator('[title="File actions"]');
    await menuButton.click();

    // Click "New Folder"
    await page.getByRole("button", { name: "New Folder" }).click();

    // Wait for the input to appear and type the folder name
    const folderInput = page.locator('input[placeholder="folder-name"]');
    await expect(folderInput).toBeVisible();
    await folderInput.fill("my-new-folder");

    // Press Enter to create the folder
    await folderInput.press("Enter");

    // Wait for the API call to complete
    await page.waitForTimeout(500);

    // Verify the folder creation request was made
    expect(folderCreationRequest).not.toBeNull();
    expect(folderCreationRequest?.method).toBe("POST");
    expect(folderCreationRequest?.url).toContain("/projects/project-1/folders/");
    expect(folderCreationRequest?.url).toContain("my-new-folder");
  });

  test("should show the create folder input when clicking New Folder", async ({ page }) => {
    await page.goto("/");

    // Select the project
    await page.getByRole("button", { name: /Test Project/ }).first().click();

    // Switch to Files panel
    await page.getByRole("button", { name: "Files" }).click();

    // Click the dropdown menu button
    const menuButton = page.locator('[title="File actions"]');
    await menuButton.click();

    // Click "New Folder"
    await page.getByRole("button", { name: "New Folder" }).click();

    // Verify the input appears
    const folderInput = page.locator('input[placeholder="folder-name"]');
    await expect(folderInput).toBeVisible();
    await expect(folderInput).toBeFocused();
  });

  test("should cancel folder creation when pressing Escape", async ({ page }) => {
    await page.goto("/");

    // Select the project
    await page.getByRole("button", { name: /Test Project/ }).first().click();

    // Switch to Files panel
    await page.getByRole("button", { name: "Files" }).click();

    // Click the dropdown menu button
    const menuButton = page.locator('[title="File actions"]');
    await menuButton.click();

    // Click "New Folder"
    await page.getByRole("button", { name: "New Folder" }).click();

    // Verify the input appears
    const folderInput = page.locator('input[placeholder="folder-name"]');
    await expect(folderInput).toBeVisible();

    // Press Escape to cancel
    await folderInput.press("Escape");

    // Input should disappear
    await expect(folderInput).not.toBeVisible();
  });

  test("should not create folder with empty name", async ({ page }) => {
    let folderCreationCalled = false;

    // Mock the folder creation API
    await page.route("**/api/projects/project-1/folders/**", async (route) => {
      folderCreationCalled = true;
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ data: { path: "" } }),
      });
    });

    await page.goto("/");

    // Select the project
    await page.getByRole("button", { name: /Test Project/ }).first().click();

    // Switch to Files panel
    await page.getByRole("button", { name: "Files" }).click();

    // Click the dropdown menu button
    const menuButton = page.locator('[title="File actions"]');
    await menuButton.click();

    // Click "New Folder"
    await page.getByRole("button", { name: "New Folder" }).click();

    // Press Enter without typing anything
    const folderInput = page.locator('input[placeholder="folder-name"]');
    await expect(folderInput).toBeVisible();
    await folderInput.press("Enter");

    // Wait a bit and verify no API call was made
    await page.waitForTimeout(300);
    expect(folderCreationCalled).toBe(false);
  });
});
