/**
 * Git Identity Component
 *
 * Displays the Botical SSH public key for users to add to GitHub/GitLab.
 * Includes copy functionality and setup instructions.
 */

import { useState } from "react";
import { useGitIdentity } from "@/lib/api/queries";
import { cn } from "@/lib/utils/cn";
import { Key, Copy, Check, ExternalLink, ChevronDown, ChevronRight } from "lucide-react";

interface GitIdentityProps {
  /** Whether to show in compact mode (for sidebar) */
  compact?: boolean;
}

export function GitIdentity({ compact = false }: GitIdentityProps) {
  const { data: identity, isLoading, error } = useGitIdentity();
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(!compact);

  const handleCopy = async () => {
    if (!identity) return;

    try {
      await navigator.clipboard.writeText(identity.publicKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  if (isLoading) {
    return (
      <div className="p-3 text-sm text-text-muted">
        Loading SSH identity...
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-3 text-sm text-accent-error">
        Failed to load SSH identity
      </div>
    );
  }

  if (!identity) {
    return null;
  }

  if (compact) {
    return (
      <div className="border-t border-border">
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full px-3 py-2 flex items-center gap-2 text-sm hover:bg-bg-elevated"
        >
          {expanded ? (
            <ChevronDown className="w-3 h-3 text-text-muted" />
          ) : (
            <ChevronRight className="w-3 h-3 text-text-muted" />
          )}
          <Key className="w-3 h-3 text-text-muted" />
          <span className="text-text-secondary">SSH Key</span>
        </button>

        {expanded && (
          <div className="px-3 pb-3 space-y-2">
            <div className="text-xs text-text-muted">
              Add this key to GitHub/GitLab for push/pull access
            </div>

            <div className="relative">
              <pre className="p-2 bg-bg-primary rounded text-[10px] font-mono text-text-secondary overflow-x-auto max-h-16 overflow-y-auto">
                {identity.publicKey}
              </pre>
              <button
                onClick={handleCopy}
                className={cn(
                  "absolute top-1 right-1 p-1 rounded",
                  "bg-bg-elevated hover:bg-bg-secondary",
                  "transition-colors"
                )}
                title="Copy to clipboard"
              >
                {copied ? (
                  <Check className="w-3 h-3 text-accent-success" />
                ) : (
                  <Copy className="w-3 h-3 text-text-muted" />
                )}
              </button>
            </div>

            <div className="text-[10px] text-text-muted">
              Fingerprint: {identity.fingerprint}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Full display mode (for settings page)
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Key className="w-5 h-5 text-accent-primary" />
        <h3 className="text-lg font-medium text-text-primary">SSH Key</h3>
      </div>

      <p className="text-sm text-text-secondary">
        Add this SSH public key to your GitHub or GitLab account to enable push and pull operations.
      </p>

      <div className="relative">
        <pre className={cn(
          "p-3 bg-bg-secondary rounded-lg text-xs font-mono",
          "text-text-primary overflow-x-auto whitespace-pre-wrap break-all"
        )}>
          {identity.publicKey}
        </pre>
        <button
          onClick={handleCopy}
          className={cn(
            "absolute top-2 right-2 px-2 py-1 rounded flex items-center gap-1",
            "bg-bg-elevated hover:bg-bg-primary border border-border",
            "text-xs text-text-secondary hover:text-text-primary",
            "transition-colors"
          )}
        >
          {copied ? (
            <>
              <Check className="w-3 h-3 text-accent-success" />
              Copied!
            </>
          ) : (
            <>
              <Copy className="w-3 h-3" />
              Copy
            </>
          )}
        </button>
      </div>

      <div className="text-xs text-text-muted">
        Fingerprint: <code className="bg-bg-secondary px-1 rounded">{identity.fingerprint}</code>
      </div>

      <div className="space-y-2">
        <h4 className="text-sm font-medium text-text-secondary">Setup Instructions</h4>

        <div className="space-y-2">
          <a
            href="https://github.com/settings/ssh/new"
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              "flex items-center gap-2 p-2 rounded-lg",
              "bg-bg-secondary hover:bg-bg-elevated border border-border",
              "text-sm text-text-primary hover:text-accent-primary",
              "transition-colors"
            )}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
            </svg>
            Add to GitHub
            <ExternalLink className="w-3 h-3 ml-auto" />
          </a>

          <a
            href="https://gitlab.com/-/user_settings/ssh_keys"
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              "flex items-center gap-2 p-2 rounded-lg",
              "bg-bg-secondary hover:bg-bg-elevated border border-border",
              "text-sm text-text-primary hover:text-accent-primary",
              "transition-colors"
            )}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M22.65 14.39L12 22.13 1.35 14.39a.84.84 0 0 1-.3-.94l1.22-3.78 2.44-7.51A.42.42 0 0 1 4.82 2a.43.43 0 0 1 .58 0 .42.42 0 0 1 .11.18l2.44 7.49h8.1l2.44-7.51A.42.42 0 0 1 18.6 2a.43.43 0 0 1 .58 0 .42.42 0 0 1 .11.18l2.44 7.51L23 13.45a.84.84 0 0 1-.35.94z" />
            </svg>
            Add to GitLab
            <ExternalLink className="w-3 h-3 ml-auto" />
          </a>
        </div>
      </div>
    </div>
  );
}
