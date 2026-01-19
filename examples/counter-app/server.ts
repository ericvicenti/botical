/**
 * Counter App
 *
 * A simple counter demonstrating Iris Apps with Server-Defined Rendering.
 * This app shows:
 * - State management with state()
 * - Tool definitions for AI integration
 * - UI generation with @iris/ui components
 * - Hot reload support
 */

// Note: In a real app, these would be imported from packages
// import { defineApp, defineTool, state } from '@iris/app-sdk';
// import { Stack, Row, Text, Button, Card, Badge } from '@iris/ui';

import { z } from "zod";

// ============================================================================
// Inline SDK (until packages are properly set up)
// ============================================================================

type Listener<T> = (value: T) => void;

interface StateHandle<T> {
  get(): T;
  set(value: T): void;
  update(updater: (prev: T) => T): void;
  subscribe(listener: Listener<T>): () => void;
  toJSON(): T;
}

function state<T>(initial: T): StateHandle<T> {
  let value = initial;
  const listeners = new Set<Listener<T>>();

  return {
    get: () => value,
    set: (newValue: T) => {
      if (Object.is(value, newValue)) return;
      value = newValue;
      listeners.forEach((l) => l(value));
    },
    update: (updater: (prev: T) => T) => {
      const newValue = updater(value);
      if (Object.is(value, newValue)) return;
      value = newValue;
      listeners.forEach((l) => l(value));
    },
    subscribe: (listener: Listener<T>) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    toJSON: () => value,
  };
}

// Component helpers
interface ComponentNode {
  $: "component";
  type: string;
  props: Record<string, unknown>;
  children?: unknown[];
  key?: string;
}

function component(type: string, props: Record<string, unknown> = {}, children?: unknown[]): ComponentNode {
  return { $: "component", type, props, children };
}

// Simple component functions
const Stack = (props: Record<string, unknown>, children?: unknown[]) =>
  component("Stack", props, children);
const Row = (props: Record<string, unknown>, children?: unknown[]) =>
  component("Row", props, children);
const Text = (props: Record<string, unknown>, children?: unknown) =>
  component("Text", props, Array.isArray(children) ? children : [children]);
const Button = (props: Record<string, unknown>, children?: unknown) =>
  component("Button", props, Array.isArray(children) ? children : [children]);
const Card = (props: Record<string, unknown>, children?: unknown[]) =>
  component("Card", props, children);
const Badge = (props: Record<string, unknown>, children?: unknown) =>
  component("Badge", props, Array.isArray(children) ? children : [children]);
const Divider = (props: Record<string, unknown> = {}) =>
  component("Divider", props);

// ============================================================================
// App Definition
// ============================================================================

interface AppContext {
  state: {
    count: StateHandle<number>;
    history: StateHandle<string[]>;
  };
  runTool: (name: string, args?: unknown) => Promise<unknown>;
  iris: unknown;
}

// State factories
const appState = {
  count: () => state(0),
  history: () => state<string[]>([]),
};

// Tools
const tools = [
  {
    name: "increment",
    description: "Increment the counter by a specified amount",
    parameters: z.object({
      amount: z.number().default(1).describe("Amount to increment by"),
    }),
    execute: async (args: { amount: number }, ctx: AppContext) => {
      const oldValue = ctx.state.count.get();
      ctx.state.count.update((n) => n + args.amount);
      ctx.state.history.update((h) => [
        ...h.slice(-9),
        `+${args.amount} (${oldValue} → ${ctx.state.count.get()})`,
      ]);
      return { previousValue: oldValue, newValue: ctx.state.count.get() };
    },
  },
  {
    name: "decrement",
    description: "Decrement the counter by a specified amount",
    parameters: z.object({
      amount: z.number().default(1).describe("Amount to decrement by"),
    }),
    execute: async (args: { amount: number }, ctx: AppContext) => {
      const oldValue = ctx.state.count.get();
      ctx.state.count.update((n) => n - args.amount);
      ctx.state.history.update((h) => [
        ...h.slice(-9),
        `-${args.amount} (${oldValue} → ${ctx.state.count.get()})`,
      ]);
      return { previousValue: oldValue, newValue: ctx.state.count.get() };
    },
  },
  {
    name: "reset",
    description: "Reset the counter to zero",
    parameters: z.object({}),
    execute: async (_args: unknown, ctx: AppContext) => {
      const oldValue = ctx.state.count.get();
      ctx.state.count.set(0);
      ctx.state.history.update((h) => [
        ...h.slice(-9),
        `reset (${oldValue} → 0)`,
      ]);
      return { previousValue: oldValue, newValue: 0 };
    },
  },
  {
    name: "set",
    description: "Set the counter to a specific value",
    parameters: z.object({
      value: z.number().describe("Value to set the counter to"),
    }),
    execute: async (args: { value: number }, ctx: AppContext) => {
      const oldValue = ctx.state.count.get();
      ctx.state.count.set(args.value);
      ctx.state.history.update((h) => [
        ...h.slice(-9),
        `set ${args.value} (${oldValue} → ${args.value})`,
      ]);
      return { previousValue: oldValue, newValue: args.value };
    },
  },
];

// UI Generator
function ui(ctx: AppContext): ComponentNode {
  const count = ctx.state.count.get();
  const history = ctx.state.history.get();

  return Stack({ padding: 24, gap: 24 }, [
    // Header
    Row({ justify: "between", align: "center" }, [
      Text({ size: "2xl", weight: "bold" }, "Counter App"),
      Badge({ variant: count >= 0 ? "success" : "error" }, `${count >= 0 ? "+" : ""}${count}`),
    ]),

    Divider({}),

    // Counter display
    Card({ padding: 32 }, [
      Stack({ align: "center", gap: 16 }, [
        Text(
          {
            size: "4xl",
            weight: "bold",
            color: count >= 0 ? "var(--success-color, #28a745)" : "var(--danger-color, #dc3545)",
          },
          String(count)
        ),
        Row({ gap: 12 }, [
          Button(
            {
              variant: "primary",
              size: "lg",
              onPress: { $action: "decrement", args: { amount: 1 } },
            },
            "−1"
          ),
          Button(
            {
              variant: "primary",
              size: "lg",
              onPress: { $action: "increment", args: { amount: 1 } },
            },
            "+1"
          ),
        ]),
        Row({ gap: 8 }, [
          Button(
            {
              variant: "outline",
              onPress: { $action: "decrement", args: { amount: 10 } },
            },
            "−10"
          ),
          Button(
            {
              variant: "outline",
              onPress: { $action: "increment", args: { amount: 10 } },
            },
            "+10"
          ),
          Button(
            {
              variant: "ghost",
              onPress: { $action: "reset", args: {} },
            },
            "Reset"
          ),
        ]),
      ]),
    ]),

    // History
    history.length > 0 &&
      Stack({ gap: 8 }, [
        Text({ size: "sm", weight: "medium", color: "#888" }, "History"),
        ...history.map((entry, i) =>
          Text({ key: String(i), size: "xs", mono: true, color: "#666" }, entry)
        ),
      ]),

    // AI hint
    Card({ padding: 16 }, [
      Stack({ gap: 8 }, [
        Text({ size: "sm", weight: "medium" }, "🤖 AI Tools Available"),
        Text(
          { size: "xs", color: "#666" },
          "This app exposes tools that AI agents can use: increment, decrement, reset, set"
        ),
      ]),
    ]),
  ]);
}

// Lifecycle hooks
async function onActivate(ctx: AppContext) {
  console.log("[Counter] App activated");
}

async function onDeactivate(ctx: AppContext) {
  console.log("[Counter] App deactivated");
}

async function onReload(ctx: AppContext, previousState: Record<string, unknown>) {
  console.log("[Counter] App reloaded, restoring state:", previousState);
  // State is auto-restored, but we could do custom migration here
}

// Export the app definition
export default {
  state: appState,
  tools,
  ui,
  onActivate,
  onDeactivate,
  onReload,
};
