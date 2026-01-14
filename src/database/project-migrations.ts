import type { Migration } from "./migrations.ts";

/**
 * Project database migrations
 *
 * Each project has its own database with:
 * - Sessions and messages
 * - Custom agents and tools
 * - Files and versions
 * - Permissions
 */
export const PROJECT_MIGRATIONS: Migration[] = [
  {
    id: 1,
    name: "initial_schema",
    up: (db) => {
      db.exec(`
        -- ============================================
        -- SESSIONS
        -- ============================================

        CREATE TABLE sessions (
          id TEXT PRIMARY KEY,
          slug TEXT NOT NULL,
          parent_id TEXT REFERENCES sessions(id),
          title TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'active',
          agent TEXT NOT NULL DEFAULT 'default',
          provider_id TEXT,
          model_id TEXT,
          message_count INTEGER NOT NULL DEFAULT 0,
          total_cost REAL NOT NULL DEFAULT 0,
          total_tokens_input INTEGER NOT NULL DEFAULT 0,
          total_tokens_output INTEGER NOT NULL DEFAULT 0,
          share_url TEXT,
          share_secret TEXT,
          permissions TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          archived_at INTEGER
        );

        CREATE INDEX idx_sessions_parent ON sessions(parent_id);
        CREATE INDEX idx_sessions_status ON sessions(status);
        CREATE INDEX idx_sessions_created ON sessions(created_at DESC);

        -- ============================================
        -- MESSAGES
        -- ============================================

        CREATE TABLE messages (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL REFERENCES sessions(id),
          role TEXT NOT NULL,
          parent_id TEXT REFERENCES messages(id),
          provider_id TEXT,
          model_id TEXT,
          agent TEXT,
          finish_reason TEXT,
          cost REAL NOT NULL DEFAULT 0,
          tokens_input INTEGER NOT NULL DEFAULT 0,
          tokens_output INTEGER NOT NULL DEFAULT 0,
          tokens_reasoning INTEGER NOT NULL DEFAULT 0,
          tokens_cache_read INTEGER NOT NULL DEFAULT 0,
          tokens_cache_write INTEGER NOT NULL DEFAULT 0,
          error_type TEXT,
          error_message TEXT,
          created_at INTEGER NOT NULL,
          completed_at INTEGER
        );

        CREATE INDEX idx_messages_session ON messages(session_id, id);

        -- ============================================
        -- MESSAGE PARTS
        -- ============================================

        CREATE TABLE message_parts (
          id TEXT PRIMARY KEY,
          message_id TEXT NOT NULL REFERENCES messages(id),
          session_id TEXT NOT NULL,
          type TEXT NOT NULL,
          content TEXT NOT NULL,
          tool_name TEXT,
          tool_call_id TEXT,
          tool_status TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );

        CREATE INDEX idx_parts_message ON message_parts(message_id, id);
        CREATE INDEX idx_parts_session ON message_parts(session_id);
        CREATE INDEX idx_parts_tool ON message_parts(tool_name) WHERE tool_name IS NOT NULL;

        -- ============================================
        -- AGENTS
        -- ============================================

        CREATE TABLE agents (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL UNIQUE,
          description TEXT,
          mode TEXT NOT NULL DEFAULT 'subagent',
          hidden INTEGER NOT NULL DEFAULT 0,
          provider_id TEXT,
          model_id TEXT,
          temperature REAL,
          top_p REAL,
          max_steps INTEGER,
          prompt TEXT,
          permissions TEXT,
          options TEXT NOT NULL DEFAULT '{}',
          color TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          is_builtin INTEGER NOT NULL DEFAULT 0
        );

        -- ============================================
        -- TOOLS
        -- ============================================

        CREATE TABLE tools (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL UNIQUE,
          description TEXT NOT NULL,
          type TEXT NOT NULL,
          code TEXT,
          mcp_server TEXT,
          mcp_tool TEXT,
          http_url TEXT,
          http_method TEXT,
          parameters_schema TEXT NOT NULL,
          enabled INTEGER NOT NULL DEFAULT 1,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );

        -- ============================================
        -- FILES
        -- ============================================

        CREATE TABLE files (
          id TEXT PRIMARY KEY,
          path TEXT NOT NULL UNIQUE,
          type TEXT NOT NULL,
          mime_type TEXT,
          size INTEGER,
          hash TEXT,
          metadata TEXT DEFAULT '{}',
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          deleted_at INTEGER
        );

        CREATE INDEX idx_files_path ON files(path);
        CREATE INDEX idx_files_type ON files(type);

        -- ============================================
        -- FILE VERSIONS
        -- ============================================

        CREATE TABLE file_versions (
          id TEXT PRIMARY KEY,
          file_id TEXT NOT NULL REFERENCES files(id),
          version INTEGER NOT NULL,
          hash TEXT NOT NULL,
          session_id TEXT REFERENCES sessions(id),
          message_id TEXT REFERENCES messages(id),
          patch TEXT,
          created_at INTEGER NOT NULL
        );

        CREATE INDEX idx_file_versions_file ON file_versions(file_id, version DESC);

        -- ============================================
        -- SNAPSHOTS
        -- ============================================

        CREATE TABLE snapshots (
          id TEXT PRIMARY KEY,
          session_id TEXT REFERENCES sessions(id),
          message_id TEXT REFERENCES messages(id),
          hash TEXT NOT NULL,
          file_count INTEGER NOT NULL,
          created_at INTEGER NOT NULL
        );

        -- ============================================
        -- TODOS
        -- ============================================

        CREATE TABLE todos (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL REFERENCES sessions(id),
          content TEXT NOT NULL,
          active_form TEXT NOT NULL,
          status TEXT NOT NULL,
          position INTEGER NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );

        CREATE INDEX idx_todos_session ON todos(session_id, position);

        -- ============================================
        -- PERMISSIONS
        -- ============================================

        CREATE TABLE permissions (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL REFERENCES sessions(id),
          permission TEXT NOT NULL,
          pattern TEXT NOT NULL,
          action TEXT NOT NULL,
          scope TEXT NOT NULL DEFAULT 'session',
          created_at INTEGER NOT NULL
        );

        CREATE INDEX idx_permissions_session ON permissions(session_id);
      `);
    },
  },
];
