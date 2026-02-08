/**
 * Project Lifecycle Integration Tests
 *
 * Tests the full lifecycle of projects including creation,
 * member management, and cleanup.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { DatabaseManager } from "@/database/manager.ts";
import { Config } from "@/config/index.ts";
import { ProjectService } from "@/services/projects.ts";
import { SessionService } from "@/services/sessions.ts";
import fs from "fs";
import path from "path";

describe("Project Lifecycle Integration", () => {
  const testDataDir = path.join(
    import.meta.dirname,
    "../.test-data/project-lifecycle"
  );

  let testUserId: string;
  let testUserId2: string;

  beforeEach(async () => {
    DatabaseManager.closeAll();
    Config.load({ dataDir: testDataDir });

    if (fs.existsSync(testDataDir)) {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    }

    await DatabaseManager.initialize();

    // Create test users
    const rootDb = DatabaseManager.getRootDb();
    const now = Date.now();
    testUserId = `usr_test-${now}-1`;
    testUserId2 = `usr_test-${now}-2`;

    rootDb
      .prepare(
        "INSERT INTO users (id, email, username, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
      )
      .run(testUserId, "test1@example.com", "testuser1", now, now);

    rootDb
      .prepare(
        "INSERT INTO users (id, email, username, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
      )
      .run(testUserId2, "test2@example.com", "testuser2", now, now);
  });

  afterEach(() => {
    DatabaseManager.closeAll();
    if (fs.existsSync(testDataDir)) {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    }
  });

  describe("complete project lifecycle", () => {
    it("creates project, adds content, and cleans up properly", async () => {
      const rootDb = DatabaseManager.getRootDb();

      // Create project
      const project = ProjectService.create(rootDb, {
        name: "Test Project",
        ownerId: testUserId,
        description: "A test project for integration testing",
      });

      expect(project.id).toMatch(/^prj_/);
      expect(project.ownerId).toBe(testUserId);

      // Get project database and add content
      const projectDb = DatabaseManager.getProjectDb(project.id);

      // Create sessions
      const session1 = SessionService.create(projectDb, {
        title: "Session 1",
        agent: "default",
      });
      const session2 = SessionService.create(projectDb, {
        title: "Session 2",
        agent: "coder",
      });

      expect(SessionService.count(projectDb)).toBe(2);

      // Verify project exists on disk
      const projectDir = Config.getProjectDir(project.id);
      expect(fs.existsSync(projectDir)).toBe(true);

      // Archive project
      ProjectService.delete(rootDb, project.id);

      // Verify project is archived but data still exists
      expect(ProjectService.getById(rootDb, project.id)).toBeNull();
      expect(
        ProjectService.list(rootDb, { includeArchived: true }).some(
          (p) => p.id === project.id
        )
      ).toBe(true);

      // Permanent delete
      ProjectService.permanentDelete(rootDb, project.id);

      // Verify complete cleanup
      expect(
        ProjectService.list(rootDb, { includeArchived: true }).some(
          (p) => p.id === project.id
        )
      ).toBe(false);
      expect(fs.existsSync(projectDir)).toBe(false);
    });

    it("handles project with multiple members", async () => {
      const rootDb = DatabaseManager.getRootDb();

      // Create project
      const project = ProjectService.create(rootDb, {
        name: "Team Project",
        ownerId: testUserId,
      });

      // Owner is automatically added as member
      let members = ProjectService.listMembers(rootDb, project.id);
      expect(members.length).toBe(1);
      expect(members[0]!.role).toBe("owner");

      // Add team members
      ProjectService.addMember(rootDb, project.id, testUserId2, "admin");

      members = ProjectService.listMembers(rootDb, project.id);
      expect(members.length).toBe(2);

      // Verify access
      expect(ProjectService.hasAccess(rootDb, project.id, testUserId)).toBe(true);
      expect(ProjectService.hasAccess(rootDb, project.id, testUserId2)).toBe(true);
      expect(ProjectService.hasRole(rootDb, project.id, testUserId2, "admin")).toBe(
        true
      );
      expect(ProjectService.hasRole(rootDb, project.id, testUserId2, "owner")).toBe(
        false
      );

      // Update member role
      ProjectService.updateMemberRole(rootDb, project.id, testUserId2, "member");
      expect(ProjectService.hasRole(rootDb, project.id, testUserId2, "admin")).toBe(
        false
      );

      // Remove member
      ProjectService.removeMember(rootDb, project.id, testUserId2);
      expect(ProjectService.hasAccess(rootDb, project.id, testUserId2)).toBe(false);
    });
  });

  describe("project isolation", () => {
    it("maintains complete data isolation between projects", async () => {
      const rootDb = DatabaseManager.getRootDb();

      // Create two projects
      const project1 = ProjectService.create(rootDb, {
        name: "Project 1",
        ownerId: testUserId,
      });
      const project2 = ProjectService.create(rootDb, {
        name: "Project 2",
        ownerId: testUserId,
      });

      // Get separate databases
      const db1 = DatabaseManager.getProjectDb(project1.id);
      const db2 = DatabaseManager.getProjectDb(project2.id);

      // Create sessions in each
      SessionService.create(db1, { title: "P1 Session", agent: "default" });
      SessionService.create(db2, { title: "P2 Session 1", agent: "default" });
      SessionService.create(db2, { title: "P2 Session 2", agent: "default" });

      // Verify isolation
      expect(SessionService.count(db1)).toBe(1);
      expect(SessionService.count(db2)).toBe(2);

      // Deleting one project doesn't affect other
      ProjectService.permanentDelete(rootDb, project1.id);

      expect(SessionService.count(db2)).toBe(2);
    });
  });

  describe("project queries", () => {
    it("correctly queries projects by membership", async () => {
      const rootDb = DatabaseManager.getRootDb();

      // Create projects owned by user 1
      const ownedProject = ProjectService.create(rootDb, {
        name: "Owned Project",
        ownerId: testUserId,
      });

      // Create project owned by user 2, but user 1 is a member
      const sharedProject = ProjectService.create(rootDb, {
        name: "Shared Project",
        ownerId: testUserId2,
      });
      ProjectService.addMember(rootDb, sharedProject.id, testUserId, "member");

      // Query by owner (includes root project)
      const ownedByUser1 = ProjectService.list(rootDb, { ownerId: testUserId });
      const ownedNonRoot = ownedByUser1.filter((p) => p.id !== "prj_root");
      expect(ownedNonRoot.length).toBe(1);
      expect(ownedNonRoot[0]!.name).toBe("Owned Project");

      // Query by member (includes owned, shared, and root project)
      const accessibleByUser1 = ProjectService.list(rootDb, {
        memberId: testUserId,
      });
      const accessibleNonRoot = accessibleByUser1.filter((p) => p.id !== "prj_root");
      expect(accessibleNonRoot.length).toBe(2);

      // Query by user 2 membership (includes root project in single-user mode)
      const accessibleByUser2 = ProjectService.list(rootDb, {
        memberId: testUserId2,
      });
      const user2NonRoot = accessibleByUser2.filter((p) => p.id !== "prj_root");
      expect(user2NonRoot.length).toBe(1);
      expect(user2NonRoot[0]!.name).toBe("Shared Project");
    });
  });

  describe("error handling", () => {
    it("prevents invalid operations", async () => {
      const rootDb = DatabaseManager.getRootDb();

      const project = ProjectService.create(rootDb, {
        name: "Test",
        ownerId: testUserId,
      });

      // Cannot remove owner
      expect(() => {
        ProjectService.removeMember(rootDb, project.id, testUserId);
      }).toThrow();

      // Cannot change owner's role
      expect(() => {
        ProjectService.updateMemberRole(rootDb, project.id, testUserId, "member");
      }).toThrow();

      // Cannot add duplicate member
      ProjectService.addMember(rootDb, project.id, testUserId2, "member");
      expect(() => {
        ProjectService.addMember(rootDb, project.id, testUserId2, "admin");
      }).toThrow();
    });
  });
});
