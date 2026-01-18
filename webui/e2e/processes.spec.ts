import { test, expect } from "@playwright/test";

test.describe("Process Spawning", () => {
  const mockProject = {
    id: "prj_test-project",
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

  const mockProcess = {
    id: "proc_test-123",
    projectId: "prj_test-project",
    type: "command",
    command: "uptime",
    cwd: "/test/project",
    env: null,
    cols: 80,
    rows: 24,
    scope: "project",
    scopeId: "prj_test-project",
    status: "running",
    exitCode: null,
    label: null,
    createdBy: "test-user",
    createdAt: Date.now(),
    startedAt: Date.now(),
    endedAt: null,
  };

  test.beforeEach(async ({ page }) => {
    // Set up API mocks for projects
    await page.route("**/api/projects", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ data: [mockProject], meta: { total: 1 } }),
        });
      } else {
        await route.continue();
      }
    });

    // Mock processes list (empty initially)
    await page.route("**/api/projects/*/processes", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ data: [], meta: { total: 0 } }),
        });
      } else if (route.request().method() === "POST") {
        // Capture the POST request body for debugging
        const postData = route.request().postDataJSON();
        console.log("Process spawn request:", JSON.stringify(postData, null, 2));

        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({ data: mockProcess }),
        });
      } else {
        await route.continue();
      }
    });

    // Mock sessions (required for sidebar)
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

  test("should spawn a process from the Run panel", async ({ page }) => {
    // Select the project
    await page.getByRole("button", { name: "Test Project", exact: true }).click();

    // Click Run panel button in sidebar
    const runButton = page.getByRole("button", { name: "Run" });
    await runButton.click();

    // Should see the spawn form
    await expect(page.getByPlaceholder("Enter command...")).toBeVisible();

    // Type a command
    await page.getByPlaceholder("Enter command...").fill("uptime");

    // Click the play button to spawn the process
    await page.getByRole("button", { name: "" }).filter({ has: page.locator("svg") }).first().click();

    // Should NOT show error message
    await expect(page.getByText("Failed to start process")).not.toBeVisible();
  });

  test("should capture and log the actual API request for spawning", async ({ page }) => {
    // This test captures what the frontend actually sends to help debug

    let capturedRequest: any = null;
    let capturedResponse: any = null;

    await page.route("**/api/projects/*/processes", async (route) => {
      if (route.request().method() === "POST") {
        capturedRequest = {
          url: route.request().url(),
          method: route.request().method(),
          body: route.request().postDataJSON(),
          headers: route.request().headers(),
        };

        // Return success
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({ data: mockProcess }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ data: [], meta: { total: 0 } }),
        });
      }
    });

    // Select the project
    await page.getByRole("button", { name: "Test Project", exact: true }).click();

    // Click Run panel button in sidebar
    await page.getByRole("button", { name: "Run" }).click();

    // Type a command
    await page.getByPlaceholder("Enter command...").fill("uptime");

    // Click the play button
    const playButton = page.locator("button[type='submit']");
    await playButton.click();

    // Wait a moment for the request
    await page.waitForTimeout(500);

    // Log what was captured
    console.log("=== Captured API Request ===");
    console.log(JSON.stringify(capturedRequest, null, 2));

    // Verify request was made
    expect(capturedRequest).not.toBeNull();
    expect(capturedRequest.body).toHaveProperty("command", "uptime");
    expect(capturedRequest.body).toHaveProperty("type", "command");
    expect(capturedRequest.body).toHaveProperty("scope", "project");
  });

  test("verifies the actual error from a real API call", async ({ page }) => {
    // Don't mock the process endpoint - let it hit the real API
    // This will show us the actual error

    let apiError: any = null;

    // Listen for console errors
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        console.log("Console error:", msg.text());
      }
    });

    // Intercept the response to capture errors
    page.on("response", async (response) => {
      if (response.url().includes("/processes") && response.request().method() === "POST") {
        console.log("=== Process API Response ===");
        console.log("Status:", response.status());
        try {
          const body = await response.json();
          console.log("Body:", JSON.stringify(body, null, 2));
          if (response.status() !== 201) {
            apiError = body;
          }
        } catch (e) {
          console.log("Could not parse response body");
        }
      }
    });

    // Don't mock the processes endpoint
    await page.unroute("**/api/projects/*/processes");

    // Select the project
    await page.getByRole("button", { name: "Test Project", exact: true }).click();

    // Click Run panel button in sidebar
    await page.getByRole("button", { name: "Run" }).click();

    // Type a command
    await page.getByPlaceholder("Enter command...").fill("uptime");

    // Click the play button
    const playButton = page.locator("button[type='submit']");
    await playButton.click();

    // Wait for the error to appear or request to complete
    await page.waitForTimeout(2000);

    // Check if error is shown
    const errorVisible = await page.getByText("Failed to start process").isVisible();

    if (errorVisible) {
      console.log("=== Error was shown in UI ===");
      console.log("API Error captured:", JSON.stringify(apiError, null, 2));
    }
  });
});
