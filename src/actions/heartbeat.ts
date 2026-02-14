/**
 * Heartbeat Actions
 *
 * Triggers Leopard improvement cycles via the Botical API.
 * Uses fire-and-forget: sends the request but doesn't await the full LLM response.
 */

import { z } from "zod";
import { defineAction, success, error } from "./types.ts";

const API_KEY = "botical_leopard_194fbb476a9f614465838ea1a13df29a";
const DEFAULT_PROJECT_ID = "prj_2go5oq0sa9o-51985ca1";

const DEFAULT_MESSAGE = `Read PRIORITIES.md. Check CHANGELOG-AUTO.md for recent work. Run tests (bun test). Pick the highest priority bug or feature and implement a fix. Commit your changes and update CHANGELOG-AUTO.md. Deploy if tests pass.`;

export const leopardHeartbeat = defineAction({
  id: "heartbeat.leopard",
  label: "Leopard Heartbeat",
  description: "Trigger improvement cycle for Leopard agent",
  category: "service",
  icon: "heart",

  params: z.object({
    projectId: z.string().optional(),
    message: z.string().optional(),
  }),

  execute: async ({ projectId, message }) => {
    const pid = projectId || DEFAULT_PROJECT_ID;
    const port = process.env.BOTICAL_PORT || "6001";
    const baseUrl = `http://localhost:${port}`;
    const heartbeatMessage = message || DEFAULT_MESSAGE;

    try {
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
        return error(`Failed to create session: ${await createResp.text()}`);
      }

      const createData = await createResp.json() as { data: { id: string } };
      const sessionId = createData.data?.id;
      if (!sessionId) return error("No session ID returned");

      // Send message WITHOUT awaiting — the fetch fires and we return immediately.
      // The server processes the message and runs the LLM in the background.
      fetch(`${baseUrl}/api/messages`, {
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
      }).catch(() => {
        // Silently ignore — LLM will process in background
      });

      // Small delay to ensure the request is sent before we return
      await new Promise(resolve => setTimeout(resolve, 2000));

      return success(
        "Leopard Heartbeat Triggered",
        `Created session ${sessionId} and sent improvement message`
      );
    } catch (err) {
      return error(`Heartbeat failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  },
});

export const heartbeatActions = [leopardHeartbeat];
