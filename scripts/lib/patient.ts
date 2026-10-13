// scripts/lib/patient.ts
//
// Pipeline v2, Stufe 3 (Patient-Teil): Demografie-Randomizer, KEIN Modell beteiligt.
// Nimmt die von Stufe 1 (factsheet.ts) gelieferte `epidemiology`-Vorgabe (Altersbereich,
// Geschlechtstendenz — nie ein exaktes Alter) und würfelt Alter, Geschlecht und einen zum
// Alter passenden deutschen Vornamen. Deterministisch über `seed` (siehe provenance.ts:
// generator.seeds.patient).

import { fileURLToPath } from "node:url";
import { mulberry32, randomInt, pick } from "./rng.js";
import type { EpidemiologyHint } from "./factsheet.js";

// ---------------------------------------------------------------------------
// Namenspools — Startset, nach Geburtsjahrzehnt grob passend zum Alter gestaffelt.
// Erweiterbar; nicht als vollständige Namensstatistik gedacht.
// ---------------------------------------------------------------------------

const MALE_NAMES_YOUNG = ["Lukas", "Finn", "Elias", "Noah", "Luis", "Ben", "Paul", "Jonas"];
const MALE_NAMES_MID = ["Michael", "Christian", "Sebastian", "Stefan", "Thomas", "Andreas", "Daniel", "Markus"];
const MALE_NAMES_OLD = ["Bernd", "Klaus", "Peter", "Hans", "Wolfgang", "Günther", "Manfred", "Helmut"];

const FEMALE_NAMES_YOUNG = ["Mia", "Emma", "Lena", "Hannah", "Sophie", "Lea", "Marie", "Emilia"];
const FEMALE_NAMES_MID = ["Sandra", "Nicole", "Melanie", "Julia", "Katrin", "Stefanie", "Anja", "Sabine"];
const FEMALE_NAMES_OLD = ["Ingrid", "Ursula", "Gisela", "Renate", "Helga", "Erika", "Brigitte", "Christa"];

function ageBracket(age: number): "young" | "mid" | "old" {
  if (age < 30) return "young";
  if (age < 60) return "mid";
  return "old";
}

function namePool(gender: "male" | "female", bracket: "young" | "mid" | "old"): string[] {
  if (gender === "male") {
    return bracket === "young" ? MALE_NAMES_YOUNG : bracket === "mid" ? MALE_NAMES_MID : MALE_NAMES_OLD;
  }
  return bracket === "young" ? FEMALE_NAMES_YOUNG : bracket === "mid" ? FEMALE_NAMES_MID : FEMALE_NAMES_OLD;
}

// ---------------------------------------------------------------------------
// Rückgabetyp
// ---------------------------------------------------------------------------

export interface PatientDemographics {
  patientName: string;
  age: number;
  gender: "male" | "female";
}

// ---------------------------------------------------------------------------
// Hauptfunktion
// ---------------------------------------------------------------------------

// Gegencheck 2026-09-15, BLOCKING 5: data/reference-ranges.json enthaelt ausschliesslich
// Erwachsenen-Referenzbereiche und namePool() nur Erwachsenennamen. Ohne diese Untergrenze
// erzeugte eine epidemiology-Vorgabe wie typicalAgeRangeMin:0 (z.B. Mukoviszidose,
// Pylorusstenose) einen Kinder-Fall mit fachlich falschen Laborreferenzen. Diese Grenze faellt,
// sobald ein eigener paediatrischer Referenzbereichs-Satz existiert -- nicht vorher.
export const MIN_ADULT_AGE = 18;

export function generatePatient(hint: EpidemiologyHint, seed: number): PatientDemographics {
  const rng = mulberry32(seed);

  const min = Math.max(0, Math.min(hint.typicalAgeRangeMin, hint.typicalAgeRangeMax));
  const max = Math.max(hint.typicalAgeRangeMin, hint.typicalAgeRangeMax);
  if (min > 100 || max < 0) {
    throw new Error(`patient.ts: unplausibler Altersbereich [${min}, ${max}] in epidemiology-Vorgabe.`);
  }
  if (min < MIN_ADULT_AGE) {
    throw new Error(
      `patient.ts: epidemiology.typicalAgeRangeMin (${hint.typicalAgeRangeMin}) liegt unter ` +
        `${MIN_ADULT_AGE} -- diese Pipeline hat noch keine paediatrischen Referenzbereiche ` +
        `(data/reference-ranges.json ist Erwachsenen-only). Diagnose fuer eine spaetere, ` +
        `eigene paediatrische Erweiterung zurueckstellen statt mit Erwachsenenwerten zu bauen.`
    );
  }
  const age = randomInt(rng, min, max);

  let gender: "male" | "female";
  if (hint.genderExclusive) {
    if (hint.genderSkew === "balanced") {
      throw new Error(
        `patient.ts: epidemiology.genderExclusive=true zusammen mit genderSkew='balanced' ist ` +
          `widerspruechlich -- genderSkew muss 'male' oder 'female' sein.`
      );
    }
    // Anatomische Exklusivitaet: keine 80/20-Ziehung, das andere Geschlecht ist ausgeschlossen.
    gender = hint.genderSkew;
  } else if (hint.genderSkew === "balanced") {
    gender = pick(rng, ["male", "female"] as const);
  } else {
    // 80/20-Tendenz statt starrem 100/0 — realistisch, kaum eine Diagnose ist absolut
    // geschlechtsexklusiv (siehe genderExclusive fuer die Faelle, bei denen sie es doch ist).
    const stays = rng() < 0.8;
    gender = stays ? hint.genderSkew : hint.genderSkew === "male" ? "female" : "male";
  }

  const patientName = pick(rng, namePool(gender, ageBracket(age)));

  return { patientName, age, gender };
}

// ---------------------------------------------------------------------------
// CLI — manueller Testlauf, keine API nötig (reines Skript)
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const example: EpidemiologyHint = { typicalAgeRangeMin: 20, typicalAgeRangeMax: 40, genderSkew: "female" };
  for (let seed = 1; seed <= 5; seed++) {
    console.log(seed, generatePatient(example, seed));
  }
  const exclusiveExample: EpidemiologyHint = {
    typicalAgeRangeMin: 25,
    typicalAgeRangeMax: 40,
    genderSkew: "female",
    genderExclusive: true,
  };
  console.log("genderExclusive-Beispiel (immer weiblich):");
  for (let seed = 1; seed <= 5; seed++) {
    console.log(seed, generatePatient(exclusiveExample, seed));
  }
}

// ---------------------------------------------------------------------------
// Selbsttest -- deckt die beiden Regeln ab, die am 2026-09-15 nachgezogen wurden.
// ---------------------------------------------------------------------------

function selftest(): void {
  const failures: string[] = [];
  const check = (name: string, condition: boolean, detail = ""): void => {
    console.log(`${condition ? "ok  " : "FAIL"} ${name}${condition ? "" : ` — ${detail}`}`);
    if (!condition) failures.push(name);
  };
  const throws = (name: string, fn: () => unknown): void => {
    try {
      fn();
      console.log(`FAIL ${name} — hat NICHT geworfen`);
      failures.push(name);
    } catch {
      console.log(`ok   ${name}`);
    }
  };

  throws("Altersuntergrenze: typicalAgeRangeMin < 18 wirft", () =>
    generatePatient({ typicalAgeRangeMin: 0, typicalAgeRangeMax: 10, genderSkew: "balanced" }, 1)
  );
  check(
    "Altersuntergrenze: 18 als Minimum ist erlaubt",
    generatePatient({ typicalAgeRangeMin: 18, typicalAgeRangeMax: 25, genderSkew: "balanced" }, 1).age >= 18
  );

  throws("genderExclusive + balanced ist widerspruechlich -> wirft", () =>
    generatePatient({ typicalAgeRangeMin: 25, typicalAgeRangeMax: 40, genderSkew: "balanced", genderExclusive: true }, 1)
  );

  const exclusiveHint: EpidemiologyHint = {
    typicalAgeRangeMin: 25,
    typicalAgeRangeMax: 40,
    genderSkew: "female",
    genderExclusive: true,
  };
  const exclusiveGenders = new Set(
    Array.from({ length: 50 }, (_, i) => generatePatient(exclusiveHint, i + 1).gender)
  );
  check(
    "genderExclusive: über 50 Seeds ausschließlich das vorgegebene Geschlecht",
    exclusiveGenders.size === 1 && exclusiveGenders.has("female")
  );

  const skewedHint: EpidemiologyHint = { typicalAgeRangeMin: 25, typicalAgeRangeMax: 40, genderSkew: "female" };
  const skewedGenders = Array.from({ length: 100 }, (_, i) => generatePatient(skewedHint, i + 1).gender);
  const maleCount = skewedGenders.filter((g) => g === "male").length;
  check(
    "ohne genderExclusive: 80/20-Tendenz erzeugt auch das andere Geschlecht",
    maleCount > 0 && maleCount < skewedGenders.length
  );

  console.log(`\n${failures.length === 0 ? "Alle Selbsttests bestanden." : `${failures.length} Selbsttest(s) fehlgeschlagen.`}`);
  if (failures.length > 0) process.exit(1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes("--selftest")) selftest();
  else {
    main().catch((error) => {
      console.error(error);
      process.exit(1);
    });
  }
}
