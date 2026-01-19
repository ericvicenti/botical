import { GitCommit } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { useGitLog } from "@/lib/api/queries";
import type { CommitInfo } from "@/lib/api/types";
import { useTabs } from "@/contexts/tabs";

interface CommitListProps {
  projectId: string;
  selectedCommitHash?: string;
}

function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;

  const minutes = Math.floor(diff / (1000 * 60));
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30);

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  if (weeks < 4) return `${weeks}w ago`;
  return `${months}mo ago`;
}

function CommitItem({
  commit,
  projectId,
  isSelected,
}: {
  commit: CommitInfo;
  projectId: string;
  isSelected: boolean;
}) {
  const { openPreviewTab, openTab } = useTabs();
  const navigate = useNavigate();

  const handleClick = () => {
    openPreviewTab({
      type: "commit",
      projectId,
      hash: commit.hash,
    });
    navigate({ to: "/projects/$projectId/commits/$hash", params: { projectId, hash: commit.hash } });
  };

  const handleDoubleClick = () => {
    openTab({
      type: "commit",
      projectId,
      hash: commit.hash,
    });
    navigate({ to: "/projects/$projectId/commits/$hash", params: { projectId, hash: commit.hash } });
  };

  return (
    <div
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      className={`group flex items-start gap-2 px-3 py-2 hover:bg-bg-tertiary cursor-pointer ${
        isSelected ? "bg-bg-tertiary" : ""
      }`}
    >
      <GitCommit className="w-4 h-4 text-text-secondary mt-0.5 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-accent-primary">{commit.hashShort}</span>
          <span className="text-xs text-text-secondary">
            {formatRelativeTime(commit.date)}
          </span>
        </div>
        <div className="text-sm truncate" title={commit.message}>
          {commit.message}
        </div>
        <div className="text-xs text-text-secondary truncate">
          {commit.author}
        </div>
      </div>
    </div>
  );
}

export function CommitList({ projectId, selectedCommitHash }: CommitListProps) {
  const { data: commits, isLoading } = useGitLog(projectId, 20);

  if (isLoading) {
    return (
      <div className="px-3 py-4 text-sm text-text-secondary text-center">
        Loading commits...
      </div>
    );
  }

  if (!commits || commits.length === 0) {
    return (
      <div className="px-3 py-4 text-sm text-text-secondary text-center">
        No commits yet
      </div>
    );
  }

  return (
    <div className="space-y-0.5">
      {commits.map((commit) => (
        <CommitItem
          key={commit.hash}
          commit={commit}
          projectId={projectId}
          isSelected={commit.hash === selectedCommitHash}
        />
      ))}
    </div>
  );
}
