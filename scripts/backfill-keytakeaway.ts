/**
 * backfill-keytakeaway.ts — Add a `keyTakeaway` field to every existing case.
 *
 * Standalone, idempotent backfill that walks public/cases/{pj,vorklinik,innere}.json
 * and adds ONE new field `keyTakeaway` to each case. For every case it makes a single
 * Claude call (claude-sonnet-4-6, same Anthropic SDK instance style as generate-cases.ts)
 * that receives ONLY the existing `explanation` and `correctDiagnosis` — it does NOT
 * regenerate anamnesis, labs, or imaging. Claude returns one short, cognitively focused
 * German sentence (~15-25 words) capturing the diagnostic core insight of the case —
 * the thing to remember BEFORE reading the full explanation.
 *
 * The field is inserted right after `correctDiagnosis` (before `diagnosisOptions`),
 * consistently across all three files.
 *
 * Run with:
 *   npx tsx scripts/backfill-keytakeaway.ts
 *
 * Requires ANTHROPIC_API_KEY (read from the environment or from .env.local).
 * Optional ANTHROPIC_MODEL (defaults to claude-sonnet-4-6).
 *
 * Safe to re-run: cases that already have a non-empty `keyTakeaway` are skipped,
 * and each file is written incrementally after every batch so a crash never loses
 * finished work.
 */

import Anthropic, { APIError } from "@anthropic-ai/sdk";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
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

// claude-sonnet-4-6 matches the model used by generate-cases.ts and the API route.
const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";

// ---------------------------------------------------------------------------
// Tool schema — structured single-sentence output
// ---------------------------------------------------------------------------

const TAKEAWAY_TOOL: Anthropic.Tool = {
  name: "present_takeaway",
  description:
    "Return the single key diagnostic takeaway sentence for the case.",
  input_schema: {
    type: "object",
    properties: {
      keyTakeaway: {
        type: "string",
        description:
          "Ein einziger, kurzer, kognitiv fokussierter Kernsatz auf Deutsch (ca. 15-25 Wörter), der die diagnostische Kernerkenntnis des Falls auf den Punkt bringt – das, was man sich merken soll, BEVOR man die volle Erklärung liest. NUR der Satz selbst: keine Einleitung, keine Anführungszeichen, kein 'Kernaussage:'-Präfix.",
      },
    },
    required: ["keyTakeaway"],
  },
};

const SYSTEM_PROMPT = `Du bist medizinische Tutorin/medizinischer Tutor für deutsche Medizinstudierende in der Vorbereitung auf Physikum und Staatsexamen.

Deine Aufgabe: Aus der vorhandenen Falllösung (correctDiagnosis + explanation) destillierst du EINEN einzigen, prägnanten Kernsatz auf Deutsch.

Anforderungen an den Kernsatz:
- Genau EIN Satz, ca. 15-25 Wörter.
- Bringt die diagnostische Kernerkenntnis auf den Punkt: das wegweisende Muster bzw. die entscheidende Befundkonstellation, an der man die Diagnose erkennt.
- Kognitiv fokussiert – das, was man sich merken soll, BEVOR man die ausführliche Erklärung liest.
- Authentisches klinisches Deutsch, gebräuchliche Fachterminologie und Abkürzungen erlaubt.

WICHTIG zur Ausgabeform: Gib AUSSCHLIESSLICH den einen Satz aus (über das Tool present_takeaway). KEINE Einleitung, KEINE Anführungszeichen, KEIN Präfix wie "Kernaussage:" oder "Merke:" – das Label wird im Frontend ergänzt. Nur der reine Satz.`;

// ---------------------------------------------------------------------------
// Case model + field insertion
// ---------------------------------------------------------------------------

interface ClinicalCase {
  id: string;
  correctDiagnosis?: string;
  explanation?: string;
  keyTakeaway?: string;
  [key: string]: unknown;
}

// Rebuild a case object with `keyTakeaway` inserted right after `correctDiagnosis`
// (i.e. before `diagnosisOptions`). Preserves the order of all other fields and
// works the same for all three files.
function withKeyTakeaway(
  original: ClinicalCase,
  keyTakeaway: string
): ClinicalCase {
  const out: ClinicalCase = {} as ClinicalCase;
  for (const [key, value] of Object.entries(original)) {
    if (key === "keyTakeaway") continue; // drop any stale copy; reinsert in canonical spot
    out[key] = value;
    if (key === "correctDiagnosis") {
      out.keyTakeaway = keyTakeaway;
    }
  }
  // Fallback: if the case somehow lacks correctDiagnosis, append at the end.
  if (!("keyTakeaway" in out)) {
    out.keyTakeaway = keyTakeaway;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Claude call
// ---------------------------------------------------------------------------

const anthropic = new Anthropic({ apiKey: API_KEY });

const BATCH_SIZE = 10; // cases per concurrent batch; file is saved after each batch
const MAX_RETRIES = 4; // attempts per case before giving up
const MAX_TOKENS = 256; // a single short sentence needs very little headroom

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Generate the keyTakeaway for ONE case. Input is ONLY explanation + correctDiagnosis.
async function generateTakeaway(c: ClinicalCase): Promise<string> {
  const correctDiagnosis = String(c.correctDiagnosis ?? "").trim();
  const explanation = String(c.explanation ?? "").trim();

  if (!correctDiagnosis || !explanation) {
    throw new Error("Case is missing correctDiagnosis or explanation.");
  }

  const prompt = `Korrekte Diagnose (correctDiagnosis):
${correctDiagnosis}

Ausführliche Erklärung des Falls (explanation):
${explanation}

Destilliere daraus den einen Kernsatz und gib ihn über das Tool present_takeaway zurück.`;

  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const message = await anthropic.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: SYSTEM_PROMPT,
        tools: [TAKEAWAY_TOOL],
        tool_choice: { type: "tool", name: "present_takeaway" },
        messages: [{ role: "user", content: prompt }],
      });

      const toolBlock = message.content.find(
        (block): block is Anthropic.ToolUseBlock =>
          block.type === "tool_use" && block.name === "present_takeaway"
      );

      if (!toolBlock) {
        throw new Error("No present_takeaway tool_use block in response.");
      }

      const input = toolBlock.input as Record<string, unknown>;
      const takeaway =
        typeof input.keyTakeaway === "string" ? input.keyTakeaway.trim() : "";

      if (!takeaway) {
        throw new Error("present_takeaway returned an empty keyTakeaway.");
      }

      return takeaway;
    } catch (error) {
      lastError = error;
      const status = error instanceof APIError ? error.status : undefined;
      const retriable =
        status === undefined || status === 429 || status >= 500;
      if (attempt < MAX_RETRIES && retriable) {
        const backoff = 1000 * 2 ** (attempt - 1); // 1s, 2s, 4s, ...
        console.warn(
          `  ⟳ "${c.id}" attempt ${attempt} failed (${
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
    `Failed after ${MAX_RETRIES} attempts: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`
  );
}

// ---------------------------------------------------------------------------
// File helpers
// ---------------------------------------------------------------------------

const OUTPUT_DIR = join(PROJECT_ROOT, "public", "cases");
const FILES = ["pj.json", "vorklinik.json", "innere.json"];

function loadCases(file: string): ClinicalCase[] {
  const path = join(OUTPUT_DIR, file);
  const parsed = JSON.parse(readFileSync(path, "utf8"));
  if (!Array.isArray(parsed)) {
    throw new Error(`${file} does not contain a JSON array.`);
  }
  return parsed as ClinicalCase[];
}

function saveCases(file: string, cases: ClinicalCase[]): void {
  const path = join(OUTPUT_DIR, file);
  writeFileSync(path, JSON.stringify(cases, null, 2) + "\n", "utf8");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log(`MedCase.AI — backfilling keyTakeaway with ${MODEL}\n`);

  let totalProcessed = 0;
  let totalSkipped = 0;
  const failed: string[] = [];

  for (const file of FILES) {
    const path = join(OUTPUT_DIR, file);
    if (!existsSync(path)) {
      console.warn(`! ${file} nicht gefunden — übersprungen.`);
      continue;
    }

    const cases = loadCases(file);
    const total = cases.length;

    // Only cases that don't already have a non-empty keyTakeaway.
    const todo: number[] = [];
    cases.forEach((c, i) => {
      const existing =
        typeof c.keyTakeaway === "string" ? c.keyTakeaway.trim() : "";
      if (existing) {
        totalSkipped++;
      } else {
        todo.push(i);
      }
    });

    console.log(
      `\n=== ${file} — ${total} Cases (${
        total - todo.length
      } bereits vorhanden, ${todo.length} zu verarbeiten) ===`
    );

    let processedInFile = 0;

    for (let i = 0; i < todo.length; i += BATCH_SIZE) {
      const batch = todo.slice(i, i + BATCH_SIZE);
      const settled = await Promise.allSettled(
        batch.map((idx) => generateTakeaway(cases[idx]))
      );

      settled.forEach((outcome, j) => {
        const idx = batch[j];
        const c = cases[idx];
        if (outcome.status === "fulfilled") {
          cases[idx] = withKeyTakeaway(c, outcome.value);
          totalProcessed++;
          processedInFile++;
        } else {
          failed.push(c.id);
          console.error(`  ✗ ${c.id} — ${outcome.reason}`);
        }
      });

      // Persist after every batch so an interruption never loses finished work.
      saveCases(file, cases);
      console.log(
        `  ${file}: ${processedInFile}/${todo.length} verarbeitet` +
          (failed.length ? ` (${failed.length} fehlgeschlagen gesamt)` : "")
      );
    }

    // Final write (also covers files where everything was already present).
    saveCases(file, cases);
  }

  console.log(
    `\nFertig. ${totalProcessed} keyTakeaway neu erzeugt, ${totalSkipped} übersprungen (bereits vorhanden).`
  );

  if (failed.length > 0) {
    console.log(`\n${failed.length} Case(s) fehlgeschlagen:`);
    failed.forEach((id) => console.log(`  - ${id}`));
    console.log(
      "Skript erneut ausführen, um nur die fehlgeschlagenen Cases nachzuholen (bereits befüllte werden übersprungen)."
    );
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("\nFataler Fehler:", error);
  process.exit(1);
});
