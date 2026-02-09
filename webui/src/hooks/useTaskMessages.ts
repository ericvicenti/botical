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

interface SendMessageOptions {
  agentName?: string;
  providerId?: string;
  modelId?: string;
  canExecuteCode?: boolean;
  enabledTools?: string[];
}

interface UseTaskMessagesResult {
  messages: MessageWithParts[];
  streamingMessage: StreamingMessage | null;
  isLoading: boolean;
  isSending: boolean;
  sendMessage: (content: string, options?: SendMessageOptions) => Promise<void>;
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
          // Append text delta as a part to maintain order with tool calls
          // Also update the aggregate content field for easy access
          setStreamingMessage((prev) => {
            if (!prev || prev.id !== event.payload.messageId) return prev;
            const partId = event.payload.partId as string;
            const delta = event.payload.delta as string;

            // Update the aggregate content
            const newContent = prev.content + delta;

            // Find if we already have this text part
            const existingPartIndex = prev.parts.findIndex(p => p.id === partId);

            if (existingPartIndex >= 0) {
              // Update existing text part
              const updatedParts = [...prev.parts];
              const existingPart = updatedParts[existingPartIndex];
              updatedParts[existingPartIndex] = {
                ...existingPart,
                content: { text: ((existingPart.content as { text: string }).text || "") + delta },
              };
              log("streaming", "Updating text part", { partId, newLength: ((updatedParts[existingPartIndex].content as { text: string }).text || "").length });
              return { ...prev, content: newContent, parts: updatedParts };
            } else {
              // Create new text part
              const textPart: MessagePart = {
                id: partId,
                messageId: prev.id,
                sessionId,
                type: "text",
                content: { text: delta },
                toolName: null,
                toolCallId: null,
                toolStatus: null,
                createdAt: Date.now(),
                updatedAt: Date.now(),
              };
              log("streaming", "Adding new text part", { partId });
              return { ...prev, content: newContent, parts: [...prev.parts, textPart] };
            }
          });
          break;

        case "message.reasoning.delta":
          // Add or update reasoning part
          setStreamingMessage((prev) => {
            if (!prev || prev.id !== event.payload.messageId) return prev;
            const partId = event.payload.partId as string;
            const existingPart = prev.parts.find(p => p.id === partId);

            if (existingPart) {
              // Update existing reasoning part
              const updatedParts = prev.parts.map(p =>
                p.id === partId
                  ? { ...p, content: { text: ((p.content as { text: string }).text || "") + (event.payload.delta as string) } }
                  : p
              );
              return { ...prev, parts: updatedParts };
            } else {
              // Create new reasoning part
              const reasoningPart: MessagePart = {
                id: partId,
                messageId: prev.id,
                sessionId,
                type: "reasoning",
                content: { text: event.payload.delta as string },
                toolName: null,
                toolCallId: null,
                toolStatus: null,
                createdAt: Date.now(),
                updatedAt: Date.now(),
              };
              log("streaming", "Adding reasoning part");
              return { ...prev, parts: [...prev.parts, reasoningPart] };
            }
          });
          break;

        case "message.tool.call":
          // Add or update tool call in streaming message parts
          setStreamingMessage((prev) => {
            if (!prev || prev.id !== event.payload.messageId) return prev;
            const toolCallId = event.payload.toolCallId as string;
            const existingPart = prev.parts.find(p => p.toolCallId === toolCallId);

            if (existingPart) {
              // Update existing tool call with args and status
              const updatedParts = prev.parts.map(p =>
                p.toolCallId === toolCallId
                  ? { ...p, content: { name: event.payload.toolName, args: event.payload.args }, toolStatus: "running" as const }
                  : p
              );
              log("streaming", "Updating tool call", { toolName: event.payload.toolName });
              return { ...prev, parts: updatedParts };
            } else {
              // Create new tool call part
              const toolPart: MessagePart = {
                id: event.payload.partId as string,
                messageId: prev.id,
                sessionId,
                type: "tool-call",
                content: { name: event.payload.toolName, args: event.payload.args },
                toolName: event.payload.toolName as string,
                toolCallId: toolCallId,
                toolStatus: "running",
                createdAt: Date.now(),
                updatedAt: Date.now(),
              };
              log("streaming", "Adding tool call", { toolName: event.payload.toolName });
              return { ...prev, parts: [...prev.parts, toolPart] };
            }
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
          // Refetch messages — streaming state will be cleared by the safety-net
          // effect once the completed message appears in fetched data
          log("streaming", "Message complete, refetching messages");
          queryClient.refetchQueries({
            queryKey: ["sessions", sessionId, "messages"],
          });
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
  }, [sessionId, queryClient]);

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

  // Clear streaming state when fetched messages include the completed assistant message
  // (safety net in case message.complete event was missed)
  useEffect(() => {
    if (fetchedMessages && streamingMessage) {
      const found = fetchedMessages.find(m => m.id === streamingMessage.id && m.completedAt);
      if (found) {
        log("checkStreaming", "Clearing streaming - found completed message in fetched data");
        setStreamingMessage(null);
      }
    }
  }, [fetchedMessages, streamingMessage]);

  const sendMessage = useCallback(async (content: string, options?: SendMessageOptions) => {
    log("sendMessage", "Starting sendMessage", { content: content.substring(0, 50), isSending, hasSettings: !!settings, options });

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

    // Resolve API key if provider/model specified
    const providerId = options?.providerId;
    let apiKey: string | undefined;
    if (providerId === "anthropic") apiKey = settings.anthropicApiKey;
    else if (providerId === "openai") apiKey = settings.openaiApiKey;
    else if (providerId === "google") apiKey = settings.googleApiKey;
    // If no provider specified, send all keys — backend picks the right one
    if (!apiKey && !providerId) {
      apiKey = settings.anthropicApiKey || settings.openaiApiKey || settings.googleApiKey;
    }

    // Send via REST API
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
          ...(providerId && { providerId }),
          ...(apiKey && { apiKey }),
          ...(options?.modelId && { modelId: options.modelId }),
          ...(options?.agentName && { agentName: options.agentName }),
          canExecuteCode: options?.canExecuteCode ?? false,
          enabledTools: options?.enabledTools,
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
  // Filter out optimistic messages that have been replaced by real ones
  // (detected by matching content in same session within a short time window)
  const realMessageContents = new Set(
    (fetchedMessages || [])
      .filter(m => m.role === "user")
      .map(m => {
        const textPart = m.parts?.find(p => p.type === "text");
        return textPart ? JSON.stringify((textPart.content as { text: string }).text) : null;
      })
      .filter(Boolean)
  );

  const filteredOptimistic = optimisticMessages.filter(m => {
    const textPart = m.parts?.find(p => p.type === "text");
    const content = textPart ? JSON.stringify((textPart.content as { text: string }).text) : null;
    // Keep optimistic message only if no real message with same content exists
    return !realMessageContents.has(content);
  });

  // Combine: fetched messages are already in server order, append optimistic at end
  const messages = [
    ...(fetchedMessages || []),
    ...filteredOptimistic,
  ];

  // Log the combined messages
  log("messages", "Combined messages", {
    total: messages.length,
    fromFetched: fetchedMessages?.length ?? 0,
    fromOptimistic: filteredOptimistic.length,
    filteredOut: optimisticMessages.length - filteredOptimistic.length,
    messageIds: messages.map(m => ({ id: m.id, role: m.role, createdAt: m.createdAt })),
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
