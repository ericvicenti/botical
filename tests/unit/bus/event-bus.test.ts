import { describe, it, expect, beforeEach, mock, spyOn } from "bun:test";
import { EventBus } from "@/bus/event-bus.ts";
import type { BoticalEvent, EventEnvelope } from "@/bus/types.ts";

describe("EventBus", () => {
  beforeEach(() => {
    EventBus.clearAll();
  });

  describe("publish", () => {
    it("publishes project-scoped events", () => {
      const event: BoticalEvent = {
        type: "session.created",
        payload: {
          sessionId: "sess_123",
          title: "Test Session",
          agent: "default",
        },
      };

      const envelope = EventBus.publish("prj_abc", event);

      expect(envelope.id).toMatch(/^evt_/);
      expect(envelope.timestamp).toBeGreaterThan(0);
      expect(envelope.projectId).toBe("prj_abc");
      expect(envelope.event).toEqual(event);
    });

    it("notifies subscribers with matching pattern", async () => {
      const callback = mock();
      EventBus.subscribe("session.created", callback);

      const event: BoticalEvent = {
        type: "session.created",
        payload: {
          sessionId: "sess_123",
          title: "Test",
          agent: "default",
        },
      };

      EventBus.publish("prj_abc", event);

      // Wait for async callbacks
      await new Promise((r) => setTimeout(r, 10));

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          event,
          projectId: "prj_abc",
        })
      );
    });
  });

  describe("publishGlobal", () => {
    it("publishes global events without projectId", () => {
      const event: BoticalEvent = {
        type: "project.created",
        payload: {
          projectId: "prj_123",
          name: "Test Project",
          ownerId: "usr_456",
        },
      };

      const envelope = EventBus.publishGlobal(event);

      expect(envelope.projectId).toBeUndefined();
      expect(envelope.event).toEqual(event);
    });
  });

  describe("subscribe", () => {
    it("returns subscription with unsubscribe function", () => {
      const callback = mock();
      const sub = EventBus.subscribe("session.created", callback);

      expect(sub.id).toMatch(/^sub_/);
      expect(sub.pattern).toBe("session.created");
      expect(typeof sub.unsubscribe).toBe("function");
    });

    it("supports wildcard patterns", async () => {
      const callback = mock();
      EventBus.subscribe("session.*", callback);

      EventBus.publish("prj_abc", {
        type: "session.created",
        payload: { sessionId: "1", title: "Test", agent: "default" },
      });

      EventBus.publish("prj_abc", {
        type: "session.updated",
        payload: { sessionId: "1", changes: { title: "Updated" } },
      });

      EventBus.publish("prj_abc", {
        type: "session.deleted",
        payload: { sessionId: "1" },
      });

      await new Promise((r) => setTimeout(r, 10));

      expect(callback).toHaveBeenCalledTimes(3);
    });

    it("does not match non-matching patterns", async () => {
      const callback = mock();
      EventBus.subscribe("session.created", callback);

      EventBus.publish("prj_abc", {
        type: "message.created",
        payload: { sessionId: "1", messageId: "msg_1", role: "user" },
      });

      await new Promise((r) => setTimeout(r, 10));

      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe("subscribeProject", () => {
    it("only receives events for specified project", async () => {
      const callback = mock();
      EventBus.subscribeProject("prj_abc", "session.created", callback);

      // Event for subscribed project
      EventBus.publish("prj_abc", {
        type: "session.created",
        payload: { sessionId: "1", title: "Test", agent: "default" },
      });

      // Event for different project
      EventBus.publish("prj_xyz", {
        type: "session.created",
        payload: { sessionId: "2", title: "Other", agent: "default" },
      });

      await new Promise((r) => setTimeout(r, 10));

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: "prj_abc",
        })
      );
    });
  });

  describe("unsubscribe", () => {
    it("removes subscription by ID", async () => {
      const callback = mock();
      const sub = EventBus.subscribe("session.created", callback);

      const event: BoticalEvent = {
        type: "session.created",
        payload: { sessionId: "1", title: "Test", agent: "default" },
      };

      EventBus.publish("prj_abc", event);
      await new Promise((r) => setTimeout(r, 10));
      expect(callback).toHaveBeenCalledTimes(1);

      // Unsubscribe
      sub.unsubscribe();

      EventBus.publish("prj_abc", event);
      await new Promise((r) => setTimeout(r, 10));
      expect(callback).toHaveBeenCalledTimes(1); // Still 1
    });

    it("returns true when subscription existed", () => {
      const sub = EventBus.subscribe("session.created", mock());
      expect(EventBus.unsubscribe(sub.id)).toBe(true);
    });

    it("returns false when subscription did not exist", () => {
      expect(EventBus.unsubscribe("nonexistent")).toBe(false);
    });
  });

  describe("unsubscribeProject", () => {
    it("removes all subscriptions for a project", async () => {
      const callback1 = mock();
      const callback2 = mock();

      EventBus.subscribeProject("prj_abc", "session.created", callback1);
      EventBus.subscribeProject("prj_abc", "message.created", callback2);
      EventBus.subscribeProject("prj_xyz", "session.created", mock());

      const count = EventBus.unsubscribeProject("prj_abc");

      expect(count).toBe(2);

      // Verify subscriptions are removed
      EventBus.publish("prj_abc", {
        type: "session.created",
        payload: { sessionId: "1", title: "Test", agent: "default" },
      });

      await new Promise((r) => setTimeout(r, 10));
      expect(callback1).not.toHaveBeenCalled();
      expect(callback2).not.toHaveBeenCalled();
    });
  });

  describe("getRecentEvents", () => {
    it("returns recent events in order", () => {
      EventBus.publish("prj_1", {
        type: "session.created",
        payload: { sessionId: "1", title: "First", agent: "default" },
      });

      EventBus.publish("prj_1", {
        type: "session.created",
        payload: { sessionId: "2", title: "Second", agent: "default" },
      });

      const events = EventBus.getRecentEvents();

      expect(events).toHaveLength(2);
      expect(
        (events[0]?.event as { payload: { sessionId: string } }).payload
          .sessionId
      ).toBe("1");
      expect(
        (events[1]?.event as { payload: { sessionId: string } }).payload
          .sessionId
      ).toBe("2");
    });

    it("respects limit parameter", () => {
      for (let i = 0; i < 10; i++) {
        EventBus.publish("prj_1", {
          type: "session.created",
          payload: { sessionId: String(i), title: `Session ${i}`, agent: "default" },
        });
      }

      const events = EventBus.getRecentEvents(5);
      expect(events).toHaveLength(5);
    });
  });

  describe("getSubscriptionCount", () => {
    it("returns correct count", () => {
      expect(EventBus.getSubscriptionCount()).toBe(0);

      EventBus.subscribe("session.created", mock());
      expect(EventBus.getSubscriptionCount()).toBe(1);

      EventBus.subscribe("message.created", mock());
      expect(EventBus.getSubscriptionCount()).toBe(2);
    });
  });

  describe("error handling", () => {
    it("continues processing when subscriber throws", async () => {
      const errorCallback = mock(() => {
        throw new Error("Subscriber error");
      });
      const goodCallback = mock();

      // Suppress console.error for this test
      const consoleSpy = spyOn(console, "error").mockImplementation(() => {});

      EventBus.subscribe("session.created", errorCallback);
      EventBus.subscribe("session.created", goodCallback);

      EventBus.publish("prj_1", {
        type: "session.created",
        payload: { sessionId: "1", title: "Test", agent: "default" },
      });

      await new Promise((r) => setTimeout(r, 10));

      expect(errorCallback).toHaveBeenCalled();
      expect(goodCallback).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });
});
