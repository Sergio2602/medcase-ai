// scripts/lib/detect.ts
//
// Pipeline v2, Stufe 4: automatisierte Detektion wörtlicher Übernahme, VOR Veröffentlichung.
// Deterministisch in der Auswertung (ngram.ts) — aber die Suche selbst braucht eine externe
// Quelle für "kommt diese 8-Wort-Phrase irgendwo im Netz wörtlich vor". Zwei Backends:
//
//   1. Serper (bevorzugt, wenn SERPER_API_KEY gesetzt): eine echte Suchmaschinen-API, deren
//      Snippets als Klartext zurückkommen. Wir prüfen den Treffer trotzdem noch einmal lokal
//      (Substring-Check auf dem eigenen, normalisierten Text) — das Snippet allein reicht
//      nicht als Beweis, wir wollen wirklich unsere Phrase darin sehen, nicht nur einen Treffer.
//
//   2. Anthropic-Websuche (Fallback, kein zusätzlicher API-Key nötig): technische
//      Einschränkung, dokumentiert in ngram.ts — die Suchergebnisse der Anthropic-API kommen
//      als `encrypted_content` zurück, wir können den Seiteninhalt selbst nicht lesen. Der
//      Fallback lässt deshalb das MODELL die Seite lesen und ein kurzes, wörtliches Zitat
//      zurückmelden (≤15 Wörter, ausschließlich zur Verifikation, nie zur Veröffentlichung) —
//      und verifiziert DANACH lokal und deterministisch, ob dieses Zitat wirklich ein
//      n-Gramm mit unserer gesuchten Phrase teilt. Die Entscheidung "Treffer ja/nein" bleibt
//      damit bei unserem Code, nicht beim Modellurteil — aber die Verlässlichkeit hängt am
//      Modell, das ehrlich zitiert statt zu erfinden. **Das ist eine dokumentierte Schwäche,
//      kein vollwertiger Ersatz für Backend 1.** Vor Produktivbetrieb: SERPER_API_KEY (oder
//      eine gleichwertige Such-API) einrichten.
//
// Nutzung (CLI, Selbsttest der Auswertungslogik ohne Netzwerk):
//   npx tsx scripts/lib/detect.ts --selftest

import Anthropic from "@anthropic-ai/sdk";
import { fileURLToPath } from "node:url";
import { anthropic, DEFAULT_MODEL } from "./env.js";
import {
  extractNgrams,
  sharedNgrams,
  tokenize,
  type NgramSearchFn,
} from "./ngram.js";
import { CASE_TEXT_FIELDS, type ConstructedCase } from "./case-types.js";
import type { DetectionResult } from "./provenance.js";
import { BLOCKED_VERIFY_DOMAINS } from "./verify.js";

const NGRAM_SIZE = 8; // 8–10 laut LEGAL_CASE_PIPELINE.md — 8 ist die vorsichtigere (strengere) Wahl.
const MAX_NGRAMS_PER_FIELD = 60; // Deckel gegen Suchflut/Kosten bei sehr langen Feldern.

// ---------------------------------------------------------------------------
// Domain-Sperre — gilt fuer BEIDE Backends
//
// Gegencheck 2026-09-15, BLOCKING 1: Stufe 4 durchsuchte das offene Web ohne jede
// Domain-Beschraenkung. Ein Treffer auf einer gesperrten Domain (Amboss/UpToDate/...) wurde
// bisher unveraendert in detection.hits[].matchedUrl geschrieben -- ein selbstgefuehrter,
// datierter Nachweis genau des automatisierten Zugriffs, den DECISION_LOG.md 2026-09-13 fuer
// Stufe 3.5 ausschliesst. Stufe 4 MUSS trotzdem breit suchen koennen (Plagiatserkennung
// funktioniert nicht mit einer Allow-Liste) -- deshalb hier eine Sperrliste statt einer
// Erlaubnisliste: Treffer auf BLOCKED_VERIFY_DOMAINS werden weder als Treffer gezaehlt noch
// mit URL protokolliert. Sergio prueft Amboss/UpToDate weiterhin selbst, unprotokolliert,
// als Mensch in Stufe 5.
// ---------------------------------------------------------------------------

function isBlockedDomain(url: string): boolean {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  return BLOCKED_VERIFY_DOMAINS.some((blocked) => host === blocked || host.endsWith(`.${blocked}`));
}

// ---------------------------------------------------------------------------
// Backend 1 — Serper (echte Suchmaschinen-Snippets)
// ---------------------------------------------------------------------------

interface SerperOrganicResult {
  title?: string;
  snippet?: string;
  link?: string;
}

export function createSerperSearch(apiKey: string): NgramSearchFn {
  return async (ngram: string): Promise<string[]> => {
    const res = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ q: `"${ngram}"` }),
    });
    if (!res.ok) {
      throw new Error(`detect.ts: Serper antwortet mit ${res.status} ${res.statusText}.`);
    }
    const data = (await res.json()) as { organic?: SerperOrganicResult[] };
    const needle = ngram; // bereits normalisiert (tokenize-Ausgabe, mit Leerzeichen verbunden)
    const hits: string[] = [];
    for (const result of data.organic ?? []) {
      const haystack = tokenize(`${result.title ?? ""} ${result.snippet ?? ""}`).join(" ");
      if (!result.link || !haystack.includes(needle)) continue;
      if (isBlockedDomain(result.link)) {
        console.warn(
          `detect.ts: Treffer auf gesperrter Domain (${result.link}) -- wird NICHT als Treffer ` +
            `gezaehlt und nicht in den Record uebernommen (DECISION_LOG.md 2026-09-13).`
        );
        continue;
      }
      hits.push(result.link);
    }
    return hits;
  };
}

// ---------------------------------------------------------------------------
// Backend 2 — Anthropic-Websuche + modellberichtetes Zitat, lokal geprüft
// ---------------------------------------------------------------------------

const QUOTE_CHECK_TOOL: Anthropic.Tool = {
  name: "report_quote_check",
  description:
    "Meldet für die gegebene Wortfolge, ob sie wörtlich auf einer gefundenen Webseite steht.",
  input_schema: {
    type: "object",
    properties: {
      found: { type: "boolean", description: "true nur, wenn die Wortfolge wörtlich (nicht sinngemäß) gefunden wurde." },
      url: { type: "string", description: "URL der Fundstelle, falls found=true." },
      quotedExcerpt: {
        type: "string",
        description:
          "Höchstens 15 Wörter, wörtlich von der Seite kopiert, die die gesuchte Wortfolge " +
          "enthalten. Nur zur technischen Verifikation — wird nicht veröffentlicht.",
      },
    },
    required: ["found"],
  },
};

export function createAnthropicPhraseSearch(opts?: { model?: string; allowedDomains?: string[] }): NgramSearchFn {
  const model = opts?.model ?? process.env.ANTHROPIC_MODEL_DETECT ?? DEFAULT_MODEL;

  return async (ngram: string): Promise<string[]> => {
    // Ohne explizite allowedDomains (Normalfall in Stufe 4): blocked_domains statt gar keiner
    // Beschraenkung. Anthropics eigener Websuche-Tool-Parameter -- damit ruft/liest das Modell
    // Amboss/UpToDate technisch gar nicht erst, statt es nur nachtraeglich auszufiltern.
    const tools: Anthropic.ToolUnion[] = [
      {
        type: "web_search_20250305",
        name: "web_search",
        max_uses: 3,
        ...(opts?.allowedDomains
          ? { allowed_domains: opts.allowedDomains }
          : { blocked_domains: BLOCKED_VERIFY_DOMAINS }),
      },
      QUOTE_CHECK_TOOL,
    ];

    const response = await anthropic.messages.create({
      model,
      max_tokens: 2000,
      system:
        "Du prüfst, ob eine kurze Wortfolge wörtlich auf einer Webseite vorkommt. Suche gezielt " +
        "danach. Wenn du eine Seite findest, auf der die Wortfolge wörtlich steht, zitiere " +
        "höchstens 15 Wörter daraus (die gesuchte Wortfolge muss darin enthalten sein) und rufe " +
        "report_quote_check mit found=true, der URL und diesem Zitat auf. Findest du nichts, rufe " +
        "report_quote_check mit found=false auf. Rufe das Tool immer genau einmal auf, ohne " +
        "Fließtext davor oder danach.",
      tools,
      messages: [{ role: "user", content: `Gesuchte Wortfolge: "${ngram}"` }],
    });

    const toolUse = response.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === "report_quote_check"
    );
    if (!toolUse) return [];

    const input = toolUse.input as { found?: boolean; url?: string; quotedExcerpt?: string };
    if (!input.found || !input.url || !input.quotedExcerpt) return [];

    // Die eigentliche Entscheidung bleibt bei uns: das Modell darf "found" behaupten, zählt
    // aber nur, wenn sein eigenes Zitat lokal nachweislich ein n-Gramm mit unserer Phrase
    // teilt. Ein erfundenes oder unpassendes Zitat fällt hier heraus.
    const shared = sharedNgrams(ngram, input.quotedExcerpt, Math.min(NGRAM_SIZE, tokenize(ngram).length));
    if (shared.length === 0) return [];

    // Verteidigung in der Tiefe: selbst wenn blocked_domains die Suche nicht verhindert hat
    // (z.B. Modellhalluzination einer URL), wird eine gesperrte Domain hier nie zurueckgegeben.
    if (isBlockedDomain(input.url)) {
      console.warn(
        `detect.ts: Anthropic-Fallback meldete Treffer auf gesperrter Domain (${input.url}) -- ` +
          `wird verworfen.`
      );
      return [];
    }
    return [input.url];
  };
}

// ---------------------------------------------------------------------------
// Backend-Auswahl
// ---------------------------------------------------------------------------

export function createDefaultSearchBackend(): { fn: NgramSearchFn; backend: "serper" | "anthropic" } {
  const serperKey = process.env.SERPER_API_KEY;
  if (serperKey) {
    return { fn: createSerperSearch(serperKey), backend: "serper" };
  }
  console.warn(
    "detect.ts: SERPER_API_KEY nicht gesetzt — fällt auf den Anthropic-Fallback zurück " +
      "(dokumentierte Schwäche, siehe Kommentar am Dateianfang). Für Produktivbetrieb " +
      "SERPER_API_KEY setzen."
  );
  return { fn: createAnthropicPhraseSearch(), backend: "anthropic" };
}

// ---------------------------------------------------------------------------
// Hauptfunktion — läuft über die Freitextfelder eines fertigen Falls
// ---------------------------------------------------------------------------

export interface DetectOptions {
  search?: NgramSearchFn;
  ngramSize?: number;
  maxNgramsPerField?: number;
}

export async function detectCase(caseData: ConstructedCase, opts?: DetectOptions): Promise<DetectionResult> {
  const ngramSize = opts?.ngramSize ?? NGRAM_SIZE;
  const maxPerField = opts?.maxNgramsPerField ?? MAX_NGRAMS_PER_FIELD;
  const search = opts?.search ?? createDefaultSearchBackend().fn;

  const hits: DetectionResult["hits"] = [];

  for (const field of CASE_TEXT_FIELDS) {
    const text = caseData[field];
    if (!text || typeof text !== "string") continue;
    const grams = extractNgrams(text, ngramSize).slice(0, maxPerField);
    for (const gram of grams) {
      const urls = await search(gram);
      for (const url of urls) {
        hits.push({ field, ngram: gram, matchedUrl: url });
      }
    }
  }

  return {
    runAt: new Date().toISOString(),
    method: "ngram-websearch",
    ngramSize,
    fieldsChecked: [...CASE_TEXT_FIELDS],
    hits,
    verdict: hits.length > 0 ? "flagged" : "clean",
  };
}

// ---------------------------------------------------------------------------
// CLI — Selbsttest der Auswertungslogik, ohne Netzwerk (Suchfunktion ist eine Stub-Funktion)
// ---------------------------------------------------------------------------

const FIXTURE_CASE: ConstructedCase = {
  id: "test-1",
  difficulty: "klinik",
  patientName: "Anna",
  age: 40,
  gender: "female",
  chiefComplaint: "Mir ist ständig schwindelig und ich habe Kopfschmerzen seit Tagen.",
  history: "40-jährige Patientin mit rezidivierendem Schwindel.",
  examination: "RR 145/90 mmHg, Puls 82/min, unauffälliger neurologischer Status.",
  labs: [],
  imaging: "",
  correctDiagnosis: "Hypertensive Krise",
  diagnosisOptions: ["Hypertensive Krise", "A", "B", "C"],
  keyTakeaway: "Hoher Blutdruck plus Kopfschmerz = hypertensive Krise abklären.",
  differentialNotes: [
    { option: "A", whyNot: "x" },
    { option: "B", whyNot: "x" },
    { option: "C", whyNot: "x" },
  ],
  explanation: "Der stark erhöhte Blutdruck erklärt die Symptomatik am ehesten.",
  sourceNotes: "fixture",
  caseContext: { category: "haeufig", note: "x" },
};

function stubSearch(hitOn: string | null): NgramSearchFn {
  return async (ngram: string) => (hitOn && ngram === hitOn ? ["https://example.com/quelle"] : []);
}

async function selftest(): Promise<void> {
  const failures: string[] = [];
  const check = (name: string, condition: boolean, detail = ""): void => {
    console.log(`${condition ? "ok  " : "FAIL"} ${name}${condition ? "" : ` — ${detail}`}`);
    if (!condition) failures.push(name);
  };

  const clean = await detectCase(FIXTURE_CASE, { search: stubSearch(null), ngramSize: 4 });
  check("kein Treffer -> verdict clean", clean.verdict === "clean");
  check("kein Treffer -> hits leer", clean.hits.length === 0);
  check("fieldsChecked enthält alle Freitextfelder", clean.fieldsChecked.length === CASE_TEXT_FIELDS.length);

  const grams = extractNgrams(FIXTURE_CASE.history, 4);
  check("Fixture hat mindestens ein 4-Gramm in history", grams.length > 0, "history zu kurz für den Test");
  const flagged = await detectCase(FIXTURE_CASE, { search: stubSearch(grams[0]), ngramSize: 4 });
  check("Treffer -> verdict flagged", flagged.verdict === "flagged");
  check("Treffer -> hit im richtigen Feld", flagged.hits.some((h) => h.field === "history" && h.ngram === grams[0]));

  // Anthropic-Backend: lokale Verifikation lehnt ein unpassendes Modell-Zitat ab.
  const goodQuote = sharedNgramsSelftest("hoher blutdruck plus kopfschmerz", "ganz anderer satz ohne overlap");
  check("sharedNgrams: kein Overlap bei völlig anderem Zitat", goodQuote.length === 0);
  const matchingQuote = sharedNgramsSelftest("hoher blutdruck plus kopfschmerz", "der hoher blutdruck plus kopfschmerz wurde erwähnt");
  check("sharedNgrams: Overlap bei tatsächlich zitiertem Text", matchingQuote.length > 0);

  console.log(`\n${failures.length === 0 ? "Alle Selbsttests bestanden." : `${failures.length} Selbsttest(s) fehlgeschlagen.`}`);
  if (failures.length > 0) process.exit(1);
}

function sharedNgramsSelftest(a: string, b: string): string[] {
  return sharedNgrams(a, b, 3);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes("--selftest")) {
    selftest().catch((e) => {
      console.error(e);
      process.exit(1);
    });
  } else {
    console.error("Nutzung: npx tsx scripts/lib/detect.ts --selftest");
    process.exit(1);
  }
}
