import Anthropic, { APIError } from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

// claude-sonnet-4-20250514 was deprecated; claude-sonnet-4-6 is the current Sonnet 4 successor.
const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";

export async function POST(request: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not configured." },
      { status: 500 }
    );
  }

  let topic: string;
  try {
    const body = await request.json();
    topic = typeof body.topic === "string" ? body.topic.trim() : "";
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!topic) {
    return NextResponse.json(
      { error: "Medical topic is required." },
      { status: 400 }
    );
  }

  const anthropic = new Anthropic({ apiKey });

  try {
    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 2048,
      messages: [
        {
          role: "user",
          content: `Generate a realistic, educational clinical case based on the following medical topic: "${topic}".

The case must include all of the following sections with clear headings:
1. Patient Demographics (age and gender)
2. Chief Complaint
3. History of Present Illness
4. Past Medical History
5. Physical Examination Findings
6. Laboratory Results

Write in a clinical tone suitable for medical students. Use specific, realistic values (vitals, labs, exam findings). Do not include the diagnosis or management plan — present the case as it would appear before workup is complete.`,
        },
      ],
    });

    const textBlock = message.content.find((block) => block.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return NextResponse.json(
        { error: "No text response from the model." },
        { status: 500 }
      );
    }

    return NextResponse.json({ case: textBlock.text });
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
