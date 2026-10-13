// scripts/lib/ngram.ts
//
// Geteilte n-Gramm-Werkzeuge. Zwei Abnehmer, bewusst getrennte Zwecke:
//   - Stufe 4 (detect.ts): prüft den FALL-TEXT auf wörtliche Übernahme aus dem Web.
//   - Stufe 3.5 (verify.ts): prüft die NOTIZEN des Prüfschritts auf dasselbe.
// Beide Prüfungen sind deterministisch und modellfrei — das ist der Punkt: ihr Beweiswert
// hängt nicht davon ab, ob man einem Modell glaubt. Deshalb liegt die Logik hier und nicht
// im jeweiligen Prompt.
//
// Warum die Server-Websuche der Anthropic-API hier NICHT hilft: deren Ergebnisse kommen als
// `encrypted_content` zurück, der Klartext der gefundenen Seiten ist für uns nicht lesbar.
// Ein lokaler Textvergleich gegen das, was das Modell gelesen hat, ist damit unmöglich.
// Der Web-Abgleich läuft deshalb genauso wie in Stufe 4: n-Gramm als Exakt-Phrase suchen
// und schauen, ob es irgendwo im Netz wörtlich existiert. Diese Suche wird als
// `NgramSearchFn` hereingereicht, damit ngram.ts selbst keine Netzabhängigkeit hat.

// ---------------------------------------------------------------------------
// Tokenisierung
// ---------------------------------------------------------------------------

// Behält deutsche Umlaute und Ziffern, wirft Satzzeichen weg, vereinheitlicht Whitespace.
// Absicht: "Die Anti-tTG-IgA-Bestimmung, ..." und "die anti ttg iga bestimmung" sollen
// dasselbe n-Gramm ergeben — sonst umgeht eine Umformatierung die Prüfung trivial.
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[‐-―]/g, "-") // typografische Bindestriche
    .replace(/[^a-z0-9äöüß]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

export function countWords(text: string): number {
  return tokenize(text).length;
}

// Alle n-Gramme eines Textes, Reihenfolge erhalten, Duplikate entfernt.
export function extractNgrams(text: string, n: number): string[] {
  if (n < 1) throw new Error("ngram.ts: n muss >= 1 sein.");
  const tokens = tokenize(text);
  const seen = new Set<string>();
  const out: string[] = [];
  for (let i = 0; i + n <= tokens.length; i++) {
    const gram = tokens.slice(i, i + n).join(" ");
    if (!seen.has(gram)) {
      seen.add(gram);
      out.push(gram);
    }
  }
  return out;
}

// Gemeinsame n-Gramme zweier lokal vorliegender Texte.
export function sharedNgrams(a: string, b: string, n: number): string[] {
  const setB = new Set(extractNgrams(b, n));
  return extractNgrams(a, n).filter((g) => setB.has(g));
}

// Längste zusammenhängende gemeinsame Wortfolge zweier Texte (in Wörtern).
// Für Berichte aussagekräftiger als "es gab einen 8-Gramm-Treffer".
export function longestSharedRun(a: string, b: string): number {
  const ta = tokenize(a);
  const tb = tokenize(b);
  if (ta.length === 0 || tb.length === 0) return 0;
  let best = 0;
  let prev = new Array<number>(tb.length + 1).fill(0);
  for (let i = 1; i <= ta.length; i++) {
    const cur = new Array<number>(tb.length + 1).fill(0);
    for (let j = 1; j <= tb.length; j++) {
      if (ta[i - 1] === tb[j - 1]) {
        cur[j] = prev[j - 1] + 1;
        if (cur[j] > best) best = cur[j];
      }
    }
    prev = cur;
  }
  return best;
}

// ---------------------------------------------------------------------------
// Mechanische Übernahme-Indikatoren
//
// Kein Modellurteil, keine Heuristik mit Ermessen: vier harte Regeln, die eine wörtliche
// Übernahme in einer kurzen Notiz praktisch immer mit sich bringt. Läuft in Millisekunden
// und kostet nichts — deshalb immer, auf jeder Notiz.
// ---------------------------------------------------------------------------

export type CopyRiskRule = "word-cap" | "quote-marks" | "url" | "doi-or-isbn";

export interface CopyRiskFinding {
  rule: CopyRiskRule;
  detail: string;
}

const QUOTE_CHARS = /["“”„«»‹›]/;
const URL_PATTERN = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(?:de|com|org|net|gov|edu)\b)/i;
const DOI_ISBN_PATTERN = /(10\.\d{4,}\/|\bdoi\b|\bisbn\b)/i;

export function checkMechanicalCopyRisk(text: string, maxWords: number): CopyRiskFinding[] {
  const findings: CopyRiskFinding[] = [];
  const words = countWords(text);
  if (words > maxWords) {
    findings.push({ rule: "word-cap", detail: `${words} Wörter, erlaubt sind ${maxWords}.` });
  }
  if (QUOTE_CHARS.test(text)) {
    findings.push({ rule: "quote-marks", detail: "Anführungszeichen deuten auf ein Zitat hin." });
  }
  if (URL_PATTERN.test(text)) {
    findings.push({ rule: "url", detail: "URL/Domain gehört in das evidence-Feld, nicht in die Notiz." });
  }
  if (DOI_ISBN_PATTERN.test(text)) {
    findings.push({ rule: "doi-or-isbn", detail: "DOI/ISBN gehört in das evidence-Feld, nicht in die Notiz." });
  }
  return findings;
}

// ---------------------------------------------------------------------------
// Web-Abgleich (eingereichte Suchfunktion)
// ---------------------------------------------------------------------------

// Sucht ein n-Gramm als exakte Phrase und liefert die URLs, auf denen es wörtlich steht.
// Implementierung kommt von außen (detect.ts / generate-case-v2.ts), damit dieses Modul
// testbar und netzfrei bleibt.
export type NgramSearchFn = (ngram: string) => Promise<string[]>;

export interface NgramWebHit {
  ngram: string;
  matchedUrls: string[];
}

export async function findWebMatches(
  text: string,
  n: number,
  search: NgramSearchFn,
  opts?: { maxNgramsPerText?: number }
): Promise<NgramWebHit[]> {
  const grams = extractNgrams(text, n);
  const limit = opts?.maxNgramsPerText ?? grams.length;
  const hits: NgramWebHit[] = [];
  for (const gram of grams.slice(0, limit)) {
    const urls = await search(gram);
    if (urls.length > 0) hits.push({ ngram: gram, matchedUrls: urls });
  }
  return hits;
}
