/**
 * Tool Queries Unit Tests
 *
 * Tests for tool query definitions.
 */

import { describe, it, expect, beforeEach, afterEach, spyOn, mock } from "bun:test";
import {
  toolsCoreQuery,
  toolsActionsQuery,
  type CoreTool,
  type BackendAction,
} from "../../../src/queries/tools";
import type { QueryContext } from "../../../src/queries/types";
import { ToolRegistry } from "../../../src/tools/registry";
import { ActionRegistry } from "../../../src/actions/registry";

const mockTools = [
  {
    definition: {
      name: "read",
      description: "Read file contents",
    },
    category: "filesystem",
    requiresCodeExecution: false,
  },
  {
    definition: {
      name: "bash",
      description: "Execute bash commands",
    },
    category: "execution",
    requiresCodeExecution: true,
  },
  {
    definition: {
      name: "glob",
      description: "Find files by pattern",
    },
    category: "search",
    requiresCodeExecution: false,
  },
];

const mockActions = [
  {
    definition: {
      id: "git.commit",
      label: "Git Commit",
      description: "Create a git commit",
      category: "git",
    },
  },
  {
    definition: {
      id: "file.read",
      label: "Read File",
      description: "Read file contents",
      category: "file",
    },
  },
  {
    definition: {
      id: "shell.run",
      label: "Run Command",
      description: "Run a shell command",
      category: "shell",
    },
  },
];

describe("toolsCoreQuery", () => {
  const mockContext: QueryContext = {
    db: undefined,
  };

  let getAllSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    getAllSpy = spyOn(ToolRegistry, "getAll").mockReturnValue(mockTools as any);
  });

  afterEach(() => {
    getAllSpy.mockRestore();
  });

  it("has correct name", () => {
    expect(toolsCoreQuery.name).toBe("tools.core");
  });

  it("lists all core tools", async () => {
    const result = await toolsCoreQuery.fetch(undefined, mockContext);

    expect(ToolRegistry.getAll).toHaveBeenCalled();
    expect(result).toHaveLength(3);
    expect(result[0]!.name).toBe("read");
    expect(result[1]!.name).toBe("bash");
  });

  it("returns correct tool structure", async () => {
    getAllSpy.mockReturnValue([mockTools[0]!] as unknown[]);

    const result = await toolsCoreQuery.fetch(undefined, mockContext);

    expect(result[0]!).toMatchObject({
      name: "read",
      description: "Read file contents",
      category: "filesystem",
      requiresCodeExecution: false,
    });
  });

  it("identifies code execution tools", async () => {
    const result = await toolsCoreQuery.fetch(undefined, mockContext);

    const bashTool = result.find((t) => t.name === "bash");
    const readTool = result.find((t) => t.name === "read");

    expect(bashTool?.requiresCodeExecution).toBe(true);
    expect(readTool?.requiresCodeExecution).toBe(false);
  });

  it("generates correct cache key", () => {
    expect(toolsCoreQuery.cache?.key?.(undefined)).toEqual(["tools.core"]);
  });

  it("has infinite TTL", () => {
    expect(toolsCoreQuery.cache?.ttl).toBe(Infinity);
  });

  it("has global scope", () => {
    expect(toolsCoreQuery.cache?.scope).toBe("global");
  });
});

describe("toolsActionsQuery", () => {
  const mockContext: QueryContext = {
    db: undefined,
  };

  let getAllSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    getAllSpy = spyOn(ActionRegistry, "getAll").mockReturnValue(mockActions as any);
  });

  afterEach(() => {
    getAllSpy.mockRestore();
  });

  it("has correct name", () => {
    expect(toolsActionsQuery.name).toBe("tools.actions");
  });

  it("lists all actions", async () => {
    const result = await toolsActionsQuery.fetch(undefined, mockContext);

    expect(ActionRegistry.getAll).toHaveBeenCalled();
    expect(result).toHaveLength(3);
    expect(result[0]!.id).toBe("git.commit");
    expect(result[1]!.id).toBe("file.read");
  });

  it("returns correct action structure", async () => {
    getAllSpy.mockReturnValue([mockActions[0]!] as unknown[]);

    const result = await toolsActionsQuery.fetch(undefined, mockContext);

    expect(result[0]!).toMatchObject({
      id: "git.commit",
      label: "Git Commit",
      description: "Create a git commit",
      category: "git",
    });
  });

  it("groups actions by category", async () => {
    const result = await toolsActionsQuery.fetch(undefined, mockContext);

    const gitActions = result.filter((a) => a.category === "git");
    const fileActions = result.filter((a) => a.category === "file");
    const shellActions = result.filter((a) => a.category === "shell");

    expect(gitActions).toHaveLength(1);
    expect(fileActions).toHaveLength(1);
    expect(shellActions).toHaveLength(1);
  });

  it("generates correct cache key", () => {
    expect(toolsActionsQuery.cache?.key?.(undefined)).toEqual(["tools.actions"]);
  });

  it("has infinite TTL", () => {
    expect(toolsActionsQuery.cache?.ttl).toBe(Infinity);
  });

  it("has global scope", () => {
    expect(toolsActionsQuery.cache?.scope).toBe("global");
  });
});
