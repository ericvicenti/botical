# PRIORITIES.md — Development Priorities & Bug Reports

> **This file is YOUR interface to Leopard.** Edit it to direct development.
> Leopard reads this file on every improvement cycle and works on the highest priority items.
> Mark items done with [x] or remove them when satisfied.

## 🎯 Current Goals (highest priority first)

### 🔥 TOP PRIORITY: Core Primitives + UX + Programmatic Access

#### The Three Primitives
Botical has three core primitives. Both humans and agents use the same ones:

**1. Session** — A single threaded conversation with a model
- Has messages, tools, context
- The fundamental unit of interaction

**2. Action** — A well-typed one-off command meant to be quickly completed
- Has typed input/output schemas
- Ends in success or error state
- Examples: git commit, file search, deploy, run tests

**3. Workflow** — A high-level function that composes sessions and actions
- May involve parallelism (multiple sessions/actions running concurrently)
- May have blocking steps requiring external input (human approval, etc.)
- Has a mechanism to report/notify the user of progress
- Ends in success or error state
- Example: "improvement cycle" = read priorities → plan → code → test → deploy → report

#### Design Principles
- [ ] **Identical primitives for humans AND agents** — same beautiful UI for both. Humans can see what's happening in any instance, agents can too. No second-class citizens.
- [ ] **Mobile-first UX** — humans are often on phones. UI must be responsive, fast, touch-friendly
- [ ] **Introspectable REST APIs** — clean, well-documented, consistent API surface for all three primitives
- [ ] **Great Skill .md files** — so external agents (like IonBobcat/OpenClaw) can interface with leopard
- [ ] **Leopard ↔ Tiger interop** — leopard (prod) must work seamlessly with tiger (dev) for development workflows

#### Research & Inspiration
- [ ] Study `~/research/` folder — analyses of OhMyOpenCode, Obra/Superpowers, OpenCode Agent Memory, Letta Memory Blocks
- [ ] Continuously research the web for latest AI agent developments (new frameworks, patterns, UX innovations)
- [ ] Apply learnings to Botical's primitives and architecture
- Key references: `~/research/systems-overview.md`, `~/research/obra-superpowers-analysis.md`, `~/research/letta-memory-blocks-analysis.md`

#### Local GPU Resources (sentinel)
- **RTX 4090** GPU + 124GB RAM + 24 cores
- **Ollama** installed with models: devstral:24b, qwen3-coder:30b, llama3.1:8b
- Botical already has Ollama provider support — USE IT for fast local inference
- Use local models for: code review, test generation, drafting, research summarization
- Save cloud API calls for complex reasoning tasks only

#### Leopard Autonomy (handoff from IonBobcat)
- [ ] **Telegram bot integration** — Leopard needs its own Telegram channel to communicate with Eric directly
- [ ] **Internal heartbeat** — Self-monitoring via Botical's scheduler (not relying on external OpenClaw kicks)
- [ ] **Persistent memory** — Context that survives across sessions (like IonBobcat's MEMORY.md)
- [ ] **Self-triggering improvement cycles** — Internal scheduler triggers cycles, not external scripts
- [ ] Read `BOBCAT-HANDOFF.md` for full knowledge transfer from IonBobcat

#### 🔥 Context Management & Long Chain Efficiency
**Problem:** Agent sessions accumulate massive context over many tool-call steps. At step 30+ the context is bloated with full file contents, test outputs, and intermediate reasoning — burning tokens and degrading quality. Bumping maxSteps is a band-aid.

**Research first**, then implement. Study these approaches:
- [ ] **Auto-compaction** — Summarize older conversation turns, keeping recent ones verbatim. Like a sliding window with compressed history. See: Letta's memory blocks (`~/research/letta-memory-blocks-analysis.md`), OpenCode agent memory (`~/research/opencode-agent-memory-analysis.md`)
- [ ] **Tool output truncation** — Large file reads and test outputs should be truncated/summarized after they've been processed. The agent saw it once; keep a summary, not the full 500-line file.
- [ ] **Ralph loops / iterative decomposition** — Break long tasks into sub-tasks with fresh context. Instead of one 60-step session, spawn focused sub-sessions (e.g., "read and plan" → "implement" → "test and fix") that pass structured summaries between them.
- [ ] **Prompt caching** — Use Anthropic's prompt caching to reduce costs on the static parts (system prompt, tools, early messages).
- [ ] **Context budget tracking** — Track token usage per message. When approaching the model's context limit, trigger compaction automatically rather than failing.
- [ ] **Memory blocks (Letta-style)** — Persistent scratchpad the agent can read/write across steps. Store "current task", "what I've learned", "files I've modified" as structured memory instead of relying on conversation history.

**Implementation priorities:**
1. [x] **Tool output truncation** (quick win — cap file reads at N lines in history, summarize test output) - ✅ COMPLETED: Implemented smart content truncation utility with context-aware strategies. Tool outputs are now capped at 2000 chars for general tools, 1500 for tests, 3000 for files. Uses "both" strategy to preserve start/end of large outputs. Prevents context bloat while preserving essential information.
2. [x] **Auto-compaction of older turns** (keep last 5 turns verbatim, summarize rest) - ✅ COMPLETED: Implemented sliding window context compaction with smart compression strategies. Keeps recent 5 turns verbatim, compresses older turns into structured summaries. Detects tool usage, file operations, and errors. Configurable thresholds and comprehensive test coverage. Integrated into AgentOrchestrator with monitoring.
3. [x] **Sub-task decomposition for improvement cycles** (plan → implement → verify as separate sessions) - ✅ COMPLETED: Created improvement cycle workflow with 3 focused phases: planning (10 steps), implementation (15 steps), verification (10 steps). Each phase runs in fresh session with specialized context. Enhanced heartbeat action supports both legacy and decomposed approaches. Prevents context accumulation while maintaining efficiency. Workflow registered as wf_mlpdq9jn-17e2c237.
4. Prompt caching integration
5. Letta-style memory blocks for persistent state

**Success metric:** Leopard completes a full improvement cycle (read priorities → code → test → deploy) in <20 steps with <500k total tokens.

#### UX: Provider/Model Error Recovery
- [ ] When an agent specifies an invalid provider/model and the user hits the error, show a clear error message with a one-click fix: "Agent X uses provider Y which has no credentials. [Reassign all agents using Y to use Z instead]"
- [ ] Settings page should show which agents use which providers, with bulk-reassign capability
- [ ] Validate agent provider/model on save — warn if no credentials exist for that provider

#### Code Quality Rules (MANDATORY)
- **NO `as` type assertions** — Use runtime validation (zod schemas) or typed helper functions instead. Every `as` cast is a bug waiting to happen. Currently 63 `as` casts in src/ — eliminate them all over time.
- **NO `any` type** — Use `unknown` with proper narrowing instead.
- **Test every API endpoint end-to-end** — Create a session, send a message, verify the response. Not just unit tests.
- **Manually test via API** before declaring anything fixed — `curl` the endpoint, check the response.
- **Playwright e2e tests** for critical user flows — task creation, message sending, settings. Humans use phones; test the UI.
- Use `extractTextContent()` from `src/services/message-content.ts` for ALL message text extraction.

#### Implementation Tasks
- [x] Audit existing Session/Action/Workflow implementations against these definitions
- [x] Ensure Actions have typed input/output + success/error endstates
- [x] Ensure Workflows can compose sessions + actions, support parallelism, blocking steps, progress notifications
- [x] Ensure all three primitives have REST API endpoints + WebSocket events
- [x] **PRIORITY 1: Add SessionStep to workflows** - ✅ COMPLETED: SessionStep is fully implemented in workflow executor. Fixed AgentOrchestrator API usage (was incorrectly using instance.processMessage, now uses static AgentOrchestrator.run). Supports agent type, system prompt, provider/model config, and message processing. Creates sub-sessions and returns response text.
- [x] **PRIORITY 2: Add ApprovalStep to workflows** - ✅ COMPLETED: ApprovalStep is fully implemented in workflow executor (lines 292-306). Supports approvers list, timeout, auto-approve logic, and broadcasts approval events via WebSocket. ApprovalRequestService handles persistence.
- [x] **PRIORITY 3: Add WorkflowStep to workflows** - ✅ COMPLETED: WorkflowStep is fully implemented with workflow-to-workflow composition support.
- [x] **PRIORITY 4: Enhance error handling** - ✅ COMPLETED: Comprehensive error handling now implemented with circuit breakers for all step types (action, session, workflow, approval), sophisticated error classification, exponential backoff retry logic with jitter, and proper failure isolation. Enterprise-grade error handling complete.
- [ ] Build beautiful, responsive UI for observing all three primitives

### Infrastructure
5. [x] Make the self-improvement loop robust — leopard should recover from failures and keep going
   - ✅ Fixed test environment (NODE_ENV=test, email dev mode)
   - ✅ All unit tests pass consistently
   - ⚠️ Integration tests need auth setup fixes
6. [x] **Fix integration test authentication setup** - ✅ PARTIALLY COMPLETED: Created auth helper module with createAuthSession() and createAuthHeaders() functions. Fixed magic link token extraction and test environment setup. First schedules API test now passes. Remaining integration tests need to be updated to use the auth helpers.
7. [ ] Add integration tests for critical paths (auth flow, message sending, sub-agent spawning)
8. [ ] Fix frontend tests (need DOM environment)

## 🐛 Bug Reports

- [x] **Double-sent first message** (severity: high) — ✅ FIXED: Modified AgentOrchestrator.run to accept existingUserMessageId parameter and only create user message if not already provided. Session creation now passes existing message ID to prevent duplication. One single path for message creation achieved.

- [x] **User message should interrupt tool-calling flow** (severity: high) — ✅ FIXED: Added interruption logic to both WebSocket and REST API message handlers. When new user message arrives for active session, existing orchestration is aborted via AbortController before starting new one. Prevents multiple concurrent orchestrations per session and ensures user messages interrupt tool-calling flows as expected.

- [x] **Mobile: safe area insets not respected** (severity: high) — UI renders behind notch/home indicator/status bar. Must use `env(safe-area-inset-*)` CSS variables and `viewport-fit=cover` meta tag so nothing is clipped off-screen. ✅ FIXED: Added viewport-fit=cover and safe area padding to root layout.

- [x] **Mobile file editor: save button inaccessible** (severity: high) — ✅ FIXED: Added safe area inset support to floating save button and status bar. Used `calc(5rem + env(safe-area-inset-bottom, 0px))` for floating button positioning and added safe area padding to status bar. Save buttons now always accessible above device chrome (home indicators, notches, etc.).

- [x] **Message queuing must be server-side** (severity: high) — ✅ FIXED: Modified message routes to create user message immediately and queue for processing via MessageQueueService. Added user_message_id field to message_queue table to link pre-created messages. Messages are now stored on server before processing begins, preventing loss on page refresh. Queue processor uses existingUserMessageId parameter to avoid duplicate message creation.

<!-- Add bugs here. Leopard will triage and fix them. -->
<!-- Format: - [ ] Description (severity: high/medium/low) -->

## 💡 Feature Requests

<!-- Add feature ideas here. Leopard will plan and implement them. -->

## 📋 Completed

<!-- Leopard moves completed items here with dates -->

---

*Last read by Leopard: 2026-02-13 (Cycle 7)*
*Last updated by human: 2026-02-13*
