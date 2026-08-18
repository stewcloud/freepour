# FreePour

FreePour is a Docker-first bar mini-games platform built around a shared venue screen and guests' phones. The working domain is **freepour.tv** and the working line is **Scan · Play · Win**.

This repository is an MVP foundation. It includes an operational API and UI shell, realtime transport, persistence schema, game plugin catalog, and clear seams for finishing production gameplay.

## Experiences

- `/venue/:slug` — unattended rotating venue screen with realtime heartbeat
- `/play/:slug` — anonymous QR-to-username player entry
- `/admin` — venue game rotation and feature controls
- Node.js API + Socket.IO — authentication, venue configuration, player sessions and realtime input
- PostgreSQL — durable platform data; Redis — screen presence and realtime ephemeral state
- Internal campaigns/creative schema and prize schema; prizes are disabled by default globally and per venue

## Start with Docker

1. Copy `.env.example` to `.env`.
2. Replace every placeholder password/secret. Do not commit `.env`.
3. For Unraid, set `APPDATA_PATH=/mnt/user/appdata/freepour`; otherwise omit it to use `./appdata`.
4. Run `docker compose up --build -d`.
5. Apply the initial migration from a trusted shell with `DATABASE_URL` set: `node scripts/migrate.mjs`.
6. Visit `http://localhost:3000`; API health is at `http://localhost:4000/health`.

The Compose file publishes the web UI on port 3000 and API on port 4000 by default. Put both behind a TLS reverse proxy for production and expose only the web proxy publicly after consolidating routing.

## Repository layout

```text
apps/api/       Express + Socket.IO API
apps/web/       React/Vite player, venue and admin UI
packages/games/ Shared modular game contract and starter catalog
migrations/     Versioned PostgreSQL schema
scripts/        Operational helpers
docs/           MVP product and delivery notes
appdata/        Ignored local persistent runtime data
```

## Game plugins

`@freepour/games` is the shared contract and registry. Each game declares its ID, metadata, player limits, timing, defaults and implementation status. The starter modules are Quick Draw, Perfect Pour, Higher or Lower, Trivia, and Plinko. They are placeholders by design; server-authoritative state machines and player/venue renderers are tracked as MVP work.

## Security baseline

- No secrets are committed. Startup rejects short JWT secrets.
- Admin passwords are stored as bcrypt hashes in PostgreSQL.
- Venue configuration changes require a signed admin token and venue ownership.
- Prizes require both `PRIZES_ENABLED=true` and a venue-level enablement before future award logic should run.
- Before a public pilot, add rate limiting, refresh-token rotation, CSRF protection where cookies are introduced, screen pairing, audit logging, asset validation, and a retention policy.

## Status

Foundation scaffold: ready. Production game logic, onboarding, operational hardening, campaigns UI and prize fulfillment remain milestone work; see [docs/MVP_ROADMAP.md](docs/MVP_ROADMAP.md).
