/**
 * Message Content Type Safety Tests
 *
 * Ensures message content is always properly typed and extracted.
 * Prevents the bug where raw strings were stored instead of { text: string }.
 */

import { describe, it, expect } from "bun:test";
import {
  extractTextContent,
  textContent,
  parseTextContent,
  TextContentSchema,
} from "@/services/message-content.ts";

describe("extractTextContent", () => {
  it("extracts text from canonical { text: string } format", () => {
    expect(extractTextContent({ text: "hello" })).toBe("hello");
  });

  it("extracts text from raw string (legacy format)", () => {
    expect(extractTextContent("hello")).toBe("hello");
  });

  it("returns empty string for null", () => {
    expect(extractTextContent(null)).toBe("");
  });

  it("returns empty string for undefined", () => {
    expect(extractTextContent(undefined)).toBe("");
  });

  it("returns empty string for empty object", () => {
    expect(extractTextContent({})).toBe("");
  });

  it("handles empty text field", () => {
    expect(extractTextContent({ text: "" })).toBe("");
  });

  it("handles numeric text field", () => {
    expect(extractTextContent({ text: 42 })).toBe("42");
  });
});

describe("textContent", () => {
  it("creates properly typed text content", () => {
    const content = textContent("hello");
    expect(content).toEqual({ text: "hello" });
    expect(TextContentSchema.parse(content)).toEqual({ text: "hello" });
  });
});

describe("parseTextContent", () => {
  it("validates correct content", () => {
    expect(parseTextContent({ text: "hello" })).toEqual({ text: "hello" });
  });

  it("rejects raw string", () => {
    expect(parseTextContent("hello")).toBeNull();
  });

  it("rejects missing text field", () => {
    expect(parseTextContent({ foo: "bar" })).toBeNull();
  });

  it("rejects null", () => {
    expect(parseTextContent(null)).toBeNull();
  });
});
