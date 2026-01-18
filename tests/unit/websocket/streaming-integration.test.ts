/**
 * Streaming Integration Tests
 *
 * Tests the full streaming flow from StreamProcessor through EventBus to WebSocket.
 */

import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { EventBus } from "@/bus/index.ts";
import {
  setupBusBridge,
  teardownBusBridge,
  getBridgeSubscriptionCount,
} from "@/websocket/bus-bridge.ts";
import { RoomManager, getSessionRoom, getProjectRoom } from "@/websocket/rooms.ts";
import { ConnectionManager } from "@/websocket/connections.ts";

describe("Streaming Integration", () => {
  beforeEach(() => {
    // Clear any existing state
    teardownBusBridge();
    RoomManager.clear();
  });

  afterEach(() => {
    teardownBusBridge();
    RoomManager.clear();
  });

  describe("EventBus to WebSocket flow", () => {
    it("should setup bus bridge with message subscriptions", () => {
      setupBusBridge();
      expect(getBridgeSubscriptionCount()).toBeGreaterThan(0);
    });

    it("should forward message.text.delta to session room", async () => {
      setupBusBridge();

      const sessionId = "test-session-123";
      const projectId = "test-project-456";
      const connectionId = "test-conn-1";

      // Create a mock WebSocket
      const mockWs = {
        send: mock(() => {}),
        readyState: 1, // WebSocket.OPEN
      };

      // Register connection
      ConnectionManager.add(connectionId, {
        ws: mockWs as any,
        userId: "test-user",
        projectId,
        connectedAt: Date.now(),
        lastActivity: Date.now(),
      });

      // Join the session room
      RoomManager.join(getSessionRoom(sessionId), connectionId);

      // Verify room membership
      expect(RoomManager.isMember(getSessionRoom(sessionId), connectionId)).toBe(true);

      // Publish message.text.delta event
      EventBus.publish(projectId, {
        type: "message.text.delta",
        payload: {
          sessionId,
          messageId: "msg-123",
          partId: "part-1",
          delta: "Hello world",
        },
      });

      // Wait a tick for async processing
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Verify the WebSocket received the message
      expect(mockWs.send).toHaveBeenCalled();

      const sentData = JSON.parse(mockWs.send.mock.calls[0][0] as string);
      expect(sentData.type).toBe("message.text.delta");
      expect(sentData.payload.delta).toBe("Hello world");
      expect(sentData.payload.sessionId).toBe(sessionId);

      // Cleanup
      ConnectionManager.remove(connectionId);
    });

    it("should forward message.created to session room", async () => {
      setupBusBridge();

      const sessionId = "test-session-123";
      const projectId = "test-project-456";
      const connectionId = "test-conn-1";

      const mockWs = {
        send: mock(() => {}),
        readyState: 1,
      };

      ConnectionManager.add(connectionId, {
        ws: mockWs as any,
        userId: "test-user",
        projectId,
        connectedAt: Date.now(),
        lastActivity: Date.now(),
      });

      RoomManager.join(getSessionRoom(sessionId), connectionId);

      // Publish message.created event
      EventBus.publish(projectId, {
        type: "message.created",
        payload: {
          sessionId,
          messageId: "msg-123",
          role: "assistant",
        },
      });

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockWs.send).toHaveBeenCalled();

      const sentData = JSON.parse(mockWs.send.mock.calls[0][0] as string);
      expect(sentData.type).toBe("message.created");
      expect(sentData.payload.role).toBe("assistant");

      ConnectionManager.remove(connectionId);
    });

    it("should forward message.complete to session room", async () => {
      setupBusBridge();

      const sessionId = "test-session-123";
      const projectId = "test-project-456";
      const connectionId = "test-conn-1";

      const mockWs = {
        send: mock(() => {}),
        readyState: 1,
      };

      ConnectionManager.add(connectionId, {
        ws: mockWs as any,
        userId: "test-user",
        projectId,
        connectedAt: Date.now(),
        lastActivity: Date.now(),
      });

      RoomManager.join(getSessionRoom(sessionId), connectionId);

      // Publish message.complete event
      EventBus.publish(projectId, {
        type: "message.complete",
        payload: {
          sessionId,
          messageId: "msg-123",
          finishReason: "stop",
        },
      });

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockWs.send).toHaveBeenCalled();

      const sentData = JSON.parse(mockWs.send.mock.calls[0][0] as string);
      expect(sentData.type).toBe("message.complete");
      expect(sentData.payload.finishReason).toBe("stop");

      ConnectionManager.remove(connectionId);
    });

    it("should also forward to project room", async () => {
      setupBusBridge();

      const sessionId = "test-session-123";
      const projectId = "test-project-456";
      const connectionId = "test-conn-1";

      const mockWs = {
        send: mock(() => {}),
        readyState: 1,
      };

      ConnectionManager.add(connectionId, {
        ws: mockWs as any,
        userId: "test-user",
        projectId,
        connectedAt: Date.now(),
        lastActivity: Date.now(),
      });

      // Join project room (not session room)
      RoomManager.join(getProjectRoom(projectId), connectionId);

      // Publish message.text.delta event
      EventBus.publish(projectId, {
        type: "message.text.delta",
        payload: {
          sessionId,
          messageId: "msg-123",
          partId: "part-1",
          delta: "Hello world",
        },
      });

      await new Promise((resolve) => setTimeout(resolve, 10));

      // Should still receive because bus-bridge also broadcasts to project room
      expect(mockWs.send).toHaveBeenCalled();

      ConnectionManager.remove(connectionId);
    });

    it("should NOT forward to connection not in room", async () => {
      setupBusBridge();

      const sessionId = "test-session-123";
      const projectId = "test-project-456";
      const connectionId = "test-conn-1";

      const mockWs = {
        send: mock(() => {}),
        readyState: 1,
      };

      ConnectionManager.add(connectionId, {
        ws: mockWs as any,
        userId: "test-user",
        projectId,
        connectedAt: Date.now(),
        lastActivity: Date.now(),
      });

      // Don't join any room

      EventBus.publish(projectId, {
        type: "message.text.delta",
        payload: {
          sessionId,
          messageId: "msg-123",
          partId: "part-1",
          delta: "Hello world",
        },
      });

      await new Promise((resolve) => setTimeout(resolve, 10));

      // Should NOT receive because not in any relevant room
      expect(mockWs.send).not.toHaveBeenCalled();

      ConnectionManager.remove(connectionId);
    });

    it("should handle multiple rapid text deltas", async () => {
      setupBusBridge();

      const sessionId = "test-session-123";
      const projectId = "test-project-456";
      const connectionId = "test-conn-1";

      const mockWs = {
        send: mock(() => {}),
        readyState: 1,
      };

      ConnectionManager.add(connectionId, {
        ws: mockWs as any,
        userId: "test-user",
        projectId,
        connectedAt: Date.now(),
        lastActivity: Date.now(),
      });

      RoomManager.join(getSessionRoom(sessionId), connectionId);

      const deltas = ["The ", "quick ", "brown ", "fox ", "jumps"];

      for (const delta of deltas) {
        EventBus.publish(projectId, {
          type: "message.text.delta",
          payload: {
            sessionId,
            messageId: "msg-123",
            partId: "part-1",
            delta,
          },
        });
      }

      await new Promise((resolve) => setTimeout(resolve, 50));

      // Should receive all 5 deltas (also broadcast to project room, so possibly more)
      expect(mockWs.send.mock.calls.length).toBeGreaterThanOrEqual(5);

      ConnectionManager.remove(connectionId);
    });
  });

  describe("Room management", () => {
    it("should correctly join and leave rooms", () => {
      const sessionId = "test-session";
      const connectionId = "test-conn";

      // Join room
      RoomManager.join(getSessionRoom(sessionId), connectionId);
      expect(RoomManager.isMember(getSessionRoom(sessionId), connectionId)).toBe(true);
      expect(RoomManager.getMemberCount(getSessionRoom(sessionId))).toBe(1);

      // Leave room
      RoomManager.leave(getSessionRoom(sessionId), connectionId);
      expect(RoomManager.isMember(getSessionRoom(sessionId), connectionId)).toBe(false);
      expect(RoomManager.getMemberCount(getSessionRoom(sessionId))).toBe(0);
    });

    it("should support multiple connections in same room", () => {
      const sessionId = "test-session";
      const conn1 = "test-conn-1";
      const conn2 = "test-conn-2";

      RoomManager.join(getSessionRoom(sessionId), conn1);
      RoomManager.join(getSessionRoom(sessionId), conn2);

      expect(RoomManager.getMemberCount(getSessionRoom(sessionId))).toBe(2);
      expect(RoomManager.getMembers(getSessionRoom(sessionId))).toContain(conn1);
      expect(RoomManager.getMembers(getSessionRoom(sessionId))).toContain(conn2);
    });

    it("should generate correct room names", () => {
      expect(getSessionRoom("ses-123")).toBe("session:ses-123");
      expect(getProjectRoom("proj-456")).toBe("project:proj-456");
    });
  });
});
