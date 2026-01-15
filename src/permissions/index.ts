/**
 * Permissions Module Index
 *
 * Exports all permission-related functionality.
 */

// Ruleset types and functions
export {
  PermissionActionSchema,
  PermissionScopeSchema,
  PermissionRuleSchema,
  type PermissionAction,
  type PermissionScope,
  type PermissionRule,
  type PermissionCheckRequest,
  type PermissionCheckResult,
  type PermissionRuleset,
  matchPattern,
  checkPermission,
  createDefaultRuleset,
  mergeRulesets,
  PermissionTypes,
  buildToolPermissionRequest,
  buildPathPermissionRequest,
} from "./ruleset.ts";

// Approval workflow
export {
  ApprovalStatusSchema,
  ApprovalDecisionScopeSchema,
  type ApprovalStatus,
  type ApprovalDecisionScope,
  type ApprovalRequest,
  type CreateApprovalOptions,
  type ResolveApprovalOptions,
  requestApproval,
  resolveApproval,
  cancelSessionApprovals,
  cancelApproval,
  getPendingApproval,
  getSessionPendingApprovals,
  hasPendingApprovals,
  PermissionService,
  formatApprovalDescription,
} from "./approval.ts";
