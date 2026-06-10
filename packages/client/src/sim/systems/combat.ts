import type { World, Player } from "../world.js";
import { randEdgeSpawn } from "../world.js";
import { PLAYER, BULLET, PICKUPS } from "@shared/constants.js";
import { xpForLevel } from "../entities.js";
import { spawnDeathPickups } from "./deathDrops.js";

export const handleDeathsAndRespawn = (world: World, now: number) => {
  for (const p of world.players.values()) {
    if (p.hp > 0) continue;
    // Safety: if deadUntil not set (some death path missed), set & spawn drops now
    if (!p.deadUntil) {
      spawnDeathPickups(world, p);
      p.deadUntil = now + (p.socketId ? PLAYER.respawnDelayMs : 8000);
    }
    if (now >= p.deadUntil) {
      const pos = randEdgeSpawn(world);
      p.x = pos.x;
      p.y = pos.y;
      p.vx = 0;
      p.vy = 0;
      // Base respawn stats
      p.hp = p.maxHp;
      p.invulnUntil = now + PLAYER.invulnMs;
      p.deadUntil = undefined;
    }
  }
};
