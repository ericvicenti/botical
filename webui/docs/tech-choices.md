# Iris Web UI - Technology Choices

## Overview

This document outlines the technology choices for the Iris web interface. The selections prioritize developer experience, performance, and alignment with the Iris backend architecture.

---

## Summary of Choices

| Category | Choice | Rationale |
|----------|--------|-----------|
| Framework | React 19 | Ecosystem, streaming support, team familiarity |
| Build Tool | Vite | Fast HMR, Bun-compatible, excellent DX |
| Language | TypeScript | Type safety, shared types with backend |
| Styling | Tailwind CSS + CSS Modules | Utility-first with component isolation |
| State Management | TanStack Query + React Context | Server state caching + minimal client state |
| Routing | TanStack Router | Type-safe routing, excellent DX |
| WebSocket | Custom hook + reconnection logic | Iris-specific protocol handling |
| UI Components | Radix UI primitives + custom | Accessible, unstyled, composable |
| Icons | Lucide React | Consistent, tree-shakeable, MIT licensed |
| Testing | Vitest + Playwright | Fast unit tests, reliable E2E |
| Code Quality | ESLint + Prettier + Biome | Consistent formatting, fast linting |

---

## Detailed Rationale

### Framework: React 19

**Why React:**
- Largest ecosystem and community support
- React 19 features align well with Iris needs:
  - **Server Components** preparation for potential SSR
  - **Suspense** for loading states during streaming
  - **Transitions** for non-blocking UI updates during agent responses
  - **use()** hook for cleaner async handling
- Team familiarity (assumed, adjust if needed)
- Excellent TypeScript integration
- Rich selection of accessible component libraries

**Alternatives Considered:**
- **Svelte 5**: Smaller bundle, great DX, but smaller ecosystem for complex apps
- **Vue 3**: Good option, but React's streaming/Suspense better suits our needs
- **Solid**: Excellent performance, but less mature ecosystem
- **Vanilla/HTMX**: Too low-level for this complexity level

---

### Build Tool: Vite

**Why Vite:**
- Instant HMR (Hot Module Replacement)
- Native ES modules for fast dev server startup
- Excellent Bun compatibility (can use `bun run` instead of npm)
- Built-in TypeScript support
- Optimized production builds via Rollup
- Plugin ecosystem for extensions

**Configuration Approach:**
- Use Vite's React plugin (`@vitejs/plugin-react`)
- Enable SWC for faster transforms in development
- Configure proxy for API calls to Iris backend during development

---

### Styling: Tailwind CSS + CSS Modules

**Why This Combination:**
- **Tailwind CSS**: Rapid prototyping, consistent design tokens, small production bundle (purged)
- **CSS Modules**: Component-scoped styles for complex components that need custom CSS
- Both work seamlessly with Vite

**Design System Approach:**
- Extend Tailwind config with Iris-specific design tokens
- Use CSS variables for theming (light/dark mode)
- Create component variants with `class-variance-authority` (cva)

**Example Tailwind Config Extensions:**
```js
// tailwind.config.js
export default {
  theme: {
    extend: {
      colors: {
        iris: {
          50: '...', // Brand colors
          // ...
        }
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'monospace'],
      }
    }
  }
}
```

---

### State Management: TanStack Query + React Context

**Philosophy:** Keep it simple. Most state in this app is server state.

**TanStack Query** for server state (90% of app state):
- Session lists and details
- Messages and streaming updates
- Agent configurations
- File contents
- Automatic caching, refetching, and invalidation
- Built-in loading/error states

**React Context** for minimal client-only state:
- WebSocket connection status
- Sidebar collapsed/expanded
- Theme preference (also persisted to localStorage)

**Why Not a Separate State Library:**
- Client-only global state is minimal in this app
- React Context handles the few cases we need
- Avoids extra dependency and concepts to learn
- TanStack Query already covers the complex stuff

**WebSocket Integration:**
- WebSocket events update TanStack Query cache directly
- Connection status exposed via a small `WebSocketContext`
- Example: `message.created` event → update session query cache

```typescript
// Example: WebSocket updating TanStack Query cache
socket.on('message.created', (data) => {
  queryClient.setQueryData(['session', data.sessionId], (old) => ({
    ...old,
    messages: [...old.messages, data.message]
  }))
})
```

---

### Routing: TanStack Router

**Why TanStack Router:**
- Fully type-safe routes
- File-based routing option
- Built-in search params handling (useful for filters, pagination)
- Pending/loading states built-in
- Better than React Router for type safety

**Route Structure:**
```
/                           → Dashboard
/sessions                   → Session list
/sessions/:sessionId        → Session view
/agents                     → Agents list
/agents/:agentName          → Agent detail/editor
/tools                      → Tools list
/tools/:toolName            → Tool detail/editor
/files                      → File browser
/files/*path                → File viewer
/snapshots                  → Snapshots list
/snapshots/:snapshotId      → Snapshot detail
/settings                   → Settings
/settings/:section          → Settings section
```

---

### WebSocket Handling: Custom Implementation

**Why Custom:**
- Iris has a specific WebSocket protocol (JSON-RPC style)
- Need tight integration with TanStack Query for cache updates
- Need custom reconnection logic with state sync

**Implementation Approach:**
```typescript
// WebSocket Context for connection state
const WebSocketContext = createContext<{
  status: 'connecting' | 'connected' | 'disconnected'
  send: <T>(operation: string, payload: object) => Promise<T>
  subscribe: (channel: string) => () => void
} | null>(null)

// Provider manages connection lifecycle
function WebSocketProvider({ projectId, children }) {
  const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected'>('disconnected')
  const queryClient = useQueryClient()

  useEffect(() => {
    const socket = new WebSocket(`ws://...?projectId=${projectId}`)

    // Event handlers update TanStack Query cache
    socket.on('message.created', (data) => {
      queryClient.setQueryData(['session', data.sessionId], (old) => ({
        ...old,
        messages: [...old.messages, data.message]
      }))
    })

    return () => socket.close()
  }, [projectId])

  return <WebSocketContext.Provider value={{ status, send, subscribe }}>...</WebSocketContext.Provider>
}

// Hook for components
const useWebSocket = () => useContext(WebSocketContext)
```

**Reconnection Strategy:**
1. Exponential backoff (1s, 2s, 4s, 8s, max 30s)
2. On reconnect: re-subscribe to channels, request sync
3. Show connection status indicator in UI

---

### UI Components: Radix UI + Custom

**Why Radix:**
- Unstyled, accessible primitives
- Handles complex interactions (modals, dropdowns, tooltips)
- WAI-ARIA compliant out of the box
- Composable architecture

**Components from Radix:**
- Dialog (modals)
- DropdownMenu, ContextMenu
- Tooltip
- Tabs
- Select
- Toast
- AlertDialog (confirmations)

**Custom Components:**
- Message bubbles (user/assistant/tool)
- Code blocks with syntax highlighting
- File tree
- Markdown renderer
- Streaming text display

**Component Library Alternatives Considered:**
- **shadcn/ui**: Good option, built on Radix, could use as starting point
- **Headless UI**: Good, but Radix has more components
- **Chakra/MUI**: Too opinionated, harder to customize

---

### Syntax Highlighting: Shiki

**Why Shiki:**
- Same highlighter as VS Code
- Beautiful themes (including dark mode variants)
- Supports all languages we need
- Better output quality than Prism

**Usage:**
- Code blocks in messages
- File viewer
- Tool input/output display

---

### Markdown: React Markdown + Plugins

**Why React Markdown:**
- React-native rendering
- Extensible via plugins
- Good performance

**Plugins:**
- `remark-gfm`: GitHub Flavored Markdown (tables, task lists)
- `rehype-shiki`: Syntax highlighting integration
- Custom plugin for Iris-specific elements (file links, tool references)

---

### Icons: Lucide React

**Why Lucide:**
- Fork of Feather icons with more icons
- Consistent style
- Tree-shakeable (only bundle used icons)
- React components with proper TypeScript types
- MIT licensed

---

### Testing Strategy

**Unit/Component Tests: Vitest**
- Fast, Vite-native
- Jest-compatible API
- Built-in coverage reporting

**Component Testing: Vitest + Testing Library**
- `@testing-library/react` for component tests
- Focus on user behavior, not implementation

**E2E Tests: Playwright**
- Cross-browser testing
- Visual regression capability
- Network mocking for API tests
- Excellent debugging tools

**Test Structure:**
```
tests/
├── unit/           # Pure function tests
├── components/     # Component tests with Testing Library
├── integration/    # Multi-component integration
└── e2e/           # Full user flow tests with Playwright
```

---

### Code Quality

**ESLint:**
- `@typescript-eslint` for TypeScript rules
- `eslint-plugin-react-hooks` for hooks rules
- Custom rules for project conventions

**Prettier:**
- Consistent formatting
- Integrated with ESLint via `eslint-plugin-prettier`

**Biome (optional):**
- Faster alternative to ESLint + Prettier
- Consider migrating once Biome React support matures

**Husky + lint-staged:**
- Pre-commit hooks for formatting
- Prevent bad commits

---

## Project Structure

```
webui/
├── docs/                    # Documentation
├── public/                  # Static assets
├── src/
│   ├── components/          # Reusable UI components
│   │   ├── ui/             # Base components (buttons, inputs)
│   │   ├── chat/           # Chat-specific components
│   │   ├── files/          # File browser components
│   │   └── layout/         # Layout components
│   ├── hooks/              # Custom React hooks
│   ├── lib/                # Utilities and helpers
│   │   ├── api/            # API client and types
│   │   ├── websocket/      # WebSocket handling
│   │   └── utils/          # General utilities
│   ├── routes/             # Route components (pages)
│   ├── contexts/           # React Context providers
│   ├── styles/             # Global styles, Tailwind config
│   ├── types/              # TypeScript type definitions
│   ├── App.tsx             # Root component
│   └── main.tsx            # Entry point
├── tests/                   # Test files
├── .env.example            # Environment variables template
├── index.html              # HTML entry point
├── package.json
├── tailwind.config.js
├── tsconfig.json
├── vite.config.ts
└── README.md
```

---

## Shared Types with Backend

**Strategy:**
- Create a shared types package or symlink
- Backend Iris already has Zod schemas
- Use `zod-to-ts` or manual type exports

**Example:**
```typescript
// Shared or imported from backend
interface Session {
  id: string
  title: string
  agentName: string
  createdAt: string
  updatedAt: string
}

interface Message {
  id: string
  sessionId: string
  role: 'user' | 'assistant' | 'system'
  parts: MessagePart[]
  // ...
}
```

---

## Performance Considerations

### Bundle Size
- Tree-shake unused code
- Lazy load routes
- Code split large dependencies (Shiki themes, etc.)

### Rendering
- Virtualize long lists (sessions, messages) with `@tanstack/react-virtual`
- Memoize expensive components
- Use `React.memo` and `useMemo` appropriately

### WebSocket
- Debounce rapid updates
- Batch state updates
- Use `requestAnimationFrame` for streaming text

### Assets
- Optimize images (WebP, proper sizing)
- Preload critical fonts
- Use CDN for static assets in production

---

## Deployment Options

### Static Hosting (Recommended for Start)
- Build static bundle with Vite
- Deploy to Vercel, Netlify, or Cloudflare Pages
- Configure proxy/CORS for API calls

### Integrated with Iris Backend
- Serve static files from Iris server
- Single deployment unit
- Simpler CORS configuration

### Docker
- Multi-stage build
- nginx for static serving
- Can be combined with Iris backend container

---

## Development Workflow

1. **Local Development:**
   ```bash
   cd webui
   bun install
   bun run dev
   ```

2. **API Proxy:** Vite dev server proxies `/api` and `/ws` to local Iris server

3. **Hot Reload:** Full HMR for instant feedback

4. **Type Checking:**
   ```bash
   bun run typecheck
   ```

5. **Testing:**
   ```bash
   bun run test        # Unit tests
   bun run test:e2e    # E2E tests
   ```

6. **Build:**
   ```bash
   bun run build
   ```

---

## Future Considerations

- **React Native Web**: If mobile app needed, consider RNW for code sharing
- **PWA**: Add service worker for offline capability
- **WebAssembly**: For heavy client-side processing if needed
- **Module Federation**: If splitting into micro-frontends
- **Edge Rendering**: SSR at edge for faster initial load
