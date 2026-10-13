// scripts/lib/case-types.ts
//
// Der Fall-Typ, wie ihn Stufe 2 (construct.ts) erzeugt und Stufe 3.5 (verify.ts),
// Stufe 4 (detect.ts) und canary.ts weiterverarbeiten. Autoritative Quelle für die
// Feldnamen ist docs/CASE_SCHEMA.md — 17 Pflichtfelder, exakt diese Keys.
//
// Liegt bewusst in einer eigenen Datei, damit verify.ts nicht von construct.ts abhängt
// (und umgekehrt): die Stufen sind getrennte API-Calls, ihr Code soll nicht verkleben.

export type Difficulty = "vorklinik" | "klinik" | "examen";
export type Gender = "male" | "female";
export type LabFlag = "high" | "low" | "normal";
export type CaseCategory = "haeufig" | "cannot-miss";

export interface CaseLabValue {
  name: string;
  value: string; // String, nicht Zahl — siehe CASE_SCHEMA.md
  unit: string;
  reference: string;
  flag: LabFlag;
}

export interface CaseLabCategory {
  category: string;
  values: CaseLabValue[];
}

export interface DifferentialNote {
  option: string;
  whyNot: string;
}

export interface ConstructedCase {
  id: string;
  difficulty: Difficulty;
  patientName: string;
  age: number;
  gender: Gender;
  chiefComplaint: string;
  history: string;
  examination: string;
  labs: CaseLabCategory[];
  imaging: string;
  correctDiagnosis: string;
  diagnosisOptions: string[]; // genau 4, enthält correctDiagnosis
  keyTakeaway: string;
  differentialNotes: DifferentialNote[]; // genau 3
  explanation: string;
  sourceNotes: string;
  caseContext: { category: CaseCategory; note: string };
}

// Die Freitext-Felder, die Stufe 4 (n-Gramm-Detektion) prüfen muss. Labs/Alter/Name sind
// von uns gewürfelt (Stufe 3) und können per Definition nicht übernommen sein.
export const CASE_TEXT_FIELDS = [
  "chiefComplaint",
  "history",
  "examination",
  "imaging",
  "keyTakeaway",
  "explanation",
] as const;

// Serialisiert den Fall zu einem lesbaren, deterministischen Textblock. Wird von verify.ts
// als Modell-Input und als Grundlage für caseTextHash benutzt — deshalb muss die Reihenfolge
// stabil bleiben, sonst ändert sich der Hash ohne inhaltliche Änderung.
export function serializeCaseForReview(c: ConstructedCase): string {
  const labs = c.labs
    .map(
      (cat) =>
        `${cat.category}:\n` +
        cat.values
          .map((v) => `  - ${v.name}: ${v.value} ${v.unit} (Referenz ${v.reference}) [${v.flag}]`)
          .join("\n")
    )
    .join("\n");

  const diffs = c.differentialNotes.map((d) => `  - ${d.option}: ${d.whyNot}`).join("\n");

  return [
    `FALL-ID: ${c.id}`,
    `SCHWIERIGKEIT: ${c.difficulty}`,
    `PATIENT: ${c.patientName}, ${c.age} Jahre, ${c.gender === "male" ? "männlich" : "weiblich"}`,
    ``,
    `LEITBESCHWERDE (Ich-Perspektive):\n${c.chiefComplaint}`,
    ``,
    `ANAMNESE:\n${c.history}`,
    ``,
    `KÖRPERLICHE UNTERSUCHUNG:\n${c.examination}`,
    ``,
    `LABOR:\n${labs || "  (keine)"}`,
    ``,
    `BILDGEBUNG:\n${c.imaging || "  (keine)"}`,
    ``,
    `KORREKTE DIAGNOSE: ${c.correctDiagnosis}`,
    `ANTWORTOPTIONEN: ${c.diagnosisOptions.join(" | ")}`,
    ``,
    `MERKSATZ:\n${c.keyTakeaway}`,
    ``,
    `DIFFERENTIALDIAGNOSTISCHE BEGRÜNDUNGEN:\n${diffs}`,
    ``,
    `HERLEITUNG:\n${c.explanation}`,
    ``,
    `KONTEXT: ${c.caseContext.category} — ${c.caseContext.note}`,
  ].join("\n");
}
