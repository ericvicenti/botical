/**
 * Auth Polling Flow Tests
 *
 * Tests for the new magic link polling-based authentication flow.
 */

import { describe, test, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { Hono } from "hono";
import { auth } from "@/server/routes/auth.ts";
import { MagicLinkService } from "@/auth/magic-link.ts";
import { DatabaseManager } from "@/database/manager.ts";
import { Config } from "@/config/index.ts";
import { ValidationError, AuthenticationError } from "@/utils/errors.ts";
import fs from "fs";
import path from "path";

let app: Hono;
let consoleLogSpy: ReturnType<typeof spyOn>;

describe("Auth Polling Flow", () => {
  const testDataDir = path.join(import.meta.dirname, "../../.test-data/auth-polling-test");
  const originalEnv = { ...process.env };

  beforeEach(async () => {
    // Disable single-user mode for auth route tests
    process.env.BOTICAL_SINGLE_USER = "false";

    // Reset database for each test
    DatabaseManager.closeAll();
    Config.load({ dataDir: testDataDir });

    if (fs.existsSync(testDataDir)) {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    }

    // Initialize database
    await DatabaseManager.initialize();

    // Create app with auth routes
    app = new Hono();
    app.onError((err, c) => {
      if (err instanceof ValidationError) {
        return c.json({ error: err.message }, 400);
      }
      if (err instanceof AuthenticationError) {
        return c.json({ error: err.message }, 401);
      }
      return c.json({ error: err.message }, 500);
    });
    app.route("/auth", auth);

    // Spy on console.log to capture magic link output
    consoleLogSpy = spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    // Restore environment
    process.env = { ...originalEnv };

    // Clean up test data
    DatabaseManager.closeAll();
    if (fs.existsSync(testDataDir)) {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    }

    // Restore console.log
    consoleLogSpy.mockRestore();
  });
  test("POST /auth/magic-link returns loginToken", async () => {
    const res = await app.request("/auth/magic-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "test@example.com" }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.loginToken).toBeDefined();
    expect(typeof data.loginToken).toBe("string");
  });

  test("GET /auth/poll-login returns pending status initially", async () => {
    // Request magic link first
    const requestRes = await app.request("/auth/magic-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "test2@example.com" }),
    });
    
    const requestData = await requestRes.json();
    const loginToken = requestData.loginToken;

    // Poll for status
    const pollRes = await app.request(`/auth/poll-login?token=${loginToken}`);
    expect(pollRes.status).toBe(200);
    
    const pollData = await pollRes.json();
    expect(pollData.status).toBe("pending");
  });

  test("verify endpoint marks login as completed", async () => {
    // Clear previous console logs
    consoleLogSpy.mockClear();

    // Request magic link
    const requestRes = await app.request("/auth/magic-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "test3@example.com" }),
    });
    
    const requestData = await requestRes.json();
    const loginToken = requestData.loginToken;

    // Extract the magic link token from console output
    const output = consoleLogSpy.mock.calls.map((c: unknown[]) => c.join(" ")).join("\n");
    const tokenMatch = output.match(/token=([A-Za-z0-9_-]+)/);
    const magicLinkToken = tokenMatch![1];

    // Verify the magic link token (simulating user clicking the link)
    const verifyRes = await app.request(`/auth/verify?token=${magicLinkToken}`);
    expect(verifyRes.status).toBe(200);
    expect(verifyRes.headers.get("Content-Type")).toContain("text/html");

    // Now poll again and expect completed status
    const pollRes = await app.request(`/auth/poll-login?token=${loginToken}`);
    expect(pollRes.status).toBe(200);
    
    const pollData = await pollRes.json();
    expect(pollData.status).toBe("completed");
    expect(pollData.sessionToken).toBeDefined();
    expect(typeof pollData.sessionToken).toBe("string");
    expect(pollData.isNewUser).toBeDefined();
    expect(pollData.isAdmin).toBeDefined();
  });

  test("set-session endpoint sets cookie properly", async () => {
    // Clear previous console logs
    consoleLogSpy.mockClear();

    // Request magic link
    const requestRes = await app.request("/auth/magic-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "test4@example.com" }),
    });
    
    const requestData = await requestRes.json();
    const loginToken = requestData.loginToken;

    // Extract the magic link token from console output
    const output = consoleLogSpy.mock.calls.map((c: unknown[]) => c.join(" ")).join("\n");
    const tokenMatch = output.match(/token=([A-Za-z0-9_-]+)/);
    const magicLinkToken = tokenMatch![1];

    // Verify the magic link token
    await app.request(`/auth/verify?token=${magicLinkToken}`);

    // Poll for completion
    const pollRes = await app.request(`/auth/poll-login?token=${loginToken}`);
    const pollData = await pollRes.json();

    // Use the session token with set-session endpoint
    const setSessionRes = await app.request("/auth/set-session", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${pollData.sessionToken}`,
      },
    });

    expect(setSessionRes.status).toBe(200);
    const setCookie = setSessionRes.headers.get("Set-Cookie");
    expect(setCookie).toContain("botical_session=");
    expect(setCookie).toContain("HttpOnly");
  });

  test("poll-login returns error for invalid token", async () => {
    const pollRes = await app.request("/auth/poll-login?token=invalid-token");
    expect(pollRes.status).toBe(401);
    
    const pollData = await pollRes.json();
    expect(pollData.error).toBeDefined();
  });

  test("set-session returns error for invalid session token", async () => {
    const setSessionRes = await app.request("/auth/set-session", {
      method: "POST",
      headers: {
        "Authorization": "Bearer invalid-session-token",
      },
    });

    expect(setSessionRes.status).toBe(401);
    const data = await setSessionRes.json();
    expect(data.error).toBeDefined();
  });
});