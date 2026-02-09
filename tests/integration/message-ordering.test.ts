/**
 * Test: Message ordering - user message must always appear before assistant response
 * 
 * This test verifies that after sending a message and receiving a response,
 * the user's message appears BEFORE the assistant's response in the chat.
 */

import { test, expect } from "@playwright/test";

const BASE_URL = "https://leopard.verse.link";

test.describe("Message ordering", () => {
  test("user message appears before assistant response after completion", async ({ page }) => {
    // Go to the app
    await page.goto(BASE_URL);
    await page.waitForLoadState("networkidle");

    // Check if we need to log in
    const loginForm = page.locator('input[type="email"]');
    if (await loginForm.isVisible({ timeout: 3000 }).catch(() => false)) {
      test.skip(true, "Requires auth - skipping in CI");
    }

    // Navigate to the first project
    const projectLink = page.locator('[data-testid="project-link"]').first();
    if (await projectLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await projectLink.click();
    }

    // Wait for the project to load
    await page.waitForTimeout(1000);

    // Use the API directly to test ordering
    // Create a session
    const projectId = "prj_2go5otpmbl6-8b852d90";
    
    const createResp = await page.evaluate(async (pid) => {
      const resp = await fetch(`/api/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: pid, title: "ordering-test" }),
      });
      return resp.json();
    }, projectId);

    const sessionId = createResp.data?.id;
    expect(sessionId).toBeTruthy();

    // Send a message (this creates both user + assistant messages)
    const msgResp = await page.evaluate(async ({ pid, sid }) => {
      const resp = await fetch(`/api/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: pid,
          sessionId: sid,
          content: "Say exactly: Hello World",
          userId: "test-user",
          providerId: "anthropic",
          apiKey: "dummy", // will fail but messages are still created
        }),
      });
      return { status: resp.status, body: await resp.json() };
    }, { pid: projectId, sid: sessionId });

    // Wait for message processing
    await page.waitForTimeout(2000);

    // Fetch messages and check order
    const messagesResp = await page.evaluate(async ({ pid, sid }) => {
      const resp = await fetch(`/api/sessions/${sid}/messages?projectId=${pid}`);
      return resp.json();
    }, { pid: projectId, sid: sessionId });

    const messages = messagesResp.data;
    expect(messages).toBeTruthy();
    expect(messages.length).toBeGreaterThanOrEqual(2);

    // First message MUST be user, second MUST be assistant
    const userMsg = messages.find((m: any) => m.role === "user");
    const assistantMsg = messages.find((m: any) => m.role === "assistant");

    expect(userMsg).toBeTruthy();
    expect(assistantMsg).toBeTruthy();

    // User's created_at must be strictly less than assistant's
    console.log(`User created_at: ${userMsg.createdAt}, Assistant created_at: ${assistantMsg.createdAt}`);
    expect(userMsg.createdAt).toBeLessThan(assistantMsg.createdAt);

    // User's index in the array must be before assistant's
    const userIndex = messages.indexOf(userMsg);
    const assistantIndex = messages.indexOf(assistantMsg);
    console.log(`User index: ${userIndex}, Assistant index: ${assistantIndex}`);
    expect(userIndex).toBeLessThan(assistantIndex);

    // Clean up - delete the session
    await page.evaluate(async ({ pid, sid }) => {
      await fetch(`/api/sessions/${sid}?projectId=${pid}`, { method: "DELETE" });
    }, { pid: projectId, sid: sessionId });
  });
});
