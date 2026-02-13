# CHANGELOG-AUTO.md — Leopard's Development Log

> Auto-maintained by Leopard 🐆. Each entry records one improvement cycle.

## Log

<!-- Leopard appends entries here in reverse chronological order -->

### 2026-02-13 - Core Primitives Audit: Session, Action, Workflow Analysis

**Priority Addressed:** Audit existing codebase against the three core primitives definitions

**Audit Findings:**

**1. Session Primitive ✅ GOOD**
- ✅ Has typed input/output schemas (SessionCreateSchema, SessionUpdateSchema)
- ✅ Has success/error endstates (SessionStatus: active, archived, deleted)
- ✅ Has messages, tools, context as required
- ✅ Has REST API endpoints (/api/sessions)
- ✅ Has WebSocket events for real-time updates
- ✅ Supports conversation history, agent context, cost tracking

**2. Action Primitive ✅ EXCELLENT**
- ✅ Has typed input/output schemas (Zod schemas for all actions)
- ✅ Has success/error endstates (ActionResult: success, error, navigate, ui)
- ✅ Well-typed one-off commands with clear completion states
- ✅ Has REST API endpoints (/api/tools/actions, /api/tools/actions/execute)
- ✅ Registry system for managing all actions
- ✅ Unified interface for both AI agents and GUI (command palette)
- ✅ Progress reporting support via ActionContext.updateProgress
- ✅ Examples: git.commit, file.search, shell.run, etc.

**3. Workflow Primitive ⚠️ NEEDS WORK**
- ✅ Has typed input/output schemas (WorkflowInputSchema with Zod conversion)
- ✅ Has success/error endstates (WorkflowStatus: pending, running, completed, failed, cancelled)
- ✅ Can compose sessions + actions (ActionStep type exists)
- ✅ Supports parallelism (DAG execution with levels)
- ✅ Has blocking steps support (dependsOn field)
- ✅ Has progress notifications (WebSocket events: workflow.execution, workflow.step)
- ✅ Has REST API endpoints (/api/workflows, /api/workflows/:id/execute)
- ❌ **MISSING: Session composition** - workflows can invoke actions but not spawn sub-sessions
- ❌ **MISSING: Human approval steps** - no built-in step type for blocking on human input
- ❌ **MISSING: Advanced error handling** - retry logic is stubbed, no circuit breakers
- ❌ **MISSING: Workflow-to-workflow composition** - can't call other workflows as steps

**Biggest Gaps to Fix:**
1. **Session composition in workflows** - Add SessionStep type to spawn sub-agent sessions
2. **Human approval steps** - Add ApprovalStep type for blocking on human input
3. **Workflow composition** - Add WorkflowStep type to call other workflows
4. **Advanced error handling** - Implement proper retry logic and circuit breakers

**Next Steps:**
- Implement SessionStep for workflow-session composition
- Add ApprovalStep for human-in-the-loop workflows
- Add WorkflowStep for workflow composition
- Enhance error handling and retry mechanisms

**Commit:** TBD

---

### 2026-02-13 - First Improvement Cycle: Test Environment Stabilization

**Priority Addressed:** Make the self-improvement loop robust

**Changes Made:**
- Fixed EmailService to force dev mode during tests (NODE_ENV=test check)
- Added resetConfig() method to EmailService for proper test isolation
- Updated all test scripts in package.json to set NODE_ENV=test
- Resolved magic link test failures caused by SMTP rate limiting

**Results:**
- ✅ All unit tests now pass consistently (300+ tests)
- ✅ Magic link authentication tests working properly
- ✅ Email service properly uses console logging in test mode
- ⚠️ Integration tests still have auth setup issues (401 errors)

**Next Steps:**
- Fix integration test authentication setup
- Add integration tests for critical paths
- Deploy changes once all tests pass

**Commit:** 5bd9078

---

*Leopard self-improvement started: 2026-02-13*
