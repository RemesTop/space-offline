import { nanoid } from "nanoid";
import type { World, Player, Pickup } from "../world.js";
import { rndRange } from "@shared/math.js";
import { PICKUPS, WORLD } from "@shared/constants.js";

/**
 * Spawn a small burst of XP pickups ("stardust") around a dead ship.
 * Simple + deterministic-ish: 5-8 orbs in a loose ring with slight random jitter.
 * Only XP type (never HP) so death always feels rewarding to others nearby.
 */
export function spawnDeathPickups(world: World, player: Player) {
  // Don't spawn if player position somehow outside world (sanity clamp)
  const cx = Math.min(Math.max(player.x, 20), WORLD.w - 20);
  const cy = Math.min(Math.max(player.y, 20), WORLD.h - 20);

  // Number of orbs: base 6 +/-1 plus tiny bonus for higher level
  const base = 6 + Math.floor(Math.min(2, player.level / 10));
  const count = base + (Math.random() < 0.5 ? 0 : 1);
  const radius = 40; // radial spread distance

  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + rndRange(-0.2, 0.2);
    const dist = rndRange(radius * 0.5, radius);
    const x = cx + Math.cos(angle) * dist;
    const y = cy + Math.sin(angle) * dist;
    const id = nanoid();
    // XP value: small random in existing xpValueRange bounds (favor smaller end)
    const min = PICKUPS.xpValueRange[0];
    const max = PICKUPS.xpValueRange[1];
    const isWhite = player.isGiant || (!player.socketId && player.level > 5);
    const value = Math.floor(rndRange(min, (min + max) / 2)) * (isWhite ? 2 : 1);
    const pu: Pickup = {
      id,
      type: isWhite ? "xp-giant" : "xp",
      x,
      y,
      r: 10,
      value,
      createdAt: Date.now(),
    };
    world.pickups.set(id, pu);
  }

  // Drop a health pickup if it's a bot
  if (!player.socketId) {
    const id = nanoid();
    world.pickups.set(id, {
      id,
      type: "hp",
      x: cx,
      y: cy,
      r: 10,
      value: 20, // Health restore amount
      createdAt: Date.now(),
    });
  }
}
