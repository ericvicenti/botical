import { test, expect } from "@playwright/test";

/**
 * Conversation E2E Tests
 *
 * Tests the full messaging flow including:
 * - Optimistic updates (user message appears immediately)
 * - Message persistence (messages reload on refresh)
 * - Error handling
 *
 * For testing with a real API key, set ANTHROPIC_API_KEY env var
 * and run: ANTHROPIC_API_KEY=sk-xxx bun run test:e2e conversation.spec.ts
 */
test.describe("Conversation", () => {
  const mockProject = {
    id: "project-conv-test",
    name: "Conversation Test Project",
    description: null,
    ownerId: "user-1",
    type: "local",
    path: "/test/conversation",
    gitRemote: null,
    iconUrl: null,
    color: null,
    settings: {},
    createdAt: Date.now(),
    updatedAt: Date.now(),
    archivedAt: null,
  };

  const mockSession = {
    id: "session-conv-test",
    slug: "conversation-test",
    parentId: null,
    title: "Conversation Test",
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
    // Mock auth to skip login
    await page.route("**/api/auth/mode", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ mode: "single-user", user: { userId: "user-1", id: "user-1", email: "test@test.com", displayName: "Test User", isAdmin: true, canExecuteCode: true } }),
      });
    });
    // Set up basic project/session mocks
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
        body: JSON.stringify({ data: [mockSession], meta: { total: 1 } }),
      });
    });

    await page.route("**/api/sessions/session-conv-test?projectId=*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: mockSession }),
      });
    });
  });

  test("should show user message optimistically when sending", async ({ page }) => {
    let messagesReturned: unknown[] = [];
    let messageSendCalled = false;

    // Start with no messages
    await page.route("**/api/sessions/session-conv-test/messages?projectId=*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: messagesReturned, meta: { total: messagesReturned.length } }),
      });
    });

    // Mock the message send - simulate a delay to observe optimistic update
    await page.route("**/api/messages", async (route) => {
      if (route.request().method() === "POST") {
        messageSendCalled = true;
        const body = JSON.parse(route.request().postData() || "{}");

        // Simulate network delay
        await new Promise((r) => setTimeout(r, 500));

        // Create the user and assistant messages
        const userMessage = {
          id: "msg-user-1",
          sessionId: "session-conv-test",
          role: "user",
          parentId: null,
          finishReason: null,
          cost: 0,
          tokensInput: 0,
          tokensOutput: 0,
          errorType: null,
          errorMessage: null,
          createdAt: Date.now(),
          completedAt: Date.now(),
          parts: [
            {
              id: "part-user-1",
              messageId: "msg-user-1",
              sessionId: "session-conv-test",
              type: "text",
              content: { text: body.content },
              toolName: null,
              toolCallId: null,
              toolStatus: null,
              createdAt: Date.now(),
              updatedAt: Date.now(),
            },
          ],
        };

        const assistantMessage = {
          id: "msg-assistant-1",
          sessionId: "session-conv-test",
          role: "assistant",
          parentId: "msg-user-1",
          finishReason: "stop",
          cost: 0.001,
          tokensInput: 50,
          tokensOutput: 20,
          errorType: null,
          errorMessage: null,
          createdAt: Date.now(),
          completedAt: Date.now(),
          parts: [
            {
              id: "part-assistant-1",
              messageId: "msg-assistant-1",
              sessionId: "session-conv-test",
              type: "text",
              content: { text: "Hello! I received your message." },
              toolName: null,
              toolCallId: null,
              toolStatus: null,
              createdAt: Date.now(),
              updatedAt: Date.now(),
            },
          ],
        };

        // Update mock data for subsequent fetches
        messagesReturned = [userMessage, assistantMessage];

        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({
            data: { message: assistantMessage, parts: assistantMessage.parts },
          }),
        });
      }
    });

    // Set up localStorage with API key
    await page.goto("/");
    await page.evaluate((projectId) => {
      localStorage.setItem("botical:ui", JSON.stringify({ selectedProjectId: projectId }));
      localStorage.setItem(
        "botical:settings",
        JSON.stringify({
          defaultProvider: "anthropic",
          userId: "test-user",
          anthropicApiKey: "sk-ant-test-key",
        })
      );
    }, mockProject.id);

    await page.goto("/projects/project-conv-test/tasks/session-conv-test");

    // Wait for the task chat to load
    await expect(page.getByRole("heading", { name: "Conversation Test" })).toBeVisible();

    // Type a message
    const textarea = page.getByPlaceholder(/Type a message/);
    await textarea.fill("Hello, this is a test message!");

    // Click send
    const sendButton = page.getByTestId("send-message-button");
    await sendButton.click();

    // The user message should appear IMMEDIATELY (optimistically)
    // This tests that we don't wait for the server response
    await expect(page.getByTestId("user-message")).toBeVisible({ timeout: 500 });
    await expect(page.getByText("Hello, this is a test message!")).toBeVisible({ timeout: 500 });

    // The send button should show loading state
    await expect(sendButton).toBeDisabled();

    // Wait for the assistant response
    await expect(page.getByTestId("assistant-message")).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("Hello! I received your message.")).toBeVisible();

    // Verify the API was called
    expect(messageSendCalled).toBe(true);
  });

  test("should display error when message send fails", async ({ page }) => {
    // Start with no messages
    await page.route("**/api/sessions/session-conv-test/messages?projectId=*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: [], meta: { total: 0 } }),
      });
    });

    // Mock message send to fail
    await page.route("**/api/messages", async (route) => {
      if (route.request().method() === "POST") {
        await route.fulfill({
          status: 401,
          contentType: "application/json",
          body: JSON.stringify({
            error: { code: "AUTHENTICATION_ERROR", message: "Invalid API key" },
          }),
        });
      }
    });

    await page.goto("/");
    await page.evaluate((projectId) => {
      localStorage.setItem("botical:ui", JSON.stringify({ selectedProjectId: projectId }));
      localStorage.setItem(
        "botical:settings",
        JSON.stringify({
          defaultProvider: "anthropic",
          userId: "test-user",
          anthropicApiKey: "sk-ant-invalid-key",
        })
      );
    }, mockProject.id);

    await page.goto("/projects/project-conv-test/tasks/session-conv-test");

    // Type and send a message
    const textarea = page.getByPlaceholder(/Type a message/);
    await textarea.fill("Test message");
    await page.getByTestId("send-message-button").click();

    // Error should be displayed
    await expect(page.getByText(/Invalid API key/i)).toBeVisible({ timeout: 5000 });
  });

  test("should persist messages after page refresh", async ({ page }) => {
    const existingMessages = [
      {
        id: "msg-existing-1",
        sessionId: "session-conv-test",
        role: "user",
        parentId: null,
        finishReason: null,
        cost: 0,
        tokensInput: 0,
        tokensOutput: 0,
        errorType: null,
        errorMessage: null,
        createdAt: Date.now() - 60000,
        completedAt: Date.now() - 60000,
        parts: [
          {
            id: "part-existing-1",
            messageId: "msg-existing-1",
            sessionId: "session-conv-test",
            type: "text",
            content: { text: "Previous user message" },
            toolName: null,
            toolCallId: null,
            toolStatus: null,
            createdAt: Date.now() - 60000,
            updatedAt: Date.now() - 60000,
          },
        ],
      },
      {
        id: "msg-existing-2",
        sessionId: "session-conv-test",
        role: "assistant",
        parentId: "msg-existing-1",
        finishReason: "stop",
        cost: 0.001,
        tokensInput: 50,
        tokensOutput: 30,
        errorType: null,
        errorMessage: null,
        createdAt: Date.now() - 59000,
        completedAt: Date.now() - 58000,
        parts: [
          {
            id: "part-existing-2",
            messageId: "msg-existing-2",
            sessionId: "session-conv-test",
            type: "text",
            content: { text: "Previous assistant response" },
            toolName: null,
            toolCallId: null,
            toolStatus: null,
            createdAt: Date.now() - 58000,
            updatedAt: Date.now() - 58000,
          },
        ],
      },
    ];

    await page.route("**/api/sessions/session-conv-test/messages?projectId=*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: existingMessages, meta: { total: existingMessages.length } }),
      });
    });

    await page.goto("/");
    await page.evaluate((projectId) => {
      localStorage.setItem("botical:ui", JSON.stringify({ selectedProjectId: projectId }));
      localStorage.setItem(
        "botical:settings",
        JSON.stringify({
          defaultProvider: "anthropic",
          userId: "test-user",
          anthropicApiKey: "sk-ant-test-key",
        })
      );
    }, mockProject.id);

    // Load the conversation
    await page.goto("/projects/project-conv-test/tasks/session-conv-test");

    // Both messages should be visible
    await expect(page.getByText("Previous user message")).toBeVisible();
    await expect(page.getByText("Previous assistant response")).toBeVisible();

    // Count the messages
    const userMessages = page.getByTestId("user-message");
    const assistantMessages = page.getByTestId("assistant-message");

    await expect(userMessages).toHaveCount(1);
    await expect(assistantMessages).toHaveCount(1);

    // Refresh the page
    await page.reload();

    // Messages should still be there after refresh
    await expect(page.getByText("Previous user message")).toBeVisible();
    await expect(page.getByText("Previous assistant response")).toBeVisible();
  });

  test("should clear input after sending message", async ({ page }) => {
    await page.route("**/api/sessions/session-conv-test/messages?projectId=*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: [], meta: { total: 0 } }),
      });
    });

    await page.route("**/api/messages", async (route) => {
      if (route.request().method() === "POST") {
        // Delay to allow checking input clearing
        await new Promise((r) => setTimeout(r, 100));
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({
            data: {
              message: {
                id: "msg-1",
                sessionId: "session-conv-test",
                role: "assistant",
                parts: [{ id: "p1", type: "text", content: { text: "Response" } }],
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
      localStorage.setItem(
        "botical:settings",
        JSON.stringify({
          defaultProvider: "anthropic",
          userId: "test-user",
          anthropicApiKey: "sk-ant-test-key",
        })
      );
    }, mockProject.id);

    await page.goto("/projects/project-conv-test/tasks/session-conv-test");

    const textarea = page.getByPlaceholder(/Type a message/);
    await textarea.fill("Test message to clear");

    // Verify input has content
    await expect(textarea).toHaveValue("Test message to clear");

    // Send
    await page.getByTestId("send-message-button").click();

    // Input should be cleared immediately
    await expect(textarea).toHaveValue("");
  });
});
