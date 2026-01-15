/**
 * Agent Service Tests
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { AgentService, toAgentConfig } from "@/services/agents.ts";
import { runMigrations } from "@/database/migrations.ts";
import { PROJECT_MIGRATIONS } from "@/database/project-migrations.ts";

describe("Agent Service", () => {
  let db: Database;

  beforeEach(() => {
    db = new Database(":memory:");
    runMigrations(db, PROJECT_MIGRATIONS);
  });

  afterEach(() => {
    db.close();
  });

  describe("create", () => {
    it("creates an agent with required fields", () => {
      const agent = AgentService.create(db, {
        name: "test-agent",
      });

      expect(agent.id).toMatch(/^agt_/);
      expect(agent.name).toBe("test-agent");
      expect(agent.mode).toBe("subagent");
      expect(agent.hidden).toBe(false);
      expect(agent.isBuiltin).toBe(false);
      expect(agent.createdAt).toBeDefined();
    });

    it("creates an agent with all optional fields", () => {
      const agent = AgentService.create(db, {
        name: "full-agent",
        description: "A fully configured agent",
        mode: "primary",
        hidden: true,
        providerId: "anthropic",
        modelId: "claude-sonnet-4-20250514",
        temperature: 0.7,
        topP: 0.9,
        maxSteps: 15,
        prompt: "You are a helpful assistant.",
        tools: ["read", "write", "glob"],
        color: "#ff0000",
      });

      expect(agent.name).toBe("full-agent");
      expect(agent.description).toBe("A fully configured agent");
      expect(agent.mode).toBe("primary");
      expect(agent.hidden).toBe(true);
      expect(agent.providerId).toBe("anthropic");
      expect(agent.modelId).toBe("claude-sonnet-4-20250514");
      expect(agent.temperature).toBe(0.7);
      expect(agent.topP).toBe(0.9);
      expect(agent.maxSteps).toBe(15);
      expect(agent.prompt).toBe("You are a helpful assistant.");
      expect(agent.tools).toEqual(["read", "write", "glob"]);
      expect(agent.color).toBe("#ff0000");
    });

    it("rejects reserved agent names", () => {
      expect(() => {
        AgentService.create(db, { name: "default" });
      }).toThrow(/reserved/);

      expect(() => {
        AgentService.create(db, { name: "explore" });
      }).toThrow(/reserved/);

      expect(() => {
        AgentService.create(db, { name: "plan" });
      }).toThrow(/reserved/);
    });

    it("rejects invalid agent names", () => {
      expect(() => {
        AgentService.create(db, { name: "Invalid Name" });
      }).toThrow();

      expect(() => {
        AgentService.create(db, { name: "123-starts-with-number" });
      }).toThrow();

      expect(() => {
        AgentService.create(db, { name: "has_underscore" });
      }).toThrow();
    });

    it("rejects duplicate agent names", () => {
      AgentService.create(db, { name: "my-agent" });

      expect(() => {
        AgentService.create(db, { name: "my-agent" });
      }).toThrow(/already exists/);
    });
  });

  describe("getById", () => {
    it("retrieves an existing agent", () => {
      const created = AgentService.create(db, {
        name: "test-agent",
        description: "Test description",
      });

      const retrieved = AgentService.getById(db, created.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(created.id);
      expect(retrieved?.name).toBe("test-agent");
      expect(retrieved?.description).toBe("Test description");
    });

    it("returns null for non-existent agent", () => {
      const result = AgentService.getById(db, "agt_nonexistent");
      expect(result).toBeNull();
    });
  });

  describe("getByName", () => {
    it("retrieves agent by name", () => {
      AgentService.create(db, {
        name: "named-agent",
        description: "Find me by name",
      });

      const retrieved = AgentService.getByName(db, "named-agent");
      expect(retrieved).toBeDefined();
      expect(retrieved?.name).toBe("named-agent");
      expect(retrieved?.description).toBe("Find me by name");
    });

    it("returns null for non-existent name", () => {
      const result = AgentService.getByName(db, "nonexistent");
      expect(result).toBeNull();
    });
  });

  describe("list", () => {
    it("lists all agents", () => {
      AgentService.create(db, { name: "agent-a" });
      AgentService.create(db, { name: "agent-b" });
      AgentService.create(db, { name: "agent-c" });

      const agents = AgentService.list(db);
      expect(agents.length).toBe(3);
    });

    it("filters by mode", () => {
      AgentService.create(db, { name: "primary-agent", mode: "primary" });
      AgentService.create(db, { name: "subagent-1", mode: "subagent" });
      AgentService.create(db, { name: "all-agent", mode: "all" });

      const primaryAgents = AgentService.list(db, { mode: "primary" });
      expect(primaryAgents.length).toBe(2); // primary + all

      const subagents = AgentService.list(db, { mode: "subagent" });
      expect(subagents.length).toBe(2); // subagent + all
    });

    it("excludes hidden agents by default", () => {
      AgentService.create(db, { name: "visible-agent", hidden: false });
      AgentService.create(db, { name: "hidden-agent", hidden: true });

      const visibleOnly = AgentService.list(db);
      expect(visibleOnly.length).toBe(1);
      expect(visibleOnly[0]!.name).toBe("visible-agent");

      const includeHidden = AgentService.list(db, { includeHidden: true });
      expect(includeHidden.length).toBe(2);
    });

    it("returns agents sorted by name", () => {
      AgentService.create(db, { name: "zebra-agent" });
      AgentService.create(db, { name: "alpha-agent" });
      AgentService.create(db, { name: "beta-agent" });

      const agents = AgentService.list(db);
      expect(agents[0]!.name).toBe("alpha-agent");
      expect(agents[1]!.name).toBe("beta-agent");
      expect(agents[2]!.name).toBe("zebra-agent");
    });
  });

  describe("update", () => {
    it("updates agent properties", () => {
      const agent = AgentService.create(db, {
        name: "original-agent",
        description: "Original description",
      });

      const updated = AgentService.update(db, agent.id, {
        name: "updated-agent",
        description: "Updated description",
        temperature: 0.5,
      });

      expect(updated.name).toBe("updated-agent");
      expect(updated.description).toBe("Updated description");
      expect(updated.temperature).toBe(0.5);
    });

    it("updates tools array", () => {
      const agent = AgentService.create(db, {
        name: "tools-agent",
        tools: ["read"],
      });

      const updated = AgentService.update(db, agent.id, {
        tools: ["read", "write", "edit"],
      });

      expect(updated.tools).toEqual(["read", "write", "edit"]);
    });

    it("rejects updating to reserved name", () => {
      const agent = AgentService.create(db, { name: "my-agent" });

      expect(() => {
        AgentService.update(db, agent.id, { name: "default" });
      }).toThrow(/reserved/);
    });

    it("rejects updating to duplicate name", () => {
      AgentService.create(db, { name: "existing-agent" });
      const agent = AgentService.create(db, { name: "my-agent" });

      expect(() => {
        AgentService.update(db, agent.id, { name: "existing-agent" });
      }).toThrow(/already exists/);
    });

    it("updates updatedAt timestamp", () => {
      const agent = AgentService.create(db, { name: "time-agent" });
      const originalUpdatedAt = agent.updatedAt;

      const updated = AgentService.update(db, agent.id, {
        description: "New description",
      });

      expect(updated.updatedAt).toBeGreaterThanOrEqual(originalUpdatedAt);
    });
  });

  describe("delete", () => {
    it("deletes an agent", () => {
      const agent = AgentService.create(db, { name: "doomed-agent" });

      AgentService.delete(db, agent.id);

      const result = AgentService.getById(db, agent.id);
      expect(result).toBeNull();
    });

    it("throws for non-existent agent", () => {
      expect(() => {
        AgentService.delete(db, "agt_nonexistent");
      }).toThrow();
    });
  });

  describe("count", () => {
    it("counts custom agents", () => {
      expect(AgentService.count(db)).toBe(0);

      AgentService.create(db, { name: "agent-1" });
      AgentService.create(db, { name: "agent-2" });

      expect(AgentService.count(db)).toBe(2);
    });
  });

  describe("toAgentConfig", () => {
    it("converts custom agent to AgentConfig format", () => {
      const agent = AgentService.create(db, {
        name: "config-agent",
        description: "Test agent",
        mode: "primary",
        providerId: "anthropic",
        modelId: "claude-sonnet-4-20250514",
        temperature: 0.7,
        maxSteps: 20,
        prompt: "Be helpful",
        tools: ["read", "write"],
      });

      const config = toAgentConfig(agent);

      expect(config.id).toBe(agent.id);
      expect(config.name).toBe("config-agent");
      expect(config.description).toBe("Test agent");
      expect(config.mode).toBe("primary");
      expect(config.providerId).toBe("anthropic");
      expect(config.modelId).toBe("claude-sonnet-4-20250514");
      expect(config.temperature).toBe(0.7);
      expect(config.maxSteps).toBe(20);
      expect(config.prompt).toBe("Be helpful");
      expect(config.tools).toEqual(["read", "write"]);
      expect(config.isBuiltin).toBe(false);
    });
  });
});
