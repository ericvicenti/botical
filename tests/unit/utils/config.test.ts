import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Config } from "@/config/index.ts";
import path from "path";
import os from "os";

describe("Config", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Reset environment
    delete process.env.IRIS_DATA_DIR;
    delete process.env.IRIS_PORT;
    delete process.env.IRIS_HOST;
    delete process.env.IRIS_LOG_LEVEL;
    delete process.env.IRIS_SINGLE_USER;
    delete process.env.RESEND_API_KEY;
  });

  afterEach(() => {
    // Restore environment
    process.env = { ...originalEnv };
  });

  describe("load", () => {
    it("uses default values when no env vars set", () => {
      const config = Config.load();

      expect(config.dataDir).toBe(path.join(os.homedir(), ".iris"));
      expect(config.port).toBe(6001);
      expect(config.host).toBe("localhost");
      expect(config.logLevel).toBe("info");
    });

    it("reads from environment variables", () => {
      process.env.IRIS_DATA_DIR = "/custom/data";
      process.env.IRIS_PORT = "8080";
      process.env.IRIS_HOST = "0.0.0.0";
      process.env.IRIS_LOG_LEVEL = "debug";

      const config = Config.load();

      expect(config.dataDir).toBe("/custom/data");
      expect(config.port).toBe(8080);
      expect(config.host).toBe("0.0.0.0");
      expect(config.logLevel).toBe("debug");
    });

    it("accepts overrides that take precedence", () => {
      process.env.IRIS_PORT = "8080";

      const config = Config.load({
        port: 3000,
        host: "127.0.0.1",
      });

      expect(config.port).toBe(3000);
      expect(config.host).toBe("127.0.0.1");
    });
  });

  describe("get", () => {
    it("returns loaded configuration", () => {
      Config.load({ dataDir: "/test/path" });

      const config = Config.get();

      expect(config.dataDir).toBe("/test/path");
    });

    it("auto-loads with defaults if not loaded", () => {
      const config = Config.get();

      expect(config.port).toBe(6001);
    });
  });

  describe("getDataDir", () => {
    it("returns the data directory", () => {
      Config.load({ dataDir: "/test/data" });

      expect(Config.getDataDir()).toBe("/test/data");
    });
  });

  describe("getRootDbPath", () => {
    it("returns path to root database", () => {
      Config.load({ dataDir: "/test/data" });

      expect(Config.getRootDbPath()).toBe("/test/data/iris.db");
    });
  });

  describe("getProjectDbPath", () => {
    it("returns path to project database", () => {
      Config.load({ dataDir: "/test/data" });

      expect(Config.getProjectDbPath("prj_123")).toBe(
        "/test/data/projects/prj_123/project.db"
      );
    });
  });

  describe("getProjectDir", () => {
    it("returns path to project directory", () => {
      Config.load({ dataDir: "/test/data" });

      expect(Config.getProjectDir("prj_123")).toBe(
        "/test/data/projects/prj_123"
      );
    });
  });

  describe("log levels", () => {
    it("validates log level values", () => {
      process.env.IRIS_LOG_LEVEL = "invalid";

      // Should use default instead of invalid value
      expect(() => Config.load()).toThrow();
    });

    it("accepts valid log levels", () => {
      const levels = ["debug", "info", "warn", "error"] as const;
      for (const level of levels) {
        process.env.IRIS_LOG_LEVEL = level;
        const config = Config.load();
        expect(config.logLevel).toBe(level);
      }
    });
  });

  describe("isSingleUserMode", () => {
    it("returns true when IRIS_SINGLE_USER is explicitly true", () => {
      process.env.IRIS_SINGLE_USER = "true";
      Config.load();

      expect(Config.isSingleUserMode()).toBe(true);
    });

    it("returns false when IRIS_SINGLE_USER is explicitly false", () => {
      process.env.IRIS_SINGLE_USER = "false";
      Config.load({ host: "localhost" }); // Even with localhost

      expect(Config.isSingleUserMode()).toBe(false);
    });

    it("auto-detects single-user mode on localhost without resendApiKey", () => {
      // No explicit IRIS_SINGLE_USER set
      Config.load({ host: "localhost" });

      expect(Config.isSingleUserMode()).toBe(true);
    });

    it("returns false when host is not localhost", () => {
      Config.load({ host: "0.0.0.0" });

      expect(Config.isSingleUserMode()).toBe(false);
    });

    it("returns false when resendApiKey is configured", () => {
      Config.load({
        host: "localhost",
        resendApiKey: "re_test123",
      });

      expect(Config.isSingleUserMode()).toBe(false);
    });

    it("explicit IRIS_SINGLE_USER=true overrides other conditions", () => {
      process.env.IRIS_SINGLE_USER = "true";
      Config.load({
        host: "0.0.0.0", // Not localhost
        resendApiKey: "re_test123", // Has API key
      });

      expect(Config.isSingleUserMode()).toBe(true);
    });

    it("explicit IRIS_SINGLE_USER=false overrides auto-detection", () => {
      process.env.IRIS_SINGLE_USER = "false";
      Config.load({ host: "localhost" }); // Would normally be single-user

      expect(Config.isSingleUserMode()).toBe(false);
    });
  });
});
