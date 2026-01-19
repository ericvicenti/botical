import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { AlertCircle, GitCommit, Plus, Minus, Edit, ArrowRight, HelpCircle, Copy, ChevronDown, ChevronRight } from "lucide-react";
import { useGitStatus, useGitDiff, useCreateCommit } from "@/lib/api/queries";
import { useTabs } from "@/contexts/tabs";
import type { FileStatus } from "@/lib/api/types";

export const Route = createFileRoute("/projects/$projectId/commit")({
  component: ReviewCommitPage,
});

function getStatusIcon(status: FileStatus) {
  switch (status) {
    case "A":
      return <Plus className="w-4 h-4 text-green-500" />;
    case "D":
      return <Minus className="w-4 h-4 text-red-500" />;
    case "M":
      return <Edit className="w-4 h-4 text-yellow-500" />;
    case "R":
      return <ArrowRight className="w-4 h-4 text-blue-500" />;
    case "C":
      return <Copy className="w-4 h-4 text-purple-500" />;
    case "?":
      return <HelpCircle className="w-4 h-4 text-gray-500" />;
    default:
      return <Edit className="w-4 h-4 text-text-secondary" />;
  }
}

function getStatusLabel(status: FileStatus): string {
  switch (status) {
    case "A":
      return "Added";
    case "D":
      return "Deleted";
    case "M":
      return "Modified";
    case "R":
      return "Renamed";
    case "C":
      return "Copied";
    case "?":
      return "Untracked";
    default:
      return "Unknown";
  }
}

// Parse diff into sections per file
function parseDiffSections(diffText: string): Record<string, string> {
  const sections: Record<string, string> = {};
  if (!diffText) return sections;

  const lines = diffText.split("\n");
  let currentFile = "";
  let currentSection: string[] = [];

  for (const line of lines) {
    if (line.startsWith("diff --git")) {
      if (currentFile && currentSection.length > 0) {
        sections[currentFile] = currentSection.join("\n");
      }
      const match = line.match(/diff --git a\/(.+) b\/(.+)/);
      if (match) {
        currentFile = match[2];
      }
      currentSection = [line];
    } else {
      currentSection.push(line);
    }
  }

  if (currentFile && currentSection.length > 0) {
    sections[currentFile] = currentSection.join("\n");
  }

  return sections;
}

function ReviewCommitPage() {
  const { projectId } = Route.useParams();
  const navigate = useNavigate();
  const { openTab, pinTab, tabs, activeTabId } = useTabs();

  const [commitMessage, setCommitMessage] = useState("");
  const [collapsedFiles, setCollapsedFiles] = useState<Set<string>>(new Set());

  const { data: status, isLoading: statusLoading, error: statusError } = useGitStatus(projectId);
  const { data: diff } = useGitDiff(projectId);
  const commitMutation = useCreateCommit();

  const diffSections = useMemo(() => parseDiffSections(diff || ""), [diff]);

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
              <label className="block text-sm font-medium text-text-primary mb-1">Commit Message</label>
              <textarea
                value={commitMessage}
                onChange={(e) => handleMessageChange(e.target.value)}
                placeholder="Describe your changes..."
                className="w-full px-3 py-2 bg-bg-primary border border-border rounded-md resize-none focus:outline-none focus:border-accent-primary text-text-primary"
                rows={3}
                disabled={commitMutation.isPending}
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
        <div className="px-4 py-2 text-xs font-medium text-text-secondary uppercase tracking-wide bg-bg-secondary sticky top-0 border-b border-border">
          Changes
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
                    <pre className="text-xs font-mono bg-bg-secondary p-3 rounded-md overflow-x-auto">
                      {diffSections[file.path].split("\n").map((line, i) => (
                        <div
                          key={i}
                          className={
                            line.startsWith("+") && !line.startsWith("+++")
                              ? "text-green-600 dark:text-green-400"
                              : line.startsWith("-") && !line.startsWith("---")
                                ? "text-red-600 dark:text-red-400"
                                : line.startsWith("@@")
                                  ? "text-blue-600 dark:text-blue-400"
                                  : "text-text-primary"
                          }
                        >
                          {line || " "}
                        </div>
                      ))}
                    </pre>
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
