/**
 * Project Service Tests
 */

import {
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  afterAll,
  afterEach,
} from "bun:test";
import { Database } from "bun:sqlite";
import { ProjectService } from "@/services/projects.ts";
import { runMigrations } from "@/database/migrations.ts";
import { ROOT_MIGRATIONS } from "@/database/root-migrations.ts";
import { DatabaseManager } from "@/database/index.ts";
import { Config } from "@/config/index.ts";
import {
  NotFoundError,
  ForbiddenError,
  ConflictError,
} from "@/utils/errors.ts";
import fs from "fs";
import path from "path";

describe("Project Service", () => {
  const testDataDir = path.join(
    import.meta.dirname,
    "../../../.test-data/projects-service-test"
  );
  const testUserId = "usr_test-user-123";
  const testUserId2 = "usr_test-user-456";

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

    // Create test users
    const rootDb = DatabaseManager.getRootDb();
    const now = Date.now();

    // Clean up existing data
    rootDb.prepare("DELETE FROM project_members").run();
    rootDb.prepare("DELETE FROM projects").run();
    rootDb.prepare("DELETE FROM users WHERE id LIKE 'usr_test-%'").run();

    rootDb
      .prepare(
        "INSERT INTO users (id, email, username, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
      )
      .run(testUserId, "test@example.com", "testuser1", now, now);

    rootDb
      .prepare(
        "INSERT INTO users (id, email, username, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
      )
      .run(testUserId2, "test2@example.com", "testuser2", now, now);
  });

  describe("create", () => {
    it("creates a project with required fields", () => {
      const rootDb = DatabaseManager.getRootDb();
      const project = ProjectService.create(rootDb, {
        name: "Test Project",
        ownerId: testUserId,
      });

      expect(project.id).toMatch(/^prj_/);
      expect(project.name).toBe("Test Project");
      expect(project.ownerId).toBe(testUserId);
      expect(project.type).toBe("local");
      expect(project.createdAt).toBeDefined();
    });

    it("creates a project with optional fields", () => {
      const rootDb = DatabaseManager.getRootDb();
      const project = ProjectService.create(rootDb, {
        name: "Full Project",
        ownerId: testUserId,
        description: "A test project",
        type: "remote",
        path: "/path/to/project",
        gitRemote: "https://github.com/test/repo",
        iconUrl: "https://example.com/icon.png",
        color: "#FF0000",
        settings: { key: "value" },
      });

      expect(project.description).toBe("A test project");
      expect(project.type).toBe("remote");
      expect(project.path).toBe("/path/to/project");
      expect(project.gitRemote).toBe("https://github.com/test/repo");
      expect(project.iconUrl).toBe("https://example.com/icon.png");
      expect(project.color).toBe("#FF0000");
      expect(project.settings).toEqual({ key: "value" });
    });

    it("adds owner as a member with owner role", () => {
      const rootDb = DatabaseManager.getRootDb();
      const project = ProjectService.create(rootDb, {
        name: "Test Project",
        ownerId: testUserId,
      });

      const members = ProjectService.listMembers(rootDb, project.id);
      expect(members.length).toBe(1);
      expect(members[0]!.userId).toBe(testUserId);
      expect(members[0]!.role).toBe("owner");
    });

    it("generates unique IDs", () => {
      const rootDb = DatabaseManager.getRootDb();
      const project1 = ProjectService.create(rootDb, {
        name: "Project 1",
        ownerId: testUserId,
      });
      const project2 = ProjectService.create(rootDb, {
        name: "Project 2",
        ownerId: testUserId,
      });

      expect(project1.id).not.toBe(project2.id);
    });
  });

  describe("getById", () => {
    it("retrieves an existing project", () => {
      const rootDb = DatabaseManager.getRootDb();
      const created = ProjectService.create(rootDb, {
        name: "Test Project",
        ownerId: testUserId,
      });

      const retrieved = ProjectService.getById(rootDb, created.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(created.id);
      expect(retrieved?.name).toBe("Test Project");
    });

    it("returns null for non-existent project", () => {
      const rootDb = DatabaseManager.getRootDb();
      const result = ProjectService.getById(rootDb, "prj_nonexistent");
      expect(result).toBeNull();
    });

    it("returns null for archived project", () => {
      const rootDb = DatabaseManager.getRootDb();
      const created = ProjectService.create(rootDb, {
        name: "Test Project",
        ownerId: testUserId,
      });
      ProjectService.delete(rootDb, created.id);

      const result = ProjectService.getById(rootDb, created.id);
      expect(result).toBeNull();
    });
  });

  describe("getByIdOrThrow", () => {
    it("returns project when it exists", () => {
      const rootDb = DatabaseManager.getRootDb();
      const created = ProjectService.create(rootDb, {
        name: "Test Project",
        ownerId: testUserId,
      });

      const retrieved = ProjectService.getByIdOrThrow(rootDb, created.id);
      expect(retrieved.id).toBe(created.id);
    });

    it("throws NotFoundError for non-existent project", () => {
      const rootDb = DatabaseManager.getRootDb();
      expect(() => {
        ProjectService.getByIdOrThrow(rootDb, "prj_nonexistent");
      }).toThrow(NotFoundError);
    });
  });

  describe("list", () => {
    it("lists all projects", () => {
      const rootDb = DatabaseManager.getRootDb();
      ProjectService.create(rootDb, { name: "Project 1", ownerId: testUserId });
      ProjectService.create(rootDb, { name: "Project 2", ownerId: testUserId });

      const projects = ProjectService.list(rootDb);
      expect(projects.filter(p => p.id !== "prj_root").length).toBe(2);
    });

    it("filters by ownerId", () => {
      const rootDb = DatabaseManager.getRootDb();
      ProjectService.create(rootDb, {
        name: "User 1 Project",
        ownerId: testUserId,
      });
      ProjectService.create(rootDb, {
        name: "User 2 Project",
        ownerId: testUserId2,
      });

      const projects = ProjectService.list(rootDb, { ownerId: testUserId }).filter(p => p.id !== "prj_root");
      expect(projects.length).toBe(1);
      expect(projects[0]!.name).toBe("User 1 Project");
    });

    it("filters by memberId", () => {
      const rootDb = DatabaseManager.getRootDb();
      const project = ProjectService.create(rootDb, {
        name: "Shared Project",
        ownerId: testUserId,
      });
      ProjectService.addMember(rootDb, project.id, testUserId2, "member");

      const projectsForUser2 = ProjectService.list(rootDb, {
        memberId: testUserId2,
      }).filter(p => p.id !== "prj_root");
      expect(projectsForUser2.length).toBe(1);
    });

    it("supports pagination", () => {
      const rootDb = DatabaseManager.getRootDb();
      ProjectService.create(rootDb, { name: "Project 1", ownerId: testUserId });
      ProjectService.create(rootDb, { name: "Project 2", ownerId: testUserId });
      ProjectService.create(rootDb, { name: "Project 3", ownerId: testUserId });

      const page1 = ProjectService.list(rootDb, { limit: 2 }).filter(p => p.id !== "prj_root");
      // Root project is prepended, so page1 may have root + 2 from SQL
      const page2 = ProjectService.list(rootDb, { limit: 2, offset: 2 }).filter(p => p.id !== "prj_root");
      // Total user projects = 3, verify we get them all across pages
      expect(page1.length + page2.length).toBe(3);
    });

    it("excludes archived projects by default", () => {
      const rootDb = DatabaseManager.getRootDb();
      ProjectService.create(rootDb, {
        name: "Active",
        ownerId: testUserId,
      });
      const archived = ProjectService.create(rootDb, {
        name: "Archived",
        ownerId: testUserId,
      });
      ProjectService.delete(rootDb, archived.id);

      const projects = ProjectService.list(rootDb).filter(p => p.id !== "prj_root");
      expect(projects.length).toBe(1);
      expect(projects[0]!.name).toBe("Active");
    });

    it("includes archived when requested", () => {
      const rootDb = DatabaseManager.getRootDb();
      ProjectService.create(rootDb, {
        name: "Active",
        ownerId: testUserId,
      });
      const archived = ProjectService.create(rootDb, {
        name: "Archived",
        ownerId: testUserId,
      });
      ProjectService.delete(rootDb, archived.id);

      const projects = ProjectService.list(rootDb, { includeArchived: true });
      expect(projects.filter(p => p.id !== "prj_root").length).toBe(2);
    });
  });

  describe("update", () => {
    it("updates project name", () => {
      const rootDb = DatabaseManager.getRootDb();
      const project = ProjectService.create(rootDb, {
        name: "Original",
        ownerId: testUserId,
      });

      const updated = ProjectService.update(rootDb, project.id, {
        name: "Updated",
      });
      expect(updated.name).toBe("Updated");
    });

    it("updates multiple fields", () => {
      const rootDb = DatabaseManager.getRootDb();
      const project = ProjectService.create(rootDb, {
        name: "Test",
        ownerId: testUserId,
      });

      const updated = ProjectService.update(rootDb, project.id, {
        name: "New Name",
        description: "New description",
        color: "#00FF00",
      });

      expect(updated.name).toBe("New Name");
      expect(updated.description).toBe("New description");
      expect(updated.color).toBe("#00FF00");
    });

    it("throws for non-existent project", () => {
      const rootDb = DatabaseManager.getRootDb();
      expect(() => {
        ProjectService.update(rootDb, "prj_nonexistent", { name: "Test" });
      }).toThrow(NotFoundError);
    });
  });

  describe("delete", () => {
    it("archives a project", () => {
      const rootDb = DatabaseManager.getRootDb();
      const project = ProjectService.create(rootDb, {
        name: "To Archive",
        ownerId: testUserId,
      });

      ProjectService.delete(rootDb, project.id);

      const result = ProjectService.getById(rootDb, project.id);
      expect(result).toBeNull();

      // Can still find with includeArchived
      const withArchived = ProjectService.list(rootDb, {
        includeArchived: true,
      });
      expect(withArchived.some((p) => p.id === project.id)).toBe(true);
    });
  });

  describe("member management", () => {
    describe("addMember", () => {
      it("adds a member to project", () => {
        const rootDb = DatabaseManager.getRootDb();
        const project = ProjectService.create(rootDb, {
          name: "Test",
          ownerId: testUserId,
        });

        const member = ProjectService.addMember(
          rootDb,
          project.id,
          testUserId2,
          "member"
        );

        expect(member.userId).toBe(testUserId2);
        expect(member.role).toBe("member");
        expect(member.projectId).toBe(project.id);
      });

      it("throws ConflictError for duplicate member", () => {
        const rootDb = DatabaseManager.getRootDb();
        const project = ProjectService.create(rootDb, {
          name: "Test",
          ownerId: testUserId,
        });
        ProjectService.addMember(rootDb, project.id, testUserId2, "member");

        expect(() => {
          ProjectService.addMember(rootDb, project.id, testUserId2, "admin");
        }).toThrow(ConflictError);
      });

      it("records invitedBy", () => {
        const rootDb = DatabaseManager.getRootDb();
        const project = ProjectService.create(rootDb, {
          name: "Test",
          ownerId: testUserId,
        });

        const member = ProjectService.addMember(
          rootDb,
          project.id,
          testUserId2,
          "member",
          testUserId
        );

        expect(member.invitedBy).toBe(testUserId);
      });
    });

    describe("removeMember", () => {
      it("removes a member from project", () => {
        const rootDb = DatabaseManager.getRootDb();
        const project = ProjectService.create(rootDb, {
          name: "Test",
          ownerId: testUserId,
        });
        ProjectService.addMember(rootDb, project.id, testUserId2, "member");

        ProjectService.removeMember(rootDb, project.id, testUserId2);

        const members = ProjectService.listMembers(rootDb, project.id);
        expect(members.some((m) => m.userId === testUserId2)).toBe(false);
      });

      it("throws ForbiddenError when removing owner", () => {
        const rootDb = DatabaseManager.getRootDb();
        const project = ProjectService.create(rootDb, {
          name: "Test",
          ownerId: testUserId,
        });

        expect(() => {
          ProjectService.removeMember(rootDb, project.id, testUserId);
        }).toThrow(ForbiddenError);
      });

      it("throws NotFoundError for non-member", () => {
        const rootDb = DatabaseManager.getRootDb();
        const project = ProjectService.create(rootDb, {
          name: "Test",
          ownerId: testUserId,
        });

        expect(() => {
          ProjectService.removeMember(rootDb, project.id, testUserId2);
        }).toThrow(NotFoundError);
      });
    });

    describe("updateMemberRole", () => {
      it("updates member role", () => {
        const rootDb = DatabaseManager.getRootDb();
        const project = ProjectService.create(rootDb, {
          name: "Test",
          ownerId: testUserId,
        });
        ProjectService.addMember(rootDb, project.id, testUserId2, "member");

        const updated = ProjectService.updateMemberRole(
          rootDb,
          project.id,
          testUserId2,
          "admin"
        );

        expect(updated.role).toBe("admin");
      });

      it("throws ForbiddenError when changing owner role", () => {
        const rootDb = DatabaseManager.getRootDb();
        const project = ProjectService.create(rootDb, {
          name: "Test",
          ownerId: testUserId,
        });

        expect(() => {
          ProjectService.updateMemberRole(
            rootDb,
            project.id,
            testUserId,
            "member"
          );
        }).toThrow(ForbiddenError);
      });
    });

    describe("listMembers", () => {
      it("lists all members", () => {
        const rootDb = DatabaseManager.getRootDb();
        const project = ProjectService.create(rootDb, {
          name: "Test",
          ownerId: testUserId,
        });
        ProjectService.addMember(rootDb, project.id, testUserId2, "member");

        const members = ProjectService.listMembers(rootDb, project.id);
        expect(members.length).toBe(2);
      });
    });

    describe("hasAccess", () => {
      it("returns true for owner", () => {
        const rootDb = DatabaseManager.getRootDb();
        const project = ProjectService.create(rootDb, {
          name: "Test",
          ownerId: testUserId,
        });

        expect(ProjectService.hasAccess(rootDb, project.id, testUserId)).toBe(
          true
        );
      });

      it("returns true for member", () => {
        const rootDb = DatabaseManager.getRootDb();
        const project = ProjectService.create(rootDb, {
          name: "Test",
          ownerId: testUserId,
        });
        ProjectService.addMember(rootDb, project.id, testUserId2, "member");

        expect(ProjectService.hasAccess(rootDb, project.id, testUserId2)).toBe(
          true
        );
      });

      it("returns false for non-member", () => {
        const rootDb = DatabaseManager.getRootDb();
        const project = ProjectService.create(rootDb, {
          name: "Test",
          ownerId: testUserId,
        });

        expect(ProjectService.hasAccess(rootDb, project.id, testUserId2)).toBe(
          false
        );
      });
    });

    describe("hasRole", () => {
      it("owner has all roles", () => {
        const rootDb = DatabaseManager.getRootDb();
        const project = ProjectService.create(rootDb, {
          name: "Test",
          ownerId: testUserId,
        });

        expect(
          ProjectService.hasRole(rootDb, project.id, testUserId, "viewer")
        ).toBe(true);
        expect(
          ProjectService.hasRole(rootDb, project.id, testUserId, "member")
        ).toBe(true);
        expect(
          ProjectService.hasRole(rootDb, project.id, testUserId, "admin")
        ).toBe(true);
        expect(
          ProjectService.hasRole(rootDb, project.id, testUserId, "owner")
        ).toBe(true);
      });

      it("member has member and viewer roles", () => {
        const rootDb = DatabaseManager.getRootDb();
        const project = ProjectService.create(rootDb, {
          name: "Test",
          ownerId: testUserId,
        });
        ProjectService.addMember(rootDb, project.id, testUserId2, "member");

        expect(
          ProjectService.hasRole(rootDb, project.id, testUserId2, "viewer")
        ).toBe(true);
        expect(
          ProjectService.hasRole(rootDb, project.id, testUserId2, "member")
        ).toBe(true);
        expect(
          ProjectService.hasRole(rootDb, project.id, testUserId2, "admin")
        ).toBe(false);
      });
    });
  });

  describe("count", () => {
    it("counts all projects", () => {
      const rootDb = DatabaseManager.getRootDb();
      ProjectService.create(rootDb, { name: "Project 1", ownerId: testUserId });
      ProjectService.create(rootDb, { name: "Project 2", ownerId: testUserId });

      expect(ProjectService.count(rootDb)).toBe(2);
    });

    it("counts by owner", () => {
      const rootDb = DatabaseManager.getRootDb();
      ProjectService.create(rootDb, { name: "User 1", ownerId: testUserId });
      ProjectService.create(rootDb, { name: "User 2", ownerId: testUserId2 });

      expect(ProjectService.count(rootDb, { ownerId: testUserId })).toBe(1);
    });
  });
});
