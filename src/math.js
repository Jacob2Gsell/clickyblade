export const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

export const length = (x, y) => Math.hypot(x, y);

export function normalize(x, y) {
  const len = Math.hypot(x, y);
  return len > 0 ? { x: x / len, y: y / len } : { x: 0, y: 0 };
}

// Smallest signed difference between two angles, in [-PI, PI].
export function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}
