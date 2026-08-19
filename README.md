# FreePour

FreePour is a Docker-first venue mini-game platform: one unattended TV, guests’ phones as controllers, and no player accounts or app installs. The working brand is **FreePour / freepour.tv** and is centralized in environment settings plus `apps/web/src/branding.ts` for an easy future rename.

## Demo flow

The display continuously runs:

`category → several playable games/questions → visual reveals → category winner → internal ad → next category`

- **Trivia:** five questions by default, answer highlight after every question, running totals, and a round winner.
- **Higher or Lower:** rendered rank/suit cards and a card-flip reveal.
- **Plinko:** a server-seeded deterministic path and animated puck drop.
- **Perfect Pour:** hold/release, 100.00% target, closest without going over, bust over 100%, ranked reveal.
- **Quick Draw:** randomized wait signal, false-start protection, reaction-time scoring and reveal.

Admins can enable categories and individual games, set games per category round, reorder games, and configure weights. The database stores category, game, and player-entry scores, while `/api/venues/:slug/leaderboard` returns tonight’s standings in the venue timezone. Prize tables remain implemented but awards are globally disabled unless `PRIZES_ENABLED=true`. Campaigns are first-party only; the demo seed includes two venue messages.

## Run with Docker Compose

1. Copy `.env.example` to `.env`.
2. Replace `POSTGRES_PASSWORD` and `JWT_SECRET` with long random values. Do not commit `.env`.
3. Run `docker compose up --build -d`.
4. Open `http://localhost:3000/admin` and create the owner account on first use.

Migrations and demo data apply automatically when the API starts. Useful demo URLs:

- TV: `http://localhost:3000/venue/demo`
- Phone: `http://localhost:3000/play/demo`
- Admin: `http://localhost:3000/admin`
- Health: `http://localhost:4000/health`

Open the TV URL in one browser and the phone URL in a narrow/mobile browser. Join once with a nickname; the anonymous browser session is remembered for that venue and follows each game automatically.

## Unraid

Set this in `.env` before starting Compose:

```env
APPDATA_PATH=/mnt/user/appdata/freepour
```

PostgreSQL, Redis append-only data, and uploads then persist under that directory. `WEB_PORT` and `API_HOST_PORT` can be changed for port conflicts. Put the web service behind your TLS reverse proxy; it proxies both `/api/` and `/socket.io/` to the API container, so the public deployment only needs the web endpoint.

## Local development and checks

Requires Node.js 22+ and running PostgreSQL/Redis values in your environment.

```text
npm install
npm run dev
npm run typecheck
npm test
npm run build
```

The automated suite covers critical scoring boundaries and deterministic reveal behavior. Docker Compose syntax/build should also be checked on a machine with Docker available.

## Architecture

```text
TV browser ─┐
Phones ─────┼─ Nginx/Vite UI ── Express + Socket.IO ── PostgreSQL
Admin ──────┘                         │
                                     └────────────── Redis presence/live state

@freepour/games: catalog, categories, scoring and deterministic helpers
```

- `apps/web`: React TV, player, and admin experiences
- `apps/api`: authentication, configuration, realtime authority, persistence, heartbeat, leaderboards
- `packages/games`: reusable game contract and tested scoring logic
- `migrations`: schema, round models, demo venue, and internal ads
- `appdata`: ignored local runtime storage (or the configurable Unraid path)

The TV is the unattended conductor for the demo loop; the API validates and persists player inputs, supplies deterministic reveal state, and broadcasts the authoritative live round. A production multi-screen rollout should move scheduling ownership into a single elected server worker so multiple displays for one venue cannot compete.

## Operational notes

- Players are anonymous browser sessions; no player email/password is collected.
- Screen heartbeats expire after 45 seconds and are available to admin status consumers.
- Ads use only the internal campaign/creative records.
- Never commit `.env`, appdata, credentials, or uploaded private assets.
- Before a public pilot, add rate limiting, screen pairing keys, refresh-token rotation, audit logs, and a content-management UI for trivia and creatives.
