/**
 * Message Queue API Routes
 *
 * REST API endpoints for managing the server-side message queue.
 * Provides visibility into queue status and allows queue management.
 *
 * Endpoints:
 * - GET /api/sessions/:sessionId/queue - Get queue status for a session
 * - POST /api/sessions/:sessionId/queue/:messageId/retry - Retry a failed message
 * - DELETE /api/sessions/:sessionId/queue/:messageId - Cancel a queued message
 * - GET /api/queue/status - Get global queue status
 */

import { Hono } from "hono";
import { z } from "zod";
import { DatabaseManager } from "@/database/index.ts";
import { MessageQueueService } from "@/services/message-queue.ts";
import { messageQueueProcessor } from "@/services/message-queue-processor.ts";
import { ValidationError, NotFoundError } from "@/utils/errors.ts";

const messageQueue = new Hono();

/**
 * GET /api/sessions/:sessionId/queue
 * Get queue status for a session
 */
messageQueue.get("/sessions/:sessionId/queue", async (c) => {
  const sessionId = c.req.param("sessionId");
  const projectId = c.req.query("projectId");

  if (!projectId) {
    throw new ValidationError("projectId query parameter is required");
  }

  const db = DatabaseManager.getProjectDb(projectId);

  // Get all queued messages for this session
  const allMessages = MessageQueueService.listBySession(db, sessionId);
  const pendingMessages = MessageQueueService.listBySession(db, sessionId, { status: "pending" });
  const processingMessage = MessageQueueService.getProcessing(db, sessionId);

  // Get processor status
  const processorStatus = messageQueueProcessor.getSessionStatus(sessionId);

  return c.json({
    data: {
      sessionId,
      processorStatus,
      queueLength: pendingMessages.length,
      totalMessages: allMessages.length,
      processingMessage,
      pendingMessages: pendingMessages.map((msg, index) => ({
        ...msg,
        position: index + 1,
      })),
      recentMessages: allMessages
        .filter(msg => msg.status === "completed" || msg.status === "failed")
        .slice(-10) // Last 10 completed/failed messages
        .reverse(),
    },
  });
});

/**
 * POST /api/sessions/:sessionId/queue/:messageId/retry
 * Retry a failed queued message
 */
messageQueue.post("/sessions/:sessionId/queue/:messageId/retry", async (c) => {
  const sessionId = c.req.param("sessionId");
  const messageId = c.req.param("messageId");
  const projectId = c.req.query("projectId");

  if (!projectId) {
    throw new ValidationError("projectId query parameter is required");
  }

  const db = DatabaseManager.getProjectDb(projectId);

  // Get the message
  const message = MessageQueueService.getById(db, messageId);
  if (!message) {
    throw new NotFoundError("Queued message", messageId);
  }

  if (message.sessionId !== sessionId) {
    throw new ValidationError("Message does not belong to the specified session");
  }

  if (message.status !== "failed") {
    throw new ValidationError("Only failed messages can be retried");
  }

  // Retry the message
  const retriedMessage = MessageQueueService.retry(db, messageId);

  return c.json({
    data: {
      message: retriedMessage,
      queuePosition: MessageQueueService.getQueuePosition(db, sessionId, messageId),
    },
  });
});

/**
 * POST /api/sessions/:sessionId/queue/interrupt
 * Request interrupt of currently processing message
 */
messageQueue.post("/sessions/:sessionId/queue/interrupt", async (c) => {
  const sessionId = c.req.param("sessionId");

  if (!sessionId) {
    throw new ValidationError("sessionId parameter is required");
  }

  const db = DatabaseManager.getProjectDb(sessionId);

  try {
    const interrupted = MessageQueueService.requestInterrupt(db, sessionId);
    
    if (interrupted) {
      return c.json({
        data: { 
          message: "Interrupt requested",
          sessionId,
          timestamp: Date.now() 
        },
      });
    } else {
      return c.json({
        data: { 
          message: "No interruptible message found",
          sessionId,
          timestamp: Date.now() 
        },
      });
    }
  } catch (error) {
    console.error(`Error requesting interrupt for session ${sessionId}:`, error);
    throw error;
  }
});

/**
 * DELETE /api/sessions/:sessionId/queue/:messageId
 * Cancel a queued message
 */
messageQueue.delete("/sessions/:sessionId/queue/:messageId", async (c) => {
  const sessionId = c.req.param("sessionId");
  const messageId = c.req.param("messageId");
  const projectId = c.req.query("projectId");

  if (!projectId) {
    throw new ValidationError("projectId query parameter is required");
  }

  const db = DatabaseManager.getProjectDb(projectId);

  // Get the message
  const message = MessageQueueService.getById(db, messageId);
  if (!message) {
    throw new NotFoundError("Queued message", messageId);
  }

  if (message.sessionId !== sessionId) {
    throw new ValidationError("Message does not belong to the specified session");
  }

  if (message.status === "completed") {
    throw new ValidationError("Cannot cancel a completed message");
  }

  if (message.status === "processing") {
    // Cancel active processing
    messageQueueProcessor.cancelSession(sessionId);
  }

  // Cancel the message
  const cancelledMessage = MessageQueueService.cancel(db, messageId);

  return c.json({
    data: {
      message: cancelledMessage,
      cancelled: true,
    },
  });
});

/**
 * GET /api/queue/status
 * Get global queue status across all projects
 */
messageQueue.get("/status", async (c) => {
  const rootDb = DatabaseManager.getRootDb();
  
  // Get all projects
  const projects = rootDb.prepare("SELECT id, name FROM projects").all() as { id: string; name: string }[];
  
  const globalStatus = {
    totalProjects: projects.length,
    processingSessions: messageQueueProcessor.getProcessingSessions(),
    projectStats: [] as Array<{
      projectId: string;
      projectName: string;
      pendingMessages: number;
      processingMessages: number;
      failedMessages: number;
    }>,
  };

  for (const project of projects) {
    try {
      const db = DatabaseManager.getProjectDb(project.id);
      
      const pending = db.prepare(
        "SELECT COUNT(*) as count FROM message_queue WHERE status = 'pending'"
      ).get() as { count: number };
      
      const processing = db.prepare(
        "SELECT COUNT(*) as count FROM message_queue WHERE status = 'processing'"
      ).get() as { count: number };
      
      const failed = db.prepare(
        "SELECT COUNT(*) as count FROM message_queue WHERE status = 'failed'"
      ).get() as { count: number };

      globalStatus.projectStats.push({
        projectId: project.id,
        projectName: project.name,
        pendingMessages: pending.count,
        processingMessages: processing.count,
        failedMessages: failed.count,
      });
    } catch {
      // Skip projects with database issues
      globalStatus.projectStats.push({
        projectId: project.id,
        projectName: project.name,
        pendingMessages: 0,
        processingMessages: 0,
        failedMessages: 0,
      });
    }
  }

  return c.json({
    data: globalStatus,
  });
});

/**
 * POST /api/queue/cleanup
 * Clean up old completed/failed messages
 */
messageQueue.post("/cleanup", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const olderThanHours = body.olderThanHours || 24;
  const olderThanMs = olderThanHours * 60 * 60 * 1000;

  const rootDb = DatabaseManager.getRootDb();
  const projects = rootDb.prepare("SELECT id FROM projects").all() as { id: string }[];
  
  let totalCleaned = 0;

  for (const project of projects) {
    try {
      const db = DatabaseManager.getProjectDb(project.id);
      const cleaned = MessageQueueService.cleanup(db, olderThanMs);
      totalCleaned += cleaned;
    } catch {
      // Skip projects with database issues
    }
  }

  return c.json({
    data: {
      cleanedMessages: totalCleaned,
      olderThanHours,
    },
  });
});

export { messageQueue };