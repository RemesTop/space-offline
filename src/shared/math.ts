import type { V2 } from "./types.js";

export const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

export const len2 = (v: V2) => v.x * v.x + v.y * v.y;
export const len = (v: V2) => Math.sqrt(len2(v));
export const norm = (v: V2): V2 => {
  const l = len(v) || 1;
  return { x: v.x / l, y: v.y / l };
};
export const add = (a: V2, b: V2): V2 => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: V2, b: V2): V2 => ({ x: a.x - b.x, y: a.y - b.y });
export const mul = (a: V2, s: number): V2 => ({ x: a.x * s, y: a.y * s });
export const dist2 = (a: V2, b: V2) => len2(sub(a, b));
export const angleTo = (from: V2, to: V2) => Math.atan2(to.y - from.y, to.x - from.x);

export const rndRange = (min: number, max: number) => min + Math.random() * (max - min);
export const rndInt = (min: number, max: number) => Math.floor(rndRange(min, max + 1));

export const wrapWithin = (v: number, min: number, max: number) => {
  if (v < min) return min;
  if (v > max) return max;
  return v;
};
