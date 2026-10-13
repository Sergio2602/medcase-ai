// scripts/lib/canary.ts
//
// Kalibrierung für Stufe 3.5 (verify.ts): absichtlich fehlerhafte Fälle, deren Fehler wir
// kennen, durch denselben Prüfschritt schicken und messen, ob er sie findet.
//
// Warum das nicht optional ist: ein Prüfschritt, der immer "pass" schreibt, ist von einem
// funktionierenden nicht zu unterscheiden — solange man ihm nur korrekte Fälle vorlegt.
// Ohne Kalibrierung weiß niemand, ob verify.ts prüft oder nur zustimmt. Und ein Mensch, der
// in Stufe 5 hundertmal "pass" gelesen hat, liest beim hunderteinten nicht mehr richtig.
// Das ist keine Unterstellung, sondern der Normalfall bei Kontrollen mit geringer Trefferrate.
//
// Verfahren: 1 Canary je 20 erzeugter Fälle (CANARY_RATE). Der Canary-Fall wird NIE
// veröffentlicht — er existiert nur, um die Erkennungsrate in den Provenienz-Record zu
// schreiben. Die Mutationen sind deterministisch und rein mechanisch, kein Modell beteiligt.
//
// Nutzung (CLI, Selbsttest ohne API):
//   npx tsx scripts/lib/canary.ts --selftest

import { fileURLToPath } from "node:url";
import type { ConstructedCase } from "./case-types.js";
import type { VerifyReport, ClaimCategory, OmissionType, ConsistencyCheckKey } from "./verify.js";

export const CANARY_RATE = 20; // 1 Canary je 20 Fälle

export function shouldInjectCanary(caseIndex: number, rate: number = CANARY_RATE): boolean {
  return caseIndex > 0 && caseIndex % rate === 0;
}

// ---------------------------------------------------------------------------
// Erwartung: WORAN erkennen wir, dass der Prüfschritt den eingebauten Fehler gefunden hat?
// Bewusst großzügig formuliert (mehrere zulässige Signale) — wir messen, ob der Fehler
// auffällt, nicht ob er exakt so benannt wird wie wir ihn eingebaut haben.
// ---------------------------------------------------------------------------

export interface CanaryExpectation {
  mutationId: string;
  description: string;
  expectedVerdict: Array<"revise" | "reject">;
  claimCategories?: ClaimCategory[];
  omissionTypes?: OmissionType[];
  consistencyChecks?: ConsistencyCheckKey[];
}

export interface CanaryMutation {
  id: string;
  description: string;
  severity: "blocking" | "major";
  applicable: (c: ConstructedCase) => boolean;
  apply: (c: ConstructedCase) => { mutated: ConstructedCase; expectation: CanaryExpectation };
}

function clone(c: ConstructedCase): ConstructedCase {
  return JSON.parse(JSON.stringify(c)) as ConstructedCase;
}

function firstPathologicalLab(c: ConstructedCase): { catIndex: number; valIndex: number } | null {
  for (let i = 0; i < c.labs.length; i++) {
    for (let j = 0; j < c.labs[i].values.length; j++) {
      if (c.labs[i].values[j].flag !== "normal") return { catIndex: i, valIndex: j };
    }
  }
  return null;
}

function parseGermanNumber(value: string): number | null {
  const n = Number(value.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function formatGermanNumber(n: number, like: string): string {
  const decimals = like.includes(",") ? like.split(",")[1].length : 0;
  return n.toFixed(decimals).replace(".", ",");
}

// ---------------------------------------------------------------------------
// Der Mutationskatalog
// ---------------------------------------------------------------------------

export const CANARY_MUTATIONS: CanaryMutation[] = [
  {
    id: "lab-value-x20",
    description: "Ein pathologischer Laborwert wird um den Faktor 20 überhöht.",
    severity: "major",
    applicable: (c) => firstPathologicalLab(c) !== null,
    apply: (c) => {
      const mutated = clone(c);
      const pos = firstPathologicalLab(mutated)!;
      const target = mutated.labs[pos.catIndex].values[pos.valIndex];
      const numeric = parseGermanNumber(target.value);
      target.value = numeric === null ? "9999" : formatGermanNumber(numeric * 20, target.value);
      return {
        mutated,
        expectation: {
          mutationId: "lab-value-x20",
          description: `${target.name} auf einen biologisch unplausiblen Wert gesetzt.`,
          expectedVerdict: ["revise", "reject"],
          claimCategories: ["labor"],
          consistencyChecks: ["laborwerte_plausibel", "laborkonstellation_traegt_diagnose"],
        },
      };
    },
  },
  {
    id: "lab-flag-normalized",
    description: "Der diagnostisch entscheidende Laborwert wird in den Normbereich gesetzt.",
    severity: "blocking",
    applicable: (c) => firstPathologicalLab(c) !== null,
    apply: (c) => {
      const mutated = clone(c);
      const pos = firstPathologicalLab(mutated)!;
      const target = mutated.labs[pos.catIndex].values[pos.valIndex];
      const range = target.reference.match(/([\d.,]+)\s*[–-]\s*([\d.,]+)/);
      const low = range ? parseGermanNumber(range[1]) : null;
      const high = range ? parseGermanNumber(range[2]) : null;
      target.value = low !== null && high !== null ? formatGermanNumber((low + high) / 2, target.value) : target.value;
      target.flag = "normal";
      return {
        mutated,
        expectation: {
          mutationId: "lab-flag-normalized",
          description: `${target.name} normwertig — die Konstellation trägt die Diagnose nicht mehr.`,
          expectedVerdict: ["reject", "revise"],
          claimCategories: ["labor", "diagnosekriterium"],
          omissionTypes: ["loesbarkeitsluecke", "fehlender_befund"],
          consistencyChecks: ["laborkonstellation_traegt_diagnose"],
        },
      };
    },
  },
  {
    id: "diagnosis-swapped",
    description: "Als korrekte Diagnose wird ein Differentialdiagnose-Distraktor eingetragen.",
    severity: "blocking",
    applicable: (c) => c.diagnosisOptions.some((o) => o !== c.correctDiagnosis),
    apply: (c) => {
      const mutated = clone(c);
      const distractor = mutated.diagnosisOptions.find((o) => o !== mutated.correctDiagnosis)!;
      mutated.correctDiagnosis = distractor;
      return {
        mutated,
        expectation: {
          mutationId: "diagnosis-swapped",
          description: `Lösung auf "${distractor}" gesetzt, Befunde unverändert.`,
          expectedVerdict: ["reject", "revise"],
          claimCategories: ["diagnosekriterium", "labor", "verlauf"],
          omissionTypes: ["loesbarkeitsluecke"],
          consistencyChecks: ["laborkonstellation_traegt_diagnose", "antwortoptionen_echte_differentiale"],
        },
      };
    },
  },
  {
    id: "dose-x10",
    description: "Eine Medikamentendosis im Erklärungstext wird verzehnfacht.",
    severity: "blocking",
    applicable: (c) => /\d+(?:[.,]\d+)?\s*(?:mg|µg|mcg|g|I\.?E\.?)\b/i.test(c.explanation),
    apply: (c) => {
      const mutated = clone(c);
      let replaced = "";
      mutated.explanation = mutated.explanation.replace(
        /(\d+(?:[.,]\d+)?)(\s*)(mg|µg|mcg|g|I\.?E\.?)\b/i,
        (_m, num: string, space: string, unit: string) => {
          const numeric = parseGermanNumber(num);
          const next = numeric === null ? num : formatGermanNumber(numeric * 10, num);
          replaced = `${num} ${unit} -> ${next} ${unit}`;
          return `${next}${space}${unit}`;
        }
      );
      return {
        mutated,
        expectation: {
          mutationId: "dose-x10",
          description: `Dosisangabe verzehnfacht (${replaced}).`,
          expectedVerdict: ["reject"],
          claimCategories: ["therapie"],
        },
      };
    },
  },
  {
    id: "diagnosis-leak",
    description: "Die Lösung wird wörtlich in die Anamnese eingebaut.",
    severity: "blocking",
    applicable: (c) => c.correctDiagnosis.length > 0 && !c.history.includes(c.correctDiagnosis),
    apply: (c) => {
      const mutated = clone(c);
      mutated.history = `${mutated.history}\nDer einweisende Arzt vermutet eine ${mutated.correctDiagnosis}.`;
      return {
        mutated,
        expectation: {
          mutationId: "diagnosis-leak",
          description: "Diagnose steht im Aufgabenteil.",
          expectedVerdict: ["reject"],
          consistencyChecks: ["kein_diagnose_leak"],
        },
      };
    },
  },
  {
    id: "imaging-removed",
    description: "Der Bildgebungsbefund wird entfernt, obwohl die Herleitung ihn braucht.",
    severity: "major",
    applicable: (c) => c.imaging.trim().length > 0,
    apply: (c) => {
      const mutated = clone(c);
      mutated.imaging = "";
      return {
        mutated,
        expectation: {
          mutationId: "imaging-removed",
          description: "Bildgebung fehlt, Herleitung bezieht sich weiter darauf.",
          expectedVerdict: ["revise", "reject"],
          claimCategories: ["bildgebung"],
          omissionTypes: ["fehlender_befund", "loesbarkeitsluecke"],
        },
      };
    },
  },
];

// Deterministische Auswahl: gleicher Fall + gleicher Seed = gleiche Mutation.
export function pickMutation(caseData: ConstructedCase, seed: number): CanaryMutation | null {
  const applicable = CANARY_MUTATIONS.filter((m) => m.applicable(caseData));
  if (applicable.length === 0) return null;
  return applicable[seed % applicable.length];
}

export function injectCanary(
  caseData: ConstructedCase,
  seed: number
): { mutated: ConstructedCase; expectation: CanaryExpectation } | null {
  const mutation = pickMutation(caseData, seed);
  if (!mutation) return null;
  const result = mutation.apply(caseData);
  // Canary-Fälle bekommen eine eigene ID, damit sie nie versehentlich in content/cases/ landen.
  result.mutated.id = `canary-${mutation.id}-${caseData.id}`;
  return result;
}

// ---------------------------------------------------------------------------
// Auswertung
// ---------------------------------------------------------------------------

export interface CanaryScore {
  mutationId: string;
  detected: boolean;
  verdictMatched: boolean;
  matchedSignals: string[];
  actualVerdict: VerifyReport["verdict"];
}

export function scoreCanary(expectation: CanaryExpectation, report: VerifyReport): CanaryScore {
  const matchedSignals: string[] = [];

  for (const claim of report.claims) {
    if (claim.status !== "abweichend" && claim.status !== "unbelegt") continue;
    if (expectation.claimCategories?.includes(claim.category)) {
      matchedSignals.push(`claim:${claim.id}:${claim.category}`);
    }
  }
  for (const omission of report.omissions) {
    if (expectation.omissionTypes?.includes(omission.type)) {
      matchedSignals.push(`omission:${omission.type}`);
    }
  }
  for (const check of report.internalConsistency) {
    if (!check.passed && expectation.consistencyChecks?.includes(check.check)) {
      matchedSignals.push(`consistency:${check.check}`);
    }
  }

  const verdictMatched = expectation.expectedVerdict.includes(report.verdict as "revise" | "reject");

  return {
    mutationId: expectation.mutationId,
    // Erkannt heißt: das Urteil ist nicht "pass" UND es gibt mindestens ein Signal, das zum
    // eingebauten Fehler passt. Ein "revise" aus einem völlig anderen Grund zählt nicht —
    // sonst misst man Zufallstreffer als Erkennungsleistung.
    detected: verdictMatched && matchedSignals.length > 0,
    verdictMatched,
    matchedSignals,
    actualVerdict: report.verdict,
  };
}

export function detectionRate(scores: CanaryScore[]): number {
  if (scores.length === 0) return 0;
  return scores.filter((s) => s.detected).length / scores.length;
}

// ---------------------------------------------------------------------------
// CLI — Selbsttest der Mutationen, ohne API
// ---------------------------------------------------------------------------

const FIXTURE: ConstructedCase = {
  id: "zoeliakie-1",
  difficulty: "klinik",
  patientName: "Sabine",
  age: 34,
  gender: "female",
  chiefComplaint: "Mir ist ständig schlecht und ich habe abgenommen.",
  history: "34-jährige Patientin mit seit Monaten bestehenden Durchfällen und Gewichtsverlust.",
  examination: "AZ reduziert, Abdomen weich, kein Druckschmerz.",
  labs: [
    {
      category: "Serologie",
      values: [{ name: "Anti-tTG-IgA", value: "120,0", unit: "U/ml", reference: "0,0–7,0", flag: "high" }],
    },
    {
      category: "Hämatologie",
      values: [{ name: "Hämoglobin", value: "10,2", unit: "g/dl", reference: "12,0–15,5", flag: "low" }],
    },
  ],
  imaging: "Sonographie Abdomen: unauffällig.",
  correctDiagnosis: "Zöliakie",
  diagnosisOptions: ["Zöliakie", "Reizdarmsyndrom", "Morbus Crohn", "Laktoseintoleranz"],
  keyTakeaway: "Chronische Diarrhoe plus Eisenmangelanämie plus positive Serologie = Zöliakie.",
  differentialNotes: [
    { option: "Reizdarmsyndrom", whyNot: "Gewichtsverlust und Anämie passen nicht." },
    { option: "Morbus Crohn", whyNot: "Keine Entzündungszeichen." },
    { option: "Laktoseintoleranz", whyNot: "Keine Besserung unter Karenz." },
  ],
  explanation: "Bei gesicherter Diagnose erfolgt keine medikamentöse Therapie; Eisensubstitution mit 100 mg pro Tag.",
  sourceNotes: "DGVS-Leitlinie.",
  caseContext: { category: "haeufig", note: "Häufige, oft spät erkannte Diagnose." },
};

function selftest(): void {
  const failures: string[] = [];
  const check = (name: string, condition: boolean, detail = ""): void => {
    console.log(`${condition ? "ok  " : "FAIL"} ${name}${condition ? "" : ` — ${detail}`}`);
    if (!condition) failures.push(name);
  };

  for (const mutation of CANARY_MUTATIONS) {
    check(`${mutation.id}: anwendbar auf Fixture`, mutation.applicable(FIXTURE));
    if (!mutation.applicable(FIXTURE)) continue;
    const { mutated } = mutation.apply(FIXTURE);
    check(
      `${mutation.id}: verändert den Fall wirklich`,
      JSON.stringify(mutated) !== JSON.stringify(FIXTURE),
      "Mutation war wirkungslos"
    );
    check(`${mutation.id}: Original unverändert`, FIXTURE.correctDiagnosis === "Zöliakie" && FIXTURE.imaging.length > 0);
  }

  const leak = CANARY_MUTATIONS.find((m) => m.id === "diagnosis-leak")!.apply(FIXTURE);
  check("diagnosis-leak: Diagnose steht in der Anamnese", leak.mutated.history.includes("Zöliakie"));

  const dose = CANARY_MUTATIONS.find((m) => m.id === "dose-x10")!.apply(FIXTURE);
  check("dose-x10: 100 mg -> 1000 mg", dose.mutated.explanation.includes("1000 mg"), dose.mutated.explanation);

  const flag = CANARY_MUTATIONS.find((m) => m.id === "lab-flag-normalized")!.apply(FIXTURE);
  check("lab-flag-normalized: Flag ist normal", flag.mutated.labs[0].values[0].flag === "normal");
  check("lab-flag-normalized: Wert im Normbereich", flag.mutated.labs[0].values[0].value === "3,5", flag.mutated.labs[0].values[0].value);

  const injected = injectCanary(FIXTURE, 3);
  check("injectCanary: eigene ID", injected !== null && injected.mutated.id.startsWith("canary-"));
  check("injectCanary: deterministisch", JSON.stringify(injectCanary(FIXTURE, 3)) === JSON.stringify(injectCanary(FIXTURE, 3)));

  check("shouldInjectCanary: bei 20 ja, bei 19 nein", shouldInjectCanary(20) && !shouldInjectCanary(19) && !shouldInjectCanary(0));

  // Scoring: ein "revise" aus fremdem Grund darf nicht als Treffer zählen.
  const baseReport = {
    verdict: "revise",
    claims: [{ id: "c-1", category: "anamnese", status: "abweichend" }],
    omissions: [],
    internalConsistency: [],
  } as unknown as VerifyReport;
  const scoreWrong = scoreCanary(
    { mutationId: "dose-x10", description: "", expectedVerdict: ["reject"], claimCategories: ["therapie"] },
    baseReport
  );
  check("scoreCanary: fremder Befund zählt nicht als Erkennung", !scoreWrong.detected);

  const hitReport = {
    verdict: "reject",
    claims: [{ id: "c-9", category: "therapie", status: "abweichend" }],
    omissions: [],
    internalConsistency: [],
  } as unknown as VerifyReport;
  const scoreRight = scoreCanary(
    { mutationId: "dose-x10", description: "", expectedVerdict: ["reject"], claimCategories: ["therapie"] },
    hitReport
  );
  check("scoreCanary: passender Befund zählt", scoreRight.detected);
  check("detectionRate", detectionRate([scoreRight, scoreWrong]) === 0.5);

  console.log(`\n${failures.length === 0 ? "Alle Selbsttests bestanden." : `${failures.length} Selbsttest(s) fehlgeschlagen.`}`);
  if (failures.length > 0) process.exit(1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes("--selftest")) selftest();
  else {
    console.error("Nutzung: npx tsx scripts/lib/canary.ts --selftest");
    process.exit(1);
  }
}
