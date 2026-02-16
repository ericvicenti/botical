/**
 * Provider Error Dialog Component
 * 
 * Displays provider/model configuration errors with user-friendly recovery actions.
 * Provides one-click fixes for common provider credential issues.
 */

import { useState } from "react";
import { AlertTriangle, Settings, RefreshCw, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type { ProviderErrorInfo, ProviderErrorAction } from "@/lib/api/provider-errors";
import { bulkReassignAgents } from "@/lib/api/provider-errors";
import { useQueryClient } from "@tanstack/react-query";

interface ProviderErrorDialogProps {
  error: ProviderErrorInfo;
  projectId: string;
  onClose: () => void;
  onNavigateToSettings?: () => void;
}

export function ProviderErrorDialog({
  error,
  projectId,
  onClose,
  onNavigateToSettings,
}: ProviderErrorDialogProps) {
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionResult, setExecutionResult] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const handleAction = async (action: ProviderErrorAction) => {
    setIsExecuting(true);
    setExecutionResult(null);

    try {
      switch (action.type) {
        case 'add-credentials':
          // Navigate to settings page
          if (onNavigateToSettings) {
            onNavigateToSettings();
          } else {
            window.location.href = '/settings/models';
          }
          break;

        case 'reassign-agents':
          if (action.targetProviderId && action.agentNames) {
            const result = await bulkReassignAgents(
              projectId,
              action.providerId || '',
              action.targetProviderId
            );
            
            if (result.updated.length > 0) {
              setExecutionResult(
                `Successfully reassigned ${result.updated.length} agent(s): ${result.updated.join(', ')}`
              );
              
              // Invalidate relevant queries
              queryClient.invalidateQueries({ queryKey: ['agents'] });
              queryClient.invalidateQueries({ queryKey: ['agent-provider-info'] });
            }
            
            if (result.errors.length > 0) {
              setExecutionResult(
                `Errors occurred: ${result.errors.join('; ')}`
              );
            }
          }
          break;

        case 'change-provider':
          // This would open a provider selection dialog
          // For now, just navigate to settings
          if (onNavigateToSettings) {
            onNavigateToSettings();
          } else {
            window.location.href = '/settings/models';
          }
          break;
      }
    } catch (error) {
      setExecutionResult(
        `Failed to execute action: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    } finally {
      setIsExecuting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full">
        {/* Header */}
        <div className="flex items-center gap-3 p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex-shrink-0">
            <AlertTriangle className="w-6 h-6 text-amber-500" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {error.title}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          <p className="text-gray-700 dark:text-gray-300 mb-6">
            {error.message}
          </p>

          {/* Execution Result */}
          {executionResult && (
            <div className={cn(
              "mb-4 p-3 rounded-md text-sm",
              executionResult.includes('Successfully') || executionResult.includes('reassigned')
                ? "bg-green-50 text-green-800 dark:bg-green-900/20 dark:text-green-400"
                : "bg-red-50 text-red-800 dark:bg-red-900/20 dark:text-red-400"
            )}>
              {executionResult}
            </div>
          )}

          {/* Actions */}
          <div className="space-y-3">
            {error.actions.map((action, index) => (
              <button
                key={index}
                onClick={() => handleAction(action)}
                disabled={isExecuting}
                className={cn(
                  "w-full flex items-center gap-3 p-3 rounded-md border transition-colors",
                  "hover:bg-gray-50 dark:hover:bg-gray-700",
                  "disabled:opacity-50 disabled:cursor-not-allowed",
                  action.type === 'add-credentials'
                    ? "border-blue-200 text-blue-700 dark:border-blue-700 dark:text-blue-400"
                    : action.type === 'reassign-agents'
                    ? "border-green-200 text-green-700 dark:border-green-700 dark:text-green-400"
                    : "border-gray-200 text-gray-700 dark:border-gray-600 dark:text-gray-300"
                )}
              >
                <div className="flex-shrink-0">
                  {isExecuting ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : action.type === 'add-credentials' ? (
                    <Settings className="w-4 h-4" />
                  ) : action.type === 'reassign-agents' ? (
                    <RefreshCw className="w-4 h-4" />
                  ) : (
                    <ExternalLink className="w-4 h-4" />
                  )}
                </div>
                <div className="flex-1 text-left">
                  <div className="font-medium">{action.label}</div>
                  {action.type === 'reassign-agents' && action.agentNames && (
                    <div className="text-xs opacity-75 mt-1">
                      Affects: {action.agentNames.join(', ')}
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-6 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}