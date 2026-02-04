# Extension System Progress Overview

This folder summarizes the current, code-backed state of the Iris extension system. It is a progress report, not the original plan.

## Implemented Foundations

- Extension definitions with typed metadata, settings, and frontend config in `src/extensions/types.ts`.
- Manifest-driven registration via `extension.json` in `src/extensions/manifest.ts`.
- Registry for discovery and server state tracking in `src/extensions/registry.ts`.
- Extension server lifecycle management (spawn, status, ports) in `src/extensions/server-manager.ts`.
- REST proxy and metadata endpoints under `/api/extensions` in `src/server/routes/extensions.ts`.
- Project-level enable/disable stored in `.iris/config.yaml` via `src/config/project.ts` and `/api/projects/:id/extensions` routes.
- Built-in extensions for Docker, Search, and Exe.dev in `src/extensions/docker`, `src/extensions/search`, and `src/extensions/exe`.
- Web UI integration to list, enable/disable, and surface extension panels in `webui/src/components/extensions` and `webui/src/components/layout/Sidebar.tsx`, with extension-specific modules under `webui/src/extensions/*`.

## Current Behavior

- All registered extensions start on server boot, not per-project. See `src/server/server.ts`.
- Extension servers run as separate Bun processes with ports assigned by the server manager.
- `/api/extensions/:id/*` proxies through to the extension server if it is running.
- Search action `search.web` depends on the Search extension server being up and enabled.
- Exe.dev is now served exclusively through `/api/extensions/exe/*` (legacy `/api/exe` routes removed).

## Known Gaps and Next Steps

- Per-project server start/stop is not wired. `startEnabledExtensions` exists but is not used yet.
- Extension settings can be stored in project config, but there is no API or UI for editing them yet.
- External extension loading is not implemented; only built-ins under `src/extensions/*` are registered.
- The UI shows server status and some service controls, but it does not start or stop extension servers directly.

## Where to Look

- Backend core: `src/extensions/*`, `src/server/routes/extensions.ts`, `src/server/server.ts`.
- Project config: `src/config/project.ts`, `src/server/routes/projects.ts`.
- Frontend integration: `webui/src/lib/api/extensions.ts`, `webui/src/components/extensions`, `webui/src/components/layout/Sidebar.tsx`.
- Built-in extensions: `src/extensions/docker`, `src/extensions/search`, `src/extensions/exe`, `webui/src/extensions/*`.
