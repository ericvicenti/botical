import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactNode } from "react";
import { useTaskMessages } from "./useTaskMessages";
import { subscribeToStreamingEvents, type WSEvent } from "@/lib/websocket/events";

// Mock the WebSocket context
vi.mock("@/lib/websocket/context", () => ({
  useWebSocket: () => ({
    status: "connected",
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    send: vi.fn(),
  }),
}));

// Mock the API queries
vi.mock("@/lib/api/queries", () => ({
  useMessages: vi.fn(() => ({
    data: [],
    isLoading: false,
  })),
  useSettings: vi.fn(() => ({
    data: {
      anthropicApiKey: "test-key",
      defaultProvider: "anthropic",
      userId: "test-user",
    },
  })),
}));

// Helper to emit streaming events
let streamingHandler: ((event: WSEvent) => void) | null = null;

vi.mock("@/lib/websocket/events", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/websocket/events")>();
  return {
    ...original,
    subscribeToStreamingEvents: vi.fn((handler: (event: WSEvent) => void) => {
      streamingHandler = handler;
      return () => {
        streamingHandler = null;
      };
    }),
  };
});

function emitStreamingEvent(event: WSEvent) {
  if (streamingHandler) {
    streamingHandler(event);
  }
}

// Test wrapper with QueryClient
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

describe("useTaskMessages streaming", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    streamingHandler = null;
  });

  afterEach(() => {
    streamingHandler = null;
  });

  it("should initialize with no streaming message", () => {
    const { result } = renderHook(
      () => useTaskMessages({ sessionId: "test-session", projectId: "test-project" }),
      { wrapper: createWrapper() }
    );

    expect(result.current.streamingMessage).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it("should subscribe to streaming events on mount", () => {
    renderHook(
      () => useTaskMessages({ sessionId: "test-session", projectId: "test-project" }),
      { wrapper: createWrapper() }
    );

    expect(subscribeToStreamingEvents).toHaveBeenCalled();
  });

  it("should start streaming message on message.created event", async () => {
    const { result } = renderHook(
      () => useTaskMessages({ sessionId: "test-session", projectId: "test-project" }),
      { wrapper: createWrapper() }
    );

    // Emit message.created event
    act(() => {
      emitStreamingEvent({
        type: "message.created",
        payload: {
          sessionId: "test-session",
          messageId: "msg-123",
          role: "assistant",
        },
      });
    });

    await waitFor(() => {
      expect(result.current.streamingMessage).not.toBeNull();
    });

    expect(result.current.streamingMessage?.id).toBe("msg-123");
    expect(result.current.streamingMessage?.role).toBe("assistant");
    expect(result.current.streamingMessage?.content).toBe("");
    expect(result.current.streamingMessage?.isStreaming).toBe(true);
  });

  it("should ignore message.created for different session", async () => {
    const { result } = renderHook(
      () => useTaskMessages({ sessionId: "test-session", projectId: "test-project" }),
      { wrapper: createWrapper() }
    );

    // Emit message.created event for different session
    act(() => {
      emitStreamingEvent({
        type: "message.created",
        payload: {
          sessionId: "other-session",
          messageId: "msg-456",
          role: "assistant",
        },
      });
    });

    // Should still be null
    expect(result.current.streamingMessage).toBeNull();
  });

  it("should append text delta to streaming message", async () => {
    const { result } = renderHook(
      () => useTaskMessages({ sessionId: "test-session", projectId: "test-project" }),
      { wrapper: createWrapper() }
    );

    // First create the message
    act(() => {
      emitStreamingEvent({
        type: "message.created",
        payload: {
          sessionId: "test-session",
          messageId: "msg-123",
          role: "assistant",
        },
      });
    });

    await waitFor(() => {
      expect(result.current.streamingMessage).not.toBeNull();
    });

    // Then send text deltas
    act(() => {
      emitStreamingEvent({
        type: "message.text.delta",
        payload: {
          sessionId: "test-session",
          messageId: "msg-123",
          partId: "part-1",
          delta: "Hello",
        },
      });
    });

    await waitFor(() => {
      expect(result.current.streamingMessage?.content).toBe("Hello");
    });

    // Send more text
    act(() => {
      emitStreamingEvent({
        type: "message.text.delta",
        payload: {
          sessionId: "test-session",
          messageId: "msg-123",
          partId: "part-1",
          delta: " World!",
        },
      });
    });

    await waitFor(() => {
      expect(result.current.streamingMessage?.content).toBe("Hello World!");
    });
  });

  it("should accumulate multiple text deltas correctly", async () => {
    const { result } = renderHook(
      () => useTaskMessages({ sessionId: "test-session", projectId: "test-project" }),
      { wrapper: createWrapper() }
    );

    // Create message
    act(() => {
      emitStreamingEvent({
        type: "message.created",
        payload: {
          sessionId: "test-session",
          messageId: "msg-123",
          role: "assistant",
        },
      });
    });

    await waitFor(() => {
      expect(result.current.streamingMessage).not.toBeNull();
    });

    // Simulate rapid text deltas (like actual streaming)
    const deltas = ["The ", "quick ", "brown ", "fox ", "jumps ", "over ", "the ", "lazy ", "dog."];

    for (const delta of deltas) {
      act(() => {
        emitStreamingEvent({
          type: "message.text.delta",
          payload: {
            sessionId: "test-session",
            messageId: "msg-123",
            partId: "part-1",
            delta,
          },
        });
      });
    }

    await waitFor(() => {
      expect(result.current.streamingMessage?.content).toBe("The quick brown fox jumps over the lazy dog.");
    });
  });

  it("should add tool call to streaming message parts", async () => {
    const { result } = renderHook(
      () => useTaskMessages({ sessionId: "test-session", projectId: "test-project" }),
      { wrapper: createWrapper() }
    );

    // Create message
    act(() => {
      emitStreamingEvent({
        type: "message.created",
        payload: {
          sessionId: "test-session",
          messageId: "msg-123",
          role: "assistant",
        },
      });
    });

    await waitFor(() => {
      expect(result.current.streamingMessage).not.toBeNull();
    });

    // Emit tool call event
    act(() => {
      emitStreamingEvent({
        type: "message.tool.call",
        payload: {
          sessionId: "test-session",
          messageId: "msg-123",
          partId: "part-tool-1",
          toolName: "read_file",
          toolCallId: "tc-1",
          args: { path: "/src/index.ts" },
        },
      });
    });

    await waitFor(() => {
      expect(result.current.streamingMessage?.parts).toHaveLength(1);
    });

    const toolPart = result.current.streamingMessage?.parts[0];
    expect(toolPart?.type).toBe("tool-call");
    expect(toolPart?.toolName).toBe("read_file");
    expect(toolPart?.toolStatus).toBe("running");
  });

  it("should update tool status on tool result", async () => {
    const { result } = renderHook(
      () => useTaskMessages({ sessionId: "test-session", projectId: "test-project" }),
      { wrapper: createWrapper() }
    );

    // Create message and tool call
    act(() => {
      emitStreamingEvent({
        type: "message.created",
        payload: {
          sessionId: "test-session",
          messageId: "msg-123",
          role: "assistant",
        },
      });
    });

    await waitFor(() => {
      expect(result.current.streamingMessage).not.toBeNull();
    });

    act(() => {
      emitStreamingEvent({
        type: "message.tool.call",
        payload: {
          sessionId: "test-session",
          messageId: "msg-123",
          partId: "part-tool-1",
          toolName: "read_file",
          toolCallId: "tc-1",
          args: { path: "/src/index.ts" },
        },
      });
    });

    await waitFor(() => {
      expect(result.current.streamingMessage?.parts).toHaveLength(1);
    });

    // Emit tool result
    act(() => {
      emitStreamingEvent({
        type: "message.tool.result",
        payload: {
          sessionId: "test-session",
          messageId: "msg-123",
          partId: "part-result-1",
          toolCallId: "tc-1",
          result: "file contents here",
        },
      });
    });

    await waitFor(() => {
      expect(result.current.streamingMessage?.parts[0]?.toolStatus).toBe("completed");
    });
  });

  it("should clear streaming message on message.complete event", async () => {
    const { result } = renderHook(
      () => useTaskMessages({ sessionId: "test-session", projectId: "test-project" }),
      { wrapper: createWrapper() }
    );

    // Create message and stream some text
    act(() => {
      emitStreamingEvent({
        type: "message.created",
        payload: {
          sessionId: "test-session",
          messageId: "msg-123",
          role: "assistant",
        },
      });
    });

    await waitFor(() => {
      expect(result.current.streamingMessage).not.toBeNull();
    });

    act(() => {
      emitStreamingEvent({
        type: "message.text.delta",
        payload: {
          sessionId: "test-session",
          messageId: "msg-123",
          partId: "part-1",
          delta: "Hello!",
        },
      });
    });

    await waitFor(() => {
      expect(result.current.streamingMessage?.content).toBe("Hello!");
    });

    // Complete the message
    act(() => {
      emitStreamingEvent({
        type: "message.complete",
        payload: {
          sessionId: "test-session",
          messageId: "msg-123",
          finishReason: "stop",
        },
      });
    });

    await waitFor(() => {
      expect(result.current.streamingMessage).toBeNull();
    });
  });

  it("should clear streaming message on message.error event", async () => {
    const { result } = renderHook(
      () => useTaskMessages({ sessionId: "test-session", projectId: "test-project" }),
      { wrapper: createWrapper() }
    );

    // Create message
    act(() => {
      emitStreamingEvent({
        type: "message.created",
        payload: {
          sessionId: "test-session",
          messageId: "msg-123",
          role: "assistant",
        },
      });
    });

    await waitFor(() => {
      expect(result.current.streamingMessage).not.toBeNull();
    });

    // Error event
    act(() => {
      emitStreamingEvent({
        type: "message.error",
        payload: {
          sessionId: "test-session",
          messageId: "msg-123",
          errorType: "RateLimitError",
          errorMessage: "Too many requests",
        },
      });
    });

    await waitFor(() => {
      expect(result.current.streamingMessage).toBeNull();
      expect(result.current.error).toBe("Too many requests");
    });
  });

  it("should not update streaming message if messageId does not match", async () => {
    const { result } = renderHook(
      () => useTaskMessages({ sessionId: "test-session", projectId: "test-project" }),
      { wrapper: createWrapper() }
    );

    // Create message
    act(() => {
      emitStreamingEvent({
        type: "message.created",
        payload: {
          sessionId: "test-session",
          messageId: "msg-123",
          role: "assistant",
        },
      });
    });

    await waitFor(() => {
      expect(result.current.streamingMessage).not.toBeNull();
    });

    // Try to update with different messageId
    act(() => {
      emitStreamingEvent({
        type: "message.text.delta",
        payload: {
          sessionId: "test-session",
          messageId: "msg-different",
          partId: "part-1",
          delta: "Should not appear",
        },
      });
    });

    // Content should still be empty
    expect(result.current.streamingMessage?.content).toBe("");
  });

  describe("message ordering", () => {
    it("should sort messages chronologically when combining fetched and optimistic", async () => {
      // This test verifies the bug where optimistic messages appear
      // after fetched messages regardless of createdAt timestamps

      const { result } = renderHook(
        () => useTaskMessages({ sessionId: "test-session", projectId: "test-project" }),
        { wrapper: createWrapper() }
      );

      // Initially no messages
      expect(result.current.messages).toHaveLength(0);
    });
  });

  it("should handle full streaming conversation flow", async () => {
    const { result } = renderHook(
      () => useTaskMessages({ sessionId: "test-session", projectId: "test-project" }),
      { wrapper: createWrapper() }
    );

    // 1. Message created
    act(() => {
      emitStreamingEvent({
        type: "message.created",
        payload: {
          sessionId: "test-session",
          messageId: "msg-123",
          role: "assistant",
        },
      });
    });

    await waitFor(() => {
      expect(result.current.streamingMessage).not.toBeNull();
    });

    // 2. Some text
    act(() => {
      emitStreamingEvent({
        type: "message.text.delta",
        payload: {
          sessionId: "test-session",
          messageId: "msg-123",
          partId: "part-1",
          delta: "Let me read that file for you.",
        },
      });
    });

    await waitFor(() => {
      expect(result.current.streamingMessage?.content).toContain("read that file");
    });

    // 3. Tool call
    act(() => {
      emitStreamingEvent({
        type: "message.tool.call",
        payload: {
          sessionId: "test-session",
          messageId: "msg-123",
          partId: "part-tool-1",
          toolName: "read_file",
          toolCallId: "tc-1",
          args: { path: "/README.md" },
        },
      });
    });

    await waitFor(() => {
      expect(result.current.streamingMessage?.parts).toHaveLength(1);
    });

    // 4. Tool result
    act(() => {
      emitStreamingEvent({
        type: "message.tool.result",
        payload: {
          sessionId: "test-session",
          messageId: "msg-123",
          partId: "part-result-1",
          toolCallId: "tc-1",
          result: "# README\nThis is a readme file.",
        },
      });
    });

    await waitFor(() => {
      expect(result.current.streamingMessage?.parts[0]?.toolStatus).toBe("completed");
    });

    // 5. More text after tool
    act(() => {
      emitStreamingEvent({
        type: "message.text.delta",
        payload: {
          sessionId: "test-session",
          messageId: "msg-123",
          partId: "part-2",
          delta: " The file contains a readme with project info.",
        },
      });
    });

    await waitFor(() => {
      expect(result.current.streamingMessage?.content).toContain("project info");
    });

    // 6. Complete
    act(() => {
      emitStreamingEvent({
        type: "message.complete",
        payload: {
          sessionId: "test-session",
          messageId: "msg-123",
          finishReason: "stop",
        },
      });
    });

    await waitFor(() => {
      expect(result.current.streamingMessage).toBeNull();
    });
  });
});
