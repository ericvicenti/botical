/**
 * Magic Link Authentication Service
 *
 * Handles passwordless authentication via email magic links.
 * See: docs/knowledge-base/04-patterns.md
 *
 * Flow:
 * 1. User enters email -> requestMagicLink()
 * 2. Token generated, hashed, stored in DB
 * 3. Email sent with link containing raw token
 * 4. User clicks link -> verifyMagicLink()
 * 5. Token validated, user created/found, session created
 */

import { DatabaseManager } from "../database/manager.ts";
import { generateId, IdPrefixes } from "../utils/id.ts";
import { AuthenticationError } from "../utils/errors.ts";
import { EmailService } from "../services/email.ts";
import { hashSha256, generateSecureToken } from "../services/crypto.ts";
import type { EmailTokenRow, UserRow } from "./schemas.ts";
import { SessionService } from "./session.ts";

const MAGIC_LINK_EXPIRY_MS = 15 * 60 * 1000; // 15 minutes

export interface RequestMetadata {
  ipAddress?: string;
  userAgent?: string;
}

export interface VerifyResult {
  userId: string;
  isNewUser: boolean;
  isAdmin: boolean;
}

export interface RequestResult {
  loginToken: string;
}

export interface PollResult {
  status: 'pending' | 'completed';
  sessionToken?: string;
  isNewUser?: boolean;
  isAdmin?: boolean;
}

/**
 * Magic Link Service
 *
 * Manages magic link token creation and verification.
 */
export class MagicLinkService {
  /**
   * Request a magic link for the given email
   *
   * @param email - The email address to send the magic link to
   * @param metadata - Optional request metadata (IP, user agent)
   * @returns Login token for polling
   */
  static async request(email: string, metadata?: RequestMetadata): Promise<RequestResult> {
    const db = DatabaseManager.getRootDb();
    const normalizedEmail = email.toLowerCase().trim();

    // Generate secure random tokens
    const token = generateSecureToken(32);
    const tokenHash = hashSha256(token);
    const loginToken = generateSecureToken(32);
    const loginTokenHash = hashSha256(loginToken);

    // Check if user exists
    const existingUser = db
      .prepare("SELECT id FROM users WHERE email = ?")
      .get(normalizedEmail) as { id: string } | undefined;

    // Store token
    const id = generateId(IdPrefixes.emailToken);
    db.prepare(
      `
      INSERT INTO email_verification_tokens
      (id, email, token_hash, token_type, user_id, created_at, expires_at, ip_address, user_agent, login_token, login_token_hash)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
      id,
      normalizedEmail,
      tokenHash,
      "magic_link",
      existingUser?.id ?? null,
      Date.now(),
      Date.now() + MAGIC_LINK_EXPIRY_MS,
      metadata?.ipAddress ?? null,
      metadata?.userAgent ?? null,
      loginToken,
      loginTokenHash
    );

    // Send email (or log in dev mode)
    await EmailService.sendMagicLink(normalizedEmail, token);

    return { loginToken };
  }

  /**
   * Verify a magic link token and return/create user
   *
   * @param token - The raw token from the magic link
   * @param metadata - Optional request metadata (IP, user agent)
   * @returns User ID, whether they're new, and admin status
   */
  static verify(token: string, metadata?: RequestMetadata): VerifyResult {
    const db = DatabaseManager.getRootDb();
    const tokenHash = hashSha256(token);

    // Find valid token
    const tokenRecord = db
      .prepare(
        `
      SELECT * FROM email_verification_tokens
      WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?
    `
      )
      .get(tokenHash, Date.now()) as EmailTokenRow | undefined;

    if (!tokenRecord) {
      throw new AuthenticationError("Invalid or expired magic link");
    }

    // Mark token as used (do this first to prevent race conditions)
    db.prepare("UPDATE email_verification_tokens SET used_at = ? WHERE id = ?").run(
      Date.now(),
      tokenRecord.id
    );

    // Find or create user
    let userId: string;
    let isNewUser = false;
    let isAdmin = false;

    if (tokenRecord.user_id) {
      // Existing user
      userId = tokenRecord.user_id;
      const user = db.prepare("SELECT is_admin FROM users WHERE id = ?").get(userId) as
        | { is_admin: number }
        | undefined;
      isAdmin = Boolean(user?.is_admin);
    } else {
      // Create new user
      isNewUser = true;
      userId = generateId(IdPrefixes.user);

      // Check if this is the first user (becomes admin)
      const userCount = db.prepare("SELECT COUNT(*) as count FROM users").get() as {
        count: number;
      };
      const isFirstUser = userCount.count === 0;
      isAdmin = isFirstUser;

      // Generate username from email
      const emailLocal = tokenRecord.email.split("@")[0] || "user";
      const randomSuffix = Math.random().toString(36).slice(2, 6);
      const username = `${emailLocal}_${randomSuffix}`;

      db.prepare(
        `
        INSERT INTO users (id, email, username, is_admin, can_execute_code, preferences, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `
      ).run(
        userId,
        tokenRecord.email,
        username,
        isFirstUser ? 1 : 0,
        isFirstUser ? 1 : 0, // First user can execute code
        "{}",
        Date.now(),
        Date.now()
      );
    }

    // Update last login
    db.prepare("UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?").run(
      Date.now(),
      Date.now(),
      userId
    );

    // Create session token for the login
    const { session, token: sessionToken } = SessionService.create(userId, metadata);

    // Store session token in the email verification record for polling
    db.prepare("UPDATE email_verification_tokens SET session_token = ?, completed_at = ? WHERE id = ?").run(
      sessionToken,
      Date.now(),
      tokenRecord.id
    );

    return { userId, isNewUser, isAdmin };
  }

  /**
   * Poll for login completion using login token
   *
   * @param loginToken - The login token returned from request()
   * @returns Poll result with status and session info if completed
   */
  static poll(loginToken: string): PollResult {
    const db = DatabaseManager.getRootDb();
    const loginTokenHash = hashSha256(loginToken);

    // Find the token record
    const tokenRecord = db
      .prepare(
        `
      SELECT * FROM email_verification_tokens
      WHERE login_token_hash = ? AND expires_at > ?
    `
      )
      .get(loginTokenHash, Date.now()) as any;

    if (!tokenRecord) {
      throw new AuthenticationError("Invalid or expired login token");
    }

    if (!tokenRecord.completed_at) {
      return { status: 'pending' };
    }

    // Login has been completed, return session info
    let isNewUser = false;
    let isAdmin = false;

    if (tokenRecord.user_id) {
      const user = db.prepare("SELECT is_admin FROM users WHERE id = ?").get(tokenRecord.user_id) as
        | { is_admin: number }
        | undefined;
      isAdmin = Boolean(user?.is_admin);
    }

    // Check if user was just created
    if (tokenRecord.user_id) {
      const user = db.prepare("SELECT created_at FROM users WHERE id = ?").get(tokenRecord.user_id) as
        | { created_at: number }
        | undefined;
      if (user && Math.abs(user.created_at - (tokenRecord.completed_at || 0)) < 1000) {
        isNewUser = true;
      }
    }

    return {
      status: 'completed',
      sessionToken: tokenRecord.session_token,
      isNewUser,
      isAdmin,
    };
  }

  /**
   * Cleanup expired tokens (run periodically)
   */
  static cleanup(): number {
    const db = DatabaseManager.getRootDb();
    const result = db
      .prepare("DELETE FROM email_verification_tokens WHERE expires_at < ?")
      .run(Date.now());
    return result.changes;
  }

  /**
   * Get pending token info (for testing/debugging)
   */
  static getPendingTokensForEmail(email: string): number {
    const db = DatabaseManager.getRootDb();
    const result = db
      .prepare(
        `
      SELECT COUNT(*) as count FROM email_verification_tokens
      WHERE email = ? AND used_at IS NULL AND expires_at > ?
    `
      )
      .get(email.toLowerCase().trim(), Date.now()) as { count: number };
    return result.count;
  }
}
