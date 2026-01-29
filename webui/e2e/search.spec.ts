import { test, expect } from "@playwright/test";

test.describe("Search Extension", () => {
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

  const mockSearchExtension = {
    id: "search",
    name: "Web Search",
    description: "Search the web using SearXNG privacy-respecting metasearch engine",
    version: "1.0.0",
    icon: "search",
    category: "search",
    frontend: {
      sidebar: {
        id: "search",
        label: "Search",
        icon: "search",
      },
      routes: ["/search/*"],
    },
    status: "running",
    port: 4102,
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

  const mockSearchResults = {
    query: "test query",
    number_of_results: 100,
    results: [
      {
        title: "Test Result 1",
        url: "https://example.com/1",
        content: "This is the first test result with some content.",
        engine: "google",
      },
      {
        title: "Test Result 2",
        url: "https://example.com/2",
        content: "This is the second test result.",
        engine: "bing",
      },
      {
        title: "Test Result 3",
        url: "https://example.com/3",
        content: "Third result content here.",
        engine: "duckduckgo",
      },
    ],
    suggestions: ["related search 1", "related search 2"],
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

    // Mock sessions
    await page.route("**/api/sessions?projectId=*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: [], meta: { total: 0 } }),
      });
    });

    // Mock workflows
    await page.route("**/api/workflows?projectId=*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: [], meta: { total: 0, limit: 50, offset: 0, hasMore: false } }),
      });
    });

    // Mock extensions list - include both docker and search
    await page.route("**/api/extensions", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: [mockDockerExtension, mockSearchExtension] }),
      });
    });

    await page.goto("/");
    await page.evaluate(() => localStorage.clear());
    await page.reload();
  });

  test.describe("Extension Registration", () => {
    test("should list search extension in extensions panel", async ({ page }) => {
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

      // Click extensions button
      await page.getByTestId("extensions-button").click();

      // Search extension should be listed
      await expect(page.getByTestId("extension-card-search")).toBeVisible();
      await expect(page.getByTestId("extension-card-search").getByText("Web Search", { exact: true })).toBeVisible();
      await expect(page.getByTestId("extension-card-search").getByText(/SearXNG/)).toBeVisible();
    });

    test("should show toggle switch for search extension", async ({ page }) => {
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

      // Click extensions button
      await page.getByTestId("extensions-button").click();

      // Toggle should be visible
      const toggle = page.getByTestId("extension-toggle-search");
      await expect(toggle).toBeVisible();

      // The checkbox inside should be unchecked initially
      const checkbox = toggle.locator("input[type='checkbox']");
      await expect(checkbox).not.toBeChecked();
    });

    test("should enable search extension when toggle is clicked", async ({ page }) => {
      let enabledExtensions: string[] = [];

      // Mock project extensions
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
      await page.route("**/api/projects/*/extensions/search/enable", async (route) => {
        enabledExtensions = ["search"];
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ data: { enabled: true, extensionId: "search" } }),
        });
      });

      await page.goto("/");

      // Select project
      await page.getByRole("button", { name: "Test Project", exact: true }).click();

      // Click extensions button
      await page.getByTestId("extensions-button").click();

      // Click toggle to enable
      const toggle = page.getByTestId("extension-toggle-search");
      await toggle.click();

      // Wait for API call
      await page.waitForTimeout(500);

      // Checkbox should now be checked
      const checkbox = toggle.locator("input[type='checkbox']");
      await expect(checkbox).toBeChecked();
    });
  });

  test.describe("Search Panel", () => {
    test("should show Search panel in sidebar when extension is enabled", async ({ page }) => {
      // Mock project extensions with search enabled
      await page.route("**/api/projects/*/extensions", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ data: { enabled: ["search"] } }),
        });
      });

      await page.goto("/");

      // Select project
      await page.getByRole("button", { name: "Test Project", exact: true }).click();

      // Search panel button should be visible
      const searchButton = page.getByRole("button", { name: "Search" });
      await expect(searchButton).toBeVisible();
    });

    test("should not show Search panel when extension is disabled", async ({ page }) => {
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

      // Search panel button should NOT be visible
      const searchButton = page.getByRole("button", { name: "Search" });
      await expect(searchButton).not.toBeVisible();
    });

    test("should show search input when Search panel is clicked", async ({ page }) => {
      // Mock project extensions with search enabled
      await page.route("**/api/projects/*/extensions", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ data: { enabled: ["search"] } }),
        });
      });

      // Mock search availability check
      await page.route("**/api/extensions/search/search/available", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ available: true }),
        });
      });

      // Mock status endpoint
      await page.route("**/api/extensions/search/search/status", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            data: {
              available: true,
              containerExists: true,
              containerRunning: true,
              containerId: "test-container-id",
            },
          }),
        });
      });

      await page.goto("/");

      // Select project
      await page.getByRole("button", { name: "Test Project", exact: true }).click();

      // Click Search panel button
      await page.getByRole("button", { name: "Search" }).click();

      // Search input should be visible
      await expect(page.getByPlaceholder("Search the web...")).toBeVisible();
    });
  });

  test.describe("Search Functionality", () => {
    test.beforeEach(async ({ page }) => {
      // Set up search-enabled project
      await page.route("**/api/projects/*/extensions", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ data: { enabled: ["search"] } }),
        });
      });

      // Mock availability and status
      await page.route("**/api/extensions/search/search/available", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ available: true }),
        });
      });

      await page.route("**/api/extensions/search/search/status", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            data: {
              available: true,
              containerExists: true,
              containerRunning: true,
            },
          }),
        });
      });
    });

    test("should perform search and show results", async ({ page }) => {
      // Mock search endpoint
      await page.route("**/api/extensions/search/search/?**", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ data: mockSearchResults }),
        });
      });

      await page.goto("/");

      // Select project
      await page.getByRole("button", { name: "Test Project", exact: true }).click();

      // Click Search panel button
      await page.getByRole("button", { name: "Search" }).click();

      // Type in search input and press Enter
      const searchInput = page.getByPlaceholder("Search the web...");
      await searchInput.fill("test query");
      await searchInput.press("Enter");

      // Wait for results
      await page.waitForTimeout(500);

      // Results should be displayed
      await expect(page.getByText("Test Result 1")).toBeVisible();
    });

    test("should show 'View all' link when results are returned", async ({ page }) => {
      // Mock search endpoint
      await page.route("**/api/extensions/search/search/?**", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ data: mockSearchResults }),
        });
      });

      await page.goto("/");

      // Select project and open search panel
      await page.getByRole("button", { name: "Test Project", exact: true }).click();
      await page.getByRole("button", { name: "Search" }).click();

      // Perform search
      const searchInput = page.getByPlaceholder("Search the web...");
      await searchInput.fill("test query");
      await searchInput.press("Enter");

      // Wait for results
      await page.waitForTimeout(500);

      // View all link should appear
      await expect(page.getByText("View all")).toBeVisible();
    });
  });

  test.describe("SearXNG Not Running", () => {
    test("should show setup prompt when SearXNG is not available", async ({ page }) => {
      // Mock project extensions with search enabled
      await page.route("**/api/projects/*/extensions", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ data: { enabled: ["search"] } }),
        });
      });

      // Mock unavailable
      await page.route("**/api/extensions/search/search/available", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ available: false }),
        });
      });

      await page.route("**/api/extensions/search/search/status", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            data: {
              available: false,
              containerExists: false,
              containerRunning: false,
            },
          }),
        });
      });

      await page.goto("/");

      // Select project
      await page.getByRole("button", { name: "Test Project", exact: true }).click();

      // Click Search panel button
      await page.getByRole("button", { name: "Search" }).click();

      // Should show "SearXNG not running" message
      await expect(page.getByText("SearXNG not running")).toBeVisible();

      // Should show "Start SearXNG" button
      await expect(page.getByRole("button", { name: "Start SearXNG" })).toBeVisible();
    });

    test("should provision SearXNG when Start button is clicked", async ({ page }) => {
      let isProvisioned = false;

      // Mock project extensions with search enabled
      await page.route("**/api/projects/*/extensions", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ data: { enabled: ["search"] } }),
        });
      });

      // Dynamic availability based on provisioning state
      await page.route("**/api/extensions/search/search/available", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ available: isProvisioned }),
        });
      });

      await page.route("**/api/extensions/search/search/status", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            data: {
              available: isProvisioned,
              containerExists: isProvisioned,
              containerRunning: isProvisioned,
            },
          }),
        });
      });

      // Mock provision endpoint
      await page.route("**/api/extensions/search/search/provision", async (route) => {
        isProvisioned = true;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            data: {
              available: true,
              containerExists: true,
              containerRunning: true,
              containerId: "new-container-id",
            },
          }),
        });
      });

      await page.goto("/");

      // Select project
      await page.getByRole("button", { name: "Test Project", exact: true }).click();

      // Click Search panel button
      await page.getByRole("button", { name: "Search" }).click();

      // Click Start SearXNG button
      await page.getByRole("button", { name: "Start SearXNG" }).click();

      // Wait for provisioning
      await page.waitForTimeout(1000);

      // The search input should now be visible (panel switched to active state)
      await expect(page.getByPlaceholder("Search the web...")).toBeVisible();
    });
  });

  test.describe("Recent Searches", () => {
    test("should store and display recent searches", async ({ page }) => {
      // Mock project extensions with search enabled
      await page.route("**/api/projects/*/extensions", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ data: { enabled: ["search"] } }),
        });
      });

      // Mock availability
      await page.route("**/api/extensions/search/search/available", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ available: true }),
        });
      });

      await page.route("**/api/extensions/search/search/status", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            data: { available: true, containerExists: true, containerRunning: true },
          }),
        });
      });

      // Mock search endpoint
      await page.route("**/api/extensions/search/search/?**", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ data: mockSearchResults }),
        });
      });

      await page.goto("/");

      // Select project
      await page.getByRole("button", { name: "Test Project", exact: true }).click();

      // Click Search panel button
      await page.getByRole("button", { name: "Search" }).click();

      // Perform a search
      const searchInput = page.getByPlaceholder("Search the web...");
      await searchInput.fill("my first search");
      await searchInput.press("Enter");

      // Wait for search
      await page.waitForTimeout(500);

      // Clear results by clearing input
      await searchInput.clear();

      // Recent section should show our search
      await expect(page.getByText("Recent")).toBeVisible();
      await expect(page.getByText("my first search")).toBeVisible();
    });
  });
});
