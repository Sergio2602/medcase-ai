// scripts/lib/labs.ts
//
// Pipeline v2, Stufe 3 (Labor-Teil): Laborwerte per Skript, KEIN Modell beteiligt.
// Nimmt die von Stufe 1 (factsheet.ts) gelieferten `typicalLabFindings` (WELCHER
// Parameter, WELCHE Richtung — nie eine Zahl) und würfelt anhand von
// data/reference-ranges.json (öffentliche Fakten, keine geschützte Quelle) eine konkrete,
// klinisch plausible Zahl. Deterministisch über `seed` (siehe provenance.ts:
// generator.seeds.labs) — gleicher Seed liefert immer dieselben Werte.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mulberry32, randomFloat } from "./rng.js";
import type { TypicalLabFinding, LabMagnitude } from "./factsheet.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Referenzbereiche laden
// ---------------------------------------------------------------------------

interface RangeEntry {
  displayName: string;
  category: string;
  unit: string;
  normalLow: number;
  normalHigh: number;
  pathHighLow?: number;
  pathHighHigh?: number;
  pathLowLow?: number;
  pathLowHigh?: number;
  decimals: number;
  gender?: "male" | "female";
}

interface RangeFile {
  parameters: Record<string, RangeEntry>;
}

const RANGE_FILE_PATH = join(__dirname, "..", "..", "data", "reference-ranges.json");
const RANGES: RangeFile = JSON.parse(readFileSync(RANGE_FILE_PATH, "utf8"));

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "");
}

const INDEX = new Map<string, Array<{ key: string; entry: RangeEntry }>>();
for (const [key, entry] of Object.entries(RANGES.parameters)) {
  for (const name of [key, entry.displayName]) {
    const norm = normalize(name);
    const list = INDEX.get(norm) ?? [];
    list.push({ key, entry });
    INDEX.set(norm, list);
  }
}

function findEntry(parameterName: string, patientGender: "male" | "female"): { key: string; entry: RangeEntry } {
  const candidates = INDEX.get(normalize(parameterName));
  if (!candidates || candidates.length === 0) {
    throw new Error(
      `labs.ts: Parameter "${parameterName}" nicht in data/reference-ranges.json gefunden. ` +
        `Bitte dort ergänzen, bevor dieser Fall weiterläuft.`
    );
  }
  const genderMatch = candidates.find((c) => c.entry.gender === patientGender);
  return genderMatch ?? candidates[0];
}

// ---------------------------------------------------------------------------
// Formatierung — deutsche Schreibweise, wie CASE_SCHEMA.md es verlangt.
// ---------------------------------------------------------------------------

function formatGerman(value: number, decimals: number): string {
  return value.toFixed(decimals).replace(".", ",");
}

function formatReference(entry: RangeEntry): string {
  return `${formatGerman(entry.normalLow, entry.decimals)}–${formatGerman(entry.normalHigh, entry.decimals)}`;
}

// ---------------------------------------------------------------------------
// Rückgabetyp — kompatibel zu CASE_SCHEMA.md ("labs"-Feld)
// ---------------------------------------------------------------------------

export interface LabValue {
  name: string;
  value: string;
  unit: string;
  reference: string;
  flag: "high" | "low" | "normal";
}

export interface LabCategory {
  category: string;
  values: LabValue[];
}

// ---------------------------------------------------------------------------
// Größenordnung -> Teilbereich
//
// Der pathologische Bereich in reference-ranges.json ist absichtlich breit (Leukozyten
// 11–25/nl). Würfelt man daraus frei, erzählt derselbe "Leukozyten hoch"-Befund einmal
// eine leichte Reizung und einmal eine Sepsis — und Stufe 3.5 (verify.ts) kann nicht
// prüfen, ob die Konstellation die Zieldiagnose trägt. Deshalb teilt `magnitude` den
// Bereich in Drittel. Bei "low" ist die Reihenfolge gespiegelt: dort liegt der
// Extrembereich am unteren Ende.
// ---------------------------------------------------------------------------

// Lineare Drittelung stimmt nur bei Parametern mit schmaler Spanne. Bei CRP (10–250 mg/l)
// wäre das untere Drittel 10–90 — klinisch ist 90 mg/l alles andere als "leicht". Solche
// Parameter (CRP, NT-proBNP, D-Dimere, Ferritin) werden klinisch logarithmisch gelesen.
// Deshalb: ab einem Verhältnis von 10:1 geometrisch dritteln, sonst linear.
// CRP wird damit zu 10–29 / 29–86 / 86–250 — das entspricht der klinischen Lesart.
const LOG_SCALE_RATIO = 10;

function thirds(low: number, high: number, position: 0 | 1 | 2): [number, number] {
  if (low > 0 && high / low >= LOG_SCALE_RATIO) {
    const factor = (high / low) ** (1 / 3);
    return [low * factor ** position, low * factor ** (position + 1)];
  }
  const span = (high - low) / 3;
  return [low + span * position, low + span * (position + 1)];
}

const POSITION: Record<LabMagnitude, 0 | 1 | 2> = { leicht: 0, deutlich: 1, massiv: 2 };

function bandFor(finding: TypicalLabFinding, entry: RangeEntry): [number, number] {
  if (finding.direction === "normal") {
    return [entry.normalLow, entry.normalHigh];
  }

  // Fehlt die Größenordnung (alte Faktenblätter vor dem 2026-09-13), nehmen wir den
  // klinischen Regelfall statt abzubrechen — factsheet.ts erzwingt sie bereits beim Erzeugen.
  const magnitude: LabMagnitude = finding.magnitude ?? "deutlich";

  if (finding.direction === "high") {
    if (entry.pathHighLow === undefined || entry.pathHighHigh === undefined) {
      throw new Error(
        `labs.ts: Für "${finding.parameter}" gibt es keinen pathologisch-hohen Bereich in reference-ranges.json.`
      );
    }
    return thirds(entry.pathHighLow, entry.pathHighHigh, POSITION[magnitude]);
  }

  if (entry.pathLowLow === undefined || entry.pathLowHigh === undefined) {
    throw new Error(
      `labs.ts: Für "${finding.parameter}" gibt es keinen pathologisch-niedrigen Bereich in reference-ranges.json.`
    );
  }
  // gespiegelt: "massiv" ist hier das untere Drittel
  const mirrored: 0 | 1 | 2 = magnitude === "leicht" ? 2 : magnitude === "deutlich" ? 1 : 0;
  return thirds(entry.pathLowLow, entry.pathLowHigh, mirrored);
}

// ---------------------------------------------------------------------------
// Hauptfunktion
// ---------------------------------------------------------------------------

export function generateLabs(
  findings: TypicalLabFinding[],
  patientGender: "male" | "female",
  seed: number
): LabCategory[] {
  const rng = mulberry32(seed);
  const byCategory = new Map<string, LabValue[]>();

  for (const finding of findings) {
    const { entry } = findEntry(finding.parameter, patientGender);
    const [bandLow, bandHigh] = bandFor(finding, entry);
    const numeric = randomFloat(rng, bandLow, bandHigh, entry.decimals);

    const labValue: LabValue = {
      name: entry.displayName,
      value: formatGerman(numeric, entry.decimals),
      unit: entry.unit,
      reference: formatReference(entry),
      flag: finding.direction,
    };

    const list = byCategory.get(entry.category) ?? [];
    list.push(labValue);
    byCategory.set(entry.category, list);
  }

  return Array.from(byCategory.entries()).map(([category, values]) => ({ category, values }));
}

// ---------------------------------------------------------------------------
// CLI — manueller Testlauf, keine API nötig (reines Skript)
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const example: TypicalLabFinding[] = [
    { parameter: "Anti-tTG-IgA", direction: "high", magnitude: "massiv" },
    { parameter: "CRP", direction: "high", magnitude: "leicht" },
    { parameter: "Hämoglobin", direction: "low", magnitude: "deutlich" },
    { parameter: "Leukozyten", direction: "normal" },
  ];
  const result = generateLabs(example, "female", 42);
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
