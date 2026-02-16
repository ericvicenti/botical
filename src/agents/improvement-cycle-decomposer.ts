/**
 * Improvement Cycle Decomposer
 * 
 * Automatically decomposes long improvement cycles into focused sub-sessions:
 * 1. Plan phase - Analyze priorities and create implementation plan
 * 2. Implement phase - Execute the planned changes
 * 3. Verify phase - Test changes and deploy if successful
 * 
 * Each phase runs in a fresh context to prevent context bloat while
 * passing structured summaries between phases.
 */

import type { Database } from "bun:sqlite";
import type { ProviderId } from "./types.ts";
import { SessionService } from "@/services/sessions.ts";
import { MessageService, MessagePartService } from "@/services/messages.ts";
import { AgentOrchestrator } from "./orchestrator.ts";
import type { CredentialResolver } from "./credential-resolver.ts";
import type { ProcessedEvent } from "./stream-processor.ts";
import { extractTextContent } from "@/services/message-content.ts";

/**
 * Phases of an improvement cycle
 */
export type ImprovementPhase = "plan" | "implement" | "verify";

/**
 * Context passed between improvement cycle phases
 */
export interface ImprovementContext {
  /** Original task description */
  originalTask: string;
  /** Current phase */
  phase: ImprovementPhase;
  /** Results from previous phases */
  phaseResults: Record<string, PhaseResult>;
  /** Priority information from PRIORITIES.md */
  priorities?: string;
  /** Recent changelog entries */
  changelog?: string;
  /** Files modified in this cycle */
  modifiedFiles?: string[];
  /** Test results from previous phases */
  testResults?: string;
}

/**
 * Result from a single phase
 */
export interface PhaseResult {
  /** Phase that produced this result */
  phase: ImprovementPhase;
  /** Session ID where this phase ran */
  sessionId: string;
  /** Success status */
  success: boolean;
  /** Summary of what was accomplished */
  summary: string;
  /** Key outputs for next phase */
  outputs: Record<string, unknown>;
  /** Error message if failed */
  error?: string;
  /** Token usage for this phase */
  usage?: { inputTokens: number; outputTokens: number };
  /** Cost for this phase */
  cost?: number;
}

/**
 * Options for running an improvement cycle
 */
export interface ImprovementCycleOptions {
  /** Database connection */
  db: Database;
  /** Project ID */
  projectId: string;
  /** Project filesystem path */
  projectPath: string;
  /** Parent session ID */
  parentSessionId: string;
  /** User ID */
  userId: string;
  /** Whether user has code execution permission */
  canExecuteCode: boolean;
  /** Original improvement task description */
  taskDescription: string;
  /** Credential resolver for API keys */
  credentialResolver: CredentialResolver;
  /** Provider ID */
  providerId: ProviderId;
  /** Model ID */
  modelId?: string | null;
  /** Abort signal */
  abortSignal?: AbortSignal;
  /** Event callback */
  onEvent?: (event: ProcessedEvent) => void | Promise<void>;
}

/**
 * Result from running an improvement cycle
 */
export interface ImprovementCycleResult {
  /** Success status */
  success: boolean;
  /** Summary of the entire cycle */
  summary: string;
  /** Results from each phase */
  phaseResults: Record<string, PhaseResult>;
  /** Session IDs for each phase */
  sessionIds: string[];
  /** Total usage across all phases */
  totalUsage: { inputTokens: number; outputTokens: number };
  /** Total cost across all phases */
  totalCost: number;
  /** Error message if failed */
  error?: string;
}

/**
 * Improvement Cycle Decomposer
 */
export class ImprovementCycleDecomposer {
  /**
   * Run a decomposed improvement cycle
   */
  static async run(options: ImprovementCycleOptions): Promise<ImprovementCycleResult> {
    const {
      db,
      projectId,
      projectPath,
      parentSessionId,
      userId,
      canExecuteCode,
      taskDescription,
      credentialResolver,
      providerId,
      modelId,
      abortSignal,
      onEvent,
    } = options;

    const phaseResults: Record<string, PhaseResult> = {};
    const sessionIds: string[] = [];
    let totalUsage = { inputTokens: 0, outputTokens: 0 };
    let totalCost = 0;

    try {
      // Initialize improvement context
      let context: ImprovementContext = {
        originalTask: taskDescription,
        phase: "plan",
        phaseResults: {},
      };

      // Phase 1: Plan
      console.log("[ImprovementCycle] Starting PLAN phase");
      const planResult = await this.runPhase({
        ...options,
        phase: "plan",
        context,
        systemPrompt: this.getPlanPhasePrompt(),
      });

      phaseResults.plan = planResult;
      sessionIds.push(planResult.sessionId);
      totalUsage.inputTokens += planResult.usage?.inputTokens ?? 0;
      totalUsage.outputTokens += planResult.usage?.outputTokens ?? 0;
      totalCost += planResult.cost ?? 0;

      if (!planResult.success) {
        return {
          success: false,
          summary: `Improvement cycle failed in PLAN phase: ${planResult.error}`,
          phaseResults,
          sessionIds,
          totalUsage,
          totalCost,
          error: planResult.error,
        };
      }

      // Update context for implement phase
      context = {
        ...context,
        phase: "implement",
        phaseResults,
        priorities: planResult.outputs.priorities as string,
        changelog: planResult.outputs.changelog as string,
      };

      // Phase 2: Implement
      console.log("[ImprovementCycle] Starting IMPLEMENT phase");
      const implementResult = await this.runPhase({
        ...options,
        phase: "implement",
        context,
        systemPrompt: this.getImplementPhasePrompt(),
      });

      phaseResults.implement = implementResult;
      sessionIds.push(implementResult.sessionId);
      totalUsage.inputTokens += implementResult.usage?.inputTokens ?? 0;
      totalUsage.outputTokens += implementResult.usage?.outputTokens ?? 0;
      totalCost += implementResult.cost ?? 0;

      if (!implementResult.success) {
        return {
          success: false,
          summary: `Improvement cycle failed in IMPLEMENT phase: ${implementResult.error}`,
          phaseResults,
          sessionIds,
          totalUsage,
          totalCost,
          error: implementResult.error,
        };
      }

      // Update context for verify phase
      context = {
        ...context,
        phase: "verify",
        phaseResults,
        modifiedFiles: implementResult.outputs.modifiedFiles as string[],
      };

      // Phase 3: Verify
      console.log("[ImprovementCycle] Starting VERIFY phase");
      const verifyResult = await this.runPhase({
        ...options,
        phase: "verify",
        context,
        systemPrompt: this.getVerifyPhasePrompt(),
      });

      phaseResults.verify = verifyResult;
      sessionIds.push(verifyResult.sessionId);
      totalUsage.inputTokens += verifyResult.usage?.inputTokens ?? 0;
      totalUsage.outputTokens += verifyResult.usage?.outputTokens ?? 0;
      totalCost += verifyResult.cost ?? 0;

      // Generate cycle summary
      const summary = this.generateCycleSummary(phaseResults);

      return {
        success: verifyResult.success,
        summary,
        phaseResults,
        sessionIds,
        totalUsage,
        totalCost,
        error: verifyResult.success ? undefined : verifyResult.error,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        summary: `Improvement cycle failed with unexpected error: ${errorMessage}`,
        phaseResults,
        sessionIds,
        totalUsage,
        totalCost,
        error: errorMessage,
      };
    }
  }

  /**
   * Run a single phase of the improvement cycle
   */
  private static async runPhase(options: {
    db: Database;
    projectId: string;
    projectPath: string;
    parentSessionId: string;
    userId: string;
    canExecuteCode: boolean;
    credentialResolver: CredentialResolver;
    providerId: ProviderId;
    modelId?: string | null;
    abortSignal?: AbortSignal;
    onEvent?: (event: ProcessedEvent) => void | Promise<void>;
    phase: ImprovementPhase;
    context: ImprovementContext;
    systemPrompt: string;
  }): Promise<PhaseResult> {
    const {
      db,
      projectId,
      projectPath,
      parentSessionId,
      userId,
      canExecuteCode,
      credentialResolver,
      providerId,
      modelId,
      abortSignal,
      onEvent,
      phase,
      context,
      systemPrompt,
    } = options;

    try {
      // Create child session for this phase
      const childSession = SessionService.create(db, {
        title: `${context.originalTask} - ${phase.toUpperCase()} phase`,
        agent: this.getPhaseAgent(phase),
        parentId: parentSessionId,
        providerId,
        modelId,
        systemPrompt,
      });

      // Build phase-specific prompt
      const phasePrompt = this.buildPhasePrompt(phase, context);

      // Run the phase using AgentOrchestrator
      const result = await AgentOrchestrator.run({
        db,
        projectId,
        projectPath,
        sessionId: childSession.id,
        userId,
        canExecuteCode,
        content: phasePrompt,
        credentialResolver,
        providerId,
        modelId,
        agentName: this.getPhaseAgent(phase),
        agentPrompt: systemPrompt,
        maxSteps: this.getPhaseMaxSteps(phase),
        abortSignal,
        onEvent,
      });

      // Extract response text
      const responseParts = MessagePartService.listByMessage(db, result.messageId);
      const textParts = responseParts.filter((p) => p.type === "text");
      const responseText = textParts
        .map((p) => extractTextContent(p.content))
        .join("");

      // Parse phase outputs from response
      const outputs = this.parsePhaseOutputs(phase, responseText);

      return {
        phase,
        sessionId: childSession.id,
        success: result.finishReason !== "error",
        summary: this.extractPhaseSummary(responseText),
        outputs,
        usage: result.usage,
        cost: result.cost,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        phase,
        sessionId: "",
        success: false,
        summary: `Phase ${phase} failed: ${errorMessage}`,
        outputs: {},
        error: errorMessage,
      };
    }
  }

  /**
   * Get agent type for each phase
   */
  private static getPhaseAgent(phase: ImprovementPhase): string {
    switch (phase) {
      case "plan":
        return "plan"; // Uses planning agent for analysis
      case "implement":
        return "default"; // Uses default agent with full tool access
      case "verify":
        return "default"; // Uses default agent for testing and deployment
    }
  }

  /**
   * Get max steps for each phase
   */
  private static getPhaseMaxSteps(phase: ImprovementPhase): number {
    switch (phase) {
      case "plan":
        return 8; // Planning should be focused and quick
      case "implement":
        return 15; // Implementation may need more steps
      case "verify":
        return 10; // Testing and deployment
    }
  }

  /**
   * Get system prompt for plan phase
   */
  private static getPlanPhasePrompt(): string {
    return `You are in the PLAN phase of an improvement cycle. Your job is to:

1. Read PRIORITIES.md to understand current priorities
2. Read CHANGELOG-AUTO.md to see recent work
3. Identify the highest priority unfinished item
4. Create a focused implementation plan

Be concise and specific. Focus on ONE clear task that can be completed in the next phases.

Output your plan in this format:
## SELECTED PRIORITY
[Brief description of the chosen priority]

## IMPLEMENTATION PLAN
[Step-by-step plan for implementation]

## FILES TO MODIFY
[List of files that will need changes]

## TESTING STRATEGY
[How to verify the implementation works]`;
  }

  /**
   * Get system prompt for implement phase
   */
  private static getImplementPhasePrompt(): string {
    return `You are in the IMPLEMENT phase of an improvement cycle. Your job is to:

1. Follow the implementation plan from the PLAN phase
2. Make the necessary code changes
3. Keep changes focused and incremental
4. Document what you've done

You have access to all tools. Make the changes step by step.

Output your results in this format:
## IMPLEMENTATION SUMMARY
[What was implemented]

## FILES MODIFIED
[List of files that were changed]

## KEY CHANGES
[Summary of the main changes made]

## READY FOR TESTING
[Brief note about what should be tested]`;
  }

  /**
   * Get system prompt for verify phase
   */
  private static getVerifyPhasePrompt(): string {
    return `You are in the VERIFY phase of an improvement cycle. Your job is to:

1. Run tests to verify the implementation works
2. Check that no regressions were introduced
3. Push changes to dev branch (NEVER push to main directly)
4. Update documentation (CHANGELOG-AUTO.md, PRIORITIES.md)

CRITICAL: Only push to dev branch. Never push directly to main.

Output your results in this format:
## TEST RESULTS
[Summary of test outcomes]

## VERIFICATION STATUS
[Whether the implementation is ready for deployment]

## DOCUMENTATION UPDATES
[What documentation was updated]

## NEXT STEPS
[What should happen next]`;
  }

  /**
   * Build phase-specific prompt with context
   */
  private static buildPhasePrompt(phase: ImprovementPhase, context: ImprovementContext): string {
    let prompt = `# Improvement Cycle - ${phase.toUpperCase()} Phase\n\n`;
    prompt += `**Original Task:** ${context.originalTask}\n\n`;

    // Add context from previous phases
    if (Object.keys(context.phaseResults).length > 0) {
      prompt += "## Previous Phase Results\n\n";
      for (const [phaseName, result] of Object.entries(context.phaseResults)) {
        prompt += `### ${phaseName.toUpperCase()} Phase\n`;
        prompt += `- Status: ${result.success ? "✅ SUCCESS" : "❌ FAILED"}\n`;
        prompt += `- Summary: ${result.summary}\n\n`;
      }
    }

    // Add phase-specific context
    if (phase === "implement" && context.priorities) {
      prompt += "## Priority Information\n";
      prompt += "```\n" + context.priorities + "\n```\n\n";
    }

    if (phase === "verify" && context.modifiedFiles) {
      prompt += "## Files Modified in Implementation\n";
      prompt += context.modifiedFiles.map(f => `- ${f}`).join("\n") + "\n\n";
    }

    prompt += `Now execute the ${phase.toUpperCase()} phase according to your instructions.`;

    return prompt;
  }

  /**
   * Parse outputs from phase response
   */
  private static parsePhaseOutputs(phase: ImprovementPhase, response: string): Record<string, unknown> {
    const outputs: Record<string, unknown> = {};

    if (phase === "plan") {
      // Extract priorities and changelog content if mentioned
      const prioritiesMatch = response.match(/PRIORITIES\.md[^]*?```([^]*?)```/);
      if (prioritiesMatch) {
        outputs.priorities = prioritiesMatch[1].trim();
      }

      const changelogMatch = response.match(/CHANGELOG-AUTO\.md[^]*?```([^]*?)```/);
      if (changelogMatch) {
        outputs.changelog = changelogMatch[1].trim();
      }
    }

    if (phase === "implement") {
      // Extract modified files list
      const filesMatch = response.match(/## FILES MODIFIED[^]*?(?=##|$)/);
      if (filesMatch) {
        const filesList = filesMatch[0]
          .split("\n")
          .filter(line => line.trim().startsWith("-") || line.trim().startsWith("*"))
          .map(line => line.replace(/^[-*]\s*/, "").trim())
          .filter(Boolean);
        outputs.modifiedFiles = filesList;
      }
    }

    if (phase === "verify") {
      // Extract test results
      const testMatch = response.match(/## TEST RESULTS[^]*?(?=##|$)/);
      if (testMatch) {
        outputs.testResults = testMatch[0].trim();
      }
    }

    return outputs;
  }

  /**
   * Extract summary from phase response
   */
  private static extractPhaseSummary(response: string): string {
    // Look for summary sections
    const summaryMatch = response.match(/## (?:IMPLEMENTATION SUMMARY|SUMMARY|PLAN)[^]*?(?=##|$)/);
    if (summaryMatch) {
      return summaryMatch[0].replace(/^## [^]*?\n/, "").trim();
    }

    // Fallback to first paragraph
    const firstParagraph = response.split("\n\n")[0];
    return firstParagraph.length > 200 
      ? firstParagraph.substring(0, 200) + "..."
      : firstParagraph;
  }

  /**
   * Generate overall cycle summary
   */
  private static generateCycleSummary(phaseResults: Record<string, PhaseResult>): string {
    const phases = ["plan", "implement", "verify"];
    const completedPhases = phases.filter(p => phaseResults[p]?.success);
    const failedPhases = phases.filter(p => phaseResults[p] && !phaseResults[p].success);

    let summary = `Improvement cycle completed ${completedPhases.length}/3 phases successfully.`;

    if (completedPhases.length === 3) {
      summary += " ✅ Full cycle completed successfully.";
    } else if (failedPhases.length > 0) {
      summary += ` ❌ Failed in ${failedPhases.join(", ")} phase(s).`;
    }

    // Add brief summary from each completed phase
    for (const phase of completedPhases) {
      const result = phaseResults[phase];
      if (result) {
        summary += `\n\n**${phase.toUpperCase()}:** ${result.summary}`;
      }
    }

    return summary;
  }
}