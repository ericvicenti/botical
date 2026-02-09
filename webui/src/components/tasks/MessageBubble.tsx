import { useMemo, useState } from "react";
import { cn } from "@/lib/utils/cn";
import { User, Bot, AlertCircle, FileText, Loader2, ExternalLink, Settings, Info } from "lucide-react";
import type { MessageWithParts, MessagePart } from "@/lib/api/types";
import { useTabs } from "@/contexts/tabs";
import { useNavigate } from "@tanstack/react-router";
import { Markdown } from "@/components/ui/Markdown";
import { ToolCall } from "@/components/ui/ToolCall";

interface GroupedPart {
  type: "text" | "reasoning" | "tool" | "file";
  textPart?: MessagePart;
  reasoningPart?: MessagePart;
  toolCallPart?: MessagePart;
  toolResultPart?: MessagePart;
  filePart?: MessagePart;
}

interface MessageBubbleProps {
  message: MessageWithParts;
  projectId: string;
  isOptimistic?: boolean;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const secs = ms / 1000;
  if (secs < 60) return `${secs.toFixed(1)}s`;
  const mins = Math.floor(secs / 60);
  const remSecs = Math.floor(secs % 60);
  return `${mins}m ${remSecs}s`;
}

function MetadataTooltip({ message }: { message: MessageWithParts }) {
  const duration = message.completedAt && message.createdAt
    ? message.completedAt - message.createdAt
    : null;

  return (
    <div className="text-xs text-text-muted space-y-0.5 whitespace-nowrap">
      {message.modelId && (
        <div className="font-mono">{message.modelId}</div>
      )}
      {duration !== null && (
        <div>{formatDuration(duration)}</div>
      )}
      {(message.tokensInput > 0 || message.tokensOutput > 0) && (
        <div>{message.tokensInput}→{message.tokensOutput} tokens</div>
      )}
    </div>
  );
}

/**
 * Groups message parts for display, pairing tool calls with their results.
 */
function GroupedMessageParts({
  parts,
  isUser,
  projectId,
}: {
  parts: MessagePart[];
  isUser: boolean;
  projectId: string;
}) {
  const groupedParts = useMemo(() => {
    const result: GroupedPart[] = [];
    const toolResultsById = new Map<string, MessagePart>();

    // First pass: collect tool results by their toolCallId
    for (const part of parts) {
      if (part.type === "tool-result" && part.toolCallId) {
        toolResultsById.set(part.toolCallId, part);
      }
    }

    // Second pass: group parts
    for (const part of parts) {
      switch (part.type) {
        case "text":
          result.push({ type: "text", textPart: part });
          break;
        case "reasoning":
          result.push({ type: "reasoning", reasoningPart: part });
          break;
        case "tool-call":
          // Find matching result
          const matchingResult = part.toolCallId
            ? toolResultsById.get(part.toolCallId)
            : undefined;
          result.push({
            type: "tool",
            toolCallPart: part,
            toolResultPart: matchingResult,
          });
          break;
        case "tool-result":
          // Skip - already paired with tool-call above
          break;
        case "file":
          result.push({ type: "file", filePart: part });
          break;
        case "step-start":
        case "step-finish":
          // Don't render step markers
          break;
        default:
          break;
      }
    }

    return result;
  }, [parts]);

  return (
    <>
      {groupedParts.map((group, index) => (
        <GroupedPartRenderer
          key={index}
          group={group}
          isUser={isUser}
          projectId={projectId}
        />
      ))}
    </>
  );
}

function GroupedPartRenderer({
  group,
  isUser,
  projectId,
}: {
  group: GroupedPart;
  isUser: boolean;
  projectId: string;
}) {
  switch (group.type) {
    case "text":
      return group.textPart ? (
        <TextPart
          content={group.textPart.content as { text: string }}
          isUser={isUser}
        />
      ) : null;

    case "reasoning":
      return group.reasoningPart ? (
        <ReasoningPart content={group.reasoningPart.content as { text: string }} />
      ) : null;

    case "tool":
      if (!group.toolCallPart) return null;
      const callContent = group.toolCallPart.content as { name: string; args: unknown };
      const toolName = group.toolCallPart.toolName || callContent.name;
      const args = callContent.args as Record<string, unknown> | undefined;
      const status = (group.toolCallPart.toolStatus || "pending") as
        | "pending"
        | "running"
        | "completed"
        | "error"
        | null;

      const toolDuration = group.toolCallPart.createdAt && group.toolResultPart?.updatedAt
        ? group.toolResultPart.updatedAt - group.toolCallPart.createdAt
        : null;

      return (
        <ToolCall
          name={toolName}
          args={args}
          result={group.toolResultPart?.content}
          status={status}
          durationMs={toolDuration}
          projectId={projectId}
        />
      );

    case "file":
      return group.filePart ? (
        <FilePart
          content={group.filePart.content as { path: string }}
          projectId={projectId}
        />
      ) : null;

    default:
      return null;
  }
}

export function MessageBubble({ message, projectId, isOptimistic }: MessageBubbleProps) {
  const isUser = message.role === "user";
  const isSystem = message.role === "system";
  const isError = !!message.errorType;
  const isStreaming = !message.completedAt && message.role === "assistant";

  // Check if this is a system prompt change event
  const isSystemPromptChange = isSystem && message.parts?.[0]?.content && 
    typeof message.parts[0].content === 'object' &&
    'event' in (message.parts[0].content as any) &&
    (message.parts[0].content as any).event?.type === 'system_prompt_change';

  if (isSystemPromptChange) {
    const event = (message.parts[0].content as any).event;
    return (
      <div className="flex justify-center my-4">
        <div className="flex items-center gap-2 px-3 py-2 bg-bg-secondary border border-border rounded-full text-sm text-text-muted">
          <Settings className="w-4 h-4" />
          <span>System prompt updated</span>
          <span className="text-text-tertiary">
            {new Date(event.timestamp).toLocaleTimeString()}
          </span>
        </div>
      </div>
    );
  }

  if (isSystem) {
    // Other system messages (for future use)
    return (
      <div className="flex justify-center my-2">
        <div className="flex items-center gap-2 px-3 py-1.5 bg-bg-secondary border border-border rounded-full text-xs text-text-muted">
          <Settings className="w-3 h-3" />
          <span>System event</span>
        </div>
      </div>
    );
  }

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
        <GroupedMessageParts parts={message.parts || []} isUser={isUser} projectId={projectId} />

        {/* Message metadata for assistant messages */}
        {!isUser && !isStreaming && message.completedAt && (
          <MessageMetadata message={message} />
        )}

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

function MessageMetadata({ message }: { message: MessageWithParts }) {
  const [showTooltip, setShowTooltip] = useState(false);
  const duration = message.completedAt && message.createdAt
    ? message.completedAt - message.createdAt
    : null;

  if (!message.modelId && duration === null) return null;

  return (
    <div className="relative inline-flex">
      <button
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text-secondary transition-colors"
      >
        {message.modelId && (
          <span className="font-mono">{message.modelId.replace(/^claude-|^gpt-|^gemini-/, (m) => m)}</span>
        )}
        {duration !== null && (
          <span>· {formatDuration(duration)}</span>
        )}
      </button>
      {showTooltip && (message.tokensInput > 0 || message.tokensOutput > 0) && (
        <div className="absolute bottom-full left-0 mb-1 px-2.5 py-1.5 bg-bg-primary border border-border rounded-lg shadow-lg z-50">
          <MetadataTooltip message={message} />
        </div>
      )}
    </div>
  );
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
      {isUser ? (
        // User messages: plain text (users don't typically write markdown)
        <p className="whitespace-pre-wrap break-words">{cleanedText}</p>
      ) : (
        // Assistant messages: render as markdown
        <Markdown>{cleanedText}</Markdown>
      )}
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

function FilePart({ content, projectId }: { content: { path: string }; projectId: string }) {
  const { openPreviewTab } = useTabs();
  const navigate = useNavigate();

  const handleOpenFile = () => {
    openPreviewTab({
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

