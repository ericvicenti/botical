/**
 * WebSocket Connection Integration Tests
 *
 * Tests the WebSocket system integration including:
 * - Handler request processing
 * - Event bus to WebSocket routing
 * - Connection management
 * - Subscription system
 */

import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { DatabaseManager } from "@/database/manager.ts";
import { Config } from "@/config/index.ts";
import { SessionService } from "@/services/sessions.ts";
import { ConnectionManager, type WebSocketConnection } from "@/websocket/connections.ts";
import { RoomManager, getProjectRoom, getSessionRoom } from "@/websocket/rooms.ts";
import { EventBus } from "@/bus/index.ts";
import { setupBusBridge, teardownBusBridge } from "@/websocket/bus-bridge.ts";
import { handleRequest } from "@/websocket/handlers/index.ts";
import type { WSRequest } from "@/websocket/protocol.ts";
import type { WSData } from "@/websocket/connections.ts";
import fs from "fs";
import path from "path";

// Create mock WebSocket
function createMockWs(): WebSocketConnection & { sentMessages: string[] } {
  const ws = {
    sentMessages: [] as string[],
    send: function(data: string) {
      this.sentMessages.push(data);
    },
    close: mock(),
    readyState: 1, // OPEN
  };
  return ws;
}

describe("WebSocket Integration", () => {
  const testDataDir = path.join(import.meta.dirname, "../.test-data/websocket-int");
  const projectId = "prj_ws_test";

  beforeEach(async () => {
    DatabaseManager.closeAll();
    Config.load({ dataDir: testDataDir });

    if (fs.existsSync(testDataDir)) {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    }

    await DatabaseManager.initialize();
    ConnectionManager.clear();
    RoomManager.clear();
    EventBus.clearAll();
  });

  afterEach(() => {
    teardownBusBridge();
    DatabaseManager.closeAll();
    if (fs.existsSync(testDataDir)) {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    }
  });

  describe("handler integration", () => {
    const wsData: WSData = {
      userId: "usr_test",
      projectId,
      connectionId: "conn_test",
    };

    it("handles full session lifecycle", async () => {
      const db = DatabaseManager.getProjectDb(projectId);

      // Create session
      const createRequest: WSRequest = {
        id: "req_1",
        type: "session.create",
        payload: { title: "Integration Test Session" },
      };

      const createResult = await handleRequest(createRequest, wsData) as { session: { id: string } };
      expect(createResult.session).toBeDefined();
      expect(createResult.session.id).toMatch(/^sess_/);

      const sessionId = createResult.session.id;

      // List sessions
      const listRequest: WSRequest = {
        id: "req_2",
        type: "session.list",
        payload: {},
      };

      const listResult = await handleRequest(listRequest, wsData) as { sessions: any[] };
      expect(listResult.sessions.length).toBe(1);
      expect(listResult.sessions[0].id).toBe(sessionId);

      // Get session
      const getRequest: WSRequest = {
        id: "req_3",
        type: "session.get",
        payload: { sessionId },
      };

      const getResult = await handleRequest(getRequest, wsData) as { session: any; messages: any[] };
      expect(getResult.session.id).toBe(sessionId);
      expect(getResult.messages).toBeDefined();

      // Delete session
      const deleteRequest: WSRequest = {
        id: "req_4",
        type: "session.delete",
        payload: { sessionId },
      };

      const deleteResult = await handleRequest(deleteRequest, wsData) as { deleted: boolean };
      expect(deleteResult.deleted).toBe(true);

      // Verify deletion (session has status 'deleted')
      const activeListRequest: WSRequest = {
        id: "req_5",
        type: "session.list",
        payload: { status: "active" },
      };
      const finalList = await handleRequest(activeListRequest, wsData) as { sessions: any[] };
      expect(finalList.sessions.length).toBe(0);
    });

    it("handles subscription lifecycle", async () => {
      // Register connection for subscription tracking
      const mockWs = createMockWs();
      ConnectionManager.add(wsData.connectionId, {
        ws: mockWs,
        userId: wsData.userId,
        projectId: wsData.projectId,
        connectedAt: Date.now(),
        lastActivity: Date.now(),
      });

      // Subscribe to session channel
      const subscribeRequest: WSRequest = {
        id: "req_sub",
        type: "subscribe",
        payload: { channel: "session:sess_123" },
      };

      const subResult = await handleRequest(subscribeRequest, wsData) as { subscribed: boolean; channel: string };
      expect(subResult.subscribed).toBe(true);
      expect(RoomManager.isMember("session:sess_123", wsData.connectionId)).toBe(true);

      // Unsubscribe
      const unsubscribeRequest: WSRequest = {
        id: "req_unsub",
        type: "unsubscribe",
        payload: { channel: "session:sess_123" },
      };

      const unsubResult = await handleRequest(unsubscribeRequest, wsData) as { unsubscribed: boolean };
      expect(unsubResult.unsubscribed).toBe(true);
      expect(RoomManager.isMember("session:sess_123", wsData.connectionId)).toBe(false);
    });

    it("handles ping request", async () => {
      const pingRequest: WSRequest = {
        id: "req_ping",
        type: "ping",
        payload: {},
      };

      const result = await handleRequest(pingRequest, wsData) as { pong: number };
      expect(result.pong).toBeDefined();
      expect(typeof result.pong).toBe("number");
    });
  });

  describe("event bus bridge integration", () => {
    it("routes session events to project room", async () => {
      setupBusBridge();

      // Set up connection
      const mockWs = createMockWs();
      const connectionId = "conn_bus_test";
      ConnectionManager.add(connectionId, {
        ws: mockWs,
        userId: "usr_test",
        projectId,
        connectedAt: Date.now(),
        lastActivity: Date.now(),
      });

      // Join project room
      RoomManager.join(getProjectRoom(projectId), connectionId);

      // Publish event
      EventBus.publish(projectId, {
        type: "session.created",
        payload: {
          sessionId: "sess_new",
          title: "New Session",
          agent: "default",
        },
      });

      await new Promise((r) => setTimeout(r, 50));

      // Verify message was sent
      expect(mockWs.sentMessages.length).toBeGreaterThan(0);
      const message = JSON.parse(mockWs.sentMessages[0]!);
      expect(message.type).toBe("session.created");
      expect(message.payload.sessionId).toBe("sess_new");
    });

    it("routes message events to session room", async () => {
      setupBusBridge();

      // Set up connection
      const mockWs = createMockWs();
      const connectionId = "conn_msg_test";
      ConnectionManager.add(connectionId, {
        ws: mockWs,
        userId: "usr_test",
        projectId,
        connectedAt: Date.now(),
        lastActivity: Date.now(),
      });

      const sessionId = "sess_stream";
      RoomManager.join(getSessionRoom(sessionId), connectionId);

      // Publish message event
      EventBus.publish(projectId, {
        type: "message.text.delta",
        payload: {
          sessionId,
          messageId: "msg_1",
          partId: "part_1",
          delta: "Hello",
        },
      });

      await new Promise((r) => setTimeout(r, 50));

      expect(mockWs.sentMessages.length).toBeGreaterThan(0);
      const message = JSON.parse(mockWs.sentMessages[0]!);
      expect(message.type).toBe("message.text.delta");
      expect(message.payload.delta).toBe("Hello");
    });

    it("broadcasts to multiple clients in project room", async () => {
      setupBusBridge();

      // Set up multiple connections
      const mockWs1 = createMockWs();
      const mockWs2 = createMockWs();
      const mockWs3 = createMockWs();

      ConnectionManager.add("conn_1", {
        ws: mockWs1,
        userId: "usr_1",
        projectId,
        connectedAt: Date.now(),
        lastActivity: Date.now(),
      });

      ConnectionManager.add("conn_2", {
        ws: mockWs2,
        userId: "usr_2",
        projectId,
        connectedAt: Date.now(),
        lastActivity: Date.now(),
      });

      // conn_3 is in different project
      ConnectionManager.add("conn_3", {
        ws: mockWs3,
        userId: "usr_3",
        projectId: "prj_other",
        connectedAt: Date.now(),
        lastActivity: Date.now(),
      });

      // Join project room
      RoomManager.join(getProjectRoom(projectId), "conn_1");
      RoomManager.join(getProjectRoom(projectId), "conn_2");
      RoomManager.join(getProjectRoom("prj_other"), "conn_3");

      // Publish event
      EventBus.publish(projectId, {
        type: "session.created",
        payload: {
          sessionId: "sess_broadcast",
          title: "Broadcast Test",
          agent: "default",
        },
      });

      await new Promise((r) => setTimeout(r, 50));

      // conn_1 and conn_2 should receive
      expect(mockWs1.sentMessages.length).toBe(1);
      expect(mockWs2.sentMessages.length).toBe(1);

      // conn_3 should NOT receive (different project)
      expect(mockWs3.sentMessages.length).toBe(0);
    });

    it("routes message events to both session and project rooms", async () => {
      setupBusBridge();

      // Two connections: one in session room, one in project room
      const sessionWs = createMockWs();
      const projectWs = createMockWs();

      ConnectionManager.add("conn_session", {
        ws: sessionWs,
        userId: "usr_1",
        projectId,
        connectedAt: Date.now(),
        lastActivity: Date.now(),
      });

      ConnectionManager.add("conn_project", {
        ws: projectWs,
        userId: "usr_2",
        projectId,
        connectedAt: Date.now(),
        lastActivity: Date.now(),
      });

      const sessionId = "sess_dual";
      RoomManager.join(getSessionRoom(sessionId), "conn_session");
      RoomManager.join(getProjectRoom(projectId), "conn_project");

      // Publish message event
      EventBus.publish(projectId, {
        type: "message.created",
        payload: {
          sessionId,
          messageId: "msg_dual",
          role: "user",
        },
      });

      await new Promise((r) => setTimeout(r, 50));

      // Both should receive the event
      expect(sessionWs.sentMessages.length).toBe(1);
      expect(projectWs.sentMessages.length).toBe(1);
    });
  });

  describe("connection management integration", () => {
    it("tracks connection subscriptions across rooms", () => {
      const mockWs = createMockWs();
      const connectionId = "conn_track";

      ConnectionManager.add(connectionId, {
        ws: mockWs,
        userId: "usr_test",
        projectId,
        connectedAt: Date.now(),
        lastActivity: Date.now(),
      });

      // Join multiple rooms
      RoomManager.join(getProjectRoom(projectId), connectionId);
      RoomManager.join(getSessionRoom("sess_1"), connectionId);
      RoomManager.join(getSessionRoom("sess_2"), connectionId);

      // Verify membership
      expect(RoomManager.isMember(getProjectRoom(projectId), connectionId)).toBe(true);
      expect(RoomManager.isMember(getSessionRoom("sess_1"), connectionId)).toBe(true);
      expect(RoomManager.isMember(getSessionRoom("sess_2"), connectionId)).toBe(true);

      // Get all rooms for connection
      const rooms = RoomManager.getRooms(connectionId);
      expect(rooms.length).toBe(3);

      // Leave all
      RoomManager.leaveAll(connectionId);
      expect(RoomManager.getRooms(connectionId).length).toBe(0);
    });

    it("cleans up empty rooms", () => {
      RoomManager.join("session:temp", "conn_1");
      RoomManager.join("session:temp", "conn_2");

      expect(RoomManager.exists("session:temp")).toBe(true);

      RoomManager.leave("session:temp", "conn_1");
      expect(RoomManager.exists("session:temp")).toBe(true);

      RoomManager.leave("session:temp", "conn_2");
      expect(RoomManager.exists("session:temp")).toBe(false);
    });

    it("broadcasts only to open connections", async () => {
      setupBusBridge();

      const openWs = createMockWs();
      const closedWs = createMockWs();
      closedWs.readyState = 3; // CLOSED

      ConnectionManager.add("conn_open", {
        ws: openWs,
        userId: "usr_open",
        projectId,
        connectedAt: Date.now(),
        lastActivity: Date.now(),
      });

      ConnectionManager.add("conn_closed", {
        ws: closedWs,
        userId: "usr_closed",
        projectId,
        connectedAt: Date.now(),
        lastActivity: Date.now(),
      });

      RoomManager.join(getProjectRoom(projectId), "conn_open");
      RoomManager.join(getProjectRoom(projectId), "conn_closed");

      EventBus.publish(projectId, {
        type: "session.created",
        payload: { sessionId: "sess_open_test", title: "Test", agent: "default" },
      });

      await new Promise((r) => setTimeout(r, 50));

      // Only open connection should receive
      expect(openWs.sentMessages.length).toBe(1);
      expect(closedWs.sentMessages.length).toBe(0);
    });
  });

  describe("request error handling", () => {
    const wsData: WSData = {
      userId: "usr_test",
      projectId,
      connectionId: "conn_error",
    };

    it("handles validation errors", async () => {
      // Missing required field
      const request: WSRequest = {
        id: "req_invalid",
        type: "session.get",
        payload: {}, // Missing sessionId
      };

      await expect(handleRequest(request, wsData)).rejects.toThrow();
    });

    it("handles not found errors", async () => {
      const request: WSRequest = {
        id: "req_notfound",
        type: "session.get",
        payload: { sessionId: "sess_nonexistent" },
      };

      await expect(handleRequest(request, wsData)).rejects.toThrow();
    });

    it("handles subscription validation", async () => {
      const request: WSRequest = {
        id: "req_badsub",
        type: "subscribe",
        payload: { channel: "invalid_channel" },
      };

      await expect(handleRequest(request, wsData)).rejects.toThrow("Invalid channel");
    });

    it("handles project isolation", async () => {
      const request: WSRequest = {
        id: "req_otherpprj",
        type: "subscribe",
        payload: { channel: "project:prj_other" },
      };

      await expect(handleRequest(request, wsData)).rejects.toThrow("another project");
    });
  });
});
