import Phaser from "phaser";
import GameScene from "./scenes/GameScene";

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: "game",
  backgroundColor: "#05070b",
  scale: {
    mode: Phaser.Scale.RESIZE,
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

// Force resize on mobile orientation changes to prevent stuck aspect ratios
const handleResize = () => {
  const doResize = () => {
    if (game.scale) {
      game.scale.resize(window.innerWidth, window.innerHeight);
    }
  };
  // Browsers often report incorrect dimensions immediately after orientation change
  doResize();
  setTimeout(doResize, 100);
  setTimeout(doResize, 300);
  setTimeout(doResize, 600);
  setTimeout(doResize, 1000);
};
window.addEventListener('resize', handleResize);
window.addEventListener('orientationchange', handleResize);

export default game;
