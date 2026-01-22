import { useState, useRef, useEffect, useMemo } from "react";
import { useSession, useSettings, useProject, useCoreTools } from "@/lib/api/queries";
import { useTaskMessages } from "@/hooks/useTaskMessages";
import { cn } from "@/lib/utils/cn";
import { Send, Loader2, Bot, MoreHorizontal, AlertTriangle, Info, X, ChevronDown, Wrench } from "lucide-react";
import { MessageBubble } from "./MessageBubble";
import { Link } from "@tanstack/react-router";
import { Markdown } from "@/components/ui/Markdown";
import { ToolCall } from "@/components/ui/ToolCall";
import { ContentHeader } from "@/components/layout/ContentHeader";
import { ToolsPanel } from "./ToolsPanel";

interface TaskChatProps {
  sessionId: string;
  projectId: string;
  isActive?: boolean;
}

// Model definitions matching the backend providers.ts
interface ModelOption {
  id: string;
  name: string;
  providerId: "anthropic" | "openai" | "google";
  providerName: string;
}

const AVAILABLE_MODELS: ModelOption[] = [
  // Anthropic
  { id: "claude-opus-4-20250514", name: "Claude Opus 4", providerId: "anthropic", providerName: "Anthropic" },
  { id: "claude-sonnet-4-20250514", name: "Claude Sonnet 4", providerId: "anthropic", providerName: "Anthropic" },
  { id: "claude-3-5-haiku-20241022", name: "Claude 3.5 Haiku", providerId: "anthropic", providerName: "Anthropic" },
  // OpenAI
  { id: "gpt-4o", name: "GPT-4o", providerId: "openai", providerName: "OpenAI" },
  { id: "gpt-4o-mini", name: "GPT-4o Mini", providerId: "openai", providerName: "OpenAI" },
  { id: "o1", name: "o1", providerId: "openai", providerName: "OpenAI" },
  // Google
  { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash", providerId: "google", providerName: "Google" },
  { id: "gemini-2.0-flash-thinking-exp", name: "Gemini 2.0 Flash Thinking", providerId: "google", providerName: "Google" },
];

export function TaskChat({ sessionId, projectId, isActive = true }: TaskChatProps) {
  const { data: session, isLoading: sessionLoading } = useSession(sessionId, projectId);
  const { data: project } = useProject(projectId);
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
  const [showSystemPrompt, setShowSystemPrompt] = useState(false);
  const [showToolsPanel, setShowToolsPanel] = useState(false);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [canExecuteCode, setCanExecuteCode] = useState(false);
  const [enabledTools, setEnabledTools] = useState<Set<string>>(new Set());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const modelDropdownRef = useRef<HTMLDivElement>(null);

  // Load core tools to initialize enabled tools
  const { data: coreTools } = useCoreTools();

  // Initialize enabled tools when core tools load (enable all safe tools by default)
  useEffect(() => {
    if (coreTools && enabledTools.size === 0) {
      const defaultEnabled = new Set(
        coreTools
          .filter(t => !t.requiresCodeExecution)
          .map(t => t.name)
      );
      setEnabledTools(defaultEnabled);
    }
  }, [coreTools, enabledTools.size]);

  const handleToggleTool = (toolName: string) => {
    setEnabledTools(prev => {
      const next = new Set(prev);
      if (next.has(toolName)) {
        next.delete(toolName);
      } else {
        next.add(toolName);
      }
      return next;
    });
  };

  const handleToggleCodeExecution = () => {
    setCanExecuteCode(prev => {
      const newValue = !prev;
      // When enabling code execution, also enable execution tools
      if (newValue && coreTools) {
        setEnabledTools(currentEnabled => {
          const next = new Set(currentEnabled);
          for (const tool of coreTools) {
            if (tool.requiresCodeExecution) {
              next.add(tool.name);
            }
          }
          return next;
        });
      }
      return newValue;
    });
  };

  // Filter models based on which API keys are configured
  const availableModels = useMemo(() => {
    if (!settings) return [];
    return AVAILABLE_MODELS.filter(model => {
      if (model.providerId === "anthropic" && settings.anthropicApiKey) return true;
      if (model.providerId === "openai" && settings.openaiApiKey) return true;
      if (model.providerId === "google" && settings.googleApiKey) return true;
      return false;
    });
  }, [settings]);

  // Get the default model based on the default provider
  const defaultModel = useMemo(() => {
    if (!settings) return null;
    const defaultProvider = settings.defaultProvider;
    const defaultModels: Record<string, string> = {
      anthropic: "claude-sonnet-4-20250514",
      openai: "gpt-4o",
      google: "gemini-2.0-flash",
    };
    return defaultModels[defaultProvider] || null;
  }, [settings]);

  const currentModelId = selectedModel ?? defaultModel;
  const currentModel = availableModels.find(m => m.id === currentModelId) ?? availableModels[0];

  const hasApiKey = settings?.anthropicApiKey || settings?.openaiApiKey || settings?.googleApiKey;

  // Generate system prompt preview (matches server-side generation)
  const systemPromptPreview = `You are an AI coding assistant with access to tools for reading, writing, and editing files, as well as executing commands.

IMPORTANT: When you need to read files, write code, or execute commands, you MUST use the available tools. Do NOT just describe what you would do - actually call the tools to do it.

For example:
- To read a file, call the "read" tool with the file path
- To list files, call the "glob" tool with a pattern
- To search for code, call the "grep" tool
- To edit a file, call the "edit" tool
- To run a command, call the "bash" tool

Be concise and helpful. Focus on completing the user's request efficiently.

## Project Context
Working directory: ${project?.path || "(not set)"}

## Agent Instructions
${session?.agent === "default" ? `You are a helpful AI coding assistant. You help users with software engineering tasks including:
- Writing and editing code
- Debugging and fixing issues
- Explaining code and concepts
- Refactoring and improving code quality
- Writing tests and documentation

Guidelines:
- Be concise and direct in your responses
- Focus on solving the user's problem efficiently
- Use tools to read files before making assumptions about their content
- Make targeted edits rather than rewriting entire files
- Test your changes when appropriate
- Ask clarifying questions if the task is ambiguous

You have access to tools for reading, writing, and editing files, as well as executing commands.` : `Agent: ${session?.agent || "default"}`}`;

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingMessage]);

  // Focus input when tab becomes active
  useEffect(() => {
    if (isActive) {
      // Small delay to ensure DOM is ready after tab switch
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [sessionId, isActive]);

  // Close model dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (modelDropdownRef.current && !modelDropdownRef.current.contains(e.target as Node)) {
        setShowModelDropdown(false);
      }
    };
    if (showModelDropdown) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showModelDropdown]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const content = input.trim();
    if (!content || isSending || !hasApiKey || !currentModel) return;

    setInput("");
    await sendMessage(content, {
      providerId: currentModel.providerId,
      modelId: currentModel.id,
      canExecuteCode,
      enabledTools: Array.from(enabledTools),
    });
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
      <ContentHeader
        project={project ? { id: project.id, name: project.name } : null}
        title={session?.title || "Task"}
        subtitle={
          <span className="flex items-center gap-1">
            <Bot className="w-3.5 h-3.5" />
            {session?.agent || "default"} agent
            {session?.messageCount ? ` · ${session.messageCount} messages` : ""}
          </span>
        }
      >
        <button
          onClick={() => setShowToolsPanel(!showToolsPanel)}
          className={cn(
            "p-2 rounded-lg transition-colors",
            showToolsPanel
              ? "bg-accent-primary/20 text-accent-primary"
              : "hover:bg-bg-elevated text-text-muted hover:text-text-primary"
          )}
          title="Configure agent tools"
        >
          <Wrench className="w-5 h-5" />
        </button>
        <button
          onClick={() => setShowSystemPrompt(true)}
          className="p-2 hover:bg-bg-elevated rounded-lg text-text-muted hover:text-text-primary"
          title="View system prompt"
        >
          <Info className="w-5 h-5" />
        </button>
        <button
          className="p-2 hover:bg-bg-elevated rounded-lg text-text-muted hover:text-text-primary"
          title="Task options"
        >
          <MoreHorizontal className="w-5 h-5" />
        </button>
      </ContentHeader>

      {/* System Prompt Modal */}
      {showSystemPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-bg-primary border border-border rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h3 className="font-medium text-text-primary">System Prompt</h3>
              <button
                onClick={() => setShowSystemPrompt(false)}
                className="p-1 hover:bg-bg-elevated rounded text-text-muted hover:text-text-primary"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4">
              <pre className="text-sm text-text-secondary whitespace-pre-wrap font-mono bg-bg-secondary p-4 rounded-lg">
                {systemPromptPreview}
              </pre>
            </div>
            <div className="px-4 py-3 border-t border-border text-xs text-text-muted">
              This is the system prompt sent to the AI model at the start of each conversation turn.
            </div>
          </div>
        </div>
      )}

      {/* Tools Panel */}
      {showToolsPanel && (
        <div className="px-4 py-3 border-b border-border bg-bg-secondary">
          <ToolsPanel
            enabledTools={enabledTools}
            onToggleTool={handleToggleTool}
            canExecuteCode={canExecuteCode}
            onToggleCodeExecution={handleToggleCodeExecution}
          />
        </div>
      )}

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
                projectId={projectId}
                isOptimistic={message.id.startsWith("optimistic-")}
              />
            ))}
            {streamingMessage && (
              <StreamingMessageBubble message={streamingMessage} projectId={projectId} />
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
          {/* Model selector */}
          <div className="flex items-center gap-2 mb-2">
            <div className="relative" ref={modelDropdownRef}>
              <button
                type="button"
                onClick={() => setShowModelDropdown(!showModelDropdown)}
                disabled={availableModels.length === 0}
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm",
                  "bg-bg-primary border border-border",
                  "hover:border-accent-primary/50 transition-colors",
                  "text-text-primary",
                  availableModels.length === 0 && "opacity-50 cursor-not-allowed"
                )}
              >
                <Bot className="w-4 h-4 text-accent-primary" />
                <span>{currentModel?.name ?? "Select model"}</span>
                <ChevronDown className="w-3.5 h-3.5 text-text-muted" />
              </button>
              {showModelDropdown && availableModels.length > 0 && (
                <div className="absolute bottom-full left-0 mb-1 w-72 bg-bg-primary border border-border rounded-lg shadow-lg z-10 overflow-hidden max-h-80 overflow-y-auto">
                  <div className="py-1">
                    {/* Group models by provider */}
                    {["anthropic", "openai", "google"].map(providerId => {
                      const providerModels = availableModels.filter(m => m.providerId === providerId);
                      if (providerModels.length === 0) return null;
                      return (
                        <div key={providerId}>
                          <div className="px-3 py-1.5 text-xs font-medium text-text-muted uppercase tracking-wider bg-bg-secondary">
                            {providerModels[0]?.providerName}
                          </div>
                          {providerModels.map((model) => (
                            <button
                              key={model.id}
                              type="button"
                              onClick={() => {
                                setSelectedModel(model.id);
                                setShowModelDropdown(false);
                              }}
                              className={cn(
                                "w-full px-3 py-2 text-left hover:bg-bg-elevated transition-colors",
                                currentModel?.id === model.id && "bg-bg-elevated"
                              )}
                            >
                              <div className="flex items-center gap-2">
                                <div className="flex-1 min-w-0">
                                  <div className="font-medium text-sm text-text-primary">
                                    {model.name}
                                  </div>
                                </div>
                                {currentModel?.id === model.id && (
                                  <div className="w-2 h-2 rounded-full bg-accent-primary shrink-0" />
                                )}
                              </div>
                            </button>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
            {currentModel && (
              <span className="text-xs text-text-muted">
                {currentModel.providerName}
              </span>
            )}
          </div>
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
    parts: Array<{
      id: string;
      type: string;
      content: unknown;
      toolName?: string | null;
      toolCallId?: string | null;
      toolStatus?: string | null;
    }>;
  };
  projectId: string;
}

interface StreamingGroupedPart {
  type: "text" | "reasoning" | "tool";
  textPart?: StreamingMessageBubbleProps["message"]["parts"][0];
  reasoningPart?: StreamingMessageBubbleProps["message"]["parts"][0];
  toolCallPart?: StreamingMessageBubbleProps["message"]["parts"][0];
  toolResultPart?: StreamingMessageBubbleProps["message"]["parts"][0];
}

function StreamingMessageBubble({ message, projectId }: StreamingMessageBubbleProps) {
  const hasContent = message.parts.length > 0;

  // Group parts - pair tool calls with their results
  const groupedParts = useMemo(() => {
    const result: StreamingGroupedPart[] = [];
    const toolResultsById = new Map<string, StreamingMessageBubbleProps["message"]["parts"][0]>();

    // First pass: collect tool results by their toolCallId
    for (const part of message.parts) {
      if (part.type === "tool-result" && part.toolCallId) {
        toolResultsById.set(part.toolCallId, part);
      }
    }

    // Second pass: group parts
    for (const part of message.parts) {
      switch (part.type) {
        case "text":
          result.push({ type: "text", textPart: part });
          break;
        case "reasoning":
          result.push({ type: "reasoning", reasoningPart: part });
          break;
        case "tool-call":
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
        default:
          break;
      }
    }

    return result;
  }, [message.parts]);

  return (
    <div className="flex gap-3" data-testid="streaming-message">
      <div className="w-8 h-8 rounded-full bg-bg-elevated border border-border flex items-center justify-center shrink-0">
        <Bot className="w-4 h-4 text-text-primary" />
      </div>
      <div className="flex-1 min-w-0 space-y-2">
        {/* Render all grouped parts in order */}
        {groupedParts.map((group, index) => (
          <StreamingGroupedPartRenderer
            key={index}
            group={group}
            isLast={index === groupedParts.length - 1}
            isStreaming={message.isStreaming}
            projectId={projectId}
          />
        ))}

        {/* Show thinking indicator if no content yet */}
        {!hasContent && message.isStreaming && (
          <div className="flex items-center gap-2 text-text-muted text-sm">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Thinking...</span>
          </div>
        )}
      </div>
    </div>
  );
}

function StreamingGroupedPartRenderer({
  group,
  isLast,
  isStreaming,
  projectId,
}: {
  group: StreamingGroupedPart;
  isLast: boolean;
  isStreaming: boolean;
  projectId: string;
}) {
  switch (group.type) {
    case "text":
      const textContent = (group.textPart?.content as { text: string })?.text || "";
      if (!textContent) return null;
      return (
        <div className="px-4 py-2.5 rounded-2xl bg-bg-elevated text-text-primary border border-border">
          <Markdown>{textContent}</Markdown>
          {isLast && isStreaming && (
            <span className="inline-block w-2 h-4 bg-accent-primary/50 animate-pulse" />
          )}
        </div>
      );

    case "reasoning":
      return (
        <div className="px-4 py-2 bg-bg-secondary/50 border border-border/50 rounded-lg text-sm text-text-muted italic">
          <p className="whitespace-pre-wrap">{(group.reasoningPart?.content as { text: string })?.text || ""}</p>
        </div>
      );

    case "tool":
      if (!group.toolCallPart) return null;
      const callContent = group.toolCallPart.content as { name: string; args: unknown };
      const toolName = group.toolCallPart.toolName || callContent.name || "unknown";
      const args = callContent.args as Record<string, unknown> | undefined;
      const status = (group.toolCallPart.toolStatus || "pending") as
        | "pending"
        | "running"
        | "completed"
        | "error"
        | null;

      return (
        <ToolCall
          name={toolName}
          args={args}
          result={group.toolResultPart?.content}
          status={status}
          projectId={projectId}
          isStreaming={isStreaming}
        />
      );

    default:
      return null;
  }
}
