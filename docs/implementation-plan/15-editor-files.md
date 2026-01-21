# Phase 15: Editor & Files ✅ COMPLETE

**Goal**: Implement the code editor with CodeMirror and file tree navigation

**Status**: Complete - All features implemented with 58 passing tests

## Overview

This phase adds:
- File tree panel with folder expansion
- Code editor with syntax highlighting
- File read/write operations
- Breadcrumb navigation

---

## Backend

### File Operations Already Available

The files API from Phase 6 provides:
- `GET /api/projects/:projectId/files` - List directory contents
- `GET /api/projects/:projectId/files/:path` - Read file content
- `PUT /api/projects/:projectId/files/:path` - Write file content
- `DELETE /api/projects/:projectId/files/:path` - Delete file
- `POST /api/projects/:projectId/files/:path/move` - Move/rename file

No additional backend changes needed.

---

## Frontend

### Dependencies

```bash
bun add @codemirror/state @codemirror/view @codemirror/commands
bun add @codemirror/lang-javascript @codemirror/lang-typescript
bun add @codemirror/lang-json @codemirror/lang-markdown
bun add @codemirror/lang-css @codemirror/lang-html
bun add @codemirror/theme-one-dark
bun add @lezer/highlight
```

### File Tree Types

```typescript
// src/types/files.ts
export interface FileEntry {
  name: string
  path: string
  type: 'file' | 'directory'
  size?: number
  modified?: number
}

export interface FileTreeNode extends FileEntry {
  children?: FileTreeNode[]
  expanded?: boolean
  loading?: boolean
}
```

### API Queries for Files

```typescript
// src/lib/api/queries.ts (additions)
export function useFiles(projectId: string, path: string = '') {
  return useQuery({
    queryKey: ['projects', projectId, 'files', path],
    queryFn: () => apiClient<FileEntry[]>(
      `/api/projects/${projectId}/files${path ? `?path=${encodeURIComponent(path)}` : ''}`
    ),
    enabled: !!projectId,
  })
}

export function useFileContent(projectId: string, path: string) {
  return useQuery({
    queryKey: ['projects', projectId, 'files', path, 'content'],
    queryFn: () => apiClient<{ content: string; encoding?: string }>(
      `/api/projects/${projectId}/files/${encodeURIComponent(path)}`
    ),
    enabled: !!projectId && !!path,
  })
}

export function useSaveFile() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ projectId, path, content }: {
      projectId: string
      path: string
      content: string
    }) => apiClient(`/api/projects/${projectId}/files/${encodeURIComponent(path)}`, {
      method: 'PUT',
      body: JSON.stringify({ content }),
    }),
    onSuccess: (_, { projectId, path }) => {
      queryClient.invalidateQueries({
        queryKey: ['projects', projectId, 'files', path, 'content'],
      })
    },
  })
}

export function useCreateFile() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ projectId, path, content = '' }: {
      projectId: string
      path: string
      content?: string
    }) => apiClient(`/api/projects/${projectId}/files/${encodeURIComponent(path)}`, {
      method: 'PUT',
      body: JSON.stringify({ content }),
    }),
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({
        queryKey: ['projects', projectId, 'files'],
      })
    },
  })
}

export function useDeleteFile() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ projectId, path }: { projectId: string; path: string }) =>
      apiClient(`/api/projects/${projectId}/files/${encodeURIComponent(path)}`, {
        method: 'DELETE',
      }),
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({
        queryKey: ['projects', projectId, 'files'],
      })
    },
  })
}

export function useRenameFile() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ projectId, path, newPath }: {
      projectId: string
      path: string
      newPath: string
    }) => apiClient(`/api/projects/${projectId}/files/${encodeURIComponent(path)}/move`, {
      method: 'POST',
      body: JSON.stringify({ destination: newPath }),
    }),
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({
        queryKey: ['projects', projectId, 'files'],
      })
    },
  })
}
```

### File Tree Component

```tsx
// src/components/files/FileTree.tsx
import { useState, useCallback } from 'react'
import { useFiles } from '@/lib/api/queries'
import { useTabs } from '@/contexts/tabs'
import { cn } from '@/lib/utils/cn'
import { ChevronRight, ChevronDown, File, Folder, FolderOpen } from 'lucide-react'

interface FileTreeProps {
  projectId: string
}

export function FileTree({ projectId }: FileTreeProps) {
  const { data: rootFiles, isLoading } = useFiles(projectId)

  if (isLoading) {
    return <div className="p-2 text-text-secondary text-sm">Loading...</div>
  }

  return (
    <div className="text-sm">
      {rootFiles?.map((file) => (
        <FileTreeNode
          key={file.path}
          file={file}
          projectId={projectId}
          depth={0}
        />
      ))}
    </div>
  )
}

interface FileTreeNodeProps {
  file: FileEntry
  projectId: string
  depth: number
}

function FileTreeNode({ file, projectId, depth }: FileTreeNodeProps) {
  const [expanded, setExpanded] = useState(false)
  const { data: children, isLoading } = useFiles(
    projectId,
    file.path,
    { enabled: file.type === 'directory' && expanded }
  )
  const { openTab } = useTabs()

  const handleClick = useCallback(() => {
    if (file.type === 'directory') {
      setExpanded(!expanded)
    } else {
      openTab({
        type: 'file',
        projectId,
        path: file.path,
      })
    }
  }, [file, projectId, expanded, openTab])

  return (
    <div>
      <div
        onClick={handleClick}
        className={cn(
          'flex items-center gap-1 py-0.5 px-2 cursor-pointer',
          'hover:bg-bg-elevated rounded',
          'text-text-primary'
        )}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        {file.type === 'directory' ? (
          <>
            {expanded ? (
              <ChevronDown className="w-4 h-4 text-text-muted" />
            ) : (
              <ChevronRight className="w-4 h-4 text-text-muted" />
            )}
            {expanded ? (
              <FolderOpen className="w-4 h-4 text-accent-warning" />
            ) : (
              <Folder className="w-4 h-4 text-accent-warning" />
            )}
          </>
        ) : (
          <>
            <span className="w-4" />
            <FileIcon filename={file.name} />
          </>
        )}
        <span className="truncate">{file.name}</span>
      </div>

      {file.type === 'directory' && expanded && (
        <div>
          {isLoading ? (
            <div
              className="text-text-muted text-xs py-0.5"
              style={{ paddingLeft: `${(depth + 1) * 12 + 8}px` }}
            >
              Loading...
            </div>
          ) : (
            children?.map((child) => (
              <FileTreeNode
                key={child.path}
                file={child}
                projectId={projectId}
                depth={depth + 1}
              />
            ))
          )}
        </div>
      )}
    </div>
  )
}

function FileIcon({ filename }: { filename: string }) {
  const ext = filename.split('.').pop()?.toLowerCase()

  const colorMap: Record<string, string> = {
    ts: 'text-blue-400',
    tsx: 'text-blue-400',
    js: 'text-yellow-400',
    jsx: 'text-yellow-400',
    json: 'text-yellow-300',
    md: 'text-white',
    css: 'text-pink-400',
    html: 'text-orange-400',
    py: 'text-green-400',
    go: 'text-cyan-400',
    rs: 'text-orange-500',
  }

  return (
    <File className={cn('w-4 h-4', colorMap[ext || ''] || 'text-text-muted')} />
  )
}
```

### Code Editor Component

```tsx
// src/components/files/CodeEditor.tsx
import { useEffect, useRef, useState, useCallback } from 'react'
import { EditorState, Extension } from '@codemirror/state'
import { EditorView, keymap, lineNumbers, highlightActiveLine } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { oneDark } from '@codemirror/theme-one-dark'
import { javascript } from '@codemirror/lang-javascript'
import { json } from '@codemirror/lang-json'
import { markdown } from '@codemirror/lang-markdown'
import { css } from '@codemirror/lang-css'
import { html } from '@codemirror/lang-html'
import { useFileContent, useSaveFile } from '@/lib/api/queries'
import { useTabs } from '@/contexts/tabs'

interface CodeEditorProps {
  projectId: string
  path: string
  tabId: string
}

function getLanguageExtension(filename: string): Extension {
  const ext = filename.split('.').pop()?.toLowerCase()

  switch (ext) {
    case 'ts':
    case 'tsx':
      return javascript({ typescript: true, jsx: true })
    case 'js':
    case 'jsx':
      return javascript({ jsx: true })
    case 'json':
      return json()
    case 'md':
    case 'mdx':
      return markdown()
    case 'css':
      return css()
    case 'html':
    case 'htm':
      return html()
    default:
      return []
  }
}

export function CodeEditor({ projectId, path, tabId }: CodeEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const [content, setContent] = useState<string>('')
  const [isDirty, setIsDirty] = useState(false)

  const { data: fileData, isLoading, error } = useFileContent(projectId, path)
  const saveFile = useSaveFile()
  const { markDirty } = useTabs()

  // Update dirty state in tab
  useEffect(() => {
    markDirty(tabId, isDirty)
  }, [tabId, isDirty, markDirty])

  // Initialize editor
  useEffect(() => {
    if (!containerRef.current || fileData === undefined) return

    const initialContent = fileData?.content || ''
    setContent(initialContent)

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        const newContent = update.state.doc.toString()
        setContent(newContent)
        setIsDirty(newContent !== initialContent)
      }
    })

    const state = EditorState.create({
      doc: initialContent,
      extensions: [
        lineNumbers(),
        highlightActiveLine(),
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        getLanguageExtension(path),
        oneDark,
        updateListener,
        EditorView.theme({
          '&': {
            height: '100%',
            backgroundColor: 'var(--bg-primary)',
          },
          '.cm-scroller': {
            fontFamily: 'var(--font-mono)',
          },
        }),
      ],
    })

    const view = new EditorView({
      state,
      parent: containerRef.current,
    })

    viewRef.current = view

    return () => {
      view.destroy()
      viewRef.current = null
    }
  }, [fileData, path])

  // Save handler
  const handleSave = useCallback(async () => {
    if (!isDirty) return

    try {
      await saveFile.mutateAsync({ projectId, path, content })
      setIsDirty(false)
    } catch (err) {
      console.error('Failed to save:', err)
    }
  }, [projectId, path, content, isDirty, saveFile])

  // Keyboard shortcut for save
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        handleSave()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleSave])

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center text-text-secondary">
        Loading file...
      </div>
    )
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center text-accent-error">
        Error loading file: {error.message}
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      {/* Breadcrumb */}
      <Breadcrumb path={path} projectId={projectId} />

      {/* Editor */}
      <div ref={containerRef} className="flex-1 overflow-hidden" />

      {/* Status bar */}
      <div className="h-6 px-2 flex items-center justify-between bg-bg-secondary border-t border-border text-xs text-text-secondary">
        <span>{isDirty ? 'Modified' : 'Saved'}</span>
        <span>{path.split('.').pop()?.toUpperCase()}</span>
      </div>
    </div>
  )
}

function Breadcrumb({ path, projectId }: { path: string; projectId: string }) {
  const parts = path.split('/').filter(Boolean)

  return (
    <div className="h-8 px-2 flex items-center gap-1 bg-bg-secondary border-b border-border text-sm">
      {parts.map((part, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && <span className="text-text-muted">/</span>}
          <span className={i === parts.length - 1 ? 'text-text-primary' : 'text-text-secondary'}>
            {part}
          </span>
        </span>
      ))}
    </div>
  )
}
```

### File Tab View

```tsx
// src/components/tabs/FileTab.tsx
import { CodeEditor } from '@/components/files/CodeEditor'

interface FileTabProps {
  projectId: string
  path: string
  tabId: string
}

export function FileTab({ projectId, path, tabId }: FileTabProps) {
  return (
    <div className="h-full">
      <CodeEditor projectId={projectId} path={path} tabId={tabId} />
    </div>
  )
}
```

### Updated Files Panel

```tsx
// src/components/panels/FilesPanel.tsx
import { FileTree } from '@/components/files/FileTree'
import { useTabs } from '@/contexts/tabs'
import { useProjects } from '@/lib/api/queries'
import { cn } from '@/lib/utils/cn'
import { Plus, RefreshCw } from 'lucide-react'

export function FilesPanel() {
  const { tabs, activeTabId } = useTabs()
  const activeTab = tabs.find(t => t.id === activeTabId)

  // Get current project from active tab
  const projectId = activeTab?.data && 'projectId' in activeTab.data
    ? activeTab.data.projectId
    : null

  const { data: projects } = useProjects()
  const project = projects?.find(p => p.id === projectId)

  if (!projectId || !project) {
    return (
      <div className="p-4 text-text-secondary text-sm">
        Select a project to view files
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-2 py-1 flex items-center justify-between border-b border-border">
        <span className="text-xs font-medium text-text-secondary uppercase tracking-wide">
          {project.name}
        </span>
        <div className="flex gap-1">
          <button
            className="p-1 hover:bg-bg-elevated rounded text-text-muted hover:text-text-primary"
            title="Refresh"
          >
            <RefreshCw className="w-3 h-3" />
          </button>
          <button
            className="p-1 hover:bg-bg-elevated rounded text-text-muted hover:text-text-primary"
            title="New File"
          >
            <Plus className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-auto py-1">
        <FileTree projectId={projectId} />
      </div>
    </div>
  )
}
```

### File Route

```tsx
// src/routes/files/$.tsx
import { createFileRoute } from '@tanstack/react-router'
import { FileTab } from '@/components/tabs/FileTab'

export const Route = createFileRoute('/files/$')({
  component: FileView,
})

function FileView() {
  const params = Route.useParams()
  const path = params._splat || ''
  const [projectId, ...pathParts] = path.split('/')
  const filePath = pathParts.join('/')

  return (
    <FileTab
      projectId={projectId}
      path={filePath}
      tabId={`file:${projectId}:${filePath}`}
    />
  )
}
```

### Context Menu for Files

```tsx
// src/components/files/FileContextMenu.tsx
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { useState } from 'react'
import { useDeleteFile, useRenameFile, useCreateFile } from '@/lib/api/queries'

interface FileContextMenuProps {
  children: React.ReactNode
  file: FileEntry
  projectId: string
}

export function FileContextMenu({ children, file, projectId }: FileContextMenuProps) {
  const [renaming, setRenaming] = useState(false)
  const deleteFile = useDeleteFile()
  const renameFile = useRenameFile()
  const createFile = useCreateFile()

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        {children}
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="min-w-48 bg-bg-elevated border border-border rounded shadow-lg py-1"
        >
          {file.type === 'directory' && (
            <>
              <DropdownMenu.Item
                className="px-3 py-1.5 text-sm cursor-pointer hover:bg-bg-primary outline-none"
                onClick={() => {
                  const name = prompt('New file name:')
                  if (name) {
                    createFile.mutate({
                      projectId,
                      path: `${file.path}/${name}`,
                    })
                  }
                }}
              >
                New File
              </DropdownMenu.Item>
              <DropdownMenu.Item
                className="px-3 py-1.5 text-sm cursor-pointer hover:bg-bg-primary outline-none"
                onClick={() => {
                  const name = prompt('New folder name:')
                  if (name) {
                    createFile.mutate({
                      projectId,
                      path: `${file.path}/${name}/.gitkeep`,
                    })
                  }
                }}
              >
                New Folder
              </DropdownMenu.Item>
              <DropdownMenu.Separator className="h-px bg-border my-1" />
            </>
          )}

          <DropdownMenu.Item
            className="px-3 py-1.5 text-sm cursor-pointer hover:bg-bg-primary outline-none"
            onClick={() => setRenaming(true)}
          >
            Rename
          </DropdownMenu.Item>

          <DropdownMenu.Item
            className="px-3 py-1.5 text-sm cursor-pointer hover:bg-bg-primary outline-none"
            onClick={() => navigator.clipboard.writeText(file.path)}
          >
            Copy Path
          </DropdownMenu.Item>

          <DropdownMenu.Separator className="h-px bg-border my-1" />

          <DropdownMenu.Item
            className="px-3 py-1.5 text-sm cursor-pointer hover:bg-bg-primary outline-none text-accent-error"
            onClick={() => {
              if (confirm(`Delete ${file.name}?`)) {
                deleteFile.mutate({ projectId, path: file.path })
              }
            }}
          >
            Delete
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
```

---

## Testing

### Unit Tests

```
tests/components/files/FileTree.test.tsx          20+ tests
├── renders root files
├── clicking folder expands it
├── clicking file opens tab
├── nested folders load on demand
├── loading state shown
├── empty folder handled
├── file icons match extensions
└── context menu works

tests/components/files/CodeEditor.test.tsx        25+ tests
├── renders editor with content
├── syntax highlighting applied
├── dirty state tracked on changes
├── Cmd+S saves file
├── breadcrumb shows path
├── status bar shows state
├── language detection works
├── undo/redo works
└── large files handled

tests/lib/api/files.test.ts                       15+ tests
├── useFiles fetches directory listing
├── useFileContent fetches file content
├── useSaveFile saves content
├── useCreateFile creates file
├── useDeleteFile deletes file
├── useRenameFile renames file
└── error handling works
```

### Integration Tests

```
tests/integration/file-operations.test.ts
├── Open file from tree → displays in editor
├── Edit and save file → content persisted
├── Create new file → appears in tree
├── Delete file → removed from tree
├── Rename file → updates in tree
├── Binary files → handled gracefully
└── Large files → performance acceptable
```

---

## Validation Criteria

- [x] File tree displays project files/folders
- [x] Clicking folders expands/collapses them
- [x] Clicking files opens them in editor (single-click preview, double-click permanent)
- [x] Code editor displays file content
- [x] Syntax highlighting works for supported languages (TS/TSX/JS/JSX/JSON/MD/CSS/HTML)
- [x] Cmd+S / Ctrl+S saves file
- [x] Dirty indicator shows when file modified (yellow circle in header)
- [x] Breadcrumb shows file path with clickable navigation
- [x] Context menu allows create, rename, delete
- [x] All 58 tests pass (FileTree: 21, CodeEditor: 17, FileContextMenu: 20)

**Deliverable**: Fully functional file browser and code editor ✅

---

## Implementation Status

### Completed ✓

**File Tree (`src/components/files/FileTree.tsx`)**
- [x] Hierarchical file/folder display with lazy-loading
- [x] Folder expansion/collapse on click
- [x] File opening in tabs on click
- [x] Color-coded file icons by extension
- [x] Context menu (right-click) for files and folders
- [x] Inline file/folder creation with auto-focus input
- [x] Inline rename functionality
- [x] Delete confirmation dialog
- [x] "Reveal in tree" - auto-expand to and highlight a specific file
- [x] External triggering via `FileTreeRef` (forwardRef/useImperativeHandle)

**File Context Menu (`src/components/files/FileContextMenu.tsx`)**
- [x] Context-aware menu (empty area, folder, file show different options)
- [x] New File / New Folder options for folders and empty areas
- [x] Rename / Delete options for files and folders
- [x] Click-outside-to-close behavior
- [x] CreateInput component for inline name input

**Code Editor (`src/components/files/CodeEditor.tsx`)**
- [x] CodeMirror 6 integration with syntax highlighting
- [x] Language detection by file extension
- [x] Cmd+S / Ctrl+S for save
- [x] Tab key indentation (using `indentWithTab`)
- [x] Dirty state tracking with visual indicator
- [x] Dirty content persistence across tab switches (localStorage)
- [x] Breadcrumb navigation with "reveal in tree" functionality
- [x] Shared ContentHeader component with project name display

**FilesPanel in Sidebar (`src/components/layout/Sidebar.tsx`)**
- [x] "..." dropdown menu with New File / New Folder
- [x] Integration with FileTree via ref
- [x] Click-outside-to-close behavior

**Tab Integration**
- [x] File tabs with dirty indicator (circle icon)
- [x] Confirmation before closing dirty tabs
- [x] Tab navigation navigates to correct route
- [x] Cmd+1-9 tab switching works correctly

### Tests

**FileTree Tests (21 tests)**
- File tree rendering and loading
- Folder expansion/collapse
- File opening in tabs
- Context menu display and interaction
- Inline creation via ref methods
- CreateInput keyboard handling (Escape, Enter)

**FileContextMenu Tests (20 tests)**
- Empty area context menu options
- Folder context menu options
- File context menu options
- Click-outside-to-close
- Menu positioning
- CreateInput functionality

**CodeEditor Tests (existing)**
- Loading and error states
- Keyboard shortcuts
- Language detection
- Dirty state tracking

### Key Implementation Details

**FileTreeRef Pattern**
The FileTree exposes `createFile()` and `createFolder()` methods via `forwardRef` and `useImperativeHandle`. This allows the FilesPanel dropdown to trigger file creation without duplicating state management logic.

```typescript
export interface FileTreeRef {
  createFile: () => void;
  createFolder: () => void;
}
```

**ContextMenuTarget Discriminated Union**
The context menu uses a discriminated union to type-safely determine which options to show:

```typescript
export type ContextMenuTarget =
  | { type: "empty"; parentPath: string }
  | { type: "folder"; path: string; name: string }
  | { type: "file"; path: string; name: string };
```

**Dirty Content Persistence**
Unsaved changes are stored in localStorage via the tabs context, allowing changes to persist across tab switches and browser refreshes until explicitly saved or discarded.
