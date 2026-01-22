# Phase 19: Polish & Production

**Goal**: Final UX polish, performance optimization, accessibility, and production readiness

## Overview

This phase finalizes the WebUI:
- Error boundaries and loading states
- Keyboard navigation and accessibility
- Performance optimization
- Responsive design refinements
- Production build configuration
- End-to-end testing

---

## Error Handling

### Error Boundary

```tsx
// src/components/ErrorBoundary.tsx
import { Component, ReactNode } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error?: Error
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Error caught by boundary:', error, errorInfo)
    // Could send to error reporting service
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: undefined })
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div className="h-full flex flex-col items-center justify-center p-8 text-center">
          <AlertTriangle className="w-12 h-12 text-accent-error mb-4" />
          <h2 className="text-lg font-medium text-text-primary mb-2">
            Something went wrong
          </h2>
          <p className="text-sm text-text-secondary mb-4 max-w-md">
            {this.state.error?.message || 'An unexpected error occurred'}
          </p>
          <button
            onClick={this.handleRetry}
            className="px-4 py-2 rounded bg-accent-primary text-bg-primary flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Try Again
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
```

### Query Error Handling

```tsx
// src/lib/api/QueryErrorBoundary.tsx
import { useQueryErrorResetBoundary } from '@tanstack/react-query'
import { ErrorBoundary } from '@/components/ErrorBoundary'

interface Props {
  children: React.ReactNode
}

export function QueryErrorBoundary({ children }: Props) {
  const { reset } = useQueryErrorResetBoundary()

  return (
    <ErrorBoundary
      fallback={
        <div className="p-4">
          <button onClick={reset} className="text-accent-primary hover:underline">
            Retry
          </button>
        </div>
      }
    >
      {children}
    </ErrorBoundary>
  )
}
```

### Global Error Toast

```tsx
// src/components/ErrorToast.tsx
import { useState, useEffect } from 'react'
import { X, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

interface Toast {
  id: string
  message: string
  type: 'error' | 'success' | 'info'
}

// Global toast state (could use context/zustand for real implementation)
const toasts: Toast[] = []
const listeners: Set<() => void> = new Set()

export function showToast(message: string, type: Toast['type'] = 'error') {
  const id = Math.random().toString(36).slice(2)
  toasts.push({ id, message, type })
  listeners.forEach(fn => fn())

  // Auto remove after 5 seconds
  setTimeout(() => {
    const index = toasts.findIndex(t => t.id === id)
    if (index !== -1) {
      toasts.splice(index, 1)
      listeners.forEach(fn => fn())
    }
  }, 5000)
}

export function ToastContainer() {
  const [, forceUpdate] = useState({})

  useEffect(() => {
    const update = () => forceUpdate({})
    listeners.add(update)
    return () => { listeners.delete(update) }
  }, [])

  return (
    <div className="fixed bottom-4 right-4 z-50 space-y-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={cn(
            'flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg',
            'bg-bg-elevated border border-border',
            'animate-in slide-in-from-right-5'
          )}
        >
          <AlertCircle className={cn(
            'w-4 h-4',
            toast.type === 'error' && 'text-accent-error',
            toast.type === 'success' && 'text-accent-success',
            toast.type === 'info' && 'text-accent-primary'
          )} />
          <span className="text-sm text-text-primary">{toast.message}</span>
          <button
            onClick={() => {
              const index = toasts.findIndex(t => t.id === toast.id)
              if (index !== -1) {
                toasts.splice(index, 1)
                listeners.forEach(fn => fn())
              }
            }}
            className="text-text-muted hover:text-text-primary"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  )
}
```

---

## Loading States

### Skeleton Components

```tsx
// src/components/ui/Skeleton.tsx
import { cn } from '@/lib/utils/cn'

interface SkeletonProps {
  className?: string
}

export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={cn(
        'animate-pulse bg-bg-elevated rounded',
        className
      )}
    />
  )
}

export function TextSkeleton({ lines = 1 }: { lines?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={cn('h-4', i === lines - 1 ? 'w-3/4' : 'w-full')}
        />
      ))}
    </div>
  )
}

export function CardSkeleton() {
  return (
    <div className="p-4 bg-bg-elevated rounded-lg border border-border space-y-3">
      <Skeleton className="h-5 w-1/3" />
      <TextSkeleton lines={3} />
    </div>
  )
}

export function ListSkeleton({ items = 5 }: { items?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: items }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-2">
          <Skeleton className="w-8 h-8 rounded" />
          <div className="flex-1 space-y-1">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  )
}
```

### Suspense Boundaries

```tsx
// src/components/SuspenseBoundary.tsx
import { Suspense, ReactNode } from 'react'
import { Loader2 } from 'lucide-react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

export function SuspenseBoundary({ children, fallback }: Props) {
  return (
    <Suspense
      fallback={
        fallback ?? (
          <div className="h-full flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-accent-primary" />
          </div>
        )
      }
    >
      {children}
    </Suspense>
  )
}
```

---

## Accessibility

### Focus Management

```tsx
// src/hooks/useFocusTrap.ts
import { useEffect, useRef } from 'react'

export function useFocusTrap<T extends HTMLElement>() {
  const ref = useRef<T>(null)

  useEffect(() => {
    const element = ref.current
    if (!element) return

    const focusable = element.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )
    const first = focusable[0]
    const last = focusable[focusable.length - 1]

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return

      if (e.shiftKey) {
        if (document.activeElement === first) {
          last?.focus()
          e.preventDefault()
        }
      } else {
        if (document.activeElement === last) {
          first?.focus()
          e.preventDefault()
        }
      }
    }

    element.addEventListener('keydown', handleKeyDown)
    first?.focus()

    return () => {
      element.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  return ref
}
```

### ARIA Labels

```tsx
// src/components/ui/AccessibleIcon.tsx
import { VisuallyHidden } from '@radix-ui/react-visually-hidden'
import { ReactNode } from 'react'

interface Props {
  label: string
  children: ReactNode
}

export function AccessibleIcon({ label, children }: Props) {
  return (
    <>
      {children}
      <VisuallyHidden>{label}</VisuallyHidden>
    </>
  )
}
```

### Skip Link

```tsx
// src/components/SkipLink.tsx
export function SkipLink() {
  return (
    <a
      href="#main-content"
      className="
        sr-only focus:not-sr-only
        focus:absolute focus:top-0 focus:left-0
        focus:z-50 focus:px-4 focus:py-2
        focus:bg-accent-primary focus:text-bg-primary
      "
    >
      Skip to main content
    </a>
  )
}
```

---

## Performance Optimization

### Code Splitting

```tsx
// src/routes/lazy.ts
import { lazy } from 'react'

// Lazy load heavy components
export const CodeEditor = lazy(() => import('@/components/files/CodeEditor'))
export const Terminal = lazy(() => import('@/components/processes/Terminal'))
export const DiffViewer = lazy(() => import('@/components/git/DiffViewer'))
```

### Virtual Lists

```tsx
// src/components/ui/VirtualList.tsx
import { useVirtualizer } from '@tanstack/react-virtual'
import { useRef } from 'react'

interface Props<T> {
  items: T[]
  height: number
  itemHeight: number
  renderItem: (item: T, index: number) => React.ReactNode
}

export function VirtualList<T>({ items, height, itemHeight, renderItem }: Props<T>) {
  const parentRef = useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => itemHeight,
    overscan: 5,
  })

  return (
    <div
      ref={parentRef}
      style={{ height, overflow: 'auto' }}
    >
      <div
        style={{
          height: virtualizer.getTotalSize(),
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualItem) => (
          <div
            key={virtualItem.key}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: `${virtualItem.size}px`,
              transform: `translateY(${virtualItem.start}px)`,
            }}
          >
            {renderItem(items[virtualItem.index], virtualItem.index)}
          </div>
        ))}
      </div>
    </div>
  )
}
```

### Memoization

```tsx
// Use React.memo for list items
import { memo } from 'react'

export const FileTreeNode = memo(function FileTreeNode({ file, projectId, depth }: FileTreeNodeProps) {
  // ... component implementation
})

// Use useMemo for expensive computations
const filteredTasks = useMemo(() =>
  tasks.filter(t => t.status !== 'cancelled'),
  [tasks]
)

// Use useCallback for stable function references
const handleClick = useCallback(() => {
  openTab({ type: 'file', projectId, path: file.path })
}, [openTab, projectId, file.path])
```

---

## Responsive Design

### Breakpoint Utilities

```typescript
// src/hooks/useBreakpoint.ts
import { useState, useEffect } from 'react'

const breakpoints = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
}

export function useBreakpoint() {
  const [width, setWidth] = useState(window.innerWidth)

  useEffect(() => {
    const handleResize = () => setWidth(window.innerWidth)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  return {
    isMobile: width < breakpoints.md,
    isTablet: width >= breakpoints.md && width < breakpoints.lg,
    isDesktop: width >= breakpoints.lg,
    width,
  }
}
```

### Mobile Layout Adjustments

```tsx
// In RootLayout
function RootLayout() {
  const { isMobile } = useBreakpoint()
  const { sidebarCollapsed } = useUI()

  return (
    <div className="h-screen flex flex-col">
      <TabBar />

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar: overlay on mobile, inline on desktop */}
        {!isMobile && <Sidebar />}
        {isMobile && !sidebarCollapsed && (
          <div className="absolute inset-0 z-40 flex">
            <Sidebar />
            <div
              className="flex-1 bg-black/50"
              onClick={toggleSidebar}
            />
          </div>
        )}

        <main id="main-content" className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>

      {!isMobile && <BottomPanel />}
    </div>
  )
}
```

---

## Production Configuration

### Vite Production Config

```typescript
// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { TanStackRouterVite } from '@tanstack/router-vite-plugin'

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    TanStackRouterVite(),
  ],
  build: {
    target: 'es2022',
    minify: 'esbuild',
    sourcemap: mode === 'development',
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'editor': ['@codemirror/state', '@codemirror/view'],
          'terminal': ['xterm'],
          'router': ['@tanstack/react-router'],
          'query': ['@tanstack/react-query'],
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:4096',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:4096',
        ws: true,
      },
    },
  },
}))
```

### Environment Variables

```typescript
// src/lib/config.ts
export const config = {
  apiUrl: import.meta.env.VITE_API_URL || '',
  wsUrl: import.meta.env.VITE_WS_URL || '',
  isProd: import.meta.env.PROD,
  isDev: import.meta.env.DEV,
}
```

### Build Scripts

```json
// package.json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "test": "vitest",
    "test:ui": "vitest --ui",
    "test:e2e": "playwright test",
    "lint": "eslint src --ext ts,tsx",
    "typecheck": "tsc --noEmit"
  }
}
```

---

## End-to-End Testing

### Playwright Setup

```typescript
// playwright.config.ts
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'bun run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
  },
})
```

### E2E Test Examples

```typescript
// tests/e2e/mission-workflow.test.ts
import { test, expect } from '@playwright/test'

test.describe('Mission Workflow', () => {
  test('create and complete a mission', async ({ page }) => {
    await page.goto('/')

    // Open a project
    await page.click('[data-testid="project-item"]')

    // Create new mission
    await page.click('[data-testid="new-mission-btn"]')
    await page.fill('[data-testid="mission-title-input"]', 'Test Mission')
    await page.click('[data-testid="create-mission-btn"]')

    // Verify planning view
    await expect(page.locator('text=Planning')).toBeVisible()

    // Edit and approve plan
    await page.fill('[data-testid="plan-editor"]', '# Test Plan')
    await page.click('[data-testid="approve-plan-btn"]')

    // Verify execution view
    await expect(page.locator('text=Running')).toBeVisible()

    // Check tasks appear
    await expect(page.locator('[data-testid="task-list"]')).toBeVisible()
  })

  test('file editing workflow', async ({ page }) => {
    await page.goto('/')

    // Navigate to files panel
    await page.click('[data-testid="files-panel-btn"]')

    // Open a file
    await page.click('text=package.json')

    // Verify editor opens
    await expect(page.locator('[data-testid="code-editor"]')).toBeVisible()

    // Make a change
    await page.keyboard.type('// test')

    // Verify dirty state
    await expect(page.locator('[data-testid="save-indicator"]')).toContainText('Modified')

    // Save
    await page.keyboard.press('Meta+s')

    // Verify saved
    await expect(page.locator('[data-testid="save-indicator"]')).toContainText('Saved')
  })
})
```

---

## Testing

### Unit Tests

```
tests/components/ErrorBoundary.test.tsx          10+ tests
tests/components/ui/Skeleton.test.tsx            5+ tests
tests/hooks/useFocusTrap.test.ts                 5+ tests
tests/hooks/useBreakpoint.test.ts                5+ tests
tests/lib/config.test.ts                         5+ tests
```

### E2E Tests

```
tests/e2e/mission-workflow.test.ts              10+ tests
├── Create mission
├── Approve plan
├── View execution
├── Pause/resume mission
├── Complete mission

tests/e2e/file-editing.test.ts                  10+ tests
├── Open file from tree
├── Edit and save file
├── View file diff
├── Create new file
├── Delete file

tests/e2e/git-operations.test.ts                10+ tests
├── Stage file
├── Commit changes
├── Switch branch
├── View diff
├── Push/pull

tests/e2e/process-management.test.ts            10+ tests
├── Run command
├── Start service
├── View terminal output
├── Stop service
├── Interactive input

tests/e2e/accessibility.test.ts                  5+ tests
├── Keyboard navigation
├── Screen reader compatibility
├── Focus management
├── Skip links work
├── Color contrast
```

---

## Validation Criteria

- [ ] Error boundaries catch and display errors gracefully
- [ ] Loading states show appropriate skeletons
- [ ] All interactive elements keyboard accessible
- [ ] ARIA labels on icons and controls
- [ ] Skip link works
- [ ] Focus trapped in modals
- [ ] Code splitting reduces initial bundle
- [ ] Virtual lists handle large datasets
- [ ] Responsive layout works on mobile/tablet
- [ ] Production build optimized
- [ ] All 75+ E2E tests pass
- [ ] Lighthouse accessibility score > 90
- [ ] Lighthouse performance score > 80

**Deliverable**: Production-ready WebUI with excellent UX and performance
