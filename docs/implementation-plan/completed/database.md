# Database Schema Design

## Overview

Iris uses a multi-database architecture:
- **Root Database** (`iris.db`): Global data (users, projects, server config)
- **Project Databases** (`projects/{projectId}/project.db`): Per-project data

This separation provides:
- Project isolation and portability
- Parallel access without lock contention
- Easy backup/restore per project
- Collaborative features can sync just project DBs

## Root Database Schema

Location: `~/.iris/iris.db`

```sql
-- ============================================
-- USERS
-- ============================================

CREATE TABLE users (
  id TEXT PRIMARY KEY,                    -- UUID
  email TEXT UNIQUE,                      -- For email-based auth
  username TEXT UNIQUE NOT NULL,          -- Display name
  password_hash TEXT,                     -- bcrypt hash (null for OAuth)
  avatar_url TEXT,

  -- OAuth providers
  oauth_provider TEXT,                    -- 'github', 'google', etc.
  oauth_id TEXT,

  -- Preferences
  preferences TEXT NOT NULL DEFAULT '{}', -- JSON blob

  -- Timestamps
  created_at INTEGER NOT NULL,            -- Unix ms
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
  id TEXT PRIMARY KEY,                    -- UUID or git root commit hash
  name TEXT NOT NULL,
  description TEXT,

  -- Ownership
  owner_id TEXT NOT NULL REFERENCES users(id),

  -- Project type
  type TEXT NOT NULL DEFAULT 'local',     -- 'local', 'git', 'remote'
  path TEXT,                              -- Filesystem path (if local/git)
  git_remote TEXT,                        -- Git remote URL (if git)

  -- Visual
  icon_url TEXT,
  color TEXT,

  -- Settings
  settings TEXT NOT NULL DEFAULT '{}',    -- JSON blob

  -- Timestamps
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  archived_at INTEGER,                    -- Soft delete

  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_projects_owner ON projects(owner_id);
CREATE INDEX idx_projects_path ON projects(path);

-- ============================================
-- PROJECT MEMBERS (for collaboration)
-- ============================================

CREATE TABLE project_members (
  project_id TEXT NOT NULL REFERENCES projects(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  role TEXT NOT NULL DEFAULT 'member',    -- 'owner', 'admin', 'member', 'viewer'

  -- Permissions override
  permissions TEXT,                       -- JSON: custom permission rules

  -- Timestamps
  joined_at INTEGER NOT NULL,
  invited_by TEXT REFERENCES users(id),

  PRIMARY KEY (project_id, user_id)
);

CREATE INDEX idx_project_members_user ON project_members(user_id);

-- ============================================
-- API KEYS (for external access)
-- ============================================

CREATE TABLE api_keys (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL,                 -- Hashed API key
  key_prefix TEXT NOT NULL,               -- First 8 chars for identification

  -- Scope
  project_id TEXT REFERENCES projects(id), -- null = all projects
  permissions TEXT NOT NULL DEFAULT '[]',  -- JSON array of permissions

  -- Usage
  last_used_at INTEGER,
  usage_count INTEGER NOT NULL DEFAULT 0,

  -- Timestamps
  created_at INTEGER NOT NULL,
  expires_at INTEGER,                     -- null = never
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
  provider TEXT NOT NULL,                 -- 'openai', 'anthropic', etc.

  -- Credentials (encrypted)
  api_key_encrypted TEXT NOT NULL,

  -- Metadata
  name TEXT,                              -- User-friendly name
  is_default INTEGER NOT NULL DEFAULT 0,

  -- Timestamps
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
  value TEXT NOT NULL,                    -- JSON value
  updated_at INTEGER NOT NULL
);

-- ============================================
-- MIGRATIONS TRACKING
-- ============================================

CREATE TABLE migrations (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at INTEGER NOT NULL
);
```

## Project Database Schema

Location: `~/.iris/projects/{projectId}/project.db`

```sql
-- ============================================
-- SESSIONS (Conversation threads)
-- ============================================

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,                    -- Descending ID for newest-first
  slug TEXT NOT NULL,                     -- URL-friendly identifier

  -- Hierarchy
  parent_id TEXT REFERENCES sessions(id), -- For sub-agent sessions

  -- Metadata
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',  -- 'active', 'archived', 'deleted'
  agent TEXT NOT NULL DEFAULT 'default',  -- Agent used for this session

  -- Model info (for the session)
  provider_id TEXT,
  model_id TEXT,

  -- Stats
  message_count INTEGER NOT NULL DEFAULT 0,
  total_cost REAL NOT NULL DEFAULT 0,
  total_tokens_input INTEGER NOT NULL DEFAULT 0,
  total_tokens_output INTEGER NOT NULL DEFAULT 0,

  -- Sharing
  share_url TEXT,
  share_secret TEXT,

  -- Permissions (JSON ruleset)
  permissions TEXT,

  -- Timestamps
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
  id TEXT PRIMARY KEY,                    -- Ascending ID for chronological
  session_id TEXT NOT NULL REFERENCES sessions(id),

  -- Role
  role TEXT NOT NULL,                     -- 'user', 'assistant', 'system'

  -- For assistant messages
  parent_id TEXT REFERENCES messages(id), -- The user message this responds to

  -- Model info (for assistant messages)
  provider_id TEXT,
  model_id TEXT,
  agent TEXT,

  -- Completion status
  finish_reason TEXT,                     -- 'stop', 'tool-calls', 'length', etc.

  -- Cost tracking
  cost REAL NOT NULL DEFAULT 0,
  tokens_input INTEGER NOT NULL DEFAULT 0,
  tokens_output INTEGER NOT NULL DEFAULT 0,
  tokens_reasoning INTEGER NOT NULL DEFAULT 0,
  tokens_cache_read INTEGER NOT NULL DEFAULT 0,
  tokens_cache_write INTEGER NOT NULL DEFAULT 0,

  -- Error state
  error_type TEXT,
  error_message TEXT,

  -- Timestamps
  created_at INTEGER NOT NULL,
  completed_at INTEGER
);

CREATE INDEX idx_messages_session ON messages(session_id, id);

-- ============================================
-- MESSAGE PARTS (Content components)
-- ============================================

CREATE TABLE message_parts (
  id TEXT PRIMARY KEY,                    -- Ascending ID
  message_id TEXT NOT NULL REFERENCES messages(id),
  session_id TEXT NOT NULL,               -- Denormalized for queries

  -- Part type
  type TEXT NOT NULL,                     -- 'text', 'reasoning', 'tool', 'file', 'step-start', 'step-finish', 'patch'

  -- Content (type-specific JSON)
  content TEXT NOT NULL,

  -- For tool parts
  tool_name TEXT,
  tool_call_id TEXT,
  tool_status TEXT,                       -- 'pending', 'running', 'completed', 'error'

  -- Timestamps
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX idx_parts_message ON message_parts(message_id, id);
CREATE INDEX idx_parts_session ON message_parts(session_id);
CREATE INDEX idx_parts_tool ON message_parts(tool_name) WHERE tool_name IS NOT NULL;

-- ============================================
-- AGENTS (Custom agent configurations)
-- ============================================

CREATE TABLE agents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,

  -- Mode
  mode TEXT NOT NULL DEFAULT 'subagent',  -- 'primary', 'subagent', 'all'
  hidden INTEGER NOT NULL DEFAULT 0,

  -- Model override
  provider_id TEXT,
  model_id TEXT,

  -- Generation settings
  temperature REAL,
  top_p REAL,
  max_steps INTEGER,

  -- System prompt
  prompt TEXT,

  -- Permissions (JSON ruleset)
  permissions TEXT,

  -- Options (JSON)
  options TEXT NOT NULL DEFAULT '{}',

  -- Color for UI
  color TEXT,

  -- Timestamps
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,

  -- Built-in flag
  is_builtin INTEGER NOT NULL DEFAULT 0
);

-- ============================================
-- TOOLS (Custom tool definitions)
-- ============================================

CREATE TABLE tools (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL,

  -- Tool type
  type TEXT NOT NULL,                     -- 'code', 'mcp', 'http'

  -- For code tools: the implementation
  code TEXT,

  -- For MCP tools: connection info
  mcp_server TEXT,
  mcp_tool TEXT,

  -- For HTTP tools: endpoint info
  http_url TEXT,
  http_method TEXT,

  -- Schema (JSON Schema for parameters)
  parameters_schema TEXT NOT NULL,

  -- Enabled/disabled
  enabled INTEGER NOT NULL DEFAULT 1,

  -- Timestamps
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- ============================================
-- FILES (Project file tracking)
-- ============================================

CREATE TABLE files (
  id TEXT PRIMARY KEY,
  path TEXT NOT NULL UNIQUE,              -- Relative to project root

  -- File info
  type TEXT NOT NULL,                     -- 'file', 'directory'
  mime_type TEXT,
  size INTEGER,

  -- Content hash (for change detection)
  hash TEXT,

  -- Metadata
  metadata TEXT DEFAULT '{}',             -- JSON blob

  -- Timestamps
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER                      -- Soft delete
);

CREATE INDEX idx_files_path ON files(path);
CREATE INDEX idx_files_type ON files(type);

-- ============================================
-- FILE VERSIONS (For undo/history)
-- ============================================

CREATE TABLE file_versions (
  id TEXT PRIMARY KEY,
  file_id TEXT NOT NULL REFERENCES files(id),

  -- Version info
  version INTEGER NOT NULL,
  hash TEXT NOT NULL,

  -- Change metadata
  session_id TEXT REFERENCES sessions(id),
  message_id TEXT REFERENCES messages(id),

  -- Patch from previous version (or full content for first version)
  patch TEXT,

  -- Timestamps
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_file_versions_file ON file_versions(file_id, version DESC);

-- ============================================
-- SNAPSHOTS (Point-in-time project state)
-- ============================================

CREATE TABLE snapshots (
  id TEXT PRIMARY KEY,

  -- Reference
  session_id TEXT REFERENCES sessions(id),
  message_id TEXT REFERENCES messages(id),

  -- Snapshot data
  hash TEXT NOT NULL,
  file_count INTEGER NOT NULL,

  -- Timestamps
  created_at INTEGER NOT NULL
);

-- ============================================
-- TODOS (Task tracking)
-- ============================================

CREATE TABLE todos (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id),

  -- Content
  content TEXT NOT NULL,
  active_form TEXT NOT NULL,              -- Present tense version

  -- Status
  status TEXT NOT NULL,                   -- 'pending', 'in_progress', 'completed'

  -- Ordering
  position INTEGER NOT NULL,

  -- Timestamps
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX idx_todos_session ON todos(session_id, position);

-- ============================================
-- PERMISSIONS (Session-level permissions)
-- ============================================

CREATE TABLE permissions (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id),

  -- Permission rule
  permission TEXT NOT NULL,               -- Tool name or category
  pattern TEXT NOT NULL,                  -- Pattern to match
  action TEXT NOT NULL,                   -- 'allow', 'deny', 'ask'

  -- Scope
  scope TEXT NOT NULL DEFAULT 'session',  -- 'session', 'project', 'global'

  -- Timestamps
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_permissions_session ON permissions(session_id);

-- ============================================
-- MIGRATIONS TRACKING
-- ============================================

CREATE TABLE migrations (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at INTEGER NOT NULL
);
```

## Database Access Patterns

### Connection Management

```typescript
// Database manager singleton
class DatabaseManager {
  private rootDb: Database;
  private projectDbs: Map<string, Database> = new Map();

  getRootDb(): Database {
    if (!this.rootDb) {
      this.rootDb = new Database(getRootDbPath());
      this.runMigrations(this.rootDb, ROOT_MIGRATIONS);
    }
    return this.rootDb;
  }

  getProjectDb(projectId: string): Database {
    if (!this.projectDbs.has(projectId)) {
      const db = new Database(getProjectDbPath(projectId));
      this.runMigrations(db, PROJECT_MIGRATIONS);
      this.projectDbs.set(projectId, db);
    }
    return this.projectDbs.get(projectId)!;
  }

  closeProject(projectId: string): void {
    const db = this.projectDbs.get(projectId);
    if (db) {
      db.close();
      this.projectDbs.delete(projectId);
    }
  }
}
```

### Query Helpers

```typescript
// Type-safe query builders with Zod validation
const SessionQueries = {
  create: (db: Database, session: Session.Create) => {
    const stmt = db.prepare(`
      INSERT INTO sessions (id, slug, parent_id, title, agent, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    return stmt.run(
      session.id,
      session.slug,
      session.parentId,
      session.title,
      session.agent,
      Date.now(),
      Date.now()
    );
  },

  get: (db: Database, id: string): Session.Info | null => {
    const row = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id);
    return row ? Session.Info.parse(row) : null;
  },

  list: (db: Database, options: { status?: string; limit?: number }) => {
    let query = 'SELECT * FROM sessions WHERE 1=1';
    const params: any[] = [];

    if (options.status) {
      query += ' AND status = ?';
      params.push(options.status);
    }

    query += ' ORDER BY id DESC';

    if (options.limit) {
      query += ' LIMIT ?';
      params.push(options.limit);
    }

    return db.prepare(query).all(...params).map(row => Session.Info.parse(row));
  }
};
```

## Migration System

```typescript
interface Migration {
  id: number;
  name: string;
  up: (db: Database) => void;
  down?: (db: Database) => void;
}

const ROOT_MIGRATIONS: Migration[] = [
  {
    id: 1,
    name: 'initial_schema',
    up: (db) => {
      db.exec(ROOT_SCHEMA_SQL);
    }
  },
  // Future migrations...
];

const PROJECT_MIGRATIONS: Migration[] = [
  {
    id: 1,
    name: 'initial_schema',
    up: (db) => {
      db.exec(PROJECT_SCHEMA_SQL);
    }
  },
  // Future migrations...
];
```

## Considerations

### Performance
- Use WAL mode for better concurrency
- Create indexes for common query patterns
- Consider FTS5 for full-text search on messages
- Use prepared statements for repeated queries

### Backup Strategy
- Root DB: Regular full backups
- Project DBs: Can be backed up independently
- Consider SQLite's backup API for hot backups

### Multi-User Locking
- SQLite handles concurrent reads well
- For writes, consider:
  - Application-level locks for critical sections
  - Optimistic concurrency with version columns
  - Message queue for write serialization
