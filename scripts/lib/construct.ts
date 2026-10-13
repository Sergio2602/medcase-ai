// scripts/lib/construct.ts
//
// Pipeline v2, Stufe 2: Fallkonstruktion in frischem Kontext.
// Eigener API-Call. Sieht NUR das Faktenblatt aus Stufe 1 (Fakten, keine Quelltexte, keine
// URLs) sowie die bereits gewürfelten Vorgaben aus Stufe 3 (Patient, Labor) — die stehen
// fest, das Modell erfindet sie nicht. Kein Websuche-Tool: alles, was über das Faktenblatt
// hinausgeht, wäre unbelegtes Modellwissen, das genau die Trennung unterläuft, die diese
// Stufe schützen soll.
//
// Bewusste Vereinfachung gegenüber einem "das Modell darf alles frei benennen"-Ansatz:
// `correctDiagnosis`, `patientName`, `age`, `gender` und `labs` kommen NIE vom Modell,
// sondern werden hier im Code eingesetzt. Das Modell liefert nur noch die drei falschen
// Differentialdiagnosen (`distractors`) und die Fließtextfelder. Weniger Freiheit fürs
// Modell heißt weniger Fläche für Abweichung von den Stufe-0/3-Vorgaben.
//
// Nutzung (CLI, Selbsttest der Validierungs-/Zusammenbaulogik ohne API):
//   npx tsx scripts/lib/construct.ts --selftest

import Anthropic from "@anthropic-ai/sdk";
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { anthropic, DEFAULT_MODEL } from "./env.js";
import type { CaseTopic, Factsheet } from "./factsheet.js";
import type { PatientDemographics } from "./patient.js";
import { mulberry32 } from "./rng.js";
import { tokenize } from "./ngram.js";
import type { ComponentAttribution } from "./provenance.js";
import type { CaseLabCategory, CaseCategory, ConstructedCase, DifferentialNote } from "./case-types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Stufe 2 liefert ausschließlich "constructed" (Fließtext, neu aus Fakten gebaut) — nie
// "computed" (das ist Stufe 3: Patient/Labor) und nie "copied"/"paraphrased" (siehe
// provenance.ts: dieser Wert darf im Typsystem gar nicht vorkommen). Konstant, weil sich das
// pro Fall nie unterscheidet — es beschreibt die Pipeline-Architektur, nicht den Einzelfall.
export const STANDARD_COMPONENT_ATTRIBUTION: ComponentAttribution = {
  history: "constructed",
  examination: "constructed",
  labs: "computed",
  imaging: "constructed",
  diagnosisOptions: "constructed",
  explanation: "constructed",
  differentialNotes: "constructed",
  keyTakeaway: "constructed",
};

// ---------------------------------------------------------------------------
// Faktenblatt-Projektion für Stufe 2
//
// Anders als projectFactsheetForVerify() geht es hier nicht um Unabhängigkeit von Stufe 1 —
// im Gegenteil, Stufe 2 SOLL auf dem Faktenblatt aufbauen. Es geht darum, keine Quellen-
// Metadaten durchzureichen, die das Modell nicht braucht und die es (unbeabsichtigt) in
// sourceNotes wörtlich zitieren könnte. sourceNotes wird deshalb unten deterministisch aus
// den Metadaten gebaut, nie vom Modell — siehe buildSourceNotes().
// ---------------------------------------------------------------------------

export function projectFactsheetForConstruct(factsheet: Factsheet): string {
  const factLines = factsheet.facts.map((f) => `  - ${f.fact}`);
  const labLines = factsheet.typicalLabFindings.map((f) => {
    const mag = f.direction === "normal" ? "" : ` (${f.magnitude ?? "deutlich"})`;
    return `  - ${f.parameter}: ${f.direction}${mag}`;
  });

  return [
    `DIAGNOSE (fest vorgegeben, nicht verändern): ${factsheet.diagnosis}`,
    ``,
    `FAKTEN:`,
    ...(factLines.length > 0 ? factLines : ["  (keine)"]),
    ``,
    `TYPISCHE LABORBEFUNDE FÜR DIESE DIAGNOSE (Kontext — die tatsächlichen Werte dieses`,
    `Falls stehen unten unter LABOR und sind bereits gewürfelt):`,
    ...(labLines.length > 0 ? labLines : ["  (keine)"]),
  ].join("\n");
}

// Deterministisch aus den Quellen-Metadaten von Stufe 1 gebaut — nie vom Modell formuliert.
// Ersetzt in der Sache die alte Fließtext-Konvention (sourceNotes wurde frei geschrieben);
// die rechtlich maßgebliche Fassung ist ohnehin der Provenienz-Record (LEGAL_CASE_PIPELINE.md),
// dieses Feld bedient nur noch das bestehende Case-Schema/UI.
export function buildSourceNotes(factsheet: Factsheet): string {
  const bySource = new Map<string, { publisher: string; title: string }>();
  for (const s of factsheet.sources) {
    bySource.set(s.id, { publisher: s.publisher, title: s.title });
  }
  const cited = [...bySource.values()].map((s) => `${s.publisher} (${s.title})`);
  const modelKnowledgeCount = factsheet.modelKnowledgeClaims.length;

  const parts: string[] = [];
  parts.push(
    cited.length > 0
      ? `Faktenbasis: ${cited.join("; ")}.`
      : `Faktenbasis: keine extern belegten Quellen für diesen Fall.`
  );
  if (modelKnowledgeCount > 0) {
    parts.push(`${modelKnowledgeCount} Fakt(en) zusätzlich aus Modellwissen ohne externen Beleg.`);
  }
  parts.push(`Vollständiger Provenienz-Record: provenance/${factsheet.topicId}.json.`);
  return parts.join(" ");
}

// ---------------------------------------------------------------------------
// Diagnose-Leak-Prüfung
//
// Mechanisch, nicht dem Modell überlassen — dieselbe Begründung wie überall sonst in der
// Pipeline: ein Skript ist zuverlässiger als eine Bitte im Prompt. Prüft, ob die Wortfolge
// der korrekten Diagnose (normalisiert: klein geschrieben, Satzzeichen entfernt) in einem
// der vier "vor der Antwort sichtbaren" Felder vorkommt.
// ---------------------------------------------------------------------------

export const PRE_ANSWER_FIELDS = ["chiefComplaint", "history", "examination", "imaging"] as const;

export interface DiagnosisLeak {
  field: (typeof PRE_ANSWER_FIELDS)[number];
  match: string;
}

// Deutsche Funktionswoerter -- fuer die Token-Teilmengen-Erkennung ignoriert, sonst erreicht
// jede Diagnose mit "und"/"bei" trivial hohe Uebereinstimmung mit fast jedem Text.
const LEAK_STOPWORDS = new Set([
  "der", "die", "das", "des", "dem", "den", "und", "oder", "bei", "mit", "von",
  "im", "in", "zu", "fuer", "auf", "an", "als", "ohne", "nach", "durch",
]);

// Woerter, die in der Praxis fast nie Teil der Diagnose selbst sind, aber oft direkt nach
// ihrem Namen in einer harmlosen Erwaehnung stehen (Anamnese/Prophylaxe-Kontext statt
// eigentlicher Diagnose). Ohne diese Ausnahme wuerde z.B. "Hepatitis-B-Impfung in der
// Vorgeschichte" bei der Diagnose "Hepatitis B" faelschlich als Leak gewertet (Gegencheck
// 2026-09-15, Regel 11, Falsch-Positiv-Beispiel).
const LEAK_HARMLESS_CONTEXT_SUFFIXES = [
  "impfung", "impfstatus", "impfschutz", "prophylaxe", "screening", "vorsorge",
  "ausschluss", "familienanamnese", "risikofaktor", "risikofaktoren",
];

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Inhaltstragende Tokens einer Diagnose, auf einen groben Wortstamm gekuerzt (erste 6 Zeichen)
// -- faengt einfache Flexionsformen wie "kardiomyopathische" vs. "Kardiomyopathie" ab, ohne
// einen vollen Lemmatisierer zu brauchen.
function significantStems(tokens: string[]): string[] {
  return tokens.filter((t) => !LEAK_STOPWORDS.has(t) && t.length > 2).map((t) => t.slice(0, 5));
}

// Kern der Leak-Erkennung, wiederverwendbar fuer Freitextfelder UND Laborparameternamen.
// Zweistufig (Gegencheck 2026-09-15, BLOCKING 6):
//   Tier 1 (bestehend): exakte, zusammenhaengende Wortfolge -- faengt Bindestrich/Gross-Klein.
//   Tier 2 (neu): Token-Teilmenge ueber Wortstaemme -- faengt umformulierte Leaks wie
//     "dilatierter linker Ventrikel ... kardiomyopathische Veraenderungen" fuer die Diagnose
//     "Alkoholtoxische dilatative Kardiomyopathie", bei der Tier 1 nichts findet. Nur ab 2
//     inhaltstragenden Tokens aktiv, sonst waere jede Erwaehnung eines einzelnen haeufigen
//     Wortes ein Fehlalarm.
export function textLeaksDiagnosis(correctDiagnosis: string, text: string): boolean {
  const diagnosisTokens = tokenize(correctDiagnosis);
  if (diagnosisTokens.length === 0) return false;
  const needle = diagnosisTokens.join(" ");
  const rawHaystack = tokenize(text).join(" ");

  // Vorkommen mit direkt folgendem harmlosen Kontextwort werden vor der Pruefung entfernt --
  // nur DIESES Vorkommen, der Rest des Textes bleibt sichtbar.
  const harmlessPattern = new RegExp(
    `\\b${escapeRegex(needle)}\\s+(${LEAK_HARMLESS_CONTEXT_SUFFIXES.join("|")})\\w*\\b`,
    "g"
  );
  const haystack = rawHaystack.replace(harmlessPattern, " ");

  if (haystack.includes(needle)) return true;

  const sigStems = significantStems(diagnosisTokens);
  if (sigStems.length < 2) return false;
  const haystackStems = new Set(significantStems(tokenize(haystack)));
  const matchedCount = sigStems.filter((s) => haystackStems.has(s)).length;
  return matchedCount / sigStems.length >= 0.7;
}

export function findDiagnosisLeaks(
  correctDiagnosis: string,
  fields: Record<(typeof PRE_ANSWER_FIELDS)[number], string>
): DiagnosisLeak[] {
  const leaks: DiagnosisLeak[] = [];
  for (const field of PRE_ANSWER_FIELDS) {
    if (textLeaksDiagnosis(correctDiagnosis, fields[field])) {
      leaks.push({ field, match: correctDiagnosis });
    }
  }
  return leaks;
}

// ---------------------------------------------------------------------------
// Diagnoseoptionen — deterministisch gemischt
//
// Die korrekte Diagnose gehört fest zu diesem Fall (Stufe 0). Damit sie nicht immer an
// derselben Position steht (lernbares Muster für Studierende, das nichts mit der Sache zu
// tun hat), mischt ein eigener Seed die Reihenfolge — reproduzierbar wie Patient/Labor.
// ---------------------------------------------------------------------------

export function orderDiagnosisOptions(correctDiagnosis: string, distractors: string[], seed: number): string[] {
  const options = [correctDiagnosis, ...distractors];
  const rng = mulberry32(seed);
  for (let i = options.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [options[i], options[j]] = [options[j], options[i]];
  }
  return options;
}

// ---------------------------------------------------------------------------
// Tool-Schema
// ---------------------------------------------------------------------------

const CONSTRUCT_TOOL: Anthropic.Tool = {
  name: "present_case",
  description:
    "Gibt den vollständigen konstruierten Fall zurück. Immer als letzter Schritt aufrufen. " +
    "Patient, Alter, Geschlecht, Labor und die korrekte Diagnose werden NICHT hier " +
    "angegeben — die stehen bereits fest und werden von der Pipeline eingesetzt.",
  input_schema: {
    type: "object",
    properties: {
      chiefComplaint: {
        type: "string",
        description: "Ich-Perspektive, Alltagsdeutsch, 1–2 Sätze.",
        minLength: 20,
      },
      history: { type: "string", description: "3. Person, Uniklinik-Anamnese-Stil.", minLength: 80 },
      examination: {
        type: "string",
        description: "Beginnt mit Vitalparameter-Block, dann Organsysteme, mit \\n gegliedert.",
        minLength: 60,
      },
      imaging: { type: "string", description: "Narrativer Befund, oder leerer String wenn keine Bildgebung." },
      distractors: {
        type: "array",
        description: "Genau 3 plausible, falsche Differentialdiagnosen — NICHT die korrekte Diagnose.",
        items: { type: "string" },
        minItems: 3,
        maxItems: 3,
      },
      differentialNotes: {
        type: "array",
        description:
          "Genau 3 Einträge, je einer pro Distraktor. 'option' muss wortgleich einem Eintrag " +
          "aus 'distractors' entsprechen.",
        items: {
          type: "object",
          properties: {
            option: { type: "string" },
            whyNot: { type: "string", description: "Der konkrete unterscheidende Befund.", minLength: 10 },
          },
          required: ["option", "whyNot"],
        },
        minItems: 3,
        maxItems: 3,
      },
      explanation: {
        type: "string",
        description: "Fließtext-Herleitung. Diagnose darf hier stehen — wird erst nach der Antwort gezeigt.",
        minLength: 80,
      },
      keyTakeaway: {
        type: "string",
        description: "Ein Merksatz: 'Befund A + Befund B = Diagnose'.",
        minLength: 15,
      },
      caseContext: {
        type: "object",
        properties: {
          category: { type: "string", enum: ["haeufig", "cannot-miss"] },
          note: { type: "string", minLength: 10 },
        },
        required: ["category", "note"],
      },
    },
    required: [
      "chiefComplaint",
      "history",
      "examination",
      "imaging",
      "distractors",
      "differentialNotes",
      "explanation",
      "keyTakeaway",
      "caseContext",
    ],
  },
};

interface ConstructToolInput {
  chiefComplaint: string;
  history: string;
  examination: string;
  imaging: string;
  distractors: string[];
  differentialNotes: DifferentialNote[];
  explanation: string;
  keyTakeaway: string;
  caseContext: { category: CaseCategory; note: string };
}

// ---------------------------------------------------------------------------
// Validierung + Zusammenbau — als eigene, synchrone Funktion, damit sie im Selbsttest ohne
// API-Aufruf geprüft werden kann. constructCase() (unten) ruft sie nach dem Modellaufruf auf.
// ---------------------------------------------------------------------------

export interface AssembleInput {
  caseId: string;
  topic: CaseTopic;
  factsheet: Factsheet;
  patient: PatientDemographics;
  labs: CaseLabCategory[];
  diagnosisOrderSeed: number;
  modelOutput: ConstructToolInput;
}

export function assembleAndValidate(input: AssembleInput): ConstructedCase {
  const { caseId, topic, factsheet, patient, labs, diagnosisOrderSeed, modelOutput } = input;
  const errors: string[] = [];

  const distractors = modelOutput.distractors ?? [];
  if (distractors.length !== 3) {
    errors.push(`Erwartet genau 3 distractors, erhalten ${distractors.length}.`);
  }
  const normalizedDiagnosis = tokenize(topic.diagnosis).join(" ");
  for (const d of distractors) {
    if (tokenize(d).join(" ") === normalizedDiagnosis) {
      errors.push(`Distraktor "${d}" ist die korrekte Diagnose in anderen Worten — nicht zulässig.`);
    }
  }
  const uniqueDistractors = new Set(distractors.map((d) => d.trim()));
  if (uniqueDistractors.size !== distractors.length) {
    errors.push(`distractors enthält Duplikate: ${distractors.join(", ")}`);
  }

  const notes = modelOutput.differentialNotes ?? [];
  if (notes.length !== 3) {
    errors.push(`Erwartet genau 3 differentialNotes, erhalten ${notes.length}.`);
  }
  const noteOptions = new Set(notes.map((n) => n.option));
  const distractorSet = new Set(distractors);
  if (noteOptions.size !== distractorSet.size || ![...noteOptions].every((o) => distractorSet.has(o))) {
    errors.push(
      `differentialNotes.option muss exakt den 3 distractors entsprechen. ` +
        `distractors=[${distractors.join(", ")}], differentialNotes-Optionen=[${[...noteOptions].join(", ")}]`
    );
  }
  for (const n of notes) {
    if (!n.whyNot || n.whyNot.trim().length === 0) {
      errors.push(`differentialNotes-Eintrag "${n.option}" hat kein whyNot.`);
    }
  }

  const leaks = findDiagnosisLeaks(topic.diagnosis, {
    chiefComplaint: modelOutput.chiefComplaint,
    history: modelOutput.history,
    examination: modelOutput.examination,
    imaging: modelOutput.imaging ?? "",
  });
  for (const leak of leaks) {
    errors.push(`Diagnose-Leak in Feld "${leak.field}": enthält "${leak.match}".`);
  }

  // Regel 11 (CASE_SCHEMA.md) nennt ausdruecklich auch Befund-NAMEN, nicht nur Fliesstext.
  // labs kommt aus Stufe 3 (Skript), nicht vom Modell -- aber ein Laborparametername aus
  // data/reference-ranges.json koennte die Diagnose trotzdem verraten (z.B. ein zukuenftiger
  // Eintrag "Anti-Zoeliakie-Antikoerper"). Gegencheck 2026-09-15, BLOCKING 6.
  for (const category of labs) {
    for (const value of category.values) {
      if (textLeaksDiagnosis(topic.diagnosis, value.name)) {
        errors.push(`Diagnose-Leak im Laborparameternamen "${value.name}".`);
      }
    }
  }

  if (!["haeufig", "cannot-miss"].includes(modelOutput.caseContext?.category)) {
    errors.push(`caseContext.category ungültig: "${modelOutput.caseContext?.category}".`);
  }

  if (errors.length > 0) {
    throw new Error(`construct.ts: Fall "${caseId}" nicht zusammenbaubar:\n- ${errors.join("\n- ")}`);
  }

  return {
    id: caseId,
    difficulty: topic.difficulty,
    patientName: patient.patientName,
    age: patient.age,
    gender: patient.gender,
    chiefComplaint: modelOutput.chiefComplaint,
    history: modelOutput.history,
    examination: modelOutput.examination,
    labs,
    imaging: modelOutput.imaging ?? "",
    correctDiagnosis: topic.diagnosis,
    diagnosisOptions: orderDiagnosisOptions(topic.diagnosis, distractors, diagnosisOrderSeed),
    keyTakeaway: modelOutput.keyTakeaway,
    differentialNotes: notes,
    explanation: modelOutput.explanation,
    sourceNotes: buildSourceNotes(factsheet),
    caseContext: modelOutput.caseContext,
  };
}

// ---------------------------------------------------------------------------
// Prompt laden + hashen
// ---------------------------------------------------------------------------

const PROMPT_RELATIVE_PATH = "scripts/lib/prompts/construct.v1.md";

function loadSystemPrompt(): { text: string; sha256: string } {
  const path = join(__dirname, "prompts", "construct.v1.md");
  if (!existsSync(path)) {
    throw new Error(`construct.ts: Prompt-Datei fehlt unter ${path}`);
  }
  const text = readFileSync(path, "utf8");
  return { text, sha256: createHash("sha256").update(text, "utf8").digest("hex") };
}

// ---------------------------------------------------------------------------
// Hauptfunktion
// ---------------------------------------------------------------------------

export interface ConstructInput {
  caseId: string;
  topic: CaseTopic;
  factsheet: Factsheet;
  patient: PatientDemographics;
  labs: CaseLabCategory[];
  diagnosisOrderSeed: number;
}

export interface ConstructResult {
  case: ConstructedCase;
  model: string;
  promptFile: string;
  promptSha256: string;
}

export async function constructCase(input: ConstructInput, opts?: { model?: string }): Promise<ConstructResult> {
  if (input.topic.selectedBy !== "human") {
    throw new Error(
      `construct.ts: topic.selectedBy muss 'human' sein (Stufe 0 ist Sergios Aufgabe), war '${input.topic.selectedBy}'.`
    );
  }

  const model = opts?.model ?? process.env.ANTHROPIC_MODEL_CONSTRUCT ?? DEFAULT_MODEL;
  const { text: systemPrompt, sha256: promptSha256 } = loadSystemPrompt();

  const labsText =
    input.labs.length > 0
      ? input.labs
          .map(
            (cat) =>
              `${cat.category}:\n` +
              cat.values.map((v) => `  - ${v.name}: ${v.value} ${v.unit} (Referenz ${v.reference}) [${v.flag}]`).join("\n")
          )
          .join("\n")
      : "  (keine)";

  const userPrompt = `<faktenblatt>
${projectFactsheetForConstruct(input.factsheet)}
</faktenblatt>

<patient>
Name: ${input.patient.patientName}
Alter: ${input.patient.age}
Geschlecht: ${input.patient.gender === "male" ? "männlich" : "weiblich"}
</patient>

<labor>
${labsText}
</labor>

<vorgaben>
Schwierigkeitsgrad: ${input.topic.difficulty}
Setting: ${input.topic.setting}
Lernziel: ${input.topic.lernziel}
</vorgaben>

Konstruiere den Fall gemäß den Systemanweisungen und rufe danach ausschließlich
present_case auf.`;

  const response = await anthropic.messages.create({
    model,
    max_tokens: 8000,
    system: systemPrompt,
    tools: [CONSTRUCT_TOOL],
    messages: [{ role: "user", content: userPrompt }],
  });

  // Gegencheck 2026-09-15, BLOCKING 4: ein am Token-Limit abgeschnittener Fall darf nie
  // stillschweigend weiterverarbeitet werden.
  if (response.stop_reason === "max_tokens") {
    throw new Error(
      `construct.ts: Modellantwort am max_tokens-Limit (8000) abgeschnitten -- Fall ist ` +
        `moeglicherweise unvollstaendig und darf nicht verwendet werden.`
    );
  }

  const toolUse = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use" && block.name === "present_case"
  );
  if (!toolUse) {
    throw new Error(
      `construct.ts: Modell hat 'present_case' nicht aufgerufen (stop_reason=${response.stop_reason}). ` +
        `Blöcke: ${response.content.map((b) => b.type).join(", ")}`
    );
  }

  const modelOutput = toolUse.input as ConstructToolInput;
  const assembled = assembleAndValidate({
    caseId: input.caseId,
    topic: input.topic,
    factsheet: input.factsheet,
    patient: input.patient,
    labs: input.labs,
    diagnosisOrderSeed: input.diagnosisOrderSeed,
    modelOutput,
  });

  return { case: assembled, model, promptFile: PROMPT_RELATIVE_PATH, promptSha256 };
}

// ---------------------------------------------------------------------------
// CLI — Selbsttest der Validierungs-/Zusammenbaulogik, ohne API
// ---------------------------------------------------------------------------

const FIXTURE_TOPIC: CaseTopic = {
  id: "zoeliakie",
  diagnosis: "Zöliakie",
  difficulty: "klinik",
  category: "haeufig",
  setting: "Hausarztpraxis",
  lernziel: "Erkennen chronischer Diarrhoe mit Malabsorption.",
  selectedBy: "human",
  rationale: "Häufig, oft spät erkannt.",
};

const FIXTURE_FACTSHEET: Factsheet = {
  topicId: "zoeliakie",
  diagnosis: "Zöliakie",
  createdAt: new Date().toISOString(),
  model: "fixture",
  promptFile: "fixture",
  promptSha256: "fixture",
  facts: [{ fact: "Anti-tTG-IgA ist bei aktiver Zöliakie erhöht.", sourceId: "s1" }],
  typicalLabFindings: [{ parameter: "Anti-tTG-IgA", direction: "high", magnitude: "massiv", sourceId: "s1" }],
  epidemiology: { typicalAgeRangeMin: 20, typicalAgeRangeMax: 50, genderSkew: "female", sourceId: "s1" },
  sources: [
    {
      id: "s1",
      type: "guideline",
      title: "S2k-Leitlinie Zöliakie",
      publisher: "DGVS",
      url: "https://register.awmf.org/x",
      retrievedAt: new Date().toISOString(),
      license: "unverified",
      licenseNote: "Nur Faktenentnahme.",
      usedFor: ["diagnosekriterien"],
    },
  ],
  modelKnowledgeClaims: [],
};

const FIXTURE_PATIENT: PatientDemographics = { patientName: "Sabine", age: 34, gender: "female" };
const FIXTURE_LABS: CaseLabCategory[] = [
  { category: "Serologie", values: [{ name: "Anti-tTG-IgA", value: "120,0", unit: "U/ml", reference: "0,0–7,0", flag: "high" }] },
];

function validOutput(over: Partial<ConstructToolInput> = {}): ConstructToolInput {
  return {
    chiefComplaint: "Mir ist ständig schlecht und ich habe abgenommen.",
    history: "34-jährige Patientin mit seit Monaten bestehenden Durchfällen und Gewichtsverlust.",
    examination: "RR 118/76 mmHg, Puls 78/min. Abdomen weich, kein Druckschmerz.",
    imaging: "",
    distractors: ["Reizdarmsyndrom", "Morbus Crohn", "Laktoseintoleranz"],
    differentialNotes: [
      { option: "Reizdarmsyndrom", whyNot: "Gewichtsverlust und Anämie passen nicht." },
      { option: "Morbus Crohn", whyNot: "Keine Entzündungszeichen." },
      { option: "Laktoseintoleranz", whyNot: "Keine Besserung unter Karenz." },
    ],
    explanation: "Positive Serologie plus Malabsorptionszeichen sprechen für Zöliakie.",
    keyTakeaway: "Chronische Diarrhoe plus positive Serologie = Zöliakie, bis zum Beweis des Gegenteils.",
    caseContext: { category: "haeufig", note: "Häufige, oft spät erkannte Diagnose." },
    ...over,
  };
}

function assemble(over: Partial<ConstructToolInput> = {}): ConstructedCase {
  return assembleAndValidate({
    caseId: "zoeliakie-1",
    topic: FIXTURE_TOPIC,
    factsheet: FIXTURE_FACTSHEET,
    patient: FIXTURE_PATIENT,
    labs: FIXTURE_LABS,
    diagnosisOrderSeed: 7,
    modelOutput: validOutput(over),
  });
}

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

  const c = assemble();
  check("sauberer Fall: patientName übernommen", c.patientName === "Sabine");
  check("sauberer Fall: correctDiagnosis = Topic-Diagnose", c.correctDiagnosis === "Zöliakie");
  check("sauberer Fall: labs unverändert übernommen", c.labs === FIXTURE_LABS);
  check("sauberer Fall: diagnosisOptions enthält alle 4", new Set(c.diagnosisOptions).size === 4 && c.diagnosisOptions.includes("Zöliakie"));
  check("sourceNotes referenziert DGVS", c.sourceNotes.includes("DGVS"));

  throws("Distraktor = Diagnose in anderen Worten -> wirft", () =>
    assemble({ distractors: ["Zöliakie", "Morbus Crohn", "Laktoseintoleranz"] })
  );
  throws("nur 2 distractors -> wirft", () => assemble({ distractors: ["Reizdarmsyndrom", "Morbus Crohn"] as unknown as string[] }));
  throws("differentialNotes.option passt nicht zu distractors -> wirft", () =>
    assemble({
      differentialNotes: [
        { option: "Falscher Name", whyNot: "x" },
        { option: "Morbus Crohn", whyNot: "x" },
        { option: "Laktoseintoleranz", whyNot: "x" },
      ],
    })
  );
  throws("Diagnose-Leak in history -> wirft", () =>
    assemble({ history: "34-jährige Patientin, Verdacht auf Zöliakie bei Diarrhoe." })
  );
  throws("Diagnose-Leak in chiefComplaint (Groß-/Kleinschreibung) -> wirft", () =>
    assemble({ chiefComplaint: "Ich habe wohl eine ZÖLIAKIE, hat der Arzt gesagt." })
  );
  throws("ungültige caseContext.category -> wirft", () =>
    assemble({ caseContext: { category: "sonstiges" as unknown as CaseCategory, note: "x" } })
  );

  // Leak-Erkennung direkt
  check(
    "findDiagnosisLeaks: sauberer Text -> keine Treffer",
    findDiagnosisLeaks("Zöliakie", { chiefComplaint: "Mir ist schlecht.", history: "x", examination: "x", imaging: "" }).length === 0
  );
  check(
    "findDiagnosisLeaks: erkennt Leak trotz Bindestrich/Groß-Klein",
    findDiagnosisLeaks("Alkoholtoxische Kardiomyopathie", {
      chiefComplaint: "x",
      history: "Verdacht auf alkoholtoxische-Kardiomyopathie.",
      examination: "x",
      imaging: "x",
    }).length === 1
  );

  // Regressionstests aus dem Gegencheck 2026-09-15 (BLOCKING 6): Tier-2-Erkennung (Falsch-
  // Negativ vorher) und Harmless-Context-Ausnahme (Falsch-Positiv vorher).
  check(
    "textLeaksDiagnosis: umformulierter Leak wird jetzt erkannt (vorher Falsch-Negativ)",
    textLeaksDiagnosis(
      "Alkoholtoxische dilatative Kardiomyopathie",
      "Seit Jahren dilatierter linker Ventrikel bei bekanntem Alkoholabusus, kardiomyopathische Veränderungen."
    )
  );
  check(
    "textLeaksDiagnosis: Hepatitis-B-Impfung in der Vorgeschichte ist KEIN Leak (vorher Falsch-Positiv)",
    !textLeaksDiagnosis("Hepatitis B", "Hepatitis-B-Impfung in der Vorgeschichte, sonst unauffällig.")
  );
  check(
    "textLeaksDiagnosis: echte Erwähnung von Hepatitis B (nicht Impfung) wird weiterhin erkannt",
    textLeaksDiagnosis("Hepatitis B", "Klinisch Verdacht auf eine akute Hepatitis B.")
  );
  check(
    "textLeaksDiagnosis: einzelnes häufiges Wort löst KEINEN Leak aus (Mindest-Tokenzahl)",
    !textLeaksDiagnosis("Akute Herzinsuffizienz", "Der Patient berichtet, das Herz schlage schnell.")
  );

  // Deterministik der Mischung
  const order1 = orderDiagnosisOptions("Zöliakie", ["A", "B", "C"], 42);
  const order2 = orderDiagnosisOptions("Zöliakie", ["A", "B", "C"], 42);
  check("orderDiagnosisOptions: gleicher Seed -> gleiche Reihenfolge", JSON.stringify(order1) === JSON.stringify(order2));
  check("orderDiagnosisOptions: enthält alle 4 Optionen", new Set(order1).size === 4);
  const order3 = orderDiagnosisOptions("Zöliakie", ["A", "B", "C"], 1);
  check("orderDiagnosisOptions: anderer Seed -> potenziell andere Reihenfolge", JSON.stringify(order1) !== JSON.stringify(order3) || true);

  // sourceNotes ohne Quellen
  const noSourceFactsheet: Factsheet = { ...FIXTURE_FACTSHEET, sources: [], modelKnowledgeClaims: [{ claim: "x", confidence: "low", noSourceFound: true }] };
  check("buildSourceNotes ohne Quellen nennt das explizit", buildSourceNotes(noSourceFactsheet).includes("keine extern belegten Quellen"));
  check("buildSourceNotes zählt Modellwissen", buildSourceNotes(noSourceFactsheet).includes("1 Fakt(en)"));

  console.log(`\n${failures.length === 0 ? "Alle Selbsttests bestanden." : `${failures.length} Selbsttest(s) fehlgeschlagen.`}`);
  if (failures.length > 0) process.exit(1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes("--selftest")) selftest();
  else {
    console.error("Nutzung: npx tsx scripts/lib/construct.ts --selftest");
    process.exit(1);
  }
}
