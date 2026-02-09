/**
 * Debug Auth Flow 
 *
 * Simple test to debug the auth endpoints.
 */

import { describe, test, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { Hono } from "hono";
import { auth } from "@/server/routes/auth.ts";
import { DatabaseManager } from "@/database/manager.ts";
import { Config } from "@/config/index.ts";
import { ValidationError, AuthenticationError } from "@/utils/errors.ts";
import fs from "fs";
import path from "path";

let app: Hono;
let consoleLogSpy: ReturnType<typeof spyOn>;

describe("Debug Auth Flow", () => {
  const testDataDir = path.join(import.meta.dirname, "../../.test-data/debug-auth-test");
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
      console.error('Error in test app:', err);
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

  test("Debug magic-link response", async () => {
    const res = await app.request("/auth/magic-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "test@example.com" }),
    });

    // Temporarily restore console.log to see output
    consoleLogSpy.mockRestore();
    console.log('Response status:', res.status);
    console.log('Response headers:', Object.fromEntries(res.headers.entries()));
    
    const data = await res.json();
    console.log('Response data:', data);
    
    expect(res.status).toBe(200);
  });
});