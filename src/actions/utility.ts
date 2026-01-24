/**
 * Utility Actions
 *
 * General utility actions like delays, timing, etc.
 */

import { z } from "zod";
import { defineAction, success, error } from "./types.ts";

const MAX_WAIT_MS = 60000; // 1 minute max wait

/**
 * utility.wait - Wait/sleep for a specified duration
 */
export const utilityWait = defineAction({
  id: "utility.wait",
  label: "Wait",
  description: "Pause execution for a specified duration",
  category: "other",
  icon: "clock",

  params: z.object({
    ms: z.number().int().min(0).max(MAX_WAIT_MS).optional().describe("Duration to wait in milliseconds"),
    seconds: z.number().min(0).max(MAX_WAIT_MS / 1000).optional().describe("Duration to wait in seconds"),
  }).refine(
    (data) => data.ms !== undefined || data.seconds !== undefined,
    { message: "Either 'ms' or 'seconds' must be provided" }
  ),

  execute: async ({ ms, seconds }, context) => {
    // Convert seconds to ms if provided
    const durationMs = ms ?? (seconds ? seconds * 1000 : 0);

    if (durationMs <= 0) {
      return success("Wait completed", "No wait time specified (0ms)", {
        durationMs: 0,
      });
    }

    if (durationMs > MAX_WAIT_MS) {
      return error(`Wait duration exceeds maximum of ${MAX_WAIT_MS}ms (${MAX_WAIT_MS / 1000}s)`);
    }

    // Create a promise that resolves after the duration or when aborted
    await new Promise<void>((resolve) => {
      const timeoutId = setTimeout(resolve, durationMs);

      // Handle abort signal if provided
      if (context.abortSignal) {
        const abortHandler = () => {
          clearTimeout(timeoutId);
          resolve();
        };
        context.abortSignal.addEventListener("abort", abortHandler, { once: true });
      }
    });

    // Check if we were aborted
    if (context.abortSignal?.aborted) {
      return success("Wait interrupted", `Wait was interrupted after starting (target: ${durationMs}ms)`, {
        durationMs,
        interrupted: true,
      });
    }

    const durationDisplay = durationMs >= 1000
      ? `${(durationMs / 1000).toFixed(1)}s`
      : `${durationMs}ms`;

    return success("Wait completed", `Waited for ${durationDisplay}`, {
      durationMs,
    });
  },
});

/**
 * All utility actions
 */
export const utilityActions = [
  utilityWait,
];
