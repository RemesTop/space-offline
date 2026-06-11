import Phaser from "phaser";

/**
 * Two-layer starfield with gentle parallax and EMA smoothing.
 * World units ~= pixels; we scale by dt so motion is frame-rate independent.
 */
export default class Parallax {
  private far!: Phaser.GameObjects.TileSprite;
  private near!: Phaser.GameObjects.TileSprite;

  // tunables
  private farFactor: number;
  private nearFactor: number;
  private smoothing: number; // 0..1, higher = smoother (more inertial)

  // smoothed velocity
  private vxE = 0;
  private vyE = 0;

  constructor(
    scene: Phaser.Scene,
    opts: { farFactor?: number; nearFactor?: number; smoothing?: number } = {},
  ) {
    // Defaults: very gentle drift. Near just a touch faster than far.
    this.farFactor = opts.farFactor ?? 0.06;
    this.nearFactor = opts.nearFactor ?? 0.1;
    this.smoothing = opts.smoothing ?? 0.85;

    // Generate textures once (reduced star radii)
    createStarTexture(scene, "stars_far", 512, 512, 70, 0.5, 1.2); // finer dust, smaller
    createStarTexture(scene, "stars_near", 512, 512, 40, 0.6, 1.8); // smaller bright stars

    const w = scene.scale.width;
    const h = scene.scale.height;

    this.far = scene.add
      .tileSprite(w/2, h/2, w, h, "stars_far")
      .setOrigin(0.5, 0.5)
      .setScrollFactor(0)
      .setDepth(0);

    this.near = scene.add
      .tileSprite(w/2, h/2, w, h, "stars_near")
      .setOrigin(0.5, 0.5)
      .setScrollFactor(0)
      .setAlpha(0.75)
      .setDepth(1);
  }

  /** Adjust how strong the layers react to velocity (can be called live). */
  setSpeeds(farFactor: number, nearFactor: number) {
    this.farFactor = farFactor;
    this.nearFactor = nearFactor;
  }

  /**
   * Update with your current world velocity.
   * @param vx world vx (px/sec)
   * @param vy world vy (px/sec)
   * @param dtMs optional frame delta; if omitted we assume ~60 FPS
   * @param cameraZoom camera zoom level for scaling adjustments
   */
  update(vx: number, vy: number, dtMs: number = 1000 / 60, cameraZoom: number = 1) {
    // Exponential moving average to kill jitter
    const a = 1 - this.smoothing; // blend factor
    this.vxE += (vx - this.vxE) * a;
    this.vyE += (vy - this.vyE) * a;

    const dt = Math.max(0, dtMs) / 1000;

    // Adjust parallax speed based on camera zoom
    const zoomAdjustment = 1 / cameraZoom;

    // Very gentle parallax; camera is fixed, so we offset tiles opposite velocity
    this.far.tilePositionX += this.vxE * this.farFactor * dt * zoomAdjustment;
    this.far.tilePositionY += this.vyE * this.farFactor * dt * zoomAdjustment;

    this.near.tilePositionX += this.vxE * this.nearFactor * dt * zoomAdjustment;
    this.near.tilePositionY += this.vyE * this.nearFactor * dt * zoomAdjustment;

    // Scale the star tiles based on camera zoom
    this.far.setScale(zoomAdjustment);
    this.near.setScale(zoomAdjustment);
  }
  /** Update the sizes of the starfield layers when screen resizes. */
  resize(width: number, height: number) {
    this.far.setSize(width, height);
    this.near.setSize(width, height);
    // Re-center them if needed
    this.far.setPosition(width / 2, height / 2);
    this.near.setPosition(width / 2, height / 2);
  }
}

function createStarTexture(
  scene: Phaser.Scene,
  key: string,
  w: number,
  h: number,
  count: number,
  minR: number,
  maxR: number,
) {
  if (scene.textures.exists(key)) return;
  const g = scene.add.graphics();
  g.fillStyle(0x000000, 1);
  g.fillRect(0, 0, w, h);
  // Weighted palette: mostly white, some cool blue and soft purple hues
  const palette = [
    { color: 0xffffff, weight: 70 }, // white
    { color: 0xbad4ff, weight: 15 }, // light blue
    { color: 0xd2b0ff, weight: 15 }, // soft purple
  ];
  const totalWeight = palette.reduce((s, p) => s + p.weight, 0);
  for (let i = 0; i < count; i++) {
    // pick color by weight
    let rPick = Math.random() * totalWeight;
    let chosen = palette[0].color;
    for (const p of palette) {
      if (rPick < p.weight) { chosen = p.color; break; }
      rPick -= p.weight;
    }
    const r = minR + Math.random() * (maxR - minR);
    // Subtle, rarer halo (smaller than before)
    if (r > 1.1 && Math.random() < 0.3) {
      g.fillStyle(chosen, 0.18);
      g.fillCircle(Math.random() * w, Math.random() * h, r * 1.4);
    }
    g.fillStyle(chosen, 1);
    g.fillCircle(Math.random() * w, Math.random() * h, r);
  }
  g.generateTexture(key, w, h);
  g.destroy();
}
