import type { World, Player } from "../world.js";
import { randEdgeSpawn } from "../world.js";
import { PLAYER, BULLET, PICKUPS } from "@shared/constants.js";
import { xpForLevel, applyLevelChoice } from "../entities.js";
import { spawnDeathPickups } from "./deathDrops.js";
import { getRandomBotName } from "./bots.js";

export const handleDeathsAndRespawn = (world: World, now: number) => {
  for (const p of world.players.values()) {
    if (p.hp > 0) continue;
    // Safety: if deadUntil not set (some death path missed), set & spawn drops now
    if (!p.deadUntil) {
      spawnDeathPickups(world, p);
      p.deadUntil = now + (p.socketId ? PLAYER.respawnDelayMs : 2000 + Math.random() * 60000);
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
        p.specialVariants = [];
        p.altFire = undefined;
        p.score = 0;
        p.name = getRandomBotName();

        let maxPlayerLevel = 0;
        for (const player of world.players.values()) {
          if (player.socketId && player.level > maxPlayerLevel) {
            maxPlayerLevel = player.level;
          }
        }

        if (!p.isGiant && maxPlayerLevel >= 15) {
          p.maxHp += 50;
          for (let i = 0; i < 2; i++) {
            const upgradeRnd = Math.random();
            if (upgradeRnd < 0.25) {
              p.powerupLevels.Damage++;
              p.damage += 4;
            } else if (upgradeRnd < 0.5) {
              p.powerupLevels.Engine++;
              p.maxSpeed += 40;
              p.accel += 80;
            } else if (upgradeRnd < 0.75) {
              p.powerupLevels.FireRate++;
              p.fireCooldownMs = Math.max(100, p.fireCooldownMs - 30);
            } else {
              p.powerupLevels.Hull++;
              p.maxHp += 40;
            }
          }
        }
      }

      // Base respawn stats
      p.hp = p.maxHp;
      p.invulnUntil = now + PLAYER.invulnMs;
      p.deadUntil = undefined;
    }
  }
};

