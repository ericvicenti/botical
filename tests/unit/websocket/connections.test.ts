import { describe, it, expect, beforeEach, mock } from "bun:test";
import {
  ConnectionManager,
  type WebSocketConnection,
} from "@/websocket/connections.ts";

// Mock WebSocket
function createMockWs(readyState = 1): WebSocketConnection {
  return {
    send: mock(() => {}),
    close: mock(() => {}),
    readyState,
  };
}

describe("ConnectionManager", () => {
  beforeEach(() => {
    ConnectionManager.clear();
  });

  describe("add/get/remove", () => {
    it("adds a connection and retrieves it", () => {
      const ws = createMockWs();
      ConnectionManager.add("conn_1", {
        ws,
        userId: "usr_1",
        projectId: "prj_1",
        connectedAt: Date.now(),
        lastActivity: Date.now(),
      });

      const conn = ConnectionManager.get("conn_1");

      expect(conn).toBeDefined();
      expect(conn?.userId).toBe("usr_1");
      expect(conn?.projectId).toBe("prj_1");
    });

    it("removes a connection", () => {
      const ws = createMockWs();
      ConnectionManager.add("conn_1", {
        ws,
        userId: "usr_1",
        projectId: "prj_1",
        connectedAt: Date.now(),
        lastActivity: Date.now(),
      });

      const removed = ConnectionManager.remove("conn_1");

      expect(removed).toBe(true);
      expect(ConnectionManager.get("conn_1")).toBeUndefined();
    });

    it("returns false when removing non-existent connection", () => {
      expect(ConnectionManager.remove("nonexistent")).toBe(false);
    });
  });

  describe("has", () => {
    it("returns true for existing connection", () => {
      ConnectionManager.add("conn_1", {
        ws: createMockWs(),
        userId: "usr_1",
        projectId: "prj_1",
        connectedAt: Date.now(),
        lastActivity: Date.now(),
      });

      expect(ConnectionManager.has("conn_1")).toBe(true);
    });

    it("returns false for non-existent connection", () => {
      expect(ConnectionManager.has("nonexistent")).toBe(false);
    });
  });

  describe("getByUser", () => {
    it("returns all connections for a user", () => {
      ConnectionManager.add("conn_1", {
        ws: createMockWs(),
        userId: "usr_1",
        projectId: "prj_1",
        connectedAt: Date.now(),
        lastActivity: Date.now(),
      });

      ConnectionManager.add("conn_2", {
        ws: createMockWs(),
        userId: "usr_1",
        projectId: "prj_2",
        connectedAt: Date.now(),
        lastActivity: Date.now(),
      });

      ConnectionManager.add("conn_3", {
        ws: createMockWs(),
        userId: "usr_2",
        projectId: "prj_1",
        connectedAt: Date.now(),
        lastActivity: Date.now(),
      });

      const conns = ConnectionManager.getByUser("usr_1");

      expect(conns).toHaveLength(2);
      expect(conns.every((c) => c.userId === "usr_1")).toBe(true);
    });
  });

  describe("getByProject", () => {
    it("returns all connections for a project", () => {
      ConnectionManager.add("conn_1", {
        ws: createMockWs(),
        userId: "usr_1",
        projectId: "prj_1",
        connectedAt: Date.now(),
        lastActivity: Date.now(),
      });

      ConnectionManager.add("conn_2", {
        ws: createMockWs(),
        userId: "usr_2",
        projectId: "prj_1",
        connectedAt: Date.now(),
        lastActivity: Date.now(),
      });

      ConnectionManager.add("conn_3", {
        ws: createMockWs(),
        userId: "usr_1",
        projectId: "prj_2",
        connectedAt: Date.now(),
        lastActivity: Date.now(),
      });

      const conns = ConnectionManager.getByProject("prj_1");

      expect(conns).toHaveLength(2);
      expect(conns.every((c) => c.projectId === "prj_1")).toBe(true);
    });
  });

  describe("subscriptions", () => {
    it("adds and tracks subscriptions", () => {
      ConnectionManager.add("conn_1", {
        ws: createMockWs(),
        userId: "usr_1",
        projectId: "prj_1",
        connectedAt: Date.now(),
        lastActivity: Date.now(),
      });

      ConnectionManager.addSubscription("conn_1", "session:sess_1");
      ConnectionManager.addSubscription("conn_1", "session:sess_2");

      expect(ConnectionManager.hasSubscription("conn_1", "session:sess_1")).toBe(true);
      expect(ConnectionManager.hasSubscription("conn_1", "session:sess_2")).toBe(true);
      expect(ConnectionManager.hasSubscription("conn_1", "session:sess_3")).toBe(false);
    });

    it("removes subscriptions", () => {
      ConnectionManager.add("conn_1", {
        ws: createMockWs(),
        userId: "usr_1",
        projectId: "prj_1",
        connectedAt: Date.now(),
        lastActivity: Date.now(),
      });

      ConnectionManager.addSubscription("conn_1", "session:sess_1");
      ConnectionManager.removeSubscription("conn_1", "session:sess_1");

      expect(ConnectionManager.hasSubscription("conn_1", "session:sess_1")).toBe(false);
    });

    it("lists all subscriptions", () => {
      ConnectionManager.add("conn_1", {
        ws: createMockWs(),
        userId: "usr_1",
        projectId: "prj_1",
        connectedAt: Date.now(),
        lastActivity: Date.now(),
      });

      ConnectionManager.addSubscription("conn_1", "session:sess_1");
      ConnectionManager.addSubscription("conn_1", "session:sess_2");

      const subs = ConnectionManager.getSubscriptions("conn_1");

      expect(subs).toContain("session:sess_1");
      expect(subs).toContain("session:sess_2");
    });
  });

  describe("send", () => {
    it("sends message to connection", () => {
      const ws = createMockWs();
      ConnectionManager.add("conn_1", {
        ws,
        userId: "usr_1",
        projectId: "prj_1",
        connectedAt: Date.now(),
        lastActivity: Date.now(),
      });

      const result = ConnectionManager.send("conn_1", {
        type: "message.created",
        payload: { test: true },
      });

      expect(result).toBe(true);
      expect(ws.send).toHaveBeenCalledWith(
        JSON.stringify({ type: "message.created", payload: { test: true } })
      );
    });

    it("returns false for non-existent connection", () => {
      const result = ConnectionManager.send("nonexistent", {
        type: "message.created",
        payload: {},
      });

      expect(result).toBe(false);
    });

    it("returns false for closed connection", () => {
      const ws = createMockWs(3); // CLOSED state
      ConnectionManager.add("conn_1", {
        ws,
        userId: "usr_1",
        projectId: "prj_1",
        connectedAt: Date.now(),
        lastActivity: Date.now(),
      });

      const result = ConnectionManager.send("conn_1", {
        type: "message.created",
        payload: {},
      });

      expect(result).toBe(false);
      expect(ws.send).not.toHaveBeenCalled();
    });
  });

  describe("broadcastToProject", () => {
    it("sends to all connections in project", () => {
      const ws1 = createMockWs();
      const ws2 = createMockWs();

      ConnectionManager.add("conn_1", {
        ws: ws1,
        userId: "usr_1",
        projectId: "prj_1",
        connectedAt: Date.now(),
        lastActivity: Date.now(),
      });

      ConnectionManager.add("conn_2", {
        ws: ws2,
        userId: "usr_2",
        projectId: "prj_1",
        connectedAt: Date.now(),
        lastActivity: Date.now(),
      });

      const count = ConnectionManager.broadcastToProject("prj_1", {
        type: "message.created",
        payload: {},
      });

      expect(count).toBe(2);
      expect(ws1.send).toHaveBeenCalled();
      expect(ws2.send).toHaveBeenCalled();
    });

    it("excludes specified connections", () => {
      const ws1 = createMockWs();
      const ws2 = createMockWs();

      ConnectionManager.add("conn_1", {
        ws: ws1,
        userId: "usr_1",
        projectId: "prj_1",
        connectedAt: Date.now(),
        lastActivity: Date.now(),
      });

      ConnectionManager.add("conn_2", {
        ws: ws2,
        userId: "usr_2",
        projectId: "prj_1",
        connectedAt: Date.now(),
        lastActivity: Date.now(),
      });

      const count = ConnectionManager.broadcastToProject(
        "prj_1",
        { type: "message.created", payload: {} },
        ["conn_1"]
      );

      expect(count).toBe(1);
      expect(ws1.send).not.toHaveBeenCalled();
      expect(ws2.send).toHaveBeenCalled();
    });
  });

  describe("updateActivity", () => {
    it("updates lastActivity timestamp", async () => {
      const now = Date.now();
      ConnectionManager.add("conn_1", {
        ws: createMockWs(),
        userId: "usr_1",
        projectId: "prj_1",
        connectedAt: now,
        lastActivity: now,
      });

      await new Promise((r) => setTimeout(r, 10));
      ConnectionManager.updateActivity("conn_1");

      const conn = ConnectionManager.get("conn_1");
      expect(conn?.lastActivity).toBeGreaterThan(now);
    });
  });

  describe("getCount", () => {
    it("returns total connection count", () => {
      expect(ConnectionManager.getCount()).toBe(0);

      ConnectionManager.add("conn_1", {
        ws: createMockWs(),
        userId: "usr_1",
        projectId: "prj_1",
        connectedAt: Date.now(),
        lastActivity: Date.now(),
      });

      expect(ConnectionManager.getCount()).toBe(1);
    });
  });
});
