import type { World } from "../world.js";
import { collectPickups, spawnPickupsIfNeeded } from "../entities.js";
import { PICKUPS } from "@shared/constants.js";

export const updatePickups = (world: World) => {
  spawnPickupsIfNeeded(world);
  collectPickups(world);
  // Despawn old pickups
  const now = Date.now();
  for (const [id, p] of world.pickups) {
    if (now - p.createdAt > PICKUPS.lifespanMs) {
      world.pickups.delete(id);
    }
  }
  // Hard cap pruning if somehow exceeds maxCount (remove oldest first)
  if (world.pickups.size > PICKUPS.maxCount) {
    const sorted = Array.from(world.pickups.values()).sort((a, b) => a.createdAt - b.createdAt);
    const removeCount = world.pickups.size - PICKUPS.maxCount;
    for (let i = 0; i < removeCount; i++) {
      world.pickups.delete(sorted[i].id);
    }
  }
};
