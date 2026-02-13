/**
 * Heartbeat Actions
 *
 * Actions for managing the Leopard self-improvement heartbeat system.
 * Triggers improvement cycles via the Botical API (which invokes the orchestrator).
 */

import { z } from "zod";
import { defineAction, success, error } from "./types.ts";

const DEFAULT_MESSAGE = `Read PRIORITIES.md. Check CHANGELOG-AUTO.md for recent work. Run tests (bun test). Pick the highest priority item and make one small improvement. Commit and deploy if tests pass.`;

const API_KEY = "botical_leopard_194fbb476a9f614465838ea1a13df29a";
const DEFAULT_PROJECT_ID = "prj_2go5oq0sa9o-51985ca1"; // Botical Tiger

/**
 * heartbeat.leopard - Trigger Leopard improvement cycle
 *
 * Creates or continues a session via the REST API, which triggers the
 * orchestrator to actually run the LLM and execute tools.
 */
export const leopardHeartbeat = defineAction({
  id: "heartbeat.leopard",
  label: "Leopard Heartbeat",
  description: "Trigger improvement cycle for Leopard agent",
  category: "service",
  icon: "heart",

  params: z.object({
    projectId: z.string().optional().describe("Project ID"),
    message: z.string().optional().describe("Custom heartbeat message"),
  }),

  execute: async ({ projectId, message }) => {
    const pid = projectId || DEFAULT_PROJECT_ID;
    const port = process.env.BOTICAL_PORT || "6001";
    const baseUrl = `http://localhost:${port}`;
    const heartbeatMessage = message || DEFAULT_MESSAGE;

    try {
      // Check for active leopard session (created in last 2 hours)
      const twoHoursAgo = Date.now() - 7200000;
      let sessionId: string | null = null;

      // Try to find existing active session via API
      try {
        const sessResp = await fetch(`${baseUrl}/api/sessions?projectId=${pid}&agent=leopard&status=active`, {
          headers: { "Authorization": `Bearer ${API_KEY}` },
        });
        if (sessResp.ok) {
          const sessData = await sessResp.json() as { data: Array<{ id: string; createdAt: number }> };
          const recent = sessData.data?.find((s: { id: string; createdAt: number }) => s.createdAt > twoHoursAgo);
          if (recent) sessionId = recent.id;
        }
      } catch {
        // Fall through to create new session
      }

      if (!sessionId) {
        // Create new session
        const createResp = await fetch(`${baseUrl}/api/sessions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${API_KEY}`,
          },
          body: JSON.stringify({
            projectId: pid,
            title: `Improvement Cycle ${new Date().toISOString().slice(0, 16).replace("T", " ")}`,
            agent: "leopard",
            providerId: "anthropic-oauth",
          }),
        });

        if (!createResp.ok) {
          const errData = await createResp.text();
          return error(`Failed to create session: ${errData}`);
        }

        const createData = await createResp.json() as { data: { id: string } };
        sessionId = createData.data?.id;
        if (!sessionId) {
          return error("No session ID returned");
        }
      }

      // Send message fire-and-forget — don't wait for the LLM to finish.
      // The POST /api/messages blocks until the full LLM response completes,
      // which can take 10+ minutes with tool calls. We just need to confirm
      // the message was accepted, not wait for the response.
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000); // 15s to accept

      try {
        const msgResp = await fetch(`${baseUrl}/api/messages`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${API_KEY}`,
          },
          body: JSON.stringify({
            projectId: pid,
            sessionId,
            content: heartbeatMessage,
            userId: "system",
            providerId: "anthropic-oauth",
            canExecuteCode: true,
          }),
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (!msgResp.ok) {
          const errData = await msgResp.text();
          return error(`Failed to send message: ${errData}`);
        }
      } catch (e) {
        clearTimeout(timeout);
        // AbortError means the request was accepted but LLM is still running — that's fine
        if (e instanceof Error && e.name === "AbortError") {
          return success(
            "Leopard Heartbeat Triggered",
            `Message sent to session ${sessionId} (LLM processing in background)`
          );
        }
        throw e;
      }

      return success(
        "Leopard Heartbeat Triggered",
        `Sent improvement cycle message to session ${sessionId}`
      );
    } catch (err) {
      return error(`Heartbeat failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  },
});

export const heartbeatActions = [leopardHeartbeat];
