/**
 * Workflow Service Tests
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { WorkflowService } from "@/services/workflows.ts";
import { runMigrations } from "@/database/migrations.ts";
import { PROJECT_MIGRATIONS } from "@/database/project-migrations.ts";

describe("Workflow Service", () => {
  let db: Database;
  const projectId = "proj_test123";

  beforeEach(() => {
    db = new Database(":memory:");
    runMigrations(db, PROJECT_MIGRATIONS);
  });

  afterEach(() => {
    db.close();
  });

  describe("create", () => {
    it("creates a workflow with required fields", () => {
      const workflow = WorkflowService.create(db, projectId, {
        name: "my-workflow",
        label: "My Workflow",
      });

      expect(workflow.id).toMatch(/^wf_/);
      expect(workflow.name).toBe("my-workflow");
      expect(workflow.label).toBe("My Workflow");
      expect(workflow.description).toBe("");
      expect(workflow.category).toBe("other");
      expect(workflow.steps).toEqual([]);
      expect(workflow.inputSchema).toEqual({ fields: [] });
    });

    it("creates a workflow with all fields", () => {
      const workflow = WorkflowService.create(db, projectId, {
        name: "deploy-staging",
        label: "Deploy to Staging",
        description: "Deploys the app to staging environment",
        category: "shell",
        icon: "rocket",
        inputSchema: {
          fields: [
            { name: "branch", type: "string", label: "Branch", required: true },
          ],
        },
        steps: [
          { id: "step1", type: "action", action: "git.pull", args: {} },
        ],
      });

      expect(workflow.name).toBe("deploy-staging");
      expect(workflow.label).toBe("Deploy to Staging");
      expect(workflow.description).toBe("Deploys the app to staging environment");
      expect(workflow.category).toBe("shell");
      expect(workflow.icon).toBe("rocket");
      expect(workflow.inputSchema.fields).toHaveLength(1);
      expect(workflow.inputSchema.fields[0]?.name).toBe("branch");
      expect(workflow.steps).toHaveLength(1);
    });

    it("generates unique IDs", () => {
      const workflow1 = WorkflowService.create(db, projectId, {
        name: "workflow-one",
        label: "Workflow One",
      });

      const workflow2 = WorkflowService.create(db, projectId, {
        name: "workflow-two",
        label: "Workflow Two",
      });

      expect(workflow1.id).not.toBe(workflow2.id);
      expect(workflow1.id).toMatch(/^wf_/);
      expect(workflow2.id).toMatch(/^wf_/);
    });

    it("throws on duplicate name within project", () => {
      WorkflowService.create(db, projectId, {
        name: "my-workflow",
        label: "First",
      });

      expect(() => {
        WorkflowService.create(db, projectId, {
          name: "my-workflow",
          label: "Second",
        });
      }).toThrow(/already exists/);
    });

    it("allows same name in different projects", () => {
      const workflow1 = WorkflowService.create(db, "proj_a", {
        name: "deploy",
        label: "Deploy A",
      });

      const workflow2 = WorkflowService.create(db, "proj_b", {
        name: "deploy",
        label: "Deploy B",
      });

      expect(workflow1.id).not.toBe(workflow2.id);
      expect(workflow1.name).toBe(workflow2.name);
    });

    // Note: Name format validation is done at the API layer via Zod schema,
    // not in the service layer. See workflow API route tests for validation tests.
  });

  describe("getById", () => {
    it("retrieves an existing workflow", () => {
      const created = WorkflowService.create(db, projectId, {
        name: "test-workflow",
        label: "Test Workflow",
      });

      const retrieved = WorkflowService.getById(db, created.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(created.id);
      expect(retrieved?.name).toBe("test-workflow");
      expect(retrieved?.label).toBe("Test Workflow");
    });

    it("returns null for non-existent workflow", () => {
      const result = WorkflowService.getById(db, "wf_nonexistent");
      expect(result).toBeNull();
    });
  });

  describe("getByIdOrThrow", () => {
    it("returns workflow when it exists", () => {
      const created = WorkflowService.create(db, projectId, {
        name: "test-workflow",
        label: "Test Workflow",
      });

      const retrieved = WorkflowService.getByIdOrThrow(db, created.id);
      expect(retrieved.id).toBe(created.id);
    });

    it("throws for non-existent workflow", () => {
      expect(() => {
        WorkflowService.getByIdOrThrow(db, "wf_nonexistent");
      }).toThrow();
    });
  });

  describe("getByName", () => {
    it("retrieves workflow by name within project", () => {
      WorkflowService.create(db, projectId, {
        name: "my-workflow",
        label: "My Workflow",
      });

      const retrieved = WorkflowService.getByName(db, projectId, "my-workflow");
      expect(retrieved).toBeDefined();
      expect(retrieved?.name).toBe("my-workflow");
    });

    it("returns null for non-existent name", () => {
      const result = WorkflowService.getByName(db, projectId, "nonexistent");
      expect(result).toBeNull();
    });

    it("does not find workflow from different project", () => {
      WorkflowService.create(db, "proj_a", {
        name: "my-workflow",
        label: "My Workflow",
      });

      const result = WorkflowService.getByName(db, "proj_b", "my-workflow");
      expect(result).toBeNull();
    });
  });

  describe("list", () => {
    it("lists all workflows for a project", () => {
      WorkflowService.create(db, projectId, { name: "workflow-a", label: "A" });
      WorkflowService.create(db, projectId, { name: "workflow-b", label: "B" });
      WorkflowService.create(db, projectId, { name: "workflow-c", label: "C" });

      const workflows = WorkflowService.list(db, projectId);
      expect(workflows).toHaveLength(3);
    });

    it("returns workflows sorted by label", () => {
      WorkflowService.create(db, projectId, { name: "z-workflow", label: "Zebra" });
      WorkflowService.create(db, projectId, { name: "a-workflow", label: "Apple" });
      WorkflowService.create(db, projectId, { name: "m-workflow", label: "Mango" });

      const workflows = WorkflowService.list(db, projectId);
      expect(workflows[0]?.label).toBe("Apple");
      expect(workflows[1]?.label).toBe("Mango");
      expect(workflows[2]?.label).toBe("Zebra");
    });

    it("only returns workflows for specified project", () => {
      WorkflowService.create(db, "proj_a", { name: "workflow-a", label: "A" });
      WorkflowService.create(db, "proj_b", { name: "workflow-b", label: "B" });

      const workflowsA = WorkflowService.list(db, "proj_a");
      expect(workflowsA).toHaveLength(1);
      expect(workflowsA[0]?.label).toBe("A");

      const workflowsB = WorkflowService.list(db, "proj_b");
      expect(workflowsB).toHaveLength(1);
      expect(workflowsB[0]?.label).toBe("B");
    });

    it("supports pagination with limit and offset", () => {
      WorkflowService.create(db, projectId, { name: "workflow-a", label: "A" });
      WorkflowService.create(db, projectId, { name: "workflow-b", label: "B" });
      WorkflowService.create(db, projectId, { name: "workflow-c", label: "C" });

      const page1 = WorkflowService.list(db, projectId, { limit: 2 });
      expect(page1).toHaveLength(2);

      const page2 = WorkflowService.list(db, projectId, { limit: 2, offset: 2 });
      expect(page2).toHaveLength(1);
    });

    it("filters by category", () => {
      WorkflowService.create(db, projectId, { name: "git-flow", label: "Git", category: "git" });
      WorkflowService.create(db, projectId, { name: "shell-flow", label: "Shell", category: "shell" });

      const gitWorkflows = WorkflowService.list(db, projectId, { category: "git" });
      expect(gitWorkflows).toHaveLength(1);
      expect(gitWorkflows[0]?.name).toBe("git-flow");
    });
  });

  describe("count", () => {
    it("counts all workflows for a project", () => {
      WorkflowService.create(db, projectId, { name: "workflow-a", label: "A" });
      WorkflowService.create(db, projectId, { name: "workflow-b", label: "B" });

      expect(WorkflowService.count(db, projectId)).toBe(2);
    });

    it("counts by category", () => {
      WorkflowService.create(db, projectId, { name: "git-flow", label: "Git", category: "git" });
      WorkflowService.create(db, projectId, { name: "shell-flow", label: "Shell", category: "shell" });
      WorkflowService.create(db, projectId, { name: "other-flow", label: "Other", category: "other" });

      expect(WorkflowService.count(db, projectId, { category: "git" })).toBe(1);
      expect(WorkflowService.count(db, projectId, { category: "shell" })).toBe(1);
      expect(WorkflowService.count(db, projectId)).toBe(3);
    });

    it("returns zero for empty project", () => {
      expect(WorkflowService.count(db, "proj_empty")).toBe(0);
    });
  });

  describe("update", () => {
    it("updates workflow label", () => {
      const workflow = WorkflowService.create(db, projectId, {
        name: "my-workflow",
        label: "Original",
      });

      WorkflowService.update(db, workflow.id, { label: "Updated" });

      const updated = WorkflowService.getById(db, workflow.id);
      expect(updated?.label).toBe("Updated");
    });

    it("updates workflow name", () => {
      const workflow = WorkflowService.create(db, projectId, {
        name: "old-name",
        label: "Test",
      });

      WorkflowService.update(db, workflow.id, { name: "new-name" });

      const updated = WorkflowService.getById(db, workflow.id);
      expect(updated?.name).toBe("new-name");
    });

    it("updates workflow steps", () => {
      const workflow = WorkflowService.create(db, projectId, {
        name: "my-workflow",
        label: "Test",
        steps: [],
      });

      const newSteps = [
        { id: "step1", type: "action" as const, action: "git.pull", args: {} },
        { id: "step2", type: "notify" as const, message: { type: "literal" as const, value: "Done" } },
      ];

      WorkflowService.update(db, workflow.id, { steps: newSteps });

      const updated = WorkflowService.getById(db, workflow.id);
      expect(updated?.steps).toHaveLength(2);
    });

    it("updates input schema", () => {
      const workflow = WorkflowService.create(db, projectId, {
        name: "my-workflow",
        label: "Test",
      });

      const newSchema = {
        fields: [
          { name: "env", type: "enum" as const, label: "Environment", options: ["dev", "staging", "prod"] },
        ],
      };

      WorkflowService.update(db, workflow.id, { inputSchema: newSchema });

      const updated = WorkflowService.getById(db, workflow.id);
      expect(updated?.inputSchema.fields).toHaveLength(1);
      expect(updated?.inputSchema.fields[0]?.name).toBe("env");
    });

    it("throws when renaming to existing name", () => {
      WorkflowService.create(db, projectId, { name: "existing", label: "Existing" });
      const workflow = WorkflowService.create(db, projectId, { name: "my-workflow", label: "Mine" });

      expect(() => {
        WorkflowService.update(db, workflow.id, { name: "existing" });
      }).toThrow(/already exists/);
    });

    it("throws for non-existent workflow", () => {
      expect(() => {
        WorkflowService.update(db, "wf_nonexistent", { label: "Test" });
      }).toThrow();
    });
  });

  describe("delete", () => {
    it("deletes an existing workflow", () => {
      const workflow = WorkflowService.create(db, projectId, {
        name: "my-workflow",
        label: "Test",
      });

      WorkflowService.delete(db, workflow.id);

      const result = WorkflowService.getById(db, workflow.id);
      expect(result).toBeNull();
    });

    it("throws for non-existent workflow", () => {
      expect(() => {
        WorkflowService.delete(db, "wf_nonexistent");
      }).toThrow();
    });
  });
});
