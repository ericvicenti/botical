import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AlertCircle, GitCommit, Plus, Minus, Edit, ArrowRight, Copy, ChevronDown, ChevronRight, User, Clock } from "lucide-react";
import { useGitCommit, useGitCommitDiff } from "@/lib/api/queries";
import type { FileStatus } from "@/lib/api/types";

export const Route = createFileRoute("/projects/$projectId/commits/$hash")({
  component: CommitViewPage,
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

function CommitViewPage() {
  const { projectId, hash } = Route.useParams();
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());

  const { data: commit, isLoading: commitLoading, error: commitError } = useGitCommit(projectId, hash);
  const { data: diff } = useGitCommitDiff(projectId, hash);

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

  // Parse diff into sections per file
  const parseDiffSections = (diffText: string) => {
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
  };

  const diffSections = parseDiffSections(diff || "");

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Commit header */}
      <div className="p-4 border-b border-border bg-bg-secondary flex-shrink-0">
        <div className="flex items-start gap-3">
          <GitCommit className="w-6 h-6 text-accent mt-1" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-mono text-sm text-accent">{commit.hashShort}</span>
              <span className="text-xs text-text-secondary font-mono">({commit.hash})</span>
            </div>
            <h1 className="text-lg font-medium mb-2">{commit.message}</h1>
            {commit.body && (
              <p className="text-sm text-text-secondary whitespace-pre-wrap mb-3">
                {commit.body}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-4 text-sm text-text-secondary">
              <div className="flex items-center gap-1.5">
                <User className="w-4 h-4" />
                <span>{commit.author}</span>
                <span className="text-text-secondary">{"<"}{commit.email}{">"}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Clock className="w-4 h-4" />
                <span>{formatDate(commit.date)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Files changed */}
      <div className="flex-1 overflow-auto">
        <div className="px-4 py-2 text-xs font-medium text-text-secondary uppercase tracking-wide bg-bg-secondary sticky top-0 border-b border-border">
          {commit.files?.length || 0} file{(commit.files?.length || 0) !== 1 ? "s" : ""} changed
        </div>
        <div className="divide-y divide-border">
          {commit.files?.map((file) => (
            <div key={file.path} className="bg-bg-primary">
              <button
                onClick={() => toggleFileExpanded(file.path)}
                className="w-full flex items-center gap-3 px-4 py-2 hover:bg-bg-tertiary text-left"
              >
                {expandedFiles.has(file.path) ? (
                  <ChevronDown className="w-4 h-4 text-text-secondary" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-text-secondary" />
                )}
                {getStatusIcon(file.status)}
                <span className="flex-1 font-mono text-sm truncate">{file.path}</span>
              </button>
              {expandedFiles.has(file.path) && diffSections[file.path] && (
                <div className="px-4 pb-3">
                  <pre className="text-xs font-mono bg-bg-secondary p-3 rounded-md overflow-x-auto">
                    {diffSections[file.path].split("\n").map((line, i) => (
                      <div
                        key={i}
                        className={
                          line.startsWith("+") && !line.startsWith("+++")
                            ? "text-green-500"
                            : line.startsWith("-") && !line.startsWith("---")
                              ? "text-red-500"
                              : line.startsWith("@@")
                                ? "text-blue-500"
                                : ""
                        }
                      >
                        {line}
                      </div>
                    ))}
                  </pre>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
