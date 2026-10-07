// Seeded PRNG (mulberry32). State is a single uint32 so it serialises trivially
// and every match is reproducible from (seed, action log).
export interface Rng { state: number }

export function createRng(seed: number): Rng {
  return { state: seed >>> 0 };
}

/** Returns float in [0,1) and advances state. */
export function next(rng: Rng): number {
  rng.state = (rng.state + 0x6d2b79f5) >>> 0;
  let t = rng.state;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Integer in [0, n). */
export function nextInt(rng: Rng, n: number): number {
  return Math.floor(next(rng) * n);
}

export function pick<T>(rng: Rng, arr: readonly T[]): T {
  return arr[nextInt(rng, arr.length)];
}

/** In-place Fisher–Yates. Returns the same array. */
export function shuffle<T>(rng: Rng, arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = nextInt(rng, i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Spec §35: -1 (20%) / 0 (60%) / +1 (20%). */
export function randomModifier(rng: Rng): -1 | 0 | 1 {
  const r = next(rng);
  return r < 0.2 ? -1 : r < 0.8 ? 0 : 1;
}
