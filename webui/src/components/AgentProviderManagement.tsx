/**
 * Agent Provider Management Component
 * 
 * Shows which agents use which providers and provides bulk reassignment capabilities.
 * Helps users manage provider configurations across all their agents.
 */

import { useState, useEffect } from "react";
import { AlertTriangle, RefreshCw, Settings, Users, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { getAgentProviderInfo, bulkReassignAgents, type AgentProviderInfo } from "@/lib/api/provider-errors";
import { useCredentials } from "@/lib/api/queries";
import { useQueryClient } from "@tanstack/react-query";

interface AgentProviderManagementProps {
  projectId?: string;
}

interface ProviderGroup {
  providerId: string | null;
  hasCredentials: boolean;
  agents: AgentProviderInfo[];
}

export function AgentProviderManagement({ projectId }: AgentProviderManagementProps) {
  const [agentInfo, setAgentInfo] = useState<AgentProviderInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedProviders, setExpandedProviders] = useState<Set<string>>(new Set());
  const [reassigning, setReassigning] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data: credentials } = useCredentials();

  // Load agent provider info
  useEffect(() => {
    if (!projectId) return;

    setLoading(true);
    setError(null);

    getAgentProviderInfo(projectId)
      .then(setAgentInfo)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [projectId]);

  // Group agents by provider
  const providerGroups: ProviderGroup[] = [];
  const providerMap = new Map<string | null, AgentProviderInfo[]>();

  agentInfo.forEach((agent) => {
    const key = agent.providerId;
    if (!providerMap.has(key)) {
      providerMap.set(key, []);
    }
    providerMap.get(key)!.push(agent);
  });

  providerMap.forEach((agents, providerId) => {
    const hasCredentials = providerId === null || agents.some(a => a.hasCredentials);
    providerGroups.push({
      providerId,
      hasCredentials,
      agents,
    });
  });

  // Sort groups: problems first, then by provider name
  providerGroups.sort((a, b) => {
    if (!a.hasCredentials && b.hasCredentials) return -1;
    if (a.hasCredentials && !b.hasCredentials) return 1;
    const aName = a.providerId || 'No provider';
    const bName = b.providerId || 'No provider';
    return aName.localeCompare(bName);
  });

  const toggleProvider = (providerId: string | null) => {
    const key = providerId || 'null';
    const newExpanded = new Set(expandedProviders);
    if (newExpanded.has(key)) {
      newExpanded.delete(key);
    } else {
      newExpanded.add(key);
    }
    setExpandedProviders(newExpanded);
  };

  const handleBulkReassign = async (fromProviderId: string, toProviderId: string) => {
    if (!projectId) return;

    setReassigning(fromProviderId);
    try {
      const result = await bulkReassignAgents(projectId, fromProviderId, toProviderId);
      
      if (result.updated.length > 0) {
        // Refresh agent info
        const updatedInfo = await getAgentProviderInfo(projectId);
        setAgentInfo(updatedInfo);
        
        // Invalidate queries
        queryClient.invalidateQueries({ queryKey: ['agents'] });
      }
      
      if (result.errors.length > 0) {
        setError(`Some agents failed to update: ${result.errors.join('; ')}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reassign agents');
    } finally {
      setReassigning(null);
    }
  };

  const getAvailableProviders = () => {
    return (credentials || [])
      .map(c => c.provider)
      .filter((provider, index, arr) => arr.indexOf(provider) === index);
  };

  if (!projectId) {
    return (
      <div className="text-center py-8 text-gray-500 dark:text-gray-400">
        Select a project to view agent provider information
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <RefreshCw className="w-5 h-5 animate-spin mr-2" />
        Loading agent information...
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
        <div className="flex items-center gap-2 text-red-800 dark:text-red-400">
          <AlertTriangle className="w-4 h-4" />
          <span className="font-medium">Error loading agent information</span>
        </div>
        <p className="text-red-700 dark:text-red-300 mt-1 text-sm">{error}</p>
      </div>
    );
  }

  if (agentInfo.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500 dark:text-gray-400">
        No agents found in this project
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-4">
        <Users className="w-5 h-5 text-gray-600 dark:text-gray-400" />
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Agent Provider Configuration
        </h3>
      </div>

      {providerGroups.map((group) => {
        const key = group.providerId || 'null';
        const isExpanded = expandedProviders.has(key);
        const displayName = group.providerId || 'No provider (uses fallback)';
        const availableProviders = getAvailableProviders();

        return (
          <div
            key={key}
            className={cn(
              "border rounded-lg",
              group.hasCredentials
                ? "border-gray-200 dark:border-gray-700"
                : "border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-900/10"
            )}
          >
            {/* Provider Header */}
            <button
              onClick={() => toggleProvider(group.providerId)}
              className="w-full flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50"
            >
              <div className="flex items-center gap-3">
                {isExpanded ? (
                  <ChevronDown className="w-4 h-4 text-gray-400" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-gray-400" />
                )}
                
                <div className="flex items-center gap-2">
                  {!group.hasCredentials && (
                    <AlertTriangle className="w-4 h-4 text-red-500" />
                  )}
                  <span className="font-medium text-gray-900 dark:text-gray-100">
                    {displayName}
                  </span>
                </div>
                
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  ({group.agents.length} agent{group.agents.length !== 1 ? 's' : ''})
                </span>
              </div>

              {!group.hasCredentials && group.providerId && availableProviders.length > 0 && (
                <div className="flex items-center gap-2">
                  <select
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => {
                      if (e.target.value && group.providerId) {
                        handleBulkReassign(group.providerId, e.target.value);
                      }
                    }}
                    disabled={reassigning === group.providerId}
                    className="text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-800"
                  >
                    <option value="">Reassign to...</option>
                    {availableProviders.map(provider => (
                      <option key={provider} value={provider}>
                        {provider}
                      </option>
                    ))}
                  </select>
                  
                  {reassigning === group.providerId && (
                    <RefreshCw className="w-4 h-4 animate-spin text-blue-500" />
                  )}
                </div>
              )}
            </button>

            {/* Agent List */}
            {isExpanded && (
              <div className="border-t border-gray-200 dark:border-gray-700">
                {group.agents.map((agent) => (
                  <div
                    key={agent.agentName}
                    className="flex items-center justify-between p-3 border-b border-gray-100 dark:border-gray-800 last:border-b-0"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full bg-blue-500" />
                      <span className="font-medium text-gray-900 dark:text-gray-100">
                        {agent.agentName}
                      </span>
                      {agent.modelId && (
                        <span className="text-sm text-gray-500 dark:text-gray-400">
                          ({agent.modelId})
                        </span>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-2">
                      {!agent.hasCredentials && (
                        <span className="text-xs bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-400 px-2 py-1 rounded">
                          No credentials
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* Summary */}
      <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4">
        <div className="text-sm text-gray-600 dark:text-gray-400">
          <div className="flex justify-between">
            <span>Total agents:</span>
            <span className="font-medium">{agentInfo.length}</span>
          </div>
          <div className="flex justify-between">
            <span>Agents with credentials:</span>
            <span className="font-medium text-green-600 dark:text-green-400">
              {agentInfo.filter(a => a.hasCredentials).length}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Agents needing attention:</span>
            <span className="font-medium text-red-600 dark:text-red-400">
              {agentInfo.filter(a => !a.hasCredentials).length}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}