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
  private _specialVariants?: string[];

  // Added properties for name tag and death pinning
  worldX?: number;
  worldY?: number;
  nameTag?: Phaser.GameObjects.Text;
  lastHp?: number;

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
    
    if (this._specialVariants?.includes('Zero gravity') && color === this._originalTint) {
      this.thruster.setTint(0x00ffff);
    } else {
      this.thruster.setTint(color);
    }
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
    engineLevel?: number;
    wingsLevel?: number;
    hullLevel?: number;
    isGiant?: boolean;
    specialVariants?: string[];
  }) {
    const { maxHp, damage, maxSpeed, accel, magnetRadius, fireCooldownMs, hullLevel, engineLevel, wingsLevel, isGiant, specialVariants } = stats;

    this._specialVariants = specialVariants;

    // Body texture based on Hull level - changes at level 2, then level 5
    // Level 1: (texture 0), Level 2+: (texture 1), Level 5+: (texture 2)
    const bodyTexLevel = (hullLevel || 0) < 1 ? 0 : (hullLevel || 0) < 4 ? 1 : 2;
    this.body.setTexture(`raketti/body${bodyTexLevel}.png`);
    if (specialVariants?.includes('Bumper Body')) this.body.setTexture('raketti/bodyspecial.png');

    // Weapon texture based on fire cooldown - changes at level 2, then level 4
    // Level 1: 220ms (texture 0), Level 2-3: <220ms (texture 1), Level 4+: <=145ms (texture 2)
    const weaponLevel = fireCooldownMs >= 220 ? 0 : fireCooldownMs > 150 ? 1 : 2;
    this.weapon.setTexture(`raketti/weapon${weaponLevel}.png`);
    if (specialVariants?.includes('Twin Weapon')) this.weapon.setTexture('raketti/weaponspecial.png');

    // Point texture based on base damage - changes at level 2, then level 4
    // Level 1: 12 damage (texture 0), Level 2-3: 16+ damage (texture 1), Level 4+: 24+ damage (texture 2)
    const pointLevel = damage <= 12 ? 0 : damage < 24 ? 1 : 2;
    this.point.setTexture(`raketti/point${pointLevel}.png`);

    // Wings texture based on wings level - changes at level 2, then level 4
    // Level 1: (texture 0), Level 2-3: (texture 1), Level 4+: (texture 2)
    const wingsTexLevel = (wingsLevel || 0) < 1 ? 0 : (wingsLevel || 0) < 3 ? 1 : 2;
    this.wings.setTexture(`raketti/wings${wingsTexLevel}.png`);
    if (specialVariants?.includes('Regen Wings')) this.wings.setTexture('raketti/wingsspecial.png');

    // Window texture based on magnet radius - changes at level 2, then level 4
    // Level 1: 100 radius (texture 0), Level 2-3: 130+ radius (texture 1), Level 4+: 220+ radius (texture 2)
    const windowLevel = magnetRadius <= 100 ? 0 : magnetRadius < 190 ? 1 : 2;
    this.window.setTexture(`raketti/window${windowLevel}.png`);
    if (specialVariants?.includes('Laser Beam')) this.window.setTexture('raketti/windowspecial.png');
    
    if (specialVariants?.includes('Bullet hell')) this.point.setTexture('raketti/pointspecial.png');

    // Update tint for thruster in case special variant changed
    this._applyTint(this._originalTint);

    // Scale ship based on hull level and giant status
    if (hullLevel !== undefined) {
      const giantMultiplier = isGiant ? 1.3 : 1.0;
      const safeEngine = engineLevel || 0;
      const safeWings = wingsLevel || 0;
      const newScale = this._scale * giantMultiplier * (1 + 0.15 * hullLevel + 0.05 * safeEngine + 0.03 * safeWings);
      this.body.setScale(newScale);
      this.wings.setScale(newScale);
      this.window.setScale(newScale);
      this.point.setScale(newScale);
      this.weapon.setScale(newScale);
      
      // Thruster scales more aggressively with Engine upgrade
      this.thruster.setScale(newScale * (1 + safeEngine * 0.2));

      // Update nose relative position based on new scale
      this._noseR = this.body.width * newScale * 0.48;
    }
  }

  // Removed nose sync method
}
