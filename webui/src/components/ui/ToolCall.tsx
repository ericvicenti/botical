import { useState } from "react";
import { cn } from "@/lib/utils/cn";
import {
  Wrench,
  Loader2,
  ChevronDown,
  ChevronRight,
  Check,
  AlertCircle,
  ExternalLink,
} from "lucide-react";
import { useTabs } from "@/contexts/tabs";
import { useNavigate } from "@tanstack/react-router";

export interface ToolCallProps {
  /** Tool name */
  name: string;
  /** Tool call arguments */
  args?: Record<string, unknown>;
  /** Tool result (if completed) */
  result?: unknown;
  /** Tool status */
  status: "pending" | "running" | "completed" | "error" | null;
  /** Project ID for file navigation */
  projectId: string;
  /** Optional tool call ID for matching */
  toolCallId?: string;
  /** Whether this is being rendered during streaming */
  isStreaming?: boolean;
}

/**
 * Unified tool call display component.
 * Shows tool name, status, and collapsible input/output.
 * Works for both streaming and completed states.
 */
export function ToolCall({
  name,
  args,
  result,
  status,
  projectId,
}: ToolCallProps) {
  const [expanded, setExpanded] = useState(false);
  const { openTab } = useTabs();
  const navigate = useNavigate();

  const hasArgs = !!(args && typeof args === "object" && Object.keys(args).length > 0);
  const hasResult = result !== undefined && result !== null;

  // Extract file path from common tool args
  const filePath = args?.path as string | undefined;
  const isFileOperation = ["read", "write", "edit", "glob", "grep"].includes(name) && filePath;

  // Parse result content
  const resultObj = typeof result === "object" && result !== null ? result as Record<string, unknown> : null;
  const resultTitle = resultObj?.title as string | undefined;
  const resultOutput = resultObj?.output as string | undefined;
  const resultMetadata = resultObj?.metadata as Record<string, unknown> | undefined;
  const resultFilePath = resultMetadata?.path as string | undefined;
  const resultStr = resultOutput || (typeof result === "string" ? result : result ? JSON.stringify(result, null, 2) : "");

  // Truncate very long results for display
  const maxResultLength = 500;
  const resultTruncated = resultStr.length > maxResultLength;
  const displayResult = expanded ? resultStr : resultStr.slice(0, maxResultLength) + (resultTruncated ? "..." : "");

  const handleOpenFile = (path: string) => {
    openTab({
      type: "file",
      projectId,
      path,
    });
    navigate({ to: "/files/$", params: { _splat: `${projectId}/${path}` } });
  };

  const statusIcon = {
    pending: <Loader2 className="w-3.5 h-3.5 text-yellow-400 animate-spin" />,
    running: <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin" />,
    completed: <Check className="w-3.5 h-3.5 text-green-400" />,
    error: <AlertCircle className="w-3.5 h-3.5 text-red-400" />,
  };

  const statusColors = {
    pending: "bg-yellow-500/20 text-yellow-400",
    running: "bg-blue-500/20 text-blue-400",
    completed: "bg-green-500/20 text-green-400",
    error: "bg-red-500/20 text-red-400",
  };

  return (
    <div className="bg-bg-secondary border border-border rounded-lg text-sm overflow-hidden">
      {/* Header - always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-3 py-2 flex items-center gap-2 hover:bg-bg-elevated/50 transition-colors"
      >
        {/* Expand/collapse indicator */}
        {expanded ? (
          <ChevronDown className="w-3.5 h-3.5 text-text-muted shrink-0" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-text-muted shrink-0" />
        )}

        {/* Tool icon */}
        <Wrench className="w-3.5 h-3.5 text-accent-primary shrink-0" />

        {/* Tool name */}
        <span className="font-mono font-medium text-text-primary">{name}</span>

        {/* File path shortcut (for file operations) */}
        {isFileOperation && filePath && (
          <span
            onClick={(e) => {
              e.stopPropagation();
              handleOpenFile(filePath);
            }}
            className="flex items-center gap-1 text-accent-primary hover:underline font-mono text-xs cursor-pointer"
          >
            {filePath}
            <ExternalLink className="w-3 h-3" />
          </span>
        )}

        {/* Spacer */}
        <span className="flex-1" />

        {/* Status badge */}
        {status && (
          <span
            className={cn(
              "px-1.5 py-0.5 rounded text-xs flex items-center gap-1",
              statusColors[status] || "bg-bg-elevated text-text-muted"
            )}
          >
            {statusIcon[status]}
            {status}
          </span>
        )}
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-border">
          {/* Input/Args section */}
          {hasArgs && (
            <div className="px-3 py-2 border-b border-border/50">
              <div className="text-xs text-text-muted mb-1 font-medium">Input</div>
              <pre className="text-xs text-text-secondary overflow-auto max-h-40 bg-bg-primary/50 p-2 rounded whitespace-pre-wrap break-words">
                {JSON.stringify(args, null, 2)}
              </pre>
            </div>
          )}

          {/* Output/Result section */}
          {hasResult ? (
            <div className="px-3 py-2">
              <div className="flex items-center gap-2 text-xs text-text-muted mb-1">
                <span className="font-medium">{resultTitle || "Output"}</span>
                {resultFilePath && (
                  <button
                    onClick={() => handleOpenFile(resultFilePath)}
                    className="flex items-center gap-1 text-accent-primary hover:underline font-mono"
                  >
                    {resultFilePath}
                    <ExternalLink className="w-3 h-3" />
                  </button>
                )}
              </div>
              <pre className="text-xs text-text-secondary overflow-auto max-h-60 bg-bg-primary/50 p-2 rounded whitespace-pre-wrap break-words">
                {displayResult}
              </pre>
              {resultTruncated && !expanded && (
                <button
                  onClick={() => setExpanded(true)}
                  className="text-xs text-accent-primary hover:underline mt-1"
                >
                  Show full output
                </button>
              )}
            </div>
          ) : status === "running" || status === "pending" ? (
            <div className="px-3 py-2 text-xs text-text-muted flex items-center gap-2">
              <Loader2 className="w-3 h-3 animate-spin" />
              {status === "running" ? "Executing..." : "Waiting..."}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

/**
 * Groups consecutive tool calls and their results together.
 * Pass an array of parts and it will render them with proper grouping.
 */
export interface ToolCallGroupProps {
  /** Tool call part */
  toolCall: {
    toolName: string | null;
    toolCallId: string | null;
    toolStatus: string | null;
    content: unknown;
  };
  /** Optional matching tool result */
  toolResult?: {
    content: unknown;
  };
  projectId: string;
  isStreaming?: boolean;
}

export function ToolCallGroup({
  toolCall,
  toolResult,
  projectId,
  isStreaming,
}: ToolCallGroupProps) {
  const name = toolCall.toolName || "unknown";
  const callContent = toolCall.content as { name?: string; args?: Record<string, unknown> } | undefined;
  const args = callContent?.args as Record<string, unknown> | undefined;
  const status = (toolCall.toolStatus || "pending") as ToolCallProps["status"];

  return (
    <ToolCall
      name={name}
      args={args}
      result={toolResult?.content}
      status={status}
      projectId={projectId}
      toolCallId={toolCall.toolCallId || undefined}
      isStreaming={isStreaming}
    />
  );
}
