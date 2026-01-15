/**
 * Authentication Middleware
 *
 * Hono middleware for extracting and validating auth tokens.
 * See: docs/knowledge-base/04-patterns.md
 *
 * Supports:
 * - Authorization header: Bearer <token>
 * - Cookie: iris_session=<token>
 * - API keys: iris_<key>
 */

import type { MiddlewareHandler, Context } from "hono";
import { SessionService } from "./session.ts";
import { DatabaseManager } from "../database/manager.ts";
import { AuthenticationError, ForbiddenError } from "../utils/errors.ts";
import { hashSha256 } from "../services/crypto.ts";
import type { AuthContext, UserRow } from "./schemas.ts";

// Type augmentation for Hono context
declare module "hono" {
  interface ContextVariableMap {
    auth: AuthContext;
  }
}

/**
 * Extract auth token from request
 */
function extractToken(c: Context): string | undefined {
  // Check Authorization header first
  const authHeader = c.req.header("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }

  // Check cookie
  const cookieHeader = c.req.header("Cookie");
  if (cookieHeader) {
    const match = cookieHeader.match(/iris_session=([^;]+)/);
    if (match) {
      return match[1];
    }
  }

  return undefined;
}

/**
 * Get user by ID from database
 */
function getUser(userId: string): UserRow | null {
  const db = DatabaseManager.getRootDb();
  return db.prepare("SELECT * FROM users WHERE id = ?").get(userId) as UserRow | null;
}

/**
 * Validate API key and return user info
 */
function validateApiKey(
  apiKey: string
): { id: string; userId: string; projectId: string | null } | null {
  if (!apiKey.startsWith("iris_")) {
    return null;
  }

  const db = DatabaseManager.getRootDb();
  const keyHash = hashSha256(apiKey);

  const row = db
    .prepare(
      `
    SELECT id, user_id, project_id FROM api_keys
    WHERE key_hash = ? AND revoked_at IS NULL
    AND (expires_at IS NULL OR expires_at > ?)
  `
    )
    .get(keyHash, Date.now()) as
    | { id: string; user_id: string; project_id: string | null }
    | undefined;

  if (!row) return null;

  // Update usage stats
  db.prepare(
    "UPDATE api_keys SET last_used_at = ?, usage_count = usage_count + 1 WHERE id = ?"
  ).run(Date.now(), row.id);

  return {
    id: row.id,
    userId: row.user_id,
    projectId: row.project_id,
  };
}

/**
 * Extract and validate authentication from request
 */
async function extractAuth(c: Context): Promise<AuthContext | null> {
  const token = extractToken(c);
  if (!token) return null;

  // Check if it's an API key
  if (token.startsWith("iris_")) {
    const validation = validateApiKey(token);
    if (!validation) return null;

    const user = getUser(validation.userId);
    if (!user) return null;

    return {
      userId: user.id,
      email: user.email || "",
      isAdmin: Boolean(user.is_admin),
      canExecuteCode: Boolean(user.can_execute_code),
      apiKeyId: validation.id,
    };
  }

  // Session token
  const session = SessionService.validate(token);
  if (!session) return null;

  const user = getUser(session.userId);
  if (!user) return null;

  return {
    userId: user.id,
    email: user.email || "",
    isAdmin: Boolean(user.is_admin),
    canExecuteCode: Boolean(user.can_execute_code),
    sessionId: session.id,
  };
}

/**
 * Require authentication middleware
 *
 * Throws AuthenticationError if no valid auth token is present.
 *
 * @example
 * app.get('/protected', requireAuth(), (c) => {
 *   const auth = c.get('auth');
 *   return c.json({ userId: auth.userId });
 * });
 */
export function requireAuth(): MiddlewareHandler {
  return async (c, next) => {
    const auth = await extractAuth(c);

    if (!auth) {
      throw new AuthenticationError("Authentication required");
    }

    c.set("auth", auth);
    await next();
  };
}

/**
 * Optional authentication middleware
 *
 * Sets auth context if valid token present, but doesn't require it.
 *
 * @example
 * app.get('/public', optionalAuth(), (c) => {
 *   const auth = c.get('auth'); // May be undefined
 *   return c.json({ authenticated: !!auth });
 * });
 */
export function optionalAuth(): MiddlewareHandler {
  return async (c, next) => {
    const auth = await extractAuth(c);
    if (auth) {
      c.set("auth", auth);
    }
    await next();
  };
}

/**
 * Require admin privileges middleware
 *
 * Must be used after requireAuth().
 * Throws ForbiddenError if user is not an admin.
 *
 * @example
 * app.post('/admin/action', requireAuth(), requireAdmin(), (c) => {
 *   // Only admins reach here
 * });
 */
export function requireAdmin(): MiddlewareHandler {
  return async (c, next) => {
    const auth = c.get("auth");

    if (!auth) {
      throw new AuthenticationError("Authentication required");
    }

    if (!auth.isAdmin) {
      throw new ForbiddenError("Admin privileges required");
    }

    await next();
  };
}

/**
 * Require code execution privileges middleware
 *
 * Must be used after requireAuth().
 * Throws ForbiddenError if user cannot execute code.
 *
 * @example
 * app.post('/execute', requireAuth(), requireCodeExecution(), (c) => {
 *   // Only users with code execution privileges reach here
 * });
 */
export function requireCodeExecution(): MiddlewareHandler {
  return async (c, next) => {
    const auth = c.get("auth");

    if (!auth) {
      throw new AuthenticationError("Authentication required");
    }

    if (!auth.canExecuteCode) {
      throw new ForbiddenError("Code execution not permitted for this user");
    }

    await next();
  };
}
