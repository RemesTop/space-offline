import type { World } from "../world.js";
import { GRAVITY, PLAYER } from "@shared/constants.js";
import { dist2 } from "@shared/math.js";
import { spawnDeathPickups } from "./deathDrops.js";

export const applyGravity = (world: World, dt: number) => {
  for (const p of world.players.values()) {
    for (const w of world.wells) {
      if (p.specialVariant === 'Gravity Point') continue;
      
      const dx = w.x - p.x;
      const dy = w.y - p.y;
      const d2 = dx * dx + dy * dy;
      if (d2 > w.influenceRadius * w.influenceRadius) continue;
      const force = Math.min((GRAVITY.G * w.mass) / (d2 + GRAVITY.epsilon), w.maxPull);
      const d = Math.sqrt(d2) || 1;
      const ax = (dx / d) * (force / Math.max(1, p.mass));
      const ay = (dy / d) * (force / Math.max(1, p.mass));
      p.vx += ax * dt;
      p.vy += ay * dt;

      // heat / edge damage cones
      if (w.type === "sun" && d < w.radius + 60) {
        const prevHp = p.hp;
        p.hp -= GRAVITY.sunHeatDps * dt;
        p.lastDamageTakenAt = performance.now();
        if (prevHp > 0 && p.hp <= 0) {
          p.deadUntil = performance.now() + (p.socketId ? PLAYER.respawnDelayMs : Math.random() * 45000);
          for (const player of world.players.values()) {
            if (player.socketId) {
              world.io?.emitEvent(player.socketId, {
                type: "Kill",
                killerId: null, // Environmental death
                victimId: p.id,
                victimScore: p.score,
                victimLevel: p.level,
                x: p.x,
                y: p.y,
              });
            }
          }
          spawnDeathPickups(world, p);
        }
      }
      if (w.type === "blackhole" && d < w.radius + 40) {
        const prevHp = p.hp;
        p.hp -= GRAVITY.blackHoleEdgeDps * dt;
        p.lastDamageTakenAt = performance.now();
        if (prevHp > 0 && p.hp <= 0) {
          p.deadUntil = performance.now() + (p.socketId ? PLAYER.respawnDelayMs : Math.random() * 45000);
          for (const player of world.players.values()) {
            if (player.socketId) {
              world.io?.emitEvent(player.socketId, {
                type: "Kill",
                killerId: null, // Environmental death
                victimId: p.id,
                victimScore: p.score,
                victimLevel: p.level,
                x: p.x,
                y: p.y,
              });
            }
          }
          spawnDeathPickups(world, p);
        }
      }
      if (w.type === "planet" && d < w.radius + p.r + 30) { // Increased collision radius by 30
        // Damage-over-time based on impact speed (no instant large chunk)
        const impactSpeed = Math.hypot(p.vx, p.vy);
        const { speedThreshold, baseDps, maxSpeedMultiplier } = GRAVITY.planetCollision;
        if (impactSpeed > speedThreshold) {
          const speedFactor = Math.min(maxSpeedMultiplier, impactSpeed / speedThreshold);
          const damage = baseDps * speedFactor * dt; // DPS scaled by speed and frame time
          const prevHp = p.hp;
          p.hp -= damage;
          p.lastDamageTakenAt = performance.now();
          if (prevHp > 0 && p.hp <= 0) {
            p.deadUntil = performance.now() + (p.socketId ? PLAYER.respawnDelayMs : Math.random() * 45000);
            // Emit to all players so everyone sees the explosion
            for (const player of world.players.values()) {
              if (player.socketId) {
                world.io?.emitEvent(player.socketId, {
                  type: "Kill",
                  killerId: null,
                  victimId: p.id,
                  victimScore: p.score,
                  victimLevel: p.level,
                  x: p.x,
                  y: p.y,
                });
              }
            }
            spawnDeathPickups(world, p);
          }
        }
        // hard collision bounce
        const nx = dx / d,
          ny = dy / d;
        const vDotN = p.vx * nx + p.vy * ny;
        if (vDotN > 0) continue;
        p.vx -= 1.8 * vDotN * nx;
        p.vy -= 1.8 * vDotN * ny;
        // clip outside (using the larger collision radius)
        p.x = w.x - nx * (w.radius + p.r + 30 + 1);
        p.y = w.y - ny * (w.radius + p.r + 30 + 1);
      }
    }
  }
  for (const b of world.bullets.values()) {
    for (const w of world.wells) {
      const dx = w.x - b.x;
      const dy = w.y - b.y;
      const d2 = dx * dx + dy * dy;
      if (d2 > w.influenceRadius * w.influenceRadius) continue;
      const force = Math.min((GRAVITY.G * w.mass) / (d2 + GRAVITY.epsilon), w.maxPull);
      const d = Math.sqrt(d2) || 1;
      const ax = (dx / d) * force * 0.2;
      const ay = (dy / d) * force * 0.2;
      b.vx += ax * dt;
      b.vy += ay * dt;
    }
  }
  for (const r of world.rocks.values()) {
    for (const w of world.wells) {
      const dx = w.x - r.x;
      const dy = w.y - r.y;
      const d2 = dx * dx + dy * dy;
      if (d2 > w.influenceRadius * w.influenceRadius) continue;
      const force = Math.min((GRAVITY.G * w.mass) / (d2 + GRAVITY.epsilon), w.maxPull);
      const d = Math.sqrt(d2) || 1;
      // Rocks are affected by gravity, but less so than players
      const ax = (dx / d) * force * 0.4;
      const ay = (dy / d) * force * 0.4;
      r.vx += ax * dt;
      r.vy += ay * dt;

      // Optional: hard collision with planets for rocks?
      if (w.type === "planet" && d < w.radius + r.r) {
         const nx = dx / d, ny = dy / d;
         const vDotN = r.vx * nx + r.vy * ny;
         if (vDotN < 0) {
           r.vx -= 1.8 * vDotN * nx;
           r.vy -= 1.8 * vDotN * ny;
         }
         r.x = w.x - nx * (w.radius + r.r + 1);
         r.y = w.y - ny * (w.radius + r.r + 1);
      } else if ((w.type === "sun" || w.type === "blackhole") && d < w.radius + r.r) {
         // Teleport far away to trigger cleanup and allow respawn
         r.x = -5000;
      }
    }
  }
};

export const integrate = (world: World, dt: number) => {
  for (const p of world.players.values()) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    // World edge bounce
    const bounceRestitution = 0.9; // energy retained (1 = perfect, <1 loses speed)
    const minBounceSpeed = 140; // ensure a noticeable kick away
    // Left
    if (p.x < p.r) {
      p.x = p.r;
      p.vx = Math.max(minBounceSpeed, Math.abs(p.vx) * bounceRestitution); // push right
    }
    // Right
    if (p.x > world.w - p.r) {
      p.x = world.w - p.r;
      p.vx = -Math.max(minBounceSpeed, Math.abs(p.vx) * bounceRestitution); // push left
    }
    // Top
    if (p.y < p.r) {
      p.y = p.r;
      p.vy = Math.max(minBounceSpeed, Math.abs(p.vy) * bounceRestitution); // push down
    }
    // Bottom
    if (p.y > world.h - p.r) {
      p.y = world.h - p.r;
      p.vy = -Math.max(minBounceSpeed, Math.abs(p.vy) * bounceRestitution); // push up
    }
  }
  for (const b of world.bullets.values()) {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
  }
  for (const rock of world.rocks.values()) {
    rock.x += rock.vx * dt;
    rock.y += rock.vy * dt;
    rock.rotation = (rock.rotation || 0) + (rock.vx > 0 ? 0.5 : -0.5) * dt;
  }
};

export const bulletHits = (world: World, dt: number, now: number) => {
  const toRemove: string[] = [];
  for (const b of world.bullets.values()) {
    b.ttl -= dt * 1000;
    if (b.ttl <= 0) {
      toRemove.push(b.id);
      continue;
    }
    for (const p of world.players.values()) {
      if (p.hp <= 0 || p.id === b.ownerId) continue;
      const r = p.r + b.r;
      if (dist2({ x: b.x, y: b.y }, { x: p.x, y: p.y }) < r * r) {
        if (now < p.invulnUntil) {
          toRemove.push(b.id);
          break;
        }
        const prevHp = p.hp;
        p.hp -= b.damage;
        p.lastDamageTakenAt = now;
        if (!b.pierce) toRemove.push(b.id);
        if (prevHp > 0 && p.hp <= 0) {
          p.deadUntil = now + (p.socketId ? PLAYER.respawnDelayMs : Math.random() * 45000);
          // Emit kill event for explosion effect to everyone
          for (const player of world.players.values()) {
            if (player.socketId) {
              world.io?.emitEvent(player.socketId, {
                type: "Kill",
                killerId: b.ownerId,
                victimId: p.id,
                victimScore: p.score,
                victimLevel: p.level,
                x: p.x,
                y: p.y,
              });
            }
          }
          spawnDeathPickups(world, p);
        }
        break;
      }
    }
  }
  for (const id of toRemove) world.bullets.delete(id);
};
