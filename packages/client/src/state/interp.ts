import type { EntityState } from "@shared/messages";
import { SNAPSHOT_HZ } from "@shared/constants.js";

export class Interp {
  previous = new Map<string, EntityState>();
  current = new Map<string, EntityState>();
  alpha = 0;

  push(entities: EntityState[]) {
    this.previous = this.current;
    this.current = new Map(entities.map((e) => [e.id, e]));
    this.alpha = 0;
  }

  step(dt: number, snapshotIntervalMs: number) {
    this.alpha = Math.min(1, this.alpha + (dt * 1000) / snapshotIntervalMs);
  }

  get(id: string): EntityState | undefined {
    let prev = this.previous.get(id);
    const curr = this.current.get(id);

    // If a fast-moving entity (like a bullet) just spawned, reconstruct its previous position 
    // based on velocity so it doesn't freeze in place while waiting for the next snapshot.
    if (!prev && curr && curr.vx !== undefined && curr.vy !== undefined && (curr.vx !== 0 || curr.vy !== 0)) {
      const intervalSec = 1 / SNAPSHOT_HZ;
      prev = {
        ...curr,
        x: curr.x - curr.vx * intervalSec,
        y: curr.y - curr.vy * intervalSec,
      };
    }

    if (!prev || !curr) return curr ?? prev;
    
    // Snap to current if distance is very large (e.g., teleporting)
    const dx = curr.x - prev.x;
    const dy = curr.y - prev.y;
    if (dx * dx + dy * dy > 400 * 400) {
      return curr;
    }

    const a = this.alpha;
    const res: any = {
      ...curr,
      x: prev.x + dx * a,
      y: prev.y + dy * a,
    };
    if ((prev as any).aim !== undefined && (curr as any).aim !== undefined) {
      let diff = (curr as any).aim - (prev as any).aim;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      res.aim = (prev as any).aim + diff * a;
    }
    return res;
  }

  ids(): string[] {
    return Array.from(this.current.keys());
  }
}
