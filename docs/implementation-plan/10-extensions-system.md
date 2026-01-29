# Extensions System

This document describes the architecture for Iris extensions, which allow modular features to be added to both the backend and frontend. Extensions can define pages (sidebar panels and main content), actions, and their own backend servers - all using unified abstractions.

## Vision

Extensions encapsulate complete features that can be developed, tested, and deployed independently. The first extension will be a Docker management GUI, demonstrating the full pattern.

## Core Principles

1. **Unified Page Abstraction**: Sidebar panels and main content areas are both "pages" - same registration, same types, differentiated by size
2. **Project-Scoped**: Extensions are enabled per-project in project settings
3. **Independent Servers**: Each extension runs its own backend server process
4. **Type-Safe Boundaries**: Zod schemas define contracts between extension components
5. **User-Controlled Layout**: Sidebar ordering is configured by user/project, not hardcoded by extensions
6. **Internal First**: Extensions live inside the Iris codebase (external extensions deferred)

---

## Unified Page Model

The key architectural change is treating sidebar panels as pages. Pages define their **size**, and the system decides where to render them.

### Page Size Model

```typescript
export type PageSize =
  | "sidebar"      // Narrow, fits in sidebar (240-300px)
  | "medium"       // Medium width panel (400-600px)
  | "full"         // Full main content area
  | "modal-sm"     // Small modal dialog
  | "modal-md"     // Medium modal dialog
  | "modal-lg";    // Large modal dialog

export interface PageDefinition<TParams, TSearch> {
  id: string;
  icon: string;

  // NEW: Size hint for rendering
  size: PageSize;

  // Existing fields...
  category?: PageCategory;
  getLabel: (params: TParams, search?: TSearch) => string;
  params: ZodSchema<TParams>;
  route: string;
  parseParams: (routeParams: Record<string, string>) => TParams | null;
  getRouteParams: (params: TParams) => Record<string, string>;
  component: React.ComponentType<{ params: TParams; search?: TSearch }>;
}
```

### Size Behavior

| Size | Typical Render Location | Route? | Tab? |
|------|------------------------|--------|------|
| `sidebar` | Left sidebar panel | No | No |
| `medium` | Side panel or tab | Optional | Optional |
| `full` | Main content area | Yes | Yes |
| `modal-*` | Overlay dialog | Optional | No |

### Sidebar Page Example

```typescript
// Docker sidebar panel - shows container list
export const dockerSidebarPage = definePage({
  id: "docker.sidebar",
  icon: "container",
  size: "sidebar",
  category: "docker",

  getLabel: () => "Docker",
  params: z.object({}),
  route: "", // Sidebar pages don't need routes
  parseParams: () => ({}),
  getRouteParams: () => ({}),

  component: DockerSidebarPanel,
});
```

### Full Page Example

```typescript
// Docker container detail page - opens in tab
export const dockerContainerPage = definePage({
  id: "docker.container",
  icon: "box",
  size: "full",
  category: "docker",

  getLabel: (params) => params.containerName || "Container",
  getTitle: (params) => `${params.containerName} - Docker`,

  params: z.object({
    containerId: z.string(),
    containerName: z.string().optional(),
  }),

  route: "/docker/containers/$containerId",
  parseParams: (routeParams) => ({ containerId: routeParams.containerId }),
  getRouteParams: (params) => ({ containerId: params.containerId }),

  component: DockerContainerPage,
});
```

---

## Extension Definition

An extension is a self-contained module with its own backend server and frontend pages.

### Extension Manifest

```typescript
export interface ExtensionDefinition {
  /** Unique identifier (e.g., "docker", "kubernetes") */
  id: string;

  /** Display name */
  name: string;

  /** Description for extension browser */
  description: string;

  /** Version following semver */
  version: string;

  /** Icon for extension browser */
  icon: string;

  // ---- Frontend Components ----

  /** Pages (sidebar panels AND main content) */
  pages?: PageDefinition[];

  /** Actions for command palette */
  actions?: ActionDefinition[];

  // ---- Backend Server ----

  /** Port the extension server runs on (0 = auto-assign) */
  defaultPort?: number;

  /** Server entry point (relative to extension directory) */
  serverEntry: string;

  /** Tools available to AI agents (served by extension server) */
  tools?: ToolDefinition[];

  // ---- Configuration ----

  /** Zod schema for extension settings */
  settingsSchema?: z.ZodType;

  /** Default settings values */
  defaultSettings?: Record<string, unknown>;
}
```

### Extension Server Architecture

Each extension runs its own HTTP server as a separate process:

```
┌─────────────────────────────────────────────────────────────┐
│                      Iris Core Server                       │
│                        (port 4096)                          │
├─────────────────────────────────────────────────────────────┤
│  /api/projects, /api/sessions, /api/messages, etc.         │
│  /api/extensions → extension registry & proxy               │
└─────────────────────────────────────────────────────────────┘
          │
          │ Proxies requests to extension servers
          ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│ Docker Extension│  │ K8s Extension   │  │ DB Extension    │
│   (port 4101)   │  │   (port 4102)   │  │   (port 4103)   │
├─────────────────┤  ├─────────────────┤  ├─────────────────┤
│ GET /containers │  │ GET /pods       │  │ GET /databases  │
│ POST /containers│  │ GET /services   │  │ POST /query     │
│ GET /images     │  │ GET /logs       │  │ GET /schemas    │
└─────────────────┘  └─────────────────┘  └─────────────────┘
```

Benefits of separate servers:
- **Isolation**: Extension crashes don't affect core
- **Independent scaling**: Heavy extensions can be scaled separately
- **Language flexibility**: Extensions could be written in any language (future)
- **Hot reload**: Restart extension without restarting core

### Extension Registration

```typescript
// src/extensions/docker/index.ts
import { defineExtension } from "../types";
import { dockerSidebarPage, dockerContainerPage, dockerLogsPage } from "./pages";
import { dockerActions } from "./actions";
import { dockerTools } from "./tools";

export default defineExtension({
  id: "docker",
  name: "Docker",
  description: "Manage Docker containers, images, and networks",
  version: "1.0.0",
  icon: "container",

  // Server configuration
  defaultPort: 4101,
  serverEntry: "./server.ts",

  // Frontend
  pages: [
    dockerSidebarPage,
    dockerContainerPage,
    dockerLogsPage,
    dockerImagePage,
    dockerNewContainerPage,
  ],
  actions: dockerActions,

  // AI tools
  tools: dockerTools,
});
```

---

## Project Configuration

Extensions are enabled per-project in project settings. The user controls which extensions are active and how they appear in the sidebar.

### Project Config Schema

```typescript
// In project's .iris/config.yaml
export const ProjectExtensionsConfigSchema = z.object({
  extensions: z.object({
    /** Enabled extension IDs */
    enabled: z.array(z.string()).default([]),

    /** Per-extension settings overrides */
    settings: z.record(z.string(), z.record(z.unknown())).optional(),
  }).optional(),

  /** Sidebar layout configuration */
  sidebar: z.object({
    /** Ordered list of page IDs to show in sidebar */
    panels: z.array(z.string()).default([
      "files",
      "tasks",
      "git",
      "run",
    ]),
  }).optional(),
});
```

### Example Project Config

```yaml
# .iris/config.yaml
extensions:
  enabled:
    - docker
    - database-explorer

  settings:
    docker:
      defaultConnection: local

sidebar:
  panels:
    - files
    - tasks
    - git
    - docker.sidebar      # Extension sidebar page
    - run
```

---

## Docker Extension Specification

The Docker extension demonstrates the full extension pattern.

### Features

1. **Sidebar Panel**: List of containers (running/stopped) with status indicators
2. **Container Detail Page**: Full container info, environment, ports, volumes
3. **Container Logs Page**: Real-time log streaming with search/filter
4. **Image Browser Page**: List available images, pull new ones
5. **New Container Page**: Form to create and run new containers

> **Future**: SSH remote support for connecting to Docker on remote hosts is deferred but the architecture should accommodate it.

### Pages

| Page ID | Size | Description |
|---------|------|-------------|
| `docker.sidebar` | sidebar | Container list with status |
| `docker.container` | full | Container details and controls |
| `docker.logs` | full | Container log viewer |
| `docker.images` | full | Image browser |
| `docker.new-container` | modal-md | Create container form |

### Extension Server Routes

The Docker extension runs its own server. Routes are relative to the extension server:

```
# Extension server: http://localhost:4101

GET    /containers              # List containers
GET    /containers/:id          # Container details
POST   /containers              # Create container
DELETE /containers/:id          # Remove container
POST   /containers/:id/start    # Start container
POST   /containers/:id/stop     # Stop container
POST   /containers/:id/restart  # Restart container
GET    /containers/:id/logs     # Get logs (SSE stream)

GET    /images                  # List images
POST   /images/pull             # Pull image
DELETE /images/:id              # Remove image

GET    /info                    # Docker daemon info
```

The Iris core server proxies requests:
- `GET /api/extensions/docker/containers` → `GET http://localhost:4101/containers`

### Actions

| Action ID | Description | Shortcut |
|-----------|-------------|----------|
| `docker.start-container` | Start a stopped container | - |
| `docker.stop-container` | Stop a running container | - |
| `docker.restart-container` | Restart a container | - |
| `docker.view-logs` | Open logs for container | - |
| `docker.pull-image` | Pull an image from registry | - |
| `docker.remove-container` | Remove a container | - |

### Tools (for AI Agents)

| Tool Name | Description |
|-----------|-------------|
| `docker_list_containers` | List all containers with status |
| `docker_container_info` | Get detailed container info |
| `docker_start` | Start a container |
| `docker_stop` | Stop a container |
| `docker_logs` | Get container logs |
| `docker_run` | Create and start a new container |

---

## UI Components

### Docker Sidebar Panel

```
┌─────────────────────────┐
│ 🐳 Docker          [+]  │
├─────────────────────────┤
│ ▼ Running (3)           │
│   ● postgres      5432  │
│   ● redis         6379  │
│   ● nginx         80    │
│                         │
│ ▼ Stopped (2)           │
│   ○ mysql               │
│   ○ mongodb             │
│                         │
│ ─────────────────────── │
│ 📦 Images (12)          │
└─────────────────────────┘
```

### Container Detail Page

```
┌─────────────────────────────────────────────────────────────┐
│ 🐳 postgres                                    [▶][⏹][🔄]  │
├─────────────────────────────────────────────────────────────┤
│ Status: Running for 3 days                                  │
│ Image: postgres:15                                          │
│ ID: abc123def456                                            │
│                                                             │
│ ┌─────────┬─────────┬─────────┬─────────┐                  │
│ │ Ports   │ Volumes │ Env     │ Network │                  │
│ └─────────┴─────────┴─────────┴─────────┘                  │
│                                                             │
│ Port Mappings:                                              │
│   5432/tcp → 0.0.0.0:5432                                  │
│                                                             │
│ ┌─────────────────────────────────────────────────────────┐│
│ │ [View Logs]  [Inspect]  [Terminal]  [Remove]           ││
│ └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

### New Container Form

```
┌─────────────────────────────────────────────────────────────┐
│ Create Container                                       [×]  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ Image *         [postgres:15                    ] [Browse]  │
│                                                             │
│ Container Name  [my-postgres                    ]           │
│                                                             │
│ ▼ Port Mappings                                             │
│   Host Port     Container Port                              │
│   [5432    ]    [5432         ]                    [+ Add]  │
│                                                             │
│ ▼ Environment Variables                                     │
│   POSTGRES_PASSWORD  [********            ]        [+ Add]  │
│                                                             │
│ ▼ Volumes                                                   │
│   Host Path            Container Path                       │
│   [./data         ]    [/var/lib/postgresql]      [+ Add]  │
│                                                             │
│ ▼ Advanced Options                                          │
│   [ ] Run in background (detached)                          │
│   [ ] Remove when stopped                                   │
│   [ ] Restart policy: [never ▼]                             │
│                                                             │
│                              [Cancel]  [Create & Start]     │
└─────────────────────────────────────────────────────────────┘
```

---

## Implementation Phases

### Phase 1: Extension Infrastructure

1. **Extend PageDefinition type** with `size` field
2. **Update page registry** to filter by size
3. **Refactor sidebar** to render pages with `size: "sidebar"` based on project config
4. **Create extension registry** for loading internal extensions
5. **Implement extension server manager** to spawn/manage extension processes
6. **Add proxy routes** in core server for `/api/extensions/{id}/*`
7. **Update project config schema** with extensions and sidebar config

### Phase 2: Docker Backend

1. **Docker extension server** using Hono
2. **Docker client service** using `dockerode` library
3. **Container CRUD routes** with Zod validation
4. **Log streaming** via Server-Sent Events
5. **Unit tests** for all routes

### Phase 3: Docker Frontend

1. **Docker sidebar panel** component
2. **Container list** with real-time status updates
3. **Container detail page** with tabs
4. **Log viewer** with streaming and search
5. **New container form** with validation

### Phase 4: Polish & Integration

1. **Actions** for command palette
2. **Tools** for AI agents
3. **Extension settings in project settings UI**
4. **E2E tests** for full flows
5. **Documentation**

---

## File Structure

```
src/
├── extensions/
│   ├── index.ts              # Extension registry & manager
│   ├── types.ts              # Extension types (shared)
│   ├── server-manager.ts     # Spawns/manages extension servers
│   └── proxy.ts              # Proxy middleware for core server
│
├── server/
│   └── routes/
│       └── extensions.ts     # /api/extensions/* proxy routes
│
└── extensions/
    └── docker/
        ├── index.ts          # Extension definition
        ├── server.ts         # Hono server entry point
        ├── client.ts         # Docker API client (dockerode)
        ├── routes/
        │   ├── containers.ts
        │   ├── images.ts
        │   └── info.ts
        ├── tools.ts          # AI agent tools
        └── types.ts          # Docker-specific Zod schemas

webui/src/
├── primitives/
│   ├── types.ts              # Updated with PageSize
│   └── registry.ts           # Updated for size filtering
│
├── extensions/
│   ├── index.ts              # Frontend extension registry
│   ├── types.ts              # Frontend extension types
│   │
│   └── docker/
│       ├── index.ts          # Extension definition (pages, actions)
│       ├── pages.ts          # Page definitions
│       ├── actions.ts        # Action definitions
│       ├── api.ts            # React Query hooks for extension API
│       │
│       └── components/
│           ├── DockerSidebarPanel.tsx
│           ├── ContainerList.tsx
│           ├── ContainerDetailPage.tsx
│           ├── ContainerLogsPage.tsx
│           ├── ImageBrowserPage.tsx
│           └── NewContainerModal.tsx
│
├── contexts/
│   └── ui.tsx                # Updated: sidebar panels from project config
│
└── components/
    └── Sidebar/
        ├── Sidebar.tsx       # Updated: dynamic panel rendering
        └── SidebarPanelRenderer.tsx  # Renders pages by size
```

---

## API Types

### Container

```typescript
export const ContainerSchema = z.object({
  id: z.string(),
  name: z.string(),
  image: z.string(),
  imageId: z.string(),
  status: z.enum(["running", "paused", "exited", "created", "restarting", "removing", "dead"]),
  state: z.object({
    running: z.boolean(),
    paused: z.boolean(),
    exitCode: z.number().optional(),
    startedAt: z.string().optional(),
    finishedAt: z.string().optional(),
  }),
  ports: z.array(z.object({
    privatePort: z.number(),
    publicPort: z.number().optional(),
    type: z.enum(["tcp", "udp"]),
    ip: z.string().optional(),
  })),
  mounts: z.array(z.object({
    type: z.enum(["bind", "volume", "tmpfs"]),
    source: z.string(),
    destination: z.string(),
    mode: z.string(),
    rw: z.boolean(),
  })),
  created: z.number(),
  labels: z.record(z.string()),
});

export type Container = z.infer<typeof ContainerSchema>;
```

### Image

```typescript
export const ImageSchema = z.object({
  id: z.string(),
  repoTags: z.array(z.string()),
  repoDigests: z.array(z.string()),
  created: z.number(),
  size: z.number(),
  virtualSize: z.number(),
  labels: z.record(z.string()).optional(),
});

export type Image = z.infer<typeof ImageSchema>;
```

### Create Container Request

```typescript
export const CreateContainerRequestSchema = z.object({
  image: z.string(),
  name: z.string().optional(),
  env: z.record(z.string()).optional(),
  ports: z.array(z.object({
    hostPort: z.number(),
    containerPort: z.number(),
    protocol: z.enum(["tcp", "udp"]).default("tcp"),
  })).optional(),
  volumes: z.array(z.object({
    hostPath: z.string(),
    containerPath: z.string(),
    mode: z.enum(["rw", "ro"]).default("rw"),
  })).optional(),
  autoRemove: z.boolean().default(false),
  detach: z.boolean().default(true),
  restartPolicy: z.enum(["no", "always", "unless-stopped", "on-failure"]).default("no"),
});
```

---

## Testing Strategy

### Unit Tests

```typescript
// Backend: Docker client wrapper
describe("DockerClient", () => {
  it("lists containers");
  it("starts a container");
  it("stops a container");
  it("handles connection errors gracefully");
});

// Backend: Routes
describe("Docker Routes", () => {
  it("GET /containers returns container list");
  it("POST /containers creates container");
  it("POST /containers/:id/start starts container");
  it("validates request bodies with Zod");
});
```

### Integration Tests

```typescript
describe("Docker Extension", () => {
  it("registers all pages on load");
  it("mounts routes under /api/extensions/docker");
  it("provides tools to AI agents");
});
```

### E2E Tests

```typescript
describe("Docker UI", () => {
  it("shows container list in sidebar");
  it("opens container detail when clicking container");
  it("streams logs in real-time");
  it("creates new container from form");
});
```

---

## Dependencies

### Backend

- `dockerode` - Docker API client for Node.js

### Frontend

- No new dependencies (uses existing React Query, Zod, Lucide icons)

---

## Security Considerations

1. **Docker socket access**: Only available when Docker is installed locally
2. **Container exec**: Not implemented initially (security risk)
3. **Image pulls**: Validate registry URLs, support private registries with auth (future)
4. **Environment variables**: Mask sensitive values in UI
5. **Extension isolation**: Each extension runs in its own process

---

## Future Enhancements

### Docker Extension

- **SSH Remote Support**: Connect to Docker daemons on remote hosts via SSH tunnel
- **Docker Compose**: Parse and manage compose files, start/stop stacks
- **Private Registries**: Authentication for pulling from private registries
- **Container Terminal**: Interactive shell inside containers (security considerations)

### Additional Extensions

This pattern enables future extensions like:

- **Kubernetes**: Cluster management, pod viewing, log streaming
- **Database Explorer**: Connect to databases, run queries, view schemas
- **Redis/Cache Viewer**: Key browser, value inspection
- **Log Aggregator**: Unified log viewing across services
- **Metrics Dashboard**: Resource usage, performance monitoring

### External Extensions

Eventually, extensions could be loaded from external sources:
- npm packages following the extension manifest schema
- Git repositories with extension code
- Extension marketplace/registry

Each would follow the same pattern: sidebar page + main content pages + extension server.
