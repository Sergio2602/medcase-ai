import { promises as fs } from "fs";
import path from "path";

// Gemeinsame Case-Bank-Logik für die drei /api/case/*-Routen (start/reveal/
// verify). Zentralisiert seit dem Payload-Fix vom 21.09.2026 (siehe
// DECISION_LOG.md): der Server liefert nie mehr das komplette Fallobjekt in
// einer Response — nur die jeweils angeforderte, freigeschaltete Teilmenge.
//
// Update 01.10.2026 (siehe DECISION_LOG.md): unterstützt jetzt zusätzlich das
// v3-Fallschema (docs/CASE_SCHEMA_V3.md) — bilingual, 7 Befund-Kategorien
// (statt 3), Oberarzt-Joker, niveau/cannotMiss als eigene Achsen. Erkennung
// pro Fall über das Feld `niveau` (nur v3-Fälle haben es). Alte Fälle
// (`content/cases/{innere,pj,vorklinik}.json`, CASE_SCHEMA.md v1) rendern
// unverändert weiter über den bisherigen Pfad — bewusst zwei Code-Pfade statt
// Migration, bis die 70 Altfälle laut ROADMAP.md Punkt 13 gelöscht werden.
// Sprache: v3-Fälle sind bilingual (de/en) gespeichert, die UI rendert aktuell
// nur Deutsch — `.en` liegt für eine spätere Sprachumschaltung bereit, wird
// hier aber (noch) nicht ausgeliefert.

import { scoreCase, type BilanzRow } from "./scoring";

export type Difficulty = "vorklinik" | "klinik" | "examen";
export type Discipline =
  | "zufaellig"
  | "innere"
  | "kardiologie"
  | "chirurgie"
  | "allgemeinmedizin"
  | "neurologie"
  | "hno"
  | "augenheilkunde"
  | "anaesthesiologie";

export type Flag = "high" | "low" | "normal";
export type LabValue = { name: string; value: string; unit: string; reference: string; flag: Flag };
export type LabCategory = { category: string; values: LabValue[] };
// "cannot-miss" bleibt als Legacy-Wert gültig (alte 70 Fälle) — neue v3-Fälle
// nutzen "haeufig"/"selten" + das eigene `cannotMiss`-Flag (siehe CaseContext unten).
export type CaseContext = { category: "haeufig" | "selten" | "cannot-miss"; note: string };
export type DifferentialNote = { option: string; whyNot: string };
export type AnamneseSection = { label: string; text: string };
export type Niveau = "einfach" | "erfahren" | "experte";

// 7 inhaltliche Befund-Kategorien (v3) + "oberarzt" als Joker, kein echter
// Befund, aber über denselben Reveal-Mechanismus angefordert (gleiche
// serverseitige Vertrauensbasis wie die bestehenden Kategorien: der Server
// liefert, was angefragt wird, UI/Client steuert die Spielregeln). Die alten
// 3 Schlüssel (examination/imaging/labs) bleiben unverändert benannt, um die
// bestehende Fallbank nicht brechen zu müssen.
export type FindingKey =
  | "examination" // v3: "Untersuchung" (inkl. aller Unterpunkte)
  | "auskultation"
  | "labs"
  | "ekg"
  | "eeg"
  | "imaging"
  | "konsil"
  | "oberarzt";

// ---- v3-spezifische Rohtypen (bilingual) -----------------------------------

type Bilingual = { de: string; en: string };
type Relevance = "tragend" | "stuetzend" | "abgrenzend" | "meist_irrelevant";
type V3TextBlock = { text: Bilingual; relevance?: Relevance };
type V3Finding = { label: Bilingual; text: Bilingual; relevance?: Relevance };
type V3LabValue = { name: Bilingual; value: string; reference: string };
type V3LabCategory = { category: Bilingual; relevance?: Relevance; values: V3LabValue[] };
type VorerkrankungCategory = "vorerkrankung" | "allergie" | "alkohol_drogen";
type V3Vorerkrankung = { text: Bilingual; relevance?: Relevance; category?: VorerkrankungCategory };

// ---- Sichtbare Payloads -----------------------------------------------------

// Immer sichtbar, ab /api/case/start — vor jedem Punkteeinsatz.
export type PublicCaseView = {
  id: string;
  difficulty: Difficulty;
  patientName: string;
  age: number;
  gender: "male" | "female";
  chiefComplaint: string;
  history: string;
  diagnosisOptions: string[];
  imagingAvailable: boolean;
  // Update 01.10.2026 — v3: Verfügbarkeit der 4 zusätzlichen Kategorien +
  // Oberarzt-Joker. Bei Altfällen immer false (Kategorie existiert dort nicht).
  auskultationAvailable: boolean;
  ekgAvailable: boolean;
  eegAvailable: boolean;
  konsilAvailable: boolean;
  oberarztAvailable: boolean;
  // Update 01.10.2026 — v3, laut Sichtbarkeits-Tabelle (CASE_SCHEMA_V3.md)
  // beide IMMER sichtbar (keine Diagnose-Leak-Gefahr, nur Schwierigkeits-
  // Einordnung). Bei Altfällen undefined.
  niveau?: Niveau;
  cannotMiss?: boolean;
  occupation?: string;
  family?: string;
  preExisting?: string;
  // Update 06.10.2026: v3-Fälle taggen jeden Vorerkrankungen-Eintrag mit einer
  // `category` (siehe CASE_SCHEMA_V3.md) — Allergien und Alkohol/Drogen laufen
  // seither als eigene Anzeigefelder statt in `preExisting` verklappt zu werden.
  // Bei Altfällen und bei v3-Fällen ohne category-Tag bleiben sie undefined.
  allergies?: string;
  substanceHistory?: string;
  medications?: string;
  anamnese?: AnamneseSection[];
};

export type RevealPayload = {
  examination?: string;
  auskultation?: string;
  labs?: LabCategory[];
  ekg?: string;
  eeg?: string;
  imaging?: string;
  konsil?: string;
  oberarzt?: string;
};

export type VerifyPayload = {
  correct: boolean;
  correctDiagnosis: string;
  explanation: string;
  keyTakeaway?: string;
  differentialNotes?: DifferentialNote[];
  caseContext?: CaseContext;
  // Update 07.10.2026 (Sergio): reine Präsenz-Info, ob für diesen Fall
  // dokumentierte Quellen existieren (raw.sources[]) — NIE der Inhalt selbst,
  // der bleibt serverseitig (siehe Sichtbarkeits-Tabelle CASE_SCHEMA_V3.md).
  // Steuert nur, ob der Client einen "Quellen anfragen"-Button zeigt.
  sourcesAvailable: boolean;
  // Spielwiese 09.10.2026: serverseitig berechnete Punkte + Diagnostik-Bilanz
  // (relevance erst nach Abgabe, siehe lib/scoring.ts).
  score: number;
  scoringModel: "relevanz" | "pauschal";
  bilanz?: BilanzRow[];
  jokerDelta: number;
};

// ---- CORS / Rate-Limit (aus der alten generate-case/route.ts übernommen) ----

const ALLOWED_ORIGINS = new Set([
  "https://medcase-ai-peach.vercel.app",
  "http://localhost:3000",
]);

export function corsHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    Vary: "Origin",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

const RATE_LIMIT_MAX = 60;
const RATE_LIMIT_WINDOW_MS = 60_000;
const rateLimitStore = new Map<string, { count: number; windowStart: number }>();

export function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitStore.get(ip);
  if (!entry || now - entry.windowStart >= RATE_LIMIT_WINDOW_MS) {
    rateLimitStore.set(ip, { count: 1, windowStart: now });
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_LIMIT_MAX;
}

export function clientIp(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  return forwardedFor?.split(",")[0]?.trim() || "unknown";
}

export const GENERIC_ERROR =
  "Der klinische Fall konnte nicht generiert werden. Bitte versuche es später erneut.";

// ---- Case-Bank laden -----------------------------------------------------

const CASE_FILES: Record<Difficulty, string> = {
  vorklinik: "vorklinik.json",
  klinik: "innere.json",
  examen: "pj.json",
};

// "Reviewed"-Bank pro Difficulty — quellengeprüfte Fälle, manuell ergänzt.
// Ersetzt (per id) einen Fall der Basisbank oder erweitert sie.
const REVIEWED_CASE_FILES: Partial<Record<Difficulty, string>> = {
  klinik: "innere-reviewed.json",
  vorklinik: "vorklinik-reviewed.json",
};

// Zusätzliche Disziplin-Bänke (neue v3-Fälle) — rein additiv, sobald sie
// existieren. Fehlt die Datei, wird sie kommentarlos übersprungen (kein
// Fehler). Ablagepfad folgt docs/CASE_SCHEMA_V3.md: content/cases/klinik/<disziplin>.json.
// Update 01.10.2026: "innere" ergänzt (Lücke aus DECISION_LOG.md 21.09./22.09. —
// war nie eingetragen, obwohl der Ordner-Kommentar sie schon immer vorsah).
const DISCIPLINE_FILES: Partial<Record<Discipline, string>> = {
  innere: "klinik/innere.json",
  allgemeinmedizin: "klinik/allgemeinmedizin.json",
  kardiologie: "klinik/kardiologie.json",
  chirurgie: "klinik/chirurgie.json",
  neurologie: "klinik/neurologie.json",
  hno: "klinik/hno.json",
  augenheilkunde: "klinik/augenheilkunde.json",
  anaesthesiologie: "klinik/anaesthesiologie.json",
};

type RawCase = Record<string, unknown>;

const caseBankCache = new Map<Difficulty, RawCase[]>();

async function readCaseFile(fileName: string): Promise<RawCase[]> {
  try {
    const filePath = path.join(process.cwd(), "content", "cases", fileName);
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as RawCase[]) : [];
  } catch {
    // Fehlende/kaputte Datei -> "keine Fälle aus dieser Datei", kein Crash.
    return [];
  }
}

async function loadCaseBank(difficulty: Difficulty): Promise<RawCase[]> {
  const cacheEnabled = process.env.NODE_ENV === "production";
  const cached = cacheEnabled ? caseBankCache.get(difficulty) : undefined;
  if (cached) return cached;

  const base = await readCaseFile(CASE_FILES[difficulty]);
  const reviewedFile = REVIEWED_CASE_FILES[difficulty];
  const reviewed = reviewedFile ? await readCaseFile(reviewedFile) : [];

  let cases: RawCase[];
  if (reviewed.length > 0) {
    const byId = new Map(base.map((c) => [c.id as string, c]));
    for (const c of reviewed) byId.set(c.id as string, c);
    cases = Array.from(byId.values());
  } else {
    cases = base;
  }

  if (difficulty === "klinik") {
    for (const disciplineFile of Object.values(DISCIPLINE_FILES)) {
      const extra = await readCaseFile(disciplineFile);
      if (extra.length === 0) continue;
      const byId = new Map(cases.map((c) => [c.id as string, c]));
      for (const c of extra) byId.set(c.id as string, c);
      cases = Array.from(byId.values());
    }
  }

  if (cacheEnabled && cases.length > 0) caseBankCache.set(difficulty, cases);
  return cases;
}

// Filtert nach Disziplin. Solange die 70 alten Fälle kein `discipline`-Feld
// tragen, gelten sie als "innere" (ihr faktischer Ursprungsordner) — echte
// Trennung (z.B. Allgemeinmedizin) greift erst, sobald eigene, getaggte
// Fälle existieren. Bewusster Kompromiss (Chat 21.09.2026): eine
// freigeschaltete, aber noch datenlose Disziplin fällt auf den vollen Pool
// zurück statt eine leere Bank/Fehler zu zeigen.
function filterByDiscipline(cases: RawCase[], discipline: Discipline | undefined): RawCase[] {
  if (!discipline || discipline === "zufaellig") return cases;
  const filtered = cases.filter(
    (c) => (typeof c.discipline === "string" ? c.discipline : "innere") === discipline
  );
  return filtered.length > 0 ? filtered : cases;
}

// Local-Test 1 (13.10.2026): Fallzahl je Disziplin für die Startseite.
// Gleiche Zuordnung wie filterByDiscipline (ohne Tag = "innere"),
// aber OHNE den Rückfall auf den vollen Pool — hier zählt, was wirklich da ist.
export async function countCasesByDiscipline(difficulty: Difficulty): Promise<Record<string, number>> {
  const bank = await loadCaseBank(difficulty);
  const out: Record<string, number> = { zufaellig: bank.length };
  for (const c of bank) {
    const d = typeof c.discipline === "string" ? c.discipline : "innere";
    out[d] = (out[d] ?? 0) + 1;
  }
  return out;
}

export async function pickCase(difficulty: Difficulty, discipline?: Discipline): Promise<RawCase | null> {
  const bank = await loadCaseBank(difficulty);
  const pool = filterByDiscipline(bank, discipline);
  if (pool.length === 0) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

export async function findCaseById(difficulty: Difficulty, caseId: string): Promise<RawCase | null> {
  const bank = await loadCaseBank(difficulty);
  return bank.find((c) => c.id === caseId) ?? null;
}

// ---- Normalisierung: rohes JSON -> Response-Payloads ----------------------

function asString(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

// v3-Fälle haben immer ein `niveau` (einfach/erfahren/experte) — Altfälle nie.
// Das ist die einzige Unterscheidung, die wir brauchen.
function isV3Case(raw: RawCase): boolean {
  return typeof raw.niveau === "string";
}

function de(v: unknown): string {
  if (v && typeof v === "object" && typeof (v as Bilingual).de === "string") {
    return (v as Bilingual).de;
  }
  return "";
}

function hasText(v: unknown): boolean {
  return de(v).trim().length > 0;
}

export function extractDiagnosisOptionTexts(raw: RawCase): string[] {
  if (!Array.isArray(raw.diagnosisOptions)) return [];
  if (isV3Case(raw)) {
    return (raw.diagnosisOptions as unknown[]).map((o) => de(o));
  }
  return raw.diagnosisOptions as string[];
}

function toPublicViewV3(raw: RawCase, shuffledOptions: string[]): PublicCaseView {
  const vorerkrankungenRaw = Array.isArray(raw.vorerkrankungen) ? (raw.vorerkrankungen as V3Vorerkrankung[]) : [];
  const byCategory = (cat: VorerkrankungCategory) =>
    vorerkrankungenRaw
      .filter((v) => (v.category ?? "vorerkrankung") === cat)
      .map((v) => de(v.text))
      .filter(Boolean);
  const vorerkrankungen = byCategory("vorerkrankung");
  const allergien = byCategory("allergie");
  const alkoholDrogen = byCategory("alkohol_drogen");
  const untersuchung = raw.untersuchung as { findings?: V3Finding[] } | undefined;
  return {
    id: asString(raw.id),
    difficulty: raw.difficulty as Difficulty,
    patientName: asString(raw.patientName),
    age: typeof raw.age === "number" ? raw.age : 0,
    gender: raw.gender === "female" ? "female" : "male",
    chiefComplaint: de(raw.chiefComplaint),
    history: de(raw.history),
    diagnosisOptions: shuffledOptions,
    imagingAvailable: hasText((raw.imaging as V3TextBlock | undefined)?.text),
    auskultationAvailable: hasText((raw.auskultation as V3TextBlock | undefined)?.text),
    ekgAvailable: hasText((raw.ekg as V3TextBlock | undefined)?.text),
    eegAvailable: hasText((raw.eeg as V3TextBlock | undefined)?.text),
    konsilAvailable: hasText((raw.konsil as V3TextBlock | undefined)?.text),
    oberarztAvailable: hasText(raw.oberarztTipp),
    niveau: raw.niveau as Niveau,
    cannotMiss: typeof raw.cannotMiss === "boolean" ? raw.cannotMiss : undefined,
    occupation: hasText(raw.occupation) ? de(raw.occupation) : undefined,
    // Vorerkrankungen sind bei v3 ein strukturiertes Array (je Eintrag mit
    // `relevance`) statt eines Fließtexts — `relevance` darf laut
    // Sichtbarkeits-Tabelle (CASE_SCHEMA_V3.md) vor Diagnose-Abgabe nicht an
    // den Client gehen, deshalb hier nur die reinen Texte, zusammengefasst in
    // das bestehende `preExisting`-Anzeigefeld (kein UI-Umbau nötig).
    preExisting: vorerkrankungen.length > 0 ? vorerkrankungen.join(" · ") : undefined,
    allergies: allergien.length > 0 ? allergien.join(" · ") : undefined,
    substanceHistory: alkoholDrogen.length > 0 ? alkoholDrogen.join(" · ") : undefined,
    anamnese: untersuchung ? undefined : undefined,
  };
}

export function toPublicView(raw: RawCase, shuffledOptions: string[]): PublicCaseView {
  if (isV3Case(raw)) return toPublicViewV3(raw, shuffledOptions);

  const imaging = asString(raw.imaging);
  return {
    id: asString(raw.id),
    difficulty: raw.difficulty as Difficulty,
    patientName: asString(raw.patientName),
    age: typeof raw.age === "number" ? raw.age : 0,
    gender: raw.gender === "female" ? "female" : "male",
    chiefComplaint: asString(raw.chiefComplaint),
    history: asString(raw.history),
    diagnosisOptions: shuffledOptions,
    imagingAvailable: imaging.trim().length > 0,
    auskultationAvailable: false,
    ekgAvailable: false,
    eegAvailable: false,
    konsilAvailable: false,
    oberarztAvailable: false,
    occupation: typeof raw.occupation === "string" ? raw.occupation : undefined,
    family: typeof raw.family === "string" ? raw.family : undefined,
    preExisting: typeof raw.preExisting === "string" ? raw.preExisting : undefined,
    medications: typeof raw.medications === "string" ? raw.medications : undefined,
    anamnese: Array.isArray(raw.anamnese) ? (raw.anamnese as AnamneseSection[]) : undefined,
  };
}

function formatUntersuchungV3(raw: RawCase): string {
  const untersuchung = raw.untersuchung as { findings?: V3Finding[] } | undefined;
  const findings = Array.isArray(untersuchung?.findings) ? untersuchung!.findings! : [];
  return findings
    .map((f) => {
      const label = de(f.label);
      const text = de(f.text);
      return label ? `${label}: ${text}` : text;
    })
    .filter(Boolean)
    .join("\n\n");
}

function formatLabsV3(raw: RawCase): LabCategory[] {
  const labs = Array.isArray(raw.labs) ? (raw.labs as V3LabCategory[]) : [];
  return labs.map((cat) => ({
    category: de(cat.category),
    values: (cat.values ?? []).map((v) => ({
      name: de(v.name),
      // v3 bettet die Einheit bereits in `value` ein (z.B. "29 mmHg") —
      // keine separate Einheit, kein automatisch berechnetes high/low-Flag
      // (Referenzbereich-Parsing wäre fehleranfällig und könnte eine falsche
      // Richtung anzeigen — lieber kein Pfeil als ein falscher).
      value: asString(v.value),
      unit: "",
      reference: asString(v.reference),
      flag: "normal" as Flag,
    })),
  }));
}

function toRevealPayloadV3(raw: RawCase, categories: FindingKey[]): RevealPayload {
  const payload: RevealPayload = {};
  for (const key of categories) {
    if (key === "examination") payload.examination = formatUntersuchungV3(raw);
    if (key === "auskultation") payload.auskultation = de((raw.auskultation as V3TextBlock | undefined)?.text);
    if (key === "labs") payload.labs = formatLabsV3(raw);
    if (key === "ekg") payload.ekg = de((raw.ekg as V3TextBlock | undefined)?.text);
    if (key === "eeg") payload.eeg = de((raw.eeg as V3TextBlock | undefined)?.text);
    if (key === "imaging") payload.imaging = de((raw.imaging as V3TextBlock | undefined)?.text);
    if (key === "konsil") payload.konsil = de((raw.konsil as V3TextBlock | undefined)?.text);
    if (key === "oberarzt") payload.oberarzt = de(raw.oberarztTipp);
  }
  return payload;
}

export function toRevealPayload(raw: RawCase, categories: FindingKey[]): RevealPayload {
  if (isV3Case(raw)) return toRevealPayloadV3(raw, categories);

  const payload: RevealPayload = {};
  for (const key of categories) {
    if (key === "examination") payload.examination = asString(raw.examination);
    if (key === "imaging") payload.imaging = asString(raw.imaging);
    if (key === "labs") payload.labs = Array.isArray(raw.labs) ? (raw.labs as LabCategory[]) : [];
    // auskultation/ekg/eeg/konsil/oberarzt existieren bei Altfällen nicht —
    // bleiben bewusst unbeantwortet (Client zeigt sie als "nicht verfügbar").
  }
  return payload;
}

// Rückgabetyp ohne sourcesAvailable: das Feld wird einheitlich im
// öffentlichen toVerifyPayload()-Wrapper aus raw.sources berechnet (v2
// und v3 gleichermaßen), nicht hier pro Schema dupliziert.
function toVerifyPayloadV3(
  raw: RawCase,
  guess: string
): Omit<VerifyPayload, "sourcesAvailable" | "score" | "scoringModel" | "bilanz" | "jokerDelta"> {
  const correctDiagnosis = de(raw.correctDiagnosis);
  const caseContextRaw = raw.caseContext as { category?: string; note?: Bilingual } | undefined;
  const differentialNotes = Array.isArray(raw.differentialNotes)
    ? (raw.differentialNotes as { option: Bilingual; whyNot: Bilingual }[]).map((n) => ({
        option: de(n.option),
        whyNot: de(n.whyNot),
      }))
    : undefined;
  return {
    correct: guess.length > 0 && guess === correctDiagnosis,
    correctDiagnosis,
    explanation: de(raw.explanation),
    keyTakeaway: hasText(raw.keyTakeaway) ? de(raw.keyTakeaway) : undefined,
    differentialNotes,
    caseContext: caseContextRaw
      ? {
          category: (caseContextRaw.category as CaseContext["category"]) ?? "haeufig",
          note: de(caseContextRaw.note),
        }
      : undefined,
  };
}

export function toVerifyPayload(raw: RawCase, guess: string, requested: FindingKey[] = []): VerifyPayload {
  const sourcesAvailable = Array.isArray(raw.sources) && raw.sources.length > 0;

  if (isV3Case(raw)) {
    const base = toVerifyPayloadV3(raw, guess);
    const s = scoreCase(raw, requested, base.correct, true);
    return { ...base, sourcesAvailable, score: s.score, scoringModel: s.model, bilanz: s.bilanz, jokerDelta: s.jokerDelta };
  }

  const correctDiagnosis = asString(raw.correctDiagnosis);
  const correct = guess.length > 0 && guess === correctDiagnosis;
  const s = scoreCase(raw, requested, correct, false);
  return {
    correct,
    score: s.score,
    scoringModel: s.model,
    jokerDelta: 0,
    correctDiagnosis,
    explanation: asString(raw.explanation),
    keyTakeaway: typeof raw.keyTakeaway === "string" ? raw.keyTakeaway : undefined,
    differentialNotes: Array.isArray(raw.differentialNotes)
      ? (raw.differentialNotes as DifferentialNote[])
      : undefined,
    caseContext:
      raw.caseContext && typeof raw.caseContext === "object"
        ? (raw.caseContext as CaseContext)
        : undefined,
    sourcesAvailable,
  };
}

export function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function parseDifficulty(value: unknown): Difficulty {
  if (value === "vorklinik" || value === "klinik" || value === "examen") return value;
  return "klinik";
}

const VALID_DISCIPLINES: Discipline[] = [
  "zufaellig",
  "innere",
  "kardiologie",
  "chirurgie",
  "allgemeinmedizin",
  "neurologie",
  "hno",
  "augenheilkunde",
  "anaesthesiologie",
];

export function parseDiscipline(value: unknown): Discipline | undefined {
  return VALID_DISCIPLINES.includes(value as Discipline) ? (value as Discipline) : undefined;
}
