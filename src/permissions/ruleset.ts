/**
 * Permission Ruleset
 *
 * Defines the permission system for controlling tool access.
 * Permissions can be set at various scopes (global, session, per-request)
 * and use pattern matching for flexible rules.
 *
 * See: docs/knowledge-base/02-data-model.md#permissions
 */

import { z } from "zod";

/**
 * Permission actions
 */
export const PermissionActionSchema = z.enum(["allow", "deny", "ask"]);
export type PermissionAction = z.infer<typeof PermissionActionSchema>;

/**
 * Permission scope - where the rule applies
 */
export const PermissionScopeSchema = z.enum([
  "global", // Applies to all sessions
  "session", // Applies to a specific session
  "request", // Applies to a single request (temporary approval)
]);
export type PermissionScope = z.infer<typeof PermissionScopeSchema>;

/**
 * A single permission rule
 */
export const PermissionRuleSchema = z.object({
  /** Unique identifier */
  id: z.string().optional(),
  /** The permission key (e.g., "tool:bash", "path:/etc/*") */
  permission: z.string(),
  /** Pattern to match against (glob-style wildcards supported) */
  pattern: z.string(),
  /** Action to take when matched */
  action: PermissionActionSchema,
  /** Scope of this rule */
  scope: PermissionScopeSchema.default("session"),
  /** Optional session ID (required for session scope) */
  sessionId: z.string().optional(),
  /** When the rule was created */
  createdAt: z.number().optional(),
  /** When the rule expires (for temporary approvals) */
  expiresAt: z.number().optional(),
});

export type PermissionRule = z.infer<typeof PermissionRuleSchema>;

/**
 * Permission check request
 */
export interface PermissionCheckRequest {
  /** The permission being checked (e.g., "tool:bash", "path:/etc/passwd") */
  permission: string;
  /** The specific value to check (e.g., "rm -rf /", "/etc/passwd") */
  value: string;
  /** Optional session ID for session-scoped rules */
  sessionId?: string;
}

/**
 * Permission check result
 */
export interface PermissionCheckResult {
  /** The resulting action */
  action: PermissionAction;
  /** The rule that matched (if any) */
  matchedRule?: PermissionRule;
  /** Whether the result is from a default rule */
  isDefault: boolean;
}

/**
 * Permission ruleset configuration
 */
export interface PermissionRuleset {
  /** The rules in priority order (first match wins) */
  rules: PermissionRule[];
  /** Default action when no rule matches */
  defaultAction: PermissionAction;
}

/**
 * Check if a pattern matches a value using glob-style matching
 *
 * Supports:
 * - * : matches any sequence of characters (except /)
 * - ** : matches any sequence of characters (including /)
 * - ? : matches any single character
 */
export function matchPattern(pattern: string, value: string): boolean {
  // Use a unique placeholder to avoid replacement conflicts
  const DOUBLE_STAR_PLACEHOLDER = "___DOUBLE_STAR___";

  // Convert glob pattern to regex
  let regexStr = pattern
    // First, replace ** with placeholder (before other processing)
    .replace(/\*\*/g, DOUBLE_STAR_PLACEHOLDER)
    // Escape regex special characters (except our wildcards)
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    // Convert single * to match anything except /
    .replace(/\*/g, "[^/]*")
    // Convert ? to match any single character
    .replace(/\?/g, ".")
    // Convert placeholder back to "match anything including /"
    .replace(/___DOUBLE_STAR___/g, ".*");

  // Anchor the pattern
  regexStr = `^${regexStr}$`;

  try {
    const regex = new RegExp(regexStr);
    return regex.test(value);
  } catch {
    // If regex construction fails, fall back to exact match
    return pattern === value;
  }
}

/**
 * Check permissions against a ruleset
 */
export function checkPermission(
  ruleset: PermissionRuleset,
  request: PermissionCheckRequest
): PermissionCheckResult {
  const now = Date.now();

  // Check rules in priority order
  for (const rule of ruleset.rules) {
    // Check if rule applies to the permission type
    if (!matchPattern(rule.permission, request.permission)) {
      continue;
    }

    // Check if rule pattern matches the value
    if (!matchPattern(rule.pattern, request.value)) {
      continue;
    }

    // Check scope
    if (rule.scope === "session" && rule.sessionId !== request.sessionId) {
      continue;
    }

    // Check expiration
    if (rule.expiresAt && rule.expiresAt < now) {
      continue;
    }

    return {
      action: rule.action,
      matchedRule: rule,
      isDefault: false,
    };
  }

  // No rule matched, use default
  return {
    action: ruleset.defaultAction,
    isDefault: true,
  };
}

/**
 * Create a default ruleset with sensible defaults
 */
export function createDefaultRuleset(): PermissionRuleset {
  return {
    rules: [
      // Deny access to sensitive system directories
      {
        permission: "path:*",
        pattern: "/etc/**",
        action: "ask",
        scope: "global",
      },
      {
        permission: "path:*",
        pattern: "/root/**",
        action: "deny",
        scope: "global",
      },
      {
        permission: "path:*",
        pattern: "/var/log/**",
        action: "ask",
        scope: "global",
      },
      // Deny dangerous bash commands (use ** to match across /)
      {
        permission: "tool:bash",
        pattern: "**rm -rf **",
        action: "deny",
        scope: "global",
      },
      {
        permission: "tool:bash",
        pattern: "**sudo**",
        action: "ask",
        scope: "global",
      },
      // Allow safe tools by default (use ** for any content)
      {
        permission: "tool:read",
        pattern: "**",
        action: "allow",
        scope: "global",
      },
      {
        permission: "tool:glob",
        pattern: "**",
        action: "allow",
        scope: "global",
      },
      {
        permission: "tool:grep",
        pattern: "**",
        action: "allow",
        scope: "global",
      },
    ],
    defaultAction: "ask", // Ask by default for unmatched permissions
  };
}

/**
 * Merge multiple rulesets with priority (later rulesets override earlier)
 */
export function mergeRulesets(
  ...rulesets: PermissionRuleset[]
): PermissionRuleset {
  if (rulesets.length === 0) {
    return createDefaultRuleset();
  }

  const lastRuleset = rulesets[rulesets.length - 1]!;
  const merged: PermissionRuleset = {
    rules: [],
    defaultAction: lastRuleset.defaultAction,
  };

  // Collect all rules, with later rules having higher priority
  for (const ruleset of rulesets) {
    merged.rules.push(...ruleset.rules);
  }

  return merged;
}

/**
 * Common permission types for tool operations
 */
export const PermissionTypes = {
  /** Tool execution permission: tool:{toolName} */
  tool: (toolName: string) => `tool:${toolName}`,
  /** Path access permission: path:{operation} */
  path: (operation: "read" | "write" | "execute") => `path:${operation}`,
  /** Command execution permission */
  command: "command:bash",
  /** Network access permission */
  network: (operation: "fetch" | "connect") => `network:${operation}`,
} as const;

/**
 * Build a permission check request for a tool call
 */
export function buildToolPermissionRequest(
  toolName: string,
  args: Record<string, unknown>,
  sessionId?: string
): PermissionCheckRequest {
  // Serialize relevant args for pattern matching
  const argsStr = JSON.stringify(args);

  return {
    permission: PermissionTypes.tool(toolName),
    value: argsStr,
    sessionId,
  };
}

/**
 * Build a permission check request for path access
 */
export function buildPathPermissionRequest(
  operation: "read" | "write" | "execute",
  path: string,
  sessionId?: string
): PermissionCheckRequest {
  return {
    permission: PermissionTypes.path(operation),
    value: path,
    sessionId,
  };
}
