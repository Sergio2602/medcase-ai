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
          "The patient's chief complaint IN GERMAN, in their own words, first person, 1-2 sentences. Conversational, like a real person describing what's wrong.",
      },
      history: {
        type: "string",
        description:
          "History of present illness plus relevant past medical, social, and family history, IN GERMAN. 3-5 sentences, clinical but readable. Use German medical terminology (Anamnese-Stil).",
      },
      examination: {
        type: "string",
        description:
          "Physical examination findings IN GERMAN including vital signs and pertinent positive/negative findings. Use realistic specific values and German clinical terminology.",
      },
      labs: {
        type: "string",
        description:
          "Laboratory and/or imaging results IN GERMAN with specific realistic values. Include the relevant abnormal findings. Use German lab nomenclature and SI units where appropriate.",
      },
      correctDiagnosis: {
        type: "string",
        description:
          "The single correct diagnosis for this case, IN GERMAN (German medical term, Latin term acceptable where standard).",
      },
      diagnosisOptions: {
        type: "array",
        description:
          "Exactly 4 plausible diagnosis options as multiple-choice answers, IN GERMAN. MUST include the correct diagnosis verbatim plus 3 clinically plausible distractors. Order randomly.",
        items: { type: "string" },
        minItems: 4,
        maxItems: 4,
      },
      explanation: {
        type: "string",
        description:
          "A 2-3 sentence teaching explanation IN GERMAN of why the correct diagnosis fits, revealed after the player answers. Suitable for Physikum/Staatsexamen preparation.",
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

export async function POST(request: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not configured." },
      { status: 500 }
    );
  }

  let topic = "";
  try {
    const body = await request.json();
    topic = typeof body.topic === "string" ? body.topic.trim() : "";
  } catch {
    // No body / invalid body is fine — we'll generate a random case.
  }

  const prompt = topic
    ? `Generate a realistic, educational clinical case based on the medical topic: "${topic}".`
    : `Generate a realistic, educational clinical case on a randomly chosen common or interesting medical condition. Vary the patient demographics and the body system involved.`;

  // All patient-facing and clinical content must be in German for the target audience.
  const germanInstruction = `Schreibe ALLE Inhalte des Falls auf Deutsch (Hauptbeschwerde, Anamnese, Untersuchung, Labor, Diagnosen und Erklärung). Verwende deutsche medizinische Fachterminologie auf dem Niveau, das deutsche Medizinstudierende in der Vorbereitung auf Physikum und Staatsexamen erwarten.`;

  const anthropic = new Anthropic({ apiKey });

  try {
    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 2048,
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
