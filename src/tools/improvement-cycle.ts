/**
 * Improvement Cycle Tool
 * 
 * Specialized tool for running decomposed improvement cycles.
 * Breaks long improvement tasks into focused sub-sessions:
 * Plan → Implement → Verify
 */

import { z } from "zod";
import type { ToolDefinition } from "./types.ts";
import { ImprovementCycleDecomposer } from "@/agents/improvement-cycle-decomposer.ts";
import { CredentialResolver } from "@/agents/credential-resolver.ts";
import type { ProviderId } from "@/agents/types.ts";

/**
 * Input schema for improvement cycle tool
 */
export const ImprovementCycleParamsSchema = z.object({
  description: z.string().describe("Description of the improvement task to be completed"),
  providerId: z.string().optional().describe("AI provider to use (defaults to current session's provider)"),
  modelId: z.string().optional().describe("AI model to use (defaults to current session's model)"),
});

export type ImprovementCycleParams = z.infer<typeof ImprovementCycleParamsSchema>;

/**
 * Improvement cycle tool definition
 */
export const improvementCycleTool: ToolDefinition = {
  name: "improvement_cycle",
  description: "Run a decomposed improvement cycle with separate Plan → Implement → Verify phases. Each phase runs in a fresh context to prevent context bloat while passing structured summaries between phases. Ideal for complex improvement tasks that would normally require many steps.",
  parameters: ImprovementCycleParamsSchema,
  execute: async (params: ImprovementCycleParams, context) => {
    const { description, providerId: inputProviderId, modelId: inputModelId } = params;
    const { projectId, projectPath, sessionId, userId, abortSignal } = context;

    try {
      // Get current session to determine provider/model defaults
      const { SessionService } = await import("@/services/sessions.ts");
      const session = SessionService.getByIdOrThrow(context.db, sessionId);

      // Use provided or session defaults
      const providerId = (inputProviderId ?? session.providerId) as ProviderId;
      const modelId = inputModelId ?? session.modelId;

      // Create credential resolver
      const credentialResolver = new CredentialResolver(userId, providerId);

      // Check if user has code execution permission
      // For improvement cycles, we generally need code execution
      const canExecuteCode = true; // Improvement cycles typically need full tool access

      console.log(`[ImprovementCycle] Starting decomposed improvement cycle: ${description}`);

      // Run the decomposed improvement cycle
      const result = await ImprovementCycleDecomposer.run({
        db: context.db,
        projectId,
        projectPath,
        parentSessionId: sessionId,
        userId,
        canExecuteCode,
        taskDescription: description,
        credentialResolver,
        providerId,
        modelId,
        abortSignal,
        onEvent: async (event) => {
          // Forward events to parent session if needed
          console.log(`[ImprovementCycle] Phase event: ${event.type}`);
        },
      });

      // Format result for display
      let output = `# Improvement Cycle Results\n\n`;
      output += `**Task:** ${description}\n`;
      output += `**Status:** ${result.success ? "✅ SUCCESS" : "❌ FAILED"}\n`;
      output += `**Phases Completed:** ${Object.keys(result.phaseResults).length}/3\n`;
      output += `**Total Cost:** $${result.totalCost.toFixed(4)}\n`;
      output += `**Total Tokens:** ${result.totalUsage.inputTokens + result.totalUsage.outputTokens}\n\n`;

      output += `## Summary\n${result.summary}\n\n`;

      // Add phase details
      output += `## Phase Details\n\n`;
      for (const [phaseName, phaseResult] of Object.entries(result.phaseResults)) {
        output += `### ${phaseName.toUpperCase()} Phase\n`;
        output += `- **Status:** ${phaseResult.success ? "✅ SUCCESS" : "❌ FAILED"}\n`;
        output += `- **Session:** ${phaseResult.sessionId}\n`;
        output += `- **Summary:** ${phaseResult.summary}\n`;
        if (phaseResult.usage) {
          output += `- **Tokens:** ${phaseResult.usage.inputTokens + phaseResult.usage.outputTokens}\n`;
        }
        if (phaseResult.cost) {
          output += `- **Cost:** $${phaseResult.cost.toFixed(4)}\n`;
        }
        if (phaseResult.error) {
          output += `- **Error:** ${phaseResult.error}\n`;
        }
        output += "\n";
      }

      // Add session links for easy access
      output += `## Session Links\n`;
      for (const sessionId of result.sessionIds) {
        output += `- [Session ${sessionId}](/sessions/${sessionId})\n`;
      }

      return output;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error("[ImprovementCycle] Error:", errorMessage);
      
      return `❌ **Improvement Cycle Failed**\n\nError: ${errorMessage}\n\nThe improvement cycle could not be completed. Please check the error details and try again.`;
    }
  },
};