import Phaser from "phaser";

type BulletSprite = Phaser.GameObjects.Shape;

interface ProjectileData {
  sprite: BulletSprite;
  vx: number;
  vy: number;
  isBeam?: boolean;
}

export default class Projectiles {
  private byId = new Map<string, ProjectileData>();

  constructor(private scene: Phaser.Scene) {}

  has(id: string) {
    return this.byId.has(id);
  }

  // Create sprite if missing (radius can change)
  // Add velocity parameters
  ensure(id: string, r: number, vx: number, vy: number, pierce?: boolean): boolean {
    let data = this.byId.get(id);
    if (!data) {
      let sprite: Phaser.GameObjects.Shape;
      if (pierce) {
        sprite = this.scene.add.rectangle(0, 0, r * 4, r * 1.5, 0x00ffff).setDepth(5);
        sprite.setRotation(Math.atan2(vy, vx));
      } else {
        sprite = this.scene.add.circle(0, 0, r, 0xffe066).setDepth(5);
      }
      this.byId.set(id, { sprite, vx, vy, isBeam: pierce });
      return true;
    } else {
      if (!data.isBeam) {
        (data.sprite as Phaser.GameObjects.Arc).setRadius(r);
      }
      data.vx = vx;
      data.vy = vy;
      if (data.isBeam) {
        data.sprite.setRotation(Math.atan2(vy, vx));
      }
      return false;
    }
  }

  // Set initial position
  place(id: string, sx: number, sy: number) {
    const data = this.byId.get(id);
    if (data) data.sprite.setPosition(sx, sy);
  }

  // Call this in your Scene's update loop, passing delta time in seconds
  update(dt: number) {
    for (const { sprite, vx, vy } of this.byId.values()) {
      sprite.x += vx * dt;
      sprite.y += vy * dt;
    }
  }

  removeMissing(currentIds: Set<string>) {
    for (const [id, data] of this.byId) {
      if (!currentIds.has(id)) {
        data.sprite.destroy();
        this.byId.delete(id);
      }
    }
  }
}
