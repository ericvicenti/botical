# Frontend Integration

This document summarizes how the web UI surfaces the extension system today.

## Extension API Hooks

- `webui/src/lib/api/extensions.ts` defines React Query hooks for:
- Listing extensions from `GET /api/extensions`.
- Fetching a single extension from `GET /api/extensions/:id`.
- Enabling and disabling extensions per project.

## Extensions Panel

- `webui/src/components/extensions/ExtensionsPanel.tsx` lists extensions and toggles enablement.
- `ExtensionDetailView` shows status, port, version, description, and service controls for Search.
- Actions are shown when the action category matches the extension ID.

## Sidebar Integration

- `webui/src/components/layout/Sidebar.tsx` inserts extension panels based on enabled extensions.
- The extension list uses `frontend.sidebar` metadata coming from the backend.
- A dedicated Extensions panel is always available when a project is selected.
- Sidebar icon mapping now includes extension-specific icons like `search` and `server`.

## Extension Frontend Modules

- `webui/src/extensions/docker` provides Docker pages, panels, and API hooks.
- `webui/src/extensions/search` provides Search pages, panels, and API hooks.
- `webui/src/extensions/exe` provides exe.dev VM management UI and API hooks.
- `webui/src/extensions/index.ts` registers these modules on startup.

## Test Coverage

- `webui/e2e/extensions.spec.ts` exercises the extensions panel and enable/disable flow.
- `webui/e2e/search.spec.ts` covers search extension UI and API behavior via mocks.
