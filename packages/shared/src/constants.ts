export const TICK_HZ = 30;
export const SNAPSHOT_HZ = 12;

export const WORLD = { w: 4000, h: 3000, outOfBoundsClamp: 20 };

export const PLAYER = {
  radius: 18,
  mass: 1,
  baseAccel: 850, // px/s^2
  baseMaxSpeed: 300, // px/s
  baseHP: 125,
  invulnMs: 2000,
  respawnDelayMs: 3000,
};

export const BULLET = {
  speed: 1000,
  radius: 5,
  lifetimeMs: 1200,
  baseDamage: 12,
  cooldownMs: 220,
};

export const ALT_FIRE = {
  railgun: { damage: 120, cooldownMs: 1800, speed: 1300, radius: 7, lifetimeMs: 1000 },
  spread: {
    pellets: 3,
    spreadDeg: 16,
    damage: 10,
    cooldownMs: 700,
    speed: 780,
    radius: 5,
    lifetimeMs: 650,
  },
};

export const PICKUPS = {
  targetCount: 100,
  xpValueRange: [40, 80],
  hpOrbChance: 0.08,
  hpOrbValue: 100,
  magnetBaseRadius: 100,
  // Lifespan (ms) after which pickups are auto-despawned to avoid stale clutter
  lifespanMs: 5 * 60 * 1000, // 5 minutes
  // Absolute safety cap (older pickups trimmed first if exceeded)
  maxCount: 220,
};

export const GRAVITY = {
  G: 10,
  epsilon: 2000,
  maxPull: 300,
  planetScrollSpeed: 50,
  // Planet collision damage tuning so impacts are damage-over-time instead of instant large chunks
  planetCollision: {
    speedThreshold: 80,          // no damage below this impact speed
    baseDps: 40,                 // base DPS applied once threshold exceeded
    maxSpeedMultiplier: 1.5,     // cap scaling from speed
  },
  wells: [
    { id: "planetA", x: 1800, y: 1200, mass: 2e6, radius: 120, influenceRadius: 500, type: "planet" as const, maxPull: 150, texture: "EARTH" },
    {
      id: "sunA",
      x: 3000,
      y: 700,
      mass: 4e6,
      radius: 200,
      influenceRadius: 800,
      type: "sun" as const,
      maxPull: 250,
      texture: "SUN"
    },
    {
      id: "marsA",
      x: 1200,
      y: 1800,
      mass: 2.5e6,
      radius: 110,
      influenceRadius: 400,
      type: "planet" as const,
      maxPull: 150,
      texture: "MARS"
    },
    {
      id: "marsC",
      x: 3000,
      y: 1800,
      mass: 2.5e5,
      radius: 120,
      influenceRadius: 400,
      type: "planet" as const,
      maxPull: 150,
      texture: "NEPTUNUS"
    },
    {
      id: "marsB",
      x: 600,
      y: 1000,
      mass: 2.5e5,
      radius: 130,
      influenceRadius: 500,
      type: "planet" as const,
      maxPull: 200,
      texture: "SATURNUS"
    },
    {
      id: "marsD",
      x: 2400,
      y: 1800,
      mass: 2.5e5,
      radius: 80,
      influenceRadius: 400,
      type: "planet" as const,
      maxPull: 150,
      texture: "VENUS"
    },
  ],
  sunHeatDps: 18,
  blackHoleEdgeDps: 40,
};

export const POWERUPS = {
  xpBase: 60, // base for level curve
  families: ["Hull", "Damage", "Engine", "FireRate", "Magnet", "Shield"] as const,
  tiers: 5,
};

export const SCOREBOARD = { top: 10 };

export const ROOM = { cap: 16 };
