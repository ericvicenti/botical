import { test, expect } from "@playwright/test";

test.describe("Skills Panel", () => {
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

  const mockSkills = [
    {
      name: "code-review",
      description: "Reviews code for best practices and potential issues",
      path: "/test/project/skills/code-review",
      license: "MIT",
      allowedTools: ["read", "grep"],
    },
    {
      name: "testing",
      description: "Writes unit tests and integration tests for code",
      path: "/test/project/skills/testing",
      allowedTools: ["read", "write", "bash"],
    },
  ];

  const mockSettings = {
    anthropicApiKey: "sk-test-key",
    openaiApiKey: null,
    googleApiKey: null,
    defaultProvider: "anthropic",
    autoSendMessages: false,
    showReasoning: true,
    codeExecutionEnabled: true,
  };

  const mockCoreTools = [
    { name: "read", description: "Read files", category: "filesystem", requiresCodeExecution: false },
    { name: "write", description: "Write files", category: "filesystem", requiresCodeExecution: false },
    { name: "bash", description: "Execute commands", category: "execution", requiresCodeExecution: true },
    { name: "read_skill", description: "Read skill instructions", category: "agent", requiresCodeExecution: false },
  ];

  test.beforeEach(async ({ page }) => {
    // Set up API mocks
    await page.route("**/api/projects", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: [mockProject], meta: { total: 1 } }),
      });
    });

    await page.route("**/api/projects/project-1", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: mockProject }),
      });
    });

    await page.route("**/api/projects/project-1/skills", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: mockSkills, meta: { total: 2, hasSkillsDir: true } }),
      });
    });

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

    await page.route("**/api/messages?sessionId=*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: [], meta: { total: 0 } }),
      });
    });

    await page.route("**/credentials/settings", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: mockSettings }),
      });
    });

    await page.route("**/api/tools/core", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: mockCoreTools }),
      });
    });

    await page.route("**/api/tools/actions", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: [] }),
      });
    });

    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
  });

  test("should show skills button in task chat header", async ({ page }) => {
    // Navigate to task
    await page.goto("/task/session-1?projectId=project-1");

    // Wait for the page to load
    await page.waitForLoadState("networkidle");

    // Skills button should be visible (sparkles icon)
    const skillsButton = page.getByTitle("View available skills");
    await expect(skillsButton).toBeVisible();
  });

  test("should toggle skills panel when clicking skills button", async ({ page }) => {
    // Navigate to task
    await page.goto("/task/session-1?projectId=project-1");
    await page.waitForLoadState("networkidle");

    // Click skills button
    const skillsButton = page.getByTitle("View available skills");
    await skillsButton.click();

    // Skills panel should be visible
    const skillsPanel = page.getByText("Skills");
    await expect(skillsPanel).toBeVisible();

    // Should show skill count
    await expect(page.getByText("2 available")).toBeVisible();
  });

  test("should display skill list with names", async ({ page }) => {
    await page.goto("/task/session-1?projectId=project-1");
    await page.waitForLoadState("networkidle");

    // Open skills panel
    await page.getByTitle("View available skills").click();

    // Should show skill names
    await expect(page.getByText("code-review")).toBeVisible();
    await expect(page.getByText("testing")).toBeVisible();
  });

  test("should expand skill to show description", async ({ page }) => {
    await page.goto("/task/session-1?projectId=project-1");
    await page.waitForLoadState("networkidle");

    // Open skills panel
    await page.getByTitle("View available skills").click();

    // Click to expand code-review skill
    await page.getByText("code-review").click();

    // Should show description
    await expect(
      page.getByText("Reviews code for best practices and potential issues")
    ).toBeVisible();
  });

  test("should show allowed tools for a skill", async ({ page }) => {
    await page.goto("/task/session-1?projectId=project-1");
    await page.waitForLoadState("networkidle");

    // Open skills panel
    await page.getByTitle("View available skills").click();

    // Expand code-review skill
    await page.getByText("code-review").click();

    // Should show allowed tools
    await expect(page.getByText("read", { exact: true })).toBeVisible();
    await expect(page.getByText("grep", { exact: true })).toBeVisible();
  });

  test("should show empty state when no skills available", async ({ page }) => {
    // Override skills route to return empty
    await page.route("**/api/projects/project-1/skills", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: [], meta: { total: 0, hasSkillsDir: false } }),
      });
    });

    await page.goto("/task/session-1?projectId=project-1");
    await page.waitForLoadState("networkidle");

    // Open skills panel
    await page.getByTitle("View available skills").click();

    // Should show empty state message
    await expect(page.getByText("No skills available")).toBeVisible();
    await expect(page.getByText("skills/")).toBeVisible();
  });

  test("should close skills panel when button clicked again", async ({ page }) => {
    await page.goto("/task/session-1?projectId=project-1");
    await page.waitForLoadState("networkidle");

    const skillsButton = page.getByTitle("View available skills");

    // Open skills panel
    await skillsButton.click();
    await expect(page.getByText("2 available")).toBeVisible();

    // Close skills panel
    await skillsButton.click();

    // Panel should be hidden
    await expect(page.getByText("2 available")).not.toBeVisible();
  });
});
