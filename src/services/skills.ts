/**
 * Skill Service
 *
 * Discovers and loads skills from the `skills/` directory in project workspaces.
 * Skills follow the agentskills.io specification with SKILL.md files containing
 * YAML frontmatter and markdown instructions.
 *
 * See: https://agentskills.io/specification
 */

import * as fs from "node:fs";
import * as path from "node:path";
import matter from "gray-matter";
import { z } from "zod";
import { getBoticalPaths } from "../config/yaml.ts";

// ============================================================================
// Constants
// ============================================================================

const SKILLS_DIR = "skills";
const SKILL_FILE = "SKILL.md";

// ============================================================================
// Schemas
// ============================================================================

/**
 * SKILL.md frontmatter schema (agentskills.io specification)
 *
 * Required fields:
 * - name: 1-64 chars, lowercase letters, numbers, and hyphens only
 * - description: 1-1024 chars, explains what the skill does and when to use it
 *
 * Optional fields:
 * - license: License name or reference
 * - compatibility: Environment requirements (max 500 chars)
 * - metadata: Arbitrary key-value pairs
 * - allowed-tools: Space-delimited list of pre-approved tools
 */
export const SkillFrontmatterSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(64)
    .regex(
      /^[a-z][a-z0-9-]*[a-z0-9]$|^[a-z]$/,
      "Skill name must be 1-64 lowercase letters, numbers, and hyphens. Cannot start/end with hyphen or have consecutive hyphens."
    )
    .refine((name) => !name.includes("--"), {
      message: "Skill name cannot contain consecutive hyphens",
    }),
  description: z.string().min(1).max(1024),
  license: z.string().optional(),
  compatibility: z.string().max(500).optional(),
  metadata: z.record(z.string()).optional(),
  "allowed-tools": z.string().optional(),
});

export type SkillFrontmatter = z.infer<typeof SkillFrontmatterSchema>;

// ============================================================================
// Types
// ============================================================================

/**
 * Skill metadata (Level 1 - ~100 tokens)
 * Loaded at startup for all skills to enable discovery
 */
export interface SkillMetadata {
  name: string;
  description: string;
  path: string;
  license?: string;
  compatibility?: string;
  metadata?: Record<string, string>;
  allowedTools?: string[];
}

/**
 * Skill with full instructions (Level 2 - <5000 tokens recommended)
 * Loaded on demand when agent needs skill guidance
 */
export interface SkillWithInstructions extends SkillMetadata {
  instructions: string;
}

/**
 * Skill resource metadata (Level 3)
 * Resources are loaded on demand from scripts/references/assets
 */
export interface SkillResource {
  path: string;
  type: "script" | "reference" | "asset";
}

// ============================================================================
// Skill Service
// ============================================================================

/**
 * Service for discovering and loading skills from project workspaces.
 *
 * Skills are stored in `skills/` at the project root:
 * ```
 * skills/
 * └── skill-name/
 *     ├── SKILL.md          # Required
 *     ├── scripts/          # Optional executable code
 *     ├── references/       # Optional documentation
 *     └── assets/           # Optional templates/data
 * ```
 */
export const SkillService = {
  /**
   * Get the skills directory path for a project
   */
  getSkillsDir(projectPath: string): string {
    return path.join(projectPath, SKILLS_DIR);
  },

  /**
   * Check if a project has a skills directory
   */
  hasSkillsDir(projectPath: string): boolean {
    const skillsDir = this.getSkillsDir(projectPath);
    try {
      const stats = fs.statSync(skillsDir);
      return stats.isDirectory();
    } catch {
      return false;
    }
  },

  /**
   * List local skills in a project (from skills/ directory)
   *
   * Returns skill metadata (~100 tokens per skill) for efficient
   * loading at session startup.
   */
  listLocal(projectPath: string): SkillMetadata[] {
    const skillsDir = this.getSkillsDir(projectPath);

    if (!this.hasSkillsDir(projectPath)) {
      return [];
    }

    const skills: SkillMetadata[] = [];

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(skillsDir, { withFileTypes: true });
    } catch {
      return [];
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const skillPath = path.join(skillsDir, entry.name);
      const skillMdPath = path.join(skillPath, SKILL_FILE);

      if (!fs.existsSync(skillMdPath)) continue;

      try {
        const metadata = this.parseMetadata(skillMdPath, skillPath, entry.name);
        if (metadata) {
          skills.push(metadata);
        }
      } catch (error) {
        console.error(`Failed to parse skill ${entry.name}:`, error);
      }
    }

    return skills.sort((a, b) => a.name.localeCompare(b.name));
  },

  /**
   * List all skills in a project (local + installed from GitHub)
   *
   * Merges local skills with installed skills. Local skills take
   * precedence for name conflicts.
   */
  list(projectPath: string): SkillMetadata[] {
    // Import dynamically to avoid circular dependency
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { GitHubSkillService } = require("./github-skills.ts");

    // Get local skills
    const localSkills = this.listLocal(projectPath);

    // Get installed skills from GitHub repos
    const installedSkills = GitHubSkillService.getInstalledSkills(projectPath);

    // Merge with local taking precedence
    const skillMap = new Map<string, SkillMetadata>();

    // Add installed first (lower priority)
    for (const skill of installedSkills) {
      skillMap.set(skill.name, skill);
    }

    // Add local skills (higher priority - overwrite)
    for (const skill of localSkills) {
      skillMap.set(skill.name, skill);
    }

    return Array.from(skillMap.values()).sort((a, b) =>
      a.name.localeCompare(b.name)
    );
  },

  /**
   * Get a skill by name with full instructions (Level 2)
   *
   * Returns the complete SKILL.md content including instructions.
   * Checks local skills first, then installed skills.
   */
  getByName(projectPath: string, skillName: string): SkillWithInstructions | null {
    // Check local skills first
    const localSkill = this.getSkillFromDir(
      this.getSkillsDir(projectPath),
      skillName
    );
    if (localSkill) {
      return localSkill;
    }

    // Check installed skills
    const installedSkillsDir = getBoticalPaths(projectPath).skills;
    if (fs.existsSync(installedSkillsDir)) {
      // Search through all installed repos for the skill
      const owners = fs.readdirSync(installedSkillsDir, { withFileTypes: true });
      for (const owner of owners) {
        if (!owner.isDirectory()) continue;
        const ownerPath = path.join(installedSkillsDir, owner.name);
        const repos = fs.readdirSync(ownerPath, { withFileTypes: true });
        for (const repo of repos) {
          if (!repo.isDirectory()) continue;
          const repoPath = path.join(ownerPath, repo.name);
          const skill = this.findSkillInDir(repoPath, skillName);
          if (skill) {
            return skill;
          }
        }
      }
    }

    return null;
  },

  /**
   * Get a skill from a specific skills directory
   */
  getSkillFromDir(skillsDir: string, skillName: string): SkillWithInstructions | null {
    const skillPath = path.join(skillsDir, skillName);
    const skillMdPath = path.join(skillPath, SKILL_FILE);

    if (!fs.existsSync(skillMdPath)) {
      return null;
    }

    return this.loadSkillFromPath(skillPath, skillMdPath, skillName);
  },

  /**
   * Recursively find a skill by name in a directory
   */
  findSkillInDir(dir: string, skillName: string): SkillWithInstructions | null {
    if (!fs.existsSync(dir)) {
      return null;
    }

    // Check if this directory is the skill
    const skillMdPath = path.join(dir, SKILL_FILE);
    if (fs.existsSync(skillMdPath)) {
      const directoryName = path.basename(dir);
      if (directoryName === skillName) {
        return this.loadSkillFromPath(dir, skillMdPath, skillName);
      }
      return null; // Don't recurse into skill directories
    }

    // Search subdirectories
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return null;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith(".")) continue;

      const result = this.findSkillInDir(path.join(dir, entry.name), skillName);
      if (result) {
        return result;
      }
    }

    return null;
  },

  /**
   * Load skill data from a path
   */
  loadSkillFromPath(
    skillPath: string,
    skillMdPath: string,
    skillName: string
  ): SkillWithInstructions | null {
    try {
      const content = fs.readFileSync(skillMdPath, "utf-8");
      const parsed = matter(content);

      const frontmatterResult = SkillFrontmatterSchema.safeParse(parsed.data);
      if (!frontmatterResult.success) {
        console.error(
          `Invalid skill frontmatter for ${skillName}:`,
          frontmatterResult.error.format()
        );
        return null;
      }

      const fm = frontmatterResult.data;

      // Validate name matches directory
      if (fm.name !== skillName) {
        console.error(
          `Skill name "${fm.name}" does not match directory name "${skillName}"`
        );
        return null;
      }

      return {
        name: fm.name,
        description: fm.description,
        path: skillPath,
        license: fm.license,
        compatibility: fm.compatibility,
        metadata: fm.metadata,
        allowedTools: fm["allowed-tools"]?.split(/\s+/).filter(Boolean),
        instructions: parsed.content.trim(),
      };
    } catch (error) {
      console.error(`Failed to read skill ${skillName}:`, error);
      return null;
    }
  },

  /**
   * List resources for a skill (Level 3 metadata)
   *
   * Returns file paths in scripts/, references/, and assets/ directories.
   */
  listResources(projectPath: string, skillName: string): SkillResource[] {
    const skillsDir = this.getSkillsDir(projectPath);
    const skillPath = path.join(skillsDir, skillName);

    if (!fs.existsSync(skillPath)) {
      return [];
    }

    const resources: SkillResource[] = [];
    const subDirs: Array<{ name: string; type: SkillResource["type"] }> = [
      { name: "scripts", type: "script" },
      { name: "references", type: "reference" },
      { name: "assets", type: "asset" },
    ];

    for (const { name: subDir, type } of subDirs) {
      const dirPath = path.join(skillPath, subDir);
      if (!fs.existsSync(dirPath)) continue;

      try {
        this.collectFiles(dirPath, subDir, type, resources);
      } catch (error) {
        console.error(`Failed to list resources in ${dirPath}:`, error);
      }
    }

    return resources;
  },

  /**
   * Get resource content (Level 3)
   *
   * Reads a specific resource file from a skill.
   * Includes path traversal protection.
   */
  getResource(
    projectPath: string,
    skillName: string,
    resourcePath: string
  ): string | null {
    const skillsDir = this.getSkillsDir(projectPath);
    const skillPath = path.join(skillsDir, skillName);
    const fullPath = path.join(skillPath, resourcePath);

    // Security: Ensure path doesn't escape skill directory
    const normalizedPath = path.normalize(fullPath);
    const normalizedSkillPath = path.normalize(skillPath);
    if (!normalizedPath.startsWith(normalizedSkillPath + path.sep)) {
      console.error(
        `Security: Attempted path traversal in skill resource: ${resourcePath}`
      );
      return null;
    }

    // Only allow files in scripts/, references/, or assets/
    const allowedPrefixes = ["scripts/", "references/", "assets/"];
    const normalizedResourcePath = resourcePath.replace(/\\/g, "/");
    if (!allowedPrefixes.some((prefix) => normalizedResourcePath.startsWith(prefix))) {
      console.error(
        `Resource path must start with scripts/, references/, or assets/: ${resourcePath}`
      );
      return null;
    }

    if (!fs.existsSync(fullPath)) {
      return null;
    }

    try {
      return fs.readFileSync(fullPath, "utf-8");
    } catch (error) {
      console.error(`Failed to read resource ${resourcePath}:`, error);
      return null;
    }
  },

  // ============================================================================
  // Internal Helpers
  // ============================================================================

  /**
   * Parse metadata from SKILL.md frontmatter
   */
  parseMetadata(
    skillMdPath: string,
    skillPath: string,
    directoryName: string
  ): SkillMetadata | null {
    const content = fs.readFileSync(skillMdPath, "utf-8");
    const parsed = matter(content);

    const result = SkillFrontmatterSchema.safeParse(parsed.data);
    if (!result.success) {
      console.error(
        `Invalid frontmatter in ${skillMdPath}:`,
        result.error.format()
      );
      return null;
    }

    const fm = result.data;

    // Validate name matches directory
    if (fm.name !== directoryName) {
      console.error(
        `Skill name "${fm.name}" does not match directory name "${directoryName}" in ${skillMdPath}`
      );
      return null;
    }

    return {
      name: fm.name,
      description: fm.description,
      path: skillPath,
      license: fm.license,
      compatibility: fm.compatibility,
      metadata: fm.metadata,
      allowedTools: fm["allowed-tools"]?.split(/\s+/).filter(Boolean),
    };
  },

  /**
   * Recursively collect files from a directory
   */
  collectFiles(
    dirPath: string,
    relativePath: string,
    type: SkillResource["type"],
    resources: SkillResource[]
  ): void {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const entryRelativePath = path.join(relativePath, entry.name);

      if (entry.isDirectory()) {
        this.collectFiles(
          path.join(dirPath, entry.name),
          entryRelativePath,
          type,
          resources
        );
      } else if (entry.isFile()) {
        resources.push({
          path: entryRelativePath.replace(/\\/g, "/"),
          type,
        });
      }
    }
  },
};
