# Phase 14: WebUI Shell ✅ COMPLETE

**Goal**: Implement the application shell with tabs, sidebar panels, and layout

**Status**: Complete (January 2025)

## Overview

This phase built the core UI shell:
- Tab system for navigating projects, missions, files
- Sidebar with panel switching
- Resizable bottom panel
- Keyboard shortcuts
- Command palette (Cmd+K)
- localStorage persistence for tabs and selected project

## What Was Implemented

### Core Components
- `TabBar.tsx` - Tab display with close buttons and dirty indicators
- `Sidebar.tsx` - Collapsible sidebar with panel switching (Navigator, Files, Git, Run)
- `BottomPanel.tsx` - Resizable bottom panel with tabs (Output, Problems, Services)
- `ProjectSelector.tsx` - Project selection dropdown in sidebar

### Contexts
- `tabs.tsx` - Tab state management with localStorage persistence
- `ui.tsx` - UI state (sidebar collapsed, panel selection, bottom panel visibility)

### Command System
- `commands/registry.ts` - Command registry singleton
- `commands/context.tsx` - Command context provider
- `commands/definitions/` - View, tab, and navigation commands
- `CommandPalette.tsx` - VS Code-style command palette (Cmd+K)

### Keyboard Shortcuts
- Cmd+B: Toggle sidebar
- Cmd+J: Toggle bottom panel
- Cmd+W: Close current tab
- Cmd+1-4: Switch sidebar panels
- Cmd+K: Open command palette

### Tests
- 66 frontend tests passing
- TabBar, Sidebar, BottomPanel, ProjectSelector tests

---

## Backend

No backend changes required for this phase.

---

## Frontend

### Tab System

#### Tab Types

```typescript
// src/types/tabs.ts
export type TabType =
  | 'project'
  | 'mission'
  | 'file'
  | 'process'
  | 'diff'
  | 'settings'

export interface Tab {
  id: string
  type: TabType
  label: string
  icon?: string
  data: TabData
  dirty?: boolean  // Has unsaved changes
}

export type TabData =
  | { type: 'project'; projectId: string }
  | { type: 'mission'; missionId: string; projectId: string }
  | { type: 'file'; path: string; projectId: string }
  | { type: 'process'; processId: string; projectId: string }
  | { type: 'diff'; path: string; projectId: string; base?: string }
  | { type: 'settings' }
```

#### Tab Context

```tsx
// src/contexts/tabs.tsx
import { createContext, useContext, useState, useCallback, ReactNode } from 'react'
import type { Tab, TabData } from '@/types/tabs'

interface TabsContextValue {
  tabs: Tab[]
  activeTabId: string | null

  openTab: (data: TabData) => void
  closeTab: (id: string) => void
  setActiveTab: (id: string) => void
  closeOtherTabs: (id: string) => void
  closeAllTabs: () => void
  closeTabsToRight: (id: string) => void
  reorderTabs: (fromIndex: number, toIndex: number) => void
  markDirty: (id: string, dirty: boolean) => void
}

const TabsContext = createContext<TabsContextValue | null>(null)

function generateTabId(data: TabData): string {
  switch (data.type) {
    case 'project':
      return `project:${data.projectId}`
    case 'mission':
      return `mission:${data.missionId}`
    case 'file':
      return `file:${data.projectId}:${data.path}`
    case 'process':
      return `process:${data.processId}`
    case 'diff':
      return `diff:${data.projectId}:${data.path}:${data.base || 'working'}`
    case 'settings':
      return 'settings'
  }
}

function generateTabLabel(data: TabData): string {
  switch (data.type) {
    case 'project':
      return 'Project'  // Will be enriched with actual name
    case 'mission':
      return 'Mission'  // Will be enriched
    case 'file':
      return data.path.split('/').pop() || 'File'
    case 'process':
      return 'Process'
    case 'diff':
      return `Diff: ${data.path.split('/').pop()}`
    case 'settings':
      return 'Settings'
  }
}

export function TabsProvider({ children }: { children: ReactNode }) {
  const [tabs, setTabs] = useState<Tab[]>([])
  const [activeTabId, setActiveTabId] = useState<string | null>(null)

  const openTab = useCallback((data: TabData) => {
    const id = generateTabId(data)

    setTabs(prev => {
      // Check if tab already exists
      if (prev.find(t => t.id === id)) {
        return prev
      }
      return [...prev, {
        id,
        type: data.type,
        label: generateTabLabel(data),
        data,
      }]
    })
    setActiveTabId(id)
  }, [])

  const closeTab = useCallback((id: string) => {
    setTabs(prev => {
      const index = prev.findIndex(t => t.id === id)
      const newTabs = prev.filter(t => t.id !== id)

      // Update active tab if closing active
      if (id === activeTabId && newTabs.length > 0) {
        const newIndex = Math.min(index, newTabs.length - 1)
        setActiveTabId(newTabs[newIndex].id)
      } else if (newTabs.length === 0) {
        setActiveTabId(null)
      }

      return newTabs
    })
  }, [activeTabId])

  const closeOtherTabs = useCallback((id: string) => {
    setTabs(prev => prev.filter(t => t.id === id))
    setActiveTabId(id)
  }, [])

  const closeAllTabs = useCallback(() => {
    setTabs([])
    setActiveTabId(null)
  }, [])

  const closeTabsToRight = useCallback((id: string) => {
    setTabs(prev => {
      const index = prev.findIndex(t => t.id === id)
      return prev.slice(0, index + 1)
    })
  }, [])

  const reorderTabs = useCallback((fromIndex: number, toIndex: number) => {
    setTabs(prev => {
      const newTabs = [...prev]
      const [removed] = newTabs.splice(fromIndex, 1)
      newTabs.splice(toIndex, 0, removed)
      return newTabs
    })
  }, [])

  const markDirty = useCallback((id: string, dirty: boolean) => {
    setTabs(prev => prev.map(t =>
      t.id === id ? { ...t, dirty } : t
    ))
  }, [])

  return (
    <TabsContext.Provider value={{
      tabs,
      activeTabId,
      openTab,
      closeTab,
      setActiveTab: setActiveTabId,
      closeOtherTabs,
      closeAllTabs,
      closeTabsToRight,
      reorderTabs,
      markDirty,
    }}>
      {children}
    </TabsContext.Provider>
  )
}

export function useTabs() {
  const context = useContext(TabsContext)
  if (!context) {
    throw new Error('useTabs must be used within TabsProvider')
  }
  return context
}
```

### Tab Bar Component

```tsx
// src/components/layout/TabBar.tsx
import { useTabs } from '@/contexts/tabs'
import { X, Circle } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

const TAB_ICONS: Record<string, string> = {
  project: 'folder',
  mission: 'target',
  file: 'file',
  process: 'terminal',
  diff: 'git-compare',
  settings: 'settings',
}

export function TabBar() {
  const { tabs, activeTabId, setActiveTab, closeTab } = useTabs()

  return (
    <div className="h-9 bg-bg-secondary border-b border-border flex items-center overflow-x-auto">
      {tabs.map((tab) => (
        <div
          key={tab.id}
          onClick={() => setActiveTab(tab.id)}
          className={cn(
            'h-full px-3 flex items-center gap-2 border-r border-border cursor-pointer',
            'hover:bg-bg-elevated transition-colors min-w-0 max-w-48',
            tab.id === activeTabId
              ? 'bg-bg-primary text-text-primary'
              : 'text-text-secondary'
          )}
        >
          {/* Icon */}
          <span className="text-xs opacity-60">
            {tab.type === 'file' ? getFileIcon(tab.label) : TAB_ICONS[tab.type]}
          </span>

          {/* Label */}
          <span className="truncate text-sm">{tab.label}</span>

          {/* Dirty indicator or close button */}
          {tab.dirty ? (
            <Circle className="w-2 h-2 fill-current shrink-0" />
          ) : (
            <button
              onClick={(e) => {
                e.stopPropagation()
                closeTab(tab.id)
              }}
              className="opacity-0 group-hover:opacity-100 hover:bg-bg-elevated rounded p-0.5"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      ))}

      {/* Empty space for new tab button or drag target */}
      <div className="flex-1 min-w-8" />
    </div>
  )
}

function getFileIcon(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase()
  const iconMap: Record<string, string> = {
    ts: 'typescript',
    tsx: 'react',
    js: 'javascript',
    jsx: 'react',
    json: 'json',
    md: 'markdown',
    css: 'css',
    html: 'html',
  }
  return iconMap[ext || ''] || 'file'
}
```

### Sidebar

```tsx
// src/components/layout/Sidebar.tsx
import { useUI } from '@/contexts/ui'
import { cn } from '@/lib/utils/cn'
import { FolderTree, Files, GitBranch, Play } from 'lucide-react'

const PANELS = [
  { id: 'nav', icon: FolderTree, label: 'Navigator' },
  { id: 'files', icon: Files, label: 'Files' },
  { id: 'git', icon: GitBranch, label: 'Git' },
  { id: 'run', icon: Play, label: 'Run' },
] as const

export function Sidebar() {
  const { sidebarCollapsed, sidebarPanel, setSidebarPanel, toggleSidebar } = useUI()

  if (sidebarCollapsed) {
    return (
      <div className="w-12 bg-bg-secondary border-r border-border flex flex-col">
        {PANELS.map((panel) => (
          <button
            key={panel.id}
            onClick={() => {
              setSidebarPanel(panel.id)
              toggleSidebar()
            }}
            className={cn(
              'w-12 h-12 flex items-center justify-center',
              'hover:bg-bg-elevated transition-colors',
              sidebarPanel === panel.id
                ? 'text-accent-primary border-l-2 border-accent-primary'
                : 'text-text-secondary'
            )}
            title={panel.label}
          >
            <panel.icon className="w-5 h-5" />
          </button>
        ))}
      </div>
    )
  }

  return (
    <div className="w-60 bg-bg-secondary border-r border-border flex">
      {/* Icon strip */}
      <div className="w-12 border-r border-border flex flex-col">
        {PANELS.map((panel) => (
          <button
            key={panel.id}
            onClick={() => setSidebarPanel(panel.id)}
            className={cn(
              'w-12 h-12 flex items-center justify-center',
              'hover:bg-bg-elevated transition-colors',
              sidebarPanel === panel.id
                ? 'text-accent-primary border-l-2 border-accent-primary'
                : 'text-text-secondary'
            )}
            title={panel.label}
          >
            <panel.icon className="w-5 h-5" />
          </button>
        ))}
      </div>

      {/* Panel content */}
      <div className="flex-1 overflow-hidden">
        <SidebarPanel panel={sidebarPanel} />
      </div>
    </div>
  )
}

function SidebarPanel({ panel }: { panel: string }) {
  switch (panel) {
    case 'nav':
      return <NavigatorPanel />
    case 'files':
      return <FilesPanel />
    case 'git':
      return <GitPanel />
    case 'run':
      return <RunPanel />
    default:
      return null
  }
}

// Placeholder panels - implemented in later phases
function NavigatorPanel() {
  return (
    <div className="p-2">
      <div className="text-xs font-medium text-text-secondary uppercase tracking-wide mb-2">
        Projects & Missions
      </div>
      {/* Phase 16: Mission list */}
    </div>
  )
}

function FilesPanel() {
  return (
    <div className="p-2">
      <div className="text-xs font-medium text-text-secondary uppercase tracking-wide mb-2">
        Files
      </div>
      {/* Phase 15: File tree */}
    </div>
  )
}

function GitPanel() {
  return (
    <div className="p-2">
      <div className="text-xs font-medium text-text-secondary uppercase tracking-wide mb-2">
        Source Control
      </div>
      {/* Phase 18: Git status */}
    </div>
  )
}

function RunPanel() {
  return (
    <div className="p-2">
      <div className="text-xs font-medium text-text-secondary uppercase tracking-wide mb-2">
        Commands & Services
      </div>
      {/* Phase 17: Process list */}
    </div>
  )
}
```

### Bottom Panel

```tsx
// src/components/layout/BottomPanel.tsx
import { useUI } from '@/contexts/ui'
import { cn } from '@/lib/utils/cn'
import { Terminal, AlertCircle, Radio, ChevronDown, ChevronUp } from 'lucide-react'
import { useState, useCallback } from 'react'

const TABS = [
  { id: 'output', icon: Terminal, label: 'Output' },
  { id: 'problems', icon: AlertCircle, label: 'Problems' },
  { id: 'services', icon: Radio, label: 'Services' },
] as const

export function BottomPanel() {
  const { bottomPanelVisible, bottomPanelTab, setBottomPanelTab, toggleBottomPanel } = useUI()
  const [height, setHeight] = useState(200)

  const handleResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const startY = e.clientY
    const startHeight = height

    const handleMouseMove = (e: MouseEvent) => {
      const delta = startY - e.clientY
      setHeight(Math.max(100, Math.min(500, startHeight + delta)))
    }

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }, [height])

  if (!bottomPanelVisible) {
    return (
      <div className="h-8 bg-bg-secondary border-t border-border flex items-center justify-between px-2">
        <div className="flex gap-2">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setBottomPanelTab(tab.id)
                toggleBottomPanel()
              }}
              className="text-xs text-text-secondary hover:text-text-primary flex items-center gap-1"
            >
              <tab.icon className="w-3 h-3" />
              {tab.label}
            </button>
          ))}
        </div>
        <button
          onClick={toggleBottomPanel}
          className="text-text-secondary hover:text-text-primary"
        >
          <ChevronUp className="w-4 h-4" />
        </button>
      </div>
    )
  }

  return (
    <div
      className="bg-bg-secondary border-t border-border flex flex-col"
      style={{ height }}
    >
      {/* Resize handle */}
      <div
        className="h-1 cursor-ns-resize hover:bg-accent-primary transition-colors"
        onMouseDown={handleResize}
      />

      {/* Tab bar */}
      <div className="h-8 border-b border-border flex items-center justify-between px-2">
        <div className="flex gap-1">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setBottomPanelTab(tab.id)}
              className={cn(
                'px-2 py-1 text-xs rounded flex items-center gap-1',
                bottomPanelTab === tab.id
                  ? 'bg-bg-elevated text-text-primary'
                  : 'text-text-secondary hover:text-text-primary'
              )}
            >
              <tab.icon className="w-3 h-3" />
              {tab.label}
            </button>
          ))}
        </div>
        <button
          onClick={toggleBottomPanel}
          className="text-text-secondary hover:text-text-primary"
        >
          <ChevronDown className="w-4 h-4" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        <BottomPanelContent tab={bottomPanelTab} />
      </div>
    </div>
  )
}

function BottomPanelContent({ tab }: { tab: string }) {
  switch (tab) {
    case 'output':
      return <OutputPanel />
    case 'problems':
      return <ProblemsPanel />
    case 'services':
      return <ServicesPanel />
    default:
      return null
  }
}

// Placeholder panels
function OutputPanel() {
  return (
    <div className="p-2 font-mono text-sm text-text-secondary">
      {/* Phase 17: Command output */}
      Output will appear here...
    </div>
  )
}

function ProblemsPanel() {
  return (
    <div className="p-2 text-sm text-text-secondary">
      No problems detected
    </div>
  )
}

function ServicesPanel() {
  return (
    <div className="p-2 text-sm text-text-secondary">
      {/* Phase 17: Service list */}
      No services running
    </div>
  )
}
```

### Updated Root Layout

```tsx
// src/routes/__root.tsx
import { createRootRoute, Outlet } from '@tanstack/react-router'
import { useUI } from '@/contexts/ui'
import { TabBar } from '@/components/layout/TabBar'
import { Sidebar } from '@/components/layout/Sidebar'
import { BottomPanel } from '@/components/layout/BottomPanel'

export const Route = createRootRoute({
  component: RootLayout,
})

function RootLayout() {
  const { theme } = useUI()

  return (
    <div className={`h-screen flex flex-col ${theme} bg-bg-primary`}>
      <TabBar />

      <div className="flex-1 flex overflow-hidden">
        <Sidebar />

        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>

      <BottomPanel />
    </div>
  )
}
```

### Keyboard Shortcuts

```tsx
// src/hooks/useKeyboardShortcuts.ts
import { useEffect } from 'react'
import { useTabs } from '@/contexts/tabs'
import { useUI } from '@/contexts/ui'

export function useKeyboardShortcuts() {
  const { tabs, activeTabId, setActiveTab, closeTab } = useTabs()
  const { toggleSidebar, setSidebarPanel, toggleBottomPanel } = useUI()

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey

      // Cmd+1-4: Switch sidebar panels
      if (isMod && e.key >= '1' && e.key <= '4') {
        e.preventDefault()
        const panels = ['nav', 'files', 'git', 'run'] as const
        setSidebarPanel(panels[parseInt(e.key) - 1])
        return
      }

      // Cmd+B: Toggle sidebar
      if (isMod && e.key === 'b') {
        e.preventDefault()
        toggleSidebar()
        return
      }

      // Cmd+J: Toggle bottom panel
      if (isMod && e.key === 'j') {
        e.preventDefault()
        toggleBottomPanel()
        return
      }

      // Cmd+W: Close current tab
      if (isMod && e.key === 'w') {
        e.preventDefault()
        if (activeTabId) {
          closeTab(activeTabId)
        }
        return
      }

      // Cmd+Shift+[ and ]: Navigate tabs
      if (isMod && e.shiftKey && (e.key === '[' || e.key === ']')) {
        e.preventDefault()
        const currentIndex = tabs.findIndex(t => t.id === activeTabId)
        if (currentIndex !== -1) {
          const newIndex = e.key === '['
            ? Math.max(0, currentIndex - 1)
            : Math.min(tabs.length - 1, currentIndex + 1)
          setActiveTab(tabs[newIndex].id)
        }
        return
      }

      // Cmd+Tab number: Jump to tab
      if (isMod && e.key >= '1' && e.key <= '9' && !e.shiftKey) {
        e.preventDefault()
        const index = parseInt(e.key) - 1
        if (tabs[index]) {
          setActiveTab(tabs[index].id)
        }
        return
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [tabs, activeTabId, setActiveTab, closeTab, toggleSidebar, setSidebarPanel, toggleBottomPanel])
}
```

### Update App with TabsProvider

```tsx
// src/App.tsx (updated)
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { WebSocketProvider } from './lib/websocket/context'
import { UIProvider } from './contexts/ui'
import { TabsProvider } from './contexts/tabs'
import { routeTree } from './routeTree.gen'

// ... queryClient and router setup

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <WebSocketProvider>
        <UIProvider>
          <TabsProvider>
            <RouterProvider router={router} />
          </TabsProvider>
        </UIProvider>
      </WebSocketProvider>
    </QueryClientProvider>
  )
}
```

---

## Testing

### Unit Tests

```
tests/components/layout/TabBar.test.tsx       15+ tests
├── renders tabs correctly
├── clicking tab activates it
├── close button closes tab
├── dirty indicator shown when dirty
├── context menu works
└── tab reordering works

tests/components/layout/Sidebar.test.tsx      10+ tests
├── renders all panel buttons
├── clicking panel switches content
├── collapsed state shows icons only
├── toggle expands/collapses
└── active panel highlighted

tests/components/layout/BottomPanel.test.tsx  10+ tests
├── renders all tabs
├── clicking tab switches content
├── resize handle works
├── toggle shows/hides panel
└── minimized state shows status bar

tests/contexts/tabs.test.tsx                  20+ tests
├── openTab adds new tab
├── openTab reuses existing tab with same id
├── closeTab removes tab
├── closeTab updates activeTab correctly
├── closeOtherTabs works
├── closeAllTabs works
├── closeTabsToRight works
├── reorderTabs works
└── markDirty works

tests/hooks/useKeyboardShortcuts.test.tsx     15+ tests
├── Cmd+1-4 switches sidebar panels
├── Cmd+B toggles sidebar
├── Cmd+J toggles bottom panel
├── Cmd+W closes current tab
├── Cmd+Shift+[/] navigates tabs
└── Cmd+number jumps to tab
```

---

## Validation Criteria

- [ ] Tab bar renders with all tab types
- [ ] Clicking tabs switches active tab
- [ ] Close button removes tab
- [ ] Dirty indicator shows for unsaved changes
- [ ] Sidebar panel switching works
- [ ] Sidebar collapse/expand works
- [ ] Bottom panel resize works
- [ ] Bottom panel tab switching works
- [ ] All keyboard shortcuts work
- [ ] Layout is responsive
- [ ] All 70+ tests pass

**Deliverable**: Complete application shell with tabs, sidebar, and bottom panel
