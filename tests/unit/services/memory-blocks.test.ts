/**
 * Memory Blocks Service Tests
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { MemoryBlockService, type MemoryBlockType } from "@/services/memory-blocks.ts";
import { runMigrations } from "@/database/migrations.ts";
import { PROJECT_MIGRATIONS } from "@/database/project-migrations.ts";

describe("MemoryBlockService", () => {
  let db: Database;

  beforeEach(() => {
    // Create in-memory database for testing
    db = new Database(":memory:");
    runMigrations(db, PROJECT_MIGRATIONS);
  });

  afterEach(() => {
    db.close();
  });

  describe("create", () => {
    it("creates a new memory block", () => {
      const input = {
        name: "test-block",
        type: "scratchpad" as MemoryBlockType,
        description: "Test memory block",
        content: "# Test Content\n\nThis is a test.",
        agentName: "test-agent",
      };

      const block = MemoryBlockService.create(db, input);

      expect(block.id).toMatch(/^mem_/);
      expect(block.name).toBe(input.name);
      expect(block.type).toBe(input.type);
      expect(block.description).toBe(input.description);
      expect(block.content).toBe(input.content);
      expect(block.agentName).toBe(input.agentName);
      expect(block.version).toBe(1);
      expect(block.createdAt).toBeGreaterThan(0);
      expect(block.updatedAt).toBeGreaterThan(0);
    });

    it("creates initial version record", () => {
      const input = {
        name: "test-block",
        type: "scratchpad" as MemoryBlockType,
        content: "Initial content",
        agentName: "test-agent",
      };

      const block = MemoryBlockService.create(db, input);
      const versions = MemoryBlockService.getVersions(db, block.id);

      expect(versions).toHaveLength(1);
      expect(versions[0].version).toBe(1);
      expect(versions[0].content).toBe(input.content);
      expect(versions[0].changeReason).toBe("Initial creation");
    });

    it("validates JSON schema if provided", () => {
      const validSchema = JSON.stringify({
        type: "object",
        properties: {
          task: { type: "string" },
          status: { type: "string" }
        }
      });

      const input = {
        name: "structured-block",
        type: "task_context" as MemoryBlockType,
        content: "Test content",
        schema: validSchema,
        agentName: "test-agent",
      };

      const block = MemoryBlockService.create(db, input);
      expect(block.schema).toBe(validSchema);
    });

    it("throws error for invalid JSON schema", () => {
      const input = {
        name: "invalid-schema",
        type: "custom" as MemoryBlockType,
        content: "Test content",
        schema: "invalid json",
        agentName: "test-agent",
      };

      expect(() => MemoryBlockService.create(db, input)).toThrow("Invalid JSON schema");
    });
  });

  describe("getById", () => {
    it("retrieves memory block by ID", () => {
      const input = {
        name: "test-block",
        type: "scratchpad" as MemoryBlockType,
        content: "Test content",
        agentName: "test-agent",
      };

      const created = MemoryBlockService.create(db, input);
      const retrieved = MemoryBlockService.getById(db, created.id);

      expect(retrieved).toEqual(created);
    });

    it("throws NotFoundError for non-existent ID", () => {
      expect(() => MemoryBlockService.getById(db, "mem_nonexistent")).toThrow("Memory block not found");
    });
  });

  describe("getByAgent", () => {
    it("retrieves all memory blocks for an agent", () => {
      const agent1Blocks = [
        { name: "block1", type: "scratchpad" as MemoryBlockType, content: "Content 1", agentName: "agent1" },
        { name: "block2", type: "task_context" as MemoryBlockType, content: "Content 2", agentName: "agent1" },
      ];

      const agent2Blocks = [
        { name: "block3", type: "scratchpad" as MemoryBlockType, content: "Content 3", agentName: "agent2" },
      ];

      // Create blocks for both agents
      agent1Blocks.forEach(input => MemoryBlockService.create(db, input));
      agent2Blocks.forEach(input => MemoryBlockService.create(db, input));

      const agent1Retrieved = MemoryBlockService.getByAgent(db, "agent1");
      const agent2Retrieved = MemoryBlockService.getByAgent(db, "agent2");

      expect(agent1Retrieved).toHaveLength(2);
      expect(agent2Retrieved).toHaveLength(1);
      expect(agent1Retrieved.map(b => b.name)).toEqual(["block1", "block2"]);
      expect(agent2Retrieved.map(b => b.name)).toEqual(["block3"]);
    });

    it("returns empty array for agent with no blocks", () => {
      const blocks = MemoryBlockService.getByAgent(db, "nonexistent-agent");
      expect(blocks).toEqual([]);
    });
  });

  describe("getByAgentAndType", () => {
    it("retrieves memory blocks by agent and type", () => {
      const blocks = [
        { name: "scratchpad1", type: "scratchpad" as MemoryBlockType, content: "Content 1", agentName: "test-agent" },
        { name: "scratchpad2", type: "scratchpad" as MemoryBlockType, content: "Content 2", agentName: "test-agent" },
        { name: "task1", type: "task_context" as MemoryBlockType, content: "Content 3", agentName: "test-agent" },
      ];

      blocks.forEach(input => MemoryBlockService.create(db, input));

      const scratchpadBlocks = MemoryBlockService.getByAgentAndType(db, "test-agent", "scratchpad");
      const taskBlocks = MemoryBlockService.getByAgentAndType(db, "test-agent", "task_context");

      expect(scratchpadBlocks).toHaveLength(2);
      expect(taskBlocks).toHaveLength(1);
      expect(scratchpadBlocks.map(b => b.name)).toEqual(["scratchpad1", "scratchpad2"]);
      expect(taskBlocks.map(b => b.name)).toEqual(["task1"]);
    });
  });

  describe("getByAgentAndName", () => {
    it("retrieves memory block by agent and name", () => {
      const input = {
        name: "unique-block",
        type: "scratchpad" as MemoryBlockType,
        content: "Test content",
        agentName: "test-agent",
      };

      MemoryBlockService.create(db, input);
      const retrieved = MemoryBlockService.getByAgentAndName(db, "test-agent", "unique-block");

      expect(retrieved).not.toBeNull();
      expect(retrieved!.name).toBe("unique-block");
      expect(retrieved!.agentName).toBe("test-agent");
    });

    it("returns null for non-existent block", () => {
      const retrieved = MemoryBlockService.getByAgentAndName(db, "test-agent", "nonexistent");
      expect(retrieved).toBeNull();
    });
  });

  describe("update", () => {
    it("updates memory block content and increments version", () => {
      const input = {
        name: "test-block",
        type: "scratchpad" as MemoryBlockType,
        content: "Original content",
        agentName: "test-agent",
      };

      const created = MemoryBlockService.create(db, input);
      const updated = MemoryBlockService.update(db, created.id, {
        content: "Updated content",
      }, "test-session", "Content updated for testing");

      expect(updated.content).toBe("Updated content");
      expect(updated.version).toBe(2);
      expect(updated.updatedAt).toBeGreaterThanOrEqual(created.updatedAt);

      // Check version history
      const versions = MemoryBlockService.getVersions(db, created.id);
      expect(versions).toHaveLength(2);
      expect(versions[0].version).toBe(2); // Most recent first
      expect(versions[0].content).toBe("Updated content");
      expect(versions[0].changeReason).toBe("Content updated for testing");
      expect(versions[0].sessionId).toBe("test-session");
    });

    it("updates other fields without creating version record", () => {
      const input = {
        name: "test-block",
        type: "scratchpad" as MemoryBlockType,
        content: "Test content",
        description: "Original description",
        agentName: "test-agent",
      };

      const created = MemoryBlockService.create(db, input);
      const updated = MemoryBlockService.update(db, created.id, {
        name: "updated-block",
        description: "Updated description",
      });

      expect(updated.name).toBe("updated-block");
      expect(updated.description).toBe("Updated description");
      expect(updated.content).toBe("Test content"); // Unchanged
      expect(updated.version).toBe(2); // Still incremented

      // Only initial version should exist (no content change)
      const versions = MemoryBlockService.getVersions(db, created.id);
      expect(versions).toHaveLength(1);
    });

    it("throws NotFoundError for non-existent block", () => {
      expect(() => MemoryBlockService.update(db, "mem_nonexistent", { content: "test" }))
        .toThrow("Memory block not found");
    });
  });

  describe("delete", () => {
    it("deletes memory block and its versions", () => {
      const input = {
        name: "test-block",
        type: "scratchpad" as MemoryBlockType,
        content: "Test content",
        agentName: "test-agent",
      };

      const created = MemoryBlockService.create(db, input);
      
      // Update to create version history
      MemoryBlockService.update(db, created.id, { content: "Updated content" });

      // Verify versions exist
      let versions = MemoryBlockService.getVersions(db, created.id);
      expect(versions).toHaveLength(2);

      // Delete the block
      MemoryBlockService.delete(db, created.id);

      // Verify block and versions are deleted
      expect(() => MemoryBlockService.getById(db, created.id)).toThrow("Memory block not found");
      versions = MemoryBlockService.getVersions(db, created.id);
      expect(versions).toHaveLength(0);
    });

    it("throws NotFoundError for non-existent block", () => {
      expect(() => MemoryBlockService.delete(db, "mem_nonexistent")).toThrow("Memory block not found");
    });
  });

  describe("getAgentContextSummary", () => {
    it("returns formatted summary of all memory blocks", () => {
      const blocks = [
        {
          name: "notes",
          type: "scratchpad" as MemoryBlockType,
          description: "Working notes",
          content: "# Notes\n\nImportant things to remember.",
          agentName: "test-agent",
        },
        {
          name: "current_task",
          type: "task_context" as MemoryBlockType,
          description: "Current task status",
          content: "Working on memory blocks implementation.",
          agentName: "test-agent",
        },
      ];

      blocks.forEach(input => MemoryBlockService.create(db, input));

      const summary = MemoryBlockService.getAgentContextSummary(db, "test-agent");

      expect(summary).toContain("## SCRATCHPAD");
      expect(summary).toContain("### notes");
      expect(summary).toContain("*Working notes*");
      expect(summary).toContain("# Notes");
      expect(summary).toContain("## TASK CONTEXT");
      expect(summary).toContain("### current_task");
      expect(summary).toContain("Working on memory blocks implementation");
    });

    it("returns no memory message for agent with no blocks", () => {
      const summary = MemoryBlockService.getAgentContextSummary(db, "empty-agent");
      expect(summary).toBe("No memory blocks available.");
    });
  });

  describe("initializeAgentMemory", () => {
    it("creates default memory blocks for new agent", () => {
      MemoryBlockService.initializeAgentMemory(db, "new-agent");

      const blocks = MemoryBlockService.getByAgent(db, "new-agent");
      expect(blocks).toHaveLength(2);

      const scratchpad = blocks.find(b => b.name === "scratchpad");
      const taskContext = blocks.find(b => b.name === "current_task");

      expect(scratchpad).toBeDefined();
      expect(scratchpad!.type).toBe("scratchpad");
      expect(scratchpad!.content).toContain("Working Notes");

      expect(taskContext).toBeDefined();
      expect(taskContext!.type).toBe("task_context");
      expect(taskContext!.content).toContain("Current Task");
    });

    it("does not create duplicate blocks for existing agent", () => {
      // Initialize twice
      MemoryBlockService.initializeAgentMemory(db, "existing-agent");
      MemoryBlockService.initializeAgentMemory(db, "existing-agent");

      const blocks = MemoryBlockService.getByAgent(db, "existing-agent");
      expect(blocks).toHaveLength(2); // Should still only have 2 blocks
    });
  });

  describe("version history", () => {
    it("tracks version history correctly", () => {
      const input = {
        name: "versioned-block",
        type: "learned_facts" as MemoryBlockType,
        content: "Version 1 content",
        agentName: "test-agent",
      };

      const created = MemoryBlockService.create(db, input);

      // Make several updates
      MemoryBlockService.update(db, created.id, { content: "Version 2 content" }, "session1", "First update");
      MemoryBlockService.update(db, created.id, { content: "Version 3 content" }, "session2", "Second update");

      const versions = MemoryBlockService.getVersions(db, created.id);
      expect(versions).toHaveLength(3);

      // Versions should be in descending order (newest first)
      expect(versions[0].version).toBe(3);
      expect(versions[0].content).toBe("Version 3 content");
      expect(versions[0].changeReason).toBe("Second update");
      expect(versions[0].sessionId).toBe("session2");

      expect(versions[1].version).toBe(2);
      expect(versions[1].content).toBe("Version 2 content");
      expect(versions[1].changeReason).toBe("First update");
      expect(versions[1].sessionId).toBe("session1");

      expect(versions[2].version).toBe(1);
      expect(versions[2].content).toBe("Version 1 content");
      expect(versions[2].changeReason).toBe("Initial creation");
    });

    it("retrieves specific version", () => {
      const input = {
        name: "versioned-block",
        type: "preferences" as MemoryBlockType,
        content: "Original content",
        agentName: "test-agent",
      };

      const created = MemoryBlockService.create(db, input);
      MemoryBlockService.update(db, created.id, { content: "Updated content" });

      const version1 = MemoryBlockService.getVersion(db, created.id, 1);
      const version2 = MemoryBlockService.getVersion(db, created.id, 2);
      const nonExistent = MemoryBlockService.getVersion(db, created.id, 99);

      expect(version1).not.toBeNull();
      expect(version1!.content).toBe("Original content");

      expect(version2).not.toBeNull();
      expect(version2!.content).toBe("Updated content");

      expect(nonExistent).toBeNull();
    });
  });
});