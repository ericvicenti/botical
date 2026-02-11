import { useState } from "react";
import { ChevronDown, GitBranch, Plus, Check } from "lucide-react";
import { useGitBranches, useCheckoutBranch, useCreateBranch } from "@/lib/api/queries";
import type { BranchInfo } from "@/lib/api/types";

interface BranchPickerProps {
  projectId: string;
  currentBranch: string;
}

export function BranchPicker({ projectId, currentBranch }: BranchPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newBranchName, setNewBranchName] = useState("");

  const { data: branches = [] } = useGitBranches(projectId);
  const checkoutMutation = useCheckoutBranch();
  const createMutation = useCreateBranch();

  const handleBranchSelect = (branch: BranchInfo) => {
    if (branch.current) {
      setIsOpen(false);
      return;
    }

    checkoutMutation.mutate(
      { projectId, branch: branch.name },
      {
        onSuccess: () => {
          setIsOpen(false);
        },
      }
    );
  };

  const handleCreateBranch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBranchName.trim()) return;

    createMutation.mutate(
      { projectId, name: newBranchName.trim() },
      {
        onSuccess: () => {
          setNewBranchName("");
          setIsCreating(false);
          setIsOpen(false);
        },
      }
    );
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-2 px-3 py-2 bg-bg-secondary hover:bg-bg-tertiary rounded-md border border-border text-sm transition-colors"
        disabled={checkoutMutation.isPending}
      >
        <GitBranch className="w-4 h-4 text-text-secondary" />
        <span className="flex-1 text-left truncate">{currentBranch || "No branch"}</span>
        <ChevronDown className={`w-4 h-4 text-text-secondary transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => {
              setIsOpen(false);
              setIsCreating(false);
            }}
          />
          <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-bg-secondary border border-border rounded-md shadow-lg max-h-64 overflow-auto">
            {/* Branch list */}
            <div className="py-1">
              {branches.map((branch) => (
                <button
                  key={branch.name}
                  onClick={() => handleBranchSelect(branch)}
                  className="w-full flex items-center gap-2 px-3 py-2.5 sm:py-1.5 hover:bg-bg-tertiary text-sm text-left"
                  disabled={checkoutMutation.isPending}
                >
                  <GitBranch className="w-3.5 h-3.5 text-text-secondary" />
                  <span className="flex-1 truncate">{branch.name}</span>
                  {branch.current && (
                    <Check className="w-3.5 h-3.5 text-accent" />
                  )}
                </button>
              ))}
            </div>

            {/* Divider */}
            <div className="border-t border-border" />

            {/* Create new branch */}
            {isCreating ? (
              <form onSubmit={handleCreateBranch} className="p-2">
                <input
                  type="text"
                  value={newBranchName}
                  onChange={(e) => setNewBranchName(e.target.value)}
                  placeholder="New branch name..."
                  className="w-full px-2 py-1.5 bg-bg-primary border border-border rounded text-sm focus:outline-none focus:border-accent"
                  autoFocus
                  disabled={createMutation.isPending}
                />
                <div className="flex gap-2 mt-2">
                  <button
                    type="submit"
                    className="flex-1 px-2 py-1 bg-accent text-white rounded text-xs hover:bg-accent/90 disabled:opacity-50"
                    disabled={!newBranchName.trim() || createMutation.isPending}
                  >
                    {createMutation.isPending ? "Creating..." : "Create"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsCreating(false);
                      setNewBranchName("");
                    }}
                    className="flex-1 px-2 py-1 bg-bg-tertiary rounded text-xs hover:bg-bg-tertiary/80"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <button
                onClick={() => setIsCreating(true)}
                className="w-full flex items-center gap-2 px-3 py-2 hover:bg-bg-tertiary text-sm text-text-secondary"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New branch</span>
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
