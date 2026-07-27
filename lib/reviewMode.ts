// Review-Modus: wird vom /review-Einstieg gesetzt und vom Hauptspiel gelesen.
// Solange aktiv, zeigt der Ergebnis-Screen das Experten-Review statt des
// Studenten-Ratings. Rein clientseitig (localStorage), kein Account.

export type ReviewSession = {
  reviewer: { name: string; role: string; fach: string };
  accessKey: string;
};

const KEY = "medcase:reviewMode";

export function startReviewMode(session: ReviewSession) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(session));
  } catch {}
}

export function getReviewMode(): ReviewSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as ReviewSession) : null;
  } catch {
    return null;
  }
}

export function endReviewMode() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {}
}
