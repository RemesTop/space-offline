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
      if (p1.specialVariant !== 'Bumper Body' && p2.specialVariant !== 'Bumper Body') continue;
      
      // If one of them is already dead, skip
      if (p1.hp <= 0 || p2.hp <= 0) continue;

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
        const push1 = p1.specialVariant === 'Bumper Body' ? 0.2 : 0.8;
        const push2 = p2.specialVariant === 'Bumper Body' ? 0.2 : 0.8;

        p1.x -= nx * overlap * push1;
        p1.y -= ny * overlap * push1;
        p2.x += nx * overlap * push2;
        p2.y += ny * overlap * push2;

        // Add velocity kick
        const kickStrength = 400;
        if (p1.specialVariant === 'Bumper Body') {
          p2.vx += nx * kickStrength;
          p2.vy += ny * kickStrength;
        } else {
          p1.vx -= nx * kickStrength;
          p1.vy -= ny * kickStrength;
        }

        // Apply damage
        const applyBumperDamage = (attacker: Player, victim: Player) => {
          const prevHp = victim.hp;
          victim.hp -= 20 * dt; // DPS
          victim.lastDamageTakenAt = performance.now();
          if (prevHp > 0 && victim.hp <= 0) {
            victim.deadUntil = performance.now() + (victim.socketId ? PLAYER.respawnDelayMs : 8000);
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
        };

        if (p1.specialVariant === 'Bumper Body' && p2.specialVariant !== 'Bumper Body') {
          applyBumperDamage(p1, p2);
        } else if (p2.specialVariant === 'Bumper Body' && p1.specialVariant !== 'Bumper Body') {
          applyBumperDamage(p2, p1);
        } else if (p1.specialVariant === 'Bumper Body' && p2.specialVariant === 'Bumper Body') {
          applyBumperDamage(p1, p2);
          applyBumperDamage(p2, p1);
        }
      }
    }
  }
};
