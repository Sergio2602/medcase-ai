// Lokales Fortschritts-/Logbuch-Tracking (kein Account, kein Backend).
// Speichert pro gelöstem Fall Fachbereich, Schwierigkeit, Ergebnis, Punkte
// und Bearbeitungszeit in localStorage — Grundlage für die Statistik-Seite.
// Bewusst rein clientseitig: gerätegebunden, keine personenbezogenen Daten,
// kein Server-Roundtrip nötig.

export type CaseResult = {
  caseId: string;
  discipline: string;
  difficulty: string;
  correct: boolean;
  score: number;
  durationSeconds: number;
  timestamp: number;
};

const STORAGE_KEY = "medcase_stats_v1";
const MAX_ENTRIES = 500;

export function recordCaseResult(entry: CaseResult) {
  if (typeof window === "undefined") return;
  try {
    const existing = readCaseResults();
    const updated = [...existing, entry].slice(-MAX_ENTRIES);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch {
    // localStorage nicht verfügbar (z. B. privater Modus) — Statistik wird
    // dann einfach nicht mitgeschrieben, das Spiel selbst bleibt unbetroffen.
  }
}

export function readCaseResults(): CaseResult[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is CaseResult =>
        e &&
        typeof e.caseId === "string" &&
        typeof e.discipline === "string" &&
        typeof e.difficulty === "string" &&
        typeof e.correct === "boolean" &&
        typeof e.score === "number" &&
        typeof e.durationSeconds === "number" &&
        typeof e.timestamp === "number"
    );
  } catch {
    return [];
  }
}

export function clearCaseResults() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
