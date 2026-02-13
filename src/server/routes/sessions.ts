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
    status: status as SessionStatus | undefined,
    agent,
    parentId: parentId === "null" ? null : parentId,
    limit,
    offset,
  });

  const total = SessionService.count(db, status as SessionStatus | undefined);

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
      content: initialMessage,
    });
    SessionService.updateStats(db, session.id, {
      messageCount: 1,
    });

    // Kick off agent orchestration in the background if we have credentials
    const project = ProjectService.getById(rootDb, projectId);
    const projectPath = project?.path || process.cwd();

    const modelId = session.modelId || null;
    const providerId: ProviderId = modelId ? inferProviderId(modelId) : "anthropic";

    const auth = c.get("auth") as { userId: string } | undefined;
    const credentialUserId = auth?.userId || userId || "anonymous";
    const apiKey = ProviderCredentialsService.getApiKey(credentialUserId, providerId);

    if (apiKey) {
      // Fire-and-forget: run orchestration in the background
      AgentOrchestrator.run({
        db,
        projectId,
        projectPath,
        sessionId: session.id,
        userId: userId || credentialUserId,
        canExecuteCode: false,
        content: initialMessage,
        apiKey,
        providerId,
        modelId,
        agentName: session.agent,
      }).catch((err) => {
        console.error(`[sessions] Background orchestration failed for session ${session.id}:`, err);
      });
    } else {
      console.warn(`[sessions] No API key for provider "${providerId}", agent won't respond for session ${session.id}`);
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
    role: role as "user" | "assistant" | "system" | undefined,
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
