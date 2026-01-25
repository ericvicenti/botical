/**
 * Session Queries Unit Tests
 */

import { describe, test, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { DatabaseManager } from "../../../src/database/index.ts";
import { SessionService, type Session } from "../../../src/services/sessions.ts";
import {
  sessionsListQuery,
  sessionsGetQuery,
  sessionsCountQuery,
  sessionsCreateMutation,
  sessionsUpdateMutation,
  sessionsDeleteMutation,
} from "../../../src/queries/sessions.ts";
import type { QueryContext, MutationContext } from "../../../src/queries/types.ts";

// Mock data
const mockSession: Session = {
  id: "session-1",
  slug: "test-session",
  parentId: null,
  title: "Test Session",
  status: "active",
  agent: "default",
  providerId: null,
  modelId: null,
  messageCount: 5,
  totalCost: 0.01,
  totalTokensInput: 1000,
  totalTokensOutput: 500,
  shareUrl: null,
  shareSecret: null,
  createdAt: Date.now(),
  updatedAt: Date.now(),
  archivedAt: null,
};

const mockSessions: Session[] = [
  mockSession,
  {
    ...mockSession,
    id: "session-2",
    slug: "another-session",
    title: "Another Session",
    status: "archived",
    archivedAt: Date.now(),
  },
];

describe("Session Queries", () => {
  const mockDb = { prepare: () => ({}) } as any;
  const mockContext: QueryContext = { projectId: "test-project" };
  const mockMutationContext: MutationContext = { projectId: "test-project" };

  let getProjectDbSpy: ReturnType<typeof spyOn>;
  let listSpy: ReturnType<typeof spyOn>;
  let getByIdOrThrowSpy: ReturnType<typeof spyOn>;
  let countSpy: ReturnType<typeof spyOn>;
  let createSpy: ReturnType<typeof spyOn>;
  let updateSpy: ReturnType<typeof spyOn>;
  let deleteSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    getProjectDbSpy = spyOn(DatabaseManager, "getProjectDb").mockReturnValue(mockDb);
    listSpy = spyOn(SessionService, "list").mockReturnValue(mockSessions);
    getByIdOrThrowSpy = spyOn(SessionService, "getByIdOrThrow").mockReturnValue(mockSession);
    countSpy = spyOn(SessionService, "count").mockReturnValue(10);
    createSpy = spyOn(SessionService, "create").mockReturnValue(mockSession);
    updateSpy = spyOn(SessionService, "update").mockReturnValue(mockSession);
    deleteSpy = spyOn(SessionService, "delete").mockReturnValue(undefined);
  });

  afterEach(() => {
    getProjectDbSpy.mockRestore();
    listSpy.mockRestore();
    getByIdOrThrowSpy.mockRestore();
    countSpy.mockRestore();
    createSpy.mockRestore();
    updateSpy.mockRestore();
    deleteSpy.mockRestore();
  });

  describe("sessionsListQuery", () => {
    test("has correct name", () => {
      expect(sessionsListQuery.name).toBe("sessions.list");
    });

    test("fetches sessions list", async () => {
      const result = await sessionsListQuery.fetch(
        { projectId: "test-project" },
        mockContext
      );

      expect(result).toHaveLength(2);
      expect(result[0]!.id).toBe("session-1");
      expect(result[0]!.title).toBe("Test Session");
      expect(result[1]!.status).toBe("archived");
    });

    test("passes filter options", async () => {
      await sessionsListQuery.fetch(
        { projectId: "test-project", status: "active", agent: "default" },
        mockContext
      );

      expect(listSpy).toHaveBeenCalledWith(mockDb, {
        status: "active",
        parentId: undefined,
        agent: "default",
        limit: undefined,
        offset: undefined,
      });
    });

    test("has correct cache configuration", () => {
      expect(sessionsListQuery.cache).toBeDefined();
      expect(sessionsListQuery.cache!.ttl).toBe(10_000);
      expect(sessionsListQuery.cache!.scope).toBe("project");
    });

    test("generates correct cache key", () => {
      const key = sessionsListQuery.cache!.key!({ projectId: "proj1", status: "active" });
      expect(key).toContain("sessions.list");
      expect(key).toContain("proj1");
      expect(key).toContain("status:active");
    });

    test("has realtime events", () => {
      expect(sessionsListQuery.realtime).toBeDefined();
      expect(sessionsListQuery.realtime!.events).toContain("session.created");
      expect(sessionsListQuery.realtime!.events).toContain("session.updated");
      expect(sessionsListQuery.realtime!.events).toContain("session.deleted");
    });
  });

  describe("sessionsGetQuery", () => {
    test("has correct name", () => {
      expect(sessionsGetQuery.name).toBe("sessions.get");
    });

    test("fetches a single session", async () => {
      const result = await sessionsGetQuery.fetch(
        { projectId: "test-project", sessionId: "session-1" },
        mockContext
      );

      expect(result.id).toBe("session-1");
      expect(result.title).toBe("Test Session");
      expect(getByIdOrThrowSpy).toHaveBeenCalledWith(mockDb, "session-1");
    });

    test("has correct cache configuration", () => {
      const key = sessionsGetQuery.cache!.key!({
        projectId: "proj1",
        sessionId: "sess1",
      });
      expect(key).toEqual(["sessions.get", "proj1", "sess1"]);
    });
  });

  describe("sessionsCountQuery", () => {
    test("has correct name", () => {
      expect(sessionsCountQuery.name).toBe("sessions.count");
    });

    test("returns session count", async () => {
      const result = await sessionsCountQuery.fetch(
        { projectId: "test-project" },
        mockContext
      );

      expect(result).toBe(10);
    });

    test("passes status filter", async () => {
      await sessionsCountQuery.fetch(
        { projectId: "test-project", status: "active" },
        mockContext
      );

      expect(countSpy).toHaveBeenCalledWith(mockDb, "active");
    });
  });

  describe("sessionsCreateMutation", () => {
    test("has correct name", () => {
      expect(sessionsCreateMutation.name).toBe("sessions.create");
    });

    test("creates a session", async () => {
      const result = await sessionsCreateMutation.execute(
        { projectId: "test-project", data: { title: "New Session" } },
        mockMutationContext
      );

      expect(result.id).toBe("session-1");
      expect(createSpy).toHaveBeenCalledWith(mockDb, { title: "New Session" });
    });

    test("invalidates correct queries", () => {
      expect(sessionsCreateMutation.invalidates).toContain("sessions.list");
      expect(sessionsCreateMutation.invalidates).toContain("sessions.count");
    });
  });

  describe("sessionsUpdateMutation", () => {
    test("has correct name", () => {
      expect(sessionsUpdateMutation.name).toBe("sessions.update");
    });

    test("updates a session", async () => {
      const result = await sessionsUpdateMutation.execute(
        {
          projectId: "test-project",
          sessionId: "session-1",
          data: { title: "Updated Title" },
        },
        mockMutationContext
      );

      expect(result.id).toBe("session-1");
      expect(updateSpy).toHaveBeenCalledWith(mockDb, "session-1", { title: "Updated Title" });
    });

    test("has correct invalidate keys function", () => {
      const keys = sessionsUpdateMutation.invalidateKeys!(
        { projectId: "proj1", sessionId: "sess1", data: {} },
        mockSession as any
      );
      expect(keys).toContainEqual(["sessions.get", "proj1", "sess1"]);
    });
  });

  describe("sessionsDeleteMutation", () => {
    test("has correct name", () => {
      expect(sessionsDeleteMutation.name).toBe("sessions.delete");
    });

    test("deletes a session", async () => {
      const result = await sessionsDeleteMutation.execute(
        { projectId: "test-project", sessionId: "session-1" },
        mockMutationContext
      );

      expect(result).toEqual({ deleted: true });
      expect(deleteSpy).toHaveBeenCalledWith(mockDb, "session-1");
    });

    test("invalidates correct queries", () => {
      expect(sessionsDeleteMutation.invalidates).toContain("sessions.list");
      expect(sessionsDeleteMutation.invalidates).toContain("sessions.count");
    });
  });
});
