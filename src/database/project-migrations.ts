/**
 * Project Database Migrations
 *
 * Defines the schema for per-project databases. Each project gets its own
 * isolated SQLite database, enabling complete data isolation.
 * See: docs/knowledge-base/01-architecture.md#project-isolation
 *
 * Schema documented in: docs/knowledge-base/02-data-model.md
 */

import type { Migration } from "./migrations.ts";

/**
 * Project database stores all project-scoped entities:
 * - Sessions and messages (conversation history)
 * - Message parts (text, tool calls, files)
 * - Custom agents and tools
 * - Files and versions (with diff-based history)
 * - Snapshots (point-in-time project state)
 * - Permissions (tool access rules)
 * - Todos (task tracking)
 *
 * See: docs/knowledge-base/02-data-model.md#project-database-one-per-project
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
  {
    id: 2,
    name: "add_file_content",
    up: (db) => {
      db.exec(`
        -- ============================================
        -- FILE CONTENT
        -- Stores full content for version 1 of files
        -- ============================================

        CREATE TABLE file_content (
          id TEXT PRIMARY KEY,
          version_id TEXT NOT NULL REFERENCES file_versions(id),
          content TEXT NOT NULL
        );

        CREATE INDEX idx_file_content_version ON file_content(version_id);

        -- ============================================
        -- SNAPSHOT FILES
        -- Tracks which files/versions are in each snapshot
        -- ============================================

        CREATE TABLE snapshot_files (
          snapshot_id TEXT NOT NULL REFERENCES snapshots(id),
          file_id TEXT NOT NULL REFERENCES files(id),
          version INTEGER NOT NULL,
          PRIMARY KEY (snapshot_id, file_id)
        );

        CREATE INDEX idx_snapshot_files_snapshot ON snapshot_files(snapshot_id);
      `);
    },
  },
  {
    id: 3,
    name: "missions_and_tasks",
    up: (db) => {
      db.exec(`
        -- ============================================
        -- MISSIONS
        -- Core unit of autonomous work with planning phase
        -- ============================================

        CREATE TABLE missions (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          session_id TEXT REFERENCES sessions(id),
          title TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'planning',
          plan_path TEXT NOT NULL,
          plan_approved_at INTEGER,
          plan_approved_by TEXT,
          created_at INTEGER NOT NULL,
          started_at INTEGER,
          paused_at INTEGER,
          completed_at INTEGER,
          summary TEXT,
          completion_criteria_met INTEGER DEFAULT 0
        );

        CREATE INDEX idx_missions_project ON missions(project_id);
        CREATE INDEX idx_missions_status ON missions(status);

        -- ============================================
        -- TASKS (evolved from todos)
        -- Granular work units that can belong to missions or sessions
        -- ============================================

        -- Create new tasks table with all columns
        CREATE TABLE tasks (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL REFERENCES sessions(id),
          mission_id TEXT REFERENCES missions(id),
          title TEXT NOT NULL,
          active_form TEXT NOT NULL,
          status TEXT NOT NULL,
          position INTEGER NOT NULL,
          created_by TEXT DEFAULT 'agent',
          assigned_to TEXT DEFAULT 'agent',
          parent_task_id TEXT REFERENCES tasks(id),
          description TEXT,
          result TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          started_at INTEGER,
          completed_at INTEGER
        );

        CREATE INDEX idx_tasks_session ON tasks(session_id, position);
        CREATE INDEX idx_tasks_mission ON tasks(mission_id);

        -- Copy data from todos to tasks (renaming content to title)
        INSERT INTO tasks (
          id, session_id, title, active_form, status, position,
          created_at, updated_at
        )
        SELECT
          id, session_id, content, active_form, status, position,
          created_at, updated_at
        FROM todos;

        -- Drop old todos table
        DROP TABLE todos;
      `);
    },
  },
  {
    id: 4,
    name: "processes",
    up: (db) => {
      db.exec(`
        -- ============================================
        -- PROCESSES
        -- Shell commands and services with PTY support
        -- ============================================

        CREATE TABLE processes (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          type TEXT NOT NULL,
          command TEXT NOT NULL,
          cwd TEXT NOT NULL,
          env TEXT,
          cols INTEGER NOT NULL DEFAULT 80,
          rows INTEGER NOT NULL DEFAULT 24,
          scope TEXT NOT NULL,
          scope_id TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'starting',
          exit_code INTEGER,
          label TEXT,
          created_by TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          started_at INTEGER NOT NULL,
          ended_at INTEGER
        );

        CREATE INDEX idx_processes_project ON processes(project_id);
        CREATE INDEX idx_processes_scope ON processes(scope, scope_id);
        CREATE INDEX idx_processes_status ON processes(status);

        -- ============================================
        -- PROCESS OUTPUT
        -- Stores output chunks for history/replay
        -- ============================================

        CREATE TABLE process_output (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          process_id TEXT NOT NULL REFERENCES processes(id),
          timestamp INTEGER NOT NULL,
          data TEXT NOT NULL,
          stream TEXT NOT NULL DEFAULT 'stdout'
        );

        CREATE INDEX idx_process_output_process ON process_output(process_id);
      `);
    },
  },
  {
    id: 5,
    name: "services",
    up: (db) => {
      db.exec(`
        -- ============================================
        -- SERVICES
        -- Persistent service configurations for auto-start
        -- ============================================

        CREATE TABLE services (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          name TEXT NOT NULL,
          command TEXT NOT NULL,
          cwd TEXT,
          env TEXT,
          auto_start INTEGER DEFAULT 0,
          enabled INTEGER DEFAULT 1,
          created_by TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          UNIQUE(project_id, name)
        );

        CREATE INDEX idx_services_project ON services(project_id);
        CREATE INDEX idx_services_auto_start ON services(auto_start) WHERE auto_start = 1;

        -- Add service_id and log_path columns to processes
        ALTER TABLE processes ADD COLUMN service_id TEXT REFERENCES services(id);
        ALTER TABLE processes ADD COLUMN log_path TEXT;

        CREATE INDEX idx_processes_service ON processes(service_id) WHERE service_id IS NOT NULL;
      `);
    },
  },
];
