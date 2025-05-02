// utils/shuffle.ts
// Deterministic (seeded) Fisher-Yates shuffle for arrays

/**
 * Mulberry32 PRNG (simple, fast, good enough for shuffle)
 * @param seed number
 */
export function mulberry32(seed: number) {
  return function() {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
}

/**
 * Deterministic shuffle using a seeded PRNG
 * @param array Array<T>
 * @param seed number
 * @returns new shuffled array
 */
export function seededShuffle<T>(array: T[], seed: number): T[] {
  const prng = mulberry32(seed);
  const arr = array.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(prng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Simple hash to number for seeding (djb2)
 */
export function hashStringToSeed(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
  }
  return hash >>> 0;
}
