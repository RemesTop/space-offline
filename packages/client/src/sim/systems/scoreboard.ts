import type { World } from "../world.js";
import { SCOREBOARD } from "@shared/constants.js";

export const getScoreboard = (world: World) =>
  Array.from(world.players.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, SCOREBOARD.top)
    .map((p) => ({ id: p.id, name: p.name, score: p.score, level: p.level }));
