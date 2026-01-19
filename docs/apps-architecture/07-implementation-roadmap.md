# Iris Apps: Implementation Roadmap

## Overview

This roadmap outlines a phased approach to implementing the Iris Apps system. Each phase builds on the previous, delivering usable functionality at each milestone.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       IMPLEMENTATION PHASES                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Phase 1: Foundation                                                     │
│  ├── App manifest & loader                                              │
│  ├── Basic app lifecycle                                                │
│  └── App tab display                                                    │
│         │                                                                │
│         ▼                                                                │
│  Phase 2: Core Runtime                                                   │
│  ├── State management                                                   │
│  ├── Tool registration & execution                                      │
│  └── Bridge protocol                                                    │
│         │                                                                │
│         ▼                                                                │
│  Phase 3: SDK & DX                                                       │
│  ├── @iris/app-sdk package                                              │
│  ├── CLI commands                                                       │
│  └── Hot reload                                                         │
│         │                                                                │
│         ▼                                                                │
│  Phase 4: Platform Integration                                           │
│  ├── Iris AI access                                                     │
│  ├── Filesystem access                                                  │
│  └── Cross-app communication                                            │
│         │                                                                │
│         ▼                                                                │
│  Phase 5: Security & Permissions                                         │
│  ├── Permission enforcement                                             │
│  ├── Sandboxing                                                         │
│  └── Audit logging                                                      │
│         │                                                                │
│         ▼                                                                │
│  Phase 6: Production Ready                                               │
│  ├── Error resilience                                                   │
│  ├── Standalone runtime                                                 │
│  └── App marketplace                                                    │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Foundation

### Objective
Get a basic app loading and displaying in Iris. No functionality yet—just the skeleton.

### Deliverables

#### 1.1 App Manifest Schema
```typescript
// src/apps/manifest.ts
import { z } from 'zod';

export const AppManifestSchema = z.object({
  name: z.string().regex(/^[a-z0-9-]+$/),
  displayName: z.string(),
  version: z.string(),
  description: z.string().optional(),
  icon: z.string().optional(),

  server: z.object({
    entry: z.string(),
  }),

  ui: z.object({
    entry: z.string(),
    devPort: z.number().optional(),
  }).optional(),

  permissions: z.array(z.string()).default([]),
});

export type AppManifest = z.infer<typeof AppManifestSchema>;
```

#### 1.2 App Manager (Basic)
```typescript
// src/apps/manager.ts
export class AppManager {
  private apps = new Map<string, ManagedApp>();

  async discover(projectPath: string): Promise<DiscoveredApp[]>;
  async load(appPath: string): Promise<ManagedApp>;
  async unload(appId: string): Promise<void>;

  get(appId: string): ManagedApp | undefined;
  getByProject(projectId: string): ManagedApp[];
}
```

#### 1.3 App Tab Type
```typescript
// webui/src/lib/tabs.ts
interface AppTabData {
  type: 'app';
  projectId: string;
  appId: string;
  appName: string;
}
```

#### 1.4 App Host Component (Shell)
```tsx
// webui/src/components/apps/AppHost.tsx
export function AppHost({ app }: { app: AppInfo }) {
  return (
    <div className="h-full flex flex-col">
      <AppHeader app={app} />
      <div className="flex-1">
        <iframe
          src={app.uiUrl}
          className="w-full h-full border-0"
          sandbox="allow-scripts allow-same-origin"
        />
      </div>
    </div>
  );
}
```

### Milestone Criteria
- [ ] Can create an `app.json` in a project
- [ ] Iris discovers the app and shows it in sidebar
- [ ] Clicking app opens a tab with iframe
- [ ] iframe loads the app's UI entry point

---

## Phase 2: Core Runtime

### Objective
Implement the app server runtime with state management and tool execution.

### Deliverables

#### 2.1 App Runtime
```typescript
// src/apps/runtime.ts
export class AppRuntime {
  private state: Map<string, StateHandle>;
  private tools: Map<string, ToolDefinition>;
  private services: Map<string, ServiceInstance>;

  async initialize(module: AppModule): Promise<void>;
  async executeLifecycle(hook: 'activate' | 'deactivate'): Promise<void>;
  async executeTool(name: string, args: unknown, ctx: ToolContext): Promise<ToolResult>;

  getState(): Record<string, unknown>;
  setState(key: string, value: unknown): void;
}
```

#### 2.2 State Implementation
```typescript
// src/apps/state.ts
export function createState<T>(initial: T, options?: StateOptions): StateHandle<T> {
  let value = initial;
  const listeners = new Set<Listener<T>>();

  return {
    get: () => value,
    set: (newValue: T) => {
      value = newValue;
      listeners.forEach(l => l(value));
    },
    update: (updater: (prev: T) => T) => {
      value = updater(value);
      listeners.forEach(l => l(value));
    },
    subscribe: (listener: Listener<T>) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
```

#### 2.3 Tool Execution
```typescript
// src/apps/tools.ts
export class AppToolExecutor {
  async execute(
    tool: ToolDefinition,
    args: unknown,
    ctx: ToolContext
  ): Promise<ToolResult> {
    // Validate args
    const parsed = tool.parameters.safeParse(args);
    if (!parsed.success) {
      return { success: false, error: formatZodError(parsed.error) };
    }

    // Execute with timeout and error handling
    try {
      const result = await Promise.race([
        tool.execute(parsed.data, ctx),
        this.timeout(tool.timeout ?? 30000),
      ]);
      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}
```

#### 2.4 Bridge Protocol (Basic)
```typescript
// src/apps/bridge.ts
export class AppBridge {
  private handlers = new Map<string, MessageHandler>();

  constructor(private ws: WebSocket) {
    ws.onmessage = this.handleMessage;
  }

  send(message: BridgeMessage): void;
  on(type: string, handler: MessageHandler): void;

  // Core message types
  syncState(state: Record<string, unknown>): void;
  updateState(key: string, value: unknown): void;
  sendActionResult(id: string, result: ToolResult): void;
}
```

### Milestone Criteria
- [ ] App server module loads and executes
- [ ] State updates sync to UI via bridge
- [ ] Tools can be called from UI
- [ ] Tool results return to UI

---

## Phase 3: SDK & Developer Experience

### Objective
Create the SDK package and excellent developer experience.

### Deliverables

#### 3.1 SDK Package Structure
```
packages/app-sdk/
├── package.json
├── src/
│   ├── server/
│   │   ├── index.ts        # defineApp, defineTool, state, etc.
│   │   ├── app.ts
│   │   ├── state.ts
│   │   ├── tool.ts
│   │   └── context.ts
│   ├── react/
│   │   ├── index.ts        # Hooks and components
│   │   ├── provider.tsx
│   │   ├── hooks/
│   │   │   ├── useAppState.ts
│   │   │   ├── useTool.ts
│   │   │   └── useAppContext.ts
│   │   └── components/
│   │       └── ErrorBoundary.tsx
│   └── types/
│       └── index.ts
└── tsconfig.json
```

#### 3.2 Server SDK API
```typescript
// packages/app-sdk/src/server/index.ts
export { defineApp } from './app';
export { defineTool } from './tool';
export { state, computed, query, mutation } from './state';
export type { AppContext, ToolContext, StateHandle } from './context';
```

#### 3.3 React SDK API
```typescript
// packages/app-sdk/src/react/index.ts
export { IrisAppProvider } from './provider';
export { useAppState, useComputed } from './hooks/useAppState';
export { useTool, useToolCall } from './hooks/useTool';
export { useQuery, useMutation } from './hooks/useQuery';
export { useAppContext } from './hooks/useAppContext';
export { useAppEvent, useAppEmit } from './hooks/useAppEvent';
export { AppErrorBoundary } from './components/ErrorBoundary';
```

#### 3.4 Hot Reload
```typescript
// src/apps/hot-reload.ts
export class HotReloadManager {
  private watcher: FSWatcher;
  private stateSnapshot: Map<string, unknown>;

  watch(appPath: string): void {
    this.watcher = Bun.file(appPath).watch();
    for await (const event of this.watcher) {
      await this.handleChange(event);
    }
  }

  private async handleChange(event: FSEvent): Promise<void> {
    // Snapshot state
    this.stateSnapshot = this.captureState();

    // Reload module
    await this.reloadModule();

    // Restore state
    this.restoreState(this.stateSnapshot);

    // Notify UI
    this.notifyUI();
  }
}
```

#### 3.5 CLI Commands
```bash
# In package.json scripts or iris CLI
iris app create <name>      # Scaffold new app
iris app dev                # Start dev mode with hot reload
iris app build              # Build for production
iris app validate           # Validate manifest and code
```

### Milestone Criteria
- [ ] SDK package published and installable
- [ ] Can create app using `defineApp()` API
- [ ] React hooks work for state and tools
- [ ] File changes trigger hot reload
- [ ] State preserved across hot reloads

---

## Phase 4: Platform Integration

### Objective
Give apps access to Iris platform capabilities.

### Deliverables

#### 4.1 Iris Context Extension
```typescript
// Extension to AppContext for Iris access
interface IrisContext {
  ai: {
    chat(messages: Message[], options?: ChatOptions): Promise<ChatResponse>;
    embed(text: string | string[]): Promise<number[][]>;
  };

  fs: {
    read(path: string): Promise<string>;
    write(path: string, content: string): Promise<void>;
    list(path: string): Promise<FileInfo[]>;
    exists(path: string): Promise<boolean>;
  };

  tools: {
    list(): Promise<ToolInfo[]>;
    call(name: string, args: unknown): Promise<ToolResult>;
  };

  navigate(path: string): void;
  notify(message: string, options?: NotifyOptions): void;
}
```

#### 4.2 AI Integration
```typescript
// src/apps/platform/ai.ts
export class AppAIProvider {
  constructor(
    private appId: string,
    private permissions: Permission[],
    private rateLimiter: RateLimiter
  ) {}

  async chat(messages: Message[], options?: ChatOptions): Promise<ChatResponse> {
    // Check permission
    this.checkPermission('ai:chat');

    // Rate limit
    await this.rateLimiter.acquire('ai:chat');

    // Execute with app context
    return this.aiService.chat(messages, {
      ...options,
      metadata: { appId: this.appId },
    });
  }
}
```

#### 4.3 Filesystem Integration
```typescript
// src/apps/platform/fs.ts
export class AppFSProvider {
  constructor(
    private appId: string,
    private permissions: Permission[],
    private projectPath: string
  ) {}

  async read(path: string): Promise<string> {
    const resolvedPath = this.resolvePath(path);

    // Check permission
    this.checkPermission(`filesystem:read:${resolvedPath}`);

    return Bun.file(resolvedPath).text();
  }

  private resolvePath(path: string): string {
    // Resolve $PROJECT, $APP, etc.
    // Prevent path traversal attacks
  }
}
```

#### 4.4 Cross-App Communication
```typescript
// src/apps/platform/apps.ts
export class AppBroker {
  async call(
    sourceApp: string,
    targetApp: string,
    toolName: string,
    args: unknown
  ): Promise<ToolResult> {
    // Check permission
    this.checkPermission(sourceApp, 'iris:apps');

    // Find target app
    const target = this.appManager.get(targetApp);
    if (!target) {
      return { success: false, error: `App not found: ${targetApp}` };
    }

    // Execute tool
    return target.runtime.executeTool(toolName, args, {
      caller: { type: 'app', appId: sourceApp },
    });
  }
}
```

### Milestone Criteria
- [ ] Apps can call AI models
- [ ] Apps can read/write files (within permissions)
- [ ] Apps can call built-in Iris tools
- [ ] Apps can communicate with other apps
- [ ] All access is permission-gated

---

## Phase 5: Security & Permissions

### Objective
Implement robust security model with proper sandboxing.

### Deliverables

#### 5.1 Permission System
```typescript
// src/apps/security/permissions.ts
export class PermissionManager {
  private granted: Set<Permission>;
  private denied: Set<Permission>;

  check(required: Permission): PermissionCheckResult {
    // Exact match
    if (this.granted.has(required)) {
      return { allowed: true };
    }

    // Wildcard match
    for (const granted of this.granted) {
      if (this.matches(granted, required)) {
        return { allowed: true };
      }
    }

    // Denied
    return {
      allowed: false,
      reason: `Permission denied: ${required}`,
      required,
    };
  }

  private matches(granted: Permission, required: Permission): boolean {
    // Handle wildcards, scopes, etc.
  }
}
```

#### 5.2 Permission UI
```tsx
// webui/src/components/apps/PermissionPrompt.tsx
export function PermissionPrompt({ app, permission, onAllow, onDeny }) {
  return (
    <Dialog>
      <DialogTitle>Permission Request</DialogTitle>
      <DialogContent>
        <p>
          <strong>{app.displayName}</strong> is requesting:
        </p>
        <PermissionDescription permission={permission} />
        <PermissionRiskLevel permission={permission} />
      </DialogContent>
      <DialogActions>
        <Button onClick={onDeny}>Deny</Button>
        <Button onClick={() => onAllow('once')}>Allow Once</Button>
        <Button onClick={() => onAllow('always')}>Allow Always</Button>
      </DialogActions>
    </Dialog>
  );
}
```

#### 5.3 Audit Logging
```typescript
// src/apps/security/audit.ts
export class AuditLogger {
  async log(event: AuditEvent): Promise<void> {
    const entry: AuditLogEntry = {
      timestamp: Date.now(),
      appId: event.appId,
      action: event.action,
      target: event.target,
      allowed: event.allowed,
      result: event.result,
    };

    // Write to audit log
    await this.storage.append(entry);

    // Check for anomalies
    if (this.anomalyDetector.check(entry)) {
      await this.alertManager.raise(entry);
    }
  }
}
```

#### 5.4 Sandbox Hardening
```typescript
// src/apps/security/sandbox.ts
export function createSandboxedContext(
  app: ManagedApp,
  permissions: Permission[]
): AppContext {
  return new Proxy({} as AppContext, {
    get(target, prop) {
      // Intercept all property access
      // Check permissions
      // Log access
      // Return sandboxed implementation
    },
  });
}
```

### Milestone Criteria
- [ ] Permission checks on all sensitive operations
- [ ] Permission prompt UI for interactive approval
- [ ] Audit log captures all sensitive operations
- [ ] Anomaly detection alerts on suspicious patterns
- [ ] Apps cannot escape sandbox

---

## Phase 6: Production Ready

### Objective
Polish for production use including error resilience, standalone mode, and distribution.

### Deliverables

#### 6.1 Error Resilience
- Comprehensive error boundaries at every level
- Graceful degradation for partial failures
- User-friendly error UI with recovery actions
- Error reporting and telemetry (opt-in)

#### 6.2 Standalone Runtime
```typescript
// packages/app-sdk/src/runtime/index.ts
export function createStandaloneRuntime(options: RuntimeOptions) {
  return {
    async start() {
      // Load app
      const app = await loadApp(options.appPath);

      // Create minimal Iris context
      const ctx = createStandaloneContext(options);

      // Start HTTP server
      const server = createServer(app, ctx);

      // Serve UI
      if (options.serveUI) {
        server.use('/ui', serveStatic(options.uiPath));
      }

      return server.listen(options.port);
    },
  };
}
```

#### 6.3 Build System
```typescript
// packages/app-sdk/src/build/index.ts
export async function buildApp(appPath: string, options: BuildOptions) {
  // Validate manifest
  const manifest = await validateManifest(appPath);

  // Build server bundle
  const serverBundle = await Bun.build({
    entrypoints: [manifest.server.entry],
    outdir: 'dist',
    target: 'node',
  });

  // Build UI bundle
  if (manifest.ui) {
    await exec('vite build', { cwd: join(appPath, 'ui') });
  }

  // Generate runtime package
  await generatePackage(manifest, 'dist');

  return { serverBundle, uiBundle: 'dist/ui' };
}
```

#### 6.4 App Distribution
```typescript
// App Registry API
interface AppRegistry {
  // Publishing
  publish(app: BuiltApp, options: PublishOptions): Promise<PublishResult>;

  // Discovery
  search(query: string, filters?: SearchFilters): Promise<AppInfo[]>;
  featured(): Promise<AppInfo[]>;
  byCategory(category: string): Promise<AppInfo[]>;

  // Installation
  install(projectId: string, appId: string, version?: string): Promise<void>;
  uninstall(projectId: string, appId: string): Promise<void>;
  update(projectId: string, appId: string): Promise<void>;
}
```

### Milestone Criteria
- [ ] Apps handle errors gracefully without crashing
- [ ] Apps can be built and run standalone
- [ ] Apps can be published to registry
- [ ] Apps can be discovered and installed
- [ ] Full documentation and examples

---

## Technical Dependencies

### Per-Phase Dependencies

```
Phase 1: Foundation
├── Zod (manifest validation)
├── Existing Iris WebSocket infrastructure
└── Existing Iris tab system

Phase 2: Core Runtime
├── Phase 1 complete
├── Bun module loading
└── Existing Tool Registry patterns

Phase 3: SDK & DX
├── Phase 2 complete
├── Vite (UI builds)
├── React 19
└── TypeScript 5

Phase 4: Platform Integration
├── Phase 3 complete
├── Existing Iris AI service
├── Existing Iris filesystem tools
└── Existing Iris tool registry

Phase 5: Security
├── Phase 4 complete
├── (All security code is new)
└── Consider: Audit log storage solution

Phase 6: Production
├── Phase 5 complete
├── CDN for app distribution
└── Package registry infrastructure
```

### New Packages to Create

| Package | Phase | Description |
|---------|-------|-------------|
| `@iris/app-sdk` | 3 | Core SDK for building apps |
| `@iris/app-sdk/server` | 3 | Server-side APIs |
| `@iris/app-sdk/react` | 3 | React hooks and components |
| `@iris/app-sdk/runtime` | 6 | Standalone runtime |
| `@iris/app-sdk/cli` | 3 | CLI tools |

### Files to Modify in Iris Core

| File | Phase | Changes |
|------|-------|---------|
| `src/server/routes/` | 1 | Add app routes |
| `src/database/` | 1 | Add app tables |
| `src/websocket/` | 2 | Add app message handlers |
| `src/tools/` | 4 | Expose tools to apps |
| `webui/src/contexts/tabs.tsx` | 1 | Add app tab type |
| `webui/src/lib/tabs.ts` | 1 | Add app tab utilities |
| `webui/src/routes/` | 1 | Add app routes |

---

## Risk Mitigation

### Technical Risks

| Risk | Mitigation |
|------|------------|
| Hot reload state corruption | Extensive testing, state validation, rollback capability |
| iframe security bypasses | Regular security audits, CSP hardening, sandbox attributes |
| Performance with many apps | Lazy loading, app suspension, resource limits |
| Complex error scenarios | Comprehensive error taxonomy, recovery playbooks |

### Product Risks

| Risk | Mitigation |
|------|------------|
| SDK too complex | Iterative user testing, simple defaults, progressive disclosure |
| Breaking changes | Semantic versioning, migration guides, deprecation periods |
| App ecosystem quality | Review process, ratings, security scanning |

---

## Success Metrics

### Phase Completion Criteria

| Phase | Key Metric |
|-------|------------|
| Phase 1 | App loads and displays in iframe |
| Phase 2 | State syncs, tools execute |
| Phase 3 | External developer can build app with SDK |
| Phase 4 | App can use AI to process data |
| Phase 5 | Security audit passes |
| Phase 6 | App can be published and installed by others |

### Long-term Metrics

- **Adoption**: Number of apps created
- **Engagement**: Time spent in apps vs. core Iris
- **Quality**: App crash rate, error recovery rate
- **Security**: Permission denial rate, audit alerts
- **Performance**: App load time, state sync latency

---

## Getting Started

### Immediate Next Steps

1. **Create directory structure**
   ```bash
   mkdir -p src/apps/{manager,runtime,security,platform}
   mkdir -p packages/app-sdk/src/{server,react,runtime}
   mkdir -p webui/src/components/apps
   ```

2. **Define manifest schema** (Phase 1.1)

3. **Create basic AppManager** (Phase 1.2)

4. **Add app tab type** (Phase 1.3)

5. **Create AppHost component** (Phase 1.4)

### First Working Demo

Target: A "Hello World" app that:
- Loads from `app.json` in project
- Shows in sidebar
- Opens in tab
- Displays "Hello, World!" in iframe

This proves the foundation works before adding complexity.

---

*This roadmap is a living document. Update it as we learn and iterate.*
