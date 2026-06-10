import type { World, LocalEmitter } from "./world.js";
import { config } from "../config.js";
import { applyGravity, bulletHits, integrate } from "./systems/physics.js";
import { processInputs } from "./entities.js";
import { updatePickups } from "./systems/pickups.js";
import { handleDeathsAndRespawn } from "./systems/combat.js";
import { getScoreboard } from "./systems/scoreboard.js";
import { spawnBot, updateBots, cleanupBots, getBotCount } from "./systems/bots.js";
import { updatePlanetMovement } from "./systems/planetMovement.js";
import { handlePlayerCollisions } from "./systems/playerCollisions.js";
import { spawnRocks, handleRockCollisions } from "./systems/rocks.js";

// Basic performance metrics (can be expanded later)
let movingAvgTickMs = 0;
const alpha = 0.1; // EMA factor

// Internal reusable arrays to reduce allocations during snapshot creation
const reusablePlayerList: any[] = [];
const reusableBulletList: any[] = [];

let snapshotAccumulator = 0; // ms
let botSpawnAccumulator = 0; // ms

// Maximum ticks we allow to process per frame to avoid spiral of death
const MAX_CATCHUP_TICKS = 5;

// Logging threshold for a single tick (ms)
const TICK_WARN_MS = 12; // > ~12ms means can't sustain 60fps host

export const startLoop = (io: LocalEmitter, world: World) => {
  world.io = io;
  const tickDtMs = 1000 / config.tickHz;
  let last = performance.now();
  let accumulator = 0; // ms

  const frame = () => {
    const now = performance.now();
    let frameDt = now - last; // ms
    if (frameDt > 200) frameDt = 200; // safety cap spike (pause / debugger)
    last = now;
    accumulator += frameDt;

    let ticksProcessed = 0;
    while (accumulator >= tickDtMs && ticksProcessed < MAX_CATCHUP_TICKS) {
      const tickStart = performance.now();
      doSimTick(io, world, tickDtMs / 1000, now); // pass seconds dt
      const tickDuration = performance.now() - tickStart;
      movingAvgTickMs += (tickDuration - movingAvgTickMs) * alpha;
      if (tickDuration > TICK_WARN_MS) {
        // eslint-disable-next-line no-console
        console.warn(`[sim] slow tick ${tickDuration.toFixed(2)}ms (avg ${movingAvgTickMs.toFixed(2)}ms)`);
      }
      accumulator -= tickDtMs;
      ticksProcessed++;
    }

    // If we hit catch-up limit, drop remaining accumulated time to prevent spiral
    if (ticksProcessed === MAX_CATCHUP_TICKS && accumulator >= tickDtMs) {
      accumulator = 0;
    }

    // Schedule next frame ASAP
    setTimeout(frame, 1);
  };
  frame();
};

function doSimTick(io: LocalEmitter, world: World, dt: number, nowMs: number) {
  if (world.awaitingFirstHuman) return; // pause sim until a real player joins
  const now = nowMs; // keep original variable naming semantics for existing code
  world.tick++;

  // Bot management (ms accumulators)
  if (config.botsEnabled) {
    updateBots(world, now);
    cleanupBots(world);
    botSpawnAccumulator += dt * 1000;
    if (botSpawnAccumulator >= 3000) {
      botSpawnAccumulator = 0;
      const targetBotCount = 10; // Fixed 10 bots for singleplayer mode
      if (getBotCount() < targetBotCount) spawnBot(world);
    }
  }

  updatePlanetMovement(world, dt);
  processInputs(world, now);
  
  spawnRocks(world, dt * 1000);
  
  applyGravity(world, dt);
  integrate(world, dt);
  
  handlePlayerCollisions(world, dt);
  handleRockCollisions(world, now);
  
  bulletHits(world, dt, now);
  updatePickups(world);
  handleDeathsAndRespawn(world, now);

  // prune offscreen bullets (cheap)
  for (const [id, b] of world.bullets) {
    if (b.x < -100 || b.y < -100 || b.x > world.w + 100 || b.y > world.h + 100) {
      world.bullets.delete(id);
    }
  }

  snapshotAccumulator += dt * 1000;
  if (snapshotAccumulator >= 1000 / config.snapshotHz) {
    snapshotAccumulator = 0;
    // Defer snapshot emission to avoid blocking next physics tick
    setTimeout(() => ioSnapshot(io, world), 0);
  }
}

export const ioSnapshot = (io: LocalEmitter, world: World) => {
  // Build shared lists once per snapshot
  reusablePlayerList.length = 0;
  for (const op of world.players.values()) {
    if (op.hp <= 0) continue; // only alive
    reusablePlayerList.push({
      id: op.id,
      kind: "player",
      x: op.x,
      y: op.y,
      vx: op.vx,
      vy: op.vy,
      r: op.r,
      hp: op.hp,
      maxHp: op.maxHp,
      xp: op.xp,
      xpToNext: op.xpToNext,
      damage: op.damage,
      maxSpeed: op.maxSpeed,
      accel: op.accel,
      magnetRadius: op.magnetRadius,
      fireCooldownMs: op.fireCooldownMs,
      powerupLevels: op.powerupLevels,
      shield: op.shield,
      invulnUntil: op.invulnUntil,
      isInvuln: op.invulnUntil !== undefined && performance.now() < op.invulnUntil,
      isGiant: op.isGiant,
      name: op.name,
      socketId: op.socketId,
      aim: op.aim,
      level: op.level,
    });
  }
  reusableBulletList.length = 0;
  for (const b of world.bullets.values()) {
    reusableBulletList.push({
      id: b.id,
      kind: "bullet",
      x: b.x,
      y: b.y,
      vx: b.vx,
      vy: b.vy,
      r: b.r,
      ownerId: b.ownerId,
    });
  }

  const basePickups = Array.from(world.pickups.values()).map((p) => ({
    id: p.id,
    type: p.type,
    x: p.x,
    y: p.y,
    value: p.value,
  }));
  const wells = world.wells.map((w) => ({ ...w }));
  const scoreboard = getScoreboard(world);
  
  // Format rocks as entities for interpolation
  const reusableRockList = Array.from(world.rocks.values()).map(r => ({
    id: r.id,
    kind: "rock" as const,
    x: r.x,
    y: r.y,
    vx: r.vx,
    vy: r.vy,
    r: r.r,
    rotation: r.rotation,
  }));

  // Only send to real players
  for (const p of world.players.values()) {
    if (!p.socketId) continue;
    // Reuse arrays via spread to prevent accidental mutation cross-player
    io.emitSnapshot(p.socketId, {
      tick: world.tick,
      acks: { seq: p.lastAckSeq },
      youId: p.id,
      entities: [...reusablePlayerList, ...reusableBulletList, ...reusableRockList],
      pickups: basePickups,
      wells,
      scoreboard,
    });
  }
};
