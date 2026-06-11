import Phaser from "phaser";
import GameScene from "./scenes/GameScene";

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: "game",
  backgroundColor: "#05070b",
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: "100%",
    height: "100%",
  },
  physics: {
    default: "matter",
    matter: { gravity: { x: 0, y: 0 }, debug: false },
  },
  pixelArt: false,
  antialias: true,
  antialiasGL: true,
  scene: [GameScene],
};

const game = new Phaser.Game(config);
(window as any).phaserGame = game;
export default game;
