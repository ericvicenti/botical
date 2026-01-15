/**
 * Auth Zod Schemas
 *
 * Type definitions and validation schemas for authentication.
 * See: docs/knowledge-base/04-patterns.md#zod-validation
 */

import { z } from "zod";

/**
 * Magic link request payload
 */
export const MagicLinkRequestSchema = z.object({
  email: z.string().email("Invalid email address"),
});

export type MagicLinkRequest = z.infer<typeof MagicLinkRequestSchema>;

/**
 * User object returned from auth endpoints
 */
export const UserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  username: z.string(),
  avatarUrl: z.string().nullable(),
  isAdmin: z.boolean(),
  canExecuteCode: z.boolean(),
  createdAt: z.number(),
  lastLoginAt: z.number().nullable(),
});

export type User = z.infer<typeof UserSchema>;

/**
 * Auth session info
 */
export const AuthSessionSchema = z.object({
  id: z.string(),
  userId: z.string(),
  createdAt: z.number(),
  expiresAt: z.number(),
  lastActivityAt: z.number(),
});

export type AuthSession = z.infer<typeof AuthSessionSchema>;

/**
 * Auth context attached to requests
 */
export const AuthContextSchema = z.object({
  userId: z.string(),
  email: z.string().email(),
  isAdmin: z.boolean(),
  canExecuteCode: z.boolean(),
  sessionId: z.string().optional(),
  apiKeyId: z.string().optional(),
});

export type AuthContext = z.infer<typeof AuthContextSchema>;

/**
 * Database row types (snake_case from SQLite)
 */
export interface UserRow {
  id: string;
  email: string | null;
  username: string;
  password_hash: string | null;
  avatar_url: string | null;
  oauth_provider: string | null;
  oauth_id: string | null;
  is_admin: number;
  can_execute_code: number;
  preferences: string;
  created_at: number;
  updated_at: number;
  last_login_at: number | null;
}

export interface EmailTokenRow {
  id: string;
  email: string;
  token_hash: string;
  token_type: string;
  user_id: string | null;
  created_at: number;
  expires_at: number;
  used_at: number | null;
  ip_address: string | null;
  user_agent: string | null;
}

export interface AuthSessionRow {
  id: string;
  user_id: string;
  token_hash: string;
  created_at: number;
  expires_at: number;
  last_activity_at: number;
  ip_address: string | null;
  user_agent: string | null;
  revoked_at: number | null;
}

/**
 * Convert database row to User object
 */
export function rowToUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email || "",
    username: row.username,
    avatarUrl: row.avatar_url,
    isAdmin: Boolean(row.is_admin),
    canExecuteCode: Boolean(row.can_execute_code),
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at,
  };
}

/**
 * Convert database row to AuthSession object
 */
export function rowToAuthSession(row: AuthSessionRow): AuthSession {
  return {
    id: row.id,
    userId: row.user_id,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    lastActivityAt: row.last_activity_at,
  };
}
