/**
 * Messages API Routes
 *
 * REST API endpoints for managing messages and triggering agent orchestration.
 * Messages represent exchanges in a conversation, with parts storing different
 * content types (text, tool calls, files).
 *
 * Endpoints:
 * - POST /api/messages - Send a message (triggers agent orchestration)
 * - GET /api/messages/:id - Get message with all parts
 * - GET /api/messages/:id/parts - List message parts
 *
 * The POST endpoint is the primary way to interact with agents:
 * 1. Creates a user message in the session
 * 2. Runs the AgentOrchestrator to generate a response
 * 3. Returns the assistant message with all parts
 *
 * Response Format:
 * All endpoints return { data } on success or { error } on failure.
 *
 * See: docs/knowledge-base/02-data-model.md#message
 * See: docs/knowledge-base/03-api-reference.md#messages-api
 * See: docs/knowledge-base/04-patterns.md#rest-route-pattern
 */

import { Hono } from "hono";
import { z } from "zod";
import { DatabaseManager } from "@/database/index.ts";
import { MessageService, MessagePartService } from "@/services/messages.ts";
import { SessionService } from "@/services/sessions.ts";
import { ProjectService } from "@/services/projects.ts";
import { ProviderCredentialsService } from "@/services/provider-credentials.ts";
import { AgentOrchestrator } from "@/agents/orchestrator.ts";
import { ValidationError, AuthenticationError } from "@/utils/errors.ts";
import type { ProviderId } from "@/agents/types.ts";

const messages = new Hono();

/**
 * Schema for sending a message
 */
/**
 * Infer provider from model ID string
 */
function inferProviderId(modelId: string): ProviderId {
  if (modelId.startsWith("gpt-") || modelId.startsWith("o1") || modelId.startsWith("o3") || modelId.startsWith("o4") || modelId.startsWith("chatgpt")) return "openai";
  if (modelId.startsWith("gemini")) return "google";
  if (modelId.startsWith("llama") || modelId.startsWith("qwen") || modelId.startsWith("mistral")) return "ollama";
  return "anthropic";
}

const SendMessageSchema = z.object({
  projectId: z.string().min(1),
  sessionId: z.string().min(1),
  content: z.string().min(1),
  userId: z.string().min(1),
  // All optional — backend resolves from session/agent config
  providerId: z.enum(["anthropic", "openai", "google", "ollama"]).optional(),
  modelId: z.string().nullable().optional(),
  agentName: z.string().optional(),
  canExecuteCode: z.boolean().default(false),
  enabledTools: z.array(z.string()).optional(),
  apiKey: z.string().optional(),
});

/**
 * POST /api/messages
 * Send a message and trigger agent orchestration
 */
messages.post("/", async (c) => {
  const body = await c.req.json();

  const result = SendMessageSchema.safeParse(body);
  if (!result.success) {
    throw new ValidationError(
      result.error.errors[0]?.message || "Invalid input",
      result.error.errors
    );
  }

  const {
    projectId,
    sessionId,
    content,
    userId,
    providerId: requestProviderId,
    modelId: requestModelId,
    agentName,
    canExecuteCode,
    enabledTools,
    apiKey: requestApiKey,
  } = result.data;

  // Get the project database
  const db = DatabaseManager.getProjectDb(projectId);
  const rootDb = DatabaseManager.getRootDb();

  // Get project to access its filesystem path
  const project = ProjectService.getByIdOrThrow(rootDb, projectId);
  const projectPath = project.path || process.cwd();

  // Verify session exists
  const session = SessionService.getByIdOrThrow(db, sessionId);

  // Resolve model: explicit request > session config (set from agent at creation)
  const modelId = requestModelId || session.modelId || null;

  // Resolve provider: explicit request > infer from model > default
  const providerId: ProviderId = requestProviderId
    || (modelId ? inferProviderId(modelId) : "anthropic");

  // Get API key - prefer request body, fallback to stored credentials
  const apiKey = requestApiKey || ProviderCredentialsService.getApiKey(userId, providerId);
  if (!apiKey) {
    throw new AuthenticationError(
      `No API key found for provider "${providerId}". Please add credentials first or provide an API key.`
    );
  }

  // Create abort controller for this request
  const abortController = new AbortController();

  // Set up timeout (10 minutes max for agent runs)
  const timeoutId = setTimeout(() => {
    abortController.abort();
  }, 600000);

  try {
    // Run agent orchestration
    const agentResult = await AgentOrchestrator.run({
      db,
      projectId,
      projectPath,
      sessionId,
      userId,
      canExecuteCode,
      enabledTools,
      content,
      apiKey,
      providerId: providerId as ProviderId,
      modelId,
      agentName: agentName ?? session.agent,
      abortSignal: abortController.signal,
    });

    clearTimeout(timeoutId);

    // Get the assistant message with parts
    const message = MessageService.getByIdOrThrow(db, agentResult.messageId);
    const parts = MessagePartService.listByMessage(db, agentResult.messageId);

    return c.json(
      {
        data: {
          message,
          parts,
          usage: agentResult.usage,
          cost: agentResult.cost,
          finishReason: agentResult.finishReason,
        },
      },
      201
    );
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
});

/**
 * GET /api/messages/:id
 * Get message with all parts
 */
messages.get("/:id", async (c) => {
  const messageId = c.req.param("id");
  const projectId = c.req.query("projectId");

  if (!projectId) {
    throw new ValidationError("projectId query parameter is required");
  }

  const db = DatabaseManager.getProjectDb(projectId);

  const message = MessageService.getByIdOrThrow(db, messageId);
  const parts = MessagePartService.listByMessage(db, messageId);

  return c.json({
    data: {
      ...message,
      parts,
    },
  });
});

/**
 * GET /api/messages/:id/parts
 * List message parts
 */
messages.get("/:id/parts", async (c) => {
  const messageId = c.req.param("id");
  const projectId = c.req.query("projectId");

  if (!projectId) {
    throw new ValidationError("projectId query parameter is required");
  }

  const db = DatabaseManager.getProjectDb(projectId);

  // Ensure message exists
  MessageService.getByIdOrThrow(db, messageId);

  const parts = MessagePartService.listByMessage(db, messageId);

  return c.json({
    data: parts,
    meta: {
      total: parts.length,
    },
  });
});

export { messages };
