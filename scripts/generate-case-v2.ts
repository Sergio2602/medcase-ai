// scripts/generate-case-v2.ts
//
// Pipeline v2 — Orchestrierung. Führt für EIN Thema (Stufe 0, von Sergio vorgegeben) alle
// automatisierten Stufen aus und schreibt Provenienz-Record + Prüfbericht + Staging-Fall.
//
// Was dieses Skript AUSDRÜCKLICH NICHT tut:
//   - Es setzt niemals review.status auf "approved" oder release.approved auf true. Das ist
//     Stufe 5 — Sergios Aufgabe, dokumentiert per Hand oder in einem separaten Freigabe-Schritt.
//   - Es promotet nichts nach content/cases/ (die Live-Bank). Es schreibt nur nach
//     content/cases/v2/staging/.
//   - Es bricht nicht ab, wenn Stufe 3.5 oder Stufe 4 einen Fall beanstanden. Es dokumentiert
//     den Befund ehrlich im Provenienz-Record — assertReleasable() ist die eigentliche Schranke,
//     und die wird an anderer Stelle (Freigabe-Schritt) aufgerufen, nicht hier.
//
// Warum pro Fall eine eigene Staging-Datei statt einer gemeinsamen Disziplin-Datei
// (docs/CASE_SCHEMA.md sieht eigentlich `{disziplin}-staging.json`-Arrays vor): Stufe 0
// (data/case-topics.json) hat noch kein Disziplin-Feld — das kommt erst mit der von Sergio
// freizugebenden Themenliste. Bis dahin: eine Datei pro caseId, unter
// content/cases/v2/staging/<caseId>.json. Eine spätere Promotion fasst das nach Disziplin
// zusammen; das ändert an dieser Stelle nichts.
//
// Nutzung:
//   npx tsx scripts/generate-case-v2.ts <topic.json> [--index N] [--with-web-anticopy]
//                                        [--force-canary <mutationId>] [--seed-salt <string>]
//   npx tsx scripts/generate-case-v2.ts --selftest   (keine API, prüft nur die reine Logik)
//
// ANTHROPIC_API_KEY (und optional ANTHROPIC_MODEL_FACTSHEET / _CONSTRUCT / _VERIFY / _DETECT,
// SERPER_API_KEY) aus der Umgebung oder .env.local — siehe scripts/lib/env.ts.

import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { PROJECT_ROOT } from "./lib/env.js";
import { extractFactsheet, type CaseTopic } from "./lib/factsheet.js";
import { generatePatient } from "./lib/patient.js";
import { generateLabs } from "./lib/labs.js";
import { constructCase, STANDARD_COMPONENT_ATTRIBUTION } from "./lib/construct.js";
import { verifyCase, renderVerifySummary, type VerifyReport } from "./lib/verify.js";
import { detectCase, createDefaultSearchBackend } from "./lib/detect.js";
import { scoreCanary, shouldInjectCanary, pickMutation, CANARY_MUTATIONS } from "./lib/canary.js";
import {
  assertReleasable,
  collectReleaseWarnings,
  type ProvenanceRecord,
  type VerifySummaryRecord,
  type CanaryRecord,
  type RiskClass,
  type DetectionResult,
} from "./lib/provenance.js";
import type { ConstructedCase } from "./lib/case-types.js";

// ---------------------------------------------------------------------------
// Seeds — deterministisch aus caseId abgeleitet statt frei gewürfelt.
//
// Vorteil: ein Fall lässt sich aus seinem Provenienz-Record UND seiner caseId exakt
// reproduzieren, ohne dass irgendwo ein Zufalls-Startwert separat aufbewahrt werden müsste.
// `salt` erlaubt trotzdem, bei Bedarf eine zweite, andere Ziehung für dieselbe caseId zu
// bekommen (z.B. für eine manuell angestoßene Neu-Konstruktion nach Stufe-5-Ablehnung).
// ---------------------------------------------------------------------------

export function deriveSeed(caseId: string, salt: string): number {
  const hash = createHash("sha256").update(`${caseId}:${salt}`, "utf8").digest();
  return hash.readUInt32BE(0);
}

export interface DerivedSeeds {
  patient: number;
  labs: number;
  diagnosisOrder: number;
  canary: number;
}

export function deriveSeeds(caseId: string, seedSalt: string): DerivedSeeds {
  return {
    patient: deriveSeed(caseId, `${seedSalt}:patient`),
    labs: deriveSeed(caseId, `${seedSalt}:labs`),
    diagnosisOrder: deriveSeed(caseId, `${seedSalt}:diagnosisOrder`),
    canary: deriveSeed(caseId, `${seedSalt}:canary`),
  };
}

// ---------------------------------------------------------------------------
// Risikoklasse — rein mechanisch aus den beiden automatisierten Prüfstufen abgeleitet.
// Ersetzt keine menschliche Einschätzung, sortiert nur vor: was braucht in Stufe 5 zuerst
// Aufmerksamkeit.
// ---------------------------------------------------------------------------

export function computeRiskClass(verify: VerifyReport, detection: DetectionResult): RiskClass {
  if (verify.verdict === "reject") return "ROT";
  if (verify.verdict === "revise" || detection.verdict === "flagged") return "GELB";
  return "GRUEN";
}

function gitSha(): string {
  try {
    return execSync("git rev-parse HEAD", { cwd: PROJECT_ROOT }).toString().trim();
  } catch {
    return "unknown";
  }
}

function ensureDir(path: string): void {
  mkdirSync(path, { recursive: true });
}

// ---------------------------------------------------------------------------
// Ein einzelner Fall, Ende zu Ende
// ---------------------------------------------------------------------------

export interface RunOptions {
  index?: number; // Position in einem Batch — steuert die Canary-Injektion (1 je CANARY_RATE)
  forceCanaryMutation?: string; // manuelles Erzwingen einer bestimmten Mutation, für Tests
  withWebAntiCopy?: boolean; // Web-Abgleich der Verify-Notizen aktivieren (kostet zusätzliche Calls)
  seedSalt?: string;
}

export interface RunResult {
  case: ConstructedCase;
  provenance: ProvenanceRecord;
  verifyReport: VerifyReport;
  detection: DetectionResult;
}

export async function runPipelineForTopic(topic: CaseTopic, opts: RunOptions = {}): Promise<RunResult> {
  const caseId = topic.id;
  const seeds = deriveSeeds(caseId, opts.seedSalt ?? "v1");

  console.log(`\n=== ${caseId} (${topic.diagnosis}) ===`);

  console.log("Stufe 1 — Faktenextraktion...");
  const factsheet = await extractFactsheet(topic);
  console.log(`  ${factsheet.facts.length} Fakten, ${factsheet.sources.length} Quellen.`);

  console.log("Stufe 3 — Patient/Labor würfeln...");
  const patient = generatePatient(factsheet.epidemiology, seeds.patient);
  const labs = generateLabs(factsheet.typicalLabFindings, patient.gender, seeds.labs);
  console.log(`  ${patient.patientName}, ${patient.age}, ${patient.gender}; ${labs.length} Laborkategorie(n).`);

  console.log("Stufe 2 — Fallkonstruktion (frischer Kontext)...");
  const constructResult = await constructCase({
    caseId,
    topic,
    factsheet,
    patient,
    labs,
    diagnosisOrderSeed: seeds.diagnosisOrder,
  });
  const constructedCase = constructResult.case;

  console.log("Stufe 3.5 — medizinische Gegenprüfung...");
  const antiCopySearch = opts.withWebAntiCopy ? createDefaultSearchBackend().fn : undefined;
  const verifyReport = await verifyCase(constructedCase, factsheet, { ngramSearch: antiCopySearch });
  console.log(renderVerifySummary(verifyReport).split("\n").map((l) => `  ${l}`).join("\n"));

  // Kalibrierung: nur wenn diese Position im Batch dran ist (oder manuell erzwungen).
  let canaryRecord: CanaryRecord | undefined;
  const shouldCanary = opts.forceCanaryMutation !== undefined || shouldInjectCanary(opts.index ?? 0);
  if (shouldCanary) {
    console.log("Kalibrierung — Canary-Mutation wird geprüft...");
    const mutation = opts.forceCanaryMutation
      ? CANARY_MUTATIONS.find((m) => m.id === opts.forceCanaryMutation)
      : pickMutation(constructedCase, seeds.canary);
    if (!mutation) {
      console.warn(`  Keine passende Mutation für diesen Fall gefunden — Canary übersprungen.`);
    } else {
      const { mutated, expectation } = mutation.apply(constructedCase);
      mutated.id = `canary-${mutation.id}-${caseId}`;
      const canaryVerify = await verifyCase(mutated, factsheet, { ngramSearch: antiCopySearch });
      const score = scoreCanary(expectation, canaryVerify);
      canaryRecord = {
        runAt: new Date().toISOString(),
        mutationId: mutation.id,
        detected: score.detected,
        actualVerdict: score.actualVerdict,
        matchedSignals: score.matchedSignals,
      };
      console.log(`  Mutation '${mutation.id}': ${score.detected ? "ERKANNT" : "NICHT ERKANNT"} (Urteil: ${score.actualVerdict}).`);
    }
  }

  console.log("Stufe 4 — Plagiats-Detektion...");
  const detection = await detectCase(constructedCase);
  console.log(`  ${detection.hits.length} Treffer, Urteil: ${detection.verdict}.`);

  const verifySummary: VerifySummaryRecord = {
    runId: verifyReport.verifyRunId,
    runAt: verifyReport.timestamp,
    model: verifyReport.model,
    sameModelAsConstruct: verifyReport.sameModelAsConstruct,
    promptFile: verifyReport.promptFile,
    promptSha256: verifyReport.promptSha256,
    caseTextSha256: verifyReport.caseTextSha256,
    verdict: verifyReport.verdict,
    blockingCount: verifyReport.blockingCount,
    claimsTotal: verifyReport.meta.claimsTotal,
    unresolvedCritical: verifyReport.meta.unresolvedCritical,
    openQuestions: verifyReport.meta.openQuestions,
    sourcesConsulted: verifyReport.meta.sourcesConsulted,
    antiCopyStatus: verifyReport.antiCopy.status,
    reportPath: `provenance/verify/${caseId}.json`,
  };

  const provenance: ProvenanceRecord = {
    caseId,
    schemaVersion: "2.0",
    createdAt: new Date().toISOString(),
    generator: {
      script: "scripts/generate-case-v2.ts",
      scriptGitSha: gitSha(),
      model: constructResult.model,
      apiTier: "commercial",
      promptFactsheet: { file: factsheet.promptFile, sha256: factsheet.promptSha256 },
      promptConstruct: { file: constructResult.promptFile, sha256: constructResult.promptSha256 },
      seeds: { patient: seeds.patient, labs: seeds.labs, diagnosisOrder: seeds.diagnosisOrder },
    },
    topic: {
      diagnosis: topic.diagnosis,
      difficulty: topic.difficulty,
      category: topic.category,
      selectedBy: topic.selectedBy,
      rationale: topic.rationale,
    },
    sources: factsheet.sources,
    modelKnowledge: factsheet.modelKnowledgeClaims,
    componentAttribution: STANDARD_COMPONENT_ATTRIBUTION,
    verify: verifySummary,
    detection,
    canary: canaryRecord,
    review: { status: "pending", reviewedBy: "", editorialResponsibility: false, edits: [] },
    riskClass: computeRiskClass(verifyReport, detection),
    release: { approved: false },
  };

  const warnings = collectReleaseWarnings(provenance);
  if (warnings.length > 0) {
    console.log("Hinweise für das menschliche Review:");
    for (const w of warnings) console.log(`  ! ${w}`);
  }

  // Schreiben — immer, unabhängig vom Urteil. Der Mensch (Stufe 5) braucht auch die
  // beanstandeten Fälle, um sie zu korrigieren; nur assertReleasable() (an anderer Stelle,
  // beim eigentlichen Freigabe-Schritt) verhindert die Veröffentlichung.
  const provenanceDir = join(PROJECT_ROOT, "provenance");
  const verifyDir = join(provenanceDir, "verify");
  // NICHT unter public/ -- Next.js liefert alles dort verbatim an jede URL aus, auch ohne
  // App-Route. Ein Fall in Stufe 5 (menschliche Freigabe) ist per Definition noch nicht
  // freigegeben; er soll vor jedem Web-Zugriff geschuetzt sein, nicht nur vor dem Spiel-UI.
  // Gleiche Korrektur wie 2026-09-16 fuer die v1-Bank (siehe DECISION_LOG.md).
  const stagingDir = join(PROJECT_ROOT, "content", "cases", "v2", "staging");
  ensureDir(provenanceDir);
  ensureDir(verifyDir);
  ensureDir(stagingDir);

  writeFileSync(join(provenanceDir, `${caseId}.json`), JSON.stringify(provenance, null, 2) + "\n", "utf8");
  writeFileSync(join(verifyDir, `${caseId}.json`), JSON.stringify(verifyReport, null, 2) + "\n", "utf8");
  writeFileSync(join(stagingDir, `${caseId}.json`), JSON.stringify(constructedCase, null, 2) + "\n", "utf8");

  console.log(`Geschrieben: provenance/${caseId}.json, provenance/verify/${caseId}.json, ` +
    `content/cases/v2/staging/${caseId}.json — Risikoklasse ${provenance.riskClass}.`);

  return { case: constructedCase, provenance, verifyReport, detection };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv: string[]): {
  topicPath?: string;
  index: number;
  forceCanaryMutation?: string;
  withWebAntiCopy: boolean;
  seedSalt: string;
} {
  let index = 0;
  let forceCanaryMutation: string | undefined;
  let withWebAntiCopy = false;
  let seedSalt = "v1";
  let topicPath: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--index") index = Number(argv[++i]);
    else if (arg === "--force-canary") forceCanaryMutation = argv[++i];
    else if (arg === "--with-web-anticopy") withWebAntiCopy = true;
    else if (arg === "--seed-salt") seedSalt = argv[++i];
    else if (!arg.startsWith("--")) topicPath = arg;
  }
  return { topicPath, index, forceCanaryMutation, withWebAntiCopy, seedSalt };
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const { topicPath, index, forceCanaryMutation, withWebAntiCopy, seedSalt } = parseArgs(argv);
  if (!topicPath) {
    console.error(
      "Nutzung: npx tsx scripts/generate-case-v2.ts <topic.json> [--index N] " +
        "[--with-web-anticopy] [--force-canary <mutationId>] [--seed-salt <string>]"
    );
    process.exit(1);
  }
  const topic = JSON.parse(readFileSync(topicPath, "utf8")) as CaseTopic;
  await runPipelineForTopic(topic, { index, forceCanaryMutation, withWebAntiCopy, seedSalt });
}

// ---------------------------------------------------------------------------
// Selbsttest — reine Logik (Seeds, Risikoklasse), keine API
// ---------------------------------------------------------------------------

function selftest(): void {
  const failures: string[] = [];
  const check = (name: string, condition: boolean, detail = ""): void => {
    console.log(`${condition ? "ok  " : "FAIL"} ${name}${condition ? "" : ` — ${detail}`}`);
    if (!condition) failures.push(name);
  };

  const s1 = deriveSeeds("zoeliakie-1", "v1");
  const s2 = deriveSeeds("zoeliakie-1", "v1");
  check("deriveSeeds: gleiche caseId+salt -> gleiche Seeds", JSON.stringify(s1) === JSON.stringify(s2));
  check(
    "deriveSeeds: patient/labs/diagnosisOrder/canary sind paarweise verschieden",
    new Set([s1.patient, s1.labs, s1.diagnosisOrder, s1.canary]).size === 4
  );
  const s3 = deriveSeeds("zoeliakie-1", "v2");
  check("deriveSeeds: anderes Salt -> andere Seeds", JSON.stringify(s1) !== JSON.stringify(s3));
  const s4 = deriveSeeds("andere-diagnose-1", "v1");
  check("deriveSeeds: andere caseId -> andere Seeds", JSON.stringify(s1) !== JSON.stringify(s4));

  const fixtureVerify = (verdict: "pass" | "revise" | "reject"): VerifyReport =>
    ({ verdict } as unknown as VerifyReport);
  const fixtureDetection = (verdict: "clean" | "flagged"): DetectionResult =>
    ({ verdict } as unknown as DetectionResult);

  check("computeRiskClass: pass+clean -> GRUEN", computeRiskClass(fixtureVerify("pass"), fixtureDetection("clean")) === "GRUEN");
  check("computeRiskClass: revise+clean -> GELB", computeRiskClass(fixtureVerify("revise"), fixtureDetection("clean")) === "GELB");
  check("computeRiskClass: pass+flagged -> GELB", computeRiskClass(fixtureVerify("pass"), fixtureDetection("flagged")) === "GELB");
  check("computeRiskClass: reject+clean -> ROT (schwerste Stufe gewinnt)", computeRiskClass(fixtureVerify("reject"), fixtureDetection("clean")) === "ROT");
  check("computeRiskClass: reject+flagged -> ROT", computeRiskClass(fixtureVerify("reject"), fixtureDetection("flagged")) === "ROT");

  // Ein frisch erzeugter Record darf NIE direkt freigabefähig sein — review/release sind
  // bewusst "pending"/false. Das ist ein Regressionstest gegen genau den Fehler, den dieses
  // Skript strukturell vermeiden soll (versehentliche Auto-Freigabe).
  const fixtureRecord: ProvenanceRecord = {
    caseId: "x",
    schemaVersion: "2.0",
    createdAt: new Date().toISOString(),
    generator: {
      script: "x",
      scriptGitSha: "x",
      model: "x",
      apiTier: "commercial",
      promptFactsheet: { file: "x", sha256: "x" },
      promptConstruct: { file: "x", sha256: "x" },
      seeds: { patient: 1, labs: 2, diagnosisOrder: 3 },
    },
    topic: { diagnosis: "x", difficulty: "klinik", category: "haeufig", selectedBy: "human", rationale: "x" },
    sources: [],
    modelKnowledge: [],
    componentAttribution: STANDARD_COMPONENT_ATTRIBUTION,
    verify: {
      runId: "x", runAt: "x", model: "x", sameModelAsConstruct: false, promptFile: "x", promptSha256: "x",
      caseTextSha256: "x", verdict: "pass", blockingCount: 0, claimsTotal: 1, unresolvedCritical: 0,
      openQuestions: 0, sourcesConsulted: [], antiCopyStatus: "passed", reportPath: "x",
    },
    detection: { runAt: "x", method: "ngram-websearch", ngramSize: 8, fieldsChecked: [], hits: [], verdict: "clean" },
    review: { status: "pending", reviewedBy: "", editorialResponsibility: false, edits: [] },
    riskClass: "GRUEN",
    release: { approved: false },
  };
  let threw = false;
  try {
    assertReleasable(fixtureRecord);
  } catch {
    threw = true;
  }
  check("frisch generierter Record ist NICHT freigabefähig (review/release stehen aus)", threw);

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
