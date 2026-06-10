import Phaser from "phaser";
import { Net } from "@client/net/socket";
import { NamePrompt } from "@client/ui/NamePrompt";
import { LevelUpModal } from "@client/ui/LevelUpModal";
import { HUD } from "@client/ui/HUD";
import { GameOverModal } from "@client/ui/GameOverModal";
import type { ServerSnapshot } from "@shared/messages";
import type { WellState } from "@shared/types";
import { Interp } from "@client/state/interp";
import { Recon } from "@client/state/recon";
import Ship from "@client/gameplay/Ship";
import Projectiles from "@client/gameplay/Projectiles";
import Pickups from "@client/gameplay/Pickups";
import Parallax from "@client/gameplay/Parallax";
import { drawArenaBounds, drawGravityDebug } from "@client/debug";

const SNAPSHOT_HZ = 12;
const SELF_TINT = 0x8ac6ff;
const OTHER_TINT = 0x4aa3ff;
const SHIP_TEX_KEY = "ship_png"; // loaded from packages/assets/spaceship.png

let globalNet: Net | null = null;

export default class GameScene extends Phaser.Scene {
  net!: Net;

  hud!: HUD;
  levelModal!: LevelUpModal;
  gameOverModal!: GameOverModal;

  // Run stats
  runStartMs = performance.now();
  distanceTraveled = 0;
  maxSpeedSeen = 0;
  lastScore = 0;
  lastLevel = 1;
  gameEnded = false;

  interp = new Interp();
  recon = new Recon();

  ships = new Map<string, Ship>();
  bullets!: Projectiles;
  pickups!: Pickups;
  parallax!: Parallax;

  // Track ships playing death animations to prevent premature cleanup
  dyingShips = new Set<string>();

  // Track explosion containers so they stay pinned to world coordinates
  explosionContainers = new Set<Phaser.GameObjects.Container>();

  wells: WellState[] = [];
  debugWellsOn = true;
  debugFullView = false; // New debug flag for full arena view
  wellGfx!: Phaser.GameObjects.Graphics;

  // Radar upgrade tracking for zoom functionality
  radarLevel = 0;

  // Planet sprite management
  planetSprites = new Map<string, Phaser.GameObjects.Image>();

  // arena/bounds
  worldW = 4000; // overwritten by welcome
  worldH = 3000;
  boundsGfx!: Phaser.GameObjects.Graphics;

  // pickup interpolation (snapshot to snapshot)
  pickPrev = new Map<string, { x: number; y: number; type: "xp" | "hp" | "xp-giant" }>();
  pickCurr = new Map<string, { x: number; y: number; type: "xp" | "hp" | "xp-giant" }>();
  pickAlpha = 1;

  // input state
  seq = 0;
  lastInputAt = 0;
  heading = 0; // ship facing direction (radians) — controlled by A/D
  aim = 0; // aim direction for bullets — equals heading in Asteroids mode
  thrust = { x: 0, y: 0 };
  fireHeld = false;
  altFireHeld = false;
  lastShootSound = 0;

  // camera anchor (interpolated you)
  camX = 0;
  camY = 0;

  // input model
  space!: Phaser.Input.Keyboard.Key; // Spacebar to fire
  keyW!: Phaser.Input.Keyboard.Key;
  keyA!: Phaser.Input.Keyboard.Key;
  keyS!: Phaser.Input.Keyboard.Key;
  keyD!: Phaser.Input.Keyboard.Key;
  alwaysThrust = false; // Desktop: always thrust toward pointer
  isThrusting = false; // Mobile: thrust while touching
  touchFireHeld = false; // Mobile FIRE button (toggle state)

  touchFireBtn!: HTMLDivElement;

  // Audio
  menuMusic!: Phaser.Sound.BaseSound; // start & end screens
  gameMusic!: Phaser.Sound.BaseSound; // in-game background
  playerName = '';

  rockSprites = new Map<string, Phaser.GameObjects.Sprite>();

  audioCtx?: AudioContext;

  constructor() {
    super("Game");
  }

  // Calculate camera zoom based on radar level
  updateCameraZoom() {
    if (this.debugFullView) return; // Don't interfere with debug view
    const baseZoom = 1.4; // Base zoom level
    const zoomOutPerLevel = 0.05; // How much to zoom out per radar level
    const calculatedZoom = baseZoom - (this.radarLevel * zoomOutPerLevel);
    this.cameras.main.setZoom(calculatedZoom);
  }

  preload() {
    // Preload custom ship part textures - all upgrade levels (0, 1, 2)
    this.load.image("raketti/body0.png", new URL("../assets/raketti/body0.png", import.meta.url).toString());
    this.load.image("raketti/body1.png", new URL("../assets/raketti/body1.png", import.meta.url).toString());
    this.load.image("raketti/body2.png", new URL("../assets/raketti/body2.png", import.meta.url).toString());

    this.load.image("raketti/wings0.png", new URL("../assets/raketti/wings0.png", import.meta.url).toString());
    this.load.image("raketti/wings1.png", new URL("../assets/raketti/wings1.png", import.meta.url).toString());
    this.load.image("raketti/wings2.png", new URL("../assets/raketti/wings2.png", import.meta.url).toString());

    this.load.image("raketti/window0.png", new URL("../assets/raketti/window0.png", import.meta.url).toString());
    this.load.image("raketti/window1.png", new URL("../assets/raketti/window1.png", import.meta.url).toString());
    this.load.image("raketti/window2.png", new URL("../assets/raketti/window2.png", import.meta.url).toString());

    this.load.image("raketti/point0.png", new URL("../assets/raketti/point0.png", import.meta.url).toString());
    this.load.image("raketti/point1.png", new URL("../assets/raketti/point1.png", import.meta.url).toString());
    this.load.image("raketti/point2.png", new URL("../assets/raketti/point2.png", import.meta.url).toString());

    this.load.image("raketti/weapon0.png", new URL("../assets/raketti/weapon0.png", import.meta.url).toString());
    this.load.image("raketti/weapon1.png", new URL("../assets/raketti/weapon1.png", import.meta.url).toString());
    this.load.image("raketti/weapon2.png", new URL("../assets/raketti/weapon2.png", import.meta.url).toString());

    this.load.image("raketti/bodyspecial.png", new URL("../assets/raketti/bodyspecial.png", import.meta.url).toString());
    this.load.image("raketti/wingsspecial.png", new URL("../assets/raketti/wingsspecial.png", import.meta.url).toString());
    this.load.image("raketti/windowspecial.png", new URL("../assets/raketti/windowspecial.png", import.meta.url).toString());
    this.load.image("raketti/windowspecial-aim.png", new URL("../assets/raketti/windowspecial-aim.png", import.meta.url).toString());
    this.load.image("raketti/pointspecial.png", new URL("../assets/raketti/pointspecial.png", import.meta.url).toString());
    this.load.image("raketti/weaponspecial.png", new URL("../assets/raketti/weaponspecial.png", import.meta.url).toString());

    // Preload fire animation textures
    this.load.image("fire/fire0.png", new URL("../assets/fire/fire0.png", import.meta.url).toString());
    this.load.image("fire/fire1.png", new URL("../assets/fire/fire1.png", import.meta.url).toString());
    this.load.image("fire/fire2.png", new URL("../assets/fire/fire2.png", import.meta.url).toString());
    this.load.image("fire/fire3.png", new URL("../assets/fire/fire3.png", import.meta.url).toString());

    // Preload heart image for HP pickups
    this.load.image("heart", new URL("../assets/muut/heart.png", import.meta.url).toString());
    // Preload planet assets
    this.load.image("EARTH", new URL("../assets/planeetat/EARTH.png", import.meta.url).toString());
    this.load.image("JUPITER", new URL("../assets/planeetat/JUPITER.png", import.meta.url).toString());
    this.load.image("MARS", new URL("../assets/planeetat/MARS.png", import.meta.url).toString());
    this.load.image("NEPTUNUS", new URL("../assets/planeetat/NEPTUNUS.png", import.meta.url).toString());
    this.load.image("SATURNUS", new URL("../assets/planeetat/SATURNUS.png", import.meta.url).toString());
    this.load.image("SUN", new URL("../assets/planeetat/SUN.png", import.meta.url).toString());
    this.load.image("VENUS", new URL("../assets/planeetat/VENUS.png", import.meta.url).toString());
    
    // Preload rock
    this.load.image("rock", new URL("../assets/rock.png", import.meta.url).toString());
    // Preload rock
    this.load.image("rock", new URL("../assets/rock.png", import.meta.url).toString());

    // Audio assets - swapped back according to request
    this.load.audio("menuMusic", new URL("../assets/sounds/ambient-space-fantasy-music-for-mindful-escapism-141536.mp3", import.meta.url).toString());
    this.load.audio("gameMusic", new URL("../assets/sounds/space-ambient-351305.mp3", import.meta.url).toString());
  }

  async create(data?: { playerName?: string }) {
    // Reset or initialize core state each (re)create
    this.runStartMs = performance.now();
    this.distanceTraveled = 0;
    this.maxSpeedSeen = 0;
    this.lastScore = 0;
    this.lastLevel = 1;
    this.gameEnded = false;
    this.touchFireHeld = false; // Reset touch fire toggle state
    this.wells = [];
    this.pickPrev = new Map();
    this.pickCurr = new Map();
    this.pickAlpha = 1;
    this.ships = new Map();
    this.dyingShips.clear();
    this.radarLevel = 0; // Reset radar level for new game
    this.planetSprites.forEach(s => s.destroy());
    this.planetSprites = new Map();

    // Use global Net instance to persist simulation state across respawns
    if (!globalNet) {
      globalNet = new Net();
    }
    this.net = globalNet;

    (window as any).net = this.net;
    this.cameras.main.setBackgroundColor('#05070b');

    // ALWAYS recreate gameplay display-object based managers (their GameObjects were destroyed on scene restart)
    this.parallax = new Parallax(this);
    this.bullets = new Projectiles(this);
    this.pickups = new Pickups(this);

    // Reuse HUD / modals if they already exist (they manage DOM/overlays), otherwise create once
    if (!this.hud) {
      this.hud = new HUD();
      this.levelModal = new LevelUpModal();
      this.gameOverModal = new GameOverModal();
    } else {
      this.hud.setScoreboard([]);
    }

    // Audio setup (re-create sounds each time to avoid overlap)
    this.menuMusic = this.sound.add('menuMusic', { loop: true, volume: 0 });
    this.gameMusic = this.sound.add('gameMusic', { loop: true, volume: 0.5 });
    (this.menuMusic as any).setVolume?.(0);
    (this.gameMusic as any).setVolume?.(0.5);

    let menuFadedIn = false;
    const fadeInMenu = () => {
      if (menuFadedIn) return;
      menuFadedIn = true;
      this.fadeSound(this.menuMusic, 0, 0.5, 800, false);
    };

    if ((this.sound as any).locked) {
      this.sound.once(Phaser.Sound.Events.UNLOCKED, () => {
        if (!this.menuMusic.isPlaying) { try { this.menuMusic.play(); } catch {} }
        fadeInMenu();
      });
      try { this.menuMusic.play(); } catch {}
    } else {
      try { if (!this.menuMusic.isPlaying) this.menuMusic.play(); } catch {}
      fadeInMenu();
    }

    this.wellGfx = this.add.graphics().setDepth(8);
    this.boundsGfx = this.add.graphics().setDepth(7);

    // Set default camera zoom for better visibility
    this.updateCameraZoom(); // Use radar-based zoom calculation

    // Create fire animation
    if (!this.anims.exists('fire_thruster')) {
      this.anims.create({
        key: 'fire_thruster',
        frames: [
          { key: 'fire/fire0.png' },
          { key: 'fire/fire1.png' },
          { key: 'fire/fire2.png' },
          { key: 'fire/fire3.png' }
        ],
        frameRate: 12,
        repeat: -1
      });
    }

    // Debug key "I" to toggle full arena view
    this.input.keyboard?.on("keydown-I", () => {
      this.debugFullView = !this.debugFullView;
      if (this.debugFullView) {
        this.cameras.main.setZoom(Math.min(this.scale.width / this.worldW, this.scale.height / this.worldH));
        this.cameras.main.centerOn(this.worldW / 2, this.worldH / 2);
      } else {
        this.updateCameraZoom();
      }
    });

    if (!this.audioCtx) {
      try {
        this.audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      } catch (e) {
        console.warn("Web Audio API not supported", e);
      }
    }

    // Touch FIRE button (mobile)
    this.touchFireBtn = document.createElement("div");
    this.touchFireBtn.className = "touch-fire";
    this.touchFireBtn.innerText = "FIRE";
    document.body.appendChild(this.touchFireBtn);
    this.touchFireBtn.onpointerdown = () => {
      this.touchFireHeld = !this.touchFireHeld; // Toggle fire state
      this.updateTouchFireButton();
    };
    // Remove pointerup and pointercancel handlers since we're using toggle
    this.touchFireBtn.onpointerup = () => {};
    this.touchFireBtn.onpointercancel = () => {};
    
    // Initialize button appearance
    this.updateTouchFireButton();

    // Input mode: desktop vs mobile
    const isDesktop = this.sys.game.device.os.desktop;
    this.alwaysThrust = isDesktop;

    // Spacebar fires
    this.space = this.input.keyboard?.addKey(
      Phaser.Input.Keyboard.KeyCodes.SPACE,
    ) as Phaser.Input.Keyboard.Key;

    // WASD Movement
    this.keyW = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.W) as Phaser.Input.Keyboard.Key;
    this.keyA = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.A) as Phaser.Input.Keyboard.Key;
    this.keyS = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.S) as Phaser.Input.Keyboard.Key;
    this.keyD = this.input.keyboard?.addKey(Phaser.Input.Keyboard.KeyCodes.D) as Phaser.Input.Keyboard.Key;

    // Debug key for testing XP - T key gives +25 XP
    this.input.keyboard?.on("keydown-T", () => {
      if (this.net.youId) {
        // Send a debug command to the server to add XP
        this.net.socket.emit("debug", { type: "addXP", amount: 25 });
      }
    });

    // Mobile thrust: hold touch to thrust; release to stop
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (!isDesktop) this.isThrusting = true;
      
      // Left mouse button for alternative fire (desktop only)
      if (isDesktop && pointer.leftButtonDown()) {
        this.altFireHeld = true;
      }
    });
    this.input.on("pointerup", (pointer: Phaser.Input.Pointer) => {
      if (!isDesktop) {
        this.isThrusting = false;
        this.thrust = { x: 0, y: 0 };
      }
      
      // Release alternative fire when left mouse button is released
      if (isDesktop && pointer.leftButtonReleased()) {
        this.altFireHeld = false;
      }
    });
    // We compute aim/thrust every frame in update() now.

    // Ask for player name (skip prompt on restart)
    let name: string;
    if (data?.playerName) {
      name = data.playerName;
      this.playerName = name;
      // Immediately start game music (skip menu linger)
      this.fadeToGameMusic();
    } else {
      const prompt = new NamePrompt();
      name = await prompt.getName();
      this.playerName = name;
      this.fadeToGameMusic();
    }

    // Start connecting (resolves on 'welcome'), register handlers, then join, then await welcome
    const rawUrl = (import.meta.env as any).VITE_SERVER_URL || "http://localhost:8008";
    let serverUrl: string = rawUrl;
    // If page is https but URL is http, upgrade to avoid mixed content block
    if (window.location.protocol === 'https:' && rawUrl.startsWith('http://')) {
      serverUrl = 'https://' + rawUrl.substring('http://'.length);
    }
    // Final sanity: ensure it has protocol
    if (!/^https?:\/\//i.test(serverUrl)) {
      serverUrl = window.location.origin;
    }
    console.log('[net] Initializing local game simulation...');
    const connectP = this.net.connect(serverUrl);

    this.net.onEvent(async (e) => {
      if (e.type === 'Kill') {
        // Create explosion effect at death location
        this.createExplosion(e.x, e.y);
        // Make the victim ship fade/blink
        this.makeShipDeathEffect(e.victimId, e.x, e.y);
        // If YOU died, end run (only once)
        if (!this.gameEnded && e.victimId === this.net.youId) {
          this.gameEnded = true;
          const now = performance.now();
          const duration = now - this.runStartMs;
          const stats = {
            score: e.victimScore || this.lastScore, // Use score from kill event if available
            level: e.victimLevel || this.lastLevel, // Use level from kill event if available
            durationMs: duration,
            distance: this.distanceTraveled,
            maxSpeed: this.maxSpeedSeen,
          };
          // Wait for user to click respawn -> reload page to get fresh session
          setTimeout(() => {
            this.levelModal.hide(); // Force hide level up modal if it was open
            document.body.classList.add("game-over");
            this.gameOverModal.show(stats);
            // Stop sending inputs
            this.net.socket.disconnect();
            
            this.gameOverModal.waitRespawn().then(() => {
              this.handleRespawn();
            });
          }, 1500); // 1.5s delay to watch explosion
          this.fadeToMenuMusic();
        }
      } else if (e.type === 'LevelUpOffer') {
        // Get current player stats to pass to modal
        const you = this.interp.get(this.net.youId || "");
        const choice = await this.levelModal.choose(e.choices, you);
        this.net.choosePowerup(choice);
      } else if (e.type === 'LevelUpApplied') {
        // Update ship textures when stats change
        const updated = (e as any).updated;
        const ship = this.ships.get(this.net.youId!);
        if (ship && updated) {
          ship.updateTextures({
            maxHp: updated.maxHp,
            damage: updated.damage,
            maxSpeed: updated.maxSpeed,
            accel: updated.accel,
            magnetRadius: updated.magnetRadius,
            fireCooldownMs: updated.fireCooldownMs,
            specialVariant: updated.specialVariant,
          });
          const youId = this.net.youId;
          if (youId) {
            const you = this.interp.get(youId);
            if (you) {
              Object.assign(you, e.updated);
              // Update radar level and camera zoom
              if (updated.radarLevel !== undefined) {
                this.radarLevel = updated.radarLevel;
                this.updateCameraZoom();
              }
              // Immediately refresh HUD powerups panel from event data
              this.hud.setPowerups({ ...you, powerupLevels: updated.powerupLevels });
            }
          }
        }
      }
    });
    this.net.onSnapshot((s) => this.onSnapshot(s));

    this.net.join(name);
    const welcome = await connectP;
    this.worldW = welcome.world.w;
    this.worldH = welcome.world.h;

    // Ensure your ship exists immediately (in case no snapshot yet)
    const youId = this.net.youId!;
    if (!this.ships.has(youId)) {
      const ship = new Ship(this, { scale: 0.03, ringRadius: 18, showNose: true });
      ship.body.setDepth(1000);
      ship.wings.setDepth(1001);
      ship.window.setDepth(1002);
      ship.point.setDepth(1003);
      ship.ring.setDepth(1004);
      ship.setTint(SELF_TINT);
      this.ships.set(youId, ship);
    }
  }

  playSynthSound(type: "shoot" | "death", volumeScale = 1.0) {
    if (!this.audioCtx) return;
    if (this.audioCtx.state === 'suspended') this.audioCtx.resume();
    const t = this.audioCtx.currentTime;
    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();
    osc.connect(gain);
    gain.connect(this.audioCtx.destination);

    if (type === "shoot") {
      osc.type = "square";
      osc.frequency.setValueAtTime(400, t);
      osc.frequency.exponentialRampToValueAtTime(100, t + 0.1);
      gain.gain.setValueAtTime(0.1 * volumeScale, t);
      gain.gain.exponentialRampToValueAtTime(0.01 * volumeScale, t + 0.1);
      osc.start(t);
      osc.stop(t + 0.1);
    } else {
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(100, t);
      osc.frequency.exponentialRampToValueAtTime(10, t + 0.5);
      gain.gain.setValueAtTime(0.3 * volumeScale, t);
      gain.gain.exponentialRampToValueAtTime(0.01 * volumeScale, t + 0.5);
      osc.start(t);
      osc.stop(t + 0.5);
    }
  }

  onSnapshot(s: ServerSnapshot) {
    this.interp.push(s.entities);

    // Store previous wells for interpolation
    const prevWells = this.wells;
    this.wells = s.wells;

    // If we have previous wells, set up interpolation
    if (prevWells.length > 0) {
      for (let i = 0; i < this.wells.length && i < prevWells.length; i++) {
        const curr = this.wells[i];
        const prev = prevWells[i];

        // Check if this is the same planet (by ID) and if the movement is reasonable
        const isSamePlanet = curr.id === prev.id;
        const movementDistance = Math.hypot(curr.x - prev.x, curr.y - prev.y);
        const maxReasonableMovement = 200; // Max pixels a planet should move between snapshots

        // Only interpolate if it's the same planet and movement is reasonable
        if (isSamePlanet && movementDistance < maxReasonableMovement) {
          (curr as any)._prevX = prev.x;
          (curr as any)._prevY = prev.y;
          (curr as any)._interpAlpha = 0;
        } else {
          // Don't interpolate for respawned planets or large jumps
          (curr as any)._prevX = curr.x;
          (curr as any)._prevY = curr.y;
          (curr as any)._interpAlpha = 1;
        }
      }
    }

    const you = s.entities.find((e) => e.id === (this.net.youId || s.youId));
    if (!you) return;

    if (!this.ships.has(you.id)) {
      const me = new Ship(this, { scale: 0.03, ringRadius: 18, showNose: true });
      me.setTint(SELF_TINT);
      this.ships.set(you.id, me);
    }
    this.recon.setYouState(you);

    // HUD
    this.hud.setScoreboard(s.scoreboard, this.net.youId || undefined);
    if (you.maxHp) this.hud.setHP(you.hp ?? 0, you.maxHp);
    if (typeof (you as any).xp === "number" && typeof (you as any).xpToNext === "number") {
      this.hud.setXP((you as any).xp, (you as any).xpToNext);
    }
    // Track score/level for game over stats
    if (typeof (you as any).score === 'number') this.lastScore = (you as any).score;
    if (typeof (you as any).level === 'number') this.lastLevel = (you as any).level;

    // Update radar level from powerupLevels if available
    if ((you as any).powerupLevels?.Radar !== undefined) {
      const newRadarLevel = (you as any).powerupLevels.Radar;
      if (this.radarLevel !== newRadarLevel) {
        this.radarLevel = newRadarLevel;
        this.updateCameraZoom();
      }
    } else if ((you as any).hp === 0 || (you as any).hp === undefined) {
      // Reset radar level when dead (before respawn)
      if (this.radarLevel !== 0) {
        this.radarLevel = 0;
        this.updateCameraZoom();
      }
    }

    // Bullets: ensure sprites now (placement each frame from interpolated entities)
    const bulletIds = new Set<string>();
    const cx = this.cameras.main.centerX;
    const cy = this.cameras.main.centerY;
    const youInterp = this.interp.get(this.net.youId || "");
    const youX = youInterp?.x || cx;
    const youY = youInterp?.y || cy;

    for (const e of s.entities) {
      if (e.kind === "bullet") {
        const isNew = this.bullets.ensure(e.id, e.r, e.vx, e.vy); // Pass velocity here
        if (isNew && e.ownerId !== this.net.youId && !this.gameEnded) {
          const dist = Math.hypot(e.x - youX, e.y - youY);
          if (dist < 1000) {
            const vol = Math.max(0.01, 1 - dist / 1000) * 0.4;
            this.playSynthSound("shoot", vol);
          }
        }
        bulletIds.add(e.id);
      }
    }
    this.bullets.removeMissing(bulletIds);

    // Pickups: store prev/curr for interpolation; ensure sprites
    this.pickPrev = this.pickCurr;
    this.pickCurr = new Map(s.pickups.map((p) => [p.id, { x: p.x, y: p.y, type: p.type }]));
    this.pickAlpha = 0;

    const pickupIds = new Set<string>();
    for (const [id, p] of this.pickCurr) {
      this.pickups.ensure(id, p.type);
      pickupIds.add(id);
    }
    this.pickups.removeMissing(pickupIds);

    // Ensure all player sprites exist; tint others; update textures; clean up missing
    const playerIds = new Set<string>();
    const rockIds = new Set<string>();
    for (const e of s.entities) {
      if (e.kind === "player") {
        playerIds.add(e.id);
        if (!this.ships.has(e.id)) {
          const ship = new Ship(this, { scale: 0.03, ringRadius: 18, showNose: true });
          const tint = e.id === you.id ? SELF_TINT : (e.isGiant ? 0x555555 : OTHER_TINT);
          ship.setTint(tint);
          this.ships.set(e.id, ship);
        }
        
        // Update ship textures if we have the stats
        const ship = this.ships.get(e.id);
        if (ship && e.maxHp && e.damage && e.maxSpeed && e.accel && e.magnetRadius && e.fireCooldownMs) {
          ship.updateTextures({
            maxHp: e.maxHp,
            damage: e.damage,
            maxSpeed: e.maxSpeed,
            accel: e.accel,
            magnetRadius: e.magnetRadius,
            fireCooldownMs: e.fireCooldownMs,
            hullLevel: e.powerupLevels?.Hull,
            engineLevel: e.powerupLevels?.Engine,
            radarLevel: e.powerupLevels?.Radar,
            isGiant: e.isGiant,
            specialVariant: (e as any).specialVariant,
          });
        }
      } else if (e.kind === "rock") {
        rockIds.add(e.id);
        let rock = this.rockSprites.get(e.id);
        if (!rock) {
          rock = this.add.sprite(0, 0, "rock").setDepth(2);
          this.rockSprites.set(e.id, rock);
        }
        if (e.r) {
          rock.setDisplaySize(e.r * 2, e.r * 2);
        }
      }
    }
    
    for (const [id, ship] of this.ships) {
      if (!playerIds.has(id) && !this.dyingShips.has(id)) {
        ship.destroy();
        this.ships.delete(id);
      }
    }

    for (const [id, rock] of this.rockSprites) {
      if (!rockIds.has(id)) {
        rock.destroy();
        this.rockSprites.delete(id);
      }
    }

    // Update HUD with current powerup levels
    if ((you as any).powerupLevels) {
      this.hud.setPowerups({ ...you, powerupLevels: (you as any).powerupLevels });
    }
  }

  update(_time: number, delta: number) {
    const cx = this.scale.width / 2;
    const cy = this.scale.height / 2;
    const dt = delta / 1000; // seconds

    const isDesktop = this.sys.game.device.os.desktop;

    if (!isDesktop) {
      // Mobile logic: follow pointer
      const pointer = this.input.activePointer;
      this.heading = Math.atan2(pointer.worldY - cy, pointer.worldX - cx);
      this.aim = this.heading;
      const mouseDist = Math.hypot(pointer.worldX - cx, pointer.worldY - cy);
      const stopRadius = 120;

      if ((this.alwaysThrust || this.isThrusting) && mouseDist > stopRadius) {
        this.thrust = { x: Math.cos(this.heading), y: Math.sin(this.heading) };
      } else {
        this.thrust = { x: 0, y: 0 };
      }
    } else {
      // Desktop: Asteroids-style tank controls
      // Turn speed: base 4.0 rad/s + 0.5 per radar level
      const turnSpeed = 4.0 + (this.radarLevel * 0.5);

      // A/D rotate heading
      if (this.keyA?.isDown) this.heading -= turnSpeed * dt;
      if (this.keyD?.isDown) this.heading += turnSpeed * dt;

      // Normalize heading to [-PI, PI]
      while (this.heading > Math.PI) this.heading -= Math.PI * 2;
      while (this.heading < -Math.PI) this.heading += Math.PI * 2;

      // W = forward thrust along heading, S = reverse
      if (this.keyW?.isDown) {
        this.thrust = { x: Math.cos(this.heading), y: Math.sin(this.heading) };
      } else if (this.keyS?.isDown) {
        this.thrust = { x: -Math.cos(this.heading) * 0.5, y: -Math.sin(this.heading) * 0.5 };
      } else {
        this.thrust = { x: 0, y: 0 };
      }

      // Aim = heading (bullets fire forward from ship nose)
      this.aim = this.heading;
    }

    // Control thruster visibility (show when W is held on desktop)
    const myShip = this.ships.get(this.net.youId!);
    if (myShip) {
      let showThruster = false;
      if (isDesktop) {
        showThruster = this.keyW?.isDown ?? false;
      } else {
        const pointer = this.input.activePointer;
        const mouseDist = Math.hypot(pointer.worldX - cx, pointer.worldY - cy);
        showThruster = (this.thrust.x !== 0 || this.thrust.y !== 0) && mouseDist > 120;
      }
      myShip.setThrusterVisible(showThruster);
    }

    const oldFire = this.fireHeld;
    const spaceDown = this.space?.isDown ?? false;
    this.fireHeld = spaceDown || this.touchFireHeld || this.altFireHeld;

    // Play shoot sound locally continuously if held
    const currentNow = performance.now();
    if (this.fireHeld) {
      const youState = this.interp.get(this.net.youId || "");
      const cooldown = (youState as any)?.fireCooldownMs || 220;
      if (currentNow - this.lastShootSound >= cooldown) {
        this.playSynthSound("shoot", 1.0);
        this.lastShootSound = currentNow;
      }
    } else {
      this.lastShootSound = 0; // Reset so it fires immediately on next press
    }

    // Send input at ~40 Hz
    const dtMs = delta;
    const now = performance.now();
    if (now - this.lastInputAt > 1000 / 40 && this.net.youId) {
      const payload = {
        id: this.net.youId!,
        seq: ++this.seq,
        aim: this.aim,
        thrust: this.thrust,
        fire: this.fireHeld,
        dtMs,
      } as const;
      this.net.sendInput(payload as any);
      this.recon.record(payload as any);
      this.lastInputAt = now;
    }

    // Interpolated "you" for smooth rendering/camera base
    let youI =
      this.interp.get(this.net.youId || "") ?? this.interp.current.get(this.net.youId || "");

    if (youI) {
      // Update distance & max speed (only while game active)
      if (!this.gameEnded) {
        const speed = Math.hypot(youI.vx, youI.vy);
        this.distanceTraveled += speed * (delta / 1000);
        if (speed > this.maxSpeedSeen) this.maxSpeedSeen = speed;
      }

      // Other players relative to interpolated you
      for (const id of this.interp.ids()) {
        const e = this.interp.get(id)!;
        if (e.kind !== "player") continue;

        const ship = this.ships.get(id);
        if (!ship) continue;

        ship.setPosition(cx + (e.x - youI.x), cy + (e.y - youI.y));

        if (!e.socketId && e.name) {
          ship.setNameTag(`${e.name} - ${Math.round(e.hp || 0)}`);
        }

        // Damage feedback effect
        if (ship.lastHp !== undefined && e.hp !== undefined && e.hp < ship.lastHp && e.hp > 0) {
          ship.playHitEffect();
        }
        ship.lastHp = e.hp;

        // Name tag coloring
        if (ship.nameTag) {
          if ((e as any).isGiant || ((e as any).level && (e as any).level > 5)) {
            ship.nameTag.setColor("#ff0000");
          } else {
            ship.nameTag.setColor("#ffffff");
          }
        }

        if (id === this.net.youId) {
          youI = e;
        } else {
          // Apply other ships' rotation instantly for bots (with interpolation, use aim)
          if ((e as any).aim !== undefined) {
            ship.setRotation((e as any).aim);
          } else {
            const spd = Math.hypot(e.vx, e.vy);
            if (spd > 0.001) {
              ship.setRotation(Math.atan2(e.vy, e.vx));
            }
          }
          
          // Face their movement direction (guard tiny velocities)
          const spd = Math.hypot(e.vx, e.vy);
          if (spd > 0.001) {
            // Show thruster when moving fast enough
            ship.setThrusterVisible(spd > 50); // Show thruster if speed > 50 units
          } else {
            ship.setThrusterVisible(false);
          }
        }

        // Handle invulnerability blinking
        if ((e as any).isInvuln) {
          const alpha = (Date.now() % 200 < 100) ? 0.3 : 0.8;
          ship.setAlpha(alpha);
        } else {
          ship.setAlpha(1);
        }
      }

      // Your ship stays centered and faces heading
      const myShip2 = this.ships.get(this.net.youId!);
      if (myShip2) {
        myShip2.setPosition(cx, cy);
        myShip2.setRotation(this.heading);
        
        // Handle invulnerability blinking for your own ship
        if ((youI as any).isInvuln) {
          const alpha = (Date.now() % 200 < 100) ? 0.3 : 0.8;
          myShip2.setAlpha(alpha);
        } else {
          myShip2.setAlpha(1);
        }
      }

      // Parallax + HUD from interpolated you (dt for framerate independence)
      if (!this.debugFullView) {
        this.parallax.update(youI.vx, youI.vy, delta, this.cameras.main.zoom);
      } else {
        // In debug mode, still update parallax but with camera zoom for proper scaling
        this.parallax.update(youI.vx, youI.vy, delta, this.cameras.main.zoom);
      }
      if (youI.maxHp) this.hud.setHP(youI.hp ?? 0, youI.maxHp);
      // Update velocity display
      this.hud.setVelocity(youI.vx, youI.vy);
    }

    // Bullets and Rocks: place via interpolated entities
    if (youI) {
      for (const id of this.interp.ids()) {
        const e = this.interp.get(id)!;
        if (e.kind === "bullet") {
          this.bullets.place(id, cx + (e.x - youI.x), cy + (e.y - youI.y));
        } else if (e.kind === "rock") {
          const rock = this.rockSprites.get(id);
          if (rock) {
            rock.setPosition(cx + (e.x - youI.x), cy + (e.y - youI.y));
            // Smoothly rotate rock instead of snapping to snapshot rotation
            rock.rotation += (e.vx > 0 ? 0.5 : -0.5) * (delta / 1000);
          }
        }
      }
    }

    // Pickups: interpolate between snapshots
    this.pickAlpha = Math.min(1, this.pickAlpha + delta / (1000 / SNAPSHOT_HZ));
    if (youI) {
      for (const [id, cur] of this.pickCurr) {
        const prev = this.pickPrev.get(id) || cur;
        const x = prev.x + (cur.x - prev.x) * this.pickAlpha;
        const y = prev.y + (cur.y - prev.y) * this.pickAlpha;
        this.pickups.place(id, cx + (x - youI.x), cy + (y - youI.y));
      }
    }

    // Camera anchor for debug drawers
    if (youI) {
      this.camX = youI.x;
      this.camY = youI.y;
    } else if (this.recon.you) {
      this.camX = this.recon.you.x;
      this.camY = this.recon.you.y;
    }

    // Advance entity interpolation
    this.interp.step(delta / 1000, 1000 / SNAPSHOT_HZ);

    // NEW: advance planet (well) interpolation alpha per well for smooth motion
    const wellStep = delta / (1000 / SNAPSHOT_HZ);
    for (const w of this.wells) {
      const anyW: any = w as any;
      if (anyW._interpAlpha !== undefined && anyW._interpAlpha < 1) {
        anyW._interpAlpha = Math.min(1, anyW._interpAlpha + wellStep);
      }
    }

    // Render planet sprites
    this.updatePlanetSprites(youI);

    // Draw arena and gravity overlay (use camX/camY)
    if (document && (document.body.classList.contains('pre-game') || document.body.classList.contains('game-over'))) {
      // Hide world border during name prompt or game over
      this.boundsGfx.clear();
    } else {
      drawArenaBounds(this);
    }
    drawGravityDebug(this);

    // Update bullets movement
    this.bullets.update(delta / 1000);

    // Update explosion containers and dying ships
    if (youI) {
      for (const id of this.dyingShips) {
        const ship = this.ships.get(id);
        if (ship && (ship as any).worldX !== undefined && (ship as any).worldY !== undefined) {
          ship.setPosition(cx + ((ship as any).worldX - youI.x), cy + ((ship as any).worldY - youI.y));
        }
      }
      for (const container of this.explosionContainers) {
        container.setPosition(
          cx + (container.getData('worldX') - youI.x),
          cy + (container.getData('worldY') - youI.y)
        );
      }
    }
  }

  /** Ensure planet sprites exist and update their positions */
  private updatePlanetSprites(youI: any) {
    if (!youI) return;

    const cx = this.scale.width / 2;
    const cy = this.scale.height / 2;

    // Track current well IDs
    const currentWellIds = new Set(this.wells.map(w => w.id));

    // Remove sprites for wells that no longer exist
    for (const [wellId, sprite] of this.planetSprites) {
      if (!currentWellIds.has(wellId)) {
        sprite.destroy();
        this.planetSprites.delete(wellId);
      }
    }

    // Ensure sprites exist and position them (with interpolation between snapshots)
    for (const well of this.wells) {
      if ((well.type === "planet" || well.type === "sun") && well.texture) {
        const textureKey = well.texture;
        if (!this.planetSprites.has(well.id)) {
          if (this.textures.exists(textureKey)) {
            const sprite = this.add.image(0, 0, textureKey).setDepth(1);
            // Scale sprite to match well radius
            const targetDiameter = well.radius * 2;
            const scale = targetDiameter / sprite.width;
            sprite.setScale(scale);
            this.planetSprites.set(well.id, sprite);
          }
        }
        const sprite = this.planetSprites.get(well.id);
        if (sprite) {
          // Interpolated position using previous snapshot data (attached in onSnapshot)
          const anyW: any = well as any;
          const prevX = anyW._prevX ?? well.x;
            const prevY = anyW._prevY ?? well.y;
            const a = anyW._interpAlpha ?? 1;
            const ix = prevX + (well.x - prevX) * a;
            const iy = prevY + (well.y - prevY) * a;
          const sx = cx + (ix - youI.x);
          const sy = cy + (iy - youI.y);
          sprite.setPosition(sx, sy);
          sprite.rotation += 0.001; // Slow rotation
        }
      }
    }
  }

  /** Create explosion effect at world coordinates */
  createExplosion(worldX: number, worldY: number) {
    const youI = this.interp.get(this.net.youId || "");
    if (!youI) return;

    const cx = this.scale.width / 2;
    const cy = this.scale.height / 2;
    const sx = cx + (worldX - youI.x);
    const sy = cy + (worldY - youI.y);

    const container = this.add.container(sx, sy).setDepth(1000);
    container.setData('worldX', worldX);
    container.setData('worldY', worldY);
    this.explosionContainers.add(container);

    // Create explosion particles
    const particleCount = 12;
    const explosionRadius = 60;
    
    for (let i = 0; i < particleCount; i++) {
      const angle = (i / particleCount) * Math.PI * 2;
      const distance = 20 + Math.random() * explosionRadius;
      
      const particle = this.add.circle(0, 0, 3 + Math.random() * 4, 0xff6600);
      container.add(particle);
      
      this.tweens.add({
        targets: particle,
        x: Math.cos(angle) * distance,
        y: Math.sin(angle) * distance,
        alpha: 0,
        scale: 0.3,
        duration: 800 + Math.random() * 500,
        ease: 'Power2'
      });
    }

    // Create bright flash
    const flash = this.add.circle(0, 0, 8, 0xffaa00);
    container.add(flash);
    
    this.tweens.add({
      targets: flash,
      scale: 4,
      alpha: 0,
      duration: 400,
      ease: 'Power2'
    });

    // Create shockwave ring
    const ring = this.add.circle(0, 0, 5, 0xffffff, 0)
      .setStrokeStyle(2, 0xff8800);
    container.add(ring);
    
    this.tweens.add({
      targets: ring,
      radius: explosionRadius,
      alpha: 0,
      duration: 700,
      ease: 'Power2',
      onComplete: () => {
        container.destroy();
        this.explosionContainers.delete(container);
      }
    });

    // Play death sound based on distance
    if (youI) {
      const dist = Math.hypot(worldX - youI.x, worldY - youI.y);
      if (dist < 1500) {
        const vol = Math.max(0.01, 1 - dist / 1500) * 0.8;
        this.playSynthSound("death", vol);
      }
    }
  }

  /** Make ship fade and blink during death */
  makeShipDeathEffect(victimId: string, worldX: number, worldY: number) {
    const ship = this.ships.get(victimId);
    if (!ship) return;

    (ship as any).worldX = worldX;
    (ship as any).worldY = worldY;

    // Mark ship as dying to prevent cleanup during animation
    this.dyingShips.add(victimId);

    // Hide thruster immediately on death
    ship.setThrusterVisible(false);

    // Create a blinking/fading effect
    const shipParts = [
      (ship as any).body,
      (ship as any).wings,
      (ship as any).window,
      (ship as any).point,
      (ship as any).weapon,
      (ship as any).ring,
      (ship as any).thruster,
      (ship as any).nameTag
    ].filter(Boolean);
    // First, make the ship blink rapidly
    this.tweens.add({
      targets: shipParts,
      alpha: 0.2,
      duration: 120,
      yoyo: true,
      repeat: 5, // 6 blinks total
      ease: 'Power2',
      onComplete: () => {
        // After blinking, fade out completely (NO scale change — that causes the "flash huge" bug)
        this.tweens.add({
          targets: shipParts,
          alpha: 0,
          duration: 600,
          ease: 'Power2',
          onComplete: () => {
            // Remove from dying ships set and clean up
            this.dyingShips.delete(victimId);
            if (this.ships.has(victimId)) {
              const currentShip = this.ships.get(victimId);
              if (currentShip === ship) {
                ship.destroy();
                this.ships.delete(victimId);
              }
            }
          }
        });
      }
    });
  }

  private handleRespawn() {
    // Hide level up modal in case it was open
    this.levelModal.hide();
    // Clear any pending level-up offer so it doesn't carry over
    if (this.net.youId) {
      const player = this.net.world.players.get(this.net.youId);
      if (player) player.pendingOffer = false;
    }
    // Stop sounds to avoid overlap
    try { this.menuMusic?.stop(); } catch {}
    try { this.gameMusic?.stop(); } catch {}
    // Restart scene with stored player name
    this.scene.restart({ playerName: this.playerName });
  }

  private fadeToGameMusic() {
    if (this.menuMusic?.isPlaying) {
      this.fadeSound(this.menuMusic, 0.5, 0, 600, true);
    }
    if (this.gameMusic && !this.gameMusic.isPlaying) {
      (this.gameMusic as any).setVolume?.(0);
      this.gameMusic.play();
      this.fadeSound(this.gameMusic, 0, 0.5, 900, false);
    }
  }

  private fadeToMenuMusic() {
    if (this.gameMusic?.isPlaying) {
      this.fadeSound(this.gameMusic, 0.5, 0, 800, true);
    }
    if (this.menuMusic && !this.menuMusic.isPlaying) {
      (this.menuMusic as any).setVolume?.(0);
      this.menuMusic.play();
      this.fadeSound(this.menuMusic, 0, 0.5, 1200, false);
    }
  }

  private fadeSound(sound: Phaser.Sound.BaseSound, from: number, to: number, duration: number, stopOnZero: boolean) {
    const proxy = { v: from };
    (sound as any).setVolume?.(from);
    this.tweens.add({
      targets: proxy,
      v: to,
      duration,
      onUpdate: () => (sound as any).setVolume?.(proxy.v),
      onComplete: () => {
        if (stopOnZero && to === 0) sound.stop();
      }
    });
  }

  private updateTouchFireButton() {
    if (!this.touchFireBtn) return;
    // Update button appearance based on toggle state
    this.touchFireBtn.style.backgroundColor = this.touchFireHeld ? '#ff6600' : '';
    this.touchFireBtn.innerText = this.touchFireHeld ? "STOP" : "FIRE";
  }
}
