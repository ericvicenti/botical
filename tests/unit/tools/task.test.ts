/**
 * Task Tool Tests
 */

import { describe, it, expect } from "bun:test";
import {
  taskTool,
  normalizeTaskParams,
  resolveTaskModel,
  getDefaultMaxTurns,
} from "@/tools/task.ts";

describe("Task Tool", () => {
  describe("taskTool definition", () => {
    it("has correct name", () => {
      expect(taskTool.name).toBe("task");
    });

    it("has a description", () => {
      expect(taskTool.description).toBeDefined();
      expect(taskTool.description.length).toBeGreaterThan(50);
    });

    it("describes available sub-agent types", () => {
      expect(taskTool.description).toContain("default");
      expect(taskTool.description).toContain("explore");
      expect(taskTool.description).toContain("plan");
    });
  });

  describe("normalizeTaskParams", () => {
    it("normalizes minimal parameters", () => {
      const params = normalizeTaskParams({
        description: "Test task",
        prompt: "Do something",
        subagent_type: "default",
        run_in_background: false,
      });

      expect(params.description).toBe("Test task");
      expect(params.prompt).toBe("Do something");
      expect(params.subagentType).toBe("default");
      expect(params.runInBackground).toBe(false);
    });

    it("applies default max turns by agent type", () => {
      const defaultParams = normalizeTaskParams({
        description: "Test",
        prompt: "Do something",
        subagent_type: "default",
        run_in_background: false,
      });
      expect(defaultParams.maxTurns).toBe(25);

      const exploreParams = normalizeTaskParams({
        description: "Test",
        prompt: "Explore",
        subagent_type: "explore",
        run_in_background: false,
      });
      expect(exploreParams.maxTurns).toBe(15);

      const planParams = normalizeTaskParams({
        description: "Test",
        prompt: "Plan",
        subagent_type: "plan",
        run_in_background: false,
      });
      expect(planParams.maxTurns).toBe(20);
    });

    it("respects explicit max_turns", () => {
      const params = normalizeTaskParams({
        description: "Test",
        prompt: "Do something",
        subagent_type: "default",
        max_turns: 10,
        run_in_background: false,
      });

      expect(params.maxTurns).toBe(10);
    });

    it("resolves model aliases", () => {
      const sonnetParams = normalizeTaskParams({
        description: "Test",
        prompt: "Do something",
        subagent_type: "default",
        model: "sonnet",
        run_in_background: false,
      });

      expect(sonnetParams.model).toBeDefined();
      expect(sonnetParams.model?.providerId).toBe("anthropic");
      expect(sonnetParams.model?.modelId).toContain("sonnet");

      const haikuParams = normalizeTaskParams({
        description: "Test",
        prompt: "Do something",
        subagent_type: "default",
        model: "haiku",
        run_in_background: false,
      });

      expect(haikuParams.model?.modelId).toContain("haiku");
    });

    it("handles background flag", () => {
      const bgParams = normalizeTaskParams({
        description: "Test",
        prompt: "Do something",
        subagent_type: "default",
        run_in_background: true,
      });

      expect(bgParams.runInBackground).toBe(true);
    });

    it("handles resume parameter", () => {
      const params = normalizeTaskParams({
        description: "Test",
        prompt: "Continue",
        subagent_type: "default",
        resume: "sess_123",
        run_in_background: false,
      });

      expect(params.resume).toBe("sess_123");
    });
  });

  describe("resolveTaskModel", () => {
    it("resolves sonnet alias", () => {
      const model = resolveTaskModel("sonnet");
      expect(model).toBeDefined();
      expect(model?.providerId).toBe("anthropic");
      expect(model?.modelId).toContain("sonnet");
    });

    it("resolves opus alias", () => {
      const model = resolveTaskModel("opus");
      expect(model).toBeDefined();
      expect(model?.providerId).toBe("anthropic");
      expect(model?.modelId).toContain("opus");
    });

    it("resolves haiku alias", () => {
      const model = resolveTaskModel("haiku");
      expect(model).toBeDefined();
      expect(model?.providerId).toBe("anthropic");
      expect(model?.modelId).toContain("haiku");
    });

    it("inherits from parent when no alias", () => {
      const model = resolveTaskModel(undefined, "openai", "gpt-4o");
      expect(model).toEqual({ providerId: "openai", modelId: "gpt-4o" });
    });

    it("returns null when no alias and no parent", () => {
      const model = resolveTaskModel(undefined, null, null);
      expect(model).toBeNull();
    });

    it("prefers alias over parent", () => {
      const model = resolveTaskModel("haiku", "openai", "gpt-4o");
      expect(model?.providerId).toBe("anthropic");
    });
  });

  describe("getDefaultMaxTurns", () => {
    it("returns correct defaults for known agents", () => {
      expect(getDefaultMaxTurns("default")).toBe(25);
      expect(getDefaultMaxTurns("explore")).toBe(15);
      expect(getDefaultMaxTurns("plan")).toBe(20);
    });

    it("returns default value for unknown agents", () => {
      expect(getDefaultMaxTurns("custom")).toBe(25);
      expect(getDefaultMaxTurns("unknown")).toBe(25);
    });
  });

  describe("parameter validation", () => {
    it("requires description", () => {
      expect(() => {
        normalizeTaskParams({
          description: "",
          prompt: "test",
          subagent_type: "default",
          run_in_background: false,
        });
      }).toThrow();
    });

    it("requires prompt", () => {
      expect(() => {
        normalizeTaskParams({
          description: "Test",
          prompt: "",
          subagent_type: "default",
          run_in_background: false,
        });
      }).toThrow();
    });

    it("limits description length", () => {
      expect(() => {
        normalizeTaskParams({
          description: "a".repeat(101),
          prompt: "test",
          subagent_type: "default",
          run_in_background: false,
        });
      }).toThrow();
    });

    it("limits max_turns to 50", () => {
      expect(() => {
        normalizeTaskParams({
          description: "Test",
          prompt: "test",
          subagent_type: "default",
          max_turns: 51,
          run_in_background: false,
        });
      }).toThrow();
    });

    it("requires positive max_turns", () => {
      expect(() => {
        normalizeTaskParams({
          description: "Test",
          prompt: "test",
          subagent_type: "default",
          max_turns: 0,
          run_in_background: false,
        });
      }).toThrow();
    });
  });
});
