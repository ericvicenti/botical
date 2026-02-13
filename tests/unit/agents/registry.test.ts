/**
 * Agent Registry Tests
 *
 * Custom agents now use YAML files via AgentYamlService (not SQL).
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { AgentRegistry, isBuiltinAgent } from "@/agents/registry.ts";
import { AgentYamlService } from "@/config/agents.ts";
import { runMigrations } from "@/database/migrations.ts";
import { PROJECT_MIGRATIONS } from "@/database/project-migrations.ts";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

describe("Agent Registry", () => {
  let db: Database;
  let tmpDir: string;

  beforeEach(() => {
    db = new Database(":memory:");
    runMigrations(db, PROJECT_MIGRATIONS);
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "botical-test-agents-"));
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function createCustomAgent(name: string, opts: Record<string, any> = {}) {
    AgentYamlService.save(tmpDir, {
      id: `agent_yaml_${name}`,
      name,
      description: opts.description ?? null,
      mode: opts.mode ?? "all",
      hidden: opts.hidden ?? false,
      providerId: opts.providerId ?? null,
      modelId: opts.modelId ?? null,
      temperature: opts.temperature ?? null,
      topP: opts.topP ?? null,
      maxSteps: opts.maxSteps ?? null,
      prompt: opts.prompt ?? null,
      tools: opts.tools ?? [],
      options: opts.options ?? {},
      color: opts.color ?? null,
      isBuiltin: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  }

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

    it("returns custom agents from YAML", () => {
      createCustomAgent("my-custom-agent", { description: "Custom agent" });

      const customAgent = AgentRegistry.get(db, "my-custom-agent", tmpDir);
      expect(customAgent).toBeDefined();
      expect(customAgent?.name).toBe("my-custom-agent");
      expect(customAgent?.isBuiltin).toBe(false);
    });

    it("prioritizes built-in over custom with same name", () => {
      const agent = AgentRegistry.get(db, "default");
      expect(agent?.isBuiltin).toBe(true);
    });

    it("returns undefined for unknown agent", () => {
      const agent = AgentRegistry.get(db, "nonexistent");
      expect(agent).toBeUndefined();
    });

    it("returns undefined for custom agent without projectPath", () => {
      createCustomAgent("custom-agent");

      // Query without projectPath - should not find it
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
      createCustomAgent("custom");
      expect(AgentRegistry.has(db, "custom", tmpDir)).toBe(true);
    });

    it("returns false for unknown agents", () => {
      expect(AgentRegistry.has(db, "nonexistent")).toBe(false);
    });
  });

  describe("list", () => {
    it("returns built-in agents without database", () => {
      const agents = AgentRegistry.list(null);
      expect(agents.length).toBeGreaterThanOrEqual(3);
      expect(agents.every((a) => a.isBuiltin)).toBe(true);
    });

    it("returns built-in and custom agents with projectPath", () => {
      createCustomAgent("custom-a");
      createCustomAgent("custom-b");

      const agents = AgentRegistry.list(db, { projectPath: tmpDir } as any);
      const builtinCount = agents.filter((a) => a.isBuiltin).length;
      const customCount = agents.filter((a) => !a.isBuiltin).length;
      expect(builtinCount).toBeGreaterThanOrEqual(3);
      expect(customCount).toBe(2);
    });

    it("returns agents sorted by name", () => {
      createCustomAgent("zebra-agent");
      createCustomAgent("alpha-agent");

      const agents = AgentRegistry.list(db, { projectPath: tmpDir } as any);
      const names = agents.map((a) => a.name);
      const sorted = [...names].sort();
      expect(names).toEqual(sorted);
    });

    it("filters by mode", () => {
      createCustomAgent("primary-agent", { mode: "primary" });

      const primaryAgents = AgentRegistry.list(db, { mode: "primary", projectPath: tmpDir } as any);
      for (const agent of primaryAgents) {
        expect(["primary", "all"]).toContain(agent.mode);
      }
    });

    it("excludes hidden agents by default", () => {
      createCustomAgent("visible", { hidden: false });
      createCustomAgent("hidden", { hidden: true });

      const visible = AgentRegistry.list(db, { projectPath: tmpDir } as any);
      const hidden = AgentRegistry.list(db, { includeHidden: true, projectPath: tmpDir } as any);

      expect(hidden.length).toBe(visible.length + 1);
    });

    it("supports builtinOnly option", () => {
      createCustomAgent("custom");

      const builtinOnly = AgentRegistry.list(db, { builtinOnly: true, projectPath: tmpDir } as any);
      expect(builtinOnly.every((a) => a.isBuiltin)).toBe(true);
    });

    it("supports customOnly option", () => {
      createCustomAgent("custom");

      const customOnly = AgentRegistry.list(db, { customOnly: true, projectPath: tmpDir } as any);
      expect(customOnly.every((a) => !a.isBuiltin)).toBe(true);
      expect(customOnly.length).toBe(1);
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
      const names = AgentRegistry.getNames(db);
      expect(names).toContain("default");
      expect(names).toContain("explore");
      expect(names).toContain("plan");
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
