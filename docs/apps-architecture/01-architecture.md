# Iris Apps: System Architecture

## Overview

Iris Apps use **Server-Defined Rendering (SDR)** as the primary UI approach. The server defines the UI as a component tree, and the client renders it using a shared component library. This enables instant updates, mobile parity, and dramatically simpler app development.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              IRIS PLATFORM                               │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐            │
│  │   App Manager  │  │  Tool Registry │  │ Service Runner │            │
│  │                │  │                │  │                │            │
│  │  • Discovery   │  │  • AI tools    │  │  • Background  │            │
│  │  • Lifecycle   │  │  • App tools   │  │  • Health      │            │
│  │  • Hot reload  │  │  • Permissions │  │  • Logging     │            │
│  └───────┬────────┘  └───────┬────────┘  └───────┬────────┘            │
│          │                   │                   │                      │
│          └───────────────────┼───────────────────┘                      │
│                              │                                          │
│                    ┌─────────▼─────────┐                               │
│                    │    App Runtime    │                               │
│                    │                   │                               │
│                    │  • State mgmt     │                               │
│                    │  • UI generation  │◄──── SDR: UI is data          │
│                    │  • Tool exec      │                               │
│                    │  • Event bridge   │                               │
│                    └─────────┬─────────┘                               │
│                              │                                          │
│          ┌───────────────────┼───────────────────┐                      │
│          │                   │                   │                      │
│  ┌───────▼────────┐  ┌───────▼────────┐  ┌──────▼───────┐             │
│  │   SDR Client   │  │   AI Agent     │  │   Protocol   │             │
│  │   (Renderer)   │  │  Integration   │  │    Layer     │             │
│  │                │  │                │  │              │             │
│  │  • Component   │  │  • Tool calls  │  │  • WebSocket │             │
│  │    registry    │  │  • Context     │  │  • State sync│             │
│  │  • Web + RN    │  │  • Results     │  │  • Events    │             │
│  └────────────────┘  └────────────────┘  └──────────────┘             │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

## SDR Architecture

### How Server-Defined Rendering Works

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          SDR DATA FLOW                                   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   SERVER                              CLIENT                            │
│   (Bun)                               (Web / React Native)              │
│                                                                          │
│   ┌──────────────────┐               ┌──────────────────┐              │
│   │                  │               │                  │              │
│   │   App State      │───────────────│   State Store    │              │
│   │   { count: 5 }   │   WebSocket   │   { count: 5 }   │              │
│   │                  │               │                  │              │
│   └────────┬─────────┘               └────────┬─────────┘              │
│            │                                  │                         │
│            ▼                                  ▼                         │
│   ┌──────────────────┐               ┌──────────────────┐              │
│   │                  │               │                  │              │
│   │   ui(ctx)        │───────────────│   SDR Renderer   │              │
│   │   returns tree   │  Component    │   renders tree   │              │
│   │                  │  Tree (JSON)  │                  │              │
│   └──────────────────┘               └────────┬─────────┘              │
│                                               │                         │
│            Component Tree:                    ▼                         │
│            {                         ┌──────────────────┐              │
│              type: 'Stack',          │                  │              │
│              props: { gap: 12 },     │   Native UI      │              │
│              children: [             │   (React / RN)   │              │
│                {                     │                  │              │
│                  type: 'Text',       └──────────────────┘              │
│                  props: { size: 'xl' },                                │
│                  children: ['Count: 5']                                │
│                },                                                       │
│                {                                                        │
│                  type: 'Button',                                       │
│                  props: { onPress: { $action: 'increment' } },         │
│                  children: ['+1']                                      │
│                }                                                        │
│              ]                                                          │
│            }                                                            │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Component Tree Model

The UI is represented as a JSON-serializable tree:

```typescript
// Component node in the tree
interface ComponentNode {
  $: 'component';
  type: string;              // Component name from registry
  key?: string;              // React key for reconciliation
  props: Record<string, PropValue>;
  children?: UINode[];
}

// Different node types
type UINode =
  | ComponentNode            // { $: 'component', type: 'Button', ... }
  | string                   // Plain text
  | number                   // Numbers render as text
  | boolean                  // true/false (false = don't render)
  | null                     // Don't render
  | UINode[];                // Fragment (array of nodes)

// Props can be values or special objects
type PropValue =
  | string | number | boolean | null
  | PropValue[]
  | { [key: string]: PropValue }
  | ActionRef                // { $action: 'toolName', args?: {...} }
  | StateRef                 // { $state: 'stateName' }
  | StyleValue;              // { $style: {...} }
```

### Client-Side Rendering

The SDR client renders the tree using a component registry:

```typescript
// Component registry maps type names to React components
const ComponentRegistry = {
  // Layout
  'Stack': StackComponent,
  'Row': RowComponent,
  'Box': BoxComponent,
  'ScrollView': ScrollViewComponent,

  // Typography
  'Text': TextComponent,
  'Heading': HeadingComponent,
  'Code': CodeComponent,

  // Forms
  'Button': ButtonComponent,
  'Input': InputComponent,
  'TextArea': TextAreaComponent,
  'Select': SelectComponent,
  'Checkbox': CheckboxComponent,
  'Switch': SwitchComponent,

  // Data Display
  'DataTable': DataTableComponent,
  'List': ListComponent,
  'Card': CardComponent,

  // Feedback
  'Alert': AlertComponent,
  'Spinner': SpinnerComponent,
  'Progress': ProgressComponent,

  // ...100+ more components
};

// Renderer walks the tree and creates React elements
function renderNode(node: UINode): React.ReactNode {
  if (node === null || node === false) return null;
  if (typeof node === 'string' || typeof node === 'number') return node;
  if (Array.isArray(node)) return node.map(renderNode);

  const Component = ComponentRegistry[node.type];
  if (!Component) {
    return <UnknownComponent type={node.type} />;
  }

  const props = resolveProps(node.props);
  const children = node.children?.map(renderNode);

  return <Component key={node.key} {...props}>{children}</Component>;
}
```

## Subsystem Details

### 1. App Manager

The App Manager handles discovery, loading, and lifecycle of apps.

```
┌─────────────────────────────────────────────────────────────┐
│                       APP MANAGER                            │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Discovery          Loading           Lifecycle              │
│  ┌──────────┐      ┌──────────┐      ┌──────────┐          │
│  │ Scan for │      │ Validate │      │ Activate │          │
│  │ app.json │─────▶│ manifest │─────▶│ runtime  │          │
│  └──────────┘      │ + code   │      │          │          │
│                    └──────────┘      └──────────┘          │
│                                             │                │
│  ┌──────────┐      ┌──────────┐            │                │
│  │ Watch    │      │ Hot      │◀───────────┘                │
│  │ files    │─────▶│ reload   │                             │
│  └──────────┘      └──────────┘                             │
│                                                              │
│  For SDR apps:                                              │
│  • No separate UI build needed                              │
│  • File change → re-run ui() → push new tree               │
│  • State preserved across reloads                           │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**Key Data Structures:**

```typescript
interface ManagedApp {
  // Identity
  id: string;
  manifest: AppManifest;
  projectId: string;

  // Paths
  rootPath: string;
  serverPath: string;

  // Runtime state
  status: AppStatus;
  runtime: AppRuntime;

  // UI mode
  uiMode: 'sdr' | 'custom';

  // For SDR: current UI tree
  currentUI?: UINode;

  // For custom UI: sandbox info
  customUI?: {
    entry: string;
    devPort?: number;
  };

  // Hot reload
  watcher: FSWatcher;
}
```

### 2. App Runtime

The runtime executes app code and manages the UI generation.

```
┌─────────────────────────────────────────────────────────────┐
│                       APP RUNTIME                            │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                    Server Module                      │   │
│  │                                                       │   │
│  │  ┌───────────┐  ┌───────────┐  ┌───────────┐        │   │
│  │  │   State   │  │   Tools   │  │   UI fn   │        │   │
│  │  │           │  │           │  │           │        │   │
│  │  │ Reactive  │  │ AI-       │  │ Returns   │        │   │
│  │  │ values    │  │ callable  │  │ tree      │        │   │
│  │  └─────┬─────┘  └─────┬─────┘  └─────┬─────┘        │   │
│  │        │              │              │               │   │
│  │        └──────────────┼──────────────┘               │   │
│  │                       │                               │   │
│  └───────────────────────┼───────────────────────────────┘   │
│                          │                                    │
│                  ┌───────▼───────┐                           │
│                  │  UI Generator │                           │
│                  │               │                           │
│                  │  • Run ui(ctx)│                           │
│                  │  • Diff trees │                           │
│                  │  • Push delta │                           │
│                  └───────┬───────┘                           │
│                          │                                    │
│            ┌─────────────┼─────────────┐                     │
│            │             │             │                     │
│    ┌───────▼───────┐ ┌───▼───┐ ┌───────▼───────┐           │
│    │  State Sync   │ │ Tools │ │  Persistence  │           │
│    │  (WebSocket)  │ │       │ │  (optional)   │           │
│    └───────────────┘ └───────┘ └───────────────┘           │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**UI Generation Flow:**

```typescript
class AppRuntime {
  private ui: UINode | null = null;

  // Called when state changes or on reload
  async regenerateUI(): Promise<void> {
    // Create context with current state
    const ctx = this.createUIContext();

    // Run the UI function
    const newUI = await this.module.ui(ctx);

    // Validate the tree
    const validated = validateUITree(newUI);

    // Diff against current
    const delta = diffTrees(this.ui, validated);

    // Store new tree
    this.ui = validated;

    // Push delta to connected clients
    this.broadcast({ type: 'ui:update', delta });
  }

  private createUIContext(): UIContext {
    return {
      state: this.createStateProxy(),
      runTool: (name, args) => this.executeTool(name, args),
      // ... other context methods
    };
  }
}
```

### 3. Component Registry

The component registry maps type strings to actual React components.

```
┌─────────────────────────────────────────────────────────────┐
│                    COMPONENT REGISTRY                        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                    @iris/ui-kit                       │   │
│  │                                                       │   │
│  │  LAYOUT          FORMS           DATA DISPLAY        │   │
│  │  ────────        ─────           ────────────        │   │
│  │  Stack           Button          DataTable           │   │
│  │  Row             Input           List                │   │
│  │  Box             TextArea        Card                │   │
│  │  ScrollView      Select          Badge               │   │
│  │  Divider         Checkbox        Avatar              │   │
│  │                  Switch          Image               │   │
│  │  TYPOGRAPHY      Radio           Code                │   │
│  │  ──────────      Slider                              │   │
│  │  Text            DatePicker      FEEDBACK            │   │
│  │  Heading                         ────────            │   │
│  │  Paragraph       NAVIGATION      Alert               │   │
│  │  Label           ──────────      Toast               │   │
│  │  Code            Tabs            Spinner             │   │
│  │  Link            Menu            Progress            │   │
│  │                  Breadcrumb      Skeleton            │   │
│  │  OVERLAYS        Link                                │   │
│  │  ────────                        SPECIALIZED         │   │
│  │  Dialog          ICONS           ───────────         │   │
│  │  Sheet           ─────           CodeEditor          │   │
│  │  Tooltip         Icon            Terminal            │   │
│  │  Popover         (lucide)        FileTree            │   │
│  │                                  DiffViewer          │   │
│  │                                  Markdown            │   │
│  │                                                       │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                              │
│  Web: React components with Tailwind/CSS                    │
│  Mobile: React Native components with StyleSheet            │
│  Same API, platform-native rendering                        │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**Cross-Platform Implementation:**

```typescript
// @iris/ui-kit/src/Button.tsx (web)
export function Button({ onPress, variant, size, children, ...props }) {
  return (
    <button
      onClick={onPress}
      className={cn(buttonVariants({ variant, size }))}
      {...props}
    >
      {children}
    </button>
  );
}

// @iris/ui-kit/src/Button.native.tsx (React Native)
export function Button({ onPress, variant, size, children, ...props }) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.base, styles[variant], styles[size]]}
      {...props}
    >
      <Text style={styles.text}>{children}</Text>
    </Pressable>
  );
}

// Same import, different implementation per platform
```

### 4. Tool Registry

Tools are the primary way AI agents interact with apps.

```
┌─────────────────────────────────────────────────────────────┐
│                      TOOL REGISTRY                           │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                    Tool Index                         │   │
│  │                                                       │   │
│  │  BUILTIN TOOLS (Iris Core)                           │   │
│  │  ├─ read_file         Read file contents             │   │
│  │  ├─ write_file        Write file contents            │   │
│  │  ├─ bash              Execute shell command          │   │
│  │  └─ ...                                              │   │
│  │                                                       │   │
│  │  APP TOOLS (from Iris Apps)                          │   │
│  │  ├─ app:database-explorer/query                      │   │
│  │  ├─ app:database-explorer/list_tables                │   │
│  │  ├─ app:api-tester/send_request                      │   │
│  │  └─ ...                                              │   │
│  │                                                       │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                              │
│  Tool Execution Flow:                                       │
│  1. AI requests tool call                                   │
│  2. Registry finds tool by name                             │
│  3. Permission check                                        │
│  4. Execute tool with context                               │
│  5. Tool updates app state (triggers UI regeneration)       │
│  6. Return result to AI                                     │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 5. SDR Client

The client receives UI trees and renders them.

```
┌─────────────────────────────────────────────────────────────┐
│                        SDR CLIENT                            │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                    Connection                         │   │
│  │                                                       │   │
│  │  WebSocket to Iris server                            │   │
│  │  ├─ Receive: ui:sync, ui:update, state:update        │   │
│  │  └─ Send: action, state:set                          │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                    Renderer                           │   │
│  │                                                       │   │
│  │  ┌──────────┐   ┌──────────┐   ┌──────────┐        │   │
│  │  │ Receive  │──▶│ Validate │──▶│  Render  │        │   │
│  │  │   tree   │   │   tree   │   │   tree   │        │   │
│  │  └──────────┘   └──────────┘   └────┬─────┘        │   │
│  │                                      │              │   │
│  │                                      ▼              │   │
│  │                              ┌──────────────┐       │   │
│  │                              │  React /     │       │   │
│  │                              │  React Native│       │   │
│  │                              └──────────────┘       │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                 Action Handler                        │   │
│  │                                                       │   │
│  │  When user interacts (button press, input change):   │   │
│  │  1. Serialize action: { $action: 'increment' }       │   │
│  │  2. Send to server via WebSocket                     │   │
│  │  3. Server executes tool/updates state               │   │
│  │  4. Server pushes new UI tree                        │   │
│  │  5. Client re-renders                                │   │
│  │                                                       │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Data Flow

### State Change → UI Update

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   User      │     │   Server    │     │   Client    │
│  (or AI)    │     │             │     │             │
└──────┬──────┘     └──────┬──────┘     └──────┬──────┘
       │                   │                   │
       │  Tool call:       │                   │
       │  increment()      │                   │
       │──────────────────▶│                   │
       │                   │                   │
       │                   │  Update state     │
       │                   │  count = count + 1│
       │                   │                   │
       │                   │  Re-run ui(ctx)   │
       │                   │                   │
       │                   │  UI tree update   │
       │                   │──────────────────▶│
       │                   │                   │
       │                   │                   │  Re-render
       │                   │                   │
       │  Result           │                   │
       │◀──────────────────│                   │
       │                   │                   │
```

### Hot Reload Flow

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  File Edit  │     │   Server    │     │   Client    │
│             │     │             │     │             │
└──────┬──────┘     └──────┬──────┘     └──────┬──────┘
       │                   │                   │
       │  server.ts saved  │                   │
       │──────────────────▶│                   │
       │                   │                   │
       │                   │  Snapshot state   │
       │                   │                   │
       │                   │  Reload module    │
       │                   │  (Bun hot reload) │
       │                   │                   │
       │                   │  Restore state    │
       │                   │                   │
       │                   │  Re-run ui(ctx)   │
       │                   │                   │
       │                   │  Push new tree    │
       │                   │──────────────────▶│
       │                   │                   │
       │                   │                   │  Re-render
       │                   │                   │  (instant)
       │                   │                   │
```

## Custom UI Mode (Escape Hatch)

For apps that need full React control:

```
┌─────────────────────────────────────────────────────────────┐
│                     CUSTOM UI MODE                           │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  App opts in via manifest:                                  │
│  {                                                           │
│    "ui": {                                                   │
│      "mode": "custom",                                       │
│      "entry": "ui/index.html"                               │
│    }                                                         │
│  }                                                           │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                    Web Platform                       │   │
│  │                                                       │   │
│  │  Options:                                            │   │
│  │  • Shadow DOM (same context, style isolation)        │   │
│  │  • iframe (full isolation, security sandbox)         │   │
│  │                                                       │   │
│  │  Communication via postMessage bridge                │   │
│  │                                                       │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                   Mobile Platform                     │   │
│  │                                                       │   │
│  │  WebView with bridge to React Native                 │   │
│  │  (Acknowledged limitation - not native)              │   │
│  │                                                       │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                              │
│  Trade-offs vs SDR:                                         │
│  ✗ Requires separate build system (Vite)                   │
│  ✗ Slower hot reload                                        │
│  ✗ Mobile uses WebView, not native                         │
│  ✓ Full control over UI                                     │
│  ✓ Can use any npm packages                                 │
│  ✓ Complex visualizations possible                          │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Deployment Architecture

### Standalone Mode

```
┌─────────────────────────────────────────────────────────────┐
│                     STANDALONE APP                           │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                  @iris/runtime                        │   │
│  │                                                       │   │
│  │  Minimal runtime that provides:                      │   │
│  │  • App loading and execution                         │   │
│  │  • State management                                  │   │
│  │  • WebSocket server for SDR clients                  │   │
│  │  • HTTP API for tool invocation                      │   │
│  │  • Optional: static file serving for web client      │   │
│  │                                                       │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                              │
│  Deployment options:                                        │
│  • Server + Web client (serve from same process)           │
│  • Server + Mobile app (connect via WebSocket)             │
│  • API-only (tools accessible via REST)                    │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Technology Choices

| Component | Technology | Rationale |
|-----------|------------|-----------|
| **Backend Runtime** | Bun | Fast startup, native TS, hot reload |
| **Component Library** | React + React Native | Cross-platform, ecosystem |
| **State Management** | Custom signals | Simple, serializable, reactive |
| **Communication** | WebSocket | Real-time, bidirectional |
| **Schema Validation** | Zod | Runtime validation, TS inference |
| **Styling (Web)** | Tailwind CSS | Utility-first, consistent |
| **Styling (Mobile)** | StyleSheet | Native performance |

## Security Boundaries

```
┌─────────────────────────────────────────────────────────────┐
│                    SECURITY ZONES                            │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  ZONE 1: Iris Core (Trusted)                        │   │
│  │                                                       │   │
│  │  • Full system access                                │   │
│  │  • Manages all apps                                  │   │
│  │  • Controls permissions                              │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  ZONE 2: App Server (Permission-gated)              │   │
│  │                                                       │   │
│  │  • Declared permissions only                         │   │
│  │  • Scoped file access                                │   │
│  │  • Scoped network access                             │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  ZONE 3: SDR Client (Data-only)                     │   │
│  │                                                       │   │
│  │  • Only renders data from server                     │   │
│  │  • No direct system access                           │   │
│  │  • Components are from trusted registry              │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                              │
│  Note: SDR simplifies security!                             │
│  • No arbitrary JS execution on client                     │
│  • No need for iframe sandbox                              │
│  • All logic runs on server (controlled environment)       │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

*Next: [02-app-model.md](./02-app-model.md) - Detailed app model and lifecycle*
