import { describe, it, expect, beforeEach, mock } from "bun:test";
import { EventBus } from "@/bus/event-bus.ts";
import type { BoticalEvent, EventEnvelope } from "@/bus/types.ts";

describe("Event Propagation Integration", () => {
  beforeEach(() => {
    EventBus.clearAll();
  });

  describe("event flow", () => {
    it("propagates events to multiple subscribers", async () => {
      const callbacks = [mock(), mock(), mock()];

      callbacks.forEach((cb) => {
        EventBus.subscribe("session.created", cb);
      });

      const event: BoticalEvent = {
        type: "session.created",
        payload: {
          sessionId: "sess_multi",
          title: "Multi Subscriber Test",
          agent: "default",
        },
      };

      EventBus.publish("prj_test", event);

      await new Promise((r) => setTimeout(r, 20));

      callbacks.forEach((cb) => {
        expect(cb).toHaveBeenCalledTimes(1);
      });
    });

    it("delivers events in order", async () => {
      const receivedOrder: number[] = [];

      EventBus.subscribe("session.created", () => {
        receivedOrder.push(1);
      });

      EventBus.subscribe("session.created", () => {
        receivedOrder.push(2);
      });

      EventBus.subscribe("session.created", () => {
        receivedOrder.push(3);
      });

      EventBus.publish("prj_test", {
        type: "session.created",
        payload: { sessionId: "1", title: "Test", agent: "default" },
      });

      await new Promise((r) => setTimeout(r, 20));

      expect(receivedOrder).toEqual([1, 2, 3]);
    });
  });

  describe("pattern matching", () => {
    it("routes events to correct pattern subscribers", async () => {
      const sessionCallback = mock();
      const messageCallback = mock();
      const allCallback = mock();

      EventBus.subscribe("session.*", sessionCallback);
      EventBus.subscribe("message.*", messageCallback);
      EventBus.subscribe("session.created", allCallback);

      // Publish session events
      EventBus.publish("prj_1", {
        type: "session.created",
        payload: { sessionId: "1", title: "Test", agent: "default" },
      });

      EventBus.publish("prj_1", {
        type: "session.updated",
        payload: { sessionId: "1", changes: { title: "New Title" } },
      });

      // Publish message event
      EventBus.publish("prj_1", {
        type: "message.created",
        payload: { sessionId: "1", messageId: "msg_1", role: "user" },
      });

      await new Promise((r) => setTimeout(r, 20));

      // session.* should match 2 events
      expect(sessionCallback).toHaveBeenCalledTimes(2);

      // message.* should match 1 event
      expect(messageCallback).toHaveBeenCalledTimes(1);

      // session.created exact match should match 1 event
      expect(allCallback).toHaveBeenCalledTimes(1);
    });
  });

  describe("project scoping", () => {
    it("isolates events by project", async () => {
      const project1Callback = mock();
      const project2Callback = mock();
      const globalCallback = mock();

      EventBus.subscribeProject("prj_1", "session.*", project1Callback);
      EventBus.subscribeProject("prj_2", "session.*", project2Callback);
      EventBus.subscribe("session.*", globalCallback);

      // Events for project 1
      EventBus.publish("prj_1", {
        type: "session.created",
        payload: { sessionId: "1", title: "P1 Session", agent: "default" },
      });

      // Events for project 2
      EventBus.publish("prj_2", {
        type: "session.created",
        payload: { sessionId: "2", title: "P2 Session", agent: "default" },
      });

      EventBus.publish("prj_2", {
        type: "session.updated",
        payload: { sessionId: "2", changes: {} },
      });

      await new Promise((r) => setTimeout(r, 20));

      // Project-scoped subscribers only receive their project's events
      expect(project1Callback).toHaveBeenCalledTimes(1);
      expect(project2Callback).toHaveBeenCalledTimes(2);

      // Global subscriber receives all events
      expect(globalCallback).toHaveBeenCalledTimes(3);
    });
  });

  describe("subscription lifecycle", () => {
    it("handles dynamic subscription/unsubscription", async () => {
      const callback = mock();

      // Subscribe
      const sub = EventBus.subscribe("session.created", callback);

      // First event should be received
      EventBus.publish("prj_1", {
        type: "session.created",
        payload: { sessionId: "1", title: "First", agent: "default" },
      });

      await new Promise((r) => setTimeout(r, 10));
      expect(callback).toHaveBeenCalledTimes(1);

      // Unsubscribe
      sub.unsubscribe();

      // Second event should not be received
      EventBus.publish("prj_1", {
        type: "session.created",
        payload: { sessionId: "2", title: "Second", agent: "default" },
      });

      await new Promise((r) => setTimeout(r, 10));
      expect(callback).toHaveBeenCalledTimes(1); // Still 1
    });

    it("cleans up project subscriptions", async () => {
      const callback1 = mock();
      const callback2 = mock();

      EventBus.subscribeProject("prj_to_remove", "session.created", callback1);
      EventBus.subscribeProject("prj_to_remove", "message.created", callback2);
      EventBus.subscribeProject("prj_to_keep", "session.created", mock());

      // Unsubscribe all for one project
      const removed = EventBus.unsubscribeProject("prj_to_remove");
      expect(removed).toBe(2);

      // Events to removed project shouldn't be received
      EventBus.publish("prj_to_remove", {
        type: "session.created",
        payload: { sessionId: "1", title: "Test", agent: "default" },
      });

      await new Promise((r) => setTimeout(r, 10));

      expect(callback1).not.toHaveBeenCalled();
      expect(callback2).not.toHaveBeenCalled();
    });
  });

  describe("event logging", () => {
    it("maintains event history", () => {
      for (let i = 0; i < 50; i++) {
        EventBus.publish("prj_log", {
          type: "session.created",
          payload: { sessionId: String(i), title: `Session ${i}`, agent: "default" },
        });
      }

      const recentEvents = EventBus.getRecentEvents(20);
      expect(recentEvents).toHaveLength(20);

      // Should be most recent events
      const lastEvent = recentEvents[recentEvents.length - 1];
      expect(
        (lastEvent?.event as { payload: { sessionId: string } }).payload.sessionId
      ).toBe("49");
    });

    it("includes correct metadata in events", () => {
      EventBus.publish("prj_meta", {
        type: "session.created",
        payload: { sessionId: "meta_test", title: "Metadata Test", agent: "default" },
      });

      const events = EventBus.getRecentEvents(1);
      const envelope = events[0];

      expect(envelope).toBeDefined();
      expect(envelope?.id).toMatch(/^evt_/);
      expect(envelope?.timestamp).toBeGreaterThan(0);
      expect(envelope?.projectId).toBe("prj_meta");
      expect(envelope?.event.type).toBe("session.created");
    });
  });

  describe("error handling", () => {
    it("isolates subscriber errors", async () => {
      const successCallback = mock();
      const errorCallback = mock(() => {
        throw new Error("Subscriber failed");
      });

      EventBus.subscribe("session.created", errorCallback);
      EventBus.subscribe("session.created", successCallback);

      // Suppress console.error
      const originalError = console.error;
      console.error = () => {};

      EventBus.publish("prj_1", {
        type: "session.created",
        payload: { sessionId: "1", title: "Test", agent: "default" },
      });

      await new Promise((r) => setTimeout(r, 20));

      console.error = originalError;

      // Both should be called, even though one throws
      expect(errorCallback).toHaveBeenCalled();
      expect(successCallback).toHaveBeenCalled();
    });
  });

  describe("global events", () => {
    it("broadcasts global events without project scope", async () => {
      const callback = mock();

      EventBus.subscribe("project.created", callback);

      const envelope = EventBus.publishGlobal({
        type: "project.created",
        payload: {
          projectId: "prj_new",
          name: "New Project",
          ownerId: "usr_owner",
        },
      });

      await new Promise((r) => setTimeout(r, 10));

      expect(callback).toHaveBeenCalledTimes(1);
      expect(envelope.projectId).toBeUndefined();
    });
  });
});
