/**
 * Heartbeat Actions
 *
 * Triggers Leopard improvement cycles via the Botical API.
 * Supports both legacy single-session and new decomposed workflow approaches.
 */

import { z } from "zod";
import { defineAction, success, error } from "./types.ts";

const API_KEY = "botical_leopard_194fbb476a9f614465838ea1a13df29a";
const DEFAULT_PROJECT_ID = "prj_2go5oq0sa9o-51985ca1";
const DEFAULT_USER_ID = "usr_mldu5ohe-94448ee0";

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
    useWorkflow: z.boolean().optional().default(false),
  }),

  execute: async ({ projectId, message, useWorkflow }) => {
    const pid = projectId || DEFAULT_PROJECT_ID;
    const port = process.env.BOTICAL_PORT || "6001";
    const baseUrl = `http://localhost:${port}`;

    try {
      if (useWorkflow) {
        // Use the new decomposed workflow approach
        return await executeWorkflowHeartbeat(baseUrl, pid);
      } else {
        // Use the legacy single-session approach
        return await executeLegacyHeartbeat(baseUrl, pid, message || DEFAULT_MESSAGE);
      }
    } catch (err) {
      return error(`Heartbeat failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  },
});

/**
 * Execute heartbeat using the new decomposed workflow
 */
async function executeWorkflowHeartbeat(baseUrl: string, projectId: string) {
  // First, check if improvement-cycle workflow exists
  const workflowsResp = await fetch(`${baseUrl}/api/workflows?projectId=${projectId}`, {
    headers: { "Authorization": `Bearer ${API_KEY}` },
  });

  if (!workflowsResp.ok) {
    return error(`Failed to check workflows: ${await workflowsResp.text()}`);
  }

  const workflowsData = await workflowsResp.json() as { data: Array<{ id: string; name: string }> };
  const improvementWorkflow = workflowsData.data?.find(w => w.name === "Leopard Improvement Cycle");

  if (!improvementWorkflow) {
    // Fallback to legacy approach if workflow doesn't exist
    console.log("Improvement cycle workflow not found, falling back to legacy approach");
    return await executeLegacyHeartbeat(baseUrl, projectId, DEFAULT_MESSAGE);
  }

  // Execute the improvement cycle workflow
  const executeResp = await fetch(`${baseUrl}/api/workflows/${improvementWorkflow.id}/execute`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      input: {
        projectId,
        userId: DEFAULT_USER_ID,
        providerId: "anthropic-oauth",
        modelId: "claude-3-5-sonnet-20241022"
      }
    }),
  });

  if (!executeResp.ok) {
    return error(`Failed to execute workflow: ${await executeResp.text()}`);
  }

  const executeData = await executeResp.json() as { data: { executionId: string } };
  const executionId = executeData.data?.executionId;

  if (!executionId) {
    return error("No execution ID returned from workflow");
  }

  return success(
    "Leopard Improvement Cycle Started",
    `Started decomposed improvement cycle workflow (execution: ${executionId})`
  );
}

/**
 * Execute heartbeat using the legacy single-session approach
 */
async function executeLegacyHeartbeat(baseUrl: string, projectId: string, message: string) {
  // Create new session
  const createResp = await fetch(`${baseUrl}/api/sessions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      projectId,
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
      projectId,
      sessionId,
      content: message,
      userId: DEFAULT_USER_ID,
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
}

export const heartbeatActions = [leopardHeartbeat];
