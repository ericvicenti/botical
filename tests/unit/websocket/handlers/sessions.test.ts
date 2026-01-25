import { describe, it, expect, beforeEach, afterEach, mock, spyOn } from "bun:test";
import { SessionHandlers } from "@/websocket/handlers/sessions.ts";
import { DatabaseManager } from "@/database/manager.ts";
import type { WSData } from "@/websocket/connections.ts";
import type { Session } from "@/services/sessions.ts";

// Mock session for tests
const mockSession: Session = {
  id: "sess_test123",
  slug: "test-session",
  title: "Test Session",
  agent: "default",
  status: "active",
  parentId: null,
  providerId: null,
  modelId: null,
  messageCount: 0,
  totalCost: 0,
  totalTokensInput: 0,
  totalTokensOutput: 0,
  shareUrl: null,
  shareSecret: null,
  createdAt: Date.now(),
  updatedAt: Date.now(),
  archivedAt: null,
};

describe("SessionHandlers", () => {
  const mockCtx: WSData = {
    userId: "usr_test",
    projectId: "prj_test",
    connectionId: "conn_test",
  };

  let mockDb: { prepare: ReturnType<typeof mock> };
  let getProjectDbSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    // Create mock database
    mockDb = {
      prepare: mock(() => ({
        run: mock(() => ({ changes: 1 })),
        get: mock(() => null),
        all: mock(() => []),
      })),
    };
    getProjectDbSpy = spyOn(DatabaseManager, "getProjectDb").mockReturnValue(mockDb as any);
  });

  afterEach(() => {
    getProjectDbSpy.mockRestore();
  });

  describe("create", () => {
    it("creates a session with default agent", async () => {
      // Mock the prepare chain for insert and select
      mockDb.prepare = mock((sql: string) => {
        if (sql.includes("INSERT")) {
          return { run: mock(() => ({ changes: 1 })) };
        }
        if (sql.includes("SELECT")) {
          return { get: mock(() => ({ ...mockSession, title: "New Session" })) };
        }
        return { run: mock(), get: mock() };
      });

      const result = await SessionHandlers.create({ title: "New Session" }, mockCtx);

      expect(result).toHaveProperty("session");
      expect(getProjectDbSpy).toHaveBeenCalledWith("prj_test");
    });

    it("creates a session with specified agent", async () => {
      mockDb.prepare = mock((sql: string) => {
        if (sql.includes("INSERT")) {
          return { run: mock(() => ({ changes: 1 })) };
        }
        if (sql.includes("SELECT")) {
          return { get: mock(() => ({ ...mockSession, agent: "code-assistant" })) };
        }
        return { run: mock(), get: mock() };
      });

      const result = await SessionHandlers.create(
        { title: "Code Session", agent: "code-assistant" },
        mockCtx
      );

      expect(result).toHaveProperty("session");
    });

    it("accepts optional provider and model", async () => {
      mockDb.prepare = mock((sql: string) => {
        if (sql.includes("INSERT")) {
          return { run: mock(() => ({ changes: 1 })) };
        }
        if (sql.includes("SELECT")) {
          return { get: mock(() => ({
            ...mockSession,
            providerId: "anthropic",
            modelId: "claude-3-opus"
          })) };
        }
        return { run: mock(), get: mock() };
      });

      const result = await SessionHandlers.create(
        { providerId: "anthropic", modelId: "claude-3-opus" },
        mockCtx
      );

      expect(result).toHaveProperty("session");
    });
  });

  describe("list", () => {
    it("lists sessions with default options", async () => {
      mockDb.prepare = mock(() => ({
        all: mock(() => [mockSession, { ...mockSession, id: "sess_2" }]),
      }));

      const result = await SessionHandlers.list({}, mockCtx);

      expect(result).toHaveProperty("sessions");
      expect(Array.isArray(result.sessions)).toBe(true);
    });

    it("lists sessions with filters", async () => {
      mockDb.prepare = mock(() => ({
        all: mock(() => [mockSession]),
      }));

      const result = await SessionHandlers.list(
        { status: "active", agent: "default", limit: 10 },
        mockCtx
      );

      expect(result).toHaveProperty("sessions");
    });

    it("accepts null/undefined payload", async () => {
      mockDb.prepare = mock(() => ({
        all: mock(() => []),
      }));

      const result = await SessionHandlers.list(null, mockCtx);
      expect(result).toHaveProperty("sessions");

      const result2 = await SessionHandlers.list(undefined, mockCtx);
      expect(result2).toHaveProperty("sessions");
    });
  });

  describe("get", () => {
    it("gets a session with messages", async () => {
      const mockMessage = {
        id: "msg_1",
        session_id: "sess_test123",
        role: "user",
        created_at: Date.now(),
      };

      const mockPart = {
        id: "part_1",
        message_id: "msg_1",
        type: "text",
        content: JSON.stringify({ text: "Hello" }),
      };

      mockDb.prepare = mock((sql: string) => {
        if (sql.includes("sessions") && sql.includes("SELECT")) {
          return { get: mock(() => mockSession) };
        }
        if (sql.includes("messages") && sql.includes("SELECT")) {
          return { all: mock(() => [mockMessage]) };
        }
        if (sql.includes("message_parts") && sql.includes("SELECT")) {
          return { all: mock(() => [mockPart]) };
        }
        return { get: mock(), all: mock(() => []) };
      });

      const result = await SessionHandlers.get(
        { sessionId: "sess_test123" },
        mockCtx
      );

      expect(result).toHaveProperty("session");
      expect(result).toHaveProperty("messages");
    });

    it("throws for non-existent session", async () => {
      mockDb.prepare = mock(() => ({
        get: mock(() => null),
      }));

      await expect(
        SessionHandlers.get({ sessionId: "sess_nonexistent" }, mockCtx)
      ).rejects.toThrow();
    });

    it("validates payload schema", async () => {
      await expect(SessionHandlers.get({}, mockCtx)).rejects.toThrow();
      await expect(
        SessionHandlers.get({ sessionId: 123 }, mockCtx)
      ).rejects.toThrow();
    });
  });

  describe("delete", () => {
    it("deletes a session", async () => {
      mockDb.prepare = mock((sql: string) => {
        if (sql.includes("SELECT")) {
          return { get: mock(() => mockSession) };
        }
        if (sql.includes("UPDATE") || sql.includes("DELETE")) {
          return { run: mock(() => ({ changes: 1 })) };
        }
        return { run: mock(), get: mock() };
      });

      const result = await SessionHandlers.delete(
        { sessionId: "sess_test123" },
        mockCtx
      );

      expect(result).toEqual({ deleted: true });
    });

    it("validates payload schema", async () => {
      await expect(SessionHandlers.delete({}, mockCtx)).rejects.toThrow();
    });
  });
});
