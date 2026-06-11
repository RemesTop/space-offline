import type { ClientInput, ServerSnapshot, ServerEvent, ServerWelcome } from "@shared/messages";
import { WORLD } from "@shared/constants.js";
import { config } from "../config.js";
import { createWorld, resetWorld, type LocalEmitter } from "../sim/world.js";
import { startLoop } from "../sim/loop.js";
import { addPlayer, queueInput, setPlayerName, applyLevelChoice, giveXP } from "../sim/entities.js";
import { clearBots } from "../sim/systems/bots.js";
import { nanoid } from "nanoid";
import { randSafeSpawn } from "../sim/world.js";

export class Net implements LocalEmitter {
  youId: string | null = null;
  lastAckSeq = 0;
  world = createWorld();
  private loopStarted = false;
  
  private snapshotCb?: (s: ServerSnapshot) => void;
  private eventCb?: (e: ServerEvent) => void;

  emitEvent(socketId: string, event: any): void {
    if (this.youId && socketId === this.youId && this.eventCb) {
      this.eventCb(event);
    }
  }

  emitSnapshot(socketId: string, snapshot: any): void {
    if (this.youId && socketId === this.youId && this.snapshotCb) {
      this.lastAckSeq = snapshot.acks.seq;
      this.snapshotCb(snapshot);
    }
  }

  connect(url: string) {
    if (!this.loopStarted) {
      // Start local simulation instead of connecting to remote server
      startLoop(this, this.world);
      console.log("[net] local simulation started");
      this.loopStarted = true;
    } else {
      console.log("[net] reconnected to existing local simulation");
    }
    
    return Promise.resolve({
      youId: "dummy-id-will-be-replaced-on-join",
      tickRate: config.tickHz,
      snapshotRate: config.snapshotHz,
      world: { w: WORLD.w, h: WORLD.h },
    } as ServerWelcome);
  }

  join(name: string) {
    if (this.world.awaitingFirstHuman) {
      // First join ever — reset world and start fresh
      resetWorld(this.world);
      clearBots();
      this.world.awaitingFirstHuman = false;
    }
    // Remove previous player entity if it still exists (respawn)
    if (this.youId && this.world.players.has(this.youId)) {
      this.world.players.delete(this.youId);
    }
    const playerId = nanoid();
    this.youId = playerId;
    const spawnPos = randSafeSpawn(this.world);
    addPlayer(this.world, playerId, spawnPos, playerId); // socketId = playerId for local
    setPlayerName(this.world, playerId, name || "Anon");
  }

  onSnapshot(cb: (s: ServerSnapshot) => void) {
    this.snapshotCb = cb;
  }

  onEvent(cb: (e: ServerEvent) => void) {
    this.eventCb = cb;
  }

  // Mock socket for client compatibility
  socket = {
    emit: (event: string, data: any) => {
      if (event === "debug" && data.type === "addXP" && data.amount && this.youId) {
        const player = this.world.players.get(this.youId);
        if (player) {
          giveXP(this.world, player, data.amount);
        }
      }
    },
    disconnect: () => {
      // Don't pause sim — bots should keep living while player is on game-over screen
    }
  };

  sendInput(input: ClientInput) {
    if (!this.youId) return;
    queueInput(this.world, this.youId, input);
  }

  choosePowerup(payload: { family: any; tier?: number; alt?: any }) {
    if (!this.youId) return;
    applyLevelChoice(this.world, this.youId, payload);
  }
}
