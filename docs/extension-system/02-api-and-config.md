# API and Project Configuration

This document describes the extension-related REST endpoints and the project config schema that exists today.

## Extension Metadata and Proxy API

- `GET /api/extensions`
- Returns all registered extensions with status and optional frontend metadata.
- Implemented in `src/server/routes/extensions.ts`.

- `GET /api/extensions/:extensionId`
- Returns details for a single extension, including `defaultSettings` when provided.
- Implemented in `src/server/routes/extensions.ts`.

- `ALL /api/extensions/:extensionId/*`
- Proxies requests to the extension server and returns upstream responses.
- Implemented in `src/server/routes/extensions.ts`.

## Project Extension Enablement

- `GET /api/projects/:id/extensions`
- Returns enabled extensions for a project.
- Implemented in `src/server/routes/projects.ts`.

- `PUT /api/projects/:id/extensions`
- Replaces the enabled extensions list for a project.
- Implemented in `src/server/routes/projects.ts`.

- `POST /api/projects/:id/extensions/:extensionId/enable`
- Enables a single extension for a project.
- Implemented in `src/server/routes/projects.ts`.

- `POST /api/projects/:id/extensions/:extensionId/disable`
- Disables a single extension for a project.
- Implemented in `src/server/routes/projects.ts`.

## Project YAML Schema

Project settings live in `.iris/config.yaml` and are managed by `src/config/project.ts`.

```yaml
extensions:
  enabled:
    - docker
    - search
  settings:
    search:
      searxngPort: 8888
      autoProvision: true

sidebar:
  panels:
    - files
    - tasks
    - git
    - run
    - docker
```

## Notes

- Extension settings are stored in project config but there is no API or UI to edit them yet.
- Sidebar `panels` can include extension panels, but they are not currently driven by extension settings.
