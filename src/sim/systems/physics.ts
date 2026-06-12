import type { Bullet, World } from "../world.js";
import { GRAVITY, PLAYER } from "@shared/constants.js";
import { dist2 } from "@shared/math.js";
import { spawnDeathPickups } from "./deathDrops.js";

export const triggerPlasmaExplosion = (world: World, b: Bullet, now: number, excludeId?: string) => {
  const bumpDist = 45;
  const blastRadius = 120;
  for (const otherP of world.players.values()) {
    if (otherP.hp <= 0 || otherP.id === b.ownerId) continue;
    const dist = Math.hypot(otherP.x - b.x, otherP.y - b.y);
    if (dist < blastRadius) {
      const nx = (otherP.x - b.x) / (dist || 1);
      const ny = (otherP.y - b.y) / (dist || 1);
      otherP.x += nx * bumpDist;
      otherP.y += ny * bumpDist;
      otherP.vx += nx * 150;
      otherP.vy += ny * 150;
      if (otherP.id !== excludeId) {
        const prevOtherHp = otherP.hp;
        otherP.hp -= b.damage * 4.0; // splash damage
        otherP.lastDamageTakenAt = now;
        if (prevOtherHp > 0 && otherP.hp <= 0) {
          otherP.deadUntil = now + (otherP.socketId ? PLAYER.respawnDelayMs : 2000 + Math.random() * 45000);
          world.events.push({
            type: "Kill",
            killerId: b.ownerId,
            victimId: otherP.id,
            victimScore: otherP.score,
            victimLevel: otherP.level,
            x: otherP.x,
            y: otherP.y,
          });
          spawnDeathPickups(world, otherP);
          const owner = world.players.get(b.ownerId);
          if (owner) {
            owner.kills = (owner.kills || 0) + 1;
            owner.xp += Math.max(10, otherP.xp * 0.5);
          }
        }
      }
    }
  }
  world.events.push({ type: "PlasmaHit", x: b.x, y: b.y });
};

export const applyGravity = (world: World, dt: number) => {
  for (const p of world.players.values()) {
    for (const w of world.wells) {
      if (p.specialVariants.includes('Zero gravity')) continue;
      
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
      if (w.type === "sun" && d < w.radius) {
        const prevHp = p.hp;
        p.hp -= GRAVITY.sunHeatDps * dt;
        p.lastDamageTakenAt = performance.now();
        if (prevHp > 0 && p.hp <= 0) {
          p.deadUntil = performance.now() + (p.socketId ? PLAYER.respawnDelayMs : Math.random() * 45000);
          world.events.push({
            type: "Kill",
            killerId: null, // Environmental death
            victimId: p.id,
            victimScore: p.score,
            victimLevel: p.level,
            x: p.x,
            y: p.y,
          });
          spawnDeathPickups(world, p);
        }
      }

      if (w.type === "planet" && d < w.radius + p.r) { 
        // hard collision bounce
        const nx = dx / d,
          ny = dy / d;
        const overlap = (w.radius + p.r) - d;
        
        // smooth push out
        p.x -= nx * overlap;
        p.y -= ny * overlap;

        const vDotN = p.vx * nx + p.vy * ny;
        // only bounce if moving towards the planet
        if (vDotN > 0) {
          p.vx -= 1.8 * vDotN * nx;
          p.vy -= 1.8 * vDotN * ny;
          
          if (performance.now() >= p.invulnUntil) {
            const prevHp = p.hp;
            p.hp -= 20; // Flat damage, just like rocks
            p.lastDamageTakenAt = performance.now();
            if (prevHp > 0 && p.hp <= 0) {
              p.deadUntil = performance.now() + (p.socketId ? PLAYER.respawnDelayMs : Math.random() * 45000);
              world.events.push({
                type: "Kill",
                killerId: null,
                victimId: p.id,
                victimScore: p.score,
                victimLevel: p.level,
                x: p.x,
                y: p.y,
              });
              spawnDeathPickups(world, p);
            }
          }
        }
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
  const rocksToDelete: { id: string; x: number; y: number }[] = [];
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

      // Planets, suns, and blackholes destroy rocks on impact
      if ((w.type === "planet" || w.type === "sun" || w.type === "blackhole") && d < w.radius + r.r) {
         // Mark for deletion; spawnRocks() will replace them naturally
         rocksToDelete.push({ id: r.id, x: r.x, y: r.y });
      }
    }
  }
  for (const rock of rocksToDelete) {
    world.rocks.delete(rock.id);
    // Emit BumperHit animation to all real players
    world.events.push({ type: "BumperHit" as const, x: rock.x, y: rock.y });
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
    // Cap rock speed so they don't fly too fast after being bumped
    const rSpd = Math.hypot(rock.vx, rock.vy);
    const maxRockSpeed = 300;
    if (rSpd > maxRockSpeed) {
      rock.vx = (rock.vx / rSpd) * maxRockSpeed;
      rock.vy = (rock.vy / rSpd) * maxRockSpeed;
    }
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
      if (b.isPlasma) {
        triggerPlasmaExplosion(world, b, now);
      }
      toRemove.push(b.id);
      continue;
    }
    for (const p of world.players.values()) {
      if (p.hp <= 0 || p.id === b.ownerId) continue;
      const r = p.r + b.r;
      const prevX = b.x - b.vx * dt;
      const prevY = b.y - b.vy * dt;

      let segStartX = prevX;
      let segStartY = prevY;
      
      // For lasers, they are visually much longer (r * 10), so they should hit anything touching that visual line.
      if (b.isLaser) {
        const length = b.r * 10;
        const mag = Math.hypot(b.vx, b.vy) || 1;
        segStartX = b.x - (b.vx / mag) * length;
        segStartY = b.y - (b.vy / mag) * length;
      }

      // Segment-point distance squared
      const l2 = dist2({x: segStartX, y: segStartY}, {x: b.x, y: b.y});
      let t = 0;
      if (l2 > 0) {
        t = ((p.x - segStartX) * (b.x - segStartX) + (p.y - segStartY) * (b.y - segStartY)) / l2;
        t = Math.max(0, Math.min(1, t));
      }
      const projX = segStartX + t * (b.x - segStartX);
      const projY = segStartY + t * (b.y - segStartY);

      if (dist2({ x: projX, y: projY }, { x: p.x, y: p.y }) < r * r) {
        if (!b.hitTargets) b.hitTargets = new Set();
        if (b.hitTargets.has(p.id)) continue;

        if (now < p.invulnUntil) {
          toRemove.push(b.id);
          break;
        }

        b.hitTargets.add(p.id);
        const prevHp = p.hp;
        p.hp -= b.damage;
        p.lastDamageTakenAt = now;

        if (b.isPlasma) {
          triggerPlasmaExplosion(world, b, now, p.id);
        }

        if (prevHp > 0 && p.hp <= 0) {
          p.deadUntil = now + (p.socketId ? PLAYER.respawnDelayMs : 2000 + Math.random() * 45000);
          // Emit kill event for explosion effect to everyone
          world.events.push({
            type: "Kill",
            killerId: b.ownerId,
            victimId: p.id,
            victimScore: p.score,
            victimLevel: p.level,
            x: p.x,
            y: p.y,
          });
          spawnDeathPickups(world, p);
        }

        if (!b.pierce) {
          toRemove.push(b.id);
        }
        break;
      }
    }
  }
  for (const id of toRemove) world.bullets.delete(id);
};
