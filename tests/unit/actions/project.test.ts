/**
 * Project Actions Tests
 */

import {
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  afterAll,
} from "bun:test";
import { projectDelete, projectOpen } from "@/actions/project";
import { DatabaseManager } from "@/database/index";
import { ProjectService } from "@/services/projects";
import { Config } from "@/config/index";
import type { ActionContext } from "@/actions/types";
import fs from "fs";
import path from "path";

describe("Project Actions", () => {
  const testDataDir = path.join(
    import.meta.dirname,
    "../../../.test-data/actions-project-test"
  );
  const testUserId = "usr_test-action-user";

  let mockContext: ActionContext;

  beforeAll(() => {
    Config.load({ dataDir: testDataDir });
    if (fs.existsSync(testDataDir)) {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    }
  });

  afterAll(() => {
    DatabaseManager.closeAll();
    if (fs.existsSync(testDataDir)) {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    }
  });

  beforeEach(async () => {
    await DatabaseManager.initialize();

    const rootDb = DatabaseManager.getRootDb();
    const now = Date.now();

    // Clean up existing data
    rootDb.prepare("DELETE FROM project_members").run();
    rootDb.prepare("DELETE FROM projects").run();
    rootDb.prepare("DELETE FROM users WHERE id = ?").run(testUserId);

    // Create test user
    rootDb
      .prepare(
        "INSERT INTO users (id, email, username, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
      )
      .run(testUserId, "test-action@example.com", "actionuser", now, now);

    mockContext = {
      projectId: "",
      projectPath: "",
    };
  });

  describe("project.delete", () => {
    it("should archive a project and return success with archive location", async () => {
      const rootDb = DatabaseManager.getRootDb();

      // Create a test project
      const project = ProjectService.create(rootDb, {
        name: "Test Project",
        ownerId: testUserId,
      });

      // Execute the delete action
      const result = await projectDelete.execute(
        { projectId: project.id },
        mockContext
      );

      // Verify result
      expect(result.type).toBe("success");
      if (result.type === "success") {
        expect(result.title).toBe("Project Archived");
        expect(result.output).toContain("Test Project");
        expect(result.output).toContain("has been archived");
        // Should include the archive location
        expect(result.output).toContain(Config.getProjectDir(project.id));
        expect(result.output).toContain("manually delete");
      }

      // Verify project is archived (soft deleted)
      const archivedProject = rootDb
        .prepare("SELECT archived_at FROM projects WHERE id = ?")
        .get(project.id) as { archived_at: number | null } | undefined;

      expect(archivedProject).toBeDefined();
      expect(archivedProject?.archived_at).not.toBeNull();
    });

    it("should return error for non-existent project", async () => {
      const result = await projectDelete.execute(
        { projectId: "prj_nonexistent" },
        mockContext
      );

      expect(result.type).toBe("error");
      if (result.type === "error") {
        expect(result.message).toBe("Project not found");
      }
    });

    it("should have correct action metadata", () => {
      expect(projectDelete.id).toBe("project.delete");
      expect(projectDelete.label).toBe("Delete Project");
      expect(projectDelete.category).toBe("project");
      expect(projectDelete.icon).toBe("trash");
    });
  });

  describe("project.open", () => {
    it("should return navigate result", async () => {
      const result = await projectOpen.execute(
        { projectId: "prj_test123" },
        mockContext
      );

      expect(result.type).toBe("navigate");
      if (result.type === "navigate") {
        expect(result.pageId).toBe("project");
        expect(result.params).toEqual({ projectId: "prj_test123" });
      }
    });

    it("should have correct action metadata", () => {
      expect(projectOpen.id).toBe("project.open");
      expect(projectOpen.label).toBe("Open Project");
      expect(projectOpen.category).toBe("project");
      expect(projectOpen.icon).toBe("folder-open");
    });
  });
});
