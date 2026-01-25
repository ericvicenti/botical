import { describe, it, expect, beforeEach, afterEach, mock, spyOn } from "bun:test";
import { StateSync } from "@/websocket/sync.ts";
import { DatabaseManager } from "@/database/manager.ts";
import { ConnectionManager } from "@/websocket/connections.ts";

describe("StateSync", () => {
  let mockDb: { prepare: ReturnType<typeof mock> };
  let getProjectDbSpy: ReturnType<typeof spyOn>;

  const mockSession = {
    id: "sess_test",
    title: "Test Session",
    agent: "default",
    status: "active",
    parent_id: null,
    provider_id: null,
    model_id: null,
    token_count: 100,
    message_count: 5,
    created_at: Date.now(),
    updated_at: Date.now(),
  };

  const mockMessage = {
    id: "msg_1",
    session_id: "sess_test",
    role: "user",
    created_at: Date.now(),
  };

  const mockPart = {
    id: "part_1",
    message_id: "msg_1",
    session_id: "sess_test",
    type: "text",
    content: JSON.stringify({ text: "Hello" }),
    tool_call_id: null,
    tool_status: null,
    created_at: Date.now(),
    updated_at: Date.now(),
  };

  beforeEach(() => {
    mockDb = {
      prepare: mock(() => ({
        run: mock(() => ({ changes: 1 })),
        get: mock(() => null),
        all: mock(() => []),
      })),
    };
    getProjectDbSpy = spyOn(DatabaseManager, "getProjectDb").mockReturnValue(mockDb as any);
    ConnectionManager.clear();
  });

  afterEach(() => {
    getProjectDbSpy.mockRestore();
  });

  describe("getSessionState", () => {
    it("returns session with all messages and parts", () => {
      mockDb.prepare = mock((sql: string) => {
        if (sql.includes("sessions") && sql.includes("SELECT")) {
          return { get: mock(() => mockSession) };
        }
        if (sql.includes("messages") && sql.includes("SELECT")) {
          return { all: mock(() => [mockMessage, { ...mockMessage, id: "msg_2" }]) };
        }
        if (sql.includes("message_parts") && sql.includes("SELECT")) {
          return { all: mock(() => [mockPart]) };
        }
        return { get: mock(), all: mock(() => []) };
      });

      const state = StateSync.getSessionState("prj_test", "sess_test");

      expect(state.session).toBeDefined();
      expect(state.session.id).toBe("sess_test");
      expect(state.messages).toHaveLength(2);
      expect(state.messages[0]).toHaveProperty("parts");
    });

    it("filters messages after specified messageId", () => {
      const msg1 = { ...mockMessage, id: "msg_1" };
      const msg2 = { ...mockMessage, id: "msg_2" };
      const msg3 = { ...mockMessage, id: "msg_3" };

      mockDb.prepare = mock((sql: string) => {
        if (sql.includes("sessions") && sql.includes("SELECT")) {
          return { get: mock(() => mockSession) };
        }
        if (sql.includes("messages") && sql.includes("SELECT")) {
          return { all: mock(() => [msg1, msg2, msg3]) };
        }
        if (sql.includes("message_parts") && sql.includes("SELECT")) {
          return { all: mock(() => []) };
        }
        return { get: mock(), all: mock(() => []) };
      });

      const state = StateSync.getSessionState("prj_test", "sess_test", "msg_1");

      // Should only include messages after msg_1
      expect(state.messages).toHaveLength(2);
      expect(state.messages[0]!.id).toBe("msg_2");
      expect(state.messages[1]!.id).toBe("msg_3");
    });

    it("returns all messages when afterMessageId not found", () => {
      mockDb.prepare = mock((sql: string) => {
        if (sql.includes("sessions") && sql.includes("SELECT")) {
          return { get: mock(() => mockSession) };
        }
        if (sql.includes("messages") && sql.includes("SELECT")) {
          return { all: mock(() => [mockMessage]) };
        }
        if (sql.includes("message_parts") && sql.includes("SELECT")) {
          return { all: mock(() => []) };
        }
        return { get: mock(), all: mock(() => []) };
      });

      const state = StateSync.getSessionState(
        "prj_test",
        "sess_test",
        "nonexistent_msg"
      );

      // Should return all messages if afterMessageId not found
      expect(state.messages).toHaveLength(1);
    });

    it("throws for non-existent session", () => {
      mockDb.prepare = mock(() => ({
        get: mock(() => null),
      }));

      expect(() =>
        StateSync.getSessionState("prj_test", "nonexistent")
      ).toThrow();
    });
  });

  describe("syncClient", () => {
    it("sends sync event to connected client", () => {
      const mockWs = {
        send: mock(),
        close: mock(),
        readyState: 1,
      };

      ConnectionManager.add("conn_test", {
        ws: mockWs,
        userId: "usr_test",
        projectId: "prj_test",
        connectedAt: Date.now(),
        lastActivity: Date.now(),
      });

      mockDb.prepare = mock((sql: string) => {
        if (sql.includes("sessions") && sql.includes("SELECT")) {
          return { get: mock(() => mockSession) };
        }
        if (sql.includes("messages") && sql.includes("SELECT")) {
          return { all: mock(() => []) };
        }
        return { get: mock(), all: mock(() => []) };
      });

      StateSync.syncClient("conn_test", "prj_test", "sess_test");

      expect(mockWs.send).toHaveBeenCalledWith(
        expect.stringContaining('"type":"session.sync"')
      );
    });

    it("does nothing for non-existent connection", () => {
      mockDb.prepare = mock(() => ({
        get: mock(() => mockSession),
        all: mock(() => []),
      }));

      // Should not throw
      StateSync.syncClient("nonexistent", "prj_test", "sess_test");
    });

    it("handles errors gracefully", () => {
      const mockWs = {
        send: mock(),
        close: mock(),
        readyState: 1,
      };

      ConnectionManager.add("conn_test", {
        ws: mockWs,
        userId: "usr_test",
        projectId: "prj_test",
        connectedAt: Date.now(),
        lastActivity: Date.now(),
      });

      // Make getSessionState throw
      mockDb.prepare = mock(() => ({
        get: mock(() => null),
      }));

      // Should not throw, just log error
      StateSync.syncClient("conn_test", "prj_test", "nonexistent");
      expect(mockWs.send).not.toHaveBeenCalled();
    });

    it("includes lastKnownMessageId in sync", () => {
      const mockWs = {
        send: mock(),
        close: mock(),
        readyState: 1,
      };

      ConnectionManager.add("conn_test", {
        ws: mockWs,
        userId: "usr_test",
        projectId: "prj_test",
        connectedAt: Date.now(),
        lastActivity: Date.now(),
      });

      const msg1 = { ...mockMessage, id: "msg_1" };
      const msg2 = { ...mockMessage, id: "msg_2" };

      mockDb.prepare = mock((sql: string) => {
        if (sql.includes("sessions") && sql.includes("SELECT")) {
          return { get: mock(() => mockSession) };
        }
        if (sql.includes("messages") && sql.includes("SELECT")) {
          return { all: mock(() => [msg1, msg2]) };
        }
        if (sql.includes("message_parts") && sql.includes("SELECT")) {
          return { all: mock(() => []) };
        }
        return { get: mock(), all: mock(() => []) };
      });

      StateSync.syncClient("conn_test", "prj_test", "sess_test", "msg_1");

      expect(mockWs.send).toHaveBeenCalled();
    });
  });

  describe("getActiveSessions", () => {
    it("returns active sessions for project", () => {
      mockDb.prepare = mock(() => ({
        all: mock(() => [mockSession, { ...mockSession, id: "sess_2" }]),
      }));

      const sessions = StateSync.getActiveSessions("prj_test");

      expect(sessions).toHaveLength(2);
      expect(getProjectDbSpy).toHaveBeenCalledWith("prj_test");
    });

    it("returns empty array when no sessions", () => {
      mockDb.prepare = mock(() => ({
        all: mock(() => []),
      }));

      const sessions = StateSync.getActiveSessions("prj_test");

      expect(sessions).toEqual([]);
    });
  });

  describe("getSessionsSummary", () => {
    it("returns sessions with options", () => {
      mockDb.prepare = mock(() => ({
        all: mock(() => [mockSession]),
      }));

      const sessions = StateSync.getSessionsSummary("prj_test", {
        status: "active",
        limit: 10,
      });

      expect(sessions).toHaveLength(1);
    });

    it("returns sessions with default options", () => {
      mockDb.prepare = mock(() => ({
        all: mock(() => [mockSession]),
      }));

      const sessions = StateSync.getSessionsSummary("prj_test");

      expect(sessions).toHaveLength(1);
    });

    it("filters by status", () => {
      mockDb.prepare = mock(() => ({
        all: mock(() => [{ ...mockSession, status: "archived" }]),
      }));

      const sessions = StateSync.getSessionsSummary("prj_test", {
        status: "archived",
      });

      expect(sessions).toHaveLength(1);
    });
  });
});
