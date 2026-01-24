/**
 * Agent Queries Unit Tests
 *
 * Tests for agent query definitions.
 */

import { describe, it, expect, beforeEach, afterEach, spyOn, mock } from "bun:test";
import {
  agentsListQuery,
  agentsGetQuery,
  type AgentQueryResult,
} from "../../../src/queries/agents";
import type { QueryContext } from "../../../src/queries/types";
import { AgentRegistry } from "../../../src/agents/registry";
import type { AgentConfig } from "../../../src/agents/types";

const mockAgents: AgentConfig[] = [
  {
    id: "default",
    name: "default",
    description: "Default agent",
    prompt: "You are a helpful assistant",
    tools: ["read", "write", "bash"],
    mode: "primary",
    modelId: "claude-3-sonnet",
    maxSteps: 10,
    temperature: 0.7,
    isBuiltin: true,
    hidden: false,
    providerId: null,
    topP: null,
  },
  {
    id: "explore",
    name: "explore",
    description: "Exploration agent",
    prompt: null,
    tools: ["read", "glob", "grep"],
    mode: "subagent",
    modelId: null,
    maxSteps: null,
    temperature: null,
    isBuiltin: true,
    hidden: false,
    providerId: null,
    topP: null,
  },
  {
    id: "hidden-agent",
    name: "hidden-agent",
    description: "Hidden agent",
    prompt: null,
    tools: [],
    mode: "all",
    modelId: null,
    maxSteps: null,
    temperature: null,
    isBuiltin: true,
    hidden: true,
    providerId: null,
    topP: null,
  },
];

describe("agentsListQuery", () => {
  const mockContext: QueryContext = {
    db: undefined,
  };

  let listSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    listSpy = spyOn(AgentRegistry, "list").mockReturnValue(mockAgents);
  });

  afterEach(() => {
    listSpy.mockRestore();
  });

  it("has correct name", () => {
    expect(agentsListQuery.name).toBe("agents.list");
  });

  it("lists all agents", async () => {
    const result = await agentsListQuery.fetch({}, mockContext);

    expect(AgentRegistry.list).toHaveBeenCalledWith(null, {
      mode: undefined,
      includeHidden: undefined,
    });
    expect(result).toHaveLength(3);
    expect(result[0].name).toBe("default");
  });

  it("filters by mode", async () => {
    listSpy.mockReturnValue([mockAgents[0]]);

    const result = await agentsListQuery.fetch({ mode: "primary" }, mockContext);

    expect(AgentRegistry.list).toHaveBeenCalledWith(null, {
      mode: "primary",
      includeHidden: undefined,
    });
    expect(result).toHaveLength(1);
    expect(result[0].mode).toBe("primary");
  });

  it("includes hidden agents when requested", async () => {
    const result = await agentsListQuery.fetch({ includeHidden: true }, mockContext);

    expect(AgentRegistry.list).toHaveBeenCalledWith(null, {
      mode: undefined,
      includeHidden: true,
    });
    expect(result).toHaveLength(3);
  });

  it("generates correct cache key", () => {
    expect(agentsListQuery.cache?.key?.({})).toEqual(["agents.list"]);
    expect(agentsListQuery.cache?.key?.({ mode: "primary" })).toEqual([
      "agents.list",
      "mode:primary",
    ]);
    expect(agentsListQuery.cache?.key?.({ includeHidden: true })).toEqual([
      "agents.list",
      "hidden:true",
    ]);
    expect(
      agentsListQuery.cache?.key?.({ mode: "subagent", includeHidden: true })
    ).toEqual(["agents.list", "mode:subagent", "hidden:true"]);
  });

  it("has infinite TTL", () => {
    expect(agentsListQuery.cache?.ttl).toBe(Infinity);
  });

  it("has global scope", () => {
    expect(agentsListQuery.cache?.scope).toBe("global");
  });
});

describe("agentsGetQuery", () => {
  const mockContext: QueryContext = {
    db: undefined,
  };

  let getOrThrowSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    getOrThrowSpy = spyOn(AgentRegistry, "getOrThrow").mockReturnValue(mockAgents[0]);
  });

  afterEach(() => {
    getOrThrowSpy.mockRestore();
  });

  it("has correct name", () => {
    expect(agentsGetQuery.name).toBe("agents.get");
  });

  it("gets agent by name", async () => {
    const result = await agentsGetQuery.fetch({ name: "default" }, mockContext);

    expect(AgentRegistry.getOrThrow).toHaveBeenCalledWith(null, "default");
    expect(result.name).toBe("default");
    expect(result.description).toBe("Default agent");
  });

  it("throws error for non-existent agent", async () => {
    getOrThrowSpy.mockImplementation(() => {
      throw new Error('Agent "nonexistent" not found');
    });

    await expect(
      agentsGetQuery.fetch({ name: "nonexistent" }, mockContext)
    ).rejects.toThrow('Agent "nonexistent" not found');
  });

  it("generates correct cache key", () => {
    expect(agentsGetQuery.cache?.key?.({ name: "default" })).toEqual([
      "agents.get",
      "default",
    ]);
    expect(agentsGetQuery.cache?.key?.({ name: "explore" })).toEqual([
      "agents.get",
      "explore",
    ]);
  });

  it("returns full agent data", async () => {
    const result = await agentsGetQuery.fetch({ name: "default" }, mockContext);

    expect(result).toMatchObject({
      id: "default",
      name: "default",
      description: "Default agent",
      prompt: "You are a helpful assistant",
      tools: ["read", "write", "bash"],
      mode: "primary",
      modelId: "claude-3-sonnet",
      maxSteps: 10,
      temperature: 0.7,
      isBuiltin: true,
      hidden: false,
    });
  });

  it("handles nullable fields correctly", async () => {
    getOrThrowSpy.mockReturnValue(mockAgents[1]);

    const result = await agentsGetQuery.fetch({ name: "explore" }, mockContext);

    expect(result.prompt).toBeNull();
    expect(result.modelId).toBeNull();
    expect(result.maxSteps).toBeNull();
    expect(result.temperature).toBeNull();
  });
});
