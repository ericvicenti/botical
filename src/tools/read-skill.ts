/**
 * Read Skill Tool
 *
 * Reads skill instructions and resources from the project's skills/ directory.
 * Skills follow the agentskills.io specification.
 * See: https://agentskills.io/specification
 */

import { z } from "zod";
import { defineTool } from "./types.ts";
import { SkillService } from "@/services/skills.ts";

export const readSkillTool = defineTool("read_skill", {
  description: `Read skill instructions or resources from the project's skills/ directory.

Use this tool to:
- Get detailed instructions for a specific skill
- Read script files from a skill's scripts/ folder
- Access reference documentation from references/
- Load templates or data from assets/

Skills provide step-by-step guidance for specialized tasks. When you see a skill
listed in your available skills, use this tool to load its instructions before
attempting the task.

Returns the skill's full instructions (SKILL.md body) or a specific resource file.`,

  parameters: z.object({
    name: z
      .string()
      .describe("The skill name (directory name in skills/)"),
    resource: z
      .string()
      .optional()
      .describe(
        "Optional: specific resource file path within the skill " +
          "(e.g., 'scripts/deploy.sh', 'references/api.md'). " +
          "If not provided, returns the main SKILL.md instructions."
      ),
  }),

  async execute(args, context) {
    const { name, resource } = args;

    // Get skill with instructions
    const skill = SkillService.getByName(context.projectPath, name);
    if (!skill) {
      return {
        title: `Skill not found: ${name}`,
        output: `No skill named "${name}" found in skills/ directory.\n\nTo see available skills, check the skills/ folder or the system prompt.`,
        success: false,
      };
    }

    // If requesting a specific resource
    if (resource) {
      const content = SkillService.getResource(
        context.projectPath,
        name,
        resource
      );
      if (content === null) {
        // List available resources to help
        const resources = SkillService.listResources(context.projectPath, name);
        const resourceList =
          resources.length > 0
            ? `\n\nAvailable resources:\n${resources.map((r) => `- ${r.path}`).join("\n")}`
            : "\n\nThis skill has no resources.";

        return {
          title: `Resource not found: ${resource}`,
          output: `Resource "${resource}" not found in skill "${name}".${resourceList}`,
          success: false,
        };
      }

      return {
        title: `${name}/${resource}`,
        output: content,
        metadata: {
          skillName: name,
          resourcePath: resource,
        },
        success: true,
      };
    }

    // Return skill instructions
    const resources = SkillService.listResources(context.projectPath, name);
    const resourceSection =
      resources.length > 0
        ? `\n\n---\n\n## Available Resources\n\nThis skill has the following resources you can read with \`read_skill\`:\n${resources.map((r) => `- \`${r.path}\` (${r.type})`).join("\n")}`
        : "";

    const allowedToolsSection = skill.allowedTools?.length
      ? `\n\n**Allowed tools:** ${skill.allowedTools.join(", ")}`
      : "";

    return {
      title: `Skill: ${skill.name}`,
      output: `# ${skill.name}\n\n${skill.description}${allowedToolsSection}\n\n---\n\n${skill.instructions}${resourceSection}`,
      metadata: {
        skillName: skill.name,
        allowedTools: skill.allowedTools,
        resourceCount: resources.length,
      },
      success: true,
    };
  },
});
