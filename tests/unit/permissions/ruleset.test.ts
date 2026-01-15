/**
 * Permission Ruleset Tests
 */

import { describe, it, expect } from "bun:test";
import {
  matchPattern,
  checkPermission,
  createDefaultRuleset,
  mergeRulesets,
  PermissionTypes,
  buildToolPermissionRequest,
  buildPathPermissionRequest,
  type PermissionRuleset,
  type PermissionRule,
} from "@/permissions/ruleset.ts";

describe("Permission Ruleset", () => {
  describe("matchPattern", () => {
    describe("exact matching", () => {
      it("matches exact strings", () => {
        expect(matchPattern("foo", "foo")).toBe(true);
        expect(matchPattern("foo", "bar")).toBe(false);
        expect(matchPattern("foo/bar", "foo/bar")).toBe(true);
      });
    });

    describe("* wildcard (single path segment)", () => {
      it("matches any characters except /", () => {
        expect(matchPattern("*.txt", "file.txt")).toBe(true);
        expect(matchPattern("*.txt", "document.txt")).toBe(true);
        expect(matchPattern("*.txt", "file.pdf")).toBe(false);
      });

      it("does not match across path segments", () => {
        expect(matchPattern("src/*.ts", "src/file.ts")).toBe(true);
        expect(matchPattern("src/*.ts", "src/nested/file.ts")).toBe(false);
      });

      it("works at the beginning", () => {
        expect(matchPattern("*/file.ts", "src/file.ts")).toBe(true);
        expect(matchPattern("*/file.ts", "lib/file.ts")).toBe(true);
      });

      it("works in the middle", () => {
        expect(matchPattern("src/*/index.ts", "src/components/index.ts")).toBe(
          true
        );
        expect(matchPattern("src/*/index.ts", "src/utils/index.ts")).toBe(true);
        expect(
          matchPattern("src/*/index.ts", "src/a/b/index.ts")
        ).toBe(false);
      });
    });

    describe("** wildcard (any path segments)", () => {
      it("matches any sequence including /", () => {
        // ** matches zero or more characters including /
        expect(matchPattern("src/**.ts", "src/file.ts")).toBe(true);
        expect(matchPattern("src/**.ts", "src/a/file.ts")).toBe(true);
        expect(matchPattern("src/**.ts", "src/a/b/c/file.ts")).toBe(true);
      });

      it("matches nested paths with content", () => {
        // When ** is between slashes, it matches one or more path segments
        expect(matchPattern("src/**/file.ts", "src/a/file.ts")).toBe(true);
        expect(matchPattern("src/**/file.ts", "src/a/b/file.ts")).toBe(true);
        // For zero segments, use pattern without the extra /
        expect(matchPattern("src/**file.ts", "src/file.ts")).toBe(true);
      });

      it("matches at the end", () => {
        expect(matchPattern("/etc/**", "/etc/passwd")).toBe(true);
        expect(matchPattern("/etc/**", "/etc/ssh/config")).toBe(true);
        expect(matchPattern("/etc/**", "/var/log")).toBe(false);
      });

      it("matches any string", () => {
        expect(matchPattern("**", "anything")).toBe(true);
        expect(matchPattern("**", "a/b/c/d")).toBe(true);
        expect(matchPattern("**", "")).toBe(true);
      });
    });

    describe("? wildcard (single character)", () => {
      it("matches any single character", () => {
        expect(matchPattern("file?.txt", "file1.txt")).toBe(true);
        expect(matchPattern("file?.txt", "file2.txt")).toBe(true);
        expect(matchPattern("file?.txt", "file12.txt")).toBe(false);
      });
    });

    describe("special characters", () => {
      it("escapes regex special characters", () => {
        expect(matchPattern("file.txt", "file.txt")).toBe(true);
        expect(matchPattern("file.txt", "fileXtxt")).toBe(false);
        expect(matchPattern("test[1]", "test[1]")).toBe(true);
        expect(matchPattern("foo+bar", "foo+bar")).toBe(true);
      });
    });

    describe("command patterns", () => {
      it("matches command patterns using ** for any characters", () => {
        // For commands with paths, use ** to match across /
        expect(matchPattern("**rm -rf **", "rm -rf /")).toBe(true);
        expect(matchPattern("**rm -rf **", "sudo rm -rf /tmp")).toBe(true);
        expect(matchPattern("**sudo**", "sudo apt install")).toBe(true);
        expect(matchPattern("**sudo**", "run without sudo please")).toBe(true);
      });

      it("matches simple command patterns with *", () => {
        // * matches any characters except /
        expect(matchPattern("*rm*", "rm")).toBe(true);
        expect(matchPattern("*rm*", "rm -f")).toBe(true);
        expect(matchPattern("*rm*", "confirm")).toBe(true);
        expect(matchPattern("ls *", "ls -la")).toBe(true);
        // Doesn't match across /
        expect(matchPattern("*rm*", "dir/rm")).toBe(false);
      });
    });
  });

  describe("checkPermission", () => {
    it("matches first matching rule", () => {
      const ruleset: PermissionRuleset = {
        rules: [
          {
            permission: "tool:bash",
            pattern: "**rm**", // Use ** to match across /
            action: "deny",
            scope: "global",
          },
          {
            permission: "tool:bash",
            pattern: "**",
            action: "allow",
            scope: "global",
          },
        ],
        defaultAction: "ask",
      };

      const result = checkPermission(ruleset, {
        permission: "tool:bash",
        value: "rm -rf /tmp/test",
      });

      expect(result.action).toBe("deny");
      expect(result.isDefault).toBe(false);
    });

    it("uses default when no rules match", () => {
      const ruleset: PermissionRuleset = {
        rules: [
          {
            permission: "tool:bash",
            pattern: "*rm*",
            action: "deny",
            scope: "global",
          },
        ],
        defaultAction: "ask",
      };

      const result = checkPermission(ruleset, {
        permission: "tool:read",
        value: "/some/file",
      });

      expect(result.action).toBe("ask");
      expect(result.isDefault).toBe(true);
    });

    it("respects session scope", () => {
      const ruleset: PermissionRuleset = {
        rules: [
          {
            permission: "tool:bash",
            pattern: "*",
            action: "allow",
            scope: "session",
            sessionId: "session-123",
          },
        ],
        defaultAction: "deny",
      };

      // Should match with correct session
      const match = checkPermission(ruleset, {
        permission: "tool:bash",
        value: "ls",
        sessionId: "session-123",
      });
      expect(match.action).toBe("allow");

      // Should not match with different session
      const noMatch = checkPermission(ruleset, {
        permission: "tool:bash",
        value: "ls",
        sessionId: "session-456",
      });
      expect(noMatch.action).toBe("deny");
      expect(noMatch.isDefault).toBe(true);
    });

    it("respects rule expiration", () => {
      const expiredRule: PermissionRule = {
        permission: "tool:bash",
        pattern: "*",
        action: "allow",
        scope: "session",
        sessionId: "session-123",
        expiresAt: Date.now() - 1000, // Expired 1 second ago
      };

      const ruleset: PermissionRuleset = {
        rules: [expiredRule],
        defaultAction: "deny",
      };

      const result = checkPermission(ruleset, {
        permission: "tool:bash",
        value: "ls",
        sessionId: "session-123",
      });

      // Should fall through to default because rule is expired
      expect(result.action).toBe("deny");
      expect(result.isDefault).toBe(true);
    });

    it("returns matched rule", () => {
      const rule: PermissionRule = {
        id: "rule-1",
        permission: "tool:bash",
        pattern: "*",
        action: "allow",
        scope: "global",
      };

      const ruleset: PermissionRuleset = {
        rules: [rule],
        defaultAction: "deny",
      };

      const result = checkPermission(ruleset, {
        permission: "tool:bash",
        value: "ls",
      });

      expect(result.matchedRule).toBeDefined();
      expect(result.matchedRule?.id).toBe("rule-1");
    });
  });

  describe("createDefaultRuleset", () => {
    it("creates a ruleset with sensible defaults", () => {
      const ruleset = createDefaultRuleset();

      expect(ruleset.rules.length).toBeGreaterThan(0);
      expect(ruleset.defaultAction).toBe("ask");
    });

    it("denies dangerous commands", () => {
      const ruleset = createDefaultRuleset();

      const rmResult = checkPermission(ruleset, {
        permission: "tool:bash",
        value: "rm -rf /",
      });

      expect(rmResult.action).toBe("deny");
    });

    it("asks for sudo commands", () => {
      const ruleset = createDefaultRuleset();

      const sudoResult = checkPermission(ruleset, {
        permission: "tool:bash",
        value: "sudo apt install something",
      });

      expect(sudoResult.action).toBe("ask");
    });

    it("allows safe tools by default", () => {
      const ruleset = createDefaultRuleset();

      const readResult = checkPermission(ruleset, {
        permission: "tool:read",
        value: "/some/file.txt",
      });

      expect(readResult.action).toBe("allow");
    });
  });

  describe("mergeRulesets", () => {
    it("returns default ruleset when empty", () => {
      const merged = mergeRulesets();
      expect(merged.rules.length).toBeGreaterThan(0);
    });

    it("merges rules from multiple rulesets", () => {
      const ruleset1: PermissionRuleset = {
        rules: [
          {
            permission: "tool:bash",
            pattern: "rule1",
            action: "allow",
            scope: "global",
          },
        ],
        defaultAction: "deny",
      };

      const ruleset2: PermissionRuleset = {
        rules: [
          {
            permission: "tool:bash",
            pattern: "rule2",
            action: "deny",
            scope: "global",
          },
        ],
        defaultAction: "ask",
      };

      const merged = mergeRulesets(ruleset1, ruleset2);

      expect(merged.rules.length).toBe(2);
      expect(merged.defaultAction).toBe("ask"); // Uses last ruleset's default
    });
  });

  describe("PermissionTypes", () => {
    it("generates correct tool permission keys", () => {
      expect(PermissionTypes.tool("bash")).toBe("tool:bash");
      expect(PermissionTypes.tool("read")).toBe("tool:read");
    });

    it("generates correct path permission keys", () => {
      expect(PermissionTypes.path("read")).toBe("path:read");
      expect(PermissionTypes.path("write")).toBe("path:write");
      expect(PermissionTypes.path("execute")).toBe("path:execute");
    });

    it("has correct command permission key", () => {
      expect(PermissionTypes.command).toBe("command:bash");
    });

    it("generates correct network permission keys", () => {
      expect(PermissionTypes.network("fetch")).toBe("network:fetch");
      expect(PermissionTypes.network("connect")).toBe("network:connect");
    });
  });

  describe("buildToolPermissionRequest", () => {
    it("builds request for tool permission check", () => {
      const request = buildToolPermissionRequest(
        "bash",
        { command: "ls -la" },
        "session-123"
      );

      expect(request.permission).toBe("tool:bash");
      expect(request.value).toContain("ls -la");
      expect(request.sessionId).toBe("session-123");
    });

    it("works without session ID", () => {
      const request = buildToolPermissionRequest("read", { path: "/etc/passwd" });

      expect(request.permission).toBe("tool:read");
      expect(request.sessionId).toBeUndefined();
    });
  });

  describe("buildPathPermissionRequest", () => {
    it("builds request for path permission check", () => {
      const request = buildPathPermissionRequest(
        "write",
        "/etc/passwd",
        "session-123"
      );

      expect(request.permission).toBe("path:write");
      expect(request.value).toBe("/etc/passwd");
      expect(request.sessionId).toBe("session-123");
    });
  });
});
