/**
 * ProcessService Unit Tests
 *
 * Note: Some tests require real PTY spawning which may fail in
 * certain environments. See integration tests for full lifecycle testing.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import {
  ProcessService,
  SpawnProcessSchema,
  type ProcessType,
  type ProcessStatus,
} from "@/services/processes.ts";
import { SessionService } from "@/services/sessions.ts";
import { runMigrations } from "@/database/migrations.ts";
import { PROJECT_MIGRATIONS } from "@/database/project-migrations.ts";
import { NotFoundError, ValidationError } from "@/utils/errors.ts";

describe("Process Service", () => {
  let db: Database;
  let sessionId: string;
  const projectId = "prj_test-project-123";

  beforeEach(() => {
    // Create in-memory database with migrations
    db = new Database(":memory:");
    runMigrations(db, PROJECT_MIGRATIONS);

    // Create a test session
    const session = SessionService.create(db, { title: "Test Session" });
    sessionId = session.id;
  });

  afterEach(() => {
    db.close();
  });

  describe("SpawnProcessSchema", () => {
    it("validates required fields", () => {
      const validInput = {
        projectId: "prj_test",
        type: "command" as const,
        command: "echo hello",
        scope: "project" as const,
        scopeId: "prj_test",
        createdBy: "usr_test",
      };

      const result = SpawnProcessSchema.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it("rejects empty command", () => {
      const invalidInput = {
        projectId: "prj_test",
        type: "command",
        command: "",
        scope: "project",
        scopeId: "prj_test",
        createdBy: "usr_test",
      };

      const result = SpawnProcessSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });

    it("rejects invalid type", () => {
      const invalidInput = {
        projectId: "prj_test",
        type: "invalid",
        command: "echo hello",
        scope: "project",
        scopeId: "prj_test",
        createdBy: "usr_test",
      };

      const result = SpawnProcessSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });

    it("rejects invalid scope", () => {
      const invalidInput = {
        projectId: "prj_test",
        type: "command",
        command: "echo hello",
        scope: "invalid",
        scopeId: "prj_test",
        createdBy: "usr_test",
      };

      const result = SpawnProcessSchema.safeParse(invalidInput);
      expect(result.success).toBe(false);
    });

    it("applies default values", () => {
      const input = {
        projectId: "prj_test",
        type: "command" as const,
        command: "echo hello",
        scope: "project" as const,
        scopeId: "prj_test",
        createdBy: "usr_test",
      };

      const result = SpawnProcessSchema.parse(input);
      expect(result.cols).toBe(80);
      expect(result.rows).toBe(24);
    });

    it("accepts custom dimensions", () => {
      const input = {
        projectId: "prj_test",
        type: "command" as const,
        command: "echo hello",
        scope: "project" as const,
        scopeId: "prj_test",
        createdBy: "usr_test",
        cols: 120,
        rows: 40,
      };

      const result = SpawnProcessSchema.parse(input);
      expect(result.cols).toBe(120);
      expect(result.rows).toBe(40);
    });

    it("accepts environment variables", () => {
      const input = {
        projectId: "prj_test",
        type: "command" as const,
        command: "echo hello",
        scope: "project" as const,
        scopeId: "prj_test",
        createdBy: "usr_test",
        env: { TEST: "value" },
      };

      const result = SpawnProcessSchema.parse(input);
      expect(result.env).toEqual({ TEST: "value" });
    });
  });

  describe("getById", () => {
    it("returns null for non-existent ID", () => {
      const result = ProcessService.getById(db, "proc_nonexistent");
      expect(result).toBeNull();
    });
  });

  describe("getByIdOrThrow", () => {
    it("throws NotFoundError for non-existent ID", () => {
      expect(() => {
        ProcessService.getByIdOrThrow(db, "proc_nonexistent");
      }).toThrow(NotFoundError);
    });
  });

  describe("listByProject", () => {
    it("returns empty array for project with no processes", () => {
      const processes = ProcessService.listByProject(db, projectId);
      expect(processes).toEqual([]);
    });

    it("returns empty array for non-existent project", () => {
      const processes = ProcessService.listByProject(db, "prj_nonexistent");
      expect(processes).toEqual([]);
    });
  });

  describe("count", () => {
    it("returns 0 for project with no processes", () => {
      expect(ProcessService.count(db, projectId)).toBe(0);
    });

    it("returns 0 for non-existent project", () => {
      expect(ProcessService.count(db, "prj_nonexistent")).toBe(0);
    });
  });

  describe("listRunning", () => {
    it("returns empty array when no running processes", () => {
      const running = ProcessService.listRunning(db);
      expect(running).toEqual([]);
    });
  });

  describe("getOutput", () => {
    it("throws NotFoundError for non-existent process", () => {
      expect(() => {
        ProcessService.getOutput(db, "proc_nonexistent");
      }).toThrow(NotFoundError);
    });
  });

  describe("getOutputText", () => {
    it("throws NotFoundError for non-existent process", () => {
      expect(() => {
        ProcessService.getOutputText(db, "proc_nonexistent");
      }).toThrow(NotFoundError);
    });
  });

  describe("kill", () => {
    it("throws NotFoundError for non-existent process", () => {
      expect(() => {
        ProcessService.kill(db, "proc_nonexistent");
      }).toThrow(NotFoundError);
    });
  });

  describe("write", () => {
    it("throws NotFoundError for non-existent process", () => {
      expect(() => {
        ProcessService.write(db, "proc_nonexistent", "data");
      }).toThrow(NotFoundError);
    });
  });

  describe("resize", () => {
    it("throws NotFoundError for non-existent process", () => {
      expect(() => {
        ProcessService.resize(db, "proc_nonexistent", 80, 24);
      }).toThrow(NotFoundError);
    });
  });

  describe("delete", () => {
    it("throws NotFoundError for non-existent process", () => {
      expect(() => {
        ProcessService.delete(db, "proc_nonexistent");
      }).toThrow(NotFoundError);
    });
  });

  describe("killByScope", () => {
    it("returns 0 when no processes in scope", () => {
      const killed = ProcessService.killByScope(db, "mission", "msn_test");
      expect(killed).toBe(0);
    });
  });

  describe("trimOutput", () => {
    it("throws NotFoundError for non-existent process", () => {
      expect(() => {
        ProcessService.trimOutput(db, "proc_nonexistent", 100);
      }).toThrow(NotFoundError);
    });
  });
});
