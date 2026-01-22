import { useState, useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  AlertCircle,
  GitCommit,
  Plus,
  Minus,
  Edit,
  ArrowRight,
  HelpCircle,
  Copy,
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
} from "lucide-react";
import { useGitStatus, useGitDiff } from "@/lib/api/queries";
import { useTabs } from "@/contexts/tabs";
import { useActionExecutor } from "../hooks";
import type { FileStatus } from "@/lib/api/types";

interface ReviewCommitPageProps {
  params: {
    projectId: string;
  };
}

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

interface DiffHunk {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  lines: Array<{ type: "add" | "remove" | "context"; content: string }>;
}

interface FileDiff {
  hunks: DiffHunk[];
}

function parseDiffSections(diffText: string): Record<string, FileDiff> {
  const sections: Record<string, FileDiff> = {};
  if (!diffText) return sections;

  const lines = diffText.split("\n");
  let currentFile = "";
  let currentHunk: DiffHunk | null = null;
  let currentHunks: DiffHunk[] = [];

  for (const line of lines) {
    if (line.startsWith("diff --git")) {
      if (currentFile && currentHunks.length > 0) {
        sections[currentFile] = { hunks: currentHunks };
      }
      const match = line.match(/diff --git a\/(.+) b\/(.+)/);
      if (match) {
        currentFile = match[2];
      }
      currentHunks = [];
      currentHunk = null;
      continue;
    }

    if (
      line.startsWith("index ") ||
      line.startsWith("--- ") ||
      line.startsWith("+++ ") ||
      line.startsWith("new file") ||
      line.startsWith("deleted file") ||
      line.startsWith("similarity") ||
      line.startsWith("rename")
    ) {
      continue;
    }

    const hunkMatch = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
    if (hunkMatch) {
      if (currentHunk) {
        currentHunks.push(currentHunk);
      }
      currentHunk = {
        oldStart: parseInt(hunkMatch[1], 10),
        oldCount: parseInt(hunkMatch[2] || "1", 10),
        newStart: parseInt(hunkMatch[3], 10),
        newCount: parseInt(hunkMatch[4] || "1", 10),
        lines: [],
      };
      continue;
    }

    if (currentHunk) {
      if (line.startsWith("+")) {
        currentHunk.lines.push({ type: "add", content: line.slice(1) });
      } else if (line.startsWith("-")) {
        currentHunk.lines.push({ type: "remove", content: line.slice(1) });
      } else if (line.startsWith(" ") || line === "") {
        currentHunk.lines.push({ type: "context", content: line.slice(1) || "" });
      }
    }
  }

  if (currentHunk) {
    currentHunks.push(currentHunk);
  }
  if (currentFile && currentHunks.length > 0) {
    sections[currentFile] = { hunks: currentHunks };
  }

  return sections;
}

export default function ReviewCommitPage({ params }: ReviewCommitPageProps) {
  const { projectId } = params;
  const navigate = useNavigate();
  const { pinTab, tabs, activeTabId } = useTabs();
  const { execute } = useActionExecutor();

  const [commitMessage, setCommitMessage] = useState("");
  const [collapsedFiles, setCollapsedFiles] = useState<Set<string>>(new Set());
  const [isCommitting, setIsCommitting] = useState(false);

  const {
    data: status,
    isLoading: statusLoading,
    error: statusError,
  } = useGitStatus(projectId);
  const { data: diff } = useGitDiff(projectId);

  const diffSections = useMemo(() => parseDiffSections(diff || ""), [diff]);

  const handleMessageChange = (value: string) => {
    setCommitMessage(value);
    if (value && activeTabId) {
      const activeTab = tabs.find((t) => t.id === activeTabId);
      if (activeTab?.preview) {
        pinTab(activeTabId);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commitMessage.trim() || isCommitting) return;

    setIsCommitting(true);
    try {
      await execute("git.createCommit", {
        projectId,
        message: commitMessage.trim(),
      });
    } finally {
      setIsCommitting(false);
    }
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

  const allExpanded = status?.files.every((f) => !collapsedFiles.has(f.path)) ?? false;

  const toggleAllFiles = () => {
    if (allExpanded) {
      setCollapsedFiles(new Set(status?.files.map((f) => f.path) || []));
    } else {
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
              </label>
              <textarea
                value={commitMessage}
                onChange={(e) => handleMessageChange(e.target.value)}
                placeholder="Describe your changes..."
                className="w-full px-3 py-2 bg-bg-primary border border-border rounded-md resize-none focus:outline-none focus:border-accent-primary text-text-primary"
                rows={3}
                disabled={isCommitting}
                autoFocus
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-text-secondary">
                {status.files.length} file{status.files.length !== 1 ? "s" : ""} will be
                committed
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() =>
                    navigate({ to: "/projects/$projectId", params: { projectId } })
                  }
                  className="px-4 py-2 text-sm text-text-primary rounded-md hover:bg-bg-tertiary transition-colors"
                  disabled={isCommitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!commitMessage.trim() || isCommitting}
                  className="px-4 py-2 bg-accent-primary text-white text-sm font-medium rounded-md hover:bg-accent-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isCommitting ? "Committing..." : "Commit"}
                </button>
              </div>
            </div>
          </div>
        </form>
      </div>

      {/* Changes list with diffs */}
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
                  {hasDiff &&
                    (isCollapsed ? (
                      <ChevronRight className="w-4 h-4 text-text-secondary" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-text-secondary" />
                    ))}
                  {getStatusIcon(file.status)}
                  <span className="flex-1 font-mono text-sm text-text-primary truncate">
                    {file.path}
                  </span>
                  <span className="text-xs text-text-secondary">
                    {getStatusLabel(file.status)}
                  </span>
                </button>
                {!isCollapsed && diffSections[file.path] && (
                  <div className="px-4 pb-3">
                    <div className="text-xs font-mono bg-bg-secondary rounded-md overflow-x-auto">
                      {diffSections[file.path].hunks.map((hunk, hunkIndex) => (
                        <div key={hunkIndex}>
                          <div className="px-3 py-1.5 bg-blue-500/10 text-blue-600 dark:text-blue-400 border-b border-border/50">
                            Lines {hunk.newStart}-{hunk.newStart + hunk.newCount - 1}
                          </div>
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
