import { useState, useRef, useEffect } from "react";
import { useSession, useSettings } from "@/lib/api/queries";
import { useTaskMessages } from "@/hooks/useTaskMessages";
import { cn } from "@/lib/utils/cn";
import { Send, Loader2, Bot, MoreHorizontal, AlertTriangle } from "lucide-react";
import { MessageBubble } from "./MessageBubble";
import { Link } from "@tanstack/react-router";

interface TaskChatProps {
  sessionId: string;
  projectId: string;
}

export function TaskChat({ sessionId, projectId }: TaskChatProps) {
  const { data: session, isLoading: sessionLoading } = useSession(sessionId, projectId);
  const { data: settings } = useSettings();
  const {
    messages,
    streamingMessage,
    isLoading: messagesLoading,
    isSending,
    sendMessage,
    error,
  } = useTaskMessages({ sessionId, projectId });

  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const hasApiKey = settings?.anthropicApiKey || settings?.openaiApiKey || settings?.googleApiKey;

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingMessage]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, [sessionId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const content = input.trim();
    if (!content || isSending || !hasApiKey) return;

    setInput("");
    await sendMessage(content);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Submit on Enter (without Shift)
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  // Auto-resize textarea
  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const target = e.target;
    setInput(target.value);
    target.style.height = "auto";
    target.style.height = `${Math.min(target.scrollHeight, 200)}px`;
  };

  if (sessionLoading || messagesLoading) {
    return (
      <div className="h-full flex items-center justify-center text-text-muted">
        <Loader2 className="w-6 h-6 animate-spin mr-2" />
        <span>Loading conversation...</span>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-bg-primary">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border bg-bg-secondary flex items-center justify-between">
        <div>
          <h2 className="text-lg font-medium text-text-primary">
            {session?.title || "Task"}
          </h2>
          <p className="text-sm text-text-muted flex items-center gap-1">
            <Bot className="w-3.5 h-3.5" />
            {session?.agent || "default"} agent
            {session?.messageCount ? ` · ${session.messageCount} messages` : ""}
          </p>
        </div>
        <button
          className="p-2 hover:bg-bg-elevated rounded-lg text-text-muted hover:text-text-primary"
          title="Task options"
        >
          <MoreHorizontal className="w-5 h-5" />
        </button>
      </div>

      {/* Error message */}
      {error && (
        <div className="px-4 py-2 bg-red-500/10 border-b border-red-500/20">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-auto p-4">
        {messages.length === 0 && !streamingMessage ? (
          <EmptyState />
        ) : (
          <div className="space-y-4 max-w-3xl mx-auto">
            {messages.map((message) => (
              <MessageBubble
                key={message.id}
                message={message}
                isOptimistic={message.id.startsWith("optimistic-")}
              />
            ))}
            {streamingMessage && (
              <StreamingMessageBubble message={streamingMessage} />
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* API Key Warning */}
      {!hasApiKey && (
        <div className="border-t border-border bg-accent-warning/10 px-4 py-3">
          <div className="max-w-3xl mx-auto flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-accent-warning shrink-0" />
            <div className="flex-1">
              <p className="text-sm text-text-primary">
                No API key configured. Please add your API key in{" "}
                <Link to="/settings" className="text-accent-primary hover:underline">
                  Settings
                </Link>{" "}
                to start chatting.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Input */}
      <div className="border-t border-border bg-bg-secondary p-4">
        <form onSubmit={handleSubmit} className="max-w-3xl mx-auto">
          <div className="flex gap-3 items-end">
            <div className="flex-1 relative">
              <textarea
                ref={inputRef}
                value={input}
                onChange={handleInput}
                onKeyDown={handleKeyDown}
                placeholder={hasApiKey ? "Type a message... (Enter to send, Shift+Enter for new line)" : "Configure API key in Settings to start..."}
                rows={1}
                className={cn(
                  "w-full px-4 py-3 bg-bg-primary border border-border rounded-xl",
                  "text-text-primary placeholder:text-text-muted",
                  "focus:outline-none focus:border-accent-primary focus:ring-1 focus:ring-accent-primary/50",
                  "resize-none min-h-[48px] max-h-[200px]",
                  "transition-colors",
                  !hasApiKey && "opacity-50"
                )}
                disabled={isSending || !hasApiKey}
              />
            </div>
            <button
              type="submit"
              disabled={!input.trim() || isSending || !hasApiKey}
              className={cn(
                "px-4 py-3 rounded-xl font-medium",
                "flex items-center justify-center gap-2",
                "transition-colors",
                input.trim() && !isSending && hasApiKey
                  ? "bg-accent-primary text-white hover:bg-accent-primary/90"
                  : "bg-bg-elevated text-text-muted cursor-not-allowed"
              )}
              data-testid="send-message-button"
            >
              {isSending ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Send className="w-5 h-5" />
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center px-4">
      <div className="w-16 h-16 rounded-full bg-bg-elevated flex items-center justify-center mb-4">
        <Bot className="w-8 h-8 text-text-muted" />
      </div>
      <h3 className="text-lg font-medium text-text-primary mb-2">
        Start a conversation
      </h3>
      <p className="text-text-muted max-w-md">
        Tell the agent what you'd like to accomplish. The agent will work to
        complete your task, using tools to read files, write code, and execute
        commands.
      </p>
    </div>
  );
}

interface StreamingMessageBubbleProps {
  message: {
    id: string;
    content: string;
    isStreaming: boolean;
  };
}

function StreamingMessageBubble({ message }: StreamingMessageBubbleProps) {
  return (
    <div className="flex gap-3" data-testid="streaming-message">
      <div className="w-8 h-8 rounded-full bg-accent-primary/20 flex items-center justify-center shrink-0">
        <Bot className="w-4 h-4 text-accent-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="bg-bg-secondary rounded-lg p-3">
          <p className="text-text-primary whitespace-pre-wrap">
            {message.content || (
              <span className="text-text-muted italic">Thinking...</span>
            )}
            {message.isStreaming && (
              <span className="inline-block w-2 h-4 bg-accent-primary/50 ml-1 animate-pulse" />
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
