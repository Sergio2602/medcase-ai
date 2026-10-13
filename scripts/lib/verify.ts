// scripts/lib/verify.ts
//
// Pipeline v2, Stufe 3.5: medizinische Gegenprüfung des fertig konstruierten Falls.
// Eigener API-Call, frischer Kontext. Sieht den Fall + das Faktenblatt aus Stufe 1 —
// letzteres OHNE Quellenangaben (siehe projectFactsheetForVerify), damit der Prüfschritt
// selbst sucht statt nachzulesen, womit Stufe 1 zufrieden war.
//
// Abgrenzung zu Stufe 4 (detect.ts): hier geht es um medizinische Richtigkeit. Die
// Plagiatsprüfung des Fall-Textes bleibt ein eigener, deterministischer Schritt. Getrennt,
// weil der Beweiswert unterschiedlich ist: ein Skript ist in fünf Jahren reproduzierbar,
// ein Modellurteil nicht.
//
// Was dieser Schritt NICHT tut: er entscheidet nichts. Das Modell liefert Einzelbefunde,
// das Gesamturteil (`verdict`) rechnet computeVerdict() hier im Code aus. Ein Modell, das
// sein eigenes Gesamturteil vergibt, redet sich zum Pass.
//
// Nutzung (CLI, Selbsttest der Urteilslogik ohne API):
//   npx tsx scripts/lib/verify.ts --selftest

import Anthropic from "@anthropic-ai/sdk";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { anthropic, DEFAULT_MODEL } from "./env.js";
import { ALLOWED_FACTSHEET_DOMAINS, type Factsheet } from "./factsheet.js";
import { serializeCaseForReview, type ConstructedCase } from "./case-types.js";
import {
  checkMechanicalCopyRisk,
  findWebMatches,
  type CopyRiskFinding,
  type NgramSearchFn,
} from "./ngram.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Quellen für die Prüfung
//
// Entscheidung 2026-09-13 (DECISION_LOG.md): die Websuche dieses Schritts ist NICHT frei.
// Ursprünglich war "jede Quelle erlaubt, weil hier nur gelesen und nichts übernommen wird"
// vorgesehen. Verworfen aus drei Gründen, die alle neben dem Urheberrecht liegen:
//   1. § 87b UrhG — systematische, wiederholte maschinelle Abfrage einer Datenbank ist auch
//      ohne Übernahme von Ausdruck angreifbar.
//   2. Die AGB von Amboss und UpToDate untersagen automatisierten Zugriff. Das ist
//      Vertragsrecht, nicht Urheberrecht, und vom Fakt-vs-Ausdruck-Prinzip nicht gedeckt.
//   3. § 44b Abs. 3 UrhG — der TDM-Vorbehalt steht genau in diesen AGB, damit greift die
//      Text-und-Data-Mining-Schranke nicht.
// Dazu der Kollateralschaden: der Provenienz-Record würde pro Fall protokollieren, welche
// gesperrte Quelle maschinell abgefragt wurde — ein selbstgeführter, datierter Nachweis
// gegen uns. Der Audit-Trail soll entlasten, nicht belasten.
// Amboss/UpToDate liest Sergio als Mensch in Stufe 5. Unprotokolliert, unstrittig zulässig.
// ---------------------------------------------------------------------------

// Zusätzlich zur Stufe-1-Liste: Quellen, die zum Gegenprüfen taugen, aber für die
// Faktenextraktion nicht gebraucht wurden.
const VERIFY_EXTRA_DOMAINS: string[] = [
  "bfarm.de", // Arzneimittelinformationen, amtlich
  "pei.de", // Paul-Ehrlich-Institut
  "who.int",
  "europepmc.org",
  "cochranelibrary.com",
];

export const ALLOWED_VERIFY_DOMAINS: string[] = [...ALLOWED_FACTSHEET_DOMAINS, ...VERIFY_EXTRA_DOMAINS];

// Dokumentiert, was bewusst draußen bleibt. `allowed_domains` schließt ohnehin alles andere
// aus — diese Liste existiert, damit eine spätere Erweiterung der Whitelist auffällt, statt
// still durchzurutschen.
export const BLOCKED_VERIFY_DOMAINS: string[] = [
  "amboss.com",
  "amboss.de",
  "next.amboss.com",
  "uptodate.com",
  "wolterskluwer.com",
  "impp.de",
  "thieme.de",
  "elsevier.com",
];

function assertWhitelistClean(): void {
  const violation = ALLOWED_VERIFY_DOMAINS.find((allowed) =>
    BLOCKED_VERIFY_DOMAINS.some((blocked) => allowed === blocked || allowed.endsWith(`.${blocked}`))
  );
  if (violation) {
    throw new Error(
      `verify.ts: '${violation}' steht auf der Whitelist UND auf der Sperrliste. ` +
        `Siehe DECISION_LOG.md 2026-09-13 — gesperrte Quellen gehören nicht in den ` +
        `automatisierten, protokollierten Prüfschritt.`
    );
  }
}
assertWhitelistClean();

// ---------------------------------------------------------------------------
// Typen
// ---------------------------------------------------------------------------

export type ClaimCategory =
  | "epidemiologie"
  | "anamnese"
  | "koerperlicher_befund"
  | "labor"
  | "bildgebung"
  | "diagnosekriterium"
  | "therapie"
  | "verlauf";

export type ClaimStatus = "bestaetigt" | "abweichend" | "unbelegt" | "nicht_pruefbar";
export type Severity = "blocking" | "major" | "minor" | "info" | "none";

export type OmissionType =
  | "fehlende_differentialdiagnose"
  | "red_flag"
  | "kontraindikation"
  | "fehlender_befund"
  | "loesbarkeitsluecke";

export const CONSISTENCY_CHECKS = [
  "laborwerte_plausibel",
  "laborkonstellation_traegt_diagnose",
  "zeitachse",
  "demografie_medikation",
  "kein_diagnose_leak",
  "antwortoptionen_echte_differentiale",
] as const;
export type ConsistencyCheckKey = (typeof CONSISTENCY_CHECKS)[number];

// Welche Konsistenzprüfung blockiert, wenn sie fällt, und welche nur Nacharbeit auslöst.
const CONSISTENCY_SEVERITY: Record<ConsistencyCheckKey, "blocking" | "major"> = {
  laborwerte_plausibel: "major",
  laborkonstellation_traegt_diagnose: "blocking", // Fall ist sonst nicht lösbar/irreführend
  zeitachse: "major",
  demografie_medikation: "major",
  kein_diagnose_leak: "blocking", // Fall ist als Rätsel wertlos
  antwortoptionen_echte_differentiale: "major",
};

export type VerifyVerdict = "pass" | "revise" | "reject";

export interface VerifyEvidence {
  url: string;
  title: string;
  publisher: string;
  published?: string; // Publikations-/Aktualisierungsdatum der Quelle
  accessed: string; // ISO 8601
}

export interface CorrectionDelta {
  field: string; // Feldname im Fall, z.B. "labs.CRP" oder "explanation"
  ist: string;
  soll: string;
}

export interface VerifiedClaim {
  id: string;
  text: string; // eigene Worte, <= 25 Wörter
  category: ClaimCategory;
  coveredByFactsheet: boolean;
  factsheetRef?: string;
  status: ClaimStatus;
  severity: Severity;
  note: string; // leer bei status "bestaetigt"
  correctionDelta?: CorrectionDelta | null;
  evidence: VerifyEvidence[];
}

export interface VerifyOmission {
  type: OmissionType;
  note: string;
  severity: Severity;
}

export interface ConsistencyResult {
  check: ConsistencyCheckKey;
  passed: boolean;
  note: string;
}

export type AntiCopyStatus = "passed" | "flagged" | "mechanical-only";

export interface AntiCopyResult {
  status: AntiCopyStatus;
  maxWordsPerNote: number;
  ngramSize: number;
  notesChecked: number;
  mechanicalFindings: Array<{ claimId: string; rule: CopyRiskFinding["rule"]; detail: string }>;
  webHits: Array<{ claimId: string; ngram: string; matchedUrl: string }>;
  webCheckRun: boolean;
}

export interface VerifyReport {
  caseId: string;
  verifyRunId: string;
  schemaVersion: "1.0";
  timestamp: string;
  model: string;
  sameModelAsConstruct: boolean; // true = korrelierte Fehler möglich, siehe unten
  promptFile: string;
  promptSha256: string;
  factsheetSha256: string;
  caseTextSha256: string;

  verdict: VerifyVerdict;
  verdictReasons: string[];
  blockingCount: number;

  claims: VerifiedClaim[];
  omissions: VerifyOmission[];
  internalConsistency: ConsistencyResult[];
  antiCopy: AntiCopyResult;

  meta: {
    claimsTotal: number;
    unresolvedCritical: number; // unbelegt UND nirgends belegt gewesen
    openQuestions: number; // unbelegt, aber in Stufe 1 belegt — nur Hinweis
    searchResultsSeen: number;
    sourcesConsulted: string[];
    durationMs: number;
    inputTokens: number;
    outputTokens: number;
  };
}

const MAX_WORDS_PER_NOTE = 25;
const NOTE_NGRAM_SIZE = 8;

// Gegencheck 2026-09-15, BLOCKING 2: computeVerdict() kannte kein Mindestmass an geprueften
// Behauptungen -- claims: [] plus sechs bestandene Konsistenzpruefungen ergab "pass". Der
// Prompt (verify.v1.md) erwartet 15-40 Behauptungen; 12 ist die harte Untergrenze darunter,
// nicht der Erwartungswert selbst -- etwas Spielraum fuer sehr einfache Faelle, aber ein Lauf
// mit 0-11 Claims ist kein ernstzunehmender Pruefdurchlauf.
const MIN_CLAIMS = 12;
// Wenn mehr als ein Viertel aller Behauptungen als "nicht_pruefbar" gemeldet wird, ist der
// Pruefdurchlauf zu schwach fuer ein Urteil -- unabhaengig davon, ob die uebrigen Claims alle
// "bestaetigt" sind.
const MAX_NICHT_PRUEFBAR_RATIO = 0.25;

// ---------------------------------------------------------------------------
// Faktenblatt-Projektion: Fakten ohne Quellen
//
// Der Prüfschritt bekommt bewusst NICHT die URLs aus Stufe 1. Sonst bestätigt er den Fall
// gegen dieselbe Quelle, aus der er stammt — das ist keine unabhängige Prüfung, sondern
// ein Echo. Sichtbar bleibt nur, OB ein Fakt in Stufe 1 belegt war.
// ---------------------------------------------------------------------------

export interface FactsheetProjection {
  text: string;
  index: Map<string, { belegt: boolean }>;
}

export function projectFactsheetForVerify(factsheet: Factsheet): FactsheetProjection {
  const index = new Map<string, { belegt: boolean }>();
  const lines: string[] = [];

  factsheet.facts.forEach((fact, i) => {
    const id = `f-${i + 1}`;
    const belegt = Boolean(fact.sourceId) && fact.modelKnowledge !== true;
    index.set(id, { belegt });
    lines.push(`${id} [${belegt ? "belegt" : "modellwissen"}] ${fact.fact}`);
  });

  const labLines = factsheet.typicalLabFindings.map(
    (f) => `  - ${f.parameter}: ${f.direction}${f.magnitude ? ` (${f.magnitude})` : ""}`
  );

  const text = [
    `DIAGNOSE: ${factsheet.diagnosis}`,
    ``,
    `FAKTEN (ohne Quellenangaben — such selbst):`,
    ...lines,
    ``,
    `VORGEGEBENE LABORKONSTELLATION (Stufe 3 hat daraus die Zahlen gewürfelt):`,
    ...(labLines.length > 0 ? labLines : ["  (keine)"]),
    ``,
    `EPIDEMIOLOGISCHER RAHMEN: ${factsheet.epidemiology.typicalAgeRangeMin}–` +
      `${factsheet.epidemiology.typicalAgeRangeMax} Jahre, Tendenz ${factsheet.epidemiology.genderSkew}`,
  ].join("\n");

  return { text, index };
}

// ---------------------------------------------------------------------------
// Tool-Schema
// ---------------------------------------------------------------------------

const EVIDENCE_SCHEMA = {
  type: "array" as const,
  description:
    "Fundstellen — NUR Metadaten. Niemals Textauszüge, Zitate oder Tabelleninhalte.",
  items: {
    type: "object" as const,
    properties: {
      url: { type: "string" as const },
      title: { type: "string" as const },
      publisher: { type: "string" as const },
      published: { type: "string" as const, description: "Publikations-/Aktualisierungsdatum, falls erkennbar." },
      accessed: { type: "string" as const, description: "ISO 8601, Abrufdatum." },
    },
    required: ["url", "title", "publisher", "accessed"],
  },
};

const VERIFY_TOOL: Anthropic.Tool = {
  name: "submit_verification",
  description:
    "Gibt das vollständige Prüfergebnis zurück. Immer als letzter Schritt aufrufen, nachdem " +
    "alle sechs Arbeitsschritte abgeschlossen sind. Kein Gesamturteil — nur Einzelbefunde.",
  input_schema: {
    type: "object",
    properties: {
      claims: {
        type: "array",
        description:
          "Alle atomaren Behauptungen des Falls, einzeln geprüft. Erwartung: 15–40 Einträge.",
        items: {
          type: "object",
          properties: {
            id: { type: "string", description: "Fortlaufend: c-1, c-2, ..." },
            text: { type: "string", description: "Die Behauptung in eigenen Worten, max. 25 Wörter." },
            category: {
              type: "string",
              enum: [
                "epidemiologie",
                "anamnese",
                "koerperlicher_befund",
                "labor",
                "bildgebung",
                "diagnosekriterium",
                "therapie",
                "verlauf",
              ],
            },
            coveredByFactsheet: { type: "boolean" },
            factsheetRef: { type: "string", description: "Fakt-ID aus dem Faktenblatt, z.B. 'f-12'." },
            status: { type: "string", enum: ["bestaetigt", "abweichend", "unbelegt", "nicht_pruefbar"] },
            severity: { type: "string", enum: ["blocking", "major", "minor", "info", "none"] },
            note: {
              type: "string",
              description:
                "Bei Abweichung: was stimmt nicht, in eigenen Worten, max. 25 Wörter. " +
                "Keine Anführungszeichen, keine URL, keine DOI. Leer bei 'bestaetigt'.",
            },
            correctionDelta: {
              type: "object",
              description: "Nur bei 'abweichend'. Parameter-Delta, KEIN Ersatztext.",
              properties: {
                field: { type: "string" },
                ist: { type: "string" },
                soll: { type: "string" },
              },
              required: ["field", "ist", "soll"],
            },
            evidence: EVIDENCE_SCHEMA,
          },
          required: ["id", "text", "category", "coveredByFactsheet", "status", "severity", "note", "evidence"],
        },
      },
      omissions: {
        type: "array",
        description:
          "Schritt 4 — was FEHLT. Leeres Array nur, wenn die Checkliste wirklich vollständig durchgegangen wurde.",
        items: {
          type: "object",
          properties: {
            type: {
              type: "string",
              enum: [
                "fehlende_differentialdiagnose",
                "red_flag",
                "kontraindikation",
                "fehlender_befund",
                "loesbarkeitsluecke",
              ],
            },
            note: { type: "string", description: "Max. 25 Wörter, eigene Worte." },
            severity: { type: "string", enum: ["blocking", "major", "minor", "info", "none"] },
          },
          required: ["type", "note", "severity"],
        },
      },
      internalConsistency: {
        type: "array",
        description: "Schritt 5 — alle sechs Prüfungen, auch die bestandenen. Genau diese Schlüssel.",
        items: {
          type: "object",
          properties: {
            check: { type: "string", enum: [...CONSISTENCY_CHECKS] },
            passed: { type: "boolean" },
            note: { type: "string", description: "Bei passed=false: was stimmt nicht, max. 25 Wörter." },
          },
          required: ["check", "passed", "note"],
        },
      },
    },
    required: ["claims", "omissions", "internalConsistency"],
  },
};

// ---------------------------------------------------------------------------
// Prompt laden + hashen
// ---------------------------------------------------------------------------

const PROMPT_RELATIVE_PATH = "scripts/lib/prompts/verify.v1.md";

function loadSystemPrompt(): { text: string; sha256: string } {
  const path = join(__dirname, "prompts", "verify.v1.md");
  if (!existsSync(path)) {
    throw new Error(`verify.ts: Prompt-Datei fehlt unter ${path}`);
  }
  const text = readFileSync(path, "utf8");
  return { text, sha256: createHash("sha256").update(text, "utf8").digest("hex") };
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

// ---------------------------------------------------------------------------
// Urteilslogik — im Code, nicht im Modell
// ---------------------------------------------------------------------------

export function computeVerdict(
  parts: {
    claims: VerifiedClaim[];
    omissions: VerifyOmission[];
    internalConsistency: ConsistencyResult[];
    antiCopy: AntiCopyResult;
  },
  factsheetIndex: Map<string, { belegt: boolean }>
): { verdict: VerifyVerdict; reasons: string[]; blockingCount: number; unresolvedCritical: number; openQuestions: number } {
  const reasons: string[] = [];
  let blockingCount = 0;

  // 0. Mindestmass an geprueften Behauptungen -- ohne das erreicht ein Lauf mit 0 Claims oder
  //    lauter "nicht_pruefbar" formal "pass" (Gegencheck 2026-09-15, BLOCKING 2).
  if (parts.claims.length < MIN_CLAIMS) {
    blockingCount++;
    reasons.push(
      `Nur ${parts.claims.length} Behauptung(en) geprueft, Minimum ist ${MIN_CLAIMS} ` +
        `(Prompt erwartet 15-40) -- Pruefdurchlauf zu duenn fuer ein Urteil.`
    );
  }
  const nichtPruefbarCount = parts.claims.filter((c) => c.status === "nicht_pruefbar").length;
  const nichtPruefbarRatio = parts.claims.length > 0 ? nichtPruefbarCount / parts.claims.length : 1;
  const nichtPruefbarTooHigh = nichtPruefbarRatio > MAX_NICHT_PRUEFBAR_RATIO;
  if (nichtPruefbarTooHigh) {
    reasons.push(
      `${nichtPruefbarCount} von ${parts.claims.length} Behauptung(en) als 'nicht_pruefbar' ` +
        `markiert (> ${Math.round(MAX_NICHT_PRUEFBAR_RATIO * 100)}%) -- zu viele ungeprueft ` +
        `fuer ein verlaessliches Urteil.`
    );
  }

  // 1. Abweichungen
  for (const claim of parts.claims) {
    if (claim.status !== "abweichend") continue;
    if (claim.severity === "blocking") {
      blockingCount++;
      reasons.push(`${claim.id}: blockierende Abweichung (${claim.category}).`);
    }
  }
  const majorClaims = parts.claims.filter((c) => c.status === "abweichend" && c.severity === "major");
  if (majorClaims.length > 0) {
    reasons.push(`${majorClaims.length} fachliche Abweichung(en) ohne Handlungsfolge.`);
  }

  // 2. Auslassungen
  for (const omission of parts.omissions) {
    if (omission.severity === "blocking") {
      blockingCount++;
      reasons.push(`Auslassung (${omission.type}) als blockierend eingestuft.`);
    }
  }
  const majorOmissions = parts.omissions.filter((o) => o.severity === "major");
  if (majorOmissions.length > 0) {
    reasons.push(`${majorOmissions.length} relevante Auslassung(en).`);
  }

  // 3. Konsistenz — fehlende Prüfungen zählen als nicht bestanden, nicht als bestanden.
  const seen = new Map(parts.internalConsistency.map((c) => [c.check, c]));
  let consistencyMajor = 0;
  for (const key of CONSISTENCY_CHECKS) {
    const result = seen.get(key);
    const failed = !result || !result.passed;
    if (!failed) continue;
    if (CONSISTENCY_SEVERITY[key] === "blocking") {
      blockingCount++;
      reasons.push(`Konsistenzprüfung '${key}' nicht bestanden.`);
    } else {
      consistencyMajor++;
    }
  }
  if (consistencyMajor > 0) {
    reasons.push(`${consistencyMajor} Konsistenzprüfung(en) nicht bestanden.`);
  }

  // 4. Unbelegtes. Unterschieden nach: hat es je einen Beleg gegeben?
  //    - kritisch: weder Stufe 1 noch dieser Schritt konnten es belegen -> reine Erfindung
  //      der Konstruktionsstufe, muss ein Mensch entscheiden.
  //    - offene Frage: Stufe 1 hatte einen Beleg, dieser Schritt hat ihn nicht wiedergefunden.
  let unresolvedCritical = 0;
  let openQuestions = 0;
  for (const claim of parts.claims) {
    if (claim.status !== "unbelegt") continue;
    const ref = claim.factsheetRef ? factsheetIndex.get(claim.factsheetRef) : undefined;
    if (claim.coveredByFactsheet && ref?.belegt) openQuestions++;
    else unresolvedCritical++;
  }
  if (unresolvedCritical > 0) {
    reasons.push(`${unresolvedCritical} Behauptung(en) nirgends belegt (auch nicht in Stufe 1).`);
  }

  // 5. Anti-Copy auf den Notizen. Kein medizinischer Befund, aber der Prüflauf selbst ist
  //    dann unbrauchbar — sein Ergebnis darf nicht in den Provenienz-Record.
  if (parts.antiCopy.status === "flagged") {
    reasons.push("Prüflauf ungültig: Notizen enthalten wörtliche Übernahme-Indikatoren.");
  }

  let verdict: VerifyVerdict;
  if (blockingCount > 0 || parts.antiCopy.status === "flagged") {
    verdict = "reject";
  } else if (
    majorClaims.length > 0 ||
    majorOmissions.length > 0 ||
    consistencyMajor > 0 ||
    unresolvedCritical > 0 ||
    nichtPruefbarTooHigh
  ) {
    verdict = "revise";
  } else {
    verdict = "pass";
    if (openQuestions > 0) {
      reasons.push(`${openQuestions} Punkt(e) in Stufe 1 belegt, hier nicht wiedergefunden — nur Hinweis.`);
    }
  }

  return { verdict, reasons, blockingCount, unresolvedCritical, openQuestions };
}

// ---------------------------------------------------------------------------
// Anti-Copy-Prüfung auf den Notizfeldern
//
// Zweistufig: die mechanischen Regeln laufen immer (kostenlos, deterministisch). Der
// Web-Abgleich braucht eine Suchfunktion von außen — die liefert detect.ts (Stufe 4), die
// noch nicht gebaut ist. Bis dahin ist der Status ehrlich "mechanical-only", nicht "passed".
// ---------------------------------------------------------------------------

export async function runAntiCopyCheck(
  claims: VerifiedClaim[],
  omissions: VerifyOmission[],
  search?: NgramSearchFn
): Promise<AntiCopyResult> {
  const notes: Array<{ id: string; text: string }> = [
    ...claims.filter((c) => c.note.trim().length > 0).map((c) => ({ id: c.id, text: c.note })),
    ...omissions.map((o, i) => ({ id: `o-${i + 1}`, text: o.note })),
  ].filter((n) => n.text.trim().length > 0);

  const mechanicalFindings: AntiCopyResult["mechanicalFindings"] = [];
  for (const note of notes) {
    for (const finding of checkMechanicalCopyRisk(note.text, MAX_WORDS_PER_NOTE)) {
      mechanicalFindings.push({ claimId: note.id, rule: finding.rule, detail: finding.detail });
    }
  }

  const webHits: AntiCopyResult["webHits"] = [];
  if (search) {
    for (const note of notes) {
      const hits = await findWebMatches(note.text, NOTE_NGRAM_SIZE, search);
      for (const hit of hits) {
        for (const url of hit.matchedUrls) {
          webHits.push({ claimId: note.id, ngram: hit.ngram, matchedUrl: url });
        }
      }
    }
  }

  const flagged = mechanicalFindings.length > 0 || webHits.length > 0;
  const status: AntiCopyStatus = flagged ? "flagged" : search ? "passed" : "mechanical-only";

  return {
    status,
    maxWordsPerNote: MAX_WORDS_PER_NOTE,
    ngramSize: NOTE_NGRAM_SIZE,
    notesChecked: notes.length,
    mechanicalFindings,
    webHits,
    webCheckRun: Boolean(search),
  };
}

// ---------------------------------------------------------------------------
// Hauptfunktion
// ---------------------------------------------------------------------------

export interface VerifyOptions {
  model?: string;
  constructModel?: string; // zum Erkennen korrelierter Fehler
  maxSearches?: number;
  ngramSearch?: NgramSearchFn;
}

export async function verifyCase(
  caseData: ConstructedCase,
  factsheet: Factsheet,
  opts?: VerifyOptions
): Promise<VerifyReport> {
  const startedAt = Date.now();

  // Stärkstes verfügbares Modell — bewusst NICHT DEFAULT_MODEL als stillschweigender
  // Rückfall, aber auch keine hartkodierte Modell-ID, die veraltet. Sergio setzt
  // ANTHROPIC_MODEL_VERIFY in .env.local.
  const model = opts?.model ?? process.env.ANTHROPIC_MODEL_VERIFY ?? DEFAULT_MODEL;
  const constructModel = opts?.constructModel ?? process.env.ANTHROPIC_MODEL_CONSTRUCT ?? DEFAULT_MODEL;
  const sameModelAsConstruct = model === constructModel;
  if (sameModelAsConstruct) {
    console.warn(
      `verify.ts: WARNUNG — Prüf- und Konstruktionsmodell sind identisch (${model}). ` +
        `Gleiche Trainingsdaten heißt gleiche Blindstellen: das Modell bestätigt dann seine ` +
        `eigene Halluzination. Über ANTHROPIC_MODEL_VERIFY ein anderes Modell setzen.`
    );
  }

  const { text: systemPrompt, sha256: promptSha256 } = loadSystemPrompt();
  const projection = projectFactsheetForVerify(factsheet);
  const caseText = serializeCaseForReview(caseData);

  const userPrompt = `<fall>
${caseText}
</fall>

<faktenblatt>
${projection.text}
</faktenblatt>

Arbeite die sechs Schritte aus den Systemanweisungen vollständig ab und rufe danach
ausschließlich submit_verification auf.`;

  const tools: Anthropic.ToolUnion[] = [
    {
      type: "web_search_20250305",
      name: "web_search",
      allowed_domains: ALLOWED_VERIFY_DOMAINS,
      max_uses: opts?.maxSearches ?? 20,
    },
    VERIFY_TOOL,
  ];

  let messages: Anthropic.MessageParam[] = [{ role: "user", content: userPrompt }];
  let response = await anthropic.messages.create({
    model,
    max_tokens: 16000,
    system: systemPrompt,
    tools,
    messages,
  });

  let inputTokens = response.usage.input_tokens;
  let outputTokens = response.usage.output_tokens;
  const allBlocks: Anthropic.ContentBlock[] = [...response.content];

  let iterations = 0;
  while (response.stop_reason === "pause_turn" && iterations < 8) {
    messages = [...messages, { role: "assistant", content: response.content }];
    response = await anthropic.messages.create({
      model,
      max_tokens: 16000,
      system: systemPrompt,
      tools,
      messages,
    });
    inputTokens += response.usage.input_tokens;
    outputTokens += response.usage.output_tokens;
    allBlocks.push(...response.content);
    iterations++;
  }

  // Welche Quellen das Modell tatsächlich gesehen hat, lesen wir aus der Antwort ab —
  // nicht aus dem, was es selbst behauptet. Titel und URL der Suchtreffer sind Klartext.
  const sourcesConsulted = new Set<string>();
  let searchResultsSeen = 0;
  for (const block of allBlocks) {
    if (block.type !== "web_search_tool_result") continue;
    const content = block.content;
    if (!Array.isArray(content)) continue;
    for (const result of content) {
      if (result.type === "web_search_result") {
        searchResultsSeen++;
        sourcesConsulted.add(result.url);
      }
    }
  }

  // Gegencheck 2026-09-15, BLOCKING 4: ein am Token-Limit abgeschnittener tool_use-Block
  // (z.B. eine gekuerzte claims-Liste bei max_tokens: 16000 gegen 15-40 erwartete Claims)
  // durfte bisher unbemerkt weiterlaufen -- computeVerdict() haette dann auf unvollstaendigem
  // Material geurteilt. Nur "pause_turn" ist ein gueltiger Zwischenstopp, "max_tokens" nie.
  if (response.stop_reason === "max_tokens") {
    throw new Error(
      `verify.ts: Modellantwort am max_tokens-Limit (16000) abgeschnitten -- Ergebnis ist ` +
        `moeglicherweise unvollstaendig und darf nicht als Pruefergebnis verwendet werden. ` +
        `max_tokens erhoehen oder Claim-Anzahl im Prompt begrenzen.`
    );
  }

  const toolUse = allBlocks.find(
    (block): block is Anthropic.ToolUseBlock =>
      block.type === "tool_use" && block.name === "submit_verification"
  );
  if (!toolUse) {
    throw new Error(
      `verify.ts: Modell hat 'submit_verification' nicht aufgerufen (stop_reason=${response.stop_reason}). ` +
        `Blöcke: ${allBlocks.map((b) => b.type).join(", ")}`
    );
  }

  const input = toolUse.input as {
    claims: VerifiedClaim[];
    omissions: VerifyOmission[];
    internalConsistency: ConsistencyResult[];
  };

  // Belegpflicht hart durchsetzen: "bestaetigt" ohne Fundstelle ist kein Befund, sondern
  // Modellwissen mit anderem Etikett. Wir werfen nicht, sondern stufen zurück — damit der
  // Lauf verwertbar bleibt und die Herabstufung im Record sichtbar wird.
  const claims = input.claims.map((claim) => {
    if (claim.status === "bestaetigt" && (!claim.evidence || claim.evidence.length === 0)) {
      return {
        ...claim,
        status: "unbelegt" as ClaimStatus,
        note: claim.note || "Automatisch herabgestuft: als bestätigt gemeldet, aber ohne Fundstelle.",
        evidence: [],
      };
    }
    return { ...claim, evidence: claim.evidence ?? [] };
  });

  const antiCopy = await runAntiCopyCheck(claims, input.omissions, opts?.ngramSearch);
  const judgement = computeVerdict(
    { claims, omissions: input.omissions, internalConsistency: input.internalConsistency, antiCopy },
    projection.index
  );

  return {
    caseId: caseData.id,
    verifyRunId: `vr-${randomUUID().slice(0, 8)}`,
    schemaVersion: "1.0",
    timestamp: new Date().toISOString(),
    model,
    sameModelAsConstruct,
    promptFile: PROMPT_RELATIVE_PATH,
    promptSha256,
    factsheetSha256: sha256(JSON.stringify(factsheet)),
    caseTextSha256: sha256(caseText),
    verdict: judgement.verdict,
    verdictReasons: judgement.reasons,
    blockingCount: judgement.blockingCount,
    claims,
    omissions: input.omissions,
    internalConsistency: input.internalConsistency,
    antiCopy,
    meta: {
      claimsTotal: claims.length,
      unresolvedCritical: judgement.unresolvedCritical,
      openQuestions: judgement.openQuestions,
      searchResultsSeen,
      sourcesConsulted: [...sourcesConsulted],
      durationMs: Date.now() - startedAt,
      inputTokens,
      outputTokens,
    },
  };
}

// ---------------------------------------------------------------------------
// Menschenlesbare Kurzfassung — zeigt NUR, was nicht in Ordnung ist.
// Eine Wand aus grünen Häkchen trainiert das Durchwinken an; genau das darf in Stufe 5
// nicht passieren (Art. 50 Abs. 4 KI-VO setzt substanzielle menschliche Prüfung voraus).
// ---------------------------------------------------------------------------

export function renderVerifySummary(report: VerifyReport): string {
  const lines: string[] = [];
  const symbol = report.verdict === "pass" ? "PASS" : report.verdict === "revise" ? "REVISE" : "REJECT";
  lines.push(`[${symbol}] ${report.caseId} — ${report.meta.claimsTotal} Behauptungen geprüft, ${report.blockingCount} blockierend`);
  if (report.sameModelAsConstruct) {
    lines.push(`  ! Prüfmodell = Konstruktionsmodell (${report.model}) — korrelierte Fehler möglich.`);
  }
  for (const reason of report.verdictReasons) lines.push(`  * ${reason}`);

  const problems = report.claims.filter((c) => c.status === "abweichend" || c.status === "unbelegt");
  if (problems.length > 0) {
    lines.push(`  Befunde:`);
    for (const c of problems) {
      const delta = c.correctionDelta ? ` [${c.correctionDelta.field}: ${c.correctionDelta.ist} -> ${c.correctionDelta.soll}]` : "";
      lines.push(`    ${c.id} (${c.status}/${c.severity}, ${c.category}): ${c.note}${delta}`);
    }
  }
  for (const o of report.omissions) {
    lines.push(`    Auslassung (${o.type}, ${o.severity}): ${o.note}`);
  }
  for (const c of report.internalConsistency.filter((x) => !x.passed)) {
    lines.push(`    Konsistenz '${c.check}': ${c.note}`);
  }
  if (report.antiCopy.status !== "passed") {
    lines.push(`  Anti-Copy: ${report.antiCopy.status} (${report.antiCopy.notesChecked} Notizen, Web-Abgleich: ${report.antiCopy.webCheckRun ? "ja" : "nein"})`);
    for (const f of report.antiCopy.mechanicalFindings) lines.push(`    ${f.claimId} [${f.rule}]: ${f.detail}`);
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// CLI — Selbsttest der Urteilslogik, ohne API
// ---------------------------------------------------------------------------

function claimFixture(over: Partial<VerifiedClaim>): VerifiedClaim {
  return {
    id: "c-1",
    text: "Beispielbehauptung",
    category: "labor",
    coveredByFactsheet: true,
    factsheetRef: "f-1",
    status: "bestaetigt",
    severity: "none",
    note: "",
    evidence: [{ url: "https://awmf.org/x", title: "T", publisher: "AWMF", accessed: "2026-09-13" }],
    ...over,
  };
}

const ALL_CHECKS_PASSED: ConsistencyResult[] = CONSISTENCY_CHECKS.map((check) => ({
  check,
  passed: true,
  note: "",
}));

// Polstert Test-Claims auf MIN_CLAIMS auf, damit isolierte Tests einzelner Regeln nicht durch
// die neue Mindestmass-Regel (Gegencheck 2026-09-15, BLOCKING 2) verfaelscht werden.
function withMinClaims(claims: VerifiedClaim[]): VerifiedClaim[] {
  const filler = Array.from({ length: Math.max(0, MIN_CLAIMS - claims.length) }, (_, i) =>
    claimFixture({ id: `filler-${i + 1}` })
  );
  return [...claims, ...filler];
}

async function selftest(): Promise<void> {
  const index = new Map([
    ["f-1", { belegt: true }],
    ["f-2", { belegt: false }],
  ]);
  const clean: AntiCopyResult = {
    status: "passed",
    maxWordsPerNote: MAX_WORDS_PER_NOTE,
    ngramSize: NOTE_NGRAM_SIZE,
    notesChecked: 0,
    mechanicalFindings: [],
    webHits: [],
    webCheckRun: true,
  };
  const failures: string[] = [];
  const check = (name: string, actual: unknown, expected: unknown): void => {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : ` — erwartet ${JSON.stringify(expected)}, war ${JSON.stringify(actual)}`}`);
    if (!ok) failures.push(name);
  };

  check(
    "sauberer Fall -> pass",
    computeVerdict({ claims: withMinClaims([claimFixture({})]), omissions: [], internalConsistency: ALL_CHECKS_PASSED, antiCopy: clean }, index).verdict,
    "pass"
  );

  check(
    "blockierende Abweichung -> reject",
    computeVerdict(
      { claims: withMinClaims([claimFixture({ status: "abweichend", severity: "blocking", note: "Dosis falsch" })]), omissions: [], internalConsistency: ALL_CHECKS_PASSED, antiCopy: clean },
      index
    ).verdict,
    "reject"
  );

  check(
    "major Abweichung -> revise",
    computeVerdict(
      { claims: withMinClaims([claimFixture({ status: "abweichend", severity: "major", note: "veraltet" })]), omissions: [], internalConsistency: ALL_CHECKS_PASSED, antiCopy: clean },
      index
    ).verdict,
    "revise"
  );

  check(
    "blockierende Auslassung -> reject",
    computeVerdict(
      { claims: withMinClaims([claimFixture({})]), omissions: [{ type: "red_flag", note: "fehlt", severity: "blocking" }], internalConsistency: ALL_CHECKS_PASSED, antiCopy: clean },
      index
    ).verdict,
    "reject"
  );

  check(
    "Diagnose-Leak -> reject",
    computeVerdict(
      {
        claims: withMinClaims([claimFixture({})]),
        omissions: [],
        internalConsistency: ALL_CHECKS_PASSED.map((c) => (c.check === "kein_diagnose_leak" ? { ...c, passed: false, note: "Leak" } : c)),
        antiCopy: clean,
      },
      index
    ).verdict,
    "reject"
  );

  check(
    "fehlende Konsistenzprüfung zählt als nicht bestanden",
    computeVerdict({ claims: withMinClaims([claimFixture({})]), omissions: [], internalConsistency: [], antiCopy: clean }, index).verdict,
    "reject"
  );

  check(
    "unbelegt + in Stufe 1 belegt -> pass (nur Hinweis)",
    computeVerdict(
      { claims: withMinClaims([claimFixture({ status: "unbelegt", severity: "info", factsheetRef: "f-1" })]), omissions: [], internalConsistency: ALL_CHECKS_PASSED, antiCopy: clean },
      index
    ).verdict,
    "pass"
  );

  check(
    "unbelegt + nirgends belegt -> revise",
    computeVerdict(
      { claims: withMinClaims([claimFixture({ status: "unbelegt", severity: "info", factsheetRef: "f-2" })]), omissions: [], internalConsistency: ALL_CHECKS_PASSED, antiCopy: clean },
      index
    ).verdict,
    "revise"
  );

  check(
    "claims:[] -> reject (Gegencheck 2026-09-15 BLOCKING 2 -- vorher faelschlich 'pass')",
    computeVerdict({ claims: [], omissions: [], internalConsistency: ALL_CHECKS_PASSED, antiCopy: clean }, index).verdict,
    "reject"
  );

  check(
    "zu viele 'nicht_pruefbar' -> mindestens revise",
    computeVerdict(
      {
        claims: Array.from({ length: 15 }, (_, i) =>
          claimFixture({ id: `c-${i + 1}`, status: i < 6 ? "nicht_pruefbar" : "bestaetigt", note: i < 6 ? "x" : "" })
        ),
        omissions: [],
        internalConsistency: ALL_CHECKS_PASSED,
        antiCopy: clean,
      },
      index
    ).verdict,
    "revise"
  );

  check(
    "Anti-Copy flagged -> reject",
    computeVerdict(
      { claims: withMinClaims([claimFixture({})]), omissions: [], internalConsistency: ALL_CHECKS_PASSED, antiCopy: { ...clean, status: "flagged" } },
      index
    ).verdict,
    "reject"
  );

  // Anti-Copy-Mechanik
  const longNote = Array.from({ length: 30 }, (_, i) => `wort${i}`).join(" ");
  const anti = await runAntiCopyCheck(
    [
      claimFixture({ id: "c-1", status: "abweichend", severity: "minor", note: longNote }),
      claimFixture({ id: "c-2", status: "abweichend", severity: "minor", note: 'laut Leitlinie "gilt der Grenzwert"' }),
      claimFixture({ id: "c-3", status: "abweichend", severity: "minor", note: "siehe awmf.org für Details" }),
    ],
    []
  );
  check("Anti-Copy erkennt Wortlimit/Zitat/URL", anti.mechanicalFindings.map((f) => f.rule).sort(), ["quote-marks", "url", "word-cap"]);
  check("Anti-Copy ohne Websuche -> mechanical-only", (await runAntiCopyCheck([claimFixture({})], [])).status, "mechanical-only");

  // Whitelist
  check("Amboss nicht auf der Verify-Whitelist", ALLOWED_VERIFY_DOMAINS.some((d) => d.includes("amboss")), false);
  check("UpToDate nicht auf der Verify-Whitelist", ALLOWED_VERIFY_DOMAINS.some((d) => d.includes("uptodate")), false);

  console.log(`\n${failures.length === 0 ? "Alle Selbsttests bestanden." : `${failures.length} Selbsttest(s) fehlgeschlagen.`}`);
  if (failures.length > 0) process.exit(1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes("--selftest")) {
    selftest().catch((e) => {
      console.error(e);
      process.exit(1);
    });
  } else {
    console.error("Nutzung: npx tsx scripts/lib/verify.ts --selftest");
    process.exit(1);
  }
}
