/**
 * Approval Service
 *
 * Manages workflow approval requests and responses.
 * Handles human-in-the-loop workflow steps.
 */

import { z } from "zod";
import { generateId, IdPrefixes } from "@/utils/id.ts";
import { NotFoundError, ValidationError } from "@/utils/errors.ts";
import type { Database } from "bun:sqlite";

// ============================================================================
// Types
// ============================================================================

export interface ApprovalRecord {
  id: string;
  workflow_execution_id: string;
  step_id: string;
  title: string;
  message: string;
  approvers: string; // JSON array of user IDs
  status: "pending" | "approved" | "rejected" | "timeout";
  timeout: number | null; // Timeout in milliseconds
  on_timeout: "fail" | "continue";
  approved_by: string | null;
  approved_at: number | null;
  rejected_by: string | null;
  rejected_at: number | null;
  created_at: number;
  updated_at: number;
}

export interface Approval {
  id: string;
  workflowExecutionId: string;
  stepId: string;
  title: string;
  message: string;
  approvers: string[];
  status: "pending" | "approved" | "rejected" | "timeout";
  timeout: number | null;
  onTimeout: "fail" | "continue";
  approvedBy: string | null;
  approvedAt: number | null;
  rejectedBy: string | null;
  rejectedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

/**
 * Approval creation input schema
 */
export const ApprovalCreateSchema = z.object({
  workflowExecutionId: z.string(),
  stepId: z.string(),
  title: z.string().min(1).max(200),
  message: z.string().min(1).max(2000),
  approvers: z.array(z.string()).min(1),
  timeout: z.number().positive().optional(),
  onTimeout: z.enum(["fail", "continue"]).default("fail"),
});

export type ApprovalCreate = z.infer<typeof ApprovalCreateSchema>;

// ============================================================================
// Conversion Functions
// ============================================================================

/**
 * Convert database record to Approval
 */
function recordToApproval(record: ApprovalRecord): Approval {
  return {
    id: record.id,
    workflowExecutionId: record.workflow_execution_id,
    stepId: record.step_id,
    title: record.title,
    message: record.message,
    approvers: JSON.parse(record.approvers),
    status: record.status as Approval["status"],
    timeout: record.timeout,
    onTimeout: record.on_timeout as "fail" | "continue",
    approvedBy: record.approved_by,
    approvedAt: record.approved_at,
    rejectedBy: record.rejected_by,
    rejectedAt: record.rejected_at,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  };
}

// ============================================================================
// Service
// ============================================================================

export const ApprovalService = {
  /**
   * Create a new approval request
   */
  create(db: Database, input: ApprovalCreate): Approval {
    const now = Date.now();
    const id = generateId(IdPrefixes.approval);

    db.prepare(`
      INSERT INTO approvals (
        id, workflow_execution_id, step_id, title, message, approvers,
        status, timeout, on_timeout, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      input.workflowExecutionId,
      input.stepId,
      input.title,
      input.message,
      JSON.stringify(input.approvers),
      "pending",
      input.timeout || null,
      input.onTimeout,
      now,
      now
    );

    return this.getByIdOrThrow(db, id);
  },

  /**
   * Get approval by ID
   */
  getById(db: Database, id: string): Approval | null {
    const row = db.prepare("SELECT * FROM approvals WHERE id = ?").get(id) as ApprovalRecord | undefined;
    return row ? recordToApproval(row) : null;
  },

  /**
   * Get approval by ID or throw
   */
  getByIdOrThrow(db: Database, id: string): Approval {
    const approval = this.getById(db, id);
    if (!approval) {
      throw new NotFoundError("Approval", id);
    }
    return approval;
  },

  /**
   * List approvals for a workflow execution
   */
  listByExecution(db: Database, executionId: string): Approval[] {
    const rows = db.prepare(
      "SELECT * FROM approvals WHERE workflow_execution_id = ? ORDER BY created_at ASC"
    ).all(executionId) as ApprovalRecord[];
    
    return rows.map(recordToApproval);
  },

  /**
   * List pending approvals for a user
   */
  listPendingForUser(db: Database, userId: string): Approval[] {
    const rows = db.prepare(`
      SELECT * FROM approvals 
      WHERE status = 'pending' 
      AND JSON_EXTRACT(approvers, '$') LIKE '%' || ? || '%'
      ORDER BY created_at ASC
    `).all(userId) as ApprovalRecord[];
    
    return rows.filter(row => {
      const approvers = JSON.parse(row.approvers) as string[];
      return approvers.includes(userId);
    }).map(recordToApproval);
  },

  /**
   * Approve an approval request
   */
  approve(db: Database, id: string, userId: string): Approval {
    const approval = this.getByIdOrThrow(db, id);
    
    if (approval.status !== "pending") {
      throw new ValidationError(`Approval is already ${approval.status}`);
    }

    if (!approval.approvers.includes(userId)) {
      throw new ValidationError("User is not authorized to approve this request");
    }

    const now = Date.now();
    db.prepare(`
      UPDATE approvals 
      SET status = 'approved', approved_by = ?, approved_at = ?, updated_at = ?
      WHERE id = ?
    `).run(userId, now, now, id);

    return this.getByIdOrThrow(db, id);
  },

  /**
   * Reject an approval request
   */
  reject(db: Database, id: string, userId: string): Approval {
    const approval = this.getByIdOrThrow(db, id);
    
    if (approval.status !== "pending") {
      throw new ValidationError(`Approval is already ${approval.status}`);
    }

    if (!approval.approvers.includes(userId)) {
      throw new ValidationError("User is not authorized to reject this request");
    }

    const now = Date.now();
    db.prepare(`
      UPDATE approvals 
      SET status = 'rejected', rejected_by = ?, rejected_at = ?, updated_at = ?
      WHERE id = ?
    `).run(userId, now, now, id);

    return this.getByIdOrThrow(db, id);
  },

  /**
   * Mark approval as timed out
   */
  timeout(db: Database, id: string): Approval {
    const approval = this.getByIdOrThrow(db, id);
    
    if (approval.status !== "pending") {
      throw new ValidationError(`Approval is already ${approval.status}`);
    }

    const now = Date.now();
    db.prepare(`
      UPDATE approvals 
      SET status = 'timeout', updated_at = ?
      WHERE id = ?
    `).run(now, id);

    return this.getByIdOrThrow(db, id);
  },

  /**
   * Check for timed out approvals and mark them
   */
  processTimeouts(db: Database): Approval[] {
    const now = Date.now();
    const timedOutRows = db.prepare(`
      SELECT * FROM approvals 
      WHERE status = 'pending' 
      AND timeout IS NOT NULL 
      AND (created_at + timeout) < ?
    `).all(now) as ApprovalRecord[];

    const timedOut: Approval[] = [];
    for (const row of timedOutRows) {
      const approval = this.timeout(db, row.id);
      timedOut.push(approval);
    }

    return timedOut;
  },
};