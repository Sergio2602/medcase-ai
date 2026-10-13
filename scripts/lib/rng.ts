// scripts/lib/rng.ts
//
// Deterministischer Pseudo-Zufallsgenerator (mulberry32). Macht patient.ts/labs.ts
// reproduzierbar über einen gespeicherten Zahlen-Seed (siehe provenance.ts:
// generator.seeds.patient / .labs) — kein kryptografischer RNG, hier bewusst nicht nötig.

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function random(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Ganzzahl, min und max jeweils inklusive.
export function randomInt(rng: () => number, min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

// Fließkommazahl in [min, max), auf `decimals` Nachkommastellen gerundet.
export function randomFloat(rng: () => number, min: number, max: number, decimals: number): number {
  const value = rng() * (max - min) + min;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function pick<T>(rng: () => number, items: readonly T[]): T {
  if (items.length === 0) throw new Error("rng.ts: pick() auf leerem Array aufgerufen.");
  return items[Math.floor(rng() * items.length)];
}
