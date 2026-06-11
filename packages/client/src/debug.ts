import type Phaser from "phaser";
import { GRAVITY } from "@shared/constants";
import type { WellState } from "@shared/types";

/** Minimal context those debug drawers need (structural typing matches GameScene). */
export interface DebugCtx {
  wells: WellState[];
  worldW: number;
  worldH: number;
  debugWellsOn: boolean;
  wellGfx: Phaser.GameObjects.Graphics;
  boundsGfx: Phaser.GameObjects.Graphics;
  scale: { width: number; height: number };

  /** Camera anchor in world space (use interpolated 'you' each frame). */
  camX: number;
  camY: number;
  specialVariant?: string;
}

/** Draw the world bounds rectangle relative to the camera anchor. */
export function drawArenaBounds(ctx: DebugCtx): void {
  const { boundsGfx: g, scale, worldW, worldH, camX, camY } = ctx;

  g.clear();
  g.lineStyle(2, 0x2d385a, 0.95);

  const cx = scale.width / 2;
  const cy = scale.height / 2;

  const sx = (wx: number) => cx + (wx - camX);
  const sy = (wy: number) => cy + (wy - camY);

  const x0 = sx(0),
    y0 = sy(0);
  const x1 = sx(worldW),
    y1 = sy(0);
  const x2 = sx(worldW),
    y2 = sy(worldH);
  const x3 = sx(0),
    y3 = sy(worldH);

  g.beginPath();
  g.moveTo(x0, y0);
  g.lineTo(x1, y1);
  g.lineTo(x2, y2);
  g.lineTo(x3, y3);
  g.closePath();
  g.strokePath();
}

export function drawGravityDebug(ctx: DebugCtx): void {
  const { wellGfx: g, debugWellsOn, wells, scale, camX, camY, specialVariant } = ctx;
  g.clear();
  if (!debugWellsOn) return;
  if (specialVariant === 'Zero gravity') return;

  const cx = scale.width / 2;
  const cy = scale.height / 2;

  // Net acceleration at the anchor
  let ax = 0,
    ay = 0;

  for (const w of wells) {
    const sx = cx + (w.x - camX);
    const sy = cy + (w.y - camY);

    const colCore = w.type === "planet" ? 0x4caf50 : w.type === "sun" ? 0xffc107 : 0x9c27b0; // blackhole

    const colInfl = w.type === "planet" ? 0x81c784 : w.type === "sun" ? 0xffecb3 : 0xce93d8;

    // Influence radius
    // g.lineStyle(1, colInfl, 0.7);
    // g.strokeCircle(sx, sy, w.influenceRadius);

    // Core
    // g.fillStyle(colCore, 0.25);
    // g.fillCircle(sx, sy, w.radius);

    // Hazard rings
    // if (w.type === "sun") {
    //   g.lineStyle(2, 0xff7043, 0.9);
    //   g.strokeCircle(sx, sy, w.radius + 60);
    // } else if (w.type === "blackhole") {
    //   g.lineStyle(2, 0xe91e63, 0.9);
    //   g.strokeCircle(sx, sy, w.radius + 40);
    // }

    // Net accel contribution if inside influence
    const dx = w.x - camX;
    const dy = w.y - camY;
    const d2 = dx * dx + dy * dy;
    if (d2 <= w.influenceRadius * w.influenceRadius) {
      const d = Math.sqrt(d2) || 1;
      const force = Math.min((GRAVITY.G * w.mass) / (d2 + GRAVITY.epsilon), w.maxPull);
      ax += (dx / d) * force;
      ay += (dy / d) * force;
    }
  }

  // Draw net gravity arrow
  const mag = Math.hypot(ax, ay);
  if (mag > 0) {
    const scaleLen = 0.07;
    const len = Math.min(250, Math.max(40, mag * scaleLen)); // Even longer arrow with minimum length of 40px
    const nx = ax / mag;
    const ny = ay / mag;
    const ex = cx + nx * len;
    const ey = cy + ny * len;

    g.lineStyle(1.5, 0xffffff, 0.9);
    g.beginPath();
    g.moveTo(cx, cy);
    g.lineTo(ex, ey);
    g.strokePath();

    const ah = 10;
    const ang = Math.atan2(ny, nx);
    const lx = ex - Math.cos(ang - Math.PI / 6) * ah;
    const ly = ey - Math.sin(ang - Math.PI / 6) * ah;
    const rx = ex - Math.cos(ang + Math.PI / 6) * ah;
    const ry = ey - Math.sin(ang + Math.PI / 6) * ah;
    g.lineBetween(ex, ey, lx, ly);
    g.lineBetween(ex, ey, rx, ry);
  }
}
