import { describe, it, expect, beforeEach, mock } from "bun:test";
import {
  RoomManager,
  getProjectRoom,
  getSessionRoom,
} from "@/websocket/rooms.ts";
import { ConnectionManager } from "@/websocket/connections.ts";

// Mock WebSocket
function createMockWs(readyState = 1) {
  return {
    send: mock(() => {}),
    close: mock(() => {}),
    readyState,
  };
}

describe("RoomManager", () => {
  beforeEach(() => {
    RoomManager.clear();
    ConnectionManager.clear();
  });

  describe("join/leave", () => {
    it("joins a connection to a room", () => {
      RoomManager.join("session:sess_1", "conn_1");

      expect(RoomManager.isMember("session:sess_1", "conn_1")).toBe(true);
    });

    it("leaves a room", () => {
      RoomManager.join("session:sess_1", "conn_1");
      const left = RoomManager.leave("session:sess_1", "conn_1");

      expect(left).toBe(true);
      expect(RoomManager.isMember("session:sess_1", "conn_1")).toBe(false);
    });

    it("returns false when leaving non-existent room", () => {
      expect(RoomManager.leave("nonexistent", "conn_1")).toBe(false);
    });

    it("cleans up empty rooms", () => {
      RoomManager.join("session:sess_1", "conn_1");
      RoomManager.leave("session:sess_1", "conn_1");

      expect(RoomManager.exists("session:sess_1")).toBe(false);
    });
  });

  describe("leaveAll", () => {
    it("removes connection from all rooms", () => {
      RoomManager.join("session:sess_1", "conn_1");
      RoomManager.join("session:sess_2", "conn_1");
      RoomManager.join("session:sess_3", "conn_1");

      const count = RoomManager.leaveAll("conn_1");

      expect(count).toBe(3);
      expect(RoomManager.isMember("session:sess_1", "conn_1")).toBe(false);
      expect(RoomManager.isMember("session:sess_2", "conn_1")).toBe(false);
      expect(RoomManager.isMember("session:sess_3", "conn_1")).toBe(false);
    });
  });

  describe("getMembers", () => {
    it("returns all members of a room", () => {
      RoomManager.join("session:sess_1", "conn_1");
      RoomManager.join("session:sess_1", "conn_2");
      RoomManager.join("session:sess_1", "conn_3");

      const members = RoomManager.getMembers("session:sess_1");

      expect(members).toHaveLength(3);
      expect(members).toContain("conn_1");
      expect(members).toContain("conn_2");
      expect(members).toContain("conn_3");
    });

    it("returns empty array for non-existent room", () => {
      expect(RoomManager.getMembers("nonexistent")).toEqual([]);
    });
  });

  describe("getMemberCount", () => {
    it("returns correct member count", () => {
      expect(RoomManager.getMemberCount("session:sess_1")).toBe(0);

      RoomManager.join("session:sess_1", "conn_1");
      RoomManager.join("session:sess_1", "conn_2");

      expect(RoomManager.getMemberCount("session:sess_1")).toBe(2);
    });
  });

  describe("getRooms", () => {
    it("returns all rooms a connection is in", () => {
      RoomManager.join("session:sess_1", "conn_1");
      RoomManager.join("session:sess_2", "conn_1");
      RoomManager.join("project:prj_1", "conn_1");

      const rooms = RoomManager.getRooms("conn_1");

      expect(rooms).toHaveLength(3);
      expect(rooms).toContain("session:sess_1");
      expect(rooms).toContain("session:sess_2");
      expect(rooms).toContain("project:prj_1");
    });
  });

  describe("broadcast", () => {
    it("sends message to all room members", () => {
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

      RoomManager.join("session:sess_1", "conn_1");
      RoomManager.join("session:sess_1", "conn_2");

      const count = RoomManager.broadcast("session:sess_1", {
        type: "message.text.delta",
        payload: { delta: "Hello" },
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

      RoomManager.join("session:sess_1", "conn_1");
      RoomManager.join("session:sess_1", "conn_2");

      const count = RoomManager.broadcast(
        "session:sess_1",
        { type: "message.text.delta", payload: { delta: "Hello" } },
        ["conn_1"]
      );

      expect(count).toBe(1);
      expect(ws1.send).not.toHaveBeenCalled();
      expect(ws2.send).toHaveBeenCalled();
    });

    it("returns 0 for non-existent room", () => {
      const count = RoomManager.broadcast("nonexistent", {
        type: "message.created",
        payload: {},
      });

      expect(count).toBe(0);
    });
  });

  describe("exists", () => {
    it("returns true for room with members", () => {
      RoomManager.join("session:sess_1", "conn_1");
      expect(RoomManager.exists("session:sess_1")).toBe(true);
    });

    it("returns false for empty room", () => {
      expect(RoomManager.exists("session:sess_1")).toBe(false);
    });
  });

  describe("getAllRooms", () => {
    it("returns all active room names", () => {
      RoomManager.join("session:sess_1", "conn_1");
      RoomManager.join("session:sess_2", "conn_2");
      RoomManager.join("project:prj_1", "conn_3");

      const rooms = RoomManager.getAllRooms();

      expect(rooms).toHaveLength(3);
      expect(rooms).toContain("session:sess_1");
      expect(rooms).toContain("session:sess_2");
      expect(rooms).toContain("project:prj_1");
    });
  });
});

describe("Room name helpers", () => {
  describe("getProjectRoom", () => {
    it("returns correct room name", () => {
      expect(getProjectRoom("prj_123")).toBe("project:prj_123");
    });
  });

  describe("getSessionRoom", () => {
    it("returns correct room name", () => {
      expect(getSessionRoom("sess_456")).toBe("session:sess_456");
    });
  });
});
