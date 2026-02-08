# Phase 20: Tasks UI ✅ COMPLETE

**Goal**: Implement the Tasks interface - conversations with AI agents that work to complete objectives

**Status**: Complete (January 2025)

## Overview

In Botical, a "Task" is a conversation with an AI agent focused on accomplishing a specific goal. The agent continues working until the task is complete. This phase implemented:

- Tasks sidebar panel showing all tasks for a project
- Task creation interface
- Chat interface for agent-user conversation
- Real-time streaming of agent responses via WebSocket
- Optimistic updates for sent messages
- Message ordering with chronological sorting

**Terminology Mapping**:
- UI "Task" = Backend "Session" (agent conversation)
- UI "Work Items" = Backend "Tasks" (todo tracking within a session)

---

## What Was Implemented

### Backend Enhancements
- ✅ `StreamProcessor` emits events to EventBus (message.text.delta, message.tool.call, etc.)
- ✅ `bus-bridge` routes message events to session and project WebSocket rooms
- ✅ `/api/sessions/:id/messages` returns messages WITH parts
- ✅ `/api/messages` POST endpoint triggers orchestrator with streaming

### Frontend - Completed
- ✅ `useMessages(sessionId, projectId)` - fetch messages for session
- ✅ `useSettings()` - fetch user settings including API keys
- ✅ `useTaskMessages` hook - combines fetching, streaming, and optimistic updates
- ✅ `subscribeToStreamingEvents` - WebSocket event subscription for streaming
- ✅ `handleWebSocketEvent` - query invalidation on message.complete/error
- ✅ `task` tab type in `types/tabs.ts`
- ✅ Navigator panel shows sessions in sidebar
- ✅ `TaskChat.tsx` - chat interface with input form
- ✅ `MessageBubble.tsx` - message display with parts
- ✅ Streaming message state while agent responds
- ✅ Message ordering fix (chronological sort, duplicate filtering)

### Key Files
- `webui/src/hooks/useTaskMessages.ts` - Main hook for message management
- `webui/src/lib/websocket/events.ts` - Streaming event handling
- `webui/src/components/tasks/TaskChat.tsx` - Chat UI
- `webui/src/components/tasks/MessageBubble.tsx` - Message display
- `src/agents/stream-processor.ts` - Server-side event emission
- `src/websocket/bus-bridge.ts` - Event routing to WebSocket

### Tests
- 66 frontend tests passing (including streaming tests)
- 1185 backend tests passing
- `useTaskMessages.test.tsx` - Streaming event handling
- `events.test.ts` - WebSocket event subscription
- `streaming-integration.test.ts` - Full EventBus → WebSocket flow

---

## Frontend Implementation

### 1. API Additions

```typescript
// src/lib/api/queries.ts (additions)

// Fetch messages for a session
export function useMessages(sessionId: string) {
  return useQuery({
    queryKey: ['sessions', sessionId, 'messages'],
    queryFn: () => apiClient<Message[]>(`/api/sessions/${sessionId}/messages`),
    enabled: !!sessionId,
  })
}

// Create a new session (task)
export function useCreateSession() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: { projectId: string; title: string; agent?: string }) =>
      apiClient<Session>('/api/sessions', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: ['sessions', projectId] })
    },
  })
}

// Send a message
export function useSendMessage() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: { sessionId: string; content: string }) =>
      apiClient<Message>('/api/messages', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: (_, { sessionId }) => {
      queryClient.invalidateQueries({ queryKey: ['sessions', sessionId, 'messages'] })
    },
  })
}

// Archive/delete session
export function useArchiveSession() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (sessionId: string) =>
      apiClient(`/api/sessions/${sessionId}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] })
    },
  })
}
```

### 2. Type Definitions

```typescript
// src/lib/api/types.ts (additions)

export interface Message {
  id: string
  sessionId: string
  role: 'user' | 'assistant' | 'system'
  createdAt: number
  completedAt: number | null
  finishReason: string | null
  error?: {
    type: string
    message: string
  }
}

export interface MessagePart {
  id: string
  messageId: string
  type: 'text' | 'reasoning' | 'tool-call' | 'tool-result' | 'file' | 'step-start' | 'step-finish'
  content: unknown
  toolName?: string
  toolStatus?: 'pending' | 'running' | 'completed' | 'error'
  createdAt: number
}

export interface SessionWithMessages extends Session {
  messages: Array<Message & { parts: MessagePart[] }>
}
```

### 3. Tasks Sidebar Panel

```tsx
// src/components/panels/TasksPanel.tsx
import { useSessions, useCreateSession } from '@/lib/api/queries'
import { useTabs } from '@/contexts/tabs'
import { cn } from '@/lib/utils/cn'
import { Plus, MessageSquare, Archive, MoreHorizontal } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

interface TasksPanelProps {
  projectId: string
}

export function TasksPanel({ projectId }: TasksPanelProps) {
  const { data: sessions, isLoading } = useSessions(projectId)
  const createSession = useCreateSession()
  const { openTab } = useTabs()

  const activeSessions = sessions?.filter(s => s.status === 'active') || []
  const archivedSessions = sessions?.filter(s => s.status === 'archived') || []

  const handleCreateTask = async () => {
    const session = await createSession.mutateAsync({
      projectId,
      title: 'New Task',
    })
    openTab({ type: 'task', sessionId: session.id, projectId })
  }

  if (isLoading) {
    return <div className="p-4 text-text-secondary">Loading tasks...</div>
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-3 py-2 flex items-center justify-between border-b border-border">
        <span className="text-xs font-medium text-text-secondary uppercase tracking-wide">
          Tasks
        </span>
        <button
          onClick={handleCreateTask}
          disabled={createSession.isPending}
          className="p-1 hover:bg-bg-elevated rounded text-text-muted hover:text-text-primary"
          title="New Task"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* Task List */}
      <div className="flex-1 overflow-auto py-1">
        {activeSessions.length === 0 ? (
          <div className="px-3 py-4 text-sm text-text-muted text-center">
            No active tasks
          </div>
        ) : (
          activeSessions.map((session) => (
            <TaskItem
              key={session.id}
              session={session}
              projectId={projectId}
            />
          ))
        )}

        {archivedSessions.length > 0 && (
          <>
            <div className="px-3 py-2 text-xs text-text-muted">
              Archived ({archivedSessions.length})
            </div>
            {archivedSessions.map((session) => (
              <TaskItem
                key={session.id}
                session={session}
                projectId={projectId}
                archived
              />
            ))}
          </>
        )}
      </div>
    </div>
  )
}

function TaskItem({
  session,
  projectId,
  archived
}: {
  session: Session
  projectId: string
  archived?: boolean
}) {
  const { openTab } = useTabs()

  return (
    <div
      onClick={() => openTab({ type: 'task', sessionId: session.id, projectId })}
      className={cn(
        'px-3 py-2 cursor-pointer hover:bg-bg-elevated',
        'flex items-start gap-2 group',
        archived && 'opacity-60'
      )}
    >
      <MessageSquare className="w-4 h-4 mt-0.5 text-text-muted shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-sm text-text-primary truncate">
          {session.title || 'Untitled Task'}
        </div>
        <div className="text-xs text-text-muted">
          {formatDistanceToNow(session.createdAt, { addSuffix: true })}
          {session.messageCount > 0 && ` · ${session.messageCount} messages`}
        </div>
      </div>
    </div>
  )
}
```

### 4. Chat Interface Component

```tsx
// src/components/tasks/TaskChat.tsx
import { useSession, useMessages, useSendMessage } from '@/lib/api/queries'
import { useWebSocket } from '@/lib/websocket/context'
import { useState, useRef, useEffect } from 'react'
import { Send, Loader2 } from 'lucide-react'
import { MessageBubble } from './MessageBubble'

interface TaskChatProps {
  sessionId: string
  projectId: string
}

export function TaskChat({ sessionId, projectId }: TaskChatProps) {
  const { data: session } = useSession(sessionId)
  const { data: messages, isLoading } = useMessages(sessionId)
  const sendMessage = useSendMessage()
  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const { subscribe, unsubscribe } = useWebSocket()

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Subscribe to session events for real-time updates
  useEffect(() => {
    subscribe(`session:${sessionId}`)
    return () => unsubscribe(`session:${sessionId}`)
  }, [sessionId, subscribe, unsubscribe])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || sendMessage.isPending) return

    const content = input.trim()
    setInput('')

    await sendMessage.mutateAsync({
      sessionId,
      content,
    })
  }

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center text-text-secondary">
        Loading conversation...
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border">
        <h2 className="text-lg font-medium text-text-primary">
          {session?.title || 'Task'}
        </h2>
        <p className="text-sm text-text-muted">
          {session?.agent || 'default'} agent
        </p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-auto p-4 space-y-4">
        {messages?.length === 0 ? (
          <div className="text-center text-text-muted py-8">
            Start a conversation with the agent
          </div>
        ) : (
          messages?.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="p-4 border-t border-border">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a message..."
            className="flex-1 px-3 py-2 bg-bg-secondary border border-border rounded
                       text-text-primary placeholder:text-text-muted
                       focus:outline-none focus:border-accent-primary"
            disabled={sendMessage.isPending}
          />
          <button
            type="submit"
            disabled={!input.trim() || sendMessage.isPending}
            className="px-4 py-2 bg-accent-primary text-white rounded
                       hover:bg-accent-primary/90 disabled:opacity-50
                       flex items-center gap-2"
          >
            {sendMessage.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </button>
        </div>
      </form>
    </div>
  )
}
```

### 5. Message Display Component

```tsx
// src/components/tasks/MessageBubble.tsx
import { cn } from '@/lib/utils/cn'
import { User, Bot, AlertCircle, Wrench, FileText } from 'lucide-react'
import type { Message, MessagePart } from '@/lib/api/types'

interface MessageBubbleProps {
  message: Message & { parts?: MessagePart[] }
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user'
  const isError = !!message.error

  return (
    <div className={cn('flex gap-3', isUser && 'flex-row-reverse')}>
      {/* Avatar */}
      <div className={cn(
        'w-8 h-8 rounded-full flex items-center justify-center shrink-0',
        isUser ? 'bg-accent-primary' : 'bg-bg-elevated'
      )}>
        {isUser ? (
          <User className="w-4 h-4 text-white" />
        ) : (
          <Bot className="w-4 h-4 text-text-primary" />
        )}
      </div>

      {/* Content */}
      <div className={cn('flex-1 max-w-[80%]', isUser && 'flex flex-col items-end')}>
        {message.parts?.map((part) => (
          <MessagePartContent key={part.id} part={part} isUser={isUser} />
        ))}

        {isError && (
          <div className="mt-2 px-3 py-2 bg-accent-error/10 border border-accent-error/20 rounded text-sm">
            <div className="flex items-center gap-2 text-accent-error">
              <AlertCircle className="w-4 h-4" />
              <span>{message.error?.type}</span>
            </div>
            <p className="text-text-secondary mt-1">{message.error?.message}</p>
          </div>
        )}
      </div>
    </div>
  )
}

function MessagePartContent({ part, isUser }: { part: MessagePart; isUser: boolean }) {
  switch (part.type) {
    case 'text':
      return (
        <div className={cn(
          'px-4 py-2 rounded-lg',
          isUser
            ? 'bg-accent-primary text-white'
            : 'bg-bg-elevated text-text-primary'
        )}>
          <p className="whitespace-pre-wrap">{(part.content as { text: string }).text}</p>
        </div>
      )

    case 'reasoning':
      return (
        <div className="px-4 py-2 bg-bg-secondary border border-border rounded-lg text-sm text-text-secondary italic">
          <p className="whitespace-pre-wrap">{(part.content as { text: string }).text}</p>
        </div>
      )

    case 'tool-call':
      const toolContent = part.content as { name: string; args: unknown }
      return (
        <div className="px-3 py-2 bg-bg-secondary border border-border rounded text-sm">
          <div className="flex items-center gap-2 text-text-muted">
            <Wrench className="w-3 h-3" />
            <span className="font-mono">{toolContent.name}</span>
            <StatusBadge status={part.toolStatus} />
          </div>
        </div>
      )

    case 'tool-result':
      return (
        <div className="px-3 py-2 bg-bg-secondary border border-border rounded text-sm font-mono">
          <pre className="text-xs overflow-auto max-h-40 text-text-secondary">
            {JSON.stringify(part.content, null, 2)}
          </pre>
        </div>
      )

    case 'file':
      const fileContent = part.content as { path: string }
      return (
        <div className="px-3 py-2 bg-bg-secondary border border-border rounded text-sm flex items-center gap-2">
          <FileText className="w-4 h-4 text-text-muted" />
          <span className="font-mono">{fileContent.path}</span>
        </div>
      )

    default:
      return null
  }
}

function StatusBadge({ status }: { status?: string }) {
  if (!status) return null

  const colors: Record<string, string> = {
    pending: 'bg-yellow-500/20 text-yellow-400',
    running: 'bg-blue-500/20 text-blue-400',
    completed: 'bg-green-500/20 text-green-400',
    error: 'bg-red-500/20 text-red-400',
  }

  return (
    <span className={cn('px-1.5 py-0.5 rounded text-xs', colors[status] || '')}>
      {status}
    </span>
  )
}
```

### 6. Tab Type and Route Integration

```typescript
// src/types/tabs.ts (additions)
export type TabType =
  | 'project'
  | 'mission'
  | 'file'
  | 'process'
  | 'diff'
  | 'settings'
  | 'task'  // Add task type

export type TabData =
  | { type: 'project'; projectId: string }
  | { type: 'mission'; missionId: string; projectId: string }
  | { type: 'file'; path: string; projectId: string }
  | { type: 'process'; processId: string; projectId: string }
  | { type: 'diff'; path: string; projectId: string; base?: string }
  | { type: 'settings' }
  | { type: 'task'; sessionId: string; projectId: string }  // Add task data
```

```tsx
// src/routes/tasks/$sessionId.tsx
import { createFileRoute } from '@tanstack/react-router'
import { TaskChat } from '@/components/tasks/TaskChat'

export const Route = createFileRoute('/tasks/$sessionId')({
  component: TaskView,
})

function TaskView() {
  const { sessionId } = Route.useParams()
  const search = Route.useSearch() as { projectId?: string }

  if (!search.projectId) {
    return <div>Project ID required</div>
  }

  return <TaskChat sessionId={sessionId} projectId={search.projectId} />
}
```

### 7. Sidebar Integration

Update the sidebar to include Tasks panel:

```tsx
// In Sidebar.tsx - add to PANELS array
const PANELS = [
  { id: 'nav', icon: FolderTree, label: 'Navigator' },
  { id: 'tasks', icon: MessageSquare, label: 'Tasks' },  // Add tasks panel
  { id: 'files', icon: Files, label: 'Files' },
  { id: 'git', icon: GitBranch, label: 'Git' },
  { id: 'run', icon: Play, label: 'Run' },
] as const
```

### 8. Real-time Updates

```tsx
// src/hooks/useTaskEvents.ts
import { useWebSocket } from '@/lib/websocket/context'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'

export function useTaskEvents(sessionId: string) {
  const { lastMessage, subscribe, unsubscribe } = useWebSocket()
  const queryClient = useQueryClient()

  useEffect(() => {
    subscribe(`session:${sessionId}`)
    return () => unsubscribe(`session:${sessionId}`)
  }, [sessionId, subscribe, unsubscribe])

  useEffect(() => {
    if (!lastMessage) return

    const { type, payload } = lastMessage

    switch (type) {
      case 'message.created':
      case 'message.updated':
      case 'message.completed':
        queryClient.invalidateQueries({
          queryKey: ['sessions', sessionId, 'messages'],
        })
        break

      case 'part.created':
      case 'part.updated':
        // For streaming updates, we might want optimistic updates
        queryClient.invalidateQueries({
          queryKey: ['sessions', sessionId, 'messages'],
        })
        break

      case 'session.updated':
        queryClient.invalidateQueries({
          queryKey: ['sessions', sessionId],
        })
        break
    }
  }, [lastMessage, sessionId, queryClient])
}
```

---

## Testing

### Unit Tests

```
tests/components/panels/TasksPanel.test.tsx     15+ tests
├── renders empty state
├── renders task list
├── creates new task on button click
├── opens task tab on click
├── shows archived tasks separately
├── shows message count and time
└── handles loading state

tests/components/tasks/TaskChat.test.tsx        20+ tests
├── renders session header
├── renders empty conversation
├── renders messages list
├── scrolls to bottom on new message
├── submits message on form submit
├── disables input while sending
├── handles send errors
├── subscribes to session events
└── unsubscribes on unmount

tests/components/tasks/MessageBubble.test.tsx   15+ tests
├── renders user message with correct style
├── renders assistant message with correct style
├── renders text parts
├── renders reasoning parts
├── renders tool-call parts with status
├── renders tool-result parts
├── renders file parts
├── renders error state
└── handles missing parts gracefully
```

### Integration Tests

```
tests/integration/tasks-ui.test.tsx
├── Create task → appears in sidebar → opens in tab
├── Send message → appears in chat → agent responds
├── Real-time streaming → messages update live
├── Archive task → moves to archived section
├── Multiple tasks → can switch between them
└── Reconnect → messages sync correctly
```

---

## Validation Criteria

- [ ] Tasks panel shows in sidebar
- [ ] Task list displays active sessions for project
- [ ] New task button creates session and opens tab
- [ ] Clicking task opens chat in main area
- [ ] Chat displays message history
- [ ] User can send messages
- [ ] Agent responses stream in real-time
- [ ] Tool calls display with status
- [ ] Archived tasks shown separately
- [ ] Keyboard shortcut (Cmd+T) creates new task
- [ ] All 50+ tests pass

---

## Implementation Order

1. **API Layer** - Add query/mutation hooks for sessions and messages
2. **Types** - Add Message and MessagePart types
3. **TasksPanel** - Sidebar component showing task list
4. **Tab Integration** - Add task tab type and routing
5. **TaskChat** - Main chat interface component
6. **MessageBubble** - Message display component
7. **Real-time Updates** - WebSocket subscription handling
8. **Polish** - Loading states, error handling, empty states

---

## Notes

- Sessions are called "Tasks" in the UI for user-friendliness
- The backend Session/Message infrastructure is complete
- WebSocket streaming for message parts already works
- Focus is on connecting existing backend to new UI components
