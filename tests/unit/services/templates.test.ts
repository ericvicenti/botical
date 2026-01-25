/**
 * Templates Service Tests
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { TemplateService } from "@/services/templates";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

describe("TemplateService", () => {
  let tempDir: string;

  beforeEach(async () => {
    // Create a temporary directory for tests
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "iris-templates-test-"));
  });

  afterEach(async () => {
    // Clean up
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("list", () => {
    test("returns empty array when no templates directory exists", async () => {
      const templates = await TemplateService.list(tempDir);
      expect(templates).toEqual([]);
    });

    test("returns empty array when templates directory is empty", async () => {
      await fs.mkdir(path.join(tempDir, ".iris", "templates"), { recursive: true });
      const templates = await TemplateService.list(tempDir);
      expect(templates).toEqual([]);
    });

    test("lists templates from .iris/templates directory", async () => {
      const templatesDir = path.join(tempDir, ".iris", "templates");
      await fs.mkdir(templatesDir, { recursive: true });

      // Create test templates
      await fs.writeFile(
        path.join(templatesDir, "code-review.yaml"),
        `---
name: Code Review
description: Review code changes
agentClass: smart
---
You are a code review assistant.`
      );

      await fs.writeFile(
        path.join(templatesDir, "default.yaml"),
        `---
name: Default
agentClass: medium
---`
      );

      const templates = await TemplateService.list(tempDir);
      expect(templates).toHaveLength(2);
      expect(templates[0]?.name).toBe("Code Review");
      expect(templates[0]?.id).toBe("code-review");
      expect(templates[0]?.agentClass).toBe("smart");
      expect(templates[1]?.name).toBe("Default");
    });
  });

  describe("get", () => {
    test("returns null when template does not exist", async () => {
      const template = await TemplateService.get(tempDir, "nonexistent");
      expect(template).toBeNull();
    });

    test("returns template with all fields", async () => {
      const templatesDir = path.join(tempDir, ".iris", "templates");
      await fs.mkdir(templatesDir, { recursive: true });

      await fs.writeFile(
        path.join(templatesDir, "test.yaml"),
        `---
name: Test Template
description: A test template
agentClass: easy
tools:
  - read
  - glob
---
You are a helpful assistant.
Focus on code quality.`
      );

      const template = await TemplateService.get(tempDir, "test");
      expect(template).not.toBeNull();
      expect(template?.id).toBe("test");
      expect(template?.name).toBe("Test Template");
      expect(template?.description).toBe("A test template");
      expect(template?.agentClass).toBe("easy");
      expect(template?.tools).toEqual(["read", "glob"]);
      expect(template?.systemPrompt).toBe("You are a helpful assistant.\nFocus on code quality.");
    });

    test("handles template without frontmatter", async () => {
      const templatesDir = path.join(tempDir, ".iris", "templates");
      await fs.mkdir(templatesDir, { recursive: true });

      await fs.writeFile(
        path.join(templatesDir, "simple.yaml"),
        "Just a simple system prompt."
      );

      const template = await TemplateService.get(tempDir, "simple");
      expect(template).not.toBeNull();
      expect(template?.name).toBe("simple");
      expect(template?.systemPrompt).toBe("Just a simple system prompt.");
      expect(template?.agentClass).toBe("medium"); // default
    });

    test("handles .yml extension", async () => {
      const templatesDir = path.join(tempDir, ".iris", "templates");
      await fs.mkdir(templatesDir, { recursive: true });

      await fs.writeFile(
        path.join(templatesDir, "legacy.yml"),
        `---
name: Legacy Template
---`
      );

      const template = await TemplateService.get(tempDir, "legacy");
      expect(template).not.toBeNull();
      expect(template?.name).toBe("Legacy Template");
    });
  });

  describe("create", () => {
    test("creates a new template", async () => {
      const template = await TemplateService.create(tempDir, "new-template", {
        name: "New Template",
        description: "A newly created template",
        agentClass: "smart",
        tools: ["bash", "read"],
        systemPrompt: "You are a helpful AI.",
      });

      expect(template.id).toBe("new-template");
      expect(template.name).toBe("New Template");
      expect(template.agentClass).toBe("smart");

      // Verify file was created
      const filePath = path.join(tempDir, ".iris", "templates", "new-template.yaml");
      const content = await fs.readFile(filePath, "utf-8");
      expect(content).toContain("name: New Template");
      expect(content).toContain("agentClass: smart");
    });

    test("throws error when template already exists", async () => {
      await TemplateService.create(tempDir, "existing", { name: "Existing" });

      await expect(
        TemplateService.create(tempDir, "existing", { name: "Another" })
      ).rejects.toThrow('Template "existing" already exists');
    });
  });

  describe("update", () => {
    test("updates an existing template", async () => {
      await TemplateService.create(tempDir, "to-update", {
        name: "Original Name",
        agentClass: "medium",
      });

      const updated = await TemplateService.update(tempDir, "to-update", {
        name: "Updated Name",
        agentClass: "smart",
      });

      expect(updated.name).toBe("Updated Name");
      expect(updated.agentClass).toBe("smart");
    });

    test("throws error when template does not exist", async () => {
      await expect(
        TemplateService.update(tempDir, "nonexistent", { name: "New Name" })
      ).rejects.toThrow('Template "nonexistent" not found');
    });
  });

  describe("delete", () => {
    test("deletes an existing template", async () => {
      await TemplateService.create(tempDir, "to-delete", { name: "To Delete" });

      await TemplateService.delete(tempDir, "to-delete");

      const template = await TemplateService.get(tempDir, "to-delete");
      expect(template).toBeNull();
    });

    test("throws error when template does not exist", async () => {
      await expect(TemplateService.delete(tempDir, "nonexistent")).rejects.toThrow(
        'Template "nonexistent" not found'
      );
    });
  });
});
