/**
 * @iris/app-sdk
 *
 * SDK for building Iris Apps with Server-Defined Rendering.
 *
 * @example
 * ```typescript
 * import { defineApp, defineTool, state } from '@iris/app-sdk';
 * import { Stack, Text, Button } from '@iris/ui';
 *
 * export default defineApp({
 *   state: {
 *     count: state(0),
 *   },
 *
 *   tools: [
 *     defineTool({
 *       name: 'increment',
 *       description: 'Increment the counter',
 *       parameters: z.object({ amount: z.number().default(1) }),
 *       execute: async ({ amount }, ctx) => {
 *         ctx.state.count.update(n => n + amount);
 *         return { newCount: ctx.state.count.get() };
 *       },
 *     }),
 *   ],
 *
 *   ui: (ctx) => Stack({ padding: 24 }, [
 *     Text({ size: '4xl' }, ctx.state.count.get()),
 *     Button({
 *       onPress: { $action: 'increment', args: { amount: 1 } },
 *     }, '+1'),
 *   ]),
 * });
 * ```
 */

// Re-export state primitives
export { state, computed, query, list } from "./state.ts";
export type { QueryState, ListState } from "./state.ts";

// Re-export types
export type {
  AppDefinition,
  AppContext,
  AppToolDefinition,
  IrisPlatformContext,
  StateHandle,
  UITree,
  ComponentNode,
  UIChild,
  ActionDescriptor,
} from "../../../src/apps/types.ts";

import type { AppDefinition, AppToolDefinition } from "../../../src/apps/types.ts";
import { z } from "zod";

/**
 * Define an Iris App
 *
 * This is the main entry point for creating an app. The returned definition
 * is used by the Iris runtime to manage the app's lifecycle.
 */
export function defineApp(definition: AppDefinition): AppDefinition {
  return definition;
}

/**
 * Define a tool that can be called by AI agents
 *
 * Tools are exposed to the Iris AI system and can be invoked
 * by the agent to interact with your app's functionality.
 */
export function defineTool<TParams extends z.ZodType>(config: {
  name: string;
  description: string;
  parameters: TParams;
  execute: (
    args: z.infer<TParams>,
    ctx: import("../../../src/apps/types.ts").AppContext
  ) => Promise<unknown>;
}): AppToolDefinition {
  return {
    name: config.name,
    description: config.description,
    parameters: config.parameters,
    execute: config.execute as (args: unknown, ctx: import("../../../src/apps/types.ts").AppContext) => Promise<unknown>,
  };
}

/**
 * Create an action descriptor for event handlers
 *
 * Use this to specify what tool should be called when a UI event occurs.
 */
export function action(
  toolName: string,
  args?: unknown,
  options?: { optimistic?: Record<string, unknown> }
): import("../../../src/apps/types.ts").ActionDescriptor {
  return {
    $action: toolName,
    args,
    optimistic: options?.optimistic,
  };
}
