import { useState } from "react";
import {
  Wrench,
  Loader2,
  ChevronDown,
  ChevronRight,
  Check,
  AlertCircle,
  ExternalLink,
  FileText,
  Search,
  FolderSearch,
  Pencil,
  FileOutput,
  Terminal,
  Globe,
} from "lucide-react";
import { useTabs } from "@/contexts/tabs";
import { useNavigate } from "@tanstack/react-router";

/** Tool metadata with descriptions and icons */
const TOOL_INFO: Record<string, { description: string; icon: typeof Wrench }> = {
  glob: { description: "Search for files by pattern", icon: FolderSearch },
  grep: { description: "Search file contents", icon: Search },
  read: { description: "Read file contents", icon: FileText },
  write: { description: "Write to file", icon: FileOutput },
  edit: { description: "Edit file", icon: Pencil },
  bash: { description: "Run shell command", icon: Terminal },
  webfetch: { description: "Fetch web page", icon: Globe },
  websearch: { description: "Search the web", icon: Globe },
};

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
 * Shows tool description, status, and collapsible input/output.
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

  // Get tool info
  const toolInfo = TOOL_INFO[name.toLowerCase()];
  const ToolIcon = toolInfo?.icon || Wrench;

  // For bash, prefer the description from args (LLM-provided) over generic
  const bashDescription = name.toLowerCase() === "bash" && args?.description
    ? (args.description as string)
    : null;
  const toolDescription = bashDescription || toolInfo?.description || name;

  const hasArgs = !!(args && typeof args === "object" && Object.keys(args).length > 0);
  const hasResult = result !== undefined && result !== null;

  // Extract file path from common tool args
  const filePath = args?.path as string | undefined;
  const filePattern = args?.pattern as string | undefined;
  const isFileOperation = ["read", "write", "edit"].includes(name.toLowerCase()) && filePath;

  // Parse result content
  const resultObj = typeof result === "object" && result !== null ? result as Record<string, unknown> : null;
  const resultTitle = resultObj?.title as string | undefined;
  const resultOutput = resultObj?.output as string | undefined;
  const resultResult = resultObj?.result as string | undefined;
  const resultMetadata = resultObj?.metadata as Record<string, unknown> | undefined;
  const resultFilePath = resultMetadata?.path as string | undefined;

  // Get the actual result content
  const rawResult = resultOutput || resultResult || (typeof result === "string" ? result : null);

  const handleOpenFile = (path: string) => {
    openTab({
      type: "file",
      projectId,
      path,
    });
    navigate({ to: "/files/$", params: { _splat: `${projectId}/${path}` } });
  };

  // Simplified status icons - just icon, no background/text
  const statusIcon = {
    pending: <Loader2 className="w-3.5 h-3.5 text-text-muted animate-spin" />,
    running: <Loader2 className="w-3.5 h-3.5 text-text-muted animate-spin" />,
    completed: <Check className="w-3.5 h-3.5 text-text-muted" />,
    error: <AlertCircle className="w-3.5 h-3.5 text-red-400" />,
  };

  // Render smart output based on tool type
  const renderOutput = () => {
    const toolLower = name.toLowerCase();

    // Glob tool - render file list with links
    if (toolLower === "glob" && rawResult) {
      const files = rawResult.split("\n").filter(f => f.trim());
      if (files.length === 0) {
        return <div className="text-xs text-text-muted italic">No files found</div>;
      }
      return (
        <div className="space-y-0.5">
          <div className="text-xs text-text-muted mb-1">{files.length} file{files.length !== 1 ? "s" : ""} found</div>
          <div className="max-h-60 overflow-auto space-y-0.5">
            {files.map((file, i) => (
              <button
                key={i}
                onClick={() => handleOpenFile(file)}
                className="flex items-center gap-1.5 text-xs text-accent-primary hover:underline font-mono w-full text-left py-0.5"
              >
                <FileText className="w-3 h-3 shrink-0" />
                {file}
              </button>
            ))}
          </div>
        </div>
      );
    }

    // Grep tool - render file matches with links
    if (toolLower === "grep" && rawResult) {
      const lines = rawResult.split("\n").filter(l => l.trim());
      if (lines.length === 0) {
        return <div className="text-xs text-text-muted italic">No matches found</div>;
      }
      // Parse grep output format: "file:line:content" or just "file"
      const matches = lines.map(line => {
        const colonIndex = line.indexOf(":");
        if (colonIndex > 0) {
          const file = line.slice(0, colonIndex);
          const rest = line.slice(colonIndex + 1);
          return { file, rest };
        }
        return { file: line, rest: null };
      });

      return (
        <div className="max-h-60 overflow-auto space-y-0.5">
          <div className="text-xs text-text-muted mb-1">{matches.length} match{matches.length !== 1 ? "es" : ""}</div>
          {matches.map((match, i) => (
            <div key={i} className="flex items-start gap-1.5 text-xs py-0.5">
              <button
                onClick={() => handleOpenFile(match.file)}
                className="text-accent-primary hover:underline font-mono shrink-0"
              >
                {match.file}
              </button>
              {match.rest && (
                <span className="text-text-secondary truncate">{match.rest}</span>
              )}
            </div>
          ))}
        </div>
      );
    }

    // Default: show raw result or JSON
    const resultStr = rawResult || (result ? JSON.stringify(result, null, 2) : "");
    const maxResultLength = 500;
    const resultTruncated = resultStr.length > maxResultLength;
    const displayResult = expanded ? resultStr : resultStr.slice(0, maxResultLength) + (resultTruncated ? "..." : "");

    return (
      <>
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
      </>
    );
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
        <ToolIcon className="w-3.5 h-3.5 text-accent-primary shrink-0" />

        {/* Tool description */}
        <span className="text-text-primary">{toolDescription}</span>

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

        {/* Pattern for glob */}
        {name.toLowerCase() === "glob" && filePattern && (
          <span className="font-mono text-xs text-text-secondary">{filePattern}</span>
        )}

        {/* Spacer */}
        <span className="flex-1" />

        {/* Status icon */}
        {status && statusIcon[status]}
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-border">
          {/* Input/Args section */}
          {hasArgs && (
            <div className="px-3 py-2 border-b border-border/50">
              <div className="text-xs text-text-muted mb-1 font-medium capitalize">{name} arguments</div>
              <pre className="text-xs text-text-secondary overflow-auto max-h-40 bg-bg-primary/50 p-2 rounded whitespace-pre-wrap break-words">
                {JSON.stringify(args, null, 2)}
              </pre>
            </div>
          )}

          {/* Output/Result section */}
          {hasResult ? (
            <div className="px-3 py-2">
              <div className="flex items-center gap-2 text-xs text-text-muted mb-1">
                <span className="font-medium">{resultTitle || "Result"}</span>
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
              {renderOutput()}
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
