/**
 * Projects API Route Tests
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { createApp } from "@/server/app.ts";
import { DatabaseManager } from "@/database/index.ts";
import { Config } from "@/config/index.ts";
import { ProjectService } from "@/services/projects.ts";
import type {
  ListResponse,
  ItemResponse,
  ErrorResponse,
  ProjectResponse,
  MemberResponse,
} from "../../../utils/response-types.ts";
import fs from "fs";
import path from "path";

describe("Projects API Routes", () => {
  const testDataDir = path.join(
    import.meta.dirname,
    "../../../../.test-data/projects-route-test"
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

    // Clean up any existing test data (respecting foreign key constraints)
    rootDb.prepare("DELETE FROM project_members WHERE project_id IN (SELECT id FROM projects WHERE owner_id IN (?, ?))").run(testUserId, testUserId2);
    rootDb.prepare("DELETE FROM projects WHERE owner_id IN (?, ?)").run(testUserId, testUserId2);
    rootDb.prepare("DELETE FROM users WHERE id IN (?, ?)").run(testUserId, testUserId2);

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

    // Clean up any existing test projects
    rootDb.prepare("DELETE FROM project_members WHERE project_id LIKE 'prj_%'").run();
    rootDb.prepare("DELETE FROM projects WHERE id LIKE 'prj_%'").run();
  });

  const app = createApp();

  describe("GET /api/projects", () => {
    it("returns empty list when no projects exist", async () => {
      const response = await app.request("/api/projects");

      expect(response.status).toBe(200);

      const body = (await response.json()) as ListResponse<ProjectResponse>;
      expect(body.data).toEqual([]);
      expect(body.meta.total).toBe(0);
    });

    it("returns projects list with pagination", async () => {
      const rootDb = DatabaseManager.getRootDb();

      ProjectService.create(rootDb, { name: "Project 1", ownerId: testUserId });
      ProjectService.create(rootDb, { name: "Project 2", ownerId: testUserId });
      ProjectService.create(rootDb, { name: "Project 3", ownerId: testUserId });

      const response = await app.request("/api/projects?limit=2");

      expect(response.status).toBe(200);

      const body = (await response.json()) as ListResponse<ProjectResponse>;
      expect(body.data.length).toBe(2);
      expect(body.meta.total).toBe(3);
      expect(body.meta.hasMore).toBe(true);
    });

    it("filters by ownerId", async () => {
      const rootDb = DatabaseManager.getRootDb();

      ProjectService.create(rootDb, { name: "User 1 Project", ownerId: testUserId });
      ProjectService.create(rootDb, { name: "User 2 Project", ownerId: testUserId2 });

      const response = await app.request(`/api/projects?ownerId=${testUserId}`);

      expect(response.status).toBe(200);

      const body = (await response.json()) as ListResponse<ProjectResponse>;
      expect(body.data.length).toBe(1);
      expect(body.data[0]!.name).toBe("User 1 Project");
    });

    it("filters by memberId", async () => {
      const rootDb = DatabaseManager.getRootDb();

      const project = ProjectService.create(rootDb, {
        name: "Shared Project",
        ownerId: testUserId,
      });
      ProjectService.addMember(rootDb, project.id, testUserId2, "member");

      const response = await app.request(`/api/projects?memberId=${testUserId2}`);

      expect(response.status).toBe(200);

      const body = (await response.json()) as ListResponse<ProjectResponse>;
      expect(body.data.length).toBe(1);
      expect(body.data[0]!.name).toBe("Shared Project");
    });
  });

  describe("POST /api/projects", () => {
    it("creates a new project", async () => {
      const response = await app.request("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "New Project",
          ownerId: testUserId,
        }),
      });

      expect(response.status).toBe(201);

      const body = (await response.json()) as ItemResponse<ProjectResponse>;
      expect(body.data.id).toMatch(/^prj_/);
      expect(body.data.name).toBe("New Project");
      expect(body.data.ownerId).toBe(testUserId);
      expect(body.data.type).toBe("local");
    });

    it("creates project with all fields", async () => {
      const response = await app.request("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Full Project",
          ownerId: testUserId,
          description: "A complete project",
          type: "remote",
          path: "/path/to/project",
          gitRemote: "https://github.com/test/repo",
          iconUrl: "https://example.com/icon.png",
          color: "#FF0000",
        }),
      });

      expect(response.status).toBe(201);

      const body = (await response.json()) as ItemResponse<ProjectResponse>;
      expect(body.data.description).toBe("A complete project");
      expect(body.data.type).toBe("remote");
      expect(body.data.color).toBe("#FF0000");
    });

    it("requires name", async () => {
      const response = await app.request("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ownerId: testUserId,
        }),
      });

      expect(response.status).toBe(400);

      const body = (await response.json()) as ErrorResponse;
      expect(body.error.code).toBe("VALIDATION_ERROR");
    });

    it("requires ownerId", async () => {
      const response = await app.request("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Test Project",
        }),
      });

      expect(response.status).toBe(400);

      const body = (await response.json()) as ErrorResponse;
      expect(body.error.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("GET /api/projects/:id", () => {
    it("returns project by ID", async () => {
      const rootDb = DatabaseManager.getRootDb();
      const created = ProjectService.create(rootDb, {
        name: "Test Project",
        ownerId: testUserId,
      });

      const response = await app.request(`/api/projects/${created.id}`);

      expect(response.status).toBe(200);

      const body = (await response.json()) as ItemResponse<ProjectResponse>;
      expect(body.data.id).toBe(created.id);
      expect(body.data.name).toBe("Test Project");
    });

    it("returns 404 for non-existent project", async () => {
      const response = await app.request("/api/projects/prj_nonexistent");

      expect(response.status).toBe(404);

      const body = (await response.json()) as ErrorResponse;
      expect(body.error.code).toBe("NOT_FOUND");
    });
  });

  describe("PUT /api/projects/:id", () => {
    it("updates project name", async () => {
      const rootDb = DatabaseManager.getRootDb();
      const created = ProjectService.create(rootDb, {
        name: "Original",
        ownerId: testUserId,
      });

      const response = await app.request(`/api/projects/${created.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Updated Name",
        }),
      });

      expect(response.status).toBe(200);

      const body = (await response.json()) as ItemResponse<ProjectResponse>;
      expect(body.data.name).toBe("Updated Name");
    });

    it("updates multiple fields", async () => {
      const rootDb = DatabaseManager.getRootDb();
      const created = ProjectService.create(rootDb, {
        name: "Test",
        ownerId: testUserId,
      });

      const response = await app.request(`/api/projects/${created.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "New Name",
          description: "New description",
          color: "#00FF00",
        }),
      });

      expect(response.status).toBe(200);

      const body = (await response.json()) as ItemResponse<ProjectResponse>;
      expect(body.data.name).toBe("New Name");
      expect(body.data.description).toBe("New description");
      expect(body.data.color).toBe("#00FF00");
    });

    it("returns 404 for non-existent project", async () => {
      const response = await app.request("/api/projects/prj_nonexistent", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Test",
        }),
      });

      expect(response.status).toBe(404);
    });
  });

  describe("DELETE /api/projects/:id", () => {
    it("archives a project", async () => {
      const rootDb = DatabaseManager.getRootDb();
      const created = ProjectService.create(rootDb, {
        name: "To Archive",
        ownerId: testUserId,
      });

      const response = await app.request(`/api/projects/${created.id}`, {
        method: "DELETE",
      });

      expect(response.status).toBe(200);

      const body = (await response.json()) as ItemResponse<{ archived: boolean }>;
      expect(body.data.archived).toBe(true);

      // Verify project is archived
      const project = ProjectService.getById(rootDb, created.id);
      expect(project).toBeNull();
    });

    it("returns 404 for non-existent project", async () => {
      const response = await app.request("/api/projects/prj_nonexistent", {
        method: "DELETE",
      });

      expect(response.status).toBe(404);
    });
  });

  describe("GET /api/projects/:id/members", () => {
    it("returns project members", async () => {
      const rootDb = DatabaseManager.getRootDb();
      const project = ProjectService.create(rootDb, {
        name: "Test",
        ownerId: testUserId,
      });
      ProjectService.addMember(rootDb, project.id, testUserId2, "member");

      const response = await app.request(`/api/projects/${project.id}/members`);

      expect(response.status).toBe(200);

      const body = (await response.json()) as ListResponse<MemberResponse>;
      expect(body.data.length).toBe(2);
      expect(body.meta.total).toBe(2);
    });

    it("returns 404 for non-existent project", async () => {
      const response = await app.request("/api/projects/prj_nonexistent/members");

      expect(response.status).toBe(404);
    });
  });

  describe("POST /api/projects/:id/members", () => {
    it("adds a member", async () => {
      const rootDb = DatabaseManager.getRootDb();
      const project = ProjectService.create(rootDb, {
        name: "Test",
        ownerId: testUserId,
      });

      const response = await app.request(`/api/projects/${project.id}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: testUserId2,
          role: "member",
        }),
      });

      expect(response.status).toBe(201);

      const body = (await response.json()) as ItemResponse<MemberResponse>;
      expect(body.data.userId).toBe(testUserId2);
      expect(body.data.role).toBe("member");
    });

    it("rejects duplicate member", async () => {
      const rootDb = DatabaseManager.getRootDb();
      const project = ProjectService.create(rootDb, {
        name: "Test",
        ownerId: testUserId,
      });
      ProjectService.addMember(rootDb, project.id, testUserId2, "member");

      const response = await app.request(`/api/projects/${project.id}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: testUserId2,
          role: "admin",
        }),
      });

      expect(response.status).toBe(409);

      const body = (await response.json()) as ErrorResponse;
      expect(body.error.code).toBe("CONFLICT");
    });
  });

  describe("PUT /api/projects/:id/members/:userId", () => {
    it("updates member role", async () => {
      const rootDb = DatabaseManager.getRootDb();
      const project = ProjectService.create(rootDb, {
        name: "Test",
        ownerId: testUserId,
      });
      ProjectService.addMember(rootDb, project.id, testUserId2, "member");

      const response = await app.request(
        `/api/projects/${project.id}/members/${testUserId2}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            role: "admin",
          }),
        }
      );

      expect(response.status).toBe(200);

      const body = (await response.json()) as ItemResponse<MemberResponse>;
      expect(body.data.role).toBe("admin");
    });

    it("returns 404 for non-member", async () => {
      const rootDb = DatabaseManager.getRootDb();
      const project = ProjectService.create(rootDb, {
        name: "Test",
        ownerId: testUserId,
      });

      const response = await app.request(
        `/api/projects/${project.id}/members/${testUserId2}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            role: "admin",
          }),
        }
      );

      expect(response.status).toBe(404);
    });
  });

  describe("DELETE /api/projects/:id/members/:userId", () => {
    it("removes a member", async () => {
      const rootDb = DatabaseManager.getRootDb();
      const project = ProjectService.create(rootDb, {
        name: "Test",
        ownerId: testUserId,
      });
      ProjectService.addMember(rootDb, project.id, testUserId2, "member");

      const response = await app.request(
        `/api/projects/${project.id}/members/${testUserId2}`,
        {
          method: "DELETE",
        }
      );

      expect(response.status).toBe(200);

      const body = (await response.json()) as ItemResponse<{ removed: boolean }>;
      expect(body.data.removed).toBe(true);
    });

    it("prevents removing owner", async () => {
      const rootDb = DatabaseManager.getRootDb();
      const project = ProjectService.create(rootDb, {
        name: "Test",
        ownerId: testUserId,
      });

      const response = await app.request(
        `/api/projects/${project.id}/members/${testUserId}`,
        {
          method: "DELETE",
        }
      );

      expect(response.status).toBe(403);
    });

    it("returns 404 for non-member", async () => {
      const rootDb = DatabaseManager.getRootDb();
      const project = ProjectService.create(rootDb, {
        name: "Test",
        ownerId: testUserId,
      });

      const response = await app.request(
        `/api/projects/${project.id}/members/${testUserId2}`,
        {
          method: "DELETE",
        }
      );

      expect(response.status).toBe(404);
    });
  });
});
