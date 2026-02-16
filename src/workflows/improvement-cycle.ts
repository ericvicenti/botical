/**
 * Improvement Cycle Workflow
 * 
 * Implements sub-task decomposition for Leopard improvement cycles.
 * Breaks the cycle into separate focused sessions instead of one long session.
 * 
 * Phases:
 * 1. Planning Session: Read priorities, analyze changelog, select task
 * 2. Implementation Session: Code the selected task
 * 3. Verification Session: Test and deploy if tests pass
 * 
 * Each phase runs in a fresh session with focused context, preventing
 * context bloat and improving efficiency.
 * 
 * See: PRIORITIES.md - Context Management Priority #3
 */

import type { WorkflowDefinition } from "@/workflows/types.ts";

/**
 * Improvement cycle workflow definition
 */
export const IMPROVEMENT_CYCLE_WORKFLOW: WorkflowDefinition = {
  id: "improvement-cycle",
  name: "Leopard Improvement Cycle",
  description: "Decomposed improvement cycle with separate planning, implementation, and verification sessions",
  version: "1.0.0",
  
  input: {
    type: "object",
    properties: {
      projectId: {
        type: "string",
        description: "Project ID for the improvement cycle"
      },
      userId: {
        type: "string", 
        description: "User ID triggering the cycle"
      },
      providerId: {
        type: "string",
        description: "LLM provider to use",
        default: "anthropic-oauth"
      },
      modelId: {
        type: "string",
        description: "Model to use for sessions",
        default: "claude-3-5-sonnet-20241022"
      }
    },
    required: ["projectId", "userId"]
  },

  steps: [
    // Phase 1: Planning Session
    {
      id: "planning",
      name: "Planning Phase",
      type: "session",
      agent: "leopard",
      systemPrompt: `You are Leopard 🐆, in PLANNING mode for an improvement cycle.

Your task: Analyze priorities and select the next task to work on.

Process:
1. Read PRIORITIES.md to understand current goals
2. Read CHANGELOG-AUTO.md to see recent work  
3. Select the highest priority unfinished item
4. Create a focused implementation plan
5. Output a structured summary for the next phase

Be concise and focused. This is just planning - don't implement anything yet.
End with a clear summary of what should be implemented next.`,
      
      message: "Start planning phase. Read PRIORITIES.md and CHANGELOG-AUTO.md, then select the highest priority task and create an implementation plan.",
      
      maxSteps: 10,
      
      config: {
        providerId: "{{ input.providerId }}",
        modelId: "{{ input.modelId }}"
      }
    },

    // Phase 2: Implementation Session  
    {
      id: "implementation",
      name: "Implementation Phase",
      type: "session",
      agent: "leopard",
      systemPrompt: `You are Leopard 🐆, in IMPLEMENTATION mode for an improvement cycle.

Your task: Implement the selected task from the planning phase.

Context from planning: {{ steps.planning.response }}

Process:
1. Focus on implementing the planned task
2. Make small, incremental changes
3. Follow the established patterns and code quality rules
4. Don't run tests yet - that's for the verification phase
5. Commit your changes with a descriptive message

Be focused and efficient. Implement only what was planned.
End by committing your changes and summarizing what was implemented.`,
      
      message: "Implement the task selected in planning phase: {{ steps.planning.response }}",
      
      maxSteps: 15,
      
      config: {
        providerId: "{{ input.providerId }}",
        modelId: "{{ input.modelId }}"
      },
      
      dependsOn: ["planning"]
    },

    // Phase 3: Verification Session
    {
      id: "verification", 
      name: "Verification Phase",
      type: "session",
      agent: "leopard", 
      systemPrompt: `You are Leopard 🐆, in VERIFICATION mode for an improvement cycle.

Your task: Test and deploy the implemented changes.

Implementation summary: {{ steps.implementation.response }}

Process:
1. Run the full test suite: bun test tests/unit/ tests/integration/
2. If tests pass: push changes to trigger auto-deployment
3. If tests fail: fix issues or revert changes
4. Update CHANGELOG-AUTO.md with what was accomplished
5. Update PRIORITIES.md (mark items done, add discoveries)

Be thorough with testing. Only deploy if tests pass.
End with a summary of the cycle results.`,
      
      message: "Verify and deploy the implementation: {{ steps.implementation.response }}",
      
      maxSteps: 10,
      
      config: {
        providerId: "{{ input.providerId }}",
        modelId: "{{ input.modelId }}"
      },
      
      dependsOn: ["implementation"]
    }
  ],

  output: {
    type: "object",
    properties: {
      planningResult: {
        type: "string",
        description: "Summary of planning phase"
      },
      implementationResult: {
        type: "string", 
        description: "Summary of implementation phase"
      },
      verificationResult: {
        type: "string",
        description: "Summary of verification phase"
      },
      success: {
        type: "boolean",
        description: "Whether the cycle completed successfully"
      }
    }
  }
};

/**
 * Register the improvement cycle workflow
 */
export function registerImprovementCycleWorkflow() {
  // This would be called during application startup
  // to register the workflow with the workflow service
  console.log("Improvement cycle workflow registered");
}