import { cn } from "@/lib/utils/cn";
import { User, Bot, AlertCircle, Wrench, FileText, Loader2 } from "lucide-react";
import type { MessageWithParts, MessagePart } from "@/lib/api/types";

interface MessageBubbleProps {
  message: MessageWithParts;
  isOptimistic?: boolean;
}

export function MessageBubble({ message, isOptimistic }: MessageBubbleProps) {
  const isUser = message.role === "user";
  const isError = !!message.errorType;
  const isStreaming = !message.completedAt && message.role === "assistant";

  return (
    <div
      className={cn("flex gap-3", isUser && "flex-row-reverse")}
      data-testid={isUser ? "user-message" : "assistant-message"}
      data-optimistic={isOptimistic || undefined}
    >
      {/* Avatar */}
      <div
        className={cn(
          "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
          isUser ? "bg-accent-primary" : "bg-bg-elevated border border-border"
        )}
      >
        {isUser ? (
          <User className="w-4 h-4 text-white" />
        ) : (
          <Bot className="w-4 h-4 text-text-primary" />
        )}
      </div>

      {/* Content */}
      <div
        className={cn(
          "flex-1 max-w-[85%] space-y-2",
          isUser && "flex flex-col items-end"
        )}
      >
        {message.parts?.map((part) => (
          <MessagePartContent key={part.id} part={part} isUser={isUser} />
        ))}

        {/* Streaming indicator */}
        {isStreaming && (!message.parts || message.parts.length === 0) && (
          <div className="flex items-center gap-2 text-text-muted text-sm">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Thinking...</span>
          </div>
        )}

        {/* Error display */}
        {isError && (
          <div className="px-3 py-2 bg-accent-error/10 border border-accent-error/20 rounded-lg text-sm">
            <div className="flex items-center gap-2 text-accent-error">
              <AlertCircle className="w-4 h-4" />
              <span className="font-medium">{message.errorType}</span>
            </div>
            {message.errorMessage && (
              <p className="text-text-secondary mt-1">{message.errorMessage}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function MessagePartContent({
  part,
  isUser,
}: {
  part: MessagePart;
  isUser: boolean;
}) {
  switch (part.type) {
    case "text":
      return <TextPart content={part.content as { text: string }} isUser={isUser} />;

    case "reasoning":
      return <ReasoningPart content={part.content as { text: string }} />;

    case "tool-call":
      return (
        <ToolCallPart
          content={part.content as { name: string; args: unknown }}
          toolName={part.toolName}
          status={part.toolStatus}
        />
      );

    case "tool-result":
      return <ToolResultPart content={part.content} toolName={part.toolName} />;

    case "file":
      return <FilePart content={part.content as { path: string }} />;

    case "step-start":
    case "step-finish":
      // Don't render step markers directly
      return null;

    default:
      return null;
  }
}

function TextPart({
  content,
  isUser,
}: {
  content: { text: string };
  isUser: boolean;
}) {
  if (!content.text) return null;

  return (
    <div
      className={cn(
        "px-4 py-2.5 rounded-2xl",
        isUser
          ? "bg-accent-primary text-white"
          : "bg-bg-elevated text-text-primary border border-border"
      )}
    >
      <p className="whitespace-pre-wrap break-words">{content.text}</p>
    </div>
  );
}

function ReasoningPart({ content }: { content: { text: string } }) {
  if (!content.text) return null;

  return (
    <div className="px-4 py-2 bg-bg-secondary/50 border border-border/50 rounded-lg text-sm text-text-muted italic">
      <p className="whitespace-pre-wrap">{content.text}</p>
    </div>
  );
}

function ToolCallPart({
  content,
  toolName,
  status,
}: {
  content: { name: string; args: unknown };
  toolName: string | null;
  status: string | null;
}) {
  const name = toolName || content.name;
  const hasArgs = !!(content.args && typeof content.args === "object" && Object.keys(content.args).length > 0);

  return (
    <div className="px-3 py-2 bg-bg-secondary border border-border rounded-lg text-sm">
      <div className="flex items-center gap-2">
        <Wrench className="w-3.5 h-3.5 text-text-muted" />
        <span className="font-mono font-medium text-text-primary">{name}</span>
        {status && <ToolStatusBadge status={status} />}
      </div>
      {hasArgs && (
        <pre className="mt-2 text-xs text-text-muted overflow-auto max-h-32 bg-bg-primary/50 p-2 rounded">
          {JSON.stringify(content.args, null, 2)}
        </pre>
      )}
    </div>
  );
}

function ToolResultPart({
  content,
  toolName,
}: {
  content: unknown;
  toolName: string | null;
}): React.ReactElement | null {
  const resultStr =
    typeof content === "string" ? content : JSON.stringify(content, null, 2);

  // Truncate very long results
  const truncated = resultStr.length > 500;
  const displayContent = truncated ? resultStr.slice(0, 500) + "..." : resultStr;

  return (
    <div className="px-3 py-2 bg-bg-primary border border-border rounded-lg text-sm">
      <div className="flex items-center gap-2 text-text-muted mb-1">
        <span className="text-xs">Result{toolName ? ` from ${toolName}` : ""}</span>
      </div>
      <pre className="text-xs text-text-secondary overflow-auto max-h-40 whitespace-pre-wrap break-words">
        {displayContent}
      </pre>
    </div>
  );
}

function FilePart({ content }: { content: { path: string } }) {
  return (
    <div className="px-3 py-2 bg-bg-secondary border border-border rounded-lg text-sm flex items-center gap-2">
      <FileText className="w-4 h-4 text-text-muted" />
      <span className="font-mono text-text-primary">{content.path}</span>
    </div>
  );
}

function ToolStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: "bg-yellow-500/20 text-yellow-400",
    running: "bg-blue-500/20 text-blue-400",
    completed: "bg-green-500/20 text-green-400",
    error: "bg-red-500/20 text-red-400",
  };

  const icons: Record<string, React.ReactNode> = {
    running: <Loader2 className="w-3 h-3 animate-spin" />,
  };

  return (
    <span
      className={cn(
        "px-1.5 py-0.5 rounded text-xs flex items-center gap-1",
        styles[status] || "bg-bg-elevated text-text-muted"
      )}
    >
      {icons[status]}
      {status}
    </span>
  );
}
