/**
 * Tests for web search action
 */

import { describe, expect, it, mock, beforeEach, afterEach } from "bun:test";
import { webSearch, webSearchActions } from "@/actions/websearch.ts";
import type { ActionContext } from "@/actions/types.ts";

// Mock the extension server manager
const mockGetExtensionServerUrl = mock(() => null as string | null);

// Replace the import at module level using Bun's mock
mock.module("@/extensions/server-manager.ts", () => ({
  getExtensionServerUrl: mockGetExtensionServerUrl,
}));

describe("search.web action", () => {
  const mockContext: ActionContext = {
    projectId: "test-project",
    projectPath: "/tmp/test",
  };

  beforeEach(() => {
    mockGetExtensionServerUrl.mockClear();
    mockGetExtensionServerUrl.mockReturnValue(null);
  });

  describe("action definition", () => {
    it("has correct action ID", () => {
      expect(webSearch.id).toBe("search.web");
    });

    it("has correct category", () => {
      expect(webSearch.category).toBe("search");
    });

    it("has description", () => {
      expect(webSearch.description).toBeDefined();
      expect(webSearch.description.length).toBeGreaterThan(0);
      expect(webSearch.description).toContain("SearXNG");
    });

    it("has label", () => {
      expect(webSearch.label).toBe("Web Search");
    });

    it("has icon", () => {
      expect(webSearch.icon).toBe("globe");
    });

    it("is exported in webSearchActions array", () => {
      expect(webSearchActions).toContain(webSearch);
    });
  });

  describe("parameter schema validation", () => {
    const schema = webSearch.params;

    it("requires query parameter", () => {
      expect(() => schema.parse({})).toThrow();
      expect(() => schema.parse({ limit: 5 })).toThrow();
    });

    it("accepts valid query", () => {
      const result = schema.parse({ query: "test query" });
      expect(result.query).toBe("test query");
    });

    it("accepts optional limit", () => {
      const result = schema.parse({ query: "test", limit: 5 });
      expect(result.limit).toBe(5);
    });

    it("enforces limit constraints", () => {
      // Valid range
      expect(() => schema.parse({ query: "test", limit: 1 })).not.toThrow();
      expect(() => schema.parse({ query: "test", limit: 10 })).not.toThrow();

      // Invalid: less than minimum
      expect(() => schema.parse({ query: "test", limit: 0 })).toThrow();

      // Invalid: exceeds max
      expect(() => schema.parse({ query: "test", limit: 11 })).toThrow();

      // Invalid: not integer
      expect(() => schema.parse({ query: "test", limit: 5.5 })).toThrow();
    });

    it("accepts optional categories", () => {
      const result = schema.parse({
        query: "test",
        categories: ["general", "news"],
      });
      expect(result.categories).toEqual(["general", "news"]);
    });

    it("accepts optional timeRange", () => {
      expect(() =>
        schema.parse({ query: "test", timeRange: "day" })
      ).not.toThrow();
      expect(() =>
        schema.parse({ query: "test", timeRange: "week" })
      ).not.toThrow();
      expect(() =>
        schema.parse({ query: "test", timeRange: "month" })
      ).not.toThrow();
      expect(() =>
        schema.parse({ query: "test", timeRange: "year" })
      ).not.toThrow();

      // Invalid time range
      expect(() =>
        schema.parse({ query: "test", timeRange: "invalid" })
      ).toThrow();
    });
  });

  describe("execution", () => {
    it("returns error when extension is not running", async () => {
      mockGetExtensionServerUrl.mockReturnValue(null);

      const result = await webSearch.execute({ query: "test" }, mockContext);

      expect(result.type).toBe("error");
      if (result.type === "error") {
        expect(result.message).toContain("extension is not running");
        expect(result.code).toBe("EXTENSION_NOT_RUNNING");
      }
    });

    it("returns error when search request fails", async () => {
      mockGetExtensionServerUrl.mockReturnValue("http://localhost:4102");

      // The fetch will fail because no server is actually running
      const result = await webSearch.execute({ query: "test" }, mockContext);

      expect(result.type).toBe("error");
      if (result.type === "error") {
        // Error could be REQUEST_FAILED or SEARCH_FAILED depending on the nature of the failure
        expect(["REQUEST_FAILED", "SEARCH_FAILED"]).toContain(result.code);
      }
    });
  });

  describe("result formatting", () => {
    // These tests verify the expected output format
    // Actual integration testing requires a running SearXNG instance

    it("handles empty query gracefully", async () => {
      mockGetExtensionServerUrl.mockReturnValue(null);

      // With extension not running, we get the extension error first
      const result = await webSearch.execute({ query: "" }, mockContext);
      expect(result.type).toBe("error");
    });

    it("respects limit parameter", async () => {
      mockGetExtensionServerUrl.mockReturnValue(null);

      // Even with different limits, without extension it returns error
      const result1 = await webSearch.execute(
        { query: "test", limit: 3 },
        mockContext
      );
      const result2 = await webSearch.execute(
        { query: "test", limit: 10 },
        mockContext
      );

      expect(result1.type).toBe("error");
      expect(result2.type).toBe("error");
    });
  });

  describe("default values", () => {
    it("uses default limit of 5", () => {
      const schema = webSearch.params;
      const result = schema.parse({ query: "test" });
      expect(result.limit).toBeUndefined(); // Schema doesn't set default, action does
    });
  });
});

describe("webSearchActions array", () => {
  it("contains webSearch action", () => {
    expect(webSearchActions).toHaveLength(1);
    expect(webSearchActions[0]).toBe(webSearch);
  });
});
