# Exe.dev Extension Migration

This document captures the migration of exe.dev functionality into the extension system.

## What Moved

- Backend service code moved from `src/services/exe-service.ts` to `src/extensions/exe/exe-service.ts`.
- A dedicated extension server now lives at `src/extensions/exe/server.ts`.
- The extension manifest is defined in `src/extensions/exe/extension.json`.
- The legacy `/api/exe/*` routes were removed; the new surface is `/api/extensions/exe/*`.

## Backend API Surface

The exe.dev extension server exposes:

- `GET /status` for connectivity/auth status.
- `GET /vms` to list VMs.
- `POST /vms` to create a VM.
- `DELETE /vms/:name` to delete a VM.
- `POST /vms/:name/restart` to restart a VM.
- `POST /vms/:name/exec` to run commands in a VM.

All of these are accessed through the proxy at `/api/extensions/exe/*`.

## Frontend Integration

- `webui/src/extensions/exe/api.ts` provides React Query hooks for the new API surface.
- `webui/src/extensions/exe/components/ExeSidebarPanel.tsx` renders VM list, actions, and exec UI.
- The sidebar entry is driven by the manifest (`frontend.sidebar`), so it appears when the extension is enabled.

## Notes

- The extension shells out to `ssh exe.dev` under the hood, so users must have exe.dev SSH access configured.
- Extension servers are still started globally on boot, so enabling/disabling only gates UI access today.
