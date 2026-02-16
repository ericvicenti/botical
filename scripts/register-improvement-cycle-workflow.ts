#!/usr/bin/env bun
/**
 * Register Improvement Cycle Workflow
 * 
 * Creates the decomposed improvement cycle workflow in the Botical system.
 * This enables sub-task decomposition for Leopard improvement cycles.
 */

import { Database } from "bun:sqlite";
import { WorkflowService } from "../src/services/workflows.ts";
import { IMPROVEMENT_CYCLE_WORKFLOW } from "../src/workflows/improvement-cycle.ts";

const DEFAULT_PROJECT_ID = "prj_2go5oq0sa9o-51985ca1";
const DATA_DIR = process.env.HOME + "/.botical-prod";

async function registerWorkflow() {
  const projectDbPath = `${DATA_DIR}/projects/${DEFAULT_PROJECT_ID}/project.db`;
  
  try {
    const db = new Database(projectDbPath);
    
    // Check if workflow already exists
    const existing = WorkflowService.list(db, DEFAULT_PROJECT_ID)
      .find(w => w.name === "improvement-cycle");
    
    if (existing) {
      console.log("✅ Improvement cycle workflow already exists:", existing.id);
      return;
    }
    
    // Create the workflow
    const workflow = WorkflowService.create(db, DEFAULT_PROJECT_ID, {
      name: "improvement-cycle",
      label: "Leopard Improvement Cycle",
      description: "Decomposed improvement cycle with separate planning, implementation, and verification sessions",
      category: "agent",
      icon: "workflow",
      inputSchema: {
        fields: [
          {
            name: "projectId",
            type: "string",
            label: "Project ID",
            description: "Project ID for the improvement cycle",
            required: true
          },
          {
            name: "userId", 
            type: "string",
            label: "User ID",
            description: "User ID triggering the cycle",
            required: true
          },
          {
            name: "providerId",
            type: "string",
            label: "Provider ID",
            description: "LLM provider to use",
            required: false,
            default: "anthropic-oauth"
          },
          {
            name: "modelId",
            type: "string",
            label: "Model ID", 
            description: "Model to use for sessions",
            required: false,
            default: "claude-3-5-sonnet-20241022"
          }
        ]
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
      ]
    });
    
    console.log("✅ Created improvement cycle workflow:", workflow.id);
    console.log("📋 Workflow details:");
    console.log(`   Name: ${workflow.name}`);
    console.log(`   Label: ${workflow.label}`);
    console.log(`   Steps: ${workflow.steps.length}`);
    
    db.close();
    
  } catch (error) {
    console.error("❌ Failed to register workflow:", error);
    process.exit(1);
  }
}

// Run the registration
registerWorkflow().catch(console.error);