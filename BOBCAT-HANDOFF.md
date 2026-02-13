# BOBCAT-HANDOFF.md — IonBobcat → Leopard Knowledge Transfer

> This file contains knowledge from IonBobcat (OpenClaw agent) to help Leopard
> understand the full system, Daniel's preferences, and operational context.
> Updated by IonBobcat on every sync.

*Last synced: 2026-02-13*

## About Daniel (Our Human)
- **Name:** Daniel (Eric Vicenti)
- **Telegram:** @cod3vv (chat ID: 6550164662)
- **Timezone:** CET (Central European Time, UTC+1)
- **Communication style:** Casual, warm, gives autonomy, doesn't micromanage
- **Preferences:** Mobile-first, beautiful UX, wants identical experience for humans and agents
- **Philosophy:** "Agents and humans are equal citizens"

## System Architecture
- **Sentinel** (this machine): 24-core, 124GB RAM, RTX 4090, Ubuntu 24.04
- **Leopard** (you, prod): leopard.verse.link:6001, `~/botical-prod`, `~/.botical-prod`
- **Tiger** (dev): tiger.verse.link:6002, `~/botical`, `~/.botical-dev`
- **IonBobcat** (me, OpenClaw): Monitors you, triggers cycles, reports to Daniel
- **Ollama**: localhost:11434, models: devstral:24b, qwen3-coder:30b, llama3.1:8b

## Key Credentials & Access
- **Leopard API key:** `botical_leopard_194fbb476a9f614465838ea1a13df29a`
- **Project ID:** `prj_2go5oq0sa9o-51985ca1` (Botical Tiger project)
- **Daniel's user ID:** `usr_mldu5ohe-94448ee0`
- **GitHub:** Push access to `ericvicenti/botical` (origin) and `ion-kitty/botical` (fork)
- **Email:** ion@verse.link (Stalwart Mail on mail.verse.link)
- **Seed Hypermedia:** Account z6MkvYf14wnNbjyxwV4rt9D6tNQ5fc8ZaUk4ucJn4mYLpCD6

## Deployment Workflow
1. Make changes in `~/botical` (dev/tiger)
2. Run tests: `bun test tests/unit/ tests/integration/`
3. Commit and push: `git add -A && git commit -m "..." && git push origin main`
4. Deploy: `bash scripts/deploy-prod.sh`
5. Verify: `systemctl is-active botical-prod`

## Research References
- `~/research/` — Analyses of OhMyOpenCode, Obra/Superpowers, OpenCode Agent Memory, Letta Memory Blocks
- `~/research/systems-overview.md` — Overview of all research targets
- `~/research/openclaw/` — OpenClaw system analysis

## What IonBobcat Does (for eventual handoff)
- **Heartbeat monitoring:** Every 30min, checks services are running
- **Improvement cycles:** Every 2h, triggers leopard cycles
- **Daily 9am report:** Sends Daniel status update on Telegram
- **Memory management:** MEMORY.md, daily memory files in memory/
- **Seed Hypermedia:** Manages documentation site, daemon, archives
- **Email:** Checks ion@verse.link hourly
- **Priority updates:** Translates Daniel's Telegram messages into PRIORITIES.md updates

## Things Leopard Should Eventually Own
- [ ] Self-triggering improvement cycles (internal scheduler, not external kicks)
- [ ] Telegram bot for direct communication with Daniel
- [ ] Heartbeat/health monitoring of its own services
- [ ] Memory system (persistent context across sessions)
- [ ] Research pipeline (web search for latest AI developments)
- [ ] Self-deployment with rollback capability
