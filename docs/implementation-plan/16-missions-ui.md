# Phase 16: Missions UI

**Goal**: Implement the mission planning and execution interface

## Overview

This phase builds the mission UI:
- Mission list in navigator panel
- Mission planning view with markdown editor
- Mission execution view with chat and tasks
- Mission controls (approve, pause, resume)

---

## Backend

No new backend changes required - uses APIs from Phase 10 (Missions & Tasks).

---

## Frontend

### Mission List in Navigator

```tsx
// src/components/panels/NavigatorPanel.tsx
import { useProjects, useMissions } from '@/lib/api/queries'
import { useTabs } from '@/contexts/tabs'
import { cn } from '@/lib/utils/cn'
import { Folder, Target, Plus, ChevronDown, ChevronRight } from 'lucide-react'
import { useState } from 'react'

export function NavigatorPanel() {
  const { data: projects } = useProjects()

  return (
    <div className="h-full flex flex-col">
      <div className="px-2 py-1 flex items-center justify-between border-b border-border">
        <span className="text-xs font-medium text-text-secondary uppercase tracking-wide">
          Projects
        </span>
        <button
          className="p-1 hover:bg-bg-elevated rounded text-text-muted hover:text-text-primary"
          title="New Project"
        >
          <Plus className="w-3 h-3" />
        </button>
      </div>

      <div className="flex-1 overflow-auto py-1">
        {projects?.map((project) => (
          <ProjectNode key={project.id} project={project} />
        ))}
      </div>
    </div>
  )
}

function ProjectNode({ project }: { project: Project }) {
  const [expanded, setExpanded] = useState(true)
  const { data: missions } = useMissions(project.id)
  const { openTab } = useTabs()

  const activeMissions = missions?.filter(m =>
    ['planning', 'pending', 'running', 'paused'].includes(m.status)
  )

  return (
    <div>
      <div
        onClick={() => setExpanded(!expanded)}
        className={cn(
          'flex items-center gap-1 py-1 px-2 cursor-pointer',
          'hover:bg-bg-elevated rounded text-text-primary'
        )}
      >
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-text-muted" />
        ) : (
          <ChevronRight className="w-4 h-4 text-text-muted" />
        )}
        <Folder className="w-4 h-4 text-accent-warning" />
        <span className="truncate text-sm">{project.name}</span>
        {activeMissions && activeMissions.length > 0 && (
          <span className="ml-auto text-xs text-accent-primary">
            {activeMissions.length}
          </span>
        )}
      </div>

      {expanded && (
        <div className="ml-4">
          {/* Project overview tab */}
          <div
            onClick={() => openTab({ type: 'project', projectId: project.id })}
            className={cn(
              'flex items-center gap-1 py-0.5 px-2 cursor-pointer',
              'hover:bg-bg-elevated rounded text-text-secondary text-sm'
            )}
          >
            Overview
          </div>

          {/* Missions */}
          {missions?.map((mission) => (
            <MissionNode key={mission.id} mission={mission} />
          ))}

          {/* New mission button */}
          <button
            onClick={() => {
              const title = prompt('Mission title:')
              if (title) {
                // Create mission
              }
            }}
            className={cn(
              'flex items-center gap-1 py-0.5 px-2 w-full',
              'hover:bg-bg-elevated rounded text-text-muted text-sm'
            )}
          >
            <Plus className="w-3 h-3" />
            New Mission
          </button>
        </div>
      )}
    </div>
  )
}

function MissionNode({ mission }: { mission: Mission }) {
  const { openTab } = useTabs()

  const statusColors: Record<string, string> = {
    planning: 'text-accent-warning',
    pending: 'text-text-secondary',
    running: 'text-accent-success',
    paused: 'text-accent-warning',
    completed: 'text-text-muted',
    failed: 'text-accent-error',
    cancelled: 'text-text-muted',
  }

  return (
    <div
      onClick={() => openTab({
        type: 'mission',
        missionId: mission.id,
        projectId: mission.projectId,
      })}
      className={cn(
        'flex items-center gap-1 py-0.5 px-2 cursor-pointer',
        'hover:bg-bg-elevated rounded text-sm'
      )}
    >
      <Target className={cn('w-3 h-3', statusColors[mission.status])} />
      <span className="truncate text-text-primary">{mission.title}</span>
      <span className={cn('text-xs ml-auto', statusColors[mission.status])}>
        {mission.status}
      </span>
    </div>
  )
}
```

### Mission Tab View

```tsx
// src/components/tabs/MissionTab.tsx
import { useMission, useMissionPlan, useMissionTasks } from '@/lib/api/queries'
import { MissionPlanningView } from '@/components/missions/MissionPlanningView'
import { MissionExecutionView } from '@/components/missions/MissionExecutionView'
import { MissionCompletedView } from '@/components/missions/MissionCompletedView'

interface MissionTabProps {
  missionId: string
  projectId: string
}

export function MissionTab({ missionId, projectId }: MissionTabProps) {
  const { data: mission, isLoading } = useMission(missionId)

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center text-text-secondary">
        Loading mission...
      </div>
    )
  }

  if (!mission) {
    return (
      <div className="h-full flex items-center justify-center text-accent-error">
        Mission not found
      </div>
    )
  }

  // Render based on mission status
  if (mission.status === 'planning') {
    return <MissionPlanningView mission={mission} />
  }

  if (['running', 'paused', 'pending'].includes(mission.status)) {
    return <MissionExecutionView mission={mission} />
  }

  // Completed, failed, or cancelled
  return <MissionCompletedView mission={mission} />
}
```

### Mission Planning View

```tsx
// src/components/missions/MissionPlanningView.tsx
import { useState, useEffect } from 'react'
import { useMissionPlan, useUpdateMissionPlan, useApproveMissionPlan } from '@/lib/api/queries'
import { EditorState } from '@codemirror/state'
import { EditorView, keymap, lineNumbers } from '@codemirror/view'
import { markdown } from '@codemirror/lang-markdown'
import { oneDark } from '@codemirror/theme-one-dark'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { Check, RefreshCw, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

interface MissionPlanningViewProps {
  mission: Mission
}

export function MissionPlanningView({ mission }: MissionPlanningViewProps) {
  const { data: planData, isLoading } = useMissionPlan(mission.id)
  const updatePlan = useUpdateMissionPlan()
  const approvePlan = useApproveMissionPlan()
  const [content, setContent] = useState('')
  const [isDirty, setIsDirty] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (planData?.content) {
      setContent(planData.content)
    }
  }, [planData])

  // Initialize editor (similar to CodeEditor)
  useEffect(() => {
    if (!containerRef.current || !planData) return

    const initialContent = planData.content || ''

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
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        markdown(),
        oneDark,
        updateListener,
      ],
    })

    const view = new EditorView({
      state,
      parent: containerRef.current,
    })

    return () => view.destroy()
  }, [planData])

  const handleSave = async () => {
    try {
      await updatePlan.mutateAsync({
        missionId: mission.id,
        content,
      })
      setIsDirty(false)
    } catch (err) {
      console.error('Failed to save plan:', err)
    }
  }

  const handleApprove = async () => {
    if (isDirty) {
      await handleSave()
    }
    try {
      await approvePlan.mutateAsync(mission.id)
    } catch (err) {
      console.error('Failed to approve plan:', err)
    }
  }

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center text-text-secondary">
        Loading plan...
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="h-12 px-4 flex items-center justify-between border-b border-border">
        <div>
          <h1 className="text-lg font-medium text-text-primary">{mission.title}</h1>
          <span className="text-xs text-accent-warning">Planning</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSave}
            disabled={!isDirty || updatePlan.isPending}
            className={cn(
              'px-3 py-1.5 rounded text-sm flex items-center gap-1',
              'bg-bg-elevated hover:bg-bg-primary border border-border',
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
          >
            <RefreshCw className={cn('w-4 h-4', updatePlan.isPending && 'animate-spin')} />
            Save Draft
          </button>
          <button
            onClick={handleApprove}
            disabled={approvePlan.isPending}
            className={cn(
              'px-3 py-1.5 rounded text-sm flex items-center gap-1',
              'bg-accent-primary text-bg-primary hover:opacity-90',
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
          >
            <Check className="w-4 h-4" />
            Approve Plan
          </button>
        </div>
      </div>

      {/* Info banner */}
      <div className="px-4 py-2 bg-accent-warning/10 border-b border-border flex items-center gap-2">
        <AlertCircle className="w-4 h-4 text-accent-warning" />
        <span className="text-sm text-text-primary">
          Review and edit the plan below. Click "Approve Plan" to begin execution.
        </span>
      </div>

      {/* Editor */}
      <div ref={containerRef} className="flex-1 overflow-hidden" />
    </div>
  )
}
```

### Mission Execution View

```tsx
// src/components/missions/MissionExecutionView.tsx
import { useMissionTasks, useSession, useMessages, usePauseMission, useResumeMission, useCancelMission } from '@/lib/api/queries'
import { TaskList } from '@/components/missions/TaskList'
import { ChatMessages } from '@/components/missions/ChatMessages'
import { ChatInput } from '@/components/missions/ChatInput'
import { Pause, Play, XCircle, Target } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

interface MissionExecutionViewProps {
  mission: Mission
}

export function MissionExecutionView({ mission }: MissionExecutionViewProps) {
  const { data: tasks } = useMissionTasks(mission.id)
  const { data: messages } = useMessages(mission.sessionId || '')
  const pauseMission = usePauseMission()
  const resumeMission = useResumeMission()
  const cancelMission = useCancelMission()

  const isRunning = mission.status === 'running'
  const isPaused = mission.status === 'paused'
  const isPending = mission.status === 'pending'

  return (
    <div className="h-full flex">
      {/* Main chat area */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="h-12 px-4 flex items-center justify-between border-b border-border">
          <div className="flex items-center gap-2">
            <Target className={cn(
              'w-5 h-5',
              isRunning ? 'text-accent-success' : 'text-accent-warning'
            )} />
            <div>
              <h1 className="text-lg font-medium text-text-primary">{mission.title}</h1>
              <span className={cn(
                'text-xs',
                isRunning ? 'text-accent-success' : 'text-accent-warning'
              )}>
                {mission.status.charAt(0).toUpperCase() + mission.status.slice(1)}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isRunning && (
              <button
                onClick={() => pauseMission.mutate(mission.id)}
                disabled={pauseMission.isPending}
                className={cn(
                  'px-3 py-1.5 rounded text-sm flex items-center gap-1',
                  'bg-bg-elevated hover:bg-bg-primary border border-border'
                )}
              >
                <Pause className="w-4 h-4" />
                Pause
              </button>
            )}

            {isPaused && (
              <button
                onClick={() => resumeMission.mutate(mission.id)}
                disabled={resumeMission.isPending}
                className={cn(
                  'px-3 py-1.5 rounded text-sm flex items-center gap-1',
                  'bg-accent-primary text-bg-primary hover:opacity-90'
                )}
              >
                <Play className="w-4 h-4" />
                Resume
              </button>
            )}

            {isPending && (
              <button
                onClick={() => resumeMission.mutate(mission.id)}
                disabled={resumeMission.isPending}
                className={cn(
                  'px-3 py-1.5 rounded text-sm flex items-center gap-1',
                  'bg-accent-primary text-bg-primary hover:opacity-90'
                )}
              >
                <Play className="w-4 h-4" />
                Start
              </button>
            )}

            <button
              onClick={() => {
                if (confirm('Cancel this mission?')) {
                  cancelMission.mutate(mission.id)
                }
              }}
              disabled={cancelMission.isPending}
              className={cn(
                'px-3 py-1.5 rounded text-sm flex items-center gap-1',
                'hover:bg-accent-error/20 text-accent-error border border-transparent'
              )}
            >
              <XCircle className="w-4 h-4" />
              Cancel
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-auto">
          <ChatMessages messages={messages || []} />
        </div>

        {/* Input */}
        <div className="border-t border-border">
          <ChatInput
            sessionId={mission.sessionId || ''}
            disabled={!isRunning}
          />
        </div>
      </div>

      {/* Task sidebar */}
      <div className="w-72 border-l border-border overflow-auto">
        <div className="p-2 border-b border-border">
          <span className="text-xs font-medium text-text-secondary uppercase tracking-wide">
            Tasks
          </span>
        </div>
        <TaskList tasks={tasks || []} />
      </div>
    </div>
  )
}
```

### Task List Component

```tsx
// src/components/missions/TaskList.tsx
import { cn } from '@/lib/utils/cn'
import { Circle, CheckCircle, Clock, AlertCircle } from 'lucide-react'

interface TaskListProps {
  tasks: Task[]
}

export function TaskList({ tasks }: TaskListProps) {
  if (tasks.length === 0) {
    return (
      <div className="p-4 text-sm text-text-muted text-center">
        No tasks yet
      </div>
    )
  }

  return (
    <div className="p-2 space-y-1">
      {tasks.map((task) => (
        <TaskItem key={task.id} task={task} />
      ))}
    </div>
  )
}

function TaskItem({ task }: { task: Task }) {
  const statusConfig: Record<string, { icon: typeof Circle; color: string }> = {
    pending: { icon: Circle, color: 'text-text-muted' },
    in_progress: { icon: Clock, color: 'text-accent-primary' },
    completed: { icon: CheckCircle, color: 'text-accent-success' },
    blocked: { icon: AlertCircle, color: 'text-accent-error' },
    cancelled: { icon: Circle, color: 'text-text-muted' },
  }

  const config = statusConfig[task.status] || statusConfig.pending
  const Icon = config.icon

  return (
    <div className={cn(
      'flex items-start gap-2 p-2 rounded',
      'hover:bg-bg-elevated transition-colors'
    )}>
      <Icon className={cn('w-4 h-4 mt-0.5 shrink-0', config.color)} />
      <div className="flex-1 min-w-0">
        <span className={cn(
          'text-sm',
          task.status === 'completed' ? 'text-text-muted line-through' : 'text-text-primary'
        )}>
          {task.title}
        </span>
        {task.description && (
          <p className="text-xs text-text-muted mt-0.5 truncate">
            {task.description}
          </p>
        )}
      </div>
    </div>
  )
}
```

### Chat Components

```tsx
// src/components/missions/ChatMessages.tsx
import { cn } from '@/lib/utils/cn'
import { User, Bot } from 'lucide-react'
import ReactMarkdown from 'react-markdown'

interface ChatMessagesProps {
  messages: Message[]
}

export function ChatMessages({ messages }: ChatMessagesProps) {
  return (
    <div className="p-4 space-y-4">
      {messages.map((message) => (
        <MessageBubble key={message.id} message={message} />
      ))}
    </div>
  )
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user'

  return (
    <div className={cn(
      'flex gap-3',
      isUser && 'flex-row-reverse'
    )}>
      <div className={cn(
        'w-8 h-8 rounded-full flex items-center justify-center shrink-0',
        isUser ? 'bg-accent-primary' : 'bg-bg-elevated'
      )}>
        {isUser ? (
          <User className="w-4 h-4 text-bg-primary" />
        ) : (
          <Bot className="w-4 h-4 text-text-primary" />
        )}
      </div>

      <div className={cn(
        'flex-1 max-w-[80%]',
        isUser && 'flex flex-col items-end'
      )}>
        <div className={cn(
          'rounded-lg px-4 py-2',
          isUser
            ? 'bg-accent-primary text-bg-primary'
            : 'bg-bg-elevated text-text-primary'
        )}>
          <ReactMarkdown className="prose prose-sm prose-invert max-w-none">
            {message.content}
          </ReactMarkdown>
        </div>
        <span className="text-xs text-text-muted mt-1">
          {new Date(message.createdAt).toLocaleTimeString()}
        </span>
      </div>
    </div>
  )
}
```

```tsx
// src/components/missions/ChatInput.tsx
import { useState } from 'react'
import { useSendMessage } from '@/lib/api/queries'
import { Send } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

interface ChatInputProps {
  sessionId: string
  disabled?: boolean
}

export function ChatInput({ sessionId, disabled }: ChatInputProps) {
  const [message, setMessage] = useState('')
  const sendMessage = useSendMessage()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!message.trim() || disabled) return

    try {
      await sendMessage.mutateAsync({
        sessionId,
        content: message,
      })
      setMessage('')
    } catch (err) {
      console.error('Failed to send message:', err)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="p-4 flex gap-2">
      <input
        type="text"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        disabled={disabled}
        placeholder={disabled ? 'Mission paused...' : 'Send a message...'}
        className={cn(
          'flex-1 px-4 py-2 rounded bg-bg-elevated border border-border',
          'text-text-primary placeholder:text-text-muted',
          'focus:outline-none focus:border-accent-primary',
          'disabled:opacity-50 disabled:cursor-not-allowed'
        )}
      />
      <button
        type="submit"
        disabled={disabled || !message.trim() || sendMessage.isPending}
        className={cn(
          'px-4 py-2 rounded bg-accent-primary text-bg-primary',
          'hover:opacity-90 transition-opacity',
          'disabled:opacity-50 disabled:cursor-not-allowed'
        )}
      >
        <Send className="w-4 h-4" />
      </button>
    </form>
  )
}
```

### Mission Completed View

```tsx
// src/components/missions/MissionCompletedView.tsx
import { useMissionTasks, useMissionPlan } from '@/lib/api/queries'
import { TaskList } from '@/components/missions/TaskList'
import { CheckCircle, XCircle, AlertCircle, FileText } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import ReactMarkdown from 'react-markdown'

interface MissionCompletedViewProps {
  mission: Mission
}

export function MissionCompletedView({ mission }: MissionCompletedViewProps) {
  const { data: tasks } = useMissionTasks(mission.id)
  const { data: planData } = useMissionPlan(mission.id)

  const statusConfig = {
    completed: {
      icon: CheckCircle,
      color: 'text-accent-success',
      bg: 'bg-accent-success/10',
      label: 'Completed',
    },
    failed: {
      icon: XCircle,
      color: 'text-accent-error',
      bg: 'bg-accent-error/10',
      label: 'Failed',
    },
    cancelled: {
      icon: AlertCircle,
      color: 'text-text-muted',
      bg: 'bg-bg-elevated',
      label: 'Cancelled',
    },
  }

  const config = statusConfig[mission.status as keyof typeof statusConfig]
  const Icon = config?.icon || AlertCircle

  const completedTasks = tasks?.filter(t => t.status === 'completed').length || 0
  const totalTasks = tasks?.length || 0

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className={cn('px-6 py-4 border-b border-border', config?.bg)}>
        <div className="flex items-center gap-3">
          <Icon className={cn('w-8 h-8', config?.color)} />
          <div>
            <h1 className="text-xl font-medium text-text-primary">{mission.title}</h1>
            <span className={cn('text-sm', config?.color)}>{config?.label}</span>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {/* Summary */}
        {mission.summary && (
          <div className="mb-6">
            <h2 className="text-sm font-medium text-text-secondary mb-2">Summary</h2>
            <div className="p-4 bg-bg-elevated rounded-lg">
              <ReactMarkdown className="prose prose-sm prose-invert max-w-none">
                {mission.summary}
              </ReactMarkdown>
            </div>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="p-4 bg-bg-elevated rounded-lg">
            <div className="text-2xl font-bold text-text-primary">
              {completedTasks}/{totalTasks}
            </div>
            <div className="text-sm text-text-secondary">Tasks Completed</div>
          </div>
          <div className="p-4 bg-bg-elevated rounded-lg">
            <div className="text-2xl font-bold text-text-primary">
              {mission.startedAt ? formatDuration(mission.completedAt! - mission.startedAt) : '-'}
            </div>
            <div className="text-sm text-text-secondary">Duration</div>
          </div>
          <div className="p-4 bg-bg-elevated rounded-lg">
            <div className="text-2xl font-bold text-text-primary">
              {mission.completionCriteriaMet ? 'Yes' : 'No'}
            </div>
            <div className="text-sm text-text-secondary">Criteria Met</div>
          </div>
        </div>

        {/* Tasks */}
        <div className="mb-6">
          <h2 className="text-sm font-medium text-text-secondary mb-2">Tasks</h2>
          <div className="bg-bg-elevated rounded-lg">
            <TaskList tasks={tasks || []} />
          </div>
        </div>

        {/* Plan */}
        <div>
          <h2 className="text-sm font-medium text-text-secondary mb-2 flex items-center gap-1">
            <FileText className="w-4 h-4" />
            Original Plan
          </h2>
          <div className="p-4 bg-bg-elevated rounded-lg">
            <ReactMarkdown className="prose prose-sm prose-invert max-w-none">
              {planData?.content || 'No plan available'}
            </ReactMarkdown>
          </div>
        </div>
      </div>
    </div>
  )
}

function formatDuration(ms: number): string {
  const minutes = Math.floor(ms / 60000)
  const hours = Math.floor(minutes / 60)
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`
  }
  return `${minutes}m`
}
```

### Additional API Mutations

```typescript
// src/lib/api/queries.ts (additions)
export function useUpdateMissionPlan() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ missionId, content }: { missionId: string; content: string }) =>
      apiClient(`/api/missions/${missionId}/plan`, {
        method: 'PUT',
        body: JSON.stringify({ content }),
      }),
    onSuccess: (_, { missionId }) => {
      queryClient.invalidateQueries({
        queryKey: ['missions', missionId, 'plan'],
      })
    },
  })
}

export function useApproveMissionPlan() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (missionId: string) =>
      apiClient(`/api/missions/${missionId}/approve`, { method: 'POST' }),
    onSuccess: (mission) => {
      queryClient.invalidateQueries({
        queryKey: ['missions', mission.id],
      })
    },
  })
}

export function usePauseMission() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (missionId: string) =>
      apiClient(`/api/missions/${missionId}/pause`, { method: 'POST' }),
    onSuccess: (mission) => {
      queryClient.invalidateQueries({
        queryKey: ['missions', mission.id],
      })
    },
  })
}

export function useResumeMission() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (missionId: string) =>
      apiClient(`/api/missions/${missionId}/resume`, { method: 'POST' }),
    onSuccess: (mission) => {
      queryClient.invalidateQueries({
        queryKey: ['missions', mission.id],
      })
    },
  })
}

export function useCancelMission() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (missionId: string) =>
      apiClient(`/api/missions/${missionId}/cancel`, { method: 'POST' }),
    onSuccess: (mission) => {
      queryClient.invalidateQueries({
        queryKey: ['missions', mission.id],
      })
    },
  })
}

export function useSendMessage() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ sessionId, content }: { sessionId: string; content: string }) =>
      apiClient(`/api/sessions/${sessionId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ content, role: 'user' }),
      }),
    onSuccess: (_, { sessionId }) => {
      queryClient.invalidateQueries({
        queryKey: ['sessions', sessionId, 'messages'],
      })
    },
  })
}
```

---

## Testing

### Unit Tests

```
tests/components/panels/NavigatorPanel.test.tsx      15+ tests
├── renders projects list
├── clicking project expands missions
├── clicking mission opens tab
├── mission status colors correct
├── new mission button works
└── empty state handled

tests/components/missions/MissionPlanningView.test.tsx  15+ tests
├── renders plan content in editor
├── editing marks as dirty
├── save button saves plan
├── approve button approves plan
├── disabled states correct
└── error handling works

tests/components/missions/MissionExecutionView.test.tsx 20+ tests
├── renders mission header
├── pause button pauses mission
├── resume button resumes mission
├── cancel button cancels mission
├── messages displayed correctly
├── tasks sidebar shows tasks
├── chat input works
└── disabled state when paused

tests/components/missions/TaskList.test.tsx           10+ tests
├── renders task items
├── status icons correct
├── completed tasks styled
├── empty state handled
└── descriptions shown

tests/components/missions/ChatMessages.test.tsx       10+ tests
├── renders user messages
├── renders assistant messages
├── markdown rendered
├── timestamps shown
└── scrolls to bottom
```

---

## Validation Criteria

- [ ] Navigator shows projects with missions
- [ ] Clicking mission opens mission tab
- [ ] Planning view shows editable plan
- [ ] Save and approve buttons work
- [ ] Execution view shows chat and tasks
- [ ] Pause/resume/cancel work
- [ ] Messages display correctly
- [ ] Tasks update in real-time via WebSocket
- [ ] Completed view shows summary
- [ ] All 70+ tests pass

**Deliverable**: Complete mission planning and execution interface
