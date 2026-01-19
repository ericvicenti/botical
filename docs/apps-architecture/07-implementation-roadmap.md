# Iris Apps: Implementation Roadmap

## Overview

This roadmap outlines a phased approach to implementing the Iris Apps system with Server-Defined Rendering (SDR). SDR simplifies the architecture significantly—most phases are smaller than they would be with an iframe-based approach.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       IMPLEMENTATION PHASES                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  Phase 1: Foundation                                                     │
│  ├── App manifest & loader                                              │
│  ├── Basic app lifecycle                                                │
│  └── SDR component registry                                             │
│         │                                                                │
│         ▼                                                                │
│  Phase 2: SDR Core                                                       │
│  ├── ui() function execution                                            │
│  ├── Component tree rendering                                           │
│  └── Action handlers                                                    │
│         │                                                                │
│         ▼                                                                │
│  Phase 3: State & Tools                                                  │
│  ├── Reactive state management                                          │
│  ├── Tool registration & execution                                      │
│  └── Hot reload with state preservation                                 │
│         │                                                                │
│         ▼                                                                │
│  Phase 4: SDK & DX                                                       │
│  ├── @iris/app-sdk package                                              │
│  ├── @iris/ui component library                                         │
│  └── Development tooling                                                │
│         │                                                                │
│         ▼                                                                │
│  Phase 5: Platform Integration                                           │
│  ├── Iris AI access                                                     │
│  ├── Filesystem access                                                  │
│  └── Permission system (VS Code-like)                                   │
│         │                                                                │
│         ▼                                                                │
│  Phase 6: Production & Custom UI                                         │
│  ├── Custom UI mode (iframe escape hatch)                               │
│  ├── Mobile support (React Native)                                      │
│  └── Standalone runtime & distribution                                  │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Foundation

### Objective
Get a basic app structure and component registry in place.

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

  server: z.string().default('server.ts'),

  // Optional: Custom UI mode (escape hatch)
  ui: z.object({
    mode: z.enum(['sdr', 'custom']).default('sdr'),
    entry: z.string().optional(),  // For custom mode
  }).optional(),

  tools: z.array(z.object({
    name: z.string(),
    description: z.string(),
  })).default([]),

  permissions: z.array(z.string()).default([]),
});

export type AppManifest = z.infer<typeof AppManifestSchema>;
```

#### 1.2 Component Registry
```typescript
// src/apps/sdr/registry.ts
import { Stack, Row, Text, Button, Input, ... } from '@iris/ui';

export const componentRegistry: Record<string, ComponentType> = {
  // Layout
  Stack,
  Row,
  Box,
  ScrollView,
  Divider,

  // Typography
  Text,
  Heading,
  Code,
  Link,

  // Form
  Button,
  Input,
  TextArea,
  Select,
  Checkbox,
  Switch,

  // Data display
  DataTable,
  List,
  Card,
  Badge,

  // Feedback
  Alert,
  Spinner,
  Progress,

  // More...
};

export function getComponent(type: string): ComponentType | undefined {
  return componentRegistry[type];
}
```

#### 1.3 App Manager
```typescript
// src/apps/manager.ts
export class AppManager {
  private apps = new Map<string, ManagedApp>();

  async discover(projectPath: string): Promise<DiscoveredApp[]> {
    // Find app.json files in project
  }

  async load(appPath: string): Promise<ManagedApp> {
    // Load manifest, validate, create runtime
  }

  async activate(appId: string): Promise<void> {
    // Start app, run onActivate
  }

  get(appId: string): ManagedApp | undefined {
    return this.apps.get(appId);
  }
}
```

#### 1.4 App Tab Type
```typescript
// webui/src/lib/tabs.ts
interface AppTabData {
  type: 'app';
  projectId: string;
  appId: string;
  appName: string;
}
```

### Milestone Criteria
- [ ] Can create `app.json` in a project
- [ ] Iris discovers app and shows in sidebar
- [ ] Component registry has core components
- [ ] Basic app lifecycle (load, activate, deactivate)

---

## Phase 2: SDR Core

### Objective
Implement the SDR rendering engine that turns ui() output into React components.

### Deliverables

#### 2.1 App Runtime (Server Side)
```typescript
// src/apps/runtime.ts
export class AppRuntime {
  private module: AppModule;
  private context: AppContext;

  async initialize(modulePath: string): Promise<void> {
    this.module = await import(modulePath);
    this.context = this.createContext();
  }

  generateUI(): ComponentTree {
    // Call the app's ui() function
    return this.module.default.ui(this.context);
  }

  handleAction(action: string, args: unknown): Promise<unknown> {
    // Execute tool or state update
  }
}
```

#### 2.2 SDR Renderer (Client Side)
```typescript
// webui/src/components/apps/SDRRenderer.tsx
import { componentRegistry } from '@iris/ui';

interface SDRRendererProps {
  tree: ComponentTree;
  onAction: (action: string, args: unknown) => void;
}

export function SDRRenderer({ tree, onAction }: SDRRendererProps) {
  return renderNode(tree, onAction);
}

function renderNode(node: UINode, onAction: ActionHandler): ReactNode {
  // Primitive values
  if (typeof node === 'string' || typeof node === 'number') {
    return node;
  }

  if (node === null || node === undefined || node === false) {
    return null;
  }

  // Component node
  if (node.$ === 'component') {
    const Component = componentRegistry[node.type];

    if (!Component) {
      return <UnknownComponent type={node.type} />;
    }

    // Transform action props
    const props = transformProps(node.props, onAction);

    // Render children
    const children = node.children?.map((child, i) =>
      renderNode(child, onAction)
    );

    return <Component key={node.key} {...props}>{children}</Component>;
  }

  return null;
}
```

#### 2.3 Action Handler
```typescript
// webui/src/components/apps/AppHost.tsx
export function AppHost({ app }: { app: AppInfo }) {
  const [tree, setTree] = useState<ComponentTree | null>(null);
  const ws = useWebSocket(app.wsUrl);

  useEffect(() => {
    ws.on('ui:sync', (payload) => {
      setTree(payload.tree);
    });
  }, [ws]);

  const handleAction = useCallback(async (action: string, args: unknown) => {
    ws.send({
      type: 'action:call',
      payload: { action, args }
    });
  }, [ws]);

  if (!tree) {
    return <AppLoading />;
  }

  return <SDRRenderer tree={tree} onAction={handleAction} />;
}
```

### Milestone Criteria
- [ ] ui() function executes on server
- [ ] Component tree renders in browser
- [ ] Button clicks trigger actions
- [ ] State changes cause UI re-render

---

## Phase 3: State & Tools

### Objective
Implement reactive state and tool system with hot reload.

### Deliverables

#### 3.1 Reactive State
```typescript
// src/apps/state.ts
export function state<T>(initial: T, options?: StateOptions): StateHandle<T> {
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

#### 3.2 Tool Execution
```typescript
// src/apps/tools.ts
export class ToolExecutor {
  constructor(private runtime: AppRuntime) {}

  async execute(name: string, args: unknown): Promise<ToolResult> {
    const tool = this.runtime.tools.get(name);
    if (!tool) {
      return { success: false, error: `Unknown tool: ${name}` };
    }

    // Validate arguments
    const parsed = tool.parameters.safeParse(args);
    if (!parsed.success) {
      return { success: false, error: formatZodError(parsed.error) };
    }

    // Execute
    try {
      const result = await tool.execute(parsed.data, this.runtime.context);
      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}
```

#### 3.3 Hot Reload
```typescript
// src/apps/hot-reload.ts
export class HotReloadManager {
  async handleFileChange(appPath: string): Promise<void> {
    const runtime = this.appManager.getRuntime(appPath);
    if (!runtime) return;

    // 1. Snapshot current state
    const stateSnapshot = runtime.snapshotState();

    // 2. Unload module (Bun cache invalidation)
    delete require.cache[require.resolve(appPath)];

    // 3. Reload module
    try {
      await runtime.reload();

      // 4. Restore state
      runtime.restoreState(stateSnapshot);

      // 5. Re-run ui() and push to clients
      const tree = runtime.generateUI();
      runtime.broadcast({ type: 'ui:sync', payload: { tree } });

    } catch (error) {
      // Send error to client, keep old module running
      runtime.broadcast({
        type: 'app:error',
        payload: {
          category: 'server_load',
          message: error.message,
          recoverable: true,
        }
      });
    }
  }
}
```

### Milestone Criteria
- [ ] State persists across interactions
- [ ] Tools can be defined and called
- [ ] File changes trigger instant UI updates
- [ ] State preserved across hot reloads
- [ ] Errors show overlay, don't crash

---

## Phase 4: SDK & Developer Experience

### Objective
Create polished SDK packages for app development.

### Deliverables

#### 4.1 @iris/app-sdk Package
```
packages/app-sdk/
├── package.json
├── src/
│   ├── index.ts          # Main exports
│   ├── app.ts            # defineApp
│   ├── tool.ts           # defineTool
│   ├── state.ts          # state, computed, query
│   └── context.ts        # Type definitions
└── tsconfig.json
```

```typescript
// packages/app-sdk/src/index.ts
export { defineApp } from './app';
export { defineTool } from './tool';
export { state, computed, query } from './state';
export type {
  AppContext,
  ToolContext,
  StateHandle,
  AppDefinition,
} from './context';
```

#### 4.2 @iris/ui Package
```
packages/ui/
├── package.json
├── src/
│   ├── index.ts          # All component exports
│   ├── registry.ts       # Component registry
│   ├── components/
│   │   ├── layout/       # Stack, Row, Box, etc.
│   │   ├── typography/   # Text, Heading, Code
│   │   ├── form/         # Button, Input, Select
│   │   ├── data/         # DataTable, List, Card
│   │   └── feedback/     # Alert, Spinner, Progress
│   └── native/           # React Native variants
└── tsconfig.json
```

```typescript
// packages/ui/src/index.ts
// Layout
export { Stack, Row, Box, ScrollView, Divider } from './components/layout';

// Typography
export { Text, Heading, Code, Link } from './components/typography';

// Form
export { Button, Input, TextArea, Select, Checkbox, Switch } from './components/form';

// Data
export { DataTable, List, Card, Badge, Avatar } from './components/data';

// Feedback
export { Alert, Spinner, Progress, Toast } from './components/feedback';

// Specialized
export { CodeEditor, Terminal, FileTree, Markdown } from './components/specialized';
```

#### 4.3 CLI Commands
```bash
# Create new app
iris app create my-app

# Start development with hot reload
iris app dev

# Validate app
iris app validate
```

### Milestone Criteria
- [ ] SDK packages published (npm or local)
- [ ] Apps can import from @iris/app-sdk and @iris/ui
- [ ] Full TypeScript support with autocomplete
- [ ] CLI commands work

---

## Phase 5: Platform Integration

### Objective
Enable apps to access Iris platform features with appropriate permissions.

### Deliverables

#### 5.1 Iris Context
```typescript
// Extension to AppContext
interface IrisContext {
  ai: {
    chat(messages: Message[], options?: ChatOptions): Promise<ChatResponse>;
    embed(text: string | string[]): Promise<number[][]>;
  };

  fs: {
    read(path: string): Promise<string>;
    write(path: string, content: string): Promise<void>;
    list(path: string): Promise<FileInfo[]>;
  };

  tools: {
    call(name: string, args: unknown): Promise<ToolResult>;
  };

  navigate(path: string): void;
  notify(message: string, options?: NotifyOptions): void;
}
```

#### 5.2 Permission System (VS Code-like)

Like VS Code extensions, permissions are declared and trusted at install/development time:

```typescript
// src/apps/permissions.ts
export class PermissionManager {
  private granted: Set<string>;

  constructor(manifest: AppManifest, trustLevel: TrustLevel) {
    this.granted = new Set(manifest.permissions);

    // Development apps: automatically trust project permissions
    if (trustLevel === 'development') {
      this.granted.add('filesystem:read:$PROJECT');
      this.granted.add('filesystem:write:$PROJECT');
      this.granted.add('network:localhost');
    }
  }

  check(permission: string): boolean {
    // Exact match
    if (this.granted.has(permission)) return true;

    // Wildcard/scope matching
    for (const granted of this.granted) {
      if (this.matches(granted, permission)) return true;
    }

    return false;
  }
}

// Trust levels (similar to VS Code workspace trust)
type TrustLevel = 'development' | 'installed' | 'untrusted';
```

#### 5.3 AI Integration
```typescript
// src/apps/platform/ai.ts
export class AppAIProvider {
  constructor(
    private appId: string,
    private permissions: PermissionManager
  ) {}

  async chat(messages: Message[], options?: ChatOptions): Promise<ChatResponse> {
    if (!this.permissions.check('ai:chat')) {
      throw new Error('Permission denied: ai:chat');
    }

    return this.aiService.chat(messages, {
      ...options,
      metadata: { appId: this.appId },
    });
  }
}
```

#### 5.4 Filesystem Integration
```typescript
// src/apps/platform/fs.ts
export class AppFSProvider {
  constructor(
    private permissions: PermissionManager,
    private projectPath: string
  ) {}

  async read(path: string): Promise<string> {
    const resolved = this.resolvePath(path);

    if (!this.permissions.check(`filesystem:read:${this.getScope(resolved)}`)) {
      throw new Error(`Permission denied: filesystem:read:${resolved}`);
    }

    return Bun.file(resolved).text();
  }

  private resolvePath(path: string): string {
    // Handle $PROJECT, $APP, etc.
    // Prevent path traversal
  }
}
```

### Milestone Criteria
- [ ] Apps can call AI models (with permission)
- [ ] Apps can read/write files (within permitted scope)
- [ ] Permission violations throw clear errors
- [ ] Development apps have sensible defaults

---

## Phase 6: Production & Custom UI

### Objective
Add escape hatches, mobile support, and production features.

### Deliverables

#### 6.1 Custom UI Mode (iframe)
For apps that need full React control (3D, canvas, complex interactions):

```json
{
  "name": "3d-visualizer",
  "ui": {
    "mode": "custom",
    "entry": "ui/index.html"
  }
}
```

```tsx
// webui/src/components/apps/CustomAppHost.tsx
export function CustomAppHost({ app }: { app: AppInfo }) {
  const bridge = useBridge(app);

  return (
    <iframe
      src={app.uiUrl}
      sandbox="allow-scripts allow-same-origin"
      onLoad={() => bridge.init()}
    />
  );
}
```

#### 6.2 Mobile Support (React Native)

The SDR approach enables native mobile apps:

```typescript
// packages/ui/src/native/registry.ts
import { View, Text, Pressable, ... } from 'react-native';

// Same interface, native implementation
export const nativeRegistry: Record<string, ComponentType> = {
  Stack: ({ children, gap, padding, ...props }) => (
    <View style={{ gap, padding, flexDirection: 'column' }} {...props}>
      {children}
    </View>
  ),
  Button: ({ onPress, children, variant }) => (
    <Pressable onPress={onPress} style={buttonStyles[variant]}>
      <Text>{children}</Text>
    </Pressable>
  ),
  // ... same components, native rendering
};
```

#### 6.3 Standalone Runtime
```typescript
// packages/app-sdk/src/standalone/index.ts
export async function createStandaloneServer(options: StandaloneOptions) {
  const app = await loadApp(options.appPath);

  // Create minimal Iris context (no full IDE)
  const ctx = createStandaloneContext({
    ai: options.ai,  // Optional AI provider
    fs: options.fs,  // Scoped filesystem
  });

  // Create HTTP server
  const server = Bun.serve({
    port: options.port,
    fetch: async (req) => {
      // Serve UI
      if (req.url === '/') {
        return new Response(renderToString(app.ui(ctx)), {
          headers: { 'Content-Type': 'text/html' },
        });
      }

      // Handle tool calls
      if (req.url.startsWith('/api/')) {
        return handleToolCall(req, app, ctx);
      }
    },
    websocket: {
      // Real-time updates
    },
  });

  return server;
}
```

#### 6.4 App Distribution
```typescript
// App registry for sharing
interface AppRegistry {
  publish(app: BuiltApp): Promise<void>;
  search(query: string): Promise<AppInfo[]>;
  install(projectId: string, appId: string): Promise<void>;
}
```

### Milestone Criteria
- [ ] Custom UI apps work in iframe
- [ ] Component registry works on React Native
- [ ] Apps can run standalone outside Iris
- [ ] Apps can be packaged and shared

---

## Technical Dependencies

### Per-Phase Dependencies

```
Phase 1: Foundation
├── Zod (validation)
├── Bun (module loading)
└── Existing Iris infrastructure

Phase 2: SDR Core
├── Phase 1 complete
├── React 19
└── WebSocket infrastructure

Phase 3: State & Tools
├── Phase 2 complete
├── Bun file watcher
└── Existing tool patterns

Phase 4: SDK & DX
├── Phase 3 complete
├── TypeScript 5
└── Package publishing setup

Phase 5: Platform Integration
├── Phase 4 complete
├── Existing Iris AI service
└── Existing Iris filesystem

Phase 6: Production
├── Phase 5 complete
├── React Native (optional)
└── Distribution infrastructure
```

### New Packages

| Package | Phase | Description |
|---------|-------|-------------|
| `@iris/app-sdk` | 4 | Core SDK for building apps |
| `@iris/ui` | 4 | Cross-platform component library |
| `@iris/app-sdk/standalone` | 6 | Standalone runtime |

### Core Files to Create/Modify

| Location | Phase | Purpose |
|----------|-------|---------|
| `src/apps/` | 1-3 | App management, runtime, state |
| `packages/app-sdk/` | 4 | SDK package |
| `packages/ui/` | 4 | UI component library |
| `webui/src/components/apps/` | 2 | SDR renderer, app host |

---

## Risk Mitigation

### Technical Risks

| Risk | Mitigation |
|------|------------|
| Hot reload state corruption | Comprehensive testing, state validation |
| Performance with complex UIs | Tree diffing, virtualization for lists |
| Mobile compatibility | Test early, use proven RN patterns |
| Custom UI security | iframe sandbox, origin validation |

### Product Risks

| Risk | Mitigation |
|------|------------|
| SDK too complex | Keep simple cases simple, progressive disclosure |
| Breaking changes | Semantic versioning, migration guides |
| Limited component set | Prioritize common needs, custom UI escape hatch |

---

## Success Metrics

| Phase | Key Metric |
|-------|------------|
| Phase 1 | App discovered and appears in sidebar |
| Phase 2 | "Hello World" renders via SDR |
| Phase 3 | Counter app with hot reload works |
| Phase 4 | External dev can build app with SDK |
| Phase 5 | App uses AI to process data |
| Phase 6 | App runs standalone on phone |

---

## Getting Started

### Immediate Next Steps

1. **Create directory structure**
   ```bash
   mkdir -p src/apps/{manager,runtime,sdr}
   mkdir -p packages/{app-sdk,ui}/src
   mkdir -p webui/src/components/apps
   ```

2. **Define manifest schema** (Phase 1.1)

3. **Build component registry** (Phase 1.2)

4. **Create SDRRenderer component** (Phase 2.2)

5. **Wire up WebSocket** (Phase 2.3)

### First Demo Target

A counter app that:
- Lives in `my-project/apps/counter/`
- Has `app.json` + `server.ts`
- Shows counter in Iris tab
- +1 button works
- Hot reloads on file save

This proves SDR works before adding complexity.

---

*This roadmap is a living document. Update as we learn and iterate.*
