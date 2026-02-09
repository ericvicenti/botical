/**
 * Agent Configuration (YAML-based)
 *
 * Manages custom agents stored as YAML files in agents/{name}/agent.yaml
 * Agents define AI assistant configurations with custom prompts, tools, and settings.
 */

import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import {
  loadYamlFileWithSchema,
  loadYamlDir,
  saveYamlFile,
  deleteYamlFile,
  yamlFileExists,
  getBoticalPaths,
} from "./yaml.ts";
import type { CustomAgent, AgentMode } from "@/services/agents.ts";

// ============================================================================
// YAML Schema
// ============================================================================

/**
 * Agent YAML schema for validation
 */
export const AgentYamlSchema = z.object({
  // name is inferred from filename
  description: z.string().max(500).nullable().optional(),
  mode: z.enum(["primary", "subagent", "all"]).default("subagent"),
  hidden: z.boolean().default(false),
  providerId: z.string().nullable().optional(),
  modelId: z.string().nullable().optional(),
  temperature: z.number().min(0).max(2).nullable().optional(),
  topP: z.number().min(0).max(1).nullable().optional(),
  maxSteps: z.number().positive().nullable().optional(),
  prompt: z.string().nullable().optional(),
  tools: z.array(z.string()).default([]),
  options: z.record(z.unknown()).default({}),
  color: z.string().nullable().optional(),
});

export type AgentYaml = z.infer<typeof AgentYamlSchema>;

// ============================================================================
// Conversion Functions
// ============================================================================

/**
 * Convert YAML agent to CustomAgent entity
 */
function yamlToAgent(
  name: string,
  yaml: z.input<typeof AgentYamlSchema>
): CustomAgent {
  const now = Date.now();
  return {
    id: `agent_yaml_${name}`,
    name,
    description: yaml.description ?? null,
    mode: (yaml.mode ?? "subagent") as AgentMode,
    hidden: yaml.hidden ?? false,
    providerId: yaml.providerId ?? null,
    modelId: yaml.modelId ?? null,
    temperature: yaml.temperature ?? null,
    topP: yaml.topP ?? null,
    maxSteps: yaml.maxSteps ?? null,
    prompt: yaml.prompt ?? null,
    tools: yaml.tools ?? [],
    options: yaml.options ?? {},
    color: yaml.color ?? null,
    isBuiltin: false,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Convert CustomAgent entity to YAML format
 */
function agentToYaml(agent: CustomAgent): AgentYaml {
  return {
    description: agent.description ?? undefined,
    mode: agent.mode,
    hidden: agent.hidden,
    providerId: agent.providerId ?? undefined,
    modelId: agent.modelId ?? undefined,
    temperature: agent.temperature ?? undefined,
    topP: agent.topP ?? undefined,
    maxSteps: agent.maxSteps ?? undefined,
    prompt: agent.prompt ?? undefined,
    tools: agent.tools,
    options: agent.options,
    color: agent.color ?? undefined,
  };
}

// ============================================================================
// Agent YAML Service
// ============================================================================

/**
 * YAML-based Agent Configuration Service
 *
 * Reads and writes agent definitions from YAML files.
 * Agents are stored in .botical/agents/{name}.yaml
 */
export const AgentYamlService = {
  /**
   * Get agent file path
   */
  getPath(projectPath: string, name: string): string {
    return getBoticalPaths(projectPath).agent(name);
  },

  /**
   * Check if an agent exists
   */
  exists(projectPath: string, name: string): boolean {
    return fs.existsSync(this.getPath(projectPath, name));
  },

  /**
   * Get agent by name
   */
  getByName(projectPath: string, name: string): CustomAgent | null {
    const filePath = this.getPath(projectPath, name);
    const yaml = loadYamlFileWithSchema(filePath, AgentYamlSchema, {
      optional: true,
    });
    if (!yaml) return null;
    return yamlToAgent(name, yaml);
  },

  /**
   * List all agents in a project
   */
  list(projectPath: string): CustomAgent[] {
    const agentsDir = getBoticalPaths(projectPath).agents;
    const agents: CustomAgent[] = [];

    if (!fs.existsSync(agentsDir)) return agents;

    const entries = fs.readdirSync(agentsDir);
    for (const entry of entries) {
      const agentYamlPath = path.join(agentsDir, entry, "agent.yaml");
      if (fs.existsSync(agentYamlPath) && fs.statSync(path.join(agentsDir, entry)).isDirectory()) {
        try {
          const yaml = loadYamlFileWithSchema(agentYamlPath, AgentYamlSchema, { optional: false });
          if (yaml) {
            agents.push(yamlToAgent(entry, yaml));
          }
        } catch (error) {
          console.error(`Failed to parse agent ${entry}:`, error);
        }
      }
    }

    return agents.sort((a, b) => a.name.localeCompare(b.name));
  },

  /**
   * Create or update an agent
   */
  save(projectPath: string, agent: CustomAgent): void {
    const filePath = this.getPath(projectPath, agent.name);
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const yaml = agentToYaml(agent);
    saveYamlFile(filePath, yaml);
  },

  /**
   * Delete an agent
   */
  delete(projectPath: string, name: string): boolean {
    const agentDir = path.join(getBoticalPaths(projectPath).agents, name);
    if (fs.existsSync(agentDir)) {
      fs.rmSync(agentDir, { recursive: true });
      return true;
    }
    return deleteYamlFile(this.getPath(projectPath, name));
  },

  /**
   * Count agents in a project
   */
  count(projectPath: string): number {
    return this.list(projectPath).length;
  },
};
