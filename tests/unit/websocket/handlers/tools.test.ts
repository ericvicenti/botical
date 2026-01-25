import { describe, it, expect, beforeEach, afterEach, mock, spyOn } from "bun:test";
import {
  ToolHandlers,
  registerPendingApproval,
  removePendingApproval,
} from "@/websocket/handlers/tools.ts";
import { DatabaseManager } from "@/database/manager.ts";
import { EventBus } from "@/bus/index.ts";
import type { WSData } from "@/websocket/connections.ts";

describe("ToolHandlers", () => {
  const mockCtx: WSData = {
    userId: "usr_test",
    projectId: "prj_test",
    connectionId: "conn_test",
  };

  let mockDb: { prepare: ReturnType<typeof mock> };
  let getProjectDbSpy: ReturnType<typeof spyOn>;
  let publishSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    mockDb = {
      prepare: mock(() => ({
        run: mock(() => ({ changes: 1 })),
        get: mock(() => null),
        all: mock(() => []),
      })),
    };
    getProjectDbSpy = spyOn(DatabaseManager, "getProjectDb").mockReturnValue(mockDb as any);
    publishSpy = spyOn(EventBus, "publish").mockImplementation(() => ({
      id: "evt_test",
      timestamp: Date.now(),
      event: { type: "session.created", payload: { agent: "default", sessionId: "sess_test", title: "Test" } },
    }));
  });

  afterEach(() => {
    getProjectDbSpy.mockRestore();
    publishSpy.mockRestore();
  });

  describe("registerPendingApproval", () => {
    it("registers a pending approval that can be resolved", async () => {
      const resolve = mock();
      registerPendingApproval("tool_123", "sess_123", resolve);

      // Verify by approving it
      mockDb.prepare = mock((sql: string) => {
        if (sql.includes("SELECT")) {
          return {
            get: mock(() => ({
              id: "part_1",
              message_id: "msg_1",
              session_id: "sess_123",
              type: "tool_call",
              content: JSON.stringify({ name: "test", arguments: {} }),
            })),
          };
        }
        if (sql.includes("UPDATE")) {
          return { run: mock(() => ({ changes: 1 })) };
        }
        return { run: mock(), get: mock() };
      });

      // Should resolve the pending approval
      const result = await ToolHandlers.approve(
        { sessionId: "sess_123", toolCallId: "tool_123" },
        mockCtx
      );

      expect(result).toEqual({ approved: true });
      expect(resolve).toHaveBeenCalledWith(true);
    });
  });

  describe("removePendingApproval", () => {
    it("removes a pending approval", async () => {
      const resolve = mock();
      registerPendingApproval("tool_to_remove", "sess_123", resolve);
      removePendingApproval("tool_to_remove");

      // Now trying to approve should fail
      await expect(
        ToolHandlers.approve(
          { sessionId: "sess_123", toolCallId: "tool_to_remove" },
          mockCtx
        )
      ).rejects.toThrow("No pending approval found");
    });
  });

  describe("approve", () => {
    it("approves a pending tool call", async () => {
      const resolve = mock();
      registerPendingApproval("tool_approve", "sess_123", resolve);

      mockDb.prepare = mock((sql: string) => {
        if (sql.includes("SELECT")) {
          return {
            get: mock(() => ({
              id: "part_1",
              message_id: "msg_1",
              session_id: "sess_123",
              type: "tool_call",
              content: JSON.stringify({ name: "test", arguments: {} }),
            })),
          };
        }
        if (sql.includes("UPDATE")) {
          return { run: mock(() => ({ changes: 1 })) };
        }
        return { run: mock(), get: mock() };
      });

      const result = await ToolHandlers.approve(
        { sessionId: "sess_123", toolCallId: "tool_approve" },
        mockCtx
      );

      expect(result).toEqual({ approved: true });
      expect(resolve).toHaveBeenCalledWith(true);
      expect(publishSpy).toHaveBeenCalled();
    });

    it("throws when no pending approval exists", async () => {
      await expect(
        ToolHandlers.approve(
          { sessionId: "sess_123", toolCallId: "nonexistent" },
          mockCtx
        )
      ).rejects.toThrow("No pending approval found");
    });

    it("validates payload schema", async () => {
      await expect(ToolHandlers.approve({}, mockCtx)).rejects.toThrow();
      await expect(
        ToolHandlers.approve({ sessionId: "sess_123" }, mockCtx)
      ).rejects.toThrow();
    });
  });

  describe("reject", () => {
    it("rejects a pending tool call", async () => {
      const resolve = mock();
      registerPendingApproval("tool_reject", "sess_123", resolve);

      mockDb.prepare = mock((sql: string) => {
        if (sql.includes("SELECT")) {
          return {
            get: mock(() => ({
              id: "part_1",
              message_id: "msg_1",
              session_id: "sess_123",
              type: "tool_call",
              content: JSON.stringify({ name: "test", arguments: {} }),
            })),
          };
        }
        if (sql.includes("UPDATE")) {
          return { run: mock(() => ({ changes: 1 })) };
        }
        return { run: mock(), get: mock() };
      });

      const result = await ToolHandlers.reject(
        { sessionId: "sess_123", toolCallId: "tool_reject", reason: "Not safe" },
        mockCtx
      );

      expect(result).toEqual({ rejected: true });
      expect(resolve).toHaveBeenCalledWith(false, "Not safe");
      expect(publishSpy).toHaveBeenCalled();
    });

    it("rejects without reason", async () => {
      const resolve = mock();
      registerPendingApproval("tool_reject2", "sess_123", resolve);

      mockDb.prepare = mock((sql: string) => {
        if (sql.includes("SELECT")) {
          return {
            get: mock(() => ({
              id: "part_1",
              message_id: "msg_1",
              session_id: "sess_123",
              type: "tool_call",
              content: JSON.stringify({ name: "test", arguments: {} }),
            })),
          };
        }
        if (sql.includes("UPDATE")) {
          return { run: mock(() => ({ changes: 1 })) };
        }
        return { run: mock(), get: mock() };
      });

      const result = await ToolHandlers.reject(
        { sessionId: "sess_123", toolCallId: "tool_reject2" },
        mockCtx
      );

      expect(result).toEqual({ rejected: true });
      expect(resolve).toHaveBeenCalledWith(false, undefined);
    });

    it("throws when no pending approval exists", async () => {
      await expect(
        ToolHandlers.reject(
          { sessionId: "sess_123", toolCallId: "nonexistent" },
          mockCtx
        )
      ).rejects.toThrow("No pending approval found");
    });

    it("validates payload schema", async () => {
      await expect(ToolHandlers.reject({}, mockCtx)).rejects.toThrow();
    });
  });
});
