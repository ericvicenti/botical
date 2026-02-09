import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { useSession, useSettings, useProject, useCoreTools, useSkills, useUpdateSystemPrompt } from "@/lib/api/queries";
import { useTaskMessages } from "@/hooks/useTaskMessages";
import { useTabs } from "@/contexts/tabs";
import { cn } from "@/lib/utils/cn";
import { Send, Loader2, Bot, MoreHorizontal, AlertTriangle, Info, X, ChevronDown, Wrench, Sparkles, ArrowDown } from "lucide-react";
import { MessageBubble } from "./MessageBubble";
import { Link } from "@tanstack/react-router";
import { Markdown } from "@/components/ui/Markdown";
import { ToolCall } from "@/components/ui/ToolCall";
import { ContentHeader } from "@/components/layout/ContentHeader";
import { ToolsPanel } from "./ToolsPanel";
import { SkillsPanel } from "./SkillsPanel";
import { useAvailableModels } from "@/hooks/useAvailableModels";
import type { ModelOption } from "@/hooks/useAvailableModels";
import type { Skill } from "@/lib/api/types";

interface TaskChatProps {
  sessionId: string;
  projectId: string;
  isActive?: boolean;
}

// ModelOption type imported from useAvailableModels

export function TaskChat({ sessionId, projectId, isActive = true }: TaskChatProps) {
  const { data: session, isLoading: sessionLoading } = useSession(sessionId, projectId);
  const { data: project } = useProject(projectId);
  const { data: settings } = useSettings();
  const { openTab } = useTabs();
  const {
    messages,
    streamingMessage,
    isLoading: messagesLoading,
    isSending,
    sendMessage,
    error,
  } = useTaskMessages({ sessionId, projectId });

  // System prompt mutation
  const updateSystemPromptMutation = useUpdateSystemPrompt();

  const [input, setInput] = useState("");
  const [showSystemPrompt, setShowSystemPrompt] = useState(false);
  const [editedSystemPrompt, setEditedSystemPrompt] = useState("");
  const [originalSystemPrompt, setOriginalSystemPrompt] = useState("");
  const [showToolsPanel, setShowToolsPanel] = useState(false);
  const [showSkillsPanel, setShowSkillsPanel] = useState(false);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [enabledTools, setEnabledTools] = useState<Set<string>>(new Set());
  const [toolsInitialized, setToolsInitialized] = useState(false);
  const [skillsInitialized, setSkillsInitialized] = useState(false);
  const [enabledSkills, setEnabledSkills] = useState<Set<string>>(new Set());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const modelDropdownRef = useRef<HTMLDivElement>(null);
  const toolsPanelRef = useRef<HTMLDivElement>(null);
  const skillsPanelRef = useRef<HTMLDivElement>(null);

  // Scroll state tracking
  const [isNearBottom, setIsNearBottom] = useState(true);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const lastMessageCountRef = useRef(messages.length);
  const lastStreamingRef = useRef(!!streamingMessage);

  // Load core tools to initialize enabled tools
  const { data: coreTools } = useCoreTools();

  // Load skills for this project
  const { data: skills } = useSkills(projectId);

  // Initialize enabled tools when core tools load (enable ALL tools by default)
  useEffect(() => {
    if (coreTools && !toolsInitialized) {
      const allTools = new Set(coreTools.map(t => t.name));
      setEnabledTools(allTools);
      setToolsInitialized(true);
    }
  }, [coreTools, toolsInitialized]);

  // Initialize enabled skills when skills load (enable ALL skills by default)
  useEffect(() => {
    if (skills && !skillsInitialized) {
      const allSkills = new Set(skills.map(s => s.name));
      setEnabledSkills(allSkills);
      setSkillsInitialized(true);
    }
  }, [skills, skillsInitialized]);

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

  // Detect which skills have been loaded by the agent (read_skill tool calls)
  const loadedSkills = useMemo(() => {
    const loaded = new Set<string>();
    for (const message of messages) {
      for (const part of message.parts) {
        if (part.type === "tool-call" && part.toolName === "read_skill") {
          const content = part.content as { args?: { name?: string } } | undefined;
          const skillName = content?.args?.name;
          if (skillName) {
            loaded.add(skillName);
          }
        }
      }
    }
    return loaded;
  }, [messages]);

  const handleToggleSkill = (skillName: string, enabled: boolean) => {
    setEnabledSkills(prev => {
      const next = new Set(prev);
      if (enabled) {
        next.add(skillName);
      } else {
        next.delete(skillName);
      }
      return next;
    });
  };

  const handleOpenSkillFile = (skill: Skill) => {
    // Open the SKILL.md file in a new tab
    openTab({
      type: "file",
      path: `${skill.path}/SKILL.md`,
      projectId,
    });
  };

  // Check if system prompt has been modified
  const isSystemPromptDirty = editedSystemPrompt !== originalSystemPrompt;

  const handleOpenSystemPrompt = () => {
    const currentPrompt = session?.systemPrompt || "";
    setEditedSystemPrompt(currentPrompt);
    setOriginalSystemPrompt(currentPrompt);
    setShowSystemPrompt(true);
  };

  const handleSaveSystemPrompt = useCallback(async () => {
    if (!session) return;
    
    try {
      await updateSystemPromptMutation.mutateAsync({
        projectId,
        sessionId: session.id,
        systemPrompt: editedSystemPrompt.trim() || null,
      });
      
      // Update the original after saving
      setOriginalSystemPrompt(editedSystemPrompt);
    } catch (error) {
      console.error('Failed to save system prompt:', error);
    }
  }, [session, projectId, editedSystemPrompt, updateSystemPromptMutation]);

  const handleDiscardChanges = useCallback(() => {
    setEditedSystemPrompt(originalSystemPrompt);
  }, [originalSystemPrompt]);

  const handleCloseSystemPrompt = useCallback(() => {
    if (isSystemPromptDirty) {
      const confirmed = window.confirm(
        "You have unsaved changes to the system prompt. Are you sure you want to close without saving?"
      );
      if (!confirmed) return;
    }
    setShowSystemPrompt(false);
  }, [isSystemPromptDirty]);

  // Filter models based on which API keys are configured
  const { models: availableModels } = useAvailableModels();

  // Get the default model (use anthropic as fallback)
  const defaultModel = useMemo(() => {
    if (!settings) return null;
    // Default to Anthropic Claude Sonnet 4 
    return "claude-sonnet-4-20250514";
  }, [settings]);

  // Initialize selected model from session or default
  useEffect(() => {
    if (session && availableModels.length > 0 && !selectedModel) {
      const sessionModel = session.modelId;
      if (sessionModel && availableModels.find(m => m.id === sessionModel)) {
        setSelectedModel(sessionModel);
      } else if (defaultModel && availableModels.find(m => m.id === defaultModel)) {
        setSelectedModel(defaultModel);
      }
    }
  }, [session, availableModels, defaultModel, selectedModel]);

  const currentModelId = selectedModel ?? session?.modelId ?? defaultModel;
  const currentModel = availableModels.find(m => m.id === currentModelId) ?? availableModels[0];

  const handleModelChange = async (modelId: string) => {
    setSelectedModel(modelId);
    setShowModelDropdown(false);
    
    // TODO: Update session with new model via API
    // For now, just store in local state
  };

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

  // Check if container is scrolled near the bottom
  const checkIsNearBottom = useCallback(() => {
    const container = messagesContainerRef.current;
    if (!container) return true;
    const threshold = 100; // pixels from bottom to consider "near bottom"
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    return distanceFromBottom <= threshold;
  }, []);

  // Handle scroll events to track user scroll position
  const handleScroll = useCallback(() => {
    const nearBottom = checkIsNearBottom();
    setIsNearBottom(nearBottom);
    // Hide the button if user scrolls to bottom
    if (nearBottom) {
      setShowScrollButton(false);
    }
  }, [checkIsNearBottom]);

  // Scroll to bottom function
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    setShowScrollButton(false);
    setIsNearBottom(true);
  }, []);

  // Auto-scroll to bottom when messages change, but only if user is near bottom
  useEffect(() => {
    const hasNewMessages = messages.length > lastMessageCountRef.current;
    const hasNewStreaming = !!streamingMessage && !lastStreamingRef.current;
    const hasContentUpdate = hasNewMessages || hasNewStreaming || (streamingMessage && isNearBottom);

    // Update refs for next comparison
    lastMessageCountRef.current = messages.length;
    lastStreamingRef.current = !!streamingMessage;

    if (isNearBottom && hasContentUpdate) {
      // User is at bottom, auto-scroll
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    } else if (!isNearBottom && (hasNewMessages || streamingMessage)) {
      // User has scrolled up and there's new content - show the button
      setShowScrollButton(true);
    }
  }, [messages, streamingMessage, isNearBottom]);

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

  // Handle keyboard shortcuts for system prompt
  useEffect(() => {
    if (!showSystemPrompt) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd+S or Ctrl+S to save
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (!updateSystemPromptMutation.isPending && isSystemPromptDirty) {
          handleSaveSystemPrompt();
        }
      }
      // Escape to close (with dirty state protection)
      if (e.key === "Escape") {
        e.preventDefault();
        handleCloseSystemPrompt();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [showSystemPrompt, updateSystemPromptMutation.isPending, isSystemPromptDirty, handleSaveSystemPrompt, handleCloseSystemPrompt]);

  // Close dropdowns and panels when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (modelDropdownRef.current && !modelDropdownRef.current.contains(e.target as Node)) {
        setShowModelDropdown(false);
      }
      if (toolsPanelRef.current && !toolsPanelRef.current.contains(e.target as Node)) {
        setShowToolsPanel(false);
      }
      if (skillsPanelRef.current && !skillsPanelRef.current.contains(e.target as Node)) {
        setShowSkillsPanel(false);
      }
    };
    if (showModelDropdown || showToolsPanel || showSkillsPanel) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showModelDropdown, showToolsPanel, showSkillsPanel]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const content = input.trim();
    if (!content || isSending || !hasApiKey || !currentModel) return;

    setInput("");
    await sendMessage(content, {
      providerId: currentModel.providerId,
      modelId: currentModel.id,
      canExecuteCode: true, // Always allow code execution
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
        {/* Model selector in top right */}
        <div className="relative" ref={modelDropdownRef}>
          <button
            type="button"
            onClick={() => setShowModelDropdown(!showModelDropdown)}
            disabled={availableModels.length === 0}
            className={cn(
              "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium",
              "bg-bg-primary border border-border",
              "hover:border-accent-primary/50 transition-colors",
              "text-text-primary min-w-0",
              availableModels.length === 0 && "opacity-50 cursor-not-allowed"
            )}
            title={`Current model: ${currentModel?.name || 'None'}`}
          >
            <Bot className="w-4 h-4 text-accent-primary shrink-0" />
            <span className="truncate max-w-32">{currentModel?.name ?? "Select model"}</span>
            <ChevronDown className="w-3.5 h-3.5 text-text-muted shrink-0" />
          </button>
          {showModelDropdown && availableModels.length > 0 && (
            <div className="absolute top-full right-0 mt-1 w-80 bg-bg-primary border border-border rounded-lg shadow-xl z-50 overflow-hidden max-h-80 overflow-y-auto">
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
                          onClick={() => handleModelChange(model.id)}
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

        {/* Toolbar buttons */}
        <div className="h-6 w-px bg-border" /> {/* Separator */}
        <button
          onClick={() => setShowToolsPanel(!showToolsPanel)}
          className={cn(
            "p-2 rounded-lg transition-colors relative",
            showToolsPanel
              ? "bg-accent-primary/20 text-accent-primary"
              : "hover:bg-bg-elevated text-text-muted hover:text-text-primary"
          )}
          title="Configure agent tools"
        >
          <Wrench className="w-5 h-5" />
        </button>
        <button
          onClick={() => setShowSkillsPanel(!showSkillsPanel)}
          className={cn(
            "p-2 rounded-lg transition-colors relative",
            showSkillsPanel
              ? "bg-accent-primary/20 text-accent-primary"
              : "hover:bg-bg-elevated text-text-muted hover:text-text-primary"
          )}
          title="View available skills"
        >
          <Sparkles className="w-5 h-5" />
        </button>
        <button
          onClick={handleOpenSystemPrompt}
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
          <div className="bg-bg-primary border border-border rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div className="flex items-center gap-3">
                <h3 className="font-medium text-text-primary">System Prompt</h3>
                {editedSystemPrompt.trim() && (
                  <span className="px-2 py-1 text-xs bg-accent-primary/10 text-accent-primary rounded-full">
                    Custom
                  </span>
                )}
                {isSystemPromptDirty && (
                  <span className="px-2 py-1 text-xs bg-yellow-500/10 text-yellow-500 rounded-full">
                    Unsaved Changes
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleSaveSystemPrompt}
                  disabled={!isSystemPromptDirty || updateSystemPromptMutation.isPending}
                  className={cn(
                    "px-3 py-1.5 rounded text-sm font-medium transition-colors",
                    isSystemPromptDirty && !updateSystemPromptMutation.isPending
                      ? "bg-accent-primary text-white hover:bg-accent-primary/90"
                      : "bg-bg-elevated text-text-muted cursor-not-allowed"
                  )}
                  title={`Save changes ${isSystemPromptDirty ? "(Cmd+S)" : ""}`}
                >
                  {updateSystemPromptMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    "Save"
                  )}
                </button>
                {isSystemPromptDirty && (
                  <button
                    onClick={handleDiscardChanges}
                    disabled={updateSystemPromptMutation.isPending}
                    className="px-3 py-1.5 rounded text-sm font-medium bg-bg-elevated text-text-muted hover:text-text-primary hover:bg-bg-secondary transition-colors disabled:opacity-50"
                    title="Discard changes"
                  >
                    Discard
                  </button>
                )}
                <button
                  onClick={handleCloseSystemPrompt}
                  className="p-1 hover:bg-bg-elevated rounded text-text-muted hover:text-text-primary"
                  title={isSystemPromptDirty ? "Close (will confirm unsaved changes)" : "Close"}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-4">
              <div className="h-full flex flex-col gap-4">
                {/* Always editable textarea */}
                <div className="flex-1 flex flex-col">
                  <label className="text-sm font-medium text-text-primary mb-2">
                    Custom System Prompt
                  </label>
                  <textarea
                    value={editedSystemPrompt}
                    onChange={(e) => setEditedSystemPrompt(e.target.value)}
                    placeholder="Enter your custom system prompt... (leave empty to use default)"
                    className={cn(
                      "flex-1 w-full p-4 bg-bg-secondary border rounded-lg text-sm text-text-primary placeholder:text-text-muted font-mono resize-none focus:outline-none transition-colors",
                      isSystemPromptDirty 
                        ? "border-accent-primary focus:border-accent-primary focus:ring-1 focus:ring-accent-primary/50" 
                        : "border-border focus:border-accent-primary"
                    )}
                    style={{ minHeight: "300px" }}
                  />
                </div>

                {/* Preview section when using default */}
                {!editedSystemPrompt.trim() && (
                  <div className="border-t border-border pt-4">
                    <h4 className="text-sm font-medium text-text-primary mb-2">Default System Prompt Preview</h4>
                    <pre className="text-xs text-text-secondary whitespace-pre-wrap font-mono bg-bg-elevated p-3 rounded-lg max-h-40 overflow-y-auto">
                      {systemPromptPreview}
                    </pre>
                  </div>
                )}
              </div>
            </div>
            <div className="px-4 py-3 border-t border-border">
              <div className="flex items-center justify-between">
                <p className="text-xs text-text-muted">
                  {editedSystemPrompt.trim() ? (
                    "Custom system prompts override the default agent prompt."
                  ) : (
                    "Using default system prompt generated from agent configuration and project context."
                  )}
                </p>
                {isSystemPromptDirty && (
                  <p className="text-xs text-text-muted">
                    Press <kbd className="px-1 py-0.5 text-xs bg-bg-elevated border border-border rounded">Cmd+S</kbd> to save
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Floating Tools Panel */}
      {showToolsPanel && (
        <div className="fixed inset-0 z-40" style={{ pointerEvents: showToolsPanel ? 'auto' : 'none' }}>
          <div className="absolute inset-0 bg-black/20" onClick={() => setShowToolsPanel(false)} />
          <div className="absolute top-16 right-4 w-96 max-h-[calc(100vh-120px)]" ref={toolsPanelRef}>
            <div className="bg-bg-primary border border-border rounded-lg shadow-xl overflow-hidden">
              <ToolsPanel
                enabledTools={enabledTools}
                onToggleTool={handleToggleTool}
              />
            </div>
          </div>
        </div>
      )}

      {/* Floating Skills Panel */}
      {showSkillsPanel && (
        <div className="fixed inset-0 z-40" style={{ pointerEvents: showSkillsPanel ? 'auto' : 'none' }}>
          <div className="absolute inset-0 bg-black/20" onClick={() => setShowSkillsPanel(false)} />
          <div className="absolute top-16 right-4 w-96 max-h-[calc(100vh-120px)]" ref={skillsPanelRef}>
            <div className="bg-bg-primary border border-border rounded-lg shadow-xl overflow-hidden">
              <SkillsPanel
                projectId={projectId}
                enabledSkills={enabledSkills}
                loadedSkills={loadedSkills}
                onToggleSkill={handleToggleSkill}
                onOpenSkillFile={handleOpenSkillFile}
              />
            </div>
          </div>
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="px-4 py-2 bg-red-500/10 border-b border-red-500/20">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {/* Messages */}
      <div
        ref={messagesContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-auto p-4 relative"
      >
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
            {streamingMessage && !messages.find(m => m.id === streamingMessage.id) && (
              <StreamingMessageBubble message={streamingMessage} projectId={projectId} />
            )}
            <div ref={messagesEndRef} />
          </div>
        )}

        {/* Scroll to bottom button */}
        {showScrollButton && (
          <div className="sticky bottom-4 flex justify-center pointer-events-none">
            <button
              onClick={scrollToBottom}
              className={cn(
                "pointer-events-auto p-2 rounded-full",
                "bg-bg-elevated border border-border shadow-lg",
                "hover:bg-bg-secondary hover:border-accent-primary/50",
                "transition-all duration-200",
                "flex items-center justify-center"
              )}
              title="Scroll to bottom"
              data-testid="scroll-to-bottom-button"
            >
              <ArrowDown className="w-5 h-5 text-text-primary" />
            </button>
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
          {/* Model status indicator */}
          {currentModel && (
            <div className="flex items-center gap-2 mb-3 text-xs text-text-muted">
              <Bot className="w-3.5 h-3.5 text-accent-primary" />
              <span>Using {currentModel.name} ({currentModel.providerName})</span>
            </div>
          )}
          
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
