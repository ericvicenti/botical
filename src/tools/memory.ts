/**
 * Memory Tools
 *
 * Tools for agents to interact with persistent memory blocks.
 * Implements Letta-style memory management for long-term context retention.
 */

import { z } from "zod";
import { MemoryBlockService, type MemoryBlockType } from "@/services/memory-blocks.ts";
import type { ToolExecutionContext } from "./types.ts";

/**
 * Read memory blocks for the current agent
 */
export const readMemory = {
  name: "memory_read",
  description: "Read persistent memory blocks. Use this to recall information from previous conversations and maintain context across sessions.",
  parameters: z.object({
    type: z.enum(["scratchpad", "task_context", "learned_facts", "preferences", "project_state", "custom"]).optional()
      .describe("Filter by memory block type. If not specified, returns all blocks."),
    name: z.string().optional()
      .describe("Get a specific memory block by name. If not specified, returns all blocks (filtered by type if provided)."),
  }),
  execute: async (params: { type?: MemoryBlockType; name?: string }, context: ToolExecutionContext) => {
    const { db } = context;
    const agentName = context.agentName || "default";

    try {
      if (params.name) {
        // Get specific memory block by name
        const block = MemoryBlockService.getByAgentAndName(db, agentName, params.name);
        if (!block) {
          return {
            success: false,
            error: `Memory block '${params.name}' not found for agent '${agentName}'`,
          };
        }
        
        return {
          success: true,
          data: {
            block: {
              name: block.name,
              type: block.type,
              description: block.description,
              content: block.content,
              version: block.version,
              updatedAt: new Date(block.updatedAt).toISOString(),
            }
          },
        };
      } else if (params.type) {
        // Get blocks by type
        const blocks = MemoryBlockService.getByAgentAndType(db, agentName, params.type);
        return {
          success: true,
          data: {
            blocks: blocks.map(block => ({
              name: block.name,
              type: block.type,
              description: block.description,
              content: block.content,
              version: block.version,
              updatedAt: new Date(block.updatedAt).toISOString(),
            }))
          },
        };
      } else {
        // Get all blocks for agent
        const blocks = MemoryBlockService.getByAgent(db, agentName);
        return {
          success: true,
          data: {
            blocks: blocks.map(block => ({
              name: block.name,
              type: block.type,
              description: block.description,
              content: block.content,
              version: block.version,
              updatedAt: new Date(block.updatedAt).toISOString(),
            }))
          },
        };
      }
    } catch (error) {
      return {
        success: false,
        error: `Failed to read memory: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  },
};

/**
 * Write to a memory block (create or update)
 */
export const writeMemory = {
  name: "memory_write",
  description: "Write to persistent memory blocks. Use this to store important information, insights, or context that should persist across conversations.",
  parameters: z.object({
    name: z.string().min(1).max(100)
      .describe("Name of the memory block. Must be unique per agent."),
    type: z.enum(["scratchpad", "task_context", "learned_facts", "preferences", "project_state", "custom"])
      .describe("Type of memory block. Choose the most appropriate category for the content."),
    content: z.string().min(1).max(10000)
      .describe("Content to store in the memory block. Can be markdown formatted."),
    description: z.string().max(500).optional()
      .describe("Optional description of what this memory block contains."),
    changeReason: z.string().max(200).optional()
      .describe("Optional reason for this change (for version history)."),
  }),
  execute: async (params: {
    name: string;
    type: MemoryBlockType;
    content: string;
    description?: string;
    changeReason?: string;
  }, context: ToolExecutionContext) => {
    const { db, sessionId } = context;
    const agentName = context.agentName || "default";

    try {
      // Check if memory block already exists
      const existing = MemoryBlockService.getByAgentAndName(db, agentName, params.name);
      
      if (existing) {
        // Update existing block
        const updated = MemoryBlockService.update(
          db,
          existing.id,
          {
            content: params.content,
            description: params.description,
          },
          sessionId,
          params.changeReason
        );
        
        return {
          success: true,
          data: {
            action: "updated",
            block: {
              name: updated.name,
              type: updated.type,
              description: updated.description,
              content: updated.content,
              version: updated.version,
              updatedAt: new Date(updated.updatedAt).toISOString(),
            }
          },
        };
      } else {
        // Create new block
        const created = MemoryBlockService.create(db, {
          name: params.name,
          type: params.type,
          content: params.content,
          description: params.description,
          agentName,
          sessionId,
        });
        
        return {
          success: true,
          data: {
            action: "created",
            block: {
              name: created.name,
              type: created.type,
              description: created.description,
              content: created.content,
              version: created.version,
              updatedAt: new Date(created.updatedAt).toISOString(),
            }
          },
        };
      }
    } catch (error) {
      return {
        success: false,
        error: `Failed to write memory: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  },
};

/**
 * Delete a memory block
 */
export const deleteMemory = {
  name: "memory_delete",
  description: "Delete a persistent memory block. Use with caution as this permanently removes the memory and its history.",
  parameters: z.object({
    name: z.string().min(1).max(100)
      .describe("Name of the memory block to delete."),
  }),
  execute: async (params: { name: string }, context: ToolExecutionContext) => {
    const { db } = context;
    const agentName = context.agentName || "default";

    try {
      // Find the memory block
      const block = MemoryBlockService.getByAgentAndName(db, agentName, params.name);
      if (!block) {
        return {
          success: false,
          error: `Memory block '${params.name}' not found for agent '${agentName}'`,
        };
      }

      // Delete the block
      MemoryBlockService.delete(db, block.id);
      
      return {
        success: true,
        data: {
          message: `Memory block '${params.name}' deleted successfully`,
          deletedBlock: {
            name: block.name,
            type: block.type,
            version: block.version,
          }
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to delete memory: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  },
};

/**
 * Get version history of a memory block
 */
export const memoryHistory = {
  name: "memory_history",
  description: "View the version history of a memory block to see how it has changed over time.",
  parameters: z.object({
    name: z.string().min(1).max(100)
      .describe("Name of the memory block to get history for."),
    limit: z.number().int().min(1).max(50).optional().default(10)
      .describe("Maximum number of versions to return (default: 10)."),
  }),
  execute: async (params: { name: string; limit?: number }, context: ToolExecutionContext) => {
    const { db } = context;
    const agentName = context.agentName || "default";

    try {
      // Find the memory block
      const block = MemoryBlockService.getByAgentAndName(db, agentName, params.name);
      if (!block) {
        return {
          success: false,
          error: `Memory block '${params.name}' not found for agent '${agentName}'`,
        };
      }

      // Get version history
      const versions = MemoryBlockService.getVersions(db, block.id);
      const limitedVersions = versions.slice(0, params.limit || 10);
      
      return {
        success: true,
        data: {
          blockName: block.name,
          currentVersion: block.version,
          totalVersions: versions.length,
          versions: limitedVersions.map(version => ({
            version: version.version,
            content: version.content,
            changeReason: version.changeReason,
            sessionId: version.sessionId,
            createdAt: new Date(version.createdAt).toISOString(),
          }))
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to get memory history: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  },
};

/**
 * Get a summary of all memory blocks for context
 */
export const memorySummary = {
  name: "memory_summary",
  description: "Get a formatted summary of all memory blocks for quick context overview.",
  parameters: z.object({}),
  execute: async (params: {}, context: ToolExecutionContext) => {
    const { db } = context;
    const agentName = context.agentName || "default";

    try {
      const summary = MemoryBlockService.getAgentContextSummary(db, agentName);
      
      return {
        success: true,
        data: {
          summary,
          agentName,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to get memory summary: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  },
};