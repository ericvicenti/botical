/**
 * GitHub Skill Service
 *
 * Handles downloading and installing skills from GitHub repositories.
 * Skills are stored in `.botical/skills/<owner>/<repo>/` within the project.
 *
 * See: https://agentskills.io/specification
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { spawn } from "node:child_process";
import { getBoticalPaths } from "../config/yaml.ts";
import {
  ProjectConfigService,
  type InstalledSkillConfig,
} from "../config/project.ts";
import { SkillService, type SkillMetadata } from "./skills.ts";

// ============================================================================
// Constants
// ============================================================================

const REPO_PATTERN = /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/;
const SKILL_FILE = "SKILL.md";

// ============================================================================
// Types
// ============================================================================

/**
 * Result of skill installation
 */
export interface SkillInstallResult {
  success: boolean;
  skills: SkillMetadata[];
  error?: string;
}

/**
 * Installed skill with metadata from config
 */
export interface InstalledSkillInfo extends InstalledSkillConfig {
  path: string;
  skills: SkillMetadata[];
}

// ============================================================================
// GitHub Skill Service
// ============================================================================

/**
 * Service for installing and managing skills from GitHub repositories.
 */
export const GitHubSkillService = {
  /**
   * Validate a GitHub repo reference
   */
  isValidRepo(repo: string): boolean {
    return REPO_PATTERN.test(repo);
  },

  /**
   * Parse a repo string into owner and name
   */
  parseRepo(repo: string): { owner: string; name: string } | null {
    if (!this.isValidRepo(repo)) {
      return null;
    }
    const parts = repo.split("/");
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      return null;
    }
    return { owner: parts[0], name: parts[1] };
  },

  /**
   * Get the installation directory for a repo
   */
  getInstallDir(projectPath: string, repo: string): string {
    const paths = getBoticalPaths(projectPath);
    return paths.skillRepo(repo);
  },

  /**
   * Check if a repo is installed
   */
  isInstalled(projectPath: string, repo: string): boolean {
    const installDir = this.getInstallDir(projectPath, repo);
    return fs.existsSync(installDir);
  },

  /**
   * Install skills from a GitHub repository
   *
   * Downloads the repo as a tarball, extracts it, and updates config.
   */
  async install(
    projectPath: string,
    repo: string,
    ref?: string
  ): Promise<SkillInstallResult> {
    // Validate repo format
    const parsed = this.parseRepo(repo);
    if (!parsed) {
      return {
        success: false,
        skills: [],
        error: `Invalid repository format: ${repo}. Use owner/repo format.`,
      };
    }

    // Check if already installed
    if (this.isInstalled(projectPath, repo)) {
      return {
        success: false,
        skills: [],
        error: `Repository ${repo} is already installed. Uninstall first or use update.`,
      };
    }

    // Download and extract
    const installDir = this.getInstallDir(projectPath, repo);

    try {
      // Download tarball from GitHub
      const tarball = await this.downloadRepo(repo, ref);

      // Ensure parent directory exists
      const parentDir = path.dirname(installDir);
      fs.mkdirSync(parentDir, { recursive: true });

      // Extract tarball
      await this.extractTarball(tarball, installDir);

      // Discover skills in the repo
      const skills = this.discoverSkillsInDir(installDir);

      if (skills.length === 0) {
        // No skills found, clean up
        fs.rmSync(installDir, { recursive: true, force: true });
        return {
          success: false,
          skills: [],
          error: `No valid skills found in repository ${repo}`,
        };
      }

      // Update config
      const config = ProjectConfigService.load(projectPath);
      const installed = config.skills?.installed || [];

      // Add new installation
      installed.push({
        repo,
        ref,
        installedAt: Date.now(),
        enabled: true,
      });

      ProjectConfigService.update(projectPath, {
        skills: { installed },
      });

      return {
        success: true,
        skills,
      };
    } catch (error) {
      // Clean up on error
      if (fs.existsSync(installDir)) {
        fs.rmSync(installDir, { recursive: true, force: true });
      }

      const message =
        error instanceof Error ? error.message : "Unknown error occurred";
      return {
        success: false,
        skills: [],
        error: `Failed to install ${repo}: ${message}`,
      };
    }
  },

  /**
   * Uninstall a skill repository
   */
  uninstall(projectPath: string, repo: string): boolean {
    const installDir = this.getInstallDir(projectPath, repo);

    // Remove directory if exists
    if (fs.existsSync(installDir)) {
      fs.rmSync(installDir, { recursive: true, force: true });
    }

    // Update config
    const config = ProjectConfigService.load(projectPath);
    const installed = config.skills?.installed || [];
    const filtered = installed.filter((s) => s.repo !== repo);

    if (filtered.length === installed.length) {
      return false; // Wasn't in config
    }

    ProjectConfigService.update(projectPath, {
      skills: { installed: filtered },
    });

    return true;
  },

  /**
   * Update a skill to a new ref
   */
  async update(
    projectPath: string,
    repo: string,
    ref?: string
  ): Promise<SkillInstallResult> {
    // First uninstall
    this.uninstall(projectPath, repo);

    // Then reinstall
    return this.install(projectPath, repo, ref);
  },

  /**
   * Toggle enabled state for a skill
   */
  setEnabled(projectPath: string, repo: string, enabled: boolean): boolean {
    const config = ProjectConfigService.load(projectPath);
    const installed = config.skills?.installed || [];

    const skill = installed.find((s) => s.repo === repo);
    if (!skill) {
      return false;
    }

    skill.enabled = enabled;

    ProjectConfigService.update(projectPath, {
      skills: { installed },
    });

    return true;
  },

  /**
   * List all installed skills with their metadata
   */
  listInstalled(projectPath: string): InstalledSkillInfo[] {
    const config = ProjectConfigService.load(projectPath);
    const installed = config.skills?.installed || [];

    return installed.map((skill) => {
      const installDir = this.getInstallDir(projectPath, skill.repo);
      const skills = fs.existsSync(installDir)
        ? this.discoverSkillsInDir(installDir)
        : [];

      return {
        ...skill,
        path: installDir,
        skills,
      };
    });
  },

  /**
   * Get all skills from installed repos (for merging with local)
   */
  getInstalledSkills(projectPath: string): SkillMetadata[] {
    const installed = this.listInstalled(projectPath);
    const skills: SkillMetadata[] = [];

    for (const repo of installed) {
      if (!repo.enabled) continue;

      for (const skill of repo.skills) {
        skills.push(skill);
      }
    }

    return skills;
  },

  /**
   * Download a repository tarball from GitHub
   */
  async downloadRepo(repo: string, ref?: string): Promise<Buffer> {
    const parsed = this.parseRepo(repo);
    if (!parsed) {
      throw new Error(`Invalid repository format: ${repo}`);
    }

    // GitHub API endpoint for tarball
    // If no ref specified, GitHub will use the default branch
    const refPath = ref ? `/${ref}` : "";
    const url = `https://api.github.com/repos/${parsed.owner}/${parsed.name}/tarball${refPath}`;

    const response = await fetch(url, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "botical",
      },
      redirect: "follow",
    });

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(
          `Repository ${repo} not found or is private. Make sure it exists and is public.`
        );
      }
      throw new Error(
        `GitHub API error: ${response.status} ${response.statusText}`
      );
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  },

  /**
   * Extract a tarball to a directory
   */
  async extractTarball(tarball: Buffer, destDir: string): Promise<void> {
    // Create a temp file for the tarball
    const tempFile = path.join(
      destDir,
      "..",
      `.temp-tarball-${Date.now()}.tar.gz`
    );
    fs.mkdirSync(path.dirname(tempFile), { recursive: true });
    fs.writeFileSync(tempFile, tarball);

    try {
      // Create destination directory
      fs.mkdirSync(destDir, { recursive: true });

      // Extract tarball using system tar command
      // GitHub tarballs have a top-level directory like "owner-repo-sha/"
      // We need to strip that and extract to our destination
      await new Promise<void>((resolve, reject) => {
        const proc = spawn("tar", [
          "-xzf",
          tempFile,
          "-C",
          destDir,
          "--strip-components=1",
        ]);

        let stderr = "";
        proc.stderr.on("data", (data) => {
          stderr += data.toString();
        });

        proc.on("close", (code) => {
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`tar extraction failed: ${stderr}`));
          }
        });

        proc.on("error", (err) => {
          reject(new Error(`Failed to run tar: ${err.message}`));
        });
      });
    } finally {
      // Clean up temp file
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
    }
  },

  /**
   * Discover skills in a directory (recursively)
   *
   * Looks for SKILL.md files and validates them.
   */
  discoverSkillsInDir(dir: string): SkillMetadata[] {
    const skills: SkillMetadata[] = [];

    if (!fs.existsSync(dir)) {
      return skills;
    }

    // Check if this directory itself is a skill
    const skillMdPath = path.join(dir, SKILL_FILE);
    if (fs.existsSync(skillMdPath)) {
      const directoryName = path.basename(dir);
      const metadata = SkillService.parseMetadata(
        skillMdPath,
        dir,
        directoryName
      );
      if (metadata) {
        skills.push(metadata);
      }
      // Don't recurse into skill directories
      return skills;
    }

    // Otherwise, look for skill subdirectories
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return skills;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith(".")) continue; // Skip hidden directories

      const subdir = path.join(dir, entry.name);
      const subSkills = this.discoverSkillsInDir(subdir);
      skills.push(...subSkills);
    }

    return skills;
  },
};
