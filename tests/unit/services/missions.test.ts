/**
 * Mission Service Tests
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { MissionService } from "@/services/missions.ts";
import { SessionService } from "@/services/sessions.ts";
import { runMigrations } from "@/database/migrations.ts";
import { PROJECT_MIGRATIONS } from "@/database/project-migrations.ts";
import { NotFoundError, ValidationError } from "@/utils/errors.ts";

describe("Mission Service", () => {
  let db: Database;
  const projectId = "prj_test-project";

  beforeEach(() => {
    db = new Database(":memory:");
    runMigrations(db, PROJECT_MIGRATIONS);
  });

  afterEach(() => {
    db.close();
  });

  describe("create", () => {
    it("creates a mission in planning state", () => {
      const { mission, planContent } = MissionService.create(db, projectId, {
        title: "Implement Authentication",
      });

      expect(mission.id).toMatch(/^msn_/);
      expect(mission.projectId).toBe(projectId);
      expect(mission.title).toBe("Implement Authentication");
      expect(mission.status).toBe("planning");
      expect(mission.planPath).toMatch(/\.botical\/missions\/implement-authentication\.md/);
      expect(mission.sessionId).toBeNull();
      expect(mission.planApprovedAt).toBeNull();
      expect(mission.planApprovedBy).toBeNull();
      expect(mission.startedAt).toBeNull();
      expect(mission.completedAt).toBeNull();
      expect(mission.completionCriteriaMet).toBe(false);
      expect(planContent).toContain("# Mission: Implement Authentication");
    });

    it("creates a mission with description", () => {
      const { mission, planContent } = MissionService.create(db, projectId, {
        title: "Add User Auth",
        description: "Implement JWT-based authentication",
      });

      expect(mission.title).toBe("Add User Auth");
      expect(planContent).toContain("Implement JWT-based authentication");
    });

    it("generates unique IDs", () => {
      const { mission: mission1 } = MissionService.create(db, projectId, {
        title: "First Mission",
      });
      const { mission: mission2 } = MissionService.create(db, projectId, {
        title: "Second Mission",
      });

      expect(mission1.id).not.toBe(mission2.id);
    });

    it("handles special characters in title for slug", () => {
      const { mission } = MissionService.create(db, projectId, {
        title: "Add @#$% Feature!!!",
      });

      expect(mission.planPath).toMatch(/\.botical\/missions\/add-feature\.md/);
    });
  });

  describe("getById", () => {
    it("retrieves a mission by ID", () => {
      const { mission: created } = MissionService.create(db, projectId, {
        title: "Test Mission",
      });

      const retrieved = MissionService.getById(db, created.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe(created.id);
      expect(retrieved?.title).toBe("Test Mission");
    });

    it("returns null for non-existent ID", () => {
      const result = MissionService.getById(db, "msn_nonexistent");
      expect(result).toBeNull();
    });
  });

  describe("getByIdOrThrow", () => {
    it("retrieves a mission or throws", () => {
      const { mission: created } = MissionService.create(db, projectId, {
        title: "Test Mission",
      });

      const retrieved = MissionService.getByIdOrThrow(db, created.id);
      expect(retrieved.id).toBe(created.id);
    });

    it("throws NotFoundError for non-existent ID", () => {
      expect(() => {
        MissionService.getByIdOrThrow(db, "msn_nonexistent");
      }).toThrow(NotFoundError);
    });
  });

  describe("list", () => {
    beforeEach(() => {
      MissionService.create(db, projectId, { title: "Mission 1" });
      MissionService.create(db, projectId, { title: "Mission 2" });
      MissionService.create(db, projectId, { title: "Mission 3" });
    });

    it("lists all missions for a project", () => {
      const missions = MissionService.list(db, projectId);
      expect(missions.length).toBe(3);
    });

    it("returns missions in newest-first order", () => {
      const missions = MissionService.list(db, projectId);
      expect(missions.length).toBe(3);
      // Verify newest-first order by checking IDs (descending IDs sort newest first alphabetically)
      expect(missions[0]!.id < missions[1]!.id).toBe(true);
      expect(missions[1]!.id < missions[2]!.id).toBe(true);
      // All missions should be present
      const titles = missions.map(m => m.title);
      expect(titles).toContain("Mission 1");
      expect(titles).toContain("Mission 2");
      expect(titles).toContain("Mission 3");
    });

    it("supports pagination", () => {
      const page1 = MissionService.list(db, projectId, { limit: 2 });
      expect(page1.length).toBe(2);

      const page2 = MissionService.list(db, projectId, { limit: 2, offset: 2 });
      expect(page2.length).toBe(1);
    });

    it("filters by status", () => {
      const planningMissions = MissionService.list(db, projectId, { status: "planning" });
      expect(planningMissions.length).toBe(3);

      const runningMissions = MissionService.list(db, projectId, { status: "running" });
      expect(runningMissions.length).toBe(0);
    });

    it("returns empty array for different project", () => {
      const missions = MissionService.list(db, "prj_other");
      expect(missions.length).toBe(0);
    });
  });

  describe("getActiveMissions", () => {
    it("returns only running and paused missions", () => {
      // Create missions in different states
      MissionService.create(db, projectId, { title: "Planning" });

      const { mission: toApprove } = MissionService.create(db, projectId, { title: "Pending" });
      MissionService.approvePlan(db, toApprove.id, "usr_test");

      const { mission: toRun } = MissionService.create(db, projectId, { title: "Running" });
      MissionService.approvePlan(db, toRun.id, "usr_test");
      const session = SessionService.create(db, { title: "Test Session" });
      MissionService.start(db, toRun.id, session.id);

      const { mission: toPause } = MissionService.create(db, projectId, { title: "Paused" });
      MissionService.approvePlan(db, toPause.id, "usr_test");
      const session2 = SessionService.create(db, { title: "Test Session 2" });
      MissionService.start(db, toPause.id, session2.id);
      MissionService.pause(db, toPause.id);

      const active = MissionService.getActiveMissions(db, projectId);
      expect(active.length).toBe(2);
      expect(active.map((m) => m.status).sort()).toEqual(["paused", "running"]);
    });
  });

  describe("count", () => {
    beforeEach(() => {
      MissionService.create(db, projectId, { title: "Mission 1" });
      MissionService.create(db, projectId, { title: "Mission 2" });
    });

    it("counts all missions for a project", () => {
      expect(MissionService.count(db, projectId)).toBe(2);
    });

    it("counts by status", () => {
      expect(MissionService.count(db, projectId, "planning")).toBe(2);
      expect(MissionService.count(db, projectId, "running")).toBe(0);
    });

    it("returns 0 for different project", () => {
      expect(MissionService.count(db, "prj_other")).toBe(0);
    });
  });

  describe("approvePlan", () => {
    it("transitions from planning to pending", () => {
      const { mission } = MissionService.create(db, projectId, {
        title: "Test Mission",
      });

      const approved = MissionService.approvePlan(db, mission.id, "usr_approver");

      expect(approved.status).toBe("pending");
      expect(approved.planApprovedAt).not.toBeNull();
      expect(approved.planApprovedBy).toBe("usr_approver");
    });

    it("throws if not in planning state", () => {
      const { mission } = MissionService.create(db, projectId, {
        title: "Test Mission",
      });

      MissionService.approvePlan(db, mission.id, "usr_test");

      expect(() => {
        MissionService.approvePlan(db, mission.id, "usr_test");
      }).toThrow(ValidationError);
    });
  });

  describe("start", () => {
    it("transitions from pending to running", () => {
      const { mission } = MissionService.create(db, projectId, {
        title: "Test Mission",
      });
      MissionService.approvePlan(db, mission.id, "usr_test");

      const session = SessionService.create(db, { title: "Mission Session" });
      const started = MissionService.start(db, mission.id, session.id);

      expect(started.status).toBe("running");
      expect(started.sessionId).toBe(session.id);
      expect(started.startedAt).not.toBeNull();
    });

    it("can restart from paused state", () => {
      const { mission } = MissionService.create(db, projectId, {
        title: "Test Mission",
      });
      MissionService.approvePlan(db, mission.id, "usr_test");

      const session = SessionService.create(db, { title: "Mission Session" });
      MissionService.start(db, mission.id, session.id);
      MissionService.pause(db, mission.id);

      const resumed = MissionService.start(db, mission.id, session.id);
      expect(resumed.status).toBe("running");
      expect(resumed.pausedAt).toBeNull();
    });

    it("throws if in planning state", () => {
      const { mission } = MissionService.create(db, projectId, {
        title: "Test Mission",
      });

      const session = SessionService.create(db, { title: "Mission Session" });

      expect(() => {
        MissionService.start(db, mission.id, session.id);
      }).toThrow(ValidationError);
    });

    it("throws if already completed", () => {
      const { mission } = MissionService.create(db, projectId, {
        title: "Test Mission",
      });
      MissionService.approvePlan(db, mission.id, "usr_test");
      const session = SessionService.create(db, { title: "Mission Session" });
      MissionService.start(db, mission.id, session.id);
      MissionService.complete(db, mission.id, "Done", true);

      expect(() => {
        MissionService.start(db, mission.id, session.id);
      }).toThrow(ValidationError);
    });
  });

  describe("pause", () => {
    it("transitions from running to paused", () => {
      const { mission } = MissionService.create(db, projectId, {
        title: "Test Mission",
      });
      MissionService.approvePlan(db, mission.id, "usr_test");
      const session = SessionService.create(db, { title: "Mission Session" });
      MissionService.start(db, mission.id, session.id);

      const paused = MissionService.pause(db, mission.id);

      expect(paused.status).toBe("paused");
      expect(paused.pausedAt).not.toBeNull();
    });

    it("throws if not running", () => {
      const { mission } = MissionService.create(db, projectId, {
        title: "Test Mission",
      });

      expect(() => {
        MissionService.pause(db, mission.id);
      }).toThrow(ValidationError);
    });
  });

  describe("resume", () => {
    it("transitions from paused to running", () => {
      const { mission } = MissionService.create(db, projectId, {
        title: "Test Mission",
      });
      MissionService.approvePlan(db, mission.id, "usr_test");
      const session = SessionService.create(db, { title: "Mission Session" });
      MissionService.start(db, mission.id, session.id);
      MissionService.pause(db, mission.id);

      const resumed = MissionService.resume(db, mission.id);

      expect(resumed.status).toBe("running");
      expect(resumed.pausedAt).toBeNull();
    });

    it("throws if not paused", () => {
      const { mission } = MissionService.create(db, projectId, {
        title: "Test Mission",
      });
      MissionService.approvePlan(db, mission.id, "usr_test");
      const session = SessionService.create(db, { title: "Mission Session" });
      MissionService.start(db, mission.id, session.id);

      expect(() => {
        MissionService.resume(db, mission.id);
      }).toThrow(ValidationError);
    });
  });

  describe("complete", () => {
    it("transitions from running to completed", () => {
      const { mission } = MissionService.create(db, projectId, {
        title: "Test Mission",
      });
      MissionService.approvePlan(db, mission.id, "usr_test");
      const session = SessionService.create(db, { title: "Mission Session" });
      MissionService.start(db, mission.id, session.id);

      const completed = MissionService.complete(db, mission.id, "All tasks done", true);

      expect(completed.status).toBe("completed");
      expect(completed.completedAt).not.toBeNull();
      expect(completed.summary).toBe("All tasks done");
      expect(completed.completionCriteriaMet).toBe(true);
    });

    it("can complete without meeting criteria", () => {
      const { mission } = MissionService.create(db, projectId, {
        title: "Test Mission",
      });
      MissionService.approvePlan(db, mission.id, "usr_test");
      const session = SessionService.create(db, { title: "Mission Session" });
      MissionService.start(db, mission.id, session.id);

      const completed = MissionService.complete(db, mission.id, "Partial completion", false);

      expect(completed.completionCriteriaMet).toBe(false);
    });

    it("throws if not running", () => {
      const { mission } = MissionService.create(db, projectId, {
        title: "Test Mission",
      });

      expect(() => {
        MissionService.complete(db, mission.id, "Done", true);
      }).toThrow(ValidationError);
    });
  });

  describe("cancel", () => {
    it("can cancel from planning state", () => {
      const { mission } = MissionService.create(db, projectId, {
        title: "Test Mission",
      });

      const cancelled = MissionService.cancel(db, mission.id);

      expect(cancelled.status).toBe("cancelled");
      expect(cancelled.completedAt).not.toBeNull();
    });

    it("can cancel from pending state", () => {
      const { mission } = MissionService.create(db, projectId, {
        title: "Test Mission",
      });
      MissionService.approvePlan(db, mission.id, "usr_test");

      const cancelled = MissionService.cancel(db, mission.id);
      expect(cancelled.status).toBe("cancelled");
    });

    it("can cancel from running state", () => {
      const { mission } = MissionService.create(db, projectId, {
        title: "Test Mission",
      });
      MissionService.approvePlan(db, mission.id, "usr_test");
      const session = SessionService.create(db, { title: "Mission Session" });
      MissionService.start(db, mission.id, session.id);

      const cancelled = MissionService.cancel(db, mission.id);
      expect(cancelled.status).toBe("cancelled");
    });

    it("can cancel from paused state", () => {
      const { mission } = MissionService.create(db, projectId, {
        title: "Test Mission",
      });
      MissionService.approvePlan(db, mission.id, "usr_test");
      const session = SessionService.create(db, { title: "Mission Session" });
      MissionService.start(db, mission.id, session.id);
      MissionService.pause(db, mission.id);

      const cancelled = MissionService.cancel(db, mission.id);
      expect(cancelled.status).toBe("cancelled");
    });

    it("throws if already completed", () => {
      const { mission } = MissionService.create(db, projectId, {
        title: "Test Mission",
      });
      MissionService.approvePlan(db, mission.id, "usr_test");
      const session = SessionService.create(db, { title: "Mission Session" });
      MissionService.start(db, mission.id, session.id);
      MissionService.complete(db, mission.id, "Done", true);

      expect(() => {
        MissionService.cancel(db, mission.id);
      }).toThrow(ValidationError);
    });

    it("throws if already cancelled", () => {
      const { mission } = MissionService.create(db, projectId, {
        title: "Test Mission",
      });
      MissionService.cancel(db, mission.id);

      expect(() => {
        MissionService.cancel(db, mission.id);
      }).toThrow(ValidationError);
    });
  });

  describe("delete", () => {
    it("deletes a planning mission", () => {
      const { mission } = MissionService.create(db, projectId, {
        title: "Test Mission",
      });

      MissionService.delete(db, mission.id);

      const retrieved = MissionService.getById(db, mission.id);
      expect(retrieved).toBeNull();
    });

    it("deletes a cancelled mission", () => {
      const { mission } = MissionService.create(db, projectId, {
        title: "Test Mission",
      });
      MissionService.cancel(db, mission.id);

      MissionService.delete(db, mission.id);

      const retrieved = MissionService.getById(db, mission.id);
      expect(retrieved).toBeNull();
    });

    it("throws for non-existent mission", () => {
      expect(() => {
        MissionService.delete(db, "msn_nonexistent");
      }).toThrow(NotFoundError);
    });

    it("throws if mission is running", () => {
      const { mission } = MissionService.create(db, projectId, {
        title: "Test Mission",
      });
      MissionService.approvePlan(db, mission.id, "usr_test");
      const session = SessionService.create(db, { title: "Mission Session" });
      MissionService.start(db, mission.id, session.id);

      expect(() => {
        MissionService.delete(db, mission.id);
      }).toThrow(ValidationError);
    });

    it("throws if mission is completed", () => {
      const { mission } = MissionService.create(db, projectId, {
        title: "Test Mission",
      });
      MissionService.approvePlan(db, mission.id, "usr_test");
      const session = SessionService.create(db, { title: "Mission Session" });
      MissionService.start(db, mission.id, session.id);
      MissionService.complete(db, mission.id, "Done", true);

      expect(() => {
        MissionService.delete(db, mission.id);
      }).toThrow(ValidationError);
    });
  });

  describe("updateTitle", () => {
    it("updates the mission title", () => {
      const { mission } = MissionService.create(db, projectId, {
        title: "Original Title",
      });

      const updated = MissionService.updateTitle(db, mission.id, "New Title");

      expect(updated.title).toBe("New Title");
    });

    it("throws for empty title", () => {
      const { mission } = MissionService.create(db, projectId, {
        title: "Test Mission",
      });

      expect(() => {
        MissionService.updateTitle(db, mission.id, "");
      }).toThrow(ValidationError);
    });

    it("throws for title exceeding max length", () => {
      const { mission } = MissionService.create(db, projectId, {
        title: "Test Mission",
      });

      expect(() => {
        MissionService.updateTitle(db, mission.id, "a".repeat(501));
      }).toThrow(ValidationError);
    });

    it("throws for non-existent mission", () => {
      expect(() => {
        MissionService.updateTitle(db, "msn_nonexistent", "New Title");
      }).toThrow(NotFoundError);
    });
  });

  describe("project isolation", () => {
    it("isolates missions between projects", () => {
      MissionService.create(db, "prj_project1", { title: "Project 1 Mission" });
      MissionService.create(db, "prj_project2", { title: "Project 2 Mission" });

      const project1Missions = MissionService.list(db, "prj_project1");
      const project2Missions = MissionService.list(db, "prj_project2");

      expect(project1Missions.length).toBe(1);
      expect(project2Missions.length).toBe(1);
      expect(project1Missions[0]!.title).toBe("Project 1 Mission");
      expect(project2Missions[0]!.title).toBe("Project 2 Mission");
    });
  });

  describe("lifecycle state machine", () => {
    it("follows complete happy path: planning → pending → running → completed", () => {
      const { mission } = MissionService.create(db, projectId, {
        title: "Full Lifecycle Mission",
      });
      expect(mission.status).toBe("planning");

      const approved = MissionService.approvePlan(db, mission.id, "usr_test");
      expect(approved.status).toBe("pending");

      const session = SessionService.create(db, { title: "Mission Session" });
      const started = MissionService.start(db, mission.id, session.id);
      expect(started.status).toBe("running");

      const completed = MissionService.complete(db, mission.id, "All done", true);
      expect(completed.status).toBe("completed");
    });

    it("allows pause/resume cycle", () => {
      const { mission } = MissionService.create(db, projectId, {
        title: "Pausable Mission",
      });
      MissionService.approvePlan(db, mission.id, "usr_test");
      const session = SessionService.create(db, { title: "Mission Session" });
      MissionService.start(db, mission.id, session.id);

      const paused = MissionService.pause(db, mission.id);
      expect(paused.status).toBe("paused");

      const resumed = MissionService.resume(db, mission.id);
      expect(resumed.status).toBe("running");

      const pausedAgain = MissionService.pause(db, mission.id);
      expect(pausedAgain.status).toBe("paused");

      const resumedAgain = MissionService.resume(db, mission.id);
      expect(resumedAgain.status).toBe("running");
    });
  });
});
