# Iris Apps: Resilience & Error Handling

## Philosophy

> **Broken code is normal. Broken experiences are not.**

During development, apps will constantly be in broken states:
- Syntax errors in files being edited
- Runtime errors from incomplete logic
- Missing dependencies
- Service connection failures
- State corruption from hot reloads

The system must handle all of these gracefully while providing developers with the information they need to fix issues quickly.

## Error Categories

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         ERROR CATEGORIES                                 │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  BUILD-TIME ERRORS                                                       │
│  ├── Syntax errors in TypeScript/JavaScript                             │
│  ├── Import resolution failures                                         │
│  ├── Type errors (in strict mode)                                       │
│  └── Manifest validation errors                                         │
│                                                                          │
│  LOAD-TIME ERRORS                                                        │
│  ├── Module evaluation errors                                           │
│  ├── Missing exports                                                    │
│  ├── Invalid tool/state definitions                                     │
│  └── Permission validation failures                                     │
│                                                                          │
│  RUNTIME ERRORS                                                          │
│  ├── Tool execution failures                                            │
│  ├── State update errors                                                │
│  ├── Service crashes                                                    │
│  ├── Network failures                                                   │
│  └── Unhandled promise rejections                                       │
│                                                                          │
│  UI ERRORS                                                               │
│  ├── React render errors                                                │
│  ├── Event handler errors                                               │
│  ├── Bridge communication failures                                      │
│  └── Asset loading failures                                             │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

## Error Handling Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         ERROR HANDLING FLOW                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│                          ┌─────────────────┐                            │
│                          │  Error Occurs   │                            │
│                          └────────┬────────┘                            │
│                                   │                                      │
│                    ┌──────────────┼──────────────┐                      │
│                    ▼              ▼              ▼                      │
│           ┌──────────────┐ ┌──────────────┐ ┌──────────────┐           │
│           │   Server     │ │   Bridge     │ │     UI       │           │
│           │   Errors     │ │   Errors     │ │   Errors     │           │
│           └──────┬───────┘ └──────┬───────┘ └──────┬───────┘           │
│                  │                │                │                    │
│                  └────────────────┼────────────────┘                    │
│                                   ▼                                      │
│                    ┌──────────────────────────┐                         │
│                    │    Error Aggregator      │                         │
│                    │                          │                         │
│                    │  • Deduplicate           │                         │
│                    │  • Categorize            │                         │
│                    │  • Enrich with context   │                         │
│                    └─────────────┬────────────┘                         │
│                                  │                                       │
│                    ┌─────────────┼─────────────┐                        │
│                    ▼             ▼             ▼                        │
│           ┌──────────────┐ ┌──────────────┐ ┌──────────────┐           │
│           │   Error UI   │ │   Log File   │ │   Telemetry  │           │
│           │   Overlay    │ │              │ │   (opt-in)   │           │
│           └──────────────┘ └──────────────┘ └──────────────┘           │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

## Error Data Structure

Every error is normalized to a common structure:

```typescript
interface AppError {
  // Identity
  id: string;              // Unique error ID
  timestamp: number;       // When it occurred

  // Classification
  category: ErrorCategory; // build | load | runtime | ui
  severity: ErrorSeverity; // fatal | error | warning | info
  code?: string;           // Machine-readable code (e.g., 'ENOENT')

  // Message
  message: string;         // Human-readable message
  details?: string;        // Additional context

  // Location
  source: ErrorSource;     // server | ui | bridge | system
  file?: string;           // Source file path
  line?: number;           // Line number
  column?: number;         // Column number
  functionName?: string;   // Function where error occurred

  // Stack trace
  stack?: string;          // Full stack trace
  frames?: StackFrame[];   // Parsed stack frames

  // Context
  appId: string;
  appVersion: string;
  projectId: string;
  toolName?: string;       // If in tool execution
  stateName?: string;      // If in state update
  serviceName?: string;    // If in service

  // Recovery
  recoverable: boolean;
  recoveryAction?: RecoveryAction;
  retryable: boolean;

  // Related
  cause?: AppError;        // Underlying cause
  related?: string[];      // Related error IDs
}

interface StackFrame {
  file: string;
  line: number;
  column: number;
  function: string;
  isApp: boolean;          // Is this frame in app code?
  source?: string;         // Source line if available
}

type RecoveryAction =
  | { type: 'retry' }
  | { type: 'reload' }
  | { type: 'restart-service'; service: string }
  | { type: 'fix-file'; file: string; line: number }
  | { type: 'install-dependency'; package: string }
  | { type: 'update-config'; key: string };
```

## Build-Time Error Handling

### Vite Integration

The UI build (Vite) reports errors through HMR:

```typescript
// In app UI dev server
vite.on('error', (error) => {
  bridge.send({
    type: 'build-error',
    payload: {
      message: error.message,
      file: error.loc?.file,
      line: error.loc?.line,
      column: error.loc?.column,
      frame: error.frame,    // Code frame with highlighted error
    },
  });
});
```

### Server Module Compilation

The server module is compiled with error capture:

```typescript
async function loadServerModule(path: string): Promise<LoadResult> {
  try {
    // Bun's import with error details
    const module = await import(path);
    return { success: true, module };
  } catch (error) {
    if (error instanceof SyntaxError) {
      return {
        success: false,
        error: {
          category: 'build',
          message: error.message,
          file: extractFile(error),
          line: extractLine(error),
          frame: generateCodeFrame(path, extractLine(error)),
        },
      };
    }
    // Re-throw unexpected errors
    throw error;
  }
}
```

### Error Overlay for Build Errors

```tsx
function BuildErrorOverlay({ error }: { error: BuildError }) {
  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full overflow-hidden">
        {/* Header */}
        <div className="bg-red-500 text-white px-4 py-2 flex items-center gap-2">
          <AlertCircle size={20} />
          <span className="font-medium">Build Error</span>
        </div>

        {/* Message */}
        <div className="p-4">
          <p className="text-red-600 font-mono text-sm mb-4">
            {error.message}
          </p>

          {/* Code frame */}
          {error.frame && (
            <pre className="bg-gray-100 rounded p-3 text-xs overflow-auto">
              {error.frame}
            </pre>
          )}

          {/* File location */}
          {error.file && (
            <p className="text-gray-500 text-sm mt-4">
              {error.file}:{error.line}:{error.column}
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="border-t px-4 py-3 flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={() => openFile(error.file, error.line)}
          >
            Open in Editor
          </Button>
        </div>
      </div>
    </div>
  );
}
```

## Load-Time Error Handling

### Module Validation

After loading, validate the module exports:

```typescript
function validateAppModule(module: unknown): ValidationResult {
  const errors: ValidationError[] = [];

  // Check default export
  if (!module || typeof module !== 'object') {
    errors.push({
      message: 'App must have a default export',
      hint: 'Use: export default defineApp({ ... })',
    });
    return { valid: false, errors };
  }

  const app = (module as any).default;

  // Check it's a valid app definition
  if (!isAppDefinition(app)) {
    errors.push({
      message: 'Default export must be created with defineApp()',
      hint: 'import { defineApp } from "@iris/app-sdk/server"',
    });
    return { valid: false, errors };
  }

  // Validate tools
  for (const tool of app.tools ?? []) {
    const toolErrors = validateTool(tool);
    errors.push(...toolErrors);
  }

  // Validate state
  for (const [name, state] of Object.entries(app.state ?? {})) {
    const stateErrors = validateState(name, state);
    errors.push(...stateErrors);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings: [], // Non-fatal issues
  };
}
```

### Graceful Degradation

If parts of an app fail to load, load what we can:

```typescript
async function loadAppWithFallback(manifest: AppManifest): Promise<LoadedApp> {
  const app: LoadedApp = {
    manifest,
    status: 'partial',
    tools: [],
    state: {},
    services: {},
    errors: [],
  };

  // Try loading server module
  try {
    const serverModule = await loadServerModule(manifest.server.entry);
    app.serverModule = serverModule;

    // Register tools that are valid
    for (const tool of serverModule.tools ?? []) {
      try {
        validateTool(tool);
        app.tools.push(tool);
      } catch (error) {
        app.errors.push({
          category: 'load',
          message: `Invalid tool "${tool.name}": ${error.message}`,
          recoveryAction: { type: 'fix-file', file: manifest.server.entry },
        });
      }
    }

    // Initialize state that is valid
    for (const [name, stateDef] of Object.entries(serverModule.state ?? {})) {
      try {
        app.state[name] = initializeState(stateDef);
      } catch (error) {
        app.errors.push({
          category: 'load',
          message: `Invalid state "${name}": ${error.message}`,
        });
      }
    }
  } catch (error) {
    app.errors.push({
      category: 'load',
      severity: 'fatal',
      message: `Failed to load server module: ${error.message}`,
      stack: error.stack,
    });
  }

  // If we have any working parts, the app is partially loaded
  if (app.tools.length > 0 || Object.keys(app.state).length > 0) {
    app.status = 'partial';
  } else if (app.errors.some(e => e.severity === 'fatal')) {
    app.status = 'error';
  } else {
    app.status = 'loaded';
  }

  return app;
}
```

## Runtime Error Handling

### Tool Execution

Tools are executed with comprehensive error handling:

```typescript
async function executeTool(
  tool: ToolDefinition,
  args: unknown,
  ctx: ToolContext
): Promise<ToolResult> {
  const startTime = Date.now();

  try {
    // Validate arguments
    const parseResult = tool.parameters.safeParse(args);
    if (!parseResult.success) {
      return {
        success: false,
        error: 'Invalid arguments',
        errorCode: 'INVALID_ARGS',
        details: formatZodError(parseResult.error),
      };
    }

    // Execute with timeout
    const result = await Promise.race([
      tool.execute(parseResult.data, ctx),
      timeout(tool.timeout ?? 30000).then(() => {
        throw new TimeoutError(`Tool execution timed out after ${tool.timeout}ms`);
      }),
    ]);

    return {
      success: true,
      data: result,
      executionTime: Date.now() - startTime,
    };
  } catch (error) {
    // Log error
    ctx.log.error(`Tool "${tool.name}" failed:`, error);

    // Categorize error
    const appError = categorizeError(error, {
      toolName: tool.name,
      args: sanitizeArgs(args),
    });

    // Emit error event
    ctx.emit('tool:error', { tool: tool.name, error: appError });

    return {
      success: false,
      error: appError.message,
      errorCode: appError.code,
      stack: appError.stack,
      recoverable: appError.recoverable,
      retryable: appError.retryable,
    };
  }
}
```

### State Updates

State updates are wrapped with error handling:

```typescript
function createSafeStateHandle<T>(
  name: string,
  initial: T,
  options: StateOptions
): StateHandle<T> {
  let value = initial;
  const listeners = new Set<(value: T) => void>();

  return {
    get() {
      return value;
    },

    set(newValue: T) {
      try {
        // Validate new value if schema provided
        if (options.schema) {
          options.schema.parse(newValue);
        }

        const oldValue = value;
        value = newValue;

        // Notify listeners
        for (const listener of listeners) {
          try {
            listener(value);
          } catch (listenerError) {
            console.error(`State listener error for "${name}":`, listenerError);
            // Don't throw - other listeners should still run
          }
        }
      } catch (error) {
        // Emit state error event instead of throwing
        EventBus.emit('state:error', {
          state: name,
          error: categorizeError(error),
          attemptedValue: newValue,
          currentValue: value,
        });

        // Rethrow for caller to handle
        throw error;
      }
    },

    update(updater: (prev: T) => T) {
      try {
        const newValue = updater(value);
        this.set(newValue);
      } catch (error) {
        EventBus.emit('state:error', {
          state: name,
          error: categorizeError(error),
          phase: 'update',
        });
        throw error;
      }
    },

    subscribe(listener: (value: T) => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
```

### Service Supervision

Services are supervised with restart logic:

```typescript
class ServiceSupervisor {
  private restartCount = 0;
  private lastRestart = 0;

  async supervise(service: ServiceDefinition): Promise<void> {
    while (true) {
      try {
        // Start service
        const instance = await service.start(this.ctx);
        this.restartCount = 0; // Reset on successful start

        // Monitor health
        if (service.healthCheck) {
          await this.monitorHealth(service, instance);
        } else {
          // Wait for service to exit
          await this.waitForExit(instance);
        }
      } catch (error) {
        this.restartCount++;

        // Emit error
        EventBus.emit('service:error', {
          service: service.name,
          error: categorizeError(error),
          restartCount: this.restartCount,
        });

        // Check restart policy
        if (!service.restartOnCrash) {
          throw error; // Don't restart
        }

        if (this.restartCount > (service.maxRestarts ?? 5)) {
          throw new Error(
            `Service "${service.name}" exceeded max restarts (${service.maxRestarts})`
          );
        }

        // Exponential backoff
        const delay = Math.min(
          (service.restartDelay ?? 1000) * Math.pow(2, this.restartCount - 1),
          30000
        );

        console.log(
          `Restarting service "${service.name}" in ${delay}ms (attempt ${this.restartCount})`
        );

        await sleep(delay);
      }
    }
  }
}
```

## UI Error Handling

### React Error Boundary

The app UI is wrapped in an error boundary:

```tsx
class AppErrorBoundary extends React.Component<Props, State> {
  state = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Report to parent Iris
    window.parent.postMessage({
      type: 'iris:error',
      payload: {
        message: error.message,
        stack: error.stack,
        componentStack: errorInfo.componentStack,
        // Extract file/line from stack
        ...parseStackTrace(error.stack),
      },
    }, '*');
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  handleViewSource = () => {
    const { file, line } = parseStackTrace(this.state.error?.stack);
    if (file) {
      window.parent.postMessage({
        type: 'iris:navigate',
        payload: { path: `/files/${file}`, line },
      }, '*');
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <ErrorFallback
          error={this.state.error}
          onRetry={this.handleRetry}
          onViewSource={this.handleViewSource}
        />
      );
    }

    return this.props.children;
  }
}
```

### Error Fallback UI

```tsx
function ErrorFallback({ error, onRetry, onViewSource }: ErrorFallbackProps) {
  const { file, line, column } = parseStackTrace(error.stack);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-lg w-full">
        {/* Error icon */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-100 mb-4">
            <AlertCircle className="w-8 h-8 text-red-600" />
          </div>
          <h1 className="text-xl font-semibold text-gray-900">
            Something went wrong
          </h1>
        </div>

        {/* Error message */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden mb-4">
          <div className="px-4 py-3 bg-red-50 border-b border-red-100">
            <p className="text-red-700 font-mono text-sm">
              {error.message}
            </p>
          </div>

          {/* File location */}
          {file && (
            <div className="px-4 py-2 bg-gray-50 border-b text-sm text-gray-600">
              <code>{file}:{line}:{column}</code>
            </div>
          )}

          {/* Stack trace (collapsed by default) */}
          <details className="px-4 py-2">
            <summary className="text-sm text-gray-500 cursor-pointer">
              Stack trace
            </summary>
            <pre className="mt-2 text-xs text-gray-600 overflow-auto max-h-48">
              {error.stack}
            </pre>
          </details>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={onRetry}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Try Again
          </button>
          {file && (
            <button
              onClick={onViewSource}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              View Source
            </button>
          )}
        </div>

        {/* Help text */}
        <p className="mt-4 text-center text-sm text-gray-500">
          This error occurred in the app's UI code.
          Check the console for more details.
        </p>
      </div>
    </div>
  );
}
```

## Hot Reload Resilience

### State Preservation

State is preserved across hot reloads:

```typescript
class HotReloadManager {
  private stateSnapshot: Map<string, unknown> = new Map();

  async beforeReload(app: LoadedApp): Promise<void> {
    // Snapshot current state
    for (const [name, state] of Object.entries(app.state)) {
      try {
        const value = state.get();
        // Only snapshot serializable state
        if (isSerializable(value)) {
          this.stateSnapshot.set(name, structuredClone(value));
        }
      } catch (error) {
        console.warn(`Could not snapshot state "${name}":`, error);
      }
    }

    // Call app's beforeReload hook if defined
    if (app.serverModule.onBeforeReload) {
      await app.serverModule.onBeforeReload(app.ctx);
    }
  }

  async afterReload(app: LoadedApp): Promise<void> {
    // Restore state
    for (const [name, state] of Object.entries(app.state)) {
      const snapshot = this.stateSnapshot.get(name);
      if (snapshot !== undefined) {
        try {
          state.set(snapshot);
        } catch (error) {
          console.warn(`Could not restore state "${name}":`, error);
        }
      }
    }

    // Call app's afterReload hook
    if (app.serverModule.onReload) {
      await app.serverModule.onReload(app.ctx, {
        previousState: Object.fromEntries(this.stateSnapshot),
      });
    }

    // Clear snapshot
    this.stateSnapshot.clear();
  }
}
```

### Reload Error Recovery

If a reload fails, keep the old version running:

```typescript
async function safeReload(appId: string): Promise<ReloadResult> {
  const currentApp = AppManager.get(appId);

  // Snapshot current state
  await HotReloadManager.beforeReload(currentApp);

  try {
    // Attempt to load new version
    const newModule = await loadServerModule(currentApp.manifest.server.entry);
    const validation = validateAppModule(newModule);

    if (!validation.valid) {
      return {
        success: false,
        error: {
          message: 'New code has validation errors',
          details: validation.errors,
        },
        fallback: 'keeping-current',
      };
    }

    // Swap modules
    currentApp.serverModule = newModule;

    // Restore state
    await HotReloadManager.afterReload(currentApp);

    return { success: true };
  } catch (error) {
    // Reload failed - keep current version
    return {
      success: false,
      error: categorizeError(error),
      fallback: 'keeping-current',
    };
  }
}
```

## Error Aggregation & Display

### Error Panel

Iris shows an error panel for the current app:

```tsx
function AppErrorPanel({ appId }: { appId: string }) {
  const errors = useAppErrors(appId);

  if (errors.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 w-80 bg-white rounded-lg shadow-lg border border-red-200 overflow-hidden">
      <div className="bg-red-500 text-white px-3 py-2 flex items-center justify-between">
        <span className="font-medium">
          {errors.length} Error{errors.length > 1 ? 's' : ''}
        </span>
        <button onClick={clearErrors}>
          <X size={16} />
        </button>
      </div>

      <div className="max-h-64 overflow-auto">
        {errors.map((error) => (
          <ErrorItem
            key={error.id}
            error={error}
            onViewSource={() => openFile(error.file, error.line)}
            onDismiss={() => dismissError(error.id)}
          />
        ))}
      </div>
    </div>
  );
}
```

### Console Integration

Errors are also logged to the console with helpful formatting:

```typescript
function logError(error: AppError): void {
  const style = {
    fatal: 'color: white; background: #dc2626; padding: 2px 6px; border-radius: 3px;',
    error: 'color: white; background: #dc2626; padding: 2px 6px; border-radius: 3px;',
    warning: 'color: white; background: #f59e0b; padding: 2px 6px; border-radius: 3px;',
    info: 'color: white; background: #3b82f6; padding: 2px 6px; border-radius: 3px;',
  }[error.severity];

  console.groupCollapsed(
    `%c${error.severity.toUpperCase()}%c ${error.message}`,
    style,
    ''
  );

  if (error.file) {
    console.log(`📍 ${error.file}:${error.line}:${error.column}`);
  }

  if (error.stack) {
    console.log(error.stack);
  }

  if (error.recoveryAction) {
    console.log('💡 Recovery:', describeRecoveryAction(error.recoveryAction));
  }

  console.groupEnd();
}
```

---

*Next: [06-protocol.md](./06-protocol.md) - Communication protocols*
