# Leopard Safe Deployment Guide

> **Audience:** Leopard 🐆 (the self-improvement agent) and Ion ⚡ (the sentinel/orchestrator)
>
> **The #1 rule:** Leopard runs on prod. Deploying to prod restarts Leopard. A self-restart mid-cycle kills the session and loses all progress.

## Architecture

```
┌─────────────────────────────────────────────────┐
│  sentinel (ion-lynx)                             │
│  ┌───────────────────┐  ┌─────────────────────┐ │
│  │ 🐯 Tiger (dev)    │  │ 🐆 Leopard (prod)   │ │
│  │ botical-dev :6002  │  │ botical-prod :6001   │ │
│  │ ~/botical          │  │ ~/botical-prod       │ │
│  │                    │  │                      │ │
│  │ Safe to restart    │  │ ⚠️ LEOPARD LIVES HERE│ │
│  │ anytime            │  │ Restart = kill cycle │ │
│  └───────────────────┘  └─────────────────────┘ │
└─────────────────────────────────────────────────┘
```

## The Problem

When Leopard runs `deploy-prod.sh`, it:
1. Pulls code into `~/botical-prod`
2. Installs deps + builds frontend
3. Runs `sudo systemctl restart botical-prod`
4. **Dies.** The session that issued the command is killed mid-execution.
5. Service comes back up, but the cycle's context and state are gone.

## Safe Workflow

### What Leopard CAN Do (Freely)

- Edit code in `~/botical` (dev repo)
- Restart tiger: `sudo systemctl restart botical-dev`
- Run tests: `cd ~/botical && bun test tests/unit/ tests/integration/`
- Commit and push: `git add -A && git commit -m "..." && git push`
- Build frontend: `cd ~/botical/webui && npm install && npx vite build`
- Verify tiger works: `curl -s http://localhost:6002/api/health`

### What Leopard Must NOT Do

- **NEVER** run `sudo systemctl restart botical-prod` directly
- **NEVER** run `deploy-prod.sh` (it restarts prod)
- **NEVER** run any command that stops/restarts the `botical-prod` service

### How to Deploy to Prod (Safe)

When Leopard has tested changes on tiger and wants to deploy to prod:

```bash
# Use the safe deploy script — it stages everything but does NOT restart
bash scripts/deploy-prod-stage.sh
```

This script:
1. Pushes code to GitHub
2. Pulls into `~/botical-prod`
3. Installs deps and builds frontend
4. Writes a marker file: `~/.botical-prod/.deploy-ready`
5. **Does NOT restart.** Leopard stays alive.

The actual restart is handled by **Ion (sentinel)** or a **cron job** that:
1. Checks for `~/.botical-prod/.deploy-ready`
2. Waits for Leopard's session to be idle (no active cycle)
3. Restarts `botical-prod`
4. Verifies health
5. Removes the marker

## Deploy Stages

```
Leopard's cycle:
  code → test → commit → push → stage (deploy-prod-stage.sh)
  ✅ Leopard's job is done. Session completes normally.

Later (sentinel/cron):
  detect .deploy-ready → wait for idle → restart prod → verify → cleanup
  ✅ Safe restart with no active session to kill.
```

## Recovery

If prod is broken after a deploy:

```bash
# Revert to previous commit
cd ~/botical-prod && git reset --hard HEAD~1
sudo systemctl restart botical-prod

# Verify
sleep 3 && curl -s http://localhost:6001/api/health
```

If Leopard can't run because prod is down, Ion can:
1. Revert and restart prod
2. Trigger a new cycle once healthy

## Sentinel's Role (Ion)

Ion monitors Leopard and handles:
- **Staged deploys:** Check for `.deploy-ready`, restart when safe
- **Health checks:** Verify prod is running after restart
- **Recovery:** Revert if prod fails to start
- **Cycle triggers:** Kick off improvement cycles via cron

## File Markers

| File | Meaning |
|------|---------|
| `~/.botical-prod/.deploy-ready` | Code is staged, waiting for safe restart |
| `~/.botical-prod/.deploy-in-progress` | Restart is happening now (sentinel lock) |
| `~/.botical-prod/.deploy-reverted` | Last deploy was reverted due to failure |

## Summary

| Action | Who | Safe? |
|--------|-----|-------|
| Edit code in ~/botical | Leopard | ✅ |
| Restart tiger (dev) | Leopard | ✅ |
| Run tests | Leopard | ✅ |
| Commit & push | Leopard | ✅ |
| Stage prod deploy | Leopard | ✅ |
| Restart prod | **Ion/cron only** | ⚠️ |
| Revert prod | Ion | ✅ |
