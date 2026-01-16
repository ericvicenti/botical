# Phase 18: Git UI

**Goal**: Implement the Git panel with status, staging, commits, and diff viewer

## Overview

This phase adds:
- Git panel showing working tree status
- File staging/unstaging
- Commit creation
- Branch management
- Diff viewer

---

## Backend

No new backend changes required - uses APIs from Phase 12 (Git Integration).

---

## Frontend

### Git Panel (Sidebar)

```tsx
// src/components/panels/GitPanel.tsx
import { useState } from 'react'
import { useGitStatus, useGitBranches, useGitStage, useGitUnstage, useGitCommit, useGitPush, useGitPull } from '@/lib/api/queries'
import { useTabs } from '@/contexts/tabs'
import { cn } from '@/lib/utils/cn'
import {
  GitBranch,
  Check,
  Plus,
  Minus,
  FileText,
  RefreshCw,
  Upload,
  Download,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'

interface GitPanelProps {
  projectId: string
}

export function GitPanel({ projectId }: GitPanelProps) {
  const { data: status, isLoading, refetch } = useGitStatus(projectId)
  const { data: branches } = useGitBranches(projectId)
  const [commitMessage, setCommitMessage] = useState('')
  const [stagedExpanded, setStagedExpanded] = useState(true)
  const [unstagedExpanded, setUnstagedExpanded] = useState(true)
  const [untrackedExpanded, setUntrackedExpanded] = useState(true)

  const stageAll = useGitStage()
  const unstageAll = useGitUnstage()
  const commit = useGitCommit()
  const push = useGitPush()
  const pull = useGitPull()

  if (!projectId) {
    return (
      <div className="p-4 text-sm text-text-muted">
        Select a project to view Git status
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="p-4 text-sm text-text-muted">
        Loading Git status...
      </div>
    )
  }

  if (!status) {
    return (
      <div className="p-4 text-sm text-accent-error">
        Not a Git repository
      </div>
    )
  }

  const handleStageAll = () => {
    const paths = [
      ...status.unstaged.map(f => f.path),
      ...status.untracked,
    ]
    stageAll.mutate({ projectId, paths })
  }

  const handleUnstageAll = () => {
    const paths = status.staged.map(f => f.path)
    unstageAll.mutate({ projectId, paths })
  }

  const handleCommit = async () => {
    if (!commitMessage.trim()) return
    try {
      await commit.mutateAsync({ projectId, message: commitMessage })
      setCommitMessage('')
    } catch (err) {
      console.error('Commit failed:', err)
    }
  }

  const hasChanges = status.staged.length > 0 ||
    status.unstaged.length > 0 ||
    status.untracked.length > 0

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-2 py-1 flex items-center justify-between border-b border-border">
        <span className="text-xs font-medium text-text-secondary uppercase tracking-wide">
          Source Control
        </span>
        <button
          onClick={() => refetch()}
          className="p-1 hover:bg-bg-elevated rounded text-text-muted hover:text-text-primary"
          title="Refresh"
        >
          <RefreshCw className="w-3 h-3" />
        </button>
      </div>

      {/* Branch info */}
      <div className="px-2 py-2 border-b border-border">
        <div className="flex items-center gap-2">
          <GitBranch className="w-4 h-4 text-accent-primary" />
          <span className="text-sm text-text-primary">{status.branch}</span>
          {(status.ahead > 0 || status.behind > 0) && (
            <span className="text-xs text-text-muted">
              {status.ahead > 0 && `↑${status.ahead}`}
              {status.behind > 0 && `↓${status.behind}`}
            </span>
          )}
        </div>

        {/* Push/Pull buttons */}
        <div className="flex gap-1 mt-2">
          <button
            onClick={() => pull.mutate({ projectId })}
            disabled={pull.isPending || status.behind === 0}
            className={cn(
              'flex-1 px-2 py-1 rounded text-xs flex items-center justify-center gap-1',
              'bg-bg-elevated hover:bg-bg-primary border border-border',
              'disabled:opacity-50'
            )}
          >
            <Download className="w-3 h-3" />
            Pull
          </button>
          <button
            onClick={() => push.mutate({ projectId })}
            disabled={push.isPending || status.ahead === 0}
            className={cn(
              'flex-1 px-2 py-1 rounded text-xs flex items-center justify-center gap-1',
              'bg-bg-elevated hover:bg-bg-primary border border-border',
              'disabled:opacity-50'
            )}
          >
            <Upload className="w-3 h-3" />
            Push
          </button>
        </div>
      </div>

      {/* Changes */}
      <div className="flex-1 overflow-auto">
        {/* Staged changes */}
        {status.staged.length > 0 && (
          <ChangeSection
            title="Staged Changes"
            count={status.staged.length}
            expanded={stagedExpanded}
            onToggle={() => setStagedExpanded(!stagedExpanded)}
            action={{
              label: 'Unstage All',
              icon: Minus,
              onClick: handleUnstageAll,
            }}
          >
            {status.staged.map((file) => (
              <FileChange
                key={file.path}
                file={file}
                projectId={projectId}
                staged
              />
            ))}
          </ChangeSection>
        )}

        {/* Unstaged changes */}
        {status.unstaged.length > 0 && (
          <ChangeSection
            title="Changes"
            count={status.unstaged.length}
            expanded={unstagedExpanded}
            onToggle={() => setUnstagedExpanded(!unstagedExpanded)}
            action={{
              label: 'Stage All',
              icon: Plus,
              onClick: handleStageAll,
            }}
          >
            {status.unstaged.map((file) => (
              <FileChange
                key={file.path}
                file={file}
                projectId={projectId}
              />
            ))}
          </ChangeSection>
        )}

        {/* Untracked files */}
        {status.untracked.length > 0 && (
          <ChangeSection
            title="Untracked"
            count={status.untracked.length}
            expanded={untrackedExpanded}
            onToggle={() => setUntrackedExpanded(!untrackedExpanded)}
          >
            {status.untracked.map((path) => (
              <FileChange
                key={path}
                file={{ path, status: '?' }}
                projectId={projectId}
              />
            ))}
          </ChangeSection>
        )}

        {!hasChanges && (
          <div className="p-4 text-sm text-text-muted text-center">
            No changes
          </div>
        )}
      </div>

      {/* Commit input */}
      {status.staged.length > 0 && (
        <div className="p-2 border-t border-border">
          <textarea
            value={commitMessage}
            onChange={(e) => setCommitMessage(e.target.value)}
            placeholder="Commit message"
            rows={3}
            className={cn(
              'w-full px-2 py-1 rounded text-sm resize-none',
              'bg-bg-elevated border border-border',
              'text-text-primary placeholder:text-text-muted',
              'focus:outline-none focus:border-accent-primary'
            )}
          />
          <button
            onClick={handleCommit}
            disabled={!commitMessage.trim() || commit.isPending}
            className={cn(
              'w-full mt-2 px-2 py-1.5 rounded text-sm',
              'bg-accent-primary text-bg-primary',
              'hover:opacity-90 disabled:opacity-50'
            )}
          >
            <Check className="w-3 h-3 inline mr-1" />
            Commit {status.staged.length} file{status.staged.length !== 1 ? 's' : ''}
          </button>
        </div>
      )}
    </div>
  )
}

interface ChangeSectionProps {
  title: string
  count: number
  expanded: boolean
  onToggle: () => void
  action?: {
    label: string
    icon: typeof Plus
    onClick: () => void
  }
  children: React.ReactNode
}

function ChangeSection({
  title,
  count,
  expanded,
  onToggle,
  action,
  children,
}: ChangeSectionProps) {
  return (
    <div className="border-b border-border">
      <div
        onClick={onToggle}
        className="px-2 py-1 flex items-center justify-between cursor-pointer hover:bg-bg-elevated"
      >
        <div className="flex items-center gap-1">
          {expanded ? (
            <ChevronDown className="w-3 h-3 text-text-muted" />
          ) : (
            <ChevronRight className="w-3 h-3 text-text-muted" />
          )}
          <span className="text-xs font-medium text-text-secondary">
            {title}
          </span>
          <span className="text-xs text-text-muted">({count})</span>
        </div>
        {action && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              action.onClick()
            }}
            className="p-1 hover:bg-bg-primary rounded text-text-muted hover:text-text-primary"
            title={action.label}
          >
            <action.icon className="w-3 h-3" />
          </button>
        )}
      </div>
      {expanded && children}
    </div>
  )
}

interface FileChangeProps {
  file: { path: string; status: string; oldPath?: string }
  projectId: string
  staged?: boolean
}

function FileChange({ file, projectId, staged }: FileChangeProps) {
  const { openTab } = useTabs()
  const stage = useGitStage()
  const unstage = useGitUnstage()

  const statusColors: Record<string, string> = {
    M: 'text-accent-warning',
    A: 'text-accent-success',
    D: 'text-accent-error',
    R: 'text-accent-primary',
    '?': 'text-text-muted',
  }

  const statusLabels: Record<string, string> = {
    M: 'Modified',
    A: 'Added',
    D: 'Deleted',
    R: 'Renamed',
    '?': 'Untracked',
  }

  const filename = file.path.split('/').pop() || file.path
  const directory = file.path.includes('/')
    ? file.path.slice(0, file.path.lastIndexOf('/'))
    : ''

  const handleClick = () => {
    if (file.status === 'D') return // Can't view deleted files

    openTab({
      type: 'diff',
      projectId,
      path: file.path,
      base: staged ? 'staged' : 'working',
    })
  }

  const handleStage = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (staged) {
      unstage.mutate({ projectId, paths: [file.path] })
    } else {
      stage.mutate({ projectId, paths: [file.path] })
    }
  }

  return (
    <div
      onClick={handleClick}
      className={cn(
        'px-2 py-0.5 flex items-center gap-2 cursor-pointer',
        'hover:bg-bg-elevated group'
      )}
    >
      <span className={cn('text-xs font-mono w-4', statusColors[file.status])}>
        {file.status}
      </span>
      <FileText className="w-3 h-3 text-text-muted shrink-0" />
      <div className="flex-1 min-w-0 flex items-baseline gap-1">
        <span className="text-sm text-text-primary truncate">{filename}</span>
        {directory && (
          <span className="text-xs text-text-muted truncate">{directory}</span>
        )}
      </div>
      <button
        onClick={handleStage}
        className="opacity-0 group-hover:opacity-100 p-1 hover:bg-bg-primary rounded text-text-muted"
        title={staged ? 'Unstage' : 'Stage'}
      >
        {staged ? <Minus className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
      </button>
    </div>
  )
}
```

### Diff Viewer

```tsx
// src/components/git/DiffViewer.tsx
import { useGitDiff } from '@/lib/api/queries'
import { cn } from '@/lib/utils/cn'

interface DiffViewerProps {
  projectId: string
  path: string
  base?: string
}

export function DiffViewer({ projectId, path, base }: DiffViewerProps) {
  const { data: diff, isLoading, error } = useGitDiff(projectId, {
    file: path,
    staged: base === 'staged',
  })

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center text-text-secondary">
        Loading diff...
      </div>
    )
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center text-accent-error">
        Error loading diff
      </div>
    )
  }

  if (!diff) {
    return (
      <div className="h-full flex items-center justify-center text-text-muted">
        No changes
      </div>
    )
  }

  const lines = parseDiff(diff)

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="h-10 px-4 flex items-center border-b border-border bg-bg-secondary">
        <span className="text-sm font-medium text-text-primary">{path}</span>
        <span className="ml-2 text-xs text-text-muted">
          {base === 'staged' ? '(staged)' : '(working tree)'}
        </span>
      </div>

      {/* Diff content */}
      <div className="flex-1 overflow-auto font-mono text-sm">
        {lines.map((line, i) => (
          <DiffLine key={i} line={line} />
        ))}
      </div>
    </div>
  )
}

interface DiffLineData {
  type: 'header' | 'context' | 'add' | 'remove' | 'hunk'
  content: string
  oldNum?: number
  newNum?: number
}

function parseDiff(diff: string): DiffLineData[] {
  const lines = diff.split('\n')
  const result: DiffLineData[] = []
  let oldNum = 0
  let newNum = 0

  for (const line of lines) {
    if (line.startsWith('diff ') || line.startsWith('index ') ||
        line.startsWith('--- ') || line.startsWith('+++ ')) {
      result.push({ type: 'header', content: line })
    } else if (line.startsWith('@@')) {
      // Parse hunk header
      const match = line.match(/@@ -(\d+),?\d* \+(\d+),?\d* @@/)
      if (match) {
        oldNum = parseInt(match[1])
        newNum = parseInt(match[2])
      }
      result.push({ type: 'hunk', content: line })
    } else if (line.startsWith('+')) {
      result.push({ type: 'add', content: line.slice(1), newNum: newNum++ })
    } else if (line.startsWith('-')) {
      result.push({ type: 'remove', content: line.slice(1), oldNum: oldNum++ })
    } else if (line.startsWith(' ')) {
      result.push({
        type: 'context',
        content: line.slice(1),
        oldNum: oldNum++,
        newNum: newNum++,
      })
    } else {
      result.push({ type: 'context', content: line })
    }
  }

  return result
}

function DiffLine({ line }: { line: DiffLineData }) {
  const bgColors: Record<string, string> = {
    add: 'bg-accent-success/10',
    remove: 'bg-accent-error/10',
    hunk: 'bg-accent-primary/10',
    header: 'bg-bg-secondary',
    context: '',
  }

  const textColors: Record<string, string> = {
    add: 'text-accent-success',
    remove: 'text-accent-error',
    hunk: 'text-accent-primary',
    header: 'text-text-muted',
    context: 'text-text-primary',
  }

  return (
    <div className={cn('flex', bgColors[line.type])}>
      {/* Line numbers */}
      <div className="w-20 shrink-0 flex text-text-muted text-xs border-r border-border">
        <span className="w-10 text-right px-1">
          {line.oldNum ?? ''}
        </span>
        <span className="w-10 text-right px-1 border-l border-border">
          {line.newNum ?? ''}
        </span>
      </div>

      {/* Content */}
      <div className={cn('flex-1 px-2 whitespace-pre', textColors[line.type])}>
        {line.type === 'add' && <span className="select-none">+ </span>}
        {line.type === 'remove' && <span className="select-none">- </span>}
        {line.content}
      </div>
    </div>
  )
}
```

### Diff Tab View

```tsx
// src/components/tabs/DiffTab.tsx
import { DiffViewer } from '@/components/git/DiffViewer'

interface DiffTabProps {
  projectId: string
  path: string
  base?: string
}

export function DiffTab({ projectId, path, base }: DiffTabProps) {
  return <DiffViewer projectId={projectId} path={path} base={base} />
}
```

### Branch Selector

```tsx
// src/components/git/BranchSelector.tsx
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { useGitBranches, useGitCheckout, useGitCreateBranch } from '@/lib/api/queries'
import { cn } from '@/lib/utils/cn'
import { GitBranch, Check, Plus } from 'lucide-react'
import { useState } from 'react'

interface BranchSelectorProps {
  projectId: string
  currentBranch: string
}

export function BranchSelector({ projectId, currentBranch }: BranchSelectorProps) {
  const { data: branches } = useGitBranches(projectId)
  const checkout = useGitCheckout()
  const createBranch = useGitCreateBranch()
  const [showNew, setShowNew] = useState(false)
  const [newBranchName, setNewBranchName] = useState('')

  const handleCheckout = (branch: string) => {
    if (branch !== currentBranch) {
      checkout.mutate({ projectId, branch })
    }
  }

  const handleCreate = () => {
    if (newBranchName.trim()) {
      createBranch.mutate({
        projectId,
        name: newBranchName,
      })
      setNewBranchName('')
      setShowNew(false)
    }
  }

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button className={cn(
          'flex items-center gap-1 px-2 py-1 rounded text-sm',
          'hover:bg-bg-elevated border border-transparent hover:border-border'
        )}>
          <GitBranch className="w-4 h-4 text-accent-primary" />
          {currentBranch}
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="min-w-56 bg-bg-elevated border border-border rounded shadow-lg py-1"
        >
          <div className="px-2 py-1 text-xs text-text-muted">
            Switch branch
          </div>

          {branches?.map((branch) => (
            <DropdownMenu.Item
              key={branch.name}
              onClick={() => handleCheckout(branch.name)}
              className={cn(
                'px-3 py-1.5 text-sm cursor-pointer hover:bg-bg-primary outline-none',
                'flex items-center justify-between'
              )}
            >
              <span className="flex items-center gap-2">
                <GitBranch className="w-3 h-3 text-text-muted" />
                {branch.name}
              </span>
              {branch.current && (
                <Check className="w-3 h-3 text-accent-success" />
              )}
            </DropdownMenu.Item>
          ))}

          <DropdownMenu.Separator className="h-px bg-border my-1" />

          {showNew ? (
            <div className="px-2 py-1">
              <input
                type="text"
                value={newBranchName}
                onChange={(e) => setNewBranchName(e.target.value)}
                placeholder="Branch name"
                className={cn(
                  'w-full px-2 py-1 rounded text-sm',
                  'bg-bg-primary border border-border',
                  'text-text-primary',
                  'focus:outline-none focus:border-accent-primary'
                )}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreate()
                  if (e.key === 'Escape') setShowNew(false)
                }}
              />
            </div>
          ) : (
            <DropdownMenu.Item
              onClick={() => setShowNew(true)}
              className="px-3 py-1.5 text-sm cursor-pointer hover:bg-bg-primary outline-none flex items-center gap-2"
            >
              <Plus className="w-3 h-3" />
              Create new branch
            </DropdownMenu.Item>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
```

### Git API Queries

```typescript
// src/lib/api/queries.ts (additions)
export function useGitStatus(projectId: string) {
  return useQuery({
    queryKey: ['projects', projectId, 'git', 'status'],
    queryFn: () => apiClient<GitStatus>(`/api/projects/${projectId}/git/status`),
    enabled: !!projectId,
    refetchInterval: 5000,
  })
}

export function useGitBranches(projectId: string) {
  return useQuery({
    queryKey: ['projects', projectId, 'git', 'branches'],
    queryFn: () => apiClient<BranchInfo[]>(`/api/projects/${projectId}/git/branches`),
    enabled: !!projectId,
  })
}

export function useGitDiff(projectId: string, options?: { staged?: boolean; file?: string }) {
  return useQuery({
    queryKey: ['projects', projectId, 'git', 'diff', options],
    queryFn: () => apiClient<string>(
      `/api/projects/${projectId}/git/diff?${new URLSearchParams({
        ...(options?.staged && { staged: 'true' }),
        ...(options?.file && { file: options.file }),
      })}`
    ),
    enabled: !!projectId,
  })
}

export function useGitStage() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ projectId, paths }: { projectId: string; paths: string[] }) =>
      apiClient(`/api/projects/${projectId}/git/stage`, {
        method: 'POST',
        body: JSON.stringify({ paths }),
      }),
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({
        queryKey: ['projects', projectId, 'git', 'status'],
      })
    },
  })
}

export function useGitUnstage() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ projectId, paths }: { projectId: string; paths: string[] }) =>
      apiClient(`/api/projects/${projectId}/git/unstage`, {
        method: 'POST',
        body: JSON.stringify({ paths }),
      }),
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({
        queryKey: ['projects', projectId, 'git', 'status'],
      })
    },
  })
}

export function useGitCommit() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ projectId, message }: { projectId: string; message: string }) =>
      apiClient(`/api/projects/${projectId}/git/commit`, {
        method: 'POST',
        body: JSON.stringify({ message }),
      }),
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({
        queryKey: ['projects', projectId, 'git', 'status'],
      })
    },
  })
}

export function useGitPush() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ projectId, remote, branch }: {
      projectId: string
      remote?: string
      branch?: string
    }) => apiClient(`/api/projects/${projectId}/git/push`, {
      method: 'POST',
      body: JSON.stringify({ remote, branch }),
    }),
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({
        queryKey: ['projects', projectId, 'git', 'status'],
      })
    },
  })
}

export function useGitPull() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ projectId }: { projectId: string }) =>
      apiClient(`/api/projects/${projectId}/git/pull`, {
        method: 'POST',
      }),
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({
        queryKey: ['projects', projectId, 'git', 'status'],
      })
      queryClient.invalidateQueries({
        queryKey: ['projects', projectId, 'files'],
      })
    },
  })
}

export function useGitCheckout() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ projectId, branch }: { projectId: string; branch: string }) =>
      apiClient(`/api/projects/${projectId}/git/checkout`, {
        method: 'POST',
        body: JSON.stringify({ branch }),
      }),
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({
        queryKey: ['projects', projectId, 'git'],
      })
      queryClient.invalidateQueries({
        queryKey: ['projects', projectId, 'files'],
      })
    },
  })
}

export function useGitCreateBranch() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ projectId, name, from }: {
      projectId: string
      name: string
      from?: string
    }) => apiClient(`/api/projects/${projectId}/git/branches`, {
      method: 'POST',
      body: JSON.stringify({ name, from }),
    }),
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({
        queryKey: ['projects', projectId, 'git', 'branches'],
      })
    },
  })
}
```

---

## Testing

### Unit Tests

```
tests/components/panels/GitPanel.test.tsx            25+ tests
├── renders branch info
├── shows staged files
├── shows unstaged files
├── shows untracked files
├── stage button works
├── unstage button works
├── commit form works
├── push/pull buttons work
├── sections expand/collapse
├── file status colors correct
└── empty state handled

tests/components/git/DiffViewer.test.tsx             15+ tests
├── renders diff header
├── added lines styled
├── removed lines styled
├── context lines shown
├── line numbers correct
├── hunk headers shown
└── loading/error states

tests/components/git/BranchSelector.test.tsx         10+ tests
├── shows current branch
├── dropdown shows all branches
├── clicking branch switches
├── create new branch works
└── current branch marked
```

### Integration Tests

```
tests/integration/git-operations.test.ts
├── Stage file → appears in staged
├── Unstage file → appears in unstaged
├── Commit → clears staged
├── View diff → correct content
├── Switch branch → files update
├── Push → ahead count decreases
├── Pull → behind count decreases
└── Create branch → appears in list
```

---

## Validation Criteria

- [ ] Git panel shows working tree status
- [ ] File staging/unstaging works
- [ ] Commit with message works
- [ ] Push/pull buttons work
- [ ] Branch selector shows all branches
- [ ] Branch switching works
- [ ] Diff viewer shows changes correctly
- [ ] Status updates in real-time
- [ ] All 50+ tests pass

**Deliverable**: Complete Git integration UI
