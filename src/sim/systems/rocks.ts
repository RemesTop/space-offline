import { nanoid } from "nanoid";
import type { World } from "../world.js";
import { rndRange } from "@shared/math.js";
import { spawnDeathPickups } from "./deathDrops.js";
import { PLAYER } from "@shared/constants.js";
import { triggerPlasmaExplosion } from "./physics.js";

let rockSpawnAccumulator = 3000;

export const spawnRocks = (world: World, dtMs: number) => {
  rockSpawnAccumulator += dtMs;
  // Spawn a rock every 1.5 seconds, up to 20 rocks max
  if (rockSpawnAccumulator > 1500) {
    rockSpawnAccumulator -= 1500;
    if (world.rocks.size < 20) {
      const id = nanoid();
      const r = rndRange(35, 75);
      
      // Spawn outside map edges and drift inward
      const side = Math.floor(Math.random() * 3); // 0 = bottom, 1 = left, 2 = right
      const spawnDist = 200;
      const speed = rndRange(10, 25);
      let x = 0, y = 0, vx = 0, vy = 0;
      
      if (side === 0) { // bottom
        x = rndRange(0, world.w);
        y = world.h + spawnDist;
        vx = rndRange(-speed, speed);
        vy = -speed;
      } else if (side === 1) { // left
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
        
        // Bumper body logic
        if (p.specialVariants.includes('Bumper Body')) {
          // Bumper body pushes rock away strongly
          r.x -= nx * 60;
          r.y -= ny * 60;
          
          const rvDotN = r.vx * nx + r.vy * ny;
          if (rvDotN > 0) {
             r.vx -= 2.5 * rvDotN * nx;
             r.vy -= 2.5 * rvDotN * ny;
          } else {
             r.vx -= nx * 600;
             r.vy -= ny * 600;
          }

          // Emit BumperHit event
          world.events.push({ type: "BumperHit" as const, x: p.x - nx * r.r, y: p.y - ny * r.r }); 
        } else {
          // Normal Bounce player
          const vDotN = p.vx * nx + p.vy * ny;
          if (vDotN < 0) {
             p.vx -= 1.5 * vDotN * nx;
             p.vy -= 1.5 * vDotN * ny;
          }
          
          // Normal Bounce rock
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

  // Bullet collisions (bullets disappear on hit)
  const bulletsToRemove: string[] = [];
  for (const b of world.bullets.values()) {
    if (b.pierce) continue; // Piercing bullets fly right through rocks!
    for (const r of world.rocks.values()) {
      const dx = b.x - r.x;
      const dy = b.y - r.y;
      const d2 = dx*dx + dy*dy;
      const rad = b.r + r.r;
      if (d2 < rad*rad) {
        if (b.isPlasma) {
          triggerPlasmaExplosion(world, b, now);
        }
        bulletsToRemove.push(b.id);
        break; // Only remove bullet once
      }
    }
  }
  for (const id of bulletsToRemove) world.bullets.delete(id);

  // Wrap rocks around the map so they never "go invisible" for long
  const wrapMargin = 400;
  for (const [id, r] of world.rocks) {
    if (r.x < -wrapMargin) {
      r.x = world.w + wrapMargin;
    } else if (r.x > world.w + wrapMargin) {
      r.x = -wrapMargin;
    }
    
    if (r.y < -wrapMargin) {
      r.y = world.h + wrapMargin;
    } else if (r.y > world.h + wrapMargin) {
      r.y = -wrapMargin;
    }
  }
};
