/**
 * Approval Workflow
 *
 * Handles the approval workflow for sensitive operations that require
 * user confirmation before execution.
 *
 * Flow:
 * 1. Tool execution encounters "ask" permission result
 * 2. Approval request is created and broadcast to clients
 * 3. User approves or denies via WebSocket
 * 4. Result is stored and tool execution continues/aborts
 */

import { z } from "zod";
import type { Database } from "bun:sqlite";
import { generateId, IdPrefixes } from "@/utils/id.ts";

/**
 * Approval status
 */
export const ApprovalStatusSchema = z.enum([
  "pending", // Waiting for user response
  "approved", // User approved the action
  "denied", // User denied the action
  "expired", // Request expired without response
  "cancelled", // Request was cancelled (e.g., session ended)
]);
export type ApprovalStatus = z.infer<typeof ApprovalStatusSchema>;

/**
 * Scope of an approval decision
 */
export const ApprovalDecisionScopeSchema = z.enum([
  "once", // Just this one request
  "session", // Remember for the session
  "always", // Remember permanently
]);
export type ApprovalDecisionScope = z.infer<typeof ApprovalDecisionScopeSchema>;

/**
 * Approval request
 */
export interface ApprovalRequest {
  id: string;
  sessionId: string;
  messageId: string;
  toolName: string;
  toolCallId: string;
  permission: string;
  value: string;
  description: string;
  status: ApprovalStatus;
  decisionScope: ApprovalDecisionScope | null;
  createdAt: number;
  resolvedAt: number | null;
  expiresAt: number;
}

/**
 * Options for creating an approval request
 */
export interface CreateApprovalOptions {
  sessionId: string;
  messageId: string;
  toolName: string;
  toolCallId: string;
  permission: string;
  value: string;
  description: string;
  /** Time in milliseconds before the request expires (default: 5 minutes) */
  timeout?: number;
}

/**
 * Options for resolving an approval request
 */
export interface ResolveApprovalOptions {
  requestId: string;
  approved: boolean;
  scope: ApprovalDecisionScope;
}

/**
 * In-memory store for pending approval requests
 * Maps request ID to approval request with promise resolvers
 */
interface PendingApproval {
  request: ApprovalRequest;
  resolve: (approved: boolean) => void;
  reject: (error: Error) => void;
  timeoutId: ReturnType<typeof setTimeout>;
}

const pendingApprovals = new Map<string, PendingApproval>();

/**
 * Create an approval request and wait for user response
 *
 * @param options - Options for the approval request
 * @param onRequest - Callback when request is created (for broadcasting)
 * @returns Promise that resolves to whether the action was approved
 */
export async function requestApproval(
  options: CreateApprovalOptions,
  onRequest?: (request: ApprovalRequest) => void
): Promise<boolean> {
  const now = Date.now();
  const timeout = options.timeout ?? 5 * 60 * 1000; // 5 minutes default

  const request: ApprovalRequest = {
    id: generateId(IdPrefixes.permission),
    sessionId: options.sessionId,
    messageId: options.messageId,
    toolName: options.toolName,
    toolCallId: options.toolCallId,
    permission: options.permission,
    value: options.value,
    description: options.description,
    status: "pending",
    decisionScope: null,
    createdAt: now,
    resolvedAt: null,
    expiresAt: now + timeout,
  };

  return new Promise((resolve, reject) => {
    // Set up timeout
    const timeoutId = setTimeout(() => {
      const pending = pendingApprovals.get(request.id);
      if (pending) {
        pending.request.status = "expired";
        pending.request.resolvedAt = Date.now();
        pendingApprovals.delete(request.id);
        resolve(false); // Expired = denied
      }
    }, timeout);

    // Store pending request
    pendingApprovals.set(request.id, {
      request,
      resolve,
      reject,
      timeoutId,
    });

    // Notify listeners
    if (onRequest) {
      onRequest(request);
    }
  });
}

/**
 * Resolve an approval request
 *
 * @param options - Resolution options
 * @param onResolved - Callback when request is resolved (for broadcasting)
 * @returns The resolved approval request, or null if not found
 */
export function resolveApproval(
  options: ResolveApprovalOptions,
  onResolved?: (request: ApprovalRequest) => void
): ApprovalRequest | null {
  const pending = pendingApprovals.get(options.requestId);
  if (!pending) {
    return null;
  }

  // Clear timeout
  clearTimeout(pending.timeoutId);

  // Update request
  pending.request.status = options.approved ? "approved" : "denied";
  pending.request.decisionScope = options.scope;
  pending.request.resolvedAt = Date.now();

  // Remove from pending
  pendingApprovals.delete(options.requestId);

  // Resolve the promise
  pending.resolve(options.approved);

  // Notify listeners
  if (onResolved) {
    onResolved(pending.request);
  }

  return pending.request;
}

/**
 * Cancel all pending approvals for a session
 * Used when a session ends or is cancelled
 */
export function cancelSessionApprovals(sessionId: string): void {
  for (const [id, pending] of pendingApprovals) {
    if (pending.request.sessionId === sessionId) {
      clearTimeout(pending.timeoutId);
      pending.request.status = "cancelled";
      pending.request.resolvedAt = Date.now();
      pending.resolve(false);
      pendingApprovals.delete(id);
    }
  }
}

/**
 * Cancel a specific approval request
 */
export function cancelApproval(requestId: string): boolean {
  const pending = pendingApprovals.get(requestId);
  if (!pending) {
    return false;
  }

  clearTimeout(pending.timeoutId);
  pending.request.status = "cancelled";
  pending.request.resolvedAt = Date.now();
  pending.resolve(false);
  pendingApprovals.delete(requestId);
  return true;
}

/**
 * Get a pending approval request by ID
 */
export function getPendingApproval(requestId: string): ApprovalRequest | null {
  const pending = pendingApprovals.get(requestId);
  return pending?.request ?? null;
}

/**
 * Get all pending approvals for a session
 */
export function getSessionPendingApprovals(
  sessionId: string
): ApprovalRequest[] {
  const requests: ApprovalRequest[] = [];
  for (const pending of pendingApprovals.values()) {
    if (pending.request.sessionId === sessionId) {
      requests.push(pending.request);
    }
  }
  return requests;
}

/**
 * Check if there are any pending approvals for a session
 */
export function hasPendingApprovals(sessionId: string): boolean {
  for (const pending of pendingApprovals.values()) {
    if (pending.request.sessionId === sessionId) {
      return true;
    }
  }
  return false;
}

/**
 * Permission Service for persisting permission decisions
 */
export class PermissionService {
  /**
   * Store a permission decision
   */
  static store(
    db: Database,
    options: {
      sessionId: string;
      permission: string;
      pattern: string;
      action: "allow" | "deny";
      scope: "session" | "global";
    }
  ): void {
    const now = Date.now();
    const id = generateId(IdPrefixes.permission);

    db.prepare(
      `
      INSERT INTO permissions (id, session_id, permission, pattern, action, scope, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
      id,
      options.sessionId,
      options.permission,
      options.pattern,
      options.action,
      options.scope,
      now
    );
  }

  /**
   * Get stored permissions for a session
   */
  static getForSession(
    db: Database,
    sessionId: string
  ): Array<{
    id: string;
    permission: string;
    pattern: string;
    action: "allow" | "deny";
    scope: string;
    createdAt: number;
  }> {
    return db
      .prepare(
        `
        SELECT id, permission, pattern, action, scope, created_at as createdAt
        FROM permissions
        WHERE session_id = ? OR scope = 'global'
        ORDER BY created_at DESC
      `
      )
      .all(sessionId) as Array<{
      id: string;
      permission: string;
      pattern: string;
      action: "allow" | "deny";
      scope: string;
      createdAt: number;
    }>;
  }

  /**
   * Delete a stored permission
   */
  static delete(db: Database, permissionId: string): void {
    db.prepare("DELETE FROM permissions WHERE id = ?").run(permissionId);
  }

  /**
   * Clear all permissions for a session
   */
  static clearSession(db: Database, sessionId: string): void {
    db.prepare("DELETE FROM permissions WHERE session_id = ? AND scope = 'session'").run(
      sessionId
    );
  }
}

/**
 * Format an approval request description for display
 */
export function formatApprovalDescription(
  toolName: string,
  args: Record<string, unknown>
): string {
  switch (toolName) {
    case "bash":
      return `Execute command: ${args.command}`;
    case "write":
      return `Write file: ${args.file_path}`;
    case "edit":
      return `Edit file: ${args.file_path}`;
    case "read":
      return `Read file: ${args.file_path}`;
    default:
      return `Execute ${toolName} with arguments: ${JSON.stringify(args)}`;
  }
}
