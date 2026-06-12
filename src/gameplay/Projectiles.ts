import Phaser from "phaser";

type BulletSprite = Phaser.GameObjects.Shape | Phaser.GameObjects.Image;

interface ProjectileData {
  sprite: BulletSprite;
  vx: number;
  vy: number;
  isBeam?: boolean;
  isPlasma?: boolean;
}

export default class Projectiles {
  private byId = new Map<string, ProjectileData>();
  private circlePool: ProjectileData[] = [];
  private rectPool: ProjectileData[] = [];
  private plasmaPool: ProjectileData[] = [];

  constructor(private scene: Phaser.Scene) { }

  has(id: string) {
    return this.byId.has(id);
  }

  // Create sprite if missing (radius can change)
  // Add velocity parameters
  ensure(id: string, r: number, vx: number, vy: number, isBeam?: boolean, isRedLaser?: boolean, isPlasma?: boolean): boolean {
    let data = this.byId.get(id);
    if (!data) {
      if (isPlasma) {
        if (this.plasmaPool.length > 0) {
          data = this.plasmaPool.pop()!;
          data.vx = vx;
          data.vy = vy;
          data.sprite.setVisible(true);
        } else {
          const sprite = this.scene.add.circle(0, 0, r, 0xff66ff).setDepth(5);
          data = { sprite, vx, vy, isPlasma: true };
        }
        (data.sprite as Phaser.GameObjects.Arc).setRadius(r);
      } else if (isBeam) {
        if (this.rectPool.length > 0) {
          data = this.rectPool.pop()!;
          data.vx = vx;
          data.vy = vy;
          data.sprite.setVisible(true);
        } else {
          const sprite = this.scene.add.rectangle(0, 0, r * 5, 7.5, 0).setDepth(5);
          data = { sprite, vx, vy, isBeam: true };
        }
        
        const color = isRedLaser ? 0xff6666 : 0x88ffff;
        (data.sprite as Phaser.GameObjects.Rectangle).setFillStyle(color);
        (data.sprite as Phaser.GameObjects.Rectangle).setSize(r * 5, 7.5);
        data.sprite.setRotation(Math.atan2(vy, vx));
      } else {
        if (this.circlePool.length > 0) {
          data = this.circlePool.pop()!;
          data.vx = vx;
          data.vy = vy;
          data.sprite.setVisible(true);
        } else {
          const sprite = this.scene.add.circle(0, 0, r, 0xffe066).setDepth(5);
          data = { sprite, vx, vy, isBeam: false };
        }
        (data.sprite as Phaser.GameObjects.Arc).setRadius(r);
      }
      this.byId.set(id, data);
      return true;
    } else {
      if (data.isPlasma) {
        (data.sprite as Phaser.GameObjects.Image).setDisplaySize(r * 2.5, r * 2.5);
      } else if (!data.isBeam) {
        (data.sprite as Phaser.GameObjects.Arc).setRadius(r);
      } else {
        (data.sprite as Phaser.GameObjects.Rectangle).setSize(r * 5, 7.5);
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
        // Fade out instead of instant disappear
        this.scene.tweens.add({
          targets: data.sprite,
          alpha: 0,
          duration: 100,
          onComplete: () => {
            data.sprite.setVisible(false);
            data.sprite.setAlpha(1); // Reset for pool
            if (data.isPlasma) {
              this.plasmaPool.push(data);
            } else if (data.isBeam) {
              this.rectPool.push(data);
            } else {
              this.circlePool.push(data);
            }
          }
        });
        this.byId.delete(id);
      }
    }
  }

  destroy() {
    for (const data of this.byId.values()) {
      data.sprite.destroy();
    }
    this.byId.clear();
    for (const data of this.circlePool) data.sprite.destroy();
    for (const data of this.rectPool) data.sprite.destroy();
    for (const data of this.plasmaPool) data.sprite.destroy();
    this.circlePool = [];
    this.rectPool = [];
    this.plasmaPool = [];
  }
}
