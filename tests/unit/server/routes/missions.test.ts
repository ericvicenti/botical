/**
 * Missions API Route Tests
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { createApp } from "@/server/app.ts";
import { DatabaseManager } from "@/database/index.ts";
import { Config } from "@/config/index.ts";
import { ProjectService } from "@/services/projects.ts";
import { SessionService } from "@/services/sessions.ts";
import { MissionService } from "@/services/missions.ts";
import { TaskService } from "@/services/tasks.ts";
import type {
  ListResponse,
  ItemResponse,
  ErrorResponse,
  MissionResponse,
  TaskResponse,
} from "../../../utils/response-types.ts";
import fs from "fs";
import path from "path";

describe("Missions API Routes", () => {
  const testDataDir = path.join(
    import.meta.dirname,
    "../../../../.test-data/missions-route-test"
  );
  const testUserId = "usr_test-user-missions";
  let projectId: string;

  beforeAll(() => {
    // Enable single-user mode for these tests so auth is auto-handled
    process.env.BOTICAL_SINGLE_USER = "true";
    Config.load({ dataDir: testDataDir });

    if (fs.existsSync(testDataDir)) {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    }
  });

  afterAll(() => {
    delete process.env.BOTICAL_SINGLE_USER;
    DatabaseManager.closeAll();
    if (fs.existsSync(testDataDir)) {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    }
  });

  beforeEach(async () => {
    await DatabaseManager.initialize();

    // Create test user
    const rootDb = DatabaseManager.getRootDb();
    const now = Date.now();

    // Clean up existing test data
    rootDb
      .prepare(
        "DELETE FROM project_members WHERE project_id IN (SELECT id FROM projects WHERE owner_id = ?)"
      )
      .run(testUserId);
    rootDb.prepare("DELETE FROM projects WHERE owner_id = ?").run(testUserId);
    rootDb.prepare("DELETE FROM users WHERE id = ?").run(testUserId);

    rootDb
      .prepare(
        "INSERT INTO users (id, email, username, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
      )
      .run(testUserId, "missions-test@example.com", "missionsuser", now, now);

    // Create a test project
    const project = ProjectService.create(rootDb, {
      name: "Missions Test Project",
      ownerId: testUserId,
    });
    projectId = project.id;
  });

  const app = createApp();

  describe("POST /api/projects/:projectId/missions", () => {
    it("creates a new mission", async () => {
      const response = await app.request(`/api/projects/${projectId}/missions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Implement Authentication",
        }),
      });

      expect(response.status).toBe(201);

      const body = (await response.json()) as ItemResponse<MissionResponse & { planContent: string }>;
      expect(body.data.id).toMatch(/^msn_/);
      expect(body.data.title).toBe("Implement Authentication");
      expect(body.data.status).toBe("planning");
      expect(body.data.planPath).toContain("implement-authentication.md");
      expect(body.data.planContent).toContain("# Mission: Implement Authentication");
    });

    it("creates a mission with description", async () => {
      const response = await app.request(`/api/projects/${projectId}/missions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Add User Auth",
          description: "Implement JWT-based authentication",
        }),
      });

      expect(response.status).toBe(201);

      const body = (await response.json()) as ItemResponse<MissionResponse & { planContent: string }>;
      expect(body.data.planContent).toContain("Implement JWT-based authentication");
    });

    it("rejects missing title", async () => {
      const response = await app.request(`/api/projects/${projectId}/missions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      expect(response.status).toBe(400);
    });
  });

  describe("GET /api/projects/:projectId/missions", () => {
    beforeEach(async () => {
      const db = DatabaseManager.getProjectDb(projectId);
      MissionService.create(db, projectId, { title: "Mission 1" });
      MissionService.create(db, projectId, { title: "Mission 2" });
      MissionService.create(db, projectId, { title: "Mission 3" });
    });

    it("lists all missions", async () => {
      const response = await app.request(`/api/projects/${projectId}/missions`);

      expect(response.status).toBe(200);

      const body = (await response.json()) as ListResponse<MissionResponse>;
      expect(body.data.length).toBe(3);
      expect(body.meta.total).toBe(3);
    });

    it("supports pagination", async () => {
      const response = await app.request(
        `/api/projects/${projectId}/missions?limit=2`
      );

      expect(response.status).toBe(200);

      const body = (await response.json()) as ListResponse<MissionResponse>;
      expect(body.data.length).toBe(2);
      expect(body.meta.hasMore).toBe(true);
    });

    it("filters by status", async () => {
      const response = await app.request(
        `/api/projects/${projectId}/missions?status=planning`
      );

      expect(response.status).toBe(200);

      const body = (await response.json()) as ListResponse<MissionResponse>;
      expect(body.data.length).toBe(3);
      expect(body.data.every((m) => m.status === "planning")).toBe(true);
    });
  });

  describe("GET /api/missions/:id", () => {
    it("returns mission by ID", async () => {
      const db = DatabaseManager.getProjectDb(projectId);
      const { mission } = MissionService.create(db, projectId, { title: "Test Mission" });

      const response = await app.request(
        `/api/missions/${mission.id}?projectId=${projectId}`
      );

      expect(response.status).toBe(200);

      const body = (await response.json()) as ItemResponse<MissionResponse>;
      expect(body.data.id).toBe(mission.id);
      expect(body.data.title).toBe("Test Mission");
    });

    it("requires projectId", async () => {
      const response = await app.request("/api/missions/msn_test");

      expect(response.status).toBe(400);
    });

    it("returns 404 for non-existent mission", async () => {
      const response = await app.request(
        `/api/missions/msn_nonexistent?projectId=${projectId}`
      );

      expect(response.status).toBe(404);
    });
  });

  describe("POST /api/missions/:id/approve", () => {
    it("approves a mission plan", async () => {
      const db = DatabaseManager.getProjectDb(projectId);
      const { mission } = MissionService.create(db, projectId, { title: "Test Mission" });

      const response = await app.request(`/api/missions/${mission.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          userId: testUserId,
        }),
      });

      expect(response.status).toBe(200);

      const body = (await response.json()) as ItemResponse<MissionResponse>;
      expect(body.data.status).toBe("pending");
      expect(body.data.planApprovedAt).not.toBeNull();
      expect(body.data.planApprovedBy).toBe(testUserId);
    });

    it("requires userId", async () => {
      const db = DatabaseManager.getProjectDb(projectId);
      const { mission } = MissionService.create(db, projectId, { title: "Test Mission" });

      const response = await app.request(`/api/missions/${mission.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });

      expect(response.status).toBe(400);
    });

    it("rejects approval of non-planning mission", async () => {
      const db = DatabaseManager.getProjectDb(projectId);
      const { mission } = MissionService.create(db, projectId, { title: "Test Mission" });
      MissionService.approvePlan(db, mission.id, testUserId);

      const response = await app.request(`/api/missions/${mission.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          userId: testUserId,
        }),
      });

      expect(response.status).toBe(400);
    });
  });

  describe("POST /api/missions/:id/start", () => {
    it("starts a mission", async () => {
      const db = DatabaseManager.getProjectDb(projectId);
      const { mission } = MissionService.create(db, projectId, { title: "Test Mission" });
      MissionService.approvePlan(db, mission.id, testUserId);

      const response = await app.request(`/api/missions/${mission.id}/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });

      expect(response.status).toBe(200);

      const body = (await response.json()) as ItemResponse<MissionResponse>;
      expect(body.data.status).toBe("running");
      expect(body.data.sessionId).not.toBeNull();
      expect(body.data.startedAt).not.toBeNull();
    });

    it("rejects starting a planning mission", async () => {
      const db = DatabaseManager.getProjectDb(projectId);
      const { mission } = MissionService.create(db, projectId, { title: "Test Mission" });

      const response = await app.request(`/api/missions/${mission.id}/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });

      expect(response.status).toBe(400);
    });
  });

  describe("POST /api/missions/:id/pause", () => {
    it("pauses a running mission", async () => {
      const db = DatabaseManager.getProjectDb(projectId);
      const { mission } = MissionService.create(db, projectId, { title: "Test Mission" });
      MissionService.approvePlan(db, mission.id, testUserId);
      const session = SessionService.create(db, { title: "Mission Session" });
      MissionService.start(db, mission.id, session.id);

      const response = await app.request(`/api/missions/${mission.id}/pause`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });

      expect(response.status).toBe(200);

      const body = (await response.json()) as ItemResponse<MissionResponse>;
      expect(body.data.status).toBe("paused");
      expect(body.data.pausedAt).not.toBeNull();
    });
  });

  describe("POST /api/missions/:id/resume", () => {
    it("resumes a paused mission", async () => {
      const db = DatabaseManager.getProjectDb(projectId);
      const { mission } = MissionService.create(db, projectId, { title: "Test Mission" });
      MissionService.approvePlan(db, mission.id, testUserId);
      const session = SessionService.create(db, { title: "Mission Session" });
      MissionService.start(db, mission.id, session.id);
      MissionService.pause(db, mission.id);

      const response = await app.request(`/api/missions/${mission.id}/resume`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });

      expect(response.status).toBe(200);

      const body = (await response.json()) as ItemResponse<MissionResponse>;
      expect(body.data.status).toBe("running");
      expect(body.data.pausedAt).toBeNull();
    });
  });

  describe("POST /api/missions/:id/complete", () => {
    it("completes a running mission", async () => {
      const db = DatabaseManager.getProjectDb(projectId);
      const { mission } = MissionService.create(db, projectId, { title: "Test Mission" });
      MissionService.approvePlan(db, mission.id, testUserId);
      const session = SessionService.create(db, { title: "Mission Session" });
      MissionService.start(db, mission.id, session.id);

      const response = await app.request(`/api/missions/${mission.id}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          summary: "All tasks completed successfully",
          criteriaMet: true,
        }),
      });

      expect(response.status).toBe(200);

      const body = (await response.json()) as ItemResponse<MissionResponse>;
      expect(body.data.status).toBe("completed");
      expect(body.data.summary).toBe("All tasks completed successfully");
      expect(body.data.completionCriteriaMet).toBe(true);
    });

    it("requires summary", async () => {
      const db = DatabaseManager.getProjectDb(projectId);
      const { mission } = MissionService.create(db, projectId, { title: "Test Mission" });
      MissionService.approvePlan(db, mission.id, testUserId);
      const session = SessionService.create(db, { title: "Mission Session" });
      MissionService.start(db, mission.id, session.id);

      const response = await app.request(`/api/missions/${mission.id}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });

      expect(response.status).toBe(400);
    });
  });

  describe("POST /api/missions/:id/cancel", () => {
    it("cancels a mission", async () => {
      const db = DatabaseManager.getProjectDb(projectId);
      const { mission } = MissionService.create(db, projectId, { title: "Test Mission" });

      const response = await app.request(`/api/missions/${mission.id}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });

      expect(response.status).toBe(200);

      const body = (await response.json()) as ItemResponse<MissionResponse>;
      expect(body.data.status).toBe("cancelled");
    });
  });

  describe("DELETE /api/missions/:id", () => {
    it("deletes a planning mission", async () => {
      const db = DatabaseManager.getProjectDb(projectId);
      const { mission } = MissionService.create(db, projectId, { title: "Test Mission" });

      const response = await app.request(
        `/api/missions/${mission.id}?projectId=${projectId}`,
        {
          method: "DELETE",
        }
      );

      expect(response.status).toBe(200);

      const body = (await response.json()) as ItemResponse<{ deleted: boolean }>;
      expect(body.data.deleted).toBe(true);

      // Verify deletion
      const deleted = MissionService.getById(db, mission.id);
      expect(deleted).toBeNull();
    });

    it("rejects deletion of running mission", async () => {
      const db = DatabaseManager.getProjectDb(projectId);
      const { mission } = MissionService.create(db, projectId, { title: "Test Mission" });
      MissionService.approvePlan(db, mission.id, testUserId);
      const session = SessionService.create(db, { title: "Mission Session" });
      MissionService.start(db, mission.id, session.id);

      const response = await app.request(
        `/api/missions/${mission.id}?projectId=${projectId}`,
        {
          method: "DELETE",
        }
      );

      expect(response.status).toBe(400);
    });
  });

  describe("GET /api/missions/:id/tasks", () => {
    it("lists tasks for a mission", async () => {
      const db = DatabaseManager.getProjectDb(projectId);
      const { mission } = MissionService.create(db, projectId, { title: "Test Mission" });
      MissionService.approvePlan(db, mission.id, testUserId);
      const session = SessionService.create(db, { title: "Mission Session" });
      MissionService.start(db, mission.id, session.id);

      TaskService.create(db, session.id, {
        title: "Task 1",
        activeForm: "Working on Task 1",
        missionId: mission.id,
      });
      TaskService.create(db, session.id, {
        title: "Task 2",
        activeForm: "Working on Task 2",
        missionId: mission.id,
      });

      const response = await app.request(
        `/api/missions/${mission.id}/tasks?projectId=${projectId}`
      );

      expect(response.status).toBe(200);

      const body = (await response.json()) as ListResponse<TaskResponse>;
      expect(body.data.length).toBe(2);
      expect(body.meta.total).toBe(2);
    });
  });

  describe("POST /api/missions/:id/tasks", () => {
    it("creates a task in a mission", async () => {
      const db = DatabaseManager.getProjectDb(projectId);
      const { mission } = MissionService.create(db, projectId, { title: "Test Mission" });
      MissionService.approvePlan(db, mission.id, testUserId);
      const session = SessionService.create(db, { title: "Mission Session" });
      MissionService.start(db, mission.id, session.id);

      const response = await app.request(`/api/missions/${mission.id}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          title: "New Task",
          activeForm: "Working on New Task",
        }),
      });

      expect(response.status).toBe(201);

      const body = (await response.json()) as ItemResponse<TaskResponse>;
      expect(body.data.id).toMatch(/^task_/);
      expect(body.data.title).toBe("New Task");
      expect(body.data.missionId).toBe(mission.id);
    });

    it("rejects task creation without active session", async () => {
      const db = DatabaseManager.getProjectDb(projectId);
      const { mission } = MissionService.create(db, projectId, { title: "Test Mission" });

      const response = await app.request(`/api/missions/${mission.id}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          title: "New Task",
          activeForm: "Working on New Task",
        }),
      });

      expect(response.status).toBe(400);
    });
  });

  describe("PUT /api/missions/:id/title", () => {
    it("updates mission title", async () => {
      const db = DatabaseManager.getProjectDb(projectId);
      const { mission } = MissionService.create(db, projectId, { title: "Original Title" });

      const response = await app.request(`/api/missions/${mission.id}/title`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          title: "New Title",
        }),
      });

      expect(response.status).toBe(200);

      const body = (await response.json()) as ItemResponse<MissionResponse>;
      expect(body.data.title).toBe("New Title");
    });
  });
});
