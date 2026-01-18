import { cn } from "@/lib/utils/cn";
import { User, Bot, AlertCircle, Wrench, FileText, Loader2, ExternalLink, ChevronDown, ChevronRight } from "lucide-react";
import type { MessageWithParts, MessagePart } from "@/lib/api/types";
import { useTabs } from "@/contexts/tabs";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";

interface MessageBubbleProps {
  message: MessageWithParts;
  projectId: string;
  isOptimistic?: boolean;
}

export function MessageBubble({ message, projectId, isOptimistic }: MessageBubbleProps) {
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
          <MessagePartContent key={part.id} part={part} isUser={isUser} projectId={projectId} />
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
  projectId,
}: {
  part: MessagePart;
  isUser: boolean;
  projectId: string;
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
          projectId={projectId}
        />
      );

    case "tool-result":
      return <ToolResultPart content={part.content} toolName={part.toolName} projectId={projectId} />;

    case "file":
      return <FilePart content={part.content as { path: string }} projectId={projectId} />;

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

  // Filter out artifact XML tags that the model might generate instead of using tools
  // This is a fallback for when tools aren't properly configured
  const cleanedText = content.text.replace(
    /<antsArtifact[^>]*>[\s\S]*?<\/antsArtifact>/g,
    "[Tool call attempted - please restart the server to enable tools]"
  );

  return (
    <div
      className={cn(
        "px-4 py-2.5 rounded-2xl",
        isUser
          ? "bg-accent-primary text-white"
          : "bg-bg-elevated text-text-primary border border-border"
      )}
    >
      <p className="whitespace-pre-wrap break-words">{cleanedText}</p>
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
  projectId,
}: {
  content: { name: string; args: unknown };
  toolName: string | null;
  status: string | null;
  projectId: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const { openTab } = useTabs();
  const navigate = useNavigate();
  const name = toolName || content.name;
  const args = content.args as Record<string, unknown> | undefined;
  const hasArgs = !!(args && typeof args === "object" && Object.keys(args).length > 0);

  // Extract file path from common tool args
  const filePath = args?.path as string | undefined;
  const isFileOperation = ["read", "write", "edit"].includes(name) && filePath;

  const handleOpenFile = () => {
    if (!filePath) return;
    openTab({
      type: "file",
      projectId,
      path: filePath,
    });
    navigate({ to: "/files/$", params: { _splat: `${projectId}/${filePath}` } });
  };

  return (
    <div className="px-3 py-2 bg-bg-secondary border border-border rounded-lg text-sm">
      <div className="flex items-center gap-2">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 text-text-muted hover:text-text-primary"
        >
          {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </button>
        <Wrench className="w-3.5 h-3.5 text-accent-primary" />
        <span className="font-mono font-medium text-text-primary">{name}</span>
        {isFileOperation && (
          <button
            onClick={handleOpenFile}
            className="flex items-center gap-1 text-accent-primary hover:underline font-mono text-xs"
          >
            {filePath}
            <ExternalLink className="w-3 h-3" />
          </button>
        )}
        {status && <ToolStatusBadge status={status} />}
      </div>
      {expanded && hasArgs && (
        <pre className="mt-2 text-xs text-text-muted overflow-auto max-h-32 bg-bg-primary/50 p-2 rounded">
          {JSON.stringify(args, null, 2)}
        </pre>
      )}
    </div>
  );
}

function ToolResultPart({
  content,
  toolName,
  projectId,
}: {
  content: unknown;
  toolName: string | null;
  projectId: string;
}): React.ReactElement | null {
  const [expanded, setExpanded] = useState(false);
  const { openTab } = useTabs();
  const navigate = useNavigate();

  // Parse content to extract metadata if available
  const contentObj = typeof content === "object" && content !== null ? content as Record<string, unknown> : null;
  const title = contentObj?.title as string | undefined;
  const output = contentObj?.output as string | undefined;
  const metadata = contentObj?.metadata as Record<string, unknown> | undefined;
  const filePath = metadata?.path as string | undefined;

  const resultStr = output || (typeof content === "string" ? content : JSON.stringify(content, null, 2));

  // Truncate very long results
  const truncated = resultStr.length > 300;
  const displayContent = (expanded || !truncated) ? resultStr : resultStr.slice(0, 300) + "...";

  const handleOpenFile = () => {
    if (!filePath) return;
    openTab({
      type: "file",
      projectId,
      path: filePath,
    });
    navigate({ to: "/files/$", params: { _splat: `${projectId}/${filePath}` } });
  };

  return (
    <div className="px-3 py-2 bg-bg-primary border border-border rounded-lg text-sm">
      <div className="flex items-center gap-2 text-text-muted mb-1">
        <span className="text-xs font-medium">{title || `Result${toolName ? ` from ${toolName}` : ""}`}</span>
        {filePath && (
          <button
            onClick={handleOpenFile}
            className="flex items-center gap-1 text-accent-primary hover:underline font-mono text-xs"
          >
            {filePath}
            <ExternalLink className="w-3 h-3" />
          </button>
        )}
      </div>
      <pre className="text-xs text-text-secondary overflow-auto max-h-40 whitespace-pre-wrap break-words">
        {displayContent}
      </pre>
      {truncated && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-xs text-accent-primary hover:underline mt-1"
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}

function FilePart({ content, projectId }: { content: { path: string }; projectId: string }) {
  const { openTab } = useTabs();
  const navigate = useNavigate();

  const handleOpenFile = () => {
    openTab({
      type: "file",
      projectId,
      path: content.path,
    });
    navigate({ to: "/files/$", params: { _splat: `${projectId}/${content.path}` } });
  };

  return (
    <button
      onClick={handleOpenFile}
      className="px-3 py-2 bg-bg-secondary border border-border rounded-lg text-sm flex items-center gap-2 hover:border-accent-primary transition-colors"
    >
      <FileText className="w-4 h-4 text-accent-primary" />
      <span className="font-mono text-text-primary">{content.path}</span>
      <ExternalLink className="w-3 h-3 text-text-muted" />
    </button>
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
