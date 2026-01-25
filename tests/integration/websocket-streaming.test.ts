/**
 * WebSocket Streaming Integration Tests
 *
 * Tests real-time event streaming through WebSocket including:
 * - Message event streaming
 * - Stream state progression
 * - Tool call events
 * - Error event handling
 */

import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { DatabaseManager } from "@/database/manager.ts";
import { Config } from "@/config/index.ts";
import { SessionService } from "@/services/sessions.ts";
import { MessageService, MessagePartService } from "@/services/messages.ts";
import { ConnectionManager, type WebSocketConnection } from "@/websocket/connections.ts";
import { RoomManager, getSessionRoom, getProjectRoom } from "@/websocket/rooms.ts";
import { EventBus } from "@/bus/index.ts";
import { setupBusBridge, teardownBusBridge } from "@/websocket/bus-bridge.ts";
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
    readyState: 1,
  };
  return ws;
}

describe("WebSocket Streaming Integration", () => {
  const testDataDir = path.join(import.meta.dirname, "../.test-data/websocket-stream");
  const projectId = "prj_stream_test";

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

  describe("message streaming events", () => {
    it("streams text delta events to session subscribers", async () => {
      setupBusBridge();
      const db = DatabaseManager.getProjectDb(projectId);

      // Create session
      const session = SessionService.create(db, {
        title: "Streaming Test",
        agent: "default",
      });

      // Set up connection subscribed to session
      const mockWs = createMockWs();
      ConnectionManager.add("conn_stream", {
        ws: mockWs,
        userId: "usr_test",
        projectId,
        connectedAt: Date.now(),
        lastActivity: Date.now(),
      });
      RoomManager.join(getSessionRoom(session.id), "conn_stream");

      // Simulate message stream events
      const deltas = ["Hello", " ", "world", "!"];
      for (const delta of deltas) {
        EventBus.publish(projectId, {
          type: "message.text.delta",
          payload: {
            sessionId: session.id,
            messageId: "msg_1",
            partId: "part_1",
            delta,
          },
        });
      }

      await new Promise((r) => setTimeout(r, 100));

      // Verify all deltas received
      expect(mockWs.sentMessages.length).toBe(4);
      const received = mockWs.sentMessages.map((m) => JSON.parse(m));
      expect(received.every((m) => m.type === "message.text.delta")).toBe(true);

      const text = received.map((m) => m.payload.delta).join("");
      expect(text).toBe("Hello world!");
    });

    it("streams message lifecycle events in order", async () => {
      setupBusBridge();
      const db = DatabaseManager.getProjectDb(projectId);

      const session = SessionService.create(db, {
        title: "Lifecycle Test",
        agent: "default",
      });

      const mockWs = createMockWs();
      ConnectionManager.add("conn_lifecycle", {
        ws: mockWs,
        userId: "usr_test",
        projectId,
        connectedAt: Date.now(),
        lastActivity: Date.now(),
      });
      RoomManager.join(getSessionRoom(session.id), "conn_lifecycle");

      // Simulate full message lifecycle
      EventBus.publish(projectId, {
        type: "message.created",
        payload: {
          sessionId: session.id,
          messageId: "msg_life",
          role: "assistant",
        },
      });

      EventBus.publish(projectId, {
        type: "message.text.delta",
        payload: {
          sessionId: session.id,
          messageId: "msg_life",
          partId: "part_life",
          delta: "Response",
        },
      });

      EventBus.publish(projectId, {
        type: "message.complete",
        payload: {
          sessionId: session.id,
          messageId: "msg_life",
          finishReason: "end_turn",
        },
      });

      await new Promise((r) => setTimeout(r, 100));

      expect(mockWs.sentMessages.length).toBe(3);
      const events = mockWs.sentMessages.map((m) => JSON.parse(m));

      expect(events[0].type).toBe("message.created");
      expect(events[1].type).toBe("message.text.delta");
      expect(events[2].type).toBe("message.complete");
    });

    it("streams tool call events", async () => {
      setupBusBridge();
      const db = DatabaseManager.getProjectDb(projectId);

      const session = SessionService.create(db, {
        title: "Tool Test",
        agent: "default",
      });

      const mockWs = createMockWs();
      ConnectionManager.add("conn_tool", {
        ws: mockWs,
        userId: "usr_test",
        projectId,
        connectedAt: Date.now(),
        lastActivity: Date.now(),
      });
      RoomManager.join(getSessionRoom(session.id), "conn_tool");

      // Simulate tool call flow
      EventBus.publish(projectId, {
        type: "message.tool.call",
        payload: {
          sessionId: session.id,
          messageId: "msg_tool",
          partId: "part_tool",
          toolCallId: "tool_123",
          toolName: "read_file",
          args: { path: "/test.txt" },
        },
      });

      EventBus.publish(projectId, {
        type: "message.tool.result",
        payload: {
          sessionId: session.id,
          messageId: "msg_tool",
          partId: "part_tool",
          toolCallId: "tool_123",
          result: "File contents here",
        },
      });

      await new Promise((r) => setTimeout(r, 100));

      expect(mockWs.sentMessages.length).toBe(2);
      const events = mockWs.sentMessages.map((m) => JSON.parse(m));

      expect(events[0].type).toBe("message.tool.call");
      expect(events[0].payload.toolName).toBe("read_file");
      expect(events[1].type).toBe("message.tool.result");
      expect(events[1].payload.result).toBe("File contents here");
    });

    it("streams error events", async () => {
      setupBusBridge();
      const db = DatabaseManager.getProjectDb(projectId);

      const session = SessionService.create(db, {
        title: "Error Test",
        agent: "default",
      });

      const mockWs = createMockWs();
      ConnectionManager.add("conn_error", {
        ws: mockWs,
        userId: "usr_test",
        projectId,
        connectedAt: Date.now(),
        lastActivity: Date.now(),
      });
      RoomManager.join(getSessionRoom(session.id), "conn_error");

      EventBus.publish(projectId, {
        type: "message.error",
        payload: {
          sessionId: session.id,
          messageId: "msg_err",
          errorType: "rate_limit",
          errorMessage: "API rate limit exceeded",
        },
      });

      await new Promise((r) => setTimeout(r, 100));

      expect(mockWs.sentMessages.length).toBe(1);
      const event = JSON.parse(mockWs.sentMessages[0]!);
      expect(event.type).toBe("message.error");
      expect(event.payload.errorMessage).toBe("API rate limit exceeded");
    });
  });

  describe("multi-session streaming", () => {
    it("isolates events to subscribed sessions", async () => {
      setupBusBridge();
      const db = DatabaseManager.getProjectDb(projectId);

      // Create two sessions
      const session1 = SessionService.create(db, { title: "Session 1", agent: "default" });
      const session2 = SessionService.create(db, { title: "Session 2", agent: "default" });

      // Connection 1 subscribed to session 1
      const ws1 = createMockWs();
      ConnectionManager.add("conn_s1", {
        ws: ws1,
        userId: "usr_1",
        projectId,
        connectedAt: Date.now(),
        lastActivity: Date.now(),
      });
      RoomManager.join(getSessionRoom(session1.id), "conn_s1");

      // Connection 2 subscribed to session 2
      const ws2 = createMockWs();
      ConnectionManager.add("conn_s2", {
        ws: ws2,
        userId: "usr_2",
        projectId,
        connectedAt: Date.now(),
        lastActivity: Date.now(),
      });
      RoomManager.join(getSessionRoom(session2.id), "conn_s2");

      // Publish events to both sessions
      EventBus.publish(projectId, {
        type: "message.text.delta",
        payload: {
          sessionId: session1.id,
          messageId: "msg_s1",
          partId: "part_s1",
          delta: "Session 1 message",
        },
      });

      EventBus.publish(projectId, {
        type: "message.text.delta",
        payload: {
          sessionId: session2.id,
          messageId: "msg_s2",
          partId: "part_s2",
          delta: "Session 2 message",
        },
      });

      await new Promise((r) => setTimeout(r, 100));

      // ws1 should only get session1 events
      expect(ws1.sentMessages.length).toBe(1);
      expect(JSON.parse(ws1.sentMessages[0]!).payload.sessionId).toBe(session1.id);

      // ws2 should only get session2 events
      expect(ws2.sentMessages.length).toBe(1);
      expect(JSON.parse(ws2.sentMessages[0]!).payload.sessionId).toBe(session2.id);
    });

    it("allows subscribing to multiple sessions", async () => {
      setupBusBridge();
      const db = DatabaseManager.getProjectDb(projectId);

      const session1 = SessionService.create(db, { title: "Session A", agent: "default" });
      const session2 = SessionService.create(db, { title: "Session B", agent: "default" });

      // One connection subscribed to both sessions
      const ws = createMockWs();
      ConnectionManager.add("conn_multi", {
        ws: ws,
        userId: "usr_multi",
        projectId,
        connectedAt: Date.now(),
        lastActivity: Date.now(),
      });
      RoomManager.join(getSessionRoom(session1.id), "conn_multi");
      RoomManager.join(getSessionRoom(session2.id), "conn_multi");

      // Events from both sessions
      EventBus.publish(projectId, {
        type: "message.created",
        payload: { sessionId: session1.id, messageId: "msg_a", role: "user" },
      });

      EventBus.publish(projectId, {
        type: "message.created",
        payload: { sessionId: session2.id, messageId: "msg_b", role: "user" },
      });

      await new Promise((r) => setTimeout(r, 100));

      // Should receive events from both sessions
      expect(ws.sentMessages.length).toBe(2);
    });
  });

  describe("project-level event watching", () => {
    it("receives all session events via project room", async () => {
      setupBusBridge();
      const db = DatabaseManager.getProjectDb(projectId);

      const session = SessionService.create(db, { title: "Project Watch", agent: "default" });

      // Subscribe to project room (not session room)
      const ws = createMockWs();
      ConnectionManager.add("conn_project", {
        ws: ws,
        userId: "usr_proj",
        projectId,
        connectedAt: Date.now(),
        lastActivity: Date.now(),
      });
      RoomManager.join(getProjectRoom(projectId), "conn_project");

      // Session events go to project room
      EventBus.publish(projectId, {
        type: "session.created",
        payload: { sessionId: session.id, title: "New", agent: "default" },
      });

      // Message events also go to project room
      EventBus.publish(projectId, {
        type: "message.created",
        payload: { sessionId: session.id, messageId: "msg_proj", role: "user" },
      });

      await new Promise((r) => setTimeout(r, 100));

      expect(ws.sentMessages.length).toBe(2);
      const events = ws.sentMessages.map((m) => JSON.parse(m));
      expect(events[0].type).toBe("session.created");
      expect(events[1].type).toBe("message.created");
    });
  });

  describe("high-volume streaming", () => {
    it("handles rapid event bursts", async () => {
      setupBusBridge();
      const db = DatabaseManager.getProjectDb(projectId);

      const session = SessionService.create(db, { title: "Burst Test", agent: "default" });

      const ws = createMockWs();
      ConnectionManager.add("conn_burst", {
        ws: ws,
        userId: "usr_burst",
        projectId,
        connectedAt: Date.now(),
        lastActivity: Date.now(),
      });
      RoomManager.join(getSessionRoom(session.id), "conn_burst");

      // Simulate rapid token streaming (100 deltas)
      const numDeltas = 100;
      for (let i = 0; i < numDeltas; i++) {
        EventBus.publish(projectId, {
          type: "message.text.delta",
          payload: {
            sessionId: session.id,
            messageId: "msg_burst",
            partId: "part_burst",
            delta: `t${i} `,
          },
        });
      }

      await new Promise((r) => setTimeout(r, 200));

      // All events should be received
      expect(ws.sentMessages.length).toBe(numDeltas);
    });
  });
});
