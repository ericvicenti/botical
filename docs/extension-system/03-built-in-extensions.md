# Built-in Extensions

This document summarizes the built-in extensions that are currently registered and shipped with Iris.

## Docker Extension

Source: `src/extensions/docker`.

- Manifest: `src/extensions/docker/extension.json`.
- Default port: `4101`.
- Server entry: `src/extensions/docker/server.ts`.
- Routes are mounted under `/api/extensions/docker/*` via the proxy.

Key endpoints exposed by the extension server:

- `GET /containers`
- `POST /containers/:id/start`
- `POST /containers/:id/stop`
- `GET /images`
- `POST /images/pull`
- `GET /info`

Implementation notes:

- Docker requests are made through the Docker Engine API in `src/extensions/docker/client.ts`.
- The manifest defines `socketPath` as a configurable setting with a default of `/var/run/docker.sock`.

## Search Extension

Source: `src/extensions/search`.

- Manifest: `src/extensions/search/extension.json`.
- Default port: `4102`.
- Server entry: `src/extensions/search/server.ts`.
- Routes are mounted under `/api/extensions/search/*` via the proxy.

Key endpoints exposed by the extension server:

- `GET /search?q=...`
- `GET /search/suggest?q=...`
- `GET /search/status`
- `GET /search/available`
- `POST /search/provision`
- `POST /search/stop`
- `DELETE /search/container`

Implementation notes:

- The search extension runs a SearXNG instance, provisioned by the Docker client in `src/extensions/search/provisioner.ts`.
- Configuration files for SearXNG are written under `~/.iris/searxng`.
- The manifest defines `searxngPort` and `autoProvision` settings with defaults.

## Cross-Extension Dependency

- The Search extension uses the Docker extension's client to create and manage the SearXNG container.
- The `search.web` action in `src/actions/websearch.ts` depends on the Search extension server being up.
