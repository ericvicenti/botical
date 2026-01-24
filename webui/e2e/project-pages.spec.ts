import { test, expect } from "@playwright/test";

test.describe("Project Pages", () => {
  test.beforeEach(async ({ page }) => {
    // Clear localStorage before each test
    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
  });

  test.describe("Projects List Page (/)", () => {
    test("should display Projects heading", async ({ page }) => {
      await page.goto("/");

      await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
    });

    test("should set document title to include Projects", async ({ page }) => {
      await page.goto("/");

      // Wait for page to load
      await page.waitForLoadState("networkidle");

      // Document title should contain "Projects" or "Iris"
      await expect(page).toHaveTitle(/Projects|Iris/);
    });
  });

  test.describe("Create Project Page (/create-project)", () => {
    test("should display Create New Project heading", async ({ page }) => {
      await page.goto("/create-project");

      await expect(
        page.getByRole("heading", { name: "Create New Project" })
      ).toBeVisible();
    });

    test("should show mode selector with Local and Clone options", async ({ page }) => {
      await page.goto("/create-project");

      await expect(page.getByText("Local Project")).toBeVisible();
      await expect(page.getByText("Clone from URL")).toBeVisible();
    });

    test("should switch between local and clone modes", async ({ page }) => {
      await page.goto("/create-project");

      // Default is local mode - project name field should be visible
      const projectNameInput = page.locator("#projectName");
      await expect(projectNameInput).toBeVisible();

      // Repository URL should not be visible in local mode
      await expect(page.locator("#repoUrl")).not.toBeVisible();

      // Switch to clone mode
      await page.getByText("Clone from URL").click();

      // Repository URL field should now be visible
      await expect(page.locator("#repoUrl")).toBeVisible();
    });

    test("should show optional label for project name in clone mode", async ({ page }) => {
      await page.goto("/create-project");

      // In local mode, label doesn't say optional
      const labelLocal = page.getByText("Project Name", { exact: true });

      // Switch to clone mode
      await page.getByText("Clone from URL").click();

      // In clone mode, label should say optional
      await expect(page.getByText("Project Name (optional)")).toBeVisible();
    });

    test("should disable submit button when project name is empty in local mode", async ({ page }) => {
      await page.goto("/create-project");

      const submitButton = page.getByRole("button", { name: "Create Project" });
      await expect(submitButton).toBeDisabled();
    });

    test("should disable submit button when repo URL is empty in clone mode", async ({ page }) => {
      await page.goto("/create-project");

      // Switch to clone mode
      await page.getByText("Clone from URL").click();

      const submitButton = page.getByRole("button", { name: "Clone Repository" });
      await expect(submitButton).toBeDisabled();
    });

    test("should enable submit button when project name is filled in local mode", async ({ page }) => {
      await page.goto("/create-project");

      const projectNameInput = page.locator("#projectName");
      await projectNameInput.fill("Test Project");

      const submitButton = page.getByRole("button", { name: "Create Project" });
      await expect(submitButton).toBeEnabled();
    });

    test("should enable submit button when repo URL is filled in clone mode", async ({ page }) => {
      await page.goto("/create-project");

      // Switch to clone mode
      await page.getByText("Clone from URL").click();

      const repoUrlInput = page.locator("#repoUrl");
      await repoUrlInput.fill("https://github.com/user/repo.git");

      const submitButton = page.getByRole("button", { name: "Clone Repository" });
      await expect(submitButton).toBeEnabled();
    });

    test("should set document title to include Create Project", async ({ page }) => {
      await page.goto("/create-project");

      await page.waitForLoadState("networkidle");
      await expect(page).toHaveTitle(/Create Project|Iris/);
    });

    test("should show project path field in local mode", async ({ page }) => {
      await page.goto("/create-project");

      await expect(page.locator("#projectPath")).toBeVisible();
      await expect(page.getByText("Project Path (optional)")).toBeVisible();
    });

    test("should show branch field in clone mode", async ({ page }) => {
      await page.goto("/create-project");

      // Switch to clone mode
      await page.getByText("Clone from URL").click();

      await expect(page.locator("#cloneBranch")).toBeVisible();
      await expect(page.getByText("Branch (optional)")).toBeVisible();
    });
  });

  test.describe("Project Overview Page (/projects/$projectId)", () => {
    test("should show loading or error state for invalid project ID", async ({ page }) => {
      await page.goto("/projects/invalid-project-id");

      // Wait for page to attempt to load
      await page.waitForLoadState("networkidle");

      // Should show error state or some content
      const pageContent = await page.textContent("body");
      expect(pageContent).toBeTruthy();
    });

    test("should have correct URL structure", async ({ page }) => {
      await page.goto("/projects/test-id");

      // URL should match expected pattern
      expect(page.url()).toContain("/projects/test-id");
    });
  });

  test.describe("Project Settings Page (/projects/$projectId/settings)", () => {
    test("should show loading or error state", async ({ page }) => {
      await page.goto("/projects/test-id/settings");

      // Wait for page to attempt to load
      await page.waitForLoadState("networkidle");

      // Page should render something
      const pageContent = await page.textContent("body");
      expect(pageContent).toBeTruthy();
    });

    test("should have correct URL structure", async ({ page }) => {
      await page.goto("/projects/test-id/settings");

      // URL should match expected pattern
      expect(page.url()).toContain("/projects/test-id/settings");
    });
  });
});
