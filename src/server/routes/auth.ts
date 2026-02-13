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
  LocalUserService,
} from "../../auth/index.ts";
import { DatabaseManager } from "../../database/manager.ts";
import { Config } from "../../config/index.ts";
import { ValidationError, AuthenticationError } from "../../utils/errors.ts";
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

  const { loginToken } = await MagicLinkService.request(email, metadata);

  // Return login token for polling and success message to prevent email enumeration
  return c.json({
    success: true,
    message: "If this email is valid, a login link has been sent",
    loginToken,
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

  // Verify token and mark login as completed (session is stored for polling)
  const { userId, isNewUser, isAdmin } = MagicLinkService.verify(token, metadata);

  // Always return a simple HTML success page
  const successHtml = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Login Successful</title>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { font-family: system-ui, sans-serif; text-align: center; margin: 0; padding: 40px; background: #f5f5f5; }
          .container { max-width: 400px; margin: 100px auto; padding: 40px; background: white; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
          .success { color: #22c55e; font-size: 48px; margin-bottom: 20px; }
          h1 { margin: 0 0 20px; color: #333; }
          p { color: #666; line-height: 1.5; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="success">✅</div>
          <h1>Login Successful!</h1>
          <p>You have been successfully logged in to Botical.</p>
          <p>You can close this tab and return to your original browser window.</p>
        </div>
      </body>
    </html>
  `;

  c.header("Content-Type", "text/html");
  return c.body(successHtml);
});

/**
 * Poll for login completion
 *
 * GET /auth/poll-login?token=<loginToken>
 */
auth.get("/poll-login", async (c) => {
  const loginToken = c.req.query("token");

  if (!loginToken) {
    throw new ValidationError("Missing token parameter");
  }

  try {
    const result = MagicLinkService.poll(loginToken);
    return c.json(result);
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return c.json({ error: error.message }, 401);
    }
    throw error;
  }
});

/**
 * Set session cookie
 *
 * POST /auth/set-session
 * Headers: Authorization: Bearer <sessionToken>
 */
auth.post("/set-session", async (c) => {
  const authHeader = c.req.header("Authorization");
  
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return c.json({ error: "Missing or invalid authorization header" }, 401);
  }
  
  const sessionToken = authHeader.substring(7);
  
  // Validate session token
  const session = SessionService.validate(sessionToken);
  if (!session) {
    return c.json({ error: "Invalid session token" }, 401);
  }
  
  // Set cookie
  const isProduction = process.env.NODE_ENV === "production";
  const cookieFlags = isProduction
    ? "HttpOnly; Secure; SameSite=Strict"
    : "HttpOnly; SameSite=Lax";

  c.header(
    "Set-Cookie",
    `botical_session=${sessionToken}; ${cookieFlags}; Path=/; Max-Age=${7 * 24 * 60 * 60}`
  );
  
  return c.json({ success: true });
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
  c.header("Set-Cookie", "botical_session=; HttpOnly; Path=/; Max-Age=0");

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
 * Update current user profile
 *
 * PATCH /auth/me
 * Body: { displayName?: string }
 */
auth.patch("/me", requireAuth(), async (c) => {
  const authContext = c.get("auth");
  const body = await c.req.json();
  const db = DatabaseManager.getRootDb();

  const displayName = body.displayName !== undefined ? body.displayName : undefined;

  if (displayName !== undefined) {
    db.prepare("UPDATE users SET display_name = ?, updated_at = ? WHERE id = ?").run(
      displayName || null,
      Date.now(),
      authContext.userId
    );
  }

  const userRow = db.prepare("SELECT * FROM users WHERE id = ?").get(authContext.userId) as
    | UserRow
    | undefined;

  if (!userRow) {
    return c.json({ user: null }, 404);
  }

  return c.json({ user: rowToUser(userRow) });
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

/**
 * Get authentication mode
 *
 * GET /auth/mode
 *
 * Returns whether the server is in single-user or multi-user mode.
 * In single-user mode, no login is required.
 */
auth.get("/mode", async (c) => {
  const isSingleUser = Config.isSingleUserMode();

  if (isSingleUser) {
    // In single-user mode, also return the local user info
    const localAuth = LocalUserService.ensureLocalUser();
    return c.json({
      mode: "single-user",
      user: {
        userId: localAuth.userId,
        email: localAuth.email,
        isAdmin: localAuth.isAdmin,
        canExecuteCode: localAuth.canExecuteCode,
      },
    });
  }

  return c.json({
    mode: "multi-user",
    user: null,
  });
});

export { auth };
