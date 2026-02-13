/**
 * Message Part Content Types
 *
 * Strongly-typed content extraction for message parts.
 * Replaces unsafe `as` casts with runtime-validated accessors.
 */

import { z } from "zod";

/**
 * Text content schema
 */
export const TextContentSchema = z.object({
  text: z.string(),
});

export type TextContent = z.infer<typeof TextContentSchema>;

/**
 * Tool call content schema
 */
export const ToolCallContentSchema = z.object({
  toolName: z.string(),
  toolCallId: z.string(),
  args: z.unknown().optional(),
  argsText: z.string().optional(),
});

export type ToolCallContent = z.infer<typeof ToolCallContentSchema>;

/**
 * Tool result content schema
 */
export const ToolResultContentSchema = z.object({
  toolCallId: z.string(),
  toolName: z.string().optional(),
  result: z.unknown(),
});

export type ToolResultContent = z.infer<typeof ToolResultContentSchema>;

/**
 * Safely extract text from a message part's content field.
 *
 * Handles multiple formats for resilience:
 * - { text: "hello" } — canonical format
 * - "hello" — legacy/raw string format
 * - null/undefined — returns ""
 *
 * NEVER use `(content as { text: string }).text` — use this instead.
 */
export function extractTextContent(content: unknown): string {
  if (content == null) return "";

  // Raw string (legacy format)
  if (typeof content === "string") return content;

  // Object with text field (canonical format)
  if (typeof content === "object" && "text" in (content as object)) {
    const text = (content as Record<string, unknown>).text;
    return typeof text === "string" ? text : String(text ?? "");
  }

  return "";
}

/**
 * Create a properly typed text content object.
 * Use this instead of inline `{ text: "..." }` to ensure consistency.
 */
export function textContent(text: string): TextContent {
  return { text };
}

/**
 * Validate that content matches TextContent schema.
 * Returns the validated content or null if invalid.
 */
export function parseTextContent(content: unknown): TextContent | null {
  const result = TextContentSchema.safeParse(content);
  return result.success ? result.data : null;
}
