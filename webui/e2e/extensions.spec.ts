import { test, expect } from "@playwright/test";

test.describe("Extensions", () => {
  // Mock data
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

  const mockDockerExtension = {
    id: "docker",
    name: "Docker",
    description: "Manage Docker containers, images, and networks",
    version: "1.0.0",
    icon: "box",
    category: "infrastructure",
    frontend: {
      sidebar: {
        id: "docker",
        label: "Docker",
        icon: "box",
      },
      routes: ["/docker/*"],
    },
    status: "running",
    port: 4101,
  };

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("botical:ui", JSON.stringify({
        selectedProjectId: null,
        sidebarWidth: 240,
        sidebarCollapsed: false,
        sidebarPanel: "extensions",
        theme: "system",
      }));
    });

    // Set up API mocks
    await page.route("**/api/projects", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: [mockProject], meta: { total: 1 } }),
      });
    });

    // Mock sessions (needed for sidebar)
    await page.route("**/api/sessions?projectId=*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: [], meta: { total: 0 } }),
      });
    });

    // Mock empty workflows list
    await page.route("**/api/workflows?projectId=*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: [], meta: { total: 0, limit: 50, offset: 0, hasMore: false } }),
      });
    });

    // Mock extensions list
    await page.route("**/api/extensions", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: [mockDockerExtension] }),
      });
    });

    await page.goto("/");
  });

  test("should show extensions panel when project is selected", async ({ page }) => {
    // Mock project extensions as empty
    await page.route("**/api/projects/*/extensions", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: { enabled: [] } }),
      });
    });

    await page.goto("/");

    // Select project
    await page.getByRole("button", { name: "Test Project", exact: true }).click();

    // Extensions panel should be visible
    await expect(page.getByTestId("extensions-panel")).toBeVisible();
    await expect(page.getByText("Extensions")).toBeVisible();
  });

  test("should list available extensions in panel", async ({ page }) => {
    // Mock project extensions as empty
    await page.route("**/api/projects/*/extensions", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: { enabled: [] } }),
      });
    });

    await page.goto("/");

    // Select project
    await page.getByRole("button", { name: "Test Project", exact: true }).click();

    // Docker extension should be listed
    await expect(page.getByTestId("extension-card-docker")).toBeVisible();
    await expect(page.getByTestId("extension-card-docker").getByText("Docker", { exact: true })).toBeVisible();
    await expect(page.getByTestId("extension-card-docker").getByText(/Manage Docker/)).toBeVisible();
  });

  test("should show toggle switch for enabling extensions", async ({ page }) => {
    // Mock project extensions as empty
    await page.route("**/api/projects/*/extensions", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: { enabled: [] } }),
      });
    });

    await page.goto("/");

    // Select project
    await page.getByRole("button", { name: "Test Project", exact: true }).click();

    // Toggle label should be visible
    const toggle = page.getByTestId("extension-toggle-docker");
    await expect(toggle).toBeVisible();

    // The checkbox inside should be unchecked initially
    const checkbox = toggle.locator("input[type='checkbox']");
    await expect(checkbox).not.toBeChecked();
  });

  test("should enable extension when toggle is clicked", async ({ page }) => {
    let enabledExtensions: string[] = [];

    // Mock project extensions - track enabled state
    await page.route("**/api/projects/*/extensions", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ data: { enabled: enabledExtensions } }),
        });
      }
    });

    // Mock enable endpoint
    await page.route("**/api/projects/*/extensions/docker/enable", async (route) => {
      enabledExtensions = ["docker"];
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: { enabled: true, extensionId: "docker" } }),
      });
    });

    await page.goto("/");

    // Select project
    await page.getByRole("button", { name: "Test Project", exact: true }).click();

    // Click toggle to enable Docker
    const toggle = page.getByTestId("extension-toggle-docker");
    await toggle.click();

    // Wait for API call
    await page.waitForTimeout(500);

    // Verify the checkbox inside the toggle is now checked
    const checkbox = toggle.locator("input[type='checkbox']");
    await expect(checkbox).toBeChecked();
  });

  test("should show Docker panel in sidebar when extension is enabled", async ({ page }) => {
    // Mock project extensions with Docker enabled
    await page.route("**/api/projects/*/extensions", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: { enabled: ["docker"] } }),
      });
    });

    await page.goto("/");

    // Select project
    await page.getByRole("button", { name: "Test Project", exact: true }).click();

    // Docker panel button should be visible in sidebar
    const dockerButton = page.getByRole("button", { name: "Docker" });
    await expect(dockerButton).toBeVisible();
  });

  test("should not show Docker panel when extension is disabled", async ({ page }) => {
    // Mock project extensions as empty (Docker disabled)
    await page.route("**/api/projects/*/extensions", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: { enabled: [] } }),
      });
    });

    await page.goto("/");

    // Select project
    await page.getByRole("button", { name: "Test Project", exact: true }).click();

    // Docker panel button should NOT be visible
    const dockerButton = page.getByRole("button", { name: "Docker" });
    await expect(dockerButton).not.toBeVisible();
  });

  test("should hide Docker panel when extension is disabled via toggle", async ({ page }) => {
    let enabledExtensions = ["docker"];

    // Mock project extensions - track enabled state
    await page.route("**/api/projects/*/extensions", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ data: { enabled: enabledExtensions } }),
        });
      }
    });

    // Mock disable endpoint
    await page.route("**/api/projects/*/extensions/docker/disable", async (route) => {
      enabledExtensions = [];
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: { enabled: false, extensionId: "docker" } }),
      });
    });

    await page.goto("/");

    // Select project
    await page.getByRole("button", { name: "Test Project", exact: true }).click();

    // Docker panel button should initially be visible
    const dockerButton = page.getByRole("button", { name: "Docker" });
    await expect(dockerButton).toBeVisible();

    // Click toggle to disable Docker
    const toggle = page.getByTestId("extension-toggle-docker");
    await toggle.click();

    // Wait for API call and invalidation
    await page.waitForTimeout(500);

    // Docker panel button should no longer be visible
    await expect(dockerButton).not.toBeVisible();
  });

  test("should show extension toggle as checked when extension is enabled", async ({ page }) => {
    // Mock project extensions with Docker enabled
    await page.route("**/api/projects/*/extensions", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: { enabled: ["docker"] } }),
      });
    });

    await page.goto("/");

    // Select project
    await page.getByRole("button", { name: "Test Project", exact: true }).click();

    // The checkbox inside the toggle should be checked
    const toggle = page.getByTestId("extension-toggle-docker");
    const checkbox = toggle.locator("input[type='checkbox']");
    await expect(checkbox).toBeChecked();
  });
});
