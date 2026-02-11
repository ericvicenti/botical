import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  AlertCircle,
  GitCommit,
  Plus,
  Minus,
  Edit,
  ArrowRight,
  Copy,
  ChevronDown,
  ChevronRight,
  User,
  Clock,
  ExternalLink,
  FolderOpen,
} from "lucide-react";
import { useGitCommit, useGitCommitDiff } from "@/lib/api/queries";
import type { FileStatus } from "@/lib/api/types";

interface CommitViewPageProps {
  params: {
    projectId: string;
    hash: string;
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
    default:
      return <Edit className="w-4 h-4 text-text-secondary" />;
  }
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString(undefined, {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
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

export default function CommitViewPage({ params }: CommitViewPageProps) {
  const { projectId, hash } = params;
  const navigate = useNavigate();
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());

  const {
    data: commit,
    isLoading: commitLoading,
    error: commitError,
  } = useGitCommit(projectId, hash);
  const { data: diff } = useGitCommitDiff(projectId, hash);

  const handleBrowseAtCommit = () => {
    navigate({ to: `/folders/${projectId}`, search: { commit: hash } });
  };

  const handleViewFileAtCommit = (filePath: string) => {
    navigate({ to: `/files/${projectId}/${filePath}`, search: { commit: hash } });
  };

  const toggleFileExpanded = (path: string) => {
    setExpandedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  if (commitLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-text-secondary">Loading commit...</div>
      </div>
    );
  }

  if (commitError || !commit) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-2">
        <AlertCircle className="w-8 h-8 text-red-500" />
        <div className="text-text-secondary">Commit not found</div>
        <div className="text-sm text-text-secondary font-mono">{hash}</div>
      </div>
    );
  }

  const diffSections = parseDiffSections(diff || "");

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Commit header */}
      <div className="p-3 sm:p-4 border-b border-border bg-bg-secondary flex-shrink-0">
        <div className="flex items-start gap-3">
          <GitCommit className="w-6 h-6 text-accent mt-1 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-mono text-sm text-accent">{commit.hashShort}</span>
              <span className="text-xs text-text-secondary font-mono hidden sm:inline">
                ({commit.hash})
              </span>
            </div>
            <h1 className="text-lg font-medium mb-2">{commit.message}</h1>
            {commit.body && (
              <p className="text-sm text-text-secondary whitespace-pre-wrap mb-3">
                {commit.body}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-sm text-text-secondary">
              <div className="flex items-center gap-1.5 min-w-0">
                <User className="w-4 h-4 shrink-0" />
                <span className="truncate">{commit.author}</span>
                <span className="text-text-secondary hidden sm:inline">
                  {"<"}
                  {commit.email}
                  {">"}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <Clock className="w-4 h-4" />
                <span>{formatDate(commit.date)}</span>
              </div>
            </div>
          </div>
        </div>
        <button
          onClick={handleBrowseAtCommit}
          className="flex items-center gap-2 px-3 py-1.5 text-sm text-text-secondary hover:text-text-primary hover:bg-bg-tertiary rounded-md transition-colors"
        >
          <FolderOpen className="w-4 h-4" />
          Browse at this commit
        </button>
      </div>

      {/* Files changed */}
      <div className="flex-1 overflow-auto">
        <div className="px-4 py-2 text-xs font-medium text-text-secondary uppercase tracking-wide bg-bg-secondary sticky top-0 border-b border-border">
          {commit.files?.length || 0} file{(commit.files?.length || 0) !== 1 ? "s" : ""}{" "}
          changed
        </div>
        <div className="divide-y divide-border">
          {commit.files?.map((file) => (
            <div key={file.path} className="bg-bg-primary">
              <div className="flex items-center">
                <button
                  onClick={() => toggleFileExpanded(file.path)}
                  className="flex-1 flex items-center gap-3 px-4 py-2 hover:bg-bg-tertiary text-left"
                >
                  {expandedFiles.has(file.path) ? (
                    <ChevronDown className="w-4 h-4 text-text-secondary" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-text-secondary" />
                  )}
                  {getStatusIcon(file.status)}
                  <span className="flex-1 font-mono text-sm truncate">{file.path}</span>
                </button>
                {file.status !== "D" && (
                  <button
                    className="px-3 py-1 mr-2 text-xs text-text-secondary hover:text-accent-primary flex items-center gap-1"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleViewFileAtCommit(file.path);
                    }}
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    View
                  </button>
                )}
              </div>
              {expandedFiles.has(file.path) && diffSections[file.path] && (
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
          ))}
        </div>
      </div>
    </div>
  );
}
