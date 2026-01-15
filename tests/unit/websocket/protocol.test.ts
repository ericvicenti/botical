import { describe, it, expect } from "bun:test";
import {
  WSRequest,
  WSResponse,
  WSEvent,
  RequestType,
  createResponse,
  createErrorResponse,
  createEvent,
} from "@/websocket/protocol.ts";

describe("Protocol schemas", () => {
  describe("WSRequest", () => {
    it("parses valid request", () => {
      const data = {
        id: "req_123",
        type: "ping",
        payload: {},
      };

      const result = WSRequest.parse(data);

      expect(result.id).toBe("req_123");
      expect(result.type).toBe("ping");
    });

    it("rejects invalid request type", () => {
      const data = {
        id: "req_123",
        type: "invalid_type",
      };

      expect(() => WSRequest.parse(data)).toThrow();
    });

    it("accepts all valid request types", () => {
      const validTypes = [
        "session.create",
        "session.list",
        "session.get",
        "session.delete",
        "message.send",
        "message.cancel",
        "message.retry",
        "tool.approve",
        "tool.reject",
        "subscribe",
        "unsubscribe",
        "ping",
      ];

      for (const type of validTypes) {
        const data = { id: "req_1", type };
        expect(() => WSRequest.parse(data)).not.toThrow();
      }
    });
  });

  describe("WSResponse", () => {
    it("parses success response", () => {
      const data = {
        id: "req_123",
        type: "response",
        success: true,
        payload: { data: "test" },
      };

      const result = WSResponse.parse(data);

      expect(result.success).toBe(true);
      expect(result.payload).toEqual({ data: "test" });
    });

    it("parses error response", () => {
      const data = {
        id: "req_123",
        type: "response",
        success: false,
        error: {
          code: "NOT_FOUND",
          message: "Resource not found",
        },
      };

      const result = WSResponse.parse(data);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("NOT_FOUND");
    });
  });

  describe("WSEvent", () => {
    it("parses valid event", () => {
      const data = {
        type: "message.text.delta",
        payload: { delta: "Hello" },
      };

      const result = WSEvent.parse(data);

      expect(result.type).toBe("message.text.delta");
      expect(result.payload).toEqual({ delta: "Hello" });
    });
  });
});

describe("Protocol helpers", () => {
  describe("createResponse", () => {
    it("creates success response", () => {
      const response = createResponse("req_123", { data: "test" });

      expect(response.id).toBe("req_123");
      expect(response.type).toBe("response");
      expect(response.success).toBe(true);
      expect(response.payload).toEqual({ data: "test" });
      expect(response.error).toBeUndefined();
    });

    it("creates response without payload", () => {
      const response = createResponse("req_123");

      expect(response.payload).toBeUndefined();
    });
  });

  describe("createErrorResponse", () => {
    it("creates error response", () => {
      const response = createErrorResponse("req_123", "NOT_FOUND", "Not found");

      expect(response.id).toBe("req_123");
      expect(response.type).toBe("response");
      expect(response.success).toBe(false);
      expect(response.error?.code).toBe("NOT_FOUND");
      expect(response.error?.message).toBe("Not found");
    });

    it("includes details when provided", () => {
      const response = createErrorResponse(
        "req_123",
        "VALIDATION_ERROR",
        "Invalid input",
        { field: "email" }
      );

      expect(response.error?.details).toEqual({ field: "email" });
    });
  });

  describe("createEvent", () => {
    it("creates event message", () => {
      const event = createEvent("message.created", {
        sessionId: "sess_1",
        messageId: "msg_1",
      });

      expect(event.type).toBe("message.created");
      expect(event.payload).toEqual({
        sessionId: "sess_1",
        messageId: "msg_1",
      });
    });
  });
});

describe("RequestType enum", () => {
  it("includes all expected request types", () => {
    const types = RequestType.options;

    expect(types).toContain("session.create");
    expect(types).toContain("session.list");
    expect(types).toContain("session.get");
    expect(types).toContain("session.delete");
    expect(types).toContain("message.send");
    expect(types).toContain("message.cancel");
    expect(types).toContain("message.retry");
    expect(types).toContain("tool.approve");
    expect(types).toContain("tool.reject");
    expect(types).toContain("subscribe");
    expect(types).toContain("unsubscribe");
    expect(types).toContain("ping");
  });
});
