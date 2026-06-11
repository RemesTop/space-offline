import { nanoid } from "nanoid";
import { WORLD, PLAYER, BULLET, PICKUPS, POWERUPS, ALT_FIRE } from "@shared/constants.js";
import { TICK_HZ } from "@shared/constants.js";
import type { World, Player, Bullet, Pickup } from "./world.js";
import { clamp, dist2, rndRange } from "@shared/math.js";
import { ioSnapshot } from "./loop.js";
import { removeBot } from "./systems/bots.js";
import type { PowerupChoice, PowerupFamily, AltFireType } from "@shared/types.js";

export const addPlayer = (
  world: World,
  id: string,
  pos: { x: number; y: number },
  socketId: string,
): Player => {
  // Check if any human player is level 10 or above
  let hasHighLevelPlayer = false;
  for (const player of world.players.values()) {
    if (player.socketId && player.level >= 10) {
      hasHighLevelPlayer = true;
      break;
    }
  }

  // Only bots (socketId is empty) can be giants
  const giantChance = hasHighLevelPlayer ? 0.15 : 0.05;
  const isGiant = (!socketId) && Math.random() < giantChance;
  const p: Player = {
    id,
    socketId,
    name: "Anon",
    x: pos.x,
    y: pos.y,
    vx: 0,
    vy: 0,
    r: PLAYER.radius,
    isGiant,
    hp: PLAYER.baseHP + (isGiant ? 200 : 0),
    maxHp: PLAYER.baseHP + (isGiant ? 200 : 0),
    accel: PLAYER.baseAccel,
    maxSpeed: PLAYER.baseMaxSpeed,
    damage: BULLET.baseDamage,
    fireCooldownMs: BULLET.cooldownMs,
    lastFireAt: 0,
    shield: 0,
    magnetRadius: PICKUPS.magnetBaseRadius,
    xp: 0,
    level: 1,
    xpToNext: xpForLevel(2),
    aim: 0,
    pendingOffer: false,
    invulnUntil: 0,
    inputQueue: [],
    lastAckSeq: 0,
    score: 0,
    mass: 0,
    // Initialize all powerups at level 0 (no upgrades)
    powerupLevels: {
      Hull: 0,
      Damage: 0,
      Engine: 0,
      FireRate: 0,
      Magnet: 0,
      Wings: 0,
    },
    lastDamageTakenAt: 0,
    specialVariants: [],
  };
  updatePlayerRadius(p);
  world.players.set(id, p);
  return p;
};

export const removePlayer = (world: World, id: string) => {
  world.players.delete(id);
  removeBot(id); // Clean up bot data if this was a bot
};

export const setPlayerName = (world: World, id: string, name: string) => {
  const p = world.players.get(id);
  if (p) p.name = name;
};

export const queueInput = (
  world: World,
  id: string,
  frame: {
    seq: number;
    aim: number;
    thrust: { x: number; y: number };
    fire: boolean;
    dtMs: number;
  },
) => {
  const p = world.players.get(id);
  if (!p) return;
  p.inputQueue.push(frame);
};

export const processInputs = (world: World, now: number) => {
  for (const p of world.players.values()) {
    while (p.inputQueue.length) {
      const f = p.inputQueue.shift()!;
      p.aim = f.aim;
      // Make movement more floaty: reduce acceleration for bots
      let accelMult = p.socketId ? 1.0 : 0.6;
      
      let floatyAccel = p.accel * accelMult;

      p.vx += clamp(f.thrust.x, -1, 1) * floatyAccel * (f.dtMs / 1000);
      p.vy += clamp(f.thrust.y, -1, 1) * floatyAccel * (f.dtMs / 1000);
      
      const spd = Math.hypot(p.vx, p.vy);
      let currentMaxSpeed = p.maxSpeed;

      if (spd > currentMaxSpeed) {
        const s = currentMaxSpeed / (spd || 1);
        p.vx *= s;
        p.vy *= s;
      }
      if (f.fire) tryFire(world, p, f.aim, now);
      
      // Regen Wings logic
      if (p.specialVariants.includes('Regen Wings') && p.hp > 0 && p.hp < p.maxHp) {
        if (now - (p.lastDamageTakenAt || 0) > 3000) {
          p.hp = Math.min(p.maxHp, p.hp + 5 * (f.dtMs / 1000));
        }
      }
      
      p.lastAckSeq = Math.max(p.lastAckSeq, f.seq);
    }
  }
};

export const xpForLevel = (level: number) => {
  return Math.floor(POWERUPS.xpBase * Math.pow(level, 1.4));
};

export const updatePlayerRadius = (p: Player) => {
  const giantMultiplier = p.isGiant ? 1.3 : 1.0;
  const hullLevel = p.powerupLevels.Hull || 0;
  const engineLevel = p.powerupLevels.Engine || 0;
  const wingsLevel = p.powerupLevels.Wings || 0;
  p.r = PLAYER.radius * giantMultiplier * (1 + 0.15 * hullLevel + 0.05 * engineLevel + 0.03 * wingsLevel);
};
export const levelUp = (world: World, playerId: string) => {
  const player = world.players.get(playerId);
  if (!player) return;

  // Force level up by setting XP to next level requirement
  player.xp = player.xpToNext;
  player.level++;
  player.xp = 0; // Reset XP for next level
  player.xpToNext = xpForLevel(player.level + 1);
  player.pendingOffer = true;
  sendOffer(world, player);
};

export const giveXP = (world: World, p: Player, value: number) => {
  p.xp += value;
  p.score += value;
  let leveledUp = false;
  while (p.xp >= p.xpToNext) {
    p.level++;
    p.xp -= p.xpToNext;
    p.xpToNext = xpForLevel(p.level + 1);
    p.pendingOffersCount = (p.pendingOffersCount || 0) + 1;
    leveledUp = true;
  }
  if (leveledUp && !p.pendingOffer) {
    p.pendingOffer = true;
    sendOffer(world, p);
  }
};

const sendOffer = (world: World, p: Player) => {
  const choices = rollChoices(p);

  // If no choices available, don't show level up modal at all
  if (choices.length === 0) {
    p.pendingOffer = false;
    return;
  }

  if (!p.socketId) {
    // Bot: pick a choice automatically (heuristic: lowest current level; fallback first)
    const scored = choices.map(c => {
      // current level is (tier - 1) for normal powerups; AltFire treat as big negative to encourage unlock once eligible
      const currentLevel = c.family === 'AltFire' ? -1 : (c.tier ?? 1) - 1;
      return { choice: c, currentLevel };
    });
    // Prefer Special if available
    let pick = scored.find(s => s.choice.family === 'Special')?.choice;
    if (!pick) {
      pick = scored.find(s => s.choice.family === 'AltFire')?.choice;
    }
    if (!pick) {
      const minLevel = Math.min(...scored.map(s => s.currentLevel));
      const lowest = scored.filter(s => s.currentLevel === minLevel).map(s => s.choice);
      pick = lowest[Math.floor(Math.random() * lowest.length)];
    }
    // Apply selection directly
    applyLevelChoice(world, p.id, { family: pick.family, tier: pick.tier, alt: pick.alt, special: pick.special });
    return;
  }
  world.io?.emitEvent(p.socketId, { type: "LevelUpOffer", choices });
};

export const applyLevelChoice = (
  world: World,
  id: string,
  choice: { family: PowerupFamily | "AltFire"; tier?: number; alt?: AltFireType; special?: any }
) => {
  const p = world.players.get(id);
  if (!p || !p.pendingOffer) return;

  if (choice.family === "Special" && choice.special) {
    if (!p.specialVariants.includes(choice.special)) {
      p.specialVariants.push(choice.special);
    }
  } else if (choice.family === "AltFire" && p.level >= 10 && choice.alt) {
    p.altFire = choice.alt;
  } else if (choice.family === "Hull" && choice.tier) {
    // Check if Hull is already at max level (4)
    if (p.powerupLevels.Hull < 4) {
      p.powerupLevels.Hull++;
      // HP upgrade is significantly reduced for the later levels (hull 3 and after only +20)
      if (p.powerupLevels.Hull >= 3) {
        p.maxHp += 20;
        p.hp = Math.min(p.maxHp, p.hp + 20);
      } else {
        p.maxHp += 40;
        p.hp = Math.min(p.maxHp, p.hp + 40);
      }
    }
  } else if (choice.family === "Damage" && choice.tier) {
    if (p.powerupLevels.Damage < 4) {
      p.powerupLevels.Damage++;
      p.damage += 4;
    }
  } else if (choice.family === "Engine" && choice.tier) {
    if (p.powerupLevels.Engine < 4) {
      p.powerupLevels.Engine++;
      if (p.powerupLevels.Engine > 2) {
        // Diminishing returns after lvl 3 (internal level > 2)
        p.maxSpeed += 20;
        p.accel += 40;
      } else {
        p.maxSpeed += 40;
        p.accel += 80;
      }
    }
  } else if (choice.family === "FireRate" && choice.tier) {
    if (p.powerupLevels.FireRate < 4) {
      p.powerupLevels.FireRate++;
      if (p.powerupLevels.FireRate > 2) {
        // Diminishing returns after lvl 3
        p.fireCooldownMs = Math.max(80, p.fireCooldownMs - 15);
      } else {
        p.fireCooldownMs = Math.max(80, p.fireCooldownMs - 30);
      }
    }
  } else if (choice.family === "Magnet" && choice.tier) {
    if (p.powerupLevels.Magnet < 4) {
      p.powerupLevels.Magnet++;
      p.magnetRadius += 40;
    }
  } else if (choice.family === "Wings" && choice.tier) {
    if (p.powerupLevels.Wings < 4) {
      p.powerupLevels.Wings++;
      // Wings now increases turn speed (handled in bots.ts and GameScene.ts) and zoom
    }
  }

  updatePlayerRadius(p);

  p.pendingOffersCount = Math.max(0, (p.pendingOffersCount || 1) - 1);
  if (p.pendingOffersCount > 0) {
    p.pendingOffer = true;
    sendOffer(world, p);
  } else {
    p.pendingOffer = false;
  }
  world.io?.emitEvent(p.socketId, {
    type: "LevelUpApplied",
    updated: {
      level: p.level,
      xp: p.xp,
      xpToNext: p.xpToNext,
      maxHp: p.maxHp,
      damage: p.damage,
      accel: p.accel,
      maxSpeed: p.maxSpeed,
      fireCooldownMs: p.fireCooldownMs,
      magnetRadius: p.magnetRadius,
      shield: p.shield,
      engineLevel: p.powerupLevels.Engine,
      wingsLevel: p.powerupLevels.Wings,
      hullLevel: p.powerupLevels.Hull,
      altFire: p.altFire,
      specialVariants: p.specialVariants,
      powerupLevels: p.powerupLevels,
    },
  });
};

const rollChoices = (p: Player): PowerupChoice[] => {
  if ([5, 10, 15].includes(p.level)) {
    const allSpecials: PowerupChoice[] = [
      { family: "Special", special: "Regen Wings", label: "Regen Wings", desc: "+15 HP per kill" },
      { family: "Special", special: "Zero gravity", label: "Zero gravity", desc: "No damage/collision from planets/gravity" },
      { family: "Special", special: "Bumper Body", label: "Bumper Body", desc: "Damage and push other ships away heavily" },
      { family: "Special", special: "Twin Weapon", label: "Twin Weapon", desc: "Shoot two bullets side-by-side" },
      { family: "Special", special: "Laser Beam", label: "Laser Beam", desc: "Shoot piercing beams" },
      { family: "Special", special: "Bullet hell", label: "Bullet hell", desc: "Shoot bullets forward and backward" },
    ];
    // Filter out ones already picked
    const availableSpecials = allSpecials.filter(c => !p.specialVariants.includes(c.special as string));
    
    // Shuffle
    for (let i = availableSpecials.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [availableSpecials[i], availableSpecials[j]] = [availableSpecials[j], availableSpecials[i]];
    }
    // Return up to 4
    return availableSpecials.slice(0, 4);
  }

  const arr: PowerupChoice[] = [];

  // Create pool of available powerups that aren't at max level
  const pool: PowerupChoice[] = [];

  // Only add powerups that aren't at max level (4)
  if (p.powerupLevels.Hull < 4) {
    const nextLevel = p.powerupLevels.Hull + 1;
    pool.push({
      family: "Hull" as const,
      tier: nextLevel,
      label: `Hull Lv${nextLevel + 1}`,
      desc: nextLevel > 2 ? "+20 Max HP" : "+40 Max HP",
    });
  }

  if (p.powerupLevels.Damage < 4) {
    const nextLevel = p.powerupLevels.Damage + 1;
    pool.push({
      family: "Damage" as const,
      tier: nextLevel,
      label: `Damage Lv${nextLevel + 1}`,
      desc: "+4 Damage",
    });
  }

  if (p.powerupLevels.Engine < 4) {
    const nextLevel = p.powerupLevels.Engine + 1;
    pool.push({
      family: "Engine" as const,
      tier: nextLevel,
      label: `Engine Lv${nextLevel + 1}`,
      desc: nextLevel > 2 ? "+Speed/Accel (Diminished)" : "+Speed/Accel",
    });
  }

  if (p.powerupLevels.FireRate < 4) {
    const nextLevel = p.powerupLevels.FireRate + 1;
    pool.push({
      family: "FireRate" as const,
      tier: nextLevel,
      label: `Fire Rate Lv${nextLevel + 1}`,
      desc: nextLevel > 2 ? "-15ms Cooldown" : "-30ms Cooldown",
    });
  }

  if (p.powerupLevels.Magnet < 4) {
    const nextLevel = p.powerupLevels.Magnet + 1;
    pool.push({
      family: "Magnet" as const,
      tier: nextLevel,
      label: `Magnet Lv${nextLevel + 1}`,
      desc: "+30 Pickup Radius",
    });
  }

  if (p.powerupLevels.Wings < 4) {
    const nextLevel = p.powerupLevels.Wings + 1;
    pool.push({
      family: "Wings" as const,
      tier: nextLevel,
      label: `Wings Lv${nextLevel + 1}`,
      desc: "Faster turning + Zoom out",
    });
  }

  // Select up to 4 different powerup families
  while (arr.length < 4 && pool.length > 0) {
    const randomIndex = Math.floor(Math.random() * pool.length);
    const pick = pool[randomIndex];

    // Check if we already have this family in our selection
    if (!arr.find((c) => c.family === pick.family)) {
      arr.push(pick);
    }

    // Remove the picked item from pool to avoid duplicates
    pool.splice(randomIndex, 1);
  }

  // Add AltFire option if eligible and we have space
  if (p.level >= 10 && !p.altFire && arr.length < 4) {
    arr.push({
      family: "AltFire" as const,
      alt: Math.random() < 0.5 ? "railgun" : "spread",
      label: "Alt Fire",
      desc: "Unlock special weapon",
    });
  }

  return arr;
};

export const tryFire = (world: World, p: Player, aim: number, now: number) => {
  if (now - p.lastFireAt < p.fireCooldownMs) return;

  const cos = Math.cos(aim);
  const sin = Math.sin(aim);

  const fireBullet = (
    speed: number,
    damage: number,
    radius: number,
    ttl: number,
    angleOffset = 0,
    pierce = false,
    isLaser = false,
  ) => {
    const id = nanoid();
    const vx = Math.cos(aim + angleOffset) * speed;
    const vy = Math.sin(aim + angleOffset) * speed;
    const muzzleDist = p.r + radius - 50; // spawn at ship nose
    const b: Bullet = {
      id,
      ownerId: p.id,
      x: p.x + Math.cos(aim + angleOffset) * muzzleDist,
      y: p.y + Math.sin(aim + angleOffset) * muzzleDist,
      vx,
      vy,
      r: radius,
      damage,
      ttl,
      pierce,
      isLaser,
    };
    world.bullets.set(id, b);
  };

  if (p.altFire === "railgun") {
    fireBullet(
      ALT_FIRE.railgun.speed,
      ALT_FIRE.railgun.damage,
      ALT_FIRE.railgun.radius,
      ALT_FIRE.railgun.lifetimeMs,
      0,
      true,
      true, // visually a laser
    );
    p.lastFireAt = now - 0 + ALT_FIRE.railgun.cooldownMs;
    return;
  }
  if (p.altFire === "spread") {
    const s = (ALT_FIRE.spread.spreadDeg * Math.PI) / 180;
    const base = -s;
    for (let i = 0; i < ALT_FIRE.spread.pellets; i++) {
      const off = base + (s * i * 2) / (ALT_FIRE.spread.pellets - 1);
      fireBullet(
        ALT_FIRE.spread.speed,
        ALT_FIRE.spread.damage,
        ALT_FIRE.spread.radius,
        ALT_FIRE.spread.lifetimeMs,
        off,
        false,
      );
    }
    p.lastFireAt = now - 0 + ALT_FIRE.spread.cooldownMs;
    return;
  }

  const hasLaser = p.specialVariants.includes("Laser Beam");
  const hasTwin = p.specialVariants.includes("Twin Weapon");
  const hasHell = p.specialVariants.includes("Bullet hell");

  if (hasTwin) {
    fireBullet(BULLET.speed, p.damage, BULLET.radius, BULLET.lifetimeMs, 0.1, hasLaser, hasLaser);
    fireBullet(BULLET.speed, p.damage, BULLET.radius, BULLET.lifetimeMs, -0.1, hasLaser, hasLaser);
  } else {
    fireBullet(BULLET.speed, p.damage, BULLET.radius, BULLET.lifetimeMs, 0, hasLaser, hasLaser);
  }

  if (hasHell) {
    fireBullet(BULLET.speed, p.damage, BULLET.radius, BULLET.lifetimeMs, Math.PI, hasLaser, hasLaser);
  }

  p.lastFireAt = now;
};

export const moveAndClamp = (p: Player, dt: number) => {
  // Apply friction/damping for floaty feel
  const damping = 0.98;
  p.vx *= damping;
  p.vy *= damping;
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  // World edge bounce
  const bounceRestitution = 0.9; // energy retained (1 = perfect, <1 loses speed)
  const minBounceSpeed = 140; // ensure a noticeable kick away
  // Left
  if (p.x < p.r) {
    p.x = p.r;
    const speed = Math.max(minBounceSpeed, Math.abs(p.vx) * bounceRestitution);
    p.vx = speed; // push right
  }
  // Right
  if (p.x > WORLD.w - p.r) {
    p.x = WORLD.w - p.r;
    const speed = Math.max(minBounceSpeed, Math.abs(p.vx) * bounceRestitution);
    p.vx = -speed; // push left
  }
  // Top
  if (p.y < p.r) {
    p.y = p.r;
    const speed = Math.max(minBounceSpeed, Math.abs(p.vy) * bounceRestitution);
    p.vy = speed; // push down
  }
  // Bottom
  if (p.y > WORLD.h - p.r) {
    p.y = WORLD.h - p.r;
    const speed = Math.max(minBounceSpeed, Math.abs(p.vy) * bounceRestitution);
    p.vy = -speed; // push up
  }
};

export const spawnPickupsIfNeeded = (world: World) => {
  // Add a timer property to world if not present
  if (!("pickupSpawnTimer" in world)) {
    (world as any).pickupSpawnTimer = 0;
  }
  (world as any).pickupSpawnTimer += 1 / TICK_HZ;
  // Spawn a pickup every 0.5 seconds if under target count
  if (world.pickups.size < PICKUPS.targetCount && (world as any).pickupSpawnTimer >= 0.5) {
    (world as any).pickupSpawnTimer = 0;
    const id = nanoid();
    let type: "hp" | "xp" | "xp-giant" = Math.random() < PICKUPS.hpOrbChance ? "hp" : "xp";
    if (type === "xp" && Math.random() < 0.05) {
      type = "xp-giant";
    }
    const value =
      type === "hp"
        ? PICKUPS.hpOrbValue
        : type === "xp-giant"
        ? Math.floor(rndRange(PICKUPS.xpValueRange[0], PICKUPS.xpValueRange[1])) * 3
        : Math.floor(rndRange(PICKUPS.xpValueRange[0], PICKUPS.xpValueRange[1]));
    const p: Pickup = {
      id,
      type,
      x: rndRange(40, WORLD.w - 40),
      y: rndRange(40, WORLD.h - 40),
      r: 10,
      value,
      createdAt: Date.now(),
    };
    world.pickups.set(id, p);
  }
};

export const collectPickups = (world: World) => {
  for (const p of world.players.values()) {
  // Dead players (hp <= 0) should not attract or collect pickups
  if (p.hp <= 0) continue;
    for (const k of world.pickups.keys()) {
      const pu = world.pickups.get(k)!;
      // magnet
      const d2 = dist2({ x: p.x, y: p.y }, { x: pu.x, y: pu.y });
      const mr = p.magnetRadius;
      if (d2 < mr * mr) {
        const d = Math.sqrt(d2) || 1;
        const dirx = (p.x - pu.x) / d;
        const diry = (p.y - pu.y) / d;
        pu.x += dirx * 200 * (1 / Math.max(0.2, d / mr)) * (1 / 30);
        pu.y += diry * 200 * (1 / Math.max(0.2, d / mr)) * (1 / 30);
      }
      // collect
      const rad = p.r + pu.r;
      if (d2 < rad * rad) {
        world.pickups.delete(k);
        if (pu.type === "xp" || pu.type === "xp-giant") giveXP(world, p, pu.value);
        else p.hp = Math.min(p.maxHp + p.shield, p.hp + pu.value);
        world.io?.emitEvent(p.socketId, {
          type: "Pickup",
          playerId: p.id,
          pickupId: pu.id,
          value: pu.value,
          kind: pu.type,
        });
      }
    }
  }
};
