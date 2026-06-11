import type { ClientInput, EntityState } from "@shared/messages";

export class Recon {
  seq = 0;
  unacked: ClientInput[] = [];
  you!: EntityState;

  record(input: ClientInput) {
    this.unacked.push(input);
    this.seq = input.seq;
  }

  setYouState(state: EntityState) {
    this.you = { ...state };
  }

  reconcile(serverYou: EntityState) {
    // Jam-stable: snap to authoritative server state.
    this.you = { ...serverYou };
    // Keep only inputs the server hasn't acked (for potential future use)
    this.unacked = this.unacked.filter((i) => i.seq > (window as any).net.lastAckSeq);
  }
}
