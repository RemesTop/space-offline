import type { World, Player } from "../world.js";
import { spawnDeathPickups } from "./deathDrops.js";
import { PLAYER } from "@shared/constants.js";

export const handlePlayerCollisions = (world: World, dt: number): void => {
  return; // Disabled player-player collisions
};
