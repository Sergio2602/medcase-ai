import Anthropic, { APIError } from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

// claude-sonnet-4-20250514 was deprecated; claude-sonnet-4-6 is the current Sonnet 4 successor.
const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";

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
        type: "string",
        description:
          "Labor- und ggf. Bildgebungsbefunde mit deutschen Bezeichnungen und in Deutschland üblichen Einheiten (Leukozyten in /nl, CRP in mg/l, Kreatinin in mg/dl, Troponin in ng/l etc.). Pathologische Werte kennzeichnen (↑/↓). Bildgebung im Befundstil (z. B. 'CT-Abdomen: ...'). Realistische, zum Fall passende Werte.",
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
      "correctDiagnosis",
      "diagnosisOptions",
      "explanation",
    ],
  },
};

type Difficulty = "vorklinik" | "klinik" | "examen";

// Per-level instruction passed as the system prompt to steer case complexity.
const DIFFICULTY_INSTRUCTIONS: Record<Difficulty, string> = {
  vorklinik: `SCHWIERIGKEITSGRAD: Vorklinik (Semester 1-4). Verwende einfache, klare deutsche Sprache. Wähle eine häufige Erkrankung mit klassischen Leitsymptomen (z. B. Appendizitis, Harnwegsinfekt, ambulant erworbene Pneumonie, Gastroenteritis). Keine Komplikationen, keine relevanten Komorbiditäten. Die Befunde sind eindeutig und lehrbuchhaft, die richtige Diagnose gut erkennbar. Die Differenzialdiagnosen (Distraktoren) sind klar abgrenzbar.`,
  klinik: `SCHWIERIGKEITSGRAD: Klinik (Semester 5-8, Famulatur). Verwende durchgehend medizinische Fachterminologie. Der Patient präsentiert mehrere Symptome; eine echte differenzialdiagnostische Überlegung ist erforderlich. Atypische Verläufe sind möglich. Labor und körperliche Untersuchung sind für die Diagnosestellung entscheidend. Eine gewisse diagnostische Mehrdeutigkeit ist ausdrücklich erwünscht.`,
  examen: `SCHWIERIGKEITSGRAD: PJ / Staatsexamen. Nutze die volle Uniklinik-Dokumentation. Konstruiere einen komplexen Fall mit Komorbiditäten und ggf. Polypharmazie. Die Präsentation ist atypisch oder maskiert, die Diagnose darf selten sein. Die Informationen sind teils unvollständig; erzwinge echtes differenzialdiagnostisches Denken. Die Distraktoren müssen anspruchsvolle, hochplausible Differenzialdiagnosen sein, die nur durch genaue Befundinterpretation auszuschließen sind.`,
};

export async function POST(request: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not configured." },
      { status: 500 }
    );
  }

  let topic = "";
  let difficulty: Difficulty = "klinik";
  try {
    const body = await request.json();
    topic = typeof body.topic === "string" ? body.topic.trim() : "";
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

  const prompt = topic
    ? `Generate a realistic, educational clinical case based on the medical topic: "${topic}".`
    : `Generate a realistic, educational clinical case on a randomly chosen common or interesting medical condition. Vary the patient demographics and the body system involved.`;

  // All patient-facing and clinical content must be in authentic German for the target audience.
  const germanInstruction = `Schreibe ALLE Inhalte des Falls auf Deutsch im Stil der klinischen Dokumentation einer deutschen Universitätsklinik (Uniklinik-Stil). Verwende authentische deutsche Fachterminologie und gebräuchliche Abkürzungen (RR, HF, AF, Temp., SpO2, Z. n., V. a., a. e., DD) sowie in Deutschland übliche Laboreinheiten. Formuliere genau so, wie deutsche Ärztinnen, Ärzte und Medizinstudierende im klinischen Alltag tatsächlich dokumentieren und sprechen – auf keinen Fall wörtliche Übersetzungen aus dem Englischen. Lediglich der Vorstellungsgrund (chiefComplaint) ist in der Alltagssprache des Patienten zu formulieren, nicht in Fachsprache. Niveau: Vorbereitung auf Physikum und Staatsexamen.`;

  const anthropic = new Anthropic({ apiKey });

  try {
    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 2048,
      system: DIFFICULTY_INSTRUCTIONS[difficulty],
      tools: [CASE_TOOL],
      tool_choice: { type: "tool", name: "present_case" },
      messages: [
        {
          role: "user",
          content: `${prompt}

This is for a medical diagnosis game played by German medical students preparing for the Physikum and Staatsexamen. Make the case engaging and solvable from the provided information. The chief complaint should sound like a real person talking. Present findings as they would appear during a workup. ${germanInstruction} Call the present_case tool with the structured result.`,
        },
      ],
    });

    const toolBlock = message.content.find(
      (block) => block.type === "tool_use" && block.name === "present_case"
    );

    if (!toolBlock || toolBlock.type !== "tool_use") {
      return NextResponse.json(
        { error: "No structured case returned from the model." },
        { status: 500 }
      );
    }

    return NextResponse.json(toolBlock.input);
  } catch (error) {
    console.error("Anthropic API error:", error);

    if (error instanceof APIError) {
      const message =
        error.error?.type === "not_found_error"
          ? `Model "${MODEL}" is unavailable. Set ANTHROPIC_MODEL in .env.local to a current model (e.g. claude-sonnet-4-6).`
          : (error.message ?? "Anthropic API request failed.");

      return NextResponse.json(
        { error: message },
        { status: error.status ?? 500 }
      );
    }

    return NextResponse.json(
      { error: "Failed to generate clinical case. Please try again." },
      { status: 500 }
    );
  }
}
