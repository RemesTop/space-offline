export type V2 = { x: number; y: number };

export type EntityKind = "player" | "bullet" | "pickup" | "rock";

export type WellType = "planet" | "sun" | "blackhole";

export type PickupType = "xp" | "hp" | "xp-giant";

export type AltFireType = "railgun" | "spread";

export type SpecialVariant = 'Regen Wings' | 'Gravity Point' | 'Bumper Body' | 'Twin Weapon' | 'Laser Window' | 'Omni Window';

export type PowerupFamily = "Hull" | "Damage" | "Engine" | "FireRate" | "Magnet" | "Wings" | "Special";

export type PowerupChoice = {
  family: PowerupFamily | "AltFire";
  tier?: number; // 1..5 for normal families
  alt?: AltFireType;
  special?: SpecialVariant;
  label: string;
  desc: string;
};

export type PlayerStats = {
  level: number;
  xp: number;
  xpToNext: number;
  maxHp: number;
  damage: number;
  accel: number;
  maxSpeed: number;
  fireCooldownMs: number;
  magnetRadius: number;
  shield: number; // simple flat extra hp/regen placeholder (kept for backward compatibility with radar)
  radarLevel?: number; // radar upgrade level for zoom-out functionality
  altFire?: AltFireType;
  specialVariant?: SpecialVariant;
};

export type EntityState = {
  id: string;
  kind: EntityKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  hp?: number;
  maxHp?: number;
  ownerId?: string; // for bullets
  socketId?: string;
  name?: string;
  isBot?: boolean;
  isGiant?: boolean;
  aim?: number;
  level?: number;
  rotation?: number;
  specialVariant?: SpecialVariant;
};

export type PickupState = {
  id: string;
  type: "xp" | "hp" | "xp-giant";
  x: number;
  y: number;
  value: number;
};

export type WellState = {
  id: string;
  x: number;
  y: number;
  mass: number;
  radius: number;
  influenceRadius: number;
  type: WellType;
  maxPull: number;
  texture?: string; // Optional texture key for rendering
};

export type ScoreEntry = {
  id: string;
  name: string;
  score: number;
  level: number;
};
