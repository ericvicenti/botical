# Glossary

This document defines the core terms and concepts used throughout the Botical codebase.

---

## A

### Agent
An AI assistant configuration that defines behavior, permissions, and capabilities. Agents use LLMs to process user prompts and execute tools.

**Types:**
- **Primary Agent**: The main agent users interact with (e.g., "default")
- **Sub-Agent**: Spawned by primary agents for specific tasks (e.g., "explore", "plan")
- **Custom Agent**: User-defined agent with custom prompt and permissions

**Properties:**
- `id`: Unique identifier
- `name`: Display name
- `prompt`: System prompt extending base behavior
- `permissions`: Tool access rules
- `model`: Optional model override

### Agent Orchestrator
The core component that coordinates LLM interactions, tool execution, and message streaming. It manages the "tool loop" where the LLM can call tools repeatedly until task completion.

### API Key
A secret token for programmatic access to the Botical API. Supports:
- User-scoped keys (access all user's projects)
- Project-scoped keys (access single project)
- Permission restrictions

---

## B

### Bus (Event Bus)
The internal pub/sub system for event propagation. Events flow:
1. Internal components publish events
2. Bus notifies all subscribers
3. WebSocket bridge broadcasts to connected clients

**Key Events:**
- `session.created`, `session.updated`, `session.deleted`
- `message.text.delta`, `message.tool.call`, `message.complete`
- `file.updated`, `file.deleted`

---

## C

### Connection
A WebSocket connection from a client to the server. Each connection:
- Belongs to a single project
- Has an authenticated user
- Can subscribe to event channels
- Receives real-time updates

### Context (Tool Context)
The execution environment passed to tools containing:
- `projectId`: Current project
- `sessionId`: Current session
- `messageId`: Current message
- `userId`: Authenticated user
- `abort`: AbortSignal for cancellation
- `askPermission()`: Request user approval

---

## D

### Database Manager
Singleton that manages SQLite database connections:
- **Root DB**: Global data (users, projects)
- **Project DBs**: Per-project data (sessions, messages, files)

Uses Bun's native SQLite driver with WAL mode for concurrency.

---

## E

### Event
A typed message representing a state change. All events have:
- `type`: Event identifier (e.g., "message.text.delta")
- `payload`: Event-specific data (Zod-validated)

Events enable loose coupling between components and real-time client updates.

---

## F

### File Version
A snapshot of a file's content at a point in time. Versions enable:
- Undo/redo functionality
- History viewing
- Restore to previous state

Stored as diffs (patches) for efficiency.

---

## G

### (No entries)

---

## H

### Handler (WebSocket Handler)
A function that processes WebSocket requests. Handlers:
- Receive typed requests from clients
- Execute business logic
- Return typed responses
- May trigger events

---

## I

### Instance (Project Instance)
The runtime context for a project. Uses async local storage to provide:
- Isolated state per project
- Access to project's database
- Automatic cleanup on disposal

Pattern borrowed from OpenCode.

---

## J

### JWT (JSON Web Token)
Authentication token for user sessions. Contains:
- User ID (`sub`)
- Email
- Username
- Expiration (`exp`)

Signed with server's secret key.

---

## K

### (No entries)

---

## L

### LLM (Large Language Model)
The AI model that processes prompts and generates responses. Botical supports multiple providers via the Vercel AI SDK:
- Anthropic (Claude)
- OpenAI (GPT)
- Others via AI SDK

### Lock (Edit Lock)
A mechanism to prevent concurrent editing conflicts. Locks:
- Are acquired before editing
- Expire after timeout
- Are released explicitly or on disconnect

---

## M

### Message
A single exchange in a conversation. Types:
- **User Message**: Input from the user
- **Assistant Message**: Response from the agent

Messages contain parts (text, tool calls, etc.) and metadata (tokens, cost).

### Message Part
A component of a message. Types:
- `text`: Generated text content
- `reasoning`: Chain-of-thought (if enabled)
- `tool`: Tool call and result
- `file`: Attached file
- `step-start`/`step-finish`: Processing boundaries

### Migration
A database schema change. Migrations:
- Are versioned and sequential
- Run automatically on startup
- Track applied state in `migrations` table

---

## N

### (No entries)

---

## O

### (No entries)

---

## P

### Part
See **Message Part**.

### Permission
A rule controlling tool access. Structure:
- `tool`: Tool name or `*` for all
- `pattern`: Argument pattern to match
- `action`: `allow`, `deny`, or `ask`

### Presence
Real-time awareness of connected users. Tracks:
- Who is online
- Current session being viewed
- Cursor position (optional)

### Project
The top-level organizational unit. Each project has:
- Own SQLite database
- Isolated sessions and files
- Member access control
- Settings and configuration

**Types:**
- `local`: Tied to filesystem directory
- `git`: Associated with git repository
- `remote`: Files stored only in database

### Provider
An LLM service (Anthropic, OpenAI, etc.). Providers:
- Are registered in the provider registry
- Return language model instances
- Handle authentication to APIs

---

## Q

### (No entries)

---

## R

### Role
A user's permission level in a project:
- `owner`: Full control, can delete project
- `admin`: Manage members and settings
- `member`: Create sessions, write files
- `viewer`: Read-only access

### Room
A channel for event broadcasting. Clients join rooms to receive specific events:
- `project:{id}`: All project events
- `session:{id}`: Specific session events

---

## S

### Session
A conversation thread with an agent. Contains:
- Ordered messages
- Agent configuration
- Usage statistics
- Optional parent (for sub-agent sessions)

### Snapshot
A point-in-time capture of project file state. Used for:
- Tracking changes during agent operations
- Enabling rollback
- Linking file changes to messages

### Stream
The real-time flow of data from LLM to client. Stream events:
- `text-delta`: Incremental text
- `tool-call`: Tool invocation
- `tool-result`: Tool output
- `finish`: Completion signal

### Sub-Agent
An agent spawned by another agent to handle a subtask. Sub-agents:
- Run in child sessions
- Have restricted permissions
- Return results to parent

---

## T

### Tool
A capability that agents can invoke. Tools:
- Have Zod-validated parameters
- Execute with project context
- Return structured results
- May require permission approval

**Built-in Tools:**
- `read`: Read file contents
- `write`: Write file
- `edit`: Search/replace in file
- `bash`: Execute command
- `glob`: Find files by pattern
- `grep`: Search file contents
- `task`: Spawn sub-agent

### Tool Call
An agent's request to execute a tool. Contains:
- Tool name
- Arguments (validated against schema)
- Call ID for tracking

### Tool Loop
The iterative process where an agent:
1. Receives prompt
2. Generates response (may include tool calls)
3. Executes tool calls
4. Feeds results back to LLM
5. Repeats until complete

---

## U

### User
An authenticated person using Botical. Users:
- Own projects
- Are members of other projects
- Have API keys
- Have preferences

---

## V

### Version
See **File Version**.

---

## W

### WebSocket
The primary communication protocol. Benefits:
- Bidirectional communication
- Efficient streaming
- Real-time events
- Persistent connections

### Workspace
Synonym for **Project** in user-facing contexts.

---

## X-Z

### (No entries)
