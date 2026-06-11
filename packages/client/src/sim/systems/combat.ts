import type { World, Player } from "../world.js";
import { randEdgeSpawn } from "../world.js";
import { PLAYER, BULLET, PICKUPS } from "@shared/constants.js";
import { xpForLevel, applyLevelChoice } from "../entities.js";
import { spawnDeathPickups } from "./deathDrops.js";

export const handleDeathsAndRespawn = (world: World, now: number) => {
  for (const p of world.players.values()) {
    if (p.hp > 0) continue;
    // Safety: if deadUntil not set (some death path missed), set & spawn drops now
    if (!p.deadUntil) {
      spawnDeathPickups(world, p);
      p.deadUntil = now + (p.socketId ? PLAYER.respawnDelayMs : Math.random() * 45000);
    }
    if (now >= p.deadUntil) {
      const pos = randEdgeSpawn(world);
      p.x = pos.x;
      p.y = pos.y;
      p.vx = 0;
      p.vy = 0;
      
      // If it's a bot, reset all stats completely
      if (!p.socketId) {
        p.maxHp = PLAYER.baseHP + (p.isGiant ? 200 : 0);
        p.accel = PLAYER.baseAccel;
        p.maxSpeed = PLAYER.baseMaxSpeed;
        p.damage = BULLET.baseDamage;
        p.fireCooldownMs = BULLET.cooldownMs;
        p.shield = 0;
        p.magnetRadius = PICKUPS.magnetBaseRadius;
        p.xp = 0;
        p.level = 1;
        p.xpToNext = xpForLevel(2);
        p.powerupLevels = { Hull: 0, Damage: 0, Engine: 0, FireRate: 0, Magnet: 0, Wings: 0 };
        p.specialVariant = undefined;
        p.altFire = undefined;
        p.score = 0;
      }

      // Base respawn stats
      p.hp = p.maxHp;
      p.invulnUntil = now + PLAYER.invulnMs;
      p.deadUntil = undefined;
    }
  }
};

