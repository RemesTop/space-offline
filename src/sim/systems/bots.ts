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
  "Bender Bending Rodríguez",
  "Chatgpt 4o",
  "Gemini 3.1 pro",
  "Claude",
  "Grok",
  "Deepseek",
  "Arch linux",
  "Holy C",
  "Tohtori robotnik",
  "Dr Sykerö",
  "Tiimalasitimanttimatti",
  "Oispa töitä",
  "Itsekkin työtön",
  "Mitä tää tekee",
  "Cleverbot",
  "Skynet",
  "Rombotti",
  "Playstation 2 Slim",
  "Internet Explorer",
  "Tekoälytön",
  "Sekoälyllinen",
  "I play this allday",
  "GLaDOS",
  "You fix!",
  "Homer Simpson",
  "Dart Vader",
  "Tietorakenteet ja algoritmit",
  "Serverihiiri"
];

export const getRandomBotName = () => BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];

export type BotPersonality = "Aggressive" | "Cowardly" | "Scavenger" | "Balanced" | "Pro";

export type Bot = {
  playerId: string;
  targetX?: number;
  targetY?: number;
  shouldFire?: boolean;
  lastThinkAt: number;
  aggressiveness: number; // 0-1, how likely to seek players vs pickups
  aimOffset: number; // aim error in radians
  currentAim: number; // current aim angle
  personality: BotPersonality;
  decelUntil?: number; // timestamp to stop decelerating
};

const bots = new Map<string, Bot>();

export const spawnBot = (world: World): void => {
  if (world.players.size >= 20) return; // Don't spam too many bots

  const botId = nanoid();
  const spawn = randSafeSpawn(world);

  // Use empty socketId for bots - they don't have real sockets
  const player = addPlayer(world, botId, spawn, "");

  let maxPlayerLevel = 0;
  for (const p of world.players.values()) {
    if (p.socketId && p.level > maxPlayerLevel) {
      maxPlayerLevel = p.level;
    }
  }

  const targetLevel = Math.max(1, maxPlayerLevel > 8 ? maxPlayerLevel - 8 + Math.floor(Math.random() * 5) : 1);
  player.level = targetLevel;
  player.xp = 0; // reset xp

  if (targetLevel > 1) {
    if (player.isGiant) {
      player.maxHp += (targetLevel - 1) * 30;
      player.hp = player.maxHp;
    } else {
      player.maxHp += (targetLevel - 1) * 15;
      player.hp = player.maxHp;
    }

    // Give them an appropriate number of upgrades
    const numUpgrades = targetLevel - 1;
    for (let i = 0; i < numUpgrades; i++) {
      const upgradeRnd = Math.random();
      if (upgradeRnd < 0.25 && player.powerupLevels.Damage < 4) {
        player.powerupLevels.Damage++;
        player.damage += 2;
      } else if (upgradeRnd < 0.5 && player.powerupLevels.Engine < 4) {
        player.powerupLevels.Engine++;
        player.maxSpeed += 40;
        player.accel += 80;
      } else if (upgradeRnd < 0.75 && player.powerupLevels.FireRate < 4) {
        player.powerupLevels.FireRate++;
        player.fireCooldownMs = Math.max(100, player.fireCooldownMs - 15);
      } else if (player.powerupLevels.Hull < 4) {
        player.powerupLevels.Hull++;
        player.maxHp += 20;
        player.hp += 20;
      } else if (player.powerupLevels.Wings < 4) {
        player.powerupLevels.Wings++;
      }
    }
  }
  player.invulnUntil = performance.now() + 3000;

  // Give bot a random name
  const botName = getRandomBotName();
  player.name = botName;

  const personalities: BotPersonality[] = ["Aggressive", "Pro", "Scavenger", "Balanced"];
  let personality = personalities[Math.floor(Math.random() * personalities.length)];
  if (player.isGiant) {
    personality = "Aggressive";
  }

  let aggressiveness = Math.random() * 0.8 + 0.2;
  let aimOffset = (Math.random() - 0.5) * 0.3;
  if (personality === "Aggressive") {
    aggressiveness = Math.random() * 0.2 + 0.8; // 0.8 to 1.0
    aimOffset = (Math.random() - 0.5) * 0.1; // Better aim
  } else if (personality === "Cowardly") {
    aggressiveness = Math.random() * 0.3; // 0.0 to 0.3
  } else if (personality === "Pro") {
    aggressiveness = Math.random() * 0.2 + 0.8;
    aimOffset = 0; // Perfect aim
  }

  if (personality === "Pro" || personality === "Scavenger") {
    player.accel += 40; // Increased base acceleration
  }

  const bot: Bot = {
    playerId: botId,
    lastThinkAt: 0,
    aggressiveness,
    aimOffset,
    currentAim: Math.random() * Math.PI * 2,
    personality,
  };

  bots.set(botId, bot);
  console.log(`[bots] spawned bot: ${botName}`);
};

export const updateBots = (world: World, now: number): void => {
  const THINK_INTERVAL = 200; // ms between AI decisions

  // Re-adopt any orphaned bots (e.g. after a hot-module reload clears the bots map)
  for (const [id, player] of world.players) {
    if (!player.socketId && !bots.has(id)) {
      if (!player.name) player.name = getRandomBotName();
      bots.set(id, {
        playerId: id,
        lastThinkAt: now,
        aggressiveness: 0.8,
        aimOffset: 0.1,
        currentAim: Math.random() * Math.PI * 2,
        personality: (player.level && player.level > 6) ? "Pro" : "Aggressive",
      });
      console.log(`[bots] Re-adopted orphaned bot: ${player.name}`);
    }
  }

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

    // AI thinking interval - update targets every 200ms
    if (now - bot.lastThinkAt >= THINK_INTERVAL) {
      bot.lastThinkAt = now;

      // Find targets
      const nearbyPlayers = Array.from(world.players.values())
        .filter(p => p.id !== botId && (!p.deadUntil || now >= p.deadUntil) && p.hp > 0)
        .map(p => ({
          player: p,
          dist: Math.hypot(p.x - player.x, p.y - player.y)
        }))
        .filter(({ dist }) => dist < 400)
        .sort((a, b) => a.dist - b.dist);

      const pickupSearchRadius = bot.personality === "Scavenger" ? 800 : 500;
      const nearbyPickups = Array.from(world.pickups.values())
        .map(p => ({
          pickup: p,
          dist: Math.hypot(p.x - player.x, p.y - player.y)
        }))
        .filter(({ dist, pickup }) => dist < pickupSearchRadius && (pickup.type !== "hp" || player.hp < player.maxHp))
        .sort((a, b) => {
          const inFight = bot.personality === "Pro" && nearbyPlayers.length > 0 && nearbyPlayers[0].dist < 500;
          if (player.hp < player.maxHp * 0.5 || inFight) {
            if (a.pickup.type === "hp" && b.pickup.type !== "hp") return -1;
            if (b.pickup.type === "hp" && a.pickup.type !== "hp") return 1;
          }
          return a.dist - b.dist;
        });

      bot.targetX = player.x;
      bot.targetY = player.y;
      bot.shouldFire = false;

      let avoidX = 0;
      let avoidY = 0;

      const ignorePlanets = player.specialVariants.includes("Zero gravity");

      if (!ignorePlanets) {
        for (const well of world.wells) {
          const dx = player.x - well.x;
          const dy = player.y - well.y;
          const dist = Math.hypot(dx, dy);
          const isAggressive = bot.personality === "Aggressive" || bot.personality === "Pro";
          const baseDangerRadius = isAggressive ? 80 : 200;
          const baseStrength = isAggressive ? 300 : 600;

          const dangerRadius = well.radius + baseDangerRadius;

          if (dist < dangerRadius && dist > 1) {
            const strength = (dangerRadius - dist) / dangerRadius;

            // Push away
            avoidX += (dx / dist) * Math.pow(strength, 0.5) * baseStrength * 0.7;
            avoidY += (dy / dist) * Math.pow(strength, 0.5) * baseStrength * 0.7;

            // Orbit/Slingshot vector
            const orbitDir = (well.x + well.y) % 2 === 0 ? 1 : -1;
            avoidX += (-dy / dist) * orbitDir * Math.pow(strength, 0.5) * baseStrength * 0.5;
            avoidY += (dx / dist) * orbitDir * Math.pow(strength, 0.5) * baseStrength * 0.5;
          }
        }
      }

      const ignoreRocks = player.specialVariants.includes("Bumper Body");
      const shouldAvoidRocks = bot.personality === "Pro" || bot.personality === "Scavenger" || bot.personality === "Balanced";
      if (shouldAvoidRocks && !ignoreRocks) {
        for (const rock of world.rocks.values()) {
          const dx = player.x - rock.x;
          const dy = player.y - rock.y;
          const dist = Math.hypot(dx, dy);
          const dangerRadius = rock.r + player.r + 40;
          if (dist < dangerRadius && dist > 1) {
            const strength = (dangerRadius - dist) / dangerRadius;
            avoidX += (dx / dist) * strength * 200;
            avoidY += (dy / dist) * strength * 200;
          }
        }
      }

      const healthThreshold = bot.personality === "Cowardly" ? 0.60 : 0.35;
      const isLowHealth = player.hp < player.maxHp * healthThreshold;

      const prioritizedHpPickup = bot.personality === "Pro" && nearbyPlayers.length > 0 && nearbyPlayers[0].dist < 500 && nearbyPickups.length > 0 && nearbyPickups[0].pickup.type === "hp";

      let desiredDx = 0;
      let desiredDy = 0;

      if (isLowHealth && nearbyPlayers.length > 0 && nearbyPlayers[0].dist < 500) {
        // Flee from nearest player
        const target = nearbyPlayers[0].player;
        const fleeDx = player.x - target.x;
        const fleeDy = player.y - target.y;

        // Add strafing to fleeing
        const strafeDir = Math.random() > 0.5 ? 1 : -1;
        const strafeX = -fleeDy * strafeDir * 0.7;
        const strafeY = fleeDx * strafeDir * 0.7;

        desiredDx = fleeDx + strafeX;
        desiredDy = fleeDy + strafeY;
        bot.shouldFire = false;

        // Random deceleration to confuse aim (duration based)
        if (!bot.decelUntil && Math.random() < 0.02) {
          bot.decelUntil = now + rndRange(200, 600);
        }
        if (bot.decelUntil && now < bot.decelUntil) {
          desiredDx = 0;
          desiredDy = 0;
        }
      } else if (prioritizedHpPickup) {
        const target = nearbyPickups[0].pickup;
        desiredDx = target.x - player.x;
        desiredDy = target.y - player.y;
      } else if (nearbyPlayers.length > 0 && Math.random() < bot.aggressiveness && !isLowHealth) {
        const target = nearbyPlayers[0].player;
        desiredDx = target.x - player.x;
        desiredDy = target.y - player.y;

        const targetAim = Math.atan2(desiredDy, desiredDx);
        let aimDiff = targetAim - bot.currentAim;
        while (aimDiff > Math.PI) aimDiff -= Math.PI * 2;
        while (aimDiff < -Math.PI) aimDiff += Math.PI * 2;

        const fireRange = bot.personality === "Pro" ? 400 : 250;
        bot.shouldFire = nearbyPlayers[0].dist < fireRange && Math.abs(aimDiff) <= Math.PI / 3;
      } else if (nearbyPickups.length > 0) {
        const target = nearbyPickups[0].pickup;
        desiredDx = target.x - player.x;
        desiredDy = target.y - player.y;
      } else {
        const centerX = world.w / 2;
        const centerY = world.h / 2;
        const toCenterDist = Math.hypot(centerX - player.x, centerY - player.y);

        if (toCenterDist > 300) {
          desiredDx = (centerX + rndRange(-200, 200)) - player.x;
          desiredDy = (centerY + rndRange(-200, 200)) - player.y;
        } else {
          desiredDx = rndRange(-200, 200);
          desiredDy = rndRange(-200, 200);
        }
      }

      // Normalize objective vector to standard distance (e.g., 300) so it blends well with avoidance
      const objDist = Math.hypot(desiredDx, desiredDy) || 1;
      // If we are decelerating, objDist will be tiny, so we shouldn't force it to 300
      if (desiredDx !== 0 || desiredDy !== 0) {
        desiredDx = (desiredDx / objDist) * 300;
        desiredDy = (desiredDy / objDist) * 300;
      }

      // Combine objective with avoidance
      bot.targetX = player.x + desiredDx + avoidX;
      bot.targetY = player.y + desiredDy + avoidY;

      bot.targetX = Math.max(50, Math.min(world.w - 50, bot.targetX));
      bot.targetY = Math.max(50, Math.min(world.h - 50, bot.targetY));

      if (Math.hypot(bot.targetX - player.x, bot.targetY - player.y) < 20) {
        // We are stuck (likely at a wall). Move towards the center!
        bot.targetX = world.w / 2 + (Math.random() - 0.5) * 400;
        bot.targetY = world.h / 2 + (Math.random() - 0.5) * 400;
      }
    }

    if (bot.targetX === undefined || bot.targetY === undefined) continue;

    const dx = bot.targetX - player.x;
    const dy = bot.targetY - player.y;
    const dist = Math.hypot(dx, dy);
    const targetAim = Math.atan2(dy, dx);

    let aimDiff = targetAim - bot.currentAim;
    while (aimDiff > Math.PI) aimDiff -= Math.PI * 2;
    while (aimDiff < -Math.PI) aimDiff += Math.PI * 2;

    const wingsLvl = player.powerupLevels?.Wings || 0;
    const baseTurnSpeed = bot.personality === "Scavenger" ? 4.0 : 2.0;
    const turnSpeed = baseTurnSpeed + (wingsLvl * 0.25);
    // 33ms simulated dt for steering every tick
    const maxTurn = turnSpeed * (33 / 1000);

    if (Math.abs(aimDiff) <= maxTurn) {
      bot.currentAim = targetAim;
    } else {
      bot.currentAim += Math.sign(aimDiff) * maxTurn;
    }

    while (bot.currentAim > Math.PI) bot.currentAim -= Math.PI * 2;
    while (bot.currentAim < -Math.PI) bot.currentAim += Math.PI * 2;

    let thrust = { x: 0, y: 0 };
    if (dist > 30 && Math.abs(aimDiff) < Math.PI / 3) {
      thrust.x = Math.cos(bot.currentAim);
      thrust.y = Math.sin(bot.currentAim);
    }

    // Ensure all bots shoot if there's a player right in front of them, even if not explicitly targeting them
    if (!bot.shouldFire) {
      for (const p of world.players.values()) {
        if (p.id !== botId && (!p.deadUntil || now >= p.deadUntil) && p.hp > 0) {
          const pdx = p.x - player.x;
          const pdy = p.y - player.y;
          const pDist = Math.hypot(pdx, pdy);
          if (pDist < 400) {
            const pAim = Math.atan2(pdy, pdx);
            let pAimDiff = pAim - bot.currentAim;
            while (pAimDiff > Math.PI) pAimDiff -= Math.PI * 2;
            while (pAimDiff < -Math.PI) pAimDiff += Math.PI * 2;
            if (Math.abs(pAimDiff) < Math.PI / 6) { // within 30 degrees
              bot.shouldFire = true;
              break;
            }
          }
        }
      }
    }

    const input = {
      seq: Math.floor(now / 25),
      aim: bot.currentAim,
      thrust,
      fire: bot.shouldFire || false,
      dtMs: 33,
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
