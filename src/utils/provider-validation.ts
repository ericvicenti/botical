/**
 * Provider/Model Validation Utilities
 * 
 * Validates agent provider/model configurations against available credentials
 * and provides user-friendly error messages with recovery suggestions.
 */

import type { ProviderId } from "@/agents/types.ts";
import { ProviderCredentialsService } from "@/services/provider-credentials.ts";

export interface ProviderValidationResult {
  isValid: boolean;
  error?: string;
  suggestion?: string;
  availableProviders?: ProviderId[];
  agentName?: string;
}

export interface AgentProviderInfo {
  agentName: string;
  providerId: ProviderId | null;
  modelId: string | null;
  hasCredentials: boolean;
}

/**
 * Validate if a provider has credentials for a user
 */
export function validateProviderCredentials(
  userId: string,
  providerId: ProviderId | null,
  agentName?: string
): ProviderValidationResult {
  if (!providerId) {
    return { isValid: true }; // No provider specified, will use fallback
  }

  const hasCredentials = ProviderCredentialsService.hasCredentials(userId, providerId);
  
  if (hasCredentials) {
    return { isValid: true };
  }

  // Get available providers for suggestions
  const availableProviders = ProviderCredentialsService.getConfiguredProviders(userId);
  
  const error = agentName 
    ? `Agent "${agentName}" uses provider "${providerId}" which has no credentials configured.`
    : `Provider "${providerId}" has no credentials configured.`;

  const suggestion = availableProviders.length > 0
    ? `Available providers: ${availableProviders.join(", ")}. You can reassign the agent to use one of these providers, or add credentials for "${providerId}".`
    : `No providers are configured. Please add credentials for "${providerId}" or another provider in Settings.`;

  return {
    isValid: false,
    error,
    suggestion,
    availableProviders,
    agentName,
  };
}

/**
 * Get provider information for all agents in a project
 */
export async function getAgentProviderInfo(
  projectPath: string,
  userId: string
): Promise<AgentProviderInfo[]> {
  const { AgentYamlService } = await import("@/config/agents.ts");
  const agents = AgentYamlService.list(projectPath);
  
  return agents.map(agent => ({
    agentName: agent.name,
    providerId: agent.providerId as ProviderId | null,
    modelId: agent.modelId,
    hasCredentials: agent.providerId 
      ? ProviderCredentialsService.hasCredentials(userId, agent.providerId as ProviderId)
      : true, // No provider specified, will use fallback
  }));
}

/**
 * Find agents that use a specific provider
 */
export async function findAgentsUsingProvider(
  projectPath: string,
  providerId: ProviderId
): Promise<string[]> {
  const { AgentYamlService } = await import("@/config/agents.ts");
  const agents = AgentYamlService.list(projectPath);
  
  return agents
    .filter(agent => agent.providerId === providerId)
    .map(agent => agent.name);
}

/**
 * Bulk reassign agents from one provider to another
 */
export async function bulkReassignAgents(
  projectPath: string,
  fromProviderId: ProviderId,
  toProviderId: ProviderId,
  toModelId?: string
): Promise<{ updated: string[]; errors: string[] }> {
  const { AgentYamlService } = await import("@/config/agents.ts");
  const agents = AgentYamlService.list(projectPath);
  
  const updated: string[] = [];
  const errors: string[] = [];
  
  for (const agent of agents) {
    if (agent.providerId === fromProviderId) {
      try {
        const updatedAgent = {
          ...agent,
          providerId: toProviderId,
          ...(toModelId && { modelId: toModelId }),
        };
        
        AgentYamlService.update(projectPath, agent.name, updatedAgent);
        updated.push(agent.name);
      } catch (error) {
        errors.push(`Failed to update ${agent.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
  }
  
  return { updated, errors };
}

/**
 * Enhanced error message for provider/model errors with recovery actions
 */
export interface ProviderErrorInfo {
  title: string;
  message: string;
  actions: ProviderErrorAction[];
}

export interface ProviderErrorAction {
  type: 'add-credentials' | 'reassign-agents' | 'change-provider';
  label: string;
  providerId?: ProviderId;
  targetProviderId?: ProviderId;
  agentNames?: string[];
}

export function createProviderErrorInfo(
  validation: ProviderValidationResult,
  projectPath?: string
): ProviderErrorInfo {
  const actions: ProviderErrorAction[] = [];
  
  // Add credentials action
  if (validation.agentName) {
    actions.push({
      type: 'add-credentials',
      label: `Add credentials for ${validation.agentName?.split('"')[1] || 'provider'}`,
      providerId: validation.agentName?.includes('"') 
        ? validation.agentName.split('"')[3] as ProviderId
        : undefined,
    });
  }
  
  // Reassign agents action
  if (validation.availableProviders && validation.availableProviders.length > 0) {
    actions.push({
      type: 'reassign-agents',
      label: `Reassign to ${validation.availableProviders[0]}`,
      targetProviderId: validation.availableProviders[0],
      agentNames: validation.agentName ? [validation.agentName] : undefined,
    });
  }
  
  return {
    title: 'Provider Configuration Error',
    message: `${validation.error} ${validation.suggestion}`,
    actions,
  };
}