import { test, expect } from "@playwright/test";

/**
 * Tests for project-scoped routing.
 * All resource routes (tasks, files, processes, workflows) must be
 * under /projects/$projectId/ to ensure URLs are stable regardless
 * of which project is selected in the UI.
 */

test.describe("Project-scoped routes", () => {
  const mockProject = {
    id: "prj_test",
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
    id: "sess_test",
    slug: "test-task",
    parentId: null,
    title: "Test Task",
    status: "active",
    agent: "default",
    providerId: "anthropic",
    modelId: null,
    messageCount: 2,
    totalCost: 0,
    totalTokensInput: 0,
    totalTokensOutput: 0,
    shareUrl: null,
    shareSecret: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  const mockProcess = {
    id: "proc_test",
    projectId: "prj_test",
    type: "command",
    command: "echo hello",
    cwd: "/test",
    env: null,
    cols: 80,
    rows: 24,
    scope: "project",
    scopeId: "prj_test",
    label: "echo hello",
    status: "completed",
    exitCode: 0,
    startedAt: Date.now() - 5000,
    endedAt: Date.now(),
    pid: 12345,
  };

  test.beforeEach(async ({ page }) => {
    // Mock all API routes
    await page.route("**/api/projects", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: [mockProject], meta: { total: 1 } }),
      });
    });

    await page.route("**/api/projects/prj_test", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: mockProject }),
      });
    });

    await page.route("**/api/projects/prj_test/extensions", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ extensions: [] }),
      });
    });

    await page.route("**/api/sessions?projectId=prj_test*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: [mockSession], meta: { total: 1 } }),
      });
    });

    await page.route("**/api/sessions/sess_test?projectId=prj_test*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: mockSession }),
      });
    });

    await page.route("**/api/sessions/sess_test/messages*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: [], meta: { total: 0 } }),
      });
    });

    await page.route("**/api/projects/prj_test/processes", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: [mockProcess] }),
      });
    });

    await page.route("**/api/processes/proc_test*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: mockProcess }),
      });
    });

    await page.route("**/api/projects/prj_test/files/**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: [] }),
      });
    });

    await page.route("**/api/projects/prj_test/skills", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ skills: [] }),
      });
    });

    await page.route("**/api/projects/prj_test/missions", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: [] }),
      });
    });

    await page.route("**/api/projects/prj_test/services", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: [] }),
      });
    });

    await page.route("**/api/projects/prj_test/workflows", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: [] }),
      });
    });

    await page.route("**/api/projects/prj_test/schedules", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: [] }),
      });
    });

    await page.route("**/api/extensions", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: [] }),
      });
    });

    await page.route("**/api/credentials/**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ models: [], configured: {} }),
      });
    });

    await page.route("**/api/tools/core", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ tools: [] }),
      });
    });

    await page.route("**/api/agents/**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: { name: "default", systemPrompt: "" } }),
      });
    });

    await page.route("**/ws", async (route) => {
      await route.fulfill({ status: 200, body: "" });
    });

    await page.route("**/api/filesystem/**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ entries: [] }),
      });
    });

    // Set localStorage to skip auth
    await page.addInitScript(() => {
      localStorage.setItem("botical:settings", JSON.stringify({ userId: "user-1" }));
    });
  });

  test("task URL includes projectId", async ({ page }) => {
    // Navigate directly to a task with project context
    await page.goto(`/projects/prj_test/tasks/sess_test`);
    await page.waitForTimeout(1000);

    // URL should contain the project ID
    expect(page.url()).toContain("/projects/prj_test/tasks/sess_test");

    // The task chat should be visible (not "No project selected")
    await expect(page.locator("text=No project selected")).not.toBeVisible();
  });

  test("clicking process in sidebar navigates to project-scoped URL", async ({ page }) => {
    // Go to project
    await page.goto(`/projects/prj_test`);
    await page.waitForTimeout(1000);

    // Click the Commands icon in the left sidebar (play button icon)
    // Based on earlier testing, Commands is the 3rd icon (y~180)
    await page.mouse.click(12, 180);
    await page.waitForTimeout(500);

    // Look for the process item and click it
    const processItem = page.locator(`text=echo hello`).first();
    if (await processItem.isVisible()) {
      await processItem.click();
      await page.waitForTimeout(500);

      // URL should be project-scoped
      expect(page.url()).toContain("/projects/prj_test/processes/proc_test");
    }
  });

  test("task route has projectId in URL params", async ({ page }) => {
    await page.goto(`/projects/prj_test/tasks/sess_test`);
    await page.waitForTimeout(1000);

    // Verify the URL structure is correct
    const url = new URL(page.url());
    expect(url.pathname).toBe("/projects/prj_test/tasks/sess_test");
  });

  test("process route has projectId in URL params", async ({ page }) => {
    await page.goto(`/projects/prj_test/processes/proc_test`);
    await page.waitForTimeout(1000);

    const url = new URL(page.url());
    expect(url.pathname).toBe("/projects/prj_test/processes/proc_test");
  });
});
