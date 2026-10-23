// Seeded randomness. The world's randomness is drawn once, up front, into a per-week noise table
// (see sim.mjs), so every strategy faces the same demand, payment delays and breakdowns for a given seed.
// Nothing in the engine calls Math.random().
export function stream(seed) {
  let a = (seed >>> 0) || 1;
  const next = () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  next.normal = () => {
    const u1 = Math.max(next(), 1e-12), u2 = next();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  };
  next.pick = arr => arr[Math.floor(next() * arr.length)];
  return next;
}

/** A stable 32-bit hash of several parts, for independent sub-streams (seed, week, department...). */
export function mix(...parts) {
  let h = 2166136261 >>> 0;
  for (const p of parts) {
    const s = String(p);
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    h ^= 0x9e3779b9; h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}
