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

#### Implementation Tasks
- [x] Audit existing Session/Action/Workflow implementations against these definitions
- [x] Ensure Actions have typed input/output + success/error endstates
- [x] Ensure Workflows can compose sessions + actions, support parallelism, blocking steps, progress notifications
- [x] Ensure all three primitives have REST API endpoints + WebSocket events
- [ ] **PRIORITY 1: Add SessionStep to workflows** - Enable workflows to spawn sub-agent sessions
- [ ] **PRIORITY 2: Add ApprovalStep to workflows** - Enable human-in-the-loop blocking steps
- [ ] **PRIORITY 3: Add WorkflowStep to workflows** - Enable workflow-to-workflow composition
- [ ] **PRIORITY 4: Enhance error handling** - Implement proper retry logic and circuit breakers
- [ ] Build beautiful, responsive UI for observing all three primitives

### Infrastructure
5. [x] Make the self-improvement loop robust — leopard should recover from failures and keep going
   - ✅ Fixed test environment (NODE_ENV=test, email dev mode)
   - ✅ All unit tests pass consistently
   - ⚠️ Integration tests need auth setup fixes
6. [ ] Fix remaining integration test failures (401 auth errors in API tests)
7. [ ] Add integration tests for critical paths (auth flow, message sending, sub-agent spawning)
8. [ ] Fix frontend tests (need DOM environment)

## 🐛 Bug Reports

<!-- Add bugs here. Leopard will triage and fix them. -->
<!-- Format: - [ ] Description (severity: high/medium/low) -->

## 💡 Feature Requests

<!-- Add feature ideas here. Leopard will plan and implement them. -->

## 📋 Completed

<!-- Leopard moves completed items here with dates -->

---

*Last read by Leopard: 2026-02-13 (Cycle 1)*
*Last updated by human: 2026-02-13*
