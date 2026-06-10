import { WORLD, GRAVITY } from "@shared/constants.js";
import type { WellState } from "@shared/types.js";
export interface LocalEmitter {
  emitEvent(socketId: string, event: any): void;
  emitSnapshot(socketId: string, snapshot: any): void;
}
import { rndRange } from "@shared/math.js";

export type World = {
  w: number;
  h: number;
  tick: number;
  wells: WellState[];
  players: Map<string, Player>;
  bullets: Map<string, Bullet>;
  pickups: Map<string, Pickup>;
  rocks: Map<string, Rock>;
  io?: LocalEmitter;
  awaitingFirstHuman: boolean; // paused state until a human connects
};

export type Player = {
  id: string;
  socketId: string;
  name: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  hp: number;
  maxHp: number;
  accel: number;
  maxSpeed: number;
  damage: number;
  fireCooldownMs: number;
  lastFireAt: number;
  shield: number;
  magnetRadius: number;
  xp: number;
  level: number;
  xpToNext: number;
  aim: number;
  pendingOffer?: boolean;
  pendingOffersCount?: number;
  invulnUntil: number;
  isGiant?: boolean;
  altFire?: "railgun" | "spread";
  specialVariant?: 'Regen Wings' | 'Gravity Point' | 'Bumper Body' | 'Twin Weapon' | 'Laser Window' | 'Omni Window';
  lastDamageTakenAt?: number;
  // Powerup levels (1-5 for each powerup type)
  powerupLevels: {
    Hull: number;
    Damage: number;
    Engine: number;
    FireRate: number;
    Magnet: number;
    Radar: number;
  };
  inputQueue: Array<{
    seq: number;
    aim: number;
    thrust: { x: number; y: number };
    fire: boolean;
    dtMs: number;
  }>;
  lastAckSeq: number;
  deadUntil?: number;
  score: number;
  mass: number;
};

export type Bullet = {
  id: string;
  ownerId: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  damage: number;
  ttl: number;
  pierce: boolean;
};

export type Pickup = {
  id: string;
  type: "xp" | "hp" | "xp-giant";
  x: number;
  y: number;
  r: number;
  value: number;
  createdAt: number; // ms timestamp when spawned
};

export type Rock = {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  rotation?: number;
};

export const createWorld = (): World => {
  const wells: WellState[] = GRAVITY.wells.map((w) => ({ ...w }));
  return {
    w: WORLD.w,
    h: WORLD.h,
    tick: 0,
    wells,
    players: new Map(),
    bullets: new Map(),
    pickups: new Map(),
    rocks: new Map(),
    awaitingFirstHuman: true,
  };
};

export const randEdgeSpawn = (world: World) => {
  const side = Math.floor(Math.random() * 4);
  if (side === 0) return { x: rndRange(0, world.w), y: 20 };
  if (side === 1) return { x: rndRange(0, world.w), y: world.h - 20 };
  if (side === 2) return { x: 20, y: rndRange(0, world.h) };
  return { x: world.w - 20, y: rndRange(0, world.h) };
};

export const randSafeSpawn = (world: World) => {
  const margin = 150; // Safe distance from arena edges
  const wellSafeDistance = 400; // Safe distance from gravity wells
  const maxAttempts = 50; // Prevent infinite loops

  // Get gravity wells from the world
  const wells = world.wells;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    // Generate random position with margins
    const x = rndRange(margin, world.w - margin);
    const y = rndRange(margin, world.h - margin);

    // Check if position is safe from all gravity wells
    let isSafe = true;
    for (const well of wells) {
      const distance = Math.hypot(x - well.x, y - well.y);
      if (distance < wellSafeDistance) {
        isSafe = false;
        break;
      }
    }

    if (isSafe) {
      return { x, y };
    }
  }

  // Fallback: spawn in center if no safe position found after max attempts
  return { x: world.w / 2, y: world.h / 2 };
};

export const resetWorld = (world: World) => {
  world.players.clear();
  world.bullets.clear();
  world.pickups.clear();
  world.rocks.clear();
  world.wells = GRAVITY.wells.map((w) => ({ ...w }));
  world.tick = 0;
  world.awaitingFirstHuman = false; // unpause once first human joins
};
