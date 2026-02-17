/**
 * Authentication helpers for integration tests
 */

import { spyOn } from "bun:test";
import type { Hono } from "hono";
import { EmailService } from "@/services/email.ts";

/**
 * Create an authenticated session for testing
 */
export async function createAuthSession(app: Hono, email: string = "test@example.com"): Promise<{ sessionToken: string; userId: string; email: string }> {
  // Ensure we're in test mode
  const originalNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "test";
  
  // Reset email service config to pick up test environment
  EmailService.resetConfig();
  
  // Spy on console.log to capture magic link token
  const consoleLogSpy = spyOn(console, "log");

  try {
    // Request magic link
    const magicRes = await app.request("/auth/magic-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const magicData = (await magicRes.json()) as { loginToken: string };
    const loginToken = magicData.loginToken;

    // Extract magic link token from console output
    const output = consoleLogSpy.mock.calls
      .map((c: unknown[]) => c.join(" "))
      .join("\n");
    const tokenMatch = output.match(/Link:.*?token=([A-Za-z0-9_-]+)/);
    if (!tokenMatch) throw new Error("No magic link token found in console output");

    // Verify (user clicks link) - returns HTML now
    await app.request(`/auth/verify?token=${tokenMatch[1]}`);

    // Poll for session
    const pollRes = await app.request(`/auth/poll-login?token=${loginToken}`);
    const pollData = (await pollRes.json()) as { status: string; sessionToken: string; userId: string };
    
    // Get user info
    const userRes = await app.request("/auth/me", {
      headers: { Authorization: `Bearer ${pollData.sessionToken}` },
    });
    const userData = (await userRes.json()) as { user: { id: string; email: string } };
    
    return {
      sessionToken: pollData.sessionToken,
      userId: userData.user.id,
      email: userData.user.email,
    };
  } finally {
    consoleLogSpy.mockRestore();
    process.env.NODE_ENV = originalNodeEnv;
  }
}

/**
 * Create headers with authentication token
 */
export function createAuthHeaders(sessionToken: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${sessionToken}`,
  };
}

/**
 * Create headers with authentication cookie
 */
export function createAuthCookieHeaders(sessionToken: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "Cookie": `session=${sessionToken}`,
  };
}