/**
 * Authentication Routes
 *
 * Handles magic link authentication flow.
 * See: docs/knowledge-base/03-api-reference.md
 *
 * Endpoints:
 * - POST /auth/magic-link - Request magic link
 * - GET  /auth/verify     - Verify magic link token
 * - POST /auth/logout     - Logout (revoke session)
 * - GET  /auth/me         - Get current user
 * - GET  /auth/sessions   - List active sessions
 * - DELETE /auth/sessions/:id - Revoke specific session
 */

import { Hono } from "hono";
import { z } from "zod";
import {
  MagicLinkService,
  SessionService,
  MagicLinkRequestSchema,
  requireAuth,
  rowToUser,
} from "../../auth/index.ts";
import { DatabaseManager } from "../../database/manager.ts";
import { ValidationError } from "../../utils/errors.ts";
import type { UserRow } from "../../auth/index.ts";

const auth = new Hono();

/**
 * Request a magic link
 *
 * POST /auth/magic-link
 * Body: { email: string }
 */
auth.post("/magic-link", async (c) => {
  const body = await c.req.json();

  // Validate input
  const result = MagicLinkRequestSchema.safeParse(body);
  if (!result.success) {
    throw new ValidationError(result.error.errors[0]?.message || "Invalid email");
  }

  const { email } = result.data;

  // Get request metadata
  const metadata = {
    ipAddress: c.req.header("x-forwarded-for") || c.req.header("x-real-ip"),
    userAgent: c.req.header("user-agent"),
  };

  await MagicLinkService.request(email, metadata);

  // Always return success to prevent email enumeration
  return c.json({
    success: true,
    message: "If this email is valid, a login link has been sent",
  });
});

/**
 * Verify magic link token
 *
 * GET /auth/verify?token=xxx
 */
auth.get("/verify", async (c) => {
  const token = c.req.query("token");

  if (!token) {
    throw new ValidationError("Missing token parameter");
  }

  // Get request metadata
  const metadata = {
    ipAddress: c.req.header("x-forwarded-for") || c.req.header("x-real-ip"),
    userAgent: c.req.header("user-agent"),
  };

  // Verify token and get/create user
  const { userId, isNewUser, isAdmin } = MagicLinkService.verify(token, metadata);

  // Create session
  const { session, token: sessionToken } = SessionService.create(userId, metadata);

  // Set cookie for browser clients
  const isProduction = process.env.NODE_ENV === "production";
  const cookieFlags = isProduction
    ? "HttpOnly; Secure; SameSite=Strict"
    : "HttpOnly; SameSite=Lax";

  c.header(
    "Set-Cookie",
    `iris_session=${sessionToken}; ${cookieFlags}; Path=/; Max-Age=${7 * 24 * 60 * 60}`
  );

  // Check Accept header for response type
  const acceptHeader = c.req.header("Accept") || "";
  if (acceptHeader.includes("text/html")) {
    // Redirect browser to appropriate page
    const redirectUrl = isNewUser ? "/onboarding" : "/";
    return c.redirect(redirectUrl);
  }

  // JSON response for API clients
  return c.json({
    success: true,
    sessionId: session.id,
    token: sessionToken,
    isNewUser,
    isAdmin,
  });
});

/**
 * Logout (revoke current session)
 *
 * POST /auth/logout
 */
auth.post("/logout", requireAuth(), async (c) => {
  const authContext = c.get("auth");

  if (authContext.sessionId) {
    SessionService.revoke(authContext.sessionId);
  }

  // Clear cookie
  c.header("Set-Cookie", "iris_session=; HttpOnly; Path=/; Max-Age=0");

  return c.json({ success: true });
});

/**
 * Get current user info
 *
 * GET /auth/me
 */
auth.get("/me", requireAuth(), async (c) => {
  const authContext = c.get("auth");
  const db = DatabaseManager.getRootDb();

  const userRow = db.prepare("SELECT * FROM users WHERE id = ?").get(authContext.userId) as
    | UserRow
    | undefined;

  if (!userRow) {
    return c.json({ user: null }, 404);
  }

  return c.json({
    user: rowToUser(userRow),
  });
});

/**
 * List active sessions for current user
 *
 * GET /auth/sessions
 */
auth.get("/sessions", requireAuth(), async (c) => {
  const authContext = c.get("auth");
  const sessions = SessionService.listForUser(authContext.userId);

  return c.json({
    sessions: sessions.map((s) => ({
      ...s,
      isCurrent: s.id === authContext.sessionId,
    })),
  });
});

/**
 * Revoke a specific session
 *
 * DELETE /auth/sessions/:id
 */
auth.delete("/sessions/:id", requireAuth(), async (c) => {
  const authContext = c.get("auth");
  const sessionId = c.req.param("id");

  // Verify the session belongs to the current user
  const session = SessionService.getById(sessionId);
  if (!session || session.userId !== authContext.userId) {
    return c.json({ error: "Session not found" }, 404);
  }

  SessionService.revoke(sessionId);

  return c.json({ success: true });
});

/**
 * Revoke all other sessions (keep current)
 *
 * POST /auth/sessions/revoke-others
 */
auth.post("/sessions/revoke-others", requireAuth(), async (c) => {
  const authContext = c.get("auth");

  // Get all sessions for user
  const sessions = SessionService.listForUser(authContext.userId);

  // Revoke all except current
  let revokedCount = 0;
  for (const session of sessions) {
    if (session.id !== authContext.sessionId) {
      SessionService.revoke(session.id);
      revokedCount++;
    }
  }

  return c.json({
    success: true,
    revokedCount,
  });
});

export { auth };
