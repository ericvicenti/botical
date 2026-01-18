import { useState, useEffect, useCallback, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useWebSocket } from "@/lib/websocket/context";
import { subscribeToStreamingEvents, type WSEvent } from "@/lib/websocket/events";
import { useMessages, useSettings } from "@/lib/api/queries";
import type { MessageWithParts, MessagePart } from "@/lib/api/types";

// Debug logging
const DEBUG = true;
function log(context: string, message: string, data?: unknown) {
  if (DEBUG) {
    console.log(`[useTaskMessages:${context}]`, message, data !== undefined ? data : "");
  }
}

interface StreamingMessage {
  id: string;
  sessionId: string;
  role: "assistant";
  content: string;
  isStreaming: boolean;
  parts: MessagePart[];
}

interface UseTaskMessagesOptions {
  sessionId: string;
  projectId: string;
}

interface UseTaskMessagesResult {
  messages: MessageWithParts[];
  streamingMessage: StreamingMessage | null;
  isLoading: boolean;
  isSending: boolean;
  sendMessage: (content: string) => Promise<void>;
  error: string | null;
}

export function useTaskMessages({ sessionId, projectId }: UseTaskMessagesOptions): UseTaskMessagesResult {
  const queryClient = useQueryClient();
  const { data: fetchedMessages, isLoading } = useMessages(sessionId, projectId);
  const { data: settings } = useSettings();
  const { subscribe, unsubscribe, status } = useWebSocket();

  const [optimisticMessages, setOptimisticMessages] = useState<MessageWithParts[]>([]);
  const [streamingMessage, setStreamingMessage] = useState<StreamingMessage | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Track render count for debugging
  const renderCount = useRef(0);
  renderCount.current++;

  log("render", `Render #${renderCount.current}`, {
    sessionId,
    isLoading,
    fetchedMessagesCount: fetchedMessages?.length ?? 0,
    optimisticMessagesCount: optimisticMessages.length,
    isSending,
    wsStatus: status,
  });

  // Subscribe to session room when connected
  useEffect(() => {
    if (status === "connected" && sessionId) {
      log("ws", `Subscribing to session:${sessionId}`);
      subscribe(`session:${sessionId}`);
      return () => {
        log("ws", `Unsubscribing from session:${sessionId}`);
        unsubscribe(`session:${sessionId}`);
      };
    }
  }, [status, sessionId, subscribe, unsubscribe]);

  // Handle streaming events from WebSocket
  useEffect(() => {
    const handleStreamingEvent = (event: WSEvent) => {
      // Only handle events for this session
      if (event.payload.sessionId !== sessionId) return;

      log("streaming", `Received streaming event: ${event.type}`, event.payload);

      switch (event.type) {
        case "message.created":
          // Start streaming state when assistant message is created
          if (event.payload.role === "assistant") {
            log("streaming", "Starting streaming message", { messageId: event.payload.messageId });
            setStreamingMessage({
              id: event.payload.messageId as string,
              sessionId,
              role: "assistant",
              content: "",
              isStreaming: true,
              parts: [],
            });
          }
          break;

        case "message.text.delta":
          // Append text delta to streaming message
          setStreamingMessage((prev) => {
            if (!prev || prev.id !== event.payload.messageId) return prev;
            const newContent = prev.content + (event.payload.delta as string);
            log("streaming", "Appending text delta", { newLength: newContent.length });
            return {
              ...prev,
              content: newContent,
            };
          });
          break;

        case "message.tool.call":
          // Add tool call to streaming message parts
          setStreamingMessage((prev) => {
            if (!prev || prev.id !== event.payload.messageId) return prev;
            const toolPart: MessagePart = {
              id: event.payload.partId as string,
              messageId: prev.id,
              sessionId,
              type: "tool-call",
              content: { name: event.payload.toolName, args: event.payload.args },
              toolName: event.payload.toolName as string,
              toolCallId: event.payload.toolCallId as string,
              toolStatus: "running",
              createdAt: Date.now(),
              updatedAt: Date.now(),
            };
            log("streaming", "Adding tool call", { toolName: event.payload.toolName });
            return {
              ...prev,
              parts: [...prev.parts, toolPart],
            };
          });
          break;

        case "message.tool.result":
          // Update tool call status and add result
          setStreamingMessage((prev) => {
            if (!prev || prev.id !== event.payload.messageId) return prev;
            const updatedParts = prev.parts.map((part) => {
              if (part.toolCallId === event.payload.toolCallId) {
                return { ...part, toolStatus: "completed" as const };
              }
              return part;
            });
            log("streaming", "Tool result received", { toolCallId: event.payload.toolCallId });
            return {
              ...prev,
              parts: updatedParts,
            };
          });
          break;

        case "message.complete":
          // Clear streaming state - data will be refetched
          log("streaming", "Message complete, clearing streaming state");
          setStreamingMessage(null);
          break;

        case "message.error":
          // Clear streaming state on error
          log("streaming", "Message error, clearing streaming state", {
            errorType: event.payload.errorType,
            errorMessage: event.payload.errorMessage,
          });
          setStreamingMessage(null);
          setError((event.payload.errorMessage as string) || "An error occurred");
          break;
      }
    };

    const unsubscribe = subscribeToStreamingEvents(handleStreamingEvent);
    return unsubscribe;
  }, [sessionId]);

  // Log when fetched messages change
  useEffect(() => {
    log("fetchedMessages", "Fetched messages updated", {
      count: fetchedMessages?.length ?? 0,
      messages: fetchedMessages?.map(m => ({
        id: m.id,
        role: m.role,
        completedAt: m.completedAt,
        partsCount: m.parts?.length ?? 0,
      })),
    });
  }, [fetchedMessages]);

  // Clear streaming state when messages update
  useEffect(() => {
    if (fetchedMessages && fetchedMessages.length > 0) {
      // Check if we have a completed assistant message
      const lastMessage = fetchedMessages[fetchedMessages.length - 1];
      log("checkStreaming", "Checking last message for completion", {
        lastMessageId: lastMessage?.id,
        role: lastMessage?.role,
        completedAt: lastMessage?.completedAt,
      });
      if (lastMessage?.role === "assistant" && lastMessage?.completedAt) {
        log("checkStreaming", "Clearing streaming message - assistant completed");
        setStreamingMessage(null);
      }
    }
  }, [fetchedMessages]);

  const sendMessage = useCallback(async (content: string) => {
    log("sendMessage", "Starting sendMessage", { content: content.substring(0, 50), isSending, hasSettings: !!settings });

    if (!settings || isSending) {
      log("sendMessage", "Aborting - no settings or already sending");
      return;
    }

    setError(null);
    setIsSending(true);

    // Create optimistic user message
    const optimisticId = `optimistic-${Date.now()}`;
    const optimisticMessage: MessageWithParts = {
      id: optimisticId,
      sessionId,
      role: "user",
      parentId: null,
      finishReason: null,
      cost: 0,
      tokensInput: 0,
      tokensOutput: 0,
      tokensReasoning: 0,
      errorType: null,
      errorMessage: null,
      createdAt: Date.now(),
      completedAt: Date.now(),
      parts: [{
        id: `${optimisticId}-part`,
        messageId: optimisticId,
        sessionId,
        type: "text",
        content: { text: content },
        toolName: null,
        toolCallId: null,
        toolStatus: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }],
    };

    log("sendMessage", "Adding optimistic message", { optimisticId });
    setOptimisticMessages(prev => {
      log("sendMessage", "setOptimisticMessages callback", { prevCount: prev.length });
      return [...prev, optimisticMessage];
    });

    // Get API key for the selected provider
    const apiKey = settings.defaultProvider === "anthropic"
      ? settings.anthropicApiKey
      : settings.defaultProvider === "openai"
      ? settings.openaiApiKey
      : settings.googleApiKey;

    // Send via REST API (WebSocket message.send requires more setup)
    log("sendMessage", "Sending API request");
    try {
      const response = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          sessionId,
          content,
          userId: settings.userId,
          providerId: settings.defaultProvider,
          apiKey,
          modelId: settings.defaultProvider === "anthropic" ? "claude-3-5-haiku-20241022" : undefined,
        }),
      });

      const data = await response.json();
      log("sendMessage", "API response received", { ok: response.ok, data });

      if (!response.ok) {
        throw new Error(data.error?.message || "Failed to send message");
      }

      // Success - refetch messages first, then clear optimistic ones
      log("sendMessage", "API success - refetching messages");
      setIsSending(false);

      log("sendMessage", "Starting refetchQueries");
      await queryClient.refetchQueries({
        queryKey: ["sessions", sessionId, "messages"],
      });
      log("sendMessage", "refetchQueries completed");

      // Now that fresh data is loaded, clear optimistic messages
      log("sendMessage", "Clearing optimistic messages");
      setOptimisticMessages([]);
      log("sendMessage", "sendMessage complete");
    } catch (err) {
      log("sendMessage", "Error occurred", { error: err });
      setError(err instanceof Error ? err.message : "Failed to send message");
      setOptimisticMessages([]);
      setIsSending(false);
    }
  }, [settings, isSending, sessionId, projectId, queryClient]);

  // Combine fetched messages with optimistic ones
  const messages = [
    ...(fetchedMessages || []),
    ...optimisticMessages,
  ];

  // Log the combined messages
  log("messages", "Combined messages", {
    total: messages.length,
    fromFetched: fetchedMessages?.length ?? 0,
    fromOptimistic: optimisticMessages.length,
    messageIds: messages.map(m => ({ id: m.id, role: m.role })),
  });

  return {
    messages,
    streamingMessage,
    isLoading,
    isSending,
    sendMessage,
    error,
  };
}
