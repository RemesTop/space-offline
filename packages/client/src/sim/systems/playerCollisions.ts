import type { World, Player } from "../world.js";
import { spawnDeathPickups } from "./deathDrops.js";
import { PLAYER } from "@shared/constants.js";

export const handlePlayerCollisions = (world: World, dt: number): void => {
  const players = Array.from(world.players.values());

  // Check all pairs of players for collisions
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      const p1 = players[i];
      const p2 = players[j];

      // Skip if either player is dead
      const now = performance.now();
      if ((p1.deadUntil && now < p1.deadUntil) || (p2.deadUntil && now < p2.deadUntil)) {
        continue;
      }

      // Skip if either player is invulnerable
      if (now < p1.invulnUntil || now < p2.invulnUntil) {
        continue;
      }

      // Calculate distance between players
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const distance = Math.hypot(dx, dy);
      const minDistance = p1.r + p2.r;

      // Check if players are colliding
      if (distance < minDistance && distance > 0) {
        // Normalize collision vector
        const nx = dx / distance;
        const ny = dy / distance;

        // Calculate relative velocity
        const relativeVx = p2.vx - p1.vx;
        const relativeVy = p2.vy - p1.vy;

        // Calculate relative velocity along collision normal
        const relativeSpeed = relativeVx * nx + relativeVy * ny;

        // Don't resolve if objects are separating
        if (relativeSpeed > 0) continue;

        // Calculate collision impulse (elastic collision)
        const restitution = 0.8; // Bouncy but not perfectly elastic
        const impulse = -(1 + restitution) * relativeSpeed;

        // Calculate mass-based impulse distribution
        const totalMass = Math.max(1, p1.mass) + Math.max(1, p2.mass);
        const p1Factor = Math.max(1, p2.mass) / totalMass;
        const p2Factor = Math.max(1, p1.mass) / totalMass;

        // Apply velocity changes
        p1.vx -= impulse * p1Factor * nx;
        p1.vy -= impulse * p1Factor * ny;
        p2.vx += impulse * p2Factor * nx;
        p2.vy += impulse * p2Factor * ny;

        // Separate overlapping players
        const overlap = minDistance - distance;
        const separationDistance = overlap * 0.5 + 1; // Add 1 pixel buffer

        p1.x -= nx * separationDistance * p1Factor;
        p1.y -= ny * separationDistance * p1Factor;
        p2.x += nx * separationDistance * p2Factor;
        p2.y += ny * separationDistance * p2Factor;

        // Apply collision damage based on impact speed
        const impactSpeed = Math.abs(relativeSpeed);
        const damageThreshold = 100; // Minimum speed to cause damage

        if (impactSpeed > damageThreshold) {
          const baseDamage = 5;
          const speedMultiplier = Math.min(3, impactSpeed / 200); // Cap damage multiplier
          const damage = baseDamage * speedMultiplier;

          const p1PrevHp = p1.hp;
          const p2PrevHp = p2.hp;

          // Apply damage to both players
          p1.hp = Math.max(0, p1.hp - damage);
          p2.hp = Math.max(0, p2.hp - damage);

          // Emit explosion events for any players that died
          if (p1PrevHp > 0 && p1.hp <= 0) {
            p1.deadUntil = now + (p1.socketId ? PLAYER.respawnDelayMs : 8000);
            for (const player of world.players.values()) {
              if (player.socketId) {
                world.io?.emitEvent(player.socketId, {
                  type: "Kill",
                  killerId: p2.id,
                  victimId: p1.id,
                  victimScore: p1.score,
                  victimLevel: p1.level,
                  x: p1.x,
                  y: p1.y,
                });
              }
            }
            spawnDeathPickups(world, p1);
          }
          if (p2PrevHp > 0 && p2.hp <= 0) {
            p2.deadUntil = now + (p2.socketId ? PLAYER.respawnDelayMs : 8000);
            for (const player of world.players.values()) {
              if (player.socketId) {
                world.io?.emitEvent(player.socketId, {
                  type: "Kill", 
                  killerId: p1.id,
                  victimId: p2.id,
                  victimScore: p2.score,
                  victimLevel: p2.level,
                  x: p2.x,
                  y: p2.y,
                });
              }
            }
            spawnDeathPickups(world, p2);
          }

          // Brief invulnerability to prevent damage spam
          const invulnDuration = 500; // 0.5 seconds
          p1.invulnUntil = Math.max(p1.invulnUntil, now + invulnDuration);
          p2.invulnUntil = Math.max(p2.invulnUntil, now + invulnDuration);
        }
      }
    }
  }
};
