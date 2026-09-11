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
    seeds: { patient: number; labs: number };
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
  detection: DetectionResult;
  review: ReviewRecord;
  riskClass: RiskClass;
  release: { approved: boolean; approvedAt?: string };
}

// Harte Validierung vor jeder Freigabe (Stufe 5→6 Übergang). Wirft, statt still durchzulassen —
// ein Record, der diese Checks nicht besteht, darf nie in provenance/ landen.
export function assertReleasable(record: ProvenanceRecord): void {
  const errors: string[] = [];

  if (record.generator.apiTier !== "commercial") {
    errors.push("generator.apiTier muss 'commercial' sein (Chat-Generierung hat keine Indemnification).");
  }
  if (record.topic.selectedBy !== "human") {
    errors.push("topic.selectedBy muss 'human' sein (Stufe 0 ist Sergios Aufgabe).");
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
