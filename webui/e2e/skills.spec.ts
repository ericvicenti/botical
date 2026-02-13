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
    // Mock auth to skip login
    await page.route("**/api/auth/mode", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ mode: "single-user", user: { userId: "user-1", id: "user-1", email: "test@test.com", displayName: "Test User", isAdmin: true, canExecuteCode: true } }),
      });
    });
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

  test("should display skill list with names and checkboxes", async ({ page }) => {
    await page.goto("/task/session-1?projectId=project-1");
    await page.waitForLoadState("networkidle");

    // Open skills panel
    await page.getByTitle("View available skills").click();

    // Should show skill names
    await expect(page.getByText("code-review")).toBeVisible();
    await expect(page.getByText("testing")).toBeVisible();

    // Should show checkboxes (unchecked by default)
    const checkboxes = page.locator('input[type="checkbox"]');
    await expect(checkboxes).toHaveCount(2);
  });

  test("should expand skill to show description using chevron", async ({ page }) => {
    await page.goto("/task/session-1?projectId=project-1");
    await page.waitForLoadState("networkidle");

    // Open skills panel
    await page.getByTitle("View available skills").click();

    // Click the chevron button to expand (first skill's chevron)
    const chevronButtons = page.locator('button').filter({ has: page.locator('svg.lucide-chevron-right') });
    await chevronButtons.first().click();

    // Should show description
    await expect(
      page.getByText("Reviews code for best practices and potential issues")
    ).toBeVisible();
  });

  test("should show allowed tools for a skill when expanded", async ({ page }) => {
    await page.goto("/task/session-1?projectId=project-1");
    await page.waitForLoadState("networkidle");

    // Open skills panel
    await page.getByTitle("View available skills").click();

    // Click chevron to expand code-review skill
    const chevronButtons = page.locator('button').filter({ has: page.locator('svg.lucide-chevron-right') });
    await chevronButtons.first().click();

    // Should show allowed tools
    await expect(page.getByText("read", { exact: true })).toBeVisible();
    await expect(page.getByText("grep", { exact: true })).toBeVisible();
  });

  test("should toggle skill checkbox", async ({ page }) => {
    await page.goto("/task/session-1?projectId=project-1");
    await page.waitForLoadState("networkidle");

    // Open skills panel
    await page.getByTitle("View available skills").click();

    // Find the first checkbox
    const checkbox = page.locator('input[type="checkbox"]').first();

    // Initially unchecked
    await expect(checkbox).not.toBeChecked();

    // Click the label/checkbox area to toggle
    const checkboxLabel = page.locator('label').filter({ has: page.locator('input[type="checkbox"]') }).first();
    await checkboxLabel.click();

    // Should now be checked
    await expect(checkbox).toBeChecked();
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

  test("should have clickable skill names with title tooltip", async ({ page }) => {
    await page.goto("/task/session-1?projectId=project-1");
    await page.waitForLoadState("networkidle");

    // Open skills panel
    await page.getByTitle("View available skills").click();

    // Skill name should have "Open SKILL.md" title
    const skillNameButton = page.getByTitle("Open SKILL.md").first();
    await expect(skillNameButton).toBeVisible();
  });
});
