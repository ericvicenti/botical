import { describe, it, expect } from "bun:test";
import {
  generateId,
  isValidId,
  parseId,
  getTimestampFromId,
  IdPrefixes,
} from "@/utils/id.ts";

describe("generateId", () => {
  it("generates IDs with correct prefix", () => {
    const id = generateId("session");
    expect(id).toMatch(/^session_[a-z0-9]+-[a-z0-9]+$/);
  });

  it("generates unique IDs", () => {
    const ids = new Set(Array.from({ length: 1000 }, () => generateId("test")));
    expect(ids.size).toBe(1000);
  });

  it("generates IDs with different prefixes", () => {
    const userId = generateId("usr");
    const projectId = generateId("prj");
    const sessionId = generateId("sess");

    expect(userId).toMatch(/^usr_/);
    expect(projectId).toMatch(/^prj_/);
    expect(sessionId).toMatch(/^sess_/);
  });

  it("generates ascending IDs by default", async () => {
    const id1 = generateId("msg");
    await new Promise((r) => setTimeout(r, 5));
    const id2 = generateId("msg");

    // Later ID should sort after earlier ID (ascending)
    expect(id2 > id1).toBe(true);
  });

  it("generates descending IDs when specified", async () => {
    const id1 = generateId("session", { descending: true });
    await new Promise((r) => setTimeout(r, 5));
    const id2 = generateId("session", { descending: true });

    // Earlier ID should sort after later ID (descending)
    expect(id1 > id2).toBe(true);
  });
});

describe("isValidId", () => {
  it("validates correct IDs", () => {
    expect(isValidId("session_abc123def-12345678", "session")).toBe(true);
    expect(isValidId("usr_xyz789abc-87654321", "usr")).toBe(true);
  });

  it("rejects invalid IDs", () => {
    expect(isValidId("invalid", "session")).toBe(false);
    expect(isValidId("session_", "session")).toBe(false);
    expect(isValidId("usr_abc123", "session")).toBe(false);
    expect(isValidId("", "session")).toBe(false);
  });

  it("rejects null and undefined", () => {
    expect(isValidId(null as unknown as string, "session")).toBe(false);
    expect(isValidId(undefined as unknown as string, "session")).toBe(false);
  });

  it("validates generated IDs", () => {
    const id = generateId("test");
    expect(isValidId(id, "test")).toBe(true);
  });
});

describe("parseId", () => {
  it("parses valid IDs", () => {
    const id = "session_abc123-def45678";
    const parsed = parseId(id);

    expect(parsed).not.toBeNull();
    expect(parsed?.prefix).toBe("session");
    expect(parsed?.timestamp).toBe("abc123");
    expect(parsed?.random).toBe("def45678");
  });

  it("returns null for invalid IDs", () => {
    expect(parseId("invalid")).toBeNull();
    expect(parseId("no_separator")).toBeNull();
    expect(parseId("")).toBeNull();
  });

  it("parses generated IDs correctly", () => {
    const id = generateId("test");
    const parsed = parseId(id);

    expect(parsed).not.toBeNull();
    expect(parsed?.prefix).toBe("test");
    expect(parsed?.timestamp).toBeDefined();
    expect(parsed?.random).toBeDefined();
  });
});

describe("getTimestampFromId", () => {
  it("extracts timestamp from ascending IDs", () => {
    const before = Date.now();
    const id = generateId("msg");
    const after = Date.now();

    const timestamp = getTimestampFromId(id);

    expect(timestamp).not.toBeNull();
    expect(timestamp!).toBeGreaterThanOrEqual(before);
    expect(timestamp!).toBeLessThanOrEqual(after);
  });

  it("returns null for invalid IDs", () => {
    expect(getTimestampFromId("invalid")).toBeNull();
    expect(getTimestampFromId("")).toBeNull();
  });
});

describe("IdPrefixes", () => {
  it("has all expected prefixes", () => {
    expect(IdPrefixes.user).toBe("usr");
    expect(IdPrefixes.project).toBe("prj");
    expect(IdPrefixes.session).toBe("sess");
    expect(IdPrefixes.message).toBe("msg");
    expect(IdPrefixes.part).toBe("part");
    expect(IdPrefixes.agent).toBe("agt");
    expect(IdPrefixes.tool).toBe("tool");
    expect(IdPrefixes.file).toBe("file");
    expect(IdPrefixes.version).toBe("ver");
    expect(IdPrefixes.snapshot).toBe("snap");
    expect(IdPrefixes.apiKey).toBe("key");
    expect(IdPrefixes.permission).toBe("perm");
  });
});
