import Phaser from "phaser";

type PickupType = "xp" | "hp" | "xp-giant";
type PickupSprite = Phaser.GameObjects.Arc | Phaser.GameObjects.Container | Phaser.GameObjects.Image;

interface StardustParticle {
  gfx: Phaser.GameObjects.Graphics;
  baseAlpha: number;
  twinkleFreq: number;
  twinklePhase: number;
  baseX: number;
  baseY: number;
  oscA: number;
  oscR: number;
  color: number;
  glow: number;
  glowR: number;
  starR: number;
}

export default class Pickups {
  private byId = new Map<string, PickupSprite>();
  private stardustParticles = new Map<string, StardustParticle[]>();

  constructor(private scene: Phaser.Scene) {
    scene.events.on("update", this.updateStardust, this);
  }

  // Create sprite if missing (color by type)
  ensure(id: string, type: PickupType) {
    if (type === "xp" || type === "xp-giant") {
      if (!this.byId.has(id)) {
        const container = this.scene.add.container(0, 0).setDepth(2);
        const particles: StardustParticle[] = [];
        const count = type === "xp-giant" ? 12 : 9; // many more particles for giant
        const maxRadius = type === "xp-giant" ? 35 : 16;
        for (let i = 0; i < count; i++) {
          const t = Math.pow(Math.random(), 1.2); // slightly less bias for more spread
          const r = maxRadius * t;
          const a = Math.random() * Math.PI * 2;
          const x = Math.cos(a) * r;
          const y = Math.sin(a) * r;
          const gfx = this.scene.add.graphics({ x, y });
          
          let color = 0xFFFBEA; // warm yellow/white (base)
          let glow = 0xfff7b2; // soft outer glow
          if (type === "xp-giant") {
            color = 0xffeccc; // slightly warmer core
            glow = 0xff7744; // soft orange-red outer glow
          }

          // Draw glow
          gfx.fillStyle(glow, type === "xp-giant" ? 0.4 : 0.25);
          gfx.fillCircle(0, 0, type === "xp-giant" ? 14 : 8);
          // Draw main star
          gfx.fillStyle(color, 1);
          gfx.fillCircle(0, 0, (type === "xp-giant" ? 5 : 2.5) + Math.random() * 2);
          container.add(gfx);
          particles.push({
            gfx,
            baseAlpha: 0.7 + Math.random() * 0.3, // brighter base
            twinkleFreq: 0.8 + Math.random() * 2.2, // more twinkle variation
            twinklePhase: Math.random() * Math.PI * 2,
            baseX: x,
            baseY: y,
            oscA: Math.random() * Math.PI * 2,
            oscR: 1.2 + Math.random() * 2.2, // more movement
            color,
            glow,
            glowR: type === "xp-giant" ? 14 : 8,
            starR: (type === "xp-giant" ? 5 : 2.5) + Math.random() * 2,
          });
        }
        container.setAlpha(0);
        this.scene.tweens.add({ targets: container, alpha: 1, duration: 500 });
        this.byId.set(id, container);
        this.stardustParticles.set(id, particles);
      }
      return;
    }
    // Only hp is a heart image now
    if (type === "hp") {
      if (!this.byId.has(id)) {
        const img = this.scene.add.image(0, 0, "heart").setDepth(2).setDisplaySize(24, 24);
        img.setAlpha(0);
        this.scene.tweens.add({ targets: img, alpha: 1, duration: 500 });
        this.byId.set(id, img);
      }
      return;
    }
  }

  // Set screen-space position (computed in Scene from interpolated world coords)
  place(id: string, sx: number, sy: number) {
    const s = this.byId.get(id);
    if (s) {
      // Only render if on screen
      const w = this.scene.scale.width;
      const h = this.scene.scale.height;
      const margin = 120; // Increased margin for further render distance
      const visible = sx >= -margin && sx <= w + margin && sy >= -margin && sy <= h + margin;
      s.setVisible(visible);
      if (visible) s.setPosition(sx, sy);
    }
  }

  removeMissing(currentIds: Set<string>) {
    for (const [id, s] of this.byId) {
      if (!currentIds.has(id)) {
        s.destroy();
        this.byId.delete(id);
      }
    }
  }

  private updateStardust(time: number) {
    for (const [id, particles] of this.stardustParticles) {
      for (const p of particles) {
        // Twinkle effect: more intense and glowing
        const twinkle = (Math.sin(time * 0.001 * p.twinkleFreq + p.twinklePhase) * 0.5 + 0.5) * 1.1;
        const alpha = Phaser.Math.Clamp(p.baseAlpha + twinkle, 0.5, 1.2);
        p.gfx.clear();
        // Glow
        p.gfx.fillStyle(p.glow, (p.glowR > 8 ? 0.4 : 0.25) * alpha);
        p.gfx.fillCircle(0, 0, p.glowR);
        // Main star
        p.gfx.fillStyle(p.color, alpha);
        p.gfx.fillCircle(0, 0, p.starR);
        // Oscillate around base position, but do not drift
        const osc = Math.sin(time * 0.002 + p.oscA) * p.oscR;
        p.gfx.x = p.baseX + Math.cos(p.oscA) * osc;
        p.gfx.y = p.baseY + Math.sin(p.oscA) * osc;
      }
    }
  }
}
