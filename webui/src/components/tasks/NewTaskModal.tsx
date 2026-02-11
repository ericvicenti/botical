/**
 * New Task Modal
 *
 * Modal for creating a new task with:
 * - Message input (required)
 * - Title (optional, auto-generates from message if empty)
 * - Agent selection
 */

import { useState, useEffect, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import { X, Send, ChevronDown, Bot } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { useCreateSession, useSendMessage, useSettings, getSettings, useAgents } from "@/lib/api/queries";
import type { AgentConfig } from "@/lib/api/queries";
import { useTabs } from "@/contexts/tabs";

interface NewTaskModalProps {
  projectId: string;
  onClose: () => void;
}

export function NewTaskModal({ projectId, onClose }: NewTaskModalProps) {
  const navigate = useNavigate();
  const { openTab } = useTabs();
  const { data: agents } = useAgents(projectId);
  const { data: settings } = useSettings();
  const createSession = useCreateSession();
  const sendMessage = useSendMessage();

  const [message, setMessage] = useState("");
  const [title, setTitle] = useState("");
  const [selectedAgentName, setSelectedAgentName] = useState<string | null>(null);
  const [showAgentDropdown, setShowAgentDropdown] = useState(false);
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
        setShowAgentDropdown(false);
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

  const handleSubmit = async () => {
    if (!message.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const taskTitle = title.trim() || generateTitle(message);

      // Create session — backend resolves agent's modelId onto the session
      const session = await createSession.mutateAsync({
        projectId,
        title: taskTitle,
        agent: selectedAgentName || "default",
      });

      const currentSettings = settings || getSettings();

      // Send the first available API key — backend will pick the right provider
      const apiKey = currentSettings.anthropicApiKey || currentSettings.openaiApiKey || currentSettings.googleApiKey;

      // Navigate and close immediately, send message in background
      openTab({
        type: "task",
        sessionId: session.id,
        projectId,
        title: taskTitle,
      });
      navigate({ to: "/tasks/$sessionId", params: { sessionId: session.id } });
      onClose();

      // Fire and forget — backend resolves model/provider from session config
      sendMessage.mutate({
        projectId,
        sessionId: session.id,
        content: message.trim(),
        userId: currentSettings.userId,
        apiKey,
      });
    } catch (err) {
      console.error("Failed to create task:", err);
      alert(`Failed to create task: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
    }
  };

  const selectedAgent = agents?.find((a) => a.name === selectedAgentName);

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-bg-primary border border-border rounded-lg w-full max-w-xl mx-2 sm:mx-0 shadow-xl max-h-[95vh] sm:max-h-[85vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-lg font-semibold text-text-primary">New Task</h2>
          <button
            onClick={onClose}
            className="p-2 text-text-muted hover:text-text-primary rounded"
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

          {/* Agent selector */}
          <div className="relative" ref={dropdownRef}>
            <label className="block text-sm font-medium text-text-primary mb-1">
              Agent
            </label>
            <button
              type="button"
              onClick={() => setShowAgentDropdown(!showAgentDropdown)}
              className={cn(
                "w-full px-3 py-2 bg-bg-secondary border border-border rounded-lg",
                "text-left flex items-center justify-between",
                "focus:outline-none focus:border-accent-primary"
              )}
              data-testid="new-task-agent-select"
            >
              <div className="flex items-center gap-2">
                <Bot className="w-4 h-4 text-text-muted" />
                <span className={selectedAgent ? "text-text-primary" : "text-text-muted"}>
                  {selectedAgent ? selectedAgent.name : "Default"}
                </span>
              </div>
              <ChevronDown className="w-4 h-4 text-text-muted" />
            </button>

            {showAgentDropdown && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-bg-primary border border-border rounded-lg shadow-lg z-10 max-h-60 overflow-auto">
                <button
                  type="button"
                  onClick={() => { setSelectedAgentName(null); setShowAgentDropdown(false); }}
                  className={cn(
                    "w-full px-3 py-2 text-left hover:bg-bg-elevated flex items-center gap-2",
                    !selectedAgentName && "bg-accent-primary/10"
                  )}
                >
                  <Bot className="w-4 h-4 text-text-muted" />
                  <div>
                    <div className="text-sm text-text-primary">Default</div>
                    <div className="text-xs text-text-muted">No agent preset</div>
                  </div>
                </button>
                {agents && agents.length > 0 ? (
                  agents.map((agent) => (
                    <button
                      key={agent.id}
                      type="button"
                      onClick={() => { setSelectedAgentName(agent.name); setShowAgentDropdown(false); }}
                      className={cn(
                        "w-full px-3 py-2 text-left hover:bg-bg-elevated flex items-start gap-2",
                        selectedAgentName === agent.name && "bg-accent-primary/10"
                      )}
                    >
                      <Bot className="w-4 h-4 text-text-muted mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-text-primary truncate">{agent.name}</div>
                        {agent.description && (
                          <div className="text-xs text-text-muted truncate">{agent.description}</div>
                        )}
                      </div>
                    </button>
                  ))
                ) : (
                  <div className="px-3 py-2 text-sm text-text-muted">
                    No agents yet. Create one in the Agents tab.
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

function generateTitle(message: string): string {
  const firstLine = message.split("\n")[0] || message;
  const truncated = firstLine.slice(0, 50);
  return truncated.length < firstLine.length ? truncated + "..." : truncated;
}
