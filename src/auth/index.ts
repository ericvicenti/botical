/**
 * Auth Module
 *
 * Provides email-based magic link authentication and single-user mode support.
 * See: docs/knowledge-base/04-patterns.md
 *
 * Key features:
 * - Passwordless magic link authentication (multi-user mode)
 * - Single-user mode for local deployments (npx botical)
 * - Database-backed sessions (revocable)
 * - First user becomes admin
 * - Code execution permissions
 * - Project-based access control
 */

// Services
export { MagicLinkService } from "./magic-link.ts";
export { SessionService } from "./session.ts";
export { LocalUserService, LOCAL_USER_ID } from "./local-user.ts";

// Middleware
export {
  requireAuth,
  optionalAuth,
  requireAdmin,
  requireCodeExecution,
  requireProjectAccess,
} from "./middleware.ts";

// Schemas and types
export {
  MagicLinkRequestSchema,
  UserSchema,
  AuthSessionSchema,
  AuthContextSchema,
  rowToUser,
  rowToAuthSession,
} from "./schemas.ts";

export type {
  MagicLinkRequest,
  User,
  AuthSession,
  AuthContext,
  UserRow,
  EmailTokenRow,
  AuthSessionRow,
} from "./schemas.ts";
