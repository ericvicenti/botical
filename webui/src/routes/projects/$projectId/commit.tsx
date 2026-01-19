import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useMemo, useEffect, useRef } from "react";
import { AlertCircle, GitCommit, Plus, Minus, Edit, ArrowRight, HelpCircle, Copy, ChevronDown, ChevronRight, ChevronsUpDown, Sparkles, Loader2 } from "lucide-react";
import { useGitStatus, useGitDiff, useCreateCommit, useGenerateCommitMessage, useSettings } from "@/lib/api/queries";
import { useTabs } from "@/contexts/tabs";
import type { FileStatus } from "@/lib/api/types";

export const Route = createFileRoute("/projects/$projectId/commit")({
  component: ReviewCommitPageRoute,
});

function ReviewCommitPageRoute() {
  const { projectId } = Route.useParams();
  const navigate = useNavigate();
  const { openTab, pinTab, tabs, activeTabId } = useTabs();

  const [commitMessage, setCommitMessage] = useState("");
  const [collapsedFiles, setCollapsedFiles] = useState<Set<string>>(new Set());
  const hasTriedAutoGenerate = useRef(false);

  const { data: status, isLoading: statusLoading, error: statusError } = useGitStatus(projectId);
  const { data: diff } = useGitDiff(projectId);
  const { data: settings } = useSettings();
  const commitMutation = useCreateCommit();
  const generateMutation = useGenerateCommitMessage();

  const diffSections = useMemo(() => parseDiffSections(diff || ""), [diff]);

  // Auto-generate commit message when page loads with diff and no message
  useEffect(() => {
    if (
      !hasTriedAutoGenerate.current &&
      diff &&
      diff.trim().length > 0 &&
      !commitMessage &&
      settings?.userId &&
      !generateMutation.isPending
    ) {
      hasTriedAutoGenerate.current = true;

      // Get API key for the default provider
      const providerId = settings.defaultProvider || "anthropic";
      const apiKey = providerId === "anthropic"
        ? settings.anthropicApiKey
        : providerId === "openai"
        ? settings.openaiApiKey
        : settings.googleApiKey;

      if (apiKey) {
        generateMutation.mutate(
          { projectId, diff, userId: settings.userId, providerId, apiKey },
          {
            onSuccess: (data) => {
              setCommitMessage(data.message);
            },
          }
        );
      }
    }
  }, [diff, commitMessage, settings, projectId, generateMutation]);

  // Pin the tab when user starts typing
  const handleMessageChange = (value: string) => {
    setCommitMessage(value);
    if (value && activeTabId) {
      const activeTab = tabs.find(t => t.id === activeTabId);
      if (activeTab?.preview) {
        pinTab(activeTabId);
      }
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!commitMessage.trim()) return;

    commitMutation.mutate(
      { projectId, message: commitMessage.trim() },
      {
        onSuccess: (result) => {
          openTab({
            type: "commit",
            projectId,
            hash: result.hash,
          });
          navigate({ to: "/projects/$projectId/commits/$hash", params: { projectId, hash: result.hash } });
        },
      }
    );
  };

  const toggleFileCollapsed = (path: string) => {
    setCollapsedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const allExpanded = status?.files.every(f => !collapsedFiles.has(f.path)) ?? false;

  const toggleAllFiles = () => {
    if (allExpanded) {
      // Collapse all
      setCollapsedFiles(new Set(status?.files.map(f => f.path) || []));
    } else {
      // Expand all
      setCollapsedFiles(new Set());
    }
  };

  if (statusLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-text-secondary">Loading...</div>
      </div>
    );
  }

  if (statusError || !status) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-2">
        <AlertCircle className="w-8 h-8 text-red-500" />
        <div className="text-text-secondary">Failed to load git status</div>
      </div>
    );
  }

  if (!status.isRepo) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3">
        <GitCommit className="w-10 h-10 text-text-secondary" />
        <div className="text-text-secondary">This project is not a git repository</div>
      </div>
    );
  }

  if (status.files.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3">
        <GitCommit className="w-10 h-10 text-text-secondary" />
        <div className="text-text-secondary">No changes to commit</div>
        <div className="text-sm text-text-secondary">Working tree is clean</div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header with commit message */}
      <div className="p-4 border-b border-border bg-bg-secondary flex-shrink-0">
        <form onSubmit={handleSubmit}>
          <div className="flex flex-col gap-3">
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">
                Commit Message
                {generateMutation.isPending && (
                  <span className="ml-2 text-text-secondary font-normal inline-flex items-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Generating...
                  </span>
                )}
              </label>
              <textarea
                value={commitMessage}
                onChange={(e) => handleMessageChange(e.target.value)}
                placeholder={generateMutation.isPending ? "Generating commit message..." : "Describe your changes..."}
                className="w-full px-3 py-2 bg-bg-primary border border-border rounded-md resize-none focus:outline-none focus:border-accent-primary text-text-primary"
                rows={4}
                disabled={commitMutation.isPending || generateMutation.isPending}
                autoFocus
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-text-secondary">
                {status.files.length} file{status.files.length !== 1 ? "s" : ""} will be committed
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => navigate({ to: "/projects/$projectId", params: { projectId } })}
                  className="px-4 py-2 text-sm text-text-primary rounded-md hover:bg-bg-tertiary transition-colors"
                  disabled={commitMutation.isPending}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!commitMessage.trim() || commitMutation.isPending}
                  className="px-4 py-2 bg-accent-primary text-white text-sm font-medium rounded-md hover:bg-accent-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {commitMutation.isPending ? "Committing..." : "Commit"}
                </button>
              </div>
            </div>
          </div>
        </form>
      </div>

      {/* Changes list with diffs shown by default */}
      <div className="flex-1 overflow-auto">
        <div className="px-4 py-2 flex items-center justify-between bg-bg-secondary sticky top-0 border-b border-border">
          <span className="text-xs font-medium text-text-secondary uppercase tracking-wide">
            Changes
          </span>
          <button
            onClick={toggleAllFiles}
            className="flex items-center gap-1 px-2 py-1 text-xs text-text-secondary hover:text-text-primary hover:bg-bg-tertiary rounded transition-colors"
          >
            <ChevronsUpDown className="w-3.5 h-3.5" />
            {allExpanded ? "Collapse All" : "Expand All"}
          </button>
        </div>
        <div className="divide-y divide-border">
          {status.files.map((file) => {
            const isCollapsed = collapsedFiles.has(file.path);
            const hasDiff = !!diffSections[file.path];

            return (
              <div key={file.path} className="bg-bg-primary">
                <button
                  onClick={() => toggleFileCollapsed(file.path)}
                  className="w-full flex items-center gap-3 px-4 py-2 hover:bg-bg-tertiary text-left"
                >
                  {hasDiff && (
                    isCollapsed
                      ? <ChevronRight className="w-4 h-4 text-text-secondary" />
                      : <ChevronDown className="w-4 h-4 text-text-secondary" />
                  )}
                  {getStatusIcon(file.status)}
                  <span className="flex-1 font-mono text-sm text-text-primary truncate">{file.path}</span>
                  <span className="text-xs text-text-secondary">{getStatusLabel(file.status)}</span>
                </button>
                {!isCollapsed && diffSections[file.path] && (
                  <div className="px-4 pb-3">
                    <div className="text-xs font-mono bg-bg-secondary rounded-md overflow-x-auto">
                      {diffSections[file.path].hunks.map((hunk, hunkIndex) => (
                        <div key={hunkIndex}>
                          {/* Hunk header */}
                          <div className="px-3 py-1.5 bg-blue-500/10 text-blue-600 dark:text-blue-400 border-b border-border/50">
                            Lines {hunk.newStart}-{hunk.newStart + hunk.newCount - 1}
                          </div>
                          {/* Diff lines */}
                          {hunk.lines.map((line, lineIndex) => (
                            <div
                              key={lineIndex}
                              className={`px-3 py-0.5 ${
                                line.type === "add"
                                  ? "bg-green-500/20 text-green-700 dark:text-green-300"
                                  : line.type === "remove"
                                    ? "bg-red-500/20 text-red-700 dark:text-red-300"
                                    : "text-text-primary"
                              }`}
                            >
                              <span className="select-none opacity-50 mr-2">
                                {line.type === "add" ? "+" : line.type === "remove" ? "-" : " "}
                              </span>
                              {line.content || " "}
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
