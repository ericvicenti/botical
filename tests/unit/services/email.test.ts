import { describe, it, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { EmailService } from "@/services/email.ts";

describe("Email Service", () => {
  let consoleLogSpy: ReturnType<typeof spyOn>;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    // Ensure dev mode (no API key)
    delete process.env.RESEND_API_KEY;
    consoleLogSpy = spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = originalEnv;
    consoleLogSpy.mockRestore();
  });

  describe("isDevMode", () => {
    it("returns true when RESEND_API_KEY not set", () => {
      delete process.env.RESEND_API_KEY;
      // Need to create new instance to pick up env change
      expect(EmailService.isDevMode()).toBe(true);
    });
  });

  describe("getAppUrl", () => {
    it("returns default URL when APP_URL not set", () => {
      delete process.env.APP_URL;
      expect(EmailService.getAppUrl()).toBe("http://localhost:6001");
    });
  });

  describe("sendMagicLink (dev mode)", () => {
    it("logs magic link to console in dev mode", async () => {
      const email = "test@example.com";
      const token = "test-token-123";

      await EmailService.sendMagicLink(email, token);

      expect(consoleLogSpy).toHaveBeenCalled();

      // Check that the output contains the email and token
      const calls = consoleLogSpy.mock.calls;
      const output = calls.map((c: unknown[]) => c.join(" ")).join("\n");

      expect(output).toContain("MAGIC LINK");
      expect(output).toContain(email);
      expect(output).toContain(token);
    });

    it("includes full magic link URL", async () => {
      const token = "my-token";
      await EmailService.sendMagicLink("user@test.com", token);

      const calls = consoleLogSpy.mock.calls;
      const output = calls.map((c: unknown[]) => c.join(" ")).join("\n");

      expect(output).toContain("/auth/verify?token=my-token");
    });
  });

  describe("send (dev mode)", () => {
    it("logs generic email to console in dev mode", async () => {
      await EmailService.send(
        "recipient@example.com",
        "Test Subject",
        "<p>HTML content</p>",
        "Plain text content"
      );

      expect(consoleLogSpy).toHaveBeenCalled();

      const calls = consoleLogSpy.mock.calls;
      const output = calls.map((c: unknown[]) => c.join(" ")).join("\n");

      expect(output).toContain("EMAIL");
      expect(output).toContain("recipient@example.com");
      expect(output).toContain("Test Subject");
      expect(output).toContain("Plain text content");
    });
  });
});
