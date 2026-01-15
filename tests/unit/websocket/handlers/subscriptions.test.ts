import { describe, it, expect, beforeEach, mock } from "bun:test";
import { SubscriptionHandlers } from "@/websocket/handlers/subscriptions.ts";
import { RoomManager } from "@/websocket/rooms.ts";
import { ConnectionManager } from "@/websocket/connections.ts";
import type { WSData } from "@/websocket/connections.ts";

describe("SubscriptionHandlers", () => {
  const mockCtx: WSData = {
    userId: "usr_test",
    projectId: "prj_test",
    connectionId: "conn_test",
  };

  beforeEach(() => {
    RoomManager.clear();
    ConnectionManager.clear();
  });

  describe("subscribe", () => {
    it("subscribes to a session channel", async () => {
      const result = await SubscriptionHandlers.subscribe(
        { channel: "session:sess_123" },
        mockCtx
      );

      expect(result).toEqual({
        subscribed: true,
        channel: "session:sess_123",
      });
      expect(RoomManager.isMember("session:sess_123", mockCtx.connectionId)).toBe(true);
    });

    it("subscribes to own project channel", async () => {
      const result = await SubscriptionHandlers.subscribe(
        { channel: "project:prj_test" },
        mockCtx
      );

      expect(result).toEqual({
        subscribed: true,
        channel: "project:prj_test",
      });
      expect(RoomManager.isMember("project:prj_test", mockCtx.connectionId)).toBe(true);
    });

    it("rejects subscription to different project", async () => {
      await expect(
        SubscriptionHandlers.subscribe(
          { channel: "project:prj_other" },
          mockCtx
        )
      ).rejects.toThrow("Cannot subscribe to events from another project");
    });

    it("rejects invalid channel format", async () => {
      await expect(
        SubscriptionHandlers.subscribe({ channel: "invalid_channel" }, mockCtx)
      ).rejects.toThrow("Invalid channel");
    });

    it("validates payload schema", async () => {
      await expect(
        SubscriptionHandlers.subscribe({}, mockCtx)
      ).rejects.toThrow();

      await expect(
        SubscriptionHandlers.subscribe({ channel: 123 }, mockCtx)
      ).rejects.toThrow();
    });
  });

  describe("unsubscribe", () => {
    it("unsubscribes from a channel", async () => {
      // First subscribe
      RoomManager.join("session:sess_123", mockCtx.connectionId);
      expect(RoomManager.isMember("session:sess_123", mockCtx.connectionId)).toBe(true);

      // Then unsubscribe
      const result = await SubscriptionHandlers.unsubscribe(
        { channel: "session:sess_123" },
        mockCtx
      );

      expect(result).toEqual({
        unsubscribed: true,
        channel: "session:sess_123",
      });
      expect(RoomManager.isMember("session:sess_123", mockCtx.connectionId)).toBe(false);
    });

    it("succeeds even when not subscribed", async () => {
      const result = await SubscriptionHandlers.unsubscribe(
        { channel: "session:sess_nonexistent" },
        mockCtx
      );

      expect(result).toEqual({
        unsubscribed: true,
        channel: "session:sess_nonexistent",
      });
    });

    it("validates payload schema", async () => {
      await expect(
        SubscriptionHandlers.unsubscribe({}, mockCtx)
      ).rejects.toThrow();
    });
  });
});
