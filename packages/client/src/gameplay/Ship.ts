import Phaser from "phaser";

type ShipOpts = {
  scale?: number;
  angleOffsetRad?: number; // rotate texture so 0 rad means “forward”
  showNose?: boolean;
  ringRadius?: number;
  noseOffsetFactor?: number; // from center to tip as fraction of width (default ~0.48)
};

export default class Ship {
  private scene: Phaser.Scene;
  body: Phaser.GameObjects.Image;
  wings: Phaser.GameObjects.Image;
  window: Phaser.GameObjects.Image;
  point: Phaser.GameObjects.Image;
  weapon: Phaser.GameObjects.Image;
  thruster: Phaser.GameObjects.Sprite;
  ring: Phaser.GameObjects.Arc;
  private _angleOffsetRad: number;
  private _noseR: number;
  private _lastRot = 0;
  private _scale: number;
  private _originalTint = 0xffffff;

  // Added properties for name tag and death pinning
  worldX?: number;
  worldY?: number;
  nameTag?: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, opts: ShipOpts = {}) {
    this.scene = scene;
    const {
      scale = 0.03,
      angleOffsetRad = 1.57,
      showNose = true,
      ringRadius = 18,
      noseOffsetFactor = 0.48,
    } = opts;
    this._angleOffsetRad = angleOffsetRad;
    this._scale = scale;

    // Create each part, body at the bottom
    this.body = scene.add.image(0, 0, "raketti/body0.png").setOrigin(0.5, 0.5).setDepth(2).setScale(scale);
    this.wings = scene.add.image(0, 0, "raketti/wings0.png").setOrigin(0.5, 0.5).setDepth(3).setScale(scale);
    this.window = scene.add.image(0, 0, "raketti/window0.png").setOrigin(0.5, 0.5).setDepth(4).setScale(scale);
    this.point = scene.add.image(0, 0, "raketti/point0.png").setOrigin(0.5, 0.5).setDepth(5).setScale(scale);
    this.weapon = scene.add.image(0, 0, "raketti/weapon0.png").setOrigin(0.5, 0.5).setDepth(6).setScale(scale);

    // Create thruster sprite behind the ship
    this.thruster = scene.add.sprite(0, 0, "fire/fire0.png").setOrigin(0.5, 0.5).setDepth(1.5).setScale(scale);
    this.thruster.play('fire_thruster');
    this.thruster.setVisible(false); // Hidden by default

    // Distance from center to nose tip (scaled)
    this._noseR = this.body.width * scale * Math.min(0.5, Math.max(0, noseOffsetFactor));

    this.ring = scene.add
      .circle(0, 0, ringRadius, 0x000000, 0)
      .setStrokeStyle(1.5, 0xffffff, 0)
      .setDepth(6);

    if (showNose) {
      const nose = scene.add.circle(0, 0, 2, 0xffffff, 0.9).setDepth(7);
      nose.setName("nose");
      (this.body as any).__nose = nose;
    }
  }

  setNameTag(name: string) {
    if (!this.nameTag) {
      this.nameTag = this.scene.add.text(0, 0, name, {
        fontSize: '12px',
        color: '#ffffff',
        fontFamily: 'monospace',
      }).setOrigin(0.5, 1).setDepth(2000).setAlpha(0.6);
    } else {
      this.nameTag.setText(name);
    }
  }

  setPosition(x: number, y: number) {
    this.body.setPosition(x, y);
    this.wings.setPosition(x, y);
    this.window.setPosition(x, y);
    this.point.setPosition(x, y);
    this.weapon.setPosition(x, y);
    this.ring.setPosition(x, y);

    if (this.nameTag) {
      // Position nametag slightly above the ship
      this.nameTag.setPosition(x, y - (this.body.width * this._scale * 0.5) - 20);
    }

    // Position thruster behind the ship based on rotation
    this.updateThrusterPosition(this._lastRot);
  }

  private updateThrusterPosition(rot: number) {
    const thrusterDistance = 15; // Distance behind the ship center
    const angle = rot + Math.PI; // Opposite direction of ship's movement
    const thrusterX = this.body.x + Math.cos(angle) * thrusterDistance;
    const thrusterY = this.body.y + Math.sin(angle) * thrusterDistance;
    this.thruster.setPosition(thrusterX, thrusterY);
  }

  setRotation(rad: number) {
    this._lastRot = rad;
    const finalRot = rad + this._angleOffsetRad;
    this.body.setRotation(finalRot);
    this.wings.setRotation(finalRot);
    this.window.setRotation(finalRot);
    this.point.setRotation(finalRot);
    this.weapon.setRotation(finalRot);
    this.thruster.setRotation(finalRot);
    
    this.updateThrusterPosition(rad);
  }

  setInvuln(on: boolean) {
    this.ring.setAlpha(on ? 1 : 0.35);
    this.ring.setStrokeStyle(on ? 2 : 1.5, 0xffffff, on ? 0.9 : 0.35);
  }

  setTint(color: number) {
    this._originalTint = color;
    this._applyTint(color);
  }

  private _applyTint(color: number) {
    this.body.setTint(color);
    this.wings.setTint(color);
    this.window.setTint(color);
    this.point.setTint(color);
    this.weapon.setTint(color);
    this.thruster.setTint(color);
  }

  playHitEffect() {
    this._applyTint(0xffffff); // Flash white
    this.scene.time.delayedCall(80, () => this._applyTint(this._originalTint));
  }

  setThrusterVisible(visible: boolean) {
    this.thruster.setVisible(visible);
  }

  setAlpha(alpha: number) {
    this.body.setAlpha(alpha);
    this.wings.setAlpha(alpha);
    this.window.setAlpha(alpha);
    this.point.setAlpha(alpha);
    this.weapon.setAlpha(alpha);
    this.thruster.setAlpha(alpha);
    if (this.nameTag) this.nameTag.setAlpha(alpha * 0.6);
  }

  destroy() {
    this.body.destroy();
    this.wings.destroy();
    this.window.destroy();
    this.weapon.destroy();
    this.point.destroy();
    this.thruster.destroy();
    this.ring.destroy();
    if (this.nameTag) this.nameTag.destroy();
  }


  // Update ship textures based on player stats
  updateTextures(stats: {
    maxHp: number;
    damage: number;
    maxSpeed: number;
    accel: number;
    magnetRadius: number;
    fireCooldownMs: number;
    hullLevel?: number;
    isGiant?: boolean;
  }) {
    const { maxHp, damage, maxSpeed, accel, magnetRadius, fireCooldownMs, hullLevel, isGiant } = stats;

    // Body texture based on HP - changes at level 2 (120HP), then level 5 (140HP)
    // Level 1: 100HP (texture 0), Level 2+: 120HP+ (texture 1), Level 5+: 140HP+ (texture 2)
    const bodyLevel = maxHp <= 125 ? 0 : maxHp < 140 ? 1 : 2;
    this.body.setTexture(`raketti/body${bodyLevel}.png`);

    // Weapon texture based on fire cooldown - changes at level 2, then level 5
    // Level 1: 220ms (texture 0), Level 2+: <220ms (texture 1), Level 5+: much lower (texture 2)
    const weaponLevel = fireCooldownMs >= 220 ? 0 : fireCooldownMs > 180 ? 1 : 2;
    this.weapon.setTexture(`raketti/weapon${weaponLevel}.png`);

    // Point texture based on base damage - changes at level 2, then level 5
    // Level 1: 12 damage (texture 0), Level 2+: 16+ damage (texture 1), Level 5+: 24+ damage (texture 2)
    const pointLevel = damage <= 12 ? 0 : damage < 24 ? 1 : 2;
    this.point.setTexture(`raketti/point${pointLevel}.png`);

    // Wings texture based on acceleration - changes at level 2, then level 5
    // Level 1: 700 accel (texture 0), Level 2+: 740+ accel (texture 1), Level 5+: 820+ accel (texture 2)
    const wingsLevel = accel <= 700 ? 0 : accel < 820 ? 1 : 2;
    this.wings.setTexture(`raketti/wings${wingsLevel}.png`);

    // Window texture based on magnet radius - changes at level 2, then level 5
    // Level 1: 100 radius (texture 0), Level 2+: 130+ radius (texture 1), Level 5+: 190+ radius (texture 2)
    const windowLevel = magnetRadius <= 100 ? 0 : magnetRadius < 190 ? 1 : 2;
    this.window.setTexture(`raketti/window${windowLevel}.png`);

    // Scale ship based on hull level and giant status
    if (hullLevel !== undefined) {
      const giantMultiplier = isGiant ? 1.2 : 1.0;
      const newScale = this._scale * giantMultiplier * (1 + 0.15 * hullLevel + 0.06 * wingsLevel);
      this.body.setScale(newScale);
      this.wings.setScale(newScale);
      this.window.setScale(newScale);
      this.point.setScale(newScale);
      this.weapon.setScale(newScale);
      this.thruster.setScale(newScale);

      // Update nose relative position based on new scale
      this._noseR = this.body.width * newScale * 0.48;
    }
  }

  // Removed nose sync method
}
