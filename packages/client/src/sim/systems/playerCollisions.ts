import type { World, Player } from "../world.js";
import { spawnDeathPickups } from "./deathDrops.js";
import { PLAYER } from "@shared/constants.js";

export const handlePlayerCollisions = (world: World, dt: number): void => {
  const players = Array.from(world.players.values());
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      const p1 = players[i];
      const p2 = players[j];

      // Only check if at least one player has Bumper Body
      if (!p1.specialVariants.includes('Bumper Body') && !p2.specialVariants.includes('Bumper Body')) continue;
      
      // If one of them is already dead, skip
      if (p1.hp <= 0 || (p1.deadUntil && performance.now() < p1.deadUntil)) continue;
      if (p2.hp <= 0 || (p2.deadUntil && performance.now() < p2.deadUntil)) continue;

      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const d2 = dx * dx + dy * dy;
      const r = p1.r + p2.r;

      if (d2 < r * r) {
        const d = Math.sqrt(d2) || 1;
        const nx = dx / d;
        const ny = dy / d;
        
        // Push apart
        const overlap = r - d;
        p1.x -= nx * overlap * 0.5;
        p1.y -= ny * overlap * 0.5;
        p2.x += nx * overlap * 0.5;
        p2.y += ny * overlap * 0.5;

        // Flat positional bump for Bumper Body
        const bumpDist = 60;
        if (p1.specialVariants.includes('Bumper Body')) {
          p2.x += nx * bumpDist;
          p2.y += ny * bumpDist;
        }
        if (p2.specialVariants.includes('Bumper Body')) {
          p1.x -= nx * bumpDist;
          p1.y -= ny * bumpDist;
        }

        // Emit BumperHit event to players
        const hitEvent = { type: "BumperHit" as const, x: p1.x + nx * (overlap * 0.5), y: p1.y + ny * (overlap * 0.5) };
        for (const p of world.players.values()) {
          if (p.socketId) world.io?.emitEvent(p.socketId, hitEvent);
        }

        // Add velocity kick to bounce them off slightly
        const vDotN = p1.vx * nx + p1.vy * ny;
        if (vDotN > 0) {
           p1.vx -= 1.5 * vDotN * nx;
           p1.vy -= 1.5 * vDotN * ny;
        }
        const v2DotN = p2.vx * nx + p2.vy * ny;
        if (v2DotN < 0) {
           p2.vx -= 1.5 * v2DotN * nx;
           p2.vy -= 1.5 * v2DotN * ny;
        }

        // Apply damage
        const applyBumperDamage = (attacker: Player, victim: Player) => {
          // Flat 80 damage with 500ms cooldown
          const now = performance.now();
          if (now - (victim.lastBumperHitAt || 0) > 500) {
            const prevHp = victim.hp;
            victim.hp -= 80;
            victim.lastBumperHitAt = now;
            victim.lastDamageTakenAt = now;
            if (prevHp > 0 && victim.hp <= 0) {
              victim.deadUntil = now + (victim.socketId ? PLAYER.respawnDelayMs : 2000 + Math.random() * 45000);
              for (const p of world.players.values()) {
                if (p.socketId) {
                  world.io?.emitEvent(p.socketId, {
                    type: "Kill",
                    killerId: attacker.id,
                    victimId: victim.id,
                    victimScore: victim.score,
                    victimLevel: victim.level,
                    x: victim.x,
                    y: victim.y,
                  });
                }
              }
              spawnDeathPickups(world, victim);
            }
          }
        };

        if (p1.specialVariants.includes('Bumper Body') && !p2.specialVariants.includes('Bumper Body')) {
          applyBumperDamage(p1, p2);
        } else if (p2.specialVariants.includes('Bumper Body') && !p1.specialVariants.includes('Bumper Body')) {
          applyBumperDamage(p2, p1);
        }
        // Bumper body ships deal 0 bump damage to each other
      }
    }
  }
};
