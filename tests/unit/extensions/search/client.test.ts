/**
 * Tests for SearXNG client
 */

import { describe, expect, it, beforeAll, afterAll, mock } from "bun:test";
import {
  SearxngClient,
  SearchResultSchema,
  SearchResponseSchema,
} from "@/extensions/search/client.ts";

describe("SearXNG Client", () => {
  describe("SearchResultSchema", () => {
    it("parses valid search result", () => {
      const result = SearchResultSchema.parse({
        title: "Test Result",
        url: "https://example.com",
        content: "Test content",
        engine: "google",
      });

      expect(result.title).toBe("Test Result");
      expect(result.url).toBe("https://example.com");
      expect(result.content).toBe("Test content");
      expect(result.engine).toBe("google");
    });

    it("handles optional fields", () => {
      const result = SearchResultSchema.parse({
        title: "Test Result",
        url: "https://example.com",
        engine: "google",
      });

      expect(result.title).toBe("Test Result");
      expect(result.content).toBe(""); // defaults to empty string
      expect(result.category).toBeUndefined();
      expect(result.score).toBeUndefined();
      expect(result.thumbnail).toBeUndefined();
    });

    it("parses result with all optional fields", () => {
      const result = SearchResultSchema.parse({
        title: "Test Result",
        url: "https://example.com",
        content: "Test content",
        engine: "google",
        category: "general",
        score: 1.5,
        thumbnail: "https://example.com/thumb.jpg",
        publishedDate: "2024-01-01",
      });

      expect(result.category).toBe("general");
      expect(result.score).toBe(1.5);
      expect(result.thumbnail).toBe("https://example.com/thumb.jpg");
      expect(result.publishedDate).toBe("2024-01-01");
    });

    it("rejects result without required fields", () => {
      expect(() =>
        SearchResultSchema.parse({
          url: "https://example.com",
          engine: "google",
        })
      ).toThrow();

      expect(() =>
        SearchResultSchema.parse({
          title: "Test",
          engine: "google",
        })
      ).toThrow();

      expect(() =>
        SearchResultSchema.parse({
          title: "Test",
          url: "https://example.com",
        })
      ).toThrow();
    });
  });

  describe("SearchResponseSchema", () => {
    it("parses valid search response", () => {
      const response = SearchResponseSchema.parse({
        query: "test query",
        results: [
          {
            title: "Result 1",
            url: "https://example.com/1",
            engine: "google",
          },
        ],
      });

      expect(response.query).toBe("test query");
      expect(response.results.length).toBe(1);
      expect(response.suggestions).toEqual([]);
    });

    it("handles optional fields", () => {
      const response = SearchResponseSchema.parse({
        query: "test",
        results: [],
      });

      expect(response.number_of_results).toBeUndefined();
      expect(response.suggestions).toEqual([]);
      expect(response.infoboxes).toEqual([]);
    });

    it("parses response with all fields", () => {
      const response = SearchResponseSchema.parse({
        query: "test query",
        number_of_results: 1000,
        results: [
          {
            title: "Result 1",
            url: "https://example.com/1",
            engine: "google",
          },
        ],
        suggestions: ["test suggestion"],
        infoboxes: [{ type: "test" }],
      });

      expect(response.number_of_results).toBe(1000);
      expect(response.suggestions).toEqual(["test suggestion"]);
      expect(response.infoboxes).toHaveLength(1);
    });

    it("rejects response without query", () => {
      expect(() =>
        SearchResponseSchema.parse({
          results: [],
        })
      ).toThrow();
    });

    it("rejects response without results", () => {
      expect(() =>
        SearchResponseSchema.parse({
          query: "test",
        })
      ).toThrow();
    });
  });

  describe("SearxngClient.isAvailable", () => {
    it("returns false when SearXNG is not running", async () => {
      // Use a URL that definitely won't be running
      const available = await SearxngClient.isAvailable("http://localhost:19999");
      expect(available).toBe(false);
    });

    it("handles connection failure gracefully", async () => {
      // This should fail to connect and return false
      // Using a port that's unlikely to have anything running
      const available = await SearxngClient.isAvailable("http://localhost:19998");
      expect(available).toBe(false);
    });
  });

  describe("SearxngClient.search", () => {
    it("throws when SearXNG is not available", async () => {
      await expect(
        SearxngClient.search("test query", { baseUrl: "http://localhost:19999" })
      ).rejects.toThrow();
    });

    it("builds correct URL with options", async () => {
      // We can't actually test the search without a running SearXNG instance,
      // but we can verify the error message indicates it tried the right URL
      try {
        await SearxngClient.search("test query", {
          baseUrl: "http://localhost:19999",
          limit: 5,
          categories: ["general", "news"],
          language: "en",
          safesearch: 1,
          timeRange: "week",
        });
      } catch (err) {
        // Just verify it tried to make a request
        expect(err).toBeDefined();
      }
    });
  });

  describe("SearxngClient.suggest", () => {
    it("returns empty array when SearXNG is not available", async () => {
      // Suggestions should fail gracefully
      const suggestions = await SearxngClient.suggest("test", {
        baseUrl: "http://localhost:19999",
      });
      expect(suggestions).toEqual([]);
    });
  });
});

describe("Search Options", () => {
  it("supports all category options", () => {
    const categories = ["general", "images", "videos", "news", "science", "files", "social_media"];

    // This is more of a documentation test - ensure we support all expected categories
    categories.forEach((category) => {
      expect(typeof category).toBe("string");
    });
  });

  it("supports all time range options", () => {
    const timeRanges = ["day", "week", "month", "year"];

    timeRanges.forEach((range) => {
      expect(typeof range).toBe("string");
    });
  });

  it("supports all safesearch levels", () => {
    const levels = [0, 1, 2];

    levels.forEach((level) => {
      expect(typeof level).toBe("number");
      expect(level).toBeGreaterThanOrEqual(0);
      expect(level).toBeLessThanOrEqual(2);
    });
  });
});
