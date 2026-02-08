# Backend Core Architecture

This document captures the backend pieces that are implemented today for Botical extensions.

## Core Types

- `ExtensionDefinition` in `src/extensions/types.ts` defines identity, metadata, server entry, settings schema, default settings, and frontend config.
- `ExtensionServerState` tracks runtime status, port, pid, and errors in `src/extensions/types.ts`.
- `ExtensionServer` is a small interface for extension servers that wrap a Hono app.

## Manifest Loading

- `src/extensions/manifest.ts` defines the `extension.json` schema with `backend`, `frontend`, and `settings` blocks.
- `loadManifestFromDir` reads `extension.json` in an extension directory and validates it with Zod.
- `manifestToDefinition` converts the manifest to an `ExtensionDefinition` and derives `defaultSettings` from the manifest settings defaults.

## Registry

- `src/extensions/registry.ts` stores registered extensions by ID and keeps runtime server states.
- The registry is a singleton used by routes, the server manager, and the UI metadata endpoints.

## Server Manager

- `src/extensions/server-manager.ts` spawns each extension server as a Bun subprocess.
- Ports are assigned with `findAvailablePort`, using the default port if available or auto-incrementing from the base port `4101`.
- Server status is written to the registry as `starting`, `running`, `error`, or `stopped`.

## Boot Sequence

- `src/extensions/index.ts` imports built-in extensions so they register on startup.
- `src/server/server.ts` starts all registered extensions after the main server boots.

## Proxy Routing

- `src/server/routes/extensions.ts` exposes extension metadata on `GET /api/extensions` and `GET /api/extensions/:id`.
- `router.all('/:extensionId/*')` proxies requests to the extension server if it is running.

## Notes

- The server manager exposes `startEnabledExtensions`, but it is not currently used by the server boot path.
- Extension servers are currently always started, regardless of project settings.
