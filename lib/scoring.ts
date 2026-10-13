// Spielwiese 09.10.2026 — Relevanz-basierte Punktevergabe (Paket A).
// Läuft ausschließlich serverseitig in /api/case/verify: `relevance` verlässt
// den Server erst NACH der Diagnose-Abgabe (Sichtbarkeits-Tabelle,
// CASE_SCHEMA_V3.md). Altfälle ohne `relevance` laufen weiter über das
// pauschale Modell (−10 je Befund).

import type { FindingKey } from "./case-bank";

export type Relevance = "tragend" | "stuetzend" | "abgrenzend" | "meist_irrelevant";

export type BilanzRow = {
  key: FindingKey;
  label: string;
  relevance: Relevance | null;
  requested: boolean;
  delta: number; // 0 oder negativ
};

export type ScoreResult = {
  score: number;
  model: "relevanz" | "pauschal";
  bilanz?: BilanzRow[];
  jokerUsed: boolean;
  jokerDelta: number;
};

// Balance-Annahmen, nicht validiert — bewusst an einer Stelle gebündelt.
export const SCORING = {
  base: 100,
  missedTragend: 25, // diagnosetragender Befund nicht angefordert
  irrelevant: 10, // nicht zielführender Befund angefordert
  joker: 30, // Oberarzt-Tipp
  floorCorrect: 10, // richtige Diagnose bringt nie 0
  legacyCost: 10,
  legacyFloor: 20,
} as const;

const RANK: Record<Relevance, number> = {
  tragend: 3,
  abgrenzend: 2,
  stuetzend: 1,
  meist_irrelevant: 0,
};

const LABELS: Record<Exclude<FindingKey, "oberarzt">, string> = {
  examination: "Untersuchung",
  auskultation: "Auskultation",
  labs: "Labor",
  ekg: "EKG",
  eeg: "EEG",
  imaging: "Bildgebung",
  konsil: "Konsil",
};

type RawCase = Record<string, unknown>;
type WithRelevance = { relevance?: Relevance };

function isRelevance(v: unknown): v is Relevance {
  return v === "tragend" || v === "stuetzend" || v === "abgrenzend" || v === "meist_irrelevant";
}

// Höchste Relevanz einer Gruppe (Untersuchungs-Unterbefunde, Laborpanels):
// ist ein Teil diagnosetragend, ist es die Kategorie.
function maxRelevance(items: WithRelevance[]): Relevance | null {
  let best: Relevance | null = null;
  for (const it of items) {
    if (!isRelevance(it.relevance)) continue;
    if (best === null || RANK[it.relevance] > RANK[best]) best = it.relevance;
  }
  return best;
}

function hasDeText(v: unknown): boolean {
  const de = (v as { de?: unknown } | undefined)?.de;
  return typeof de === "string" && de.trim().length > 0;
}

// Verfügbare Kategorien eines v3-Falls mit ihrer Relevanz.
function categoriesV3(raw: RawCase): { key: Exclude<FindingKey, "oberarzt">; relevance: Relevance | null }[] {
  const out: { key: Exclude<FindingKey, "oberarzt">; relevance: Relevance | null }[] = [];

  const u = raw.untersuchung as { findings?: WithRelevance[] } | undefined;
  if (Array.isArray(u?.findings) && u!.findings!.length > 0) {
    out.push({ key: "examination", relevance: maxRelevance(u!.findings!) });
  }

  const block = (field: string, key: Exclude<FindingKey, "oberarzt">) => {
    const b = raw[field] as { text?: unknown; relevance?: unknown } | undefined;
    if (b && hasDeText(b.text)) out.push({ key, relevance: isRelevance(b.relevance) ? b.relevance : null });
  };
  block("auskultation", "auskultation");

  if (Array.isArray(raw.labs) && raw.labs.length > 0) {
    out.push({ key: "labs", relevance: maxRelevance(raw.labs as WithRelevance[]) });
  }

  block("ekg", "ekg");
  block("eeg", "eeg");
  block("imaging", "imaging");
  block("konsil", "konsil");
  return out;
}

export function scoreCase(raw: RawCase, requested: FindingKey[], correct: boolean, isV3: boolean): ScoreResult {
  const jokerUsed = requested.includes("oberarzt");

  if (!isV3) {
    const n = requested.filter((k) => k === "examination" || k === "imaging" || k === "labs").length;
    const score = correct ? Math.max(SCORING.base - n * SCORING.legacyCost, SCORING.legacyFloor) : 0;
    return { score, model: "pauschal", jokerUsed: false, jokerDelta: 0 };
  }

  const bilanz: BilanzRow[] = categoriesV3(raw).map(({ key, relevance }) => {
    const isRequested = requested.includes(key);
    let delta = 0;
    if (relevance === "tragend" && !isRequested) delta = -SCORING.missedTragend;
    if (relevance === "meist_irrelevant" && isRequested) delta = -SCORING.irrelevant;
    return { key, label: LABELS[key], relevance, requested: isRequested, delta };
  });

  const jokerDelta = jokerUsed ? -SCORING.joker : 0;
  const raw100 = SCORING.base + bilanz.reduce((s, r) => s + r.delta, 0) + jokerDelta;
  const score = correct ? Math.max(raw100, SCORING.floorCorrect) : 0;
  return { score, model: "relevanz", bilanz, jokerUsed, jokerDelta };
}

const FINDING_KEYS: FindingKey[] = ["examination", "auskultation", "labs", "ekg", "eeg", "imaging", "konsil", "oberarzt"];

export function parseRequested(v: unknown): FindingKey[] {
  if (!Array.isArray(v)) return [];
  return FINDING_KEYS.filter((k) => v.includes(k));
}
