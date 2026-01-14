import { describe, it, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { createApp } from "@/server/app.ts";
import { DatabaseManager } from "@/database/index.ts";
import { Config } from "@/config/index.ts";
import fs from "fs";
import path from "path";

describe("Health Routes", () => {
  const testDataDir = path.join(
    import.meta.dirname,
    "../../.test-data/health-test"
  );

  beforeAll(() => {
    // Configure for test directory
    Config.load({ dataDir: testDataDir });

    // Clean up any existing test data
    if (fs.existsSync(testDataDir)) {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    }
  });

  afterAll(() => {
    DatabaseManager.closeAll();
    if (fs.existsSync(testDataDir)) {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    }
  });

  beforeEach(async () => {
    await DatabaseManager.initialize();
  });

  const app = createApp();

  describe("GET /health", () => {
    it("returns ok status", async () => {
      const response = await app.request("/health");

      expect(response.status).toBe(200);

      const body = (await response.json()) as { status: string; timestamp: number };
      expect(body.status).toBe("ok");
      expect(body.timestamp).toBeGreaterThan(0);
    });
  });

  describe("GET /health/ready", () => {
    it("returns ok when database is accessible", async () => {
      const response = await app.request("/health/ready");

      expect(response.status).toBe(200);

      const body = (await response.json()) as { status: string; checks: { database: string } };
      expect(body.status).toBe("ok");
      expect(body.checks.database).toBe("ok");
    });
  });

  describe("GET /health/live", () => {
    it("returns ok with uptime", async () => {
      const response = await app.request("/health/live");

      expect(response.status).toBe(200);

      const body = (await response.json()) as { status: string; uptime: number };
      expect(body.status).toBe("ok");
      expect(body.uptime).toBeGreaterThan(0);
    });
  });
});
