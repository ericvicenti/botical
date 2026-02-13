import { test, expect } from "@playwright/test";

test.describe("Messaging", () => {
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

  const mockUserMessage = {
    id: "msg-1",
    sessionId: "session-1",
    role: "user",
    parentId: null,
    finishReason: null,
    cost: 0,
    tokensInput: 0,
    tokensOutput: 0,
    tokensReasoning: 0,
    errorType: null,
    errorMessage: null,
    createdAt: Date.now(),
    completedAt: Date.now(),
    parts: [
      {
        id: "part-1",
        messageId: "msg-1",
        sessionId: "session-1",
        type: "text",
        content: { text: "Hello, agent!" },
        toolName: null,
        toolCallId: null,
        toolStatus: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ],
  };

  const mockAssistantMessage = {
    id: "msg-2",
    sessionId: "session-1",
    role: "assistant",
    parentId: null,
    finishReason: "stop",
    cost: 0.001,
    tokensInput: 10,
    tokensOutput: 50,
    tokensReasoning: 0,
    errorType: null,
    errorMessage: null,
    createdAt: Date.now(),
    completedAt: Date.now(),
    parts: [
      {
        id: "part-2",
        messageId: "msg-2",
        sessionId: "session-1",
        type: "text",
        content: { text: "Hello! How can I help you today?" },
        toolName: null,
        toolCallId: null,
        toolStatus: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ],
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
    // Set up basic mocks
    await page.route("**/api/projects", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: [mockProject], meta: { total: 1 } }),
      });
    });

    await page.route("**/api/sessions/session-1?projectId=*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: mockSession }),
      });
    });
  });

  test("should enable input when API key is configured", async ({ page }) => {
    await page.route("**/api/sessions/session-1/messages?projectId=*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: [], meta: { total: 0 } }),
      });
    });

    await page.goto("/");
    await page.evaluate((projectId) => {
      localStorage.setItem("botical:ui", JSON.stringify({ selectedProjectId: projectId }));
      localStorage.setItem("botical:settings", JSON.stringify({
        defaultProvider: "anthropic",
        userId: "test-user",
        anthropicApiKey: "sk-ant-test-key",
      }));
    }, mockProject.id);

    await page.goto("/projects/project-1/tasks/session-1");

    // Input should be enabled
    const textarea = page.getByPlaceholder(/Type a message/);
    await expect(textarea).toBeEnabled();

    // Warning should not be shown
    await expect(page.getByText(/No API key configured/)).not.toBeVisible();
  });

  test("should display existing messages", async ({ page }) => {
    await page.route("**/api/sessions/session-1/messages?projectId=*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: [mockUserMessage, mockAssistantMessage],
          meta: { total: 2 },
        }),
      });
    });

    await page.goto("/");
    await page.evaluate((projectId) => {
      localStorage.setItem("botical:ui", JSON.stringify({ selectedProjectId: projectId }));
      localStorage.setItem("botical:settings", JSON.stringify({
        defaultProvider: "anthropic",
        userId: "test-user",
        anthropicApiKey: "sk-ant-test-key",
      }));
    }, mockProject.id);

    await page.goto("/projects/project-1/tasks/session-1");

    // User message should be visible
    await expect(page.getByText("Hello, agent!")).toBeVisible();

    // Assistant message should be visible
    await expect(page.getByText("Hello! How can I help you today?")).toBeVisible();
  });

  test("should send message when clicking send button", async ({ page }) => {
    let messageSent = false;

    await page.route("**/api/sessions/session-1/messages?projectId=*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: [], meta: { total: 0 } }),
      });
    });

    await page.route("**/api/messages", async (route) => {
      if (route.request().method() === "POST") {
        messageSent = true;
        const body = JSON.parse(route.request().postData() || "{}");
        expect(body.content).toBe("Test message");
        expect(body.sessionId).toBe("session-1");
        expect(body.projectId).toBe("project-1");

        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({
            data: {
              message: {
                ...mockAssistantMessage,
                parts: [
                  {
                    ...mockAssistantMessage.parts[0],
                    content: { text: "I received your message!" },
                  },
                ],
              },
              parts: [],
            },
          }),
        });
      }
    });

    await page.goto("/");
    await page.evaluate((projectId) => {
      localStorage.setItem("botical:ui", JSON.stringify({ selectedProjectId: projectId }));
      localStorage.setItem("botical:settings", JSON.stringify({
        defaultProvider: "anthropic",
        userId: "test-user",
        anthropicApiKey: "sk-ant-test-key",
      }));
    }, mockProject.id);

    await page.goto("/projects/project-1/tasks/session-1");

    // Type a message
    const textarea = page.getByPlaceholder(/Type a message/);
    await textarea.fill("Test message");

    // Click send button
    const sendButton = page.getByTestId("send-message-button");
    await expect(sendButton).toBeEnabled();
    await sendButton.click();

    // Wait for the message to be sent
    await expect.poll(() => messageSent).toBe(true);
  });

  test("should send message on Enter key", async ({ page }) => {
    let messageSent = false;

    await page.route("**/api/sessions/session-1/messages?projectId=*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: [], meta: { total: 0 } }),
      });
    });

    await page.route("**/api/messages", async (route) => {
      if (route.request().method() === "POST") {
        messageSent = true;
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({
            data: { message: mockAssistantMessage, parts: [] },
          }),
        });
      }
    });

    await page.goto("/");
    await page.evaluate((projectId) => {
      localStorage.setItem("botical:ui", JSON.stringify({ selectedProjectId: projectId }));
      localStorage.setItem("botical:settings", JSON.stringify({
        defaultProvider: "anthropic",
        userId: "test-user",
        anthropicApiKey: "sk-ant-test-key",
      }));
    }, mockProject.id);

    await page.goto("/projects/project-1/tasks/session-1");

    // Type and press Enter
    const textarea = page.getByPlaceholder(/Type a message/);
    await textarea.fill("Test message via Enter");
    await textarea.press("Enter");

    await page.waitForFunction(() => true, null, { timeout: 2000 });

    expect(messageSent).toBe(true);
  });

  test("should not send on Shift+Enter (new line)", async ({ page }) => {
    let messageSent = false;

    await page.route("**/api/sessions/session-1/messages?projectId=*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: [], meta: { total: 0 } }),
      });
    });

    await page.route("**/api/messages", async (route) => {
      if (route.request().method() === "POST") {
        messageSent = true;
        // Fulfill with empty response - we just want to detect if the POST was triggered
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({
            data: { message: mockAssistantMessage, parts: [] },
          }),
        });
      }
    });

    await page.goto("/");
    await page.evaluate((projectId) => {
      localStorage.setItem("botical:ui", JSON.stringify({ selectedProjectId: projectId }));
      localStorage.setItem("botical:settings", JSON.stringify({
        defaultProvider: "anthropic",
        userId: "test-user",
        anthropicApiKey: "sk-ant-test-key",
      }));
    }, mockProject.id);

    await page.goto("/projects/project-1/tasks/session-1");

    // Type and press Shift+Enter
    const textarea = page.getByPlaceholder(/Type a message/);
    await textarea.fill("Line 1");
    await textarea.press("Shift+Enter");
    await textarea.pressSequentially("Line 2");

    // Should not have sent
    expect(messageSent).toBe(false);

    // Text should have newline
    const value = await textarea.inputValue();
    expect(value).toContain("\n");
  });

  test("should display tool calls in messages", async ({ page }) => {
    const messageWithTool = {
      ...mockAssistantMessage,
      parts: [
        {
          id: "part-tool",
          messageId: "msg-2",
          sessionId: "session-1",
          type: "tool-call",
          content: { name: "read_file", args: { path: "/test.txt" } },
          toolName: "read_file",
          toolCallId: "call-1",
          toolStatus: "completed",
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        {
          id: "part-result",
          messageId: "msg-2",
          sessionId: "session-1",
          type: "tool-result",
          content: "File contents here",
          toolName: "read_file",
          toolCallId: "call-1",
          toolStatus: null,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        {
          id: "part-text",
          messageId: "msg-2",
          sessionId: "session-1",
          type: "text",
          content: { text: "I read the file for you." },
          toolName: null,
          toolCallId: null,
          toolStatus: null,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ],
    };

    await page.route("**/api/sessions/session-1/messages?projectId=*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: [mockUserMessage, messageWithTool],
          meta: { total: 2 },
        }),
      });
    });

    await page.goto("/");
    await page.evaluate((projectId) => {
      localStorage.setItem("botical:ui", JSON.stringify({ selectedProjectId: projectId }));
      localStorage.setItem("botical:settings", JSON.stringify({
        defaultProvider: "anthropic",
        userId: "test-user",
        anthropicApiKey: "sk-ant-test-key",
      }));
    }, mockProject.id);

    await page.goto("/projects/project-1/tasks/session-1");

    // Tool call should be visible - the tool name appears in the header
    await expect(page.getByRole("button", { name: /read_file/ })).toBeVisible();

    // Tool status should show completed (check icon with testid)
    await expect(page.getByTestId("tool-status-completed")).toBeVisible();

    // Tool result should be visible (need to expand first)
    // Click to expand the tool call
    await page.getByRole("button", { name: /read_file/ }).click();
    await expect(page.getByText("File contents here")).toBeVisible();

    // Text should be visible
    await expect(page.getByText("I read the file for you.")).toBeVisible();
  });
});
