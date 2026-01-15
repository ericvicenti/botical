/**
 * Session Service
 *
 * Database-backed session management for authentication.
 * See: docs/knowledge-base/04-patterns.md
 *
 * Uses database sessions instead of JWT for:
 * - Immediate revocation capability
 * - Better audit trail
 * - Session listing for users
 */

import { DatabaseManager } from "../database/manager.ts";
import { generateId, IdPrefixes } from "../utils/id.ts";
import { hashSha256, generateSecureToken } from "../services/crypto.ts";
import type { AuthSession, AuthSessionRow } from "./schemas.ts";
import { rowToAuthSession } from "./schemas.ts";

const SESSION_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface SessionMetadata {
  ipAddress?: string;
  userAgent?: string;
}

export interface CreateSessionResult {
  session: AuthSession;
  token: string;
}

/**
 * Session Service
 *
 * Manages database-backed authentication sessions.
 */
export class SessionService {
  /**
   * Create a new session for a user
   *
   * @param userId - The user ID to create a session for
   * @param metadata - Optional request metadata
   * @returns The session info and raw token
   */
  static create(userId: string, metadata?: SessionMetadata): CreateSessionResult {
    const db = DatabaseManager.getRootDb();

    const token = generateSecureToken(32);
    const tokenHash = hashSha256(token);

    const session: AuthSession = {
      id: generateId(IdPrefixes.authSession),
      userId,
      createdAt: Date.now(),
      expiresAt: Date.now() + SESSION_EXPIRY_MS,
      lastActivityAt: Date.now(),
    };

    db.prepare(
      `
      INSERT INTO auth_sessions
      (id, user_id, token_hash, created_at, expires_at, last_activity_at, ip_address, user_agent)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `
    ).run(
      session.id,
      userId,
      tokenHash,
      session.createdAt,
      session.expiresAt,
      session.lastActivityAt,
      metadata?.ipAddress ?? null,
      metadata?.userAgent ?? null
    );

    return { session, token };
  }

  /**
   * Validate a session token and return session info
   *
   * @param token - The raw session token
   * @returns The session info or null if invalid
   */
  static validate(token: string): AuthSession | null {
    const db = DatabaseManager.getRootDb();
    const tokenHash = hashSha256(token);

    const row = db
      .prepare(
        `
      SELECT id, user_id, created_at, expires_at, last_activity_at
      FROM auth_sessions
      WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > ?
    `
      )
      .get(tokenHash, Date.now()) as AuthSessionRow | undefined;

    if (!row) return null;

    // Update last activity
    db.prepare("UPDATE auth_sessions SET last_activity_at = ? WHERE id = ?").run(
      Date.now(),
      row.id
    );

    return rowToAuthSession(row);
  }

  /**
   * Revoke a session
   *
   * @param sessionId - The session ID to revoke
   */
  static revoke(sessionId: string): void {
    const db = DatabaseManager.getRootDb();
    db.prepare("UPDATE auth_sessions SET revoked_at = ? WHERE id = ?").run(
      Date.now(),
      sessionId
    );
  }

  /**
   * Revoke all sessions for a user
   *
   * @param userId - The user ID
   * @returns Number of sessions revoked
   */
  static revokeAllForUser(userId: string): number {
    const db = DatabaseManager.getRootDb();
    const result = db
      .prepare(
        "UPDATE auth_sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL"
      )
      .run(Date.now(), userId);
    return result.changes;
  }

  /**
   * List active sessions for a user
   *
   * @param userId - The user ID
   * @returns List of active sessions
   */
  static listForUser(userId: string): AuthSession[] {
    const db = DatabaseManager.getRootDb();
    const rows = db
      .prepare(
        `
      SELECT id, user_id, created_at, expires_at, last_activity_at
      FROM auth_sessions
      WHERE user_id = ? AND revoked_at IS NULL AND expires_at > ?
      ORDER BY last_activity_at DESC
    `
      )
      .all(userId, Date.now()) as AuthSessionRow[];

    return rows.map(rowToAuthSession);
  }

  /**
   * Cleanup expired sessions (run periodically)
   *
   * @returns Number of sessions cleaned up
   */
  static cleanup(): number {
    const db = DatabaseManager.getRootDb();
    const result = db
      .prepare("DELETE FROM auth_sessions WHERE expires_at < ?")
      .run(Date.now());
    return result.changes;
  }

  /**
   * Get session by ID (without token validation)
   *
   * @param sessionId - The session ID
   * @returns The session info or null
   */
  static getById(sessionId: string): AuthSession | null {
    const db = DatabaseManager.getRootDb();
    const row = db
      .prepare(
        `
      SELECT id, user_id, created_at, expires_at, last_activity_at
      FROM auth_sessions WHERE id = ?
    `
      )
      .get(sessionId) as AuthSessionRow | undefined;

    if (!row) return null;
    return rowToAuthSession(row);
  }
}
