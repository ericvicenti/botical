import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import {
  handleWebSocketEvent,
  subscribeToStreamingEvents,
  type WSEvent,
} from "./events";

describe("WebSocket Events", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
  });

  afterEach(() => {
    queryClient.clear();
  });

  describe("subscribeToStreamingEvents", () => {
    it("should allow subscribing to streaming events", () => {
      const handler = vi.fn();
      const unsubscribe = subscribeToStreamingEvents(handler);

      expect(typeof unsubscribe).toBe("function");
      unsubscribe();
    });

    it("should call handler when streaming event is received", () => {
      const handler = vi.fn();
      subscribeToStreamingEvents(handler);

      const event: WSEvent = {
        type: "message.created",
        payload: {
          sessionId: "ses-123",
          messageId: "msg-456",
          role: "assistant",
        },
      };

      handleWebSocketEvent(event, queryClient);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(event);
    });

    it("should call handler for message.text.delta events", () => {
      const handler = vi.fn();
      subscribeToStreamingEvents(handler);

      const event: WSEvent = {
        type: "message.text.delta",
        payload: {
          sessionId: "ses-123",
          messageId: "msg-456",
          partId: "part-1",
          delta: "Hello",
        },
      };

      handleWebSocketEvent(event, queryClient);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(event);
    });

    it("should call handler for message.tool.call events", () => {
      const handler = vi.fn();
      subscribeToStreamingEvents(handler);

      const event: WSEvent = {
        type: "message.tool.call",
        payload: {
          sessionId: "ses-123",
          messageId: "msg-456",
          partId: "part-1",
          toolName: "read_file",
          toolCallId: "tc-1",
          args: { path: "/test.txt" },
        },
      };

      handleWebSocketEvent(event, queryClient);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(event);
    });

    it("should call handler for message.tool.result events", () => {
      const handler = vi.fn();
      subscribeToStreamingEvents(handler);

      const event: WSEvent = {
        type: "message.tool.result",
        payload: {
          sessionId: "ses-123",
          messageId: "msg-456",
          partId: "part-2",
          toolCallId: "tc-1",
          result: "file contents",
        },
      };

      handleWebSocketEvent(event, queryClient);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(event);
    });

    it("should call handler for message.complete events", () => {
      const handler = vi.fn();
      subscribeToStreamingEvents(handler);

      const event: WSEvent = {
        type: "message.complete",
        payload: {
          sessionId: "ses-123",
          messageId: "msg-456",
          finishReason: "stop",
        },
      };

      handleWebSocketEvent(event, queryClient);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(event);
    });

    it("should call handler for message.error events", () => {
      const handler = vi.fn();
      subscribeToStreamingEvents(handler);

      const event: WSEvent = {
        type: "message.error",
        payload: {
          sessionId: "ses-123",
          messageId: "msg-456",
          errorType: "RateLimitError",
          errorMessage: "Too many requests",
        },
      };

      handleWebSocketEvent(event, queryClient);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(event);
    });

    it("should call multiple handlers for the same event", () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      subscribeToStreamingEvents(handler1);
      subscribeToStreamingEvents(handler2);

      const event: WSEvent = {
        type: "message.text.delta",
        payload: {
          sessionId: "ses-123",
          messageId: "msg-456",
          partId: "part-1",
          delta: "Hello",
        },
      };

      handleWebSocketEvent(event, queryClient);

      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
    });

    it("should not call handler after unsubscribe", () => {
      const handler = vi.fn();
      const unsubscribe = subscribeToStreamingEvents(handler);

      // Unsubscribe before event
      unsubscribe();

      const event: WSEvent = {
        type: "message.text.delta",
        payload: {
          sessionId: "ses-123",
          messageId: "msg-456",
          partId: "part-1",
          delta: "Hello",
        },
      };

      handleWebSocketEvent(event, queryClient);

      expect(handler).not.toHaveBeenCalled();
    });

    it("should handle rapid sequential events", () => {
      const handler = vi.fn();
      subscribeToStreamingEvents(handler);

      const deltas = ["The ", "quick ", "brown ", "fox"];

      for (const delta of deltas) {
        handleWebSocketEvent(
          {
            type: "message.text.delta",
            payload: {
              sessionId: "ses-123",
              messageId: "msg-456",
              partId: "part-1",
              delta,
            },
          },
          queryClient
        );
      }

      expect(handler).toHaveBeenCalledTimes(4);
    });
  });

  describe("query invalidation", () => {
    it("should invalidate messages query on message.complete", () => {
      const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

      handleWebSocketEvent(
        {
          type: "message.complete",
          payload: {
            sessionId: "ses-123",
            messageId: "msg-456",
          },
        },
        queryClient
      );

      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ["sessions", "ses-123", "messages"],
      });
    });

    it("should invalidate messages query on message.error", () => {
      const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

      handleWebSocketEvent(
        {
          type: "message.error",
          payload: {
            sessionId: "ses-123",
            messageId: "msg-456",
            errorType: "Error",
            errorMessage: "Something went wrong",
          },
        },
        queryClient
      );

      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ["sessions", "ses-123", "messages"],
      });
    });

    it("should NOT invalidate queries on message.text.delta", () => {
      const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

      handleWebSocketEvent(
        {
          type: "message.text.delta",
          payload: {
            sessionId: "ses-123",
            messageId: "msg-456",
            partId: "part-1",
            delta: "Hello",
          },
        },
        queryClient
      );

      expect(invalidateSpy).not.toHaveBeenCalled();
    });

    it("should NOT invalidate queries on message.created", () => {
      const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

      handleWebSocketEvent(
        {
          type: "message.created",
          payload: {
            sessionId: "ses-123",
            messageId: "msg-456",
            role: "assistant",
          },
        },
        queryClient
      );

      expect(invalidateSpy).not.toHaveBeenCalled();
    });
  });

  describe("non-streaming events", () => {
    it("should NOT call streaming handlers for session events", () => {
      const handler = vi.fn();
      subscribeToStreamingEvents(handler);

      handleWebSocketEvent(
        {
          type: "session.created",
          payload: {
            sessionId: "ses-123",
            projectId: "proj-1",
          },
        },
        queryClient
      );

      expect(handler).not.toHaveBeenCalled();
    });

    it("should NOT call streaming handlers for process events", () => {
      const handler = vi.fn();
      subscribeToStreamingEvents(handler);

      handleWebSocketEvent(
        {
          type: "process.output",
          payload: {
            id: "proc-1",
            data: "output",
          },
        },
        queryClient
      );

      expect(handler).not.toHaveBeenCalled();
    });
  });
});
