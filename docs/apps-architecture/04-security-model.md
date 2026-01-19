# Iris Apps: Security Model

## Overview

SDR (Server-Defined Rendering) dramatically simplifies security compared to traditional approaches. Because UI is rendered from a trusted component registry—not arbitrary JavaScript—we eliminate an entire class of client-side vulnerabilities.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    SDR SECURITY ADVANTAGE                                │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  TRADITIONAL (iframe/JS)              SDR APPROACH                      │
│                                                                          │
│  ┌─────────────────────┐             ┌─────────────────────┐           │
│  │  Untrusted JS       │             │  Component Tree     │           │
│  │  Can do anything    │             │  (JSON data)        │           │
│  │  XSS, data theft    │             │  Can only render    │           │
│  │  Needs sandbox      │             │  trusted components │           │
│  └─────────────────────┘             └─────────────────────┘           │
│           │                                    │                        │
│           ▼                                    ▼                        │
│  ┌─────────────────────┐             ┌─────────────────────┐           │
│  │  iframe sandbox     │             │  Direct render      │           │
│  │  CSP headers        │             │  No sandbox needed  │           │
│  │  postMessage only   │             │  Same context       │           │
│  │  Performance cost   │             │  Fast & simple      │           │
│  └─────────────────────┘             └─────────────────────┘           │
│                                                                          │
│  SDR: The UI can only do what the component registry allows             │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

## Security Zones

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         SECURITY ZONES                                   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  ZONE 1: Iris Core (Trusted)                                     │   │
│  │                                                                   │   │
│  │  • Full system access                                            │   │
│  │  • Permission enforcement                                        │   │
│  │  • App lifecycle management                                      │   │
│  │  • API credentials storage                                       │   │
│  │                                                                   │   │
│  │  Access: Only Iris core code                                     │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  ZONE 2: App Server (Permission-Gated)                           │   │
│  │                                                                   │   │
│  │  • App's server.ts code runs here                                │   │
│  │  • Has declared permissions only                                 │   │
│  │  • All platform access checked at runtime                        │   │
│  │  • Can access state, tools, services                             │   │
│  │                                                                   │   │
│  │  Access: Via ctx.iris.* with permission checks                   │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  ZONE 3: SDR Renderer (Data-Only)                                │   │
│  │                                                                   │   │
│  │  • Receives JSON component trees                                 │   │
│  │  • Renders using trusted @iris/ui components                     │   │
│  │  • Cannot execute arbitrary code                                 │   │
│  │  • Actions sent back to server for execution                     │   │
│  │                                                                   │   │
│  │  Access: Read-only rendering of data                             │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

## Permission System

### Permission Declaration

Apps declare required permissions in `app.json`:

```json
{
  "permissions": [
    "filesystem:read:$PROJECT",
    "filesystem:write:$APP/data",
    "network:api.example.com",
    "ai:chat"
  ]
}
```

### Permission Categories

| Category | Examples | Risk Level |
|----------|----------|------------|
| **filesystem** | `filesystem:read:$PROJECT` | Medium-High |
| **network** | `network:localhost`, `network:*.api.com` | Medium |
| **ai** | `ai:chat`, `ai:embed` | Medium (cost) |
| **iris** | `iris:tools`, `iris:navigation` | Low-High |
| **process** | `process:spawn:$APP` | High |

### Permission Scopes

| Scope | Resolves To |
|-------|-------------|
| `$PROJECT` | Current project directory |
| `$APP` | App's own directory |
| `$DATA` | App's data directory |
| `$CONFIG` | App's config directory |
| Domain glob | e.g., `*.example.com` |

### Permission Reference

#### Filesystem

```
filesystem:read              # Read any file (DANGEROUS)
filesystem:read:$PROJECT     # Read within project only
filesystem:read:$APP         # Read within app directory
filesystem:write             # Write any file (DANGEROUS)
filesystem:write:$PROJECT    # Write within project
filesystem:write:$APP        # Write within app directory
filesystem:write:$APP/data   # Write to specific subdirectory
```

#### Network

```
network:*                    # Any network access
network:localhost            # Localhost only
network:example.com          # Specific domain
network:*.example.com        # Domain with subdomains
```

#### AI

```
ai:chat                      # Use chat completions
ai:chat:limited              # Rate-limited chat
ai:embed                     # Use embeddings
```

#### Iris Platform

```
iris:tools                   # Call built-in tools
iris:tools:read              # Read-only tools only
iris:navigation              # Navigate UI
iris:notifications           # Show notifications
iris:apps                    # Cross-app communication
```

#### Process

```
process:spawn                # Run any command (DANGEROUS)
process:spawn:$APP           # Run commands in app dir only
process:env                  # Access env variables
process:env:PUBLIC_*         # Only PUBLIC_* vars
```

### Permission Enforcement

```typescript
// Every platform access checks permissions at runtime
async function read(path: string, ctx: AppContext): Promise<string> {
  const resolvedPath = resolvePath(path, ctx);
  const permission = `filesystem:read:${resolvedPath}`;

  if (!ctx.permissions.check(permission)) {
    throw new PermissionDeniedError(permission);
  }

  return Bun.file(resolvedPath).text();
}
```

## Trust Levels

Apps have different trust levels based on their source:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           TRUST LEVELS                                   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  LEVEL 3: Development App (Highest Trust)                               │
│  ├── Source: App being developed in current project                     │
│  ├── Trust: User is the developer                                       │
│  ├── Permissions: Can request any, granted interactively                │
│  └── All source code visible                                            │
│                                                                          │
│  LEVEL 2: Verified App                                                   │
│  ├── Source: Iris App Registry, verified publisher                      │
│  ├── Trust: Signed by known entity                                      │
│  ├── Permissions: Declared, approved at install                         │
│  └── Automated security scanning                                        │
│                                                                          │
│  LEVEL 1: Community App                                                  │
│  ├── Source: Iris App Registry, unverified                              │
│  ├── Trust: User accepts risk                                           │
│  ├── Permissions: Restricted by default                                 │
│  └── Warning shown at install                                           │
│                                                                          │
│  LEVEL 0: Unknown App (Lowest Trust)                                    │
│  ├── Source: Unknown URL or path                                        │
│  ├── Trust: None                                                        │
│  ├── Permissions: Minimal only                                          │
│  └── Explicit user approval required                                    │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

## SDR Security Benefits

### No Client-Side Code Execution

Traditional apps run arbitrary JavaScript. SDR apps can only:

1. Render components from the trusted registry
2. Send actions back to the server
3. Display data provided by the server

```typescript
// This UI tree is just data - no code runs on the client
{
  type: 'Button',
  props: {
    onPress: { $action: 'delete', args: { id: '123' } }
  },
  children: ['Delete']
}

// The client renders a Button component
// When pressed, it sends { action: 'delete', args: { id: '123' } } to server
// Server decides whether to execute based on permissions
```

### Actions Are Validated

Every action from the UI goes through the server:

```typescript
// Client sends action
{ action: 'delete', args: { id: '123' } }

// Server validates and executes
async function handleAction(action: Action, ctx: AppContext) {
  // Check if action exists
  const tool = ctx.tools.get(action.name);
  if (!tool) {
    throw new Error(`Unknown action: ${action.name}`);
  }

  // Validate arguments
  const parsed = tool.parameters.safeParse(action.args);
  if (!parsed.success) {
    throw new ValidationError(parsed.error);
  }

  // Execute with permission checks
  return tool.execute(parsed.data, ctx);
}
```

### Component Registry is Trusted

The `@iris/ui` component registry is:
- Maintained by Iris team
- Audited for security
- Cannot execute arbitrary code
- Cannot access system resources directly

```typescript
// Components can only do what they're designed to do
function Button({ onPress, children }) {
  return (
    <button
      onClick={() => {
        // onPress is NOT a function - it's an action descriptor
        // { $action: 'name', args: {...} }
        // We send it to the server, not execute it locally
        sendActionToServer(onPress);
      }}
    >
      {children}
    </button>
  );
}
```

## Custom UI Security

When apps opt into custom UI mode, additional security measures apply:

### Sandboxing Options

```typescript
// App manifest
{
  "ui": {
    "mode": "custom",
    "entry": "ui/index.html",
    "sandbox": "strict"  // or "relaxed"
  }
}
```

**Strict (default):**
- Shadow DOM isolation
- CSP headers restricting scripts/styles
- No direct DOM access to parent

**Relaxed:**
- Same React context as Iris
- Shared state directly accessible
- Trust the app developer

### Bridge Security

Custom UI communicates via a bridge:

```typescript
// All messages validated
class SecureBridge {
  handleMessage(message: unknown) {
    // Validate structure
    const validated = BridgeMessageSchema.parse(message);

    // Check permissions for requested action
    if (validated.type === 'iris:action') {
      this.checkPermission(validated.action);
    }

    // Rate limit
    if (!this.rateLimiter.allow()) {
      throw new RateLimitError();
    }

    // Process message
    this.process(validated);
  }
}
```

## Audit Logging

All sensitive operations are logged:

```typescript
interface AuditEvent {
  timestamp: number;
  appId: string;
  action: string;
  target?: string;
  allowed: boolean;
  result?: 'success' | 'error';
}

// Example log
{
  timestamp: 1705234567890,
  appId: 'database-explorer',
  action: 'filesystem:read',
  target: '/project/data.db',
  allowed: true,
  result: 'success'
}
```

### Audit UI

Users can review what apps have accessed:

```
┌─────────────────────────────────────────────────────────────────┐
│  Audit Log: database-explorer                                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Today                                                          │
│  ───────                                                        │
│  10:32  ✓ filesystem:read   /project/data.db                   │
│  10:32  ✓ ai:chat           3 messages                         │
│  10:31  ✓ filesystem:read   /project/schema.sql                │
│                                                                  │
│  Yesterday                                                      │
│  ─────────                                                      │
│  15:45  ✗ filesystem:read   /etc/passwd (DENIED)               │
│  15:44  ✓ network:fetch     api.example.com/users              │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Rate Limiting

Prevent resource abuse:

```typescript
const rateLimits = {
  'ai:chat': { requests: 100, window: '1h' },
  'filesystem:read': { requests: 1000, window: '1m' },
  'network:fetch': { requests: 100, window: '1m' },
};
```

## Development Mode Security

During development, apps get relaxed security:

```typescript
const developmentDefaults = {
  // Implicit permissions (no declaration needed)
  implicit: [
    'filesystem:read:$PROJECT',
    'filesystem:write:$PROJECT',
    'network:localhost',
    'iris:navigation',
    'iris:notifications',
  ],

  // Prompted interactively
  prompted: [
    'network:*',
    'ai:*',
    'process:spawn',
  ],

  // Always denied
  denied: [
    'filesystem:read:/',
    'process:env:*_SECRET',
    'process:env:*_KEY',
  ],
};
```

---

*Next: [05-resilience.md](./05-resilience.md) - Error handling and recovery*
