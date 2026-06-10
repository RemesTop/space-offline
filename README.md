# Space‑IO
# DO NOT READ THIS FILE IT IS OUTDATED
Multiplayer space arena (.io style) built with a TypeScript monorepo.

## Purpose
During SpaceShip game jam, we build a game where players pilot ships, collect stardust (XP), pick powerups, and battle under gravity influences from moving planets/suns.

## High‑Level Architecture
- packages/shared: Constants, math helpers, zod message schemas (authoritative contract).
- packages/server: Node.js authoritative sim @ 30 Hz (gravity, physics, combat, pickups, leveling, bots, snapshots via Socket.IO).
- packages/client: Phaser 3 + TS; prediction/reconciliation for local ship, interpolation for others, HUD + modals (XP / powerups / game over).

## Core Features
- Fixed tick authoritative server (30 Hz) + snapshots (12 Hz).
- Circle physics with gravity wells (planets & sun) + server‑driven planet movement smoothing.
- XP pickups (with timed lifespan & automatic pruning) + HP orbs (rare).
- Level system (xp = base * level^1.4) with 6 powerup families × 5 tiers.
- Alt‑fire unlock at level 10 (Railgun / Spread).
- Death drops stardust; respawn edge with invulnerability.
- Scoreboard top 10.
- Simple bots (auto reset when no humans present) — world remains paused until first human joins (fresh match start).
- Client: parallax starfield, interpolated planets, smooth ship movement, mobile fire button.

## Recent Changes
- Added pickup lifespan + max count pruning.
- Added createdAt to pickups & death drops; periodic cleanup.
- Paused idle world (awaitingFirstHuman) – full reset when first player joins; stop sim when last human leaves; bots cleared.
- Bot respawn now resets all progression.
- Improved planet interpolation & smoother movement client side.
- Added safeguards against dead players collecting pickups.
- Added distance & speed run stats to Game Over modal (internal state).

## Development
Prereqs: Node 18+ (or 20+), pnpm (Corepack enabled), optional Docker.

Install
```
corepack enable
pnpm i
```
Run dev (concurrently starts server :8008 & client :5173 with HMR):
```
pnpm dev
```
Open client:
```
http://localhost:5173
```
Environment overrides (server): create `packages/server/.env` (see `config.ts` for supported vars: PORT, HOST, TICK_HZ, SNAPSHOT_HZ, ROOM_CAP, BOTS_ENABLED, CORS_ORIGINS).

Useful scripts:
```
pnpm lint        # ESLint
pnpm format      # Prettier write
pnpm typecheck   # TS project refs
pnpm build       # Full build (all packages)
```

## Production (Docker Compose)
Build & run both (server + client served via nginx or vite preview depending on config):
```
docker compose up --build
```
Server default: http://localhost:8008
Client default: http://localhost:5173 (or mapped port if using static hosting container).

Standalone server image:
```
cd packages/server
docker build -t space-io-server .
```
Run:
```
docker run -p 8008:8008 space-io-server
```
Set env via `-e VAR=value` (PORT, HOST, SNAPSHOT_HZ, etc.).

## Controls
- Desktop: Move mouse to aim; ship thrusts toward pointer (continuous). SPACE / left click / FIRE button to shoot. T adds debug XP.
- Mobile: Tap/hold playfield to thrust toward pointer; on‑screen FIRE toggle.

## Powerups (Families)
Hull, Damage, Engine, FireRate, Magnet, Shield (+ Alt‑fire choice at level 10).

## Bots
Disabled/limited by config. Cleared when no humans. World resets on next human join.

## Project Goals
- Keep server CPU < 2 ms/tick @ target player count.
- Maintain readability for rapid jam iteration.
- Provide extension points (new powerups, alt‑fires, hazards) with minimal refactors.

## Troubleshooting
- Mixed content errors: Use HTTPS server URL when hosting over HTTPS (client auto upgrades http → https if needed).
- No movement: Ensure inputs sent after welcome (see console logs) & no simulation pause (must have at least one human).
- Performance spikes: Watch server logs for "slow tick" warnings; investigate heavy loops / large player counts.
- Assets failing: Clear cache / hard reload; confirm Vite dev server path.

## License / Usage
Internal jam project (no explicit license declared). Add a LICENSE file if distribution needed.

See `docs/` for deeper design & powerup specifics.
