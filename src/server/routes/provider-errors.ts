/**
 * Provider Error Recovery API Routes
 * 
 * Handles provider/model configuration errors with user-friendly recovery actions.
 * Provides endpoints for validating agent configurations and bulk operations.
 */

import { Hono } from "hono";
import { z } from "zod";
import { DatabaseManager } from "@/database/index.ts";
import { ProjectService } from "@/services/projects.ts";
import { ValidationError } from "@/utils/errors.ts";
import {
  validateProviderCredentials,
  getAgentProviderInfo,
  findAgentsUsingProvider,
  bulkReassignAgents,
  createProviderErrorInfo,
  type ProviderValidationResult,
} from "@/utils/provider-validation.ts";
import type { ProviderId } from "@/agents/types.ts";
import { ProviderIds } from "@/agents/types.ts";

const providerErrors = new Hono();

/**
 * POST /api/provider-errors/validate
 * Validate agent provider/model configuration
 */
const ValidateSchema = z.object({
  projectId: z.string().min(1),
  agentName: z.string().min(1),
  providerId: z.string().nullable().optional(),
});

providerErrors.post("/validate", async (c) => {
  const body = await c.req.json();
  const result = ValidateSchema.safeParse(body);
  
  if (!result.success) {
    throw new ValidationError(
      result.error.errors[0]?.message || "Invalid input",
      result.error.errors
    );
  }
  
  const { projectId, agentName, providerId } = result.data;
  const auth = c.get("auth") as { userId: string } | undefined;
  const userId = auth?.userId || "anonymous";
  
  // Validate providerId is a valid ProviderId if provided
  let validatedProviderId: ProviderId | null = null;
  if (providerId) {
    if (!Object.values(ProviderIds).includes(providerId as ProviderId)) {
      throw new ValidationError(`Invalid provider ID: ${providerId}`);
    }
    validatedProviderId = providerId as ProviderId; // Safe: validated above
  }
  
  const validation = validateProviderCredentials(
    userId,
    validatedProviderId,
    agentName
  );
  
  const errorInfo = validation.isValid 
    ? null 
    : createProviderErrorInfo(validation);
  
  return c.json({
    data: {
      isValid: validation.isValid,
      error: validation.error,
      suggestion: validation.suggestion,
      availableProviders: validation.availableProviders,
      errorInfo,
    },
  });
});

/**
 * GET /api/provider-errors/agents/:projectId
 * Get provider information for all agents in a project
 */
providerErrors.get("/agents/:projectId", async (c) => {
  const projectId = c.req.param("projectId");
  const auth = c.get("auth") as { userId: string } | undefined;
  const userId = auth?.userId || "anonymous";
  
  const rootDb = DatabaseManager.getRootDb();
  const project = ProjectService.getByIdOrThrow(rootDb, projectId);
  
  if (!project.path) {
    throw new ValidationError("Project has no filesystem path");
  }
  
  const agentInfo = await getAgentProviderInfo(project.path, userId);
  
  return c.json({
    data: agentInfo,
  });
});

/**
 * GET /api/provider-errors/agents-using-provider/:projectId/:providerId
 * Find agents that use a specific provider
 */
providerErrors.get("/agents-using-provider/:projectId/:providerId", async (c) => {
  const projectId = c.req.param("projectId");
  const providerIdParam = c.req.param("providerId");
  
  // Validate providerId parameter
  if (!Object.values(ProviderIds).includes(providerIdParam as ProviderId)) {
    throw new ValidationError(`Invalid provider ID: ${providerIdParam}`);
  }
  
  // Safe: validated above that providerIdParam is a valid ProviderId
  const providerId = providerIdParam;
  
  const rootDb = DatabaseManager.getRootDb();
  const project = ProjectService.getByIdOrThrow(rootDb, projectId);
  
  if (!project.path) {
    throw new ValidationError("Project has no filesystem path");
  }
  
  const agentNames = await findAgentsUsingProvider(project.path, providerId);
  
  return c.json({
    data: agentNames,
  });
});

/**
 * POST /api/provider-errors/bulk-reassign
 * Bulk reassign agents from one provider to another
 */
const BulkReassignSchema = z.object({
  projectId: z.string().min(1),
  fromProviderId: z.string().min(1),
  toProviderId: z.string().min(1),
  toModelId: z.string().optional(),
});

providerErrors.post("/bulk-reassign", async (c) => {
  const body = await c.req.json();
  const result = BulkReassignSchema.safeParse(body);
  
  if (!result.success) {
    throw new ValidationError(
      result.error.errors[0]?.message || "Invalid input",
      result.error.errors
    );
  }
  
  const { projectId, fromProviderId, toProviderId, toModelId } = result.data;
  
  // Validate provider IDs are valid
  if (!Object.values(ProviderIds).includes(fromProviderId as ProviderId)) {
    throw new ValidationError(`Invalid from provider ID: ${fromProviderId}`);
  }
  if (!Object.values(ProviderIds).includes(toProviderId as ProviderId)) {
    throw new ValidationError(`Invalid to provider ID: ${toProviderId}`);
  }
  
  const rootDb = DatabaseManager.getRootDb();
  const project = ProjectService.getByIdOrThrow(rootDb, projectId);
  
  if (!project.path) {
    throw new ValidationError("Project has no filesystem path");
  }
  
  const result_reassign = await bulkReassignAgents(
    project.path,
    fromProviderId as ProviderId, // Safe: validated above
    toProviderId as ProviderId, // Safe: validated above
    toModelId
  );
  
  return c.json({
    data: result_reassign,
  });
});

/**
 * POST /api/provider-errors/create-error-info
 * Create enhanced error information for a provider error
 */
const ErrorInfoSchema = z.object({
  projectId: z.string().min(1),
  agentName: z.string().optional(),
  providerId: z.string().nullable().optional(),
  error: z.string(),
});

providerErrors.post("/create-error-info", async (c) => {
  const body = await c.req.json();
  const result = ErrorInfoSchema.safeParse(body);
  
  if (!result.success) {
    throw new ValidationError(
      result.error.errors[0]?.message || "Invalid input",
      result.error.errors
    );
  }
  
  const { projectId, agentName, providerId, error } = result.data;
  const auth = c.get("auth") as { userId: string } | undefined;
  const userId = auth?.userId || "anonymous";
  
  const rootDb = DatabaseManager.getRootDb();
  const project = ProjectService.getByIdOrThrow(rootDb, projectId);
  
  // Create a validation result from the error
  const validation: ProviderValidationResult = {
    isValid: false,
    error,
    agentName,
  };
  
  // Add available providers if we have credentials
  if (providerId) {
    const { ProviderCredentialsService } = await import("@/services/provider-credentials.ts");
    validation.availableProviders = ProviderCredentialsService.getConfiguredProviders(userId);
  }
  
  const errorInfo = createProviderErrorInfo(validation, project.path);
  
  return c.json({
    data: errorInfo,
  });
});

export { providerErrors };