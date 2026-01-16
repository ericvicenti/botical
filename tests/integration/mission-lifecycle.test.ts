/**
 * Mission Lifecycle Integration Tests
 *
 * Tests the complete mission system including lifecycle management,
 * task integration, and state transitions.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { DatabaseManager } from "@/database/manager.ts";
import { Config } from "@/config/index.ts";
import { MissionService } from "@/services/missions.ts";
import { TaskService } from "@/services/tasks.ts";
import { SessionService } from "@/services/sessions.ts";
import { ValidationError, NotFoundError } from "@/utils/errors.ts";
import fs from "fs";
import path from "path";

describe("Mission Lifecycle Integration", () => {
  const testDataDir = path.join(
    import.meta.dirname,
    "../.test-data/mission-lifecycle"
  );
  const testProjectId = "prj_test-mission-lifecycle";

  beforeEach(async () => {
    DatabaseManager.closeAll();
    Config.load({ dataDir: testDataDir });

    if (fs.existsSync(testDataDir)) {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    }

    await DatabaseManager.initialize();
  });

  afterEach(() => {
    DatabaseManager.closeAll();
    if (fs.existsSync(testDataDir)) {
      fs.rmSync(testDataDir, { recursive: true, force: true });
    }
  });

  describe("full mission lifecycle", () => {
    it("completes happy path: planning → pending → running → completed", () => {
      const db = DatabaseManager.getProjectDb(testProjectId);

      // Create mission - starts in planning
      const { mission, planContent } = MissionService.create(db, testProjectId, {
        title: "Implement User Authentication",
        description: "Add JWT-based authentication to the API",
      });

      expect(mission.status).toBe("planning");
      expect(mission.planPath).toContain("implement-user-authentication.md");
      expect(planContent).toContain("# Mission: Implement User Authentication");
      expect(planContent).toContain("Add JWT-based authentication to the API");

      // Approve plan - transitions to pending
      const approved = MissionService.approvePlan(db, mission.id, "usr_admin");
      expect(approved.status).toBe("pending");
      expect(approved.planApprovedAt).not.toBeNull();
      expect(approved.planApprovedBy).toBe("usr_admin");

      // Start execution - transitions to running, creates session
      const session = SessionService.create(db, { title: "Auth Implementation Session" });
      const started = MissionService.start(db, mission.id, session.id);
      expect(started.status).toBe("running");
      expect(started.sessionId).toBe(session.id);
      expect(started.startedAt).not.toBeNull();

      // Complete mission
      const completed = MissionService.complete(
        db,
        mission.id,
        "Successfully implemented JWT authentication with refresh tokens",
        true
      );
      expect(completed.status).toBe("completed");
      expect(completed.completedAt).not.toBeNull();
      expect(completed.summary).toContain("JWT authentication");
      expect(completed.completionCriteriaMet).toBe(true);
    });

    it("handles pause and resume workflow", () => {
      const db = DatabaseManager.getProjectDb(testProjectId);

      // Setup: create and start mission
      const { mission } = MissionService.create(db, testProjectId, {
        title: "Feature Development",
      });
      MissionService.approvePlan(db, mission.id, "usr_admin");
      const session = SessionService.create(db, { title: "Development Session" });
      MissionService.start(db, mission.id, session.id);

      // Pause mission
      const paused = MissionService.pause(db, mission.id);
      expect(paused.status).toBe("paused");
      expect(paused.pausedAt).not.toBeNull();

      // Resume mission
      const resumed = MissionService.resume(db, mission.id);
      expect(resumed.status).toBe("running");
      expect(resumed.pausedAt).toBeNull();

      // Can pause and resume multiple times
      MissionService.pause(db, mission.id);
      expect(MissionService.getById(db, mission.id)?.status).toBe("paused");
      MissionService.resume(db, mission.id);
      expect(MissionService.getById(db, mission.id)?.status).toBe("running");
    });

    it("allows cancellation from any non-terminal state", () => {
      const db = DatabaseManager.getProjectDb(testProjectId);

      // Cancel from planning
      const { mission: mission1 } = MissionService.create(db, testProjectId, {
        title: "Cancel from planning",
      });
      MissionService.cancel(db, mission1.id);
      expect(MissionService.getById(db, mission1.id)?.status).toBe("cancelled");

      // Cancel from pending
      const { mission: mission2 } = MissionService.create(db, testProjectId, {
        title: "Cancel from pending",
      });
      MissionService.approvePlan(db, mission2.id, "usr_admin");
      MissionService.cancel(db, mission2.id);
      expect(MissionService.getById(db, mission2.id)?.status).toBe("cancelled");

      // Cancel from running
      const { mission: mission3 } = MissionService.create(db, testProjectId, {
        title: "Cancel from running",
      });
      MissionService.approvePlan(db, mission3.id, "usr_admin");
      const session = SessionService.create(db, { title: "Session" });
      MissionService.start(db, mission3.id, session.id);
      MissionService.cancel(db, mission3.id);
      expect(MissionService.getById(db, mission3.id)?.status).toBe("cancelled");

      // Cancel from paused
      const { mission: mission4 } = MissionService.create(db, testProjectId, {
        title: "Cancel from paused",
      });
      MissionService.approvePlan(db, mission4.id, "usr_admin");
      const session2 = SessionService.create(db, { title: "Session 2" });
      MissionService.start(db, mission4.id, session2.id);
      MissionService.pause(db, mission4.id);
      MissionService.cancel(db, mission4.id);
      expect(MissionService.getById(db, mission4.id)?.status).toBe("cancelled");
    });
  });

  describe("mission with tasks", () => {
    it("creates and manages tasks within a mission", () => {
      const db = DatabaseManager.getProjectDb(testProjectId);

      // Setup mission
      const { mission } = MissionService.create(db, testProjectId, {
        title: "Multi-task Mission",
      });
      MissionService.approvePlan(db, mission.id, "usr_admin");
      const session = SessionService.create(db, { title: "Mission Session" });
      MissionService.start(db, mission.id, session.id);

      // Create tasks within the mission
      const task1 = TaskService.create(db, session.id, {
        title: "Setup project structure",
        activeForm: "Setting up project structure",
        missionId: mission.id,
      });

      const task2 = TaskService.create(db, session.id, {
        title: "Implement core logic",
        activeForm: "Implementing core logic",
        missionId: mission.id,
      });

      const task3 = TaskService.create(db, session.id, {
        title: "Write tests",
        activeForm: "Writing tests",
        missionId: mission.id,
      });

      // Verify tasks are associated with mission
      const missionTasks = TaskService.listByMission(db, mission.id);
      expect(missionTasks.length).toBe(3);
      expect(missionTasks.every((t) => t.missionId === mission.id)).toBe(true);

      // Work through tasks
      TaskService.start(db, task1.id);
      expect(TaskService.getById(db, task1.id)?.status).toBe("in_progress");

      TaskService.complete(db, task1.id, "Project structure created");
      expect(TaskService.getById(db, task1.id)?.status).toBe("completed");

      TaskService.start(db, task2.id);
      TaskService.complete(db, task2.id);

      TaskService.start(db, task3.id);
      TaskService.complete(db, task3.id);

      // All tasks completed
      expect(TaskService.countByMission(db, mission.id, "completed")).toBe(3);

      // Complete mission
      MissionService.complete(db, mission.id, "All tasks completed", true);
      expect(MissionService.getById(db, mission.id)?.status).toBe("completed");
    });

    it("mission tasks can be blocked", () => {
      const db = DatabaseManager.getProjectDb(testProjectId);

      // Setup mission with session
      const { mission } = MissionService.create(db, testProjectId, {
        title: "Blocking Test Mission",
      });
      MissionService.approvePlan(db, mission.id, "usr_admin");
      const session = SessionService.create(db, { title: "Mission Session" });
      MissionService.start(db, mission.id, session.id);

      // Create task
      const task = TaskService.create(db, session.id, {
        title: "Dependent task",
        activeForm: "Working on dependent task",
        missionId: mission.id,
      });

      // Start then block
      TaskService.start(db, task.id);
      TaskService.block(db, task.id, "Waiting for external API");

      expect(TaskService.getById(db, task.id)?.status).toBe("blocked");
      expect(TaskService.getById(db, task.id)?.result).toBe("Waiting for external API");
    });

    it("deleting mission cleans up associated tasks", () => {
      const db = DatabaseManager.getProjectDb(testProjectId);

      // Create mission with tasks
      const { mission } = MissionService.create(db, testProjectId, {
        title: "Mission to delete",
      });

      // Cancel mission first (required for deletion)
      MissionService.cancel(db, mission.id);

      // Delete mission - since it was cancelled without starting, there are no tasks
      MissionService.delete(db, mission.id);
      expect(MissionService.getById(db, mission.id)).toBeNull();
    });
  });

  describe("multiple missions", () => {
    it("manages multiple missions concurrently", () => {
      const db = DatabaseManager.getProjectDb(testProjectId);

      // Create multiple missions
      const { mission: mission1 } = MissionService.create(db, testProjectId, {
        title: "Mission Alpha",
      });
      const { mission: mission2 } = MissionService.create(db, testProjectId, {
        title: "Mission Beta",
      });
      const { mission: mission3 } = MissionService.create(db, testProjectId, {
        title: "Mission Gamma",
      });

      // Different states for each
      MissionService.approvePlan(db, mission1.id, "usr_admin");
      const session1 = SessionService.create(db, { title: "Alpha Session" });
      MissionService.start(db, mission1.id, session1.id);

      MissionService.approvePlan(db, mission2.id, "usr_admin");
      const session2 = SessionService.create(db, { title: "Beta Session" });
      MissionService.start(db, mission2.id, session2.id);
      MissionService.pause(db, mission2.id);

      // mission3 stays in planning

      // Check active missions
      const active = MissionService.getActiveMissions(db, testProjectId);
      expect(active.length).toBe(2);
      expect(active.map((m) => m.status).sort()).toEqual(["paused", "running"]);

      // Count by status
      expect(MissionService.count(db, testProjectId, "planning")).toBe(1);
      expect(MissionService.count(db, testProjectId, "running")).toBe(1);
      expect(MissionService.count(db, testProjectId, "paused")).toBe(1);
    });

    it("lists missions with filtering", () => {
      const db = DatabaseManager.getProjectDb(testProjectId);

      // Create missions in different states
      MissionService.create(db, testProjectId, { title: "Planning 1" });
      MissionService.create(db, testProjectId, { title: "Planning 2" });

      const { mission: approved } = MissionService.create(db, testProjectId, {
        title: "Pending",
      });
      MissionService.approvePlan(db, approved.id, "usr_admin");

      const { mission: running } = MissionService.create(db, testProjectId, {
        title: "Running",
      });
      MissionService.approvePlan(db, running.id, "usr_admin");
      const session = SessionService.create(db, { title: "Session" });
      MissionService.start(db, running.id, session.id);

      // Test filtering
      const planningMissions = MissionService.list(db, testProjectId, { status: "planning" });
      expect(planningMissions.length).toBe(2);

      const pendingMissions = MissionService.list(db, testProjectId, { status: "pending" });
      expect(pendingMissions.length).toBe(1);

      const runningMissions = MissionService.list(db, testProjectId, { status: "running" });
      expect(runningMissions.length).toBe(1);
    });
  });

  describe("state transition validation", () => {
    it("rejects invalid state transitions", () => {
      const db = DatabaseManager.getProjectDb(testProjectId);
      const { mission } = MissionService.create(db, testProjectId, {
        title: "State Test Mission",
      });

      // Cannot start without approval
      expect(() => {
        const session = SessionService.create(db, { title: "Session" });
        MissionService.start(db, mission.id, session.id);
      }).toThrow(ValidationError);

      // Cannot pause if not running
      expect(() => {
        MissionService.pause(db, mission.id);
      }).toThrow(ValidationError);

      // Cannot resume if not paused
      expect(() => {
        MissionService.resume(db, mission.id);
      }).toThrow(ValidationError);

      // Cannot complete if not running
      expect(() => {
        MissionService.complete(db, mission.id, "Done", true);
      }).toThrow(ValidationError);
    });

    it("prevents re-approving already approved plan", () => {
      const db = DatabaseManager.getProjectDb(testProjectId);
      const { mission } = MissionService.create(db, testProjectId, {
        title: "Double Approve Test",
      });

      MissionService.approvePlan(db, mission.id, "usr_admin");

      expect(() => {
        MissionService.approvePlan(db, mission.id, "usr_other");
      }).toThrow(ValidationError);
    });

    it("prevents cancelling terminal states", () => {
      const db = DatabaseManager.getProjectDb(testProjectId);

      // Test completed mission
      const { mission: completed } = MissionService.create(db, testProjectId, {
        title: "Completed Mission",
      });
      MissionService.approvePlan(db, completed.id, "usr_admin");
      const session = SessionService.create(db, { title: "Session" });
      MissionService.start(db, completed.id, session.id);
      MissionService.complete(db, completed.id, "Done", true);

      expect(() => {
        MissionService.cancel(db, completed.id);
      }).toThrow(ValidationError);

      // Test already cancelled mission
      const { mission: cancelled } = MissionService.create(db, testProjectId, {
        title: "Cancelled Mission",
      });
      MissionService.cancel(db, cancelled.id);

      expect(() => {
        MissionService.cancel(db, cancelled.id);
      }).toThrow(ValidationError);
    });

    it("prevents deleting non-deletable missions", () => {
      const db = DatabaseManager.getProjectDb(testProjectId);

      // Cannot delete pending mission
      const { mission: pending } = MissionService.create(db, testProjectId, {
        title: "Pending Mission",
      });
      MissionService.approvePlan(db, pending.id, "usr_admin");

      expect(() => {
        MissionService.delete(db, pending.id);
      }).toThrow(ValidationError);

      // Cannot delete running mission
      const { mission: running } = MissionService.create(db, testProjectId, {
        title: "Running Mission",
      });
      MissionService.approvePlan(db, running.id, "usr_admin");
      const session = SessionService.create(db, { title: "Session" });
      MissionService.start(db, running.id, session.id);

      expect(() => {
        MissionService.delete(db, running.id);
      }).toThrow(ValidationError);

      // Cannot delete completed mission
      MissionService.complete(db, running.id, "Done", true);

      expect(() => {
        MissionService.delete(db, running.id);
      }).toThrow(ValidationError);
    });
  });

  describe("project isolation", () => {
    it("isolates missions between projects", () => {
      const project1 = "prj_project-1";
      const project2 = "prj_project-2";

      const db1 = DatabaseManager.getProjectDb(project1);
      const db2 = DatabaseManager.getProjectDb(project2);

      MissionService.create(db1, project1, { title: "Project 1 Mission" });
      MissionService.create(db2, project2, { title: "Project 2 Mission A" });
      MissionService.create(db2, project2, { title: "Project 2 Mission B" });

      expect(MissionService.count(db1, project1)).toBe(1);
      expect(MissionService.count(db2, project2)).toBe(2);

      expect(MissionService.list(db1, project1).length).toBe(1);
      expect(MissionService.list(db2, project2).length).toBe(2);
    });
  });

  describe("typical workflow simulation", () => {
    it("simulates a complete autonomous mission workflow", () => {
      const db = DatabaseManager.getProjectDb(testProjectId);

      // 1. User creates a mission request
      const { mission, planContent } = MissionService.create(db, testProjectId, {
        title: "Refactor Authentication Module",
        description: "Modernize the auth module to use OAuth 2.0",
      });

      expect(mission.status).toBe("planning");
      expect(planContent).toContain("Modernize the auth module");

      // 2. Agent drafts plan (plan content would be updated externally)
      // In real scenario, agent would update the markdown file

      // 3. User reviews and approves plan
      MissionService.approvePlan(db, mission.id, "usr_reviewer");
      expect(MissionService.getById(db, mission.id)?.status).toBe("pending");

      // 4. System starts mission execution
      const session = SessionService.create(db, {
        title: `Mission: ${mission.title}`,
        agent: "default",
      });
      MissionService.start(db, mission.id, session.id);
      expect(MissionService.getById(db, mission.id)?.status).toBe("running");

      // 5. Agent creates tasks during execution
      const tasks = [
        { title: "Analyze current auth implementation", activeForm: "Analyzing auth" },
        { title: "Design OAuth 2.0 integration", activeForm: "Designing OAuth" },
        { title: "Implement OAuth provider", activeForm: "Implementing OAuth" },
        { title: "Update API endpoints", activeForm: "Updating endpoints" },
        { title: "Write integration tests", activeForm: "Writing tests" },
        { title: "Update documentation", activeForm: "Updating docs" },
      ];

      for (const t of tasks) {
        TaskService.create(db, session.id, { ...t, missionId: mission.id });
      }

      expect(TaskService.countByMission(db, mission.id)).toBe(6);

      // 6. Agent works through tasks
      const missionTasks = TaskService.listByMission(db, mission.id);
      for (const task of missionTasks) {
        TaskService.start(db, task.id);
        // Simulate work...
        TaskService.complete(db, task.id, `Completed: ${task.title}`);
      }

      expect(TaskService.countByMission(db, mission.id, "completed")).toBe(6);

      // 7. Mission completed successfully
      MissionService.complete(
        db,
        mission.id,
        "Successfully refactored auth module to OAuth 2.0. All tests passing.",
        true
      );

      const finalMission = MissionService.getById(db, mission.id);
      expect(finalMission?.status).toBe("completed");
      expect(finalMission?.completionCriteriaMet).toBe(true);
      expect(finalMission?.summary).toContain("OAuth 2.0");
    });

    it("handles mission interruption and recovery", () => {
      const db = DatabaseManager.getProjectDb(testProjectId);

      // Create and start mission
      const { mission } = MissionService.create(db, testProjectId, {
        title: "Long Running Mission",
      });
      MissionService.approvePlan(db, mission.id, "usr_admin");
      const session = SessionService.create(db, { title: "Session" });
      MissionService.start(db, mission.id, session.id);

      // Create some tasks
      TaskService.create(db, session.id, {
        title: "Task 1",
        activeForm: "Working on task 1",
        missionId: mission.id,
      });
      const task2 = TaskService.create(db, session.id, {
        title: "Task 2",
        activeForm: "Working on task 2",
        missionId: mission.id,
        status: "in_progress",
      });

      // User pauses mission
      MissionService.pause(db, mission.id);
      expect(MissionService.getById(db, mission.id)?.status).toBe("paused");

      // Task remains in_progress (pausing mission doesn't affect task state)
      expect(TaskService.getById(db, task2.id)?.status).toBe("in_progress");

      // Later, user resumes
      MissionService.resume(db, mission.id);
      expect(MissionService.getById(db, mission.id)?.status).toBe("running");

      // Agent can continue working
      TaskService.complete(db, task2.id);
      expect(TaskService.getById(db, task2.id)?.status).toBe("completed");
    });
  });
});
