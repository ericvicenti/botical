/**
 * Skills Service Tests
 *
 * Tests for skill discovery and loading from project workspaces.
 * Skills are filesystem-based, following the agentskills.io specification.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { SkillService } from "@/services/skills.ts";

describe("SkillService", () => {
  let tempDir: string;

  beforeEach(() => {
    // Create a temporary directory for test projects
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "botical-skills-test-"));
  });

  afterEach(() => {
    // Clean up temp directory
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  /**
   * Helper to create a skill in the test project
   */
  function createSkill(
    name: string,
    frontmatter: Record<string, unknown>,
    body: string = "# Instructions\n\nTest instructions."
  ): void {
    const skillsDir = path.join(tempDir, "skills", name);
    fs.mkdirSync(skillsDir, { recursive: true });

    const yamlLines = Object.entries(frontmatter)
      .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
      .join("\n");

    const content = `---\n${yamlLines}\n---\n\n${body}`;
    fs.writeFileSync(path.join(skillsDir, "SKILL.md"), content);
  }

  /**
   * Helper to create a skill resource
   */
  function createResource(
    skillName: string,
    resourcePath: string,
    content: string
  ): void {
    const fullPath = path.join(tempDir, "skills", skillName, resourcePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content);
  }

  describe("hasSkillsDir", () => {
    it("returns false when no skills directory exists", () => {
      expect(SkillService.hasSkillsDir(tempDir)).toBe(false);
    });

    it("returns true when skills directory exists", () => {
      fs.mkdirSync(path.join(tempDir, "skills"));
      expect(SkillService.hasSkillsDir(tempDir)).toBe(true);
    });

    it("returns false when skills is a file not a directory", () => {
      fs.writeFileSync(path.join(tempDir, "skills"), "not a directory");
      expect(SkillService.hasSkillsDir(tempDir)).toBe(false);
    });
  });

  describe("list", () => {
    it("returns empty array when no skills directory", () => {
      const skills = SkillService.list(tempDir);
      expect(skills).toEqual([]);
    });

    it("returns empty array when skills directory is empty", () => {
      fs.mkdirSync(path.join(tempDir, "skills"));
      const skills = SkillService.list(tempDir);
      expect(skills).toEqual([]);
    });

    it("discovers valid skills", () => {
      createSkill("code-review", {
        name: "code-review",
        description: "Reviews code for best practices",
      });

      const skills = SkillService.list(tempDir);
      expect(skills).toHaveLength(1);
      expect(skills[0]!.name).toBe("code-review");
      expect(skills[0]!.description).toBe("Reviews code for best practices");
    });

    it("discovers multiple skills sorted alphabetically", () => {
      createSkill("testing", { name: "testing", description: "Testing skill" });
      createSkill("debugging", {
        name: "debugging",
        description: "Debugging skill",
      });
      createSkill("analysis", { name: "analysis", description: "Analysis skill" });

      const skills = SkillService.list(tempDir);
      expect(skills).toHaveLength(3);
      expect(skills[0]!.name).toBe("analysis");
      expect(skills[1]!.name).toBe("debugging");
      expect(skills[2]!.name).toBe("testing");
    });

    it("skips directories without SKILL.md", () => {
      createSkill("valid", { name: "valid", description: "Valid skill" });
      fs.mkdirSync(path.join(tempDir, "skills", "invalid"));

      const skills = SkillService.list(tempDir);
      expect(skills).toHaveLength(1);
      expect(skills[0]!.name).toBe("valid");
    });

    it("skips skills with invalid frontmatter", () => {
      createSkill("valid", { name: "valid", description: "Valid skill" });

      // Create skill with missing required fields
      const invalidDir = path.join(tempDir, "skills", "invalid");
      fs.mkdirSync(invalidDir, { recursive: true });
      fs.writeFileSync(
        path.join(invalidDir, "SKILL.md"),
        "---\nname: invalid\n---\n\n# No description"
      );

      const skills = SkillService.list(tempDir);
      expect(skills).toHaveLength(1);
      expect(skills[0]!.name).toBe("valid");
    });

    it("skips skills where name doesn't match directory", () => {
      createSkill("my-skill", {
        name: "different-name",
        description: "Mismatched name",
      });

      const skills = SkillService.list(tempDir);
      expect(skills).toHaveLength(0);
    });

    it("parses allowed-tools from frontmatter", () => {
      createSkill("code-review", {
        name: "code-review",
        description: "Reviews code",
        "allowed-tools": "read grep bash",
      });

      const skills = SkillService.list(tempDir);
      expect(skills[0]!.allowedTools).toEqual(["read", "grep", "bash"]);
    });

    it("parses optional metadata fields", () => {
      createSkill("full-skill", {
        name: "full-skill",
        description: "A complete skill",
        license: "MIT",
        compatibility: "Requires git",
        metadata: { author: "test", version: "1.0" },
      });

      const skills = SkillService.list(tempDir);
      expect(skills[0]!.license).toBe("MIT");
      expect(skills[0]!.compatibility).toBe("Requires git");
      expect(skills[0]!.metadata).toEqual({ author: "test", version: "1.0" });
    });
  });

  describe("getByName", () => {
    it("returns null for non-existent skill", () => {
      const skill = SkillService.getByName(tempDir, "nonexistent");
      expect(skill).toBeNull();
    });

    it("returns null for skill with invalid frontmatter", () => {
      const invalidDir = path.join(tempDir, "skills", "invalid");
      fs.mkdirSync(invalidDir, { recursive: true });
      fs.writeFileSync(
        path.join(invalidDir, "SKILL.md"),
        "---\nname: invalid\n---\n\n# Missing description"
      );

      const skill = SkillService.getByName(tempDir, "invalid");
      expect(skill).toBeNull();
    });

    it("returns null when name doesn't match directory", () => {
      createSkill("my-skill", {
        name: "wrong-name",
        description: "Mismatched",
      });

      const skill = SkillService.getByName(tempDir, "my-skill");
      expect(skill).toBeNull();
    });

    it("returns skill with full instructions", () => {
      const instructions =
        "# How to Use\n\nStep 1: Read the code\nStep 2: Review it";
      createSkill(
        "code-review",
        { name: "code-review", description: "Reviews code" },
        instructions
      );

      const skill = SkillService.getByName(tempDir, "code-review");
      expect(skill).not.toBeNull();
      expect(skill!.name).toBe("code-review");
      expect(skill!.description).toBe("Reviews code");
      expect(skill!.instructions).toBe(instructions);
    });

    it("trims whitespace from instructions", () => {
      createSkill(
        "test",
        { name: "test", description: "Test skill" },
        "\n\n  Content here  \n\n"
      );

      const skill = SkillService.getByName(tempDir, "test");
      expect(skill!.instructions).toBe("Content here");
    });
  });

  describe("listResources", () => {
    it("returns empty array when skill doesn't exist", () => {
      const resources = SkillService.listResources(tempDir, "nonexistent");
      expect(resources).toEqual([]);
    });

    it("returns empty array when skill has no resources", () => {
      createSkill("simple", { name: "simple", description: "Simple skill" });

      const resources = SkillService.listResources(tempDir, "simple");
      expect(resources).toEqual([]);
    });

    it("discovers scripts", () => {
      createSkill("scripted", { name: "scripted", description: "Has scripts" });
      createResource("scripted", "scripts/deploy.sh", "#!/bin/bash\necho hi");
      createResource("scripted", "scripts/test.py", "print('test')");

      const resources = SkillService.listResources(tempDir, "scripted");
      expect(resources).toHaveLength(2);
      expect(resources).toContainEqual({
        path: "scripts/deploy.sh",
        type: "script",
      });
      expect(resources).toContainEqual({
        path: "scripts/test.py",
        type: "script",
      });
    });

    it("discovers references", () => {
      createSkill("documented", {
        name: "documented",
        description: "Has docs",
      });
      createResource("documented", "references/api.md", "# API Reference");
      createResource("documented", "references/examples.md", "# Examples");

      const resources = SkillService.listResources(tempDir, "documented");
      expect(resources).toHaveLength(2);
      expect(resources).toContainEqual({
        path: "references/api.md",
        type: "reference",
      });
      expect(resources).toContainEqual({
        path: "references/examples.md",
        type: "reference",
      });
    });

    it("discovers assets", () => {
      createSkill("with-assets", {
        name: "with-assets",
        description: "Has assets",
      });
      createResource("with-assets", "assets/template.json", '{"key": "value"}');

      const resources = SkillService.listResources(tempDir, "with-assets");
      expect(resources).toHaveLength(1);
      expect(resources[0]).toEqual({
        path: "assets/template.json",
        type: "asset",
      });
    });

    it("discovers nested resources", () => {
      createSkill("nested", { name: "nested", description: "Nested resources" });
      createResource("nested", "scripts/utils/helper.sh", "echo helper");

      const resources = SkillService.listResources(tempDir, "nested");
      expect(resources).toHaveLength(1);
      expect(resources[0]!.path).toBe("scripts/utils/helper.sh");
    });
  });

  describe("getResource", () => {
    beforeEach(() => {
      createSkill("resources", { name: "resources", description: "Test" });
      createResource(
        "resources",
        "scripts/deploy.sh",
        "#!/bin/bash\necho 'deploy'"
      );
      createResource("resources", "references/guide.md", "# Guide\n\nContent");
    });

    it("returns null for non-existent resource", () => {
      const content = SkillService.getResource(
        tempDir,
        "resources",
        "scripts/nonexistent.sh"
      );
      expect(content).toBeNull();
    });

    it("returns null for non-existent skill", () => {
      const content = SkillService.getResource(
        tempDir,
        "nonexistent",
        "scripts/deploy.sh"
      );
      expect(content).toBeNull();
    });

    it("returns content of script resource", () => {
      const content = SkillService.getResource(
        tempDir,
        "resources",
        "scripts/deploy.sh"
      );
      expect(content).toBe("#!/bin/bash\necho 'deploy'");
    });

    it("returns content of reference resource", () => {
      const content = SkillService.getResource(
        tempDir,
        "resources",
        "references/guide.md"
      );
      expect(content).toBe("# Guide\n\nContent");
    });

    it("blocks path traversal attempts with ..", () => {
      const content = SkillService.getResource(
        tempDir,
        "resources",
        "../../../etc/passwd"
      );
      expect(content).toBeNull();
    });

    it("blocks resources outside allowed directories", () => {
      // Create a file in the skill root (not in scripts/references/assets)
      fs.writeFileSync(
        path.join(tempDir, "skills", "resources", "secret.txt"),
        "secret data"
      );

      const content = SkillService.getResource(
        tempDir,
        "resources",
        "secret.txt"
      );
      expect(content).toBeNull();
    });

    it("blocks SKILL.md access through resources", () => {
      const content = SkillService.getResource(
        tempDir,
        "resources",
        "../SKILL.md"
      );
      expect(content).toBeNull();
    });
  });

  describe("skill name validation", () => {
    it("accepts valid lowercase names", () => {
      createSkill("valid-name", {
        name: "valid-name",
        description: "Valid",
      });
      const skills = SkillService.list(tempDir);
      expect(skills).toHaveLength(1);
    });

    it("accepts single character names", () => {
      createSkill("a", { name: "a", description: "Single char" });
      const skills = SkillService.list(tempDir);
      expect(skills).toHaveLength(1);
    });

    it("accepts names with numbers", () => {
      createSkill("skill2", { name: "skill2", description: "With number" });
      const skills = SkillService.list(tempDir);
      expect(skills).toHaveLength(1);
    });

    it("rejects names starting with hyphen", () => {
      // Create skill file manually to test validation
      const skillDir = path.join(tempDir, "skills", "-invalid");
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(
        path.join(skillDir, "SKILL.md"),
        '---\nname: "-invalid"\ndescription: "Starts with hyphen"\n---\n\n# Test'
      );

      const skills = SkillService.list(tempDir);
      expect(skills).toHaveLength(0);
    });
  });
});
