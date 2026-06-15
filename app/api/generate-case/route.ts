import { promises as fs } from "fs";
import path from "path";
import Anthropic, { APIError } from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

// claude-sonnet-4-20250514 was deprecated; claude-sonnet-4-6 is the current Sonnet 4 successor.
const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";

// Never cache this route — every request must produce a fresh case.
export const dynamic = "force-dynamic";

// Rotating a random clinical focus per request stops the model from
// collapsing to the same "random" case (e.g. always appendicitis) every time.
const FOCUS_AREAS = [
  "Kardiologie",
  "Pneumologie / Atemwege",
  "Gastroenterologie / Abdomen",
  "Nephrologie / Urologie",
  "Neurologie",
  "Endokrinologie / Stoffwechsel",
  "Infektiologie",
  "Hämatologie / Onkologie",
  "Rheumatologie / Immunologie",
  "Gynäkologie / Geburtshilfe",
  "Dermatologie",
  "Pädiatrie",
  "Notfall- / Intensivmedizin",
  "Allgemein- / Viszeralchirurgie",
  "Hals-Nasen-Ohren-Heilkunde",
  "Psychiatrie / Psychosomatik",
  "Muskuloskelettal / Orthopädie",
  "Augenheilkunde",
];

// Force the model to emit a structured case via a tool, so the game UI can
// render each section into its own slot instead of parsing freeform prose.
const CASE_TOOL: Anthropic.Tool = {
  name: "present_case",
  description:
    "Return a single structured clinical case for the diagnosis game.",
  input_schema: {
    type: "object",
    properties: {
      patientName: {
        type: "string",
        description:
          "A realistic German first name for the patient (e.g. Anna, Lukas, Ingrid, Mehmet).",
      },
      age: { type: "integer", description: "Patient age in years." },
      gender: {
        type: "string",
        enum: ["male", "female"],
        description: "Patient gender.",
      },
      chiefComplaint: {
        type: "string",
        description:
          "Vorstellungsgrund in der ALLTAGSSPRACHE des Patienten (Ich-Form, 1-2 Sätze), so wie ihn ein echter deutscher Patient der Ärztin/dem Arzt schildern würde – KEINE Fachsprache, ruhig umgangssprachlich (z. B. 'Mir ist seit heute Morgen ständig schlecht und mein Herz rast.'). Authentisches gesprochenes Deutsch, keine Übersetzung aus dem Englischen.",
      },
      history: {
        type: "string",
        description:
          "Anamnese (jetzige Anamnese, relevante Vor-, Sozial- und Familienanamnese, Medikation, Noxen) im Dokumentationsstil einer deutschen Uniklinik. Verwende übliche Abkürzungen wie 'Z. n.' (Zustand nach), 'V. a.', 'a. e.', 'bei Aufnahme'. Nüchterner, präziser klinischer Stil, 3-5 Sätze.",
      },
      examination: {
        type: "string",
        description:
          "Körperlicher Untersuchungsbefund im Uniklinik-Stil mit Vitalparametern in deutscher Notation (z. B. 'RR 90/60 mmHg, HF 110/min, AF 22/min, Temp. 38,7 °C, SpO2 94 % unter Raumluft') sowie relevanten positiven und negativen Befunden nach Organsystemen. Authentische deutsche Befundsprache (z. B. 'Abdomen weich, Druckschmerz im rechten Unterbauch, lebhafte Darmgeräusche').",
      },
      labs: {
        type: "array",
        description:
          "Strukturierte Laborwerte, die zur Diagnose passen und für den Fall relevant sind. Nach klinischen Kategorien gruppiert (z. B. Hämatologie, Klinische Chemie, Herzmarker, Gerinnung, Entzündung, Blutgasanalyse, Urin). Nur diagnostisch relevante Parameter aufnehmen (typischerweise 2-5 Kategorien mit je 2-6 Werten), keine erschöpfende Routineliste. Pathologische, zur Diagnose passende Werte gezielt einbauen und über das Feld 'flag' kennzeichnen.",
        items: {
          type: "object",
          properties: {
            category: {
              type: "string",
              description:
                "Name der Laborkategorie auf Deutsch (z. B. 'Hämatologie', 'Klinische Chemie', 'Herzmarker', 'Gerinnung', 'Blutgasanalyse', 'Urin').",
            },
            values: {
              type: "array",
              description: "Die einzelnen Laborparameter dieser Kategorie.",
              items: {
                type: "object",
                properties: {
                  name: {
                    type: "string",
                    description:
                      "Deutscher Parametername (z. B. 'Leukozyten', 'CRP', 'Kreatinin', 'Troponin T (hs)').",
                  },
                  value: {
                    type: "string",
                    description:
                      "Der Messwert als Zahl mit Dezimalkomma in deutscher Schreibweise (z. B. '14,2', '8,9', '0,9'). Ohne Einheit.",
                  },
                  unit: {
                    type: "string",
                    description:
                      "In Deutschland übliche Einheit (z. B. '/nl', 'mg/l', 'mg/dl', 'ng/l', 'mmol/l', 'g/dl').",
                  },
                  reference: {
                    type: "string",
                    description:
                      "Referenzbereich in deutscher Schreibweise (z. B. '4,0–10,0', '< 5', '0,7–1,2'). Ohne Einheit.",
                  },
                  flag: {
                    type: "string",
                    enum: ["high", "low", "normal"],
                    description:
                      "'high' wenn der Wert über dem Referenzbereich liegt, 'low' wenn darunter, sonst 'normal'.",
                  },
                },
                required: ["name", "value", "unit", "reference", "flag"],
              },
            },
          },
          required: ["category", "values"],
        },
      },
      imaging: {
        type: "string",
        description:
          "Bildgebungsbefund im deutschen Befundstil (z. B. 'CT-Abdomen mit KM: Wandverdickung des Colon sigmoideum ...'). Falls für den Fall keine Bildgebung sinnvoll oder erforderlich ist, ein leerer String.",
      },
      correctDiagnosis: {
        type: "string",
        description:
          "Die eine korrekte Diagnose als deutscher Fachbegriff, wie er in der Uniklinik dokumentiert würde (lateinische Termini wo üblich, z. B. 'Appendizitis', 'Lungenarterienembolie').",
      },
      diagnosisOptions: {
        type: "array",
        description:
          "Genau 4 plausible Diagnose-Optionen als Multiple-Choice-Antworten in deutscher Fachsprache. MUSS die korrekte Diagnose wortgleich enthalten plus 3 klinisch sinnvolle Differenzialdiagnosen (echte Verwechslungskandidaten, kein Strohmann). Zufällige Reihenfolge.",
        items: { type: "string" },
        minItems: 4,
        maxItems: 4,
      },
      explanation: {
        type: "string",
        description:
          "Kurze Lernerklärung (2-3 Sätze) auf Deutsch, warum die Diagnose passt und welche Befunde wegweisend sind – im Ton einer prägnanten Erläuterung für die Vorbereitung auf Physikum und Staatsexamen.",
      },
    },
    required: [
      "patientName",
      "age",
      "gender",
      "chiefComplaint",
      "history",
      "examination",
      "labs",
      "imaging",
      "correctDiagnosis",
      "diagnosisOptions",
      "explanation",
    ],
  },
};

// Only these origins may call this route from a browser.
const ALLOWED_ORIGINS = new Set([
  "https://medcase-ai-peach.vercel.app",
  "http://localhost:3000",
]);

// Build CORS headers for a request. The origin is only echoed back when it's on
// the allowlist, so other sites can't read the response cross-origin.
function corsHeaders(origin: string | null): Record<string, string> {
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

// Fixed-window in-memory rate limiter: max 10 requests per IP per minute.
// Per-instance only (no shared store, no new dependencies).
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60_000;
const rateLimitStore = new Map<string, { count: number; windowStart: number }>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitStore.get(ip);
  if (!entry || now - entry.windowStart >= RATE_LIMIT_WINDOW_MS) {
    rateLimitStore.set(ip, { count: 1, windowStart: now });
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_LIMIT_MAX;
}

// Tool-use occasionally serializes nested array fields (labs, diagnosisOptions)
// as a JSON *string* instead of a real array. Parse those back so the client
// always receives the structured shape the game UI expects.
function normalizeCase(
  input: Record<string, unknown>
): Record<string, unknown> {
  for (const key of ["labs", "diagnosisOptions"]) {
    const v = input[key];
    if (typeof v === "string") {
      try {
        const parsed = JSON.parse(v);
        if (Array.isArray(parsed)) input[key] = parsed;
      } catch {
        // Leave as-is; downstream rendering will surface the bad shape.
      }
    }
  }
  return input;
}

// Generic, client-safe German error message — never leak internal details.
const GENERIC_ERROR =
  "Der klinische Fall konnte nicht generiert werden. Bitte versuche es später erneut.";

// Preflight: answer CORS preflight requests with the allowlist headers.
export async function OPTIONS(request: Request) {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(request.headers.get("origin")),
  });
}

type Difficulty = "vorklinik" | "klinik" | "examen";

// Per-level instruction passed as the system prompt to steer case complexity.
const DIFFICULTY_INSTRUCTIONS: Record<Difficulty, string> = {
  vorklinik: `SCHWIERIGKEITSGRAD: Vorklinik (Semester 1-4). Verwende einfache, klare deutsche Sprache. Wähle eine häufige Erkrankung mit klassischen Leitsymptomen (z. B. Appendizitis, Harnwegsinfekt, ambulant erworbene Pneumonie, Gastroenteritis). Keine Komplikationen, keine relevanten Komorbiditäten. Die Befunde sind eindeutig und lehrbuchhaft, die richtige Diagnose gut erkennbar. Die Differenzialdiagnosen (Distraktoren) sind klar abgrenzbar.`,
  klinik: `SCHWIERIGKEITSGRAD: Klinik (Semester 5-8, Famulatur). Verwende durchgehend medizinische Fachterminologie. Der Patient präsentiert mehrere Symptome; eine echte differenzialdiagnostische Überlegung ist erforderlich. Atypische Verläufe sind möglich. Labor und körperliche Untersuchung sind für die Diagnosestellung entscheidend. Eine gewisse diagnostische Mehrdeutigkeit ist ausdrücklich erwünscht.`,
  examen: `SCHWIERIGKEITSGRAD: PJ / Staatsexamen. Nutze die volle Uniklinik-Dokumentation. Konstruiere einen komplexen Fall mit Komorbiditäten und ggf. Polypharmazie. Die Präsentation ist atypisch oder maskiert, die Diagnose darf selten sein. Die Informationen sind teils unvollständig; erzwinge echtes differenzialdiagnostisches Denken. Die Distraktoren müssen anspruchsvolle, hochplausible Differenzialdiagnosen sein, die nur durch genaue Befundinterpretation auszuschließen sind.`,
};

// Each difficulty is backed by a pregenerated case bank under public/cases.
const CASE_FILES: Record<Difficulty, string> = {
  vorklinik: "vorklinik.json",
  klinik: "innere.json",
  examen: "pj.json",
};

// Case banks are static build assets, so parse them once and cache in memory.
// A missing/unreadable file is never cached, so it's retried on the next call.
const caseBankCache = new Map<Difficulty, Record<string, unknown>[]>();

async function loadCaseBank(
  difficulty: Difficulty
): Promise<Record<string, unknown>[]> {
  const cached = caseBankCache.get(difficulty);
  if (cached) return cached;
  try {
    const filePath = path.join(
      process.cwd(),
      "public",
      "cases",
      CASE_FILES[difficulty]
    );
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    const cases = Array.isArray(parsed)
      ? (parsed as Record<string, unknown>[])
      : [];
    caseBankCache.set(difficulty, cases);
    return cases;
  } catch {
    // File missing or invalid JSON — fall back to AI generation.
    return [];
  }
}

export async function POST(request: Request) {
  const baseHeaders = corsHeaders(request.headers.get("origin"));

  // Rate limit by client IP (first hop in x-forwarded-for behind the proxy).
  const forwardedFor = request.headers.get("x-forwarded-for");
  const ip = forwardedFor?.split(",")[0]?.trim() || "unknown";
  if (isRateLimited(ip)) {
    return NextResponse.json(
      { error: "Zu viele Anfragen. Bitte versuche es in einer Minute erneut." },
      { status: 429, headers: baseHeaders }
    );
  }

  let topic = "";
  let difficulty: Difficulty = "klinik";
  try {
    const body = await request.json();
    // Cap topic length to keep prompt input bounded.
    topic =
      typeof body.topic === "string" ? body.topic.trim().slice(0, 100) : "";
    if (
      body.difficulty === "vorklinik" ||
      body.difficulty === "klinik" ||
      body.difficulty === "examen"
    ) {
      difficulty = body.difficulty;
    }
  } catch {
    // No body / invalid body is fine — we'll generate a random case at the default level.
  }

  // Primary path: serve a random pregenerated case from the matching bank.
  // A specific topic request can't be honored from the bank, so it skips
  // straight to AI generation below.
  if (!topic) {
    const bank = await loadCaseBank(difficulty);
    if (bank.length > 0) {
      const picked = bank[Math.floor(Math.random() * bank.length)];
      return NextResponse.json(picked, { headers: baseHeaders });
    }
    // Bank empty or missing — fall through to AI generation.
  }

  // Fallback path: generate a fresh case with the Anthropic API.
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("ANTHROPIC_API_KEY is not configured.");
    return NextResponse.json(
      { error: GENERIC_ERROR },
      { status: 500, headers: baseHeaders }
    );
  }

  // Pick a fresh focus + seed each call so consecutive "Nächster Patient"
  // requests don't return the same condition.
  const focus = FOCUS_AREAS[Math.floor(Math.random() * FOCUS_AREAS.length)];
  const variationSeed = Math.floor(Math.random() * 1_000_000);

  const prompt = topic
    ? `Generate a realistic, educational clinical case based on the medical topic: "${topic}".`
    : `Generate a realistic, educational clinical case from the field of ${focus}. Pick a DIFFERENT condition than the most obvious textbook example, and vary the patient's age, gender, and presentation. Variation seed: ${variationSeed} (use it to ensure this case differs from previous ones).`;

  // All patient-facing and clinical content must be in authentic German for the target audience.
  const germanInstruction = `Schreibe ALLE Inhalte des Falls auf Deutsch im Stil der klinischen Dokumentation einer deutschen Universitätsklinik (Uniklinik-Stil). Verwende authentische deutsche Fachterminologie und gebräuchliche Abkürzungen (RR, HF, AF, Temp., SpO2, Z. n., V. a., a. e., DD) sowie in Deutschland übliche Laboreinheiten. Formuliere genau so, wie deutsche Ärztinnen, Ärzte und Medizinstudierende im klinischen Alltag tatsächlich dokumentieren und sprechen – auf keinen Fall wörtliche Übersetzungen aus dem Englischen. Lediglich der Vorstellungsgrund (chiefComplaint) ist in der Alltagssprache des Patienten zu formulieren, nicht in Fachsprache. Niveau: Vorbereitung auf Physikum und Staatsexamen.`;

  const anthropic = new Anthropic({ apiKey });

  try {
    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 2048,
      temperature: 1,
      system: DIFFICULTY_INSTRUCTIONS[difficulty],
      tools: [CASE_TOOL],
      tool_choice: { type: "tool", name: "present_case" },
      messages: [
        {
          role: "user",
          content: `${prompt}

This is for a medical diagnosis game played by German medical students preparing for the Physikum and Staatsexamen. Make the case engaging and solvable from the provided information. The chief complaint should sound like a real person talking. Present findings as they would appear during a workup. Liefere die Laborwerte (labs) als strukturierte, nach Kategorien gruppierte Einzelparameter mit Wert, Einheit, Referenzbereich und flag – KEIN Fließtext. Die pathologischen Werte müssen zur korrekten Diagnose passen und wegweisend sein. ${germanInstruction} Call the present_case tool with the structured result.`,
        },
      ],
    });

    const toolBlock = message.content.find(
      (block) => block.type === "tool_use" && block.name === "present_case"
    );

    if (!toolBlock || toolBlock.type !== "tool_use") {
      console.error("No structured case returned from the model.");
      return NextResponse.json(
        { error: GENERIC_ERROR },
        { status: 500, headers: baseHeaders }
      );
    }

    const normalized = normalizeCase(
      toolBlock.input as Record<string, unknown>
    );
    return NextResponse.json(normalized, { headers: baseHeaders });
  } catch (error) {
    console.error("Anthropic API error:", error);

    // Never surface internal error details to the client.
    const status = error instanceof APIError ? (error.status ?? 500) : 500;
    return NextResponse.json(
      { error: GENERIC_ERROR },
      { status, headers: baseHeaders }
    );
  }
}
