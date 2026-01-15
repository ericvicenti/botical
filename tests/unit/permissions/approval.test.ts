/**
 * Approval Workflow Tests
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import {
  requestApproval,
  resolveApproval,
  cancelSessionApprovals,
  cancelApproval,
  getPendingApproval,
  getSessionPendingApprovals,
  hasPendingApprovals,
  PermissionService,
  formatApprovalDescription,
  type ApprovalRequest,
} from "@/permissions/approval.ts";
import { runMigrations } from "@/database/migrations.ts";
import { PROJECT_MIGRATIONS } from "@/database/project-migrations.ts";

describe("Approval Workflow", () => {
  describe("requestApproval", () => {
    it("creates approval request and notifies callback", async () => {
      let notifiedRequest: ApprovalRequest | null = null;

      const approvalPromise = requestApproval(
        {
          sessionId: "session-123",
          messageId: "msg-456",
          toolName: "bash",
          toolCallId: "call-789",
          permission: "tool:bash",
          value: "rm -rf /tmp/test",
          description: "Delete temp files",
          timeout: 100, // Short timeout for testing
        },
        (request) => {
          notifiedRequest = request;
        }
      );

      // Give time for callback
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(notifiedRequest).not.toBeNull();
      expect(notifiedRequest!.sessionId).toBe("session-123");
      expect(notifiedRequest!.toolName).toBe("bash");
      expect(notifiedRequest!.status).toBe("pending");

      // Let it timeout
      const result = await approvalPromise;
      expect(result).toBe(false); // Timed out = denied
    });

    it("can be resolved with approval", async () => {
      let requestId: string = "";

      const approvalPromise = requestApproval(
        {
          sessionId: "session-123",
          messageId: "msg-456",
          toolName: "bash",
          toolCallId: "call-789",
          permission: "tool:bash",
          value: "ls",
          description: "List files",
          timeout: 5000,
        },
        (request) => {
          requestId = request.id;
        }
      );

      // Give time for request to be created
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Approve the request
      const resolved = resolveApproval({
        requestId,
        approved: true,
        scope: "once",
      });

      expect(resolved).toBeDefined();
      expect(resolved?.status).toBe("approved");
      expect(resolved?.decisionScope).toBe("once");

      const result = await approvalPromise;
      expect(result).toBe(true);
    });

    it("can be resolved with denial", async () => {
      let requestId: string = "";

      const approvalPromise = requestApproval(
        {
          sessionId: "session-123",
          messageId: "msg-456",
          toolName: "bash",
          toolCallId: "call-789",
          permission: "tool:bash",
          value: "dangerous",
          description: "Dangerous operation",
          timeout: 5000,
        },
        (request) => {
          requestId = request.id;
        }
      );

      await new Promise((resolve) => setTimeout(resolve, 10));

      resolveApproval({
        requestId,
        approved: false,
        scope: "session",
      });

      const result = await approvalPromise;
      expect(result).toBe(false);
    });
  });

  describe("resolveApproval", () => {
    it("returns null for non-existent request", () => {
      const result = resolveApproval({
        requestId: "nonexistent",
        approved: true,
        scope: "once",
      });
      expect(result).toBeNull();
    });
  });

  describe("cancelSessionApprovals", () => {
    it("cancels all pending approvals for a session", async () => {
      const promises: Promise<boolean>[] = [];

      // Create multiple pending approvals
      for (let i = 0; i < 3; i++) {
        promises.push(
          requestApproval(
            {
              sessionId: "session-to-cancel",
              messageId: `msg-${i}`,
              toolName: "bash",
              toolCallId: `call-${i}`,
              permission: "tool:bash",
              value: `command-${i}`,
              description: `Command ${i}`,
              timeout: 5000,
            },
            () => {}
          )
        );
      }

      await new Promise((resolve) => setTimeout(resolve, 10));

      // Cancel all
      cancelSessionApprovals("session-to-cancel");

      // All should resolve to false
      const results = await Promise.all(promises);
      expect(results.every((r) => r === false)).toBe(true);
    });
  });

  describe("cancelApproval", () => {
    it("cancels a specific approval request", async () => {
      let requestId: string = "";

      const approvalPromise = requestApproval(
        {
          sessionId: "session-123",
          messageId: "msg-456",
          toolName: "bash",
          toolCallId: "call-789",
          permission: "tool:bash",
          value: "ls",
          description: "List files",
          timeout: 5000,
        },
        (request) => {
          requestId = request.id;
        }
      );

      await new Promise((resolve) => setTimeout(resolve, 10));

      const cancelled = cancelApproval(requestId);
      expect(cancelled).toBe(true);

      const result = await approvalPromise;
      expect(result).toBe(false);
    });

    it("returns false for non-existent request", () => {
      const cancelled = cancelApproval("nonexistent");
      expect(cancelled).toBe(false);
    });
  });

  describe("getPendingApproval", () => {
    it("returns pending approval request", async () => {
      let requestId: string = "";

      requestApproval(
        {
          sessionId: "session-123",
          messageId: "msg-456",
          toolName: "bash",
          toolCallId: "call-789",
          permission: "tool:bash",
          value: "ls",
          description: "List files",
          timeout: 5000,
        },
        (request) => {
          requestId = request.id;
        }
      );

      await new Promise((resolve) => setTimeout(resolve, 10));

      const pending = getPendingApproval(requestId);
      expect(pending).toBeDefined();
      expect(pending?.status).toBe("pending");

      // Clean up
      cancelApproval(requestId);
    });

    it("returns null for non-existent request", () => {
      const pending = getPendingApproval("nonexistent");
      expect(pending).toBeNull();
    });
  });

  describe("getSessionPendingApprovals", () => {
    it("returns all pending approvals for a session", async () => {
      const requestIds: string[] = [];

      for (let i = 0; i < 2; i++) {
        requestApproval(
          {
            sessionId: "test-session",
            messageId: `msg-${i}`,
            toolName: "bash",
            toolCallId: `call-${i}`,
            permission: "tool:bash",
            value: `cmd-${i}`,
            description: `Cmd ${i}`,
            timeout: 5000,
          },
          (request) => {
            requestIds.push(request.id);
          }
        );
      }

      await new Promise((resolve) => setTimeout(resolve, 10));

      const pending = getSessionPendingApprovals("test-session");
      expect(pending.length).toBe(2);

      // Clean up
      cancelSessionApprovals("test-session");
    });

    it("returns empty array for session with no approvals", () => {
      const pending = getSessionPendingApprovals("no-such-session");
      expect(pending).toEqual([]);
    });
  });

  describe("hasPendingApprovals", () => {
    it("returns true when session has pending approvals", async () => {
      let requestId: string = "";

      requestApproval(
        {
          sessionId: "has-pending",
          messageId: "msg-1",
          toolName: "bash",
          toolCallId: "call-1",
          permission: "tool:bash",
          value: "ls",
          description: "List",
          timeout: 5000,
        },
        (request) => {
          requestId = request.id;
        }
      );

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(hasPendingApprovals("has-pending")).toBe(true);

      cancelApproval(requestId);
    });

    it("returns false when session has no pending approvals", () => {
      expect(hasPendingApprovals("no-pending")).toBe(false);
    });
  });

  describe("formatApprovalDescription", () => {
    it("formats bash command description", () => {
      const desc = formatApprovalDescription("bash", { command: "rm -rf /tmp" });
      expect(desc).toContain("Execute command");
      expect(desc).toContain("rm -rf /tmp");
    });

    it("formats write operation description", () => {
      const desc = formatApprovalDescription("write", {
        file_path: "/etc/config.txt",
      });
      expect(desc).toContain("Write file");
      expect(desc).toContain("/etc/config.txt");
    });

    it("formats edit operation description", () => {
      const desc = formatApprovalDescription("edit", {
        file_path: "/src/index.ts",
      });
      expect(desc).toContain("Edit file");
      expect(desc).toContain("/src/index.ts");
    });

    it("formats read operation description", () => {
      const desc = formatApprovalDescription("read", {
        file_path: "/var/log/syslog",
      });
      expect(desc).toContain("Read file");
      expect(desc).toContain("/var/log/syslog");
    });

    it("formats unknown tool description", () => {
      const desc = formatApprovalDescription("custom-tool", {
        arg1: "value1",
        arg2: 123,
      });
      expect(desc).toContain("custom-tool");
      expect(desc).toContain("value1");
    });
  });
});

describe("Permission Service", () => {
  let db: Database;

  beforeEach(() => {
    db = new Database(":memory:");
    runMigrations(db, PROJECT_MIGRATIONS);
    // Create a session for permissions
    db.prepare(
      `INSERT INTO sessions (id, slug, title, status, agent, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run("session-123", "test", "Test Session", "active", "default", Date.now(), Date.now());
  });

  afterEach(() => {
    db.close();
  });

  describe("store", () => {
    it("stores a permission decision", () => {
      PermissionService.store(db, {
        sessionId: "session-123",
        permission: "tool:bash",
        pattern: "*sudo*",
        action: "allow",
        scope: "session",
      });

      const permissions = PermissionService.getForSession(db, "session-123");
      expect(permissions.length).toBe(1);
      expect(permissions[0]?.permission).toBe("tool:bash");
      expect(permissions[0]?.pattern).toBe("*sudo*");
      expect(permissions[0]?.action).toBe("allow");
    });
  });

  describe("getForSession", () => {
    it("returns session and global permissions", () => {
      PermissionService.store(db, {
        sessionId: "session-123",
        permission: "tool:bash",
        pattern: "*",
        action: "allow",
        scope: "session",
      });

      PermissionService.store(db, {
        sessionId: "session-123",
        permission: "tool:write",
        pattern: "/tmp/*",
        action: "allow",
        scope: "global",
      });

      const permissions = PermissionService.getForSession(db, "session-123");
      expect(permissions.length).toBe(2);
    });

    it("returns permissions sorted by creation date descending", async () => {
      PermissionService.store(db, {
        sessionId: "session-123",
        permission: "first",
        pattern: "*",
        action: "allow",
        scope: "session",
      });

      // Add a small delay to ensure different timestamps
      await new Promise((resolve) => setTimeout(resolve, 10));

      PermissionService.store(db, {
        sessionId: "session-123",
        permission: "second",
        pattern: "*",
        action: "allow",
        scope: "session",
      });

      const permissions = PermissionService.getForSession(db, "session-123");
      expect(permissions[0]?.permission).toBe("second");
    });
  });

  describe("delete", () => {
    it("deletes a specific permission", () => {
      PermissionService.store(db, {
        sessionId: "session-123",
        permission: "tool:bash",
        pattern: "*",
        action: "allow",
        scope: "session",
      });

      const permissions = PermissionService.getForSession(db, "session-123");
      expect(permissions.length).toBe(1);

      PermissionService.delete(db, permissions[0]!.id);

      const afterDelete = PermissionService.getForSession(db, "session-123");
      expect(afterDelete.length).toBe(0);
    });
  });

  describe("clearSession", () => {
    it("clears all session-scoped permissions", () => {
      PermissionService.store(db, {
        sessionId: "session-123",
        permission: "tool:bash",
        pattern: "*",
        action: "allow",
        scope: "session",
      });

      PermissionService.store(db, {
        sessionId: "session-123",
        permission: "tool:write",
        pattern: "*",
        action: "allow",
        scope: "global",
      });

      PermissionService.clearSession(db, "session-123");

      const permissions = PermissionService.getForSession(db, "session-123");
      // Only global permission should remain
      expect(permissions.length).toBe(1);
      expect(permissions[0]?.scope).toBe("global");
    });
  });
});
