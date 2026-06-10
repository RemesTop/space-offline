import { TICK_HZ, SNAPSHOT_HZ } from "@shared/constants.js";

export const config = {
  tickHz: TICK_HZ,
  snapshotHz: SNAPSHOT_HZ,
  botsEnabled: true,
} as const;
