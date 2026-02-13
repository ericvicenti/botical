# PRIORITIES.md — Development Priorities & Bug Reports

> **This file is YOUR interface to Leopard.** Edit it to direct development.
> Leopard reads this file on every improvement cycle and works on the highest priority items.
> Mark items done with [x] or remove them when satisfied.

## 🎯 Current Goals (highest priority first)

### 🔥 TOP PRIORITY: Fantastic UX + Programmatic Access
Botical must have:
1. [ ] **Mobile-first UX** — humans are often on phones. UI must be responsive, fast, touch-friendly
2. [ ] **Introspectable REST APIs** — clean, well-documented, consistent API surface
3. [ ] **Great Skill .md files** — so external agents (like IonBobcat/OpenClaw) can interface with leopard
4. [ ] **Leopard ↔ Tiger interop** — leopard (prod) must work seamlessly with tiger (dev) for development workflows

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
