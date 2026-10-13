// scripts/lib/factsheet.ts
//
// Pipeline v2, Stufe 1: Faktenextraktion, isoliert.
// Eigener API-Call, sieht NUR die Diagnose/das Thema — nicht Stufe 2 (Fallkonstruktion,
// construct.ts). Sucht ausschließlich in den laut LEGAL_CASE_PIPELINE.md erlaubten
// Quellen (Quellenhierarchie "Frei"/"Nur Fakten"/"Nur Fakten, nicht bewerben"). Gesperrte
// Quellen (Amboss, UpToDate, IMPP-Fragen) sind technisch per allowed_domains ausgeschlossen.
//
// Nutzung (CLI, manueller Testlauf für genau EIN Thema):
//   npx tsx scripts/lib/factsheet.ts scripts/test-topic.example.json
//
// Der System-Prompt liegt versioniert in scripts/lib/prompts/factsheet.v1.md — der Hash
// wird zurückgegeben, damit generate-case-v2.ts ihn später in den Provenienz-Record
// (provenance.ts, generator.promptFactsheet) übernehmen kann.

import Anthropic from "@anthropic-ai/sdk";
import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { anthropic, DEFAULT_MODEL } from "./env.js";
import type { ProvenanceSource, ModelKnowledgeClaim, SourceType, License } from "./provenance.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Themen-Typ — muss zu data/case-topics.schema.json passen (Stufe 0, noch nicht befüllt,
// wartet auf Sergios Freigabe). Bis dahin: Test-Themen manuell als JSON-Datei anlegen,
// siehe scripts/test-topic.example.json.
// ---------------------------------------------------------------------------

export interface CaseTopic {
  id: string;
  diagnosis: string;
  difficulty: "vorklinik" | "klinik" | "examen";
  category: "haeufig" | "cannot-miss";
  setting: string;
  lernziel: string;
  selectedBy: "human";
  rationale: string;
}

// ---------------------------------------------------------------------------
// Erlaubte Domains laut Quellenhierarchie (LEGAL_CASE_PIPELINE.md). Gesperrt (bewusst
// NICHT enthalten): Amboss, UpToDate, IMPP-Prüfungsfragen, veröffentlichte Case Reports.
//
// TODO (Sergio): Das sind plausible Domains der in der Tabelle genannten Herausgeber,
// keine von Hand verifizierte Liste. Vor mehr als dem einen Testfall gegenlesen.
// ---------------------------------------------------------------------------

export const ALLOWED_FACTSHEET_DOMAINS: string[] = [
  // Frei, auch Ausdruck (Gesetze, amtliche Werke)
  "gesetze-im-internet.de",
  "rki.de",
  "destatis.de",
  // Nur Fakten — Leitlinien / Fachgesellschaften / Register
  "awmf.org",
  "register.awmf.org",
  "leitlinien.de",
  "escardio.org",
  "dgk.org",
  "dgn.org",
  "dgvs.de",
  "onkopedia.com",
  "pubmed.ncbi.nlm.nih.gov",
  "ncbi.nlm.nih.gov",
  // Nur Fakten, nicht bewerben — Nachschlagewerke
  "msdmanuals.com",
  "deximed.de",
  "gpnotebook.com",
  "link.springer.com",
];

// ---------------------------------------------------------------------------
// Quellen-Validierung -- Gegencheck 2026-09-15, BLOCKING 3
//
// sources[].url war bisher reine Modellbehauptung: weder gegen die Domain-Whitelist noch
// gegen die tatsaechlich zurueckgekommenen Websuche-Treffer geprueft. Eine frei erfundene
// oder gesperrte URL (z.B. Amboss) wurde unveraendert in den Provenienz-Record uebernommen --
// die rechtlich tragende Quellenliste waere damit unbelegt. Zwei Pruefungen, beide hart:
//   1. Domain muss auf ALLOWED_FACTSHEET_DOMAINS stehen.
//   2. URL muss unter den tatsaechlichen web_search_tool_result-Treffern dieses Laufs sein
//      (Muster wie in verify.ts: was das Modell WIRKLICH gesehen hat, nicht was es behauptet).
// ---------------------------------------------------------------------------

function isAllowedFactsheetDomain(url: string): boolean {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  return ALLOWED_FACTSHEET_DOMAINS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
}

// Normalisiert fuer den Vergleich: Protokoll, Trailing-Slash, Query/Hash spielen keine Rolle --
// nur Host+Pfad muessen uebereinstimmen. Falls der erste echte Testlauf hier bricht, weil das
// Modell dieselbe URL leicht anders schreibt als der Suchtreffer: diese Normalisierung lockern,
// nicht die Pruefung entfernen.
function normalizeUrlForComparison(url: string): string {
  try {
    const u = new URL(url);
    return `${u.hostname.toLowerCase()}${u.pathname.replace(/\/+$/, "")}`;
  } catch {
    return url.trim().toLowerCase();
  }
}

// ---------------------------------------------------------------------------
// Rückgabetyp
// ---------------------------------------------------------------------------

export interface FactsheetFact {
  fact: string;
  sourceId?: string;
  modelKnowledge?: boolean;
}

// Strukturierte Vorgabe für Stufe 3 (patient.ts/labs.ts) — NIE eine konkrete Zahl, nur
// welcher Parameter relevant ist, in welche Richtung er von der Norm abweicht und wie stark.
// Die eigentliche Zahl würfelt labs.ts anhand von data/reference-ranges.json.
//
// `magnitude` ist die Ergänzung vom 2026-09-13 (siehe DECISION_LOG.md): ohne
// Größenordnung würfelt labs.ts aus dem gesamten pathologischen Bereich, und Stufe 3.5
// (verify.ts) kann die Prüfung "trägt die Laborkonstellation die Zieldiagnose?" nicht
// durchführen — sie hätte keinen Sollwert, gegen den sie prüfen könnte. Ein Leukozytenwert
// von 11,2/nl und einer von 24/nl erzählen verschiedene Fälle.
//
// `direction: "normal"` gibt es, weil ein bewusst normaler Wert diagnostisch etwas
// aussagt (ein normales CRP schließt Differentialdiagnosen aus). Ohne diese Möglichkeit
// wäre mancher Fall aus dem gelieferten Material nicht herleitbar — genau der Befund, den
// verify.ts als "loesbarkeitsluecke" meldet.
export type LabDirection = "high" | "low" | "normal";

// leicht  = knapp außerhalb der Norm
// deutlich = klar pathologisch, klinischer Regelfall
// massiv  = Extrembereich
export type LabMagnitude = "leicht" | "deutlich" | "massiv";

export interface TypicalLabFinding {
  parameter: string;
  direction: LabDirection;
  magnitude?: LabMagnitude; // Pflicht bei "high"/"low", entfällt bei "normal"
  sourceId?: string;
  modelKnowledge?: boolean;
}

// Grober Rahmen für patient.ts — ein Bereich, kein exaktes Alter.
export interface EpidemiologyHint {
  typicalAgeRangeMin: number;
  typicalAgeRangeMax: number;
  genderSkew: "male" | "female" | "balanced";
  // Gegencheck 2026-09-15, BLOCKING 5: ohne dieses Feld zog patient.ts bei jeder Diagnose eine
  // 80/20-Tendenz -- bei anatomisch geschlechtsexklusiven Diagnosen (Schwangerschaft, Prostata,
  // Ovar/Uterus...) entstand in ~20% der Faelle ein Patient des falsch moeglichen Geschlechts.
  // true nur bei ANATOMISCHER Exklusivitaet, nicht bei blosser statistischer Haeufung.
  genderExclusive?: boolean;
  sourceId?: string;
  modelKnowledge?: boolean;
}

export interface Factsheet {
  topicId: string;
  diagnosis: string;
  createdAt: string;
  model: string;
  promptFile: string;
  promptSha256: string;
  facts: FactsheetFact[];
  typicalLabFindings: TypicalLabFinding[];
  epidemiology: EpidemiologyHint;
  sources: ProvenanceSource[];
  modelKnowledgeClaims: ModelKnowledgeClaim[];
}

// ---------------------------------------------------------------------------
// Tool-Schema — erzwingt strukturierte Ausgabe, kein Fließtext.
// ---------------------------------------------------------------------------

const SOURCE_TYPES: SourceType[] = ["guideline", "textbook", "registry", "official-statistic", "other"];
const LICENSES: License[] = ["cc0", "cc-by", "cc-by-sa", "public-domain", "statutory", "unverified", "cc-by-nc", "cc-nd"];

const FACTSHEET_TOOL: Anthropic.Tool = {
  name: "submit_factsheet",
  description:
    "Gibt das vollständige, strukturierte Faktenblatt für Stufe 1 zurück. Immer als " +
    "letzter Schritt aufrufen, nachdem die Websuche abgeschlossen ist.",
  input_schema: {
    type: "object",
    properties: {
      facts: {
        type: "array",
        description:
          "Liste einzelner, atomarer Fakten. Keine Prosa, kein Fallverlauf, keine " +
          "Formulierungen aus Quellen übernehmen.",
        items: {
          type: "object",
          properties: {
            fact: { type: "string", description: "Ein einzelner Fakt, in eigenen Worten." },
            sourceId: { type: "string", description: "id aus 'sources', falls belegt." },
            modelKnowledge: {
              type: "boolean",
              description: "true, wenn kein Beleg gefunden wurde (Trainingswissen).",
            },
          },
          required: ["fact"],
        },
      },
      typicalLabFindings: {
        type: "array",
        description:
          "Für Stufe 3 (labs.ts): welche Laborparameter für diese Diagnose typischerweise " +
          "pathologisch sind, in welche Richtung und wie stark. NIEMALS eine konkrete Zahl " +
          "angeben — Richtung und Größenordnung genügen, die Zahl würfelt ein Skript.",
        items: {
          type: "object",
          properties: {
            parameter: { type: "string", description: "z.B. 'Anti-tTG-IgA', 'CRP', 'Kreatinin'." },
            direction: {
              type: "string",
              enum: ["high", "low", "normal"],
              description:
                "'normal' nur, wenn der unauffällige Wert diagnostisch etwas aussagt " +
                "(z.B. normales CRP zum Ausschluss einer Differentialdiagnose).",
            },
            magnitude: {
              type: "string",
              enum: ["leicht", "deutlich", "massiv"],
              description:
                "Wie stark der Wert abweicht: 'leicht' knapp außerhalb der Norm, " +
                "'deutlich' klarer klinischer Regelfall, 'massiv' Extrembereich. " +
                "Pflicht bei 'high'/'low', weglassen bei 'normal'.",
            },
            sourceId: { type: "string" },
            modelKnowledge: { type: "boolean" },
          },
          required: ["parameter", "direction"],
        },
      },
      epidemiology: {
        type: "object",
        description:
          "Für Stufe 3 (patient.ts): grober Altersbereich und Geschlechtstendenz, für die " +
          "diese Diagnose typisch ist. Ein Bereich, kein exaktes Alter.",
        properties: {
          typicalAgeRangeMin: { type: "integer" },
          typicalAgeRangeMax: { type: "integer" },
          genderSkew: { type: "string", enum: ["male", "female", "balanced"] },
          genderExclusive: {
            type: "boolean",
            description:
              "true NUR bei anatomischer Geschlechtsexklusivitaet (z.B. Schwangerschaft, " +
              "Prostatahyperplasie, Ovarialzyste) -- niemals bei blosser statistischer " +
              "Haeufung. Erzwingt genderSkew ohne Ausnahme, statt einer 80/20-Tendenz.",
          },
          sourceId: { type: "string" },
          modelKnowledge: { type: "boolean" },
        },
        required: ["typicalAgeRangeMin", "typicalAgeRangeMax", "genderSkew"],
      },
      sources: {
        type: "array",
        description: "Alle über die Websuche gefundenen und für 'facts' referenzierten Quellen.",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            type: { type: "string", enum: SOURCE_TYPES },
            title: { type: "string" },
            publisher: { type: "string" },
            identifier: { type: "string" },
            url: { type: "string" },
            retrievedAt: { type: "string", description: "ISO 8601, Abrufdatum aus der Websuche." },
            license: { type: "string", enum: LICENSES },
            licenseNote: { type: "string", description: "Warum diese Quelle so genutzt werden darf." },
            usedFor: {
              type: "array",
              items: { type: "string" },
              description: "Grobe Themen-Tags, z.B. 'epidemiologie', 'diagnosekriterien', 'therapie'.",
            },
          },
          required: ["id", "type", "title", "publisher", "url", "retrievedAt", "license", "licenseNote", "usedFor"],
        },
      },
      modelKnowledgeClaims: {
        type: "array",
        description: "Alle Fakten mit modelKnowledge:true, nochmal einzeln mit Konfidenz.",
        items: {
          type: "object",
          properties: {
            claim: { type: "string" },
            confidence: { type: "string", enum: ["high", "medium", "low"] },
          },
          required: ["claim", "confidence"],
        },
      },
    },
    required: ["facts", "typicalLabFindings", "epidemiology", "sources", "modelKnowledgeClaims"],
  },
};

// ---------------------------------------------------------------------------
// Prompt laden + hashen
// ---------------------------------------------------------------------------

const PROMPT_RELATIVE_PATH = "scripts/lib/prompts/factsheet.v1.md";

function loadSystemPrompt(): { text: string; sha256: string } {
  const path = join(__dirname, "prompts", "factsheet.v1.md");
  if (!existsSync(path)) {
    throw new Error(`factsheet.ts: Prompt-Datei fehlt unter ${path}`);
  }
  const text = readFileSync(path, "utf8");
  const sha256 = createHash("sha256").update(text, "utf8").digest("hex");
  return { text, sha256 };
}

// ---------------------------------------------------------------------------
// Hauptfunktion
// ---------------------------------------------------------------------------

export async function extractFactsheet(
  topic: CaseTopic,
  opts?: { model?: string }
): Promise<Factsheet> {
  if (topic.selectedBy !== "human") {
    throw new Error(
      `factsheet.ts: topic.selectedBy muss 'human' sein (Stufe 0 ist Sergios Aufgabe), war '${topic.selectedBy}'.`
    );
  }

  const model = opts?.model ?? process.env.ANTHROPIC_MODEL_FACTSHEET ?? DEFAULT_MODEL;
  const { text: systemPrompt, sha256: promptSha256 } = loadSystemPrompt();

  const userPrompt = `Diagnose: ${topic.diagnosis}
Schwierigkeitsgrad: ${topic.difficulty}
Setting: ${topic.setting}
Lernziel: ${topic.lernziel}

Extrahiere das Faktenblatt für diese Diagnose gemäß den Systemanweisungen. Nutze die
Websuche gezielt (Leitlinien-Kernaussagen, Diagnosekriterien, typische Befunde,
Epidemiologie, Standardtherapie) — so viel wie für das Lernziel nötig, nicht erschöpfend.
Rufe danach ausschließlich submit_factsheet auf.`;

  const tools: Anthropic.ToolUnion[] = [
    {
      type: "web_search_20250305",
      name: "web_search",
      allowed_domains: ALLOWED_FACTSHEET_DOMAINS,
      max_uses: 8,
    },
    FACTSHEET_TOOL,
  ];

  let messages: Anthropic.MessageParam[] = [{ role: "user", content: userPrompt }];
  let response = await anthropic.messages.create({
    model,
    max_tokens: 8000,
    system: systemPrompt,
    tools,
    messages,
  });
  // Ueber alle pause_turn-Iterationen sammeln -- nicht nur die letzte Antwort durchsuchen.
  // Vorher (MAJOR-Finding Gegencheck 2026-09-15): ruft das Modell submit_factsheet in einer
  // frueheren Runde auf und die API haengt danach noch eine pause_turn-Runde an, ging das
  // Tool-Ergebnis verloren. Gleiches Muster wie in verify.ts.
  const allBlocks: Anthropic.ContentBlock[] = [...response.content];

  // web_search ist ein serverseitig ausgeführtes Tool (die API sucht selbst und hängt die
  // Ergebnisse an) — normalerweise reicht EIN Call. Bei sehr langen Tool-Ketten kann die
  // API mit stop_reason "pause_turn" um Fortsetzung bitten; das fangen wir defensiv ab.
  let iterations = 0;
  while (response.stop_reason === "pause_turn" && iterations < 5) {
    messages = [...messages, { role: "assistant", content: response.content }];
    response = await anthropic.messages.create({ model, max_tokens: 8000, system: systemPrompt, tools, messages });
    allBlocks.push(...response.content);
    iterations++;
  }

  // Gegencheck 2026-09-15, BLOCKING 4: ein am Token-Limit abgeschnittener tool_use-Block darf
  // nie stillschweigend weiterverarbeitet werden.
  if (response.stop_reason === "max_tokens") {
    throw new Error(
      `factsheet.ts: Modellantwort am max_tokens-Limit (8000) abgeschnitten -- Faktenblatt ist ` +
        `moeglicherweise unvollstaendig und darf nicht verwendet werden.`
    );
  }

  const toolUse = allBlocks.find(
    (block): block is Anthropic.ToolUseBlock =>
      block.type === "tool_use" && block.name === "submit_factsheet"
  );

  if (!toolUse) {
    throw new Error(
      `factsheet.ts: Modell hat 'submit_factsheet' nicht aufgerufen (stop_reason=${response.stop_reason}). ` +
        `Antwort-Blöcke: ${allBlocks.map((b) => b.type).join(", ")}`
    );
  }

  // Welche URLs das Modell ueber die Websuche TATSAECHLICH gesehen hat -- nicht das, was es
  // in 'sources' behauptet. Gleiches Muster wie verify.ts (sourcesConsulted).
  const seenUrls = new Set<string>();
  for (const block of allBlocks) {
    if (block.type !== "web_search_tool_result") continue;
    const content = block.content;
    if (!Array.isArray(content)) continue;
    for (const result of content) {
      if (result.type === "web_search_result") seenUrls.add(normalizeUrlForComparison(result.url));
    }
  }

  const input = toolUse.input as {
    facts: FactsheetFact[];
    typicalLabFindings: TypicalLabFinding[];
    epidemiology: EpidemiologyHint;
    sources: ProvenanceSource[];
    modelKnowledgeClaims: Array<{ claim: string; confidence: "high" | "medium" | "low" }>;
  };

  // Harte Validierung — darf nie stillschweigend durchrutschen (gleicher Grundsatz wie
  // assertReleasable() in provenance.ts).
  for (const source of input.sources) {
    if (source.license === "cc-by-nc" || source.license === "cc-nd") {
      throw new Error(
        `factsheet.ts: Quelle '${source.id}' ('${source.title}') hat gesperrte Lizenz ` +
          `'${source.license}' — nicht zulässig, auch nicht nur zur Faktenentnahme.`
      );
    }
    if (!isAllowedFactsheetDomain(source.url)) {
      throw new Error(
        `factsheet.ts: Quelle '${source.id}' ('${source.title}') hat eine URL ausserhalb der ` +
          `erlaubten Domain-Whitelist (${source.url}). Siehe ALLOWED_FACTSHEET_DOMAINS.`
      );
    }
    if (!seenUrls.has(normalizeUrlForComparison(source.url))) {
      throw new Error(
        `factsheet.ts: Quelle '${source.id}' (${source.url}) taucht in keinem tatsaechlichen ` +
          `Websuche-Treffer dieses Laufs auf -- das Modell kann sie nicht wirklich gesehen ` +
          `haben. Nur Quellen aus echten web_search_tool_result-Bloecken sind zulaessig.`
      );
    }
  }
  for (const fact of input.facts) {
    if (!fact.sourceId && !fact.modelKnowledge) {
      throw new Error(`factsheet.ts: Fakt ohne Beleg und ohne modelKnowledge-Kennzeichnung: "${fact.fact}"`);
    }
  }
  // Ohne Größenordnung ist der Laborbefund für Stufe 3.5 nicht prüfbar — siehe Kommentar
  // an TypicalLabFinding. Lieber hier hart abbrechen als später einen unprüfbaren Fall bauen.
  for (const finding of input.typicalLabFindings) {
    if (finding.direction !== "normal" && !finding.magnitude) {
      throw new Error(
        `factsheet.ts: Laborbefund "${finding.parameter}" (${finding.direction}) ohne magnitude. ` +
          `Größenordnung ist Pflicht, sonst kann verify.ts die Laborkonstellation nicht prüfen.`
      );
    }
  }

  return {
    topicId: topic.id,
    diagnosis: topic.diagnosis,
    createdAt: new Date().toISOString(),
    model,
    promptFile: PROMPT_RELATIVE_PATH,
    promptSha256,
    facts: input.facts,
    typicalLabFindings: input.typicalLabFindings,
    epidemiology: input.epidemiology,
    sources: input.sources,
    modelKnowledgeClaims: input.modelKnowledgeClaims.map((c) => ({ ...c, noSourceFound: true as const })),
  };
}

// ---------------------------------------------------------------------------
// CLI — manueller Testlauf für genau ein Thema
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const topicPath = process.argv[2];
  if (!topicPath) {
    console.error("Nutzung: npx tsx scripts/lib/factsheet.ts <pfad-zu-topic.json>");
    process.exit(1);
  }
  const topic = JSON.parse(readFileSync(topicPath, "utf8")) as CaseTopic;
  console.log(`Faktenextraktion für "${topic.diagnosis}" (${topic.id})...\n`);
  const factsheet = await extractFactsheet(topic);
  console.log(JSON.stringify(factsheet, null, 2));
  console.log(
    `\n${factsheet.facts.length} Fakten, ${factsheet.sources.length} Quellen, ` +
      `${factsheet.modelKnowledgeClaims.length} Modellwissen-Claims.`
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
