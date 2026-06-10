import { nanoid } from "nanoid";
import type { World } from "../world.js";
import { rndRange } from "@shared/math.js";
import { spawnDeathPickups } from "./deathDrops.js";
import { PLAYER } from "@shared/constants.js";

let rockSpawnAccumulator = 0;

export const spawnRocks = (world: World, dtMs: number) => {
  rockSpawnAccumulator += dtMs;
  // Spawn a rock every 3 seconds, up to 15 rocks max
  if (rockSpawnAccumulator > 3000) {
    rockSpawnAccumulator -= 3000;
    if (world.rocks.size < 15) {
      const id = nanoid();
      // More varying sizes
      const r = rndRange(15, 120);
      
      let x = 0, y = 0, vx = 0, vy = 0;

      const side = Math.floor(Math.random() * 4);
      const speed = rndRange(40, 150);
      const spawnDist = 400; // spawn outside world boundary
      
      if (side === 0) { // top
        x = rndRange(0, world.w);
        y = -spawnDist;
        vx = rndRange(-speed, speed);
        vy = speed;
      } else if (side === 1) { // bottom
        x = rndRange(0, world.w);
        y = world.h + spawnDist;
        vx = rndRange(-speed, speed);
        vy = -speed;
      } else if (side === 2) { // left
        x = -spawnDist;
        y = rndRange(0, world.h);
        vx = speed;
        vy = rndRange(-speed, speed);
      } else { // right
        x = world.w + spawnDist;
        y = rndRange(0, world.h);
        vx = -speed;
        vy = rndRange(-speed, speed);
      }
      
      world.rocks.set(id, { id, x, y, vx, vy, r, rotation: Math.random() * Math.PI * 2 });
    }
  }
};

export const updateRocks = (world: World, dtSec: number) => {
  const toDelete = [];
  for (const rock of world.rocks.values()) {
    rock.x += rock.vx * dtSec;
    rock.y += rock.vy * dtSec;
    rock.rotation = (rock.rotation || 0) + (rock.vx > 0 ? 0.5 : -0.5) * dtSec;
    
    // Despawn if they get extremely far from the map (clean up)
    if (rock.x < -2000 || rock.x > world.w + 2000 || rock.y < -2000 || rock.y > world.h + 2000) {
      toDelete.push(rock.id);
    }
  }
  for (const id of toDelete) world.rocks.delete(id);
};

export const handleRockCollisions = (world: World, now: number) => {
  // Player collisions
  for (const p of world.players.values()) {
    if (p.hp <= 0 || (p.deadUntil && now < p.deadUntil)) continue;
    
    for (const r of world.rocks.values()) {
      const dx = p.x - r.x;
      const dy = p.y - r.y;
      const d2 = dx*dx + dy*dy;
      const rad = p.r + r.r;
      if (d2 < rad*rad) {
        const dist = Math.sqrt(d2) || 1;
        const nx = dx/dist;
        const ny = dy/dist;
        
        // Push apart
        const overlap = rad - dist;
        p.x += nx * overlap * 0.5;
        p.y += ny * overlap * 0.5;
        r.x -= nx * overlap * 0.5;
        r.y -= ny * overlap * 0.5;
        
        // Bounce player
        const vDotN = p.vx * nx + p.vy * ny;
        if (vDotN < 0) {
           p.vx -= 1.5 * vDotN * nx;
           p.vy -= 1.5 * vDotN * ny;
        }
        
        // Bounce rock
        const rvDotN = r.vx * nx + r.vy * ny;
        if (rvDotN > 0) {
           r.vx -= 1.0 * rvDotN * nx;
           r.vy -= 1.0 * rvDotN * ny;
        }
        
        // Damage
        if (now >= p.invulnUntil) {
          const prevHp = p.hp;
          p.hp -= 20;
          if (prevHp > 0 && p.hp <= 0) {
            p.deadUntil = now + PLAYER.respawnDelayMs;
            if (p.socketId) {
              world.io?.emitEvent(p.socketId, {
                type: "Kill",
                killerId: null,
                victimId: p.id,
                victimScore: p.score,
                victimLevel: p.level,
                x: p.x,
                y: p.y,
              });
            }
            spawnDeathPickups(world, p);
          }
        }
      }
    }
  }

  // Bullet collisions (bullets disappear on hit)
  const bulletsToRemove: string[] = [];
  for (const b of world.bullets.values()) {
    for (const r of world.rocks.values()) {
      const dx = b.x - r.x;
      const dy = b.y - r.y;
      const d2 = dx*dx + dy*dy;
      const rad = b.r + r.r;
      if (d2 < rad*rad) {
        bulletsToRemove.push(b.id);
        break; // Only remove bullet once
      }
    }
  }
  for (const id of bulletsToRemove) world.bullets.delete(id);
};
