/**
 * AgentYamlService Tests
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { AgentYamlService, AgentYamlSchema } from "@/config/agents.ts";

describe("AgentYamlService", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "agents-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function makeAgent(name: string, overrides: Record<string, unknown> = {}) {
    return {
      id: `agent_yaml_${name}`,
      name,
      description: null,
      mode: "subagent" as const,
      hidden: false,
      providerId: null,
      modelId: null,
      temperature: null,
      topP: null,
      maxSteps: null,
      prompt: null,
      tools: [],
      options: {},
      color: null,
      isBuiltin: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      ...overrides,
    };
  }

  describe("save and getByName", () => {
    it("saves and retrieves an agent", () => {
      const agent = makeAgent("test-agent", { description: "A test agent", prompt: "You are helpful" });
      AgentYamlService.save(tmpDir, agent);

      const retrieved = AgentYamlService.getByName(tmpDir, "test-agent");
      expect(retrieved).not.toBeNull();
      expect(retrieved!.name).toBe("test-agent");
      expect(retrieved!.description).toBe("A test agent");
      expect(retrieved!.prompt).toBe("You are helpful");
      expect(retrieved!.id).toBe("agent_yaml_test-agent");
    });

    it("returns null for non-existent agent", () => {
      expect(AgentYamlService.getByName(tmpDir, "nope")).toBeNull();
    });
  });

  describe("exists", () => {
    it("returns false when agent does not exist", () => {
      expect(AgentYamlService.exists(tmpDir, "nope")).toBe(false);
    });

    it("returns true after saving", () => {
      AgentYamlService.save(tmpDir, makeAgent("myagent"));
      expect(AgentYamlService.exists(tmpDir, "myagent")).toBe(true);
    });
  });

  describe("list", () => {
    it("returns empty array when no agents dir", () => {
      expect(AgentYamlService.list(tmpDir)).toEqual([]);
    });

    it("lists saved agents sorted by name", () => {
      AgentYamlService.save(tmpDir, makeAgent("bravo"));
      AgentYamlService.save(tmpDir, makeAgent("alpha"));

      const agents = AgentYamlService.list(tmpDir);
      expect(agents.length).toBe(2);
      expect(agents[0].name).toBe("alpha");
      expect(agents[1].name).toBe("bravo");
    });
  });

  describe("delete", () => {
    it("deletes an existing agent", () => {
      AgentYamlService.save(tmpDir, makeAgent("to-delete"));
      expect(AgentYamlService.exists(tmpDir, "to-delete")).toBe(true);

      const result = AgentYamlService.delete(tmpDir, "to-delete");
      expect(result).toBe(true);
      expect(AgentYamlService.exists(tmpDir, "to-delete")).toBe(false);
    });

    it("returns false for non-existent agent", () => {
      expect(AgentYamlService.delete(tmpDir, "nope")).toBe(false);
    });
  });

  describe("count", () => {
    it("returns 0 when empty", () => {
      expect(AgentYamlService.count(tmpDir)).toBe(0);
    });

    it("returns correct count", () => {
      AgentYamlService.save(tmpDir, makeAgent("a"));
      AgentYamlService.save(tmpDir, makeAgent("b"));
      expect(AgentYamlService.count(tmpDir)).toBe(2);
    });
  });

  describe("round-trip with all fields", () => {
    it("preserves all agent fields", () => {
      const agent = makeAgent("full", {
        description: "Full agent",
        mode: "primary",
        hidden: true,
        providerId: "anthropic",
        modelId: "claude-sonnet-4-20250514",
        temperature: 0.7,
        topP: 0.9,
        maxSteps: 10,
        prompt: "Be creative",
        tools: ["search", "code"],
        options: { key: "value" },
        color: "#ff0000",
      });

      AgentYamlService.save(tmpDir, agent);
      const retrieved = AgentYamlService.getByName(tmpDir, "full")!;

      expect(retrieved.description).toBe("Full agent");
      expect(retrieved.mode).toBe("primary");
      expect(retrieved.hidden).toBe(true);
      expect(retrieved.providerId).toBe("anthropic");
      expect(retrieved.modelId).toBe("claude-sonnet-4-20250514");
      expect(retrieved.temperature).toBe(0.7);
      expect(retrieved.topP).toBe(0.9);
      expect(retrieved.maxSteps).toBe(10);
      expect(retrieved.prompt).toBe("Be creative");
      expect(retrieved.tools).toEqual(["search", "code"]);
      expect(retrieved.options).toEqual({ key: "value" });
      expect(retrieved.color).toBe("#ff0000");
    });
  });
});

describe("AgentYamlSchema", () => {
  it("validates minimal input with defaults", () => {
    const result = AgentYamlSchema.parse({});
    expect(result.mode).toBe("subagent");
    expect(result.hidden).toBe(false);
    expect(result.tools).toEqual([]);
    expect(result.options).toEqual({});
  });

  it("rejects invalid temperature", () => {
    expect(() => AgentYamlSchema.parse({ temperature: 5 })).toThrow();
  });

  it("rejects invalid topP", () => {
    expect(() => AgentYamlSchema.parse({ topP: 2 })).toThrow();
  });
});
