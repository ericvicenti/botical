/**
 * Sessions API Routes
 *
 * REST API endpoints for managing conversation sessions.
 * Sessions store conversation history, agent context, and cost tracking.
 *
 * Endpoints:
 * - GET /api/sessions - List sessions with pagination and filters
 * - POST /api/sessions - Create a new session
 * - GET /api/sessions/:id - Get session by ID
 * - PUT /api/sessions/:id - Update session
 * - DELETE /api/sessions/:id - Delete session (soft delete)
 * - GET /api/sessions/:id/messages - List messages in session
 *
 * Response Format:
 * All endpoints return { data, meta? } on success or { error } on failure.
 *
 * See: docs/knowledge-base/02-data-model.md#session
 * See: docs/knowledge-base/03-api-reference.md#sessions-api
 * See: docs/knowledge-base/04-patterns.md#rest-route-pattern
 */

import { Hono } from "hono";
import { z } from "zod";
import { DatabaseManager } from "@/database/index.ts";
import {
  SessionService,
  SessionCreateSchema,
  SessionUpdateSchema,
} from "@/services/sessions.ts";
import { MessageService, MessagePartService } from "@/services/messages.ts";
import { ValidationError } from "@/utils/errors.ts";
import { ProjectService } from "@/services/projects.ts";
import { ProviderCredentialsService } from "@/services/provider-credentials.ts";
import { AgentOrchestrator } from "@/agents/orchestrator.ts";
import { CredentialResolver } from "@/agents/credential-resolver.ts";
import type { SessionStatus, ProviderId } from "@/agents/types.ts";

const sessions = new Hono();

/**
 * Infer provider from model ID string
 */
function inferProviderId(modelId: string): ProviderId {
  if (modelId.startsWith("gpt-") || modelId.startsWith("o1") || modelId.startsWith("o3") || modelId.startsWith("o4") || modelId.startsWith("chatgpt")) return "openai";
  if (modelId.startsWith("gemini")) return "google";
  if (modelId.startsWith("llama") || modelId.startsWith("qwen") || modelId.startsWith("mistral")) return "ollama";
  return "anthropic";
}

/**
 * Resolve provider and API key for a user.
 * Tries: model inference > explicit provider > fallback through all providers.
 * Returns null if no credentials found anywhere.
 */
const PROVIDER_FALLBACK_ORDER: ProviderId[] = ["anthropic-oauth", "anthropic", "openai", "google", "ollama"];

function resolveProvider(
  userId: string,
  modelId: string | null,
  sessionProviderId: ProviderId | null,
): { providerId: ProviderId; apiKey: string } | null {
  // 1. Try provider inferred from model
  if (modelId) {
    const inferred = inferProviderId(modelId);
    const key = ProviderCredentialsService.getApiKey(userId, inferred);
    if (key) return { providerId: inferred, apiKey: key };
  }

  // 2. Try explicit session/agent provider
  if (sessionProviderId) {
    const key = ProviderCredentialsService.getApiKey(userId, sessionProviderId);
    if (key) return { providerId: sessionProviderId, apiKey: key };
  }

  // 3. Fallback: try all providers in priority order
  for (const fallback of PROVIDER_FALLBACK_ORDER) {
    const key = ProviderCredentialsService.getApiKey(userId, fallback);
    if (key) return { providerId: fallback, apiKey: key };
  }

  return null;
}

/**
 * Query parameters for listing sessions
 */
const ListQuerySchema = z.object({
  projectId: z.string().min(1),
  status: z.enum(["active", "archived", "deleted"]).optional(),
  agent: z.string().optional(),
  parentId: z.string().nullable().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

/**
 * GET /api/sessions
 * List sessions with pagination and filters
 */
sessions.get("/", async (c) => {
  const rawQuery = {
    projectId: c.req.query("projectId"),
    status: c.req.query("status"),
    agent: c.req.query("agent"),
    parentId: c.req.query("parentId"),
    limit: c.req.query("limit"),
    offset: c.req.query("offset"),
  };

  const result = ListQuerySchema.safeParse(rawQuery);
  if (!result.success) {
    throw new ValidationError(
      result.error.errors[0]?.message || "Invalid query parameters",
      result.error.errors
    );
  }

  const { projectId, status, agent, parentId, limit, offset } = result.data;

  const db = DatabaseManager.getProjectDb(projectId);

  const sessions = SessionService.list(db, {
    status, // Already validated by ListQuerySchema
    agent,
    parentId: parentId === "null" ? null : parentId,
    limit,
    offset,
  });

  const total = SessionService.count(db, status); // Already validated by ListQuerySchema

  return c.json({
    data: sessions,
    meta: {
      total,
      limit,
      offset,
      hasMore: offset + sessions.length < total,
    },
  });
});

/**
 * POST /api/sessions
 * Create a new session, optionally sending the first message immediately.
 *
 * When `message` and `userId` are provided the agent orchestration is
 * kicked off in the background so the caller gets the session back
 * instantly and the UI can subscribe to streaming events before the
 * first token arrives.
 */
sessions.post("/", async (c) => {
  const body = await c.req.json();

  // Extract projectId from body
  const projectId = body.projectId;
  if (!projectId || typeof projectId !== "string") {
    throw new ValidationError("projectId is required");
  }

  const db = DatabaseManager.getProjectDb(projectId);
  const rootDb = DatabaseManager.getRootDb();

  // Validate the rest of the input
  const result = SessionCreateSchema.safeParse(body);
  if (!result.success) {
    throw new ValidationError(
      result.error.errors[0]?.message || "Invalid input",
      result.error.errors
    );
  }

  // If an agent is specified, resolve its model and prompt
  const createData = { ...result.data };
  if (createData.agent && createData.agent !== "default") {
    const project = ProjectService.getByIdOrThrow(rootDb, projectId);
    if (project.path) {
      const { AgentYamlService } = await import("@/config/agents.ts");
      const agent = AgentYamlService.getByName(project.path, createData.agent);
      if (agent) {
        if (agent.providerId && !createData.providerId) {
          createData.providerId = agent.providerId;
        }
        if (agent.modelId && !createData.modelId) {
          createData.modelId = agent.modelId;
        }
        if (agent.prompt && !createData.systemPrompt) {
          createData.systemPrompt = agent.prompt;
        }
      }
    }
  }

  const session = SessionService.create(db, createData);

  // --- Initial message handling ---
  // If the caller provided a message, kick off agent orchestration in the
  // background. The session is returned immediately so the frontend can
  // navigate and subscribe to WebSocket events before streaming starts.
  const initialMessage = typeof body.message === "string" ? body.message.trim() : null;
  const userId = typeof body.userId === "string" ? body.userId : null;

  if (initialMessage) {
    // Always store the user message, regardless of API key availability
    const userMessage = MessageService.create(db, {
      sessionId: session.id,
      role: "user",
    });
    MessagePartService.create(db, {
      messageId: userMessage.id,
      sessionId: session.id,
      type: "text",
      content: { text: initialMessage },
    });
    SessionService.updateStats(db, session.id, {
      messageCount: 1,
    });

    // Kick off agent orchestration in the background if we have credentials
    const project = ProjectService.getById(rootDb, projectId);
    const projectPath = project?.path || process.cwd();

    const modelId = session.modelId || null;
    const auth = c.get("auth") as { userId: string } | undefined;
    const credentialUserId = auth?.userId || userId || "anonymous";

    // Resolve provider: model inference > session/agent config > find any available
    const resolvedProvider = resolveProvider(credentialUserId, modelId, session.providerId as ProviderId | null); // Safe: database value should be validated on storage

    if (resolvedProvider) {
      const { providerId, apiKey } = resolvedProvider;
      // Fire-and-forget: run orchestration in the background
      const credentialResolver = new CredentialResolver(credentialUserId, providerId, apiKey);
      AgentOrchestrator.run({
        db,
        projectId,
        projectPath,
        sessionId: session.id,
        userId: userId || credentialUserId,
        canExecuteCode: true,
        content: initialMessage,
        credentialResolver,
        providerId,
        modelId,
        existingUserMessageId: userMessage.id,
        agentName: session.agent,
      }).catch((err) => {
        console.error(`[sessions] Background orchestration failed for session ${session.id}:`, err);
      });
    } else {
      console.warn(`[sessions] No credentials found for any provider, agent won't respond for session ${session.id}`);
    }
  }

  return c.json(
    {
      data: session,
    },
    201
  );
});

/**
 * GET /api/sessions/:id
 * Get session by ID
 */
sessions.get("/:id", async (c) => {
  const sessionId = c.req.param("id");
  const projectId = c.req.query("projectId");

  if (!projectId) {
    throw new ValidationError("projectId query parameter is required");
  }

  const db = DatabaseManager.getProjectDb(projectId);
  const session = SessionService.getByIdOrThrow(db, sessionId);

  return c.json({
    data: session,
  });
});

/**
 * PUT /api/sessions/:id
 * Update session
 */
sessions.put("/:id", async (c) => {
  const sessionId = c.req.param("id");
  const body = await c.req.json();

  const projectId = body.projectId;
  if (!projectId || typeof projectId !== "string") {
    throw new ValidationError("projectId is required");
  }

  const db = DatabaseManager.getProjectDb(projectId);

  const result = SessionUpdateSchema.safeParse(body);
  if (!result.success) {
    throw new ValidationError(
      result.error.errors[0]?.message || "Invalid input",
      result.error.errors
    );
  }

  const session = SessionService.update(db, sessionId, result.data);

  return c.json({
    data: session,
  });
});

/**
 * DELETE /api/sessions/:id
 * Delete session (soft delete)
 */
sessions.delete("/:id", async (c) => {
  const sessionId = c.req.param("id");
  const projectId = c.req.query("projectId");

  if (!projectId) {
    throw new ValidationError("projectId query parameter is required");
  }

  const db = DatabaseManager.getProjectDb(projectId);
  SessionService.delete(db, sessionId);

  return c.json({
    data: { deleted: true },
  });
});

/**
 * PATCH /api/sessions/:id/system-prompt
 * Update the system prompt for a session
 */
sessions.patch("/:id/system-prompt", async (c) => {
  const sessionId = c.req.param("id");
  const body = await c.req.json();

  const projectId = body.projectId;
  if (!projectId || typeof projectId !== "string") {
    throw new ValidationError("projectId is required");
  }

  const SystemPromptSchema = z.object({
    systemPrompt: z.string().nullable(),
  });

  const result = SystemPromptSchema.safeParse(body);
  if (!result.success) {
    throw new ValidationError(
      result.error.errors[0]?.message || "Invalid input",
      result.error.errors
    );
  }

  const db = DatabaseManager.getProjectDb(projectId);
  const session = SessionService.updateSystemPrompt(
    db,
    sessionId,
    result.data.systemPrompt
  );

  return c.json({
    data: session,
  });
});

/**
 * GET /api/sessions/:id/messages
 * List messages in session with their parts
 */
sessions.get("/:id/messages", async (c) => {
  const sessionId = c.req.param("id");
  const projectId = c.req.query("projectId");

  if (!projectId) {
    throw new ValidationError("projectId query parameter is required");
  }

  const rawQuery = {
    role: c.req.query("role"),
    limit: c.req.query("limit"),
    offset: c.req.query("offset"),
  };

  const QuerySchema = z.object({
    role: z.enum(["user", "assistant", "system"]).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    offset: z.coerce.number().int().min(0).default(0),
  });

  const result = QuerySchema.safeParse(rawQuery);
  if (!result.success) {
    throw new ValidationError(
      result.error.errors[0]?.message || "Invalid query parameters",
      result.error.errors
    );
  }

  const { role, limit, offset } = result.data;

  const db = DatabaseManager.getProjectDb(projectId);

  // Ensure session exists
  SessionService.getByIdOrThrow(db, sessionId);

  const messages = MessageService.listBySession(db, sessionId, {
    role, // Already validated by QuerySchema
    limit,
    offset,
  });

  // Include parts for each message
  const messagesWithParts = messages.map((message) => ({
    ...message,
    parts: MessagePartService.listByMessage(db, message.id),
  }));

  const total = MessageService.countBySession(db, sessionId);

  return c.json({
    data: messagesWithParts,
    meta: {
      total,
      limit,
      offset,
      hasMore: offset + messages.length < total,
    },
  });
});

export { sessions };
