import { useState, useRef, useEffect } from "react";
import { useSession, useMessages, useSendMessage } from "@/lib/api/queries";
import { cn } from "@/lib/utils/cn";
import { Send, Loader2, Bot, MoreHorizontal } from "lucide-react";
import { MessageBubble } from "./MessageBubble";

interface TaskChatProps {
  sessionId: string;
  projectId: string;
}

export function TaskChat({ sessionId }: TaskChatProps) {
  const { data: session, isLoading: sessionLoading } = useSession(sessionId);
  const { data: messages, isLoading: messagesLoading } = useMessages(sessionId);
  const sendMessage = useSendMessage();
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, [sessionId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const content = input.trim();
    if (!content || sendMessage.isPending) return;

    setInput("");

    try {
      await sendMessage.mutateAsync({
        sessionId,
        content,
      });
    } catch (err) {
      console.error("Failed to send message:", err);
      // Restore input on error
      setInput(content);
    }
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

      {/* Messages */}
      <div className="flex-1 overflow-auto p-4">
        {!messages || messages.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="space-y-4 max-w-3xl mx-auto">
            {messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

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
                placeholder="Type a message... (Enter to send, Shift+Enter for new line)"
                rows={1}
                className={cn(
                  "w-full px-4 py-3 bg-bg-primary border border-border rounded-xl",
                  "text-text-primary placeholder:text-text-muted",
                  "focus:outline-none focus:border-accent-primary focus:ring-1 focus:ring-accent-primary/50",
                  "resize-none min-h-[48px] max-h-[200px]",
                  "transition-colors"
                )}
                disabled={sendMessage.isPending}
              />
            </div>
            <button
              type="submit"
              disabled={!input.trim() || sendMessage.isPending}
              className={cn(
                "px-4 py-3 rounded-xl font-medium",
                "flex items-center justify-center gap-2",
                "transition-colors",
                input.trim() && !sendMessage.isPending
                  ? "bg-accent-primary text-white hover:bg-accent-primary/90"
                  : "bg-bg-elevated text-text-muted cursor-not-allowed"
              )}
            >
              {sendMessage.isPending ? (
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
