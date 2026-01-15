/**
 * Agent Registry Tests
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { AgentRegistry, isBuiltinAgent } from "@/agents/registry.ts";
import { AgentService } from "@/services/agents.ts";
import { runMigrations } from "@/database/migrations.ts";
import { PROJECT_MIGRATIONS } from "@/database/project-migrations.ts";

describe("Agent Registry", () => {
  let db: Database;

  beforeEach(() => {
    db = new Database(":memory:");
    runMigrations(db, PROJECT_MIGRATIONS);
  });

  afterEach(() => {
    db.close();
  });

  describe("get", () => {
    it("returns built-in agents without database", () => {
      const defaultAgent = AgentRegistry.get(null, "default");
      expect(defaultAgent).toBeDefined();
      expect(defaultAgent?.name).toBe("default");
      expect(defaultAgent?.isBuiltin).toBe(true);
    });

    it("returns built-in agents with database", () => {
      const exploreAgent = AgentRegistry.get(db, "explore");
      expect(exploreAgent).toBeDefined();
      expect(exploreAgent?.name).toBe("explore");
    });

    it("returns custom agents from database", () => {
      AgentService.create(db, {
        name: "my-custom-agent",
        description: "Custom agent",
      });

      const customAgent = AgentRegistry.get(db, "my-custom-agent");
      expect(customAgent).toBeDefined();
      expect(customAgent?.name).toBe("my-custom-agent");
      expect(customAgent?.isBuiltin).toBe(false);
    });

    it("prioritizes built-in over custom with same name", () => {
      // Built-in names are reserved, so this shouldn't happen in practice
      // but the registry should still prioritize built-in
      const agent = AgentRegistry.get(db, "default");
      expect(agent?.isBuiltin).toBe(true);
    });

    it("returns undefined for unknown agent", () => {
      const agent = AgentRegistry.get(db, "nonexistent");
      expect(agent).toBeUndefined();
    });

    it("returns undefined for custom agent without database", () => {
      // Create a custom agent first
      AgentService.create(db, { name: "custom-agent" });

      // Then query without database - should not find it
      const agent = AgentRegistry.get(null, "custom-agent");
      expect(agent).toBeUndefined();
    });
  });

  describe("getOrThrow", () => {
    it("returns agent when found", () => {
      const agent = AgentRegistry.getOrThrow(db, "default");
      expect(agent.name).toBe("default");
    });

    it("throws for unknown agent", () => {
      expect(() => {
        AgentRegistry.getOrThrow(db, "nonexistent");
      }).toThrow(/not found/);
    });
  });

  describe("has", () => {
    it("returns true for built-in agents", () => {
      expect(AgentRegistry.has(null, "default")).toBe(true);
      expect(AgentRegistry.has(null, "explore")).toBe(true);
      expect(AgentRegistry.has(null, "plan")).toBe(true);
    });

    it("returns true for custom agents", () => {
      AgentService.create(db, { name: "custom" });
      expect(AgentRegistry.has(db, "custom")).toBe(true);
    });

    it("returns false for unknown agents", () => {
      expect(AgentRegistry.has(db, "nonexistent")).toBe(false);
    });
  });

  describe("list", () => {
    it("returns built-in agents without database", () => {
      const agents = AgentRegistry.list(null);
      expect(agents.length).toBe(3);
      expect(agents.every((a) => a.isBuiltin)).toBe(true);
    });

    it("returns built-in and custom agents with database", () => {
      AgentService.create(db, { name: "custom-a" });
      AgentService.create(db, { name: "custom-b" });

      const agents = AgentRegistry.list(db);
      expect(agents.length).toBe(5); // 3 built-in + 2 custom

      const builtinCount = agents.filter((a) => a.isBuiltin).length;
      const customCount = agents.filter((a) => !a.isBuiltin).length;
      expect(builtinCount).toBe(3);
      expect(customCount).toBe(2);
    });

    it("returns agents sorted by name", () => {
      AgentService.create(db, { name: "zebra-agent" });
      AgentService.create(db, { name: "alpha-agent" });

      const agents = AgentRegistry.list(db);
      const names = agents.map((a) => a.name);

      // Verify sorted
      const sorted = [...names].sort();
      expect(names).toEqual(sorted);
    });

    it("filters by mode", () => {
      // Create a primary-only custom agent
      AgentService.create(db, { name: "primary-agent", mode: "primary" });

      const primaryAgents = AgentRegistry.list(db, { mode: "primary" });
      for (const agent of primaryAgents) {
        expect(["primary", "all"]).toContain(agent.mode);
      }
    });

    it("excludes hidden agents by default", () => {
      AgentService.create(db, { name: "visible", hidden: false });
      AgentService.create(db, { name: "hidden", hidden: true });

      const visible = AgentRegistry.list(db);
      const hidden = AgentRegistry.list(db, { includeHidden: true });

      expect(hidden.length).toBe(visible.length + 1);
    });

    it("supports builtinOnly option", () => {
      AgentService.create(db, { name: "custom" });

      const builtinOnly = AgentRegistry.list(db, { builtinOnly: true });
      expect(builtinOnly.every((a) => a.isBuiltin)).toBe(true);
    });

    it("supports customOnly option", () => {
      AgentService.create(db, { name: "custom" });

      const customOnly = AgentRegistry.list(db, { customOnly: true });
      expect(customOnly.every((a) => !a.isBuiltin)).toBe(true);
    });
  });

  describe("getPrimaryAgents", () => {
    it("returns agents usable as primary", () => {
      const agents = AgentRegistry.getPrimaryAgents(db);
      for (const agent of agents) {
        expect(["primary", "all"]).toContain(agent.mode);
      }
    });
  });

  describe("getSubagents", () => {
    it("returns agents usable as subagents", () => {
      const agents = AgentRegistry.getSubagents(db);
      for (const agent of agents) {
        expect(["subagent", "all"]).toContain(agent.mode);
      }
    });
  });

  describe("getNames", () => {
    it("returns list of agent names", () => {
      AgentService.create(db, { name: "custom" });

      const names = AgentRegistry.getNames(db);
      expect(names).toContain("default");
      expect(names).toContain("explore");
      expect(names).toContain("plan");
      expect(names).toContain("custom");
    });
  });

  describe("isReservedName", () => {
    it("returns true for built-in names", () => {
      expect(AgentRegistry.isReservedName("default")).toBe(true);
      expect(AgentRegistry.isReservedName("explore")).toBe(true);
      expect(AgentRegistry.isReservedName("plan")).toBe(true);
    });

    it("returns false for other names", () => {
      expect(AgentRegistry.isReservedName("custom")).toBe(false);
      expect(AgentRegistry.isReservedName("my-agent")).toBe(false);
    });
  });

  describe("resolveTools", () => {
    it("returns agent tools when no filter provided", () => {
      const agent = AgentRegistry.get(db, "default")!;
      const tools = AgentRegistry.resolveTools(agent);
      expect(tools).toEqual(agent.tools);
    });

    it("filters tools to available subset", () => {
      const agent = AgentRegistry.get(db, "default")!;
      const tools = AgentRegistry.resolveTools(agent, ["read", "write"]);
      expect(tools).toContain("read");
      expect(tools).toContain("write");
      expect(tools).not.toContain("bash");
    });

    it("returns all available if agent has no tools specified", () => {
      const agentWithNoTools = {
        id: "test",
        name: "no-tools",
        description: null,
        mode: "all" as const,
        hidden: false,
        providerId: null,
        modelId: null,
        temperature: null,
        topP: null,
        maxSteps: null,
        prompt: null,
        tools: [],
        isBuiltin: false,
      };

      const tools = AgentRegistry.resolveTools(agentWithNoTools, [
        "read",
        "write",
        "bash",
      ]);
      expect(tools).toEqual(["read", "write", "bash"]);
    });
  });

  describe("merge", () => {
    it("merges agent configurations", () => {
      const base = AgentRegistry.get(db, "default")!;
      const merged = AgentRegistry.merge(base, {
        temperature: 0.5,
        maxSteps: 30,
      });

      expect(merged.name).toBe(base.name);
      expect(merged.temperature).toBe(0.5);
      expect(merged.maxSteps).toBe(30);
      expect(merged.tools).toEqual(base.tools);
    });

    it("overrides tools when provided", () => {
      const base = AgentRegistry.get(db, "default")!;
      const merged = AgentRegistry.merge(base, {
        tools: ["read", "glob"],
      });

      expect(merged.tools).toEqual(["read", "glob"]);
    });
  });

  describe("getDefault", () => {
    it("returns the default agent", () => {
      const agent = AgentRegistry.getDefault();
      expect(agent.name).toBe("default");
      expect(agent.isBuiltin).toBe(true);
    });
  });

  describe("isBuiltinAgent utility", () => {
    it("correctly identifies built-in agents", () => {
      expect(isBuiltinAgent("default")).toBe(true);
      expect(isBuiltinAgent("explore")).toBe(true);
      expect(isBuiltinAgent("plan")).toBe(true);
      expect(isBuiltinAgent("custom")).toBe(false);
    });
  });
});
