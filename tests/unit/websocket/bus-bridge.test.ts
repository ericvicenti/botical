import { describe, it, expect, beforeEach, afterEach, mock, spyOn } from "bun:test";
import {
  setupBusBridge,
  teardownBusBridge,
  getBridgeSubscriptionCount,
} from "@/websocket/bus-bridge.ts";
import { EventBus } from "@/bus/index.ts";
import { RoomManager, getProjectRoom, getSessionRoom } from "@/websocket/rooms.ts";
import { ConnectionManager } from "@/websocket/connections.ts";

describe("Bus Bridge", () => {
  beforeEach(() => {
    EventBus.clearAll();
    RoomManager.clear();
    ConnectionManager.clear();
    teardownBusBridge();
  });

  afterEach(() => {
    teardownBusBridge();
  });

  describe("setupBusBridge", () => {
    it("creates subscriptions for event types", () => {
      expect(getBridgeSubscriptionCount()).toBe(0);

      setupBusBridge();

      expect(getBridgeSubscriptionCount()).toBeGreaterThan(0);
    });

    it("subscribes to session events", () => {
      setupBusBridge();

      // Should have subscriptions for session.*, message.*, file.*, project.*
      expect(getBridgeSubscriptionCount()).toBe(4);
    });
  });

  describe("teardownBusBridge", () => {
    it("removes all bridge subscriptions", () => {
      setupBusBridge();
      expect(getBridgeSubscriptionCount()).toBeGreaterThan(0);

      teardownBusBridge();

      expect(getBridgeSubscriptionCount()).toBe(0);
    });

    it("is safe to call multiple times", () => {
      teardownBusBridge();
      teardownBusBridge();

      expect(getBridgeSubscriptionCount()).toBe(0);
    });
  });

  describe("event routing", () => {
    let broadcastSpy: ReturnType<typeof spyOn>;

    beforeEach(() => {
      broadcastSpy = spyOn(RoomManager, "broadcast").mockReturnValue(0);
      setupBusBridge();
    });

    afterEach(() => {
      broadcastSpy.mockRestore();
    });

    it("routes session.created events to project room", async () => {
      EventBus.publish("prj_test", {
        type: "session.created",
        payload: {
          sessionId: "sess_123",
          title: "Test Session",
          agent: "default",
        },
      });

      await new Promise((r) => setTimeout(r, 10));

      expect(broadcastSpy).toHaveBeenCalledWith(
        getProjectRoom("prj_test"),
        expect.objectContaining({
          type: "session.created",
        })
      );
    });

    it("routes session.updated events to project room", async () => {
      EventBus.publish("prj_test", {
        type: "session.updated",
        payload: {
          sessionId: "sess_123",
          changes: { title: "Updated Title" },
        },
      });

      await new Promise((r) => setTimeout(r, 10));

      expect(broadcastSpy).toHaveBeenCalledWith(
        getProjectRoom("prj_test"),
        expect.objectContaining({
          type: "session.updated",
        })
      );
    });

    it("routes session.deleted events to project room", async () => {
      EventBus.publish("prj_test", {
        type: "session.deleted",
        payload: { sessionId: "sess_123" },
      });

      await new Promise((r) => setTimeout(r, 10));

      expect(broadcastSpy).toHaveBeenCalledWith(
        getProjectRoom("prj_test"),
        expect.objectContaining({
          type: "session.deleted",
        })
      );
    });

    it("routes message events to both session and project rooms", async () => {
      EventBus.publish("prj_test", {
        type: "message.created",
        payload: {
          sessionId: "sess_123",
          messageId: "msg_1",
          role: "user",
        },
      });

      await new Promise((r) => setTimeout(r, 10));

      expect(broadcastSpy).toHaveBeenCalledWith(
        getSessionRoom("sess_123"),
        expect.objectContaining({
          type: "message.created",
        })
      );

      expect(broadcastSpy).toHaveBeenCalledWith(
        getProjectRoom("prj_test"),
        expect.objectContaining({
          type: "message.created",
        })
      );
    });

    it("routes message.text.delta events", async () => {
      EventBus.publish("prj_test", {
        type: "message.text.delta",
        payload: {
          sessionId: "sess_123",
          messageId: "msg_1",
          delta: "Hello",
        },
      });

      await new Promise((r) => setTimeout(r, 10));

      expect(broadcastSpy).toHaveBeenCalledWith(
        getSessionRoom("sess_123"),
        expect.objectContaining({
          type: "message.text.delta",
        })
      );
    });

    it("routes message.tool.call events", async () => {
      EventBus.publish("prj_test", {
        type: "message.tool.call",
        payload: {
          sessionId: "sess_123",
          messageId: "msg_1",
          toolCallId: "tool_1",
          name: "test_tool",
        },
      });

      await new Promise((r) => setTimeout(r, 10));

      expect(broadcastSpy).toHaveBeenCalledWith(
        getSessionRoom("sess_123"),
        expect.objectContaining({
          type: "message.tool.call",
        })
      );
    });

    it("routes message.tool.result events", async () => {
      EventBus.publish("prj_test", {
        type: "message.tool.result",
        payload: {
          sessionId: "sess_123",
          messageId: "msg_1",
          toolCallId: "tool_1",
          result: "success",
        },
      });

      await new Promise((r) => setTimeout(r, 10));

      expect(broadcastSpy).toHaveBeenCalledWith(
        getSessionRoom("sess_123"),
        expect.objectContaining({
          type: "message.tool.result",
        })
      );
    });

    it("routes message.complete events", async () => {
      EventBus.publish("prj_test", {
        type: "message.complete",
        payload: {
          sessionId: "sess_123",
          messageId: "msg_1",
          finishReason: "end_turn",
        },
      });

      await new Promise((r) => setTimeout(r, 10));

      expect(broadcastSpy).toHaveBeenCalledWith(
        getSessionRoom("sess_123"),
        expect.objectContaining({
          type: "message.complete",
        })
      );
    });

    it("routes message.error events", async () => {
      EventBus.publish("prj_test", {
        type: "message.error",
        payload: {
          sessionId: "sess_123",
          messageId: "msg_1",
          error: "Test error",
        },
      });

      await new Promise((r) => setTimeout(r, 10));

      expect(broadcastSpy).toHaveBeenCalledWith(
        getSessionRoom("sess_123"),
        expect.objectContaining({
          type: "message.error",
        })
      );
    });

    it("routes file.updated events to project room", async () => {
      EventBus.publish("prj_test", {
        type: "file.updated",
        payload: {
          fileId: "file_123",
          path: "/test/file.txt",
        },
      });

      await new Promise((r) => setTimeout(r, 10));

      expect(broadcastSpy).toHaveBeenCalledWith(
        getProjectRoom("prj_test"),
        expect.objectContaining({
          type: "file.updated",
        })
      );
    });

    it("routes file.deleted events to project room", async () => {
      EventBus.publish("prj_test", {
        type: "file.deleted",
        payload: {
          fileId: "file_123",
          path: "/test/file.txt",
        },
      });

      await new Promise((r) => setTimeout(r, 10));

      expect(broadcastSpy).toHaveBeenCalledWith(
        getProjectRoom("prj_test"),
        expect.objectContaining({
          type: "file.deleted",
        })
      );
    });

    it("ignores events without projectId", async () => {
      // Use publishGlobal which doesn't include projectId
      EventBus.publishGlobal({
        type: "session.created",
        payload: { sessionId: "sess_123", title: "Test", agent: "default" },
      });

      await new Promise((r) => setTimeout(r, 10));

      expect(broadcastSpy).not.toHaveBeenCalled();
    });

    it("ignores events without known mapping", async () => {
      EventBus.publish("prj_test", {
        type: "unknown.event" as any,
        payload: { data: "test" },
      });

      await new Promise((r) => setTimeout(r, 10));

      // Should not broadcast unknown events
      expect(broadcastSpy).not.toHaveBeenCalled();
    });

    it("ignores message events without sessionId", async () => {
      EventBus.publish("prj_test", {
        type: "message.created",
        payload: {
          messageId: "msg_1",
          role: "user",
          // No sessionId
        },
      });

      await new Promise((r) => setTimeout(r, 10));

      // Should not broadcast to session room without sessionId
      expect(broadcastSpy).not.toHaveBeenCalledWith(
        expect.stringMatching(/^session:/),
        expect.any(Object)
      );
    });
  });
});
