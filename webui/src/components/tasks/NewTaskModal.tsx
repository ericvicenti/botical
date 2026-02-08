/**
 * New Task Modal
 *
 * Modal for creating a new task with:
 * - Message input (required)
 * - Title (optional, auto-generates from message if empty)
 * - Template selection
 */

import { useState, useEffect, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import { X, Send, ChevronDown, Bot } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { useTemplates, useCreateSession, useSendMessage, useSettings, getSettings } from "@/lib/api/queries";
import { useTabs } from "@/contexts/tabs";
import type { TaskTemplateSummary } from "@/lib/api/types";

interface NewTaskModalProps {
  projectId: string;
  onClose: () => void;
}

export function NewTaskModal({ projectId, onClose }: NewTaskModalProps) {
  const navigate = useNavigate();
  const { openTab } = useTabs();
  const { data: templates, isLoading: templatesLoading } = useTemplates(projectId);
  const { data: settings } = useSettings();
  const createSession = useCreateSession();
  const sendMessage = useSendMessage();

  const [message, setMessage] = useState("");
  const [title, setTitle] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [showTemplateDropdown, setShowTemplateDropdown] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const messageInputRef = useRef<HTMLTextAreaElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Focus message input on mount
  useEffect(() => {
    messageInputRef.current?.focus();
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowTemplateDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  const selectedTemplate = templates?.find((t) => t.id === selectedTemplateId);

  // Get provider/model from agent class
  const getProviderModel = (agentClass: string) => {
    const currentSettings = settings || getSettings();
    const agentClassConfig = currentSettings.agentClasses?.find((c) => c.id === agentClass);
    if (agentClassConfig) {
      return {
        providerId: agentClassConfig.providerId,
        modelId: agentClassConfig.modelId,
      };
    }
    // Default to medium
    const mediumClass = currentSettings.agentClasses?.find((c) => c.id === "medium");
    if (mediumClass) {
      return {
        providerId: mediumClass.providerId,
        modelId: mediumClass.modelId,
      };
    }
    return {
      providerId: currentSettings.defaultProvider || "anthropic",
      modelId: "claude-sonnet-4-20250514",
    };
  };

  const handleSubmit = async () => {
    if (!message.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      // Generate title from message if not provided
      const taskTitle = title.trim() || generateTitle(message);

      // Get provider/model from template's agent class
      const agentClass = selectedTemplate?.agentClass || "medium";
      const { providerId, modelId } = getProviderModel(agentClass);

      // Create session
      const session = await createSession.mutateAsync({
        projectId,
        title: taskTitle,
        agent: selectedTemplateId || "default",
      });

      // Get API key for the provider
      const currentSettings = settings || getSettings();
      let apiKey: string | undefined;
      if (providerId === "anthropic") {
        apiKey = currentSettings.anthropicApiKey;
      } else if (providerId === "openai") {
        apiKey = currentSettings.openaiApiKey;
      } else if (providerId === "google") {
        apiKey = currentSettings.googleApiKey;
      }

      // Send the first message
      await sendMessage.mutateAsync({
        projectId,
        sessionId: session.id,
        content: message.trim(),
        userId: currentSettings.userId,
        providerId,
        apiKey,
        modelId,
      });

      // Open tab and navigate
      openTab({
        type: "task",
        sessionId: session.id,
        projectId,
        title: taskTitle,
      });
      navigate({ to: "/tasks/$sessionId", params: { sessionId: session.id } });
      onClose();
    } catch (err) {
      console.error("Failed to create task:", err);
      alert(`Failed to create task: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Submit on Cmd/Ctrl + Enter
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-bg-primary border border-border rounded-lg w-full max-w-xl shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-lg font-semibold text-text-primary">New Task</h2>
          <button
            onClick={onClose}
            className="p-1 text-text-muted hover:text-text-primary rounded"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Title (optional) */}
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">
              Title <span className="text-text-muted font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Auto-generated from message if empty"
              className={cn(
                "w-full px-3 py-2 bg-bg-secondary border border-border rounded-lg",
                "text-text-primary placeholder:text-text-muted",
                "focus:outline-none focus:border-accent-primary"
              )}
              data-testid="new-task-title-input"
            />
          </div>

          {/* Template selector */}
          <div className="relative" ref={dropdownRef}>
            <label className="block text-sm font-medium text-text-primary mb-1">
              Template
            </label>
            <button
              type="button"
              onClick={() => setShowTemplateDropdown(!showTemplateDropdown)}
              className={cn(
                "w-full px-3 py-2 bg-bg-secondary border border-border rounded-lg",
                "text-left flex items-center justify-between",
                "focus:outline-none focus:border-accent-primary"
              )}
              data-testid="new-task-template-select"
            >
              <div className="flex items-center gap-2">
                <Bot className="w-4 h-4 text-text-muted" />
                <span className={selectedTemplate ? "text-text-primary" : "text-text-muted"}>
                  {selectedTemplate ? selectedTemplate.name : "Default (no template)"}
                </span>
              </div>
              <ChevronDown className="w-4 h-4 text-text-muted" />
            </button>

            {showTemplateDropdown && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-bg-primary border border-border rounded-lg shadow-lg z-10 max-h-60 overflow-auto">
                {/* Default option */}
                <button
                  type="button"
                  onClick={() => {
                    setSelectedTemplateId(null);
                    setShowTemplateDropdown(false);
                  }}
                  className={cn(
                    "w-full px-3 py-2 text-left hover:bg-bg-elevated flex items-center gap-2",
                    selectedTemplateId === null && "bg-accent-primary/10"
                  )}
                >
                  <Bot className="w-4 h-4 text-text-muted" />
                  <div>
                    <div className="text-sm text-text-primary">Default</div>
                    <div className="text-xs text-text-muted">No template</div>
                  </div>
                </button>

                {templatesLoading ? (
                  <div className="px-3 py-2 text-sm text-text-muted">Loading templates...</div>
                ) : templates && templates.length > 0 ? (
                  templates.map((template) => (
                    <TemplateOption
                      key={template.id}
                      template={template}
                      selected={selectedTemplateId === template.id}
                      onSelect={() => {
                        setSelectedTemplateId(template.id);
                        setShowTemplateDropdown(false);
                      }}
                    />
                  ))
                ) : (
                  <div className="px-3 py-2 text-sm text-text-muted">
                    No templates found. Create templates in .botical/templates/
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Message input */}
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">
              Message <span className="text-accent-error">*</span>
            </label>
            <textarea
              ref={messageInputRef}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="What would you like to do?"
              rows={4}
              className={cn(
                "w-full px-3 py-2 bg-bg-secondary border border-border rounded-lg",
                "text-text-primary placeholder:text-text-muted",
                "focus:outline-none focus:border-accent-primary",
                "resize-none"
              )}
              data-testid="new-task-message-input"
            />
            <p className="text-xs text-text-muted mt-1">
              Press <kbd className="px-1 py-0.5 bg-bg-elevated rounded text-text-secondary">⌘ Enter</kbd> to create
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-4 py-3 border-t border-border">
          <button
            onClick={onClose}
            className="px-4 py-2 text-text-secondary hover:text-text-primary"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!message.trim() || isSubmitting}
            className={cn(
              "px-4 py-2 bg-accent-primary text-white rounded-lg",
              "hover:bg-accent-primary/90 transition-colors",
              "flex items-center gap-2",
              "disabled:opacity-50 disabled:cursor-not-allowed"
            )}
            data-testid="new-task-submit-button"
          >
            {isSubmitting ? (
              "Creating..."
            ) : (
              <>
                <Send className="w-4 h-4" />
                Create Task
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function TemplateOption({
  template,
  selected,
  onSelect,
}: {
  template: TaskTemplateSummary;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "w-full px-3 py-2 text-left hover:bg-bg-elevated flex items-start gap-2",
        selected && "bg-accent-primary/10"
      )}
    >
      <Bot className="w-4 h-4 text-text-muted mt-0.5" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm text-text-primary truncate">{template.name}</span>
          <span className="text-xs text-text-muted px-1.5 py-0.5 bg-bg-elevated rounded shrink-0">
            {template.agentClass}
          </span>
        </div>
        {template.description && (
          <div className="text-xs text-text-muted truncate">{template.description}</div>
        )}
      </div>
    </button>
  );
}

/**
 * Generate a title from the message content
 */
function generateTitle(message: string): string {
  // Take first line or first 50 chars
  const firstLine = message.split("\n")[0] || message;
  const truncated = firstLine.slice(0, 50);
  return truncated.length < firstLine.length ? truncated + "..." : truncated;
}
