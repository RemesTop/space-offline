import { GRAVITY, WORLD } from "@shared/constants.js";
import type { World } from "../world.js";

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
    }
  }
};
