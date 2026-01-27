/**
 * Skills API Integration Tests
 *
 * Tests the skills API endpoints with real project setup.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { DatabaseManager } from "@/database/manager.ts";
import { Config } from "@/config/index.ts";
import { ProjectService } from "@/services/projects.ts";
import { SkillService } from "@/services/skills.ts";
import fs from "fs";
import path from "path";

describe("Skills API Integration", () => {
  const testDataDir = path.join(
    import.meta.dirname,
    "../.test-data/skills-api"
  );

  let testUserId: string;
  let projectId: string;
  let projectPath: string;

  beforeEach(async () => {
    DatabaseManager.closeAll();
    Config.load({ dataDir: testDataDir });

    if (fs.existsSync(testDataDir)) {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    }

    await DatabaseManager.initialize();

    // Create test user
    const rootDb = DatabaseManager.getRootDb();
    const now = Date.now();
    testUserId = `usr_test-${now}`;

    rootDb
      .prepare(
        "INSERT INTO users (id, email, username, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
      )
      .run(testUserId, "test@example.com", "testuser", now, now);

    // Create test project
    const project = ProjectService.create(rootDb, {
      name: "Skills Test Project",
      ownerId: testUserId,
      description: "Project for testing skills API",
    });

    projectId = project.id;
    projectPath = project.path!;
  });

  afterEach(() => {
    DatabaseManager.closeAll();
    if (fs.existsSync(testDataDir)) {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    }
  });

  /**
   * Helper to create a skill in the test project
   */
  function createSkill(
    name: string,
    frontmatter: Record<string, unknown>,
    body: string = "# Instructions\n\nTest instructions."
  ): void {
    const skillsDir = path.join(projectPath, "skills", name);
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
    const fullPath = path.join(projectPath, "skills", skillName, resourcePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content);
  }

  describe("skill discovery in projects", () => {
    it("returns empty list when project has no skills directory", () => {
      const skills = SkillService.list(projectPath);
      expect(skills).toEqual([]);
    });

    it("discovers skills from project workspace", () => {
      createSkill("code-review", {
        name: "code-review",
        description: "Reviews code for best practices",
      });

      createSkill("testing", {
        name: "testing",
        description: "Writes tests for code",
      });

      const skills = SkillService.list(projectPath);
      expect(skills).toHaveLength(2);

      const names = skills.map((s) => s.name);
      expect(names).toContain("code-review");
      expect(names).toContain("testing");
    });

    it("loads skill with full instructions", () => {
      const instructions = `# Code Review Guide

## Step 1: Read the code
Carefully read through all changes.

## Step 2: Check for issues
Look for bugs, security issues, and code quality problems.

## Step 3: Provide feedback
Write clear, actionable feedback.`;

      createSkill(
        "code-review",
        {
          name: "code-review",
          description: "Reviews code for best practices",
          "allowed-tools": "read grep",
        },
        instructions
      );

      const skill = SkillService.getByName(projectPath, "code-review");

      expect(skill).not.toBeNull();
      expect(skill!.name).toBe("code-review");
      expect(skill!.description).toBe("Reviews code for best practices");
      expect(skill!.instructions).toBe(instructions);
      expect(skill!.allowedTools).toEqual(["read", "grep"]);
    });

    it("lists skill resources", () => {
      createSkill("documented", {
        name: "documented",
        description: "A well-documented skill",
      });

      createResource("documented", "scripts/setup.sh", "#!/bin/bash\necho setup");
      createResource("documented", "references/guide.md", "# Guide");
      createResource("documented", "assets/template.json", '{"key": "value"}');

      const resources = SkillService.listResources(projectPath, "documented");

      expect(resources).toHaveLength(3);

      const resourcePaths = resources.map((r) => r.path);
      expect(resourcePaths).toContain("scripts/setup.sh");
      expect(resourcePaths).toContain("references/guide.md");
      expect(resourcePaths).toContain("assets/template.json");
    });

    it("reads skill resource content", () => {
      createSkill("scripted", {
        name: "scripted",
        description: "Has scripts",
      });

      const scriptContent = `#!/bin/bash
set -e
echo "Running deployment..."
npm run build
npm run deploy`;

      createResource("scripted", "scripts/deploy.sh", scriptContent);

      const content = SkillService.getResource(
        projectPath,
        "scripted",
        "scripts/deploy.sh"
      );

      expect(content).toBe(scriptContent);
    });
  });

  describe("skill validation", () => {
    it("validates skill name matches directory", () => {
      // Create skill where name in frontmatter doesn't match directory name
      const skillsDir = path.join(projectPath, "skills", "my-skill");
      fs.mkdirSync(skillsDir, { recursive: true });
      fs.writeFileSync(
        path.join(skillsDir, "SKILL.md"),
        '---\nname: "different-name"\ndescription: "Mismatched"\n---\n\n# Test'
      );

      const skills = SkillService.list(projectPath);
      expect(skills).toHaveLength(0);

      const skill = SkillService.getByName(projectPath, "my-skill");
      expect(skill).toBeNull();
    });

    it("validates required frontmatter fields", () => {
      // Create skill missing description
      const skillsDir = path.join(projectPath, "skills", "incomplete");
      fs.mkdirSync(skillsDir, { recursive: true });
      fs.writeFileSync(
        path.join(skillsDir, "SKILL.md"),
        '---\nname: "incomplete"\n---\n\n# No description'
      );

      const skills = SkillService.list(projectPath);
      expect(skills).toHaveLength(0);
    });

    it("prevents path traversal in resource access", () => {
      createSkill("secure", {
        name: "secure",
        description: "Secure skill",
      });

      // Try to access file outside skill directory
      const content = SkillService.getResource(
        projectPath,
        "secure",
        "../../../etc/passwd"
      );

      expect(content).toBeNull();
    });
  });

  describe("progressive disclosure", () => {
    it("list() returns only metadata (~100 tokens)", () => {
      createSkill(
        "large-skill",
        {
          name: "large-skill",
          description: "A skill with lots of content",
          license: "MIT",
          metadata: { author: "test" },
        },
        "# Very Long Instructions\n\n" + "Content. ".repeat(1000)
      );

      const skills = SkillService.list(projectPath);
      expect(skills).toHaveLength(1);

      // List should not include instructions
      const skill = skills[0]!;
      expect(skill.name).toBe("large-skill");
      expect(skill.description).toBe("A skill with lots of content");
      expect((skill as unknown as { instructions?: string }).instructions).toBeUndefined();
    });

    it("getByName() returns full instructions", () => {
      const longInstructions = "# Instructions\n\n" + "Content. ".repeat(100).trim();

      createSkill(
        "detailed",
        { name: "detailed", description: "Detailed skill" },
        longInstructions
      );

      const skill = SkillService.getByName(projectPath, "detailed");
      expect(skill!.instructions).toBe(longInstructions);
    });

    it("getResource() loads content on demand", () => {
      createSkill("with-resource", {
        name: "with-resource",
        description: "Has resources",
      });

      const largeContent = "x".repeat(10000);
      createResource("with-resource", "scripts/large.sh", largeContent);

      // List resources doesn't load content
      const resources = SkillService.listResources(projectPath, "with-resource");
      expect(resources).toHaveLength(1);
      expect((resources[0] as unknown as { content?: string }).content).toBeUndefined();

      // Get resource loads content
      const content = SkillService.getResource(
        projectPath,
        "with-resource",
        "scripts/large.sh"
      );
      expect(content).toBe(largeContent);
    });
  });
});
