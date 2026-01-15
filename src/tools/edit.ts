/**
 * Edit Tool
 *
 * Performs search and replace operations on files.
 * Supports exact string replacement with optional global replace.
 * See: docs/knowledge-base/04-patterns.md#tool-definition-pattern
 */

import { z } from "zod";
import fs from "fs/promises";
import path from "path";
import { defineTool } from "./types.ts";

export const editTool = defineTool("edit", {
  description: `Edit a file by replacing specific text. This is safer than rewriting the entire file.

Usage:
- Provide the exact text to find and the text to replace it with
- By default, only the first occurrence is replaced
- Use replaceAll: true to replace all occurrences
- The old_string must be unique in the file (unless using replaceAll)
- Include enough surrounding context to make the match unique`,

  parameters: z.object({
    path: z.string().describe("The file path to edit (absolute or relative to project root)"),
    old_string: z.string().describe("The exact text to find and replace"),
    new_string: z.string().describe("The text to replace it with"),
    replace_all: z
      .boolean()
      .optional()
      .default(false)
      .describe("Replace all occurrences instead of just the first"),
  }),

  async execute(args, context) {
    const { path: filePath, old_string, new_string, replace_all } = args;

    // Validation
    if (old_string === new_string) {
      return {
        title: "No change",
        output: "Error: old_string and new_string are identical",
        success: false,
      };
    }

    // Resolve path relative to project root if not absolute
    const absolutePath = path.isAbsolute(filePath)
      ? filePath
      : path.join(context.projectPath, filePath);

    // Security: ensure the path is within the project
    const normalizedPath = path.normalize(absolutePath);
    if (!normalizedPath.startsWith(context.projectPath)) {
      return {
        title: "Access denied",
        output: `Error: Cannot edit files outside the project directory`,
        success: false,
      };
    }

    try {
      // Read current content
      const content = await fs.readFile(normalizedPath, "utf-8");

      // Count occurrences
      const occurrences = content.split(old_string).length - 1;

      if (occurrences === 0) {
        return {
          title: "Text not found",
          output: `Error: The specified text was not found in "${path.basename(normalizedPath)}".\n\nSearched for:\n${old_string.slice(0, 200)}${old_string.length > 200 ? "..." : ""}`,
          success: false,
        };
      }

      // Check for ambiguous replacement
      if (!replace_all && occurrences > 1) {
        return {
          title: "Multiple matches found",
          output: `Error: Found ${occurrences} occurrences of the text. Either:\n1. Include more surrounding context to make the match unique\n2. Use replace_all: true to replace all occurrences`,
          success: false,
        };
      }

      // Perform replacement
      let newContent: string;
      let replacementCount: number;

      if (replace_all) {
        newContent = content.split(old_string).join(new_string);
        replacementCount = occurrences;
      } else {
        newContent = content.replace(old_string, new_string);
        replacementCount = 1;
      }

      // Write updated content
      await fs.writeFile(normalizedPath, newContent, "utf-8");

      const linesChanged = old_string.split("\n").length;
      const newLines = new_string.split("\n").length;

      return {
        title: `Edited ${path.basename(normalizedPath)}`,
        output: `Successfully replaced ${replacementCount} occurrence${replacementCount > 1 ? "s" : ""} in ${normalizedPath}`,
        metadata: {
          path: normalizedPath,
          replacements: replacementCount,
          linesRemoved: linesChanged,
          linesAdded: newLines,
        },
        success: true,
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return {
          title: "File not found",
          output: `Error: File not found: "${filePath}"`,
          success: false,
        };
      }

      if ((error as NodeJS.ErrnoException).code === "EACCES") {
        return {
          title: "Permission denied",
          output: `Error: Permission denied editing: "${filePath}"`,
          success: false,
        };
      }

      throw error;
    }
  },
});
