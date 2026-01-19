import { GitBranch, AlertCircle } from "lucide-react";
import { useGitStatus } from "@/lib/api/queries";
import { useTabs } from "@/contexts/tabs";
import { BranchPicker } from "./BranchPicker";
import { UncommittedChanges } from "./UncommittedChanges";
import { CommitList } from "./CommitList";

interface GitPanelProps {
  projectId: string;
}

export function GitPanel({ projectId }: GitPanelProps) {
  const { data: status, isLoading, error } = useGitStatus(projectId);
  const { openPreviewTab } = useTabs();

  const handleCommitClick = () => {
    openPreviewTab({
      type: "review-commit",
      projectId,
    });
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center text-text-secondary">
        <div className="text-sm">Loading git status...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-2 p-4 text-text-secondary">
        <AlertCircle className="w-8 h-8 text-red-500" />
        <div className="text-sm text-center">Failed to load git status</div>
      </div>
    );
  }

  if (!status?.isRepo) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 p-4">
        <GitBranch className="w-10 h-10 text-text-secondary" />
        <div className="text-sm text-text-secondary text-center">
          This project is not a git repository
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Branch Picker */}
      <div className="p-2 border-b border-border">
        <BranchPicker projectId={projectId} currentBranch={status.branch} />
        {(status.ahead > 0 || status.behind > 0) && (
          <div className="flex gap-2 mt-2 text-xs text-text-secondary">
            {status.ahead > 0 && (
              <span className="text-green-500">{status.ahead} ahead</span>
            )}
            {status.behind > 0 && (
              <span className="text-yellow-500">{status.behind} behind</span>
            )}
          </div>
        )}
      </div>

      {/* Uncommitted Changes */}
      <div className="border-b border-border">
        <div className="px-2 py-1">
          <div className="text-xs font-medium text-text-secondary uppercase tracking-wide">
            Uncommitted Changes
          </div>
        </div>
        <UncommittedChanges
          projectId={projectId}
          files={status.files}
          onCommitClick={handleCommitClick}
        />
      </div>

      {/* Recent Commits */}
      <div className="flex-1 overflow-auto">
        <div className="px-2 py-1 sticky top-0 bg-bg-primary">
          <div className="text-xs font-medium text-text-secondary uppercase tracking-wide">
            Recent Commits
          </div>
        </div>
        <CommitList projectId={projectId} />
      </div>
    </div>
  );
}
