/**
 * Built-in Agents Tests
 */

import { describe, it, expect } from "bun:test";
import {
  BUILTIN_AGENTS,
  getBuiltinAgent,
  isBuiltinAgent,
  getAllBuiltinAgents,
  getBuiltinAgentsByMode,
  defaultAgent,
  exploreAgent,
  planAgent,
} from "@/agents/builtin/index.ts";

describe("Built-in Agents", () => {
  describe("BUILTIN_AGENTS map", () => {
    it("contains all expected agents", () => {
      expect(BUILTIN_AGENTS.size).toBe(3);
      expect(BUILTIN_AGENTS.has("default")).toBe(true);
      expect(BUILTIN_AGENTS.has("explore")).toBe(true);
      expect(BUILTIN_AGENTS.has("plan")).toBe(true);
    });
  });

  describe("getBuiltinAgent", () => {
    it("returns default agent", () => {
      const agent = getBuiltinAgent("default");
      expect(agent).toBeDefined();
      expect(agent?.name).toBe("default");
      expect(agent?.isBuiltin).toBe(true);
    });

    it("returns explore agent", () => {
      const agent = getBuiltinAgent("explore");
      expect(agent).toBeDefined();
      expect(agent?.name).toBe("explore");
    });

    it("returns plan agent", () => {
      const agent = getBuiltinAgent("plan");
      expect(agent).toBeDefined();
      expect(agent?.name).toBe("plan");
    });

    it("returns undefined for unknown agent", () => {
      const agent = getBuiltinAgent("nonexistent");
      expect(agent).toBeUndefined();
    });
  });

  describe("isBuiltinAgent", () => {
    it("returns true for built-in agent names", () => {
      expect(isBuiltinAgent("default")).toBe(true);
      expect(isBuiltinAgent("explore")).toBe(true);
      expect(isBuiltinAgent("plan")).toBe(true);
    });

    it("returns false for non-builtin names", () => {
      expect(isBuiltinAgent("custom")).toBe(false);
      expect(isBuiltinAgent("my-agent")).toBe(false);
      expect(isBuiltinAgent("")).toBe(false);
    });
  });

  describe("getAllBuiltinAgents", () => {
    it("returns all built-in agents as array", () => {
      const agents = getAllBuiltinAgents();
      expect(agents.length).toBe(3);

      const names = agents.map((a) => a.name);
      expect(names).toContain("default");
      expect(names).toContain("explore");
      expect(names).toContain("plan");
    });

    it("all agents are marked as builtin", () => {
      const agents = getAllBuiltinAgents();
      for (const agent of agents) {
        expect(agent.isBuiltin).toBe(true);
      }
    });
  });

  describe("getBuiltinAgentsByMode", () => {
    it("returns primary-mode agents", () => {
      const agents = getBuiltinAgentsByMode("primary");
      // default has mode "all", so it should be included
      expect(agents.length).toBeGreaterThan(0);
      for (const agent of agents) {
        expect(["primary", "all"]).toContain(agent.mode);
      }
    });

    it("returns subagent-mode agents", () => {
      const agents = getBuiltinAgentsByMode("subagent");
      expect(agents.length).toBeGreaterThan(0);
      for (const agent of agents) {
        expect(["subagent", "all"]).toContain(agent.mode);
      }
    });
  });

  describe("Default Agent", () => {
    it("has correct configuration", () => {
      expect(defaultAgent.name).toBe("default");
      expect(defaultAgent.mode).toBe("all");
      expect(defaultAgent.isBuiltin).toBe(true);
      expect(defaultAgent.hidden).toBe(false);
    });

    it("has all standard tools", () => {
      expect(defaultAgent.tools).toContain("read");
      expect(defaultAgent.tools).toContain("write");
      expect(defaultAgent.tools).toContain("edit");
      expect(defaultAgent.tools).toContain("bash");
      expect(defaultAgent.tools).toContain("glob");
      expect(defaultAgent.tools).toContain("grep");
    });

    it("has a system prompt", () => {
      expect(defaultAgent.prompt).toBeDefined();
      expect(defaultAgent.prompt!.length).toBeGreaterThan(100);
    });
  });

  describe("Explore Agent", () => {
    it("has correct configuration", () => {
      expect(exploreAgent.name).toBe("explore");
      expect(exploreAgent.mode).toBe("subagent");
      expect(exploreAgent.isBuiltin).toBe(true);
      expect(exploreAgent.hidden).toBe(false);
    });

    it("has only read-only tools", () => {
      expect(exploreAgent.tools).toContain("read");
      expect(exploreAgent.tools).toContain("glob");
      expect(exploreAgent.tools).toContain("grep");
      expect(exploreAgent.tools).not.toContain("write");
      expect(exploreAgent.tools).not.toContain("edit");
      expect(exploreAgent.tools).not.toContain("bash");
    });

    it("has lower temperature for focused exploration", () => {
      expect(exploreAgent.temperature).toBeDefined();
      expect(exploreAgent.temperature!).toBeLessThan(1.0);
    });
  });

  describe("Plan Agent", () => {
    it("has correct configuration", () => {
      expect(planAgent.name).toBe("plan");
      expect(planAgent.mode).toBe("subagent");
      expect(planAgent.isBuiltin).toBe(true);
      expect(planAgent.hidden).toBe(false);
    });

    it("has only read-only tools for planning phase", () => {
      expect(planAgent.tools).toContain("read");
      expect(planAgent.tools).toContain("glob");
      expect(planAgent.tools).toContain("grep");
      expect(planAgent.tools).not.toContain("write");
      expect(planAgent.tools).not.toContain("edit");
      expect(planAgent.tools).not.toContain("bash");
    });

    it("has a planning-focused system prompt", () => {
      expect(planAgent.prompt).toBeDefined();
      expect(planAgent.prompt).toContain("architect");
    });
  });
});
