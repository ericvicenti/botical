/**
 * Tests for utility actions
 */

import { describe, expect, it } from "bun:test";
import { utilityWait } from "@/actions/utility.ts";
import type { ActionContext } from "@/actions/types.ts";

describe("utility.wait action", () => {
  const mockContext: ActionContext = {
    projectId: "test-project",
    projectPath: "/tmp/test",
  };

  it("waits for specified milliseconds", async () => {
    const start = Date.now();
    const result = await utilityWait.execute({ ms: 50 }, mockContext);
    const elapsed = Date.now() - start;

    expect(result.type).toBe("success");
    expect(elapsed).toBeGreaterThanOrEqual(45); // Allow some tolerance
    if (result.type === "success") {
      expect(result.metadata?.durationMs).toBe(50);
    }
  });

  it("waits for specified seconds", async () => {
    const start = Date.now();
    const result = await utilityWait.execute({ seconds: 0.05 }, mockContext);
    const elapsed = Date.now() - start;

    expect(result.type).toBe("success");
    expect(elapsed).toBeGreaterThanOrEqual(45);
    if (result.type === "success") {
      expect(result.metadata?.durationMs).toBe(50);
    }
  });

  it("handles zero wait time", async () => {
    const result = await utilityWait.execute({ ms: 0 }, mockContext);

    expect(result.type).toBe("success");
    if (result.type === "success") {
      expect(result.metadata?.durationMs).toBe(0);
    }
  });

  it("respects abort signal", async () => {
    const abortController = new AbortController();
    const contextWithAbort: ActionContext = {
      ...mockContext,
      abortSignal: abortController.signal,
    };

    // Abort after 20ms
    setTimeout(() => abortController.abort(), 20);

    const start = Date.now();
    const result = await utilityWait.execute({ ms: 500 }, contextWithAbort);
    const elapsed = Date.now() - start;

    expect(result.type).toBe("success");
    expect(elapsed).toBeLessThan(100); // Should have been interrupted
    if (result.type === "success") {
      expect(result.metadata?.interrupted).toBe(true);
    }
  });

  it("rejects wait times exceeding maximum", async () => {
    const result = await utilityWait.execute({ ms: 120000 }, mockContext);

    expect(result.type).toBe("error");
  });

  it("prefers ms over seconds when both provided", async () => {
    const start = Date.now();
    const result = await utilityWait.execute({ ms: 30, seconds: 1 }, mockContext);
    const elapsed = Date.now() - start;

    expect(result.type).toBe("success");
    // Should use ms (30ms) not seconds (1000ms)
    expect(elapsed).toBeLessThan(100);
  });
});
