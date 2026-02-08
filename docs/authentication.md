# Authentication System

## Overview

Botical supports two authentication modes:

1. **Single-user mode** — No login required. A local user is auto-created with admin privileges. Used for local `npx botical` development.
2. **Multi-user mode** — Email-based magic link authentication. First registered user becomes admin.

## Mode Detection

The mode is determined by `Config.isSingleUserMode()` in `src/config/index.ts`:

```
BOTICAL_SINGLE_USER=true   → single-user (explicit)
BOTICAL_SINGLE_USER=false  → multi-user (explicit)
(unset)                    → auto-detect: single-user if host=localhost AND no SMTP_HOST/RESEND_API_KEY
```

⚠️ **Do NOT use `BOTICAL_HOST` to force multi-user mode** — that value is also used as the `hostname` for `Bun.serve()`, which will cause EADDRINUSE errors if set to a domain name. Use `BOTICAL_SINGLE_USER=false` instead.

## Architecture

### Backend (`src/auth/`)

| File | Purpose |
|------|---------|
| `index.ts` | Exports all auth services |
| `magic-link.ts` | Token generation, email sending, verification |
| `session.ts` | Session CRUD (create, verify, revoke) |
| `middleware.ts` | `requireAuth()` middleware — auto-auth in single-user, token check in multi-user |
| `local-user.ts` | Local user management for single-user mode |
| `schemas.ts` | Database schemas and types |

### Frontend (`webui/src/`)

| File | Purpose |
|------|---------|
| `contexts/auth.tsx` | `AuthProvider` + `useAuth()` hook — checks `/auth/mode` on load |
| `components/auth/ProtectedRoute.tsx` | Wraps app content; shows `<LoginPage>` if unauthenticated in multi-user mode |
| `components/auth/LoginPage.tsx` | Email input + "Send Magic Link" form |
| `components/auth/AuthErrorBoundary.tsx` | Catches `AUTHENTICATION_ERROR` from API calls and triggers re-auth |
| `lib/auth/globalCheck.ts` | Global auth check trigger for React Query error handlers |

### Auth Flow (Multi-User)

```
1. Frontend loads → AuthProvider calls GET /auth/mode
2. If mode=multi-user and no valid session → ProtectedRoute renders LoginPage
3. User enters email → POST /auth/magic-link → email sent via SMTP (or logged in dev mode)
4. User clicks link → GET /auth/verify?token=xxx → session created, token returned
5. Frontend stores token → API calls include Authorization: Bearer <token>
6. On AUTHENTICATION_ERROR from any API call → global auth check triggers re-render
```

### API Endpoints

| Method | Path | Auth Required | Description |
|--------|------|---------------|-------------|
| GET | `/auth/mode` | No | Returns `{mode, user}` — mode detection |
| POST | `/auth/magic-link` | No | Request magic link for email |
| GET | `/auth/verify` | No | Verify magic link token, create session |
| GET | `/auth/me` | Yes | Current user info |
| POST | `/auth/logout` | Yes | Revoke current session |
| GET | `/auth/sessions` | Yes | List user's sessions |
| DELETE | `/auth/sessions/:id` | Yes | Revoke specific session |
| POST | `/auth/sessions/revoke-others` | Yes | Revoke all other sessions |

## Email Configuration

Magic link emails are sent via SMTP (built-in TLS client, no external deps):

```env
SMTP_HOST=mail.example.com     # SMTP server hostname
SMTP_PORT=465                  # SMTP port (default: 465 for SMTPS)
SMTP_USER=user                 # SMTP username
SMTP_PASS=password             # SMTP password
EMAIL_FROM=noreply@example.com # Sender address
APP_URL=https://your-domain.com # Base URL for magic link URLs
```

In dev mode (no `SMTP_HOST` configured), magic links are logged to the console.

## Production Deployment

Required systemd environment variables for multi-user:

```ini
Environment=BOTICAL_SINGLE_USER=false
Environment=SMTP_HOST=mail.yourdomain.com
Environment=SMTP_PORT=465
Environment=SMTP_USER=youruser
Environment=SMTP_PASS=yourpassword
Environment=EMAIL_FROM=noreply@yourdomain.com
Environment=APP_URL=https://yourdomain.com
```

## Admin Privileges

- First user to register automatically becomes admin (`isAdmin=true`)
- Admins have `canExecuteCode=true`
- Subsequent users are regular users

## Tests

- **Backend integration:** `tests/integration/auth-routes.test.ts` (26 tests)
- **Frontend integration:** `tests/integration/frontend-auth.test.ts` (18 tests)
- All tests use mocked emails (dev mode console output)

## Security Notes

- Magic link tokens expire (configurable TTL)
- Sessions are stored server-side with secure random tokens
- `/auth/magic-link` always returns success to prevent email enumeration
- Cookie-based auth supported alongside Bearer tokens
- Browser requests to `/auth/verify` redirect to onboarding/home instead of returning JSON
