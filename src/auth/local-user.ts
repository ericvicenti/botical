/**
 * Local User Service
 *
 * Manages the local user for single-user mode (npx iris-ai).
 * See: docs/knowledge-base/04-patterns.md
 *
 * In single-user mode:
 * - A fixed user ID (usr_local) is used for all operations
 * - The user is created in the database on first request
 * - The user always has admin privileges and code execution permissions
 * - No authentication token is required
 */

import { DatabaseManager } from "../database/manager.ts";
import type { AuthContext, UserRow } from "./schemas.ts";

/**
 * Fixed ID for the local user in single-user mode
 */
export const LOCAL_USER_ID = "usr_local";
const LOCAL_USER_EMAIL = "local@iris.local";
const LOCAL_USER_USERNAME = "Local User";

/**
 * Service for managing local user authentication in single-user mode
 */
export class LocalUserService {
  /**
   * Ensure the local user exists in the database and return auth context.
   * Creates the user if it doesn't exist.
   */
  static ensureLocalUser(): AuthContext {
    const db = DatabaseManager.getRootDb();

    // Check if local user exists
    const existingUser = db
      .prepare("SELECT * FROM users WHERE id = ?")
      .get(LOCAL_USER_ID) as UserRow | undefined;

    if (!existingUser) {
      // Create local user with admin privileges
      const now = Date.now();
      db.prepare(
        `INSERT INTO users (
          id, username, email, is_admin, can_execute_code, preferences, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        LOCAL_USER_ID,
        LOCAL_USER_USERNAME,
        LOCAL_USER_EMAIL,
        1, // is_admin
        1, // can_execute_code
        "{}",
        now,
        now
      );
    }

    return {
      userId: LOCAL_USER_ID,
      email: LOCAL_USER_EMAIL,
      isAdmin: true,
      canExecuteCode: true,
    };
  }

  /**
   * Get the local user ID
   */
  static getLocalUserId(): string {
    return LOCAL_USER_ID;
  }

  /**
   * Check if a user ID is the local user
   */
  static isLocalUser(userId: string): boolean {
    return userId === LOCAL_USER_ID;
  }
}
