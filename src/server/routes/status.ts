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
import { extractTextContent } from "@/services/message-content.ts";

const status = new Hono();

/**
 * GET /api/status
 * Returns live system status
 */
status.get("/", async (c) => {
  const rootDb = DatabaseManager.getRootDb();
  const projects = ProjectService.list(rootDb, {});

  const activeSessions: Array<{
    id: string;
    title: string;
    agent: string | null;
    projectId: string;
    projectName: string;
    messageCount: number;
    lastActivity: number;
    status: string;
    lastMessage?: string;
  }> = [];

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

      // Active sessions
      const sessions = db.prepare(`
        SELECT id, title, agent, status, message_count, updated_at, created_at
        FROM sessions
        WHERE status = 'active'
        ORDER BY updated_at DESC
        LIMIT 20
      `).all() as Array<{
        id: string;
        title: string;
        agent: string | null;
        status: string;
        message_count: number;
        updated_at: number;
        created_at: number;
      }>;

      for (const s of sessions) {
        // Get last message text
        const lastPart = db.prepare(`
          SELECT mp.content, m.role
          FROM message_parts mp
          JOIN messages m ON mp.message_id = m.id
          WHERE m.session_id = ? AND mp.type = 'text'
          ORDER BY mp.created_at DESC
          LIMIT 1
        `).get(s.id) as { content: string; role: string } | undefined;

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
  recentMessages.sort((a, b) => b.createdAt - a.createdAt);

  return c.json({
    data: {
      timestamp: Date.now(),
      activeSessions: activeSessions.slice(0, 20),
      recentMessages: recentMessages.slice(0, 20),
      services: {
        server: "running",
        uptime: process.uptime(),
      },
    },
  });
});

export { status };
