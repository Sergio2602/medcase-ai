/**
 * generate-cases.ts — Bulk-generate the static clinical case library for MedCase.AI.
 *
 * Produces 150 cases (50 per level) with the SAME `present_case` tool schema used by
 * app/api/generate-case/route.ts, but for a FIXED list of diagnoses instead of a random one.
 * Cases are generated in concurrent batches of 5 (to avoid timeouts / rate spikes) and the
 * per-level JSON files are written incrementally so progress survives an interruption.
 *
 * Run with:
 *   npx tsx scripts/generate-cases.ts
 *
 * Requires ANTHROPIC_API_KEY (read from the environment or from .env.local).
 * Optional ANTHROPIC_MODEL (defaults to claude-sonnet-4-6, matching the API route).
 */

import Anthropic, { APIError } from "@anthropic-ai/sdk";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..");

// Minimal .env.local loader so the script runs without adding a dotenv dependency.
function loadEnvLocal(): void {
  const envPath = join(PROJECT_ROOT, ".env.local");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvLocal();

const API_KEY = process.env.ANTHROPIC_API_KEY;
if (!API_KEY) {
  console.error(
    "ANTHROPIC_API_KEY is not set. Add it to your environment or to .env.local."
  );
  process.exit(1);
}

// claude-sonnet-4-6 is the current Sonnet 4 successor used by the API route.
const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";

// ---------------------------------------------------------------------------
// Tool schema — kept in sync with app/api/generate-case/route.ts (present_case)
// ---------------------------------------------------------------------------

const CASE_TOOL: Anthropic.Tool = {
  name: "present_case",
  description:
    "Return a single structured clinical case for the diagnosis game.",
  input_schema: {
    type: "object",
    properties: {
      patientName: {
        type: "string",
        description:
          "A realistic German first name for the patient (e.g. Anna, Lukas, Ingrid, Mehmet).",
      },
      age: { type: "integer", description: "Patient age in years." },
      gender: {
        type: "string",
        enum: ["male", "female"],
        description: "Patient gender.",
      },
      chiefComplaint: {
        type: "string",
        description:
          "Vorstellungsgrund in der ALLTAGSSPRACHE des Patienten (Ich-Form, 1-2 Sätze), so wie ihn ein echter deutscher Patient der Ärztin/dem Arzt schildern würde – KEINE Fachsprache, ruhig umgangssprachlich (z. B. 'Mir ist seit heute Morgen ständig schlecht und mein Herz rast.'). Authentisches gesprochenes Deutsch, keine Übersetzung aus dem Englischen.",
      },
      history: {
        type: "string",
        description:
          "Anamnese (jetzige Anamnese, relevante Vor-, Sozial- und Familienanamnese, Medikation, Noxen) im Dokumentationsstil einer deutschen Uniklinik. Verwende übliche Abkürzungen wie 'Z. n.' (Zustand nach), 'V. a.', 'a. e.', 'bei Aufnahme'. Nüchterner, präziser klinischer Stil, 3-5 Sätze.",
      },
      examination: {
        type: "string",
        description:
          "Körperlicher Untersuchungsbefund im Uniklinik-Stil mit Vitalparametern in deutscher Notation (z. B. 'RR 90/60 mmHg, HF 110/min, AF 22/min, Temp. 38,7 °C, SpO2 94 % unter Raumluft') sowie relevanten positiven und negativen Befunden nach Organsystemen. Authentische deutsche Befundsprache (z. B. 'Abdomen weich, Druckschmerz im rechten Unterbauch, lebhafte Darmgeräusche').",
      },
      labs: {
        type: "array",
        description:
          "Strukturierte Laborwerte, die zur Diagnose passen und für den Fall relevant sind. Nach klinischen Kategorien gruppiert (z. B. Hämatologie, Klinische Chemie, Herzmarker, Gerinnung, Entzündung, Blutgasanalyse, Urin). Nur diagnostisch relevante Parameter aufnehmen (typischerweise 2-5 Kategorien mit je 2-6 Werten), keine erschöpfende Routineliste. Pathologische, zur Diagnose passende Werte gezielt einbauen und über das Feld 'flag' kennzeichnen.",
        items: {
          type: "object",
          properties: {
            category: {
              type: "string",
              description:
                "Name der Laborkategorie auf Deutsch (z. B. 'Hämatologie', 'Klinische Chemie', 'Herzmarker', 'Gerinnung', 'Blutgasanalyse', 'Urin').",
            },
            values: {
              type: "array",
              description: "Die einzelnen Laborparameter dieser Kategorie.",
              items: {
                type: "object",
                properties: {
                  name: {
                    type: "string",
                    description:
                      "Deutscher Parametername (z. B. 'Leukozyten', 'CRP', 'Kreatinin', 'Troponin T (hs)').",
                  },
                  value: {
                    type: "string",
                    description:
                      "Der Messwert als Zahl mit Dezimalkomma in deutscher Schreibweise (z. B. '14,2', '8,9', '0,9'). Ohne Einheit.",
                  },
                  unit: {
                    type: "string",
                    description:
                      "In Deutschland übliche Einheit (z. B. '/nl', 'mg/l', 'mg/dl', 'ng/l', 'mmol/l', 'g/dl').",
                  },
                  reference: {
                    type: "string",
                    description:
                      "Referenzbereich in deutscher Schreibweise (z. B. '4,0–10,0', '< 5', '0,7–1,2'). Ohne Einheit.",
                  },
                  flag: {
                    type: "string",
                    enum: ["high", "low", "normal"],
                    description:
                      "'high' wenn der Wert über dem Referenzbereich liegt, 'low' wenn darunter, sonst 'normal'.",
                  },
                },
                required: ["name", "value", "unit", "reference", "flag"],
              },
            },
          },
          required: ["category", "values"],
        },
      },
      imaging: {
        type: "string",
        description:
          "Bildgebungsbefund im deutschen Befundstil (z. B. 'CT-Abdomen mit KM: Wandverdickung des Colon sigmoideum ...'). Falls für den Fall keine Bildgebung sinnvoll oder erforderlich ist, ein leerer String.",
      },
      correctDiagnosis: {
        type: "string",
        description:
          "Die eine korrekte Diagnose als deutscher Fachbegriff, wie er in der Uniklinik dokumentiert würde (lateinische Termini wo üblich, z. B. 'Appendizitis', 'Lungenarterienembolie').",
      },
      diagnosisOptions: {
        type: "array",
        description:
          "Genau 4 plausible Diagnose-Optionen als Multiple-Choice-Antworten in deutscher Fachsprache. MUSS die korrekte Diagnose wortgleich enthalten plus 3 klinisch sinnvolle Differenzialdiagnosen (echte Verwechslungskandidaten, kein Strohmann). Zufällige Reihenfolge.",
        items: { type: "string" },
        minItems: 4,
        maxItems: 4,
      },
      explanation: {
        type: "string",
        description:
          "Kurze Lernerklärung (2-3 Sätze) auf Deutsch, warum die Diagnose passt und welche Befunde wegweisend sind – im Ton einer prägnanten Erläuterung für die Vorbereitung auf Physikum und Staatsexamen.",
      },
    },
    required: [
      "patientName",
      "age",
      "gender",
      "chiefComplaint",
      "history",
      "examination",
      "labs",
      "imaging",
      "correctDiagnosis",
      "diagnosisOptions",
      "explanation",
    ],
  },
};

// ---------------------------------------------------------------------------
// Difficulty steering — kept in sync with app/api/generate-case/route.ts
// ---------------------------------------------------------------------------

type Difficulty = "vorklinik" | "klinik" | "examen";

const DIFFICULTY_INSTRUCTIONS: Record<Difficulty, string> = {
  vorklinik: `SCHWIERIGKEITSGRAD: Vorklinik (Semester 1-4). Verwende einfache, klare deutsche Sprache. Wähle eine häufige Erkrankung mit klassischen Leitsymptomen (z. B. Appendizitis, Harnwegsinfekt, ambulant erworbene Pneumonie, Gastroenteritis). Keine Komplikationen, keine relevanten Komorbiditäten. Die Befunde sind eindeutig und lehrbuchhaft, die richtige Diagnose gut erkennbar. Die Differenzialdiagnosen (Distraktoren) sind klar abgrenzbar.`,
  klinik: `SCHWIERIGKEITSGRAD: Klinik (Semester 5-8, Famulatur). Verwende durchgehend medizinische Fachterminologie. Der Patient präsentiert mehrere Symptome; eine echte differenzialdiagnostische Überlegung ist erforderlich. Atypische Verläufe sind möglich. Labor und körperliche Untersuchung sind für die Diagnosestellung entscheidend. Eine gewisse diagnostische Mehrdeutigkeit ist ausdrücklich erwünscht.`,
  examen: `SCHWIERIGKEITSGRAD: PJ / Staatsexamen. Nutze die volle Uniklinik-Dokumentation. Konstruiere einen komplexen Fall mit Komorbiditäten und ggf. Polypharmazie. Die Präsentation ist atypisch oder maskiert, die Diagnose darf selten sein. Die Informationen sind teils unvollständig; erzwinge echtes differenzialdiagnostisches Denken. Die Distraktoren müssen anspruchsvolle, hochplausible Differenzialdiagnosen sein, die nur durch genaue Befundinterpretation auszuschließen sind.`,
};

const GERMAN_INSTRUCTION = `Schreibe ALLE Inhalte des Falls auf Deutsch im Stil der klinischen Dokumentation einer deutschen Universitätsklinik (Uniklinik-Stil). Verwende authentische deutsche Fachterminologie und gebräuchliche Abkürzungen (RR, HF, AF, Temp., SpO2, Z. n., V. a., a. e., DD) sowie in Deutschland übliche Laboreinheiten. Formuliere genau so, wie deutsche Ärztinnen, Ärzte und Medizinstudierende im klinischen Alltag tatsächlich dokumentieren und sprechen – auf keinen Fall wörtliche Übersetzungen aus dem Englischen. Lediglich der Vorstellungsgrund (chiefComplaint) ist in der Alltagssprache des Patienten zu formulieren, nicht in Fachsprache. Niveau: Vorbereitung auf Physikum und Staatsexamen.`;

// ---------------------------------------------------------------------------
// The 150 diagnoses, grouped by output file + difficulty level.
// ---------------------------------------------------------------------------

interface CategorySpec {
  file: string;
  difficulty: Difficulty;
  diagnoses: string[];
}

const CATEGORIES: CategorySpec[] = [
  {
    file: "innere.json",
    difficulty: "klinik",
    diagnoses: [
      "Herzinsuffizienz",
      "Akuter Myokardinfarkt STEMI",
      "Akuter Myokardinfarkt NSTEMI",
      "Vorhofflimmern",
      "Hypertensive Krise",
      "Perikarditis",
      "Endokarditis",
      "Tiefe Venenthrombose",
      "Lungenembolie",
      "Aortenstenose",
      "AV-Block",
      "WPW-Syndrom",
      "Pneumonie",
      "COPD-Exazerbation",
      "Asthma bronchiale",
      "Spontanpneumothorax",
      "Lungenödem",
      "Pleuraerguss",
      "Akute Cholezystitis",
      "Akute Pankreatitis",
      "Obere GI-Blutung",
      "Leberzirrhose",
      "Appendizitis",
      "Ileus",
      "Cholangitis",
      "Morbus Crohn",
      "Akutes Nierenversagen",
      "Pyelonephritis",
      "Nephrolithiasis",
      "Hyperkaliämie",
      "Diabetische Ketoazidose",
      "Hypoglykämie",
      "Hyperthyreose",
      "Hypothyreose",
      "Addison-Krise",
      "Hyperkalzämie",
      "Eisenmangelanämie",
      "AML Erstdiagnose",
      "Neutropenisches Fieber",
      "ITP",
      "Sepsis",
      "Bakterielle Meningitis",
      "HIV Erstmanifestation",
      "Staph-Endokarditis",
      "Urosepsis",
      "Schlaganfall ischämisch",
      "Hyponatriämie",
      "Alkoholentzug",
      "Pulmonale Hypertonie",
      "Rhabdomyolyse",
    ],
  },
  {
    file: "vorklinik.json",
    difficulty: "vorklinik",
    diagnoses: [
      "Appendizitis klassisch",
      "Lobärpneumonie",
      "Unkomplizierte HWI",
      "Angina tonsillaris",
      "Otitis media",
      "Sinusitis",
      "Gastroenteritis",
      "Migräne",
      "Spannungskopfschmerz",
      "Anaphylaxie",
      "Asthma Erstmanifestation",
      "Eisenmangelanämie",
      "Hashimoto",
      "Graves",
      "Typ-2-Diabetes Erstdiagnose",
      "Hypertonie Erstdiagnose",
      "Kompensierte Herzinsuffizienz",
      "Paroxysmales Vorhofflimmern",
      "Stabile Angina pectoris",
      "Streptokokken-Tonsillitis",
      "Akute Bronchitis",
      "Pleuritis",
      "Akute Gastritis",
      "Ulcus ventriculi",
      "Cholezystolithiasis",
      "Nierenkolik",
      "Akuter Gichtanfall",
      "Kontaktekzem",
      "Urtikaria",
      "Herpes Zoster",
      "Erysipel",
      "Thrombophlebitis",
      "Varikosis",
      "Konjunktivitis",
      "Schwere Epistaxis",
      "Vasovagale Synkope",
      "Typ-1-Hypoglykämie",
      "Panikattacke",
      "Depression Erstmanifestation",
      "Akute Alkoholintoxikation",
      "Leichtes SHT",
      "Sprunggelenksdistorsion",
      "Radiusfraktur",
      "Verbrennung Grad II",
      "Hitzschlag",
      "Hyperventilationssyndrom",
      "EBV-Mononukleose",
      "Masern Erwachsener",
      "Windpocken Erwachsener",
      "Frühe Borreliose",
    ],
  },
  {
    file: "pj.json",
    difficulty: "examen",
    diagnoses: [
      "STEMI kardiogener Schock",
      "Herzinsuffizienz Vorhofflimmern Antikoagulation",
      "COPD atypische Pneumonie",
      "Sepsis DIC",
      "Akutes Abdomen Differentialdiagnose",
      "Hepatische Enzephalopathie",
      "Hyperosmolares Koma",
      "Addison Hyponatriämie",
      "Massive Lungenembolie",
      "Waterhouse-Friderichsen",
      "Endokarditis Embolie",
      "ACS Diabetes Niereninsuffizienz",
      "Aortendissektion",
      "Hypertensive Enzephalopathie",
      "Hyperkaliämie EKG",
      "Tumorlysesyndrom",
      "Schilddrüsensturm",
      "Phäochromozytom-Krise",
      "TTP",
      "HIT",
      "PCP HIV",
      "CMV-Kolitis",
      "Neutropenisches Fieber Pilz",
      "Rhabdomyolyse ANV",
      "Pankreatitis ARDS",
      "Ösophagusvarizenblutung",
      "SBP",
      "Hepatorenales Syndrom",
      "Akute Herzinsuffizienz Klappenvitium",
      "Digitalis-Intoxikation",
      "Lithium-Intoxikation",
      "Paracetamol-Intoxikation",
      "Alkohol-Kardiomyopathie",
      "Kardiale Synkope",
      "Dekompensierte pulmonale Hypertonie",
      "Contrast-Nephropathie",
      "SIADH paraneoplastisch",
      "Hypophysenvorderlappeninsuffizienz",
      "Cushing-Syndrom",
      "Conn-Syndrom",
      "MEN-1",
      "Kardiale Amyloidose",
      "ANCA-Vaskulitis",
      "Lupus-Nephritis",
      "Goodpasture-Syndrom",
      "Faktor-V-Leiden",
      "MRSA-Sepsis",
      "Schwere C.-difficile-Infektion",
      "Multimorbider Patient",
      "Palliativsituation",
    ],
  },
];

// ---------------------------------------------------------------------------
// Case generation
// ---------------------------------------------------------------------------

interface GeneratedCase {
  id: string;
  difficulty: Difficulty;
  // ...plus every field returned by the present_case tool.
  [key: string]: unknown;
}

const anthropic = new Anthropic({ apiKey: API_KEY });

const BATCH_SIZE = 5; // cases generated concurrently per batch (avoids timeouts / rate spikes)
const MAX_RETRIES = 4; // attempts per case before giving up
const MAX_TOKENS = 3072; // headroom for the more complex Examen cases

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Tool-use occasionally serializes nested array fields (labs, diagnosisOptions)
// as a JSON *string* instead of a real array. Parse those back so every saved
// case has the structured shape the app expects.
function normalizeCase(input: Record<string, unknown>): Record<string, unknown> {
  for (const key of ["labs", "diagnosisOptions"]) {
    const v = input[key];
    if (typeof v === "string") {
      try {
        const parsed = JSON.parse(v);
        if (Array.isArray(parsed)) input[key] = parsed;
      } catch {
        // Leave as-is; the validity check downstream will flag it.
      }
    }
  }
  return input;
}

// Build a unique, stable id from the diagnosis label.
function slugify(label: string): string {
  return label
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Generate one case for a FIXED target diagnosis. Retries on transient errors.
async function generateCase(
  diagnosis: string,
  difficulty: Difficulty,
  index: number
): Promise<GeneratedCase> {
  const variationSeed = Math.floor(Math.random() * 1_000_000);

  const prompt = `Generate a realistic, educational clinical case for which the SINGLE correct diagnosis is EXACTLY: "${diagnosis}".

Das Feld correctDiagnosis MUSS exakt zu dieser Diagnose passen (deutscher Fachbegriff, wie in der Uniklinik dokumentiert). Baue genau 3 klinisch hochplausible Differenzialdiagnosen als Distraktoren ein; diagnosisOptions enthält die korrekte Diagnose wortgleich plus diese 3 Distraktoren in zufälliger Reihenfolge. Variiere Alter, Geschlecht und Präsentation des Patienten realistisch zur Diagnose (Variationsseed: ${variationSeed}).

This is for a medical diagnosis game played by German medical students preparing for the Physikum and Staatsexamen. Make the case engaging and solvable from the provided information. The chief complaint should sound like a real person talking. Present findings as they would appear during a workup. Liefere die Laborwerte (labs) als strukturierte, nach Kategorien gruppierte Einzelparameter mit Wert, Einheit, Referenzbereich und flag – KEIN Fließtext. Die pathologischen Werte müssen zur korrekten Diagnose passen und wegweisend sein. ${GERMAN_INSTRUCTION} Call the present_case tool with the structured result.`;

  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const message = await anthropic.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        temperature: 1,
        system: DIFFICULTY_INSTRUCTIONS[difficulty],
        tools: [CASE_TOOL],
        tool_choice: { type: "tool", name: "present_case" },
        messages: [{ role: "user", content: prompt }],
      });

      const toolBlock = message.content.find(
        (block): block is Anthropic.ToolUseBlock =>
          block.type === "tool_use" && block.name === "present_case"
      );

      if (!toolBlock) {
        throw new Error("No present_case tool_use block in response.");
      }

      const normalized = normalizeCase(
        toolBlock.input as Record<string, unknown>
      );
      if (!Array.isArray(normalized.labs)) {
        throw new Error("labs field is not a structured array.");
      }
      if (
        !Array.isArray(normalized.diagnosisOptions) ||
        normalized.diagnosisOptions.length !== 4
      ) {
        throw new Error("diagnosisOptions is not an array of 4 options.");
      }

      return {
        id: `${slugify(diagnosis)}-${index + 1}`,
        difficulty,
        ...normalized,
      };
    } catch (error) {
      lastError = error;
      // Back off on rate limits / overload / transient network errors.
      const status = error instanceof APIError ? error.status : undefined;
      const retriable =
        status === undefined || status === 429 || status >= 500;
      if (attempt < MAX_RETRIES && retriable) {
        const backoff = 1000 * 2 ** (attempt - 1); // 1s, 2s, 4s, ...
        console.warn(
          `  ⟳ "${diagnosis}" attempt ${attempt} failed (${
            status ?? "network"
          }); retrying in ${backoff}ms`
        );
        await sleep(backoff);
        continue;
      }
      break;
    }
  }
  throw new Error(
    `Failed to generate "${diagnosis}" after ${MAX_RETRIES} attempts: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`
  );
}

// ---------------------------------------------------------------------------
// File helpers — incremental save + resume
// ---------------------------------------------------------------------------

const OUTPUT_DIR = join(PROJECT_ROOT, "public", "cases");

function loadExisting(file: string): GeneratedCase[] {
  const path = join(OUTPUT_DIR, file);
  if (!existsSync(path)) return [];
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function save(file: string, cases: GeneratedCase[]): void {
  const path = join(OUTPUT_DIR, file);
  writeFileSync(path, JSON.stringify(cases, null, 2) + "\n", "utf8");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });

  console.log(`MedCase.AI — generating clinical cases with ${MODEL}\n`);

  let totalGenerated = 0;
  let totalFailed = 0;

  for (const category of CATEGORIES) {
    console.log(
      `\n=== ${category.file} (${category.difficulty}) — ${category.diagnoses.length} Diagnosen ===`
    );

    // Resume: keep any cases already present, regenerate only missing diagnoses.
    const existing = loadExisting(category.file);
    const byDiagnosis = new Map(existing.map((c) => [c.id, c]));
    const results: GeneratedCase[] = [];

    // Build the work list, preserving the requested diagnosis order.
    const todo: { diagnosis: string; index: number }[] = [];
    category.diagnoses.forEach((diagnosis, index) => {
      const id = `${slugify(diagnosis)}-${index + 1}`;
      const cached = byDiagnosis.get(id);
      // Reuse a cached case only if it's structurally valid; otherwise regenerate.
      if (cached && Array.isArray(cached.labs)) {
        results[index] = cached;
      } else {
        todo.push({ diagnosis, index });
      }
    });

    if (todo.length < category.diagnoses.length) {
      console.log(
        `  ↺ ${
          category.diagnoses.length - todo.length
        } bereits vorhanden, ${todo.length} zu generieren.`
      );
    }

    // Process in concurrent batches of BATCH_SIZE.
    for (let i = 0; i < todo.length; i += BATCH_SIZE) {
      const batch = todo.slice(i, i + BATCH_SIZE);
      const settled = await Promise.allSettled(
        batch.map((item) =>
          generateCase(item.diagnosis, category.difficulty, item.index)
        )
      );

      settled.forEach((outcome, j) => {
        const item = batch[j];
        if (outcome.status === "fulfilled") {
          results[item.index] = outcome.value;
          totalGenerated++;
          console.log(`  ✓ ${item.diagnosis}`);
        } else {
          totalFailed++;
          console.error(`  ✗ ${item.diagnosis} — ${outcome.reason}`);
        }
      });

      // Persist after every batch so an interruption never loses finished work.
      save(category.file, results.filter(Boolean));
    }

    save(category.file, results.filter(Boolean));
    console.log(
      `  → ${results.filter(Boolean).length}/${
        category.diagnoses.length
      } gespeichert in public/cases/${category.file}`
    );
  }

  console.log(
    `\nFertig. ${totalGenerated} neu generiert, ${totalFailed} fehlgeschlagen.`
  );
  if (totalFailed > 0) {
    console.log(
      "Erneut ausführen, um fehlgeschlagene Fälle nachzugenerieren (bereits gespeicherte werden übersprungen)."
    );
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("\nFataler Fehler:", error);
  process.exit(1);
});
