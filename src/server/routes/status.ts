/**
 * Status API Route
 *
 * Provides a live overview of the system:
 * - Active sessions (especially agent sessions)
 * - Recent workflow executions
 * - Service health
 * - Recent activity
 */

import { Hono } from "hono";
import { DatabaseManager } from "@/database/index.ts";
import { ProjectService } from "@/services/projects.ts";
import { ScheduleService } from "@/services/schedules.ts";
import { extractTextContent } from "@/services/message-content.ts";

const status = new Hono();

/**
 * GET /api/status
 * Returns live system status
 */
status.get("/", async (c) => {
  const rootDb = DatabaseManager.getRootDb();
  const projects = ProjectService.list(rootDb, {});

  type SessionInfo = {
    id: string;
    title: string;
    agent: string | null;
    projectId: string;
    projectName: string;
    messageCount: number;
    lastActivity: number;
    status: string;
    lastMessage?: string;
    hasError?: boolean;
  };

  const activeSessions: SessionInfo[] = [];
  const recentSessions: SessionInfo[] = [];

  const recentMessages: Array<{
    sessionId: string;
    role: string;
    text: string;
    createdAt: number;
    agent: string | null;
  }> = [];

  for (const project of projects) {
    try {
      const db = DatabaseManager.getProjectDb(project.id);

      // Active sessions — only those with an in-flight assistant message
      // (completed_at IS NULL means the model is generating or a tool is running)
      const sessions = db.prepare(`
        SELECT DISTINCT s.id, s.title, s.agent, s.status, s.message_count, s.updated_at, s.created_at
        FROM sessions s
        INNER JOIN messages m ON m.session_id = s.id
        WHERE s.status = 'active'
          AND m.role = 'assistant'
          AND m.completed_at IS NULL
        ORDER BY s.updated_at DESC
        LIMIT 20
      `).all() as Array<{
        id: string;
        title: string;
        agent: string | null;
        status: string;
        message_count: number;
        updated_at: number;
        created_at: number;
      }>; // Safe: matches known database schema // Safe: matches known database schema

      for (const s of sessions) {
        // Get last message text
        const lastPart = db.prepare(`
          SELECT mp.content, m.role
          FROM message_parts mp
          JOIN messages m ON mp.message_id = m.id
          WHERE m.session_id = ? AND mp.type = 'text'
          ORDER BY mp.created_at DESC
          LIMIT 1
        `).get(s.id) as { content: string; role: string } | undefined; // Safe: matches database schema

        let lastMessage: string | undefined;
        if (lastPart) {
          try {
            const parsed = typeof lastPart.content === "string"
              ? JSON.parse(lastPart.content)
              : lastPart.content;
            lastMessage = extractTextContent(parsed);
          } catch {
            lastMessage = extractTextContent(lastPart.content);
          }
          if (lastMessage && lastMessage.length > 200) {
            lastMessage = lastMessage.substring(0, 200) + "...";
          }
        }

        activeSessions.push({
          id: s.id,
          title: s.title,
          agent: s.agent,
          projectId: project.id,
          projectName: project.name,
          messageCount: s.message_count,
          lastActivity: s.updated_at || s.created_at,
          status: s.status,
          lastMessage,
        });
      }

      // Recent sessions (active in last 24h, not currently running)
      const activeIds = new Set(sessions.map(s => s.id));
      const cutoff = Date.now() - 24 * 60 * 60 * 1000;
      const recentRows = db.prepare(`
        SELECT s.id, s.title, s.agent, s.status, s.message_count, s.updated_at, s.created_at,
          (SELECT m.error_type FROM messages m WHERE m.session_id = s.id AND m.error_type IS NOT NULL ORDER BY m.created_at DESC LIMIT 1) as last_error
        FROM sessions s
        WHERE s.updated_at > ?
        ORDER BY s.updated_at DESC
        LIMIT 20
      `).all(cutoff) as Array<{
        id: string;
        title: string;
        agent: string | null;
        status: string;
        message_count: number;
        updated_at: number;
        created_at: number;
        last_error: string | null;
      }>; // Safe: matches known database schema

      for (const s of recentRows) {
        if (activeIds.has(s.id)) continue;

        const lastPart = db.prepare(`
          SELECT mp.content, m.role
          FROM message_parts mp
          JOIN messages m ON mp.message_id = m.id
          WHERE m.session_id = ? AND mp.type = 'text'
          ORDER BY mp.created_at DESC
          LIMIT 1
        `).get(s.id) as { content: string; role: string } | undefined; // Safe: matches database schema

        let lastMessage: string | undefined;
        if (lastPart) {
          try {
            const parsed = typeof lastPart.content === "string" ? JSON.parse(lastPart.content) : lastPart.content;
            lastMessage = extractTextContent(parsed);
          } catch {
            lastMessage = extractTextContent(lastPart.content);
          }
          if (lastMessage && lastMessage.length > 200) lastMessage = lastMessage.substring(0, 200) + "...";
        }

        recentSessions.push({
          id: s.id,
          title: s.title,
          agent: s.agent,
          projectId: project.id,
          projectName: project.name,
          messageCount: s.message_count,
          lastActivity: s.updated_at || s.created_at,
          status: s.status,
          lastMessage,
          hasError: !!s.last_error,
        });
      }

      // Recent messages (last 10 across all sessions)
      const msgs = db.prepare(`
        SELECT m.session_id, m.role, m.agent, mp.content, mp.created_at
        FROM message_parts mp
        JOIN messages m ON mp.message_id = m.id
        WHERE mp.type = 'text'
        ORDER BY mp.created_at DESC
        LIMIT 10
      `).all() as Array<{
        session_id: string;
        role: string;
        agent: string | null;
        content: string;
        created_at: number;
      }>;

      for (const msg of msgs) {
        let text: string;
        try {
          const parsed = typeof msg.content === "string" ? JSON.parse(msg.content) : msg.content;
          text = extractTextContent(parsed);
        } catch {
          text = extractTextContent(msg.content);
        }
        if (text && text.length > 200) text = text.substring(0, 200) + "...";

        if (text) {
          recentMessages.push({
            sessionId: msg.session_id,
            role: msg.role,
            text,
            createdAt: msg.created_at,
            agent: msg.agent,
          });
        }
      }
    } catch {
      // Skip inaccessible projects
    }
  }

  // Sort by most recent
  activeSessions.sort((a, b) => b.lastActivity - a.lastActivity);
  recentSessions.sort((a, b) => b.lastActivity - a.lastActivity);
  recentMessages.sort((a, b) => b.createdAt - a.createdAt);

  // Get heartbeat status
  let heartbeat = {
    lastRun: null as number | null,
    nextRun: null as number | null,
    status: "unknown" as string,
    lastError: null as string | null,
  };

  try {
    const tigerDb = DatabaseManager.getProjectDb("prj_2go5oq0sa9o-51985ca1");
    const schedules = ScheduleService.list(tigerDb, "prj_2go5oq0sa9o-51985ca1", { limit: 100 });
    const leopardHeartbeat = schedules.find(s => s.name === "Leopard Heartbeat");
    
    if (leopardHeartbeat) {
      heartbeat = {
        lastRun: leopardHeartbeat.lastRunAt,
        nextRun: leopardHeartbeat.nextRunAt,
        status: leopardHeartbeat.enabled 
          ? (leopardHeartbeat.lastRunStatus || "pending")
          : "disabled",
        lastError: leopardHeartbeat.lastRunError,
      };
    }
  } catch (err) {
    // Ignore errors accessing heartbeat schedule
  }

  return c.json({
    data: {
      timestamp: Date.now(),
      activeSessions: activeSessions.slice(0, 20),
      recentSessions: recentSessions.slice(0, 20),
      recentMessages: recentMessages.slice(0, 20),
      heartbeat,
      services: {
        server: "running",
        uptime: process.uptime(),
      },
    },
  });
});

export { status };
