/**
 * Provider Error Recovery API Client
 * 
 * Client-side functions for provider/model error recovery and validation.
 */

import { apiClient } from "./client";

export interface ProviderValidationResult {
  isValid: boolean;
  error?: string;
  suggestion?: string;
  availableProviders?: string[];
  errorInfo?: ProviderErrorInfo;
}

export interface ProviderErrorInfo {
  title: string;
  message: string;
  actions: ProviderErrorAction[];
}

export interface ProviderErrorAction {
  type: 'add-credentials' | 'reassign-agents' | 'change-provider';
  label: string;
  providerId?: string;
  targetProviderId?: string;
  agentNames?: string[];
}

export interface AgentProviderInfo {
  agentName: string;
  providerId: string | null;
  modelId: string | null;
  hasCredentials: boolean;
}

export interface BulkReassignResult {
  updated: string[];
  errors: string[];
}

/**
 * Validate agent provider/model configuration
 */
export async function validateAgentProvider(
  projectId: string,
  agentName: string,
  providerId?: string | null
): Promise<ProviderValidationResult> {
  const response = await apiClient.post("/api/provider-errors/validate", {
    json: {
      projectId,
      agentName,
      providerId,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to validate provider: ${response.statusText}`);
  }

  const result = await response.json();
  return result.data;
}

/**
 * Get provider information for all agents in a project
 */
export async function getAgentProviderInfo(
  projectId: string
): Promise<AgentProviderInfo[]> {
  const response = await apiClient.get(`/api/provider-errors/agents/${projectId}`);

  if (!response.ok) {
    throw new Error(`Failed to get agent provider info: ${response.statusText}`);
  }

  const result = await response.json();
  return result.data;
}

/**
 * Find agents that use a specific provider
 */
export async function findAgentsUsingProvider(
  projectId: string,
  providerId: string
): Promise<string[]> {
  const response = await apiClient.get(
    `/api/provider-errors/agents-using-provider/${projectId}/${providerId}`
  );

  if (!response.ok) {
    throw new Error(`Failed to find agents using provider: ${response.statusText}`);
  }

  const result = await response.json();
  return result.data;
}

/**
 * Bulk reassign agents from one provider to another
 */
export async function bulkReassignAgents(
  projectId: string,
  fromProviderId: string,
  toProviderId: string,
  toModelId?: string
): Promise<BulkReassignResult> {
  const response = await apiClient.post("/api/provider-errors/bulk-reassign", {
    json: {
      projectId,
      fromProviderId,
      toProviderId,
      toModelId,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to bulk reassign agents: ${response.statusText}`);
  }

  const result = await response.json();
  return result.data;
}

/**
 * Create enhanced error information for a provider error
 */
export async function createProviderErrorInfo(
  projectId: string,
  error: string,
  agentName?: string,
  providerId?: string | null
): Promise<ProviderErrorInfo> {
  const response = await apiClient.post("/api/provider-errors/create-error-info", {
    json: {
      projectId,
      error,
      agentName,
      providerId,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to create error info: ${response.statusText}`);
  }

  const result = await response.json();
  return result.data;
}