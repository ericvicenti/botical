import { test, expect } from "@playwright/test";

test.describe("Tasks", () => {
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

  const mockSession = {
    id: "session-1",
    slug: "test-task",
    parentId: null,
    title: "Test Task",
    status: "active",
    agent: "default",
    providerId: "anthropic",
    modelId: null,
    messageCount: 0,
    totalCost: 0,
    totalTokensInput: 0,
    totalTokensOutput: 0,
    shareUrl: null,
    shareSecret: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  test.beforeEach(async ({ page }) => {
    // Set up API mocks
    await page.route("**/api/projects", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: [mockProject], meta: { total: 1 } }),
      });
    });

    await page.route("**/api/sessions?projectId=*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: [], meta: { total: 0 } }),
      });
    });

    await page.route("**/api/sessions", async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({ data: mockSession }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ data: [], meta: { total: 0 } }),
        });
      }
    });

    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
  });

  test("should show tasks panel in sidebar", async ({ page }) => {
    await page.goto("/");

    // Click on the project to select it (first one in sidebar)
    await page.getByRole("button", { name: "Test Project", exact: true }).click();

    // Tasks panel should be available in sidebar
    const tasksButton = page.getByRole("button", { name: "Tasks" });
    await expect(tasksButton).toBeVisible();
  });

  test("should switch to tasks panel when clicking tasks icon", async ({ page }) => {
    await page.goto("/");

    // Select project
    await page.getByRole("button", { name: "Test Project", exact: true }).click();

    // Click tasks icon in sidebar
    const tasksButton = page.getByRole("button", { name: "Tasks" });
    await tasksButton.click();

    // Tasks panel should show - use the sidebar panel header
    await expect(page.locator('.text-xs.font-medium').filter({ hasText: 'Tasks' })).toBeVisible();
    await expect(page.getByText("No tasks yet")).toBeVisible();
  });

  test("should create new task when clicking create button", async ({ page }) => {
    await page.goto("/");

    // Select project
    await page.getByRole("button", { name: "Test Project", exact: true }).click();

    // Go to tasks panel
    await page.getByRole("button", { name: "Tasks" }).click();

    // Mock the session list to return the new session after creation
    await page.route("**/api/sessions?projectId=*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: [mockSession], meta: { total: 1 } }),
      });
    });

    // Mock the session fetch for the task view
    await page.route("**/api/sessions/session-1?projectId=*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: mockSession }),
      });
    });

    // Mock messages endpoint
    await page.route("**/api/sessions/session-1/messages?projectId=*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: [], meta: { total: 0 } }),
      });
    });

    // Click create task button (the + button)
    const createButton = page.getByTestId("new-task-button");
    await createButton.click();

    // Should navigate to task view
    await expect(page).toHaveURL(/\/tasks\/session-1/);

    // Task chat heading should be visible
    await expect(page.getByRole("heading", { name: "Test Task" })).toBeVisible();
  });

  test("should open existing task when clicking on it", async ({ page }) => {
    // Set up mock with existing session
    await page.route("**/api/sessions?projectId=*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: [mockSession], meta: { total: 1 } }),
      });
    });

    await page.route("**/api/sessions/session-1?projectId=*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: mockSession }),
      });
    });

    await page.route("**/api/sessions/session-1/messages?projectId=*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: [], meta: { total: 0 } }),
      });
    });

    await page.goto("/");

    // Select project
    await page.getByRole("button", { name: "Test Project", exact: true }).click();

    // Go to tasks panel
    await page.getByRole("button", { name: "Tasks" }).click();

    // Click on the existing task in the sidebar list
    await page.getByTestId("task-item-session-1").click();

    // Should navigate to task view
    await expect(page).toHaveURL(/\/tasks\/session-1/);

    // Task chat should be visible
    await expect(page.getByRole("heading", { name: "Test Task" })).toBeVisible();
  });

  test("should show empty state in task chat", async ({ page }) => {
    await page.route("**/api/sessions/session-1?projectId=*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: mockSession }),
      });
    });

    await page.route("**/api/sessions/session-1/messages?projectId=*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: [], meta: { total: 0 } }),
      });
    });

    // Set up localStorage with a selected project
    await page.goto("/");
    await page.evaluate((projectId) => {
      localStorage.setItem("iris:ui", JSON.stringify({ selectedProjectId: projectId }));
    }, mockProject.id);

    await page.goto("/tasks/session-1");

    // Should show empty state
    await expect(page.getByText("Start a conversation")).toBeVisible();
    await expect(page.getByText(/Tell the agent what you'd like to accomplish/)).toBeVisible();
  });

  test("should show API key warning when no key configured", async ({ page }) => {
    await page.route("**/api/sessions/session-1?projectId=*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: mockSession }),
      });
    });

    await page.route("**/api/sessions/session-1/messages?projectId=*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: [], meta: { total: 0 } }),
      });
    });

    // Ensure no API keys are set
    await page.goto("/");
    await page.evaluate((projectId) => {
      localStorage.setItem("iris:ui", JSON.stringify({ selectedProjectId: projectId }));
      localStorage.setItem("iris:settings", JSON.stringify({ defaultProvider: "anthropic", userId: "test-user" }));
    }, mockProject.id);

    await page.goto("/tasks/session-1");

    // Should show API key warning
    await expect(page.getByText(/No API key configured/)).toBeVisible();
    await expect(page.getByText(/Settings/)).toBeVisible();
  });

  test("should have input disabled when no API key", async ({ page }) => {
    await page.route("**/api/sessions/session-1?projectId=*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: mockSession }),
      });
    });

    await page.route("**/api/sessions/session-1/messages?projectId=*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: [], meta: { total: 0 } }),
      });
    });

    await page.goto("/");
    await page.evaluate((projectId) => {
      localStorage.setItem("iris:ui", JSON.stringify({ selectedProjectId: projectId }));
      localStorage.setItem("iris:settings", JSON.stringify({ defaultProvider: "anthropic", userId: "test-user" }));
    }, mockProject.id);

    await page.goto("/tasks/session-1");

    // Input should be disabled
    const textarea = page.getByPlaceholder(/Configure API key/);
    await expect(textarea).toBeDisabled();
  });
});
