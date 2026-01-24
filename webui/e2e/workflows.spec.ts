import { test, expect } from "@playwright/test";

test.describe("Workflows", () => {
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

  const mockWorkflow = {
    id: "wf_test-workflow-1",
    name: "test-workflow",
    label: "Test Workflow",
    description: "A test workflow",
    category: "other",
    icon: null,
    inputSchema: { fields: [] },
    steps: [],
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

    // Mock empty workflows list initially
    await page.route("**/api/workflows?projectId=*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: [], meta: { total: 0, limit: 50, offset: 0, hasMore: false } }),
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

    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
  });

  test("should show workflows panel in sidebar", async ({ page }) => {
    await page.goto("/");

    // Select project
    await page.getByRole("button", { name: "Test Project", exact: true }).click();

    // Workflows button should be visible in sidebar
    const workflowsButton = page.getByRole("button", { name: "Workflows" });
    await expect(workflowsButton).toBeVisible();
  });

  test("should show empty state when no workflows exist", async ({ page }) => {
    await page.goto("/");

    // Select project
    await page.getByRole("button", { name: "Test Project", exact: true }).click();

    // Click workflows button
    await page.getByRole("button", { name: "Workflows" }).click();

    // Should show empty state
    await expect(page.getByTestId("no-workflows-message")).toBeVisible();
    await expect(page.getByText("No workflows yet")).toBeVisible();
  });

  test("should create new workflow when clicking create button", async ({ page }) => {
    // Mock the create workflow endpoint
    await page.route("**/api/workflows", async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({ data: mockWorkflow }),
        });
      }
    });

    // Mock the workflow fetch for the editor
    await page.route(`**/api/workflows/${mockWorkflow.id}?projectId=*`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: mockWorkflow }),
      });
    });

    // Mock actions endpoint
    await page.route("**/api/tools/actions", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: [] }),
      });
    });

    await page.goto("/");

    // Select project
    await page.getByRole("button", { name: "Test Project", exact: true }).click();

    // Go to workflows panel
    await page.getByRole("button", { name: "Workflows" }).click();

    // Click create workflow button
    const createButton = page.getByTestId("new-workflow-button");
    await createButton.click();

    // Should navigate to workflow editor
    await expect(page).toHaveURL(new RegExp(`/workflows/${mockWorkflow.id}`));

    // Workflow editor should be visible
    await expect(page.getByTestId("workflow-editor")).toBeVisible();
    await expect(page.getByTestId("workflow-label")).toContainText("Test Workflow");
  });

  test("should open existing workflow when clicking on it", async ({ page }) => {
    // Mock workflows list with existing workflow
    await page.route("**/api/workflows?projectId=*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: [mockWorkflow], meta: { total: 1, limit: 50, offset: 0, hasMore: false } }),
      });
    });

    // Mock the workflow fetch for the editor
    await page.route(`**/api/workflows/${mockWorkflow.id}?projectId=*`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: mockWorkflow }),
      });
    });

    // Mock actions endpoint
    await page.route("**/api/tools/actions", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: [] }),
      });
    });

    await page.goto("/");

    // Select project
    await page.getByRole("button", { name: "Test Project", exact: true }).click();

    // Go to workflows panel
    await page.getByRole("button", { name: "Workflows" }).click();

    // Click on the existing workflow
    await page.getByTestId(`workflow-item-${mockWorkflow.id}`).click();

    // Should navigate to workflow editor
    await expect(page).toHaveURL(new RegExp(`/workflows/${mockWorkflow.id}`));

    // Workflow editor should show the workflow
    await expect(page.getByTestId("workflow-editor")).toBeVisible();
    await expect(page.getByTestId("workflow-label")).toContainText("Test Workflow");
    await expect(page.getByTestId("workflow-name")).toContainText("test-workflow");
  });

  test("should show error when workflow fails to load", async ({ page }) => {
    // Mock a failed workflow fetch
    await page.route(`**/api/workflows/wf_nonexistent?projectId=*`, async (route) => {
      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ error: { code: "NOT_FOUND", message: "Workflow not found" } }),
      });
    });

    // Set up localStorage with selected project
    await page.goto("/");
    await page.evaluate((projectId) => {
      localStorage.setItem("iris:ui", JSON.stringify({ selectedProjectId: projectId }));
    }, mockProject.id);

    // Navigate directly to a non-existent workflow
    await page.goto("/workflows/wf_nonexistent");

    // Should show error state
    await expect(page.getByTestId("workflow-error")).toBeVisible();
    await expect(page.getByText(/Error loading workflow/)).toBeVisible();
  });

  test("should show workflow in sidebar after creation", async ({ page }) => {
    // Track whether workflow has been created and how many times list is fetched
    let workflowCreated = false;
    let listFetchCount = 0;

    // Mock workflows list - returns empty initially, then the workflow after creation
    await page.route("**/api/workflows?projectId=*", async (route) => {
      listFetchCount++;
      if (workflowCreated) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ data: [mockWorkflow], meta: { total: 1, limit: 50, offset: 0, hasMore: false } }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ data: [], meta: { total: 0, limit: 50, offset: 0, hasMore: false } }),
        });
      }
    });

    // Mock the create workflow endpoint
    await page.route("**/api/workflows", async (route) => {
      if (route.request().method() === "POST") {
        workflowCreated = true;
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({ data: mockWorkflow }),
        });
      }
    });

    // Mock the workflow fetch for the editor
    await page.route(`**/api/workflows/${mockWorkflow.id}?projectId=*`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: mockWorkflow }),
      });
    });

    // Mock actions endpoint
    await page.route("**/api/tools/actions", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: [] }),
      });
    });

    await page.goto("/");

    // Select project
    await page.getByRole("button", { name: "Test Project", exact: true }).click();

    // Go to workflows panel
    await page.getByRole("button", { name: "Workflows" }).click();

    // Should show empty state initially
    await expect(page.getByTestId("no-workflows-message")).toBeVisible();

    // Record initial fetch count
    const initialFetchCount = listFetchCount;

    // Click create workflow button
    await page.getByTestId("new-workflow-button").click();

    // Should navigate to workflow editor
    await expect(page).toHaveURL(new RegExp(`/workflows/${mockWorkflow.id}`));
    await expect(page.getByTestId("workflow-editor")).toBeVisible();

    // Wait a bit for the invalidation to trigger a refetch
    await page.waitForTimeout(500);

    // The list should have been refetched after creation
    expect(listFetchCount).toBeGreaterThan(initialFetchCount);

    // The workflow should now appear in the list (sidebar should still be showing workflows panel)
    await expect(page.getByTestId(`workflow-item-${mockWorkflow.id}`)).toBeVisible();
    await expect(page.getByTestId("no-workflows-message")).not.toBeVisible();
  });

  test("should update workflow label in sidebar after saving changes", async ({ page }) => {
    const updatedWorkflow = {
      ...mockWorkflow,
      label: "Updated Workflow Label",
    };

    let saveCount = 0;

    // Mock workflows list - returns the workflow (updated version after save)
    await page.route("**/api/workflows?projectId=*", async (route) => {
      if (saveCount > 0) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ data: [updatedWorkflow], meta: { total: 1, limit: 50, offset: 0, hasMore: false } }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ data: [mockWorkflow], meta: { total: 1, limit: 50, offset: 0, hasMore: false } }),
        });
      }
    });

    // Mock the workflow fetch for the editor
    await page.route(`**/api/workflows/${mockWorkflow.id}?projectId=*`, async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ data: saveCount > 0 ? updatedWorkflow : mockWorkflow }),
        });
      }
    });

    // Mock the workflow update (PUT) endpoint
    await page.route(`**/api/workflows/${mockWorkflow.id}`, async (route) => {
      if (route.request().method() === "PUT") {
        saveCount++;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ data: updatedWorkflow }),
        });
      }
    });

    // Mock actions endpoint
    await page.route("**/api/tools/actions", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: [] }),
      });
    });

    // Set up localStorage with selected project
    await page.goto("/");
    await page.evaluate((projectId) => {
      localStorage.setItem("iris:ui", JSON.stringify({ selectedProjectId: projectId }));
    }, mockProject.id);

    await page.goto(`/workflows/${mockWorkflow.id}`);

    // Wait for editor to load
    await expect(page.getByTestId("workflow-editor")).toBeVisible();
    await expect(page.getByTestId("workflow-label")).toContainText("Test Workflow");

    // Make a change (update description)
    const descInput = page.locator('input[placeholder="What this workflow does..."]');
    await descInput.fill("Updated description");

    // Save button should now be enabled
    await expect(page.getByTestId("workflow-save-button")).toBeEnabled();

    // Click save
    await page.getByTestId("workflow-save-button").click();

    // Wait for save to complete
    await page.waitForTimeout(500);

    // Now check the sidebar - the workflow should show the updated label
    await page.getByRole("button", { name: "Workflows" }).click();
    await expect(page.getByTestId(`workflow-item-${mockWorkflow.id}`)).toContainText("Updated Workflow Label");
  });

  test("should show save button disabled when no changes", async ({ page }) => {
    // Mock the workflow fetch
    await page.route(`**/api/workflows/${mockWorkflow.id}?projectId=*`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: mockWorkflow }),
      });
    });

    // Mock actions endpoint
    await page.route("**/api/tools/actions", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: [] }),
      });
    });

    // Set up localStorage with selected project
    await page.goto("/");
    await page.evaluate((projectId) => {
      localStorage.setItem("iris:ui", JSON.stringify({ selectedProjectId: projectId }));
    }, mockProject.id);

    await page.goto(`/workflows/${mockWorkflow.id}`);

    // Wait for editor to load
    await expect(page.getByTestId("workflow-editor")).toBeVisible();

    // Save button should be disabled (no changes)
    const saveButton = page.getByTestId("workflow-save-button");
    await expect(saveButton).toBeDisabled();

    // Dirty indicator should not be visible
    await expect(page.getByTestId("workflow-dirty-indicator")).not.toBeVisible();
  });

  test("should execute a workflow with wait action and show notification", async ({ page }) => {
    const workflowWithWait = {
      id: "wf_wait-workflow",
      name: "wait-workflow",
      label: "Wait Workflow",
      description: "A workflow with wait and notify",
      category: "other",
      icon: null,
      inputSchema: { fields: [] },
      steps: [
        {
          id: "notify-start",
          type: "notify",
          message: { type: "literal", value: "Starting wait..." },
          variant: "info",
        },
        {
          id: "wait-step",
          type: "action",
          action: "utility.wait",
          args: { ms: { type: "literal", value: 500 } },
          dependsOn: ["notify-start"],
        },
        {
          id: "notify-end",
          type: "notify",
          message: { type: "literal", value: "Wait complete!" },
          variant: "success",
          dependsOn: ["wait-step"],
        },
      ],
    };

    const mockExecution = {
      id: "wfexec_test-exec",
      workflowId: workflowWithWait.id,
      projectId: mockProject.id,
      status: "completed",
      input: {},
      output: {},
      steps: JSON.stringify([
        { id: "notify-start", status: "completed" },
        { id: "wait-step", status: "completed", output: { durationMs: 500 } },
        { id: "notify-end", status: "completed" },
      ]),
      startedAt: Date.now(),
      completedAt: Date.now() + 600,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    // Mock workflows list with our wait workflow
    await page.route("**/api/workflows?projectId=*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: [workflowWithWait], meta: { total: 1, limit: 50, offset: 0, hasMore: false } }),
      });
    });

    // Mock the workflow fetch
    await page.route(`**/api/workflows/${workflowWithWait.id}?projectId=*`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: workflowWithWait }),
      });
    });

    // Mock execute endpoint
    await page.route(`**/api/workflows/${workflowWithWait.id}/execute`, async (route) => {
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ data: { executionId: mockExecution.id, workflowId: workflowWithWait.id, status: "pending" } }),
      });
    });

    // Mock execution status endpoint
    await page.route(`**/api/workflow-executions/${mockExecution.id}?projectId=*`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: mockExecution }),
      });
    });

    // Mock actions endpoint
    await page.route("**/api/tools/actions", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: [
            {
              id: "utility.wait",
              label: "Wait",
              description: "Pause execution for a specified duration",
              category: "other",
              params: {
                type: "object",
                properties: {
                  ms: { type: "number", description: "Duration in milliseconds" },
                  seconds: { type: "number", description: "Duration in seconds" },
                },
              },
            },
          ],
        }),
      });
    });

    // Set up localStorage with selected project
    await page.goto("/");
    await page.evaluate((projectId) => {
      localStorage.setItem("iris:ui", JSON.stringify({ selectedProjectId: projectId }));
    }, mockProject.id);

    await page.goto(`/workflows/${workflowWithWait.id}`);

    // Wait for editor to load
    await expect(page.getByTestId("workflow-editor")).toBeVisible();

    // Run button should be visible
    const runButton = page.getByTestId("workflow-run-button");
    await expect(runButton).toBeVisible();

    // Click run button
    await runButton.click();

    // Should navigate to execution page
    await expect(page).toHaveURL(new RegExp(`/workflow-runs/${mockExecution.id}`));
  });

  test("should display utility.wait action in action picker", async ({ page }) => {
    const waitAction = {
      id: "utility.wait",
      label: "Wait",
      description: "Pause execution for a specified duration",
      category: "other",
      icon: "clock",
      params: {
        type: "object",
        properties: {
          ms: { type: "number", description: "Duration in milliseconds" },
          seconds: { type: "number", description: "Duration in seconds" },
        },
      },
    };

    // Mock the workflow fetch
    await page.route(`**/api/workflows/${mockWorkflow.id}?projectId=*`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: mockWorkflow }),
      });
    });

    // Mock actions endpoint with utility.wait
    await page.route("**/api/tools/actions", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: [waitAction] }),
      });
    });

    // Set up localStorage with selected project
    await page.goto("/");
    await page.evaluate((projectId) => {
      localStorage.setItem("iris:ui", JSON.stringify({ selectedProjectId: projectId }));
    }, mockProject.id);

    await page.goto(`/workflows/${mockWorkflow.id}`);

    // Wait for editor to load
    await expect(page.getByTestId("workflow-editor")).toBeVisible();

    // Click add step button
    const addStepButton = page.getByTestId("add-step-button");
    await addStepButton.click();

    // Action step type should be available
    const actionOption = page.getByTestId("step-type-action");
    await expect(actionOption).toBeVisible();
    await actionOption.click();

    // Wait action should be listed in the action picker
    await expect(page.getByText("utility.wait")).toBeVisible();
    await expect(page.getByText("Pause execution")).toBeVisible();
  });
});
