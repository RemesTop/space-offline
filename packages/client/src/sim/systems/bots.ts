import { nanoid } from "nanoid";
import type { World, Player } from "../world.js";
import { addPlayer, queueInput, applyLevelChoice } from "../entities.js";
import { randSafeSpawn } from "../world.js";
import { rndRange } from "@shared/math.js";
import type { PowerupFamily } from "@shared/types.js";

const BOT_NAMES = [
  "Alpha Bot",
  "Beta Drone",
  "Jeb4",
  "Delta Unit",
  "kais",
  "Foxtrot AI",
  "Ammunition",
  "Hotel Unit",
  "Iridium Bot",
  "Mikumiko",
  "rempparame",
  "Deathmazing",
  "Sisyphus",
  "Nasa-engineer2",
  "10xgamer",
  "WhereamI",
  "Storm Shadow Missile",
  "Rousku",
  "Robottirokki",
  "Lidl asiakaspalvelu",
  "Nanobotti",
  "Ayylien",
  "Simulaatio",
  "TestiRobotti",
  "Supra",
  "Caffenated bot",
  "Wattson",
  "R2-D2",
  "wALL-E",
  "The Iron Giant",
  "Bender Bending Rodríguez"
];

export type Bot = {
  playerId: string;
  target?: { x: number; y: number };
  lastThinkAt: number;
  aggressiveness: number; // 0-1, how likely to seek players vs pickups
  aimOffset: number; // aim error in radians
  currentAim: number; // current aim angle
};

const bots = new Map<string, Bot>();

export const spawnBot = (world: World): void => {
  if (world.players.size >= 20) return; // Don't spam too many bots

  const botId = nanoid();
  const spawn = randSafeSpawn(world);

  // Use empty socketId for bots - they don't have real sockets
  const player = addPlayer(world, botId, spawn, "");
  player.invulnUntil = performance.now() + 3000;

  // Give bot a random name
  const botName = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
  player.name = botName;

  // Give bot 0 to 2 random upgrades
  const families: PowerupFamily[] = ["Hull", "Damage", "Engine", "FireRate", "Radar"];
  const numUpgrades = Math.floor(Math.random() * 3); // 0 to 2
  for (let i = 0; i < numUpgrades; i++) {
    player.pendingOffer = true;
    const randomFamily = families[Math.floor(Math.random() * families.length)];
    applyLevelChoice(world, botId, { family: randomFamily, tier: 1 });
  }

  const bot: Bot = {
    playerId: botId,
    lastThinkAt: 0,
    aggressiveness: Math.random() * 0.8 + 0.2, // 0.2 to 1.0
    aimOffset: (Math.random() - 0.5) * 0.3, // -0.15 to 0.15 radians
    currentAim: Math.random() * Math.PI * 2,
  };

  bots.set(botId, bot);
  console.log(`[bots] spawned bot: ${botName}`);
};

export const updateBots = (world: World, now: number): void => {
  const THINK_INTERVAL = 200; // ms between AI decisions

  for (const [botId, bot] of bots) {
    const player = world.players.get(botId);
    if (!player) {
      bots.delete(botId);
      continue;
    }

    // Skip if bot is dead
    if (player.deadUntil && now < player.deadUntil) continue;

    // Skip moving/firing if still invulnerable (spawn flicker)
    if (player.invulnUntil && now < player.invulnUntil) {
      queueInput(world, botId, {
        seq: Math.floor(now / 25),
        aim: bot.currentAim,
        thrust: { x: 0, y: 0 },
        fire: false,
        dtMs: THINK_INTERVAL,
      });
      continue;
    }

    // AI thinking interval
    if (now - bot.lastThinkAt < THINK_INTERVAL) continue;
    bot.lastThinkAt = now;

    // Find targets
    const nearbyPlayers = Array.from(world.players.values())
      .filter(p => p.id !== botId && (!p.deadUntil || now >= p.deadUntil) && p.hp > 0)
      .map(p => ({
        player: p,
        dist: Math.hypot(p.x - player.x, p.y - player.y)
      }))
      .filter(({ dist }) => dist < 400) // Only consider nearby players
      .sort((a, b) => a.dist - b.dist);

    const nearbyPickups = Array.from(world.pickups.values())
      .map(p => ({
        pickup: p,
        dist: Math.hypot(p.x - player.x, p.y - player.y)
      }))
      .filter(({ dist }) => dist < 500) // Wider pickup search radius
      .sort((a, b) => {
        // If low HP, strongly prioritize health pickups
        if (player.hp < player.maxHp * 0.5) {
          if (a.pickup.type === "hp" && b.pickup.type !== "hp") return -1;
          if (b.pickup.type === "hp" && a.pickup.type !== "hp") return 1;
        }
        return a.dist - b.dist;
      });

    // Decide target based on aggressiveness and what's available
    let targetX = player.x;
    let targetY = player.y;
    let shouldFire = false;

    // Check for nearby planets to avoid
    let avoidX = 0;
    let avoidY = 0;
    for (const well of world.wells) {
      const dx = player.x - well.x;
      const dy = player.y - well.y;
      const dist = Math.hypot(dx, dy);
      const dangerRadius = well.radius + 80; // start avoiding before collision

      if (dist < dangerRadius && dist > 1) {
        // Push away from planet — stronger when closer
        const strength = (dangerRadius - dist) / dangerRadius;
        avoidX += (dx / dist) * strength * 300;
        avoidY += (dy / dist) * strength * 300;
      }
    }

    const isAvoidingPlanet = Math.hypot(avoidX, avoidY) > 20;

    if (isAvoidingPlanet) {
      // Priority: avoid planets
      targetX = player.x + avoidX;
      targetY = player.y + avoidY;
    } else if (nearbyPlayers.length > 0 && Math.random() < bot.aggressiveness) {
      // Target nearest player
      const target = nearbyPlayers[0].player;
      targetX = target.x;
      targetY = target.y;

      const dx = targetX - player.x;
      const dy = targetY - player.y;
      const targetAim = Math.atan2(dy, dx);
      let aimDiff = targetAim - bot.currentAim;
      while (aimDiff > Math.PI) aimDiff -= Math.PI * 2;
      while (aimDiff < -Math.PI) aimDiff += Math.PI * 2;

      // Fire only if target is within 60 degrees (pi/3) of forward facing
      shouldFire = nearbyPlayers[0].dist < 250 && Math.abs(aimDiff) <= Math.PI / 3;
    } else if (nearbyPickups.length > 0) {
      // Target nearest pickup (or HP pickup if low health)
      const target = nearbyPickups[0].pickup;
      targetX = target.x;
      targetY = target.y;
    } else {
      // Wander towards center or random direction
      const centerX = world.w / 2;
      const centerY = world.h / 2;
      const toCenterDist = Math.hypot(centerX - player.x, centerY - player.y);

      if (toCenterDist > 300) {
        targetX = centerX + rndRange(-200, 200);
        targetY = centerY + rndRange(-200, 200);
      } else {
        targetX = player.x + rndRange(-200, 200);
        targetY = player.y + rndRange(-200, 200);
      }
    }

    // Clamp target to world bounds with margin
    targetX = Math.max(50, Math.min(world.w - 50, targetX));
    targetY = Math.max(50, Math.min(world.h - 50, targetY));

    // Calculate aim — no aimOffset for accurate shooting
    const dx = targetX - player.x;
    const dy = targetY - player.y;
    const dist = Math.hypot(dx, dy);

    const targetAim = Math.atan2(dy, dx);

    // Smoothly rotate currentAim towards targetAim (same turn speed as player)
    let aimDiff = targetAim - bot.currentAim;
    while (aimDiff > Math.PI) aimDiff -= Math.PI * 2;
    while (aimDiff < -Math.PI) aimDiff += Math.PI * 2;

    const radarLvl = player.powerupLevels?.Radar || 0;
    const turnSpeed = 4.0 + (radarLvl * 0.5); // matching player turn speed
    const maxTurn = turnSpeed * (THINK_INTERVAL / 1000);

    if (Math.abs(aimDiff) <= maxTurn) {
      bot.currentAim = targetAim;
    } else {
      bot.currentAim += Math.sign(aimDiff) * maxTurn;
    }

    // Normalize currentAim
    while (bot.currentAim > Math.PI) bot.currentAim -= Math.PI * 2;
    while (bot.currentAim < -Math.PI) bot.currentAim += Math.PI * 2;

    let thrust = { x: 0, y: 0 };

    // Thrust forward if target is far enough and we are roughly facing it
    if (dist > 30 && Math.abs(aimDiff) < Math.PI / 3) {
      thrust.x = Math.cos(bot.currentAim);
      thrust.y = Math.sin(bot.currentAim);
    }

    // Generate bot input — aim = currentAim so they fire forward
    const input = {
      seq: Math.floor(now / 25),
      aim: bot.currentAim,
      thrust,
      fire: shouldFire,
      dtMs: THINK_INTERVAL,
    };

    queueInput(world, botId, input);
  }
};

export const removeBot = (botId: string): void => {
  bots.delete(botId);
};

export const getBotCount = (): number => {
  return bots.size;
};

export const cleanupBots = (world: World): void => {
  // Remove bots for players that no longer exist
  for (const botId of bots.keys()) {
    if (!world.players.has(botId)) {
      bots.delete(botId);
    }
  }
};

export const clearBots = (): void => {
  bots.clear();
};
