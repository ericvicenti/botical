/**
 * Root Database Migrations
 *
 * Defines the schema for the root database which stores global data shared
 * across all projects. This is one half of the multi-database architecture.
 * See: docs/knowledge-base/01-architecture.md#root-db-responsibilities
 *
 * Schema documented in: docs/knowledge-base/02-data-model.md
 */

import type { Migration } from "./migrations.ts";

/**
 * Root database stores:
 * - Users and authentication credentials
 * - Project registry and ownership (metadata only, not project data)
 * - API keys for programmatic access
 * - Provider credentials (encrypted LLM API keys)
 * - Global settings
 *
 * See: docs/knowledge-base/02-data-model.md#entity-relationship-diagram
 */
export const ROOT_MIGRATIONS: Migration[] = [
  {
    id: 1,
    name: "initial_schema",
    up: (db) => {
      db.exec(`
        -- ============================================
        -- USERS
        -- ============================================

        CREATE TABLE users (
          id TEXT PRIMARY KEY,
          email TEXT UNIQUE,
          username TEXT UNIQUE NOT NULL,
          password_hash TEXT,
          avatar_url TEXT,
          oauth_provider TEXT,
          oauth_id TEXT,
          preferences TEXT NOT NULL DEFAULT '{}',
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          last_login_at INTEGER,
          UNIQUE(oauth_provider, oauth_id)
        );

        CREATE INDEX idx_users_email ON users(email);
        CREATE INDEX idx_users_username ON users(username);

        -- ============================================
        -- PROJECTS
        -- ============================================

        CREATE TABLE projects (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          owner_id TEXT NOT NULL REFERENCES users(id),
          type TEXT NOT NULL DEFAULT 'local',
          path TEXT,
          git_remote TEXT,
          icon_url TEXT,
          color TEXT,
          settings TEXT NOT NULL DEFAULT '{}',
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          archived_at INTEGER,
          FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE INDEX idx_projects_owner ON projects(owner_id);
        CREATE INDEX idx_projects_path ON projects(path);

        -- ============================================
        -- PROJECT MEMBERS
        -- ============================================

        CREATE TABLE project_members (
          project_id TEXT NOT NULL REFERENCES projects(id),
          user_id TEXT NOT NULL REFERENCES users(id),
          role TEXT NOT NULL DEFAULT 'member',
          permissions TEXT,
          joined_at INTEGER NOT NULL,
          invited_by TEXT REFERENCES users(id),
          PRIMARY KEY (project_id, user_id)
        );

        CREATE INDEX idx_project_members_user ON project_members(user_id);

        -- ============================================
        -- API KEYS
        -- ============================================

        CREATE TABLE api_keys (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id),
          name TEXT NOT NULL,
          key_hash TEXT NOT NULL,
          key_prefix TEXT NOT NULL,
          project_id TEXT REFERENCES projects(id),
          permissions TEXT NOT NULL DEFAULT '[]',
          last_used_at INTEGER,
          usage_count INTEGER NOT NULL DEFAULT 0,
          created_at INTEGER NOT NULL,
          expires_at INTEGER,
          revoked_at INTEGER,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE INDEX idx_api_keys_user ON api_keys(user_id);
        CREATE INDEX idx_api_keys_prefix ON api_keys(key_prefix);

        -- ============================================
        -- PROVIDER CREDENTIALS
        -- ============================================

        CREATE TABLE provider_credentials (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES users(id),
          provider TEXT NOT NULL,
          api_key_encrypted TEXT NOT NULL,
          name TEXT,
          is_default INTEGER NOT NULL DEFAULT 0,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          UNIQUE(user_id, provider, name)
        );

        CREATE INDEX idx_provider_credentials_user ON provider_credentials(user_id);

        -- ============================================
        -- GLOBAL SETTINGS
        -- ============================================

        CREATE TABLE settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at INTEGER NOT NULL
        );
      `);
    },
  },
];
