// Provenienz-Record: ein Objekt pro Fall, versioniert in Git unter provenance/<caseId>.json.
// Ersetzt den unstrukturierten sourceNotes-Fließtext der v1-Fallbank.
// Schema laut docs/uebergabe-fallgenerierung-v2.md (Legal-Audit, 2026-09-08), Abschnitt 6.
// JEDES Feld hat einen rechtlichen Zweck — siehe Kommentare. Nichts hier ist Dekoration.

export type SourceType = "guideline" | "textbook" | "registry" | "official-statistic" | "other";

export type License =
  | "cc0"
  | "cc-by"
  | "cc-by-sa"
  | "public-domain"
  | "statutory" // Gesetze/amtliche Werke, § 5 UrhG
  | "unverified" // Faktenentnahme aus geschützter Quelle — kein Lizenzanspruch, nur Fakten übernommen
  | "cc-by-nc" // NIEMALS in generate-case-v2.ts verwenden — kommerzielle Nutzung ausgeschlossen
  | "cc-nd"; // NIEMALS verwenden — keine Bearbeitung erlaubt, widerspricht der Konstruktion

export interface ProvenanceSource {
  id: string; // "s1", "s2", ... — referenziert von componentAttribution/modelKnowledge
  type: SourceType;
  title: string;
  publisher: string;
  identifier?: string; // z.B. AWMF-Registernummer
  url: string;
  retrievedAt: string; // ISO 8601
  license: License;
  licenseNote: string; // Pflichtfeld: WARUM diese Quelle genutzt werden darf (z.B. "nur Faktenentnahme")
  archived?: { method: "pdf" | "screenshot" | "text"; path: string };
  usedFor: string[]; // welche Fallbestandteile (history, labs, ...) diese Quelle gespeist hat
}

export interface ModelKnowledgeClaim {
  claim: string;
  confidence: "high" | "medium" | "low";
  noSourceFound: true; // per Definition: Modellwissen ohne belegte Quelle. Nie stillschweigend als Fakt behandeln.
}

// Stufe 2 arbeitet NUR mit dem Faktenblatt aus Stufe 1 — deshalb ist hier "constructed"
// (aus Fakten neu gebaut) oder "computed" (von unserem Randomizer/Labor-Skript, Stufe 3)
// der einzig zulässige Wert. "copied" oder "paraphrased" dürfen hier NIE stehen — würden
// bedeuten, dass Stufe 2 doch wörtlich/eng an einer Quelle hing.
export type ComponentOrigin = "constructed" | "computed";

export interface ComponentAttribution {
  history: ComponentOrigin;
  examination: ComponentOrigin;
  labs: ComponentOrigin;
  imaging: ComponentOrigin;
  diagnosisOptions: ComponentOrigin;
  explanation: ComponentOrigin;
  differentialNotes: ComponentOrigin;
  keyTakeaway: ComponentOrigin;
}

export interface DetectionResult {
  runAt: string;
  method: "ngram-websearch";
  ngramSize: number; // 8-10 laut Audit-Doc
  fieldsChecked: string[];
  hits: Array<{ field: string; ngram: string; matchedUrl: string }>;
  verdict: "clean" | "flagged" | "rewritten-and-clean";
}

// Stufe 3.5 — medizinische Gegenprüfung (verify.ts). Hier steht die KURZFASSUNG; der
// vollständige Bericht mit allen Einzelbehauptungen liegt unter
// provenance/verify/<caseId>.json. Grund für die Trennung: der Record soll lesbar bleiben,
// der Bericht vollständig — beides in einer Datei geht nicht gut aus.
export interface VerifySummaryRecord {
  runId: string;
  runAt: string;
  model: string;
  // true = Prüf- und Konstruktionsmodell sind identisch. Kein Ausschlussgrund, aber ein
  // dokumentierter Schwachpunkt: gleiche Trainingsdaten, gleiche Blindstellen.
  sameModelAsConstruct: boolean;
  promptFile: string;
  promptSha256: string;
  // Hash des geprüften Fall-Textes. Bindet den Prüflauf an genau diese Fassung — nach jeder
  // Korrekturschleife durch Stufe 2 passt der Hash nicht mehr und die Prüfung muss neu laufen.
  caseTextSha256: string;
  verdict: "pass" | "revise" | "reject";
  blockingCount: number;
  claimsTotal: number;
  unresolvedCritical: number;
  openQuestions: number;
  sourcesConsulted: string[];
  antiCopyStatus: "passed" | "flagged" | "mechanical-only";
  reportPath: string;
}

// Kalibrierung des Prüfschritts (canary.ts). Steht im Record des Fall-Laufs, bei dem der
// Canary mitlief — nicht im Record des Canary-Falls selbst, den gibt es nie.
export interface CanaryRecord {
  runAt: string;
  mutationId: string;
  detected: boolean;
  actualVerdict: "pass" | "revise" | "reject";
  matchedSignals: string[];
}

export interface ReviewRecord {
  status: "pending" | "approved" | "rejected";
  reviewedBy: string; // Klarname, für Art. 50 KI-VO editorial-responsibility-Nachweis
  reviewedAt?: string;
  editorialResponsibility: boolean;
  edits: Array<{ field: string; note: string }>;
}

export type RiskClass = "GRUEN" | "GELB" | "ROT"; // GELB/ROT = manuelle Nacharbeit vor Freigabe nötig

export interface ProvenanceRecord {
  caseId: string;
  schemaVersion: "2.0";
  createdAt: string;

  generator: {
    script: string;
    scriptGitSha: string;
    model: string;
    apiTier: "commercial"; // MUSS "commercial" sein — Chat-generierte Fälle bekommen keinen Record in diesem Schema
    promptFactsheet: { file: string; sha256: string };
    promptConstruct: { file: string; sha256: string };
    // diagnosisOrder ergänzt 2026-09-15 (siehe DECISION_LOG.md): ohne diesen Seed wäre die
    // Mischung der Antwortoptionen (construct.ts: orderDiagnosisOptions()) nicht reproduzierbar
    // dokumentiert — beim Nachvollziehen eines Falls müsste man sonst raten, warum die
    // korrekte Diagnose an Position 3 steht.
    seeds: { patient: number; labs: number; diagnosisOrder: number };
  };

  topic: {
    diagnosis: string;
    difficulty: "vorklinik" | "klinik" | "examen";
    category: "haeufig" | "cannot-miss";
    selectedBy: "human"; // MUSS "human" sein — Stufe 0 ist Sergios Aufgabe, nicht des Modells
    rationale: string;
  };

  sources: ProvenanceSource[];
  modelKnowledge: ModelKnowledgeClaim[];
  componentAttribution: ComponentAttribution;
  verify: VerifySummaryRecord; // Stufe 3.5 — vor der Detektion, vor dem Menschen
  detection: DetectionResult;
  canary?: CanaryRecord; // nur bei jedem CANARY_RATE-ten Lauf gesetzt
  review: ReviewRecord;
  riskClass: RiskClass;
  release: { approved: boolean; approvedAt?: string };
}

// Harte Validierung vor jeder Freigabe (Stufe 5→6 Übergang). Wirft, statt still durchzulassen —
// ein Record, der diese Checks nicht besteht, darf nie in provenance/ landen.
export function assertReleasable(
  record: ProvenanceRecord,
  opts?: { caseTextSha256?: string }
): void {
  const errors: string[] = [];

  if (record.generator.apiTier !== "commercial") {
    errors.push("generator.apiTier muss 'commercial' sein (Chat-Generierung hat keine Indemnification).");
  }
  if (record.topic.selectedBy !== "human") {
    errors.push("topic.selectedBy muss 'human' sein (Stufe 0 ist Sergios Aufgabe).");
  }
  // Stufe 3.5 — drei getrennte Gründe, deshalb drei getrennte Meldungen.
  if (!record.verify) {
    errors.push("verify fehlt — Stufe 3.5 (medizinische Gegenprüfung) ist nicht gelaufen.");
  } else {
    if (record.verify.verdict !== "pass") {
      errors.push(`verify.verdict ist '${record.verify.verdict}' — nur 'pass' ist freigabefähig.`);
    }
    if (record.verify.blockingCount > 0) {
      errors.push(`verify.blockingCount ist ${record.verify.blockingCount} — blockierende Befunde offen.`);
    }
    if (record.verify.antiCopyStatus === "flagged") {
      errors.push("verify.antiCopyStatus ist 'flagged' — der Prüflauf selbst enthält Übernahme-Indikatoren.");
    }
    // Der Prüflauf muss zu DIESER Fassung gehören. Ohne diese Bindung könnte ein Fall nach
    // einer Korrekturschleife mit dem Freigabe-Stempel seiner alten Fassung durchgehen.
    if (opts?.caseTextSha256 && record.verify.caseTextSha256 !== opts.caseTextSha256) {
      errors.push(
        "verify.caseTextSha256 passt nicht zum aktuellen Fall-Text — der Fall wurde nach der " +
          "Prüfung geändert. Stufe 3.5 und Stufe 4 müssen erneut laufen."
      );
    }
  }

  if (record.detection.verdict === "flagged") {
    errors.push("detection.verdict ist 'flagged' — muss vor Freigabe zu 'clean' oder 'rewritten-and-clean' werden.");
  }
  const badLicense = record.sources.find((s) => s.license === "cc-by-nc" || s.license === "cc-nd");
  if (badLicense) {
    errors.push(`Quelle '${badLicense.id}' hat gesperrte Lizenz '${badLicense.license}' (NC/ND unzulässig).`);
  }
  if (record.review.status !== "approved" || !record.review.editorialResponsibility) {
    errors.push("review.status muss 'approved' sein mit editorialResponsibility=true.");
  }
  if (!record.release.approved) {
    errors.push("release.approved ist false.");
  }

  if (errors.length > 0) {
    throw new Error(`Provenance-Record für '${record.caseId}' nicht freigabefähig:\n- ${errors.join("\n- ")}`);
  }
}

// Nicht-blockierende Auffälligkeiten. Bewusst getrennt von assertReleasable(): das hier
// verhindert keine Freigabe, sondern lenkt die Aufmerksamkeit des Menschen in Stufe 5 auf
// die Stellen, an denen der Automat schwach ist. Eine Freigabe-Maske, die nur grüne Haken
// zeigt, trainiert das Durchwinken an.
export function collectReleaseWarnings(record: ProvenanceRecord): string[] {
  const warnings: string[] = [];
  if (record.verify?.sameModelAsConstruct) {
    warnings.push(
      `Prüf- und Konstruktionsmodell identisch (${record.verify.model}) — korrelierte Fehler ` +
        `möglich, dieser Fall verdient beim menschlichen Review mehr Zeit.`
    );
  }
  if (record.verify?.antiCopyStatus === "mechanical-only") {
    warnings.push(
      "Anti-Copy-Prüfung der Notizen lief nur mechanisch (kein Web-Abgleich) — " +
        "aktiviert sich mit detect.ts (Stufe 4)."
    );
  }
  if (record.verify && record.verify.openQuestions > 0) {
    warnings.push(
      `${record.verify.openQuestions} Punkt(e) waren in Stufe 1 belegt, wurden in Stufe 3.5 ` +
        `aber nicht wiedergefunden.`
    );
  }
  if (record.canary && !record.canary.detected) {
    warnings.push(
      `Canary '${record.canary.mutationId}' wurde NICHT erkannt (Urteil: ${record.canary.actualVerdict}) — ` +
        `die Prüfstufe hat in diesem Lauf einen bekannten Fehler übersehen.`
    );
  }
  if (record.modelKnowledge.length > 0) {
    warnings.push(`${record.modelKnowledge.length} Fakt(en) stammen aus Modellwissen ohne Quelle.`);
  }
  return warnings;
}
