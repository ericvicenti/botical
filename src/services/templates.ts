/**
 * Template Service
 *
 * Manages task templates stored in .iris/templates/ directory.
 * Templates define agent configuration, tools, and system prompts for tasks.
 */

import { z } from "zod";
import * as yaml from "yaml";
import * as fs from "node:fs/promises";
import * as path from "node:path";

/**
 * Template metadata schema (YAML frontmatter)
 */
export const TaskTemplateMetadataSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  agentClass: z.string().default("medium"),
  tools: z.array(z.string()).optional(),
});

export type TaskTemplateMetadata = z.infer<typeof TaskTemplateMetadataSchema>;

/**
 * Full template including system prompt
 */
export interface TaskTemplate extends TaskTemplateMetadata {
  id: string;
  systemPrompt: string;
  filePath: string;
}

/**
 * Template summary for listing
 */
export interface TaskTemplateSummary {
  id: string;
  name: string;
  description?: string;
  agentClass: string;
}

const TEMPLATES_DIR = ".iris/templates";

/**
 * Parse a template file content (YAML frontmatter + markdown body)
 */
function parseTemplateContent(content: string, id: string, filePath: string): TaskTemplate {
  // Split by --- markers
  const parts = content.split(/^---$/m);

  let frontmatter: Record<string, unknown> = {};
  let systemPrompt = "";

  const firstPart = parts[0] ?? "";
  const secondPart = parts[1] ?? "";

  if (parts.length >= 3 && firstPart.trim() === "") {
    // Has frontmatter: empty string, yaml, body
    try {
      frontmatter = yaml.parse(secondPart) || {};
    } catch {
      frontmatter = {};
    }
    systemPrompt = parts.slice(2).join("---").trim();
  } else if (parts.length === 2 && firstPart.trim() === "") {
    // Has frontmatter but no body
    try {
      frontmatter = yaml.parse(secondPart) || {};
    } catch {
      frontmatter = {};
    }
    systemPrompt = "";
  } else {
    // No frontmatter, entire content is system prompt
    systemPrompt = content.trim();
  }

  const metadata = TaskTemplateMetadataSchema.parse({
    name: frontmatter.name || id,
    description: frontmatter.description,
    agentClass: frontmatter.agentClass || "medium",
    tools: frontmatter.tools,
  });

  return {
    ...metadata,
    id,
    systemPrompt,
    filePath,
  };
}

/**
 * Serialize a template to file content
 */
function serializeTemplate(template: Omit<TaskTemplate, "id" | "filePath">): string {
  const frontmatter: Record<string, unknown> = {
    name: template.name,
  };

  if (template.description) {
    frontmatter.description = template.description;
  }

  if (template.agentClass !== "medium") {
    frontmatter.agentClass = template.agentClass;
  }

  if (template.tools && template.tools.length > 0) {
    frontmatter.tools = template.tools;
  }

  const yamlContent = yaml.stringify(frontmatter).trim();

  if (template.systemPrompt) {
    return `---\n${yamlContent}\n---\n${template.systemPrompt}`;
  }

  return `---\n${yamlContent}\n---`;
}

/**
 * Template Service
 */
export class TemplateService {
  /**
   * List all templates for a project
   */
  static async list(projectPath: string): Promise<TaskTemplateSummary[]> {
    const templatesDir = path.join(projectPath, TEMPLATES_DIR);

    try {
      const entries = await fs.readdir(templatesDir, { withFileTypes: true });
      const templates: TaskTemplateSummary[] = [];

      for (const entry of entries) {
        if (!entry.isFile()) continue;
        if (!entry.name.endsWith(".yaml") && !entry.name.endsWith(".yml")) continue;

        const id = entry.name.replace(/\.(yaml|yml)$/, "");
        const filePath = path.join(templatesDir, entry.name);

        try {
          const content = await fs.readFile(filePath, "utf-8");
          const template = parseTemplateContent(content, id, filePath);
          templates.push({
            id: template.id,
            name: template.name,
            description: template.description,
            agentClass: template.agentClass,
          });
        } catch {
          // Skip invalid templates
        }
      }

      return templates.sort((a, b) => a.name.localeCompare(b.name));
    } catch {
      // Directory doesn't exist - return empty list
      return [];
    }
  }

  /**
   * Get a single template by ID
   */
  static async get(projectPath: string, templateId: string): Promise<TaskTemplate | null> {
    const templatesDir = path.join(projectPath, TEMPLATES_DIR);

    // Try both .yaml and .yml extensions
    for (const ext of [".yaml", ".yml"]) {
      const filePath = path.join(templatesDir, templateId + ext);
      try {
        const content = await fs.readFile(filePath, "utf-8");
        return parseTemplateContent(content, templateId, filePath);
      } catch {
        // Continue to next extension
      }
    }

    return null;
  }

  /**
   * Create a new template
   */
  static async create(
    projectPath: string,
    templateId: string,
    data: {
      name: string;
      description?: string;
      agentClass?: string;
      tools?: string[];
      systemPrompt?: string;
    }
  ): Promise<TaskTemplate> {
    const templatesDir = path.join(projectPath, TEMPLATES_DIR);

    // Ensure directory exists
    await fs.mkdir(templatesDir, { recursive: true });

    const filePath = path.join(templatesDir, templateId + ".yaml");

    // Check if template already exists
    try {
      await fs.access(filePath);
      throw new Error(`Template "${templateId}" already exists`);
    } catch (err) {
      if (err instanceof Error && err.message.includes("already exists")) {
        throw err;
      }
      // File doesn't exist - good to proceed
    }

    const content = serializeTemplate({
      name: data.name,
      description: data.description,
      agentClass: data.agentClass || "medium",
      tools: data.tools,
      systemPrompt: data.systemPrompt || "",
    });

    await fs.writeFile(filePath, content, "utf-8");

    return parseTemplateContent(content, templateId, filePath);
  }

  /**
   * Update an existing template
   */
  static async update(
    projectPath: string,
    templateId: string,
    data: {
      name?: string;
      description?: string;
      agentClass?: string;
      tools?: string[];
      systemPrompt?: string;
    }
  ): Promise<TaskTemplate> {
    const existing = await this.get(projectPath, templateId);
    if (!existing) {
      throw new Error(`Template "${templateId}" not found`);
    }

    const updated: Omit<TaskTemplate, "id" | "filePath"> = {
      name: data.name ?? existing.name,
      description: data.description ?? existing.description,
      agentClass: data.agentClass ?? existing.agentClass,
      tools: data.tools ?? existing.tools,
      systemPrompt: data.systemPrompt ?? existing.systemPrompt,
    };

    const content = serializeTemplate(updated);
    await fs.writeFile(existing.filePath, content, "utf-8");

    return parseTemplateContent(content, templateId, existing.filePath);
  }

  /**
   * Delete a template
   */
  static async delete(projectPath: string, templateId: string): Promise<void> {
    const existing = await this.get(projectPath, templateId);
    if (!existing) {
      throw new Error(`Template "${templateId}" not found`);
    }

    await fs.unlink(existing.filePath);
  }

  /**
   * Create the .iris/templates directory if it doesn't exist
   */
  static async ensureTemplatesDir(projectPath: string): Promise<string> {
    const templatesDir = path.join(projectPath, TEMPLATES_DIR);
    await fs.mkdir(templatesDir, { recursive: true });
    return templatesDir;
  }

  /**
   * Create a default template if none exist
   */
  static async createDefaultIfEmpty(projectPath: string): Promise<void> {
    const templates = await this.list(projectPath);
    if (templates.length > 0) return;

    await this.create(projectPath, "default", {
      name: "Default",
      description: "General purpose assistant",
      agentClass: "medium",
      systemPrompt: "You are a helpful AI assistant. Help the user with their request.",
    });
  }
}
