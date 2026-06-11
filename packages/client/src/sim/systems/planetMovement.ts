import { GRAVITY, WORLD } from "@shared/constants.js";
import type { World } from "../world.js";

const spawnBlackhole = (well: any, worldWidth: number, worldHeight: number) => {
  const side = Math.random() < 0.5 ? "left" : "right";
  const margin = 150;
  well.radius = 170;
  well.influenceRadius = 700;
  well.mass = 4.5e6;
  well.maxPull = 280;

  if (side === "left") {
    well.x = -well.influenceRadius;
    well.vx = 80 + Math.random() * 40; // Moves right
  } else {
    well.x = worldWidth + well.influenceRadius;
    well.vx = -(80 + Math.random() * 40); // Moves left
  }
  well.y = Math.random() * (worldHeight - 2 * margin) + margin;
  well.vy = (Math.random() * 2 - 1) * 35; // Small up or down movement
};

// Planets now derive entirely from GRAVITY.wells (shared constants).
// We only move them and wrap them back to the top keeping original stats & id.
export const updatePlanetMovement = (world: World, dt: number): void => {
  const scrollSpeed = GRAVITY.planetScrollSpeed;

  for (const well of world.wells) {
    if (well.type === "planet" || well.type === "sun") {
      well.y += scrollSpeed * dt;
      const exitThreshold = WORLD.h + well.influenceRadius;
      if (well.y > exitThreshold) {
        // Wrap to just above the visible world preserving original attributes.
        // Keep same x, id, mass, etc. so clients continue referencing same well.
        well.y = -well.influenceRadius; // position just above top
      }
    } else if (well.type === "blackhole") {
      const anyW = well as any;
      if (anyW.vx === undefined || anyW.vy === undefined) {
        spawnBlackhole(anyW, world.w, world.h);
      }

      // Move the blackhole
      anyW.x += anyW.vx * dt;
      anyW.y += anyW.vy * dt;

      // Wrap/Respawn when it goes out of bounds
      const exitMargin = anyW.influenceRadius;
      const exitedLeft = anyW.vx < 0 && anyW.x < -exitMargin;
      const exitedRight = anyW.vx > 0 && anyW.x > world.w + exitMargin;
      const exitedTop = anyW.vy < 0 && anyW.y < -exitMargin;
      const exitedBottom = anyW.vy > 0 && anyW.y > world.h + exitMargin;

      if (exitedLeft || exitedRight || exitedTop || exitedBottom) {
        spawnBlackhole(anyW, world.w, world.h);
      }
    }
  }
};
