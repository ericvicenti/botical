# Iris Apps: Security Model

## Threat Model

Iris Apps have significant access to powerful capabilities. We must protect against:

| Threat | Description | Impact |
|--------|-------------|--------|
| **Malicious App** | App intentionally designed to harm | Data theft, system damage |
| **Buggy App** | Well-intentioned app with vulnerabilities | Unintended data exposure |
| **Supply Chain** | Compromised dependency | Silent exploitation |
| **Privilege Escalation** | App gaining unauthorized access | Broader system access |
| **Resource Abuse** | App consuming excessive resources | DoS, cost inflation |
| **Data Exfiltration** | App leaking sensitive data | Privacy breach |
| **AI Manipulation** | App tricking AI into harmful actions | Indirect attacks |

## Security Zones

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         SECURITY ARCHITECTURE                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │  ZONE 0: Host System                                            │    │
│  │                                                                  │    │
│  │  • Operating system                                             │    │
│  │  • Other applications                                           │    │
│  │  • User files outside project                                   │    │
│  │                                                                  │    │
│  │  Access: NEVER by apps (filesystem sandbox)                     │    │
│  └────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │  ZONE 1: Iris Core (Trusted)                                    │    │
│  │                                                                  │    │
│  │  • Iris server process                                          │    │
│  │  • App Manager, Tool Registry, Service Runner                   │    │
│  │  • Permission enforcement                                       │    │
│  │  • API credentials, encryption keys                             │    │
│  │                                                                  │    │
│  │  Access: Only Iris core code, never apps directly               │    │
│  └────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │  ZONE 2: Iris Platform APIs (Gated)                             │    │
│  │                                                                  │    │
│  │  • AI capabilities (chat, embed)                                │    │
│  │  • Filesystem access (scoped)                                   │    │
│  │  • Network access (scoped)                                      │    │
│  │  • Tool invocation                                              │    │
│  │                                                                  │    │
│  │  Access: Via permission-checked SDK methods                     │    │
│  └────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │  ZONE 3: App Server (Sandboxed)                                 │    │
│  │                                                                  │    │
│  │  • App's server.ts code                                         │    │
│  │  • App's state, queries, tools                                  │    │
│  │  • App's services                                               │    │
│  │                                                                  │    │
│  │  Access: Declared permissions only, audited                     │    │
│  └────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │  ZONE 4: App UI (Isolated)                                      │    │
│  │                                                                  │    │
│  │  • iframe with sandbox attribute                                │    │
│  │  • No direct system access                                      │    │
│  │  • Communication only via postMessage bridge                    │    │
│  │                                                                  │    │
│  │  Access: Only what bridge explicitly provides                   │    │
│  └────────────────────────────────────────────────────────────────┘    │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

## Permission System

### Permission Declaration

Apps must declare all required permissions in `app.json`:

```json
{
  "permissions": [
    "filesystem:read:$PROJECT",
    "filesystem:write:$APP/data",
    "network:fetch:api.example.com",
    "ai:chat",
    "iris:notifications"
  ]
}
```

### Permission Taxonomy

```
permission := category ":" action [ ":" scope ]

Categories:
├── filesystem    File system access
├── network       Network/internet access
├── ai            AI model access
├── process       Process spawning
├── iris          Iris platform features
├── system        System features (clipboard, etc.)
└── app           Cross-app communication
```

### Detailed Permission Reference

#### Filesystem Permissions

| Permission | Description | Risk |
|------------|-------------|------|
| `filesystem:read` | Read any file | HIGH - Can access credentials, keys |
| `filesystem:read:$PROJECT` | Read within project | MEDIUM - Project data only |
| `filesystem:read:$APP` | Read within app directory | LOW - Own files only |
| `filesystem:write` | Write any file | CRITICAL - System damage |
| `filesystem:write:$PROJECT` | Write within project | MEDIUM - Project modification |
| `filesystem:write:$APP` | Write within app directory | LOW - Own data only |
| `filesystem:write:$APP/data` | Write to specific subdirectory | MINIMAL - Constrained |

#### Network Permissions

| Permission | Description | Risk |
|------------|-------------|------|
| `network:*` | Unrestricted network | HIGH - Data exfiltration |
| `network:fetch` | HTTP(S) requests only | MEDIUM - Can call APIs |
| `network:fetch:*.example.com` | Domain-scoped fetch | LOW - Limited destinations |
| `network:websocket` | WebSocket connections | MEDIUM - Persistent connections |
| `network:localhost` | Localhost only | LOW - Local services |

#### AI Permissions

| Permission | Description | Risk |
|------------|-------------|------|
| `ai:chat` | Chat completions | MEDIUM - Cost, potential misuse |
| `ai:chat:limited` | Rate-limited chat | LOW - Controlled usage |
| `ai:embed` | Embeddings | LOW - Minimal risk |
| `ai:tools` | AI tool calling | HIGH - Indirect actions |

#### Process Permissions

| Permission | Description | Risk |
|------------|-------------|------|
| `process:spawn` | Run any command | CRITICAL - System access |
| `process:spawn:$APP` | Commands in app dir only | MEDIUM - Constrained |
| `process:env` | Access env variables | HIGH - May contain secrets |
| `process:env:PUBLIC_*` | Pattern-matched env | LOW - Explicit exposure |

#### Iris Platform Permissions

| Permission | Description | Risk |
|------------|-------------|------|
| `iris:tools` | Call built-in tools | HIGH - Tool capabilities |
| `iris:tools:read-only` | Read-only tools | LOW - No modification |
| `iris:apps` | Cross-app calls | MEDIUM - App interactions |
| `iris:navigation` | Navigate Iris UI | LOW - UX only |
| `iris:notifications` | Show notifications | MINIMAL - UX only |
| `iris:clipboard` | Clipboard access | MEDIUM - Data exposure |

### Permission Scopes

Scopes constrain where permissions apply:

| Scope | Resolves To | Example |
|-------|-------------|---------|
| `$PROJECT` | Current project directory | `/home/user/my-project` |
| `$APP` | App's directory | `/home/user/my-project/apps/my-app` |
| `$DATA` | App's data directory | `/home/user/my-project/.iris/app-data/my-app` |
| `$CONFIG` | App's config directory | `/home/user/my-project/.iris/app-config/my-app` |
| `$TEMP` | Temporary directory | `/tmp/iris/my-app-{uuid}` |
| Domain glob | Network domain pattern | `*.example.com` |

### Permission Enforcement

```typescript
// Permission check at runtime
class PermissionChecker {
  constructor(private permissions: Permission[]) {}

  check(required: Permission): PermissionResult {
    // Check if any granted permission satisfies the requirement
    for (const granted of this.permissions) {
      if (this.satisfies(granted, required)) {
        return { allowed: true };
      }
    }

    return {
      allowed: false,
      reason: `Permission denied: ${required}`,
      required,
      granted: this.permissions,
    };
  }

  private satisfies(granted: Permission, required: Permission): boolean {
    // Exact match
    if (granted === required) return true;

    // Wildcard match (filesystem:read covers filesystem:read:$PROJECT)
    if (granted.endsWith(':*')) {
      const prefix = granted.slice(0, -2);
      if (required.startsWith(prefix)) return true;
    }

    // Scope containment ($PROJECT covers $PROJECT/subdir)
    // ... more complex logic for scope hierarchy
  }
}

// Usage in SDK
async function read(path: string) {
  const permission = `filesystem:read:${resolvePath(path)}`;
  const result = permissionChecker.check(permission);

  if (!result.allowed) {
    throw new PermissionDeniedError(result);
  }

  return await fs.readFile(path, 'utf8');
}
```

## Sandboxing Strategies

### App Server Sandbox

The app server runs in a restricted environment:

```typescript
// Sandbox configuration for app server
interface AppServerSandbox {
  // Filesystem restrictions
  filesystem: {
    root: string;           // Chroot-like root
    allowedPaths: string[]; // Explicit allow list
    deniedPaths: string[];  // Explicit deny list
  };

  // Network restrictions
  network: {
    allowedHosts: string[];
    deniedHosts: string[];
    allowedPorts: number[];
  };

  // Process restrictions
  process: {
    maxProcesses: number;
    allowedCommands: string[];
    maxMemory: number;
    maxCPU: number;
  };

  // Environment restrictions
  env: {
    allowed: string[];      // Env vars to pass through
    overrides: Record<string, string>;
  };
}
```

### App UI Sandbox

The UI runs in a sandboxed iframe:

```html
<iframe
  src="..."
  sandbox="allow-scripts allow-same-origin"
  allow="clipboard-write"
  csp="default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';"
></iframe>
```

**Sandbox Attributes:**
- `allow-scripts` - Allow JavaScript execution
- `allow-same-origin` - Allow same-origin access (needed for postMessage)
- `allow-forms` - Allow form submission (optional)
- NOT included: `allow-top-navigation`, `allow-popups`, `allow-modals`

**Content Security Policy:**
- No external scripts
- No external styles (or only from CDN whitelist)
- No iframes within the iframe
- No data: or blob: URLs for scripts

### Bridge Security

The postMessage bridge enforces security:

```typescript
class SecureBridge {
  private allowedOrigins: string[];
  private rateLimiter: RateLimiter;

  handleMessage(event: MessageEvent) {
    // Origin validation
    if (!this.allowedOrigins.includes(event.origin)) {
      console.warn('Message from unauthorized origin:', event.origin);
      return;
    }

    // Rate limiting
    if (!this.rateLimiter.allow(event.origin)) {
      console.warn('Rate limit exceeded for:', event.origin);
      return;
    }

    // Message validation
    const validation = this.validateMessage(event.data);
    if (!validation.valid) {
      console.warn('Invalid message:', validation.error);
      return;
    }

    // Permission check for requested action
    const permission = this.getRequiredPermission(event.data);
    if (permission && !this.hasPermission(permission)) {
      this.sendError(event.source, 'Permission denied', event.data.id);
      return;
    }

    // Process message
    this.processMessage(event.data, event.source);
  }
}
```

## Trust Levels

Apps have different trust levels based on their source:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           TRUST LEVELS                                   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  LEVEL 4: Development App (Highest Trust)                               │
│  ├── Source: App being developed in current project                     │
│  ├── Trust: User is the developer                                       │
│  ├── Permissions: Can request any, granted interactively                │
│  └── Audit: Full source visible, hot reload                             │
│                                                                          │
│  LEVEL 3: Local App                                                      │
│  ├── Source: Installed from local path                                  │
│  ├── Trust: User explicitly installed                                   │
│  ├── Permissions: Declared + approved at install                        │
│  └── Audit: Source available locally                                    │
│                                                                          │
│  LEVEL 2: Verified App                                                   │
│  ├── Source: Iris App Registry, verified publisher                      │
│  ├── Trust: Signed by known entity                                      │
│  ├── Permissions: Declared + approved at install                        │
│  └── Audit: Source available, automated scanning                        │
│                                                                          │
│  LEVEL 1: Community App                                                  │
│  ├── Source: Iris App Registry, unverified                              │
│  ├── Trust: User accepts risk                                           │
│  ├── Permissions: Restricted set, elevated needs approval               │
│  └── Audit: Source available, warning shown                             │
│                                                                          │
│  LEVEL 0: Unknown App (Lowest Trust)                                    │
│  ├── Source: Unknown URL or path                                        │
│  ├── Trust: None                                                        │
│  ├── Permissions: Minimal sandbox only                                  │
│  └── Audit: Requires explicit user approval                             │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Trust Level Capabilities

| Capability | Level 0 | Level 1 | Level 2 | Level 3 | Level 4 |
|------------|---------|---------|---------|---------|---------|
| Run in iframe | Yes | Yes | Yes | Yes | Yes |
| Basic state/tools | Yes | Yes | Yes | Yes | Yes |
| Network (localhost) | No | Yes | Yes | Yes | Yes |
| Network (internet) | No | Approved | Approved | Approved | Yes |
| Filesystem (app) | No | Yes | Yes | Yes | Yes |
| Filesystem (project) | No | Approved | Approved | Yes | Yes |
| AI access | No | Limited | Yes | Yes | Yes |
| Spawn processes | No | No | Approved | Approved | Yes |
| Iris tools | No | Read-only | Approved | Yes | Yes |
| System features | No | No | No | Approved | Yes |

## Audit & Monitoring

### Audit Logging

All sensitive operations are logged:

```typescript
interface AuditEvent {
  timestamp: number;
  appId: string;
  appVersion: string;
  projectId: string;
  userId: string;

  // What happened
  action: string;           // 'filesystem:read', 'ai:chat', etc.
  target?: string;          // Path, URL, etc.
  args?: unknown;           // Sanitized arguments

  // Result
  allowed: boolean;
  result?: 'success' | 'error';
  error?: string;

  // Context
  callSite?: string;        // Stack trace location
  toolName?: string;        // If from tool execution
  aiSession?: string;       // If AI-initiated
}
```

### Audit Log Example

```json
[
  {
    "timestamp": 1705234567890,
    "appId": "database-explorer",
    "action": "filesystem:read",
    "target": "/home/user/project/data.db",
    "allowed": true,
    "result": "success"
  },
  {
    "timestamp": 1705234567900,
    "appId": "database-explorer",
    "action": "filesystem:read",
    "target": "/etc/passwd",
    "allowed": false,
    "error": "Permission denied: outside project scope"
  },
  {
    "timestamp": 1705234568000,
    "appId": "database-explorer",
    "action": "ai:chat",
    "args": { "messageCount": 3, "model": "claude-sonnet" },
    "allowed": true,
    "result": "success",
    "aiSession": "session-123"
  }
]
```

### Rate Limiting

Prevent resource abuse:

```typescript
interface RateLimits {
  // AI calls
  'ai:chat': { requests: 100, window: '1h' };
  'ai:embed': { requests: 1000, window: '1h' };

  // Filesystem
  'filesystem:read': { requests: 1000, window: '1m' };
  'filesystem:write': { requests: 100, window: '1m' };

  // Network
  'network:fetch': { requests: 100, window: '1m' };

  // Tools
  'iris:tools': { requests: 50, window: '1m' };
}
```

### Anomaly Detection

Flag suspicious patterns:

```typescript
const anomalyRules = [
  // Rapid permission denied attempts
  {
    pattern: 'permission_denied > 10 in 1m',
    action: 'alert',
    severity: 'high',
  },

  // Unusual file access patterns
  {
    pattern: 'filesystem:read distinct_paths > 100 in 1m',
    action: 'alert',
    severity: 'medium',
  },

  // Large data exfiltration attempt
  {
    pattern: 'network:fetch bytes_out > 10MB in 1m',
    action: 'throttle',
    severity: 'high',
  },

  // AI abuse
  {
    pattern: 'ai:chat tokens > 100000 in 1h',
    action: 'throttle',
    severity: 'medium',
  },
];
```

## Secure Defaults

### Development Mode

Development apps get more permissions but with guardrails:

```typescript
const developmentDefaults = {
  // Implicit permissions (no declaration needed)
  implicitPermissions: [
    'filesystem:read:$PROJECT',
    'filesystem:write:$PROJECT',
    'network:localhost',
    'iris:notifications',
    'iris:navigation',
  ],

  // Permissions that prompt interactively
  promptPermissions: [
    'network:*',
    'ai:*',
    'process:spawn',
    'iris:tools',
  ],

  // Always denied in development
  deniedPermissions: [
    'filesystem:read:/',         // System root
    'filesystem:write:/',
    'process:env:*_KEY',         // API keys
    'process:env:*_SECRET',
    'process:env:*_TOKEN',
  ],
};
```

### Installed App Mode

Installed apps are more restricted:

```typescript
const installedDefaults = {
  // Only declared permissions
  implicitPermissions: [],

  // User must approve at install time
  requireApproval: true,

  // Restricted by default
  defaultDenied: [
    'filesystem:write',          // Must scope to $APP
    'network:*',                 // Must specify domains
    'process:spawn',             // Must specify commands
    'ai:tools',                  // Indirect actions
  ],
};
```

## Incident Response

### Permission Revocation

If an app misbehaves, permissions can be revoked:

```typescript
// Revoke specific permission
await AppManager.revokePermission(appId, 'network:*');

// Disable app entirely
await AppManager.disable(appId, {
  reason: 'Suspicious network activity detected',
  preserveData: true,
});

// Emergency kill (immediate, no cleanup)
await AppManager.kill(appId);
```

### User Notifications

Users are notified of security events:

```typescript
// Permission request
notify({
  type: 'permission-request',
  app: 'my-app',
  permission: 'filesystem:write:/important/file',
  actions: ['Allow Once', 'Allow Always', 'Deny'],
});

// Security warning
notify({
  type: 'security-warning',
  app: 'my-app',
  message: 'Unusual activity detected: 50 file reads in 10 seconds',
  actions: ['View Details', 'Disable App', 'Dismiss'],
});

// Audit alert
notify({
  type: 'audit-alert',
  app: 'my-app',
  message: 'App attempted to access credentials file',
  severity: 'high',
  actions: ['View Audit Log', 'Disable App'],
});
```

---

*Next: [05-resilience.md](./05-resilience.md) - Error handling and development experience*
